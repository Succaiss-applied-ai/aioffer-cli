import { gatewayInfrastructureError } from "./infrastructure-error.js";
import { GatewayRuntime } from "./gateway-runtime.js";
import { createPostgresGatewayRepositories, type PgGatewayDatabase } from "./postgres-storage.js";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ApplicationGateway,
  MemoryApplicationRunRepository
} from "./application-gateway.js";
import {
  autoApplyExecutionDeadlineMs,
  MemoryDeviceCommandQueue,
  QueuedLegacyPluginTransport,
  type DeviceCommandQueue
} from "./device-command-queue.js";
import {
  JsonApplicationRunRepository,
  JsonDeviceCommandQueue
} from "./json-storage.js";
import {
  JsonDeviceRegistry,
  MemoryDeviceRegistry,
  type DeviceRegistry,
  autoApplyPluginCompatibilityError
} from "./device-registry.js";
import {
  JsonDevicePairingRegistry,
  MemoryDevicePairingRegistry,
  type DevicePairingRegistry
} from "./device-pairing.js";
import { createDeviceBridgeRouter } from "./device-bridge-router.js";
import { createApplicationGatewayRouter } from "./http-router.js";
import { LegacyAiPluginBridgeAdapter } from "./legacy-plugin-adapter.js";
import { createApplicationGatewayMcpServer } from "./mcp-adapter.js";
import {
  visionAgentFromEnv,
  type VisionAgent
} from "./vision-agent.js";
import {
  AutoApplyService,
  autoApplyCommandDeadlineMs,
  autoApplySweepConcurrency,
  JsonAutoApplyBatchRepository,
  MemoryAutoApplyBatchRepository,
  minimumAutoApplySubmissionWindowMs,
  type AutoApplyEngineMode
} from "./auto-apply-service.js";
import { createAutoApplyRouter } from "./auto-apply-router.js";
import { AutoApplyEvidenceStore } from "./auto-apply-evidence.js";
import {
  DisabledAutoApplyCallbackDispatcher,
  HttpAutoApplyCallbackDispatcher
} from "./auto-apply-callback.js";

export interface ApplicationGatewaySidecarOptions {
  accessToken?: string;
  additionalAccessTokens?: string[];
  tenantId?: string;
  now?: () => Date;
  dataDir?: string;
  allowedOrigins?: string[];
  visionAgent?: VisionAgent;
  autoApplySigningSecret?: string;
  autoApplyCallbackSecrets?: Record<string, string>;
  autoApplyCallbackAllowedOrigins?: string[];
  autoApplyEngineMode?: AutoApplyEngineMode;
  autoApplyEngineAdapterCodes?: string[];
  autoApplySweepIntervalMs?: number;
  database?: PgGatewayDatabase;
  role?: "api" | "worker" | "all";
  evidenceDir?: string;
}

export interface ApplicationGatewaySidecar {
  app: Express;
  gateway: ApplicationGateway;
  queue: DeviceCommandQueue;
  devices: DeviceRegistry;
  pairings: DevicePairingRegistry;
  autoApply: AutoApplyService;
  runtime: GatewayRuntime;
}

