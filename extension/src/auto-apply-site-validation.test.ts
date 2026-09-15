import { AutoApplySubmissionGuardTimeoutError } from "./auto-apply-submit-lifecycle.js";
import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import { bindObservedInstruction } from "./control-adapters/field-routing.js";
import { transformSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import {
  autoApplyFillObservation, isSiteManagedDisabledField, isUnconfirmedFieldReadback, newlySiteRejectedFields, newSiteValidationErrors,
  partitionSiteRejectedFields, persistedPreviouslyRejectedFields, persistedRequiredEmptyRejections, requireUniqueFinalSubmitAction, siteRepairReadbackFailures, siteRejectedFields,
  siteValidationFieldKey, siteValidationStateKey, rejectedSubmissionFields, submissionRejectedFields
} from "./auto-apply-site-validation.js";
import {
  candidateBlockingRequiredFieldFailures, candidateInformationRequestsForFields, siteRejectedInformationRequests,
  candidateInformationRequestsForMissingFields, nextDeterministicKnownFactAction,
  optionalFieldEnrichmentPending, visionFormReadyForFinalReview,
  visionObservationStateFingerprint, visionPlanningObservation, authoritativeCandidateFactForField,
  confirmedCurrentJobFactForField, isVisionValueTraceable, visualSemanticConflict, findDynamicReadbackField,
  visionReadbackMatches, visualFieldFailureBlocksSubmission, thirdPartyIdentityCollision, isThirdPartyPersonField,
  isPhoneCallingCodeField, phoneCallingCodeReadbackMatches
} from "./vision-form-runtime.js";
import { controlAdapterFailureDetails, isUnsupportedRequiredControlFailure } from "./control-adapters/failures.js";
import { registerVisionFieldAttempt, iterativeVisionPolicy, enrichVisionCandidateFacts } from "./vision-form-runtime.js";
import { isInvalidVisionPlanWarning } from "./vision-plan-failure.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { registeredControlReadbackMatches } from "./control-adapters/readback-policy.js";
import { RecruitingError, toPublicError } from "../../src/errors.js";
import { nativeSubmitValidationProbeInPage, reassertedSubmitValidationProbeInPage } from "./submit-validation-probe.js";
import { readSiteApplicationPolicyBlockInPage } from "./site-application-policy.js";
import { beginAutoApplySubmission, beginSingleAutomaticSiteValidationRepair, createAutoApplyPageSession, resumeAutoApplyAfterSiteValidation, updateAutoApplyPageSession, canResumeAutoApplyAfterSiteValidation } from "./auto-apply-page-session.js";
import { observedFieldHasValue } from "./form-validation.js";
import { siteRejectedUploadError } from "./site-upload-rejection.js";
import { readApplicationReceiptInPage } from "./application-receipt.js";
import { submissionActionPatterns, isPreviewSubmissionText } from "./submission-action-policy.js";
import { prepareScopedWorkCityChoices } from "./preferred-city-preflight.js";
import {
  confirmedFinalSubmitCaptcha, createFinalSubmitCaptchaObservation,
  observeFinalSubmitCaptcha, pendingFinalSubmitCaptchaAtDeadline
} from "./final-submit-captcha-arbitration.js";

const field = (patch: Partial<PageFieldObservation> = {}): PageFieldObservation => ({
  fieldId: "field-1", stableFieldKey: "basic.employee_relation.native", selector: "#relation",
  label: "关系人姓名", type: "text", controlKind: "native", required: true,
  currentValue: "", options: [], validationMessage: null, ...patch
});
const observation = (fields: PageFieldObservation[] = [field()]): PageObservation => ({
  url: "https://app.mokahr.com/campus-recruitment/canrui/42687#/job/test-job/apply",
  title: "申请表", pageStage: "application_form", pageStageEvidence: [], loginRequired: false,
  loginReason: null, formDetected: true, jobDetailDetected: false, fingerprint: "form",
  pageStateFingerprint: "form", fields, actions: [{ actionId: "submit", selector: "#submit",
    text: "预览并提交", kind: "final_submit", risk: "user_only", disabled: false, context: "" }],
  submitCandidates: ["预览并提交"], validationMessages: [], transientBusy: false, observedAt: "now"
});

describe("site-driven automatic submission scope", () => {
  it("reports disabled submission without guessing missing facts or forcing the button", () => {
    const current = observation();
    current.actions[0]!.disabled = true;
    expect(() => requireUniqueFinalSubmitAction(current)).toThrow("禁用了最终提交按钮");
    expect(current.actions[0]!.disabled).toBe(true);
    expect(() => requireUniqueFinalSubmitAction({ ...current, actions: [] })).toThrow("不唯一或不存在");
    expect(() => requireUniqueFinalSubmitAction({ ...observation(), actions: [observation().actions[0]!, observation().actions[0]!] }))
      .toThrow("不唯一或不存在");
  });

  it("does not treat a lost known-answer control as evidence that the site no longer requires it", () => {
    const name = field({ label: "姓名", stableFieldKey: "basic.full_name.native" });
    expect(siteRepairReadbackFailures([name], observation([]), { "candidate.basic.fullName": "测试姓名" })).toEqual([name]);
  });
  it("defers an unknown required answer without changing the original form or inventing data", () => {
    const current = observation();
    const scoped = autoApplyFillObservation(current, {});
    expect(scoped.fields).toEqual([]);
    expect(current.fields[0]).toMatchObject({ required: true, currentValue: "" });
    expect(visionFormReadyForFinalReview(scoped)).toBe(true);
    expect(siteRejectedFields(current)).toEqual([]);
  });

  it("still plans available required facts through the existing deterministic driver path", () => {
    const current = observation([field({ label: "姓名", stableFieldKey: "basic.full_name.native" })]);
    const facts = { "candidate.basic.fullName": "测试姓名" };
    const scoped = autoApplyFillObservation(current, facts);
    expect(scoped.fields).toEqual(current.fields);
    expect(nextDeterministicKnownFactAction(scoped, facts)?.value).toBe("测试姓名");
    expect(visionFormReadyForFinalReview(scoped)).toBe(false);
  });

  it("skips a disabled Moka parser value even when it differs from the information package", () => {
    const graduationYear = field({
      label: "教育背景 · 毕业时间 · 年",
      stableFieldKey: "education[0].end_date.combobox#0",
      type: "combobox",
      controlKind: "combobox",
      currentValue: "2021",
      domHints: { disabled: true, readOnly: true }
    });
    const facts = { "resume.education.0.endDate": "2022-06" };
    expect(isSiteManagedDisabledField(graduationYear)).toBe(true);
    expect(autoApplyFillObservation(observation([graduationYear]), facts).fields).toEqual([]);
    expect(nextDeterministicKnownFactAction(observation([graduationYear]), facts)).toBeNull();
    expect(candidateBlockingRequiredFieldFailures([graduationYear], facts)).toEqual([]);
    expect(visionPlanningObservation(observation([graduationYear]), new Set(), { candidateFacts: facts }).fields)
      .toEqual([]);
  });

  it("does not confuse an operational readonly custom control with disabled", () => {
    const customName = field({
      label: "姓名",
      stableFieldKey: "basic.full_name.combobox",
      type: "combobox",
      controlKind: "combobox",
      currentValue: "旧解析值",
      domHints: { disabled: false, readOnly: true }
    });
    const facts = { "candidate.basic.fullName": "测试姓名" };
    expect(isSiteManagedDisabledField(customName)).toBe(false);
    expect(autoApplyFillObservation(observation([customName]), facts).fields).toEqual([customName]);
    expect(nextDeterministicKnownFactAction(observation([customName]), facts)?.value).toBe("测试姓名");
  });

  it("keeps the no-optional-enrichment boundary", () => {
    const current = observation([field({ required: false, label: "姓名", stableFieldKey: "basic.full_name.native" })]);
    expect(autoApplyFillObservation(current, { "candidate.basic.fullName": "测试姓名" }).fields).toEqual([]);
  });

  it("repairs only site-rejected fields, including a newly required optional field", () => {
    const rejected = field({ required: false, validationMessage: "请填写关系人姓名" });
    const other = field({ fieldId: "field-2", selector: "#other", stableFieldKey: "other" });
    const current = observation([rejected, other]);
    const targets = siteRejectedFields(current);
    expect(targets).toEqual([{ ...rejected, required: true }]);
    const scoped = autoApplyFillObservation(current, {}, new Set(targets.map(siteValidationFieldKey)));
    expect(scoped.fields).toEqual(targets);
    expect(candidateInformationRequestsForFields(targets).map((request) => request.label)).toEqual(["关系人姓名"]);
  });

  it("never classifies a disabled site-rejected field as repairable or missing user information", () => {
    const locked = field({ label: "教育背景 · 毕业时间 · 年", currentValue: "2021",
      validationMessage: "招聘网站未接受", domHints: { disabled: true } });
    const current = observation([locked]);
    const keys = new Set([siteValidationFieldKey(locked)]);
    expect(partitionSiteRejectedFields(current, { "resume.education.0.endDate": "2022-06" }, keys))
      .toEqual({ repairable: [], missing: [], locked: [{ ...locked, required: true }] });
    expect(autoApplyFillObservation(current, { "resume.education.0.endDate": "2022-06" }, keys).fields)
      .toEqual([]);
    expect(siteRepairReadbackFailures([locked], current, { "resume.education.0.endDate": "2022-06" }))
      .toEqual([]);
  });

  it("does not hide an explicit site error on an optional repeat template", () => {
    const current = observation([field({ label: "实习经历 · 公司名称", sectionKey: "internship",
      stableFieldKey: "internship[0].company.native", validationMessage: "必填项未填写" })]);
    const scoped = autoApplyFillObservation(current, {}, new Set(current.fields.map(siteValidationFieldKey)));
    expect(visionPlanningObservation(scoped, new Set(), { candidateFacts: {}, siteValidationRepair: true }).fields)
      .toHaveLength(1);
  });

  it("detects a new field-owned rejection but not an empty required field or a stale error", () => {
    const before = observation();
    expect(newSiteValidationErrors(before, observation())).toEqual([]);
    const rejected = observation([field({ validationMessage: "请填写关系人姓名" })]);
    expect(newSiteValidationErrors(before, rejected)).toEqual(["关系人姓名：请填写关系人姓名"]);
    expect(newSiteValidationErrors(rejected, rejected)).toEqual([]);
  });

  it("does not interpret navigation, success, login or a newly rendered page as a validation retry", () => {
    const before = observation();
    const rejected = observation([field({ validationMessage: "必填项未填写" })]);
    expect(newSiteValidationErrors(before, { ...rejected, url: "https://careers.example/thanks" })).toEqual([]);
    expect(newSiteValidationErrors(before, { ...rejected, pageStage: "login" })).toEqual([]);
  });

  it("does not expand repair scope to stale errors when a different field is newly rejected", () => {
    const stale = field({ validationMessage: "旧错误" });
    const fresh = field({ fieldId: "field-2", stableFieldKey: "other", selector: "#other", validationMessage: "新错误" });
    const before = observation([stale, { ...fresh, validationMessage: null }]);
    expect(newlySiteRejectedFields(before, observation([stale, fresh]))).toEqual([fresh]);
  });

  it("retains only an unchanged field-owned required error whose control is still empty", () => {
    const empty = field({ validationMessage: "必填项未填写 / Required items are not filled in" });
    const filled = field({ fieldId: "city", selector: "#city", stableFieldKey: "intention.city.combobox",
      currentValue: "上海市 / Shanghai", validationMessage: "必填项未填写 / Required items are not filled in" });
    const unrelated = field({ fieldId: "other", selector: "#other", stableFieldKey: "other.native",
      validationMessage: "页面原有错误" });
    const before = observation([empty, filled, unrelated]);
    expect(persistedRequiredEmptyRejections(before, before)).toEqual([empty]);
  });

  it("retains Formily's unchanged field-name required sentence and shares it across submit monitors", () => {
    const name = field({ label: "姓名", stableFieldKey: "basic.full_name.native", validationMessage: "姓名为必填" });
    const degree = field({ fieldId: "degree", selector: "#degree", label: "学历",
      stableFieldKey: "education[0].degree.combobox", type: "combobox", controlKind: "combobox",
      validationMessage: "学历为必填" });
    const current = observation([name, degree]);
    expect(persistedRequiredEmptyRejections(current, current)).toEqual([name, degree]);
    expect(submissionRejectedFields(current, current).map(siteValidationFieldKey)).toEqual([
      "basic.full_name.native", "education[0].degree.combobox"
    ]);
  });

  it("retains an unchanged nonempty rejection only inside the frozen second-submit scope", () => {
    const rejected = field({ currentValue: "已复填值", validationMessage: "网站仍未接受" });
    const other = field({ fieldId: "other", selector: "#other", stableFieldKey: "other.native",
      currentValue: "旧值", validationMessage: "页面原有错误" });
    const current = observation([rejected, other]);
    expect(persistedPreviouslyRejectedFields(
      current, current, new Set([siteValidationFieldKey(rejected)])
    )).toEqual([rejected]);
    expect(persistedPreviouslyRejectedFields(current, current, new Set())).toEqual([]);
  });

  it("ignores transient DOM identities in the no-progress guard", () => {
    const before = observation([field({ validationMessage: "必填项未填写" })]);
    const rebuilt = observation([field({ fieldId: "field-99", selector: "#rebuilt", validationMessage: "必填项未填写" })]);
    expect(siteValidationStateKey(before)).toBe(siteValidationStateKey(rebuilt));
    expect(newSiteValidationErrors(before, rebuilt)).toEqual([]);
  });
});

// Execute the production functions, not a hand-maintained copy of their gates.
const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
function productionFunction(name: string, end: string, dependencies: Record<string, unknown>) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  const stop = source.indexOf(end, start);
  if (start < 0 || stop < start) throw new Error(`Missing production function ${name}`);
  const js = transformSync(source.slice(start, stop), { loader: "ts", target: "es2022" }).code;
  const imports = {
    bindObservedInstruction,
    prepareScopedWorkCityChoices,
    isSiteManagedDisabledField,
    isInvalidVisionPlanWarning,
    resolveSoleMokaPreferredLocationOption: vi.fn(async () => null),
    mokaYearMonthPairIdentity: vi.fn(() => null),
    MOKA_LOCATION_DRIVER_CODES: new Set(["moka.zte.location.trusted-focus.v1"]),
    ...dependencies
  };
  return new Function(...Object.keys(withInterruptionDependencies(imports)), `${js}; return ${name};`)(...Object.values(withInterruptionDependencies(imports)));
}

