import { describe, expect, it } from "vitest";
import type { PageFieldObservation } from "./page-adapter.js";
import { authoritativeCandidateFactForField, enrichVisionCandidateFacts } from "./vision-form-runtime.js";

const label = "是否愿意来深圳工作";
const oldKey = "work.请选择.combobox#0";
const newKey = `work.${label}.combobox`;
const field = (overrides: Partial<PageFieldObservation> = {}): PageFieldObservation => ({
  fieldId: "choice", stableFieldKey: newKey, selector: "#choice", label,
  sectionKey: "work", groupIndex: null, labelPath: [label], controlKind: "combobox",
  type: "combobox", required: true, options: ["是", "否"], currentValue: "", ...overrides
});
const saved = (overrides: Record<string, unknown> = {}) => ({
  stableFieldKeys: [oldKey], label, value: "是", source: "user_confirmed", ...overrides
});
const factsFor = (facts: Record<string, unknown>[], job = {}) =>
  enrichVisionCandidateFacts({}, {}, job, { facts });

describe("labeled choice identity migration", () => {
  it("recovers a uniquely labeled old placeholder answer", () => {
    expect(authoritativeCandidateFactForField(field(), factsFor([saved()]))?.value).toBe("是");
  });

  it.each(["请输入民族", "请选择民族", "请搜索民族"])("recovers the observed title-specific placeholder %s without relaxing label matching", placeholder => {
    const target = field({ label: "民族", labelPath: ["民族"], sectionKey: "other",
      stableFieldKey: "other.民族.combobox", options: ["汉族", "其他"] });
    const profile = [saved({ label: "民族", value: "汉族", stableFieldKeys: [`other.${placeholder}.combobox`] })];
    expect(authoritativeCandidateFactForField(target, factsFor(profile))?.value).toBe("汉族");
    expect(authoritativeCandidateFactForField(target, factsFor([saved({
      label: "民族", value: "汉族", stableFieldKeys: ["other.请输入籍贯.combobox"]
    })]))).toBeNull();
  });

  it.each([
    { label: "是否在实习地有住所", labelPath: ["是否在实习地有住所"] },
    { stableFieldKey: `other.${label}.combobox`, sectionKey: "other" },
    { stableFieldKey: `${newKey}#0` },
    { stableFieldKey: `${newKey}#1` },
    { stableFieldKey: `work.${label}.native`, controlKind: "native", type: "text" },
    { stableFieldKey: `work.${label}.select`, controlKind: "select", type: "select" },
    { options: ["暂不考虑", "待沟通"] }
  ] satisfies Partial<PageFieldObservation>[]) ("does not widen answer authority to %j", overrides => {
    expect(authoritativeCandidateFactForField(field(overrides), factsFor([saved()]))).toBeNull();
  });

  it.each(["是", "否"])("rejects two distinct legacy identities even when second answer is %s", value => {
    const profile = [saved(), saved({ stableFieldKeys: ["work.请选择.combobox#1"], value })];
    for (const ordered of [profile, [...profile].reverse()]) {
      const facts = factsFor(ordered);
      expect(() => authoritativeCandidateFactForField(field(), facts)).toThrow("无法唯一关联");
      expect(authoritativeCandidateFactForField(field({ required: false }), facts)).toBeNull();
    }
  });

  it("rejects conflicting canonical and migrated answers in either order", () => {
    const profile = [saved(), saved({ stableFieldKeys: [newKey], value: "否" })];
    for (const ordered of [profile, [...profile].reverse()]) {
      expect(() => authoritativeCandidateFactForField(field(), factsFor(ordered))).toThrow("无法唯一关联");
    }
  });

  it("does not infer a migration from an unlabeled current-job answer or unconfirmed profile", () => {
    const job = { requiredFieldAnswers: [{ stableFieldKey: oldKey, fieldId: "choice", value: "是", source: "user_confirmed" }] };
    expect(authoritativeCandidateFactForField(field(), factsFor([], job))).toBeNull();
    expect(authoritativeCandidateFactForField(field(), factsFor([saved({ label: "" })]))).toBeNull();
    expect(authoritativeCandidateFactForField(field(), factsFor([saved({ source: "model" })]))).toBeNull();
  });

  it("retains explicit repeat-row ownership", () => {
    const current = field({ stableFieldKey: `work[0].${label}.combobox`, groupIndex: 0 });
    const facts = factsFor([saved({ stableFieldKeys: ["work[0].请选择.combobox#1"] })]);
    expect(authoritativeCandidateFactForField(current, facts)?.value).toBe("是");
    expect(authoritativeCandidateFactForField(field({ stableFieldKey: `work[1].${label}.combobox`, groupIndex: 1 }), facts)).toBeNull();
    const merged = factsFor([saved({ stableFieldKeys: ["work[0].请选择.combobox", "work[1].请选择.combobox"] })]);
    expect(authoritativeCandidateFactForField(current, merged)).toBeNull();
  });

  it("keeps bound migrations inside the confirmed job, section and row", () => {
    const profile = [saved({ fieldBinding: { jobId: "current", stableFieldKey: oldKey, sectionKey: "work", groupIndex: null } })];
    const matching = factsFor(profile, { jobId: "current" });
    expect(authoritativeCandidateFactForField(field(), matching)?.value).toBe("是");
    expect(authoritativeCandidateFactForField(field(), factsFor(profile, { jobId: "other" }))).toBeNull();
    expect(authoritativeCandidateFactForField(field({ sectionKey: "other" }), matching)).toBeNull();
    expect(authoritativeCandidateFactForField(field({ groupIndex: 1 }), matching)).toBeNull();
    expect(Object.keys(matching).filter(key => /profile\.(?:semantic:|requiredField\.label:|requiredField\.stableLabel:)/.test(key))).toEqual([]);
  });

  it("does not collapse conflicting bound old ordinals", () => {
    const profile = [oldKey, "work.请选择.combobox#1"].map(key => saved({
      stableFieldKeys: [key], fieldBinding: { jobId: "current", stableFieldKey: key, sectionKey: "work", groupIndex: null }
    }));
    expect(() => authoritativeCandidateFactForField(field(), factsFor(profile, { jobId: "current" }))).toThrow("无法唯一关联");
  });

  it.each(["年", "月", "year", "month", "请选择"])("leaves ambiguous temporal/presentation title %s unmigrated", title => {
    const facts = factsFor([saved({ label: title })]);
    expect(Object.keys(facts).some(key => key.startsWith("profile.labelIdentityMigration:"))).toBe(false);
  });
});
