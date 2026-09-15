import { canRebindDeferredMissingInformationBatch, type AutoApplyBatchRepository } from "./auto-apply-service.js";
import type { AutoApplyBatch, AutoApplyCallbackDelivery } from "./auto-apply-contract.js";
import { applicationRunSchema, type ApplicationRun } from "./application-contract.js";
import type { ApplicationRunRepository } from "./application-gateway.js";
import type { DeviceRegistration, DeviceRegistry, RegisterDeviceInput } from "./device-registry.js";
import { IdempotencyConflictError } from "./gateway-errors.js";
import { gatewayOwnerKey, PgGatewayDatabase } from "./postgres-database.js";

export class PgAutoApplyBatchRepository implements AutoApplyBatchRepository {
  constructor(private readonly database: PgGatewayDatabase) {}

  async save(batch: AutoApplyBatch): Promise<AutoApplyBatch> {
    return this.database.transaction(gatewayOwnerKey(batch.tenantId, batch.userId), async () => {
      const existing = await this.get(batch.batchId);
      if (existing && existing.deviceId !== batch.deviceId &&
        (!canRebindDeferredMissingInformationBatch(existing) || batch.revision <= existing.revision)) {
        throw new IdempotencyConflictError();
      }
      const result = await this.database.query(`INSERT INTO recruiting_gateway.batches
        (batch_id, tenant_id, user_id, device_id, idempotency_key, status, revision, created_at, data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
        ON CONFLICT (batch_id) DO UPDATE SET device_id=EXCLUDED.device_id, status=EXCLUDED.status, revision=EXCLUDED.revision, data=EXCLUDED.data
        WHERE batches.tenant_id=EXCLUDED.tenant_id AND batches.user_id=EXCLUDED.user_id
          AND batches.idempotency_key=EXCLUDED.idempotency_key
          AND batches.revision <= EXCLUDED.revision`,
        [batch.batchId, batch.tenantId, batch.userId, batch.deviceId, batch.idempotencyKey,
          batch.status, batch.revision, batch.createdAt, JSON.stringify(batch)]);
      if (!result.rowCount) throw new IdempotencyConflictError();
      return structuredClone(batch);
    });
  }

  async get(batchId: string): Promise<AutoApplyBatch | null> {
    return (await this.database.query<{ data: AutoApplyBatch }>("SELECT data FROM recruiting_gateway.batches WHERE batch_id=$1", [batchId])).rows[0]?.data ?? null;
  }

  async findByIdempotencyKey(tenantId: string, userId: string, key: string): Promise<AutoApplyBatch | null> {
    return (await this.database.query<{ data: AutoApplyBatch }>(
      "SELECT data FROM recruiting_gateway.batches WHERE tenant_id=$1 AND user_id=$2 AND idempotency_key=$3", [tenantId, userId, key])).rows[0]?.data ?? null;
  }

  async listByOwner(tenantId: string, userId: string): Promise<AutoApplyBatch[]> {
    return (await this.database.query<{ data: AutoApplyBatch }>(
      "SELECT data FROM recruiting_gateway.batches WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at, batch_id", [tenantId, userId])).rows.map((row) => row.data);
  }

  async listNonTerminal(owner?: { tenantId: string; userId: string; deviceId?: string }): Promise<AutoApplyBatch[]> {
    const parameters: unknown[] = [];
    let filter = "";
    if (owner) {
      parameters.push(owner.tenantId, owner.userId);
      filter = " AND tenant_id=$1 AND user_id=$2";
      if (owner.deviceId) { parameters.push(owner.deviceId); filter += " AND device_id=$3"; }
    }
    return (await this.database.query<{ data: AutoApplyBatch }>(
      `SELECT data FROM recruiting_gateway.batches WHERE status NOT IN ('completed','completed_with_errors','cancelled','failed')${filter} ORDER BY created_at, batch_id`, parameters)).rows.map((row) => row.data);
  }

