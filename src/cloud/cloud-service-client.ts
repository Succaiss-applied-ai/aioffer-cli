import { z } from "zod";
import {
  applicationLoginRequirementSchema,
  companyPositionTypeSchema,
  employmentTypeSchema,
  jobRecordSchema,
  recruitmentChannelSchema,
  type JobRecord,
  type SearchPlan
} from "../domain.js";

const evidenceSchema = z.object({
  url: z.string().url(),
  sourceId: z.string().min(1),
  observedAt: z.string().datetime(),
  contentHash: z.string().nullable().optional()
});

const companySummarySchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  industries: z.array(z.string()),
  officialWebsite: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  logoStatus: z.enum(["available", "not_found", "pending", "failed"]).optional(),
  logoUpdatedAt: z.string().datetime().nullable().optional()
});

export const cloudJobSummarySchema = z.object({
  jobId: z.string().min(1),
  company: companySummarySchema,
  title: z.string().min(1),
  standardRoles: z.array(z.string()),
  cities: z.array(z.string()).min(1),
  channel: recruitmentChannelSchema,
  employmentType: employmentTypeSchema,
  applicationUrl: z.string().url(),
  applicationLoginRequirement: applicationLoginRequirementSchema.default({
    status: "unknown",
    scope: "unknown",
    verificationMethod: "unknown",
    verifiedAt: null,
    evidenceUrl: null
  }),
  positionType: companyPositionTypeSchema.nullable().default(null),
  canonicalUrl: z.string().url().optional(),
  description: z.string(),
  candidatePreparation: z.string(),
  formSummary: z.string(),
  status: z.enum(["active", "inactive", "restricted", "unknown"]),
  publishedAt: z.string().datetime().nullable().optional(),
  validThrough: z.string().datetime().nullable().optional(),
  salary: z.string().nullable().optional(),
  verifiedAt: z.string().datetime(),
  relevanceScore: z.number().min(0).max(1),
  evidence: z.array(evidenceSchema).min(1),
  requirements: z.object({
    degrees: z.array(z.string()).default([]),
    experienceYearsMin: z.number().nonnegative().nullable().optional(),
    experienceYearsMax: z.number().nonnegative().nullable().optional(),
    skills: z.array(z.string()).default([])
  }).optional()
});

const capabilitiesSchema = z.object({
  schemaVersion: z.literal("capabilities.v2"),
  jobSearch: z.boolean(),
  formSchemaRead: z.boolean(),
  formSchemaWrite: z.boolean(),
  indexRevision: z.number().int().nonnegative(),
  indexUpdatedAt: z.string().datetime()
});

const jobSearchResponseSchema = z.object({
  schemaVersion: z.literal("job-search-response.v2"),
  indexRevision: z.number().int().nonnegative(),
  indexUpdatedAt: z.string().datetime(),
  items: z.array(cloudJobSummarySchema),
  page: z.object({ nextCursor: z.string().nullable().optional() })
});

export const cloudFormFieldSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  normalizedLabel: z.string().min(1),
  type: z.enum([
    "text",
    "textarea",
    "number",
    "date",
    "date_range",
    "single_select",
    "multi_select",
    "radio",
    "checkbox",
    "file",
    "rich_text",
    "table",
    "unknown"
  ]),
  required: z.boolean(),
  sectionKind: z.enum([
    "basic_information",
    "education",
    "work_experience",
    "project_experience",
    "research",
    "job_preference",
    "attachments",
    "consent",
    "custom",
    "unknown"
  ]),
  repeatable: z.boolean(),
  repeatIndex: z.number().int().nonnegative().nullable().optional(),
  order: z.number().int().nonnegative(),
  semanticKey: z.string().nullable().optional(),
  mappingConfidence: z.number().min(0).max(1).nullable().optional(),
  options: z.array(z.string()),
  controlHints: z.object({
    role: z.string().nullable().optional(),
    inputMode: z.string().nullable().optional(),
    stableFieldKey: z.string().nullable().optional(),
    sectionKey: z.string().nullable().optional(),
    controlKind: z.string().nullable().optional()
  }).optional()
}).strict();

const applicationFormSchema = z.object({
  schemaVersion: z.literal("application-form-schema.v2"),
  schemaId: z.string().min(1),
  jobId: z.string().min(1),
  revision: z.number().int().positive(),
  fingerprint: z.string().min(1),
  applicationUrl: z.string().url(),
  loginRequired: z.boolean(),
  fields: z.array(cloudFormFieldSchema),
  observedAt: z.string().datetime()
});

const formObservationReceiptSchema = z.object({
  schemaVersion: z.literal("application-form-observation-receipt.v2"),
  accepted: z.boolean(),
  deduplicated: z.boolean(),
  schemaId: z.string().nullable().optional(),
  revision: z.number().int().positive().nullable().optional(),
  requestId: z.string().min(1)
});

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    userAction: z.string().nullable().optional(),
    retryable: z.boolean().optional(),
    requestId: z.string().optional(),
    details: z.unknown().optional()
  })
});

