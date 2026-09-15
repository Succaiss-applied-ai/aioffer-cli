import { createHmac } from "node:crypto";
import type { AutoApplyBatch, AutoApplyCallbackDelivery } from "./auto-apply-contract.js";

export interface AutoApplyCallbackTarget {
  url: string;
  secretRef: string;
}

export interface AutoApplyCallbackDispatcher {
  validate(target: AutoApplyCallbackTarget): void;
  deliver(batch: AutoApplyBatch): Promise<AutoApplyCallbackDelivery>;
}

export class DisabledAutoApplyCallbackDispatcher implements AutoApplyCallbackDispatcher {
  validate(): void {
    throw new Error("批量投递回调尚未配置");
  }

  async deliver(batch: AutoApplyBatch): Promise<AutoApplyCallbackDelivery> {
    return failedDelivery(batch, "callback_dispatcher_not_configured", 0);
  }
}

export interface HttpAutoApplyCallbackDispatcherOptions {
  secrets: Record<string, string>;
  allowedOrigins: string[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export class HttpAutoApplyCallbackDispatcher implements AutoApplyCallbackDispatcher {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly allowedOrigins: Set<string>;

  constructor(private readonly options: HttpAutoApplyCallbackDispatcherOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.allowedOrigins = new Set(options.allowedOrigins.map((origin) => new URL(origin).origin));
  }

  validate(target: AutoApplyCallbackTarget): void {
    const url = new URL(target.url);
    if (url.protocol !== "https:" && !isLoopback(url.hostname)) {
      throw new Error("callback.url 必须使用 HTTPS");
    }
    if (!this.allowedOrigins.has(url.origin)) {
      throw new Error(`callback.url Origin 未获准：${url.origin}`);
    }
    const secret = this.options.secrets[target.secretRef];
    if (!secret || secret.length < 32) {
      throw new Error(`callback.secretRef 未在服务端注册：${target.secretRef}`);
    }
  }

  async deliver(batch: AutoApplyBatch): Promise<AutoApplyCallbackDelivery> {
    if (!batch.callback) return failedDelivery(batch, "callback_target_missing", 0);
    try {
      this.validate(batch.callback);
    } catch (error) {
      return failedDelivery(batch, errorMessage(error), 0);
    }

    const eventId = callbackEventId(batch.batchId);
    let lastError: string | null = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      attempts = attempt;
      const occurredAt = this.now().toISOString();
      const body = JSON.stringify(callbackPayload(batch, eventId, occurredAt));
      const secret = this.options.secrets[batch.callback.secretRef]!;
      const signature = createHmac("sha256", secret)
        .update(`${occurredAt}.${body}`)
        .digest("hex");
      try {
        const response = await this.fetchImpl(batch.callback.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Recruiting-Event-Id": eventId,
            "X-Recruiting-Timestamp": occurredAt,
            "X-Recruiting-Signature": `v1=${signature}`
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        if (response.ok) {
          return {
            status: "delivered",
            eventId,
            attempts: attempt,
            lastAttemptAt: occurredAt,
            deliveredAt: occurredAt,
            lastError: null
          };
        }
        lastError = `callback_http_${response.status}`;
        if (response.status < 500 && response.status !== 408 && response.status !== 429) break;
      } catch (error) {
        lastError = errorMessage(error);
      }
      if (attempt < this.maxAttempts) await delay(this.retryDelayMs * attempt);
    }
    return failedDelivery(batch, lastError ?? "callback_delivery_failed", attempts);
  }
}

function callbackPayload(batch: AutoApplyBatch, eventId: string, occurredAt: string) {
  return {
    schemaVersion: "auto-apply-callback.v1",
    eventId,
    eventType: "batch.completed",
    occurredAt,
    tenantId: batch.tenantId,
    userId: batch.userId,
    batchId: batch.batchId,
    status: batch.status,
    revision: batch.revision,
    jobs: batch.jobs.map((job) => ({
      batchJobId: job.batchJobId,
      jobId: job.jobId,
      status: job.status,
      reasonCode: job.reasonCode,
      completedAt: job.completedAt,
      evidence: job.evidence
    }))
  } as const;
}

function callbackEventId(batchId: string): string {
  return `auto-apply-batch:${batchId}:completed`;
}

function failedDelivery(batch: AutoApplyBatch, error: string, attempts: number): AutoApplyCallbackDelivery {
  return {
    status: "failed",
    eventId: callbackEventId(batch.batchId),
    attempts,
    lastAttemptAt: attempts > 0 ? new Date().toISOString() : null,
    deliveredAt: null,
    lastError: error
  };
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "callback_delivery_failed";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
