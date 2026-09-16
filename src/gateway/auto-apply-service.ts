import { AsyncLocalStorage } from "node:async_hooks";
import { PluginUpdateRequiredError } from "./device-registry.js";
import { normalizeSupplementalResult } from "./supplemental-result.js";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  autoApplyBatchRequestSchema,
  candidateApplicationProfileUpdateSchema,
  autoApplyJobProgressSchema,
  autoApplyJobResultSchema,
  autoApplyRequiredFieldAnswersSchema,
  autoApplyUploadRejectionSchema,
  terminalAutoApplyJobStatuses,
  type AutoApplyBatch,
  type AutoApplyBatchJob,
  type AutoApplyBatchRequest,
  type AutoApplyJobResult
} from "./auto-apply-contract.js";
import {
  deviceCommandExecutionExpired,
  deviceCommandExpired,
  type DeviceCommandQueue,
  type DeviceCommandItem
} from "./device-command-queue.js";
import type { LegacyPluginCommand, LegacyPluginEvent } from "./legacy-plugin-adapter.js";
import { matchSiteAdapter } from "./site-adapter-registry.js";
import {
  DisabledAutoApplyCallbackDispatcher,
  type AutoApplyCallbackDispatcher
} from "./auto-apply-callback.js";
import { AutoApplyProgressSequenceConflictError, IdempotencyConflictError, requireDeviceId } from "./gateway-errors.js";

export interface AutoApplySchedulingOwner {
  tenantId: string;
  userId: string;
  deviceId: string;
}

export interface AutoApplyPersistence {
  transaction<T>(ownerKey: string, work: () => Promise<T>): Promise<T>;
  ownerFence: {
    isTerminated(ownerKey: string): Promise<boolean>;
    terminate(ownerKey: string): Promise<void>;
    clear(ownerKey: string): Promise<void>;
  };
  callbackOutbox: { enqueue(batch: AutoApplyBatch): Promise<void> };
  canDispatch?(identity: AutoApplySchedulingOwner): Promise<boolean>;
  /** Start the delivery deadline only when an authenticated device asks for work. */
  dispatchOnClaim?: boolean;
}

export interface AutoApplyBatchRepository {
  save(batch: AutoApplyBatch): Promise<AutoApplyBatch>;
  get(batchId: string): Promise<AutoApplyBatch | null>;
  findByIdempotencyKey(tenantId: string, userId: string, key: string): Promise<AutoApplyBatch | null>;
  listByOwner(tenantId: string, userId: string): Promise<AutoApplyBatch[]>;
  listNonTerminal(owner?: { tenantId: string; userId: string; deviceId?: string }): Promise<AutoApplyBatch[]>;
  listSchedulingOwners?(limit?: number): Promise<AutoApplySchedulingOwner[]>;
}

function needsCommandRecoveryCheck(job: AutoApplyBatchJob): job is AutoApplyBatchJob & { commandId: string } {
  return Boolean(job.commandId) && !terminalAutoApplyJobStatuses.has(job.status) &&
    job.status !== "queued" && job.status !== "waiting_for_user_action" &&
    job.status !== "waiting_for_site_receipt";
}

export class MemoryAutoApplyBatchRepository implements AutoApplyBatchRepository {
  private readonly batches = new Map<string, AutoApplyBatch>();

  async save(batch: AutoApplyBatch): Promise<AutoApplyBatch> {
    this.batches.set(batch.batchId, structuredClone(batch));
    return structuredClone(batch);
  }

  async get(batchId: string): Promise<AutoApplyBatch | null> {
    const batch = this.batches.get(batchId);
    return batch ? structuredClone(batch) : null;
  }

  async findByIdempotencyKey(tenantId: string, userId: string, key: string): Promise<AutoApplyBatch | null> {
    const batch = [...this.batches.values()].find((candidate) =>
      candidate.tenantId === tenantId && candidate.userId === userId && candidate.idempotencyKey === key
    );
    return batch ? structuredClone(batch) : null;
  }

  async listByOwner(tenantId: string, userId: string): Promise<AutoApplyBatch[]> {
    return [...this.batches.values()]
      .filter((batch) => batch.tenantId === tenantId && batch.userId === userId)
      .map((batch) => structuredClone(batch));
  }

  async listNonTerminal(owner?: { tenantId: string; userId: string; deviceId?: string }): Promise<AutoApplyBatch[]> {
    return [...this.batches.values()]
      .filter((batch) => !["completed", "completed_with_errors", "cancelled", "failed"].includes(batch.status) &&
        (!owner || (batch.tenantId === owner.tenantId && batch.userId === owner.userId &&
          (!owner.deviceId || batch.deviceId === owner.deviceId))))
      .map((batch) => structuredClone(batch));
  }
}

interface AutoApplyBatchStore {
  schemaVersion: "auto-apply-batch-store.v1";
  batches: AutoApplyBatch[];
}

export class JsonAutoApplyBatchRepository implements AutoApplyBatchRepository {
  private operation = Promise.resolve();

  constructor(private readonly file: string) {}

  private async load(): Promise<AutoApplyBatchStore> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as AutoApplyBatchStore;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: "auto-apply-batch-store.v1", batches: [] };
      }
      throw error;
    }
  }

  private async saveStore(store: AutoApplyBatchStore): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.file);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  async save(batch: AutoApplyBatch): Promise<AutoApplyBatch> {
    return this.serialize(async () => {
      const store = await this.load();
      const index = store.batches.findIndex((candidate) => candidate.batchId === batch.batchId);
      if (index >= 0) store.batches[index] = structuredClone(batch);
      else store.batches.push(structuredClone(batch));
      await this.saveStore(store);
      return structuredClone(batch);
    });
  }

  async get(batchId: string): Promise<AutoApplyBatch | null> {
    const batch = (await this.load()).batches.find((candidate) => candidate.batchId === batchId);
    return batch ? structuredClone(batch) : null;
  }

  async findByIdempotencyKey(tenantId: string, userId: string, key: string): Promise<AutoApplyBatch | null> {
    const batch = (await this.load()).batches.find((candidate) =>
      candidate.tenantId === tenantId && candidate.userId === userId && candidate.idempotencyKey === key
    );
    return batch ? structuredClone(batch) : null;
  }

  async listByOwner(tenantId: string, userId: string): Promise<AutoApplyBatch[]> {
    return (await this.load()).batches
      .filter((batch) => batch.tenantId === tenantId && batch.userId === userId)
      .map((batch) => structuredClone(batch));
  }

  async listNonTerminal(owner?: { tenantId: string; userId: string; deviceId?: string }): Promise<AutoApplyBatch[]> {
    return (await this.load()).batches
      .filter((batch) => !["completed", "completed_with_errors", "cancelled", "failed"].includes(batch.status) &&
        (!owner || (batch.tenantId === owner.tenantId && batch.userId === owner.userId &&
          (!owner.deviceId || batch.deviceId === owner.deviceId))))
      .map((batch) => structuredClone(batch));
  }
}

export interface CreateAutoApplyBatchInput {
  tenantId: string;
  userId: string;
  deviceId: string;
  idempotencyKey: string;
  request: AutoApplyBatchRequest;
}

export interface AutoApplyBrowserStateInput {
  batchId: string;
  batchJobId: string;
  jobId: string;
  outcome: "succeeded" | "already_applied" | "captcha_tab_closed" |
    "submission_active_tab_closed" | "submission_receipt_tab_closed" |
    "submission_receipt_timeout" | "site_validation_rejected" | "captcha_required" |
    "site_application_limit_reached" | "user_interrupted";
  interruptionKind?: string;
  submissionStarted?: boolean;
  requiredFieldRequests?: unknown;
  uploadRejection?: unknown;
  siteMessage?: string;
  commandId?: string;
  pageUrl: string;
  observedAt: string;
}

export interface SubmissionAuthorizationVerification {
  valid: boolean;
  batchId: string | null;
  batchJobId: string | null;
  reason: string | null;
}

interface AuthorizationClaims {
  version: 2;
  authorizationId: string;
  batchId: string;
  batchJobId: string;
  commandId: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  jobId: string;
  packageSha256: string;
  expiresAt: string;
  allowAutomaticFinalSubmit: boolean;
}

export const minimumAutoApplySubmissionWindowMs = 60_000;
export const autoApplySweepConcurrency = 8;

export type AutoApplyEngineMode = "legacy" | "shadow_v2" | "layered_v2";

export interface AutoApplyEnginePolicy {
  mode: AutoApplyEngineMode;
  /** Empty means all supported adapters; production shadow should use an allowlist. */
  adapterCodes: string[];
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function resolvedJobAnswers(
  job: AutoApplyBatchRequest["jobs"][number]
): NonNullable<AutoApplyBatchJob["answers"]> {
  const explicit = job.answers.preferredCity;
  // 工作地点描述岗位，而“期望城市”属于候选人偏好，两者不能互相推导。
  // 保留 legacy source 的 schema 兼容性以读取历史批次，但绝不再向插件下发。
  if (explicit?.source === "user_confirmed") return { preferredCity: structuredClone(explicit) };
  return {};
}

function finishedWithErrors(batch: AutoApplyBatch): boolean {
  return batch.jobs.some((job) => job.status !== "succeeded");
}

function publicBatch(batch: AutoApplyBatch): AutoApplyBatch {
  return structuredClone(batch);
}

export const autoApplyCommandDeadlineMs = 5 * 60_000;

function autoApplyCommandExpiresAt(authorizationExpiresAt: string, timestamp: Date): string {
  const authorizationTimestamp = Date.parse(authorizationExpiresAt);
  const deadline = timestamp.getTime() + autoApplyCommandDeadlineMs;
  return new Date(Number.isFinite(authorizationTimestamp)
    ? Math.min(authorizationTimestamp, deadline)
    : deadline).toISOString();
}

function requestPayload(request: AutoApplyBatchRequest) {
  return {
    candidate: request.candidate,
    assets: request.assets,
    jobs: request.jobs.map((job) => {
      const adapter = matchSiteAdapter(job.applicationUrl, job.adapterHint);
      return {
        jobId: job.jobId,
        companyName: job.companyName,
        title: job.title,
        applicationUrl: job.applicationUrl,
        adapterCode: adapter.supported ? adapter.adapterCode : null,
        tags: job.tags,
        locations: job.locations,
        answers: resolvedJobAnswers(job),
        ...(job.requiredFieldAnswers?.length ? { requiredFieldAnswers: job.requiredFieldAnswers } : {})
      };
    }),
    confirmation: request.confirmation,
    safety: {
      allowConsentClick: request.safety.allowConsentClick === true ||
        request.allowConsentClick === true ||
        request.executionPolicy.allowConsentClick === true
    },
    executionPolicy: request.executionPolicy,
    callback: request.callback ?? null
  };
}

function requestFingerprint(deviceId: string, request: AutoApplyBatchRequest): string {
  return createHash("sha256").update(JSON.stringify({
    deviceId,
    ...requestPayload(request)
  })).digest("hex");
}

function requestPayloadFingerprint(request: AutoApplyBatchRequest): string {
  return createHash("sha256").update(JSON.stringify(requestPayload(request))).digest("hex");
}

function batchPayload(batch: AutoApplyBatch) {
  return {
    candidate: batch.candidate,
    assets: batch.assets,
    jobs: batch.jobs.map((job) => ({
      jobId: job.jobId,
      companyName: job.companyName,
      title: job.title,
      applicationUrl: job.applicationUrl,
      adapterCode: job.adapterCode,
      tags: [...(job.tags ?? [])],
      locations: [...(job.locations ?? [])],
      answers: structuredClone(job.answers ?? {}),
      ...(job.initialRequiredFieldAnswers?.length ? { requiredFieldAnswers: structuredClone(job.initialRequiredFieldAnswers) } : {})
    })),
    confirmation: batch.confirmation,
    safety: { allowConsentClick: batch.safety?.allowConsentClick === true },
    executionPolicy: batch.executionPolicy,
    callback: batch.callback ?? null
  };
}

function batchPayloadFingerprint(batch: AutoApplyBatch): string {
  return createHash("sha256").update(JSON.stringify(batchPayload(batch))).digest("hex");
}

function batchFingerprint(batch: AutoApplyBatch): string {
  return createHash("sha256").update(JSON.stringify({
    deviceId: batch.deviceId,
    ...batchPayload(batch)
  })).digest("hex");
}

export function canRebindDeferredMissingInformationBatch(batch: AutoApplyBatch): boolean {
  if (batch.status !== "paused" || batch.pauseReason !== "waiting_for_user_action") return false;
  const waitingForMissingInformation = batch.jobs.filter((job) =>
    job.status === "waiting_for_user_action" && job.reasonCode === "missing_information"
  );
  if (waitingForMissingInformation.length === 0) return false;
  return batch.jobs.every((job) => terminalAutoApplyJobStatuses.has(job.status) ||
    (job.status === "waiting_for_user_action" &&
      job.reasonCode === "missing_information" &&
      job.commandId === null));
}

export class AutoApplyService {
  private readonly createOperations = new Map<string, Promise<unknown>>();
  private readonly ownerOperations = new Map<string, Promise<unknown>>();
  private readonly terminatedOwners = new Set<string>();
  private readonly dispatchContext = new AsyncLocalStorage<boolean>();

