import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import {
  structuredDateReadbackMatches,
  type StructuredDateValue
} from "../date-control-strategy.js";
import {
  CALENDAR_VISIBILITY_MAX_CORRECTIONS,
  calendarTargetVisibilityCorrection,
  calendarTargetVisibilityProgress,
  calendarTargetVisibilityStep,
  type CalendarTargetGeometry
} from "../calendar-target-visibility.js";

export const MOKA_TAP4FUN_BIRTH_DATE_INTERACTION_FAILED =
  "tap4fun_birth_date_control_interaction_failed";

export function isMokaTap4funBirthDateApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/tap4fun/291" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

export function isMokaTap4funBirthDateField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /出生(?:日期|年月)|birth[_\s.-]*(?:date|month)|birthDate/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export type MokaTap4funBirthDateStage =
  | "detect"
  | "prepare_open"
  | "open"
  | "year_panel"
  | "year"
  | "month_panel"
  | "month"
  | "day"
  | "readback";

export type MokaTap4funBirthDateFailureCode =
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "popup_missing"
  | "popup_ambiguous"
  | "popup_obstructed"
  | "unexpected_panel"
  | "year_header_missing"
  | "decade_navigation_missing"
  | "target_year_missing"
  | "month_header_missing"
  | "target_month_missing"
  | "target_day_missing"
  | "trusted_pointer_failed"
  | "readback_unavailable"
  | "readback_mismatch"
  | "validation_not_cleared"
  | "driver_interrupted";

export interface MokaTap4funBirthDatePoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export interface MokaTap4funBirthDateProbe {
  status:
    | "control_missing"
    | "control_ambiguous"
    | "control_not_clickable"
    | "popup_closed"
    | "popup_ambiguous"
    | "day"
    | "year"
    | "month";
  mode: "closed" | "day" | "year" | "month";
  controlPoint: MokaTap4funBirthDatePoint | null;
  yearTitlePoint: MokaTap4funBirthDatePoint | null;
  monthTitlePoint: MokaTap4funBirthDatePoint | null;
  previousDecadePoint: MokaTap4funBirthDatePoint | null;
  nextDecadePoint: MokaTap4funBirthDatePoint | null;
  targetYearPoint: MokaTap4funBirthDatePoint | null;
  targetMonthPoint: MokaTap4funBirthDatePoint | null;
  targetDayPoint: MokaTap4funBirthDatePoint | null;
  year: number;
  month: number;
  yearRangeStart: number;
  yearRangeEnd: number;
  targetYearMatches: number;
  targetMonthMatches: number;
  targetDayMatches: number;
  popupCount: number;
  popupTop: number;
  viewportHeight: number;
  calendarTargets: CalendarTargetGeometry[];
  preparedScroll: boolean;
}

export interface MokaTap4funBirthDateReadback {
  actual: string;
  popupClosed: boolean;
  validationCleared: boolean;
}

export interface MokaTap4funBirthDateActionLedger {
  prepareSurfaceCount: number;
  positionScrollCount: number;
  openClickCount: number;
  yearHeaderClickCount: number;
  decadeClickCount: number;
  yearClickCount: number;
  monthHeaderClickCount: number;
  monthClickCount: number;
  dayClickCount: number;
  trustedPointerClickCount: number;
  readbackPollCount: number;
  nativeEventClickCount: 0;
  keyboardEventCount: 0;
  retryCount: 0;
  fallbackDriverCount: 0;
}

export interface MokaTap4funBirthDateDriverDiagnostics {
  schemaVersion: "moka-tap4fun-birth-date-driver-diagnostic.v2";
  eventMechanism: "cdp_trusted_pointer_focus_emulation";
  failureCode: MokaTap4funBirthDateFailureCode | null;
  ledger: MokaTap4funBirthDateActionLedger;
}

export interface MokaTap4funBirthDateDriverResult extends MokaTap4funBirthDateReadback {
  success: boolean;
  stage: MokaTap4funBirthDateStage;
  error: string | null;
  diagnostics: MokaTap4funBirthDateDriverDiagnostics;
}

