import { join } from "node:path";
import { migrateJsonGatewayState } from "./migrate-json-state.js";
import { migrateGatewayEvidence } from "./migrate-evidence.js";
import { PgGatewayDatabase } from "./postgres-storage.js";
import { createApplicationGatewaySidecar } from "./sidecar.js";

const host = process.env.RECRUITING_GATEWAY_HOST ?? "127.0.0.1";
const port = Number(process.env.RECRUITING_GATEWAY_PORT ?? 8094);
const accessToken = process.env.RECRUITING_GATEWAY_TOKEN;
const testToken = process.env.RECRUITING_GATEWAY_TEST_TOKEN;
const tenantId = process.env.RECRUITING_GATEWAY_TENANT_ID?.trim() || undefined;
const dataDir = process.env.RECRUITING_GATEWAY_DATA_DIR?.trim() || undefined;
const allowedOrigins = String(process.env.RECRUITING_GATEWAY_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const callbackAllowedOrigins = String(process.env.RECRUITING_AUTO_APPLY_CALLBACK_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const callbackSecrets = parseCallbackSecrets(process.env.RECRUITING_AUTO_APPLY_CALLBACK_SECRETS_JSON);
const autoApplyEngineMode = parseAutoApplyEngineMode(process.env.RECRUITING_AUTO_APPLY_ENGINE_MODE);
const autoApplyEngineAdapterCodes = String(process.env.RECRUITING_AUTO_APPLY_ENGINE_ADAPTERS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("RECRUITING_GATEWAY_PORT 必须是有效端口");
}

const roleValue = process.env.RECRUITING_GATEWAY_ROLE ?? "all";
if (!["api", "worker", "all"].includes(roleValue)) throw new Error("RECRUITING_GATEWAY_ROLE invalid");
const role = roleValue as "api" | "worker" | "all";
const databaseUrl = process.env.RECRUITING_GATEWAY_DATABASE_URL;
if (role !== "all" && !databaseUrl) throw new Error("Multiple Gateway roles require PostgreSQL storage");
const database = databaseUrl ? new PgGatewayDatabase(databaseUrl, {
  maxConnections: Number(process.env.RECRUITING_GATEWAY_DATABASE_POOL_SIZE ?? 8)
}) : undefined;
if (process.argv.includes("--operations-status")) {
  if (!database) { console.log(JSON.stringify({ storage: dataDir ? "json_file" : "memory", role })); process.exit(0); }
  try {
    const result = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM recruiting_gateway.commands WHERE status='claimed'");
    console.log(JSON.stringify({ storage: "postgresql", role, claimedCommands: Number(result.rows[0]?.count ?? 0) }));
  } catch {
    console.error("Gateway operations status is unavailable"); process.exitCode = 1;
  } finally { await database.close(); }
  process.exit(process.exitCode ?? 0);
}
const migrationIndex = process.argv.indexOf("--migrate-json");
if (migrationIndex >= 0) {
  if (!database) throw new Error("Migration requires PostgreSQL");
  const source = process.argv[migrationIndex + 1];
  if (!source || source.startsWith("--")) throw new Error("Migration source directory is required");
  const apply = process.argv.includes("--apply");
  const evidenceIndex = process.argv.indexOf("--evidence-target");
  const evidenceTarget = evidenceIndex >= 0 ? process.argv[evidenceIndex + 1] : undefined;
  if (evidenceIndex >= 0 && (!evidenceTarget || evidenceTarget.startsWith("--"))) throw new Error("Evidence target directory is required");
  try {
    const preview = await migrateJsonGatewayState(database, source, { apply: false });
    const evidence = apply && evidenceTarget ? await migrateGatewayEvidence(join(source, "auto-apply-evidence"), evidenceTarget) : undefined;
    const report = apply ? await migrateJsonGatewayState(database, source, { apply: true }) : preview;
    console.log(JSON.stringify({ ...report, evidence }));
  } catch {
    console.error("Gateway state migration failed; check source files and database diagnostics"); process.exitCode = 1;
  } finally { await database.close(); }
  process.exit(process.exitCode ?? 0);
}
if (database) await database.migrate();
const { app, runtime } = createApplicationGatewaySidecar({
  database, role,
  evidenceDir: process.env.RECRUITING_GATEWAY_EVIDENCE_DIR || undefined,

  accessToken,
  additionalAccessTokens: testToken ? [testToken] : [],
  tenantId,
  dataDir,
  allowedOrigins,
  autoApplySigningSecret: process.env.RECRUITING_AUTO_APPLY_SIGNING_SECRET,
  autoApplyCallbackSecrets: callbackSecrets,
  autoApplyCallbackAllowedOrigins: callbackAllowedOrigins,
  autoApplyEngineMode,
  autoApplyEngineAdapterCodes
});

const server = app.listen(port, host, () => {
  console.log(`Application Gateway sidecar: http://${host}:${port}/automation/application-gateway/v1`);
  console.log(`Device Bridge: http://${host}:${port}/automation/device-bridge/v1`);
  console.log(`Batch Auto Apply: http://${host}:${port}/automation/auto-apply/v1`);
  console.log(`MCP Streamable HTTP: http://${host}:${port}/automation/mcp`);
  console.log(`Storage: ${database ? "postgresql" : dataDir ? "json_file" : "memory"}; role: ${role}`);
  if (!accessToken) console.warn("RECRUITING_GATEWAY_TOKEN 未配置，仅允许受控本机开发使用");
});

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return; stopping = true;
  const deadline = setTimeout(() => { console.error("Gateway graceful shutdown timed out"); process.exit(1); }, 45_000);
  deadline.unref();
  const drain = runtime.stop();
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeIdleConnections(); });
  await drain;
  await database?.close();
  clearTimeout(deadline);
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => { void shutdown().catch(() => { process.exitCode = 1; }); });
}

function parseCallbackSecrets(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("RECRUITING_AUTO_APPLY_CALLBACK_SECRETS_JSON 必须是 JSON 对象");
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => {
    if (typeof value !== "string" || value.length < 32) {
      throw new Error(`回调密钥 ${key} 至少需要 32 个字符`);
    }
    return [key, value];
  }));
}

function parseAutoApplyEngineMode(raw: string | undefined): "legacy" | "shadow_v2" | "layered_v2" {
  const value = raw?.trim() || "legacy";
  if (value === "legacy" || value === "shadow_v2" || value === "layered_v2") return value;
  throw new Error("RECRUITING_AUTO_APPLY_ENGINE_MODE 必须是 legacy、shadow_v2 或 layered_v2");
}
