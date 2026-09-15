// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, fillApplicationPage, type FillInstruction, type PageFieldObservation } from "./page-adapter.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { dispatchControlInstruction } from "./control-adapters/field-routing.js";
import { authoritativeCandidateFactForField, candidateInformationRequestsForMissingFields } from "./vision-form-runtime.js";

const url = "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/test/apply";
function production(dependencies: Record<string, unknown>) {
  return (tabId, page, field, instruction) => dispatchControlInstruction(page, instruction, {
    "generic.native.v1": async (_field, next) => (await dependencies.executeApplicationFillInstructions(tabId, page, [next]))[0]
  });
}
function installFields() {
  document.body.innerHTML = `<main><form><section><h2>个人信息</h2>
    <div class="form-item"><label for="grad-date">毕业时间（年月） *</label><input id="grad-date" placeholder="毕业时间（年月）" required></div>
    <div class="form-item"><label for="grad-school">毕业院校 *</label><input id="grad-school" placeholder="毕业院校" required></div>
    </section><button type="button">预览并提交</button></form></main>`;
}
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 24, y: 24,
    left: 24, top: 24, right: 204, bottom: 56, width: 180, height: 32, toJSON() {} });
  vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/["\\]/g, "\\$&") });
  installFields();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const instruction = (field: PageFieldObservation): FillInstruction => ({
  fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, selector: field.selector,
  expectedLabel: field.label, type: field.type, value: "2027-06", semanticKey: "education[0].endDate",
  dateValue: { year: 2027, month: 6, day: 1 }, datePrecision: "month"
});

describe("native date-answer fields use text execution", () => {
  it("resolves the personal-section graduation summary from its first education end date", () => {
    const page = observeApplicationPage();
    const date = page.fields.find(field => field.selector === "#grad-date")!;
    const school = page.fields.find(field => field.selector === "#grad-school")!;
    const facts = { "resume.education.0.endDate": "2027-06", "resume.education.0.school": "测试大学" };
    expect(date.label).toContain("毕业时间（年月）");
    expect(date.stableFieldKey).toBe("basic.graduation_date.native");
    expect(date.sectionKey).toBe("basic");
    expect(authoritativeCandidateFactForField(date, facts)).toEqual({ key: "resume.education.0.endDate", value: "2027-06" });
    expect(authoritativeCandidateFactForField(school, facts)).toEqual({ key: "resume.education.0.school", value: "测试大学" });
    expect(candidateInformationRequestsForMissingFields([date, school], facts)).toEqual([]);
    const unrelated = { ...date, label: "合同结束时间", stableFieldKey: "basic.end_date.native", sectionKey: "basic" };
    expect(authoritativeCandidateFactForField(unrelated, facts)).toBeNull();
    const thirdParty = { ...date, label: "紧急联系人毕业时间" };
    expect(authoritativeCandidateFactForField(thirdParty, facts)).toBeNull();
  });

  it("keeps graduation month and graduation school distinct, then rebinds and fills only the month input", async () => {
    const page = observeApplicationPage();
    const date = page.fields.find(field => field.selector === "#grad-date")!;
    const school = page.fields.find(field => field.selector === "#grad-school")!;
    expect(date.label).toContain("毕业时间");
    expect(date.stableFieldKey).toContain("graduation_date.native");
    expect(school.label).toContain("毕业院校");
    expect(school.stableFieldKey).toContain("school.native");
    expect(date.stableFieldKey).not.toMatch(/#\d+$/);
    const textInstruction = { ...instruction(date), dateValue: undefined, datePrecision: undefined };
    expect(await fillApplicationPage([textInstruction])).toMatchObject([{ success: true, actual: "2027-06" }]);
    expect(document.querySelector<HTMLInputElement>("#grad-school")!.value).toBe("");
    expect(observeApplicationPage().fields.find(field => field.selector === "#grad-date")?.stableFieldKey).toBe(date.stableFieldKey);
  });

  it.each([url, "https://unrelated.example/apply"])("chooses native text before any calendar Driver at %s", async applicationUrl => {
    vi.stubGlobal("location", new URL(applicationUrl));
    const page = { ...observeApplicationPage(), url: applicationUrl };
    const date = page.fields.find(field => field.selector === "#grad-date")!;
    const nativeFill = vi.fn(async (_tab, _page, instructions) => fillApplicationPage(instructions));
    const wrongDriver = vi.fn(() => { throw new Error("unexpected specialized Driver"); });
    const run = production({ guardFieldInformation: () => null, resolveControlAdapter,
      executeApplicationFillInstructions: nativeFill,
      executeMokaYearMonthSelectInstructionWithTrustedPointerDriver: wrongDriver,
      executeMokaDateInstructionWithTrustedPointerDriver: wrongDriver,
      executeMokaNativePlaceInstructionWithTrustedPointerDriver: wrongDriver });
    const result = await run(7, page, date, instruction(date));
    expect(result).toMatchObject({ success: true, actual: "2027-06", controlAdapter: {
      registrationId: "generic.native.text.v1", driver: "generic_native" } });
    expect(nativeFill).toHaveBeenCalledOnce();
    expect(nativeFill.mock.calls[0][2][0].dateValue).toBeUndefined();
    expect(wrongDriver).not.toHaveBeenCalled();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(["combobox", "readonly-calendar"])("does not write a date string into a %s input", async kind => {
    const field = observeApplicationPage().fields.find(field => field.selector === "#grad-date")!;
    const custom = { ...field, controlKind: kind === "combobox" ? "combobox" : "native",
      type: kind === "combobox" ? "combobox" : "text",
      domHints: { ...field.domHints, readOnly: kind !== "combobox" } };
    const nativeFill = vi.fn();
    const specialized = vi.fn(async () => ({ success: false, error: "registered_driver_failure" }));
    const run = production({ guardFieldInformation: () => null, resolveControlAdapter,
      executeApplicationFillInstructions: nativeFill,
      executeMokaYearMonthSelectInstructionWithTrustedPointerDriver: specialized });
    expect(await run(7, { url, pageStage: "application_form", fields: [custom] }, custom, instruction(custom)))
      .toMatchObject({ success: false, driverFailureCode: "unsupported_required_control" });
    expect(nativeFill).not.toHaveBeenCalled();
    expect(specialized).not.toHaveBeenCalled();
  });
});
