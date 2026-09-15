import type { Request, Response, NextFunction } from "express";
import type { AutoApplyService } from "./auto-apply-service.js";
import type { AutoApplyCallbackDispatcher } from "./auto-apply-callback.js";
import { createPostgresGatewayRepositories, type PgGatewayDatabase } from "./postgres-storage.js";

/** Per-process capacity limits bound pool waiters and isolate slow model calls. */
export class GatewayRuntime {
  private active = 0;
  private activeVision = 0;
  private activeEvidence = 0;
  private requests = 0;
  private rejected = 0;
  private failures = 0;
  private totalSeconds = 0;
  private maintenance?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private callbackWork?: Promise<void>;
  private draining = false;
  private lastMaintenanceAt = 0;
  private readonly durationBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];
  private readonly durationCounts = Array<number>(10).fill(0);
  private databaseMetrics = "";
  private metricsTimer?: ReturnType<typeof setInterval>;
  private metricsWork?: Promise<void>;

  constructor(private readonly database?: PgGatewayDatabase) {
    if (database) {
      const tick = () => {
        if (!this.draining && !this.metricsWork) this.metricsWork = this.refreshDatabaseMetrics()
          .catch(() => { this.databaseMetrics = "recruiting_gateway_database_metrics_available 0\n"; })
          .finally(() => { this.metricsWork = undefined; });
      };
      tick(); this.metricsTimer = setInterval(tick, 15_000); this.metricsTimer.unref();
    }
  }

  middleware = (request: Request, response: Response, next: NextFunction): void => {
    if (request.path.endsWith("/health") || request.path === "/readyz" || request.path === "/livez" || request.path === "/metrics") {
      next(); return;
    }
    const vision = request.path.includes("/vision");
    const evidence = request.path.endsWith("/evidence");
    if (this.draining || (vision ? this.activeVision >= 8 : evidence ? this.activeEvidence >= 4 : this.active >= 96)) {
      this.rejected++;
      response.setHeader("Retry-After", "2");
      response.status(503).json({ code: "GATEWAY_BUSY", retryable: true, message: "服务正在恢复或繁忙，请稍后重试" });
      return;
    }
    if (vision) this.activeVision++; else if (evidence) this.activeEvidence++; else this.active++;
    const started = performance.now(); let done = false;
    const finish = () => {
      if (done) return; done = true;
      if (vision) this.activeVision--; else if (evidence) this.activeEvidence--; else this.active--;
      const seconds = (performance.now() - started) / 1000;
      this.requests++; this.totalSeconds += seconds;
      this.durationBuckets.forEach((bound, index) => { if (seconds <= bound) this.durationCounts[index] = (this.durationCounts[index] ?? 0) + 1; });
      if (response.statusCode >= 500) this.failures++;
    };
    response.once("finish", finish); response.once("close", finish); next();
  };

  async ready(): Promise<boolean> {
    if (this.draining) return false;
    try { if (this.database) await this.database.query("SELECT 1"); return true; } catch { return false; }
  }

  metrics(): string {
    return [
      `recruiting_gateway_requests_total ${this.requests}`,
      `recruiting_gateway_requests_rejected_total ${this.rejected}`,
      `recruiting_gateway_requests_failed_total ${this.failures}`,
      "# TYPE recruiting_gateway_request_duration_seconds histogram",
      ...this.durationBuckets.map((bound, index) => `recruiting_gateway_request_duration_seconds_bucket{le="${bound}"} ${this.durationCounts[index]}`),
      `recruiting_gateway_request_duration_seconds_bucket{le="+Inf"} ${this.requests}`,
      `recruiting_gateway_request_duration_seconds_sum ${this.totalSeconds}`,
      `recruiting_gateway_request_duration_seconds_count ${this.requests}`,
      `recruiting_gateway_requests_in_flight ${this.active}`,
      `recruiting_gateway_vision_in_flight ${this.activeVision}`,
      `recruiting_gateway_evidence_in_flight ${this.activeEvidence}`,
      `recruiting_gateway_maintenance_last_success_timestamp_seconds ${this.lastMaintenanceAt}`,
      `recruiting_gateway_database_pool_waiting ${this.database?.pool.waitingCount ?? 0}`,
      ...Object.entries(this.database?.storageErrorCounts() ?? {}).map(([code, total]) => `recruiting_gateway_storage_errors_total{code="${code}"} ${total}`),
      this.databaseMetrics, ""
    ].join("\n");
  }

  private async refreshDatabaseMetrics(): Promise<void> {
    if (!this.database) return;
    const [commands, callbacks] = await Promise.all([
      this.database.query<{ status: string; total: string; overdue: string }>(`
        SELECT status, count(*)::text AS total,
          count(*) FILTER (WHERE deadline_at <= now())::text AS overdue
        FROM recruiting_gateway.commands WHERE status IN ('queued', 'claimed') GROUP BY status`),
      this.database.query<{ status: string; total: string; oldest: string }>(`
        SELECT status, count(*)::text AS total,
          COALESCE(EXTRACT(EPOCH FROM now() - min(created_at)), 0)::text AS oldest
        FROM recruiting_gateway.callback_outbox WHERE status IN ('pending', 'delivering', 'failed') GROUP BY status`)
    ]);
    const rows = ["recruiting_gateway_database_metrics_available 1"];
    for (const status of ["queued", "claimed"]) {
      const value = commands.rows.find(row => row.status === status);
      rows.push(`recruiting_gateway_commands{status="${status}"} ${Number(value?.total ?? 0)}`);
      rows.push(`recruiting_gateway_commands_overdue{status="${status}"} ${Number(value?.overdue ?? 0)}`);
    }
    for (const status of ["pending", "delivering", "failed"]) {
      const value = callbacks.rows.find(row => row.status === status);
      rows.push(`recruiting_gateway_callbacks{status="${status}"} ${Number(value?.total ?? 0)}`);
      rows.push(`recruiting_gateway_callback_oldest_age_seconds{status="${status}"} ${Number(value?.oldest ?? 0)}`);
    }
    this.databaseMetrics = rows.join("\n");
  }

  startMaintenance(service: AutoApplyService, callbacks: AutoApplyCallbackDispatcher, intervalMs: number): void {
    if (this.timer) throw new Error("Gateway maintenance already started");
    const reportFailure = (error: unknown) => {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "MAINTENANCE_FAILED";
      console.error("[GatewayMaintenance] failed", code);
    };
    const tick = () => {
      if (this.draining) return;
      if (!this.maintenance) this.maintenance = service.reconcileExpiredBatches()
        .then(() => { this.lastMaintenanceAt = Date.now() / 1000; })
        .catch(reportFailure).finally(() => { this.maintenance = undefined; });
      // The callback pump has a separate busy flag: a slow endpoint cannot
      // stop timeout recovery or dispatch on this worker.
      if (!this.callbackWork) this.callbackWork = this.deliverCallbacks(callbacks)
        .catch(reportFailure).finally(() => { this.callbackWork = undefined; });
    };
    tick(); this.timer = setInterval(tick, Math.max(intervalMs, 100)); this.timer.unref();
  }

  private async deliverCallbacks(callbacks: AutoApplyCallbackDispatcher): Promise<void> {
    if (this.database) {
      const repositories = createPostgresGatewayRepositories(this.database);
      const items = await repositories.callbackOutbox.claim(4, 120);
      await Promise.all(items.map(async (item) => {
        // Browser dispatch and receipt ACK never await this external request.
        try {
          const delivery = await callbacks.deliver(item.batch);
          await this.database!.transaction(`${item.batch.tenantId}\u0000${item.batch.userId}`, async () => {
            // Fence the worker before touching batch metadata. A delayed HTTP
            // response from an expired callback lease has no write authority.
            const accepted = delivery.status === "delivered"
              ? await repositories.callbackOutbox.complete(item.id, item.leaseToken)
              : await repositories.callbackOutbox.retry(item.id, item.leaseToken, "callback_delivery_failed", Math.min(300, 30 * 2 ** Math.min(item.attempts, 4)));
            if (accepted) await repositories.batches.updateCallbackDelivery(item.batch.batchId, delivery, item.batch.revision);
          });
        } catch {
          await repositories.callbackOutbox.retry(item.id, item.leaseToken, "callback_delivery_failed", 60);
        }
      }));
    }
  }

  async stop(): Promise<void> {
    this.draining = true;
    if (this.timer) clearInterval(this.timer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    await Promise.all([this.maintenance, this.callbackWork, this.metricsWork]);
  }
}
