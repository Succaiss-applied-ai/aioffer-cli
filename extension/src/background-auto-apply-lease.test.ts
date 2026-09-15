import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";
import { AutoApplyCommandLeaseRejectedError } from "./auto-apply-client.js";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const start = source.indexOf("  const executionAbort = autoApplyExecutionAbort;", source.indexOf("async function executeLegacyBatchAutoApplyJob("));
const end = source.indexOf("  try {", start);
if (start < 0 || end < start) throw new Error("production lease loop not found");

function harness() {
  let tick!: () => void;
  let reject!: (error: Error) => void;
  const initial = new AbortController();
  const terminate = vi.fn(async () => undefined);
  const watchdog = { acknowledge: vi.fn(), stop: vi.fn() };
  const expire = class extends Error {};
  const dependencies = {
    initial, localValidation: false, command: { commandId: "old-command" }, credential: {},
    AutoApplyCommandExpiredError: expire, AutoApplyCancelledError: class extends Error {},
    AutoApplyCommandLeaseRejectedError, terminateLocalAutoApplySession: terminate,
    startAutoApplyLeaseWatchdog: () => watchdog,
    setInterval: (callback: () => void) => { tick = callback; return 1; },
    renewAutoApplyCommandLease: () => new Promise<void>((_resolve, failure) => { reject = failure; })
  };
  const code = transformSync(`let autoApplyExecutionAbort = initial; let leaseCheckRunning = false; ${source.slice(start, end)}
    return { replace: (next) => { autoApplyExecutionAbort = next; } };`, { loader: "ts" }).code;
  const execution = Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return { initial, terminate, expire, tick: () => tick(), execution,
    reject: async (status: number) => { reject(new AutoApplyCommandLeaseRejectedError(status)); await new Promise(resolve => setImmediate(resolve)); } };
}

describe("production lease renewal callback ownership", () => {
  it.each([401, 403, 409, 410])("does not let the old attempt's delayed %i reject stop a later task", async status => {
    const f = harness();
    f.tick();
    const next = new AbortController();
    f.execution.replace(next);
    await f.reject(status);
    expect(f.initial.signal.aborted).toBe(false);
    expect(next.signal.aborted).toBe(false);
    expect(f.terminate).not.toHaveBeenCalled();
  });
  it("still aborts the matching active attempt on explicit expiry", async () => {
    const f = harness();
    f.tick();
    await f.reject(410);
    expect(f.initial.signal.reason).toBeInstanceOf(f.expire);
    expect(f.terminate).not.toHaveBeenCalled();
  });
  it("still terminates the matching session when its credential is revoked", async () => {
    const f = harness();
    f.tick();
    await f.reject(401);
    expect(f.terminate).toHaveBeenCalledOnce();
  });
});
