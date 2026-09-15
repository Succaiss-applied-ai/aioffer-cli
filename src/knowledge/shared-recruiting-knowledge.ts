import { z } from "zod";
import {
  jobRecordSchema
} from "../domain.js";

export const historicalJobSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  datasetName: z.string().min(1),
  observedAt: z.string().datetime(),
  importedAt: z.string().datetime(),
  recordCount: z.number().int().nonnegative(),
  sourceArtifact: z.string().min(1),
  sourceSha256: z.string().length(64).nullable()
});

export const knowledgeMutationCountsSchema = z.object({
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  deactivated: z.number().int().nonnegative(),
  formSchemasUpserted: z.number().int().nonnegative()
});

export const knowledgeSyncReceiptSchema = z.object({
  receiptId: z.string().min(1),
  issuedAt: z.string().datetime(),
  storage: z.literal("shared_cloud"),
  namespace: z.string().min(1),
  baseline: historicalJobSnapshotSchema,
  refresh: z.object({
    executor: z.literal("local_model_web_runtime"),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    queryCount: z.number().int().nonnegative(),
    fetchedPageCount: z.number().int().nonnegative(),
    verifiedJobCount: z.number().int().nonnegative()
  }),
  mutations: knowledgeMutationCountsSchema,
  persistedAt: z.string().datetime()
});

export const sharedApplicationFormSchema = z.object({
  schemaId: z.string().min(1),
  siteHost: z.string().min(1),
  recruitmentChannel: z.string().min(1),
  jobKnowledgeId: z.string().min(1),
  snapshot: z.object({
    status: z.enum(["not_observed", "login_required", "observed", "not_applicable"]),
    fingerprint: z.string().nullable(),
    fields: z.array(z.object({
      fieldId: z.string().min(1),
      label: z.string().min(1),
      type: z.string().min(1),
      required: z.boolean(),
      options: z.array(z.string()),
      semanticKey: z.string().nullable()
    }).strict()).nullable(),
    observedAt: z.string().datetime().nullable()
  }).strict(),
  evidenceUrls: z.array(z.string().url()),
  observedAt: z.string().datetime(),
  visibility: z.literal("shared_non_personal")
});

export const knowledgeJobUpsertSchema = z.object({
  knowledgeId: z.string().min(1),
  job: jobRecordSchema,
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  contentHash: z.string().length(64),
  revision: z.number().int().positive(),
  provenance: z.array(z.object({
    source: z.string().min(1),
    url: z.string().url(),
    observedAt: z.string().datetime()
  })).min(1)
});

export type HistoricalJobSnapshot = z.infer<typeof historicalJobSnapshotSchema>;
export type KnowledgeSyncReceipt = z.infer<typeof knowledgeSyncReceiptSchema>;
export type SharedApplicationForm = z.infer<typeof sharedApplicationFormSchema>;
export type KnowledgeJobUpsert = z.infer<typeof knowledgeJobUpsertSchema>;

/**
 * Production hosts inject a cloud-backed implementation. The browser extension
 * never implements this repository and never persists the shared job corpus.
 */
export interface SharedRecruitingKnowledgeRepository {
  importHistoricalSnapshot(input: {
    snapshot: HistoricalJobSnapshot;
    jobs: KnowledgeJobUpsert[];
  }): Promise<KnowledgeSyncReceipt>;
  upsertLocalRefresh(input: {
    baselineSnapshotId: string;
    jobs: KnowledgeJobUpsert[];
    forms: SharedApplicationForm[];
  }): Promise<KnowledgeSyncReceipt>;
}
