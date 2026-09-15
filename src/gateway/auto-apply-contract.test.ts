import { describe, expect, it } from "vitest";
import {
  autoApplyBatchRequestSchema,
  autoApplyJobResultSchema,
  autoApplyRequiredFieldAnswersSchema
} from "./auto-apply-contract.js";

describe("auto apply result evidence", () => {
  it("accepts all forty observed validation messages while retaining bounded evidence", () => {
    const payload = (count: number) => ({
      schemaVersion: "auto-apply-job-result.v1",
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "long-application-form", status: "failed", reasonCode: "control_interaction_failed",
      occurredAt: "2026-09-07T00:00:00.000Z",
      evidence: { redacted: true, validationMessages: Array.from({ length: count }, (_, i) => `字段 ${i} 为必填`) }
    });
    expect(autoApplyJobResultSchema.parse(payload(40)).evidence?.validationMessages).toEqual(payload(40).evidence.validationMessages);
    expect(() => autoApplyJobResultSchema.parse(payload(41))).toThrow();
    const oversized = payload(1);
    oversized.evidence.validationMessages = ["x".repeat(1001)];
    expect(() => autoApplyJobResultSchema.parse(oversized)).toThrow();
  });

  it("preserves 500 city choices end-to-end and rejects over-limit lists instead of truncating", () => {
    const payload = (count: number) => ({
      schemaVersion: "auto-apply-job-result.v1", batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222", jobId: "job-1", status: "waiting_for_user_action",
      occurredAt: "2026-08-25T00:00:00.000Z", reasonCode: "missing_information",
      evidence: { redacted: true, requiredFieldRequests: [{
        schemaVersion: "required-field-request.v1", fieldId: "city", stableFieldKey: "intention.preferred_city.combobox",
        label: "意向工作城市", type: "combobox", required: true, reasonCode: "candidate_information_missing",
        sectionKey: "intention", groupIndex: null, controlKind: "combobox", description: "请选择一个可接受城市",
        inputKind: "select", question: "请选择一个可接受城市", options: Array.from({ length: count }, (_, i) => `城市${i}`)
      }] }
    });
    expect(autoApplyJobResultSchema.parse(payload(500)).evidence?.requiredFieldRequests[0]?.options).toHaveLength(500);
    expect(autoApplyJobResultSchema.parse(payload(500)).evidence?.requiredFieldRequests[0]?.inputKind).toBe("select");
    expect(() => autoApplyJobResultSchema.parse(payload(1001))).toThrow();
  });
  it("accepts user-confirmed answers for the original batch job", () => {
    expect(autoApplyRequiredFieldAnswersSchema.parse({
      schemaVersion: "required-field-answers.v1",
      answers: [{
        fieldId: "gender",
        stableFieldKey: "basic.gender.combobox",
        value: "女",
        source: "user_confirmed",
        answeredAt: "2026-08-25T06:00:00.000Z"
      }]
    })).toMatchObject({ answers: [{ fieldId: "gender", value: "女" }] });
  });

  it("accepts a canonical date with structured year month and day", () => {
    expect(autoApplyRequiredFieldAnswersSchema.parse({
      schemaVersion: "required-field-answers.v1",
      answers: [{
        fieldId: "graduation-date",
        stableFieldKey: "education[0].end_date.native",
        value: "2025-02-28",
        dateValue: { year: 2025, month: 2, day: 28 },
        source: "user_confirmed",
        answeredAt: "2026-08-30T10:00:00.000Z"
      }]
    }).answers[0]?.dateValue).toEqual({ year: 2025, month: 2, day: 28 });
  });

  it("rejects an invalid or mismatched structured date", () => {
    expect(() => autoApplyRequiredFieldAnswersSchema.parse({
      schemaVersion: "required-field-answers.v1",
      answers: [{
        fieldId: "graduation-date",
        stableFieldKey: "education[0].end_date.native",
        value: "2025-02-28",
        dateValue: { year: 2025, month: 2, day: 29 },
        source: "user_confirmed",
        answeredAt: "2026-08-30T10:00:00.000Z"
      }]
    })).toThrow();
  });

  it("preserves redacted plugin diagnostics for AI-side troubleshooting", () => {
    const result = autoApplyJobResultSchema.parse({
      schemaVersion: "auto-apply-job-result.v1",
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      status: "failed",
      occurredAt: "2026-08-21T00:00:00.000Z",
      reasonCode: "site_validation_blocked",
      evidence: {
        screenshotRef: null,
        redacted: true,
        pageUrl: "https://app.mokahr.com/example/apply",
        siteConfirmation: null,
        validationMessages: [],
        missingFields: [],
        failureDetails: {
          failures: ["连续 3 个动作未改变页面状态"],
          visionDiagnostics: [{
            schemaVersion: "auto-apply-vision-diagnostic.v1",
            iteration: 3,
            phase: "blocked",
            label: "声明"
          }]
        }
      }
    });

    expect(result.evidence?.failureDetails).toMatchObject({
      failures: ["连续 3 个动作未改变页面状态"],
      visionDiagnostics: [expect.objectContaining({ iteration: 3, phase: "blocked" })]
    });
  });

  it("accepts a resumable identity-verification handoff", () => {
    const result = autoApplyJobResultSchema.parse({
      schemaVersion: "auto-apply-job-result.v1",
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      status: "waiting_for_user_action",
      occurredAt: "2026-08-22T00:00:00.000Z",
      reasonCode: "identity_verification_required",
      evidence: {
        screenshotRef: null,
        redacted: true,
        pageUrl: "https://app.mokahr.com/example/apply",
        siteConfirmation: null,
        userActionRequired: {
          type: "identity_verification",
          message: "请完成身份核验",
          resumeSupported: true
        },
        diagnostic: {
          code: "identity_verification_required",
          category: "human_action",
          stage: "submit",
          userMessage: "当前招聘页面需要完成身份核验。",
          developerMessage: "提交确认后检测到身份核验控件，任务已暂停并保留原标签页。",
          retryable: true,
          recommendedAction: "prompt_user_then_resume"
        }
      }
    });

    expect(result.status).toBe("waiting_for_user_action");
    expect(result.evidence?.userActionRequired).toMatchObject({ type: "identity_verification", resumeSupported: true });
    expect(result.evidence?.diagnostic).toMatchObject({
      code: "identity_verification_required",
      category: "human_action",
      recommendedAction: "prompt_user_then_resume"
    });
  });

  it("accepts a non-user-blocking pending site receipt", () => {
    const result = autoApplyJobResultSchema.parse({
      schemaVersion: "auto-apply-job-result.v1",
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      status: "waiting_for_site_receipt",
      occurredAt: "2026-09-01T10:00:00.000Z",
      reasonCode: "submission_receipt_pending",
      evidence: {
        screenshotRef: null,
        redacted: true,
        pageUrl: "https://app.mokahr.com/example/apply",
        siteConfirmation: "已触发投递，正在后台等待招聘网站回执"
      }
    });

    expect(result).toMatchObject({
      status: "waiting_for_site_receipt",
      reasonCode: "submission_receipt_pending"
    });
    expect(result.evidence?.userActionRequired).toBeUndefined();
  });

  it("preserves structured required-field requests for the AI side", () => {
    const result = autoApplyJobResultSchema.parse({
      schemaVersion: "auto-apply-job-result.v1",
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      status: "waiting_for_user_action",
      occurredAt: "2026-08-25T00:00:00.000Z",
      reasonCode: "missing_information",
      evidence: {
        screenshotRef: null,
        redacted: true,
        pageUrl: "https://app.mokahr.com/example/apply",
        siteConfirmation: null,
        missingFields: ["个人信息 · 性别"],
        requiredFieldRequests: [{
          schemaVersion: "required-field-request.v1",
          fieldId: "gender",
          stableFieldKey: "basic.gender.combobox",
          label: "个人信息 · 性别",
          sectionKey: "basic",
          groupIndex: null,
          type: "combobox",
          controlKind: "combobox",
          required: true,
          reasonCode: "candidate_information_missing",
          description: "该字段必须使用页面有效选项，请向用户确认。",
          question: "请选择性别。",
          options: ["男", "女"]
        }]
      }
    });

    expect(result.evidence?.requiredFieldRequests).toEqual([
      expect.objectContaining({ fieldId: "gender", options: ["男", "女"] })
    ]);
  });
});