  async updateCallbackDelivery(batchId: string, delivery: AutoApplyCallbackDelivery, expectedRevision?: number): Promise<void> {
    const batch = await this.get(batchId);
    if (!batch) return;
    await this.database.transaction(gatewayOwnerKey(batch.tenantId, batch.userId), async () => {
      await this.database.query(`UPDATE recruiting_gateway.batches SET data=jsonb_set(data,'{callbackDelivery}',$2::jsonb)
        WHERE batch_id=$1 AND ($3::integer IS NULL OR revision=$3)`, [batchId, JSON.stringify(delivery), expectedRevision ?? null]);
    });
  }

  async listSchedulingOwners(limit = 100): Promise<Array<{ tenantId: string; userId: string; deviceId: string }>> {
    // Rotate visited owners even if blocked; an old offline owner cannot starve the next page.
    return this.database.transaction("recruiting-gateway:scheduling-owners", async () => {
      const rows = await this.database.query<{ tenantId: string; userId: string; deviceId: string }>(`
        SELECT tenant_id AS "tenantId",user_id AS "userId",device_id AS "deviceId"
        FROM recruiting_gateway.batches WHERE status NOT IN ('completed','completed_with_errors','cancelled','failed')
        GROUP BY tenant_id,user_id,device_id
        ORDER BY min(COALESCE(scheduling_touched_at,'epoch'::timestamptz)),min(created_at),tenant_id,user_id,device_id LIMIT $1`,
        [Math.min(Math.max(Math.floor(limit), 1), 1000)]);
      if (rows.rows.length) await this.database.query(`UPDATE recruiting_gateway.batches b SET scheduling_touched_at=now()
        FROM jsonb_to_recordset($1::jsonb) AS owners("tenantId" text,"userId" text,"deviceId" text)
        WHERE b.tenant_id=owners."tenantId" AND b.user_id=owners."userId" AND b.device_id=owners."deviceId"
          AND b.status NOT IN ('completed','completed_with_errors','cancelled','failed')`, [JSON.stringify(rows.rows)]);
      return rows.rows;
    });
  }
}

export class PgDeviceRegistry implements DeviceRegistry {
  constructor(private readonly database: PgGatewayDatabase, private readonly now: () => Date = () => new Date()) {}

  async register(input: RegisterDeviceInput): Promise<DeviceRegistration> {
    return this.database.transaction(gatewayOwnerKey(input.tenantId, input.userId), async () => {
      const previous = await this.get(input.tenantId, input.userId, input.deviceId);
      const timestamp = this.now().toISOString();
      const device: DeviceRegistration = {
        schemaVersion: "paired-device.v1", tenantId: input.tenantId, userId: input.userId, deviceId: input.deviceId,
        deviceName: input.deviceName || previous?.deviceName || input.deviceId,
        runtimeVersion: input.runtimeVersion ?? previous?.runtimeVersion ?? null,
        pluginInstalled: input.pluginInstalled ?? previous?.pluginInstalled ?? false,
        pluginVersion: input.pluginVersion ?? previous?.pluginVersion ?? null,
        registeredAt: previous?.registeredAt || timestamp, lastSeenAt: timestamp,
        capabilities: input.capabilities ?? previous?.capabilities ?? []
      };
      await this.importDevice(device);
      return device;
    });
  }

  /** Migration preserves original registration and heartbeat timestamps. */
  async importDevice(device: DeviceRegistration): Promise<void> {
    await this.database.query(`INSERT INTO recruiting_gateway.devices (tenant_id,user_id,device_id,data)
      VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (tenant_id,user_id,device_id) DO UPDATE SET data=EXCLUDED.data`,
      [device.tenantId, device.userId, device.deviceId, JSON.stringify(device)]);
  }

  async list(tenantId: string, userId: string): Promise<DeviceRegistration[]> {
    return (await this.database.query<{ data: DeviceRegistration }>(
      "SELECT data FROM recruiting_gateway.devices WHERE tenant_id=$1 AND user_id=$2 ORDER BY device_id", [tenantId, userId])).rows.map((row) => row.data);
  }

  async get(tenantId: string, userId: string, deviceId: string): Promise<DeviceRegistration | null> {
    return (await this.database.query<{ data: DeviceRegistration }>(
      "SELECT data FROM recruiting_gateway.devices WHERE tenant_id=$1 AND user_id=$2 AND device_id=$3", [tenantId, userId, deviceId])).rows[0]?.data ?? null;
  }

