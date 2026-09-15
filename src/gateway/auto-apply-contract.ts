import { requiredFieldInputKinds } from "../required-field-input.js";
import { z } from "zod";

export const autoApplyUploadRejectionSchema = z.object({
  uploadFields: z.array(z.object({
    stableFieldKey: z.string().trim().min(1).max(300).nullable(),
    label: z.string().trim().min(1).max(300),
    type: z.literal("file"),
    validationMessage: z.string().trim().min(1).max(1000)
  })).min(1).max(200),
  failures: z.array(z.string().trim().min(1).max(1302)).min(1).max(200)
});
export type AutoApplyUploadRejection = z.infer<typeof autoApplyUploadRejectionSchema>;

export const autoApplyAssetSchema = z.object({
  assetId: z.string().trim().min(1),
  purpose: z.enum(["resume", "portrait", "portfolio", "other"]),
  fileRef: z.string().trim().min(1),
  name: z.string().trim().min(1),
  mediaType: z.string().trim().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  expiresAt: z.string().datetime().optional()
});

export const autoApplyPreferredCityAnswerSchema = z.object({
  value: z.string().trim().min(1).max(120),
  source: z.enum(["confirmed_single_job_location", "user_confirmed"]),
  confirmedAt: z.string().datetime()
});

export const autoApplyRequiredFieldDateValueSchema = z.object({
  year: z.number().int().min(1000).max(9999),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31)
});

export const autoApplyRequiredFieldAnswerSchema = z.object({
  fieldId: z.string().trim().min(1).max(200),
  stableFieldKey: z.string().trim().min(1).max(300).nullable(),
  value: z.union([
    z.string().trim().min(1).max(2_000),
    z.array(z.string().trim().min(1).max(300)).min(1).max(20)
  ]),
  dateValue: autoApplyRequiredFieldDateValueSchema.optional(),
  source: z.literal("user_confirmed"),
  answeredAt: z.string().datetime()
}).superRefine((answer, context) => {
  if (!answer.dateValue) return;
  const { year, month, day } = answer.dateValue;
  const date = new Date(Date.UTC(year, month - 1, day));
  const canonical = date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : "";
  if (Array.isArray(answer.value) || answer.value !== canonical) {
    context.addIssue({
      code: "custom",
      path: ["dateValue"],
      message: "结构化日期必须有效并与规范日期值一致"
    });
  }
});

export const autoApplyRequiredFieldAnswersSchema = z.object({
  schemaVersion: z.literal("required-field-answers.v1"),
  answers: z.array(autoApplyRequiredFieldAnswerSchema).min(1).max(200)
});

