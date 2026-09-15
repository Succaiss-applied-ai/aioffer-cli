import { createAutoApplyCompletionOutbox } from "./auto-apply-completion-outbox.js";
import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoApplyCommandCompletionRejectedError, AutoApplyCommandClaimFenceRejectedError } from "./auto-apply-client.js";

const source = ts.createSourceFile("background.ts", readFileSync(new URL("./background.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true);
const poll = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "pollAutoApplyOnce")!;
// Execute the production orchestration with transport/browser boundaries stubbed.
const code = ts.transpileModule(poll.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const job = deferred<Record<string, unknown>>();
  let runtime: Record<string, unknown> = { connection: "ready", lastError: null };
  const context = {
    autoApplySessionTerminated: false, autoApplyLifecycleGeneration: 0,
    autoApplyPollRunning: false, autoApplyPollPending: false,
    autoApplyExecutionAbort: undefined as AbortController | undefined,
    autoApplyPollIdleWaiters: new Set<() => void>(),
    autoApplyHeartbeat: vi.fn(async () => ({ deviceId: "device" })),
    flushAutoApplyCompletionOutbox: vi.fn(async () => undefined),
    autoApplyCompletionOutbox: { pending: vi.fn(async (): Promise<{ commandId: string }[]> => []) },
    autoApplyCompletionOwner: () => "owner", AutoApplyCommandClaimFenceRejectedError,
    reconcileControlledExecutions: vi.fn(async () => undefined),
    reconcileStoppedAutoApplyJobs: vi.fn(async () => undefined),
    watchAutoApplyJobStop: vi.fn(async () => () => undefined),
    pendingAutoApplyJobStops: vi.fn(async () => []),
    AutoApplyJobStoppedError: class extends Error {},
    AutoApplyUserInterruptedError: class extends Error {},
    state: vi.fn(async () => ({ autoApplyRuntime: { ...runtime } })),
    update: vi.fn(async (next: { autoApplyRuntime: Record<string, unknown> }) => { runtime = next.autoApplyRuntime; }),
    claimAutoApplyCommand: vi.fn(async (): Promise<unknown> => null).mockResolvedValueOnce({
      commandId: "command", command: { type: "browser.execute_batch_auto_apply_job", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }
    }),
    commandWithClaimedExecutionDeadline: (command: unknown) => command,
    ensureAiCommand: (command: unknown) => command,
    executeBatchAutoApplyJob: vi.fn(() => job.promise),
    persistAutoApplyCompletion: vi.fn(async () => undefined),
    AutoApplyCommandCompletionRejectedError,
    AutoApplyCommandExpiredError: class extends Error {},
    AbortController, Date, Error, setTimeout, clearTimeout
  };
  const run = runInNewContext(`${code}\npollAutoApplyOnce`, context) as () => Promise<void>;
  return { context, job, run };
}

afterEach(() => { vi.useRealTimers(); });

describe("production automatic-application polling", () => {
  it("flushes an individual stop result instead of dropping it as account logout", async () => {
    vi.useFakeTimers();
    const { context, job, run } = harness();
    const active = run();
    await vi.advanceTimersByTimeAsync(0);
    context.autoApplyExecutionAbort!.abort(new context.AutoApplyJobStoppedError());
    const event = { status: "completed", payload: { autoApplyResult: { status: "cancelled", reasonCode: "job_cancelled" } } };
    job.resolve(event);
    await active;
    expect(context.persistAutoApplyCompletion).toHaveBeenCalledWith("command", event);
    expect(context.flushAutoApplyCompletionOutbox).toHaveBeenCalledTimes(2);
  });

  it("reports user interruption instead of discarding it as account logout", async () => {
    vi.useFakeTimers();
    const { context, job, run } = harness();
    const active = run();
    await vi.advanceTimersByTimeAsync(0);
    context.autoApplyExecutionAbort!.abort(new context.AutoApplyUserInterruptedError());
    const event = { status: "completed", payload: { autoApplyResult: { status: "failed", reasonCode: "user_interrupted" } } };
    job.resolve(event);
    await active;
    expect(context.persistAutoApplyCompletion).toHaveBeenCalledWith("command", event);
    expect(context.flushAutoApplyCompletionOutbox).toHaveBeenCalledTimes(2);
  });

  it.each(["health-read", "health-write", "outbox", "claim-read", "claim-write", "claim"] as const)(
    "does not continue an old account poll after rebinding during %s",
    async (boundary) => {
      vi.useFakeTimers();
      const { context, job, run } = harness();
      const gate = deferred<void>();
      const snapshot = { autoApplyRuntime: { connection: "ready", lastError: null } };
      if (boundary === "health-read") context.state.mockImplementationOnce(async () => {
        await gate.promise;
        return snapshot;
      });
      if (boundary === "health-write") {
        context.state.mockResolvedValueOnce({ autoApplyRuntime: { connection: "offline", lastError: null } });
        context.update.mockImplementationOnce(async () => { await gate.promise; });
      }
      if (boundary === "outbox") context.flushAutoApplyCompletionOutbox.mockImplementationOnce(async () => {
        await gate.promise;
      });
      if (boundary === "claim-read") context.state.mockResolvedValueOnce(snapshot).mockImplementationOnce(async () => {
        await gate.promise;
        return snapshot;
      });
      if (boundary === "claim-write") {
        context.state.mockResolvedValueOnce(snapshot)
          .mockResolvedValueOnce({ autoApplyRuntime: { connection: "ready", lastError: "old receipt error" } });
        context.update.mockImplementationOnce(async () => { await gate.promise; });
      }
      if (boundary === "claim") context.claimAutoApplyCommand.mockReset().mockImplementationOnce(async () => {
        await gate.promise;
        return { commandId: "old-account-command", command: {
          type: "browser.execute_batch_auto_apply_job", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString()
        } };
      });
      const active = run();
      await vi.advanceTimersByTimeAsync(0);
      // Rebinding may already have finished by the time an old await resumes;
      // the generation fence must work even when the session is active again.
      context.autoApplyLifecycleGeneration += 1;
      const updateCount = context.update.mock.calls.length;
      job.resolve({ status: "completed" });
      gate.resolve();
      await active;
      await vi.advanceTimersByTimeAsync(0);
      expect(context.executeBatchAutoApplyJob).not.toHaveBeenCalled();
      expect(context.persistAutoApplyCompletion).not.toHaveBeenCalled();
      expect(context.claimAutoApplyCommand).toHaveBeenCalledTimes(boundary === "claim" ? 1 : 0);
      expect(context.flushAutoApplyCompletionOutbox).toHaveBeenCalledTimes(boundary.startsWith("health-") ? 0 : 1);
      expect(context.update).toHaveBeenCalledTimes(updateCount);
      expect(context.autoApplyPollRunning).toBe(false);
      expect(context.autoApplyExecutionAbort).toBeUndefined();
    }
  );

  it("sends heartbeats during a running job without flushing, claiming, or releasing its execution lock", async () => {
    vi.useFakeTimers();
    const { context, job, run } = harness();
    const active = run();
    await vi.advanceTimersByTimeAsync(0);
    const abort = context.autoApplyExecutionAbort;
    expect(abort).toBeDefined();
    const idle = vi.fn();
    context.autoApplyPollIdleWaiters.add(idle);
    await run();
    await run();
    expect(context.autoApplyHeartbeat).toHaveBeenCalledTimes(3);
    expect(context.flushAutoApplyCompletionOutbox).toHaveBeenCalledTimes(1);
    expect(context.claimAutoApplyCommand).toHaveBeenCalledTimes(1);
    expect(context.autoApplyPollRunning).toBe(true);
    expect(context.autoApplyExecutionAbort).toBe(abort);
    expect(idle).not.toHaveBeenCalled();
    job.resolve({ status: "completed" });
    await active;
    await vi.advanceTimersByTimeAsync(0);
    expect(context.executeBatchAutoApplyJob).toHaveBeenCalledTimes(1);
    expect(context.autoApplyPollRunning).toBe(false);
    expect(idle).toHaveBeenCalled();
  });

  it("reconciles stops despite a rejected receipt and requires server fencing before another execution", async () => {
    vi.useFakeTimers();
    const { context, run } = harness();
    context.autoApplyCompletionOutbox.pending.mockResolvedValue([{ commandId: "old-command" }]);
    context.claimAutoApplyCommand.mockReset().mockRejectedValueOnce(new AutoApplyCommandClaimFenceRejectedError());
    await run();
    expect(context.reconcileStoppedAutoApplyJobs).toHaveBeenCalledOnce();
    expect(context.reconcileControlledExecutions).toHaveBeenCalledOnce();
    expect(context.claimAutoApplyCommand).toHaveBeenCalledWith({ deviceId: "device" }, ["old-command"]);
    expect(context.executeBatchAutoApplyJob).not.toHaveBeenCalled();
    expect((await context.state()).autoApplyRuntime).toMatchObject({ connection: "ready", lastError: expect.stringContaining("执行权") });
    context.autoApplyCompletionOutbox.pending.mockResolvedValue([]);
    context.claimAutoApplyCommand.mockResolvedValue(null);
    await run();
    expect(context.autoApplyHeartbeat).toHaveBeenCalledTimes(2);
    expect(context.reconcileStoppedAutoApplyJobs).toHaveBeenCalledTimes(2);
    expect(context.executeBatchAutoApplyJob).not.toHaveBeenCalled();
    expect((await context.state()).autoApplyRuntime).toMatchObject({ connection: "ready", lastError: null });
  });

  it("runs actual outbox isolation before stop reconciliation without retrying either ATS action", async () => {
    const { context, run } = harness();
    const stored: Record<string, unknown> = {};
    const box = createAutoApplyCompletionOutbox({
      get: async defaults => ({ ...defaults, ...structuredClone(stored) }),
      set: async value => { Object.assign(stored, structuredClone(value)); }
    });
    await box.enqueue("owner", "old-command", { commandId: "old-command", status: "failed" });
    await box.enqueue("owner", "other-command", { commandId: "other-command", status: "completed" });
    const finalize = vi.fn(async () => undefined);
    const complete = vi.fn(async (_credential, commandId) => {
      if (commandId === "old-command") throw new AutoApplyCommandCompletionRejectedError(409);
    });
    const flushNode = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "flushAutoApplyCompletionOutbox")!;
    const flushCode = ts.transpileModule(flushNode.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
    const flush = runInNewContext(`${flushCode}; flushAutoApplyCompletionOutbox`, withInterruptionDependencies({
      ...context, autoApplyCompletionOutbox: box, completeAutoApplyCommand: complete,
      finalizeAcknowledgedAutoApplyTabClosure: finalize
    }));
    context.flushAutoApplyCompletionOutbox.mockImplementation(flush);
    context.autoApplyCompletionOutbox.pending.mockImplementation(() => box.pending("owner"));
    context.claimAutoApplyCommand.mockReset().mockRejectedValueOnce(new AutoApplyCommandClaimFenceRejectedError());
    await run();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledExactlyOnceWith("other-command", { commandId: "other-command", status: "completed" });
    expect(context.reconcileStoppedAutoApplyJobs).toHaveBeenCalledOnce();
    expect(context.claimAutoApplyCommand).toHaveBeenCalledWith({ deviceId: "device" }, ["old-command"]);
    expect(context.executeBatchAutoApplyJob).not.toHaveBeenCalled();
    expect(await box.pending("owner")).toMatchObject([{ commandId: "old-command" }]);
  });

  it("does not release another invocation's lock when its health request fails", async () => {
    vi.useFakeTimers();
    const { context, job, run } = harness();
    const active = run();
    await vi.advanceTimersByTimeAsync(0);
    const abort = context.autoApplyExecutionAbort;
    context.autoApplyHeartbeat.mockRejectedValueOnce(new Error("network interrupted"));
    await run();
    expect(context.autoApplyPollRunning).toBe(true);
    expect(context.autoApplyExecutionAbort).toBe(abort);
    expect(context.update).toHaveBeenLastCalledWith(expect.objectContaining({
      autoApplyRuntime: expect.objectContaining({ connection: "offline" })
    }));
    await run();
    expect(context.autoApplyPollRunning).toBe(true);
    expect(context.autoApplyExecutionAbort).toBe(abort);
    expect((await context.state()).autoApplyRuntime).toMatchObject({ connection: "ready", lastError: null });
    job.resolve({ status: "completed" });
    await active;
    await vi.advanceTimersByTimeAsync(0);
    expect(context.executeBatchAutoApplyJob).toHaveBeenCalledTimes(1);
  });
});
