import { z } from "zod";

export const recruitmentChannelSchema = z.enum([
  "internship",
  "campus",
  "graduate",
  "social",
  "unknown"
]);

export const employmentTypeSchema = z.enum([
  "internship",
  "full_time",
  "part_time",
  "contract",
  "unknown"
]);

export const searchFiltersSchema = z.object({
  roles: z.array(z.string()).default([]),
  locationMode: z.enum(["specified", "anywhere"]).default("specified"),
  locations: z.array(z.string()).default([]),
  channels: z.array(recruitmentChannelSchema).default([]),
  employmentTypes: z.array(employmentTypeSchema).default([]),
  industries: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  degrees: z.array(z.string()).default([]),
  excludedTerms: z.array(z.string()).default([]),
  maximumExperienceYears: z.number().int().nonnegative().nullable().default(null),
  publishedWithinDays: z.number().int().positive().nullable().default(null),
  maximumResults: z.number().int().min(1).max(500).default(100),
  maximumJobsPerCompany: z.number().int().min(1).max(50).default(5)
});

export const searchPlanSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  sourcePrompt: z.string().min(1),
  displayPrompt: z.string().min(1).optional(),
  filters: searchFiltersSchema,
  hardConstraints: z.array(z.string()),
  preferences: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  createdAt: z.string().datetime()
});

export const jobApplicationFormSnapshotSchema = z.object({
  status: z.enum([
    "not_observed",
    "login_required",
    "observed",
    "not_applicable"
  ]),
  fingerprint: z.string().nullable(),
  fields: z.array(z.object({
    fieldId: z.string().min(1),
    label: z.string().min(1),
    type: z.string().min(1),
    required: z.boolean(),
    options: z.array(z.string()),
    semanticKey: z.string().nullable()
  })).nullable(),
  observedAt: z.string().datetime().nullable()
});

export const applicationLoginRequirementSchema = z.object({
  status: z.enum(["required", "not_required", "unknown"]),
  scope: z.enum(["job", "company", "company_source", "unknown"]),
  verificationMethod: z.enum(["form_observation", "manual_apply_flow", "source_config", "unknown"]),
  verifiedAt: z.string().datetime().nullable(),
  evidenceUrl: z.string().url().nullable()
});

export const companyPositionTypeSchema = z.object({
  schemaVersion: z.literal("company-position-tag.v1"),
  taxonomyVersion: z.string().min(1),
  categoryId: z.string().min(1),
  level1: z.string().min(1),
  level2: z.string().min(1),
  level3: z.string().min(1),
  path: z.string().min(1),
  matchType: z.enum(["exact", "near", "fallback"]),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    evidence: z.array(z.string())
  }))
});

const unknownApplicationLoginRequirement = {
  status: "unknown" as const,
  scope: "unknown" as const,
  verificationMethod: "unknown" as const,
  verifiedAt: null,
  evidenceUrl: null
};

export const jobRecordSchema = z.object({
  id: z.string().min(1),
  canonicalUrl: z.string().url(),
  applicationUrl: z.string().url(),
  applicationLoginRequirement: applicationLoginRequirementSchema.default(unknownApplicationLoginRequirement),
  positionType: companyPositionTypeSchema.nullable().default(null),
  source: z.string().min(1),
  company: z.string().min(1),
  companyLogoUrl: z.string().url().nullable().optional(),
  companyLogoStatus: z.enum(["available", "not_found", "pending", "failed"]).optional(),
  companyLogoUpdatedAt: z.string().datetime().nullable().optional(),
  title: z.string().min(1),
  standardRoles: z.array(z.string()),
  locations: z.array(z.string()),
  cities: z.array(z.string()),
  channels: z.array(recruitmentChannelSchema),
  employmentType: employmentTypeSchema.nullable(),
  description: z.string(),
  candidatePreparation: z.string().nullable(),
  applicationForm: jobApplicationFormSnapshotSchema,
  skills: z.array(z.string()),
  degreeRequirement: z.string().nullable(),
  experienceRequirement: z.string().nullable(),
  salary: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  validThrough: z.string().datetime().nullable().optional(),
  activeStatus: z.enum(["active", "inactive", "restricted", "unknown"]),
  verifiedAt: z.string().datetime(),
  evidence: z.array(z.string().url())
});

export const resumeSectionSchema = z.object({
  kind: z.enum([
    "basic",
    "education",
    "work",
    "project",
    "internship",
    "research",
    "publication",
    "award",
    "skill",
    "intention",
    "narrative"
  ]),
  id: z.string().min(1),
  facts: z.record(z.string(), z.unknown()),
  polishedText: z.string().optional(),
  evidenceRefs: z.array(z.string()).default([])
});

export const resumeKnowledgeSnapshotSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  sourceModule: z.string().min(1),
  sourceDocumentRef: z.string().optional(),
  polishedDocumentRef: z.string().optional(),
  userApproved: z.boolean(),
  sections: z.array(resumeSectionSchema),
  createdAt: z.string().datetime()
});

export const formRequirementSchema = z.object({
  fieldId: z.string().min(1),
  label: z.string().min(1),
  inputType: z.string().min(1).optional(),
  semanticKey: z.string().min(1),
  required: z.boolean(),
  sensitive: z.boolean().default(false),
  scope: z.enum(["reusable", "batch", "job"]),
  options: z.array(z.string()).default([])
});

export const missingInformationSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  scope: z.enum(["reusable", "batch", "job"]),
  sensitive: z.boolean(),
  applicationItemIds: z.array(z.string().uuid()),
  options: z.array(z.string()),
  answered: z.boolean(),
  answer: z.unknown().optional()
});

export const applicationItemStatusSchema = z.enum([
  "queued",
  "opening",
  "login_required",
  "observing_form",
  "information_required",
  "ready_to_fill",
  "filling",
  "filled",
  "ready_for_review",
  "approved",
  "submitting",
  "submitted",
  "failed",
  "result_unknown",
  "cancelled"
]);

export const applicationItemSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  job: jobRecordSchema,
  status: applicationItemStatusSchema,
  formFingerprint: z.string().nullable(),
  requirements: z.array(formRequirementSchema),
  answers: z.record(z.string(), z.unknown()),
  lastError: z.string().nullable()
});

export const applicationBatchSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  resumeSnapshotId: z.string().uuid(),
  status: z.enum([
    "preparing",
    "information_required",
    "ready_for_review",
    "approved",
    "submitting",
    "completed",
    "partially_completed",
    "cancelled"
  ]),
  items: z.array(applicationItemSchema).min(1).max(20),
  missingInformation: z.array(missingInformationSchema),
  approvalManifestHash: z.string().nullable(),
  approvalExpiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type RecruitmentChannel = z.infer<typeof recruitmentChannelSchema>;
export type SearchPlan = z.infer<typeof searchPlanSchema>;
export type JobRecord = z.infer<typeof jobRecordSchema>;
export type JobApplicationFormSnapshot = z.infer<
  typeof jobApplicationFormSnapshotSchema
>;
export type ResumeKnowledgeSnapshot = z.infer<
  typeof resumeKnowledgeSnapshotSchema
>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type FormRequirement = z.infer<typeof formRequirementSchema>;
export type MissingInformation = z.infer<typeof missingInformationSchema>;
export type ApplicationItem = z.infer<typeof applicationItemSchema>;
export type ApplicationBatch = z.infer<typeof applicationBatchSchema>;
