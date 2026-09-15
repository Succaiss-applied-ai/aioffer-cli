import { describe, expect, it } from "vitest";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import {
  assessFieldInformation,
  fieldInformationRequirement,
  temporalFieldPartValue,
  withFieldInformationRequirements
} from "./field-information.js";
import { guardFieldInformation } from "./field-information-guard.js";
import {
  candidateInformationRequestForField, candidateInformationRequestsForMissingFields,
  candidateBlockingRequiredFieldFailures, deterministicKnownFactActions, visionFormReadyForFinalReview
} from "./vision-form-runtime.js";
import { autoApplyJobResultSchema } from "../../src/gateway/auto-apply-contract.js";
import { RecruitingError } from "../../src/errors.js";

const field = (input: Partial<PageFieldObservation> = {}): PageFieldObservation => ({
  fieldId: "field-20", stableFieldKey: "education.end_date.native", label: "教育经历 · 结束时间",
  selector: "#field", type: "text", controlKind: "native", required: true, options: [], currentValue: "",
  ...input
});
const page = (fields: PageFieldObservation[], url = "https://example.test/apply"): PageObservation => ({
  url, title: "申请表", loginRequired: false, loginReason: null, formDetected: true,
  fingerprint: "test", fields, actions: [], submitCandidates: [], validationMessages: [],
  transientBusy: false, observedAt: "2026-09-02T15:58:08.371Z"
});
const day = () => field({ domHints: { placeholder: "日期（年月日）" } });
const region = (level: "province" | "city" | "district") => field({
  stableFieldKey: "basic.native_place.native", label: "籍贯", sectionKey: "basic",
  informationRequirement: { kind: "region", level }
});

describe("date information precision", () => {
  it.each([
    ["date", null, "day"], ["month", null, "month"], ["text", "日期（年月日）", "day"],
    ["text", "YYYY-MM-DD", "day"], ["text", "YYYY/MM", "month"], ["text", "YYYY", "year"]
  ])("uses control-owned precision for %s / %s", (type, placeholder, precision) => {
    expect(fieldInformationRequirement(field({ type: type!, domHints: { placeholder } })))
      .toMatchObject({ kind: "date", precision });
  });
  it.each([
    ["2026", "insufficient", ["月", "日"]], ["2026-06", "insufficient", ["日"]],
    ["2026-06-30", "sufficient", []], ["2024-02-29", "sufficient", []],
    ["2026-02-29", "insufficient", ["有效日期"]], ["2026-13-01", "insufficient", ["有效日期"]]
  ])("assesses a complete-date control with %s", (value, status, missingParts) => {
    expect(assessFieldInformation(day(), value)).toMatchObject({ status, missingParts });
  });
  it("does not ask for a day on a month-only control or for a month on a year-only control", () => {
    const month = field({ type: "month" });
    expect(assessFieldInformation(month, "2026-06").status).toBe("sufficient");
    expect(assessFieldInformation(month, "2026").missingParts).toEqual(["月"]);
    expect(candidateInformationRequestForField(month)).toMatchObject({ type: "month", controlKind: "month" });
    const year = field({ domHints: { placeholder: "年" } });
    expect(assessFieldInformation(year, "2026").status).toBe("sufficient");
    expect(candidateInformationRequestForField(year)).toMatchObject({ type: "number", label: "教育经历 · 结束时间 · 年" });
  });
  it("accepts split parts and lets live day precision override stale month-part metadata", () => {
    const split = field({ temporal: { groupKey: "education", layout: "year_month", edge: "end", part: "month" } });
    expect(assessFieldInformation(split, "6").status).toBe("sufficient");
    expect(assessFieldInformation(split, "13").status).toBe("insufficient");
    expect(assessFieldInformation(split, "6年").status).toBe("insufficient");
    expect(assessFieldInformation(field({ domHints: { placeholder: "年" } }), "2026月").status).toBe("insufficient");
    expect(assessFieldInformation({ ...split, domHints: { placeholder: "YYYY-MM-DD" } }, "2026-06").missingParts)
      .toEqual(["日"]);
  });
  it("projects complete candidate dates onto split Moka year and month controls", () => {
    const temporal = (part: "year" | "month") => field({
      temporal: { groupKey: "education-study-time", layout: "year_month_range", edge: "end", part }
    });
    expect(temporalFieldPartValue(temporal("year"), "2026-06-30")).toBe("2026");
    expect(temporalFieldPartValue(temporal("month"), "2026-06-30")).toBe("6");
    expect(temporalFieldPartValue(temporal("month"), "06月")).toBe("6");
    expect(temporalFieldPartValue(temporal("month"), "2026")).toBeNull();
  });
  it("preserves the original graduation label and repeat-row identity in the request", () => {
    expect(candidateInformationRequestForField({
      ...day(), groupIndex: 1, stableFieldKey: "education.end_date.native#1",
      labelPath: ["教育背景", "教育经历", "结束时间"],
      domHints: { placeholder: "日期（年月日）", fieldLabel: "毕业时间" }
    })).toMatchObject({ label: "教育背景 · 教育经历 · 毕业时间（第2条）", groupIndex: 1, stableFieldKey: "education.end_date.native#1" });
  });
  it("does not confuse a required dated fact with a consent checkbox", () => {
    const datedFact = { ...day(), label: "协议签署日期" };
    expect(candidateInformationRequestForField(datedFact)).toMatchObject({ type: "date", required: true });
    expect(candidateInformationRequestForField(field({ label: "同意隐私协议", type: "checkbox" }))).toBeNull();
  });
});