describe("production source-fill convergence", () => {
  const sourceField = field({ stableFieldKey: "other.recruiting_source.combobox", label: "请选择信息来源渠道",
    type: "combobox", controlKind: "combobox", options: ["公司官网", "校园招聘"] });
  // The failing user's persisted answer predates the stable source slot.
  const facts = { "profile.requiredField.stableLabel:other.请选择.combobox:请选择信息来源渠道": "公司官网" };

  it("never migrates an unlabeled/foreign legacy answer to the source field", () => {
    for (const legacy of [
      { "profile.requiredField.stableLabel:other.请选择.combobox:是否接受调剂": "是" },
      { "job.requiredField.stable:other.请选择.combobox": "公司官网" },
      { "profile.requiredField.stableLabel:work[0].请选择.combobox:请选择信息来源渠道": "公司官网" }
    ]) expect(authoritativeCandidateFactForField(sourceField, legacy)).toBeNull();
  });

  it("migrates a job-bound legacy source answer without widening its job/row authority", () => {
    const profile = { facts: [{ source: "user_confirmed", label: sourceField.label, value: "公司官网",
      stableFieldKeys: ["other.请选择.combobox"],
      fieldBinding: { jobId: "job-current", stableFieldKey: "other.请选择.combobox", sectionKey: "other", groupIndex: null }
    }] };
    const current = { ...sourceField, sectionKey: "other", groupIndex: null };
    const matching = enrichVisionCandidateFacts({}, {}, { jobId: "job-current" }, profile);
    expect(authoritativeCandidateFactForField(current, matching)?.value).toBe("公司官网");
    expect(authoritativeCandidateFactForField(current,
      enrichVisionCandidateFacts({}, {}, { jobId: "job-other" }, profile))).toBeNull();
    expect(authoritativeCandidateFactForField({ ...current, groupIndex: 1 }, matching)).toBeNull();
    expect(Object.keys(matching).filter(key => /profile\.(?:semantic:|requiredField.label:)/.test(key))).toEqual([]);
  });

  it("fails closed when legacy and canonical profile answers conflict", () => {
    expect(() => authoritativeCandidateFactForField(sourceField, { ...facts,
      "profile.requiredField.stableLabel:other.recruiting_source.combobox:请选择信息来源渠道": "校园招聘"
    })).toThrow("无法唯一关联");
  });

  async function run(after: PageObservation, result: { success: boolean; error: string | null; driverStage?: string },
    planOverride?: { configured: false; warnings: string[] }) {
    const adapter = resolveControlAdapter({ applicationUrl: observation().url,
      label: sourceField.label, semanticKey: Object.keys(facts)[0]!, type: "text", controlKind: "combobox",
      tagName: "INPUT", readOnly: false, placeholder: "请选择",
      classNames: ["sd-Input-input-10L0t", "sd-Select-container-1Eq4x", "sd-Dropdown-container-1CigZ"] });
    expect(adapter.code).toBe("moka.recruiting-source.trusted-focus.v1");
    const driver = vi.fn(async () => ({ fieldId: sourceField.fieldId, expected: "公司官网", actual: "公司官网",
      controlAdapter: adapter.diagnostic, ...result }));
    const model = vi.fn(() => {
      if (planOverride) return planOverride;
      throw new Error("must not ask the model after the source action");
    });
    const fill = productionFunction("fillAutoApplyFormWithVision", "async function executeFinalSubmitWithDebugger(", {
      autoApplyFillObservation, siteValidationFieldKey, isUnconfirmedFieldReadback,
      visionPlanningObservation, nextDeterministicKnownFactAction: planOverride ? () => null : nextDeterministicKnownFactAction,
      candidateBlockingRequiredFieldFailures,
      candidateInformationRequestsForMissingFields, optionalFieldEnrichmentPending, visionFormReadyForFinalReview,
      authoritativeCandidateFactForField, confirmedCurrentJobFactForField, isVisionValueTraceable,
      visualSemanticConflict, observedFieldHasValue, visionReadbackMatches, findDynamicReadbackField,
      registerVisionFieldAttempt, registeredControlReadbackMatches, RecruitingError,
      controlExecutionError: productionFunction("controlExecutionError", "async function executeApplicationFillInstructions(", {
        RecruitingError, controlAdapterFailureDetails, isUnsupportedRequiredControlFailure
      }),
      withDiscoveredRequiredFieldOptions: async (_tab: number, fields: PageFieldObservation[]) => fields,
      redactedEvidence: async () => ({ screenshotDataUrl: null }), iterativeVisionPolicy,
      detectAutoApplyUserAction: async () => null, assertApplicationFormStage: () => undefined,
      criticalVisualReadbackFailures: () => [], stableApplicationObservation: async () => after,
      summarizeVisionDiagnosticValue: () => null, planAutoApplyVision: model,
      instructionFromObservedField: (field: PageFieldObservation, value: string, semanticKey: string) => ({
        value, semanticKey, fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
        selector: field.selector, type: field.type, expectedLabel: field.label
      }),
      applicationDomMutationState: async () => ({ version: 1 }), executeMokaFillInstructionWithDebugger: driver,
      settleApplicationDomAfterFill: async () => ({ changed: true }), isMokaPreferredLocationField: () => false,
      isUnsupportedRequiredControlFailure: () => false, isDateControlInteractionFailure: () => false,
      isMokaFlatSelectOptionUnavailable: () => false, isMokaFlatSelectInteractionFailure: () => false,
      isMokaRecruitingSourceOptionUnavailable: () => false, isMokaRecruitingSourceInteractionFailure: () => false,
      isMokaLocationOptionUnavailable: () => false, isMokaLocationInteractionFailure: () => false
    });
    let output, error;
    try { output = await fill({ tabId: 7, initialObservation: observation([sourceField]), candidateFacts: facts }); }
    catch (caught) { error = caught; }
    expect(driver).toHaveBeenCalledTimes(planOverride ? 0 : 1);
    expect(model).toHaveBeenCalledTimes(planOverride ? 1 : 0);
    return { output, error: error as RecruitingError | undefined };
  }

  it("reuses the old confirmed answer and finishes after fresh committed readback, without a model call", async () => {
    const after = observation([{ ...sourceField, currentValue: "公司官网" }]);
    const { output, error } = await run(after, { success: true, error: null });
    expect(error).toBeUndefined();
    expect(output.readback).toMatchObject([{ success: true, actual: "公司官网" }]);
    expect(output.observation).toEqual(after);
  });

  it.each([
    ["missing target", observation([])],
    ["ambiguous stable identity", observation([{ ...sourceField, currentValue: "公司官网" },
      { ...sourceField, fieldId: "duplicate", selector: "#duplicate", currentValue: "公司官网" }])],
    ["recycled ordinal", observation([field({ label: "姓名", currentValue: "公司官网" })])]
  ])("preserves the first field failure for %s instead of masking it with a model failure", async (_name, after) => {
    const { error, output } = await run(after as PageObservation, { success: true, error: null });
    expect(output).toBeUndefined();
    expect(error?.publicError).toMatchObject({ code: "SITE_VALIDATION_BLOCKED", retryable: false,
      details: { reasonCode: "field_fill_readback_failed", fieldLabel: sourceField.label } });
  });

  it("does not promote a driver's execution failure into success just because the display matches", async () => {
    const { error } = await run(observation([{ ...sourceField, currentValue: "公司官网" }]),
      { success: false, driverStage: "interaction", error: "trusted_pointer_failed" });
    expect(error?.publicError).toMatchObject({ code: "SITE_VALIDATION_BLOCKED" });
    expect(error?.message).toContain("trusted_pointer_failed");
  });

  it("returns a field-specific failed result to AI Offer without reclassifying it as missing information", async () => {
    const { error } = await run(observation([]), { success: true, error: null });
    class OtherError extends Error {}
    const classify = productionFunction("autoApplyFailureStatus", "function hasMokaLocationOptionUnavailableDetails(", {
      AutoApplyCancelledError: OtherError, AutoApplyCommandExpiredError: OtherError,
      AutoApplyDeviceRequestTimeoutError: OtherError, AutoApplyUserActionRequiredError: OtherError, toPublicError
    });
    expect(classify(error)).toEqual({ status: "failed", reasonCode: "field_fill_readback_failed" });
    const diagnostic = productionFunction("autoApplyDiagnostic", "function candidateFactByKey(", {
      requiredControlUnconfirmedLabels: () => []
    });
    expect(diagnostic("field_fill_readback_failed", error?.publicError.details)).toMatchObject({
      category: "page", stage: "form_fill", retryable: false,
      userMessage: expect.stringContaining(sourceField.label)
    });
    const classification = source.slice(source.indexOf("const preserveFieldInteractionFailureClassification ="),
      source.indexOf("if (requiredFieldRequests.length > 0 &&"));
    expect(classification).toContain('"field_fill_readback_failed"');
    expect(classification).toContain('"model_response_invalid"');
  });

  it("still defers empty unconfirmed readback to site validation without claiming success", async () => {
    const { output, error } = await run(observation([sourceField]),
      { success: false, driverStage: "readback", error: "readback_unconfirmed" });
    expect(error).toBeUndefined();
    expect(output.readback).toMatchObject([{ success: false }]);
  });

  it.each([
    ["Expected ',' or ']' after array element in JSON at position 2644 (line 699 column 1)", "MODEL_RESPONSE_INVALID", false],
    ["request timed out", "VISION_SERVICE_UNAVAILABLE", true]
  ])("classifies %s without retrying the model or writing a field", async (warning, code, retryable) => {
    const { error } = await run(observation([sourceField]), { success: true, error: null },
      { configured: false, warnings: [`zhencai 视觉模型规划失败：${warning}`] });
    expect(error?.publicError).toMatchObject({ code, retryable });
  });
});

