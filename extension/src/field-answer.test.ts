import { describe, expect, it } from "vitest";
import { localizeFieldAnswer } from "./field-answer.js";

describe("ATS field answer localization", () => {
  it("converts resume degree enums to Chinese ATS labels", () => {
    expect(localizeFieldAnswer(
      { label: "学历", type: "combobox", options: [] },
      "education.degree",
      "bachelor"
    )).toBe("本科");
    expect(localizeFieldAnswer(
      { label: "教育经历 · 学历", type: "combobox", options: [] },
      "education[0].degree",
      "bachelor"
    )).toBe("本科");
  });

  it("returns the exact site option when options are known", () => {
    expect(localizeFieldAnswer(
      { label: "最高学历", type: "select", options: ["大专", "本科学士", "硕士研究生"] },
      "education.degree",
      "master"
    )).toBe("硕士研究生");
    expect(localizeFieldAnswer(
      { label: "最高学历", type: "combobox", options: ["大专", "本科", "硕士"] },
      "candidate.basic.highestDegree",
      "bachelor"
    )).toBe("本科");
  });

  it("normalizes city suffixes without altering ordinary text fields", () => {
    expect(localizeFieldAnswer(
      { label: "意向城市", type: "combobox", options: ["深圳", "广州"] },
      "basic.currentCity",
      "深圳市"
    )).toBe("深圳");
    expect(localizeFieldAnswer(
      { label: "姓名", type: "text", options: [] },
      "basic.fullName",
      "林测试"
    )).toBe("林测试");
  });

  it("removes parser boundary characters from structured project names", () => {
    expect(localizeFieldAnswer(
      { label: "项目经历 · 项目名称", type: "text", options: [] },
      "project[1].name",
      "高并发订单服务改造|"
    )).toBe("高并发订单服务改造");
  });
});