export const candidateApplicationProfileFactSchema = z.object({
  fieldAliases: z.array(z.string().min(1).max(300)).max(40).optional(),
  schemaVersion: z.literal("candidate-application-profile-fact.v1"),
  semanticKey: z.string().trim().min(1).max(200).optional(),
  fieldBinding: z.object({
    jobId: z.string().trim().min(1).max(500),
    stableFieldKey: z.string().trim().min(1).max(500),
    sectionKey: z.string().trim().max(200),
    groupIndex: z.number().int().nonnegative().nullable()
  }).optional(),
  stableFieldKeys: z.array(z.string().trim().min(1).max(500)).max(20),
  label: z.string().trim().min(1).max(300),
  normalizedLabel: z.string().trim().min(1).max(300),
  controlType: z.string().trim().min(1).max(80).optional(),
  observedSites: z.array(z.string().trim().min(1).max(255)).max(20),
  value: z.string().trim().min(1).max(4_000),
  source: z.literal("user_confirmed"),
  confirmedAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((fact, context) => {
  if (fact.fieldBinding && (fact.stableFieldKeys.length !== 1 ||
    fact.stableFieldKeys[0] !== fact.fieldBinding.stableFieldKey)) {
    context.addIssue({ code: "custom", path: ["fieldBinding"], message: "字段绑定必须与唯一稳定字段标识一致" });
  }
});

export const candidateApplicationProfileSchema = z.object({
  sequence: z.number().int().nonnegative().optional(),
  schemaVersion: z.literal("candidate-application-profile.v1"),
  revision: z.string().regex(/^[a-f0-9]{64}$/i),
  facts: z.array(candidateApplicationProfileFactSchema).max(500),
  overrides: z.array(z.object({
    semanticKey: z.string().min(1).max(200), value: z.string().max(4000).optional(),
    values: z.array(z.string().min(1).max(4000)).max(200).optional(),
    removedValues: z.array(z.string().min(1).max(4000)).max(200).optional(),
    cleared: z.boolean().optional(), replaceBase: z.boolean().optional(),
    validUntil: z.string().datetime().optional()
  })).max(500).optional()
});

export const candidateApplicationProfileUpdateSchema = z.object({
  sequence: z.number().int().positive(), profile: candidateApplicationProfileSchema
}).superRefine((update, context) => {
  if (update.profile.sequence !== update.sequence)
    context.addIssue({ code: "custom", path: ["sequence"], message: "信息版本不一致" });
});

export const autoApplyJobInputSchema = z.object({
  jobId: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  title: z.string().trim().min(1),
  applicationUrl: z.string().url(),
  adapterHint: z.string().trim().min(1).optional(),
  // AI Offer may provide routing hints such as
  // application_access:public/login_required/unknown. They are advisory only;
  // the plugin always verifies the live page before filling or submitting.
  tags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  // 岗位工作地点只描述职位本身，不能推导为候选人的“期望城市”。只有
  // answers.preferredCity.source=user_confirmed 才可以作为候选人事实下发。
  // confirmed_single_job_location 仅用于兼容读取历史批次，Gateway 不会再生成它。
  locations: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  // Job-bound arrays explicitly confirmed on a previous attempt. Scalars keep
  // their existing candidate profile/answer paths.
  requiredFieldAnswers: z.array(autoApplyRequiredFieldAnswerSchema).max(200).refine(answers =>
    answers.every(answer => Array.isArray(answer.value) && !!answer.stableFieldKey &&
      new Set(answer.value).size === answer.value.length) &&
    new Set(answers.map(answer => answer.stableFieldKey)).size === answers.length
  ).optional(),
  answers: z.object({
    preferredCity: autoApplyPreferredCityAnswerSchema.optional()
  }).default({})
});

export const autoApplyBatchRequestSchema = z.object({
  schemaVersion: z.literal("auto-apply-batch-request.v1"),
  // Canonical batch-scoped permission supplied by AI Offer after the user has
  // confirmed the batch. The Gateway persists it and later forwards it in the
  // device command safety envelope. The plugin still applies an adapter and
  // exact-text guard before clicking any consent control.
  safety: z.object({
    allowConsentClick: z.boolean().default(false)
  }).default({ allowConsentClick: false }),
  // Compatibility with the first AI Offer test payload, which sent the flag
  // directly on the batch request before the canonical safety object existed.
  allowConsentClick: z.boolean().optional(),
  candidate: z.object({
    packageRef: z.string().trim().min(1),
    packageVersion: z.string().trim().min(1),
    packageSha256: z.string().regex(/^[a-f0-9]{64}$/i),
    applicationProfile: candidateApplicationProfileSchema,
    applicationProfileUrl: z.string().url().max(2048).optional()
  }),
  assets: z.array(autoApplyAssetSchema).default([]),
  jobs: z.array(autoApplyJobInputSchema).min(1).max(100),
  confirmation: z.object({
    scope: z.literal("batch"),
    confirmedByUser: z.literal(true),
    confirmedAt: z.string().datetime(),
    displayedJobIds: z.array(z.string().trim().min(1)).min(1),
    allowAutomaticFinalSubmit: z.boolean()
  }),
  executionPolicy: z.object({
    // `skip_and_report` is accepted as a legacy wire value. Runtime behavior
    // has always paused resumable login tasks, so normalize both values to the
    // explicit current policy instead of exposing a false behavioral choice.
    loginPolicy: z.enum(["pause_and_resume", "skip_and_report"])
      .default("pause_and_resume")
      .transform(() => "pause_and_resume" as const),
    concurrency: z.literal(1).default(1),
    // Kept as a backwards-compatible wire field. Automatic job retries are
    // forbidden: every plugin result is terminal and must be surfaced once.
    retryBeforeSubmit: z.number().int().min(0).max(1).default(0).transform(() => 0),
    captchaPolicy: z.literal("skip_and_report").default("skip_and_report"),
    missingInformationPolicy: z.literal("skip_and_report").default("skip_and_report"),
    ambiguousConsentPolicy: z.literal("skip_and_report").default("skip_and_report"),
    // Compatibility alias. New callers should use safety.allowConsentClick.
    allowConsentClick: z.boolean().optional()
  }).default({
    loginPolicy: "pause_and_resume",
    concurrency: 1,
    retryBeforeSubmit: 0,
    captchaPolicy: "skip_and_report",
    missingInformationPolicy: "skip_and_report",
    ambiguousConsentPolicy: "skip_and_report"
  }),
  callback: z.object({
    url: z.string().url(),
    secretRef: z.string().trim().min(1)
  }).optional()
}).superRefine((request, context) => {
  if (!request.assets.some((asset) => asset.purpose === "resume")) {
    context.addIssue({
      code: "custom",
      path: ["assets"],
      message: "批量自动投递至少需要一份 purpose=resume 的简历附件"
    });
  }
});

export const autoApplyBatchStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "completed",
  "completed_with_errors",
  "cancelled",
  "failed"
]);

