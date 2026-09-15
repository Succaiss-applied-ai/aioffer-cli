import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoApplyJobStoppedError, matchesAutoApplyJobStop, reconcileAutoApplyJobStops, watchAutoApplyJobStop } from "./auto-apply-job-stop.js";
import { armApplicationInterruption, applicationCallsSettled, interruptibleApplicationCall } from "./auto-apply-interruption.js";

const stop = { requestId: "delete-request", batchId: "batch", batchJobId: "item", jobId: "job", commandId: "command", requestedAt: "2026-09-09T00:00:00Z" };
const command = { commandId: "command", payload: { batchId: "batch", batchJobId: "item", job: { jobId: "job" } } };
afterEach(() => vi.useRealTimers());
describe("single application stop coordination", () => {
  it("matches all task identifiers, never the batch alone", () => {
    expect(matchesAutoApplyJobStop(stop, command)).toBe(true);
    for (const key of ["commandId", "batchId", "batchJobId", "jobId"] as const) {
      expect(matchesAutoApplyJobStop({ ...stop, [key]: "other" }, command)).toBe(false);
    }
  });
  it("aborts an active command without acknowledging it or cancelling a neighbour", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const list = vi.fn().mockResolvedValueOnce([{ ...stop, batchJobId: "other" }]).mockResolvedValue([stop]);
    const dispose = await watchAutoApplyJobStop({ command, controller, list, active: () => true });
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.signal.reason).toBeInstanceOf(AutoApplyJobStoppedError);
    dispose();
  });
  it("does not abort another account when a stale poll resolves", async () => {
    let resolve!: (value: typeof stop[]) => void;
    let active = true;
    const controller = new AbortController();
    const watcher = watchAutoApplyJobStop({ command, controller, active: () => active, list: () => new Promise((done) => { resolve = done; }) });
    active = false; resolve([stop]); (await watcher)();
    expect(controller.signal.aborted).toBe(false);
  });
  it("acknowledges only after execution cleanup and both receipt flushes", async () => {
    const order: string[] = [];
    await reconcileAutoApplyJobStops({ list: async () => [stop], active: () => true,
      flush: async () => { order.push("flush"); }, cleanup: async () => { order.push("cleanup"); return true; },
      acknowledge: async () => { order.push("ack"); } });
    expect(order).toEqual(["flush", "cleanup", "flush", "ack"]);
  });
  it.each(["cleanup-pending", "receipt-failure", "account-change"])("never acknowledges %s", async (scenario) => {
    let active = true;
    const acknowledge = vi.fn();
    const run = reconcileAutoApplyJobStops({ list: async () => [stop], active: () => active,
      flush: async () => { if (scenario === "receipt-failure") throw new Error("offline"); },
      cleanup: async () => { if (scenario === "account-change") active = false; return scenario !== "cleanup-pending"; }, acknowledge });
    if (scenario === "receipt-failure") await expect(run).rejects.toThrow("offline"); else await run;
    expect(acknowledge).not.toHaveBeenCalled();
  });
  it("does not confuse an aborted wrapper with the underlying browser call settling", async () => {
    const controller = armApplicationInterruption(199);
    let finish!: () => void;
    const call = interruptibleApplicationCall(199, () => new Promise<void>((resolve) => { finish = resolve; }));
    await Promise.resolve();
    controller.abort(new AutoApplyJobStoppedError());
    await expect(call).rejects.toBeInstanceOf(AutoApplyJobStoppedError);
    expect(applicationCallsSettled(199)).toBe(false);
    finish(); await Promise.resolve(); await Promise.resolve();
    expect(applicationCallsSettled(199)).toBe(true);
  });
});