describe("auto apply job access tags", () => {
  const baseRequest = {
    schemaVersion: "auto-apply-batch-request.v1" as const,
    candidate: {
      packageRef: "https://files.example.com/candidate.zcresume.json",
      packageVersion: "1",
      packageSha256: "a".repeat(64),
      applicationProfile: {
        schemaVersion: "candidate-application-profile.v1" as const,
        revision: "c".repeat(64),
        facts: []
      }
    },
    assets: [{
      assetId: "resume-main",
      purpose: "resume" as const,
      fileRef: "https://files.example.com/resume.pdf",
      name: "resume.pdf",
      mediaType: "application/pdf"
    }],
    confirmation: {
      scope: "batch" as const,
      confirmedByUser: true as const,
      confirmedAt: "2026-08-23T00:00:00.000Z",
      displayedJobIds: ["job-1"],
      allowAutomaticFinalSubmit: true as const
    }
  };

  it("rejects a batch that omits the mandatory application profile snapshot", () => {
    const candidate = { ...baseRequest.candidate } as Record<string, unknown>;
    delete candidate.applicationProfile;
    expect(() => autoApplyBatchRequestSchema.parse({
      ...baseRequest,
      candidate,
      jobs: [{
        jobId: "job-1",
        companyName: "DeepSeek",
        title: "工程师",
        applicationUrl: "https://app.mokahr.com/example/job/job-1/apply",
        tags: [],
        locations: [],
        answers: {}
      }]
    })).toThrow();
  });

  it("preserves an advisory login-required tag", () => {
    const request = autoApplyBatchRequestSchema.parse({
      ...baseRequest,
      jobs: [{
        jobId: "job-1",
        companyName: "Example",
        title: "Engineer",
        applicationUrl: "https://example.com/apply",
        tags: ["application_access:login_required"]
      }]
    });
    expect(request.jobs[0]?.tags).toEqual(["application_access:login_required"]);
  });

  it("defaults missing tags for old AI Offer callers", () => {
    const request = autoApplyBatchRequestSchema.parse({
      ...baseRequest,
      jobs: [{
        jobId: "job-1",
        companyName: "Example",
        title: "Engineer",
        applicationUrl: "https://example.com/apply"
      }]
    });
    expect(request.jobs[0]?.tags).toEqual([]);
    expect(request.safety.allowConsentClick).toBe(false);
  });

  it("preserves the canonical consent permission and compatibility aliases", () => {
    const job = {
      jobId: "job-1",
      companyName: "小鹏汽车",
      title: "Engineer",
      applicationUrl: "https://xiaopeng.jobs.feishu.cn/index/resume/1/apply"
    };
    const canonical = autoApplyBatchRequestSchema.parse({
      ...baseRequest,
      safety: { allowConsentClick: true },
      jobs: [job]
    });
    const topLevel = autoApplyBatchRequestSchema.parse({
      ...baseRequest,
      allowConsentClick: true,
      jobs: [job]
    });
    const policyAlias = autoApplyBatchRequestSchema.parse({
      ...baseRequest,
      executionPolicy: { allowConsentClick: true },
      jobs: [job]
    });
    expect(canonical.safety.allowConsentClick).toBe(true);
    expect(topLevel.allowConsentClick).toBe(true);
    expect(policyAlias.executionPolicy.allowConsentClick).toBe(true);
  });

  it("defaults login handling to pause and resume while accepting old callers", () => {
    const requestWithJob = {
      ...baseRequest,
      jobs: [{
        jobId: "job-1",
        companyName: "Example",
        title: "Engineer",
        applicationUrl: "https://example.com/apply"
      }]
    };
    const current = autoApplyBatchRequestSchema.parse(requestWithJob);
    expect(current.executionPolicy.loginPolicy).toBe("pause_and_resume");
    const legacy = autoApplyBatchRequestSchema.parse({
      ...requestWithJob,
      executionPolicy: { loginPolicy: "skip_and_report" }
    });
    expect(legacy.executionPolicy.loginPolicy).toBe("pause_and_resume");
  });

  it("accepts a per-job preferred-city answer with explicit provenance", () => {
    const request = autoApplyBatchRequestSchema.parse({
      ...baseRequest,
      jobs: [{
        jobId: "job-1",
        companyName: "Example",
        title: "Engineer",
        applicationUrl: "https://example.com/apply",
        locations: ["北京市", "杭州市"],
        answers: {
          preferredCity: {
            value: "北京",
            source: "user_confirmed",
            confirmedAt: "2026-08-23T00:00:00.000Z"
          }
        }
      }]
    });
    expect(request.jobs[0]?.answers.preferredCity).toEqual({
      value: "北京",
      source: "user_confirmed",
      confirmedAt: "2026-08-23T00:00:00.000Z"
    });
  });
});