export interface MokaTap4funBirthDateDriverInput {
  tabId: number;
  selector: string;
  dateValue: StructuredDateValue;
  prepareSurface(): Promise<void>;
  shiftSurface(shiftY: number): Promise<number>;
  clickPoint(point: MokaTap4funBirthDatePoint): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}

function emptyLedger(): MokaTap4funBirthDateActionLedger {
  return {
    prepareSurfaceCount: 0,
    positionScrollCount: 0,
    openClickCount: 0,
    yearHeaderClickCount: 0,
    decadeClickCount: 0,
    yearClickCount: 0,
    monthHeaderClickCount: 0,
    monthClickCount: 0,
    dayClickCount: 0,
    trustedPointerClickCount: 0,
    readbackPollCount: 0,
    nativeEventClickCount: 0,
    keyboardEventCount: 0,
    retryCount: 0,
    fallbackDriverCount: 0
  };
}

/**
 * MAIN-world probe for the one evidenced tap4fun birth-date control. It may
 * only scroll during prepare_open; every other probe is read-only.
 */
export function inspectMokaTap4funBirthDateInPage(
  targetSelector: string,
  targetDate: StructuredDateValue,
  phase: "observe" | "prepare_open" = "observe"
): MokaTap4funBirthDateProbe {
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
    return element.closest<HTMLElement>("[class*='form-item'],[class*='field']");
  };
  const isBirthDateControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate) || !candidate.readOnly) return false;
    const root = fieldRootFor(candidate);
    const dropdown = candidate.closest<HTMLElement>(
      "[class*='Dropdown-container'],[class*='dropdown-container']"
    );
    const identity = `${candidate.placeholder} ${root?.innerText ?? root?.textContent ?? ""}`;
    const signature = `${candidate.className} ${dropdown?.className ?? ""}`;
    return Boolean(root && dropdown && /出生(?:日期|年月)|birth\s*date/iu.test(identity) &&
      /day_info|日期|年月日/iu.test(identity + signature));
  };
  const pointFor = (element: Element | null): MokaTap4funBirthDatePoint | null => {
    if (!(element instanceof HTMLElement) || !visible(element)) return null;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    if (!(hit === element || element.contains(hit))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const response = (
    status: MokaTap4funBirthDateProbe["status"],
    overrides: Partial<MokaTap4funBirthDateProbe> = {}
  ): MokaTap4funBirthDateProbe => ({
    status,
    mode: "closed",
    controlPoint: null,
    yearTitlePoint: null,
    monthTitlePoint: null,
    previousDecadePoint: null,
    nextDecadePoint: null,
    targetYearPoint: null,
    targetMonthPoint: null,
    targetDayPoint: null,
    year: 0,
    month: 0,
    yearRangeStart: 0,
    yearRangeEnd: 0,
    targetYearMatches: 0,
    targetMonthMatches: 0,
    targetDayMatches: 0,
    popupCount: 0,
    popupTop: 0,
    viewportHeight: window.innerHeight,
    calendarTargets: [],
    preparedScroll: false,
    ...overrides
  });

  const observed = document.querySelector(targetSelector);
  const semantic = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isBirthDateControl);
  const controls = isBirthDateControl(observed) ? [...new Set([observed, ...semantic])] : semantic;
  if (controls.length === 0) return response("control_missing");
  if (controls.length !== 1) return response("control_ambiguous");
  const control = controls[0]!;
  let preparedScroll = false;
  if (phase === "prepare_open") {
    const initial = control.getBoundingClientRect();
    const targetTop = Math.min(500, Math.max(420, window.innerHeight - 225));
    window.scrollTo({
      top: Math.max(0, window.scrollY + initial.top - targetTop),
      left: window.scrollX,
      behavior: "instant"
    });
    void control.getBoundingClientRect();
    preparedScroll = true;
  }
  const controlPoint = pointFor(control);
  if (!controlPoint) return response("control_not_clickable", { preparedScroll });
  const dropdown = control.closest<HTMLElement>(
    "[class*='Dropdown-container'],[class*='dropdown-container']"
  );
  const popups = [...(dropdown?.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  ) ?? [])].filter(visible);
  if (popups.length === 0) {
    return response("popup_closed", { controlPoint, preparedScroll });
  }
  if (popups.length !== 1) {
    return response("popup_ambiguous", { controlPoint, popupCount: popups.length, preparedScroll });
  }
  const popup = popups[0]!;
  const popupRect = popup.getBoundingClientRect();
  const yearTitle = popup.querySelector<HTMLElement>("[class*='selector-year']");
  const monthTitle = popup.querySelector<HTMLElement>("[class*='selector-month']");
  const yearText = String(yearTitle?.textContent || "");
  const monthText = String(monthTitle?.textContent || "");
  const year = Number(yearText.match(/[12][0-9]{3}/u)?.[0] || "");
  const monthNames: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
    七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12
  };
  const monthToken = [...monthText].filter((character) => character !== "月" && character.trim()).join("");
  const month = Number(monthText.match(/[0-9]{1,2}/u)?.[0] || monthNames[monthToken] || "");
  const leafText = (element: Element) => String(element.textContent || "").trim();
  const noSameTextVisibleChild = (element: Element) => ![...element.children]
    .some((child) => visible(child) && leafText(child) === leafText(element));
  const fadedOrDisabled = (element: Element): boolean => {
    for (let node: Element | null = element; node && node !== popup; node = node.parentElement) {
      if (/fade|disabled/iu.test(String((node as HTMLElement).className || ""))) return true;
    }
    return false;
  };
  const yearCells = [...popup.querySelectorAll<HTMLElement>("[class*='year-item'],td,span,div")]
    .filter(visible)
    .filter((candidate) => /^[12][0-9]{3}$/u.test(leafText(candidate)))
    .filter(noSameTextVisibleChild);
  const yearRange = [...yearText.matchAll(/[12][0-9]{3}/gu)].map((match) => Number(match[0]));
  const yearPanel = yearRange.length >= 2 && yearCells.length >= 10;
  const parseMonth = (value: string): number => {
    const normalized = value.trim().toLowerCase();
    const english: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    const englishToken = normalized.match(/[a-z]+/u)?.[0]?.slice(0, 3) || "";
    const chineseToken = [...normalized]
      .filter((character) => character !== "月" && character.trim()).join("");
    const numeric = Number(normalized.match(/[0-9]{1,2}/u)?.[0] || "");
    return english[englishToken] || monthNames[chineseToken] ||
      (numeric >= 1 && numeric <= 12 ? numeric : 0);
  };
  const monthCells = [...popup.querySelectorAll<HTMLElement>("td,span,div")]
    .filter(visible)
    .filter((candidate) => parseMonth(leafText(candidate)) > 0)
    .filter(noSameTextVisibleChild);
  const monthPanel = !monthTitle && new Set(monthCells.map((cell) => parseMonth(leafText(cell)))).size >= 10;
  const mode: MokaTap4funBirthDateProbe["mode"] = yearPanel ? "year" : monthPanel ? "month" : "day";
  const targetYears = mode === "year"
    ? yearCells.filter((cell) => !fadedOrDisabled(cell) && Number(leafText(cell)) === targetDate.year)
    : [];
  const targetMonths = mode === "month"
    ? monthCells.filter((cell) => !fadedOrDisabled(cell) && parseMonth(leafText(cell)) === targetDate.month)
    : [];
  const targetDays = mode === "day"
    ? [...popup.querySelectorAll<HTMLElement>("td")]
      .filter(visible)
      .filter((cell) => !fadedOrDisabled(cell))
      .map((cell) => cell.querySelector<HTMLElement>("[class*='date-item']") ?? cell)
      .filter((cell) => leafText(cell) === String(targetDate.day))
    : [];
  const doubleLeft = [...popup.querySelectorAll<HTMLElement>("[class*='icondoubleLeft']")].filter(visible);
  const doubleRight = [...popup.querySelectorAll<HTMLElement>("[class*='icondoubleRight']")].filter(visible);
  const stageTargets = [...new Set((mode === "day"
    ? [yearTitle, monthTitle, ...targetDays]
    : mode === "year"
      ? [...doubleLeft, ...doubleRight, ...targetYears]
      : [...targetMonths]
  ).filter((candidate): candidate is HTMLElement => visible(candidate)))];
  const fixedOverlays = [...document.querySelectorAll<HTMLElement>("body *")].filter((candidate) => {
    if (candidate === popup || popup.contains(candidate)) return false;
    const rect = candidate.getBoundingClientRect();
    const style = getComputedStyle(candidate);
    return (style.position === "fixed" || style.position === "sticky") &&
      rect.width > 0 && rect.height > 0 && rect.top <= 12 && rect.bottom > 0;
  });
  const calendarTargets = stageTargets.map((candidate): CalendarTargetGeometry => {
    const rect = candidate.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = x >= 0 && x < window.innerWidth && y >= 0 && y < window.innerHeight
      ? document.elementFromPoint(x, y)
      : null;
    const obstructionBottom = fixedOverlays.reduce((bottom, overlay) => {
      const overlayRect = overlay.getBoundingClientRect();
      return x >= overlayRect.left && x <= overlayRect.right
        ? Math.max(bottom, overlayRect.bottom)
        : bottom;
    }, 0);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      hitVerified: hit === candidate || candidate.contains(hit),
      obstructionBottom
    };
  });
  return response(mode, {
    mode,
    controlPoint,
    yearTitlePoint: mode === "day" ? pointFor(yearTitle) : null,
    monthTitlePoint: mode === "day" ? pointFor(monthTitle) : null,
    previousDecadePoint: mode === "year" && doubleLeft.length === 1 ? pointFor(doubleLeft[0]!) : null,
    nextDecadePoint: mode === "year" && doubleRight.length === 1 ? pointFor(doubleRight[0]!) : null,
    targetYearPoint: targetYears.length === 1 ? pointFor(targetYears[0]!) : null,
    targetMonthPoint: targetMonths.length === 1 ? pointFor(targetMonths[0]!) : null,
    targetDayPoint: targetDays.length === 1 ? pointFor(targetDays[0]!) : null,
    year,
    month,
    yearRangeStart: yearPanel ? Math.min(yearRange[0]!, yearRange[1]!) : 0,
    yearRangeEnd: yearPanel ? Math.max(yearRange[0]!, yearRange[1]!) : 0,
    targetYearMatches: targetYears.length,
    targetMonthMatches: targetMonths.length,
    targetDayMatches: targetDays.length,
    popupCount: 1,
    popupTop: popupRect.top,
    viewportHeight: window.innerHeight,
    calendarTargets,
    preparedScroll
  });
}

