export const FEISHU_FORMILY_SELECT_INTERACTION_FAILED = "feishu_formily_select_control_interaction_failed";

export type FeishuFormilySelectStage = "detect" | "prepare_open" | "open" | "select" | "commit" | "readback";

export type FeishuFormilySelectStatus =
  | "ready"
  | "control_missing"
  | "control_ambiguous"
  | "field_identity_mismatch"
  | "control_not_clickable"
  | "popup_closed"
  | "popup_ambiguous"
  | "unsupported_popup_structure"
  | "leaf_missing"
  | "leaf_ambiguous";

export interface FeishuFormilySelectPoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export interface FeishuFormilySelectProbe {
  status: FeishuFormilySelectStatus;
  controlPoint: FeishuFormilySelectPoint | null;
  leafPoint: FeishuFormilySelectPoint | null;
  closePoint: FeishuFormilySelectPoint | null;
  popupCount: number;
  matchingLeafCount: number;
  availableOptions: string[];
  actual: string;
  validationCleared: boolean;
  scrolled: boolean;
}

export interface FeishuFormilySelectDriverResult {
  success: boolean;
  stage: FeishuFormilySelectStage;
  error: string | null;
  actual: string;
  availableOptions: string[];
  popupClosed: boolean;
  validationCleared: boolean;
  diagnostics: {
    schemaVersion: "feishu-formily-select-driver-diagnostic.v1";
    failureCode: string | null;
    eventMechanism: "cdp_trusted_pointer_focus_emulation";
    ledger: {
      prepareSurfaceCount: number;
      controlClickCount: number;
      optionClickCount: number;
      closeClickCount: number;
      readbackPollCount: number;
      retryCount: 0;
      reloadCount: 0;
    };
  };
}

