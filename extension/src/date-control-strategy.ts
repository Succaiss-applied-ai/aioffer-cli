export interface StructuredDateValue {
  year: number;
  month: number;
  day: number;
}

export type StructuredDatePrecision = "day" | "month";
export type StructuredDatePart = "year" | "month" | "day";

export interface DatePickerNavigationPlan {
  yearDirection: "previous" | "next" | null;
  yearSteps: number;
  monthDirection: "previous" | "next" | null;
  monthSteps: number;
}

export interface YearRangeNavigationPlan {
  direction: "previous" | "next" | null;
  steps: number;
}

export interface MokaCalendarPanelStructure {
  mode: "day" | "month" | "year";
  popupCount: number;
  year: number;
  month: number;
  yearRangeStart: number;
  yearRangeEnd: number;
  yearTitleMatches: number;
  monthTitleMatches: number;
  navigationMatches: number;
  yearOptionMatches: number;
  monthOptionMatches: number;
  dayOptionMatches: number;
}

export const DATE_CONTROL_INTERACTION_FAILED = "date_control_interaction_failed";

/** A field label is not precision evidence; use the control's own contract. */
export function calendarControlRequiresDayPrecision(input: {
  type?: string | null;
  placeholder?: string | null;
}): boolean {
  const placeholder = String(input.placeholder ?? "").normalize("NFKC").toUpperCase();
  return String(input.type ?? "").toLowerCase() === "date" ||
    /(?:YYYY|YY)[^D日]{0,4}(?:MM|月)[^D日]{0,4}(?:DD|日)|年[^日]{0,4}月[^日]{0,4}日/u.test(placeholder);
}

/**
 * Control-owned evidence for a month-only value. Labels such as “结束时间”
 * are intentionally insufficient because different ATS tenants render those
 * semantics as either YYYY-MM or YYYY-MM-DD controls.
 */
export function calendarControlUsesMonthPrecision(input: {
  type?: string | null;
  temporalLayout?: string | null;
  placeholder?: string | null;
}): boolean {
  const placeholder = String(input.placeholder ?? "").normalize("NFKC").toUpperCase();
  return String(input.type ?? "").toLowerCase() === "month" ||
    input.temporalLayout === "year_month" || input.temporalLayout === "year_month_range" ||
    /(?:YYYY|YY)[^D\u65e5]{0,4}(?:MM|\u6708)(?![^D\u65e5]{0,4}(?:DD|\u65e5))/u.test(placeholder) ||
    /\u5e74[^\u65e5]{0,4}\u6708(?![^\u65e5]{0,4}\u65e5)/u.test(placeholder);
}

/**
 * Structural date evidence available during form planning, before a Driver
 * opens the popup. Moka tenant labels are customer-defined, so labels are not
 * required when the readonly dropdown/date wrapper structure is present.
 */
export function calendarControlHasTemporalEvidence(input: {
  type?: string | null;
  temporalLayout?: string | null;
  placeholder?: string | null;
  classNames?: readonly string[] | null;
}): boolean {
  const type = String(input.type ?? "").toLowerCase();
  const placeholder = String(input.placeholder ?? "").normalize("NFKC");
  const classSignature = (input.classNames ?? []).join(" ");
  return ["date", "month", "datetime-local", "custom_date_picker"].includes(type) ||
    Boolean(input.temporalLayout) ||
    calendarControlUsesMonthPrecision(input) ||
    /(?:YYYY|YY)[^D\u65e5]{0,4}(?:MM|\u6708)[^D\u65e5]{0,4}(?:DD|\u65e5)|\u5e74[^\u65e5]{0,4}\u6708[^\u65e5]{0,4}\u65e5/iu.test(placeholder) ||
    /Dropdown-container|dropdown-container/u.test(classSignature) &&
      /(?:^|\s|-)day_info(?:\s|-|$)|picker-addon/iu.test(classSignature);
}

/**
 * Second-stage admission for the generic Moka calendar route. Known tenant
 * Drivers already own their field contract; the generic route must prove that
 * the safely opened popup is one recognizable calendar panel before it can
 * navigate or select any value.
 */