export function readMokaTap4funBirthDateInPage(
  targetSelector: string
): MokaTap4funBirthDateReadback {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const observed = document.querySelector(targetSelector);
  if (!(observed instanceof HTMLInputElement)) {
    return { actual: "", popupClosed: true, validationCleared: false };
  }
  const root = observed.closest<HTMLElement>(
    "[class*='apply-field'],[class*='form-item'],[class*='field']"
  ) ?? observed.parentElement;
  const dropdown = observed.closest<HTMLElement>(
    "[class*='Dropdown-container'],[class*='dropdown-container']"
  );
  const popupOpen = Boolean(dropdown && [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].some(visible));
  const invalid = observed.getAttribute("aria-invalid") === "true" || [...(root?.querySelectorAll<HTMLElement>(
    "[aria-invalid='true'],[class*='error'],[class*='Error'],[class*='invalid'],[class*='Invalid'],span,div,p"
  ) ?? [])].some((candidate) => visible(candidate) &&
    /必填项未填写|这是必填项|不能为空/u.test(String(candidate.textContent || "").trim()));
  return {
    actual: String(observed.value || observed.getAttribute("aria-valuetext") ||
      observed.getAttribute("data-value") || "").trim(),
    popupClosed: !popupOpen,
    validationCleared: !invalid
  };
}