export function createApplicationGatewaySidecar(
  options: ApplicationGatewaySidecarOptions = {}
): ApplicationGatewaySidecar {
  const now = options.now ?? (() => new Date());
  const pg = options.database ? createPostgresGatewayRepositories(options.database) : undefined;
  const runtime = new GatewayRuntime(options.database);
  const queue = pg?.queue ?? (options.dataDir
    ? new JsonDeviceCommandQueue(join(options.dataDir, "device-commands.json"), now)
    : new MemoryDeviceCommandQueue(now));
  const runs = pg?.runs ?? (options.dataDir
    ? new JsonApplicationRunRepository(join(options.dataDir, "application-runs.json"))
    : new MemoryApplicationRunRepository());
  const devices = pg?.devices ?? (options.dataDir
    ? new JsonDeviceRegistry(join(options.dataDir, "paired-devices.json"), now)
    : new MemoryDeviceRegistry(now));
  const pairings = pg?.pairings ?? (options.dataDir
    ? new JsonDevicePairingRegistry(join(options.dataDir, "device-auth.json"), now)
    : new MemoryDevicePairingRegistry(now));
  const gateway = new ApplicationGateway(
    runs,
    new LegacyAiPluginBridgeAdapter(new QueuedLegacyPluginTransport(queue)),
    now,
    options.database ? (key, work) => options.database!.transaction(key, work) : undefined
  );
  const visionAgent = options.visionAgent ?? visionAgentFromEnv(process.env, pg?.visionSessions);
  const autoApplyBatches = pg?.batches ?? (options.dataDir
    ? new JsonAutoApplyBatchRepository(join(options.dataDir, "auto-apply-batches.json"))
    : new MemoryAutoApplyBatchRepository());
  const callbacks = options.autoApplyCallbackSecrets && options.autoApplyCallbackAllowedOrigins?.length
    ? new HttpAutoApplyCallbackDispatcher({ secrets: options.autoApplyCallbackSecrets,
      allowedOrigins: options.autoApplyCallbackAllowedOrigins, now })
    : new DisabledAutoApplyCallbackDispatcher();
  const ownerParts = (key: string): [string, string] => {
    const parts = key.split("\u0000");
    if (parts.length !== 2) throw new Error("Invalid Gateway owner key");
    return [parts[0]!, parts[1]!];
  };
  const autoApply = new AutoApplyService(autoApplyBatches, queue, options.autoApplySigningSecret ?? "", now,
    callbacks, { mode: options.autoApplyEngineMode ?? "legacy", adapterCodes: [...(options.autoApplyEngineAdapterCodes ?? [])] },
    options.database && pg ? {
      transaction: (key, work) => options.database!.transaction(key, work),
      ownerFence: {
        isTerminated: key => pg.ownerFence.isTerminated(...ownerParts(key)),
        terminate: key => pg.ownerFence.terminate(...ownerParts(key)),
        clear: key => pg.ownerFence.clear(...ownerParts(key))
      },
      callbackOutbox: pg.callbackOutbox,
      dispatchOnClaim: true,
      canDispatch: async identity => {
        const device = await devices.get(identity.tenantId, identity.userId, identity.deviceId);
        return Boolean(device?.pluginInstalled && !autoApplyPluginCompatibilityError(device) &&
          now().getTime() - Date.parse(device.lastSeenAt) <= 90_000);
      }
    } : undefined);
  const autoApplySweepIntervalMs = options.role === "api" ? 0 : options.autoApplySweepIntervalMs ?? (pg ? 10_000 : 30_000);
  if (autoApplySweepIntervalMs > 0) runtime.startMaintenance(autoApply, callbacks, autoApplySweepIntervalMs);
  const autoApplyEvidence = new AutoApplyEvidenceStore(
    options.evidenceDir ?? (options.dataDir ? join(options.dataDir, "auto-apply-evidence") : undefined),
    now
  );
  const app = express();
  app.disable("x-powered-by");
  app.use(runtime.middleware);
  app.get("/livez", (_request, response) => { response.json({ ok: true }); });
  app.get("/readyz", async (_request, response) => { const ok = await runtime.ready(); response.status(ok ? 200 : 503).json({ ok }); });
  app.get("/metrics", (_request, response) => { response.type("text/plain").send(runtime.metrics()); });
  app.use(express.json({ limit: "10mb" }));
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use((request, response, next) => {
    const origin = request.header("Origin");
    if (!origin) {
      next();
      return;
    }
    const allowed = (options.allowedOrigins ?? []).includes(origin);
    if (!allowed) {
      if (request.method === "OPTIONS") {
        response.status(403).json({
          schemaVersion: "application-gateway-error.v1",
          code: "ORIGIN_FORBIDDEN",
          message: "当前网页 Origin 未获准调用 Application Gateway"
        });
        return;
      }
      next();
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.vary("Origin");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Tenant-Id, X-User-Id, Idempotency-Key"
    );
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Max-Age", "600");
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    next();
  });

  app.get("/automation/application-gateway/health", (_request, response) => {
    response.json({
      schemaVersion: "application-gateway-health.v1",
      ok: true,
      storage: pg ? "postgresql" : options.dataDir ? "json_file" : "memory",
      role: options.role ?? "all",
      dataDir: options.dataDir ?? null,
      executionTransport: "queued-ai-plugin-command.v1",
      deviceAuthentication: "one_time_pairing_and_per_device_token.v1",
      legacyProtocolPreserved: true,
      visionRpa: {
        endpoint: "/automation/device-bridge/v1/vision",
        providerCode: visionAgent.capabilities().providerCode,
        mode: "server_managed_model",
        configured: visionAgent.capabilities().configured
      },
      batchAutoApply: {
        endpoint: "/automation/auto-apply/v1",
        configured: autoApply.configured(),
        concurrencyPerDevice: 1,
        loginPolicy: "skip_and_report",
        humanInterventionPolicy: "pause_and_resume",
        humanInterventionScope: "job",
        schedulingPolicy: "park_waiting_job_and_continue",
        progressReceiptSchema: "auto-apply-job-progress.v1",
        progressEndpointTemplate:
          "/automation/device-bridge/v1/commands/{commandId}/progress",
        progressHeartbeatSeconds: 10,
        commandDeliveryDeadlineSeconds: autoApplyCommandDeadlineMs / 1000,
        commandExecutionDeadlineSeconds: autoApplyExecutionDeadlineMs / 1000,
        timeoutSweepIntervalSeconds: autoApplySweepIntervalMs > 0
          ? autoApplySweepIntervalMs / 1000
          : null,
        timeoutSweepConcurrency: autoApplySweepConcurrency,
        minimumSubmissionWindowSeconds: minimumAutoApplySubmissionWindowMs / 1000,
        resumeEndpointTemplate:
          "/automation/auto-apply/v1/batches/{batchId}/jobs/{batchJobId}/resume",
        humanInterventionReasonCodes: [
          "login_required",
          "captcha_required",
          "identity_verification_required"
        ],
        diagnosticSchema: "auto-apply-diagnostic.v1",
        diagnosticCategories: [
          "human_action",
          "candidate_data",
          "asset",
          "page",
          "site_validation",
          "model",
          "transport",
          "authorization",
          "unsupported",
          "cancelled",
          "unknown"
        ],
        evidenceStorage: autoApplyEvidence.mode(),
        callbackConfigured: Boolean(
          options.autoApplyCallbackSecrets && options.autoApplyCallbackAllowedOrigins?.length
        ),
        enginePolicy: autoApply.enginePolicySnapshot()
      },
      mcp: {
        endpoint: "/automation/mcp",
        transport: "streamable_http",
        sessionMode: "stateless",
        protocolVersion: "2025-11-25",
        legacySse: false,
        stdio: false
      }
    });
  });

  const authorize = (request: Request, response: Response, next: NextFunction) => {
    const acceptedTokens = [options.accessToken, ...(options.additionalAccessTokens ?? [])].filter(Boolean);
    if (!acceptedTokens.length) {
      next();
      return;
    }
    const authorization = request.header("Authorization") ?? "";
    if (!acceptedTokens.some((token) => authorization === `Bearer ${token}`)) {
      response.status(401).json({
        schemaVersion: "application-gateway-error.v1",
        code: "UNAUTHORIZED",
        message: "Application Gateway Token 无效"
      });
      return;
    }
    if (options.tenantId && request.header("X-Tenant-Id")?.trim() !== options.tenantId) {
      response.status(403).json({
        schemaVersion: "application-gateway-error.v1",
        code: "TENANT_FORBIDDEN",
        message: "X-Tenant-Id 与当前 Gateway 租户不一致"
      });
      return;
    }
    next();
  };

  const identity = (request: Request, response: Response, next: NextFunction) => {
    const tenantId = request.header("X-Tenant-Id")?.trim();
    const userId = request.header("X-User-Id")?.trim();
    if (!tenantId || !userId) {
      response.status(400).json({
        schemaVersion: "application-gateway-error.v1",
        code: "IDENTITY_HEADERS_REQUIRED",
        message: "缺少 X-Tenant-Id 或 X-User-Id 请求头"
      });
      return;
    }
    next();
  };

  const validOrigin = (request: Request, response: Response, next: NextFunction) => {
    const origin = request.header("Origin");
    if (origin && !(options.allowedOrigins ?? []).includes(origin)) {
      response.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden Origin" },
        id: null
      });
      return;
    }
    next();
  };

  app.post("/automation/mcp", authorize, identity, validOrigin, async (request, response) => {
    const server = createApplicationGatewayMcpServer(gateway, {
      tenantId: request.header("X-Tenant-Id")!.trim(),
      userId: request.header("X-User-Id")!.trim(),
      devices,
      pairings
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    let closed = false;
    response.once("close", () => {
      if (closed) return; closed = true;
      void transport.close(); void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) {
        const infrastructure = gatewayInfrastructureError(error);
        response.status(infrastructure?.status ?? 500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: infrastructure?.message ?? "MCP request failed", data: { retryable: infrastructure?.retryable ?? false } },
          id: null
        });
      }
    }
  });

  app.get("/automation/mcp", authorize, identity, validOrigin, (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Standalone SSE is disabled in stateless mode" },
      id: null
    });
  });

  app.use(
    "/automation/application-gateway/v1",
    authorize,
    createApplicationGatewayRouter(gateway, devices, pairings)
  );
  app.use(
    "/automation/auto-apply/v1",
    authorize,
    identity,
    createAutoApplyRouter(autoApply, devices, pairings, now)
  );
  app.use(
    "/automation/device-bridge/v1",
    createDeviceBridgeRouter(queue, gateway, devices, pairings, visionAgent, autoApply, autoApplyEvidence, now,
      options.database ? (key, work) => options.database!.transaction(key, work) : undefined)
  );

  return { app, gateway, queue, devices, pairings, autoApply, runtime };
}
