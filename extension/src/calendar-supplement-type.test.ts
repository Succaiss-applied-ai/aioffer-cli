// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, type PageFieldObservation } from "./page-adapter.js";
import { withFieldInformationRequirements } from "./field-information.js";
import { candidateInformationRequestForField, siteRejectedInformationRequests } from "./vision-form-runtime.js";
import { evidenceForField } from "./control-adapters/field-routing.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { autoApplyJobResultSchema } from "../../src/gateway/auto-apply-contract.js";

const lingshi = "https://app.mokahr.com/campus-recruitment/lingshi/144566#/job/c9161150-1c5d-4e86-a33e-1717dd394810/apply";
// Real control subtree observed on 2026-09-08. Opening shows a year and 12
// months; the closed field has no precision hint. No user answer is recorded.
function calendar(title = "出生日期 (年龄)") {
  return `<div class="apply-field-Q2iJ7AtQGX day_info-S5Nug1w6IL">
    <div class="title-IWWQ0Xa4L7"><span>${title}</span><span class="required-asterisk-av7daEKsLS"></span></div>
    <div class="ctrl-CICMG4Fr4_"><div class="sd-Dropdown-container-1CigZ">
      <label class="sd-Input-container-2S_vM day_info sd-Input-lg-3X8ma">
        <input type="text" readonly placeholder="${title}" class="sd-Input-input-10L0t sd-Input-common-input-1XimE sd-Input-has-addon-3djHe">
        <span class="sd-Input-addon-1Dv-z sd-picker-addon-1SMM0"></span>
      </label></div></div></div>`;
}
function page(markup = calendar(), url = lingshi) {
  vi.stubGlobal("location", new URL(url));
  document.body.innerHTML = `<form><h2>个人信息</h2>${markup}</form>`;
  return withFieldInformationRequirements(observeApplicationPage());
}
beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 30, width: 200, height: 30, toJSON() {} });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("registered calendar supplemental type", () => {
  it.each([lingshi, lingshi.replace("lingshi/144566", "zsquant/36544"), lingshi.replace("lingshi/144566", "garena/148076")])(
    "returns a date input without changing precision or the Driver: %s", url => {
      const observation = page(calendar(), url);
      const field = observation.fields[0]!;
      expect(field).toMatchObject({ type: "text", controlKind: "native", supplementalInputType: "date" });
      expect(field.informationRequirement).toBeUndefined();
      expect(resolveControlAdapter(evidenceForField(observation, field)).code).toBe("moka.date-picker.trusted-pointer.v9");
      const request = candidateInformationRequestForField(field)!;
      expect(request).toMatchObject({ fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
        type: "date", controlKind: "date", description: expect.stringContaining("YYYY-MM-DD") });
      const rejected = siteRejectedInformationRequests([{ ...field, currentValue: "1991-01（35岁）", validationMessage: "请补充出生日期" }])[0]!;
      expect(rejected).toMatchObject({ type: "date", fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
        description: "招聘网站校验：请补充出生日期" });
      expect(JSON.stringify(rejected)).not.toContain("35岁");
      expect(autoApplyJobResultSchema.parse({ schemaVersion: "auto-apply-job-result.v1",
        batchId: "11111111-1111-4111-8111-111111111111", batchJobId: "22222222-2222-4222-8222-222222222222",
        jobId: "job", status: "waiting_for_user_action", reasonCode: "missing_information", occurredAt: "2026-09-08T00:00:00Z",
        evidence: { redacted: true, requiredFieldRequests: [request] }
      }).evidence?.requiredFieldRequests?.[0]).toEqual(request);
    }
  );
  it("uses calendar registration rather than the birth-date caption", () => {
    const observation = page(calendar("测评时点"));
    expect(candidateInformationRequestForField(observation.fields[0]!)).toMatchObject({ type: "date" });
  });
  it.each([
    ['<label>出生日期<input type="text" required></label>', lingshi],
    ['<label>出生日期<input type="text" readonly required></label>', lingshi],
    [calendar(), "https://unrelated.example/apply"],
    [calendar(), lingshi.replace("lingshi/144566", "jsti/144121")],
    ['<label>出生日期<select required><option>稍后提供</option></select></label>', lingshi]
  ])("keeps unrelated and unsupported controls out of calendar supplementation", (markup, url) => {
    const observation = page(markup, url), field = observation.fields[0]!;
    expect(field.supplementalInputType).toBeUndefined();
    if(resolveControlAdapter(evidenceForField(observation,field)).driver === "unsupported") {
      expect(()=>candidateInformationRequestForField(field)).toThrow("未能确定招聘页面控件");
    } else expect(candidateInformationRequestForField(field)?.type).not.toBe("date");
  });
  it("drops stale calendar metadata after navigation to an unrelated control", () => {
    const original = page();
    const next = withFieldInformationRequirements({ ...original, url: "https://unrelated.example/apply" });
    expect(next.fields[0]?.supplementalInputType).toBeUndefined();
    expect(()=>candidateInformationRequestForField(next.fields[0]!)).toThrow("未能确定招聘页面控件");
  });
  it("preserves explicit precision, split parts, options and repeated field identity", () => {
    const base = page().fields[0]!;
    for (const type of ["date", "month"] as const) {
      expect(candidateInformationRequestForField({ ...base, type })).toMatchObject({ type, controlKind: type });
    }
    const split: PageFieldObservation = { ...base, temporal: { groupKey: "study", layout: "year_month", edge: "end", part: "year" } };
    expect(candidateInformationRequestForField(split)?.type).toBe("number");
    expect(candidateInformationRequestForField({ ...split, type: "combobox", options: ["2026", "2027"] })?.type).toBe("combobox");
    const rows = [0, 1].map(groupIndex => ({ ...base, fieldId: `row-${groupIndex}`, stableFieldKey: `education[${groupIndex}].end_date.native`, sectionKey: "education", groupIndex }));
    expect(siteRejectedInformationRequests(rows).map(({ fieldId, stableFieldKey, groupIndex }) => ({ fieldId, stableFieldKey, groupIndex })))
      .toEqual(rows.map(({ fieldId, stableFieldKey, groupIndex }) => ({ fieldId, stableFieldKey, groupIndex })));
  });
});
