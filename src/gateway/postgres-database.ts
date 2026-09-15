import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

interface TransactionContext {
  client: PoolClient;
  locks: Set<string>;
}

export interface PgGatewayDatabaseOptions {
  maxConnections?: number;
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
  idleTransactionTimeoutMs?: number;
}

export function gatewayOwnerKey(tenantId: string, userId: string): string {
  return `${tenantId}\u0000${userId}`;
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value!), 1), maximum) : fallback;
}

/** A request's repositories share one connection and commit or roll back together. */
export class PgGatewayDatabase {
  readonly pool: Pool;
  private readonly context = new AsyncLocalStorage<TransactionContext>();
  private readonly lockTimeoutMs: number;
  private readonly statementTimeoutMs: number;
  private readonly idleTransactionTimeoutMs: number;
  private readonly observedErrors = new WeakSet<object>();
  private readonly errorCounts = new Map<string, number>();

  constructor(config: string | PoolConfig, options: PgGatewayDatabaseOptions = {}) {
    const connection = typeof config === "string" ? { connectionString: config } : config;
    this.lockTimeoutMs = bounded(options.lockTimeoutMs, 3_000, 30_000);
    this.statementTimeoutMs = bounded(options.statementTimeoutMs, 10_000, 60_000);
    this.idleTransactionTimeoutMs = bounded(options.idleTransactionTimeoutMs, 15_000, 60_000);
    this.pool = new Pool({
      ...connection,
      max: bounded(options.maxConnections ?? connection.max, 12, 64),
      connectionTimeoutMillis: connection.connectionTimeoutMillis ?? 5_000,
      idleTimeoutMillis: connection.idleTimeoutMillis ?? 30_000,
      statement_timeout: this.statementTimeoutMs,
      application_name: connection.application_name ?? "recruiting-gateway"
    });
    // Idle connection errors must not crash an otherwise healthy gateway replica.
    this.pool.on("error", (error) => this.recordError(error, "connection"));
  }

  private recordError(error: unknown, operation: "query" | "transaction" | "connect" | "connection"): void {
    if (error && typeof error === "object") {
      if (this.observedErrors.has(error)) return;
      this.observedErrors.add(error);
    }
    const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const states = new Set(["55P03", "57014", "40P01", "40001", "08000", "08003", "08006", "57P01", "57P02", "57P03", "23505", "23503", "23502", "23514", "42501", "42P01", "42703", "42601", "53300", "22000", "22P02", "22001", "22003"]);
    if (operation === "transaction" && !states.has(raw) && !["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE"].includes(raw)) return;
    const code = states.has(raw) ? raw
      : operation === "connection" || ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE"].includes(raw) ? "CONNECTION_ERROR"
      : operation === "connect" ? "POOL_CONNECT_TIMEOUT" : "CONNECTION_ERROR";
    this.errorCounts.set(code, (this.errorCounts.get(code) ?? 0) + 1);
    // Never log Error.message, query, parameters or connection URLs.
    console.error("[GatewayStorage]", operation, code);
  }

  storageErrorCounts(): Record<string, number> { return Object.fromEntries(this.errorCounts); }

  private async connect(): Promise<PoolClient> {
    try { return await this.pool.connect(); }
    catch (error) { this.recordError(error, "connect"); throw error; }
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, parameters: unknown[] = []): Promise<QueryResult<T>> {
    const transactionClient = this.context.getStore()?.client;
    const client = transactionClient ?? await this.connect();
    try { return await client.query<T>(sql, parameters); }
    catch (error) { this.recordError(error, "query"); throw error; }
    finally { if (!transactionClient) client.release(); }
  }

  private async lock(context: TransactionContext, key: string): Promise<void> {
    const digest = createHash("sha256").update(key).digest().readBigInt64BE().toString();
    if (context.locks.has(digest)) return;
    await context.client.query("SELECT pg_advisory_xact_lock($1::bigint)", [digest]);
    context.locks.add(digest);
  }