export async function executeMokaTap4funBirthDateDriver(
  input: MokaTap4funBirthDateDriverInput
): Promise<MokaTap4funBirthDateDriverResult> {
  const ledger = emptyLedger();
  const diagnostics = (
    failureCode: MokaTap4funBirthDateFailureCode | null
  ): MokaTap4funBirthDateDriverDiagnostics => ({
    schemaVersion: "moka-tap4fun-birth-date-driver-diagnostic.v2",
    eventMechanism: "cdp_trusted_pointer_focus_emulation",
    failureCode,
    ledger: { ...ledger }
  });
  const emptyReadback: MokaTap4funBirthDateReadback = {
    actual: "",
    popupClosed: true,
    validationCleared: false
  };
  const failure = (
    stage: MokaTap4funBirthDateStage,
    code: MokaTap4funBirthDateFailureCode,
    detail: string,
    readback: MokaTap4funBirthDateReadback = emptyReadback
  ): MokaTap4funBirthDateDriverResult => ({
    success: false,
    stage,
    error: `${MOKA_TAP4FUN_BIRTH_DATE_INTERACTION_FAILED}: [${stage}/${code}] ${detail}`,
    diagnostics: diagnostics(code),
    ...readback
  });
  const success = (readback: MokaTap4funBirthDateReadback): MokaTap4funBirthDateDriverResult => ({
    success: true,
    stage: "readback",
    error: null,
    diagnostics: diagnostics(null),
    ...readback
  });
  const execute = async <T>(func: (...args: never[]) => T, args: unknown[]): Promise<T | null> => {
    const execution = await executeInterruptibleScript({
      target: { tabId: input.tabId },
      world: "MAIN",
      func,
      args
    });
    return execution[0]?.result ?? null;
  };
  const inspect = (phase: "observe" | "prepare_open" = "observe") => execute(
    inspectMokaTap4funBirthDateInPage as (...args: never[]) => MokaTap4funBirthDateProbe,
    [input.selector, input.dateValue, phase]
  );
  const readback = () => execute(
    readMokaTap4funBirthDateInPage as (...args: never[]) => MokaTap4funBirthDateReadback,
    [input.selector]
  );
  const accepted = (state: MokaTap4funBirthDateReadback | null) => Boolean(state &&
    structuredDateReadbackMatches(state.actual, input.dateValue, "day") &&
    state.popupClosed && state.validationCleared);
  const click = async (
    stage: MokaTap4funBirthDateStage,
    code: MokaTap4funBirthDateFailureCode,
    point: MokaTap4funBirthDatePoint | null,
    detail: string,
    counter: keyof Pick<MokaTap4funBirthDateActionLedger,
      "openClickCount" | "yearHeaderClickCount" | "decadeClickCount" | "yearClickCount" |
      "monthHeaderClickCount" | "monthClickCount" | "dayClickCount">
  ): Promise<MokaTap4funBirthDateDriverResult | null> => {
    if (!point) return failure(stage, code, detail);
    try {
      await input.clickPoint(point);
      ledger[counter] += 1;
      ledger.trustedPointerClickCount += 1;
      return null;
    } catch (error) {
      return failure(
        stage,
        "trusted_pointer_failed",
        `${detail}：${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  const waitFor = async (
    predicate: (state: MokaTap4funBirthDateProbe) => boolean,
    attempts = 18
  ): Promise<MokaTap4funBirthDateProbe | null> => {
    let latest: MokaTap4funBirthDateProbe | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await input.wait(attempt === 0 ? 160 : 120);
      latest = await inspect();
      if (latest && predicate(latest)) return latest;
    }
    return latest;
  };
  const ensureTargetsVisible = async (
    initialState: MokaTap4funBirthDateProbe
  ): Promise<MokaTap4funBirthDateProbe | null> => {
    let latest = initialState;
    for (let attempt = 0; attempt < CALENDAR_VISIBILITY_MAX_CORRECTIONS; attempt += 1) {
      const correction = calendarTargetVisibilityCorrection({
        viewportHeight: latest.viewportHeight,
        targets: latest.calendarTargets
      });
      if (correction.reason === "visible") return latest;
      if (correction.shiftY === 0) return null;
      const requestedStepY = calendarTargetVisibilityStep({
        correction,
        viewportHeight: latest.viewportHeight
      });
      if (requestedStepY === 0) return null;
      const moved = await input.shiftSurface(requestedStepY);
      if (Math.abs(moved) >= 1) ledger.positionScrollCount += 1;
      await input.wait(180);
      const next = await inspect();
      if (!next) return null;
      const progress = calendarTargetVisibilityProgress({
        before: correction,
        after: calendarTargetVisibilityCorrection({
          viewportHeight: next.viewportHeight,
          targets: next.calendarTargets
        }),
        requestedStepY,
        actualShiftY: moved
      });
      if (progress === "complete") return next;
      if (progress !== "progressing") return null;
      latest = next;
    }
    return null;
  };

  try {
    const initial = await readback();
    if (!initial) return failure("detect", "readback_unavailable", "出生日期控件初始回读不可用");
    if (accepted(initial)) return success(initial);
    if (initial.actual) {
      return failure("detect", "readback_mismatch", "出生日期控件已有不同值，专用 Driver 不覆盖", initial);
    }
    ledger.prepareSurfaceCount += 1;
    await input.prepareSurface();
    const prepared = await inspect("prepare_open");
    if (!prepared) return failure("prepare_open", "driver_interrupted", "出生日期定位没有返回结果");
    if (prepared.preparedScroll) ledger.positionScrollCount += 1;
    if (prepared.status === "control_missing") {
      return failure("prepare_open", "control_missing", "未找到 tap4fun 出生日期控件");
    }
    if (prepared.status === "control_ambiguous") {
      return failure("prepare_open", "control_ambiguous", "tap4fun 出生日期控件不唯一");
    }
    if (prepared.status !== "popup_closed" || !prepared.controlPoint) {
      return failure("prepare_open", "control_not_clickable", "出生日期控件无法在安全位置唯一命中");
    }
    let failed = await click(
      "open", "control_not_clickable", prepared.controlPoint,
      "无法用可信指针打开出生日期控件", "openClickCount"
    );
    if (failed) return failed;
    let state = await waitFor((candidate) => candidate.status === "day");
    if (!state || state.status !== "day") {
      return failure("open", state?.status === "popup_ambiguous" ? "popup_ambiguous" : "popup_missing",
        "可信指针打开后未出现唯一日历面板");
    }
    state = await ensureTargetsVisible(state);
    if (!state || state.status !== "day") {
      return failure("open", "popup_obstructed", "渐进校正后日历面板状态丢失或未收敛");
    }
    if (!state.yearTitlePoint || !state.monthTitlePoint) {
      return failure("open", "popup_obstructed", "日历年份或月份标题没有通过实时命中验证");
    }
    failed = await click(
      "year_panel", "year_header_missing", state.yearTitlePoint,
      "日历没有唯一可点击的年份标题", "yearHeaderClickCount"
    );
    if (failed) return failed;
    state = await waitFor((candidate) => candidate.status === "year");
    if (!state || state.status !== "year") {
      return failure("year_panel", "unexpected_panel", "点击年份标题后未进入年份面板");
    }
    state = await ensureTargetsVisible(state);
    if (!state || state.status !== "year") {
      return failure("year_panel", "popup_obstructed", "渐进校正后年份面板状态丢失或未收敛");
    }
    const decadeDelta = input.dateValue.year < state.yearRangeStart
      ? -Math.ceil((state.yearRangeStart - input.dateValue.year) / 10)
      : input.dateValue.year > state.yearRangeEnd
        ? Math.ceil((input.dateValue.year - state.yearRangeEnd) / 10)
        : 0;
    for (let step = 0; step < Math.abs(decadeDelta); step += 1) {
      const point = decadeDelta < 0 ? state.previousDecadePoint : state.nextDecadePoint;
      failed = await click(
        "year_panel", "decade_navigation_missing", point,
        "年份面板没有唯一可点击的十年导航按钮", "decadeClickCount"
      );
      if (failed) return failed;
      state = await waitFor((candidate) => candidate.status === "year" &&
        (candidate.yearRangeStart !== state?.yearRangeStart || candidate.yearRangeEnd !== state?.yearRangeEnd));
      if (!state || state.status !== "year") {
        return failure("year_panel", "unexpected_panel", "十年导航后年份面板状态丢失");
      }
      state = await ensureTargetsVisible(state);
      if (!state || state.status !== "year") {
        return failure("year_panel", "popup_obstructed", "渐进校正后年份面板状态丢失或未收敛");
      }
    }
    if (!state.targetYearPoint || state.targetYearMatches !== 1) {
      return failure(
        "year", "target_year_missing",
        `年份面板未找到唯一可点击的 ${input.dateValue.year} 年（命中 ${state.targetYearMatches} 个）`
      );
    }
    failed = await click(
      "year", "target_year_missing", state.targetYearPoint,
      `无法选择 ${input.dateValue.year} 年`, "yearClickCount"
    );
    if (failed) return failed;
    state = await waitFor((candidate) => candidate.status === "day" && candidate.year === input.dateValue.year);
    if (!state || state.status !== "day" || state.year !== input.dateValue.year) {
      return failure("year", "unexpected_panel", "选择目标年份后未返回对应日历面板");
    }
    state = await ensureTargetsVisible(state);
    if (!state || state.status !== "day") {
      return failure("month_panel", "popup_obstructed", "渐进校正后月份标题不可用");
    }
    failed = await click(
      "month_panel", "month_header_missing", state.monthTitlePoint,
      "日历没有唯一可点击的月份标题", "monthHeaderClickCount"
    );
    if (failed) return failed;
    state = await waitFor((candidate) => candidate.status === "month" && candidate.year === input.dateValue.year);
    if (!state || state.status !== "month") {
      return failure("month_panel", "unexpected_panel", "点击月份标题后未进入月份面板");
    }
    state = await ensureTargetsVisible(state);
    if (!state || state.status !== "month") {
      return failure("month_panel", "popup_obstructed", "渐进校正后月份面板状态丢失或未收敛");
    }
    if (!state.targetMonthPoint || state.targetMonthMatches !== 1) {
      return failure(
        "month", "target_month_missing",
        `月份面板未找到唯一可点击的 ${input.dateValue.month} 月（命中 ${state.targetMonthMatches} 个）`
      );
    }
    failed = await click(
      "month", "target_month_missing", state.targetMonthPoint,
      `无法选择 ${input.dateValue.month} 月`, "monthClickCount"
    );
    if (failed) return failed;
    state = await waitFor((candidate) => candidate.status === "day" &&
      candidate.year === input.dateValue.year && candidate.month === input.dateValue.month);
    if (!state || state.status !== "day" || state.year !== input.dateValue.year ||
      state.month !== input.dateValue.month) {
      return failure("month", "unexpected_panel", "选择目标月份后未返回对应日历面板");
    }
    state = await ensureTargetsVisible(state);
    if (!state || state.status !== "day") {
      return failure("day", "popup_obstructed", "渐进校正后日期面板状态丢失或未收敛");
    }
    if (!state.targetDayPoint || state.targetDayMatches !== 1) {
      return failure(
        "day", "target_day_missing",
        `日历未找到唯一可点击的当月 ${input.dateValue.day} 日（命中 ${state.targetDayMatches} 个）`
      );
    }
    failed = await click(
      "day", "target_day_missing", state.targetDayPoint,
      `无法选择 ${input.dateValue.day} 日`, "dayClickCount"
    );
    if (failed) return failed;
    let latest: MokaTap4funBirthDateReadback | null = initial;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await input.wait(attempt === 0 ? 180 : 150);
      ledger.readbackPollCount += 1;
      latest = await readback();
      if (!latest) return failure("readback", "readback_unavailable", "选择日期后站点回读不可用");
      if (accepted(latest)) return success(latest);
    }
    if (latest && structuredDateReadbackMatches(latest.actual, input.dateValue, "day") &&
      !latest.validationCleared) {
      return failure("readback", "validation_not_cleared", "日期回读正确但必填校验未清除", latest);
    }
    return failure("readback", "readback_mismatch", "可信选择后未形成完整 YYYY-MM-DD 回读", latest ?? initial);
  } catch (error) {
    return failure(
      "readback",
      "driver_interrupted",
      `tap4fun 出生日期 Driver 执行中断：${error instanceof Error ? error.message : String(error)}`
    );
  }
}
