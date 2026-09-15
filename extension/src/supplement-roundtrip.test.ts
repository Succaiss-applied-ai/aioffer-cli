import { describe, expect, it } from "vitest";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import {
  authoritativeCandidateFactForField, candidateInformationRequestsForMissingFields,
  candidateInformationRequestForField, deterministicKnownFactActions,
  enrichVisionCandidateFacts, visionFormReadyForFinalReview, visionReadbackMatches
} from "./vision-form-runtime.js";
import { guardFieldInformation } from "./field-information-guard.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { autoApplyJobResultSchema, candidateApplicationProfileSchema } from "../../src/gateway/auto-apply-contract.js";

const url = "https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/test-job/apply";
const field = (overrides: Partial<PageFieldObservation> = {}): PageFieldObservation => ({
  fieldId: "field-20", stableFieldKey: "education.end_date.native", sectionKey: "education", groupIndex: null,
  selector: "#graduation", label: "教育背景 · 教育经历 · 结束时间", labelPath: ["教育背景", "教育经历"],
  type: "text", controlKind: "native", required: true, currentValue: "", options: [],
  domHints: { fieldLabel: "毕业时间", placeholder: "日期（年月日）", tagName: "INPUT", readOnly: true,
    classNames: ["day_info", "sd-Dropdown-container-1CigZ"] }, ...overrides
});
const page = (fields: PageFieldObservation[]): PageObservation => ({
  url, title: "申请表", loginRequired: false, loginReason: null, formDetected: true,
  fingerprint: "roundtrip", fields, actions: [], submitCandidates: [], validationMessages: [],
  transientBusy: false, observedAt: "2026-09-03T00:00:00.000Z"
});
const baseFacts = { "resume.education.0.endDate": "2026-06" };
function profileAnswer(target: PageFieldObservation, value: string, bound = false) {
  const request = candidateInformationRequestForField(target)!;
  const result = autoApplyJobResultSchema.parse({
    schemaVersion: "auto-apply-job-result.v1", batchId: "11111111-1111-4111-8111-111111111111",
    batchJobId: "22222222-2222-4222-8222-222222222222", jobId: "job-1", status: "waiting_for_user_action",
    occurredAt: "2026-09-03T00:00:00.000Z", reasonCode: "missing_information",
    evidence: { redacted: true, requiredFieldRequests: [request] }
  });
  const saved = result.evidence!.requiredFieldRequests![0]!;
  return {
    schemaVersion: "candidate-application-profile-fact.v1", stableFieldKeys: [saved.stableFieldKey!],
    label: saved.label, normalizedLabel: saved.label.replace(/[·\s]/g, ""), controlType: saved.type,
    observedSites: [], value, source: "user_confirmed", confirmedAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    ...(bound ? { fieldBinding: { jobId: "job-1", stableFieldKey: saved.stableFieldKey!,
      sectionKey: saved.sectionKey!, groupIndex: saved.groupIndex ?? null } } : {})
  };
}
function restart(facts: ReturnType<typeof profileAnswer>[], jobId = "job-1") {
  // The real restart creates a NEW batch: requiredFieldAnswers is empty, and
  // saved answers arrive separately in applicationProfile, not in the resume.
  const wire = JSON.parse(JSON.stringify({ schemaVersion: "candidate-application-profile.v1",
    revision: "a".repeat(64), facts }));
  return enrichVisionCandidateFacts({}, baseFacts, { jobId, applicationUrl: url, requiredFieldAnswers: [] },
    candidateApplicationProfileSchema.parse(wire));
}