describe("province/city/district information precision", () => {
  it.each([
    ["province", "广东省", "sufficient"], ["province", "深圳市", "insufficient"],
    ["city", "广东", "insufficient"], ["city", "广东省", "insufficient"],
    ["city", "深圳市", "insufficient"], ["city", "深圳市/南山区", "insufficient"],
    ["city", "广东/南山区", "insufficient"], ["city", "广东/广东", "insufficient"],
    ["city", "广东省/深圳市", "sufficient"], ["city", "广东 深圳", "sufficient"],
    ["city", "广东深圳", "sufficient"], ["city", "广西壮族自治区/南宁市", "sufficient"],
    ["district", "广东省/深圳市", "insufficient"],
    ["district", "广东省/深圳市/南山区", "sufficient"], ["district", "广东省深圳市南山区", "sufficient"],
    ["city", "北京市", "sufficient"], ["district", "上海市", "insufficient"],
    ["district", "上海市/浦东新区", "sufficient"], ["district", "上海市/上海市/浦东新区", "sufficient"]
  ] as const)("%s granularity / %s => %s", (level, value, status) => {
    expect(assessFieldInformation(region(level), value).status).toBe(status);
  });
  it("only requires the explicit depth, and honors an optional district", () => {
    expect(fieldInformationRequirement(field({ domHints: { placeholder: "请选择省份" } })))
      .toEqual({ kind: "region", level: "province" });
    expect(fieldInformationRequirement(field({ domHints: { placeholder: "省/市" } })))
      .toEqual({ kind: "region", level: "city" });
    expect(fieldInformationRequirement(field({ domHints: { placeholder: "省/市/区" } })))
      .toEqual({ kind: "region", level: "district" });
    expect(fieldInformationRequirement(field({ domHints: { placeholder: "请选择省份/城市/区县" } })))
      .toEqual({ kind: "region", level: "district" });
    expect(fieldInformationRequirement(field({ domHints: { placeholder: "省市区（区县选填）" } })))
      .toEqual({ kind: "region", level: "city" });
  });
  it.each(["出生日期", "结束时间", "籍贯", "所在地", "意向工作城市", "部门/团队", "省市区"])(
    "does not guess a generic control's depth from its label: %s", label => {
      expect(assessFieldInformation(field({ label }), "测试").status).toBe("unknown");
    }
  );
});