  constructor(
    private readonly batches: AutoApplyBatchRepository,
    private readonly queue: DeviceCommandQueue,
    private readonly signingSecret: string,
    private readonly now: () => Date = () => new Date(),
    private readonly callbacks: AutoApplyCallbackDispatcher = new DisabledAutoApplyCallbackDispatcher(),
    private readonly enginePolicy: AutoApplyEnginePolicy = { mode: "legacy", adapterCodes: [] },
    private readonly persistence?: AutoApplyPersistence
  ) {}

  configured(): boolean {
    return this.signingSecret.trim().length >= 32;
  }

  enginePolicySnapshot(): AutoApplyEnginePolicy {
    return {
      mode: this.enginePolicy.mode,
      adapterCodes: [...this.enginePolicy.adapterCodes]
    };
  }

  private engineFor(job: AutoApplyBatchJob): AutoApplyEngineMode {
    const allowed = this.enginePolicy.adapterCodes.length === 0 ||
      (job.adapterCode !== null && this.enginePolicy.adapterCodes.includes(job.adapterCode));
    return allowed ? this.enginePolicy.mode : "legacy";
  }

  async create(input: CreateAutoApplyBatchInput): Promise<AutoApplyBatch> {
    if (!this.configured()) throw new Error("批量自动投递签名密钥未配置");
    const deviceId = requireDeviceId(input.deviceId);
    const request = autoApplyBatchRequestSchema.parse(input.request);
    const ownerKey = this.ownerKey(input.tenantId, input.userId);
    return this.serializeOwner(ownerKey, async () => {
      if (await this.ownerTerminated(ownerKey)) throw new Error("账号自动投递会话已终止，请重新绑定插件");
      return this.serializeCreate(
        `${ownerKey}\u0000${input.idempotencyKey}`,
        () => this.createRequest(input, deviceId, request)
      );
    });
  }

  private async createRequest(
    input: CreateAutoApplyBatchInput,
    deviceId: string,
    request: AutoApplyBatchRequest
  ): Promise<AutoApplyBatch> {
    if (request.callback) this.callbacks.validate(request.callback);
    const jobIds = request.jobs.map((job) => job.jobId);
    const displayed = new Set(request.confirmation.displayedJobIds);
    if (jobIds.some((jobId) => !displayed.has(jobId)) || displayed.size !== new Set(jobIds).size) {
      throw new Error("批次确认中的岗位集合与实际投递岗位不一致");
    }
    const existing = await this.batches.findByIdempotencyKey(
      input.tenantId,
      input.userId,
      input.idempotencyKey
    );
    if (existing) {
      if (batchFingerprint(existing) !== requestFingerprint(deviceId, request)) {
        if (canRebindDeferredMissingInformationBatch(existing) &&
          batchPayloadFingerprint(existing) === requestPayloadFingerprint(request)) {
          return publicBatch(await this.batches.save({
            ...existing,
            deviceId,
            revision: existing.revision + 1,
            updatedAt: this.now().toISOString()
          }));
        }
        throw new IdempotencyConflictError();
      }
      return publicBatch(await this.notifyTerminal(existing));
    }

    const timestamp = this.now().toISOString();
    const batchId = randomUUID();
    const authorizationId = randomUUID();
    const authorizationExpiresAt = new Date(this.now().getTime() + 24 * 60 * 60_000).toISOString();
    const jobs: AutoApplyBatchJob[] = request.jobs.map((job) => {
      const adapter = matchSiteAdapter(job.applicationUrl, job.adapterHint);
      return {
        batchJobId: randomUUID(),
        jobId: job.jobId,
        companyName: job.companyName,
        title: job.title,
        applicationUrl: job.applicationUrl,
        adapterCode: adapter.supported ? adapter.adapterCode : null,
        tags: [...job.tags],
        locations: [...job.locations],
        answers: resolvedJobAnswers(job),
        ...(job.requiredFieldAnswers?.length ? {
          requiredFieldAnswers: structuredClone(job.requiredFieldAnswers),
          initialRequiredFieldAnswers: structuredClone(job.requiredFieldAnswers)
        } : {}),
        status: adapter.supported ? "queued" : "skipped_unsupported_site",
        attempt: 0,
        commandId: null,
        ...(input.tenantId === "local" ? { localSubmitAuthorizedAt: null } : {}),
        reasonCode: adapter.supported ? null : adapter.reason,
        createdAt: timestamp,
        startedAt: null,
        completedAt: adapter.supported ? null : timestamp,
        evidence: null
      };
    });
    let batch: AutoApplyBatch = {
      schemaVersion: "auto-apply-batch.v1",
      batchId,
      tenantId: input.tenantId,
      userId: input.userId,
      deviceId,
      idempotencyKey: input.idempotencyKey,
      status: jobs.some((job) => job.status === "queued") ? "queued" : "completed_with_errors",
      pauseReason: null,
      candidate: structuredClone(request.candidate),
      assets: structuredClone(request.assets),
      jobs,
      confirmation: structuredClone(request.confirmation),
      safety: {
        allowConsentClick: request.safety.allowConsentClick === true ||
          request.allowConsentClick === true ||
          request.executionPolicy.allowConsentClick === true
      },
      executionPolicy: structuredClone(request.executionPolicy),
      callback: request.callback ? structuredClone(request.callback) : null,
      callbackDelivery: request.callback ? {
        status: "pending",
        eventId: `auto-apply-batch:${batchId}:completed`,
        attempts: 0,
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null
      } : null,
      authorizationId,
      authorizationExpiresAt,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    batch = await this.batches.save(batch);
    return this.continueAndDispatch(batch);
  }

  private serializeCreate<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.createOperations.get(key) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    this.createOperations.set(key, current);
    return current.finally(() => {
      if (this.createOperations.get(key) === current) this.createOperations.delete(key);
    });
  }

  private ownerKey(tenantId: string, userId: string): string {
    return `${tenantId}\u0000${userId}`;
  }

  private serializeOwner<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.ownerOperations.get(key) ?? Promise.resolve();
    const execute = () => this.persistence ? this.persistence.transaction(key, operation) : operation();
    const current = previous.then(execute, execute);
    this.ownerOperations.set(key, current);
    return current.finally(() => {
      if (this.ownerOperations.get(key) === current) this.ownerOperations.delete(key);
    });
  }

  private async ownerTerminated(key: string): Promise<boolean> {
    return this.persistence ? this.persistence.ownerFence.isTerminated(key) : this.terminatedOwners.has(key);
  }

  async activateOwner(identity: { tenantId: string; userId: string }): Promise<void> {
    const ownerKey = this.ownerKey(identity.tenantId, identity.userId);
    await this.serializeOwner(ownerKey, async () => {
      if (this.persistence) await this.persistence.ownerFence.clear(ownerKey);
      else this.terminatedOwners.delete(ownerKey);
    });
  }

