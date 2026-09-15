import { createHash } from "node:crypto";
import {
  applicationBatchSchema,
  type ApplicationBatch,
  type FormRequirement,
  type JobRecord,
  type MissingInformation
} from "../domain.js";
import type { BrowserCommandReceipt, DeviceBridge } from "../bridge/browser-bridge.js";
import { openJobCommand } from "../bridge/browser-bridge.js";
import {
  resumeFactIndex,
  type ResumeKnowledgeRepository
} from "../resume/resume-knowledge.js";

export interface ApplicationRepository {
  save(batch: ApplicationBatch): Promise<ApplicationBatch>;
  get(batchId: string): Promise<ApplicationBatch | null>;
}

export class MemoryApplicationRepository implements ApplicationRepository {
  private readonly batches = new Map<string, ApplicationBatch>();

  async save(batch: ApplicationBatch): Promise<ApplicationBatch> {
    const parsed = applicationBatchSchema.parse(batch);
    this.batches.set(parsed.id, structuredClone(parsed));
    return structuredClone(parsed);
  }

  async get(batchId: string): Promise<ApplicationBatch | null> {
    const result = this.batches.get(batchId);
    return result ? structuredClone(result) : null;
  }
}

export interface MissingAnswerInput {
  key: string;
  value: unknown;
}

export interface BatchReview {
  batchId: string;
  resumeSnapshotId: string;
  manifestHash: string;
  jobs: Array<{
    applicationItemId: string;
    company: string;
    title: string;
    applicationUrl: string;
    answers: Record<string, unknown>;
  }>;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function reviewFor(batch: ApplicationBatch): BatchReview {
  const jobs = batch.items.map((item) => ({
    applicationItemId: item.id,
    company: item.job.company,
    title: item.job.title,
    applicationUrl: item.job.applicationUrl,
    answers: item.answers
  }));
  const manifestHash = createHash("sha256")
    .update(
      stable({
        batchId: batch.id,
        resumeSnapshotId: batch.resumeSnapshotId,
        jobs: batch.items.map((item) => ({
          id: item.id,
          jobId: item.job.id,
          url: item.job.applicationUrl,
          formFingerprint: item.formFingerprint,
          answers: item.answers
        }))
      })
    )
    .digest("hex");
  return {
    batchId: batch.id,
    resumeSnapshotId: batch.resumeSnapshotId,
    manifestHash,
    jobs
  };
}

function missingKey(
  requirement: FormRequirement,
  applicationItemId: string
): string {
  return requirement.scope === "job"
    ? `${requirement.semanticKey}:${applicationItemId}`
    : requirement.semanticKey;
}

export class ApplicationService {
  private readonly reusableAnswers = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly resumes: ResumeKnowledgeRepository,
    private readonly applications: ApplicationRepository,
    private readonly bridge: DeviceBridge,
    private readonly now: () => Date = () => new Date()
  ) {}

  async createSingle(
    userId: string,
    resumeSnapshotId: string,
    job: JobRecord
  ): Promise<ApplicationBatch> {
    return this.createBatch(userId, resumeSnapshotId, [job]);
  }

  async createBatch(
    userId: string,
    resumeSnapshotId: string,
    jobs: JobRecord[]
  ): Promise<ApplicationBatch> {
    if (jobs.length < 1 || jobs.length > 20) {
      throw new Error("每批必须选择 1–20 个岗位");
    }
    const resume = await this.resumes.get(resumeSnapshotId);
    if (!resume || resume.userId !== userId) throw new Error("简历知识不存在");
    if (!resume.userApproved) throw new Error("简历知识尚未由用户确认");
    const jobIds = new Set<string>();
    for (const job of jobs) {
      if (jobIds.has(job.id)) throw new Error(`批次包含重复岗位：${job.id}`);
      jobIds.add(job.id);
      if (job.activeStatus === "inactive") {
        throw new Error(`岗位已失效：${job.company} ${job.title}`);
      }
    }
    const batchId = crypto.randomUUID();
    const batch = applicationBatchSchema.parse({
      id: batchId,
      userId,
      resumeSnapshotId,
      status: "preparing",
      items: jobs.map((job) => ({
        id: crypto.randomUUID(),
        batchId,
        job,
        status: "queued",
        formFingerprint: null,
        requirements: [],
        answers: {},
        lastError: null
      })),
      missingInformation: [],
      approvalManifestHash: null,
      approvalExpiresAt: null,
      createdAt: this.now().toISOString()
    });
    await this.applications.save(batch);
    for (const item of batch.items) {
      await this.bridge.dispatch(userId, openJobCommand(item));
    }
    return batch;
  }

