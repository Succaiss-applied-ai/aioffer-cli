import { describe, expect, it } from "vitest";
import {
  calendarControlHasTemporalEvidence,
  calendarControlRequiresDayPrecision,
  calendarControlUsesMonthPrecision,
  canonicalStructuredDate,
  dateControlInteractionFailure,
  datePickerInputTargetTop,
  datePickerNavigationPlan,
  isDateControlInteractionFailure,
  mokaCalendarPanelStructureMatches,
  mokaPickerHeaderParserExpression,
  mokaPickerMonthParserExpression,
  structuredDateFromValue,
  structuredMonthDateFromValue,
  structuredDatePartReadbackMatches,
  structuredDateReadbackMatches,
  uniqueCurrentMonthDayIndex,
  yearRangeNavigationPlan
} from "./date-control-strategy.js";

describe("date control strategy", () => {
  it("requires a day only from an explicit control-owned date contract", () => {
    for (const placeholder of ["日期（年月日）", "YYYY/MM/DD", "YYYY-MM-DD", "年 / 月 / 日"]) {
      expect(calendarControlRequiresDayPrecision({ placeholder })).toBe(true);
    }
    expect(calendarControlRequiresDayPrecision({ type: "date" })).toBe(true);
    for (const placeholder of ["结束（YYYY/MM）", "出生日期", "毕业时间", "年", "月", "请选择"]) {
      expect(calendarControlRequiresDayPrecision({ placeholder })).toBe(false);
    }
    expect(calendarControlRequiresDayPrecision({ type: "month" })).toBe(false);
  });

  it("uses control-owned hints to distinguish YYYY-MM from day precision", () => {
    expect(calendarControlUsesMonthPrecision({ placeholder: "结束（YYYY/MM）" })).toBe(true);
    expect(calendarControlUsesMonthPrecision({ placeholder: "请选择年月" })).toBe(true);
    expect(calendarControlUsesMonthPrecision({ type: "month" })).toBe(true);
    expect(calendarControlUsesMonthPrecision({ temporalLayout: "year_month_range" })).toBe(true);
    expect(calendarControlUsesMonthPrecision({ placeholder: "请选择出生日期" })).toBe(false);
    expect(calendarControlUsesMonthPrecision({ placeholder: "YYYY/MM/DD" })).toBe(false);
    expect(calendarControlUsesMonthPrecision({ placeholder: "请选择年月日" })).toBe(false);
  });

  it("recognizes a Moka date structure without relying on a tenant-defined field name", () => {
    expect(calendarControlHasTemporalEvidence({
      type: "combobox",
      placeholder: "请选择",
      classNames: ["sd-Input-input", "day_info", "sd-Dropdown-container-1CigZ"]
    })).toBe(true);
  });

  it("does not classify an unrelated readonly dropdown as a date", () => {
    expect(calendarControlHasTemporalEvidence({
      type: "combobox",
      placeholder: "请选择",
      classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container-1CigZ"]
    })).toBe(false);
  });

  it("admits only a complete unique panel structure for the generic Moka route", () => {
    const dayPanel = {
      mode: "day" as const,
      popupCount: 1,
      year: 2026,
      month: 9,
      yearRangeStart: 0,
      yearRangeEnd: 0,
      yearTitleMatches: 1,
      monthTitleMatches: 1,
      navigationMatches: 4,
      yearOptionMatches: 0,
      monthOptionMatches: 0,
      dayOptionMatches: 31
    };
    expect(mokaCalendarPanelStructureMatches(dayPanel)).toBe(true);
    expect(mokaCalendarPanelStructureMatches({ ...dayPanel, popupCount: 2 })).toBe(false);
    expect(mokaCalendarPanelStructureMatches({ ...dayPanel, dayOptionMatches: 3 })).toBe(false);
    expect(mokaCalendarPanelStructureMatches({
      ...dayPanel,
      mode: "month",
      month: 0,
      monthTitleMatches: 0,
      navigationMatches: 2,
      monthOptionMatches: 12,
      dayOptionMatches: 0
    })).toBe(true);
    expect(mokaCalendarPanelStructureMatches({
      ...dayPanel,
      mode: "year",
      year: 0,
      month: 0,
      yearRangeStart: 2020,
      yearRangeEnd: 2029,
      yearTitleMatches: 0,
      monthTitleMatches: 0,
      navigationMatches: 2,
      yearOptionMatches: 10,
      dayOptionMatches: 0
    })).toBe(true);
  });

  it("parses only complete valid calendar dates", () => {
    expect(structuredDateFromValue("2025-02-28")).toEqual({ year: 2025, month: 2, day: 28 });
    expect(structuredDateFromValue("2025年2月28日")).toEqual({ year: 2025, month: 2, day: 28 });
    expect(structuredDateFromValue("2025-02")).toBeNull();
    expect(structuredDateFromValue("2025-02-29")).toBeNull();
    expect(canonicalStructuredDate({ year: 2024, month: 2, day: 29 })).toBe("2024-02-29");
  });

  it("normalizes ATS month periods without broadening complete calendar dates", () => {
    expect(structuredMonthDateFromValue("2025-02")).toEqual({ year: 2025, month: 2, day: 1 });
    expect(structuredMonthDateFromValue("2025年2月")).toEqual({ year: 2025, month: 2, day: 1 });
    expect(structuredMonthDateFromValue("2025-13")).toBeNull();
    expect(structuredDateFromValue("2025-02")).toBeNull();
  });

  it("navigates year first and then month", () => {
    expect(datePickerNavigationPlan(
      { year: 2026, month: 8 },
      { year: 2025, month: 2 }
    )).toEqual({
      yearDirection: "previous",
      yearSteps: 1,
      monthDirection: "previous",
      monthSteps: 6
    });
  });

  it("navigates Moka's year panel by decade ranges", () => {
    expect(yearRangeNavigationPlan(1990, 1999, 2000)).toEqual({ direction: "next", steps: 1 });
    expect(yearRangeNavigationPlan(2000, 2009, 1985)).toEqual({ direction: "previous", steps: 2 });
    expect(yearRangeNavigationPlan(2000, 2009, 2006)).toEqual({ direction: null, steps: 0 });
  });

  it("keeps Moka year and month parsing intact after Runtime.evaluate source serialization", () => {
    const parse = Function(`return (${mokaPickerHeaderParserExpression()})`)() as (
      yearText: string,
      monthText: string
    ) => { year: number; month: number };

    expect(parse("2026 年", "八月")).toEqual({ year: 2026, month: 8 });
    expect(parse("2026", "06 月")).toEqual({ year: 2026, month: 6 });
    expect(mokaPickerHeaderParserExpression()).not.toMatch(/\\[ds]/u);
  });

  it("parses Moka month-panel labels in English, Chinese and numeric forms", () => {
    const parseMonth = Function(`return (${mokaPickerMonthParserExpression()})`)() as (
      monthText: string
    ) => number;

    expect(parseMonth("Mar")).toBe(3);
    expect(parseMonth("March")).toBe(3);
    expect(parseMonth("三月")).toBe(3);
    expect(parseMonth("03 月")).toBe(3);
    expect(parseMonth("not a month")).toBe(0);
  });

  it("normalizes date picker readback before comparison", () => {
    expect(structuredDateReadbackMatches("2025/2/28", { year: 2025, month: 2, day: 28 })).toBe(true);
    expect(structuredDateReadbackMatches("2025年2月28日", { year: 2025, month: 2, day: 28 })).toBe(true);
    expect(structuredDateReadbackMatches("2025-02-28T09:30", { year: 2025, month: 2, day: 28 })).toBe(true);
    expect(structuredDateReadbackMatches("2025-02-27", { year: 2025, month: 2, day: 28 })).toBe(false);
    expect(structuredDateReadbackMatches("2025-02", { year: 2025, month: 2, day: 28 })).toBe(false);
    expect(structuredDateReadbackMatches(
      "2000-03 (26岁 / Years old)",
      { year: 2000, month: 3, day: 18 },
      "month"
    )).toBe(true);
    expect(structuredDateReadbackMatches(
      "2000-04 (26岁 / Years old)",
      { year: 2000, month: 3, day: 18 },
      "month"
    )).toBe(false);
  });

  it("compares split year, month and day controls as bounded components", () => {
    expect(structuredDatePartReadbackMatches("2025年", "2025", "year")).toBe(true);
    expect(structuredDatePartReadbackMatches("09月", "9", "month")).toBe(true);
    expect(structuredDatePartReadbackMatches("18日", "18", "day")).toBe(true);
    expect(structuredDatePartReadbackMatches("10月", "1", "month")).toBe(false);
    expect(structuredDatePartReadbackMatches("13月", "13", "month")).toBe(false);
    expect(structuredDatePartReadbackMatches("32日", "32", "day")).toBe(false);
  });

  it("marks calendar interaction failures so callers can fail closed", () => {
    const error = dateControlInteractionFailure("未能打开或识别日历弹层");
    expect(error).toBe("date_control_interaction_failed: 未能打开或识别日历弹层");
    expect(isDateControlInteractionFailure(error)).toBe(true);
    expect(isDateControlInteractionFailure("可信键盘输入后即时回读不一致")).toBe(false);
  });

  it("positions Moka's input so an upward calendar keeps its header in the viewport", () => {
    expect(datePickerInputTargetTop(709)).toBe(400);
    expect(datePickerInputTargetTop(653)).toBe(393);
    expect(datePickerInputTargetTop(500)).toBe(350);
    expect(datePickerInputTargetTop(Number.NaN)).toBe(380);
  });

  it("selects only one current-month day and rejects faded duplicate dates", () => {
    expect(uniqueCurrentMonthDayIndex([
      { text: "28", className: "sd-basic-item-wrapper sd-basic-fade" },
      { text: "28", className: "sd-basic-item-wrapper" }
    ], 28)).toBe(1);
    expect(uniqueCurrentMonthDayIndex([
      { text: "28", className: "sd-basic-item-wrapper" },
      { text: "28", className: "sd-basic-item-wrapper" }
    ], 28)).toBeNull();
  });
});