export const autoApplyJobStatusSchema = z.enum([
  "queued",
  "preflight",
  "opening",
  "observing",
  "uploading",
  "optional_site_resume_parse",
  "filling",
  "auditing",
  "submitting",
  "verifying",
  "waiting_for_user_action",
  "waiting_for_site_receipt",
  "skipped_login_required",
  "skipped_unsupported_site",
  "skipped_missing_information",
  "skipped_captcha",
  "skipped_ambiguous_consent",
  "succeeded",
  "failed",
  "cancelled"
]);

export const autoApplyJobProgressStageSchema = z.enum([
  "preflight",
  "opening",
  "observing",
  "uploading",
  "optional_site_resume_parse",
  "filling",
  "auditing",
  "submitting",
  "verifying"
]);

export const autoApplyJobProgressSchema = z.object({
  schemaVersion: z.literal("auto-apply-job-progress.v1"),
  deviceId: z.string().trim().min(1).max(200),
  batchId: z.string().uuid(),
  batchJobId: z.string().uuid(),
  jobId: z.string().trim().min(1).max(300),
  sequence: z.number().int().min(1),
  stage: autoApplyJobProgressStageSchema,
  message: z.string().trim().min(1).max(500),
  occurredAt: z.string().datetime()
});

export const terminalAutoApplyJobStatuses = new Set<AutoApplyJobStatus>([
  "skipped_login_required",
  "skipped_unsupported_site",
  "skipped_missing_information",
  "skipped_captcha",
  "skipped_ambiguous_consent",
  "succeeded",
  "failed",
  "cancelled"
]);

export const autoApplyDiagnosticSchema = z.object({
  code: z.string().trim().min(1).max(100),
  category: z.enum([
    "human_action",
    "candidate_data",
    "asset",
    "page",
    "site_validation",
    "model",
    "transport",
    "authorization",
    "unsupported",
    "cancelled",
    "unknown"
  ]),
  stage: z.enum([
    "preflight",
    "login",
    "asset_download",
    "form_observation",
    "form_fill",
    "readback",
    "submit",
    "success_verification",
    "transport",
    "unknown"
  ]),
  userMessage: z.string().trim().min(1).max(500),
  developerMessage: z.string().trim().min(1).max(1_000),
  retryable: z.boolean(),
  recommendedAction: z.enum([
    "prompt_user_then_resume",
    "request_candidate_information",
    "refresh_asset_and_recreate_batch",
    "retry_job",
    "update_plugin",
    "inspect_evidence",
    "skip_job",
    "cancel_batch",
    "none"
  ])
});