  async recordFormRequirements(
    batchId: string,
    applicationItemId: string,
    formFingerprint: string,
    requirements: FormRequirement[]
  ): Promise<ApplicationBatch> {
    const batch = await this.requiredBatch(batchId);
    const item = batch.items.find((entry) => entry.id === applicationItemId);
    if (!item) throw new Error("投递任务不存在");
    const resume = await this.resumes.get(batch.resumeSnapshotId);
    if (!resume) throw new Error("简历知识不存在");
    const facts = {
      ...resumeFactIndex(resume),
      ...(this.reusableAnswers.get(batch.userId) ?? {})
    };
    const previousAnswers = item.answers;
    item.formFingerprint = formFingerprint;
    item.requirements = requirements;
    item.job.applicationForm = {
      status: requirements.length ? "observed" : "not_applicable",
      fingerprint: formFingerprint,
      fields: requirements.length ? requirements.map((requirement) => ({
        fieldId: requirement.fieldId,
        label: requirement.label,
        type: requirement.inputType ?? "unknown",
        required: requirement.required,
        options: requirement.options,
        semanticKey: requirement.semanticKey
      })) : null,
      observedAt: this.now().toISOString()
    };
    item.answers = {};
    for (const requirement of requirements) {
      if (requirement.semanticKey in previousAnswers) {
        item.answers[requirement.semanticKey] = previousAnswers[requirement.semanticKey];
      } else if (requirement.semanticKey in facts) {
        item.answers[requirement.semanticKey] = facts[requirement.semanticKey];
      }
    }
    batch.missingInformation = this.aggregateMissing(batch);
    item.status = batch.missingInformation.some((missing) =>
      missing.applicationItemIds.includes(item.id)
    )
      ? "information_required"
      : "ready_to_fill";
    batch.status = batch.missingInformation.length
      ? "information_required"
      : "preparing";
    return this.applications.save(batch);
  }

  async answerMissingInformation(
    batchId: string,
    answers: MissingAnswerInput[],
    rememberReusable = false
  ): Promise<ApplicationBatch> {
    const batch = await this.requiredBatch(batchId);
    for (const input of answers) {
      const missing = batch.missingInformation.find((entry) => entry.key === input.key);
      if (!missing) throw new Error(`缺失信息不存在：${input.key}`);
      for (const itemId of missing.applicationItemIds) {
        const item = batch.items.find((entry) => entry.id === itemId);
        if (!item) continue;
        const requirement = item.requirements.find(
          (entry) => missingKey(entry, item.id) === missing.key
        );
        if (!requirement) continue;
        item.answers[requirement.semanticKey] = input.value;
      }
      if (rememberReusable && missing.scope === "reusable") {
        const saved = this.reusableAnswers.get(batch.userId) ?? {};
        saved[missing.key] = input.value;
        this.reusableAnswers.set(batch.userId, saved);
      }
    }
    batch.missingInformation = this.aggregateMissing(batch);
    for (const item of batch.items) {
      if (item.status === "information_required" && !batch.missingInformation.some(
        (missing) => missing.applicationItemIds.includes(item.id)
      )) {
        item.status = "ready_to_fill";
      }
    }
    batch.status = batch.missingInformation.length
      ? "information_required"
      : "preparing";
    return this.applications.save(batch);
  }

  async recordLoginState(
    batchId: string,
    applicationItemId: string,
    loginRequired: boolean
  ): Promise<ApplicationBatch> {
    const batch = await this.requiredBatch(batchId);
    const item = batch.items.find((entry) => entry.id === applicationItemId);
    if (!item) throw new Error("投递任务不存在");
    if (loginRequired) {
      item.status = "login_required";
      item.job.applicationForm = {
        status: "login_required",
        fingerprint: null,
        fields: null,
        observedAt: this.now().toISOString()
      };
      return this.applications.save(batch);
    }
    item.status = "observing_form";
    const saved = await this.applications.save(batch);
    await this.bridge.dispatch(batch.userId, {
      id: crypto.randomUUID(),
      type: "observe_form",
      applicationItemId: item.id,
      url: item.job.applicationUrl
    });
    return saved;
  }

  async dispatchFill(batchId: string): Promise<BrowserCommandReceipt[]> {
    const batch = await this.requiredBatch(batchId);
    if (batch.missingInformation.length) throw new Error("仍有缺失信息未填写");
    if (batch.items.some((item) => !item.formFingerprint)) {
      throw new Error("仍有岗位尚未读取真实表单");
    }
    if (batch.items.some((item) => item.status !== "ready_to_fill")) {
      throw new Error("仍有岗位尚未准备填表");
    }
    const receipts: BrowserCommandReceipt[] = [];
    for (const item of batch.items) {
      item.status = "filling";
      receipts.push(
        await this.bridge.dispatch(batch.userId, {
          id: crypto.randomUUID(),
          type: "fill_form",
          applicationItemId: item.id,
          answers: item.answers,
          requirements: item.requirements,
          strategy: "dom_first"
        })
      );
    }
    await this.applications.save(batch);
    return receipts;
  }

