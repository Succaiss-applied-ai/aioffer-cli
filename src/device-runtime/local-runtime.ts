import { randomBytes } from "node:crypto";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { LegacyPluginEvent } from "../gateway/legacy-plugin-adapter.js";
import { bridgePage } from "./bridge-page.js";
import type {
  ClaimedDeviceCommand,
  DeviceGatewayPort
} from "./gateway-device-client.js";

export interface LocalRpaRuntimeOptions {
  extensionId: string;
  deviceName?: string;
  runtimeVersion?: string;
  pluginInstalled?: boolean;
  pluginVersion?: string;
  capabilities?: string[];
  heartbeatIntervalMs?: number;
  pollIntervalMs?: number;
  browserLeaseMs?: number;
  now?: () => Date;
  localToken?: string;
}

interface PendingCommand {
  claim: ClaimedDeviceCommand;
  browserClaimedAt: string | null;
  result: LegacyPluginEvent | null;
}

function pluginEvent(value: unknown): LegacyPluginEvent {
  const event = value as Partial<LegacyPluginEvent> | null;
  if (!event || event.schemaVersion !== "ai-plugin-event.v1" ||
    typeof event.type !== "string" ||
    !["completed", "waiting_for_user", "failed", "rejected"].includes(String(event.status))) {
    throw new Error("浏览器结果不符合 ai-plugin-event.v1");
  }
  return event as LegacyPluginEvent;
}

export class LocalRpaRuntime {
  private pending: PendingCommand | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private lastError: string | null = null;
  private lastHeartbeatAt: number | null = null;
  private lastBrowserResult: {
    commandId: string;
    eventType: string;
    status: string;
    errorCode: string | null;
  } | null = null;
  readonly localToken: string;

  constructor(
    private readonly gateway: DeviceGatewayPort,
    private readonly options: LocalRpaRuntimeOptions
  ) {
    this.localToken = options.localToken ?? randomBytes(24).toString("hex");
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.options.pollIntervalMs ?? 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const timestamp = this.now().getTime();
      if (this.lastHeartbeatAt === null || timestamp - this.lastHeartbeatAt >= (this.options.heartbeatIntervalMs ?? 30_000)) {
        await this.gateway.heartbeat({
          deviceName: this.options.deviceName,
          runtimeVersion: this.options.runtimeVersion ?? "1.0.0",
          pluginInstalled: this.options.pluginInstalled !== false,
          pluginVersion: this.options.pluginVersion,
          capabilities: this.options.capabilities ?? ["manual_copy", "assisted_rpa", "vision_rpa"]
        });
        this.lastHeartbeatAt = timestamp;
      }
      if (this.pending?.result) {
        await this.gateway.submit(this.pending.claim.commandId, this.pending.result);
        this.pending = null;
      }
      if (!this.pending) {
        const claim = await this.gateway.claim();
        if (claim) this.pending = { claim, browserClaimedAt: null, result: null };
      }
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.ticking = false;
    }
  }

  claimForBrowser(): ClaimedDeviceCommand | null {
    if (!this.pending || this.pending.result) return null;
    const claimedAt = this.pending.browserClaimedAt;
    const expired = claimedAt !== null &&
      Date.parse(claimedAt) + (this.options.browserLeaseMs ?? 30_000) <= this.now().getTime();
    if (claimedAt && !expired) return null;
    this.pending.browserClaimedAt = this.now().toISOString();
    return structuredClone(this.pending.claim);
  }

  completeFromBrowser(commandId: string, value: unknown): void {
    if (!this.pending || this.pending.claim.commandId !== commandId) {
      throw new Error("本地 Runtime 没有对应的待执行命令");
    }
    this.pending.result = pluginEvent(value);
    this.lastBrowserResult = {
      commandId,
      eventType: this.pending.result.type,
      status: this.pending.result.status,
      errorCode: this.pending.result.error?.code ?? null
    };
    void this.tick();
  }

  status(): Record<string, unknown> {
    return {
      schemaVersion: "local-rpa-runtime-health.v1",
      ok: this.lastError === null,
      extensionId: this.options.extensionId,
      pendingCommand: this.pending?.claim.command.type ?? null,
      pendingCommandId: this.pending?.claim.commandId ?? null,
      awaitingBrowser: Boolean(this.pending && !this.pending.result),
      awaitingGatewayReceipt: Boolean(this.pending?.result),
      lastBrowserResult: this.lastBrowserResult,
      lastHeartbeatAt: this.lastHeartbeatAt ? new Date(this.lastHeartbeatAt).toISOString() : null,
      lastError: this.lastError
    };
  }

  private now(): Date {
    return (this.options.now ?? (() => new Date()))();
  }
}

export function createLocalRpaRuntimeApp(
  runtime: LocalRpaRuntime,
  extensionId: string
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  const localAuth = (request: Request, response: Response, next: NextFunction) => {
    if (request.header("X-Local-Bridge-Token") !== runtime.localToken) {
      response.status(401).json({ code: "LOCAL_BRIDGE_UNAUTHORIZED" });
      return;
    }
    next();
  };

  app.get("/health", (_request, response) => response.json(runtime.status()));
  app.get("/bridge", (_request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'");
    response.type("html").send(bridgePage(extensionId, runtime.localToken));
  });
  app.post("/bridge/commands/claim", localAuth, (_request, response) => {
    const claim = runtime.claimForBrowser();
    if (!claim) {
      response.status(204).end();
      return;
    }
    response.json(claim);
  });
  app.post("/bridge/commands/:commandId/results", localAuth, (request, response) => {
    try {
      runtime.completeFromBrowser(String(request.params.commandId), request.body?.event);
      response.json({ accepted: true });
    } catch (error) {
      response.status(409).json({
        accepted: false,
        message: error instanceof Error ? error.message : "本地结果无效"
      });
    }
  });
  return app;
}
