import { describe, expect, it } from "vitest";
import { observedFieldHasValue, requiredFieldFailures } from "./form-validation.js";

describe("rendered form validation", () => {
  it("treats an unchecked required checkbox as missing", () => {
    const field = {
      fieldId: "consent",
      label: "确认声明 *",
      type: "checkbox",
      required: true,
      currentValue: "false"
    };
    expect(observedFieldHasValue(field)).toBe(false);
    expect(requiredFieldFailures([field])).toEqual([field]);
  });

  it("accepts checked controls and non-empty text", () => {
    expect(requiredFieldFailures([
      { fieldId: "consent", label: "确认声明", type: "checkbox", required: true, currentValue: "true" },
      { fieldId: "name", label: "姓名", type: "text", required: true, currentValue: "林测试" }
    ])).toEqual([]);
  });

  it("treats ATS placeholder displays as missing values", () => {
    const placeholders = ["-", "—", "请选择", "请输入", "年", "月", "年 月 - 年 月"];
    for (const currentValue of placeholders) {
      const field = { fieldId: currentValue, label: "教育背景 · 就读时间", type: "text", required: true, currentValue };
      expect(observedFieldHasValue(field)).toBe(false);
      expect(requiredFieldFailures([field])).toEqual([field]);
    }
  });
});
