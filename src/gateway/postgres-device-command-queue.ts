import { terminalAutoApplyJobStatuses, type AutoApplyBatch } from "./auto-apply-contract.js";
import type { ClaimDeviceCommandInput, DeviceCommandEnqueueInput, DeviceCommandItem, DeviceCommandQueue } from "./device-command-queue.js";
import { archiveExpiredDeviceCompletion, autoApplyLeaseRecoveryGraceMs, deviceCommandExecutionDeadlineAt, deviceCommandExecutionExpired, deviceCommandExecutionExpiresAt,
  deviceCommandExpired, isRecordedDeviceCompletion, matchesDeviceCommandEnqueueInput } from "./device-command-queue.js";
import { DeviceCommandExpiredError, IdempotencyConflictError, requireDeviceId } from "./gateway-errors.js";
import type { LegacyPluginEvent } from "./legacy-plugin-adapter.js";
import { gatewayOwnerKey, PgGatewayDatabase } from "./postgres-database.js";

const automaticType = "browser.execute_batch_auto_apply_job";
const terminal = new Set(["completed", "failed", "expired", "cancelled"]);

function deadline(item: DeviceCommandItem): string {
  const value = item.claimedAt === null ? item.command.expiresAt : deviceCommandExecutionDeadlineAt(item);
  return Number.isFinite(Date.parse(value)) ? value : new Date(0).toISOString();
}

function expired(item: DeviceCommandItem, now: Date): boolean {
  return item.claimedAt === null ? deviceCommandExpired(item.command, now) : deviceCommandExecutionExpired(item, now);
}

function markExpired(item: DeviceCommandItem, now: Date): void {
  item.status = "expired";
  item.completedAt = now.toISOString();
  item.leaseExpiresAt = null;
}

export class PgDeviceCommandQueue implements DeviceCommandQueue {
  constructor(private readonly database: PgGatewayDatabase, private readonly now: () => Date = () => new Date()) {}

  private async write(item: DeviceCommandItem): Promise<void> {
    await this.database.query(`UPDATE recruiting_gateway.commands SET status=$2,deadline_at=$3,
      lease_expires_at=$4,data=$5::jsonb WHERE command_id=$1`,
      [item.commandId, item.status, deadline(item), item.leaseExpiresAt, JSON.stringify(item)]);
  }

  private async mutate<T>(commandId: string, work: (item: DeviceCommandItem) => Promise<T>): Promise<T> {
    const initial = await this.get(commandId);
    if (!initial) throw new Error(`设备命令不存在：${commandId}`);
    return this.database.transaction(gatewayOwnerKey(initial.tenantId, initial.userId), async () => {
      const item = await this.get(commandId);
      if (!item) throw new Error(`设备命令不存在：${commandId}`);
      return work(item);
    });
  }

  async enqueue(input: DeviceCommandEnqueueInput): Promise<DeviceCommandItem> {
    const targetDeviceId = requireDeviceId(input.targetDeviceId);
    return this.database.transaction(gatewayOwnerKey(input.tenantId, input.userId), async () => {
      const existing = await this.get(input.commandId);
      if (existing) {
        if (!matchesDeviceCommandEnqueueInput(existing, input, targetDeviceId)) throw new IdempotencyConflictError();
        return existing;
      }
      const item: DeviceCommandItem = {
        ...structuredClone(input), targetDeviceId, status: "queued", createdAt: this.now().toISOString(),
        claimedBy: null, claimedAt: null, leaseExpiresAt: null, executionExpiresAt: null, leaseRecoveryDeadlineAt: null, completedAt: null
      };
      await this.importCommand(item);
      return item;
    });
  }