  async removeOwner(tenantId: string, userId: string): Promise<number> {
    return this.database.transaction(gatewayOwnerKey(tenantId, userId), async () =>
      (await this.database.query("DELETE FROM recruiting_gateway.devices WHERE tenant_id=$1 AND user_id=$2", [tenantId, userId])).rowCount ?? 0);
  }
}

export class PgApplicationRunRepository implements ApplicationRunRepository {
  constructor(private readonly database: PgGatewayDatabase) {}

  async save(run: ApplicationRun): Promise<ApplicationRun> {
    const parsed = applicationRunSchema.parse(run);
    return this.database.transaction(gatewayOwnerKey(parsed.request.tenantId, parsed.request.userId), async () => {
      const result = await this.database.query(`INSERT INTO recruiting_gateway.runs
        (run_id,tenant_id,user_id,idempotency_key,status,revision,data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT (run_id) DO UPDATE SET status=EXCLUDED.status,revision=EXCLUDED.revision,data=EXCLUDED.data
        WHERE runs.tenant_id=EXCLUDED.tenant_id AND runs.user_id=EXCLUDED.user_id
          AND runs.idempotency_key=EXCLUDED.idempotency_key AND runs.revision <= EXCLUDED.revision`,
        [parsed.runId, parsed.request.tenantId, parsed.request.userId, parsed.request.idempotencyKey,
          parsed.status, parsed.revision, JSON.stringify(parsed)]);
      if (!result.rowCount) throw new IdempotencyConflictError();
      return parsed;
    });
  }

  async get(runId: string): Promise<ApplicationRun | null> {
    const row = (await this.database.query<{ data: ApplicationRun }>("SELECT data FROM recruiting_gateway.runs WHERE run_id=$1", [runId])).rows[0];
    return row ? applicationRunSchema.parse(row.data) : null;
  }

  async findByIdempotencyKey(tenantId: string, key: string): Promise<ApplicationRun | null> {
    const row = (await this.database.query<{ data: ApplicationRun }>(
      "SELECT data FROM recruiting_gateway.runs WHERE tenant_id=$1 AND idempotency_key=$2", [tenantId, key])).rows[0];
    return row ? applicationRunSchema.parse(row.data) : null;
  }

  async getExecutorState(runId: string): Promise<Record<string, unknown>> {
    return (await this.database.query<{ data: Record<string, unknown> }>("SELECT data FROM recruiting_gateway.executor_states WHERE run_id=$1", [runId])).rows[0]?.data ?? {};
  }

  async saveExecutorState(runId: string, state: Record<string, unknown>): Promise<void> {
    await this.database.query(`INSERT INTO recruiting_gateway.executor_states (run_id,data) VALUES ($1,$2::jsonb)
      ON CONFLICT (run_id) DO UPDATE SET data=EXCLUDED.data`, [runId, JSON.stringify(state)]);
  }
}

export class PgOwnerFenceRepository {
  constructor(private readonly database: PgGatewayDatabase) {}

  async isTerminated(tenantId: string, userId: string): Promise<boolean> {
    return Boolean((await this.database.query("SELECT 1 FROM recruiting_gateway.owner_fences WHERE tenant_id=$1 AND user_id=$2", [tenantId, userId])).rowCount);
  }

  async terminate(tenantId: string, userId: string): Promise<void> {
    await this.database.transaction(gatewayOwnerKey(tenantId, userId), async () => {
      await this.database.query(`INSERT INTO recruiting_gateway.owner_fences (tenant_id,user_id,terminated_at) VALUES ($1,$2,now())
        ON CONFLICT (tenant_id,user_id) DO UPDATE SET terminated_at=EXCLUDED.terminated_at`, [tenantId, userId]);
    });
  }

  async clear(tenantId: string, userId: string): Promise<void> {
    await this.database.transaction(gatewayOwnerKey(tenantId, userId), async () => {
      await this.database.query("DELETE FROM recruiting_gateway.owner_fences WHERE tenant_id=$1 AND user_id=$2", [tenantId, userId]);
    });
  }
}
