import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import { observeApplicationPage, type PageObservation } from "../page-adapter.js";
import { submissionActionPatterns } from "../submission-action-policy.js";

export const MOKA_RECRUITING_SOURCE_INTERACTION_FAILED =
  "recruiting_source_control_interaction_failed";

export function isMokaRecruitingSourceInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${MOKA_RECRUITING_SOURCE_INTERACTION_FAILED}:`);
}

export function isMokaRecruitingSourceApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === "/__recruiting_ai_test__/moka") return true;
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      /^\/(?:campus|social)-recruitment\/[^/]+\/[^/]+$/u.test(url.pathname) &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

export function isMokaSinaWeiboFrequencyApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/sina/43536" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

export function isMokaEqhrTravelAcceptanceApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/eqhr/39786" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

export function isMokaYongxingEthnicityApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/yongxingsec/27127" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

export function isMokaSungrowApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/sungrow/94416" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

export function isMokaRecruitingSourceField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /信息来源(?:渠道)?|来源渠道|招聘渠道|简历渠道|(?:招聘信息(?:获取|获知)|获取招聘信息)(?:的)?渠道|获知.*(?:渠道|途径)|recruiting.?source|source.?channel|job.?source/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export function isMokaSinaWeiboFrequencyField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /(?:您)?使用微博的频率|weibo.?use.?frequency/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export function isMokaEqhrTravelAcceptanceField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /是否接受出差|travel.?acceptance|accept.?travel/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export function isMokaYongxingEthnicityField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /(?:^|[.\s·])民族(?:$|[.\s·])|ethnicity|nationality/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export function isMokaSungrowIdentityDocumentTypeField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /^(?:证件号码|证件类型)$/u.test(String(input.label ?? "").split("·").at(-1)?.trim() ?? "") ||
    [input.stableFieldKey, input.semanticKey].some(value =>
      /(?:^|[.\s])identity[_-]?document[_-]?type(?:[.\s#]|$)/iu.test(String(value ?? "")));
}

export function isMokaSungrowRelativeEmploymentField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /有无直系或旁系亲属在本单位(?:（含其他关联公司）)?任职|relative.?employment|kinship.?employment/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export type MokaFlatSelectFieldKind =
  | "recruiting_source"
  | "sina_weibo_frequency"
  | "eqhr_travel_acceptance"
  | "yongxing_ethnicity"
  | "sungrow_identity_document_type"
  | "sungrow_relative_employment";

export type MokaRecruitingSourceDriverStage =
  | "detect"
  | "prepare_open"
  | "open"
  | "select"
  | "commit"
  | "readback";

export type MokaRecruitingSourceFailureCode =
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

export type MokaRecruitingSourceProbeStatus =
  | "unsupported_popup_structure"
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "popup_closed"
  | "popup_ambiguous"
  | "leaf_missing"
  | "leaf_ambiguous"
  | "ready";

export interface MokaRecruitingSourcePoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export interface MokaRecruitingSourceProbe {
  status: MokaRecruitingSourceProbeStatus;
  controlPoint: MokaRecruitingSourcePoint | null;
  leafPoint: MokaRecruitingSourcePoint | null;
  popupCount: number;
  matchingLeafCount: number;
  availableOptions: string[];
  scrolled: boolean;
}

export interface MokaRecruitingSourceReadback {
  actual: string;
  validationCleared: boolean;
  popupClosed: boolean;
}

/** Reuse the shared observer's member ownership, not the compound wrapper's
 * red state. Only the selected type is checked here; this is not a form gate. */
export function identityDocumentTypeReadback(
  state: MokaRecruitingSourceReadback, page: PageObservation | null
): MokaRecruitingSourceReadback {
  const fields = page?.fields.filter(field => field.compound?.kind === "identity_document" &&
    field.compound.role === "type") ?? [];
  const field = fields.length === 1 ? fields[0] : null;
  return { ...state, validationCleared: Boolean(field && field.currentValue === state.actual &&
    !field.validationMessage) };
}

export interface MokaRecruitingSourceActionLedger {
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

export interface MokaRecruitingSourceDriverDiagnostics {
  schemaVersion: "moka-recruiting-source-driver-diagnostic.v1";
  eventMechanism: "cdp_trusted_pointer_focus_emulation";
  failureCode: MokaRecruitingSourceFailureCode | null;
  availableOptions: string[];
  ledger: MokaRecruitingSourceActionLedger;
}

export interface MokaRecruitingSourceDriverResult extends MokaRecruitingSourceReadback {
  success: boolean;
  stage: MokaRecruitingSourceDriverStage;
  error: string | null;
  availableOptions: string[];
  diagnostics: MokaRecruitingSourceDriverDiagnostics;
}

export interface MokaRecruitingSourceDriverInput {
  tabId: number;
  selector: string;
  expected: string;
  fieldKind?: MokaFlatSelectFieldKind;
  /** Shared state machine hooks; supplied by the one registry-selected
   * component Driver, never attempted after another Driver has failed. */
  inspect?(phase: "observe" | "prepare_open" | "prepare_select"): Promise<MokaRecruitingSourceProbe | null>;
  readback?(): Promise<MokaRecruitingSourceReadback | null>;
  discoverOptions?: boolean;
  prepareSurface(): Promise<void>;
  clickPoint(point: MokaRecruitingSourcePoint): Promise<void>;
  commitSelection(): Promise<boolean>;
  wait(milliseconds: number): Promise<void>;
}

export function normalizeMokaRecruitingSource(value: unknown): string {
  return String(value ?? "").replace(/[\s·._-]+/gu, "").toLowerCase();
}

export function mokaRecruitingSourceReadbackMatches(actual: unknown, expected: unknown): boolean {
  const left = normalizeMokaRecruitingSource(actual);
  const right = normalizeMokaRecruitingSource(expected);
  return Boolean(left && right) && left === right;
}

/** MAIN-world read-only locator for the registered flat Moka source Select. */
export function inspectMokaRecruitingSourceTargetInPage(
  targetSelector: string,
  expectedValue: string,
  phase: "observe" | "prepare_open" | "prepare_select" = "observe",
  fieldKind: MokaFlatSelectFieldKind = "recruiting_source"
): MokaRecruitingSourceProbe {
  const normalize = (value: unknown) => String(value ?? "")
    .replace(/[\s·._-]+/gu, "")
    .toLowerCase();
  const sourceTitle = (value: unknown) => {
    const title = String(value ?? "").replace(/\s+/gu, "").trim();
    if (fieldKind === "sina_weibo_frequency") return /^(?:您)?使用微博的频率$/u.test(title);
    if (fieldKind === "eqhr_travel_acceptance") return /^是否接受出差$/u.test(title);
    if (fieldKind === "yongxing_ethnicity") return /^民族$/u.test(title);
    if (fieldKind === "sungrow_identity_document_type") return /^(?:证件号码|证件类型)$/u.test(title);
    if (fieldKind === "sungrow_relative_employment") {
      return /^有无直系或旁系亲属在本单位(?:（含其他关联公司）)?任职[？?]?$/u.test(title);
    }
    return /^(?:请选择)?(?:招聘)?信息来源(?:渠道)?$|^(?:招聘)?来源渠道$|^招聘渠道$|^简历渠道$|^(?:招聘信息(?:获取|获知)|获取招聘信息)(?:的)?渠道$|^获知.*(?:渠道|途径)$/u.test(title);
  };
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const fieldRootFor = (element: HTMLElement): HTMLElement | null => {
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const tokens = String(current.className || "").split(/\s+/u);
      if (tokens.some((token) => /^apply-field-/u.test(token) && !/^apply-fields-/u.test(token))) {
        return current;
      }
    }
    return null;
  };
  const isSourceControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate) || candidate.readOnly) return false;
    if (!['text', 'search'].includes(candidate.type)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const select = candidate.closest("[class*='Select-container'],[class*='select-container']");
    const fieldRoot = fieldRootFor(candidate);
    if (!(dropdown instanceof HTMLElement) || !(select instanceof HTMLElement) || !fieldRoot) return false;
    const titles = [...fieldRoot.querySelectorAll<HTMLElement>("[class*='title'],label,span,div")]
      .filter((item) => item !== candidate && !item.contains(candidate))
      .map((item) => item.innerText || item.textContent || "");
    return titles.some(sourceTitle);
  };
  const pointFor = (element: HTMLElement): MokaRecruitingSourcePoint | null => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    if (!(hit === element || element.contains(hit))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const result = (
    status: MokaRecruitingSourceProbeStatus,
    controlPoint: MokaRecruitingSourcePoint | null = null,
    leafPoint: MokaRecruitingSourcePoint | null = null,
    popupCount = 0,
    matchingLeafCount = 0,
    availableOptions: string[] = [],
    scrolled = false
  ): MokaRecruitingSourceProbe => ({
    status, controlPoint, leafPoint, popupCount, matchingLeafCount,
    availableOptions: [...new Set(availableOptions)].slice(0, 20), scrolled
  });

  const observedControl = document.querySelector(targetSelector);
  const semanticControls = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isSourceControl);
  const controls = isSourceControl(observedControl)
    ? [...new Set([observedControl, ...semanticControls])]
    : semanticControls;
  if (controls.length === 0) return result("control_missing");
  if (controls.length !== 1) return result("control_ambiguous");
  const control = controls[0]!;
  let scrolled = false;
  if (phase === "prepare_open") {
    control.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    void control.getBoundingClientRect();
    scrolled = true;
  }
  // The committed display span overlays Moka's searchable INPUT. The page
  // binds the open handler to the enclosing Select label, so validate and
  // click that live target instead of requiring elementFromPoint to hit the
  // visually covered INPUT itself.
  const selectTarget = control.closest<HTMLElement>(
    "[class*='Select-container'],[class*='select-container']"
  ) ?? control;
  const controlPoint = pointFor(selectTarget);
  if (!controlPoint) return result("control_not_clickable", null, null, 0, 0, [], scrolled);
  const dropdown = control.closest<HTMLElement>("[class*='Dropdown-container'],[class*='dropdown-container']");
  const localPopups = [...(dropdown?.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  ) ?? [])].filter(visible);
  const popups = localPopups.length ? localPopups : [...document.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].filter(visible);
  if (popups.length === 0) return result("popup_closed", controlPoint, null, 0, 0, [], scrolled);
  if (popups.length !== 1) return result("popup_ambiguous", controlPoint, null, popups.length, 0, [], scrolled);
  const popup = popups[0]!;
  const leaves = [...popup.querySelectorAll<HTMLElement>(
    "[class*='option-label'],[class*='Option-label']"
  )].filter(visible).filter((candidate) => {
    const item = candidate.closest("[class*='Menu-content-item'],[class*='menu-content-item']");
    return item instanceof HTMLElement;
  });
  const availableOptions = leaves.map((leaf) => String(leaf.innerText || leaf.textContent || "").trim())
    .filter(Boolean);
  const expected = normalize(expectedValue);
  const matches = leaves.filter((leaf) => normalize(leaf.innerText || leaf.textContent) === expected);
  if (matches.length === 0) {
    return result("leaf_missing", controlPoint, null, 1, 0, availableOptions, scrolled);
  }
  if (matches.length !== 1) {
    return result("leaf_ambiguous", controlPoint, null, 1, matches.length, availableOptions, scrolled);
  }
  if (phase === "prepare_select") {
    const leaf = matches[0]!;
    const scroller = leaf.closest<HTMLElement>("[class*='sd-Select-scrollable-']");
    if (scroller && popup.contains(scroller) && scroller.scrollHeight > scroller.clientHeight &&
      /auto|scroll/u.test(getComputedStyle(scroller).overflowY)) {
      const leafRect = leaf.getBoundingClientRect(), frame = scroller.getBoundingClientRect();
      // Move only the owned menu when its clipping area hides the unique leaf.
      // Ordinary overlays and unrelated page occlusion do not authorize scroll.
      if (leafRect.top < frame.top || leafRect.bottom > frame.bottom) {
        const before = scroller.scrollTop;
        scroller.scrollBy({ top: (leafRect.top + leafRect.bottom - frame.top - frame.bottom) / 2, behavior: "instant" });
        scrolled = scroller.scrollTop !== before;
      }
    }
  }
  const leafPoint = pointFor(matches[0]!);
  if (!leafPoint) return result("control_not_clickable", controlPoint, null, 1, 1, availableOptions, scrolled);
  return result("ready", controlPoint, leafPoint, 1, 1, availableOptions, scrolled);
}

/** MAIN-world authoritative display/validation/popup readback after React rebuilds. */
export function readMokaRecruitingSourceInPage(
  targetSelector: string,
  fieldKind: MokaFlatSelectFieldKind = "recruiting_source"
): MokaRecruitingSourceReadback {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const sourceTitle = (value: unknown) => {
    const title = String(value ?? "").replace(/\s+/gu, "").trim();
    if (fieldKind === "sina_weibo_frequency") return /^(?:您)?使用微博的频率$/u.test(title);
    if (fieldKind === "eqhr_travel_acceptance") return /^是否接受出差$/u.test(title);
    if (fieldKind === "yongxing_ethnicity") return /^民族$/u.test(title);
    if (fieldKind === "sungrow_identity_document_type") return /^(?:证件号码|证件类型)$/u.test(title);
    if (fieldKind === "sungrow_relative_employment") {
      return /^有无直系或旁系亲属在本单位(?:（含其他关联公司）)?任职[？?]?$/u.test(title);
    }
    return /^(?:请选择)?(?:招聘)?信息来源(?:渠道)?$|^(?:招聘)?来源渠道$|^招聘渠道$|^简历渠道$|^(?:招聘信息(?:获取|获知)|获取招聘信息)(?:的)?渠道$|^获知.*(?:渠道|途径)$/u.test(title);
  };
  const fieldRootFor = (element: HTMLElement): HTMLElement | null => {
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const tokens = String(current.className || "").split(/\s+/u);
      if (tokens.some((token) => /^apply-field-/u.test(token) && !/^apply-fields-/u.test(token))) return current;
    }
    return null;
  };
  const isSourceRoot = (root: HTMLElement) => visible(root) &&
    String(root.className || "").split(/\s+/u)
      .some(token => /^apply-field-/u.test(token) && !/^apply-fields-/u.test(token)) &&
    Boolean(root.querySelector("[class*='Select-container'],[class*='select-container']")) &&
    [...root.querySelectorAll<HTMLElement>("[class*='title'],label,span,div")]
      .some(item => sourceTitle(item.innerText || item.textContent));
  const observed = document.querySelector(targetSelector);
  const observedRoot = observed instanceof HTMLElement ? fieldRootFor(observed) : null;
  const semanticRoots = [...document.querySelectorAll<HTMLElement>("[class*='apply-field-']")].filter(isSourceRoot);
  const roots = observedRoot && isSourceRoot(observedRoot)
    ? [...new Set([observedRoot, ...semanticRoots])]
    : semanticRoots;
  if (roots.length !== 1) return { actual: "", validationCleared: false, popupClosed: true };
  const root = roots[0]!;
  const select = root.querySelector<HTMLElement>("[class*='Select-container'],[class*='select-container']");
  const controls = [...(select?.querySelectorAll<HTMLInputElement>("input") ?? [])].filter(candidate =>
    visible(candidate) && !candidate.readOnly && ["text", "search"].includes(candidate.type));
  if (controls.length > 1) return { actual: "", validationCleared: false, popupClosed: true };
  const control = controls[0] ?? null;
  const dropdown = root.querySelector<HTMLElement>("[class*='Dropdown-container'],[class*='dropdown-container']");
  const display = select?.querySelector<HTMLElement>(
    "[class*='Input-display-value'],[class*='input-display-value'],[class*='display-value'],[class*='DisplayValue']"
  );
  const invalid = control?.getAttribute("aria-invalid") === "true" || [...root.querySelectorAll<HTMLElement>(
    "[aria-invalid='true'],[class*='error'],[class*='Error'],[class*='invalid'],[class*='Invalid'],span,div,p"
  )].some((candidate) => visible(candidate) &&
    /必填项未填写|不能为空/u.test(String(candidate.textContent || "").trim()));
  const popupOpen = Boolean(dropdown && [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].some(visible));
  const actual = String(display?.textContent || "").trim();
  return {
    actual: /^(?:请选择|请搜索)?$/u.test(actual) ? "" : actual,
    validationCleared: !invalid,
    popupClosed: !popupOpen
  };
}

/** MAIN-world unique inert title used to commit the selected React field by blur. */
export function inspectMokaRecruitingSourceCommitPointInPage(
  targetSelector: string,
  fieldKind: MokaFlatSelectFieldKind = "recruiting_source"
): MokaRecruitingSourcePoint | null {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const sourceTitle = (value: unknown) => {
    const title = String(value ?? "").replace(/\s+/gu, "").trim();
    if (fieldKind === "sina_weibo_frequency") return /^(?:您)?使用微博的频率$/u.test(title);
    if (fieldKind === "eqhr_travel_acceptance") return /^是否接受出差$/u.test(title);
    if (fieldKind === "yongxing_ethnicity") return /^民族$/u.test(title);
    if (fieldKind === "sungrow_identity_document_type") return /^(?:证件号码|证件类型)$/u.test(title);
    if (fieldKind === "sungrow_relative_employment") {
      return /^有无直系或旁系亲属在本单位(?:（含其他关联公司）)?任职[？?]?$/u.test(title);
    }
    return /^(?:请选择)?(?:招聘)?信息来源(?:渠道)?$|^(?:招聘)?来源渠道$|^招聘渠道$|^简历渠道$|^(?:招聘信息(?:获取|获知)|获取招聘信息)(?:的)?渠道$|^获知.*(?:渠道|途径)$/u.test(title);
  };
  const fieldRootFor = (element: HTMLElement): HTMLElement | null => {
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const tokens = String(current.className || "").split(/\s+/u);
      if (tokens.some((token) => /^apply-field-/u.test(token) && !/^apply-fields-/u.test(token))) return current;
    }
    return null;
  };
  const isSourceRoot = (root: HTMLElement) => visible(root) &&
    String(root.className || "").split(/\s+/u)
      .some(token => /^apply-field-/u.test(token) && !/^apply-fields-/u.test(token)) &&
    Boolean(root.querySelector("[class*='Select-container'],[class*='select-container']")) &&
    Boolean(root.querySelector("[class*='Dropdown-container'],[class*='dropdown-container']")) &&
    [...root.querySelectorAll<HTMLElement>("[class*='title'],label,span,div")]
      .some(item => sourceTitle(item.innerText || item.textContent));
  const observed = document.querySelector(targetSelector);
  const observedRoot = observed instanceof HTMLElement ? fieldRootFor(observed) : null;
  const semanticRoots = [...document.querySelectorAll<HTMLElement>("[class*='apply-field-']")].filter(isSourceRoot);
  const roots = observedRoot && isSourceRoot(observedRoot)
    ? [...new Set([observedRoot, ...semanticRoots])]
    : semanticRoots;
  if (roots.length !== 1) return null;
  const root = roots[0]!;
  const matching = [...root.querySelectorAll<HTMLElement>("[class*='title'],label,span,div")]
    .filter((candidate) => !candidate.querySelector("input,select,textarea") && visible(candidate))
    .filter((candidate) => !candidate.closest("button,a,[role='button'],[role='link']"))
    .filter((candidate) => sourceTitle(candidate.innerText || candidate.textContent));
  const titles = matching.filter((candidate) =>
    !matching.some((other) => other !== candidate && other.contains(candidate))
  );
  if (titles.length !== 1) return null;
  const title = titles[0]!;
  const rect = title.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (!(hit === title || title.contains(hit))) return null;
  return { x, y, tagName: title.tagName, className: String(title.className || "") };
}

function emptyLedger(): MokaRecruitingSourceActionLedger {
  return {
    prepareSurfaceCount: 0,
    scrollCount: 0,
    openAttemptCount: 0,
    openClickCount: 0,
    leafAttemptCount: 0,
    leafClickCount: 0,
    commitAttemptCount: 0,
    commitClickCount: 0,
    readbackPollCount: 0,
    trustedPointerClickCount: 0,
    nativeEventClickCount: 0,
    retryCount: 0,
    reloadCount: 0,
    fullFormRestartCount: 0
  };
}

export async function executeMokaRecruitingSourceDriver(
  input: MokaRecruitingSourceDriverInput
): Promise<MokaRecruitingSourceDriverResult> {
  const ledger = emptyLedger();
  let availableOptions: string[] = [];
  const rememberOptions = (values: string[] | undefined) => {
    if (input.inspect) availableOptions = [...(values ?? [])];
    else if (values?.length) availableOptions = [...new Set([...availableOptions, ...values])].slice(0, 20);
  };
  const diagnostics = (failureCode: MokaRecruitingSourceFailureCode | null): MokaRecruitingSourceDriverDiagnostics => ({
    schemaVersion: "moka-recruiting-source-driver-diagnostic.v1",
    eventMechanism: "cdp_trusted_pointer_focus_emulation",
    failureCode,
    availableOptions: [...availableOptions],
    ledger: { ...ledger }
  });
  const failure = (
    stage: MokaRecruitingSourceDriverStage,
    code: MokaRecruitingSourceFailureCode,
    detail: string,
    readback: MokaRecruitingSourceReadback = { actual: "", validationCleared: false, popupClosed: true }
  ): MokaRecruitingSourceDriverResult => ({
    success: false,
    stage,
    error: `${MOKA_RECRUITING_SOURCE_INTERACTION_FAILED}: [${stage}/${code}] ${detail}`,
    availableOptions: [...availableOptions],
    diagnostics: diagnostics(code),
    ...readback
  });
  const success = (readback: MokaRecruitingSourceReadback): MokaRecruitingSourceDriverResult => ({
    success: true,
    stage: "readback",
    error: null,
    availableOptions: [...availableOptions],
    diagnostics: diagnostics(null),
    ...readback
  });
  const execute = async <T>(func: (...args: never[]) => T, args: unknown[]): Promise<Awaited<T> | null> => {
    const execution = await executeInterruptibleScript({
      target: { tabId: input.tabId },
      world: "MAIN",
      func,
      args
    });
    return (execution[0]?.result ?? null) as Awaited<T> | null;
  };
  const inspect = (phase: "observe" | "prepare_open" | "prepare_select" = "observe") => input.inspect ? input.inspect(phase) : execute(
    inspectMokaRecruitingSourceTargetInPage as (...args: never[]) => MokaRecruitingSourceProbe,
    [input.selector, input.expected, phase, input.fieldKind ?? "recruiting_source"]
  );
  const readback = async () => {
    if (input.readback) return input.readback();
    const state = await execute(
      readMokaRecruitingSourceInPage as (...args: never[]) => MokaRecruitingSourceReadback,
      [input.selector, input.fieldKind ?? "recruiting_source"]
    );
    if (!state || input.fieldKind !== "sungrow_identity_document_type") return state;
    const page = await execute(observeApplicationPage as (...args: never[]) => PageObservation, [submissionActionPatterns]);
    return identityDocumentTypeReadback(state, page);
  };
  const accepted = (state: MokaRecruitingSourceReadback | null) => Boolean(state &&
    mokaRecruitingSourceReadbackMatches(state.actual, input.expected) &&
    state.popupClosed && state.validationCleared);
  const prepareSurface = async () => {
    if (ledger.prepareSurfaceCount) return;
    ledger.prepareSurfaceCount += 1;
    await input.prepareSurface();
  };
  const commitAndVerify = async (
    initial: MokaRecruitingSourceReadback
  ): Promise<MokaRecruitingSourceDriverResult> => {
    ledger.commitAttemptCount += 1;
    let committed = false;
    try {
      committed = await input.commitSelection();
    } catch (error) {
      return failure(
        "commit",
        "commit_event_dispatch_failed",
        `目标值已显示，但可信失焦提交失败：${error instanceof Error ? error.message : String(error)}`,
        initial
      );
    }
    if (!committed) {
      return failure("commit", "commit_target_missing", "目标值已显示，但没有找到唯一字段标题提交点", initial);
    }
    ledger.commitClickCount += 1;
    ledger.trustedPointerClickCount += 1;
    let latest: MokaRecruitingSourceReadback | null = initial;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 160 : 180);
      ledger.readbackPollCount += 1;
      latest = await readback();
      if (!latest) return failure("readback", "readback_unavailable", "失焦提交后没有返回站点回读", initial);
      if (accepted(latest)) return success(latest);
    }
    return failure(
      "commit",
      "commit_validation_not_cleared",
      "目标值已显示且只执行了一次可信失焦提交，但站点必填校验仍未清除",
      latest ?? initial
    );
  };

  try {
    const initial = await readback();
    if (!initial) return failure("readback", "readback_unavailable", "信息来源控件初始回读不可用");
    if (!input.discoverOptions && accepted(initial)) return success(initial);
    if (initial.actual) {
      if (input.discoverOptions) return failure("detect", "preexisting_value_mismatch", "只读选项发现不接管已有值", initial);
      if (!mokaRecruitingSourceReadbackMatches(initial.actual, input.expected)) {
        return failure(
          "readback",
          "preexisting_value_mismatch",
          "信息来源控件已有不同值；Driver 不覆盖、不重新选择",
          initial
        );
      }
      if (!initial.popupClosed) {
        return failure("open", "unexpected_popup_state", "目标值已显示但弹层仍打开；Driver 不接管未知状态", initial);
      }
      await prepareSurface();
      const preparedCommit = await inspect("prepare_open");
      if (!preparedCommit) {
        return failure("prepare_open", "driver_interrupted", "已有目标值的控件滚动准备没有返回结果", initial);
      }
      rememberOptions(preparedCommit.availableOptions);
      if (preparedCommit.scrolled) ledger.scrollCount += 1;
      if (preparedCommit.status !== "popup_closed" || !preparedCommit.controlPoint) {
        const code: MokaRecruitingSourceFailureCode = preparedCommit.status === "control_missing"
          ? "control_missing"
          : preparedCommit.status === "control_ambiguous"
            ? "control_ambiguous"
            : "control_not_clickable";
        return failure(
          "prepare_open",
          code,
          `已有目标值的控件未形成可提交状态（${preparedCommit.status}）`,
          initial
        );
      }
      return commitAndVerify(initial);
    }

    const initialProbe = await inspect();
    if (!initialProbe) return failure("detect", "driver_interrupted", "信息来源控件检测没有返回结果");
    rememberOptions(initialProbe.availableOptions);
    if (initialProbe.status === "control_missing") {
      return failure("detect", "control_missing", "没有定位到唯一 Moka 招聘信息来源控件");
    }
    if (initialProbe.status === "control_ambiguous") {
      return failure("detect", "control_ambiguous", "定位到多个 Moka 招聘信息来源控件");
    }
    if (!['popup_closed', 'control_not_clickable'].includes(initialProbe.status)) {
      return failure("open", "unexpected_popup_state", `Driver 开始前弹层状态为 ${initialProbe.status}`);
    }

    await prepareSurface();
    const prepared = await inspect("prepare_open");
    if (!prepared) return failure("prepare_open", "driver_interrupted", "控件准备没有返回结果");
    rememberOptions(prepared.availableOptions);
    if (prepared.scrolled) ledger.scrollCount += 1;
    if (prepared.status !== "popup_closed" || !prepared.controlPoint) {
      const code: MokaRecruitingSourceFailureCode = prepared.status === "control_missing"
        ? "control_missing"
        : prepared.status === "control_ambiguous"
          ? "control_ambiguous"
          : "control_not_clickable";
      return failure("prepare_open", code, `滚动稳定后控件未形成可打开状态（${prepared.status}）`);
    }

    const liveOpen = await inspect();
    if (!liveOpen || liveOpen.status !== "popup_closed" || !liveOpen.controlPoint) {
      return failure("open", "open_target_stale", "可信打开事件前控件实时状态已变化");
    }
    ledger.openAttemptCount += 1;
    try {
      await input.clickPoint(liveOpen.controlPoint);
    } catch (error) {
      return failure(
        "open",
        "open_event_dispatch_failed",
        `可信打开事件发送失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
    ledger.openClickCount += 1;
    ledger.trustedPointerClickCount += 1;

    let probe: MokaRecruitingSourceProbe | null = null;
    let previousOptionSignature = "";
    let stableOptionReads = 0;
    let leafPreparationAttempted = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 120 : 160);
      probe = await inspect();
      if (!probe) return failure("open", "driver_interrupted", "打开后只读观察不可用");
      rememberOptions(probe.availableOptions);
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
        const preparedLeaf = await inspect("prepare_select");
        if (!preparedLeaf) return failure("select", "driver_interrupted", "选项滚动准备时字段身份失联");
        if (preparedLeaf.scrolled) ledger.scrollCount += 1;
        continue;
      }
      if (probe.status === "ready" && probe.leafPoint) break;
      if (probe.status === "popup_ambiguous") {
        return failure("open", "popup_ambiguous", "打开后出现多个无法归属的 Moka 弹层");
      }
      if (probe.status === "leaf_ambiguous") {
        return failure("select", "leaf_ambiguous", `出现 ${probe.matchingLeafCount} 个同名信息来源叶子项`);
      }
      if (probe.status === "leaf_missing" && probe.availableOptions.length > 0) {
        return failure("select", "leaf_missing", "目标信息来源不在页面当前选项中");
      }
    }
    if (input.discoverOptions && stableOptionReads >= 2) {
      ledger.commitAttemptCount += 1;
      if (!await input.commitSelection()) return failure("commit", "commit_target_missing", "选项发现后没有唯一关闭标题");
      ledger.commitClickCount += 1; ledger.trustedPointerClickCount += 1;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await input.wait(160); ledger.readbackPollCount += 1;
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

    const liveLeaf = await inspect();
    rememberOptions(liveLeaf?.availableOptions);
    if (!liveLeaf || liveLeaf.status !== "ready" || !liveLeaf.leafPoint || liveLeaf.matchingLeafCount !== 1) {
      return failure("select", "leaf_target_stale", "目标选项点击前的唯一实时命中点已变化");
    }
    ledger.leafAttemptCount += 1;
    try {
      await input.clickPoint(liveLeaf.leafPoint);
    } catch (error) {
      return failure(
        "select",
        "leaf_event_dispatch_failed",
        `目标选项可信事件发送失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
    ledger.leafClickCount += 1;
    ledger.trustedPointerClickCount += 1;

    let latest: MokaRecruitingSourceReadback | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 160 : 180);
      ledger.readbackPollCount += 1;
      latest = await readback();
      if (!latest) return failure("readback", "readback_unavailable", "选择后没有返回站点回读");
      if (accepted(latest)) return success(latest);
      const needsCommit = mokaRecruitingSourceReadbackMatches(latest.actual, input.expected) &&
        latest.popupClosed && !latest.validationCleared;
      if (needsCommit) return commitAndVerify(latest);
    }
    return failure(
      "readback",
      "readback_mismatch",
      "目标选项点击后没有形成显示值、关闭弹层并清除校验的完整状态",
      latest ?? undefined
    );
  } catch (error) {
    return failure(
      "readback",
      "driver_interrupted",
      `信息来源 Driver 被中断：${error instanceof Error ? error.message : String(error)}`
    );
  }
}
