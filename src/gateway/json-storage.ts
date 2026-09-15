import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { applicationRunSchema, type ApplicationRun } from "./application-contract.js";
import type { ApplicationRunRepository } from "./application-gateway.js";
import type {
  ClaimDeviceCommandInput,
  DeviceCommandEnqueueInput,
  DeviceCommandItem,
  DeviceCommandQueue
} from "./device-command-queue.js";
import {
  archiveExpiredDeviceCompletion,
  deviceCommandExecutionExpired,
  deviceCommandExecutionExpiresAt,
  deviceCommandExpired,
  isRecordedDeviceCompletion,
  matchesDeviceCommandEnqueueInput
} from "./device-command-queue.js";
import type { LegacyPluginEvent } from "./legacy-plugin-adapter.js";
import {
  DeviceCommandExpiredError,
  IdempotencyConflictError,
  requireDeviceId
} from "./gateway-errors.js";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

interface RunStore {
  schemaVersion: "application-gateway-run-store.v1";
  runs: ApplicationRun[];
  executorStates: Record<string, Record<string, unknown>>;
}

export class JsonApplicationRunRepository implements ApplicationRunRepository {
  private operation = Promise.resolve();

  constructor(private readonly file: string) {}

  private async load(): Promise<RunStore> {
    return readJson(this.file, {
      schemaVersion: "application-gateway-run-store.v1",
      runs: [],
      executorStates: {}
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  async save(run: ApplicationRun): Promise<ApplicationRun> {
    return this.serialize(async () => {
      const parsed = applicationRunSchema.parse(run);
      const store = await this.load();
      const index = store.runs.findIndex((candidate) => candidate.runId === parsed.runId);
      if (index >= 0) store.runs[index] = structuredClone(parsed);
      else store.runs.push(structuredClone(parsed));
      await writeJson(this.file, store);
      return structuredClone(parsed);
    });
  }

  async get(runId: string): Promise<ApplicationRun | null> {
    const run = (await this.load()).runs.find((candidate) => candidate.runId === runId);
    return run ? applicationRunSchema.parse(structuredClone(run)) : null;
  }

  async findByIdempotencyKey(tenantId: string, key: string): Promise<ApplicationRun | null> {
    const run = (await this.load()).runs.find((candidate) =>
      candidate.request.tenantId === tenantId && candidate.request.idempotencyKey === key
    );
    return run ? applicationRunSchema.parse(structuredClone(run)) : null;
  }

  async getExecutorState(runId: string): Promise<Record<string, unknown>> {
    return structuredClone((await this.load()).executorStates[runId] ?? {});
  }

  async saveExecutorState(runId: string, state: Record<string, unknown>): Promise<void> {
    await this.serialize(async () => {
      const store = await this.load();
      store.executorStates[runId] = structuredClone(state);
      await writeJson(this.file, store);
    });
  }
}

interface CommandStore {
  schemaVersion: "device-command-store.v1";
  commands: DeviceCommandItem[];
}

export class JsonDeviceCommandQueue implements DeviceCommandQueue {
  private operation = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async load(): Promise<CommandStore> {
    return readJson(this.file, { schemaVersion: "device-command-store.v1", commands: [] });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  async enqueue(input: DeviceCommandEnqueueInput): Promise<DeviceCommandItem> {
    return this.serialize(async () => {
      const store = await this.load();
      const targetDeviceId = requireDeviceId(input.targetDeviceId);
      const existing = store.commands.find((item) => item.commandId === input.commandId);
      if (existing) {
        if (!matchesDeviceCommandEnqueueInput(existing, input, targetDeviceId)) {
          throw new IdempotencyConflictError();
        }
        return structuredClone(existing);
      }
      const item: DeviceCommandItem = {
        ...structuredClone(input),
        targetDeviceId,
        status: "queued",
        createdAt: this.now().toISOString(),
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        executionExpiresAt: null,
        completedAt: null
      };
      store.commands.push(item);
      await writeJson(this.file, store);
      return structuredClone(item);
    });
  }

  async claim(input: ClaimDeviceCommandInput): Promise<DeviceCommandItem | null> {
    return this.serialize(async () => {
      const store = await this.load();
      const timestamp = this.now();
      const candidates = store.commands.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const reclaimable = (candidate: DeviceCommandItem) => candidate.status === "queued" || (
        candidate.status === "claimed" && candidate.leaseExpiresAt !== null &&
        Date.parse(candidate.leaseExpiresAt) <= timestamp.getTime()
      );
      const deadlineExpired = (candidate: DeviceCommandItem) => candidate.claimedAt === null
        ? deviceCommandExpired(candidate.command, timestamp)
        : deviceCommandExecutionExpired(candidate, timestamp);
      let changed = false;
      for (const candidate of candidates) {
        if (!reclaimable(candidate) || candidate.tenantId !== input.tenantId ||
          candidate.userId !== input.userId || candidate.targetDeviceId !== input.deviceId ||
          !deadlineExpired(candidate)) {
          continue;
        }
        candidate.status = "expired";
        candidate.completedAt = timestamp.toISOString();
        candidate.leaseExpiresAt = null;
        changed = true;
      }
      const item = candidates.find((candidate) =>
        reclaimable(candidate) && candidate.tenantId === input.tenantId &&
        candidate.userId === input.userId && candidate.targetDeviceId === input.deviceId &&
        !deadlineExpired(candidate) && !candidate.stopRequestedAt && !input.excludedCommandTypes?.includes(candidate.command.type)
      );
      if (!item) {
        if (changed) await writeJson(this.file, store);
        return null;
      }
      const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 45, 10), 300);
      item.status = "claimed";
      item.claimedBy = input.deviceId;
      item.claimedAt ??= timestamp.toISOString();
      item.executionExpiresAt ??= deviceCommandExecutionExpiresAt(item.command, timestamp);
      item.leaseExpiresAt = new Date(Math.min(
        timestamp.getTime() + leaseSeconds * 1000,
        Date.parse(item.executionExpiresAt)
      )).toISOString();
      await writeJson(this.file, store);
      return structuredClone(item);
    });
  }

  async complete(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem> {
    return this.serialize(async () => {
      const store = await this.load();
      const item = store.commands.find((candidate) => candidate.commandId === commandId);
      if (!item) throw new Error(`设备命令不存在：${commandId}`);
      if (isRecordedDeviceCompletion(item, deviceId, event)) return structuredClone(item);
      if (item.status !== "claimed" || item.claimedBy !== deviceId) throw new Error("设备命令未由当前设备领取");
      const timestamp = this.now();
      if (deviceCommandExecutionExpired(item, timestamp)) {
        item.status = "expired";
        item.completedAt = timestamp.toISOString();
        item.leaseExpiresAt = null;
        await writeJson(this.file, store);
        throw new DeviceCommandExpiredError();
      }
      item.status = event.status === "failed" || event.status === "rejected" ? "failed" : "completed";
      item.completedAt = this.now().toISOString();
      item.leaseExpiresAt = null;
      item.completionEvent = structuredClone(event);
      await writeJson(this.file, store);
      return structuredClone(item);
    });
  }

  async archiveExpiredCompletion(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem> {
    return this.serialize(async () => {
      const store = await this.load();
      const item = store.commands.find((candidate) => candidate.commandId === commandId);
      if (!item) throw new Error(`设备命令不存在：${commandId}`);
      if (archiveExpiredDeviceCompletion(item, deviceId, event, this.now())) await writeJson(this.file, store);
      return structuredClone(item);
    });
  }

  async renew(commandId: string, deviceId: string, leaseSeconds = 300): Promise<DeviceCommandItem> {
    return this.serialize(async () => {
      const store = await this.load();
      const item = store.commands.find((candidate) => candidate.commandId === commandId);
      if (!item) throw new Error(`设备命令不存在：${commandId}`);
      if (item.status !== "claimed" || item.claimedBy !== deviceId) throw new Error("设备命令未由当前设备领取");
      const timestamp = this.now();
      if (deviceCommandExecutionExpired(item, timestamp)) {
        item.status = "expired";
        item.completedAt = timestamp.toISOString();
        item.leaseExpiresAt = null;
        await writeJson(this.file, store);
        throw new DeviceCommandExpiredError();
      }
      const seconds = Math.min(Math.max(leaseSeconds, 30), 300);
      item.leaseExpiresAt = new Date(Math.min(
        timestamp.getTime() + seconds * 1000,
        Date.parse(item.executionExpiresAt ?? item.command.expiresAt)
      )).toISOString();
      await writeJson(this.file, store);
      return structuredClone(item);
    });
  }

  async expire(commandId: string): Promise<DeviceCommandItem> {
    return this.serialize(async () => {
      const store = await this.load();
      const item = store.commands.find((candidate) => candidate.commandId === commandId);
      if (!item) throw new Error(`设备命令不存在：${commandId}`);
      if (!["completed", "failed", "expired", "cancelled"].includes(item.status)) {
        item.status = "expired";
        item.completedAt = this.now().toISOString();
        item.leaseExpiresAt = null;
        await writeJson(this.file, store);
      }
      return structuredClone(item);
    });
  }

  async get(commandId: string): Promise<DeviceCommandItem | null> {
    const item = (await this.load()).commands.find((candidate) => candidate.commandId === commandId);
    return item ? structuredClone(item) : null;
  }

  async acknowledgeStopped(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem> {
    return this.serialize(async () => {
      const store = await this.load();
      const item = store.commands.find((candidate) => candidate.commandId === commandId);
      if (!item || item.tenantId !== tenantId || item.userId !== userId || item.targetDeviceId !== deviceId) {
        throw new Error("停止命令归属不匹配");
      }
      if (item.status === "queued" || item.status === "claimed") {
        item.status = "cancelled";
        item.completedAt = this.now().toISOString();
        item.leaseExpiresAt = null;
      }
      item.stopAcknowledgedAt ??= this.now().toISOString();
      await writeJson(this.file, store);
      return structuredClone(item);
    });
  }

  async cancelQueued(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<boolean> {
    return this.serialize(async () => {
      const store = await this.load();
      const item = store.commands.find((candidate) => candidate.commandId === commandId);
      if (!item || item.tenantId !== tenantId || item.userId !== userId || item.targetDeviceId !== deviceId) {
        throw new Error("停止命令归属不匹配");
      }
      if (!item.stopRequestedAt) {
        item.stopRequestedAt = this.now().toISOString();
        await writeJson(this.file, store);
      }
      if (item.status !== "queued") return item.status === "cancelled" && item.claimedAt === null;
      item.status = "cancelled";
      item.completedAt = this.now().toISOString();
      item.leaseExpiresAt = null;
      await writeJson(this.file, store);
      return true;
    });
  }

  async cancelOwner(tenantId: string, userId: string): Promise<number> {
    return this.serialize(async () => {
      const store = await this.load();
      const completedAt = this.now().toISOString();
      let cancelled = 0;
      for (const item of store.commands) {
        if (item.tenantId !== tenantId || item.userId !== userId ||
          ["completed", "failed", "expired", "cancelled"].includes(item.status)) continue;
        item.status = "cancelled";
        item.completedAt = completedAt;
        item.leaseExpiresAt = null;
        cancelled += 1;
      }
      if (cancelled > 0) await writeJson(this.file, store);
      return cancelled;
    });
  }
}