export function mokaCalendarPanelStructureMatches(
  panel: MokaCalendarPanelStructure | null
): boolean {
  if (!panel) return false;
  if (panel.popupCount !== 1) return false;
  if (panel.mode === "day") {
    return panel.year >= 1000 && panel.year <= 9999 &&
      panel.month >= 1 && panel.month <= 12 &&
      panel.yearTitleMatches === 1 && panel.monthTitleMatches === 1 &&
      panel.navigationMatches >= 2 && panel.dayOptionMatches >= 20;
  }
  if (panel.mode === "month") {
    return panel.year >= 1000 && panel.year <= 9999 &&
      panel.yearTitleMatches === 1 && panel.monthOptionMatches >= 10;
  }
  return panel.yearRangeStart >= 1000 && panel.yearRangeEnd >= panel.yearRangeStart &&
    panel.yearOptionMatches >= 8 && panel.navigationMatches >= 1;
}

export function mokaPickerHeaderParserExpression(): string {
  // This source is embedded in a Runtime.evaluate template. Avoid backslash
  // regex escapes here: `\d` and `\s` are cooked by the outer template and
  // silently become `d` and `s` in the packaged extension.
  return `(yearText, monthText) => {
    const monthNames = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12};
    const year = Number(String(yearText || '').match(/[12][0-9]{3}/)?.[0] || '');
    const monthToken = [...String(monthText || '')]
      .filter((character) => character !== '月' && character.trim())
      .join('');
    const month = Number(String(monthText || '').match(/[0-9]{1,2}/)?.[0] || monthNames[monthToken] || '');
    return {year, month};
  }`;
}

export function mokaPickerMonthParserExpression(): string {
  return `(monthText) => {
    const normalized = String(monthText || '').trim().toLowerCase();
    const english = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const chinese = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12};
    const englishToken = normalized.match(/[a-z]+/)?.[0]?.slice(0, 3) || '';
    if (english[englishToken]) return english[englishToken];
    const chineseToken = [...normalized]
      .filter((character) => character !== '月' && character.trim())
      .join('');
    if (chinese[chineseToken]) return chinese[chineseToken];
    const numeric = Number(normalized.match(/[0-9]{1,2}/)?.[0] || '');
    return numeric >= 1 && numeric <= 12 ? numeric : 0;
  }`;
}

export function datePickerInputTargetTop(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 380;
  // The real Moka page places this 334px calendar above the input even when
  // there is room below it. Keep the input low enough that the four header
  // navigation controls remain inside the viewport and can pass hit testing.
  return Math.max(350, Math.min(400, viewportHeight - 260));
}

export function dateControlInteractionFailure(message: string): string {
  const detail = message.trim() || "日期控件交互失败";
  return `${DATE_CONTROL_INTERACTION_FAILED}: ${detail}`;
}