describe("production pre-submit gate", () => {
  const run = (current: PageObservation, critical: string[] = []) => productionFunction(
    "stablePreSubmitObservation", "function sanitizedVisionDiagnosticLabels(", {
      commitApplicationFormBlurBeforePreSubmit: vi.fn(async () => undefined),
      stableApplicationObservation: vi.fn(async () => current),
      assertApplicationFormStage: (page: PageObservation) => {
        if (page.pageStage !== "application_form") throw new Error("not application form");
      },
      criticalVisualReadbackFailures: () => critical,
      visionObservationStateFingerprint, RecruitingError,
      setTimeout: (callback: () => void) => callback()
    }
  )(7, {});

  it("allows the first authorized attempt despite predicted missing fields or existing site messages", async () => {
    const current = observation([field({ validationMessage: "请选择" })]);
    current.validationMessages = ["请填写必填项"];
    await expect(run(current)).resolves.toEqual(current);
  });

  it("does not run a second field audit, but still requires an application page", async () => {
    await expect(run(observation(), ["姓名 回读不一致"])).resolves.toEqual(observation());
    await expect(run({ ...observation(), pageStage: "login" })).rejects.toThrow("not application form");
    await expect(run({ ...observation(), transientBusy: true })).resolves.toMatchObject({ transientBusy: true });
  });
});

describe("production initial filling boundary", () => {
  it("reaches final review without a model request or missing-information failure for unknown required facts", async () => {
    const current = observation();
    const model = vi.fn(() => { throw new Error("model must not invent an unknown required answer"); });
    const fill = productionFunction("fillAutoApplyFormWithVision", "async function executeFinalSubmitWithDebugger(", {
      autoApplyFillObservation, siteValidationFieldKey, visionPlanningObservation, nextDeterministicKnownFactAction,
      candidateBlockingRequiredFieldFailures, candidateInformationRequestsForMissingFields,
      optionalFieldEnrichmentPending, visionFormReadyForFinalReview,
      detectAutoApplyUserAction: async () => null,
      assertApplicationFormStage: () => undefined,
      criticalVisualReadbackFailures: () => [],
      stableApplicationObservation: async () => current,
      planAutoApplyVision: model
    });
    const result = await fill({ tabId: 7, initialObservation: current, candidateFacts: {} });
    expect(result).toEqual({ observation: current, readback: [], attempts: [] });
    expect(model).not.toHaveBeenCalled();
  });
});

