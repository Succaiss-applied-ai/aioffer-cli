import { describe, expect, it, vi } from "vitest";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import { prepareRequiredWorkCityChoices, prepareScopedWorkCityChoices } from "./preferred-city-preflight.js";
import { authoritativeCandidateFactForField } from "./vision-form-runtime.js";
import { autoApplyFillObservation, siteValidationFieldKey } from "./auto-apply-site-validation.js";

const field: PageFieldObservation = {
  fieldId: "city", stableFieldKey: "intention.preferred_city.combobox", label: "意向工作城市",
  selector: "#city", type: "combobox", controlKind: "combobox", required: true, currentValue: "", options: []
};
const observation = { fields: [field], url: "https://example.test/apply" } as PageObservation;
const facts = { "candidate.basic.currentCity": "深圳", "profile.acceptableWorkCity.0": "广州市" };

describe("work-city preflight before fill planning", () => {
  it("does not probe unknown initial facts or cities outside the site-rejected repair scope", async () => {
    const discover = vi.fn();
    const unknown = autoApplyFillObservation(observation, {});
    expect(await prepareScopedWorkCityChoices(observation, {}, unknown.fields, discover)).toBe(observation);
    const repair = autoApplyFillObservation(observation, facts, new Set(["other-field"]));
    expect(await prepareScopedWorkCityChoices(observation, facts, repair.fields, discover)).toBe(observation);
    expect(discover).not.toHaveBeenCalled();
  });

  it("collects an unavailable repair city while preserving other fields for the single fill loop", async () => {
    const other = { ...field, fieldId: "name", stableFieldKey: "basic.full_name.native", label: "姓名", type: "text", controlKind: "native" };
    const page = { ...observation, fields: [field, other] };
    const rejected = autoApplyFillObservation(page, facts, new Set(page.fields.map(siteValidationFieldKey)));
    const unavailable = vi.fn();
    const result = await prepareScopedWorkCityChoices(page, facts, rejected.fields,
      async fields => fields.map(f => ({ ...f, options: ["北京市"] })), unavailable);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(unavailable).toHaveBeenCalledWith(field, expect.objectContaining({ publicError: expect.objectContaining({
      code: "MISSING_INFORMATION", details: expect.objectContaining({ requiredFieldRequests: [expect.objectContaining({ options: ["北京市"] })] })
    }) }));
    expect(result.fields).toEqual(page.fields);
  });

  it("does not turn unreadable repair controls into missing candidate data", async () => {
    const unavailable = vi.fn();
    await expect(prepareScopedWorkCityChoices(observation, facts, [field], async fields => fields, unavailable))
      .rejects.toMatchObject({ publicError: { code: "SITE_VALIDATION_BLOCKED" } });
    expect(unavailable).not.toHaveBeenCalled();
  });

  it.each([["深圳市", "广州市"], ["广州市"]])("resolves priority against live choices %j", async (...options) => {
    const discover = vi.fn(async (fields: PageFieldObservation[]) => fields.map(f => ({ ...f, options })));
    const prepared = await prepareRequiredWorkCityChoices(observation, facts, discover);
    expect(discover).toHaveBeenCalledOnce();
    expect(authoritativeCandidateFactForField(prepared.fields[0]!, facts)?.value)
      .toBe(options.includes("深圳市") ? "深圳" : "广州市");
  });

  it.each([{}, facts])("returns the complete current job list without any fill attempt", async values => {
    const options = Array.from({ length: 500 }, (_, i) => `可选城市${i}`);
    await expect(prepareRequiredWorkCityChoices(observation, values, async fields => fields.map(f => ({ ...f, options }))))
      .rejects.toMatchObject({ publicError: {
        code: "MISSING_INFORMATION", details: { requiredFieldRequests: [{ options }] }
      } });
  });

  it.each([{ fields: [] }, { fields: [{ ...field, options: [] }] }])("distinguishes unreadable control from missing information", async ({ fields }) => {
    await expect(prepareRequiredWorkCityChoices(observation, facts, async () => fields))
      .rejects.toMatchObject({ publicError: { code: "SITE_VALIDATION_BLOCKED" } });
  });

  it("does not probe populated or optional cities or unrelated date/region fields", async () => {
    const discover = vi.fn();
    const page = { ...observation, fields: [
      { ...field, currentValue: "深圳市" }, { ...field, required: false },
      { ...field, label: "籍贯" }, { ...field, label: "出生日期", type: "date", controlKind: "date" }
    ] };
    expect(await prepareRequiredWorkCityChoices(page, facts, discover)).toBe(page);
    expect(discover).not.toHaveBeenCalled();
  });
});
