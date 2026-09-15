import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { AutoApplyService } from "./auto-apply-service.js";
import type { AutoApplyCallbackDispatcher } from "./auto-apply-callback.js";
import type { PgGatewayDatabase } from "./postgres-storage.js";
import { GatewayRuntime } from "./gateway-runtime.js";

function response() {
  const r = new EventEmitter() as EventEmitter & { statusCode: number; setHeader: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  r.statusCode = 200; r.setHeader = vi.fn(); r.status = vi.fn(code => { r.statusCode = code; return r; }); r.json = vi.fn();
  return r;
}
describe("Gateway capacity and worker isolation", () => {
  it("reserves ordinary capacity while model requests are saturated and releases aborted requests", async () => {
    const runtime = new GatewayRuntime(); const next = vi.fn();
    const held = Array.from({ length: 8 }, () => response());
    for (const r of held) runtime.middleware({ path: "/vision" } as Request, r as unknown as Response, next);
    const excess = response(); runtime.middleware({ path: "/vision" } as Request, excess as unknown as Response, next);
    expect(excess.statusCode).toBe(503); expect(excess.json.mock.calls[0]?.[0].retryable).toBe(true);
    const uploads = Array.from({ length: 4 }, () => response());
    for (const r of uploads) runtime.middleware({ path: "/auto-apply/v1/evidence" } as Request, r as unknown as Response, next);
    const excessUpload = response(); runtime.middleware({ path: "/auto-apply/v1/evidence" } as Request, excessUpload as unknown as Response, next);
    expect(excessUpload.statusCode).toBe(503);
    const receipt = response(); runtime.middleware({ path: "/commands/result" } as Request, receipt as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(13);
    for (const r of [...held, ...uploads, receipt]) { r.emit("close"); r.emit("finish"); }
    expect(runtime.metrics()).toContain("recruiting_gateway_requests_in_flight 0");
    expect(runtime.metrics()).toContain("recruiting_gateway_request_duration_seconds_count 13");
    await runtime.stop(); const after = response();
    runtime.middleware({ path: "/commands/claim" } as Request, after as unknown as Response, next);
    expect(after.statusCode).toBe(503); expect(await runtime.ready()).toBe(false);
  });

  it("continues lease recovery while a callback is waiting and drains that callback before exit", async () => {
    vi.useFakeTimers();
    let resolveDelivery!: (value: unknown) => void; let claimed = false;
    const pending = new Promise(resolve => { resolveDelivery = resolve; });
    const database = { pool: { waitingCount: 0 }, query: vi.fn(async (sql: string) => {
      if (sql.includes("WITH exhausted") && !claimed) { claimed = true; return { rows: [{ id: "test", data: { batchId: "b", revision: 1 }, lease_token: "lease", attempts: 1 }], rowCount: 1 }; }
      return { rows: [], rowCount: 1 };
    }), transaction: async (_: string, work: () => Promise<unknown>) => work() } as unknown as PgGatewayDatabase;
    const runtime = new GatewayRuntime(database);
    const service = { reconcileExpiredBatches: vi.fn(async () => {}) } as unknown as AutoApplyService;
    const callbacks = { deliver: vi.fn(() => pending) } as unknown as AutoApplyCallbackDispatcher;
    runtime.startMaintenance(service, callbacks, 100);
    await vi.advanceTimersByTimeAsync(350);
    expect(service.reconcileExpiredBatches).toHaveBeenCalledTimes(4);
    expect(callbacks.deliver).toHaveBeenCalledTimes(1);
    let stopped = false; const draining = runtime.stop().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    resolveDelivery({ status: "delivered" }); await draining;
    expect(stopped).toBe(true); vi.useRealTimers();
  });
});