describe("production phone calling-code action readback", () => {
  async function run(input: {
    currentValue: string;
    queryValue: string;
    confirmed?: string;
    driverSuccess?: boolean;
    disabled?: boolean;
  }) {
    const callingCode = field({
      fieldId: "calling-code",
      stableFieldKey: "basic.phone.combobox",
      selector: "#calling-code",
      label: "手机号码",
      type: "combobox",
      controlKind: "combobox",
      required: false,
      currentValue: input.currentValue,
      domHints: input.disabled ? { disabled: true } : undefined,
      compound: {
        kind: "phone_number",
        role: "calling_code",
        groupKey: "#phone-field",
        queryValue: input.queryValue
      }
    });
    const facts = input.confirmed === undefined ? {} : {
      [`job.requiredField.stable:${callingCode.stableFieldKey}`]: input.confirmed
    };
    let current = observation([callingCode]);
    const driver = vi.fn(async (_tab: number, _page: PageObservation, target: PageFieldObservation,
      instruction: { value: string; optionSelectionPolicy?: string }) => {
      expect(instruction.optionSelectionPolicy).toMatch(/^phone_calling_code_/u);
      current = observation([{ ...target, currentValue: instruction.value,
        compound: { ...target.compound!, queryValue: "" } }]);
      return { fieldId: target.fieldId, expected: instruction.value, actual: instruction.value,
        success: input.driverSuccess !== false,
        error: input.driverSuccess === false ? "trusted_driver_failed" : null };
    });
    const fill = productionFunction("fillAutoApplyFormWithVision", "async function executeFinalSubmitWithDebugger(", {
      autoApplyFillObservation, siteValidationFieldKey, isUnconfirmedFieldReadback,
      visionPlanningObservation, nextDeterministicKnownFactAction,
      candidateBlockingRequiredFieldFailures, candidateInformationRequestsForMissingFields,
      optionalFieldEnrichmentPending, visionFormReadyForFinalReview,
      authoritativeCandidateFactForField, confirmedCurrentJobFactForField, isVisionValueTraceable,
      visualSemanticConflict, observedFieldHasValue, visionReadbackMatches,
      isPhoneCallingCodeField, phoneCallingCodeReadbackMatches,
      findDynamicReadbackField, registerVisionFieldAttempt, registeredControlReadbackMatches,
      RecruitingError, detectAutoApplyUserAction: async () => null,
      assertApplicationFormStage: () => undefined,
      criticalVisualReadbackFailures: () => [], stableApplicationObservation: async () => current,
      summarizeVisionDiagnosticValue: () => null,
      instructionFromObservedField: (target: PageFieldObservation, value: string, semanticKey: string) => ({
        value, semanticKey, fieldId: target.fieldId, stableFieldKey: target.stableFieldKey,
        selector: target.selector, type: target.type, expectedLabel: target.label
      }),
      applicationDomMutationState: async () => ({ version: 1 }),
      executeMokaFillInstructionWithDebugger: driver,
      settleApplicationDomAfterFill: async () => ({ changed: true }),
      isUnsupportedRequiredControlFailure: () => false,
      isDateControlInteractionFailure: () => false,
      isMokaFlatSelectOptionUnavailable: () => false,
      isMokaFlatSelectInteractionFailure: () => false,
      isMokaRecruitingSourceOptionUnavailable: () => false,
      isMokaRecruitingSourceInteractionFailure: () => false,
      isMokaLocationOptionUnavailable: () => false,
      isMokaLocationInteractionFailure: () => false
    });
    const result = await fill({ tabId: 7, initialObservation: current, candidateFacts: facts });
    return { callingCode, facts, driver, result };
  }

  it("does not short-circuit a default action while the editable query is stale", async () => {
    const test = await run({ currentValue: "+86", queryValue: "1" });
    expect(visionReadbackMatches(test.callingCode, "+86")).toBe(true); // Old background gate ignored queryValue.
    expect(phoneCallingCodeReadbackMatches(test.callingCode, "+86")).toBe(false);
    expect(test.driver).toHaveBeenCalledOnce();
    expect(test.driver.mock.calls[0]![3]).toMatchObject({
      value: "+86",
      optionSelectionPolicy: "phone_calling_code_default"
    });
    expect(test.result.observation.fields[0]).toMatchObject({
      currentValue: "+86",
      compound: { queryValue: "" }
    });
  });

  it("preserves exact confirmed-option identity at the background fast path", async () => {
    const test = await run({ currentValue: "+86", queryValue: "", confirmed: "+886" });
    expect(visionReadbackMatches(test.callingCode, "+886", Object.keys(test.facts)[0])).toBe(false);
    expect(phoneCallingCodeReadbackMatches(test.callingCode, "+886")).toBe(false);
    expect(test.driver).toHaveBeenCalledOnce();
    expect(test.driver.mock.calls[0]![3]).toMatchObject({
      value: "+886",
      optionSelectionPolicy: "phone_calling_code_confirmed"
    });
    expect(test.result.observation.fields[0]?.currentValue).toBe("+886");
  });

  it("allows one policy pass over an existing non-default code and then converges", async () => {
    const test = await run({ currentValue: "+1", queryValue: "" });
    expect(test.driver).toHaveBeenCalledOnce();
    expect(test.result.observation.fields[0]?.currentValue).toBe("+86");
  });

  it("does not accept a prefix-related existing code as the +86 default", async () => {
    const test = await run({ currentValue: "+886", queryValue: "" });
    expect(visionReadbackMatches(test.callingCode, "+86")).toBe(false);
    expect(phoneCallingCodeReadbackMatches(test.callingCode, "+86")).toBe(false);
    expect(test.driver).toHaveBeenCalledOnce();
    expect(test.result.observation.fields[0]?.currentValue).toBe("+86");
  });

  it("skips a disabled calling-code control without reaching the Driver", async () => {
    const test = await run({ currentValue: "+1", queryValue: "", disabled: true });
    expect(test.driver).not.toHaveBeenCalled();
    expect(test.result.observation.fields[0]).toMatchObject({ currentValue: "+1", domHints: { disabled: true } });
  });

  it("does not upgrade a failed calling-code Driver from a matching fresh display", async () => {
    const test = await run({ currentValue: "+86", queryValue: "1", driverSuccess: false });
    expect(test.driver).toHaveBeenCalledOnce();
    expect(test.result.readback).toMatchObject([{ success: false, actual: "+86", error: "trusted_driver_failed" }]);
    expect(test.result.attempts).toMatchObject([{ success: false, actual: "+86", error: "trusted_driver_failed" }]);
  });
});

describe("production mixed city orchestration", () => {
  async function run(failure?: "unsupported" | "target_missing") {
    const city = field({ label: "求职意向 · 期望城市", stableFieldKey: "intention.preferred_city.native" });
    const email = field({ fieldId: "email", selector: "#email", label: "邮箱", type: "email", stableFieldKey: "basic.email.native" });
    const unknown = field({ fieldId: "unknown", selector: "#unknown", label: "紧急联系人姓名", stableFieldKey: "third_party.emergency_contact_name.native" });
    let current = { ...observation([city, email, unknown]),
      url: "https://app.mokahr.com/campus-recruitment/ztehr4/150449#/job/test/apply" };
    const nativeRoute = resolveControlAdapter({ applicationUrl: current.url, label: city.label,
      semanticKey: city.stableFieldKey!, type: "text", controlKind: "native", tagName: "INPUT",
      readOnly: false, placeholder: "期望城市", classNames: ["sd-Input-input", "string_info"] }).diagnostic;
    const driver = vi.fn(async (_tab: number, _page: PageObservation, target: PageFieldObservation, instruction: { value: string }) => {
      const fail = failure && target.fieldId === city.fieldId;
      // A late display value must not erase an actual driver failure.
      current = { ...current, fields: current.fields.map(candidate => candidate.fieldId === target.fieldId
        ? { ...candidate, currentValue: failure === "unsupported" ? "" : instruction.value } : candidate) };
      return { fieldId: target.fieldId, expected: instruction.value,
        actual: failure === "unsupported" ? "" : instruction.value, success: !fail,
        error: fail ? failure === "unsupported" ? "unsupported_required_control: signature missing"
          : "location_control_interaction_failed:select:target_missing" : null,
        driverStage: fail ? "select" : undefined, driverFailureCode: fail ? failure : null,
        controlAdapter: failure === "target_missing" ? { ...nativeRoute, adapterCode: "moka.zte.location.trusted-focus.v1" } : nativeRoute };
    });
    const model = vi.fn(() => { throw new Error("unknown answers must not reach the model"); });
    const fill = productionFunction("fillAutoApplyFormWithVision", "async function executeFinalSubmitWithDebugger(", {
      autoApplyFillObservation, siteValidationFieldKey, isUnconfirmedFieldReadback,
      visionPlanningObservation, nextDeterministicKnownFactAction, candidateBlockingRequiredFieldFailures,
      candidateInformationRequestsForMissingFields, optionalFieldEnrichmentPending, visionFormReadyForFinalReview,
      authoritativeCandidateFactForField, confirmedCurrentJobFactForField, isVisionValueTraceable,
      visualSemanticConflict, observedFieldHasValue, visionReadbackMatches, findDynamicReadbackField,
      registerVisionFieldAttempt, registeredControlReadbackMatches, RecruitingError,
      isUnsupportedRequiredControlFailure, controlAdapterFailureDetails,
      isDateControlInteractionFailure: () => false,
      isMokaFlatSelectOptionUnavailable: () => false, isMokaFlatSelectInteractionFailure: () => false,
      isMokaRecruitingSourceOptionUnavailable: () => false,
      isMokaRecruitingSourceInteractionFailure: () => false, isMokaLocationOptionUnavailable: () => false,
      isMokaLocationInteractionFailure: (error: string) => error?.includes("location_control_interaction_failed"),
      detectAutoApplyUserAction: async () => null, assertApplicationFormStage: () => undefined,
      criticalVisualReadbackFailures: () => [], stableApplicationObservation: async () => current,
      summarizeVisionDiagnosticValue: () => null, planAutoApplyVision: model,
instructionFromObservedField: (field: PageFieldObservation, value: string) => ({ value, fieldId: field.fieldId,
        stableFieldKey: field.stableFieldKey, selector: field.selector, expectedLabel: field.label, type: field.type }),
      applicationDomMutationState: async () => ({ version: 1 }), executeMokaFillInstructionWithDebugger: driver,
      settleApplicationDomAfterFill: async () => ({ changed: true })
    });
    try {
      return { result: await fill({ tabId: 7, initialObservation: current, candidateFacts: {
        "candidate.basic.currentCity": "深圳", "candidate.basic.email": "test@example.com" } }), error: null, driver, model };
    } catch (error) { return { result: null, error: error as RecruitingError, driver, model }; }
  }
  it("continues past a native city to other known fields and final review without inventing unknown required facts", async () => {
    const { result, error, driver, model } = await run();
    expect(error).toBeNull();
    expect(driver.mock.calls.map(call => call[2].fieldId)).toEqual(["field-1", "email"]);
    expect(result.observation.fields.map((field: PageFieldObservation) => field.currentValue))
      .toEqual(["深圳", "test@example.com", ""]);
    expect(model).not.toHaveBeenCalled();
  });
  it.each(["unsupported", "target_missing"] as const)("keeps %s as the primary failure instead of a city-readback or missing-info error", async (failure) => {
    const { error, driver } = await run(failure);
    expect(error?.publicError).toMatchObject({ code: "SITE_VALIDATION_BLOCKED", message: expect.stringContaining(
      failure === "unsupported" ? "unsupported_required_control" : "location_control_interaction_failed") });
    expect(driver).toHaveBeenCalledOnce();
    expect(error?.publicError.details).not.toHaveProperty("requiredFieldRequests");
    expect(error?.publicError.details).not.toHaveProperty("locationSelectionUnconfirmed");
  });
});