  /**
   * Repairs a device queue only after its plugin has received no command. A
   * durable receipt is reapplied to batch state, never to the browser. Legacy
   * commands without a receipt remain ambiguous and must never be resubmitted.
   */
  async recoverDeviceQueue(
    identity: { tenantId: string; userId: string; deviceId: string },
    options: { dispatch?: boolean } = {}
  ): Promise<number> {
    if (options.dispatch) {
      return this.dispatchContext.run(true, () => this.recoverDeviceQueue(identity));
    }
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId), async () => {
      if (this.persistence && this.queue.listActiveByDevice) {
        // Before a pull can return work, fence split-write orphans imported from
        // the old store, including queued commands whose job no longer owns them.
        for (const command of await this.queue.listActiveByDevice(identity.tenantId, identity.userId, identity.deviceId)) {
          await this.reconcilePersistentCommandSerialized(command);
        }
      }
      const batches = (await this.batches.listNonTerminal(identity))
        .filter((batch) => batch.tenantId === identity.tenantId &&
          batch.userId === identity.userId && batch.deviceId === identity.deviceId);
      let recovered = 0;
      for (const snapshot of batches) {
        for (let index = 0; index < snapshot.jobs.length; index += 1) {
          // The owner is serialized. Idle jobs cannot have a detached result;
          // skip them before get() rereads the entire durable JSON store.
          // A next job dispatched during recovery already has a fresh command.
          if (!needsCommandRecoveryCheck(snapshot.jobs[index]!)) continue;
          const batch = await this.required(snapshot.batchId);
          const jobs = [...batch.jobs];
          const job = jobs[index]!;
          if (!needsCommandRecoveryCheck(job)) continue;
          const command = await this.queue.get(job.commandId);
          if (command && !["completed", "failed", "cancelled"].includes(command.status)) continue;
          const receipt = command?.completionEvent;
          const parsed = autoApplyJobResultSchema.safeParse(receipt?.payload?.autoApplyResult ?? receipt?.payload);
          if (receipt && parsed.success && parsed.data.batchId === batch.batchId &&
            parsed.data.batchJobId === job.batchJobId && parsed.data.jobId === job.jobId &&
            command.tenantId === batch.tenantId && command.userId === batch.userId &&
            command.targetDeviceId === batch.deviceId) {
            await this.acceptCommandResultSerialized(job.commandId, receipt);
            recovered += 1;
            continue;
          }
          const completedAt = this.now().toISOString();
          jobs[index] = {
            ...job,
            status: "failed",
            commandId: null,
            reasonCode: "submission_outcome_unknown",
            completedAt,
            evidence: {
              screenshotRef: null,
              redacted: true,
              pageUrl: job.applicationUrl,
              siteConfirmation: null,
              diagnostic: {
                code: "submission_outcome_unknown",
                category: "transport",
                stage: "submit",
                userMessage: "插件已结束本岗位处理，但 Gateway 未能确认最终投递结果；为避免重复投递，已停止该岗位并继续后续队列。",
                developerMessage: command
                  ? `设备命令 ${job.commandId} 已处于 ${command.status}，但批次结果未同步。`
                  : `设备命令 ${job.commandId} 不存在，批次结果无法安全恢复。`,
                retryable: false,
                recommendedAction: "inspect_evidence"
              }
            }
          };
          recovered += 1;
          await this.continueAndDispatch(await this.batches.save({
            ...batch,
            jobs,
            revision: batch.revision + 1,
            updatedAt: this.now().toISOString()
          }));
        }
      }
      const seed = (await this.batches.listNonTerminal(identity))
        .find((batch) => batch.tenantId === identity.tenantId &&
          batch.userId === identity.userId && batch.deviceId === identity.deviceId);
      if (seed) await this.dispatchNextForDevice(seed);
      return recovered;
    });
  }

  async get(batchId: string, identity?: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    const batch = await this.required(batchId);
    if (identity && (batch.tenantId !== identity.tenantId || batch.userId !== identity.userId)) {
      throw new Error("批量投递任务不属于当前用户");
    }
    // Keep reads side-effect free. Expiration reconciliation is owned by the
    // serialized background sweep; doing it from concurrent polling requests
    // can enqueue the same next job twice and orphan the command that the
    // extension already claimed.
    return publicBatch(batch);
  }

  async pause(batchId: string, identity: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId),
      () => this.pauseSerialized(batchId, identity));
  }

  private async pauseSerialized(batchId: string, identity: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    const batch = await this.get(batchId, identity);
    if (["completed", "completed_with_errors", "cancelled", "failed"].includes(batch.status)) return batch;
    return this.notifyTerminal(await this.batches.save({
      ...batch,
      status: "paused",
      pauseReason: "user_requested",
      revision: batch.revision + 1,
      updatedAt: this.now().toISOString()
    }));
  }

  async resume(batchId: string, identity: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId),
      () => this.resumeSerialized(batchId, identity));
  }

  private async resumeSerialized(batchId: string, identity: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    const batch = await this.get(batchId, identity);
    if (batch.status !== "paused") throw new Error(`当前批次不可继续：${batch.status}`);
    const waitingJobs = batch.jobs.filter((job) => job.status === "waiting_for_user_action" && !job.stopRequest);
    const explicitlyPaused = batch.pauseReason === "user_requested" ||
      (batch.pauseReason === undefined && waitingJobs.length === 0);
    if (!explicitlyPaused && waitingJobs.length === 1) {
      return this.resumeJobSerialized(batchId, waitingJobs[0]!.batchJobId, identity);
    }
    if (!explicitlyPaused && waitingJobs.length > 1) {
      throw new Error("当前批次存在多个等待用户操作的岗位，请使用岗位级 resume 接口");
    }
    return this.continueAndDispatch(await this.batches.save({
      ...batch,
      status: "queued",
      pauseReason: null,
      revision: batch.revision + 1,
      updatedAt: this.now().toISOString()
    }));
  }

  async resumeJob(
    batchId: string,
    batchJobId: string,
    identity: { tenantId: string; userId: string }
  ): Promise<AutoApplyBatch> {
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId),
      () => this.resumeJobSerialized(batchId, batchJobId, identity));
  }

  async confirmLocalReview(batchId: string, batchJobId: string, reviewHash: string,
    identity: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId), async () => {
      const batch = await this.get(batchId, identity);
      const current = batch.jobs.find(job => job.batchJobId === batchJobId);
      if (identity.tenantId !== "local" || batch.confirmation.allowAutomaticFinalSubmit ||
          !current || current.stopRequest || current.status !== "waiting_for_user_action" ||
          current.reasonCode !== "final_review_required" || batch.pauseReason === "user_requested" ||
          !/^sha256:[a-f0-9]{64}$/.test(reviewHash) || current.evidence?.failureDetails?.reviewHash !== reviewHash) {
        throw new Error("当前页面不可确认，或确认内容已变化，请刷新任务记录");
      }
      const now = this.now();
      const jobs = batch.jobs.map(job => job.batchJobId !== batchJobId ? job : {
        ...job, status: "queued" as const, commandId: null, reasonCode: null, completedAt: null,
        localReviewApproval: { reviewHash, confirmedAt: now.toISOString(), expiresAt: new Date(now.getTime()+5*60_000).toISOString() }
      });
      return this.continueAndDispatch(await this.batches.save({ ...batch, jobs, status: "queued", pauseReason: null,
        revision: batch.revision+1, updatedAt: now.toISOString() }));
    });
  }

  private async resumeJobSerialized(
    batchId: string,
    batchJobId: string,
    identity: { tenantId: string; userId: string }
  ): Promise<AutoApplyBatch> {
    const batch = await this.get(batchId, identity);
    const index = batch.jobs.findIndex((job) => job.batchJobId === batchJobId);
    if (index < 0) throw new Error("批次岗位不存在");
    const current = batch.jobs[index]!;
    if (current.stopRequest) throw new Error("该岗位正在停止，不能继续投递");
    if (current.status !== "waiting_for_user_action") {
      throw new Error(`当前岗位不可继续：${current.status}`);
    }
    if (current.reasonCode === "missing_information") {
      throw new Error("当前岗位缺少必填信息，请先提交 required-field-answers");
    }
    if (current.reasonCode === "final_review_required") throw new Error("请核对招聘页面后使用最终投递确认，普通继续不能代替确认");
    if (batch.pauseReason === "user_requested") {
      throw new Error("当前批次已被用户暂停，请先恢复批次");
    }
    const jobs = [...batch.jobs];
    jobs[index] = {
      ...current,
      status: "queued",
      commandId: null,
      reasonCode: null,
      completedAt: null,
      progress: undefined,
      evidence: null
    };
    const saved = await this.batches.save({
      ...batch,
      status: batch.status === "paused" ? "queued" : batch.status,
      pauseReason: null,
      jobs,
      revision: batch.revision + 1,
      updatedAt: this.now().toISOString()
    });
    return this.continueAndDispatch(saved);
  }

  /** Metadata only. The original batch fingerprint, active commands, receipts,
   * waiting handoffs and user stop fences are immutable under this update. */
  async updateCandidateProfile(input: unknown, identity: { tenantId: string; userId: string }, supportsProjection?: (deviceId: string) => Promise<boolean>): Promise<{ updatedJobs: number }> {
    const update = candidateApplicationProfileUpdateSchema.parse(input);
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId), async () => {
      let updatedJobs = 0;
      for (const batch of await this.batches.listByOwner(identity.tenantId, identity.userId)) {
        if (batch.candidate.applicationProfileUrl || ["completed", "completed_with_errors", "cancelled", "failed"].includes(batch.status)) continue;
        const eligible = batch.jobs.some(job => job.status === "queued" && job.attempt === 0 && !job.commandId && !job.startedAt && !job.stopRequest &&
          update.sequence > ((job.candidateProfile ?? batch.candidate.applicationProfile).sequence ?? 0));
        if (eligible && supportsProjection && !await supportsProjection(batch.deviceId)) {
          throw new PluginUpdateRequiredError(null, undefined, "请加载支持信息合并的新版插件后重试");
        }
        let changed = false;
        const jobs = batch.jobs.map(job => {
          const currentSequence = (job.candidateProfile ?? batch.candidate.applicationProfile).sequence ?? 0;
          if (job.status !== "queued" || job.attempt !== 0 || job.commandId || job.startedAt || job.stopRequest ||
            update.sequence <= currentSequence) return job;
          changed = true; updatedJobs++;
          return { ...job, candidateProfile: structuredClone(update.profile) };
        });
        if (changed) await this.batches.save({ ...batch, jobs, revision: batch.revision + 1, updatedAt: this.now().toISOString() });
      }
      return { updatedJobs };
    });
  }

  async provideRequiredFieldAnswers(
    batchId: string,
    batchJobId: string,
    input: unknown,
    identity: { tenantId: string; userId: string }
  ): Promise<AutoApplyBatch> {
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId),
      () => this.provideRequiredFieldAnswersSerialized(batchId, batchJobId, input, identity));
  }

  private async provideRequiredFieldAnswersSerialized(
    batchId: string,
    batchJobId: string,
    input: unknown,
    identity: { tenantId: string; userId: string }
  ): Promise<AutoApplyBatch> {
    const parsed = autoApplyRequiredFieldAnswersSchema.parse(input);
    const batch = await this.get(batchId, identity);
    const index = batch.jobs.findIndex((job) => job.batchJobId === batchJobId);
    if (index < 0) throw new Error("批次岗位不存在");
    const current = batch.jobs[index]!;
    if (current.stopRequest) throw new Error("该岗位正在停止，不能继续投递");
    const answerKey = (answer: { fieldId: string; stableFieldKey: string | null }) =>
      answer.stableFieldKey ? `stable:${answer.stableFieldKey}` : `field:${answer.fieldId}`;
    const existingAnswers = new Map((current.requiredFieldAnswers ?? []).map((answer) => [answerKey(answer), answer]));
    const unchanged = parsed.answers.every((answer) => {
      const existing = existingAnswers.get(answerKey(answer));
      return existing && JSON.stringify(existing.value) === JSON.stringify(answer.value);
    });
    // A new site rejection needs a new explicit user confirmation, even when
    // the person confirms the same answer. Duplicate uploads while that attempt
    // is queued/running remain idempotent and never enqueue a second command.
    if (unchanged && parsed.answers.length > 0 && current.status !== "waiting_for_user_action") return batch;
    if (current.status !== "waiting_for_user_action" || current.reasonCode !== "missing_information") {
      throw new Error(`当前岗位不可补充必填信息：${batch.status}/${current.status}/${current.reasonCode ?? "none"}`);
    }
    if (batch.pauseReason === "user_requested") {
      throw new Error("当前批次已被用户暂停，请先恢复批次");
    }
    const requests = current.evidence?.requiredFieldRequests ?? [];
    if (requests.length === 0) throw new Error("当前岗位没有待补充的必填字段");

    const provided = new Map<string, (typeof parsed.answers)[number]>();
    for (const answer of parsed.answers) {
      const key = answerKey(answer);
      if (provided.has(key)) throw new Error(`必填字段答案重复：${answer.fieldId}`);
      provided.set(key, answer);
    }
    for (const request of requests) {
      const answer = provided.get(answerKey(request));
      if (!answer || answer.fieldId !== request.fieldId) {
        throw new Error(`缺少必填字段答案：${request.label}`);
      }
      const values = Array.isArray(answer.value) ? answer.value : [answer.value];
      if (request.options.length > 0 && values.some((value) => !request.options.includes(value))) {
        throw new Error(`必填字段答案不在页面选项中：${request.label}`);
      }
    }
    if (provided.size !== requests.length) throw new Error("提交内容包含当前页面未请求的必填字段");

    for (const answer of parsed.answers) existingAnswers.set(answerKey(answer), answer);

    const timestamp = this.now().toISOString();
    const jobs = [...batch.jobs];
    jobs[index] = {
      ...current,
      requiredFieldAnswers: structuredClone([...existingAnswers.values()]),
      status: "queued",
      commandId: null,
      reasonCode: null,
      completedAt: null,
      progress: undefined,
      evidence: null
    };
    const saved = await this.batches.save({
      ...batch,
      status: batch.status === "paused" ? "queued" : batch.status,
      pauseReason: null,
      jobs,
      revision: batch.revision + 1,
      updatedAt: timestamp
    });
    return this.continueAndDispatch(saved);
  }

  /** Stop execution authority independently of browser cleanup. A disconnected
   * device must still receive the exact cleanup request when it reconnects. */
  async stopJob(
    batchId: string, batchJobId: string, requestId: string,
    identity: { tenantId: string; userId: string }
  ): Promise<AutoApplyBatch> {
    if (!/^[a-zA-Z0-9_-]{8,160}$/.test(requestId)) throw new Error("停止请求标识无效");
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId), async () => {
      let batch = await this.get(batchId, identity);
      const job = batch.jobs.find((candidate) => candidate.batchJobId === batchJobId);
      if (!job) throw new Error("批次岗位不存在");
      if (job.stopRequest && job.stopRequest.requestId !== requestId) throw new Error("岗位已存在另一个停止请求");
      if (job.stopRequest?.confirmedAt) return batch;
      if (!job.stopRequest) {
        job.stopRequest = {
          requestId, requestedAt: this.now().toISOString(),
          commandId: job.commandId ?? job.receiptCommandId ?? null, confirmedAt: null
        };
        batch = await this.batches.save({ ...batch, revision: batch.revision + 1, updatedAt: this.now().toISOString() });
      }
      const commandId = job.stopRequest!.commandId;
      const neverDispatched = !commandId && job.status === "queued";
      const cancelledBeforeClaim = commandId && await this.queue.cancelQueued(commandId, batch.tenantId, batch.userId, batch.deviceId);
      if (neverDispatched || cancelledBeforeClaim) return this.confirmJobStop(batch, batchJobId, "never_claimed");
      return this.reconcileStoppedJob(batch, batchJobId);
    });
  }

  async pendingJobStops(identity: { tenantId: string; userId: string; deviceId: string }) {
    // Include terminal batches: receipt monitors and execution pages can outlive a batch.
    return (await this.batches.listByOwner(identity.tenantId, identity.userId))
      .filter((batch) => batch.deviceId === identity.deviceId)
      .flatMap((batch) => batch.jobs.filter((job) => job.stopRequest && (!job.stopRequest.confirmedAt ||
          (job.stopRequest.confirmationSource === "server_execution_fenced" && !job.stopRequest.cleanupAcknowledgedAt)))
        .map((job) => ({ batchId: batch.batchId, batchJobId: job.batchJobId, jobId: job.jobId, ...job.stopRequest! })));
  }

  async acknowledgeJobStop(
    batchId: string, batchJobId: string, requestId: string, commandId: string | null,
    identity: { tenantId: string; userId: string; deviceId: string }
  ): Promise<AutoApplyBatch> {
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId), async () => {
      const batch = await this.get(batchId, identity);
      const job = batch.jobs.find((candidate) => candidate.batchJobId === batchJobId);
      if (batch.deviceId !== identity.deviceId || !job?.stopRequest ||
        job.stopRequest.requestId !== requestId || job.stopRequest.commandId !== commandId) {
        throw new Error("停止确认与设备或岗位不匹配");
      }
      if (job.stopRequest.confirmedAt &&
        (job.stopRequest.confirmationSource !== "server_execution_fenced" || job.stopRequest.cleanupAcknowledgedAt)) return batch;
      // The device sends this only after all actions and result outboxes have
      // settled. It also handles Worker restart without reclaiming/re-executing
      // a stopped command. Queue serialization preserves a concurrent receipt.
      const command = commandId ? await this.queue.acknowledgeStopped(
        commandId, identity.tenantId, identity.userId, identity.deviceId
      ) : null;
      const reconciled = command?.completionEvent
        ? await this.acceptCommandResultSerialized(command.commandId, command.completionEvent)
        : batch;
      return this.confirmJobStop(reconciled, batchJobId);
    });
  }

  private async reconcileStoppedJob(batch: AutoApplyBatch, batchJobId: string): Promise<AutoApplyBatch> {
    const job = batch.jobs.find(candidate => candidate.batchJobId === batchJobId);
    const stop = job?.stopRequest;
    if (!stop || stop.confirmedAt || !stop.commandId || !Number.isFinite(Date.parse(stop.requestedAt)) ||
      this.now().getTime() - Date.parse(stop.requestedAt) < 60_000) return batch;
    const command = await this.queue.get(stop.commandId);
    if (!command || command.tenantId !== batch.tenantId || command.userId !== batch.userId ||
      command.targetDeviceId !== batch.deviceId || command.command.type !== "browser.execute_batch_auto_apply_job" ||
      command.command.payload?.batchId !== batch.batchId || command.command.payload?.batchJobId !== batchJobId) {
      throw new Error("停止命令归属不匹配");
    }
    const terminal = ["completed", "failed", "expired", "cancelled"].includes(command.status);
    const leaseExpired = command.leaseExpiresAt !== null &&
      Number.isFinite(Date.parse(command.leaseExpiresAt)) && Date.parse(command.leaseExpiresAt) <= this.now().getTime();
    if (!terminal && !leaseExpired && !deviceCommandExecutionExpired(command, this.now())) return batch;
    // stopRequest already fences claim, progress, resume and final-submit authorization.
    // A stop cannot extend its lease. Preserve a committed receipt before settling
    // the business record; late receipts remain archived by the existing receipt path.
    await this.queue.cancelQueued(command.commandId, batch.tenantId, batch.userId, batch.deviceId);
    if (!terminal) await this.queue.expire(command.commandId);
    const reconciled = command.completionEvent
      ? await this.acceptCommandResultSerialized(command.commandId, command.completionEvent)
      : batch;
    return this.confirmJobStop(reconciled, batchJobId, "server_execution_fenced");
  }

  private async confirmJobStop(batch: AutoApplyBatch, batchJobId: string,
    source: "never_claimed" | "device_ack" | "server_execution_fenced" = "device_ack"): Promise<AutoApplyBatch> {
    const timestamp = this.now().toISOString();
    const jobs = batch.jobs.map((job) => job.batchJobId !== batchJobId ? job : {
      ...job,
      // A truthful receipt wins a race with stopping. Deleting a record never withdraws an application.
      ...(terminalAutoApplyJobStatuses.has(job.status) ? {} : {
        status: "cancelled" as const, reasonCode: "job_cancelled", completedAt: timestamp
      }),
      stopRequest: { ...job.stopRequest!, confirmedAt: job.stopRequest!.confirmedAt ?? timestamp,
        confirmationSource: job.stopRequest!.confirmationSource ?? source,
        cleanupAcknowledgedAt: source === "device_ack" ? timestamp : (job.stopRequest!.cleanupAcknowledgedAt ?? null) }
    });
    const waitingPause = batch.pauseReason === "waiting_for_user_action";
    return this.continueAndDispatch(await this.batches.save({
      ...batch, jobs, ...(waitingPause ? { status: "running" as const, pauseReason: null } : {}),
      revision: batch.revision + 1, updatedAt: timestamp
    }));
  }

  async cancel(batchId: string, identity: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    return this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId),
      () => this.cancelSerialized(batchId, identity));
  }

  private async cancelSerialized(batchId: string, identity: { tenantId: string; userId: string }): Promise<AutoApplyBatch> {
    const batch = await this.get(batchId, identity);
    if (["completed", "completed_with_errors", "cancelled"].includes(batch.status)) return batch;
    const timestamp = this.now().toISOString();
    return this.notifyTerminal(await this.batches.save({
      ...batch,
      status: "cancelled",
      jobs: batch.jobs.map((job) => terminalAutoApplyJobStatuses.has(job.status)
        ? job
        : { ...job, status: "cancelled" as const, reasonCode: "batch_cancelled", completedAt: timestamp }),
      revision: batch.revision + 1,
      updatedAt: timestamp
    }));
  }

  async terminateOwner(identity: { tenantId: string; userId: string }): Promise<{ batches: number; commands: number }> {
    const ownerKey = this.ownerKey(identity.tenantId, identity.userId);
    // Set the fence synchronously so a create already waiting for this owner's
    // serialization slot cannot start while logout is being enqueued.
    if (!this.persistence) this.terminatedOwners.add(ownerKey);
    return this.serializeOwner(ownerKey, async () => {
      if (this.persistence) await this.persistence.ownerFence.terminate(ownerKey);
      else this.terminatedOwners.add(ownerKey);
      const commands = await this.queue.cancelOwner(identity.tenantId, identity.userId);
      let batches = 0;
      for (const batch of await this.batches.listByOwner(identity.tenantId, identity.userId)) {
        if (batch.candidate.applicationProfileUrl || ["completed", "completed_with_errors", "cancelled", "failed"].includes(batch.status)) continue;
        await this.cancelSerialized(batch.batchId, identity);
        batches += 1;
      }
      return { batches, commands };
    });
  }

  async acceptBrowserState(
    input: AutoApplyBrowserStateInput,
    identity: { tenantId: string; userId: string; deviceId: string }
  ): Promise<AutoApplyBatch> {
    return this.serializeOwner(
      this.ownerKey(identity.tenantId, identity.userId),
      () => this.acceptBrowserStateSerialized(input, identity)
    );
  }

  private async acceptBrowserStateSerialized(
    input: AutoApplyBrowserStateInput,
    identity: { tenantId: string; userId: string; deviceId: string }
  ): Promise<AutoApplyBatch> {
    const batch = await this.get(input.batchId, identity);
    if (batch.deviceId !== identity.deviceId) throw new Error("浏览器状态不属于当前设备");
    const index = batch.jobs.findIndex((job) =>
      job.batchJobId === input.batchJobId && job.jobId === input.jobId
    );
    if (index < 0) throw new Error("浏览器状态与批次岗位不匹配");
    const current = batch.jobs[index]!;
    if (terminalAutoApplyJobStatuses.has(current.status)) return batch;
    const timestamp = new Date(input.observedAt).toISOString();
    if (input.outcome === "user_interrupted") {
      const kind = input.interruptionKind;
      if (!["page_reloaded", "tab_closed", "browser_session_ended", "execution_session_ended"].includes(kind ?? "") || !input.commandId) {
        throw new Error("用户中断回执缺少原命令或有效原因");
      }
      // A stale original command is acknowledged without touching a newer
      // attempt. Terminal success was already returned above.
      if (input.commandId !== (current.commandId ?? current.receiptCommandId)) return batch;
      if (current.status === "waiting_for_user_action") return batch;
      if (current.commandId) {
        const command = await this.queue.get(current.commandId);
        if (!command || ["completed", "failed", "cancelled"].includes(command.status)) return batch;
        await this.queue.expire(current.commandId);
      }
      const submissionStarted = input.submissionStarted === true || current.status === "waiting_for_site_receipt";
      const message = kind === "page_reloaded" ? "填表期间招聘页面被刷新，本次自动投递已停止。" :
        kind === "tab_closed" ? "填表期间招聘页面被关闭，本次自动投递已停止。" :
        kind === "browser_session_ended" ? "填表期间浏览器会话中断，本次自动投递已停止。" :
        "填表期间浏览器或小助手会话中断，本次自动投递已停止。";
      const jobs = [...batch.jobs];
      jobs[index] = { ...current, status: "failed", commandId: null, receiptCommandId: undefined,
        reasonCode: "user_interrupted", completedAt: timestamp,
        evidence: { screenshotRef: null, redacted: true, pageUrl: input.pageUrl, siteConfirmation: null,
          diagnostic: { code: "user_interrupted", category: "human_action",
            stage: submissionStarted ? "success_verification" : "form_fill",
            userMessage: message + (submissionStarted ? "提交已经触发，最终投递结果暂时无法确认。" : ""),
            developerMessage: "原受控执行页中断，按精确命令收口；只补报结果，不恢复填写或再次提交。",
            retryable: false, recommendedAction: "inspect_evidence" },
          failureDetails: { interruptionKind: kind, submissionStarted,
            submissionOutcome: submissionStarted ? "unknown" : "not_submitted",
            reconciledFromPersistentTab: true, commandId: input.commandId }
        }
      };
      const preserveUserPause = batch.status === "paused" && batch.pauseReason === "user_requested";
      const saved = await this.batches.save({ ...batch, jobs,
        status: preserveUserPause ? "paused" : "running",
        pauseReason: preserveUserPause ? "user_requested" : null,
        revision: batch.revision + 1, updatedAt: timestamp });
      return this.continueAndDispatch(saved);
    }
    if (input.outcome === "submission_active_tab_closed") {
      const expectedCommandId = current.commandId ?? current.receiptCommandId;
      if (!input.commandId || input.commandId !== expectedCommandId) {
        throw new Error("关闭的提交页不属于当前提交命令");
      }
      if (current.status === "waiting_for_user_action") {
        throw new Error("提交页关闭结果与当前人工等待状态不匹配");
      }
      if (current.commandId) {
        const command = await this.queue.get(current.commandId);
        if (!command || ["completed", "failed", "cancelled"].includes(command.status)) {
          throw new Error("提交命令结果正在收口，请稍后重试浏览器状态回传");
        }
        await this.queue.expire(current.commandId);
      } else if (current.status !== "waiting_for_site_receipt") {
        throw new Error(`岗位当前不可由提交页关闭事件收口：${current.status}`);
      }
      const jobs = [...batch.jobs];
      jobs[index] = {
        ...current,
        status: "failed",
        commandId: null,
        receiptCommandId: undefined,
        reasonCode: "submission_outcome_unknown",
        completedAt: timestamp,
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: input.pageUrl,
          siteConfirmation: null,
          diagnostic: {
            code: "submission_outcome_unknown",
            category: "page",
            stage: "success_verification",
            userMessage: "提交已触发，但招聘页面在结果确认前关闭，最终结果无法确认。",
            developerMessage: "持久化提交会话收到精确绑定标签页的关闭事件；已终止原命令并释放设备队列，未重开页面或重复提交。",
            retryable: false,
            recommendedAction: "inspect_evidence"
          },
          failureDetails: {
            reconciledFromPersistentTab: true,
            outcome: input.outcome,
            message: "不可逆提交已开始，原标签页关闭后无法取得明确成功或失败回执。"
          }
        }
      };
      const preserveUserPause = batch.status === "paused" && batch.pauseReason === "user_requested";
      const saved = await this.batches.save({
        ...batch,
        status: preserveUserPause ? "paused" : "running",
        pauseReason: preserveUserPause ? "user_requested" : null,
        jobs,
        revision: batch.revision + 1,
        updatedAt: timestamp
      });
      return this.continueAndDispatch(saved);
    }
    if (current.status !== "waiting_for_user_action" && current.status !== "waiting_for_site_receipt") {
      throw new Error(`岗位当前不可由浏览器状态收口：${current.status}`);
    }
    if (input.outcome === "captcha_required") {
      if (!input.commandId || input.commandId !== current.receiptCommandId) {
        throw new Error("验证码交接不属于当前提交命令");
      }
      // Stopping remains authoritative; a late challenge is acknowledged but
      // cannot turn a stopped job into a new manual-wait task. Success receipts
      // retain their independent reconciliation path.
      if (current.stopRequest) return batch;
      if (current.status === "waiting_for_user_action" && current.reasonCode === "captcha_required") return batch;
      if (current.status !== "waiting_for_site_receipt") throw new Error("验证码交接与当前等待状态不匹配");
      const message = "招聘网站要求完成安全验证码，请在原投递页面完成验证，插件会继续确认投递结果。";
      const jobs = [...batch.jobs];
      jobs[index] = { ...current, status: "waiting_for_user_action", reasonCode: "captcha_required",
        commandId: null, completedAt: null,
        evidence: { ...current.evidence, screenshotRef: current.evidence?.screenshotRef ?? null, redacted: true, pageUrl: input.pageUrl,
          siteConfirmation: null, userActionRequired: { type: "captcha", message, resumeSupported: true },
          diagnostic: { code: "captcha_required", category: "human_action", stage: "success_verification",
            userMessage: message, developerMessage: "原提交的被动监控发现验证码，沿同一命令交接，未重新提交。",
            retryable: false, recommendedAction: "prompt_user_then_resume" },
          failureDetails: { reconciledFromPersistentTab: true, outcome: input.outcome,
            commandId: input.commandId }
        }
      };
      const saved = await this.batches.save({ ...batch, jobs, revision: batch.revision + 1, updatedAt: timestamp });
      return this.continueAndDispatch(saved);
    }
    if (input.outcome === "site_application_limit_reached") {
      if (!input.commandId || input.commandId !== current.receiptCommandId) {
        throw new Error("站点投递限制不属于当前提交命令");
      }
      const siteMessage = String(input.siteMessage ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
      if (!siteMessage) throw new Error("站点投递限制缺少可见提示");
      const jobs = [...batch.jobs];
      jobs[index] = {
        ...current,
        status: "failed",
        commandId: null,
        receiptCommandId: undefined,
        reasonCode: "site_application_limit_reached",
        completedAt: timestamp,
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: input.pageUrl,
          siteConfirmation: siteMessage,
          diagnostic: {
            code: "site_application_limit_reached",
            category: "site_validation",
            stage: "submit",
            userMessage: "近期在该公司投递次数过多，已被招聘网站限制投递。",
            developerMessage: "验证码完成或提交后，绑定标签页出现明确的投递频次/数量限制弹窗；Gateway 已按站点策略失败收口。",
            retryable: false,
            recommendedAction: "inspect_evidence"
          },
          failureDetails: {
            reconciledFromPersistentTab: true,
            outcome: input.outcome,
            message: siteMessage
          }
        }
      };
      const preserveUserPause = batch.status === "paused" && batch.pauseReason === "user_requested";
      const saved = await this.batches.save({
        ...batch,
        status: preserveUserPause ? "paused" : "running",
        pauseReason: preserveUserPause ? "user_requested" : null,
        jobs,
        revision: batch.revision + 1,
        updatedAt: timestamp
      });
      return this.continueAndDispatch(saved);
    }
    if (input.outcome === "site_validation_rejected") {
      if (!input.commandId || input.commandId !== current.receiptCommandId) {
        throw new Error("字段拒绝不属于当前提交命令");
      }
      if (input.uploadRejection !== undefined) {
        if (current.status !== "waiting_for_site_receipt") throw new Error("上传拒绝与当前等待状态不匹配");
        const upload = autoApplyUploadRejectionSchema.parse(input.uploadRejection);
        const labels = upload.uploadFields.map(field => field.label);
        const message = `招聘网站未接受文件上传（${labels.join("、").slice(0, 400)}），请在原招聘页面检查上传结果。`;
        const result = autoApplyJobResultSchema.parse({
          schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId, batchJobId: current.batchJobId,
          jobId: current.jobId, status: "failed", reasonCode: "site_validation_blocked", occurredAt: timestamp,
          evidence: { redacted: true, pageUrl: input.pageUrl,
            diagnostic: { code: "site_validation_blocked", category: "site_validation", stage: "submit",
              userMessage: message, developerMessage: "原提交的延迟监控确认文件字段被拒绝，未转成文本补充、重传或再次提交。",
              retryable: false, recommendedAction: "inspect_evidence" },
            failureDetails: { failureCode: "site_upload_rejected", message, ...upload,
              reconciledFromPersistentTab: true, outcome: input.outcome }
          }
        });
        const jobs = [...batch.jobs];
        jobs[index] = { ...current, status: "failed", reasonCode: result.reasonCode, commandId: null,
          receiptCommandId: undefined, completedAt: timestamp, evidence: result.evidence };
        const saved = await this.batches.save({ ...batch, jobs, revision: batch.revision + 1, updatedAt: timestamp });
        return this.continueAndDispatch(saved);
      }
      const parsed = normalizeSupplementalResult(autoApplyJobResultSchema.parse({
        schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId, batchJobId: current.batchJobId,
        jobId: current.jobId, status: "waiting_for_user_action", reasonCode: "missing_information",
        occurredAt: timestamp, evidence: {
          redacted: true, pageUrl: input.pageUrl, requiredFieldRequests: input.requiredFieldRequests,
          diagnostic: {
            code: "missing_information", category: "candidate_data", stage: "form_fill",
            userMessage: "招聘网站有字段未通过校验，请补充或更正后继续。",
            developerMessage: "后台监控收到本次提交的明确字段拒绝；未自动重填或再次提交。",
            retryable: false, recommendedAction: "request_candidate_information"
          }
        }
      }));
      if (parsed.status !== "failed" && !parsed.evidence?.requiredFieldRequests?.length) throw new Error("网站字段拒绝缺少结构化补充请求");
      if (current.status === "waiting_for_user_action" && current.reasonCode === "missing_information" &&
        JSON.stringify(current.evidence?.requiredFieldRequests) === JSON.stringify(parsed.evidence?.requiredFieldRequests)) return batch;
      if (current.status !== "waiting_for_site_receipt") throw new Error("字段拒绝与当前等待状态不匹配");
      const jobs = [...batch.jobs];
      jobs[index] = { ...current, status: parsed.status, reasonCode: parsed.reasonCode,
        commandId: null, completedAt: parsed.status === "failed" ? timestamp : null,
        receiptCommandId: parsed.status === "failed" ? undefined : current.receiptCommandId, evidence: parsed.evidence };
      const saved = await this.batches.save({ ...batch, jobs, revision: batch.revision + 1, updatedAt: timestamp });
      return this.continueAndDispatch(saved);
    }
    const captchaTabClosed = input.outcome === "captcha_tab_closed";
    const receiptTabClosed = input.outcome === "submission_receipt_tab_closed";
    const receiptTimedOut = input.outcome === "submission_receipt_timeout";
    if (current.status === "waiting_for_user_action" && (receiptTabClosed || receiptTimedOut)) {
      throw new Error("站点回执结果与当前人工等待状态不匹配");
    }
    if (current.status === "waiting_for_site_receipt" && captchaTabClosed) {
      throw new Error("验证码关闭结果与当前站点回执状态不匹配");
    }
    const receiptFailed = captchaTabClosed || receiptTabClosed || receiptTimedOut;
    const failureReasonCode = captchaTabClosed
      ? "captcha_tab_closed"
      : receiptTabClosed ? "submission_receipt_tab_closed"
        : receiptTimedOut ? "site_success_not_observed" : null;
    const jobs = [...batch.jobs];
    jobs[index] = {
      ...current,
      status: receiptFailed ? "failed" : "succeeded",
      commandId: null,
      reasonCode: failureReasonCode ?? (
        input.outcome === "already_applied" ? "already_applied" : null
      ),
      completedAt: timestamp,
      evidence: {
        screenshotRef: null,
        redacted: true,
        pageUrl: input.pageUrl,
        siteConfirmation: receiptFailed
          ? null
          : input.outcome === "already_applied" ? "招聘网站提示重复申请/已经投递" : "投递成功",
        ...(receiptFailed ? {
          diagnostic: {
            code: failureReasonCode!,
            category: captchaTabClosed ? "human_action" as const : "page" as const,
            stage: "submit" as const,
            userMessage: captchaTabClosed
              ? "等待验证码时投递页面被关闭，本次投递失败。"
              : receiptTabClosed
                ? "等待招聘网站返回投递结果时页面被关闭，结果无法确认。"
                : "招聘网站在后台核验窗口内没有返回明确投递结果。",
            developerMessage: captchaTabClosed
              ? "持久化验证码监控收到原任务标签页关闭事件，未刷新、重开或重复提交。"
              : receiptTabClosed
                ? "后台回执监控收到原提交标签页关闭事件，未刷新、重开或重复提交。"
                : "12 秒主动核验结束后继续后台观察，累计 120 秒仍未取得可确认的成功或重复申请回执。",
            retryable: true,
            recommendedAction: receiptTimedOut ? "inspect_evidence" as const : "retry_job" as const
          }
        } : {}),
        failureDetails: {
          reconciledFromPersistentTab: true,
          outcome: input.outcome,
          ...(receiptFailed ? {
            message: captchaTabClosed
              ? "等待用户完成验证码期间，原投递标签页被关闭，无法继续确认站点结果。"
              : receiptTabClosed
                ? "等待站点迟到回执期间，原投递标签页被关闭。"
                : "站点迟到回执后台监控已达到总计 120 秒的安全截止。"
          } : {})
        }
      }
    };
    const preserveUserPause = batch.status === "paused" && batch.pauseReason === "user_requested";
    const saved = await this.batches.save({
      ...batch,
      status: preserveUserPause ? "paused" : "running",
      pauseReason: preserveUserPause ? "user_requested" : null,
      jobs,
      revision: batch.revision + 1,
      updatedAt: timestamp
    });
    return this.continueAndDispatch(saved);
  }

  async control(batchId: string, identity: { tenantId: string; userId: string; deviceId: string }) {
    const batch = await this.get(batchId, identity);
    if (batch.deviceId !== identity.deviceId) throw new Error("批次不属于当前设备");
    return {
      schemaVersion: "auto-apply-control.v1",
      batchId,
      status: batch.status,
      action: batch.status === "paused" ? "pause" : batch.status === "cancelled" ? "cancel" : "continue",
      updatedAt: batch.updatedAt
    };
  }

  async acceptCommandResult(commandId: string, event: LegacyPluginEvent): Promise<AutoApplyBatch> {
    const result = autoApplyJobResultSchema.parse(event.payload?.autoApplyResult ?? event.payload);
    const batch = await this.required(result.batchId);
    return this.serializeOwner(this.ownerKey(batch.tenantId, batch.userId),
      () => this.acceptCommandResultSerialized(commandId, event));
  }

  /** A receipt acknowledges transport separately from the business outcome.
   * Late valid evidence never revives a terminal job or replaces another attempt. */
  async completeCommandResult(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<AutoApplyBatch> {
    const result = autoApplyJobResultSchema.parse(event.payload?.autoApplyResult ?? event.payload);
    const batch = await this.required(result.batchId);
    return this.serializeOwner(this.ownerKey(batch.tenantId, batch.userId), async () => {
      const current = await this.required(result.batchId);
      const dispatched = await this.queue.get(commandId);
      const payload = dispatched?.command.payload;
      const dispatchedJob = payload?.job as Record<string, unknown> | undefined;
      const job = current.jobs.find((candidate) => candidate.batchJobId === result.batchJobId && candidate.jobId === result.jobId);
      if (!dispatched || dispatched.command.type !== "browser.execute_batch_auto_apply_job" ||
        dispatched.tenantId !== current.tenantId || dispatched.userId !== current.userId ||
        dispatched.targetDeviceId !== deviceId || dispatched.claimedBy !== deviceId || dispatched.claimedAt === null ||
        payload?.batchId !== result.batchId || payload?.batchJobId !== result.batchJobId ||
        dispatchedJob?.jobId !== result.jobId || !job) {
        throw new Error("批量投递回执与原设备命令或岗位不匹配");
      }
      const ownsAttempt = current.deviceId === deviceId &&
        (job.commandId === commandId || job.receiptCommandId === commandId);
      if (["completed", "failed"].includes(dispatched.status) && dispatched.completionEvent) {
        // complete verifies that this retry is byte-equivalent to its durable receipt.
        const recorded = await this.queue.complete(commandId, deviceId, event);
        if (!ownsAttempt) return current;
        return this.acceptCommandResultSerialized(commandId, recorded.completionEvent!);
      }
      const staleClaim = dispatched.status === "claimed" &&
        (deviceCommandExecutionExpired(dispatched, this.now()) || !ownsAttempt || terminalAutoApplyJobStatuses.has(job.status));
      if (staleClaim || ["expired", "cancelled"].includes(dispatched.status)) {
        if (staleClaim) await this.queue.expire(commandId);
        // These operations must return normally so a PG transaction commits the
        // expired state as well as its receipt. Throwing would undo the fence.
        await this.queue.archiveExpiredCompletion(commandId, deviceId, event);
        if (ownsAttempt && !terminalAutoApplyJobStatuses.has(job.status)) {
          return this.reconcileExpiredDelivery(current);
        }
        if (this.persistence) await this.dispatchNextForDevice(current);
        return current;
      }
      if (!ownsAttempt) throw new Error("批量投递结果与设备或已派发命令不匹配");
      const command = await this.queue.complete(commandId, deviceId, event);
      return this.acceptCommandResultSerialized(commandId, command.completionEvent ?? event);
    });
  }

  private async acceptCommandResultSerialized(commandId: string, event: LegacyPluginEvent): Promise<AutoApplyBatch> {
    const raw = event.payload?.autoApplyResult ?? event.payload;
    const result = normalizeSupplementalResult(autoApplyJobResultSchema.parse(raw));
    const batch = await this.required(result.batchId);
    const index = batch.jobs.findIndex((job) => job.batchJobId === result.batchJobId &&
      job.jobId === result.jobId && (job.commandId === commandId || job.receiptCommandId === commandId));
    if (index < 0) throw new Error("批量投递结果与已派发命令不匹配");
    const current = batch.jobs[index]!;
    if (terminalAutoApplyJobStatuses.has(current.status)) return batch;
    if (current.receiptCommandId === commandId && current.commandId !== commandId) {
      return batch.status === "paused" ? batch : this.continueAndDispatch(batch);
    }
    // Login remains a terminal attempt. CAPTCHA, identity verification and late
    // site receipts release their original command so later jobs can continue;
    // Browser State later resolves the job from its precisely bound tab.
    const terminalHumanActionReason = result.status === "waiting_for_user_action" &&
      result.reasonCode === "login_required"
      ? "login_required" as const
      : null;
    if ((result.status === "waiting_for_user_action" ||
      result.status === "waiting_for_site_receipt") && !terminalHumanActionReason) {
      const jobs = [...batch.jobs];
      jobs[index] = {
        ...current,
        status: result.status,
        commandId: null,
        receiptCommandId: commandId,
        reasonCode: result.reasonCode,
        completedAt: null,
        evidence: result.evidence
      };
      const saved = await this.batches.save({
        ...batch,
        status: batch.status,
        jobs,
        revision: batch.revision + 1,
        updatedAt: this.now().toISOString()
      });
      return saved.status === "paused" ? saved : this.continueAndDispatch(saved);
    }
    const effectiveStatus = terminalHumanActionReason ? "failed" : result.status;
    const effectiveEvidence = terminalHumanActionReason && result.evidence
      ? {
          ...result.evidence,
          userActionRequired: undefined,
          diagnostic: {
            code: terminalHumanActionReason,
            category: "human_action" as const,
            stage: terminalHumanActionReason === "login_required" ? "login" as const : "submit" as const,
            userMessage: terminalHumanActionReason === "login_required"
              ? "本次投递未成功：招聘网站需要用户登录。请先登录后重新投递。"
              : "本次投递未成功：招聘网站要求完成安全验证码。请完成后重新投递。",
            developerMessage: `Gateway 已将历史等待回执收敛为 failed/${terminalHumanActionReason}。`,
            retryable: true,
            recommendedAction: "retry_job" as const
          }
        }
      : result.evidence;
    const nextJob: AutoApplyBatchJob = {
      ...current,
      status: effectiveStatus,
      commandId: current.commandId,
      reasonCode: result.reasonCode,
      completedAt: result.occurredAt,
      evidence: effectiveEvidence
    };
    const jobs = [...batch.jobs];
    jobs[index] = nextJob;
    const updated = await this.batches.save({
      ...batch,
      jobs,
      revision: batch.revision + 1,
      updatedAt: this.now().toISOString()
    });
    if (updated.status === "cancelled" || updated.status === "paused") return this.notifyTerminal(updated);
    return this.continueAndDispatch(updated);
  }

  async acceptCommandProgress(commandId: string, input: unknown): Promise<AutoApplyBatch> {
    const progress = autoApplyJobProgressSchema.parse(input);
    const batch = await this.required(progress.batchId);
    return this.serializeOwner(this.ownerKey(batch.tenantId, batch.userId),
      () => this.acceptCommandProgressSerialized(commandId, input));
  }

  private async acceptCommandProgressSerialized(commandId: string, input: unknown): Promise<AutoApplyBatch> {
    const progress = autoApplyJobProgressSchema.parse(input);
    const batch = await this.required(progress.batchId);
    const index = batch.jobs.findIndex((job) =>
      job.batchJobId === progress.batchJobId &&
      job.jobId === progress.jobId &&
      job.commandId === commandId
    );
    if (index < 0) throw new Error("自动投递进度与已派发命令不匹配");
    const current = batch.jobs[index]!;
    const command = await this.queue.get(commandId);
    if (!command || command.status !== "claimed" || command.claimedBy !== batch.deviceId ||
      command.tenantId !== batch.tenantId || command.userId !== batch.userId ||
      command.targetDeviceId !== batch.deviceId || command.stopRequestedAt || current.stopRequest ||
      deviceCommandExecutionExpired(command, this.now())) {
      throw new Error("自动投递命令已失效或正在停止，不能继续写入进度");
    }
    if (terminalAutoApplyJobStatuses.has(current.status) ||
      current.status === "waiting_for_user_action" || current.status === "waiting_for_site_receipt") {
      throw new Error(`岗位已结束或正在等待外部结果，不能继续写入进度：${current.status}`);
    }
    if ((current.progress?.sequence ?? 0) >= progress.sequence) {
      throw new AutoApplyProgressSequenceConflictError(progress.sequence, current.progress?.sequence ?? 0);
    }
    const receivedAt = this.now().toISOString();
    const jobs = [...batch.jobs];
    jobs[index] = {
      ...current,
      status: progress.stage,
      progress: {
        schemaVersion: progress.schemaVersion,
        commandId,
        sequence: progress.sequence,
        stage: progress.stage,
        message: progress.message,
        occurredAt: progress.occurredAt,
        receivedAt
      }
    };
    // A progress heartbeat can arrive after the user has paused a currently
    // running browser command. Keep that late evidence, but never let it
    // silently turn a deliberate batch pause back into running and release
    // another queued job.
    const preserveUserPause = batch.status === "paused" && batch.pauseReason === "user_requested";
    return this.batches.save({
      ...batch,
      status: preserveUserPause ? "paused" : "running",
      pauseReason: preserveUserPause ? "user_requested" : null,
      jobs,
      revision: batch.revision + 1,
      updatedAt: receivedAt
    });
  }

  async verifySubmissionAuthorization(
    token: string,
    expected: {
      batchId: string;
      batchJobId: string;
      commandId: string;
      tenantId: string;
      userId: string;
      deviceId: string;
    }
  ): Promise<SubmissionAuthorizationVerification> {
    return this.serializeOwner(this.ownerKey(expected.tenantId, expected.userId),
      () => this.verifySubmissionAuthorizationSerialized(token, expected));
  }

  private async verifySubmissionAuthorizationSerialized(
    token: string,
    expected: { batchId: string; batchJobId: string; commandId: string; tenantId: string; userId: string; deviceId: string }
  ): Promise<SubmissionAuthorizationVerification> {
    try {
      const [encoded, signature] = token.split(".");
      if (!encoded || !signature) throw new Error("malformed_token");
      const expectedSignature = this.sign(encoded);
      const left = Buffer.from(signature);
      const right = Buffer.from(expectedSignature);
      if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("invalid_signature");
      const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AuthorizationClaims;
      if (claims.version !== 2 || claims.batchId !== expected.batchId ||
        claims.batchJobId !== expected.batchJobId || claims.commandId !== expected.commandId ||
        claims.tenantId !== expected.tenantId || claims.userId !== expected.userId ||
        claims.deviceId !== expected.deviceId) throw new Error("scope_mismatch");
      if (Date.parse(claims.expiresAt) <= this.now().getTime()) throw new Error("expired");
      if (claims.allowAutomaticFinalSubmit !== true) throw new Error("final_submit_not_confirmed");
      const batch = await this.required(expected.batchId);
      const job = batch.jobs.find((candidate) => candidate.batchJobId === expected.batchJobId);
      if (batch.status !== "running" || job?.commandId !== expected.commandId ||
        terminalAutoApplyJobStatuses.has(job.status) || job.stopRequest ||
          job.status === "waiting_for_user_action" || job.status === "waiting_for_site_receipt") {
        throw new Error("stale_attempt");
      }
      const command = await this.queue.get(expected.commandId);
      if (!command || command.status !== "claimed" || command.claimedBy !== expected.deviceId ||
        deviceCommandExecutionExpired(command, this.now()) ||
        !command.leaseExpiresAt || Date.parse(command.leaseExpiresAt) <= this.now().getTime()) {
        throw new Error("command_not_active");
      }
      const executionExpiresAt = Date.parse(command.executionExpiresAt ?? command.command.expiresAt);
      if (executionExpiresAt - this.now().getTime() < minimumAutoApplySubmissionWindowMs) {
        throw new Error("insufficient_execution_window");
      }
      // 返回点击许可之前落盘。已发许可即使没有回执，也不允许本地重建投递。
      if (batch.tenantId === "local" && !job.localSubmitAuthorizedAt) {
        await this.batches.save({ ...batch,
          jobs: batch.jobs.map(item => item.batchJobId === job.batchJobId
            ? { ...item, localSubmitAuthorizedAt: this.now().toISOString() } : item),
          revision: batch.revision + 1, updatedAt: this.now().toISOString()
        });
      }
      return { valid: true, batchId: claims.batchId, batchJobId: claims.batchJobId, reason: null };
    } catch (error) {
      return {
        valid: false,
        batchId: null,
        batchJobId: null,
        reason: error instanceof Error ? error.message : "invalid_token"
      };
    }
  }

  private hasActiveJob(batch: AutoApplyBatch): boolean {
    return batch.jobs.some((job) => !terminalAutoApplyJobStatuses.has(job.status) &&
      job.status !== "queued" && job.status !== "waiting_for_user_action" &&
      job.status !== "waiting_for_site_receipt");
  }

  private async hasOtherActiveDeviceJob(batch: AutoApplyBatch): Promise<boolean> {
    const batches = await this.batches.listNonTerminal(batch);
    return batches.some((candidate) => candidate.batchId !== batch.batchId &&
      candidate.tenantId === batch.tenantId &&
      candidate.userId === batch.userId &&
      candidate.deviceId === batch.deviceId &&
      this.hasActiveJob(candidate));
  }

  private async dispatchNextForDevice(batch: AutoApplyBatch): Promise<void> {
    const batches = (await this.batches.listNonTerminal(batch))
      .filter((candidate) => candidate.tenantId === batch.tenantId &&
        candidate.userId === batch.userId && candidate.deviceId === batch.deviceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) ||
        left.batchId.localeCompare(right.batchId));
    if (batches.some((candidate) => this.hasActiveJob(candidate))) return;
    const next = batches.find((candidate) => candidate.status !== "paused" &&
      candidate.jobs.some((job) => job.status === "queued" && !job.stopRequest));
    if (next) await this.enqueueNext(next);
  }

  private async continueAndDispatch(batch: AutoApplyBatch): Promise<AutoApplyBatch> {
    const advanced = await this.notifyTerminal(await this.enqueueNext(batch));
    await this.dispatchNextForDevice(advanced);
    return advanced;
  }

  private async deviceCanDispatch(identity: AutoApplySchedulingOwner): Promise<boolean> {
    if (!this.persistence) return true;
    if (await this.ownerTerminated(this.ownerKey(identity.tenantId, identity.userId))) return false;
    if (this.persistence.canDispatch && !await this.persistence.canDispatch(identity)) return false;
    const commands = this.queue.listActiveByDevice
      ? await this.queue.listActiveByDevice(identity.tenantId, identity.userId, identity.deviceId)
      : this.queue.listByDevice
        ? await this.queue.listByDevice(identity.tenantId, identity.userId, identity.deviceId)
        : [];
    // Only a live execution occupies the device. Expired/cancelled commands
    // are fenced by final-submit/lease checks and are never reclaimed. Their
    // uncertain jobs are not retried, but other queued jobs may proceed.
    return !commands.some((command) => command.command.type === "browser.execute_batch_auto_apply_job" &&
      ["queued", "claimed"].includes(command.status) &&
      !command.completionEvent && !command.archivedCompletionEvent && !command.stopAcknowledgedAt);
  }

  private async enqueueNext(batch: AutoApplyBatch): Promise<AutoApplyBatch> {
    if (["paused", "cancelled", "completed", "completed_with_errors", "failed"].includes(batch.status)) {
      return batch;
    }
    if (this.hasActiveJob(batch)) {
      if (batch.status === "running") return batch;
      return this.batches.save({
        ...batch,
        status: "running",
        pauseReason: null,
        revision: batch.revision + 1,
        updatedAt: this.now().toISOString()
      });
    }
    if (await this.hasOtherActiveDeviceJob(batch)) return batch;
    const nextIndex = batch.jobs.findIndex((job) => job.status === "queued" && !job.stopRequest);
    if (nextIndex < 0) {
      if (batch.jobs.some((job) => job.stopRequest && !job.stopRequest.confirmedAt)) return batch;
      if (batch.jobs.some((job) => job.status === "waiting_for_user_action")) {
        return this.batches.save({
          ...batch,
          status: "paused",
          pauseReason: "waiting_for_user_action",
          revision: batch.revision + 1,
          updatedAt: this.now().toISOString()
        });
      }
      if (batch.jobs.some((job) => job.status === "waiting_for_site_receipt")) {
        if (batch.status === "running" && batch.pauseReason === null) return batch;
        return this.batches.save({
          ...batch,
          status: "running",
          pauseReason: null,
          revision: batch.revision + 1,
          updatedAt: this.now().toISOString()
        });
      }
      return this.batches.save({
        ...batch,
        status: finishedWithErrors(batch) ? "completed_with_errors" : "completed",
        pauseReason: null,
        revision: batch.revision + 1,
        updatedAt: this.now().toISOString()
      });
    }
    if (this.persistence?.dispatchOnClaim && !this.dispatchContext.getStore()) return batch;
    if (!await this.deviceCanDispatch(batch)) return batch;
    const now = this.now();
    const timestamp = now.toISOString();
    const job = batch.jobs[nextIndex]!;
    const commandId = randomUUID();
    const authorization = this.authorization(batch, job, commandId);
    const command: LegacyPluginCommand = {
      schemaVersion: "ai-plugin-command.v1",
      commandId,
      conversationId: batch.batchId,
      tenantId: batch.tenantId,
      userId: batch.userId,
      issuedAt: timestamp,
      // The 24-hour batch authorization only describes user consent. A concrete
      // device command must either be picked up quickly or end as a visible
      // failure; otherwise an offline extension can leave the batch stuck.
      expiresAt: autoApplyCommandExpiresAt(batch.authorizationExpiresAt, now),
      type: "browser.execute_batch_auto_apply_job",
      idempotencyKey: `${batch.idempotencyKey}:${job.jobId}`,
      requiresUserGesture: false,
      payload: {
        batchId: batch.batchId,
        batchJobId: job.batchJobId,
        job: {
          jobId: job.jobId,
          companyName: job.companyName,
          title: job.title,
          applicationUrl: job.applicationUrl,
          adapterCode: job.adapterCode,
          tags: [...(job.tags ?? [])],
          locations: [...(job.locations ?? [])],
          answers: structuredClone(job.answers ?? {}),
          requiredFieldAnswers: structuredClone(job.requiredFieldAnswers ?? [])
        },
        candidate: { ...batch.candidate, applicationProfile: job.candidateProfile ?? batch.candidate.applicationProfile },
        localAssisted: batch.confirmation.allowAutomaticFinalSubmit === false,
        localReviewApproval: job.localReviewApproval ?? null,
        assets: batch.assets,
        executionPolicy: batch.executionPolicy,
        runtimePolicy: {
          engine: this.engineFor(job)
        },
        batchAuthorization: authorization
      },
      safety: {
        allowFinalSubmit: batch.confirmation.allowAutomaticFinalSubmit || Boolean(job.localReviewApproval),
        // The user authorizes consent controls once at batch confirmation.
        // Runtime still observes and reads back the concrete control before
        // continuing, but the permission is not restricted to one ATS/domain.
        allowConsentClick: batch.safety?.allowConsentClick === true,
        // A supported post-submit slider gets one attempt; the plugin retains
        // the original manual handoff for every failure or unsupported mode.
        allowCaptchaHandling: true
      }
    };
    await this.queue.enqueue({
      commandId,
      runId: `auto-apply:${job.batchJobId}`,
      tenantId: batch.tenantId,
      userId: batch.userId,
      targetDeviceId: batch.deviceId,
      command
    });
    const jobs = [...batch.jobs];
    jobs[nextIndex] = {
      ...job,
      status: "preflight",
      receiptCommandId: undefined,
      attempt: job.attempt + 1,
      commandId,
      startedAt: timestamp,
      progress: undefined
    };
    return this.batches.save({
      ...batch,
      status: "running",
      pauseReason: null,
      jobs,
      revision: batch.revision + 1,
      updatedAt: timestamp
    });
  }

  private async notifyTerminal(batch: AutoApplyBatch): Promise<AutoApplyBatch> {
    if (!batch.callback || !["completed", "completed_with_errors", "cancelled", "failed"].includes(batch.status)) {
      return batch;
    }
    if (batch.callbackDelivery?.status === "delivered") return batch;
    if (this.persistence) {
      await this.persistence.callbackOutbox.enqueue(batch);
      return batch;
    }
    const callbackDelivery = await this.callbacks.deliver(batch);
    return this.batches.save({
      ...batch,
      callbackDelivery,
      revision: batch.revision + 1,
      updatedAt: this.now().toISOString()
    });
  }

  private async reconcileExpiredDelivery(batch: AutoApplyBatch): Promise<AutoApplyBatch> {
    const timestamp = this.now();
    const expiredJobs: Array<{
      index: number;
      reasonCode: "command_delivery_timeout" | "task_execution_timeout" | "execution_lease_lost";
      commandExecutionDeadlineAt: string | null;
      leaseRecoveryDeadlineAt: string | null;
    }> = [];
    for (const [index, job] of batch.jobs.entries()) {
      if (!job.commandId || terminalAutoApplyJobStatuses.has(job.status)) continue;
      const command = await this.queue.get(job.commandId);
      if (!command) continue;
      const deliveryTimeout = command.claimedAt === null &&
        ["queued", "expired"].includes(command.status) &&
        deviceCommandExpired(command.command, timestamp);
      const executionTimeout = command.claimedAt !== null &&
        ["claimed", "expired"].includes(command.status) &&
        deviceCommandExecutionExpired(command, timestamp);
      if (!deliveryTimeout && !executionTimeout) continue;
      const expired = await this.queue.expire(command.commandId);
      if (expired.status !== "expired") continue;
      expiredJobs.push({
        index,
        reasonCode: deliveryTimeout ? "command_delivery_timeout"
          : command.leaseRecoveryDeadlineAt && Date.parse(command.leaseRecoveryDeadlineAt) <= timestamp.getTime() &&
            Date.parse(command.leaseRecoveryDeadlineAt) < Date.parse(command.executionExpiresAt ?? command.command.expiresAt)
            ? "execution_lease_lost" : "task_execution_timeout",
        commandExecutionDeadlineAt: command.executionExpiresAt ?? null,
        leaseRecoveryDeadlineAt: command.leaseRecoveryDeadlineAt ?? null
      });
    }
    if (expiredJobs.length === 0) return batch;

    const completedAt = timestamp.toISOString();
    const jobs = [...batch.jobs];
    for (const { index, reasonCode, commandExecutionDeadlineAt, leaseRecoveryDeadlineAt } of expiredJobs) {
      const job = jobs[index]!;
      const deliveryTimeout = reasonCode === "command_delivery_timeout";
      const leaseLost = reasonCode === "execution_lease_lost";
      jobs[index] = {
        ...job,
        status: "failed",
        commandId: null,
        reasonCode,
        completedAt,
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: job.applicationUrl,
          siteConfirmation: null,
          diagnostic: {
            code: reasonCode,
            category: "transport",
            stage: "transport",
            userMessage: deliveryTimeout
              ? "插件在 5 分钟内未领取该投递任务，已停止等待。"
              : leaseLost
                ? "插件失去连接，当前岗位的投递结果尚未确认。请核对招聘网站记录；插件恢复后可继续后续岗位。"
                : "插件执行超过 30 分钟硬时限，当前岗位的投递结果尚未确认。请核对招聘网站记录。",
            developerMessage: deliveryTimeout
              ? "设备命令超过 5 分钟仍未被领取，未打开招聘页面。"
              : leaseLost
                ? "执行租约及 30 秒重连宽限已到期，Gateway 已终止原 attempt；未确认外部提交结果，禁止自动重投原岗位。"
                : "已领取的设备命令超过执行硬截止时间，Gateway 已终止原 attempt；未确认外部提交结果，禁止自动重投原岗位。",
            retryable: false,
            recommendedAction: "inspect_evidence"
          },
          failureDetails: {
            ...(deliveryTimeout ? {
              commandDeliveryDeadlineAt: autoApplyCommandExpiresAt(batch.authorizationExpiresAt, new Date(
                Date.parse(job.startedAt ?? completedAt) || timestamp.getTime()
              ))
            } : {
              commandExecutionDeadlineAt,
              ...(leaseLost ? { leaseRecoveryDeadlineAt, resultUncertain: true } : {})
            })
          }
        }
      };
    }
    const saved = await this.batches.save({
      ...batch,
      jobs,
      revision: batch.revision + 1,
      updatedAt: completedAt
    });
    return this.continueAndDispatch(saved);
  }

  /** Repairs durable commands without relying on another plugin claim. */
  private async reconcilePersistentCommand(snapshot: DeviceCommandItem): Promise<number> {
    return this.serializeOwner(this.ownerKey(snapshot.tenantId, snapshot.userId),
      () => this.reconcilePersistentCommandSerialized(snapshot));
  }

  private async reconcilePersistentCommandSerialized(snapshot: DeviceCommandItem): Promise<number> {
    const command = await this.queue.get(snapshot.commandId);
    if (!command || command.command.type !== "browser.execute_batch_auto_apply_job" ||
      !["queued", "claimed", "expired"].includes(command.status)) return 0;
    const batchId = command.command.payload?.batchId;
    const batch = typeof batchId === "string" ? await this.batches.get(batchId) : null;
    const job = batch?.jobs.find((candidate) => candidate.commandId === command.commandId);
    const ownsAttempt = batch && batch.tenantId === command.tenantId && batch.userId === command.userId &&
      batch.deviceId === command.targetDeviceId && job && !terminalAutoApplyJobStatuses.has(job.status);
    if (ownsAttempt) {
      const updated = await this.reconcileExpiredDelivery(batch);
      return updated.revision === batch.revision ? 0 : 1;
    }
    // Historical split JSON writes could leave a command behind a terminal
    // batch or another attempt. Fence it independently; never replay a job.
    if (command.status !== "expired") {
      await this.queue.expire(command.commandId);
      return 1;
    }
    return 0;
  }

  private async reconcilePersistentQueue(): Promise<number> {
    let changed = 0;
    const failures: unknown[] = [];
    const expired = await this.queue.listExpired!(100);
    for (let cursor = 0; cursor < expired.length; cursor += autoApplySweepConcurrency) {
      await Promise.all(expired.slice(cursor, cursor + autoApplySweepConcurrency).map(async (command) => {
        try { changed += await this.reconcilePersistentCommand(command); }
        catch (error) { failures.push(error); }
      }));
    }
    const owners = await this.batches.listSchedulingOwners!(100);
    for (let cursor = 0; cursor < owners.length; cursor += autoApplySweepConcurrency) {
      await Promise.all(owners.slice(cursor, cursor + autoApplySweepConcurrency).map(async (identity) => {
        try {
          // Include still-live orphan commands, not only expired deadlines.
          const commands = this.queue.listActiveByDevice
            ? await this.queue.listActiveByDevice(identity.tenantId, identity.userId, identity.deviceId)
            : [];
          for (const command of commands) changed += await this.reconcilePersistentCommand(command);
          await this.serializeOwner(this.ownerKey(identity.tenantId, identity.userId), async () => {
            if (await this.ownerTerminated(this.ownerKey(identity.tenantId, identity.userId))) return;
            const batches = await this.batches.listNonTerminal(identity);
            for (let batch of batches) {
              for (const job of batch.jobs) {
                if (job.stopRequest && !job.stopRequest.confirmedAt) batch = await this.reconcileStoppedJob(batch, job.batchJobId);
              }
            }
            const seed = batches[0] ? await this.required(batches[0].batchId) : undefined;
            if (seed) await this.dispatchNextForDevice(seed);
          });
        } catch (error) { failures.push(error); }
      }));
    }
    if (failures.length) throw new AggregateError(failures, "自动投递事务队列维护失败");
    return changed;
  }

  async reconcileExpiredBatches(): Promise<number> {
    if (this.persistence && this.queue.listExpired && this.batches.listSchedulingOwners) {
      return this.reconcilePersistentQueue();
    }
    // Most non-terminal batches are deliberately paused while the applicant
    // supplies information or completes a site action. They cannot own a
    // delivery/execution deadline. Reconciling each of them still reloads the
    // complete JSON batch store, which can keep an actually expired command
    // behind a long-running sweep. Only jobs that still own a command need a
    // delivery timeout check.
    const batches = (await this.batches.listNonTerminal()).filter((batch) =>
      batch.jobs.some((job) => job.commandId !== null &&
        !terminalAutoApplyJobStatuses.has(job.status) &&
        job.status !== "waiting_for_user_action" &&
        job.status !== "waiting_for_site_receipt")
    );
    let changed = 0;
    let cursor = 0;
    const failures: unknown[] = [];
    const worker = async () => {
      while (cursor < batches.length) {
        const snapshot = batches[cursor++]!;
        try {
          const updated = await this.serializeOwner(this.ownerKey(snapshot.tenantId, snapshot.userId), async () => {
            const current = await this.required(snapshot.batchId);
            return this.reconcileExpiredDelivery(current);
          });
          if (updated.revision !== snapshot.revision) changed += 1;
        } catch (error) {
          failures.push(error);
        }
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(autoApplySweepConcurrency, batches.length) },
      () => worker()
    ));
    if (failures.length > 0) {
      throw new AggregateError(failures, `自动投递超时扫描有 ${failures.length} 个批次处理失败`);
    }
    return changed;
  }

  private authorization(batch: AutoApplyBatch, job: AutoApplyBatchJob, commandId: string): string {
    const claims: AuthorizationClaims = {
      version: 2,
      authorizationId: batch.authorizationId,
      batchId: batch.batchId,
      batchJobId: job.batchJobId,
      commandId,
      tenantId: batch.tenantId,
      userId: batch.userId,
      deviceId: batch.deviceId,
      jobId: job.jobId,
      packageSha256: batch.candidate.packageSha256,
      expiresAt: batch.authorizationExpiresAt,
      allowAutomaticFinalSubmit: batch.confirmation.allowAutomaticFinalSubmit || Boolean(job.localReviewApproval)
    };
    const encoded = base64UrlJson(claims);
    return `${encoded}.${this.sign(encoded)}`;
  }

  private sign(encoded: string): string {
    return createHmac("sha256", this.signingSecret).update(encoded).digest("base64url");
  }

  private async required(batchId: string): Promise<AutoApplyBatch> {
    const batch = await this.batches.get(batchId);
    if (!batch) throw new Error(`批量投递任务不存在：${batchId}`);
    return batch;
  }
}