describe("supplement -> persisted profile -> new batch -> field planning", () => {
  it.each([false, true])("consumes the saved full date on a fresh batch (bound=%s)", bound => {
    const target = field();
    expect(candidateInformationRequestsForMissingFields([target], baseFacts)).toHaveLength(1);
    const saved = profileAnswer(target, "2026-06-30", bound);
    expect(saved.label).toBe("教育背景 · 毕业时间");
    const facts = restart([saved]);
    // Re-observation may change the ordinal ID, but not the stable identity.
    const next = { ...target, fieldId: "field-24" };
    expect(authoritativeCandidateFactForField(next, facts)?.value).toBe("2026-06-30");
    expect(candidateInformationRequestsForMissingFields([next], facts)).toEqual([]);
    expect(deterministicKnownFactActions(page([next]), facts)).toMatchObject([{ value: "2026-06-30" }]);
    expect(guardFieldInformation(next, "2026-06-30")).toBeNull();
    // Complete DOM readback is a fixture assertion, not real-page acceptance.
    const completed = { ...next, currentValue: "2026-06-30" };
    expect(visionReadbackMatches(completed, "2026-06-30")).toBe(true);
    expect(deterministicKnownFactActions(page([completed]), facts)).toEqual([]);
    expect(visionFormReadyForFinalReview(page([completed]))).toBe(true);
  });
  it("keeps the registered date Driver, including its real readback requirements", () => {
    const target = field();
    expect(resolveControlAdapter({ applicationUrl: url, label: target.label, semanticKey: target.stableFieldKey!,
      type: target.type, controlKind: target.controlKind!, tagName: "INPUT", readOnly: true,
      placeholder: target.domHints!.placeholder!, classNames: target.domHints!.classNames! }).code)
      .toBe("moka.date-picker.trusted-pointer.v9");
  });
  it.each([false, true])("does not leak a saved date into another repeat row (bound=%s)", bound => {
    const first = field({ stableFieldKey: "education[0].end_date.native", groupIndex: 0 });
    const second = field({ stableFieldKey: "education[1].end_date.native", groupIndex: 1 });
    // No degree was supplied: distinguish by the observed row, never infer
    // that row 1 must be bachelor's and row 2 must be master's.
    expect(candidateInformationRequestForField(first)?.label).toBe("教育背景 · 毕业时间（第1条）");
    expect(candidateInformationRequestForField(second)?.label).toBe("教育背景 · 毕业时间（第2条）");
    const facts = restart([profileAnswer(first, "2024-06-30", bound), profileAnswer(second, "2026-06-30", bound)]);
    expect(authoritativeCandidateFactForField(first, facts)?.value).toBe("2024-06-30");
    expect(authoritativeCandidateFactForField(second, facts)?.value).toBe("2026-06-30");
    const onlyFirst = restart([profileAnswer(first, "2024-06-30", bound)]);
    onlyFirst["resume.education.1.school"] = "第二所示例大学";
    expect(authoritativeCandidateFactForField(second, onlyFirst)).toBeNull();
    expect(candidateInformationRequestsForMissingFields([second], onlyFirst)).toHaveLength(1);
  });
  it("keeps a bound date isolated across jobs, sections and row metadata", () => {
    const saved = profileAnswer(field(), "2026-06-30", true);
    expect(authoritativeCandidateFactForField(field(), restart([saved], "another-company-job"))).toBeNull();
    const facts = restart([saved]);
    expect(authoritativeCandidateFactForField(field({ sectionKey: "work" }), facts)).toBeNull();
    expect(authoritativeCandidateFactForField(field({ groupIndex: 1 }), facts)).toBeNull();
    // A bound identity is independent of display text, with its exact row kept.
    expect(authoritativeCandidateFactForField(field({ label: "新显示名称", labelPath: [], domHints: {
      placeholder: "YYYY-MM-DD", fieldLabel: "新显示名称"
    } }), facts)?.value).toBe("2026-06-30");
  });
  it.each([
    ["work", "工作经历"], ["project", "项目经历"], ["internship", "实习经历"]
  ])("separates both dates in multiple %s rows, with page-order fallback", (section, title) => {
    const targets = [0, 1].flatMap(row => ["start", "end"].map(edge => field({
      fieldId: `${section}-${row}-${edge}`, stableFieldKey: `${section}[${row}].${edge}_date.native`,
      sectionKey: section, groupIndex: row, label: `${title} · ${edge === "start" ? "开始时间" : "结束时间"}`,
      labelPath: [title, "经历"], domHints: { fieldLabel: edge === "start" ? "开始时间" : "结束时间",
        placeholder: "日期（年月日）" }
    })));
    const values = ["2022-01-01", "2023-02-02", "2024-03-03", "2025-04-04"];
    for (const bound of [false, true]) {
      const facts = restart(targets.map((target, index) => profileAnswer(target, values[index]!, bound)));
      for (const [index, target] of targets.entries()) {
        expect(candidateInformationRequestForField(target)?.label).toBe(
          `${title} · ${index % 2 === 0 ? "开始时间" : "结束时间"}（第${Math.floor(index / 2) + 1}条）`);
        expect(authoritativeCandidateFactForField(target, facts)?.value).toBe(values[index]);
      }
      expect(candidateInformationRequestsForMissingFields(targets, facts)).toEqual([]);
      expect(deterministicKnownFactActions(page(targets), facts).map(action => action.value)).toEqual(values);
      const onlyFirst = restart([profileAnswer(targets[0]!, values[0]!, bound)]);
      expect(authoritativeCandidateFactForField(targets[1]!, onlyFirst)).toBeNull();
      expect(authoritativeCandidateFactForField(targets[2]!, onlyFirst)).toBeNull();
    }
  });
  it("lets the current answer win, and does not resurrect an older complete date", () => {
    const old = profileAnswer(field(), "2026-06-30");
    const newer = profileAnswer(field(), "2027-06", true);
    const facts = restart([old, newer]);
    expect(authoritativeCandidateFactForField(field(), facts)).toBeNull();
    expect(candidateInformationRequestsForMissingFields([field()], facts)).toHaveLength(1);
    const explicit = enrichVisionCandidateFacts({}, baseFacts, { jobId: "job-1", requiredFieldAnswers: [{
      fieldId: "field-20", stableFieldKey: "education.end_date.native", value: "2027-06-30"
    }] }, { facts: [old, newer] });
    expect(authoritativeCandidateFactForField(field(), explicit)?.value).toBe("2027-06-30");
  });
  it.each(["2026-06", "2026-02-30"])("still asks for a genuinely incomplete/invalid saved date: %s", value => {
    expect(candidateInformationRequestsForMissingFields([field()], restart([profileAnswer(field(), value)])))
      .toHaveLength(1);
  });
  it.each(["province", "city", "district"] as const)("round-trips a %s region at the requested depth", level => {
    const target = field({ stableFieldKey: "basic.native_place.native", sectionKey: "basic", label: "个人信息 · 籍贯",
      labelPath: ["个人信息", "籍贯"], domHints: { fieldLabel: "籍贯" }, informationRequirement: { kind: "region", level } });
    const value = { province: "广东省", city: "广东省/深圳市", district: "广东省/深圳市/南山区" }[level];
    const facts = restart([profileAnswer(target, value, true)]);
    expect(authoritativeCandidateFactForField(target, facts)?.value).toBe(value);
    expect(candidateInformationRequestsForMissingFields([target], facts)).toEqual([]);
    if (level !== "province") expect(candidateInformationRequestsForMissingFields([target],
      restart([profileAnswer(target, "广东省", true)]))).toHaveLength(1);
  });
  it("does not fill optional dates from the persisted profile or request a complete manual value", () => {
    const facts = restart([profileAnswer(field(), "2026-06-30", true)]);
    expect(deterministicKnownFactActions(page([field({ required: false })]), facts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields([field({ currentValue: "2027-06-30" })], facts)).toEqual([]);
  });
  it("preserves scoped identity through Gateway validation and rejects inconsistent metadata", () => {
    const saved = profileAnswer(field(), "2026-06-30", true);
    const snapshot = { schemaVersion: "candidate-application-profile.v1", revision: "a".repeat(64), facts: [saved] };
    expect(candidateApplicationProfileSchema.parse(snapshot).facts[0]?.fieldBinding).toEqual(saved.fieldBinding);
    for (const keys of [["education.other_date.native"], [saved.stableFieldKeys[0], "education.other_date.native"]]) {
      expect(candidateApplicationProfileSchema.safeParse({ ...snapshot,
        facts: [{ ...saved, stableFieldKeys: keys }] }).success).toBe(false);
    }
  });
  it("rejects unknown same-key label collisions as association failures, not repeated questions", () => {
    const saved = { ...profileAnswer(field(), "2026-06-30"), label: "另一项日期", normalizedLabel: "另一项日期" };
    expect(() => candidateInformationRequestsForMissingFields([field()], restart([saved])))
      .toThrowError(/无法唯一关联当前字段/);
    try { candidateInformationRequestsForMissingFields([field()], restart([saved])); } catch (error: any) {
      expect(error.publicError).toMatchObject({ code: "FORM_FILL_VALIDATION_FAILED",
        details: { reasonCode: "supplemental_answer_binding_failed" } });
      expect(error.publicError.details.requiredFieldRequests).toBeUndefined();
    }
  });
  it("rejects conflicting confirmations independently of input order", () => {
    const a = profileAnswer(field(), "2026-06-30");
    const b = profileAnswer(field(), "2027-06-30");
    for (const entries of [[a, b], [b, a]]) expect(() =>
      candidateInformationRequestsForMissingFields([field()], restart(entries))).toThrowError(/无法唯一关联/);
  });
  it("does not reuse a legacy record that merged two different repeat fields", () => {
    const target = field({ stableFieldKey: "education.end_date.native#0" });
    const merged = { ...profileAnswer(target, "2026-06-30"),
      stableFieldKeys: ["education.end_date.native#0", "education.end_date.native#1"] };
    expect(() => candidateInformationRequestsForMissingFields([target], restart([merged])))
      .toThrowError(/无法唯一关联/);
  });
  it("preserves strict options and does not confuse school region with school name", () => {
    const target = field({ stableFieldKey: "education.school.combobox", label: "学校名称", labelPath: ["学校名称"],
      type: "combobox", controlKind: "combobox", domHints: { fieldLabel: "学校名称" }, options: ["示例大学"] });
    const other = { ...profileAnswer(target, "海外院校"), label: "院校所在地区", normalizedLabel: "院校所在地区" };
    expect(authoritativeCandidateFactForField(target, restart([other]))).toBeNull();
  });
});
