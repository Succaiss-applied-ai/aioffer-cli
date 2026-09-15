import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PageFieldObservation } from "./page-adapter.js";
import {
  authoritativeCandidateFactForField, candidateInformationRequestForField,
  enrichVisionCandidateFacts
} from "./vision-form-runtime.js";
import { candidateApplicationProfileSchema } from "../../src/gateway/auto-apply-contract.js";

// Actual closed NVIDIA Moka range observed by the installed 116. No answers.
const sample = JSON.parse(readFileSync(new URL("./fixtures/nvidia-split-month-observation-20260909.json", import.meta.url), "utf8"));
const observed = sample.fields as PageFieldObservation[];
const values = ["2020", "9", "2024", "6"];
const roles = ["开始年份", "开始月份", "结束年份", "结束月份"];
function saved(target: PageFieldObservation, value: string, legacy = false, withRow = true) {
  const request = candidateInformationRequestForField(target)!;
  const label = legacy ? `教育背景 · 就读时间 · ${target.temporal!.part === "year" ? "年" : "月"}${withRow ? "（第1条）" : ""}` : request.label;
  return { schemaVersion: "candidate-application-profile-fact.v1", stableFieldKeys: [request.stableFieldKey!],
    label, normalizedLabel: label.replace(/[·\s]/g, ""), controlType: request.type,
    value, source: "user_confirmed", observedSites: [], confirmedAt: "2026-09-09T00:00:00Z", updatedAt: "2026-09-09T00:00:00Z" };
}
function restart(entries: ReturnType<typeof saved>[], answers: unknown[] = []) {
  const profile = candidateApplicationProfileSchema.parse(JSON.parse(JSON.stringify({
    schemaVersion: "candidate-application-profile.v1", revision: "a".repeat(64), facts: entries
  })));
  return enrichVisionCandidateFacts({}, {}, { jobId: "range-label-test", applicationUrl: sample.source, requiredFieldAnswers: answers }, profile);
}

describe("observed range endpoints in supplemental display and persisted answers", () => {
  it("retains the original question, endpoint and unit in each Web-visible leaf", () => {
    const requests = observed.map(field => candidateInformationRequestForField(field)!);
    expect(requests.map(request => request.label)).toEqual(roles.map(role => `教育背景 · 就读时间（${role}）（第1条）`));
    // Existing Web shows only the final path segment: it must remain complete.
    expect(requests.map(request => request.label.split("·").at(-1)!.trim()))
      .toEqual(roles.map(role => `就读时间（${role}）（第1条）`));
    expect(requests.map(request => [request.fieldId, request.stableFieldKey, request.groupIndex]))
      .toEqual(observed.map(field => [field.fieldId, field.stableFieldKey, field.groupIndex]));
    expect(requests.every(request => request.inputKind === "number")).toBe(true);
  });

  it.each(["education", "work", "internship", "project"])("keeps all four parts distinct in multiple %s rows", section => {
    const targets = [0, 1].flatMap(row => observed.map((field, i) => ({ ...field,
      sectionKey: section, groupIndex: row, fieldId: `${section}-${row}-${i}`,
      stableFieldKey: field.stableFieldKey!.replace("education[0]", `${section}[${row}]`)
    })));
    expect(new Set(targets.map(field => candidateInformationRequestForField(field)!.label)).size).toBe(8);
    const facts = restart(targets.map((field, i) => saved(field, values[i % 4]!)));
    expect(targets.map(field => authoritativeCandidateFactForField(field, facts)?.value)).toEqual([...values, ...values]);
  });

  it.each([false, true])("consumes exact legacy labels after restart (old row suffix=%s)", withRow => {
    const facts = restart(observed.map((field, i) => saved(field, values[i]!, true, withRow)));
    expect(observed.map(field => authoritativeCandidateFactForField({ ...field, fieldId: "rebuilt" }, facts)?.value)).toEqual(values);
    const onlyStartYear = restart([saved(observed[0]!, "2020", true, withRow)]);
    for (const other of [observed[1]!, observed[2]!, observed[3]!, {
      ...observed[0]!, stableFieldKey: "education[1].start_date.combobox#0", groupIndex: 1
    }]) expect(authoritativeCandidateFactForField(other, onlyStartYear)).toBeNull();
  });

  it("preserves current-job priority and rejects conflicting legacy/new confirmations", () => {
    const field = observed[0]!;
    const old = saved(field, "2020", true), next = saved(field, "2021");
    expect(() => authoritativeCandidateFactForField(field, restart([old, next]))).toThrow(/无法唯一关联/);
    const facts = restart([old, next], [{ fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, value: "2022" }]);
    expect(authoritativeCandidateFactForField(field, facts)?.value).toBe("2022");
  });

  it("does not upgrade same-caption text, complete date, month, or standalone year controls to a range", () => {
    for (const type of ["text", "date", "month", "number"] as const) {
      const target: PageFieldObservation = { ...observed[0]!, type, controlKind: "native", temporal: undefined,
        informationRequirement: undefined, controlApplicationUrl: undefined,
        stableFieldKey: "education[0].custom.native", domHints: { fieldLabel: "就读时间", tagName: "INPUT", inputType: type },
        label: "教育背景 · 就读时间", labelPath: ["教育背景", "就读时间"] };
      const request = candidateInformationRequestForField(target)!;
      expect(request.type).toBe(type);
      expect(request.label).not.toMatch(/开始年份|开始月份|结束年份|结束月份/);
    }
  });

  it("keeps single dates, unidentified endpoints and field-owned custom questions unchanged", () => {
    const first = observed[0]!;
    for (const temporal of [
      { ...first.temporal!, layout: "year_month" as const },
      { ...first.temporal!, edge: "single" as const }
    ]) expect(candidateInformationRequestForField({ ...first, temporal })?.label)
      .toBe("教育背景 · 就读时间 · 年（第1条）");
    const custom = { ...first, label: "可提前实习时间 · 开始时间 · 年", temporal: { ...first.temporal!, scope: "field" as const } };
    expect(candidateInformationRequestForField(custom)?.label).toBe(custom.label);
    expect(candidateInformationRequestForField({ ...first, required: false })).toBeNull();
  });

  it("uses confirmed range metadata despite company-specific question wording and keeps real options", () => {
    const field = { ...observed[2]!, domHints: { ...observed[2]!.domHints, fieldLabel: "任意时间问题" }, options: ["2023", "2024"] };
    const request = candidateInformationRequestForField(field)!;
    expect(request.label).toBe("教育背景 · 任意时间问题（结束年份）（第1条）");
    expect(request.type).toBe("combobox");
    expect(request.options).toEqual(field.options);
  });
});
