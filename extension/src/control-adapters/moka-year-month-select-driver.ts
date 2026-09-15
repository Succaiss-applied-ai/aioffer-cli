import { executeInterruptibleScript } from "../auto-apply-interruption.js";
export const MOKA_YEAR_MONTH_SELECT_INTERACTION_FAILED =
  "moka_year_month_select_interaction_failed";

export type MokaYearMonthPart = "year" | "month";

export function isMokaYearMonthSelectInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${MOKA_YEAR_MONTH_SELECT_INTERACTION_FAILED}:`);
}

export function isMokaYearMonthSelectApplicationUrl(value: string): boolean {
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

export function isMokaYearMonthSelectField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
  type?: string | null;
  controlKind?: string | null;
  temporal?: {
    layout?: string | null;
    part?: string | null;
  } | null;
}): input is typeof input & { temporal: { layout: string; part: MokaYearMonthPart } } {
  const temporal = input.temporal;
  if (!temporal || !["year_month", "year_month_range"].includes(String(temporal.layout)) ||
    !["year", "month"].includes(String(temporal.part))) return false;
  // After one part is selected, Moka rebuilds the sibling Select, clears its
  // placeholder and exposes the generated value through a display node. The
  // generic observer can consequently classify that same split Select as a
  // custom_date_picker. The year_month structure is the authoritative signal;
  // a complete calendar has no split temporal part and cannot enter here.
  // The page observer can briefly report the underlying INPUT as text/native
  // while Moka is rebuilding its Select. The two/four-part temporal structure
  // is produced only after the input was anchored to the Moka year/month
  // container, so it is safer and more stable than that transient generic type.
  return /毕业|结束|开始|入学|就读|到岗|日期|时间|年月|graduation|education|start|end|date|month|year/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export type MokaYearMonthSelectDriverStage =
  | "detect"
  | "prepare_open"
  | "open"
  | "select"
  | "readback";

export type MokaYearMonthSelectFailureCode =
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "preexisting_value_mismatch"
  | "unexpected_popup_state"
  | "open_event_dispatch_failed"
  | "open_event_not_observed"
  | "popup_ambiguous"
  | "option_scroll_exhausted"
  | "option_missing"
  | "option_ambiguous"
  | "option_not_clickable"
  | "option_event_dispatch_failed"
  | "readback_unavailable"
  | "readback_mismatch"
  | "validation_not_cleared"
  | "driver_interrupted";

export interface MokaYearMonthSelectPoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export interface MokaYearMonthSelectProbe {
  status:
    | "control_missing"
    | "control_ambiguous"
    | "control_not_clickable"
    | "popup_closed"
    | "popup_ambiguous"
    | "option_needs_scroll"
    | "option_missing"
    | "option_ambiguous"
    | "option_not_clickable"
    | "ready";
  controlPoint: MokaYearMonthSelectPoint | null;
  optionPoint: MokaYearMonthSelectPoint | null;
  scrollPoint: MokaYearMonthSelectPoint | null;
  scrollDeltaY: number;
  popupCount: number;
  matchingOptionCount: number;
  availableOptions: string[];
  scrolled: boolean;
}

export interface MokaYearMonthSelectReadback {
  actual: string;
  validationCleared: boolean;
  popupClosed: boolean;
}

export interface MokaYearMonthSelectActionLedger {
  prepareSurfaceCount: number;
  scrollCount: number;
  openAttemptCount: number;
  openClickCount: number;
  optionAttemptCount: number;
  optionClickCount: number;
  readbackPollCount: number;
  trustedPointerClickCount: number;
  nativeEventClickCount: 0;
  keyboardEventCount: 0;
  retryCount: 0;
  reloadCount: 0;
  fullFormRestartCount: 0;
}

export interface MokaYearMonthSelectDriverDiagnostics {
  schemaVersion: "moka-year-month-select-driver-diagnostic.v1";
  eventMechanism: "cdp_trusted_pointer_background_focus_emulation";
  part: MokaYearMonthPart;
  failureCode: MokaYearMonthSelectFailureCode | null;
  availableOptions: string[];
  ledger: MokaYearMonthSelectActionLedger;
}

export function mokaYearMonthSelectMayUseLegacyFallback(input: {
  success: boolean;
  stage?: string | null;
  failureCode?: string | null;
  diagnostics?: Record<string, unknown> | null;
}): boolean {
  if (input.success || !["control_missing", "control_ambiguous", "control_not_clickable"].includes(
    String(input.failureCode ?? "")
  )) return false;
  const ledger = input.diagnostics?.ledger;
  if (!ledger || typeof ledger !== "object") return input.stage === "detect";
  const counts = ledger as Record<string, unknown>;
  return ["scrollCount", "openClickCount", "optionClickCount", "trustedPointerClickCount"]
    .every((key) => Number(counts[key] ?? 0) === 0);
}

export interface MokaYearMonthSelectDriverResult extends MokaYearMonthSelectReadback {
  success: boolean;
  stage: MokaYearMonthSelectDriverStage;
  error: string | null;
  availableOptions: string[];
  diagnostics: MokaYearMonthSelectDriverDiagnostics;
}

export interface MokaYearMonthSelectDriverInput {
  tabId: number;
  selector: string;
  expected: string;
  part: MokaYearMonthPart;
  /**
   * The caller may replace an existing value only when it recorded either
   * the sibling year as a successful action in this run (Moka can implicitly
   * assign month 1), or this exact stable field key in the site's first-submit
   * rejection set. Ordinary initial filling remains strictly no-overwrite.
   */
  allowReplacePreexisting?: boolean;
  prepareSurface(): Promise<void>;
  clickPoint(point: MokaYearMonthSelectPoint): Promise<void>;
  scrollPoint(point: MokaYearMonthSelectPoint, deltaY: number): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}

export function normalizeMokaYearMonthSelectValue(
  value: unknown,
  part: MokaYearMonthPart
): string {
  const text = String(value ?? "").replace(/\s+/gu, "").trim();
  if (part === "year") return /^(?:19|20)\d{2}年?$/u.test(text) ? text.replace(/年$/u, "") : "";
  const month = Number(text.replace(/月$/u, ""));
  return Number.isSafeInteger(month) && month >= 1 && month <= 12 ? String(month) : "";
}

export function mokaYearMonthSelectReadbackMatches(
  actual: unknown,
  expected: unknown,
  part: MokaYearMonthPart
): boolean {
  const left = normalizeMokaYearMonthSelectValue(actual, part);
  const right = normalizeMokaYearMonthSelectValue(expected, part);
  return Boolean(left && right) && left === right;
}

/** MAIN-world locator for one observed Moka year/month Select and its current popup option. */
export function inspectMokaYearMonthSelectInPage(
  targetSelector: string,
  expectedValue: string,
  part: MokaYearMonthPart,
  phase: "observe" | "prepare_open" = "observe"
): MokaYearMonthSelectProbe {
  const normalize = (value: unknown) => {
    const text = String(value ?? "").replace(/\s+/gu, "").trim();
    if (part === "year") return /^(?:19|20)\d{2}年?$/u.test(text) ? text.replace(/年$/u, "") : "";
    const month = Number(text.replace(/月$/u, ""));
    return Number.isSafeInteger(month) && month >= 1 && month <= 12 ? String(month) : "";
  };
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const pointFor = (element: HTMLElement): MokaYearMonthSelectPoint | null => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    if (!(hit === element || element.contains(hit))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const result = (
    status: MokaYearMonthSelectProbe["status"],
    controlPoint: MokaYearMonthSelectPoint | null = null,
    optionPoint: MokaYearMonthSelectPoint | null = null,
    popupCount = 0,
    matchingOptionCount = 0,
    availableOptions: string[] = [],
    scrolled = false
  ): MokaYearMonthSelectProbe => ({
    status,
    controlPoint,
    optionPoint,
    scrollPoint: null,
    scrollDeltaY: 0,
    popupCount,
    matchingOptionCount,
    availableOptions: [...new Set(availableOptions)].slice(0, 40),
    scrolled
  });
  const isControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const select = candidate.closest<HTMLElement>("[class*='Select'],[class*='select']");
    if (!select) return false;
    const placeholder = candidate.getAttribute("placeholder")?.trim() ?? "";
    if (placeholder) {
      const unitPattern = part === "year"
        ? /^(?:年(?:\s*[／/]\s*(?:yyyy|year))?|yyyy|year)$/iu
        : /^(?:月(?:\s*[／/]\s*(?:mm|month))?|mm|month)$/iu;
      return unitPattern.test(placeholder);
    }
    // After a sibling year click, Moka removes the month input placeholder and
    // exposes its implicit `1` only through the Select display node. The
    // selector was freshly rebound to this temporal part, so a valid rendered
    // value is the required structural proof when the placeholder is absent.
    const display = select.querySelector<HTMLElement>(
      "[class*='Input-display-value'],[class*='input-display-value'],[class*='display-value'],[class*='DisplayValue'],[class*='selection-item'],[class*='selection-text']"
    );
    if (normalize(display?.textContent || candidate.value)) return true;
    const mokaField = candidate.closest<HTMLElement>("[class*='apply-field-']");
    if (!mokaField || !/时间|日期|年月|入学|毕业|开始|起始|结束|截止|start|end|from|to|graduation/iu.test(
      String(mokaField.innerText ?? "").replace(/\s+/gu, " ").trim().slice(0, 360)
    )) return false;
    const rangeInputs = [...mokaField.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")]
      .filter((input) => visible(input) && Boolean(input.closest("[class*='Select'],[class*='select']")));
    if (![2, 4].includes(rangeInputs.length) || !rangeInputs.includes(candidate)) return false;
    const inferredPart = rangeInputs.indexOf(candidate) % 2 === 0 ? "year" : "month";
    return inferredPart === part;
  };
  const observed = document.querySelector(targetSelector);
  if (!isControl(observed)) return result("control_missing");
  const control = observed;
  let scrolled = false;
  if (phase === "prepare_open") {
    control.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    void control.getBoundingClientRect();
    scrolled = true;
  }
  const clickTarget = control.closest<HTMLElement>("[class*='Select-container'],[class*='select-container']") ??
    control.closest<HTMLElement>("[class*='Select'],[class*='select']") ?? control;
  const controlPoint = pointFor(clickTarget);
  if (!controlPoint) return result("control_not_clickable", null, null, 0, 0, [], scrolled);

  const dropdown = control.closest<HTMLElement>("[class*='Dropdown-container'],[class*='dropdown-container']");
  const localPopups = [...(dropdown?.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  ) ?? [])].filter(visible);
  const globalPopups = [...document.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown'],[role='listbox']"
  )].filter(visible);
  const controlRect = clickTarget.getBoundingClientRect();
  const anchoredGlobalPopups = globalPopups.filter((candidate) => {
    const rect = candidate.getBoundingClientRect();
    const horizontalOverlap = Math.min(controlRect.right, rect.right) -
      Math.max(controlRect.left, rect.left);
    const verticalGap = rect.top >= controlRect.bottom
      ? rect.top - controlRect.bottom
      : controlRect.top >= rect.bottom
        ? controlRect.top - rect.bottom
        : 0;
    return horizontalOverlap > 0 && verticalGap <= 180;
  });
  const popups = [...new Set(localPopups.length ? localPopups : anchoredGlobalPopups)];
  if (popups.length === 0) return result("popup_closed", controlPoint, null, 0, 0, [], scrolled);
  if (popups.length !== 1) return result("popup_ambiguous", controlPoint, null, popups.length, 0, [], scrolled);

  const popup = popups[0]!;
  const optionSelector = [
    "[role='option']",
    "[class*='Menu-content-item']",
    "[class*='menu-content-item']",
    "[class*='option-label']",
    "[class*='Option-label']",
    "[class*='select-option']",
    "[class*='Select-option']",
    "[class*='dropdown-item']",
    "[class*='Dropdown-item']"
  ].join(",");
  const matchedOptionNodes = [...popup.querySelectorAll<HTMLElement>(optionSelector)].filter(visible);
  // Some Moka tenants render the same Select menu with a different hashed
  // item class and no role=option. The popup itself is already uniquely tied
  // to the open Moka control, so fall back to its visible, normalized leaf
  // labels when none of the known item signatures yields a date option.
  const normalizedPopupNodes = [...popup.querySelectorAll<HTMLElement>("*")].filter((candidate) =>
    visible(candidate) && Boolean(normalize(candidate.innerText || candidate.textContent))
  );
  const optionNodes = [...new Set([...matchedOptionNodes, ...normalizedPopupNodes])];
  const leaves = optionNodes.filter((candidate) => {
    const value = normalize(candidate.innerText || candidate.textContent);
    // Moka currently renders each real clickable option as
    //   <div class="sd-Menu-content-item-*"><span>2026</span></div>.
    // The plain label span is not an option by itself.  Only discard an outer
    // node when a *second node matched by optionSelector* exists beneath it;
    // otherwise the old child-text check removes every live clickable item.
    return Boolean(value) && !optionNodes.some((nested) =>
      nested !== candidate && candidate.contains(nested) &&
      normalize(nested.innerText || nested.textContent) === value
    );
  });
  const availableOptions = leaves.map((leaf) => String(leaf.innerText || leaf.textContent || "").trim())
    .filter((value) => normalize(value));
  const expected = normalize(expectedValue);
  const matches = leaves.filter((leaf) => normalize(leaf.innerText || leaf.textContent) === expected);
  if (matches.length === 0) {
    if (part === "year" && expected) {
      const renderedYears = optionNodes
        .map((leaf) => String(leaf.innerText || leaf.textContent || "").replace(/\s+/gu, "").replace(/年$/u, ""))
        .filter((value) => /^\d{4}$/u.test(value))
        .map(Number);
      const expectedYear = Number(expected);
      const firstYear = renderedYears[0];
      const lastYear = renderedYears.at(-1);
      const descending = firstYear !== undefined && lastYear !== undefined && firstYear > lastYear;
      const ascending = firstYear !== undefined && lastYear !== undefined && firstYear < lastYear;
      const direction = descending
        ? expectedYear < (lastYear ?? expectedYear) ? 1 : -1
        : ascending
          ? expectedYear > (lastYear ?? expectedYear) ? 1 : -1
          : 0;
      let candidateSurface: HTMLElement | null = leaves[0]?.parentElement ?? popup;
      let scrollSurface: HTMLElement | null = null;
      while (candidateSurface) {
        if (candidateSurface.scrollHeight > candidateSurface.clientHeight + 1) {
          scrollSurface = candidateSurface;
          break;
        }
        if (candidateSurface === popup) break;
        candidateSurface = candidateSurface.parentElement;
      }
      if (scrollSurface && direction) {
        const rect = scrollSurface.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit && popup.contains(hit)) {
          return {
            ...result("option_needs_scroll", controlPoint, null, 1, 0, availableOptions, scrolled),
            scrollPoint: {
              x,
              y,
              tagName: hit instanceof HTMLElement ? hit.tagName : scrollSurface.tagName,
              className: hit instanceof HTMLElement
                ? String(hit.className || "")
                : String(scrollSurface.className || "")
            },
            scrollDeltaY: direction * Math.max(240, Math.min(720, rect.height * 2))
          };
        }
      }
    }
    return result("option_missing", controlPoint, null, 1, 0, availableOptions, scrolled);
  }
  if (matches.length !== 1) {
    return result("option_ambiguous", controlPoint, null, 1, matches.length, availableOptions, scrolled);
  }
  const matchedOption = matches[0]!;
  const popupRect = popup.getBoundingClientRect();
  const matchedRect = matchedOption.getBoundingClientRect();
  const visiblePopupTop = Math.max(0, popupRect.top);
  const visiblePopupBottom = Math.min(window.innerHeight, popupRect.bottom);
  // elementFromPoint can hit the visible half of a clipped option even though
  // the click lands on the viewport/popup boundary and Moka ignores it. Only a
  // fully visible option is eligible for selection; otherwise use the bounded
  // trusted-wheel path first.
  const optionFullyVisible = matchedRect.top >= visiblePopupTop &&
    matchedRect.bottom <= visiblePopupBottom;
  const optionPoint = optionFullyVisible ? pointFor(matchedOption) : null;
  if (!optionPoint) {
    // An earlier option-discovery pass can leave this popup open. Calling
    // scrollIntoView on an option inside Moka's portal scrolls the application
    // document as well as the menu; the popup then flips above the control and
    // the target remains outside the viewport. Keep all movement on the
    // trusted CDP wheel path and ask the state machine to scroll the menu.
    let candidateSurface: HTMLElement | null = matchedOption.parentElement;
    let scrollSurface: HTMLElement | null = null;
    while (candidateSurface) {
      if (candidateSurface.scrollHeight > candidateSurface.clientHeight + 1) {
        scrollSurface = candidateSurface;
        break;
      }
      if (candidateSurface === popup) break;
      candidateSurface = candidateSurface.parentElement;
    }
    if (scrollSurface) {
      const surfaceRect = scrollSurface.getBoundingClientRect();
      const targetRect = matchedOption.getBoundingClientRect();
      const visibleTop = Math.max(0, surfaceRect.top);
      const visibleBottom = Math.min(window.innerHeight, surfaceRect.bottom);
      const targetMiddle = targetRect.top + targetRect.height / 2;
      const direction = targetRect.top < visibleTop ? -1 : targetRect.bottom > visibleBottom ? 1 : 0;
      const x = Math.max(0, Math.min(window.innerWidth - 1, surfaceRect.left + surfaceRect.width / 2));
      const y = visibleTop + Math.max(1, (visibleBottom - visibleTop) / 2);
      const hit = visibleBottom > visibleTop ? document.elementFromPoint(x, y) : null;
      if (direction && hit && popup.contains(hit)) {
        return {
          ...result("option_needs_scroll", controlPoint, null, 1, 1, availableOptions, scrolled),
          scrollPoint: {
            x,
            y,
            tagName: hit instanceof HTMLElement ? hit.tagName : scrollSurface.tagName,
            className: hit instanceof HTMLElement
              ? String(hit.className || "")
              : String(scrollSurface.className || "")
          },
          scrollDeltaY: direction * Math.max(120, Math.min(720, Math.abs(targetMiddle - (visibleTop + visibleBottom) / 2)))
        };
      }
    }
    return result("option_not_clickable", controlPoint, null, 1, 1, availableOptions, scrolled);
  }
  return result("ready", controlPoint, optionPoint, 1, 1, availableOptions, scrolled);
}

/** MAIN-world display, popup and local required-state readback for one split temporal Select. */
export function readMokaYearMonthSelectInPage(
  targetSelector: string
): MokaYearMonthSelectReadback | null {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const control = document.querySelector(targetSelector);
  if (!(control instanceof HTMLInputElement) || !visible(control)) return null;
  const select = control.closest<HTMLElement>("[class*='Select-container'],[class*='select-container']") ??
    control.closest<HTMLElement>("[class*='Select'],[class*='select']");
  const fieldRoot = control.closest<HTMLElement>(
    "[class*='apply-field'],[class*='Apply-field'],[class*='Select-field'],[class*='select-field'],[class*='form-item']"
  ) ?? select?.parentElement ?? control.parentElement;
  const display = select?.querySelector<HTMLElement>(
    "[class*='Input-display-value'],[class*='input-display-value'],[class*='display-value'],[class*='DisplayValue'],[class*='selection-item'],[class*='selection-text']"
  );
  const actual = String(display?.textContent || control.value || "").trim();
  const invalid = control.getAttribute("aria-invalid") === "true" || [...(fieldRoot?.querySelectorAll<HTMLElement>(
    "[aria-invalid='true'],[class*='error'],[class*='Error'],[class*='invalid'],[class*='Invalid'],span,div,p"
  ) ?? [])].some((candidate) => visible(candidate) &&
    /必填项未填写|不能为空|请选择/u.test(String(candidate.textContent || "").trim()));
  const dropdown = control.closest<HTMLElement>("[class*='Dropdown-container'],[class*='dropdown-container']");
  const popupOpen = Boolean(dropdown && [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].some(visible));
  return {
    actual: /^(?:年|月|请选择)$/u.test(actual) ? "" : actual,
    validationCleared: !invalid,
    popupClosed: !popupOpen
  };
}

function emptyLedger(): MokaYearMonthSelectActionLedger {
  return {
    prepareSurfaceCount: 0,
    scrollCount: 0,
    openAttemptCount: 0,
    openClickCount: 0,
    optionAttemptCount: 0,
    optionClickCount: 0,
    readbackPollCount: 0,
    trustedPointerClickCount: 0,
    nativeEventClickCount: 0,
    keyboardEventCount: 0,
    retryCount: 0,
    reloadCount: 0,
    fullFormRestartCount: 0
  };
}

export async function executeMokaYearMonthSelectDriver(
  input: MokaYearMonthSelectDriverInput
): Promise<MokaYearMonthSelectDriverResult> {
  const ledger = emptyLedger();
  let availableOptions: string[] = [];
  const rememberOptions = (values: string[] | undefined) => {
    if (values?.length) availableOptions = [...new Set([...availableOptions, ...values])].slice(0, 40);
  };
  const diagnostics = (
    failureCode: MokaYearMonthSelectFailureCode | null
  ): MokaYearMonthSelectDriverDiagnostics => ({
    schemaVersion: "moka-year-month-select-driver-diagnostic.v1",
    eventMechanism: "cdp_trusted_pointer_background_focus_emulation",
    part: input.part,
    failureCode,
    availableOptions: [...availableOptions],
    ledger: { ...ledger }
  });
  const failure = (
    stage: MokaYearMonthSelectDriverStage,
    code: MokaYearMonthSelectFailureCode,
    detail: string,
    readback: MokaYearMonthSelectReadback = { actual: "", validationCleared: false, popupClosed: true }
  ): MokaYearMonthSelectDriverResult => ({
    success: false,
    stage,
    error: `${MOKA_YEAR_MONTH_SELECT_INTERACTION_FAILED}: [${stage}/${code}] ${detail}`,
    availableOptions: [...availableOptions],
    diagnostics: diagnostics(code),
    ...readback
  });
  const success = (readback: MokaYearMonthSelectReadback): MokaYearMonthSelectDriverResult => ({
    success: true,
    stage: "readback",
    error: null,
    availableOptions: [...availableOptions],
    diagnostics: diagnostics(null),
    ...readback
  });
  const execute = async <T>(func: (...args: never[]) => T, args: unknown[]) => {
    const execution = await executeInterruptibleScript({
      target: { tabId: input.tabId },
      world: "MAIN",
      func,
      args
    });
    return execution[0]?.result ?? null;
  };
  const inspect = (phase: "observe" | "prepare_open" = "observe") => execute(
    inspectMokaYearMonthSelectInPage as (...args: never[]) => MokaYearMonthSelectProbe,
    [input.selector, input.expected, input.part, phase]
  );
  const readback = () => execute(
    readMokaYearMonthSelectInPage as (...args: never[]) => MokaYearMonthSelectReadback,
    [input.selector]
  );
  const accepted = (state: MokaYearMonthSelectReadback | null) => Boolean(state &&
    mokaYearMonthSelectReadbackMatches(state.actual, input.expected, input.part) &&
    state.popupClosed);
  const scrollToExpectedOption = async (
    initialProbe: MokaYearMonthSelectProbe
  ): Promise<MokaYearMonthSelectProbe | null> => {
    let probe = initialProbe;
    for (let attempt = 0; attempt < 32 && probe.status === "option_needs_scroll"; attempt += 1) {
      if (!probe.scrollPoint || !probe.scrollDeltaY) return probe;
      await input.scrollPoint(probe.scrollPoint, probe.scrollDeltaY);
      ledger.scrollCount += 1;
      await input.wait(140);
      const next = await inspect();
      if (!next) return null;
      rememberOptions(next.availableOptions);
      probe = next.status === "option_not_clickable"
        ? await inspect("prepare_open") ?? next
        : next;
      rememberOptions(probe.availableOptions);
    }
    return probe;
  };

  try {
    const initial = await readback();
    if (!initial) return failure("detect", "readback_unavailable", "Moka 年月下拉初始回读不可用");
    if (accepted(initial)) return success(initial);
    if (initial.actual && !input.allowReplacePreexisting) {
      return failure(
        "readback",
        "preexisting_value_mismatch",
        "Moka 年月下拉已有不同值；Driver 不覆盖、不重新选择",
        initial
      );
    }
    ledger.prepareSurfaceCount += 1;
    await input.prepareSurface();
    let prepared = await inspect("prepare_open");
    if (!prepared) return failure("prepare_open", "driver_interrupted", "滚动准备没有返回控件状态");
    rememberOptions(prepared.availableOptions);
    if (prepared.scrolled) ledger.scrollCount += 1;
    if (!prepared.controlPoint) {
      const code: MokaYearMonthSelectFailureCode = prepared.status === "control_missing"
        ? "control_missing"
        : prepared.status === "control_ambiguous"
          ? "control_ambiguous"
          : "control_not_clickable";
      return failure("prepare_open", code, "未定位到唯一可点击的 Moka 年月下拉控件");
    }
    let optionProbe: MokaYearMonthSelectProbe | null = prepared.status === "ready" ? prepared : null;
    if (prepared.status === "option_needs_scroll") {
      optionProbe = await scrollToExpectedOption(prepared);
      if (!optionProbe) {
        return failure("select", "driver_interrupted", "滚动年月选项后没有返回弹层状态");
      }
      prepared = optionProbe;
    }
    if (prepared.status === "popup_closed") {
      ledger.openAttemptCount += 1;
      try {
        await input.clickPoint(prepared.controlPoint);
      } catch (error) {
        return failure(
          "open",
          "open_event_dispatch_failed",
          `打开年月下拉的可信指针失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
      ledger.openClickCount += 1;
      ledger.trustedPointerClickCount += 1;

      for (let attempt = 0; attempt < 15; attempt += 1) {
        await input.wait(attempt === 0 ? 180 : 120);
        optionProbe = await inspect();
        if (!optionProbe) return failure("open", "driver_interrupted", "打开后没有返回弹层状态");
        if (optionProbe.status === "option_needs_scroll") {
          optionProbe = await scrollToExpectedOption(optionProbe);
          if (!optionProbe) {
            return failure("select", "driver_interrupted", "滚动年月选项后没有返回弹层状态");
          }
        }
        if (optionProbe.status === "option_not_clickable") {
          optionProbe = await inspect("prepare_open");
          if (!optionProbe) return failure("open", "driver_interrupted", "滚动年月选项后没有返回弹层状态");
          if (optionProbe.scrolled) ledger.scrollCount += 1;
        }
        rememberOptions(optionProbe.availableOptions);
        if (optionProbe.status !== "popup_closed") break;
      }
    } else if (prepared.status === "popup_ambiguous") {
      return failure("open", "popup_ambiguous", "滚动准备后存在多个可见年月选项弹层");
    } else if (prepared.status === "option_missing") {
      return failure("select", "option_missing", "已打开的实时年月选项中不存在目标值");
    } else if (prepared.status === "option_ambiguous") {
      return failure("select", "option_ambiguous", "已打开弹层中的目标年月选项不唯一");
    } else if (prepared.status === "option_not_clickable") {
      return failure("select", "option_not_clickable", "已打开弹层中的目标年月选项没有可点击命中点");
    } else if (prepared.status !== "ready") {
      return failure("open", "unexpected_popup_state", "滚动准备后年月弹层状态无法归类");
    }
    if (!optionProbe || optionProbe.status === "popup_closed") {
      return failure("open", "open_event_not_observed", "可信指针后没有观察到 Moka 年月选项弹层");
    }
    if (optionProbe.status === "popup_ambiguous") {
      return failure("open", "popup_ambiguous", "页面存在多个可见年月选项弹层");
    }
    if (optionProbe.status === "option_missing") {
      return failure("select", "option_missing", "实时年月选项中不存在目标值");
    }
    if (optionProbe.status === "option_needs_scroll") {
      return failure("select", "option_scroll_exhausted", "有界可信滚动后仍未到达目标年份");
    }
    if (optionProbe.status === "option_ambiguous") {
      return failure("select", "option_ambiguous", "目标年月选项未形成唯一叶节点");
    }
    if (optionProbe.status !== "ready" || !optionProbe.optionPoint) {
      return failure("select", "option_not_clickable", "目标年月选项没有唯一可点击命中点");
    }

    ledger.optionAttemptCount += 1;
    try {
      await input.clickPoint(optionProbe.optionPoint);
    } catch (error) {
      return failure(
        "select",
        "option_event_dispatch_failed",
        `选择年月选项的可信指针失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
    ledger.optionClickCount += 1;
    ledger.trustedPointerClickCount += 1;

    let latest: MokaYearMonthSelectReadback | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 240 : 150);
      ledger.readbackPollCount += 1;
      latest = await readback();
      if (!latest) continue;
      if (accepted(latest)) return success(latest);
    }
    if (!latest) return failure("readback", "readback_unavailable", "选择后没有返回 Moka 年月字段回读");
    if (!mokaYearMonthSelectReadbackMatches(latest.actual, input.expected, input.part)) {
      return failure("readback", "readback_mismatch", "可信指针选择后没有形成目标年月展示值", latest);
    }
    return failure("readback", "validation_not_cleared", "年月展示值正确，但字段必填校验未清除", latest);
  } catch (error) {
    return failure(
      "detect",
      "driver_interrupted",
      `Moka 年月下拉 Driver 被中断：${error instanceof Error ? error.message : String(error)}`
    );
  }
}