describe("production submit transaction evidence", () => {
  async function submit(input: {
    before?: PageObservation; after?: PageObservation; success?: boolean;
    successSource?: "registered_receipt_url" | "visible_receipt";
    policyBlock?: string;
    nativeErrors?: Array<{ fieldKey: string | null; message: string }>;
    reassertedKeys?: string[];
    ambiguousConfirmation?: boolean;
    checkpointFails?: boolean;
    pointerFails?: boolean;
    preview?: boolean;
    finalConfirmation?: boolean;
    authorizations?: boolean[];
    userAction?: { type: "login"; message: string };
    previouslyRejectedKeys?: ReadonlySet<string>;
  } = {}) {
    let clicks = 0;
    let clock = 0;
    const order: string[] = [];
    const submitText = input.preview ? "预览并提交" : "提交";
    const before = input.before ?? observation();
    const after = input.after ?? before;
    const stableRead = vi.fn(async () => {
      order.push(clicks ? "post-click-read" : "baseline");
      return clicks ? after : before;
    });
    const authorize = vi.fn(async () => {
      order.push("authorize");
      if (input.authorizations?.[authorize.mock.calls.length - 1] === false) throw new Error("authority rejected");
    });
    const checkpoint = vi.fn(async () => {
      order.push("checkpoint");
      if (input.checkpointFails) throw new Error("storage write failed");
    });
    const chrome = {
      scripting: { executeScript: vi.fn(async ({ func, args }: { func: Function; args?: unknown[] }) => {
        if (func === nativeSubmitValidationProbeInPage) {
          return [{ result: args?.[1] === "read" ? input.nativeErrors ?? [] : [] }];
        }
        if (func === reassertedSubmitValidationProbeInPage) {
          return [{ result: args?.[1] === "read" ? input.reassertedKeys ?? [] : [] }];
        }
        if (args?.[0] === "preview") return [{ result: {
          found: true, ambiguous: false, texts: [submitText], text: submitText, x: 50, y: 50, url: before.url
        } }];
        if (args?.[0] === "confirmation") return [{ result: {
          found: Boolean(input.finalConfirmation && clicks === 1), ambiguous: Boolean(input.ambiguousConfirmation),
          texts: [], text: "确认提交", x: 50, y: 50, confirmationKind: "submission", url: after.url
        } }];
        const success = input.finalConfirmation ? clicks === 2 : Boolean(input.success);
        return [{ result: { success, outcome: success ? "succeeded" : null,
          source: success ? input.successSource ?? "visible_receipt" : null, url: after.url } }];
      }) },
      debugger: {
        attach: vi.fn(async () => undefined), detach: vi.fn(async () => undefined),
        sendCommand: vi.fn(async (_target: unknown, method: string, params: Record<string, string> = {}) => {
          if (method === "Runtime.evaluate") {
            order.push("live-point");
            return { result: { objectId: "button" } };
          }
          if (params.functionDeclaration?.includes("hitInsideTarget")) {
            return { result: { value: { connected: true, hitInsideTarget: true } } };
          }
          return { result: { value: { connected: true, left: 10, top: 10, width: 100, height: 30,
            viewportWidth: 800, viewportHeight: 600, targetTag: "BUTTON" } } };
        })
      }
    };
    const execute = productionFunction("executeFinalSubmitWithDebugger", "async function executeLegacyBatchAutoApplyJob(", {
      submissionActionPatterns, isPreviewSubmissionText,
      chrome, crypto, stableApplicationObservation: stableRead,
      readApplicationReceiptInPage,
      readSiteApplicationPolicyBlockInPage,
      nativeSubmitValidationProbeInPage, reassertedSubmitValidationProbeInPage,
      newSiteValidationErrors, submissionRejectedFields, siteValidationFieldKey,
      detectAutoApplyUserAction: async () => input.userAction ?? null,
      detectAutoApplySitePolicyBlock: async () => input.policyBlock ? ({
        blocked: true, reasonCode: "site_application_limit_reached", message: input.policyBlock,
        source: "visible_site_policy", url: after.url
      }) : ({ blocked: false, reasonCode: null, message: null, source: null, url: after.url }),
      removeAutoApplyOverlay: async () => true,
      prepareFocusEmulatedTrustedPointerSurface: async () => undefined,
      releaseTrustedPointerSurface: async () => undefined,
      trustedPointerViewportCandidates: () => [{ x: 50, y: 25 }],
      dispatchTrustedPointerClick: async () => {
        clicks += 1; order.push("click");
        if (input.pointerFails) throw new Error("pointer outcome unknown");
      },
      isMokaApplicationUrl: () => true,
      createFinalSubmitCaptchaObservation, observeFinalSubmitCaptcha,
      confirmedFinalSubmitCaptcha, pendingFinalSubmitCaptchaAtDeadline,
      finalSubmitActiveVerificationTimeoutMs: 30_000,
      Date: { now: () => { clock += 5_000; return clock; } },
      setTimeout: (callback: () => void) => callback()
    });
    const result = await execute(7, { selector: "#submit", actionId: "submit" }, submitText, checkpoint,
      false, input.previouslyRejectedKeys ?? new Set(), undefined, undefined, authorize);
    return { result, clicks, checkpoint, stableRead, order, authorize };
  }

  it.each([false, true])("sends no real pointer and persists no intent when authority is denied (preview=%s)", async preview => {
    const value = await submit({ preview, authorizations: [false] });
    expect(value.result.error).toContain("authority rejected");
    expect(value.clicks).toBe(0);
    expect(value.checkpoint).not.toHaveBeenCalled();
    expect(value.authorize).toHaveBeenCalledOnce();
  });

  it("authorizes both preview and final confirmation while preserving one submission checkpoint", async () => {
    const value = await submit({ preview: true, finalConfirmation: true, authorizations: [true, true] });
    expect(value.result.observedResult).toBe("submitted_success");
    expect(value.clicks).toBe(2);
    expect(value.authorize).toHaveBeenCalledTimes(2);
    expect(value.checkpoint).toHaveBeenCalledOnce();
    expect(value.order.filter(item => ["authorize", "checkpoint", "click"].includes(item)))
      .toEqual(["authorize", "checkpoint", "click", "authorize", "click"]);
  });

  it("does not click final confirmation if authority was revoked after preview", async () => {
    const value = await submit({ preview: true, finalConfirmation: true, authorizations: [true, false] });
    expect(value.result.error).toContain("authority rejected");
    expect(value.clicks).toBe(1);
    expect(value.authorize).toHaveBeenCalledTimes(2);
    expect(value.checkpoint).toHaveBeenCalledOnce();
  });

  it("confirms only new site-rejected keys and captures the baseline before live pointer geometry", async () => {
    const stale = field({ validationMessage: "旧错误" });
    const fresh = field({ fieldId: "field-2", stableFieldKey: "other", selector: "#other" });
    const { result, clicks, checkpoint, order } = await submit({
      before: observation([stale, fresh]),
      after: observation([stale, { ...fresh, validationMessage: "请填写" }])
    });
    expect(result).toMatchObject({ executed: true, observedResult: "blocked_by_site_validation",
      siteValidationConfirmed: true, rejectedFieldKeys: ["other"] });
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(true);
    expect(clicks).toBe(1);
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(order.indexOf("baseline")).toBeLessThan(order.indexOf("live-point"));
    expect(order.indexOf("live-point")).toBeLessThan(order.indexOf("click"));
    expect(order.indexOf("checkpoint")).toBeLessThan(order.indexOf("click"));
  });

  it("returns a visible application limit as a terminal site-policy failure before CAPTCHA or validation", async () => {
    const message = "这6个月投递太多岗位，请耐心等待";
    const { result, clicks, checkpoint } = await submit({
      policyBlock: message,
      userAction: { type: "login", message: "stale login residue" },
      before: observation([field({ validationMessage: "旧错误" })])
    });
    expect(result).toMatchObject({
      executed: true,
      observedResult: "blocked_by_site_policy",
      error: message,
      sitePolicyBlock: { reasonCode: "site_application_limit_reached", message }
    });
    expect(clicks).toBe(1);
    expect(checkpoint).toHaveBeenCalledOnce();
  });

  it("keeps a registered receipt route authoritative over stale application-limit text", async () => {
    const { result } = await submit({
      success: true,
      successSource: "registered_receipt_url",
      policyBlock: "这6个月投递太多岗位，请耐心等待"
    });
    expect(result).toMatchObject({ observedResult: "submitted_success" });
  });

  it("does not send a submit click when the durable checkpoint fails", async () => {
    const { result, clicks } = await submit({ checkpointFails: true });
    expect(clicks).toBe(0);
    expect(result.error).toContain("storage write failed");
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
  });

  it("records that dispatch may have happened when the pointer channel fails mid-operation", async () => {
    const { result, clicks, checkpoint } = await submit({ pointerFails: true });
    expect(result).toMatchObject({ executed: true, observedResult: "network_or_navigation_unknown" });
    expect(clicks).toBe(1);
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
  });

  it("fences even preview-labelled clicks and never retries an unconfirmed preview", async () => {
    const { result, clicks, checkpoint, order } = await submit({ preview: true });
    expect(result).toMatchObject({ executed: true, observedResult: "network_or_navigation_unknown" });
    expect(result.error).toContain("结果未确认，不会再次提交");
    expect(clicks).toBe(1);
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(order.indexOf("checkpoint")).toBeLessThan(order.indexOf("click"));
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
  });

  it.each([null, "页面原有错误"])("never re-clicks for unchanged errors or no response (%s)", async (error) => {
    const { result, clicks } = await submit({ before: observation([field({ validationMessage: error })]) });
    expect(result.observedResult).toBe("waiting_for_site_receipt");
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
    expect(clicks).toBe(1);
  });

  it("treats an unchanged bilingual required error on an empty control as the current rejection", async () => {
    const required = field({ validationMessage: "必填项未填写 / Required items are not filled in" });
    const { result, clicks } = await submit({ before: observation([required]) });
    expect(result).toMatchObject({
      observedResult: "blocked_by_site_validation",
      siteValidationConfirmed: true,
      rejectedFieldKeys: [siteValidationFieldKey(required)]
    });
    expect(clicks).toBe(1);
  });

  it("returns an unchanged nonempty field when it belongs to the frozen second-submit scope", async () => {
    const rejected = field({ currentValue: "已复填值", validationMessage: "网站仍未接受" });
    const { result, clicks } = await submit({
      before: observation([rejected]),
      previouslyRejectedKeys: new Set([siteValidationFieldKey(rejected)])
    });
    expect(result).toMatchObject({
      observedResult: "blocked_by_site_validation",
      siteValidationConfirmed: true,
      rejectedFieldKeys: [siteValidationFieldKey(rejected)]
    });
    expect(clicks).toBe(1);
  });

  it("passes actual native rejection evidence and its field identity to the repair gate", async () => {
    const nativeErrors = [{ fieldKey: "basic.employee_relation.native", message: "Please fill out this field." }];
    const { result, clicks } = await submit({ nativeErrors });
    expect(result).toMatchObject({ siteValidationConfirmed: true, nativeValidationErrors: nativeErrors,
      rejectedFieldKeys: ["basic.employee_relation.native"] });
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(true);
    expect(clicks).toBe(1);
  });

  it("does not turn an unbound global/network error into permission to resubmit", async () => {
    const { result, clicks } = await submit({ after: { ...observation(), validationMessages: ["网络错误，请稍后重试"] } });
    expect(result.observedResult).toBe("blocked_by_site_validation");
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
    expect(clicks).toBe(1);
  });

  it("does not let receipt-like text override native rejection from this submit", async () => {
    const { result } = await submit({ success: true,
      nativeErrors: [{ fieldKey: "basic.employee_relation.native", message: "Please fill out this field." }] });
    expect(result.observedResult).toBe("blocked_by_site_validation");
  });

  it("does not let receipt-like text override a live login gate", async () => {
    const { result, clicks } = await submit({ success: true, userAction: { type: "login", message: "请登录" } });
    expect(result.observedResult).toBe("waiting_for_user_action");
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
    expect(clicks).toBe(1);
  });

  it("accepts a fresh assertion of the same custom error, without treating other stale errors as new", async () => {
    const old = observation([field({ validationMessage: "请选择" }),
      field({ fieldId: "other", selector: "#other", stableFieldKey: "other", validationMessage: "请选择" })]);
    const { result, clicks } = await submit({ before: old, reassertedKeys: [siteValidationFieldKey(old.fields[0]!)] });
    expect(result).toMatchObject({ siteValidationConfirmed: true, rejectedFieldKeys: [siteValidationFieldKey(old.fields[0]!)] });
    expect(clicks).toBe(1);
  });

  it("does not call an ambiguous confirmation a field rejection", async () => {
    const { result, clicks } = await submit({ ambiguousConfirmation: true });
    expect(result.observedResult).toBe("blocked_by_site_validation");
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
    expect(clicks).toBe(1);
  });

  it("returns an observed success without another form read or a second submit", async () => {
    const { result, clicks, stableRead } = await submit({ success: true });
    expect(result.observedResult).toBe("submitted_success");
    expect(canResumeAutoApplyAfterSiteValidation(result)).toBe(false);
    expect(stableRead).toHaveBeenCalledOnce();
    expect(clicks).toBe(1);
  });
});

