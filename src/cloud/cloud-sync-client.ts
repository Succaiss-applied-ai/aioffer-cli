import { z } from "zod";
import {
  jobRecordSchema,
  resumeKnowledgeSnapshotSchema,
  type ResumeKnowledgeSnapshot
} from "../domain.js";
import {
  knowledgeJobUpsertSchema,
  sharedApplicationFormSchema,
  type KnowledgeJobUpsert,
  type SharedApplicationForm
} from "../knowledge/shared-recruiting-knowledge.js";

const capabilitiesSchema = z.object({
  schemaVersion: z.literal("cloud-capabilities.v1"),
  service: z.literal("recruiting-cloud-sync"),
  capabilities: z.array(z.string()),
  schemas: z.record(z.string(), z.string()),
  limits: z.object({
    maximumPullItems: z.number().int().positive(),
    maximumPushItems: z.number().int().positive(),
    maximumPayloadBytes: z.number().int().positive()
  }),
  serverTime: z.string().datetime()
});

const pullResultSchema = z.object({
  schemaVersion: z.literal("job-knowledge-pull-result.v1"),
  snapshotId: z.string().min(1),
  cursor: z.string().min(1),
  hasMore: z.boolean(),
  jobs: z.array(knowledgeJobUpsertSchema),
  forms: z.array(sharedApplicationFormSchema)
});

const pushResultSchema = z.object({
  schemaVersion: z.literal("job-knowledge-push-result.v1"),
  receiptId: z.string().min(1),
  acceptedAt: z.string().datetime(),
  nextCursor: z.string().min(1),
  counts: z.object({
    inserted: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    conflicted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative()
  }),
  results: z.array(z.object({
    clientItemIndex: z.number().int().nonnegative(),
    status: z.string().min(1),
    knowledgeId: z.string().nullable(),
    revision: z.number().int().positive().nullable(),
    error: z.unknown().nullable()
  }))
});

export type CloudCapabilities = z.infer<typeof capabilitiesSchema>;
export type JobKnowledgePullResult = z.infer<typeof pullResultSchema>;
export type JobKnowledgePushResult = z.infer<typeof pushResultSchema>;

export interface JobKnowledgePullRequest {
  cursor: string | null;
  filters: {
    roles: string[];
    cities: string[];
    channels: string[];
    employmentTypes: string[];
    updatedAfter: string | null;
  };
  include: {
    inactive: boolean;
    restricted: boolean;
    formSchemas: boolean;
  };
  limit: number;
}

export interface VerifiedJobDelta {
  operation: "upsert" | "mark_inactive" | "mark_restricted" | "mark_unknown" | "restore_active";
  knowledgeId: string | null;
  baseRevision: number | null;
  deduplicationKey: string;
  contentHash: string;
  job: z.infer<typeof jobRecordSchema>;
  provenance: KnowledgeJobUpsert["provenance"];
  verification: Record<string, unknown>;
}

export interface CloudSyncClientOptions {
  baseUrl: string;
  accessToken: string;
  deviceId: string;
  tenantId: string;
  fetcher?: typeof fetch;
}

export class CloudSyncClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: CloudSyncClientOptions) {
    const parsed = new URL(options.baseUrl);
    if (parsed.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
      throw new Error("云同步地址必须使用 HTTPS；本机联调可使用 localhost HTTP");
    }
    this.baseUrl = parsed.href.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async capabilities(signal?: AbortSignal): Promise<CloudCapabilities> {
    return capabilitiesSchema.parse(await this.request("/capabilities", { method: "GET", signal }));
  }

  async pullJobs(input: JobKnowledgePullRequest, signal?: AbortSignal): Promise<JobKnowledgePullResult> {
    return pullResultSchema.parse(await this.request("/job-knowledge:pull", {
      method: "POST",
      body: JSON.stringify({ schemaVersion: "job-knowledge-pull.v1", ...input }),
      signal
    }));
  }

  async pushJobs(input: {
    runId: string;
    baseCursor: string | null;
    observedAt: string;
    items: VerifiedJobDelta[];
    idempotencyKey: string;
  }, signal?: AbortSignal): Promise<JobKnowledgePushResult> {
    return pushResultSchema.parse(await this.request("/job-knowledge:push", {
      method: "POST",
      headers: { "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({
        schemaVersion: "job-knowledge-push.v1",
        runId: input.runId,
        baseCursor: input.baseCursor,
        observedAt: input.observedAt,
        items: input.items
      }),
      signal
    }));
  }

  async pushForm(input: {
    jobKnowledgeId: string;
    baseRevision: number | null;
    form: SharedApplicationForm;
    idempotencyKey: string;
  }, signal?: AbortSignal): Promise<unknown> {
    sharedApplicationFormSchema.parse(input.form);
    return this.request("/form-schemas:push", {
      method: "POST",
      headers: { "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({
        schemaVersion: "application-form-schema-push.v1",
        jobKnowledgeId: input.jobKnowledgeId,
        baseRevision: input.baseRevision,
        form: input.form
      }),
      signal
    });
  }

  async getCurrentResume(signal?: AbortSignal): Promise<ResumeKnowledgeSnapshot | null> {
    const body = await this.request("/resume-knowledge/current", { method: "GET", signal });
    const parsed = z.object({
      schemaVersion: z.literal("resume-knowledge-result.v1"),
      snapshot: resumeKnowledgeSnapshotSchema.nullable(),
      etag: z.string().nullable()
    }).parse(body);
    return parsed.snapshot;
  }

  async putResume(snapshot: ResumeKnowledgeSnapshot, idempotencyKey: string, signal?: AbortSignal): Promise<ResumeKnowledgeSnapshot> {
    const parsed = resumeKnowledgeSnapshotSchema.parse(snapshot);
    return resumeKnowledgeSnapshotSchema.parse(await this.request(
      `/resume-knowledge/snapshots/${encodeURIComponent(parsed.id)}`,
      {
        method: "PUT",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify(parsed),
        signal
      }
    ));
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.accessToken}`,
        "x-device-id": this.options.deviceId,
        "x-tenant-id": this.options.tenantId,
        ...init.headers
      }
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(`云同步返回 HTTP ${response.status}${body ? `：${body}` : ""}`);
    }
    return response.status === 204 ? null : response.json();
  }
}