  async transaction<T>(ownerKey: string, work: () => Promise<T>): Promise<T> {
    const current = this.context.getStore();
    if (current) {
      await this.lock(current, ownerKey);
      return work();
    }
    const client = await this.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true), set_config('idle_in_transaction_session_timeout', $3, true)",
        [String(this.lockTimeoutMs), String(this.statementTimeoutMs), String(this.idleTransactionTimeoutMs)]);
      const context: TransactionContext = { client, locks: new Set() };
      return await this.context.run(context, async () => {
        await this.lock(context, ownerKey);
        const result = await work();
        await client.query("COMMIT");
        return result;
      });
    } catch (error) {
      this.recordError(error, "transaction");
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate(): Promise<void> {
    await this.transaction("recruiting-gateway:schema-migration", async () => {
      await this.query(`
        CREATE SCHEMA IF NOT EXISTS recruiting_gateway;
        CREATE TABLE IF NOT EXISTS recruiting_gateway.schema_migrations (
          version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      const applied = await this.query("SELECT 1 FROM recruiting_gateway.schema_migrations WHERE version = $1", [1]);
      if (!applied.rowCount) await this.query(`
        CREATE TABLE recruiting_gateway.batches (
          batch_id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
          device_id text NOT NULL, idempotency_key text NOT NULL, status text NOT NULL,
          revision integer NOT NULL, created_at timestamptz NOT NULL, scheduling_touched_at timestamptz, data jsonb NOT NULL,
          UNIQUE (tenant_id, user_id, idempotency_key)
        );
        CREATE INDEX batches_owner_idx ON recruiting_gateway.batches (tenant_id, user_id, created_at, batch_id);
        CREATE INDEX batches_active_idx ON recruiting_gateway.batches (created_at, batch_id)
          WHERE status NOT IN ('completed', 'completed_with_errors', 'cancelled', 'failed');
        CREATE TABLE recruiting_gateway.commands (
          command_id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
          device_id text NOT NULL, command_type text NOT NULL, status text NOT NULL,
          created_at timestamptz NOT NULL, deadline_at timestamptz NOT NULL,
          lease_expires_at timestamptz, data jsonb NOT NULL
        );
        CREATE INDEX commands_device_idx ON recruiting_gateway.commands (tenant_id, user_id, device_id, created_at, command_id);
        CREATE INDEX commands_expiry_idx ON recruiting_gateway.commands (deadline_at, command_id) WHERE status IN ('queued', 'claimed');
        CREATE UNIQUE INDEX commands_device_execution_idx ON recruiting_gateway.commands (tenant_id, user_id, device_id)
          WHERE status = 'claimed' AND command_type = 'browser.execute_batch_auto_apply_job';
        CREATE TABLE recruiting_gateway.devices (
          tenant_id text NOT NULL, user_id text NOT NULL, device_id text NOT NULL, data jsonb NOT NULL,
          PRIMARY KEY (tenant_id, user_id, device_id)
        );
        CREATE TABLE recruiting_gateway.pairing_sessions (
          pairing_id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
          code_hash text NOT NULL UNIQUE, consumed_at timestamptz, data jsonb NOT NULL
        );
        CREATE INDEX pairing_sessions_owner_idx ON recruiting_gateway.pairing_sessions (tenant_id, user_id);
        CREATE TABLE recruiting_gateway.bootstrap_sessions (
          bootstrap_id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
          token_hash text NOT NULL UNIQUE, consumed_at timestamptz, data jsonb NOT NULL
        );
        CREATE INDEX bootstrap_sessions_owner_idx ON recruiting_gateway.bootstrap_sessions (tenant_id, user_id);
        CREATE TABLE recruiting_gateway.credentials (
          credential_id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
          device_id text NOT NULL, token_hash text NOT NULL UNIQUE, revoked_at timestamptz, data jsonb NOT NULL,
          UNIQUE (tenant_id, device_id)
        );
        CREATE INDEX credentials_owner_idx ON recruiting_gateway.credentials (tenant_id, user_id);
        CREATE TABLE recruiting_gateway.runs (
          run_id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
          idempotency_key text NOT NULL, status text NOT NULL, revision integer NOT NULL,
          data jsonb NOT NULL, UNIQUE (tenant_id, idempotency_key)
        );
        CREATE TABLE recruiting_gateway.executor_states (run_id text PRIMARY KEY, data jsonb NOT NULL);
        CREATE TABLE recruiting_gateway.owner_fences (
          tenant_id text NOT NULL, user_id text NOT NULL, terminated_at timestamptz NOT NULL,
          PRIMARY KEY (tenant_id, user_id)
        );
        CREATE TABLE recruiting_gateway.callback_outbox (
          id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL, batch_id text NOT NULL,
          status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
          available_at timestamptz NOT NULL DEFAULT now(), lease_token text, lease_expires_at timestamptz,
          last_error text, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX callback_outbox_ready_idx ON recruiting_gateway.callback_outbox (available_at, created_at)
          WHERE status IN ('pending', 'delivering');
        CREATE INDEX callback_outbox_owner_idx ON recruiting_gateway.callback_outbox (tenant_id, user_id);
        INSERT INTO recruiting_gateway.schema_migrations (version) VALUES (1);
      `);
      const checkpointVersion = await this.query("SELECT 1 FROM recruiting_gateway.schema_migrations WHERE version=$1", [2]);
      if (!checkpointVersion.rowCount) await this.query(`
        CREATE TABLE recruiting_gateway.json_migration_checkpoints (
          source_hash text PRIMARY KEY, report jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO recruiting_gateway.schema_migrations (version) VALUES (2);
      `);
      const visionVersion = await this.query("SELECT 1 FROM recruiting_gateway.schema_migrations WHERE version=$1", [3]);
      if (!visionVersion.rowCount) await this.query(`
        CREATE TABLE recruiting_gateway.vision_sessions (
          session_id text PRIMARY KEY,tenant_id text NOT NULL,user_id text NOT NULL,device_id text NOT NULL,
          expires_at timestamptz NOT NULL,data jsonb NOT NULL
        );
        CREATE INDEX vision_sessions_owner_idx ON recruiting_gateway.vision_sessions (tenant_id,user_id,device_id);
        CREATE INDEX vision_sessions_expiry_idx ON recruiting_gateway.vision_sessions (expires_at);
        INSERT INTO recruiting_gateway.schema_migrations (version) VALUES (3);
      `);
    });
  }

  async close(): Promise<void> { await this.pool.end(); }
}
