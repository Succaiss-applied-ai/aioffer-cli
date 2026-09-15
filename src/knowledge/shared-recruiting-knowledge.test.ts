import { describe, expect, it } from "vitest";
import {
  knowledgeSyncReceiptSchema,
  sharedApplicationFormSchema
} from "./shared-recruiting-knowledge.js";

describe("shared recruiting knowledge contracts", () => {
  it("accepts a persisted LLM Web refresh over the historical cloud baseline", () => {
    const now = new Date().toISOString();
    const parsed = knowledgeSyncReceiptSchema.parse({
      receiptId: "sync-1",
      issuedAt: now,
      storage: "shared_cloud",
      namespace: "recruiting/jobs",
      baseline: {
        snapshotId: "recruiting-jobs-2026-07-30",
        datasetName: "全岗位招聘信息_C端数据结构版_20260730",
        observedAt: "2026-07-30T00:00:00.000Z",
        importedAt: now,
        recordCount: 338,
        sourceArtifact: "全岗位招聘信息_C端数据结构版_20260730.xlsx",
        sourceSha256: null
      },
      refresh: {
        executor: "local_model_web_runtime",
        startedAt: now,
        completedAt: now,
        queryCount: 4,
        fetchedPageCount: 20,
        verifiedJobCount: 12
      },
      mutations: {
        inserted: 2,
        updated: 3,
        unchanged: 7,
        deactivated: 1,
        formSchemasUpserted: 0
      },
      persistedAt: now
    });
    expect(parsed.storage).toBe("shared_cloud");
    expect(parsed.baseline.recordCount).toBe(338);
  });

  it("stores only non-personal form schema in shared knowledge", () => {
    const now = new Date().toISOString();
    const parsed = sharedApplicationFormSchema.safeParse({
      schemaId: "form-1",
      siteHost: "jobs.example.com",
      recruitmentChannel: "social",
      jobKnowledgeId: "job-1",
      snapshot: {
        status: "observed",
        fingerprint: "fp-1",
        fields: [{
          fieldId: "phone",
          label: "手机号",
          type: "tel",
          required: true,
          options: [],
          semanticKey: "basic.phone",
          value: "13800000000"
        }],
        observedAt: now
      },
      evidenceUrls: ["https://jobs.example.com/apply/1"],
      observedAt: now,
      visibility: "shared_non_personal"
    });
    expect(parsed.success).toBe(false);
  });
});