export type CloudCapabilitiesV2 = z.infer<typeof capabilitiesSchema>;
export type CloudJobSummary = z.infer<typeof cloudJobSummarySchema>;
export type CloudApplicationFormSchema = z.infer<typeof applicationFormSchema>;
export type CloudFormField = z.infer<typeof cloudFormFieldSchema>;
export type CloudFormObservationReceipt = z.infer<typeof formObservationReceiptSchema>;

export interface CloudServiceClientOptions {
  baseUrl: string;
  accessToken: string;
  deviceId: string;
  tenantId: string;
  fetcher?: typeof fetch;
  requestId?: () => string;
}

export interface FormObservationInput {
  status: "login_required" | "observed" | "not_applicable" | "restricted";
  applicationUrl: string;
  siteHost: string;
  channel?: z.infer<typeof recruitmentChannelSchema>;
  loginRequired: boolean;
  fingerprint?: string | null;
  baseRevision?: number | null;
  fields: CloudFormField[];
  observedAt: string;
}

export class CloudServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly userAction: string | null,
    readonly retryable: boolean,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "CloudServiceError";
  }
}

function asJobRecord(item: CloudJobSummary): JobRecord {
  const experience = item.requirements
    ? [item.requirements.experienceYearsMin, item.requirements.experienceYearsMax]
        .filter((value): value is number => value !== null && value !== undefined)
        .join("–")
    : "";
  return jobRecordSchema.parse({
    id: item.jobId,
    canonicalUrl: item.canonicalUrl ?? item.applicationUrl,
    applicationUrl: item.applicationUrl,
    applicationLoginRequirement: item.applicationLoginRequirement,
    positionType: item.positionType,
    source: item.evidence.map((entry) => entry.sourceId).join(","),
    company: item.company.name,
    companyLogoUrl: item.company.logoUrl ?? null,
    companyLogoStatus: item.company.logoStatus ?? "pending",
    companyLogoUpdatedAt: item.company.logoUpdatedAt ?? null,
    title: item.title,
    standardRoles: item.standardRoles,
    locations: item.cities,
    cities: item.cities,
    channels: [item.channel],
    employmentType: item.employmentType,
    description: item.description,
    candidatePreparation: item.candidatePreparation,
    applicationForm: {
      status: item.formSummary === "N/A" ? "not_observed" : "observed",
      fingerprint: null,
      fields: null,
      observedAt: null
    },
    skills: item.requirements?.skills ?? [],
    degreeRequirement: item.requirements?.degrees.join("、") || null,
    experienceRequirement: experience || null,
    salary: item.salary ?? null,
    publishedAt: item.publishedAt ?? null,
    validThrough: item.validThrough ?? null,
    activeStatus: item.status,
    verifiedAt: item.verifiedAt,
    evidence: item.evidence.map((entry) => entry.url)
  });
}

function searchBody(plan: SearchPlan, cursor: string | null = null, limit = Math.min(100, plan.filters.maximumResults)) {
  return {
    schemaVersion: "job-search-request.v2" as const,
    query: plan.displayPrompt ?? plan.sourcePrompt,
    filters: {
      roles: plan.filters.roles,
      location: {
        mode: plan.filters.locationMode === "anywhere" ? "anywhere" as const : "specified" as const,
        cities: plan.filters.locationMode === "anywhere" ? [] : plan.filters.locations
      },
      channels: plan.filters.channels,
      employmentTypes: plan.filters.employmentTypes,
      industries: plan.filters.industries,
      skills: plan.filters.skills,
      degrees: plan.filters.degrees,
      maximumExperienceYears: plan.filters.maximumExperienceYears,
      publishedWithinDays: plan.filters.publishedWithinDays,
      excludedTerms: plan.filters.excludedTerms,
      onlyActive: true
    },
    sort: "relevance" as const,
    page: {
      limit,
      ...(cursor ? { cursor } : {})
    }
  };
}