export function isFeishuFormilySelectInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${FEISHU_FORMILY_SELECT_INTERACTION_FAILED}:`);
}

export function normalizeFeishuFormilyOption(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/**
 * MAIN-world read-only locator for Feishu's flat Formily Select. The control
 * is rebound by the shared stable field identity before each invocation. The
 * probe accepts only one field-owned readonly search input and one flat popup.
 */
export function inspectFeishuFormilySelectInPage(
  selector: string,
  expectedLabel: string,
  expectedValue: string,
  phase: "observe" | "prepare_open" = "observe"
): FeishuFormilySelectProbe {
  const normalize = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  const result = (status: FeishuFormilySelectStatus): FeishuFormilySelectProbe => ({
    status,
    controlPoint: null,
    leafPoint: null,
    closePoint: null,
    popupCount: 0,
    matchingLeafCount: 0,
    availableOptions: [],
    actual: "",
    validationCleared: false,
    scrolled: false
  });
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  };
  const pointFor = (element: HTMLElement): FeishuFormilySelectPoint | null => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    if (!(hit === element || element.contains(hit))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const localError = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(
    ".ud-formily-item-error-help,[role='alert'],[aria-live='assertive'],[class*='formily-item-error']"
  )].filter(visible).map((node) => normalize(node.innerText || node.textContent)).some((text) =>
    /(?:为|是)必填(?:项)?|不能为空|请(?:填写|选择|上传|勾选)|不正确|无效|未通过|不一致|required|invalid/iu.test(text)
  );

  let selected: Element[] = [];
  try { selected = [...document.querySelectorAll(selector)]; } catch { selected = []; }
  if (selected.length === 0) return result("control_missing");
  if (selected.length !== 1) return result("control_ambiguous");
  const control = selected[0];
  if (!(control instanceof HTMLInputElement) || !visible(control) || control.disabled || !control.readOnly ||
    !["text", "search"].includes(control.type) || control.getAttribute("role") !== "combobox") {
    return result("control_missing");
  }
  const root = control.closest<HTMLElement>(".ud-formily-item");
  const select = control.closest<HTMLElement>(".ud__select");
  const selectorTarget = control.closest<HTMLElement>(".ud__select__selector");
  if (!root || !select || !selectorTarget || root.querySelectorAll(
    "input[role='combobox'].ud__select__selector__search__input"
  ).length !== 1) return result("control_missing");
  const fieldLabel = normalize(
    control.getAttribute("data-form-field-i18n-name") ||
    root.getAttribute("data-form-field-i18n-name") ||
    root.querySelector<HTMLElement>(".ud-formily-item-label-content")?.innerText
  ).replace(/[＊*]\s*(?:必填)?/gu, "").trim();
  const expectedLeafLabel = normalize(expectedLabel).split("·").at(-1)?.trim() ?? "";
  if (expectedLeafLabel && fieldLabel !== expectedLeafLabel) return result("field_identity_mismatch");

  const probe = result("popup_closed");
  if (phase === "prepare_open") {
    selectorTarget.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    void selectorTarget.getBoundingClientRect();
    probe.scrolled = true;
  }
  probe.controlPoint = pointFor(selectorTarget);
  if (!probe.controlPoint) return { ...probe, status: "control_not_clickable" };
  const labelTarget = root.querySelector<HTMLElement>(".ud-formily-item-label-content");
  probe.closePoint = labelTarget && visible(labelTarget) ? pointFor(labelTarget) : null;
  const selectedDisplays = [...select.querySelectorAll<HTMLElement>(
    ".ud__select__selector__selectItem,.ud__select__selector__selection__item," +
    "[class*='selector__selection__item'],[class*='selection-item']"
  )].filter(visible).filter((node) => !node.closest(".ud__select__dropdown") &&
    !/placeholder/iu.test(String(node.className || "")));
  const displayed = selectedDisplays.map((node) => normalize(node.innerText || node.textContent)).filter(Boolean);
  probe.actual = [...new Set(displayed)].join("、") || normalize(control.value);
  if (/^(?:请选择|请搜索|请输入)?$/iu.test(probe.actual)) probe.actual = "";
  probe.validationCleared = !localError(root) && !root.querySelector("[aria-invalid='true']");

  const popups = [...document.querySelectorAll<HTMLElement>(".ud__select__dropdown")].filter(visible);
  probe.popupCount = popups.length;
  if (popups.length === 0) return probe;
  if (popups.length !== 1) return { ...probe, status: "popup_ambiguous" };
  const popup = popups[0]!;
  if (popup.querySelector("[role='tree'],[role='grid'],[class*='calendar'],[class*='cascader'],[class*='picker-panel']")) {
    return { ...probe, status: "unsupported_popup_structure" };
  }
  const leaves = [...popup.querySelectorAll<HTMLElement>(".ud__select__list__item")]
    .filter(visible).filter((item) => !item.matches(
      "[disabled],[aria-disabled='true'],[class*='disabled'],[class*='Disabled']"
    ));
  if (!leaves.length) return { ...probe, status: "unsupported_popup_structure" };
  probe.availableOptions = [...new Set(leaves.map((item) => normalize(
    item.querySelector<HTMLElement>(".ud__select__list__item__content")?.innerText || item.innerText || item.textContent
  )).filter(Boolean))].slice(0, 100);
  const expected = normalize(expectedValue);
  const matches = expected ? leaves.filter((item) => normalize(
    item.querySelector<HTMLElement>(".ud__select__list__item__content")?.innerText || item.innerText || item.textContent
  ) === expected) : [];
  probe.matchingLeafCount = matches.length;
  if (matches.length === 0) return { ...probe, status: "leaf_missing" };
  if (matches.length !== 1) return { ...probe, status: "leaf_ambiguous" };
  probe.leafPoint = pointFor(matches[0]!);
  return { ...probe, status: probe.leafPoint ? "ready" : "control_not_clickable" };
}

/** One route, one state machine, and no DOM-value/keyboard/alternate fallback. */
export async function executeFeishuFormilySelectDriver(input: {
  expected: string;
  discoverOptions?: boolean;
  inspect(phase: "observe" | "prepare_open"): Promise<FeishuFormilySelectProbe | null>;
  prepareSurface(): Promise<void>;
  clickPoint(point: FeishuFormilySelectPoint): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}): Promise<FeishuFormilySelectDriverResult> {
  const ledger = { prepareSurfaceCount: 0, controlClickCount: 0, optionClickCount: 0, closeClickCount: 0,
    readbackPollCount: 0, retryCount: 0 as const, reloadCount: 0 as const };
  let last: FeishuFormilySelectProbe | null = null;
  const finish = (success: boolean, stage: FeishuFormilySelectStage, failureCode: string | null,
    probe: FeishuFormilySelectProbe | null = last): FeishuFormilySelectDriverResult => ({
    success,
    stage,
    error: failureCode ? `${FEISHU_FORMILY_SELECT_INTERACTION_FAILED}:${stage}:${failureCode}` : null,
    actual: probe?.actual ?? "",
    availableOptions: probe?.availableOptions ?? [],
    popupClosed: (probe?.popupCount ?? 0) === 0,
    validationCleared: probe?.validationCleared ?? false,
    diagnostics: { schemaVersion: "feishu-formily-select-driver-diagnostic.v1", failureCode,
      eventMechanism: "cdp_trusted_pointer_focus_emulation", ledger }
  });
  const expected = normalizeFeishuFormilyOption(input.expected);
  last = await input.inspect("observe");
  // A resolved control can be outside the viewport before prepare_open.
  // Only identity failures are terminal before the one owned scroll/hit test.
  if (!last || ["control_missing", "control_ambiguous", "field_identity_mismatch"]
    .includes(last.status)) return finish(false, "detect", last?.status ?? "control_missing");
  if (!input.discoverOptions && normalizeFeishuFormilyOption(last.actual) === expected &&
    last.popupCount === 0 && last.validationCleared) return finish(true, "readback", null);

  await input.prepareSurface();
  ledger.prepareSurfaceCount += 1;
  last = await input.inspect("prepare_open");
  if (!last?.controlPoint) return finish(false, "prepare_open", last?.status ?? "control_missing");
  if (!input.discoverOptions && normalizeFeishuFormilyOption(last.actual) === expected &&
    last.popupCount === 0 && last.validationCleared) return finish(true, "readback", null);
  if (last.popupCount === 0) {
    await input.clickPoint(last.controlPoint);
    ledger.controlClickCount += 1;
    await input.wait(250);
  }
  last = await input.inspect("observe");
  if (!last || last.popupCount !== 1) return finish(false, "open", last?.status ?? "open_event_not_observed");
  if (input.discoverOptions) {
    const options = last.availableOptions;
    if (!options.length) return finish(false, "open", last.status);
    if (!last.closePoint) return finish(false, "open", "close_target_missing");
    await input.clickPoint(last.closePoint);
    ledger.closeClickCount += 1;
    await input.wait(180);
    const closed = await input.inspect("observe");
    if (closed) last = { ...closed, availableOptions: options };
    return finish(Boolean(closed && closed.popupCount === 0), "readback",
      closed && closed.popupCount === 0 ? null : "popup_not_closed", last);
  }
  if (last.status !== "ready" || !last.leafPoint) return finish(false, "select", last.status);
  await input.clickPoint(last.leafPoint);
  ledger.optionClickCount += 1;
  await input.wait(250);
  for (let index = 0; index < 8; index += 1) {
    last = await input.inspect("observe");
    ledger.readbackPollCount += 1;
    if (last && normalizeFeishuFormilyOption(last.actual) === expected && last.popupCount === 0 &&
      last.validationCleared) return finish(true, "readback", null);
    await input.wait(150);
  }
  if (last && normalizeFeishuFormilyOption(last.actual) === expected && last.popupCount === 0) {
    if (!last.closePoint) return finish(false, "commit", "close_target_missing");
    await input.clickPoint(last.closePoint);
    ledger.closeClickCount += 1;
    await input.wait(180);
    for (let index = 0; index < 4; index += 1) {
      last = await input.inspect("observe");
      ledger.readbackPollCount += 1;
      if (last && normalizeFeishuFormilyOption(last.actual) === expected && last.popupCount === 0 &&
        last.validationCleared) return finish(true, "readback", null);
      await input.wait(120);
    }
    return finish(false, "commit", "validation_not_cleared");
  }
  return finish(false, "readback", "readback_mismatch");
}