export const autoApplyJobResultSchema = z.object({
  schemaVersion: z.literal("auto-apply-job-result.v1"),
  batchId: z.string().uuid(),
  batchJobId: z.string().uuid(),
  jobId: z.string().trim().min(1),
  status: autoApplyJobStatusSchema.refine((value) =>
    terminalAutoApplyJobStatuses.has(value) ||
      value === "waiting_for_user_action" || value === "waiting_for_site_receipt", {
    message: "岗位结果必须是终态、等待用户操作或等待站点回执"
  }),
  occurredAt: z.string().datetime(),
  reasonCode: z.string().trim().min(1).nullable().default(null),
  evidence: z.object({
    screenshotRef: z.string().trim().min(1).nullable().default(null),
    redacted: z.literal(true),
    pageUrl: z.string().url().nullable().default(null),
    siteConfirmation: z.string().max(300).nullable().default(null),
    // observeApplicationDocument emits up to forty distinct site errors.
    // Rejecting its valid envelope strands the durable receipt and device queue.
    validationMessages: z.array(z.string().max(1_000)).max(40).optional(),
    missingFields: z.array(z.string().max(300)).max(200).optional(),
    requiredFieldRequests: z.array(z.object({
      schemaVersion: z.literal("required-field-request.v1"),
      fieldId: z.string().trim().min(1).max(200),
      stableFieldKey: z.string().trim().min(1).max(300).nullable(),
      label: z.string().trim().min(1).max(300),
      sectionKey: z.string().trim().min(1).max(100).nullable(),
      groupIndex: z.number().int().min(0).nullable(),
      type: z.string().trim().min(1).max(100),
      controlKind: z.string().trim().min(1).max(100).nullable(),
      controlType: z.string().trim().min(1).max(100).optional(),
      regionLevel: z.enum(["province", "city", "district"]).optional(),
      inputKind: z.enum(requiredFieldInputKinds).optional(),
      required: z.literal(true),
      reasonCode: z.literal("candidate_information_missing"),
      description: z.string().trim().min(1).max(1_000),
      question: z.string().trim().min(1).max(1_000),
      options: z.array(z.string().trim().min(1).max(300)).max(1000)
    })).max(200).optional(),
    userActionRequired: z.object({
      type: z.enum(["login", "captcha", "identity_verification"]),
      message: z.string().trim().min(1).max(500),
      resumeSupported: z.literal(true)
    }).optional(),
    diagnostic: autoApplyDiagnosticSchema.optional(),
    // Failure details contain only redacted labels, counters and value-shape
    // summaries. Preserve them so AI Offer can diagnose the official plugin
    // execution without accessing raw candidate answers.
    failureDetails: z.record(z.string(), z.unknown()).optional()
  }).nullable().default(null)
});