export class CloudServiceClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly requestId: () => string;

  constructor(private readonly options: CloudServiceClientOptions) {
    const parsed = new URL(options.baseUrl);
    const local = ["127.0.0.1", "localhost"].includes(parsed.hostname);
    const approvedDevelopmentHost =
      (parsed.hostname === "119.29.25.120" && ["8092", "8093"].includes(parsed.port)) ||
      (["119.45.12.68", "182.61.133.130", "192.168.0.2"].includes(parsed.hostname) &&
        ["", "80"].includes(parsed.port));
    if (parsed.protocol !== "https:" && !((local || approvedDevelopmentHost) && parsed.protocol === "http:")) {
      throw new Error("云服地址必须使用 HTTPS；本机和已登记的部署环境可使用 HTTP");
    }
    if (!options.accessToken.trim()) throw new Error("云服访问令牌不能为空");
    if (!options.tenantId.trim()) throw new Error("云服租户 ID 不能为空");
    if (!options.deviceId.trim()) throw new Error("插件设备 ID 不能为空");
    this.baseUrl = parsed.href.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    this.requestId = options.requestId ?? (() => crypto.randomUUID());
  }

  async capabilities(signal?: AbortSignal): Promise<CloudCapabilitiesV2> {
    return capabilitiesSchema.parse(await this.request("/capabilities", { method: "GET", signal }));
  }

  async searchJobs(
    plan: SearchPlan,
    signal?: AbortSignal
  ): Promise<{
    jobs: JobRecord[];
    scores: Record<string, number>;
    indexRevision: number;
    indexUpdatedAt: string;
    nextCursor: string | null;
  }> {
    const jobs: JobRecord[] = [];
    const scores: Record<string, number> = {};
    let cursor: string | null = null;
    let indexRevision = 0;
    let indexUpdatedAt = "";
    const target = Math.max(1, Math.min(500, plan.filters.maximumResults));
    const seenCursors = new Set<string>();

    do {
      const limit = Math.min(100, target - jobs.length);
      const response = jobSearchResponseSchema.parse(await this.request("/jobs:search", {
        method: "POST",
        body: JSON.stringify(searchBody(plan, cursor, limit)),
        signal
      }));
      indexRevision = response.indexRevision;
      indexUpdatedAt = response.indexUpdatedAt;
      for (const item of response.items) {
        if (jobs.some((job) => job.id === item.jobId)) continue;
        jobs.push(asJobRecord(item));
        scores[item.jobId] = Math.round(item.relevanceScore * 100);
      }
      cursor = response.page.nextCursor ?? null;
      if (cursor && seenCursors.has(cursor)) {
        throw new Error("云服分页游标重复，已停止检索以避免循环");
      }
      if (cursor) seenCursors.add(cursor);
      if (!response.items.length) break;
    } while (cursor && jobs.length < target);

    return {
      jobs,
      scores,
      indexRevision,
      indexUpdatedAt,
      nextCursor: jobs.length >= target ? cursor : null
    };
  }

  async getJob(jobId: string, signal?: AbortSignal): Promise<JobRecord> {
    const response = cloudJobSummarySchema.parse(await this.request(
      `/jobs/${encodeURIComponent(jobId)}`,
      { method: "GET", signal }
    ));
    return asJobRecord(response);
  }

  async getApplicationFormSchema(
    jobId: string,
    signal?: AbortSignal
  ): Promise<CloudApplicationFormSchema | null> {
    const response = await this.request(
      `/jobs/${encodeURIComponent(jobId)}/application-form-schema`,
      { method: "GET", signal },
      true
    );
    return response === null ? null : applicationFormSchema.parse(response);
  }

  async recordApplicationFormObservation(
    jobId: string,
    input: FormObservationInput,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<CloudFormObservationReceipt> {
    const fields = z.array(cloudFormFieldSchema).max(500).parse(input.fields);
    const forbidden = JSON.stringify(fields);
    if (/"(?:value|answer|candidateValue|selector|cookie|token|localPath)"\s*:/i.test(forbidden)) {
      throw new Error("表单结构包含禁止上传的候选人值或浏览器定位信息");
    }
    const body = {
      schemaVersion: "application-form-observation.v2" as const,
      ...input,
      fields
    };
    return formObservationReceiptSchema.parse(await this.request(
      `/jobs/${encodeURIComponent(jobId)}/application-form-observations`,
      {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify(body),
        signal
      }
    ));
  }

  private async request(
    path: string,
    init: RequestInit,
    allowNoContent = false
  ): Promise<unknown> {
    const requestId = this.requestId();
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.accessToken}`,
          "x-device-id": this.options.deviceId,
          "x-tenant-id": this.options.tenantId,
          "x-request-id": requestId,
          ...init.headers
        }
      });
    } catch (error) {
      throw new CloudServiceError(
        0,
        "SERVER_UNAVAILABLE",
        error instanceof Error ? error.message : "无法连接招聘云服",
        "检查云服地址和网络后重试。",
        true,
        requestId
      );
    }
    if (response.status === 204 && allowNoContent) return null;
    if (!response.ok) {
      const text = (await response.text()).slice(0, 2_000);
      let parsed: z.infer<typeof errorEnvelopeSchema> | null = null;
      try {
        parsed = errorEnvelopeSchema.parse(JSON.parse(text));
      } catch {
        // Use a stable public error when the upstream response is not contractual JSON.
      }
      throw new CloudServiceError(
        response.status,
        parsed?.error.code ?? "SERVER_UNAVAILABLE",
        parsed?.error.message ?? `招聘云服返回 HTTP ${response.status}`,
        parsed?.error.userAction ?? null,
        parsed?.error.retryable ?? response.status >= 500,
        parsed?.error.requestId ?? response.headers.get("x-request-id") ?? requestId
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }
}