  async dispatchComputerUseFallback(
    batchId: string,
    applicationItemId: string,
    unresolvedFieldIds: string[]
  ): Promise<BrowserCommandReceipt> {
    const batch = await this.requiredBatch(batchId);
    const item = batch.items.find((entry) => entry.id === applicationItemId);
    if (!item) throw new Error("投递任务不存在");
    if (item.status !== "failed") throw new Error("只有 DOM/CDP 填写失败后才能请求视觉接管");
    const allowed = new Set(item.requirements.map((requirement) => requirement.fieldId));
    const unique = [...new Set(unresolvedFieldIds)];
    if (!unique.length || unique.some((fieldId) => !allowed.has(fieldId))) {
      throw new Error("Computer Use 只能处理本次表单中明确未解决的字段");
    }
    item.status = "filling";
    item.lastError = null;
    await this.applications.save(batch);
    return this.bridge.dispatch(batch.userId, {
      id: crypto.randomUUID(),
      type: "computer_use_fill",
      applicationItemId: item.id,
      unresolvedFieldIds: unique,
      valueRefs: Object.fromEntries(item.requirements
        .filter((requirement) => unique.includes(requirement.fieldId))
        .map((requirement) => [requirement.fieldId, requirement.semanticKey])),
      policy: {
        maxSteps: Math.min(20, Math.max(4, unique.length * 4)),
        requireFreshObservationAfterEachAction: true,
        forbiddenActions: [
          "final_submit",
          "credential_entry",
          "captcha",
          "legal_consent_inference"
        ]
      }
    });
  }

  async recordFillValidation(
    batchId: string,
    applicationItemId: string,
    success: boolean,
    error?: string
  ): Promise<ApplicationBatch> {
    const batch = await this.requiredBatch(batchId);
    const item = batch.items.find((entry) => entry.id === applicationItemId);
    if (!item) throw new Error("投递任务不存在");
    if (item.status !== "filling") throw new Error("岗位当前不在填表状态");
    item.status = success ? "filled" : "failed";
    item.lastError = success ? null : (error ?? "填表或读回校验失败");
    return this.applications.save(batch);
  }

  async prepareReview(batchId: string): Promise<BatchReview> {
    const batch = await this.requiredBatch(batchId);
    if (batch.missingInformation.length) throw new Error("仍有缺失信息未填写");
    if (batch.items.some((item) => item.status !== "filled")) {
      throw new Error("仍有岗位尚未完成填表及读回校验");
    }
    for (const item of batch.items) item.status = "ready_for_review";
    batch.status = "ready_for_review";
    await this.applications.save(batch);
    return reviewFor(batch);
  }

  async approveBatch(
    batchId: string,
    reviewedManifestHash: string,
    ttlMinutes = 15
  ): Promise<ApplicationBatch> {
    const batch = await this.requiredBatch(batchId);
    if (batch.status !== "ready_for_review") throw new Error("批次尚未准备确认");
    const current = reviewFor(batch);
    if (current.manifestHash !== reviewedManifestHash) {
      throw new Error("投递内容已变化，请重新查看预览");
    }
    batch.approvalManifestHash = current.manifestHash;
    batch.approvalExpiresAt = new Date(
      this.now().getTime() + ttlMinutes * 60_000
    ).toISOString();
    batch.status = "approved";
    for (const item of batch.items) item.status = "approved";
    return this.applications.save(batch);
  }

  async dispatchApproved(batchId: string): Promise<BrowserCommandReceipt[]> {
    const batch = await this.requiredBatch(batchId);
    if (
      batch.status !== "approved" ||
      !batch.approvalManifestHash ||
      !batch.approvalExpiresAt
    ) {
      throw new Error("批次没有有效授权");
    }
    if (new Date(batch.approvalExpiresAt).getTime() <= this.now().getTime()) {
      throw new Error("批量投递授权已过期");
    }
    if (reviewFor(batch).manifestHash !== batch.approvalManifestHash) {
      throw new Error("投递内容已变化，授权失效");
    }
    batch.status = "submitting";
    const receipts: BrowserCommandReceipt[] = [];
    for (const item of batch.items) {
      item.status = "submitting";
      receipts.push(
        await this.bridge.dispatch(batch.userId, {
          id: crypto.randomUUID(),
          type: "submit",
          applicationItemId: item.id,
          approvalManifestHash: batch.approvalManifestHash
        })
      );
    }
    await this.applications.save(batch);
    return receipts;
  }

  async get(batchId: string): Promise<ApplicationBatch | null> {
    return this.applications.get(batchId);
  }

  private aggregateMissing(batch: ApplicationBatch): MissingInformation[] {
    const grouped = new Map<string, MissingInformation>();
    for (const item of batch.items) {
      for (const requirement of item.requirements) {
        if (!requirement.required || requirement.semanticKey in item.answers) continue;
        const key = missingKey(requirement, item.id);
        const existing = grouped.get(key);
        if (existing) {
          existing.applicationItemIds.push(item.id);
          existing.options = [...new Set([...existing.options, ...requirement.options])];
        } else {
          grouped.set(key, {
            key,
            label: requirement.label,
            scope: requirement.scope,
            sensitive: requirement.sensitive,
            applicationItemIds: [item.id],
            options: requirement.options,
            answered: false
          });
        }
      }
    }
    return [...grouped.values()];
  }

  private async requiredBatch(batchId: string): Promise<ApplicationBatch> {
    const batch = await this.applications.get(batchId);
    if (!batch) throw new Error("投递批次不存在");
    return batch;
  }
}
