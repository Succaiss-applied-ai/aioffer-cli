import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import { observeApplicationPage, type FillInstruction } from "../page-adapter.js";
import { submissionActionPatterns } from "../submission-action-policy.js";
import { bindObservedInstruction, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";

export const MOKA_FLAT_SELECT_INTERACTION_FAILED =
  "moka_flat_select_control_interaction_failed";

export function isMokaFlatSelectInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${MOKA_FLAT_SELECT_INTERACTION_FAILED}:`);
}

export type MokaFlatSelectDriverStage =
  | "detect"
  | "prepare_open"
  | "open"
  | "select"
  | "commit"
  | "readback";

export type MokaFlatSelectFailureCode =
  | "unsupported_popup_structure"
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "preexisting_value_mismatch"
  | "unexpected_popup_state"
  | "open_target_stale"
  | "open_event_dispatch_failed"
  | "open_event_not_observed"
  | "popup_ambiguous"
  | "leaf_missing"
  | "leaf_ambiguous"
  | "leaf_target_stale"
  | "leaf_event_dispatch_failed"
  | "commit_target_missing"
  | "commit_event_dispatch_failed"
  | "commit_validation_not_cleared"
  | "readback_unavailable"
  | "readback_mismatch"
  | "driver_interrupted";

export type MokaFlatSelectProbeStatus =
  | "unsupported_popup_structure"
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "popup_closed"
  | "popup_ambiguous"
  | "leaf_missing"
  | "leaf_ambiguous"
  | "ready";

export interface MokaFlatSelectPoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export interface SharedSelectProbe {
  status: MokaFlatSelectProbeStatus;
  controlPoint: MokaFlatSelectPoint | null;
  leafPoint: MokaFlatSelectPoint | null;
  popupCount: number;
  matchingLeafCount: number;
  availableOptions: string[];
  resolvedExpected: string;
  scrolled: boolean;
  actual: string;
  queryValue: string;
  commitPoint: MokaFlatSelectPoint | null;
  validationCleared: boolean;
}

export interface MokaFlatSelectReadback {
  actual: string;
  queryValue: string;
  validationCleared: boolean;
  popupClosed: boolean;
}

export interface MokaFlatSelectActionLedger {
  prepareSurfaceCount: number;
  scrollCount: number;
  openAttemptCount: number;
  openClickCount: number;
  leafAttemptCount: number;
  leafClickCount: number;
  commitAttemptCount: number;
  commitClickCount: number;
  readbackPollCount: number;
  trustedPointerClickCount: number;
  nativeEventClickCount: 0;
  retryCount: 0;
  reloadCount: 0;
  fullFormRestartCount: 0;
}

export interface MokaFlatSelectDriverDiagnostics {
  schemaVersion: "moka-flat-select-driver-diagnostic.v1";
  eventMechanism: "cdp_trusted_pointer_focus_emulation";
  failureCode: MokaFlatSelectFailureCode | null;
  availableOptions: string[];
  resolvedExpected: string;
  ledger: MokaFlatSelectActionLedger;
}

export interface MokaFlatSelectDriverResult extends MokaFlatSelectReadback {
  success: boolean;
  stage: MokaFlatSelectDriverStage;
  error: string | null;
  availableOptions: string[];
  resolvedExpected: string;
  diagnostics: MokaFlatSelectDriverDiagnostics;
}

export function normalizeMokaFlatSelectValue(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s*\/\s*/gu, "/")
    .replace(/\s+/gu, " ").trim().toLowerCase();
}

function mokaFlatSelectIdentityParts(value: unknown): string[] {
  const full = normalizeMokaFlatSelectValue(value);
  if (!full) return [];
  const parts = full.split("/").map(part => part.trim()).filter(Boolean);
  // A slash inside a Chinese option can describe two different choices
  // (for example 校园宣讲会/双选会). Only a genuine Han/Latin bilingual pair
  // may expose its localized halves as equivalent identities.
  const bilingual = parts.length === 2 && parts.some(part => /\p{Script=Han}/u.test(part)) &&
    parts.some(part => /[a-z]/iu.test(part));
  return bilingual ? [...new Set([full, ...parts])] : [full];
}

export function mokaFlatSelectValuesMatch(actual: unknown, expected: unknown): boolean {
  const actualParts = mokaFlatSelectIdentityParts(actual);
  const expectedParts = mokaFlatSelectIdentityParts(expected);
  return actualParts.length > 0 && expectedParts.length > 0 &&
    actualParts.some(part => expectedParts.includes(part));
}

/** Serialized in MAIN world. Identity is rebound by the production observer
 * before every call; this probe never searches another field or global popup. */
export function inspectMokaSharedSelectInPage(selector: string, expected: string,
  phase: "observe" | "prepare_open" | "prepare_select" | "commit" = "observe",
  optionSelectionPolicy: FillInstruction["optionSelectionPolicy"] | null = null,
  searchPrimaryLabel = false): SharedSelectProbe {
  const result: SharedSelectProbe = { status: "control_missing", controlPoint: null, leafPoint: null,
    popupCount: 0, matchingLeafCount: 0, availableOptions: [], resolvedExpected: expected,
    scrolled: false, actual: "", queryValue: "", commitPoint: null, validationCleared: false };
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  };
  // Keep these helpers inside the serialized MAIN-world function. Imported
  // module bindings do not exist after chrome.scripting serializes `func`.
  const normalize = (value: unknown) => String(value ?? "").normalize("NFKC")
    .replace(/\s*\/\s*/gu, "/").replace(/\s+/gu, " ").trim().toLowerCase();
  const identityParts = (value: unknown) => {
    const full = normalize(value);
    if (!full) return [];
    const parts = full.split("/").map(part => part.trim()).filter(Boolean);
    const bilingual = parts.length === 2 && parts.some(part => /\p{Script=Han}/u.test(part)) &&
      parts.some(part => /[a-z]/iu.test(part));
    return bilingual ? [...new Set([full, ...parts])] : [full];
  };
  const equivalent = (left: unknown, right: unknown) => {
    const leftParts = identityParts(left);
    const rightParts = identityParts(right);
    return leftParts.length > 0 && rightParts.length > 0 &&
      leftParts.some(part => rightParts.includes(part));
  };
  const point = (element: HTMLElement): MokaFlatSelectPoint | null => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    return hit === element || element.contains(hit)
      ? { x, y, tagName: element.tagName, className: String(element.className) } : null;
  };
  const controls = [...document.querySelectorAll(selector)];
  if (controls.length !== 1) return { ...result, status: controls.length ? "control_ambiguous" : "control_missing" };
  const control = controls[0];
  if (!(control instanceof HTMLInputElement) || control.disabled || !visible(control) ||
    !["text", "search"].includes(control.type)) return result;
  const select = control.closest<HTMLElement>("[class*='sd-Select-container']");
  const dropdown = select?.closest<HTMLElement>("[class*='sd-Dropdown-container']");
  const root = control.closest<HTMLElement>("[class*='apply-field-']");
  if (!select || !dropdown || !root || select.querySelectorAll("input").length !== 1) return result;
  let validationRoot: HTMLElement = root;
  if (control.readOnly || optionSelectionPolicy?.startsWith("phone_calling_code_")) {
    const codeShell = control.closest<HTMLElement>("[class*='code-']");
    const controls = [...root.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")]
      .filter(candidate => visible(candidate));
    const numberControls = controls.filter(candidate => candidate !== control && !candidate.readOnly &&
      !candidate.disabled && ["text", "tel"].includes(candidate.type) &&
      Boolean(candidate.closest("[class*='number-']")) &&
      /(?:手机(?:号|号码)?|电话(?:号码)?|mobile|phone|tel)/iu.test(normalize([
        candidate.placeholder, candidate.name, candidate.getAttribute("aria-label")
      ].filter(Boolean).join(" "))));
    const titles = [...root.children].filter((candidate): candidate is HTMLElement =>
      candidate instanceof HTMLElement && visible(candidate) && /title|label/iu.test(String(candidate.className)) &&
      !candidate.querySelector("input,textarea,select,[role='combobox']"))
      .map(candidate => String(candidate.innerText || candidate.textContent || "").replace(/[＊*]/gu, "").trim())
      .filter(value => value.length <= 64 &&
        /(?:手机(?:号|号码)?|电话(?:号码)?|\bmobile(?: phone)?\b|\bphone(?: number)?\b|\btelephone\b|\btel\b)/iu.test(value));
    if (!codeShell || !root.contains(codeShell) || controls.length !== 2 || numberControls.length !== 1 ||
      titles.length !== 1) return result;
    validationRoot = codeShell;
  }
  const displays = [...select.querySelectorAll<HTMLElement>("[class*='Input-display-value']")].filter(visible);
  if (displays.length > 1) return { ...result, status: "control_ambiguous" };
  result.actual = displays[0]?.textContent?.trim() ?? "";
  result.queryValue = control.value.trim();
  if (/^(?:请选择|请搜索)(?:\s*\/\s*Please select)?$/iu.test(result.actual)) result.actual = "";
  const localValidation = [...validationRoot.querySelectorAll<HTMLElement>(
    "[aria-invalid='true'],[class*='error'],[class*='Error'],[class*='invalid'],[class*='Invalid'],span,div,p"
  )].some(candidate => visible(candidate) &&
    /^(?:必填项未填写|不能为空|请选择|此项为必填项)$/u.test(String(candidate.textContent ?? "").trim()));
  result.validationCleared = control.getAttribute("aria-invalid") !== "true" && !localValidation;
  if (phase === "prepare_open") {
    control.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    void control.getBoundingClientRect();
    result.scrolled = true;
  }
  const titles = [...root.children].filter((element): element is HTMLElement => visible(element) &&
    /(?:^|\s)title-/u.test(String(element.className)) && !element.contains(control) &&
    !element.matches("button,a,[role=button],[role=link]") &&
    !element.querySelector("input,button,a,[role=button],[role=link]"));
  if (titles.length === 1) result.commitPoint = point(titles[0]!);
  result.controlPoint = point(select);
  const popups = [...dropdown.querySelectorAll<HTMLElement>("[class*='Dropdown-dropdown']")].filter(visible);
  result.popupCount = popups.length;
  if (!popups.length) return { ...result, status: result.controlPoint ? "popup_closed" : "control_not_clickable" };
  if (popups.length !== 1) return { ...result, status: "popup_ambiguous" };
  const popup = popups[0]!;
  if ([...popup.querySelectorAll(
    "[class*='Menu-header'],[role=tree],[role=grid],[class*='calendar'],[class*='cascader'],[class*='picker-panel']"
  )].some(visible)) return { ...result, status: "unsupported_popup_structure" };

  const items = [...popup.querySelectorAll<HTMLElement>("[class*='Menu-content-item']")]
    .filter(visible)
    .filter(item => item.closest("[class*='Dropdown-dropdown']") === popup &&
      popup.contains(item.closest("[class*='Menu-container']")) &&
      !item.querySelector("[class*='Menu-content-item']") &&
      !item.matches("[aria-disabled=true],[disabled],[class*='disabled'],[class*='Disabled']") &&
      !item.querySelector("input,button,a,[role=button],[role=treeitem],[role=gridcell]"));
  const leaves = items.flatMap(item => {
    const labels = [...item.querySelectorAll<HTMLElement>("[class*='option-label'],[class*='Option-label']")]
      .filter(visible);
    if (labels.length > 1) return [];
    // Search results have a separate translated subtitle. Only this explicit
    // structure exposes a primary identity; ordinary Select matching is unchanged.
    const children = [...item.children];
    const primary = searchPrimaryLabel && children.length === 2 && children[0]?.tagName === "DIV" &&
      /(?:^|\s)sd-Menu-sub-title-/u.test(children[1]?.className ?? "") &&
      !children[0]?.querySelector("button,a,input,[class*='sub-title']")
      ? children[0] as HTMLElement : null;
    const element = labels[0] ?? primary ?? item;
    const text = String(element.innerText || element.textContent || "").trim();
    return text ? [{ element: primary ? item : element, text }] : [];
  });
  if (!leaves.length || leaves.length !== items.length) {
    return { ...result, status: "unsupported_popup_structure" };
  }
  result.availableOptions = [...new Set(leaves.map(leaf => leaf.text))].slice(0, 200);
  let resolvedExpected = expected;
  if (optionSelectionPolicy === "phone_calling_code_default") {
    if (leaves.length === 1) resolvedExpected = leaves[0]!.text;
    else {
      const defaults = leaves.filter(leaf => normalize(leaf.text) === normalize("+86"));
      resolvedExpected = defaults.length === 1 ? defaults[0]!.text : "";
      if (!resolvedExpected) {
        result.matchingLeafCount = defaults.length;
        return { ...result, status: defaults.length ? "leaf_ambiguous" : "leaf_missing", resolvedExpected: "" };
      }
    }
  }
  result.resolvedExpected = resolvedExpected;
  const exact = leaves.filter(leaf => normalize(leaf.text) === normalize(resolvedExpected));
  const matches = exact.length ? exact : leaves.filter(leaf => equivalent(leaf.text, resolvedExpected));
  result.matchingLeafCount = matches.length;
  if (matches.length !== 1) return { ...result, status: matches.length ? "leaf_ambiguous" : "leaf_missing" };
  if (phase === "prepare_select") {
    const leaf = matches[0]!.element;
    const scroller = leaf.closest<HTMLElement>("[class*='sd-Select-scrollable-']");
    if (scroller && popup.contains(scroller) && scroller.scrollHeight > scroller.clientHeight &&
      /auto|scroll/u.test(getComputedStyle(scroller).overflowY)) {
      const leafRect = leaf.getBoundingClientRect(), frame = scroller.getBoundingClientRect();
      // Move only the owned menu when its clipping area hides the unique leaf.
      // Ordinary overlays and unrelated page occlusion do not authorize scroll.
      if (leafRect.top < frame.top || leafRect.bottom > frame.bottom) {
        const before = scroller.scrollTop;
        scroller.scrollBy({ top: (leafRect.top + leafRect.bottom - frame.top - frame.bottom) / 2, behavior: "instant" });
        result.scrolled = scroller.scrollTop !== before;
      }
    }
  }
  result.leafPoint = point(matches[0]!.element);
  return { ...result, status: result.leafPoint ? "ready" : "control_not_clickable" };
}

function emptyLedger(): MokaFlatSelectActionLedger {
  return { prepareSurfaceCount: 0, scrollCount: 0, openAttemptCount: 0, openClickCount: 0,
    leafAttemptCount: 0, leafClickCount: 0, commitAttemptCount: 0, commitClickCount: 0,
    readbackPollCount: 0, trustedPointerClickCount: 0, nativeEventClickCount: 0,
    retryCount: 0, reloadCount: 0, fullFormRestartCount: 0 };
}

/** Dedicated shared Moka flat Select Driver. It owns its failure namespace,
 * option identity and readback instead of borrowing recruiting-source rules. */
export async function executeMokaSharedSelectDriver(input: {
  tabId: number;
  instruction: FillInstruction;
  discoverOptions?: boolean;
  prepareSurface(): Promise<void>;
  clickPoint(point: MokaFlatSelectPoint): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}): Promise<MokaFlatSelectDriverResult> {
  const ledger = emptyLedger();
  let availableOptions: string[] = [];
  let resolvedExpected = String(input.instruction.value ?? "");
  const rememberOptions = (values: string[] | undefined) => {
    availableOptions = [...new Set(values ?? [])].slice(0, 200);
  };
  const rememberProbe = (probe: SharedSelectProbe | null | undefined) => {
    rememberOptions(probe?.availableOptions);
    if (probe?.resolvedExpected) resolvedExpected = probe.resolvedExpected;
  };
  const diagnostics = (failureCode: MokaFlatSelectFailureCode | null): MokaFlatSelectDriverDiagnostics => ({
    schemaVersion: "moka-flat-select-driver-diagnostic.v1",
    eventMechanism: "cdp_trusted_pointer_focus_emulation",
    failureCode,
    availableOptions: [...availableOptions],
    resolvedExpected,
    ledger: { ...ledger }
  });
  const failure = (stage: MokaFlatSelectDriverStage, code: MokaFlatSelectFailureCode, detail: string,
    readback: MokaFlatSelectReadback = { actual: "", queryValue: "", validationCleared: false, popupClosed: true }
  ): MokaFlatSelectDriverResult => ({ success: false, stage,
    error: `${MOKA_FLAT_SELECT_INTERACTION_FAILED}: [${stage}/${code}] ${detail}`,
    availableOptions: [...availableOptions], resolvedExpected, diagnostics: diagnostics(code), ...readback });
  const success = (readback: MokaFlatSelectReadback): MokaFlatSelectDriverResult => ({ success: true,
    stage: "readback", error: null, availableOptions: [...availableOptions], resolvedExpected,
    diagnostics: diagnostics(null), ...readback });

  const inspect = async (phase: "observe" | "prepare_open" | "prepare_select" | "commit") => {
    const page = (await executeInterruptibleScript({ target: { tabId: input.tabId }, func: observeApplicationPage,
      args: [submissionActionPatterns] }))[0]?.result;
    if (!page || page.pageStage !== "application_form" || page.url !== input.instruction.applicationUrl) return null;
    const field = bindObservedInstruction(page, input.instruction);
    if (!field) return null;
    if (input.instruction.optionSelectionPolicy?.startsWith("phone_calling_code_") &&
      !(field.compound?.kind === "phone_number" && field.compound.role === "calling_code")) return null;
    const route = resolveControlAdapter(evidenceForField(page, field, input.instruction));
    if (!["moka.flat-select.trusted-focus.v1", "moka.readonly-calling-code.trusted-focus.v1"].includes(route.code) ||
      route.diagnostic.registrationId !== input.instruction.controlAdapter?.registrationId) return null;
    const probe = (await executeInterruptibleScript({ target: { tabId: input.tabId }, world: "MAIN",
      func: inspectMokaSharedSelectInPage,
      // chrome.scripting rejects an undefined array element before it invokes
      // the MAIN-world function. Keep the fourth position stable while using
      // explicit null for ordinary flat selects that carry no phone policy.
      args: [field.selector, resolvedExpected, phase, input.instruction.optionSelectionPolicy ?? null] }))[0]?.result;
    return probe ? { probe, field } : null;
  };
  const readback = async (): Promise<MokaFlatSelectReadback | null> => {
    const current = await inspect("observe");
    if (!current || ["control_missing", "control_ambiguous"].includes(current.probe.status)) return null;
    return { actual: current.probe.actual, popupClosed: current.probe.popupCount === 0,
      queryValue: current.probe.queryValue, validationCleared: current.probe.validationCleared };
  };
  const accepted = (state: MokaFlatSelectReadback | null) => Boolean(state &&
    mokaFlatSelectValuesMatch(state.actual, resolvedExpected) && state.popupClosed && state.validationCleared &&
    (!input.instruction.optionSelectionPolicy?.startsWith("phone_calling_code_") || !state.queryValue));
  const prepareSurface = async () => {
    if (ledger.prepareSurfaceCount) return;
    ledger.prepareSurfaceCount += 1;
    await input.prepareSurface();
  };
  const commitSelection = async (): Promise<boolean> => {
    const current = await inspect("commit");
    const commitPoint = current?.probe.commitPoint;
    if (!commitPoint) return false;
    await input.clickPoint(commitPoint);
    return true;
  };
  const commitAndVerify = async (initial: MokaFlatSelectReadback): Promise<MokaFlatSelectDriverResult> => {
    ledger.commitAttemptCount += 1;
    let committed = false;
    try {
      committed = await commitSelection();
    } catch (error) {
      return failure("commit", "commit_event_dispatch_failed",
        `目标值已显示，但可信失焦提交失败：${error instanceof Error ? error.message : String(error)}`, initial);
    }
    if (!committed) return failure("commit", "commit_target_missing", "目标值已显示，但没有找到唯一字段标题提交点", initial);
    ledger.commitClickCount += 1;
    ledger.trustedPointerClickCount += 1;
    let latest: MokaFlatSelectReadback | null = initial;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 160 : 180);
      ledger.readbackPollCount += 1;
      latest = await readback();
      if (!latest) return failure("readback", "readback_unavailable", "失焦提交后没有返回站点回读", initial);
      if (accepted(latest)) return success(latest);
    }
    return failure("commit", "commit_validation_not_cleared",
      "目标值已显示且只执行了一次可信失焦提交，但站点必填校验仍未清除", latest ?? initial);
  };
  const closeUnavailablePolicyPopup = async (
    probe: SharedSelectProbe,
    code: "leaf_missing" | "leaf_ambiguous",
    detail: string,
    originalActual: string
  ): Promise<MokaFlatSelectDriverResult> => {
    rememberProbe(probe);
    ledger.commitAttemptCount += 1;
    let closed = false;
    try {
      closed = await commitSelection();
    } catch (error) {
      return failure("commit", "commit_event_dispatch_failed",
        `默认区号不可用，关闭弹层的可信事件失败：${error instanceof Error ? error.message : String(error)}`,
        { actual: originalActual, queryValue: "", validationCleared: false, popupClosed: false });
    }
    if (!closed) return failure("commit", "commit_target_missing",
      "默认区号不可用，且没有找到唯一字段标题关闭弹层",
      { actual: originalActual, queryValue: "", validationCleared: false, popupClosed: false });
    ledger.commitClickCount += 1;
    ledger.trustedPointerClickCount += 1;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(160);
      ledger.readbackPollCount += 1;
      const state = await readback();
      if (!state) return failure("readback", "readback_unavailable", "关闭区号弹层后字段身份失联");
      if (state.popupClosed) {
        if (normalizeMokaFlatSelectValue(state.actual) !== normalizeMokaFlatSelectValue(originalActual)) {
          return failure("readback", "readback_mismatch", "默认区号不可用时字段原值发生变化", state);
        }
        return failure("select", code, detail, state);
      }
    }
    return failure("readback", "readback_mismatch", "默认区号不可用时弹层未关闭",
      { actual: originalActual, queryValue: "", validationCleared: false, popupClosed: false });
  };

  try {
    const initial = await readback();
    if (!initial) return failure("readback", "readback_unavailable", "Moka 平面下拉初始回读不可用");
    if (!input.discoverOptions && accepted(initial)) return success(initial);
    if (initial.actual && !input.instruction.optionSelectionPolicy?.startsWith("phone_calling_code_")) {
      if (input.discoverOptions) return failure("detect", "preexisting_value_mismatch", "只读选项发现不接管已有值", initial);
      if (!mokaFlatSelectValuesMatch(initial.actual, input.instruction.value)) {
        return failure("readback", "preexisting_value_mismatch", "Moka 平面下拉已有不同值；Driver 不覆盖、不重新选择", initial);
      }
      if (!initial.popupClosed) return failure("open", "unexpected_popup_state", "目标值已显示但弹层仍打开；Driver 不接管未知状态", initial);
      await prepareSurface();
      const preparedCommit = await inspect("prepare_open");
      if (!preparedCommit) return failure("prepare_open", "driver_interrupted", "已有目标值的控件滚动准备没有返回结果", initial);
      rememberOptions(preparedCommit.probe.availableOptions);
      if (preparedCommit.probe.scrolled) ledger.scrollCount += 1;
      if (preparedCommit.probe.status !== "popup_closed" || !preparedCommit.probe.controlPoint) {
        const code: MokaFlatSelectFailureCode = preparedCommit.probe.status === "control_missing" ? "control_missing" :
          preparedCommit.probe.status === "control_ambiguous" ? "control_ambiguous" : "control_not_clickable";
        return failure("prepare_open", code, `已有目标值的控件未形成可提交状态（${preparedCommit.probe.status}）`, initial);
      }
      return commitAndVerify(initial);
    }

    const initialProbe = await inspect("observe");
    if (!initialProbe) return failure("detect", "driver_interrupted", "Moka 平面下拉检测没有返回结果");
    rememberProbe(initialProbe.probe);
    if (initialProbe.probe.status === "control_missing") return failure("detect", "control_missing", "没有定位到唯一 Moka 平面下拉控件");
    if (initialProbe.probe.status === "control_ambiguous") return failure("detect", "control_ambiguous", "定位到多个 Moka 平面下拉控件");
    if (!["popup_closed", "control_not_clickable"].includes(initialProbe.probe.status)) {
      return failure("open", "unexpected_popup_state", `Driver 开始前弹层状态为 ${initialProbe.probe.status}`);
    }

    await prepareSurface();
    const prepared = await inspect("prepare_open");
    if (!prepared) return failure("prepare_open", "driver_interrupted", "控件准备没有返回结果");
    rememberProbe(prepared.probe);
    if (prepared.probe.scrolled) ledger.scrollCount += 1;
    if (prepared.probe.status !== "popup_closed" || !prepared.probe.controlPoint) {
      const code: MokaFlatSelectFailureCode = prepared.probe.status === "control_missing" ? "control_missing" :
        prepared.probe.status === "control_ambiguous" ? "control_ambiguous" : "control_not_clickable";
      return failure("prepare_open", code, `滚动稳定后控件未形成可打开状态（${prepared.probe.status}）`);
    }
    const liveOpen = await inspect("observe");
    if (!liveOpen || liveOpen.probe.status !== "popup_closed" || !liveOpen.probe.controlPoint) {
      return failure("open", "open_target_stale", "可信打开事件前控件实时状态已变化");
    }
    ledger.openAttemptCount += 1;
    try {
      await input.clickPoint(liveOpen.probe.controlPoint);
    } catch (error) {
      return failure("open", "open_event_dispatch_failed", `可信打开事件发送失败：${error instanceof Error ? error.message : String(error)}`);
    }
    ledger.openClickCount += 1;
    ledger.trustedPointerClickCount += 1;

    let probe: SharedSelectProbe | null = null;
    let previousOptionSignature = "";
    let stableOptionReads = 0;
    let leafPreparationAttempted = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 120 : 160);
      const current = await inspect("observe");
      probe = current?.probe ?? null;
      if (!probe) return failure("open", "driver_interrupted", "打开后只读观察不可用");
      rememberProbe(probe);
      if (probe.status === "unsupported_popup_structure") return failure("open", "unsupported_popup_structure", "不是当前字段所属的已验证平面选项列表，未选择");
      if (input.discoverOptions && probe.popupCount === 1 && probe.availableOptions.length) {
        const signature = JSON.stringify(probe.availableOptions);
        stableOptionReads = signature === previousOptionSignature ? stableOptionReads + 1 : 1;
        previousOptionSignature = signature;
        if (stableOptionReads >= 2) break;
        continue;
      }
      if (!input.discoverOptions && !leafPreparationAttempted && probe.status === "control_not_clickable" &&
        probe.popupCount === 1 && probe.matchingLeafCount === 1) {
        leafPreparationAttempted = true;
        const preparedLeaf = (await inspect("prepare_select"))?.probe;
        if (!preparedLeaf) return failure("select", "driver_interrupted", "选项滚动准备时字段身份失联");
        if (preparedLeaf.scrolled) ledger.scrollCount += 1;
        continue;
      }
      if (probe.status === "ready" && probe.leafPoint) break;
      if (probe.status === "popup_ambiguous") return failure("open", "popup_ambiguous", "打开后出现多个无法归属的 Moka 弹层");
      if (probe.status === "leaf_ambiguous") {
        if (input.instruction.optionSelectionPolicy?.startsWith("phone_calling_code_")) {
          const target = input.instruction.optionSelectionPolicy === "phone_calling_code_confirmed"
            ? resolvedExpected : "+86";
          return closeUnavailablePolicyPopup(probe, "leaf_ambiguous",
            `页面存在多个 ${target} 区号选项，未猜测选择`, initial.actual);
        }
        return failure("select", "leaf_ambiguous", `出现 ${probe.matchingLeafCount} 个语义相同的下拉叶子项`);
      }
      if (probe.status === "leaf_missing" && probe.availableOptions.length > 0) {
        if (input.instruction.optionSelectionPolicy?.startsWith("phone_calling_code_")) {
          const target = input.instruction.optionSelectionPolicy === "phone_calling_code_confirmed"
            ? resolvedExpected : "+86";
          return closeUnavailablePolicyPopup(probe, "leaf_missing",
            `多个区号选项中没有唯一 ${target}，已保持原值`, initial.actual);
        }
        return failure("select", "leaf_missing", "目标值不在页面当前下拉选项中");
      }
    }
    if (input.discoverOptions && stableOptionReads >= 2) {
      ledger.commitAttemptCount += 1;
      if (!await commitSelection()) return failure("commit", "commit_target_missing", "选项发现后没有唯一关闭标题");
      ledger.commitClickCount += 1;
      ledger.trustedPointerClickCount += 1;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await input.wait(160);
        ledger.readbackPollCount += 1;
        const state = await readback();
        if (!state) return failure("readback", "readback_unavailable", "选项发现后字段身份失联");
        if (state.actual) return failure("readback", "readback_mismatch", "选项发现不应改变字段值", state);
        if (state.popupClosed) return success(state);
      }
      return failure("readback", "readback_mismatch", "选项发现后弹层未关闭");
    }
    if (!probe || probe.status !== "ready" || !probe.leafPoint) {
      if (probe?.popupCount === 1 && probe.matchingLeafCount === 1) {
        return failure("select", "control_not_clickable", "目标选项已找到，但菜单滚动后仍无可点击位置");
      }
      return failure("open", "open_event_not_observed", "唯一可信打开事件后没有形成目标选项弹层");
    }
    const liveLeaf = await inspect("observe");
    rememberProbe(liveLeaf?.probe);
    if (!liveLeaf || liveLeaf.probe.status !== "ready" || !liveLeaf.probe.leafPoint ||
      liveLeaf.probe.matchingLeafCount !== 1) {
      return failure("select", "leaf_target_stale", "目标选项点击前的唯一实时命中点已变化");
    }
    ledger.leafAttemptCount += 1;
    try {
      await input.clickPoint(liveLeaf.probe.leafPoint);
    } catch (error) {
      return failure("select", "leaf_event_dispatch_failed", `目标选项可信事件发送失败：${error instanceof Error ? error.message : String(error)}`);
    }
    ledger.leafClickCount += 1;
    ledger.trustedPointerClickCount += 1;

    let latest: MokaFlatSelectReadback | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 160 : 180);
      ledger.readbackPollCount += 1;
      latest = await readback();
      if (!latest) return failure("readback", "readback_unavailable", "选择后没有返回站点回读");
      if (accepted(latest)) return success(latest);
      const needsCommit = mokaFlatSelectValuesMatch(latest.actual, resolvedExpected) &&
        latest.popupClosed && !latest.validationCleared;
      if (needsCommit) return commitAndVerify(latest);
    }
    return failure("readback", "readback_mismatch", "目标选项点击后没有形成显示值、关闭弹层并清除校验的完整状态",
      latest ?? undefined);
  } catch (error) {
    return failure("readback", "driver_interrupted", `Moka 平面下拉 Driver 被中断：${error instanceof Error ? error.message : String(error)}`);
  }
}
