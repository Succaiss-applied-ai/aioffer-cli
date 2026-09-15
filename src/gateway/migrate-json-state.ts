import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { applicationRunSchema } from "./application-contract.js";
import { deviceCommandExecutionExpired, deviceCommandExpired, type DeviceCommandItem } from "./device-command-queue.js";
import type { PgGatewayDatabase } from "./postgres-database.js";

type JsonRecord = Record<string, unknown>;
const maximumFileBytes = 256 * 1024 * 1024;
const maximumSourceBytes = 512 * 1024 * 1024;
const maximumRows = 200_000;
const sources = {
  "auto-apply-batches.json": "auto-apply-batch-store.v1",
  "device-commands.json": "device-command-store.v1",
  "paired-devices.json": "paired-device-store.v1",
  "device-auth.json": "device-auth-store.v1",
  "application-runs.json": "application-gateway-run-store.v1"
} as const;

type SourceName = keyof typeof sources;
export interface JsonGatewayMigrationReport {
  format: "gateway-json-migration-report.v1";
  mode: "dry_run" | "applied" | "already_migrated";
  sourceHash: string;
  sources: Record<SourceName, { present: boolean; bytes: number; sha256: string | null }>;
  tables: Record<string, { count: number; sha256: string }>;
  changedCommandIds: string[];
  verified: boolean;
}

function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as JsonRecord)[key])}`).join(",")}}`;
}

