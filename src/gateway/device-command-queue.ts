import { isDeepStrictEqual } from "node:util";
import type {
  LegacyPluginCommand,
  LegacyPluginEvent,
  LegacyPluginTransport
} from "./legacy-plugin-adapter.js";
import {
  DeviceCommandExpiredError,
  IdempotencyConflictError,
  requireDeviceId
} from "./gateway-errors.js";

export type DeviceCommandStatus = "queued" | "claimed" | "completed" | "failed" | "expired" | "cancelled";

export interface DeviceCommandItem {
  commandId: string;
  runId: string;
  tenantId: string;
  userId: string;
  targetDeviceId: string;
  command: LegacyPluginCommand;
  status: DeviceCommandStatus;
  createdAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  /** Added in 0.15.57. Missing on historical JSON records. */
  executionExpiresAt?: string | null;
  /** PG automatic execution fence after the lease and reconnect grace; retained after expiry. */
  leaseRecoveryDeadlineAt?: string | null;
  completedAt: string | null;
  /** Durable stop fence: never reclaim even after a lease expires. */
  stopRequestedAt?: string;
  /** Explicit device acknowledgement; cancellation alone cannot prove browser quiescence. */
  stopAcknowledgedAt?: string;
  /** Durable receipt for idempotent transport retries and batch recovery. */
  completionEvent?: LegacyPluginEvent;
  /** Late transport receipt only; never replayed into execution or batch state. */
  archivedCompletionEvent?: LegacyPluginEvent;
  archivedCompletionAt?: string;
}

export type DeviceCommandEnqueueInput = Omit<
  DeviceCommandItem,
  "status" | "createdAt" | "claimedBy" | "claimedAt" | "leaseExpiresAt" |
  "executionExpiresAt" | "leaseRecoveryDeadlineAt" | "completedAt" | "completionEvent" |
  "archivedCompletionEvent" | "archivedCompletionAt" | "stopRequestedAt" | "stopAcknowledgedAt"
>;

function comparableReceipt(receipt: LegacyPluginEvent): LegacyPluginEvent {
  const copy = structuredClone(receipt);
  const result = copy.payload?.autoApplyResult as Record<string, unknown> | undefined;
  const evidence = result?.evidence as Record<string, unknown> | undefined;
  // Uploaded screenshot references can change on retry; their verified hash cannot.
  if (typeof evidence?.sha256 === "string") delete evidence.screenshotRef;
  return copy;
}

export function isRecordedDeviceCompletion(
  item: DeviceCommandItem,
  deviceId: string,
  event: LegacyPluginEvent
): boolean {
  if (!["completed", "failed"].includes(item.status) || !item.completionEvent) return false;
  if (item.claimedBy !== deviceId || !isDeepStrictEqual(comparableReceipt(item.completionEvent), comparableReceipt(event))) {
    throw new IdempotencyConflictError();
  }
  return true;
}

/** Archive an expired automatic command's receipt without reviving its execution lease. */
export function archiveExpiredDeviceCompletion(
  item: DeviceCommandItem, deviceId: string, event: LegacyPluginEvent, timestamp: Date
): boolean {
  if (!["expired", "cancelled"].includes(item.status) || item.command.type !== "browser.execute_batch_auto_apply_job" ||
    item.claimedBy !== deviceId || item.targetDeviceId !== deviceId || item.claimedAt === null) {
    throw new Error("仅可归档当前设备已领取且已终止的自动投递回执");
  }
  if (item.archivedCompletionEvent) {
    if (!isDeepStrictEqual(comparableReceipt(item.archivedCompletionEvent), comparableReceipt(event))) {
      throw new IdempotencyConflictError();
    }
    return false;
  }
  item.archivedCompletionEvent = structuredClone(event);
  item.archivedCompletionAt = timestamp.toISOString();
  return true;
}

export function matchesDeviceCommandEnqueueInput(
  existing: DeviceCommandItem,
  input: DeviceCommandEnqueueInput,
  targetDeviceId: string
): boolean {
  return isDeepStrictEqual(
    {
      commandId: existing.commandId,
      runId: existing.runId,
      tenantId: existing.tenantId,
      userId: existing.userId,
      targetDeviceId: existing.targetDeviceId,
      command: existing.command
    },
    {
      commandId: input.commandId,
      runId: input.runId,
      tenantId: input.tenantId,
      userId: input.userId,
      targetDeviceId,
      command: input.command
    }
  );
}

export interface ClaimDeviceCommandInput {
  tenantId: string;
  userId: string;
  deviceId: string;
  leaseSeconds?: number;
  /** Server-side eligibility only; never changes ownership or existing receipts. */
  excludedCommandTypes?: readonly string[];
}

