import { describe, expect, it } from "vitest";
import { isGarenaZeroYearMonthPanel } from "./moka-calendar-opening.js";

const input = {
  applicationUrl: "https://app.mokahr.com/campus-recruitment/garena/148076#/job/control-fixture/apply",
  label: "出生日期 (年龄)", classNames: ["sd-Input-input", "sd-Input-container day_info", "sd-Dropdown-container"],
  readOnly: true, datePrecision: "month", currentValue: "2003-08 (23岁)",
  state: {mode: "month", year: 0, yearHeaderText: "0年", popupCount: 1,
    yearTitleMatches: 1, monthTitleMatches: 0, navigationMatches: 2,
    monthOptionMatches: 12, monthCellMatches: 12, dayOptionMatches: 0}
};

describe("Moka populated zero-year month-panel recovery admission", () => {
  it("admits only the evidenced populated birthday month panel", () => {
    expect(isGarenaZeroYearMonthPanel(input)).toBe(true);
  });
  it.each([
    {applicationUrl: input.applicationUrl.replace("app.mokahr.com", "unrelated.example")},
    {applicationUrl: input.applicationUrl.replace("campus-recruitment", "unrelated")},
    {applicationUrl: input.applicationUrl.replace("/apply", "")},
    {label: "毕业时间"}, {classNames: ["sd-Input-container"]}, {readOnly:false},
    {datePrecision:"day"}, {currentValue:""}
  ])("rejects unrelated or insufficient field identity: %j", (override) => {
    expect(isGarenaZeroYearMonthPanel({...input,...override})).toBe(false);
  });
  it.each([
    input.applicationUrl.replace("garena/148076", "cti/142093"),
    input.applicationUrl.replace("garena", "other"),
    input.applicationUrl.replace("148076", "148077"),
    input.applicationUrl.replace("campus-recruitment", "social-recruitment")
  ])("admits the same evidenced zero-year structure independently of tenant: %s", applicationUrl=>{
    expect(isGarenaZeroYearMonthPanel({...input,applicationUrl})).toBe(true);
  });
  it.each([
    {yearHeaderText:""}, {yearHeaderText:"0"}, {yearHeaderText:"1900年"}, {year:1900},
    {mode:"day"}, {mode:"year"}, {popupCount:2}, {yearTitleMatches:2},
    {monthTitleMatches:1}, {navigationMatches:3}, {monthOptionMatches:11},
    {monthCellMatches:13}, {dayOptionMatches:1}
  ])("never treats an unreadable/incomplete/ambiguous panel as the known zero-year state: %j", (override) => {
    expect(isGarenaZeroYearMonthPanel({...input,state:{...input.state,...override}})).toBe(false);
  });
});