describe("unconfirmed readback versus corrupt content", () => {
  it.each(["", "测试姓名"])("defers an empty or matching display (%s), without claiming driver success", (value) => {
    const result = { fieldId: "f", expected: "测试姓名", actual: value, success: false,
      error: "commit_validation_not_cleared", driverStage: "commit" };
    expect(isUnconfirmedFieldReadback({ result, current: field({ currentValue: value }),
      matches: value === "测试姓名", error: result.error })).toBe(true);
    expect(result.success).toBe(false);
  });

  it.each(["unsupported_required_control", "field_semantic_conflict", "target_ambiguous", "field_missing"])(
    "does not defer unsafe or unsupported execution (%s)", (error) => {
      expect(isUnconfirmedFieldReadback({ result: { fieldId: "f", expected: "x", actual: "", success: false,
        error, driverStage: "readback" }, current: field(), matches: false, error })).toBe(false);
    }
  );

  it("defers a bound field's readback mismatch, but never a lost live target", () => {
    const result = { fieldId: "f", expected: "甲", actual: "乙", success: false, error: "回读不一致" };
    expect(isUnconfirmedFieldReadback({ result, current: field({ currentValue: "乙" }), matches: false, error: result.error })).toBe(true);
    expect(isUnconfirmedFieldReadback({ result, current: null, matches: false, error: result.error })).toBe(false);
  });

  it("production identity guard permits empty values but rejects wrong nonempty identity", () => {
    const guard = productionFunction("criticalVisualReadbackFailures", "async function commitApplicationFormBlurBeforePreSubmit(", {
      visualFieldFailureBlocksSubmission, observedFieldHasValue, thirdPartyIdentityCollision,
      isThirdPartyPersonField, isPhoneCallingCodeField, visionReadbackMatches,
      candidateFactByKey: (_facts: Record<string, string>, keyPattern: RegExp) =>
        /phone|mobile/iu.test(String(keyPattern)) ? "13800000000" : "测试姓名"
    });
    const name = field({ label: "姓名", stableFieldKey: "basic.full_name.native" });
    expect(guard(observation([name]), {})).toEqual([]);
    expect(guard(observation([{ ...name, currentValue: "另一个人" }]), {})).toEqual(["姓名 回读不一致"]);
    const callingCode = field({ label: "手机号码", stableFieldKey: "basic.phone.combobox",
      type: "combobox", controlKind: "combobox", currentValue: "+86",
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "" } });
    expect(guard(observation([callingCode]), {})).toEqual([]);
    expect(guard(observation([{ ...callingCode, compound: undefined }]), {}))
      .toEqual(["手机号码 回读不一致"]);
    expect(guard(observation([{ ...callingCode,
      type: "text", controlKind: "native",
      compound: { kind: "phone_number", role: "number", groupKey: "#phone-field" } }]), {}))
      .toEqual(["手机号码 回读不一致"]);
  });

  it("uses one production fill attempt, then proceeds to site validation despite empty readback", async () => {
    const current = observation([field({ label: "姓名", stableFieldKey: "basic.full_name.native" })]);
    const driver = vi.fn(async () => ({ fieldId: "field-1", expected: "测试姓名", actual: "",
      success: false, error: "可信输入后回读不一致" }));
    const model = vi.fn(() => { throw new Error("must not ask the model to retry"); });
    const fill = productionFunction("fillAutoApplyFormWithVision", "async function executeFinalSubmitWithDebugger(", {
      autoApplyFillObservation, siteValidationFieldKey, isUnconfirmedFieldReadback,
      visionPlanningObservation, nextDeterministicKnownFactAction, candidateBlockingRequiredFieldFailures,
      candidateInformationRequestsForMissingFields, optionalFieldEnrichmentPending, visionFormReadyForFinalReview,
      authoritativeCandidateFactForField, confirmedCurrentJobFactForField, isVisionValueTraceable,
      visualSemanticConflict, observedFieldHasValue, visionReadbackMatches, findDynamicReadbackField,
      registerVisionFieldAttempt,
      detectAutoApplyUserAction: async () => null, assertApplicationFormStage: () => undefined,
      criticalVisualReadbackFailures: () => [], stableApplicationObservation: async () => current,
      summarizeVisionDiagnosticValue: () => null, planAutoApplyVision: model,
instructionFromObservedField: (field: PageFieldObservation, value: string) => ({ value, fieldId: field.fieldId,
        stableFieldKey: field.stableFieldKey, selector: field.selector, expectedLabel: field.label, type: field.type }),
      applicationDomMutationState: async () => ({ version: 1 }),
      executeMokaFillInstructionWithDebugger: driver,
      settleApplicationDomAfterFill: async () => ({ changed: false }),
      isMokaPreferredLocationField: () => false
    });
    const result = await fill({ tabId: 7, initialObservation: current, candidateFacts: { "candidate.basic.fullName": "测试姓名" } });
    expect(driver).toHaveBeenCalledOnce();
    expect(model).not.toHaveBeenCalled();
    expect(result.readback).toMatchObject([{ success: false, actual: "" }]);
    expect(result.observation).toEqual(current);
  });

  it("finishes all repair targets before auditing a shared validation error", async () => {
    const targets = [field({ label: "姓名", stableFieldKey: "basic.full_name.native", validationMessage: "请完成两项" }),
      field({ fieldId: "email", selector: "#email", label: "邮箱", type: "email", stableFieldKey: "basic.email.native", validationMessage: "请完成两项" })];
    let latest = observation(targets);
    const facts = { "candidate.basic.fullName": "测试姓名", "candidate.basic.email": "test@example.com" };
    const driver = vi.fn(async (_tab: number, _page: PageObservation, target: PageFieldObservation, instruction: { value: string }) => {
      latest = observation(latest.fields.map(candidate => candidate.fieldId === target.fieldId
        ? { ...candidate, currentValue: instruction.value } : candidate));
      if (latest.fields.every(candidate => candidate.currentValue)) {
        latest = observation(latest.fields.map(candidate => ({ ...candidate, validationMessage: null })));
      }
      return { fieldId: target.fieldId, expected: instruction.value, actual: instruction.value,
        success: true, driverStage: "readback", error: null };
    });
    const fill = productionFunction("fillAutoApplyFormWithVision", "async function executeFinalSubmitWithDebugger(", {
      autoApplyFillObservation, siteValidationFieldKey, isUnconfirmedFieldReadback,
      visionPlanningObservation, nextDeterministicKnownFactAction, candidateBlockingRequiredFieldFailures,
      candidateInformationRequestsForMissingFields, optionalFieldEnrichmentPending, visionFormReadyForFinalReview,
      authoritativeCandidateFactForField, confirmedCurrentJobFactForField, isVisionValueTraceable,
      visualSemanticConflict, observedFieldHasValue, visionReadbackMatches, findDynamicReadbackField,
      registerVisionFieldAttempt,
      detectAutoApplyUserAction: async () => null, assertApplicationFormStage: () => undefined,
      criticalVisualReadbackFailures: () => [], stableApplicationObservation: async () => latest,
      summarizeVisionDiagnosticValue: () => null,
      planAutoApplyVision: () => { throw new Error("Must finish exact known targets without a model retry"); },
instructionFromObservedField: (field: PageFieldObservation, value: string) => ({ value, fieldId: field.fieldId,
        stableFieldKey: field.stableFieldKey, selector: field.selector, expectedLabel: field.label, type: field.type }),
      applicationDomMutationState: async () => ({ version: 1 }), executeMokaFillInstructionWithDebugger: driver,
      settleApplicationDomAfterFill: async () => ({ changed: true }), isMokaPreferredLocationField: () => false
    });
    const result = await fill({ tabId: 7, initialObservation: latest, candidateFacts: facts,
      repairFieldKeys: new Set(targets.map(siteValidationFieldKey)) });
    expect(driver.mock.calls.map(call => call[2].fieldId)).toEqual(["field-1", "email"]);
    expect(siteRepairReadbackFailures(targets, result.observation, facts)).toEqual([]);
    expect(result.readback.every((entry: { success: boolean }) => entry.success)).toBe(true);
  });
});