  /** Preserves receipts and lease timestamps when importing a stopped JSON gateway. */
  async importCommand(item: DeviceCommandItem): Promise<void> {
    await this.database.query(`INSERT INTO recruiting_gateway.commands
      (command_id,tenant_id,user_id,device_id,command_type,status,created_at,deadline_at,lease_expires_at,data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [item.commandId, item.tenantId, item.userId, item.targetDeviceId, item.command.type, item.status,
        item.createdAt, deadline(item), item.leaseExpiresAt, JSON.stringify(item)]);
  }

  async claim(input: ClaimDeviceCommandInput): Promise<DeviceCommandItem | null> {
    return this.database.transaction(gatewayOwnerKey(input.tenantId, input.userId), async () => {
      const timestamp = this.now();
      const candidates = (await this.database.query<{ data: DeviceCommandItem }>(`SELECT data FROM recruiting_gateway.commands
        WHERE tenant_id=$1 AND user_id=$2 AND device_id=$3 AND status IN ('queued','claimed')
        ORDER BY (status='claimed' AND command_type='browser.execute_batch_auto_apply_job') DESC,created_at,command_id LIMIT 100`,
        [input.tenantId, input.userId, input.deviceId])).rows.map((row) => row.data);
      const paused = new Set<string>();
      for (const candidate of candidates) {
        const eligibility = candidate.command.type === automaticType && candidate.status === "queued"
          ? await this.automaticEligibility(candidate) : "ready";
        if (eligibility === "paused") paused.add(candidate.commandId);
        if (!expired(candidate, timestamp) && eligibility !== "invalid") continue;
        markExpired(candidate, timestamp);
        await this.write(candidate);
      }
      // A lease lapse is not evidence that the browser stopped submitting. Never redeliver an automatic attempt.
      const automaticRunning = candidates.some((candidate) => candidate.status === "claimed" && candidate.command.type === automaticType);
      const item = candidates.find((candidate) => {
        if (paused.has(candidate.commandId) || candidate.stopRequestedAt || terminal.has(candidate.status) || input.excludedCommandTypes?.includes(candidate.command.type)) return false;
        if (candidate.command.type === automaticType) return candidate.status === "queued" && !automaticRunning;
        return candidate.status === "queued" || (candidate.status === "claimed" && candidate.leaseExpiresAt !== null && Date.parse(candidate.leaseExpiresAt) <= timestamp.getTime());
      });
      if (!item) return null;
      const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 45, 10), 300);
      item.status = "claimed";
      item.claimedBy = input.deviceId;
      item.claimedAt ??= timestamp.toISOString();
      item.executionExpiresAt ??= deviceCommandExecutionExpiresAt(item.command, timestamp);
      item.leaseExpiresAt = new Date(Math.min(timestamp.getTime() + leaseSeconds * 1000, Date.parse(item.executionExpiresAt))).toISOString();
      this.refreshLeaseRecoveryDeadline(item);
      await this.write(item);
      return item;
    });
  }

  private refreshLeaseRecoveryDeadline(item: DeviceCommandItem): void {
    if (item.command.type !== automaticType || !item.leaseExpiresAt) return;
    item.leaseRecoveryDeadlineAt = new Date(Math.min(
      Date.parse(item.leaseExpiresAt) + autoApplyLeaseRecoveryGraceMs,
      Date.parse(item.executionExpiresAt ?? item.command.expiresAt)
    )).toISOString();
  }

  private async automaticEligibility(item: DeviceCommandItem): Promise<"ready" | "paused" | "invalid"> {
    const payload = item.command.payload;
    if (typeof payload?.batchId !== "string" || typeof payload.batchJobId !== "string") return "invalid";
    const batch = (await this.database.query<{ data: AutoApplyBatch }>(
      "SELECT data FROM recruiting_gateway.batches WHERE batch_id=$1 AND tenant_id=$2 AND user_id=$3 AND device_id=$4",
      [payload.batchId, item.tenantId, item.userId, item.targetDeviceId])).rows[0]?.data;
    const jobId = (payload.job as { jobId?: unknown } | undefined)?.jobId;
    const job = batch?.jobs.find((candidate) => candidate.batchJobId === payload.batchJobId && candidate.jobId === jobId && candidate.commandId === item.commandId);
    if (!batch || !job || !["queued", "running", "paused"].includes(batch.status) ||
      terminalAutoApplyJobStatuses.has(job.status) || job.stopRequest || item.stopRequestedAt ||
      item.command.tenantId !== item.tenantId || item.command.userId !== item.userId) return "invalid";
    return batch.status === "paused" ? "paused" : "ready";
  }

  async complete(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem> {
    const result = await this.mutate(commandId, async (item) => {
      if (isRecordedDeviceCompletion(item, deviceId, event)) return { item, timedOut: false };
      if (item.status !== "claimed" || item.claimedBy !== deviceId) throw new Error("设备命令未由当前设备领取");
      if (deviceCommandExecutionExpired(item, this.now())) {
        markExpired(item, this.now());
        await this.write(item);
        return { item, timedOut: true };
      }
      item.status = event.status === "failed" || event.status === "rejected" ? "failed" : "completed";
      item.completedAt = this.now().toISOString();
      item.leaseExpiresAt = null;
      item.completionEvent = structuredClone(event);
      await this.write(item);
      return { item, timedOut: false };
    });
    if (result.timedOut) throw new DeviceCommandExpiredError();
    return result.item;
  }

  async archiveExpiredCompletion(commandId: string, deviceId: string, event: LegacyPluginEvent): Promise<DeviceCommandItem> {
    return this.mutate(commandId, async (item) => {
      if (archiveExpiredDeviceCompletion(item, deviceId, event, this.now())) await this.write(item);
      return item;
    });
  }

  async renew(commandId: string, deviceId: string, leaseSeconds = 300): Promise<DeviceCommandItem> {
    const result = await this.mutate(commandId, async (item) => {
      if (item.status !== "claimed" || item.claimedBy !== deviceId) throw new Error("设备命令未由当前设备领取");
      if (item.stopRequestedAt) throw new Error("设备命令正在停止，不能续租");
      const timestamp = this.now();
      if (deviceCommandExecutionExpired(item, timestamp)) {
        markExpired(item, timestamp);
        await this.write(item);
        return { item, timedOut: true };
      }
      const seconds = Math.min(Math.max(leaseSeconds, 30), 300);
      item.leaseExpiresAt = new Date(Math.min(timestamp.getTime() + seconds * 1000, Date.parse(item.executionExpiresAt ?? item.command.expiresAt))).toISOString();
      this.refreshLeaseRecoveryDeadline(item);
      await this.write(item);
      return { item, timedOut: false };
    });
    if (result.timedOut) throw new DeviceCommandExpiredError();
    return result.item;
  }

  async expire(commandId: string): Promise<DeviceCommandItem> {
    return this.mutate(commandId, async (item) => {
      if (!terminal.has(item.status)) { markExpired(item, this.now()); await this.write(item); }
      return item;
    });
  }

  async get(commandId: string): Promise<DeviceCommandItem | null> {
    return (await this.database.query<{ data: DeviceCommandItem }>("SELECT data FROM recruiting_gateway.commands WHERE command_id=$1", [commandId])).rows[0]?.data ?? null;
  }

  async cancelQueued(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<boolean> {
    return this.mutate(commandId, async (item) => {
      if (item.tenantId !== tenantId || item.userId !== userId || item.targetDeviceId !== deviceId) throw new Error("停止命令归属不匹配");
      item.stopRequestedAt ??= this.now().toISOString();
      const cancelledBeforeClaim = item.status === "queued" || (item.status === "cancelled" && item.claimedAt === null);
      if (item.status === "queued") {
        item.status = "cancelled";
        item.completedAt = this.now().toISOString();
        item.leaseExpiresAt = null;
      }
      await this.write(item);
      return cancelledBeforeClaim;
    });
  }

  async acknowledgeStopped(commandId: string, tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem> {
    return this.mutate(commandId, async (item) => {
      if (item.tenantId !== tenantId || item.userId !== userId || item.targetDeviceId !== deviceId) throw new Error("停止命令归属不匹配");
      item.stopAcknowledgedAt ??= this.now().toISOString();
      if (item.status === "queued" || item.status === "claimed") {
        item.status = "cancelled";
        item.completedAt = this.now().toISOString();
        item.leaseExpiresAt = null;
      }
      await this.write(item);
      return item;
    });
  }

  async cancelOwner(tenantId: string, userId: string): Promise<number> {
    return this.database.transaction(gatewayOwnerKey(tenantId, userId), async () => {
      const rows = await this.database.query<{ data: DeviceCommandItem }>("SELECT data FROM recruiting_gateway.commands WHERE tenant_id=$1 AND user_id=$2 AND status IN ('queued','claimed')", [tenantId, userId]);
      for (const { data: item } of rows.rows) {
        item.status = "cancelled";
        item.completedAt = this.now().toISOString();
        item.leaseExpiresAt = null;
        await this.write(item);
      }
      return rows.rows.length;
    });
  }

  async listByDevice(tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem[]> {
    return (await this.database.query<{ data: DeviceCommandItem }>("SELECT data FROM recruiting_gateway.commands WHERE tenant_id=$1 AND user_id=$2 AND device_id=$3 ORDER BY created_at,command_id", [tenantId, userId, deviceId])).rows.map((row) => row.data);
  }

  async listActiveByDevice(tenantId: string, userId: string, deviceId: string): Promise<DeviceCommandItem[]> {
    return (await this.database.query<{ data: DeviceCommandItem }>("SELECT data FROM recruiting_gateway.commands WHERE tenant_id=$1 AND user_id=$2 AND device_id=$3 AND status IN ('queued','claimed') ORDER BY created_at,command_id", [tenantId, userId, deviceId])).rows.map((row) => row.data);
  }

  async listExpired(limit = 100): Promise<DeviceCommandItem[]> {
    return (await this.database.query<{ data: DeviceCommandItem }>("SELECT data FROM recruiting_gateway.commands WHERE command_type='browser.execute_batch_auto_apply_job' AND status IN ('queued','claimed') AND deadline_at <= $1 ORDER BY deadline_at,command_id LIMIT $2", [this.now().toISOString(), Math.min(Math.max(Math.floor(limit), 1), 1000)])).rows.map((row) => row.data);
  }
}
