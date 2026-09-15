import { describe, expect, it } from "vitest";
import type { PageFieldObservation } from "./page-adapter.js";
import { enrichPreferredCityFacts, isPreferredWorkCityField } from "./preferred-city-policy.js";
import {
  authoritativeCandidateFactForField, candidateInformationRequestForUnavailableOptions,
  candidateInformationRequestsForMissingFields, enrichVisionCandidateFacts, soleRequiredMokaPreferredCityOption
} from "./vision-form-runtime.js";
import { deterministicKnownFactActions } from "./vision-form-runtime.js";
import { siteRepairReadbackFailures } from "./auto-apply-site-validation.js";
import type { PageObservation } from "./page-adapter.js";

const city = (options: string[] = []): PageFieldObservation => ({
  fieldId: "city", stableFieldKey: "intention.preferred_city.combobox", label: "意向工作城市",
  selector: "#city", sectionKey: "intention", groupIndex: null, labelPath: ["意向工作城市"],
  type: "combobox", controlKind: "combobox", required: true, currentValue: "", options
});
const backup = (value: string, confirmedAt = "2026-09-02T00:00:00Z") => ({
  semanticKey: `candidate.acceptable_work_city:${value.replace(/市$/, "")}`, value,
  source: "user_confirmed", label: "可接受工作城市", stableFieldKeys: [], confirmedAt
});
const facts = () => enrichVisionCandidateFacts({ candidate: {
  basic: { currentCity: "深圳" }, preferences: { preferredCities: ["深圳", "广州"] }
}}, {}, {}, { facts: [backup("杭州市"), backup("广州市")] });

describe("work-city priority and supplementation", () => {
  it.each(["是否接受意向城市调剂？", "能否接受工作城市调剂", "Would you accept a different preferred city?"])(
    "does not treat the binary question %s as permission to choose a city", label => {
      const binary = {...city(),label,options:[],domHints:{classNames:["sd-Select-container bool_info"]}};
      const values={...facts(),"job.answers.preferredCity":"上海"};
      expect(isPreferredWorkCityField(binary)).toBe(false);
      expect(authoritativeCandidateFactForField(binary,values)).toBeNull();
      expect(soleRequiredMokaPreferredCityOption({...binary,options:["是"]})).toBeNull();
      expect(authoritativeCandidateFactForField(binary,{
        ...values,[`job.requiredField.stable:${binary.stableFieldKey}`]:"否"
      })?.value).toBe("否");
    }
  );
  it("keeps a committed backup when the closed control drops its option list", () => {
    const values = { "candidate.basic.currentCity": "深圳", "profile.acceptableWorkCity.0": "广州市" };
    const selected = { ...city(), currentValue: "广州市" };
    const page = { url: "https://example.test/apply", fields: [selected] } as PageObservation;
    expect(authoritativeCandidateFactForField(selected, values)?.value).toBe("广州市");
    expect(deterministicKnownFactActions(page, values)).toEqual([]);
    expect(siteRepairReadbackFailures([city()], page, values)).toEqual([]);
    expect(siteRepairReadbackFailures([city()], { ...page, fields: [{ ...selected, currentValue: "北京市" }] }, values)).toHaveLength(1);
    expect(siteRepairReadbackFailures([city()], page, { ...values,
      "job.requiredField.stable:intention.preferred_city.combobox": "深圳市"
    })).toHaveLength(1);
    expect(authoritativeCandidateFactForField(city(["深圳市", "广州市"]), values)?.value).toBe("深圳");
  });
  it.each([
    [["广州市", "深圳市"], "深圳"],
    [["广州市"], "广州"],
    [["杭州市"], "杭州市"]
  ])("matches resume order before supplementary backups: %j", (options, expected) => {
    expect(authoritativeCandidateFactForField(city(options as string[]), facts())?.value).toBe(expected);
  });

  it("does not let an old unbound Guangzhou answer override resume Shenzhen", () => {
    const values = { "candidate.preferences.preferredCity": "深圳", "profile.requiredField.label:意向工作城市": "广州市" };
    expect(authoritativeCandidateFactForField(city(["深圳市", "广州市"]), values)?.value).toBe("深圳");
    expect(authoritativeCandidateFactForField(city(["广州市"]), values)?.value).toBe("广州市");
  });

  it("uses residence only without explicit resume preferences and never uses job location", () => {
    const values = enrichVisionCandidateFacts({ candidate: { basic: { currentCity: "深圳" } } }, {}, { locations: ["北京"] });
    expect(authoritativeCandidateFactForField(city(["深圳市"]), values)?.value).toBe("深圳");
    expect(authoritativeCandidateFactForField(city(["北京市"]), {})).toBeNull();
    expect(authoritativeCandidateFactForField(city(["深圳市"]), {
      "candidate.preferences.preferredCity": "广州", "candidate.basic.currentCity": "深圳"
    })).toBeNull();
  });

  it("preserves this job's exact confirmation without changing later job preferences", () => {
    const values = facts();
    const withAnswer = { ...values, "job.requiredField.stable:intention.preferred_city.combobox": "广州市" };
    expect(authoritativeCandidateFactForField(city(["深圳市", "广州市"]), withAnswer)?.value).toBe("广州市");
    expect(authoritativeCandidateFactForField(city(["深圳市", "广州市"]), values)?.value).toBe("深圳");
  });

  it("returns actual choices for both absent preferences and no intersection", () => {
    for (const values of [{}, facts()]) {
      expect(candidateInformationRequestsForMissingFields([city(["北京市", "上海市"])], values))
        .toMatchObject([{ options: ["北京市", "上海市"], reasonCode: "candidate_information_missing" }]);
    }
  });

  it("does not truncate the 21st city or long questions", () => {
    const options = [...Array.from({ length: 25 }, (_, i) => `测试城市${i}`), "深圳市"];
    expect(candidateInformationRequestForUnavailableOptions(city(), "深圳", options)).toBeNull();
    const request = candidateInformationRequestForUnavailableOptions(city(), "广州市", options);
    expect(request?.options).toEqual(options);
    const many = Array.from({ length: 500 }, (_, i) => `选项城市${i}`);
    const large = candidateInformationRequestForUnavailableOptions(city(), "广州市", many);
    expect(large?.options).toHaveLength(500);
    expect(large!.question.length).toBeLessThan(1000);
  });

  it("does not promote job-bound or unconfirmed records to global backups", () => {
    const values: Record<string, string> = {};
    enrichPreferredCityFacts(values, {}, [
      { ...backup("广州"), source: "model" }, { ...backup("深圳"), fieldBinding: { jobId: "a" } }
    ]);
    expect(values).toEqual({});
    for (const label of ["紧急联系人工作城市", "籍贯", "学校所在地", "推荐码"]) {
      expect(isPreferredWorkCityField({ label, stableFieldKey: "intention.preferred_city.combobox" })).toBe(false);
    }
  });

  it("never sends a city to a control whose intrinsic identity is referral or a third party", () => {
    for (const placeholder of ["请输入推荐码", "紧急联系人城市"]) {
      expect(authoritativeCandidateFactForField({ ...city(), domHints: { placeholder } }, facts())).toBeNull();
    }
  });

  it("reports an explicit error instead of truncating a list beyond the contract limit", () => {
    const options = Array.from({ length: 1001 }, (_, i) => `城市${i}`);
    expect(() => candidateInformationRequestForUnavailableOptions(city(), "深圳", options))
      .toThrow("选项超过完整回传上限");
  });
});