describe("production submit-to-user handoff", () => {
  const name = field({ label: "姓名", stableFieldKey: "basic.full_name.native",
    currentValue: "测试姓名", validationMessage: "姓名格式不符合要求" });
  const relation = field({ fieldId: "relation", selector: "#relation", stableFieldKey: "relation.name.native",
    label: "关系人姓名", validationMessage: "请填写关系人姓名" });
  const email = field({ fieldId: "email", selector: "#email", stableFieldKey: "basic.email.native",
    label: "邮箱", currentValue: "user@example.com", validationMessage: "邮箱需要重新确认" });
  async function round(fields: PageFieldObservation[], options: {
    unknown?: boolean;
    optionFailure?: boolean;
    unresolved?: boolean;
    secondRejected?: boolean;
    secondRejectedFields?: PageFieldObservation[];
    repairReadbackFailure?: boolean;
    facts?: Record<string, string>;
    authorizations?: boolean[];
  } = {}) {
    let live = observation(fields);
    const secondFields = options.secondRejectedFields ?? fields;
    const firstResult = { executed: true, actionId: "submit", actionText: "提交",
      observedResult: options.unknown ? "waiting_for_site_receipt" : "blocked_by_site_validation",
      siteValidationConfirmed: !options.unknown, pageUrlAfterClick: live.url,
      rejectedFieldKeys: options.unknown ? [] : [...fields.map(siteValidationFieldKey), ...(options.unresolved ? ["missing-descriptor"] : [])],
      rejectedFields: fields, error: "字段未通过校验", trace: ["first_submit"]
    };
    const secondResult = { executed: true, actionId: "submit", actionText: "提交",
      observedResult: options.secondRejected ? "blocked_by_site_validation" : "submitted_success",
      siteValidationConfirmed: Boolean(options.secondRejected), pageUrlAfterClick: live.url,
      rejectedFieldKeys: options.secondRejected ? secondFields.map(siteValidationFieldKey) : [],
      rejectedFields: options.secondRejected ? secondFields : [], error: options.secondRejected ? "字段仍未通过校验" : null,
      trace: ["second_submit"]
    };
    const click = vi.fn();
    const verify = vi.fn(async () => options.authorizations?.[verify.mock.calls.length - 1] ?? true);
    const submit = vi.fn(async (_tab, _action, _text, checkpoint, _consent, _rejected, _captcha, _signal, authorize) => {
      await authorize();
      await checkpoint();
      click();
      if (submit.mock.calls.length === 1) return firstResult;
      if (options.secondRejected) live = observation(secondFields);
      return secondResult;
    });
    const fill = vi.fn(async () => {
      if (!options.repairReadbackFailure) {
        live = observation(fields.map((candidate) => candidate.stableFieldKey === name.stableFieldKey
          ? { ...candidate, currentValue: "测试姓名", validationMessage: null }
          : candidate));
      }
      return { observation: live, readback: [], attempts: [] };
    });
    const saved: unknown[] = [];
    const collect = productionFunction("collectSiteRejectedInformation", "function aiBridgeEvent(", {
      siteValidationFieldKey, siteRejectedInformationRequests, RecruitingError,
      withDiscoveredRequiredFieldOptions: async (_tab: number, items: PageFieldObservation[]) => {
        if (options.optionFailure) throw new Error("option popup unavailable");
        return items;
      }
    });
    const candidateFacts = options.facts ?? { "candidate.basic.fullName": "测试姓名" };
    const dependencies = {
      crypto, progressReporter: null, tabId: 7, submitActions: live.actions, RecruitingError,
      AutoApplySubmissionGuardTimeoutError, localValidation: false, verifyAutoApplySubmission: verify,
      chrome: { tabs: {} }, finalSubmitLifecycleGuardTimeoutMs: 30_000,
      autoApplyActiveSubmissionTabs: new Set<number>(),
      executeWithAutoApplySubmissionLifecycleGuard: async ({ execute }: { execute: () => Promise<unknown> }) => execute(),
      assertAutoApplyCommandActive: vi.fn(), command: { commandId: "command" }, canResumeAutoApplyAfterSiteValidation,
      beginAutoApplySubmission, beginSingleAutomaticSiteValidationRepair,
      resumeAutoApplyAfterSiteValidation, updateAutoApplyPageSession,
      stableApplicationObservation: async () => live, assertApplicationFormStage: vi.fn(),
      rejectedSubmissionFields, collectSiteRejectedInformation: collect, siteValidationFieldKey,
      executeFinalSubmitWithDebugger: submit, fillAutoApplyFormWithVision: fill,
      persistAutoApplyPageSession: async session => { saved.push(structuredClone(session)); return true; },
      partitionSiteRejectedFields, siteRepairReadbackFailures, candidateFacts,
      isSiteManagedDisabledField, siteRejectedUploadError,
      credential: {}, visionSessionId: "vision", batchId: "batch", batchJobId: "item",
      payload: { batchAuthorization: "synthetic-authorization" }, adapterCode: "generic.web.v1", recordVisionDiagnostic: vi.fn(),
      autoApplyExecutionAbort: null,
      requestedApplicationEngineFromPayload: () => "legacy",
      commitApplicationFormBlurBeforePreSubmit: vi.fn(),
      ensureAuthorizedPageConsents: vi.fn(async (_tab: number, page: PageObservation) => ({ observation: page })),
      requireUniqueFinalSubmitAction
    };
    const from = source.indexOf("    const executeAuthorizedSubmitAttempt = async (",
      source.indexOf("async function executeLegacyBatchAutoApplyJob("));
    const to = source.indexOf('    if (submitResult.observedResult === "waiting_for_user_action"', from);
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const js = transformSync(`async function run(pageSession){ let tabResultDisposition = "default"; ${source.slice(from, to)} return { submitResult, pageSession };}`, { loader: "ts" }).code;
    const run = new Function(...Object.keys(withInterruptionDependencies(dependencies)), `${js}; return run;`)(...Object.values(withInterruptionDependencies(dependencies)));
    const session = { schemaVersion: "auto-apply-page-session.v1", stage: "filling", tabId: 7,
      submissionAttemptId: null, submitInitiatedAt: null, automaticSiteValidationRepairCount: 0 };
    let error, output;
    try { output = await run(session); } catch (caught) { error = caught as RecruitingError; }
    return { error, output, saved, submit, fill, verify, click };
  }

  it("does not click or persist submission intent when final authorization is rejected", async () => {
    const result = await round([name], { authorizations: [false] });
    expect(result.error?.message).toContain("最终提交授权无效");
    expect(result.verify).toHaveBeenCalledExactlyOnceWith({}, {
      token: "synthetic-authorization", batchId: "batch", batchJobId: "item", commandId: "command"
    });
    expect(result.click).not.toHaveBeenCalled();
    expect(result.saved).toEqual([]);
    expect(result.fill).not.toHaveBeenCalled();
  });

  it("checks authorization again and prevents the second click when authority was revoked after repair", async () => {
    const result = await round([name], { authorizations: [true, false] });
    expect(result.error?.message).toContain("最终提交授权无效");
    expect(result.verify).toHaveBeenCalledTimes(2);
    expect(result.click).toHaveBeenCalledOnce();
    expect(result.fill).toHaveBeenCalledOnce();
    expect(result.saved.filter(session => (session as { submitInitiatedAt?: string }).submitInitiatedAt)).toHaveLength(1);
  });

  it("requires fresh authorization for the allowed repaired second click", async () => {
    const result = await round([name], { authorizations: [true, true] });
    expect(result.error).toBeUndefined();
    expect(result.verify).toHaveBeenCalledTimes(2);
    expect(result.click).toHaveBeenCalledTimes(2);
    expect(result.verify.mock.invocationCallOrder[0]).toBeLessThan(result.click.mock.invocationCallOrder[0]!);
    expect(result.verify.mock.invocationCallOrder[1]).toBeGreaterThan(result.click.mock.invocationCallOrder[0]!);
    expect(result.verify.mock.invocationCallOrder[1]).toBeLessThan(result.click.mock.invocationCallOrder[1]!);
  });

  it("repairs only the rejected field from candidate facts and submits exactly once more", async () => {
    const { error, output, saved, submit, fill } = await round([name]);
    expect(error).toBeUndefined();
    expect(output.submitResult).toMatchObject({ observedResult: "submitted_success",
      trace: expect.arrayContaining(["site_validation_single_repair_completed", "site_validation_second_submit_started"]) });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![5]).toEqual(new Set([siteValidationFieldKey(name)]));
    expect(fill).toHaveBeenCalledOnce();
    expect(fill.mock.calls[0]![0].repairFieldKeys).toEqual(new Set([siteValidationFieldKey(name)]));
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ automaticSiteValidationRepairCount: 1, submissionAttemptId: null }),
      expect.objectContaining({ automaticSiteValidationRepairCount: 1, submissionAttemptId: expect.any(String) })
    ]));
  });

  it("repairs known fields before the second submit, then returns every field still rejected", async () => {
    const { error, saved, submit, fill } = await round([name, relation], {
      secondRejected: true,
      secondRejectedFields: [relation]
    });
    expect(error?.publicError).toMatchObject({ code: "MISSING_INFORMATION", details: {
      fields: ["关系人姓名"],
      requiredFieldRequests: [{ stableFieldKey: relation.stableFieldKey }],
      rejectedFields: ["关系人姓名"]
    } });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![5]).toEqual(new Set([siteValidationFieldKey(name), siteValidationFieldKey(relation)]));
    expect(fill).toHaveBeenCalledOnce();
    expect(fill.mock.calls[0]![0].repairFieldKeys).toEqual(new Set([siteValidationFieldKey(name)]));
    expect(saved.at(-1)).toMatchObject({ submissionAttemptId: null, submitInitiatedAt: null,
      pendingRepairFieldKeys: [relation].map(siteValidationFieldKey) });
    expect(name.currentValue).toBe("测试姓名");
  });

  it("returns a conditional field revealed by a repaired answer on the second submit", async () => {
    const internship = field({ fieldId: "internship", selector: "#internship",
      stableFieldKey: "other.internship_status.combobox", label: "是否有实习经历", type: "combobox",
      controlKind: "combobox", currentValue: "是", validationMessage: "请重新选择" });
    const startDate = field({ fieldId: "intern-start", selector: "#intern-start",
      stableFieldKey: "internship.start_date.combobox", sectionKey: "internship",
      label: "实习经历 · 最早开始时间", type: "combobox", controlKind: "combobox",
      domHints: { placeholder: "YYYY-MM" }, validationMessage: "必填项未填写" });
    const facts = {
      "profile.requiredField.stableLabel:other.internship_status.combobox:是否有实习经历": "是"
    };
    const { error, submit, fill } = await round([internship], {
      facts,
      secondRejected: true,
      secondRejectedFields: [startDate]
    });
    expect(fill.mock.calls[0]![0].repairFieldKeys).toEqual(new Set([siteValidationFieldKey(internship)]));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![5]).toEqual(new Set([siteValidationFieldKey(internship)]));
    expect(error?.publicError).toMatchObject({ code: "MISSING_INFORMATION", details: {
      fields: ["实习经历 · 最早开始时间"],
      requiredFieldRequests: [{ stableFieldKey: startDate.stableFieldKey }],
      rejectedFields: ["实习经历 · 最早开始时间"]
    } });
  });

  it("does not perform an identical second submit when none of the rejected fields has a fact", async () => {
    const { error, submit, fill } = await round([relation], { facts: {} });
    expect(error?.publicError).toMatchObject({ code: "MISSING_INFORMATION", details: {
      fields: ["关系人姓名"], requiredFieldRequests: [{ stableFieldKey: relation.stableFieldKey }]
    } });
    expect(submit).toHaveBeenCalledOnce();
    expect(fill).not.toHaveBeenCalled();
  });

  const rejectedResume = field({ fieldId: "resume", selector: "#resumeKey", label: "简历", type: "file",
    stableFieldKey: "other.resume_file.native", currentValue: "resume.pdf",
    validationMessage: "招聘网站未接受简历上传，请检查上传控件" });
  it("reports a rejected upload after the first click without text supplementation, repair or another click", async () => {
    const { error, submit, fill, saved } = await round([name, rejectedResume, relation]);
    expect(error?.publicError).toMatchObject({ code: "SITE_VALIDATION_BLOCKED", retryable: false, details: {
      failureCode: "site_upload_rejected", fields: ["简历"], rejectedFields: ["姓名", "简历", "关系人姓名"],
      failures: [expect.stringContaining("姓名"), expect.stringContaining("简历"), expect.stringContaining("关系人姓名")]
    } });
    expect(error?.publicError.details).not.toHaveProperty("requiredFieldRequests");
    expect(JSON.stringify(error?.publicError.details)).not.toContain("resume.pdf");
    expect(submit).toHaveBeenCalledOnce(); expect(fill).not.toHaveBeenCalled();
    expect(saved.at(-1)).toMatchObject({ submissionAttemptId: null, submitInitiatedAt: null });
  });
  it("reports an upload newly rejected by the permitted second click without a third click", async () => {
    const { error, submit, fill } = await round([name], { secondRejected: true, secondRejectedFields: [rejectedResume, relation] });
    expect(error?.publicError).toMatchObject({ code: "SITE_VALIDATION_BLOCKED", details: {
      failureCode: "site_upload_rejected", rejectedFields: ["简历", "关系人姓名"]
    } });
    expect(submit).toHaveBeenCalledTimes(2); expect(fill).toHaveBeenCalledOnce();
  });

  it("returns a site-owned error instead of writing or requesting supplementation for a disabled rejection", async () => {
    const locked = { ...name, currentValue: "站点解析值", domHints: { disabled: true },
      validationMessage: "招聘网站未接受" };
    const { error, submit, fill } = await round([locked]);
    expect(error?.publicError).toMatchObject({ code: "SITE_VALIDATION_BLOCKED", details: {
      failureCode: "site_managed_disabled_field_rejected", fields: ["姓名"]
    } });
    expect(submit).toHaveBeenCalledOnce();
    expect(fill).not.toHaveBeenCalled();
  });

  it.each([false, true])("keeps the full rejection set but does not ask users to fill an undiscovered fixed choice (second submit: %s)", async secondRejected => {
    const choice = field({fieldId:'major',label:'专业名称',stableFieldKey:'education.major.combobox',type:'combobox',controlKind:'combobox',options:[]});
    const rejected=[choice,relation];
    const result=secondRejected
      ? await round([name],{optionFailure:true,secondRejected:true,secondRejectedFields:rejected})
      : await round(rejected,{optionFailure:true,facts:{}});
    expect(result.error?.publicError).toMatchObject({code:'SITE_VALIDATION_BLOCKED', details:{
      failureCode:'supplemental_control_unresolved',fields:['专业名称','关系人姓名'],
      rejectedFieldKeys:[choice.stableFieldKey,relation.stableFieldKey],
      blockedControls:[{fieldId:'major',type:'combobox',optionCount:0}],
      pendingInformationRequests:[{fieldId:'relation',inputKind:'text'}],
      optionDiscoveryFailures:expect.any(Array)
    }});
    expect(result.error?.publicError.details).not.toHaveProperty('requiredFieldRequests');
    expect(result.saved.at(-1)).toMatchObject({pendingRepairFieldKeys:rejected.map(siteValidationFieldKey)});
    expect(result.submit).toHaveBeenCalledTimes(secondRejected?2:1);
  });

  it("does not let failed option discovery hide any rejected fields", async () => {
    const { error } = await round([relation], { optionFailure: true, facts: {} });
    expect(error?.publicError.details).toMatchObject({
      fields: ["关系人姓名"],
      optionDiscoveryFailures: expect.any(Array)
    });
  });

  it("returns every second-rejected field for one user supplement and never performs a third submit", async () => {
    const { error, submit, fill, saved } = await round([name, email], { secondRejected: true,
      facts: { "candidate.basic.fullName": "测试姓名", "candidate.basic.email": "user@example.com" } });
    expect(error?.publicError).toMatchObject({ code: "MISSING_INFORMATION",
      details: { failureCode: "site_validation_single_repair_exhausted",
        fields: ["姓名", "邮箱"], rejectedFields: ["姓名", "邮箱"],
        requiredFieldRequests: [
          { stableFieldKey: name.stableFieldKey },
          { stableFieldKey: email.stableFieldKey }
        ] } });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(fill).toHaveBeenCalledOnce();
    expect(saved.at(-1)).toMatchObject({ submissionAttemptId: null,
      automaticSiteValidationRepairCount: 1 });
  });

  it("does not issue the second submit when repaired values fail authoritative readback", async () => {
    const broken = { ...name, currentValue: "错误姓名" };
    const { error, submit, fill } = await round([broken], { repairReadbackFailure: true });
    expect(error?.publicError).toMatchObject({ code: "SITE_VALIDATION_BLOCKED",
      details: { failureCode: "site_validation_repair_readback_failed" } });
    expect(submit).toHaveBeenCalledOnce();
    expect(fill).toHaveBeenCalledOnce();
  });

  it("keeps the submission checkpoint and returns immediately for an unknown receipt", async () => {
    const { error, output, saved, submit, fill } = await round([name], { unknown: true });
    expect(error).toBeUndefined();
    expect(saved).toHaveLength(1);
    expect(output.pageSession.submissionAttemptId).toBeTruthy();
    expect(submit).toHaveBeenCalledOnce();
    expect(fill).not.toHaveBeenCalled();
  });

  it("keeps the checkpoint when a reported field cannot be described, instead of returning an incomplete supplement", async () => {
    const { error, saved, submit, fill } = await round([name], { unresolved: true });
    expect(error?.publicError).toMatchObject({ code: "FORM_FILL_VALIDATION_FAILED",
      details: { failureCode: "site_rejected_field_unresolved" } });
    expect(saved.at(-1)).toMatchObject({ submissionAttemptId: null });
    expect(submit).toHaveBeenCalledOnce();
    expect(fill).not.toHaveBeenCalled();
  });

  it("retains rejection-time descriptors when React removes a rejected field", () => {
    const page = observation([]);
    expect(rejectedSubmissionFields(page, { executed: true, actionId: "submit", actionText: "提交",
      observedResult: "blocked_by_site_validation", siteValidationConfirmed: true, pageUrlAfterClick: page.url,
      rejectedFieldKeys: [name.stableFieldKey!], rejectedFields: [name], error: null })).toEqual([name]);
  });

  it("processes a rejected set in current page order even when event keys arrive out of order", () => {
    const page = observation([name, relation, email]);
    expect(rejectedSubmissionFields(page, {
      executed: true, actionId: "submit", actionText: "提交",
      observedResult: "blocked_by_site_validation", siteValidationConfirmed: true,
      pageUrlAfterClick: page.url,
      rejectedFieldKeys: [siteValidationFieldKey(email), siteValidationFieldKey(name), siteValidationFieldKey(relation)],
      rejectedFields: [email, name, relation], error: null
    }).map(siteValidationFieldKey)).toEqual([
      siteValidationFieldKey(name), siteValidationFieldKey(relation), siteValidationFieldKey(email)
    ]);
  });

  it("returns every rejected field rather than silently truncating at forty", () => {
    const fields = Array.from({ length: 55 }, (_, index) => field({ fieldId: `f-${index}`,
      stableFieldKey: `custom.${index}.native`, label: `问卷题目${index}`, currentValue: "被拒值",
      validationMessage: "答案不合法" }));
    expect(siteRejectedInformationRequests(fields)).toHaveLength(55);
  });

  it.each(["https://careers.other.example/apply", "https://tenant.jobs.feishu.cn/index/resume/1/apply"])(
    "generates correction requests independently of ATS: %s", url => {
      const page = { ...observation([name, relation]), url };
      expect(siteRejectedInformationRequests(page.fields).map(request => request.label)).toEqual(["姓名", "关系人姓名"]);
    });
});
