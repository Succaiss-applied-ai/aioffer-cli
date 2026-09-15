import { describe, expect, it } from "vitest";
import type { FillInstruction, PageFieldObservation, PageObservation } from "../page-adapter.js";
import { bindObservedInstruction } from "./field-routing.js";

const field = (stableFieldKey: string, label: string): PageFieldObservation => ({
  fieldId: label, stableFieldKey, label, selector: `#${label}`, type: "combobox",
  required: true, options: [], currentValue: ""
});
const plan: FillInstruction = { fieldId: "old", selector: "#old", type: "combobox", value: "生产类",
  stableFieldKey: "work.title.combobox", expectedLabel: "第二期望岗位" };
const page = (...fields: PageFieldObservation[]) => ({ fields } as PageObservation);

describe("live field identity across conditional semantic collisions", () => {
  it.each([0, 1])("binds the exact caption after a new field changes the collision ordinal to %s", index => {
    const target = field(`work.title.combobox#${index}`, "第二期望岗位");
    expect(bindObservedInstruction(page(field(`work.title.combobox#${1 - index}`, "生产类岗位"), target), plan)).toBe(target);
  });
  it("retains binding when a conditional peer disappears", () => {
    const target = field("work.title.combobox", "第二期望岗位");
    expect(bindObservedInstruction(page(target), { ...plan, stableFieldKey: "work.title.combobox#1" })).toBe(target);
  });
  it("requires an exact caption when the live observation introduces a collision", () => {
    expect(bindObservedInstruction(page(field("work.title.combobox#0", "第二期望岗位")),
      { ...plan, expectedLabel: undefined })).toBeNull();
  });
  it("rejects indistinguishable captions instead of trusting an ordinal or selector", () => {
    expect(bindObservedInstruction(page(field("work.title.combobox#0", "第二期望岗位"),
      field("work.title.combobox#1", "第二期望岗位")), plan)).toBeNull();
  });
  it.each([
    ["work.title.combobox#0", "生产类岗位"],
    ["work[1].title.combobox#0", "第二期望岗位"],
    ["education.title.combobox#0", "第二期望岗位"],
    ["work.title.native#0", "第二期望岗位"]
  ])("does not cross caption, repeat row, section or control type: %s / %s", (key, label) => {
    expect(bindObservedInstruction(page(field(key, label)), plan)).toBeNull();
  });
  it("leaves noncolliding exact-key matching unchanged", () => {
    const target = field("work.title.combobox", "第二期望岗位");
    expect(bindObservedInstruction(page(target), { ...plan, expectedLabel: undefined })).toBe(target);
  });
});
