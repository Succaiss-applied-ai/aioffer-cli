import { z } from "zod";

export const candidateProfileSchema = z.object({
  schemaVersion: z.literal("candidate-profile.v1"),
  basic: z.record(z.string(), z.unknown()).default({}),
  preferences: z.record(z.string(), z.unknown()).default({}),
  educations: z.array(z.record(z.string(), z.unknown())).default([]),
  workExperiences: z.array(z.record(z.string(), z.unknown())).default([]),
  projects: z.array(z.record(z.string(), z.unknown())).default([]),
  research: z.array(z.record(z.string(), z.unknown())).default([]),
  awards: z.array(z.record(z.string(), z.unknown())).default([]),
  skills: z.array(z.record(z.string(), z.unknown())).default([]),
  additional: z.record(z.string(), z.unknown()).default({})
});

export const applicationAssetSchema = z.object({
  assetId: z.string().min(1),
  purpose: z.enum(["resume", "portrait", "portfolio", "other"]),
  fileRef: z.string().min(1),
  name: z.string().min(1),
  mediaType: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  expiresAt: z.string().datetime().optional()
});

export const applicationRunRequestSchema = z.object({
  schemaVersion: z.literal("application-run-request.v1"),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  deviceId: z.string().trim().min(1).max(128),
  conversationId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1),
  job: z.object({
    jobId: z.string().min(1),
    companyName: z.string().min(1),
    title: z.string().min(1),
    city: z.string().default(""),
    applicationUrl: z.string().url()
  }),
  candidate: z.object({
    profileRef: z.string().min(1),
    snapshotVersion: z.string().min(1),
    profile: candidateProfileSchema.optional()
  }),
  assets: z.array(applicationAssetSchema).default([]),
  executionPolicy: z.object({
    mode: z.enum(["manual_copy", "assisted_rpa"]).default("manual_copy"),
    allowAutoFill: z.boolean().default(false),
    allowSiteResumeParser: z.boolean().default(true),
    allowFinalSubmit: z.literal(false).default(false)
  }).default({
    mode: "manual_copy",
    allowAutoFill: false,
    allowSiteResumeParser: true,
    allowFinalSubmit: false
  })
});

export const interactionQuestionSchema = z.object({
  questionId: z.string().min(1),
  semanticKey: z.string().min(1).nullable().default(null),
  label: z.string().min(1),
  question: z.string().min(1),
  answerType: z.enum(["text", "number", "boolean", "single_select", "multi_select", "file", "date"]),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  rememberAllowed: z.boolean().default(false)
});

export const applicationRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_user_action",
  "waiting_for_user_input",
  "review_required",
  "submitting",
  "completed",
  "failed",
  "cancelled"
]);

export const applicationRunEventTypeSchema = z.enum([
  "run_created",
  "progress",
  "user_action_required",
  "user_input_required",
  "review_required",
  "run_completed",
  "run_failed"
]);

export const applicationRunEventSchema = z.object({
  schemaVersion: z.literal("application-run-event.v1"),
  eventId: z.string().uuid(),
  runId: z.string().uuid(),
  sequence: z.number().int().positive(),
  type: applicationRunEventTypeSchema,
  occurredAt: z.string().datetime(),
  reason: z.string().nullable().default(null),
  message: z.string().default(""),
  questions: z.array(interactionQuestionSchema).default([]),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const applicationRunSchema = z.object({
  schemaVersion: z.literal("application-run.v1"),
  runId: z.string().uuid(),
  request: applicationRunRequestSchema,
  status: applicationRunStatusSchema,
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confirmation: z.object({
    confirmationId: z.string().uuid(),
    reviewHash: z.string().min(1),
    expiresAt: z.string().datetime()
  }).nullable(),
  events: z.array(applicationRunEventSchema)
});

export const answerSubmissionSchema = z.object({
  schemaVersion: z.literal("application-answers.v1"),
  answers: z.array(z.object({
    questionId: z.string().min(1),
    value: z.unknown(),
    remember: z.boolean().default(false)
  })).min(1)
});

export const applicationConfirmationSchema = z.object({
  schemaVersion: z.literal("application-confirmation.v1"),
  confirmationId: z.string().uuid(),
  reviewHash: z.string().min(1),
  confirmedByUser: z.literal(true)
});

export type CandidateProfile = z.infer<typeof candidateProfileSchema>;
export type ApplicationAsset = z.infer<typeof applicationAssetSchema>;
export type ApplicationRunRequest = z.infer<typeof applicationRunRequestSchema>;
export type InteractionQuestion = z.infer<typeof interactionQuestionSchema>;
export type ApplicationRunStatus = z.infer<typeof applicationRunStatusSchema>;
export type ApplicationRunEvent = z.infer<typeof applicationRunEventSchema>;
export type ApplicationRun = z.infer<typeof applicationRunSchema>;
export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;
export type ApplicationConfirmation = z.infer<typeof applicationConfirmationSchema>;

export interface ExecutionEvent {
  type: ApplicationRunEvent["type"];
  reason?: string | null;
  message?: string;
  questions?: InteractionQuestion[];
  payload?: Record<string, unknown>;
  executorState?: Record<string, unknown>;
}