export function isDateControlInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${DATE_CONTROL_INTERACTION_FAILED}:`);
}

export function canonicalStructuredDate(value: StructuredDateValue): string | null {
  const { year, month, day } = value;
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day) ||
    year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function structuredDateFromValue(value: unknown): StructuredDateValue | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    const structured = { year: Number(item.year), month: Number(item.month), day: Number(item.day) };
    return canonicalStructuredDate(structured) ? structured : null;
  }
  const match = String(value ?? "").trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/u);
  if (!match) return null;
  const structured = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return canonicalStructuredDate(structured) ? structured : null;
}

/**
 * Month-only ATS controls still travel through FillInstruction.dateValue so
 * they can share the registered date-driver routing. The synthetic first day
 * is never written to the page; month-period drivers consume only year/month
 * and read back with month precision.
 */
export function structuredMonthDateFromValue(value: unknown): StructuredDateValue | null {
  const complete = structuredDateFromValue(value);
  if (complete) return complete;
  const match = String(value ?? "").trim().match(/^(\d{4})[-/.年](\d{1,2})月?$/u);
  if (!match) return null;
  const structured = { year: Number(match[1]), month: Number(match[2]), day: 1 };
  return canonicalStructuredDate(structured) ? structured : null;
}

export function datePickerNavigationPlan(
  current: Pick<StructuredDateValue, "year" | "month">,
  target: Pick<StructuredDateValue, "year" | "month">
): DatePickerNavigationPlan {
  const yearDelta = target.year - current.year;
  const monthDelta = target.month - current.month;
  return {
    yearDirection: yearDelta === 0 ? null : yearDelta < 0 ? "previous" : "next",
    yearSteps: Math.abs(yearDelta),
    monthDirection: monthDelta === 0 ? null : monthDelta < 0 ? "previous" : "next",
    monthSteps: Math.abs(monthDelta)
  };
}

export function yearRangeNavigationPlan(
  rangeStart: number,
  rangeEnd: number,
  targetYear: number
): YearRangeNavigationPlan {
  if (![rangeStart, rangeEnd, targetYear].every(Number.isSafeInteger) || rangeEnd < rangeStart) {
    return { direction: null, steps: 0 };
  }
  if (targetYear < rangeStart) {
    return { direction: "previous", steps: Math.ceil((rangeStart - targetYear) / 10) };
  }
  if (targetYear > rangeEnd) {
    return { direction: "next", steps: Math.ceil((targetYear - rangeEnd) / 10) };
  }
  return { direction: null, steps: 0 };
}

export function structuredDateReadbackMatches(
  actual: unknown,
  expected: StructuredDateValue,
  precision: StructuredDatePrecision = "day"
): boolean {
  if (precision === "month") {
    const match = String(actual ?? "").trim().match(/(?:^|[^0-9])((?:19|20)\d{2})[-/.年](\d{1,2})(?:月)?(?:$|[^0-9])/u);
    if (!match) return false;
    return Number(match[1]) === expected.year && Number(match[2]) === expected.month;
  }
  // Readback is a rendered control value rather than package input. Native
  // datetime-local controls and ATS display labels can append a time, age, or
  // other presentation text after the complete date. Extract one bounded date
  // token, but never lower a day-precision comparison to year/month.
  const match = String(actual ?? "").trim().match(
    /(?:^|[^0-9])((?:19|20)\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:$|[^0-9])/u
  );
  const parsed = match
    ? structuredDateFromValue(`${match[1]}-${match[2]}-${match[3]}`)
    : null;
  return Boolean(parsed && parsed.year === expected.year && parsed.month === expected.month && parsed.day === expected.day);
}

/** Compare one split year/month/day control as a bounded numeric component. */
export function structuredDatePartReadbackMatches(
  actual: unknown,
  expected: unknown,
  part: StructuredDatePart
): boolean {
  const suffix = part === "year" ? "年" : part === "month" ? "月" : "日";
  const parse = (value: unknown): number | null => {
    const normalized = String(value ?? "").normalize("NFKC").trim();
    const pattern = part === "year"
      ? /^(\d{4})(?:年)?$/u
      : new RegExp(`^(\\d{1,2})(?:${suffix})?$`, "u");
    const match = normalized.match(pattern);
    if (!match) return null;
    const numeric = Number(match[1]);
    const valid = part === "year"
      ? numeric >= 1000 && numeric <= 9999
      : part === "month"
        ? numeric >= 1 && numeric <= 12
        : numeric >= 1 && numeric <= 31;
    return valid ? numeric : null;
  };
  const left = parse(actual);
  const right = parse(expected);
  return left !== null && right !== null && left === right;
}

export function uniqueCurrentMonthDayIndex(
  cells: ReadonlyArray<{ text: string; className: string }>,
  targetDay: number
): number | null {
  if (!Number.isSafeInteger(targetDay) || targetDay < 1 || targetDay > 31) return null;
  const matches = cells.flatMap((cell, index) =>
    !/fade/iu.test(cell.className) && cell.text.trim() === String(targetDay) ? [index] : []
  );
  return matches.length === 1 ? matches[0] : null;
}