export interface AutoApplyBatchJob {
  /** 本地半自动模式：仅批准当前回读哈希，不能批准变更后的页面。 */
  localReviewApproval?: { reviewHash: string; confirmedAt: string; expiresAt: string };
  candidateProfile?: z.infer<typeof candidateApplicationProfileSchema>;
  batchJobId: string;
  jobId: string;
  companyName: string;
  title: string;
  applicationUrl: string;
  adapterCode: string | null;
  /** Optional for backward-compatible reads of batches created before tags. */
  tags?: string[];
  /** Optional for backward-compatible reads of batches created before job-level answers. */
  locations?: string[];
  answers?: {
    preferredCity?: z.infer<typeof autoApplyPreferredCityAnswerSchema>;
  };
  /** User-confirmed answers written back to this original batch job. */
  requiredFieldAnswers?: Array<z.infer<typeof autoApplyRequiredFieldAnswerSchema>>;
  initialRequiredFieldAnswers?: Array<z.infer<typeof autoApplyRequiredFieldAnswerSchema>>;
  status: AutoApplyJobStatus;
  attempt: number;
  commandId: string | null;
  /** Durable per-job stop fence; confirmation is distinct from requesting cancellation. */
  stopRequest?: {
    requestId: string; requestedAt: string; commandId: string | null; confirmedAt: string | null;
    /** Server fencing ends execution authority; it does not acknowledge browser cleanup. */
    confirmationSource?: "never_claimed" | "device_ack" | "server_execution_fenced";
    cleanupAcknowledgedAt?: string | null;
  };
  /** Command whose receipt is being monitored after its execution slot was released. */
  receiptCommandId?: string;
  reasonCode: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Latest non-terminal progress reported by the claimed browser command. */
  progress?: {
    schemaVersion: "auto-apply-job-progress.v1";
    commandId: string;
    sequence: number;
    stage: AutoApplyJobProgressStage;
    message: string;
    occurredAt: string;
    receivedAt: string;
  };
  evidence: {
    screenshotRef: string | null;
    redacted: true;
    pageUrl: string | null;
    siteConfirmation: string | null;
    validationMessages?: string[];
    missingFields?: string[];
    requiredFieldRequests?: Array<{
      schemaVersion: "required-field-request.v1";
      fieldId: string;
      stableFieldKey: string | null;
      label: string;
      sectionKey: string | null;
      groupIndex: number | null;
      type: string;
      controlKind: string | null;
      regionLevel?: "province" | "city" | "district";
      controlType?: string;
      required: true;
      reasonCode: "candidate_information_missing";
      description: string;
      question: string;
      options: string[];
    }>;
    userActionRequired?: {
      type: "login" | "captcha" | "identity_verification";
      message: string;
      resumeSupported: true;
    };
    diagnostic?: z.infer<typeof autoApplyDiagnosticSchema>;
    failureDetails?: Record<string, unknown>;
  } | null;
}

export interface AutoApplyBatch {
  schemaVersion: "auto-apply-batch.v1";
  batchId: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  idempotencyKey: string;
  status: AutoApplyBatchStatus;
  /** Optional for batches persisted before job-level waiting was introduced. */
  pauseReason?: "user_requested" | "waiting_for_user_action" | null;
  candidate: {
    packageRef: string;
    packageVersion: string;
    packageSha256: string;
    applicationProfile: z.infer<typeof candidateApplicationProfileSchema>;
    applicationProfileUrl?: string;
  };
  assets: AutoApplyAsset[];
  jobs: AutoApplyBatchJob[];
  confirmation: z.infer<typeof autoApplyBatchRequestSchema>["confirmation"];
  safety: {
    allowConsentClick: boolean;
  };
  executionPolicy: z.infer<typeof autoApplyBatchRequestSchema>["executionPolicy"];
  callback: z.infer<typeof autoApplyBatchRequestSchema>["callback"] | null;
  callbackDelivery?: AutoApplyCallbackDelivery | null;
  authorizationId: string;
  authorizationExpiresAt: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutoApplyCallbackDelivery {
  status: "pending" | "delivered" | "failed";
  eventId: string;
  attempts: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
}

export type AutoApplyAsset = z.infer<typeof autoApplyAssetSchema>;
export type AutoApplyBatchRequest = z.infer<typeof autoApplyBatchRequestSchema>;
export type AutoApplyBatchStatus = z.infer<typeof autoApplyBatchStatusSchema>;
export type AutoApplyJobStatus = z.infer<typeof autoApplyJobStatusSchema>;
export type AutoApplyJobResult = z.infer<typeof autoApplyJobResultSchema>;
export type AutoApplyJobProgressStage = z.infer<typeof autoApplyJobProgressStageSchema>;
export type AutoApplyJobProgress = z.infer<typeof autoApplyJobProgressSchema>;