function object(value: unknown, location: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid object at ${location}`);
  return value as JsonRecord;
}

function text(record: JsonRecord, key: string, location: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim() || value.includes("\u0000")) throw new Error(`Invalid ${key} at ${location}`);
  return value;
}

function timestamp(record: JsonRecord, key: string, location: string, nullable = false): void {
  if (nullable && (record[key] === null || record[key] === undefined)) return;
  if (!Number.isFinite(Date.parse(text(record, key, location)))) throw new Error(`Invalid ${key} at ${location}`);
}

function records(store: JsonRecord | null, key: string, location: string, optional = false): JsonRecord[] {
  if (!store) return [];
  const value = store[key];
  if (optional && value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumRows) throw new Error(`Invalid or oversized ${key} at ${location}`);
  return value.map((item, index) => object(item, `${location}.${key}[${index}]`));
}

function ownership(record: JsonRecord, location: string): void {
  text(record, "tenantId", location); text(record, "userId", location);
}

function hashField(record: JsonRecord, key: string, location: string): void {
  if (!/^[a-f0-9]{64}$/i.test(text(record, key, location))) throw new Error(`Invalid ${key} at ${location}`);
}

async function loadSource(sourceDir: string, name: SourceName) {
  let file;
  try { file = await open(join(sourceDir, name), constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { data: null, metadata: { present: false, bytes: 0, sha256: null } };
    throw new Error(`Cannot open migration source ${name}`);
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maximumFileBytes) throw new Error(`Migration source ${name} exceeds the regular-file size limit`);
    const buffer = await file.readFile();
    if (buffer.length !== stat.size || buffer.length > maximumFileBytes) throw new Error(`Migration source ${name} changed while reading`);
    let parsed: unknown;
    try { parsed = JSON.parse(buffer.toString("utf8")); }
    catch { throw new Error(`Invalid JSON in migration source ${name}`); }
    const data = object(parsed, name);
    if (data.schemaVersion !== sources[name]) throw new Error(`Unsupported schema in migration source ${name}`);
    return { data, metadata: { present: true, bytes: buffer.length, sha256: sha256(buffer) } };
  } finally { await file.close(); }
}

interface TableData {
  name: string;
  rows: JsonRecord[];
  id: (row: JsonRecord) => string;
  columns: string;
  expressions: string;
  order: string;
  dataExpression?: string;
}

function uniqueIndex(rows: JsonRecord[], id: (row: JsonRecord) => string, label: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of rows) {
    const key = id(row);
    if (result.has(key)) throw new Error(`Duplicate identity in ${label}`);
    result.set(key, sha256(canonical(row)));
  }
  return result;
}

function digestIndex(index: Map<string, string>): string {
  return sha256(canonical([...index].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}

function collectTables(stores: Record<SourceName, JsonRecord | null>, now: Date): { tables: TableData[]; changedCommandIds: string[] } {
  const batches = records(stores["auto-apply-batches.json"], "batches", "batches");
  const callbackOutbox: JsonRecord[] = [];
  const commands = records(stores["device-commands.json"], "commands", "commands");
  const devices = records(stores["paired-devices.json"], "devices", "devices");
  const auth = stores["device-auth.json"];
  if (devices.length && !auth) throw new Error("Paired devices require the original device-auth.json source");
  const sessions = records(auth, "sessions", "auth");
  const bootstraps = records(auth, "bootstrapSessions", "auth", true);
  const credentials = records(auth, "credentials", "auth");
  const runs = records(stores["application-runs.json"], "runs", "runs");
  const states = object(stores["application-runs.json"]?.executorStates ?? {}, "executorStates");
  const executorStates = Object.entries(states).map(([runId, data]) => ({ runId, data: object(data, "executorState") }));
  if (executorStates.length > maximumRows) throw new Error("Too many executor states");
  for (const row of batches) {
    ownership(row, "batch"); text(row, "batchId", "batch"); text(row, "deviceId", "batch"); text(row, "idempotencyKey", "batch");
    if (!["queued","running","paused","completed","completed_with_errors","failed","cancelled"].includes(String(row.status))) throw new Error("Invalid batch status");
    if (row.schemaVersion !== "auto-apply-batch.v1" || !Number.isInteger(row.revision) || Number(row.revision) < 1) throw new Error("Invalid batch schema or revision");
    timestamp(row, "createdAt", "batch"); timestamp(row, "updatedAt", "batch");
    const jobs = records(row, "jobs", "batch");
    for (const job of jobs) { text(job, "batchJobId", "batch job"); text(job, "jobId", "batch job"); }
    uniqueIndex(jobs, (job) => String(job.batchJobId), "batch jobs");
    if (row.callback !== null && row.callback !== undefined) {
      const callback = object(row.callback, "batch callback");
      text(callback, "secretRef", "batch callback");
      try { new URL(text(callback, "url", "batch callback")); } catch { throw new Error("Invalid batch callback URL"); }
      const delivery = row.callbackDelivery == null ? null : object(row.callbackDelivery, "callback delivery");
      if (delivery && !["pending", "failed", "delivered"].includes(String(delivery.status))) throw new Error("Invalid callback delivery status");
      if (["completed", "completed_with_errors", "failed", "cancelled"].includes(String(row.status)) && delivery?.status !== "delivered") {
        // Historical attempts count one HTTP dispatch's internal retries, not worker delivery cycles.
        // Keep that history in the immutable snapshot and preserve the existing callback event identity.
        callbackOutbox.push({ id: `${row.batchId}:${row.revision}`, tenantId: row.tenantId, userId: row.userId,
          batchId: row.batchId, status: "pending", attempts: 0, data: row });
      }
    }
  }
  uniqueIndex(batches, (row) => JSON.stringify([row.tenantId,row.userId,row.idempotencyKey]), "batch idempotency");
  const changedCommandIds: string[] = [];
  const activeCommands: JsonRecord[] = [];
  for (const row of commands) {
    ownership(row, "command"); text(row, "commandId", "command"); text(row, "runId", "command"); text(row, "targetDeviceId", "command");
    const command = object(row.command, "command envelope");
    if (command.schemaVersion !== "ai-plugin-command.v1" || command.commandId !== row.commandId || command.tenantId !== row.tenantId || command.userId !== row.userId) throw new Error("Invalid command identity or envelope schema");
    text(command, "type", "command envelope"); timestamp(command, "expiresAt", "command envelope");
    timestamp(row, "createdAt", "command"); timestamp(row, "claimedAt", "command", true); timestamp(row, "leaseExpiresAt", "command", true); timestamp(row, "executionExpiresAt", "command", true);
    if (!["queued","claimed","completed","failed","expired","cancelled"].includes(String(row.status))) throw new Error("Invalid command status");
    if (row.status === "claimed" && (typeof row.claimedAt !== "string" || row.claimedBy !== row.targetDeviceId)) throw new Error("Invalid claimed command ownership");
    const item = row as unknown as DeviceCommandItem;
    if (["queued","claimed"].includes(item.status) && (item.claimedAt === null ? deviceCommandExpired(item.command, now) : deviceCommandExecutionExpired(item, now))) {
      item.status = "expired"; item.completedAt = now.toISOString(); item.leaseExpiresAt = null;
      changedCommandIds.push(item.commandId);
    }
    if (item.status === "claimed" && item.command.type === "browser.execute_batch_auto_apply_job") activeCommands.push(row);
  }
  uniqueIndex(activeCommands, (row) => JSON.stringify([row.tenantId,row.userId,row.targetDeviceId]), "unexpired claimed automatic device commands");
  for (const row of devices) {
    ownership(row, "device"); text(row, "deviceId", "device");
    if (row.schemaVersion !== "paired-device.v1") throw new Error("Invalid paired device schema");
    timestamp(row, "registeredAt", "device"); timestamp(row, "lastSeenAt", "device");
  }
  for (const [items, key, schema] of [[sessions,"pairingId","device-pairing-session.v1"],[bootstraps,"bootstrapId","device-bootstrap-session.v1"],[credentials,"credentialId","device-credential.v1"]] as const) {
    for (const row of items) {
      ownership(row, "auth record"); text(row, key, "auth record"); timestamp(row, "createdAt", "auth record");
      if (row.schemaVersion !== schema) throw new Error("Invalid authentication record schema");
      if (key === "credentialId") { text(row, "deviceId", "credential"); timestamp(row, "revokedAt", "credential", true); }
      else { timestamp(row, "expiresAt", "auth session"); timestamp(row, "consumedAt", "auth session", true); }
      hashField(row, key === "pairingId" ? "codeHash" : "tokenHash", "auth record");
    }
  }
  uniqueIndex(sessions, (row) => String(row.codeHash), "pairing code hashes");
  uniqueIndex(bootstraps, (row) => String(row.tokenHash), "bootstrap token hashes");
  uniqueIndex(credentials, (row) => String(row.tokenHash), "credential token hashes");
  uniqueIndex(credentials, (row) => JSON.stringify([row.tenantId,row.deviceId]), "credential devices");
  for (const row of runs) {
    // Validation must not replace the original object: legacy unknown fields remain lossless.
    try { applicationRunSchema.parse(row); } catch { throw new Error("Invalid application run schema"); }
  }
  uniqueIndex(runs, (row) => JSON.stringify([(row.request as JsonRecord).tenantId,(row.request as JsonRecord).idempotencyKey]), "run idempotency");
  const stringId = (key: string) => (row: JsonRecord) => text(row,key,"row");
  return { changedCommandIds: changedCommandIds.sort(), tables: [
    { name:"batches",rows:batches,id:stringId("batchId"),columns:"batch_id,tenant_id,user_id,device_id,idempotency_key,status,revision,created_at,data",expressions:"value->>'batchId',value->>'tenantId',value->>'userId',value->>'deviceId',value->>'idempotencyKey',value->>'status',(value->>'revision')::integer,(value->>'createdAt')::timestamptz,value",order:"batch_id" },
    { name:"commands",rows:commands,id:stringId("commandId"),columns:"command_id,tenant_id,user_id,device_id,command_type,status,created_at,deadline_at,lease_expires_at,data",expressions:"value->>'commandId',value->>'tenantId',value->>'userId',value->>'targetDeviceId',value->'command'->>'type',value->>'status',(value->>'createdAt')::timestamptz,(CASE WHEN value->>'claimedAt' IS NULL THEN value->'command'->>'expiresAt' ELSE COALESCE(value->>'executionExpiresAt',value->'command'->>'expiresAt') END)::timestamptz,(value->>'leaseExpiresAt')::timestamptz,value",order:"command_id" },
    { name:"devices",rows:devices,id:(row)=>JSON.stringify([row.tenantId,row.userId,row.deviceId]),columns:"tenant_id,user_id,device_id,data",expressions:"value->>'tenantId',value->>'userId',value->>'deviceId',value",order:"tenant_id,user_id,device_id" },
    { name:"pairing_sessions",rows:sessions,id:stringId("pairingId"),columns:"pairing_id,tenant_id,user_id,code_hash,consumed_at,data",expressions:"value->>'pairingId',value->>'tenantId',value->>'userId',value->>'codeHash',(value->>'consumedAt')::timestamptz,value",order:"pairing_id" },
    { name:"bootstrap_sessions",rows:bootstraps,id:stringId("bootstrapId"),columns:"bootstrap_id,tenant_id,user_id,token_hash,consumed_at,data",expressions:"value->>'bootstrapId',value->>'tenantId',value->>'userId',value->>'tokenHash',(value->>'consumedAt')::timestamptz,value",order:"bootstrap_id" },
    { name:"credentials",rows:credentials,id:stringId("credentialId"),columns:"credential_id,tenant_id,user_id,device_id,token_hash,revoked_at,data",expressions:"value->>'credentialId',value->>'tenantId',value->>'userId',value->>'deviceId',value->>'tokenHash',(value->>'revokedAt')::timestamptz,value",order:"credential_id" },
    { name:"runs",rows:runs,id:stringId("runId"),columns:"run_id,tenant_id,user_id,idempotency_key,status,revision,data",expressions:"value->>'runId',value->'request'->>'tenantId',value->'request'->>'userId',value->'request'->>'idempotencyKey',value->>'status',(value->>'revision')::integer,value",order:"run_id" },
    { name:"executor_states",rows:executorStates,id:stringId("runId"),columns:"run_id,data",expressions:"value->>'runId',value->'data'",order:"run_id",dataExpression:"jsonb_build_object('runId',run_id,'data',data)" },
    { name:"callback_outbox",rows:callbackOutbox,id:stringId("id"),columns:"id,tenant_id,user_id,batch_id,status,attempts,data",expressions:"value->>'id',value->>'tenantId',value->>'userId',value->>'batchId',value->>'status',(value->>'attempts')::integer,value->'data'",order:"id",dataExpression:"jsonb_build_object('id',id,'tenantId',tenant_id,'userId',user_id,'batchId',batch_id,'status',status,'attempts',attempts,'data',data)" }
  ] };
}

export async function migrateJsonGatewayState(database: PgGatewayDatabase, sourceDir: string, options: { apply: boolean }): Promise<JsonGatewayMigrationReport> {
  const stores = {} as Record<SourceName, JsonRecord | null>;
  const metadata = {} as JsonGatewayMigrationReport["sources"];
  let totalBytes = 0;
  for (const name of Object.keys(sources) as SourceName[]) {
    const loaded = await loadSource(sourceDir, name);
    stores[name] = loaded.data; metadata[name] = loaded.metadata;
    totalBytes += loaded.metadata.bytes;
    if (totalBytes > maximumSourceBytes) throw new Error("Migration source files exceed the combined size limit");
  }
  for (const name of ["auto-apply-batches.json", "device-commands.json", "paired-devices.json", "device-auth.json"] as const) {
    if (!metadata[name].present) throw new Error(`Required migration source is missing: ${name}`);
  }
  const { tables, changedCommandIds } = collectTables(stores, new Date());
  const expected = new Map(tables.map((table) => [table.name, uniqueIndex(table.rows, table.id, table.name)]));
  const report: JsonGatewayMigrationReport = {
    format:"gateway-json-migration-report.v1", mode:"dry_run", sourceHash:sha256(canonical(metadata)), sources:metadata,
    tables:Object.fromEntries(tables.map((table) => [table.name,{ count:table.rows.length,sha256:digestIndex(expected.get(table.name)!) }])),
    changedCommandIds, verified:false
  };
  if (!options.apply) return report;
  await database.migrate();
  return database.transaction<JsonGatewayMigrationReport>("recruiting-gateway:json-state-migration", async () => {
    const checkpoint = (await database.query<{ report: JsonGatewayMigrationReport }>("SELECT report FROM recruiting_gateway.json_migration_checkpoints WHERE source_hash=$1", [report.sourceHash])).rows[0];
    if (checkpoint) return { ...checkpoint.report, mode:"already_migrated" };
    // The caller stops the old writer first. Exclusive table locks also reject a concurrent new writer.
    await database.query(`LOCK TABLE ${[...tables.map((table) => table.name),"owner_fences","vision_sessions"].map((table) => `recruiting_gateway.${table}`).join(",")} IN ACCESS EXCLUSIVE MODE`);
    for (const name of [...tables.map((table) => table.name),"owner_fences","vision_sessions"]) {
      if ((await database.query(`SELECT 1 FROM recruiting_gateway.${name} LIMIT 1`)).rowCount) throw new Error("Migration target is not empty and has no matching source checkpoint");
    }
    for (const table of tables) {
      // Bounded bulk insert preserves original JSON fields, including historical run fields that current parsers omit.
      for (let index = 0; index < table.rows.length; index += 100) await database.query(
        `INSERT INTO recruiting_gateway.${table.name} (${table.columns}) SELECT ${table.expressions} FROM jsonb_array_elements($1::jsonb) AS value`, [JSON.stringify(table.rows.slice(index,index+100))]);
      const actual = new Map<string,string>();
      for (let offset = 0; ; offset += 100) {
        const page = await database.query<{ data: JsonRecord }>(`SELECT ${table.dataExpression ?? "data"} AS data FROM recruiting_gateway.${table.name} ORDER BY ${table.order} LIMIT 100 OFFSET $1`, [offset]);
        for (const { data } of page.rows) {
          const id = table.id(data); const hash = sha256(canonical(data));
          if (actual.has(id) || expected.get(table.name)!.get(id) !== hash) throw new Error(`Migration row verification failed for ${table.name}`);
          actual.set(id,hash);
        }
        if (page.rows.length < 100) break;
      }
      if (actual.size !== table.rows.length || digestIndex(actual) !== report.tables[table.name]!.sha256) throw new Error(`Migration table verification failed for ${table.name}`);
    }
    for (const name of Object.keys(sources) as SourceName[]) {
      if (canonical((await loadSource(sourceDir,name)).metadata) !== canonical(metadata[name])) throw new Error(`Migration source ${name} changed during import`);
    }
    const verified: JsonGatewayMigrationReport = { ...report, mode:"applied", verified:true };
    await database.query("INSERT INTO recruiting_gateway.json_migration_checkpoints (source_hash,report) VALUES ($1,$2::jsonb)", [report.sourceHash,JSON.stringify(verified)]);
    return verified;
  }).catch((error: unknown) => {
    const code = (error as { code?: unknown })?.code;
    if (typeof code === "string") throw new Error(`Migration database transaction failed (${code})`);
    throw error;
  });
}
