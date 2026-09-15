import { randomUUID } from "node:crypto";
import type { AutoApplyBatch } from "./auto-apply-contract.js";
import { gatewayOwnerKey, PgGatewayDatabase } from "./postgres-database.js";

export interface PgCallbackOutboxItem {
  id: string;
  batch: AutoApplyBatch;
  leaseToken: string;
  attempts: number;
}

export class PgCallbackOutboxRepository {
  constructor(private readonly database: PgGatewayDatabase) {}

  async enqueue(batch: AutoApplyBatch): Promise<void> {
    await this.database.transaction(gatewayOwnerKey(batch.tenantId, batch.userId), async () => {
      await this.database.query(`INSERT INTO recruiting_gateway.callback_outbox (id,tenant_id,user_id,batch_id,data)
        VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (id) DO NOTHING`,
        [`${batch.batchId}:${batch.revision}`, batch.tenantId, batch.userId, batch.batchId, JSON.stringify(batch)]);
    });
  }

  async claim(limit = 20, leaseSeconds = 60): Promise<PgCallbackOutboxItem[]> {
    const leaseToken = randomUUID();
    const result = await this.database.query<{ id: string; data: AutoApplyBatch; lease_token: string; attempts: number }>(`
      WITH exhausted AS (
        UPDATE recruiting_gateway.callback_outbox SET status='failed',lease_token=NULL,lease_expires_at=NULL,
          last_error=COALESCE(last_error,'callback_worker_lease_expired')
        WHERE attempts>=20 AND ((status='delivering' AND lease_expires_at<=now()) OR status='pending') RETURNING id
      ), ready AS (
        SELECT id FROM recruiting_gateway.callback_outbox
        WHERE attempts<20 AND ((status='pending' AND available_at<=now()) OR (status='delivering' AND lease_expires_at<=now()))
        ORDER BY available_at,created_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
      ) UPDATE recruiting_gateway.callback_outbox o SET status='delivering',attempts=o.attempts+1,
        lease_token=$2,lease_expires_at=now()+($3::integer*interval '1 second')
      FROM ready WHERE o.id=ready.id RETURNING o.id,o.data,o.lease_token,o.attempts`,
      [Math.min(Math.max(Math.floor(limit), 1), 100), leaseToken, Math.min(Math.max(leaseSeconds, 10), 300)]);
    return result.rows.map((row) => ({ id: row.id, batch: row.data, leaseToken: row.lease_token, attempts: row.attempts }));
  }

  async complete(id: string, leaseToken: string): Promise<boolean> {
    return Boolean((await this.database.query(`UPDATE recruiting_gateway.callback_outbox SET status='delivered',
      lease_token=NULL,lease_expires_at=NULL,last_error=NULL
      WHERE id=$1 AND lease_token=$2 AND status='delivering' AND lease_expires_at>clock_timestamp()`, [id, leaseToken])).rowCount);
  }

  async retry(id: string, leaseToken: string, error: string, delaySeconds = 30): Promise<boolean> {
    return Boolean((await this.database.query(`UPDATE recruiting_gateway.callback_outbox SET status=CASE WHEN attempts>=20 THEN 'failed' ELSE 'pending' END,
      lease_token=NULL,lease_expires_at=NULL,last_error=$3,available_at=now()+($4::integer*interval '1 second')
      WHERE id=$1 AND lease_token=$2 AND status='delivering' AND lease_expires_at>clock_timestamp()`,
      [id, leaseToken, error.slice(0, 500), Math.min(Math.max(delaySeconds, 1), 3600)])).rowCount);
  }
}