describe("missing-information routing and resumption", () => {
  it.each([day(), region("city"), region("district")])("blocks before UI interaction for $label", target => {
    const value = target.informationRequirement?.kind === "region" ? "广东省" : "2026-06";
    const facts = { [`job.requiredField.stable:${target.stableFieldKey}`]: value };
    expect(deterministicKnownFactActions(page([target]), facts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields([target], facts)).toHaveLength(1);
    try {
      guardFieldInformation(target, value);
      expect.unreachable("required incomplete information must stop before any Driver");
    } catch (error) {
      expect(error).toBeInstanceOf(RecruitingError);
      expect((error as RecruitingError).publicError).toMatchObject({
        code: "MISSING_INFORMATION", stage: "missing_information", retryable: false,
        details: { requiredFieldRequests: [expect.objectContaining({ reasonCode: "candidate_information_missing" })] }
      });
    }
  });
  it("does not treat a nonempty partial value as ready for final review", () => {
    for (const target of [{ ...day(), currentValue: "2026-06" }, { ...region("district"), currentValue: "广东/深圳" }]) {
      expect(visionFormReadyForFinalReview(page([target]))).toBe(false);
      expect(candidateBlockingRequiredFieldFailures([target], {})).toEqual([target]);
      expect(candidateInformationRequestsForMissingFields([target], {})).toHaveLength(1);
    }
  });
  it("resumes only after complete confirmation and keeps real interaction failures distinct", () => {
    const target = day();
    const facts = { "job.requiredField.stable:education.end_date.native": "2026-06-30" };
    expect(guardFieldInformation(target, "2026-06-30")).toBeNull();
    expect(deterministicKnownFactActions(page([target]), facts)).toHaveLength(1);
    // The field is still blank after an interaction failure, but the package
    // already contains a complete answer: do not ask the user for it again.
    expect(candidateInformationRequestsForMissingFields([target], facts)).toEqual([]);
    const partial = { ...target, currentValue: "2026-06" };
    expect(deterministicKnownFactActions(page([partial]), { "resume.education.0.endDate": "2026-06-30" })).toHaveLength(1);
  });
  it("does not clear a complete manual value or block for incomplete optional data", () => {
    expect(guardFieldInformation({ ...day(), currentValue: "2026-06-30" }, "2026-06"))
      .toMatchObject({ success: true, actual: "2026-06-30" });
    const optional = { ...day(), required: false };
    expect(guardFieldInformation(optional, "2026-06"))
      .toMatchObject({ error: expect.stringContaining("optional_field_information_incomplete") });
    expect(candidateInformationRequestsForMissingFields([optional], {})).toEqual([]);
  });
  it.each(["province", "city", "district"] as const)("preserves region depth %s through the Gateway", level => {
    const request = candidateInformationRequestForField(region(level))!;
    const payload = {
      schemaVersion: "auto-apply-job-result.v1", batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222", jobId: "job-1", status: "waiting_for_user_action",
      occurredAt: "2026-09-02T15:58:08.371Z", reasonCode: "missing_information",
      evidence: { redacted: true, requiredFieldRequests: [request] }
    };
    expect(autoApplyJobResultSchema.parse(payload).evidence?.requiredFieldRequests?.[0])
      .toEqual(request);
    expect(autoApplyJobResultSchema.safeParse({ ...payload,
      evidence: { redacted: true, requiredFieldRequests: [{ ...request, regionLevel: "street" }] }
    }).success).toBe(false);
  });
  it("uses only a matching registered tenant/control contract", () => {
    const birth = field({ label: "出生日期", stableFieldKey: "basic.birth_date.native", domHints: {
      tagName: "INPUT", readOnly: true, placeholder: "出生日期 (年龄)",
      classNames: ["day_info", "sd-Dropdown-container-1CigZ"]
    } });
    const url = "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/example/apply";
    expect(withFieldInformationRequirements(page([birth], url)).fields[0]?.informationRequirement)
      .toEqual({ kind: "date", precision: "day" });
    expect(withFieldInformationRequirements(page([birth], url.replace("tap4fun/291", "other/1"))).fields[0]?.informationRequirement)
      .toBeUndefined();
    const previousTenant = withFieldInformationRequirements(page([birth], url));
    expect(withFieldInformationRequirements({ ...previousTenant, url: url.replace("tap4fun/291", "other/1") })
      .fields[0]?.informationRequirement).toBeUndefined();
    const nativePlace = { ...region("city"), informationRequirement: undefined, domHints: {
      tagName: "INPUT", readOnly: true, placeholder: "籍贯", classNames: ["sd-Dropdown-container-1CigZ", "location_info-test"]
    } };
    expect(withFieldInformationRequirements(page([nativePlace], url)).fields[0]?.informationRequirement)
      .toEqual({ kind: "region", level: "city" });
  });
});
