import { describe, expect, it } from "vitest";
import { cityOptionMatchToken, matchingCityOptions, uniqueCityOption } from "./city-option-matching.js";
import { authoritativeCandidateFactForField, candidateInformationRequestForUnavailableOptions,
  visionReadbackMatches } from "./vision-form-runtime.js";
import { prepareRequiredWorkCityChoices } from "./preferred-city-preflight.js";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";

const field: PageFieldObservation = { fieldId: "city", stableFieldKey: "intention.preferred_city.combobox",
  label: "申请信息 · 意向工作城市", selector: "#city", type: "combobox", controlKind: "combobox", required: true,
  currentValue: "", options: ["北京市 / Beijing", "上海市 / Shanghai"] };

describe("unique city name / first-two-Han-character matching", () => {
  it.each(["北京", "北京市"])("matches %s to the site's bilingual Beijing option", value => {
    expect(uniqueCityOption(field.options, value)).toBe("北京市 / Beijing");
    expect(candidateInformationRequestForUnavailableOptions(field, value, field.options)).toBeNull();
    expect(authoritativeCandidateFactForField(field, { "job.answers.preferredCity": value })?.value).toBe(value);
  });
  it("uses two Chinese characters, not two arbitrary bytes/English letters", () => {
    expect(cityOptionMatchToken("哈尔滨市")).toBe("哈尔");
    expect(uniqueCityOption(["哈尔滨市 / Harbin", "上海市"], "哈尔")).toBe("哈尔滨市 / Harbin");
    expect(uniqueCityOption(field.options, "Beijing")).toBe("北京市 / Beijing");
    expect(uniqueCityOption(field.options, "北")).toBeNull();
    expect(uniqueCityOption(field.options, "")).toBeNull();
  });
  it("refuses two matching leaves, including duplicate labels", () => {
    expect(matchingCityOptions(["北京市", "北京经济区"], "北京")).toHaveLength(2);
    expect(uniqueCityOption(["北京市", "北京经济区"], "北京")).toBeNull();
    expect(uniqueCityOption(["北京市", "北京市"], "北京")).toBeNull();
    expect(uniqueCityOption(field.options, "深圳")).toBeNull();
  });
  it("keeps the candidate fact and uses current options in planning, supplementation and delayed readback", async () => {
    const facts = { "candidate.preferences.preferredCities.0": "北京市" };
    const prepared = await prepareRequiredWorkCityChoices({ url: "https://example.test/apply", fields: [{ ...field, options: [] }] } as PageObservation,
      facts, async fields => fields.map(item => ({ ...item, options: field.options })));
    expect(authoritativeCandidateFactForField(prepared.fields[0]!, facts)?.value).toBe("北京市");
    expect(visionReadbackMatches({ ...field, currentValue: field.options[0]!, options: [] }, "北京市", "candidate.preferences.preferredCities.0")).toBe(true);
    const ambiguous = { ...field, options: ["北京市", "北京经济区"] };
    expect(authoritativeCandidateFactForField(ambiguous, facts)).toBeNull();
    expect(candidateInformationRequestForUnavailableOptions(field, "深圳", field.options)?.options).toEqual(field.options);
  });
  it("does not loosen native-place paths, source choices, dates or ordinary text", () => {
    for (const [label, key, actual, expected] of [
      ["籍贯", "basic.native_place.combobox", "北京市 东城区", "北京市 西城区"],
      ["信息来源渠道", "other.recruiting_source.combobox", "校园招聘", "校园"],
      ["出生日期", "basic.birth_date.native", "2000-01-02", "2000-01-03"]
    ]) {
      expect(visionReadbackMatches({ ...field, label, stableFieldKey: key, currentValue: actual }, expected,
        `job.requiredField.stable:${key}`)).toBe(false);
    }
  });
});