export interface DeviceCommandQueue {
  enqueue(item: DeviceCommandEnqueueInput): Promise<DeviceCommandItem>;
  claim(input: ClaimDeviceCommandInput): Promise<DeviceCommandItem | null>;
  complete(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem>;
  archiveExpiredCompletion(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem>;
  renew(commandId: string, deviceId: string, leaseSeconds?: number): Promise<DeviceCommandItem>;
  expire(commandId: string): Promise<DeviceCommandItem>;
  get(commandId: string): Promise<DeviceCommandItem | null>;
  cancelQueued(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<boolean>;
  acknowledgeStopped(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem>;
  cancelOwner(tenantId: string, userId: string): Promise<number>;
  listExpired?(limit?: number): Promise<DeviceCommandItem[]>;
  listByDevice?(tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem[]>;
  listActiveByDevice?(tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem[]>;
}

export function deviceCommandExpired(command: LegacyPluginCommand, timestamp: Date): boolean {
  const expiresAt = Date.parse(command.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= timestamp.getTime();
}

export const autoApplyExecutionDeadlineMs = 30 * 60_000;
export const autoApplyLeaseRecoveryGraceMs = 30_000;

export function deviceCommandExecutionExpiresAt(command: LegacyPluginCommand, claimedAt: Date): string {
  if (command.type === "browser.execute_batch_auto_apply_job") {
    return new Date(claimedAt.getTime() + autoApplyExecutionDeadlineMs).toISOString();
  }
  return command.expiresAt;
}

export function deviceCommandExecutionDeadlineAt(item: DeviceCommandItem): string {
  const hardDeadline = item.executionExpiresAt ?? item.command.expiresAt;
  if (item.command.type !== "browser.execute_batch_auto_apply_job" || item.leaseRecoveryDeadlineAt == null) return hardDeadline;
  const effective = Math.min(Date.parse(hardDeadline), Date.parse(item.leaseRecoveryDeadlineAt));
  return Number.isFinite(effective) ? new Date(effective).toISOString() : new Date(0).toISOString();
}

export function deviceCommandExecutionExpired(item: DeviceCommandItem, timestamp: Date): boolean {
  const expiresAt = Date.parse(deviceCommandExecutionDeadlineAt(item));
  return !Number.isFinite(expiresAt) || expiresAt <= timestamp.getTime();
}

function commandDeadlineExpired(item: DeviceCommandItem, timestamp: Date): boolean {
  return item.claimedAt === null
    ? deviceCommandExpired(item.command, timestamp)
    : deviceCommandExecutionExpired(item, timestamp);
}

function markCommandExpired(item: DeviceCommandItem, timestamp: Date): void {
  item.status = "expired";
  item.completedAt = timestamp.toISOString();
  item.leaseExpiresAt = null;
}

function reclaimableCommand(item: DeviceCommandItem, timestamp: Date): boolean {
  return item.status === "queued" || (
    item.status === "claimed" &&
    item.leaseExpiresAt !== null &&
    Date.parse(item.leaseExpiresAt) <= timestamp.getTime()
  );
}

export class MemoryDeviceCommandQueue implements DeviceCommandQueue {
  private readonly commands = new Map<string, DeviceCommandItem>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async enqueue(input: DeviceCommandEnqueueInput): Promise<DeviceCommandItem> {
    const targetDeviceId = requireDeviceId(input.targetDeviceId);
    const existing = this.commands.get(input.commandId);
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
    this.commands.set(item.commandId, item);
    return structuredClone(item);
  }

  async claim(input: ClaimDeviceCommandInput): Promise<DeviceCommandItem | null> {
    const timestamp = this.now();
    const candidates = [...this.commands.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const candidate of candidates) {
      if (!reclaimableCommand(candidate, timestamp) ||
        candidate.tenantId !== input.tenantId || candidate.userId !== input.userId ||
        candidate.targetDeviceId !== input.deviceId || !commandDeadlineExpired(candidate, timestamp)) {
        continue;
      }
      markCommandExpired(candidate, timestamp);
      this.commands.set(candidate.commandId, candidate);
    }
    const item = candidates.find((candidate) =>
      reclaimableCommand(candidate, timestamp) &&
      candidate.tenantId === input.tenantId && candidate.userId === input.userId &&
      candidate.targetDeviceId === input.deviceId && !commandDeadlineExpired(candidate, timestamp) &&
      !candidate.stopRequestedAt && !input.excludedCommandTypes?.includes(candidate.command.type)
    );
    if (!item) return null;
    const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 45, 10), 300);
    item.status = "claimed";
    item.claimedBy = input.deviceId;
    item.claimedAt ??= timestamp.toISOString();
    item.executionExpiresAt ??= deviceCommandExecutionExpiresAt(item.command, timestamp);
    item.leaseExpiresAt = new Date(Math.min(
      timestamp.getTime() + leaseSeconds * 1000,
      Date.parse(item.executionExpiresAt)
    )).toISOString();
    this.commands.set(item.commandId, item);
    return structuredClone(item);
  }

  async complete(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem> {
    const item = this.commands.get(commandId);
    if (!item) throw new Error(`设备命令不存在：${commandId}`);
    if (isRecordedDeviceCompletion(item, deviceId, event)) return structuredClone(item);
    if (item.status !== "claimed" || item.claimedBy !== deviceId) {
      throw new Error("设备命令未由当前设备领取");
    }
    const timestamp = this.now();
    if (deviceCommandExecutionExpired(item, timestamp)) {
      markCommandExpired(item, timestamp);
      this.commands.set(item.commandId, item);
      throw new DeviceCommandExpiredError();
    }
    item.status = event.status === "failed" || event.status === "rejected"
      ? "failed"
      : "completed";
    item.completedAt = this.now().toISOString();
    item.leaseExpiresAt = null;
    item.completionEvent = structuredClone(event);
    this.commands.set(item.commandId, item);
    return structuredClone(item);
  }

  async archiveExpiredCompletion(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem> {
    const item = this.commands.get(commandId);
    if (!item) throw new Error(`设备命令不存在：${commandId}`);
    archiveExpiredDeviceCompletion(item, deviceId, event, this.now());
    return structuredClone(item);
  }

  async renew(commandId: string, deviceId: string, leaseSeconds = 300): Promise<DeviceCommandItem> {
    const item = this.commands.get(commandId);
    if (!item) throw new Error(`设备命令不存在：${commandId}`);
    if (item.status !== "claimed" || item.claimedBy !== deviceId) throw new Error("设备命令未由当前设备领取");
    if (item.stopRequestedAt) throw new Error("设备命令正在停止，不能续租");
    const timestamp = this.now();
    if (deviceCommandExecutionExpired(item, timestamp)) {
      markCommandExpired(item, timestamp);
      this.commands.set(item.commandId, item);
      throw new DeviceCommandExpiredError();
    }
    const seconds = Math.min(Math.max(leaseSeconds, 30), 300);
    item.leaseExpiresAt = new Date(Math.min(
      timestamp.getTime() + seconds * 1000,
      Date.parse(item.executionExpiresAt ?? item.command.expiresAt)
    )).toISOString();
    this.commands.set(item.commandId, item);
    return structuredClone(item);
  }

  async expire(commandId: string): Promise<DeviceCommandItem> {
    const item = this.commands.get(commandId);
    if (!item) throw new Error(`设备命令不存在：${commandId}`);
    if (!["completed", "failed", "expired", "cancelled"].includes(item.status)) {
      markCommandExpired(item, this.now());
      this.commands.set(item.commandId, item);
    }
    return structuredClone(item);
  }

  async get(commandId: string): Promise<DeviceCommandItem | null> {
    const item = this.commands.get(commandId);
    return item ? structuredClone(item) : null;
  }

  async acknowledgeStopped(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem> {
    const item = this.commands.get(commandId);
    if (!item || item.tenantId !== tenantId || item.userId !== userId || item.targetDeviceId !== deviceId) {
      throw new Error("停止命令归属不匹配");
    }
    if (item.status === "queued" || item.status === "claimed") {
      item.status = "cancelled";
      item.completedAt = this.now().toISOString();
      item.leaseExpiresAt = null;
    }
    item.stopAcknowledgedAt ??= this.now().toISOString();
    return structuredClone(item);
  }

  async cancelQueued(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<boolean> {
    const item = this.commands.get(commandId);
    if (!item || item.tenantId !== tenantId || item.userId !== userId || item.targetDeviceId !== deviceId) throw new Error("停止命令归属不匹配");
    item.stopRequestedAt ??= this.now().toISOString();
    if (item.status !== "queued") return item.status === "cancelled" && item.claimedAt === null;
    item.status = "cancelled";
    item.completedAt = this.now().toISOString();
    item.leaseExpiresAt = null;
    return true;
  }

  async cancelOwner(tenantId: string, userId: string): Promise<number> {
    const completedAt = this.now().toISOString();
    let cancelled = 0;
    for (const item of this.commands.values()) {
      if (item.tenantId !== tenantId || item.userId !== userId ||
        ["completed", "failed", "expired", "cancelled"].includes(item.status)) continue;
      item.status = "cancelled";
      item.completedAt = completedAt;
      item.leaseExpiresAt = null;
      this.commands.set(item.commandId, item);
      cancelled += 1;
    }
    return cancelled;
  }
}

export class QueuedLegacyPluginTransport implements LegacyPluginTransport {
  constructor(private readonly queue: DeviceCommandQueue) {}

  async send(
    command: LegacyPluginCommand,
    context: { runId: string; deviceId: string }
  ): Promise<LegacyPluginEvent> {
    if (!context.runId) throw new Error("设备队列缺少 Gateway runId");
    const targetDeviceId = requireDeviceId(context.deviceId);
    await this.queue.enqueue({
      commandId: command.commandId,
      runId: context.runId,
      tenantId: command.tenantId,
      userId: command.userId,
      targetDeviceId,
      command
    });
    return {
      schemaVersion: "ai-plugin-event.v1",
      type: "gateway.command_queued",
      status: "completed",
      payload: { commandId: command.commandId }
    };
  }
}
