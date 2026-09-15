import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutoApplyProgressReporter } from "./auto-apply-progress.js";
import { AutoApplyProgressSequenceConflictError } from "./auto-apply-client.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createAutoApplyProgressReporter", () => {
  const identity = { batchId: "batch", batchJobId: "batch-job", jobId: "job" };

  it("rebases a reclaimed command at the next heartbeat without replaying the old stage", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => {
      if (send.mock.calls.length === 1) throw new AutoApplyProgressSequenceConflictError(80);
    });
    const reporter = createAutoApplyProgressReporter(identity, send);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send.mock.calls[1]?.[0]).toMatchObject({ sequence: 81, stage: "preflight" });
    await reporter.setStage("filling", "填写");
    expect(send.mock.calls[2]?.[0]).toMatchObject({ sequence: 82, stage: "filling" });
    await reporter.stop();
  });

  it("rebases only the latest queued stage when the old request conflicts", async () => {
    vi.useFakeTimers();
    let rejectFirst!: (error: Error) => void;
    const send = vi.fn(async () => {
      if (send.mock.calls.length === 1) await new Promise<void>((_, reject) => { rejectFirst = reject; });
    });
    const reporter = createAutoApplyProgressReporter(identity, send);
    await reporter.setStage("opening", "打开");
    await reporter.setStage("filling", "填写");
    rejectFirst(new AutoApplyProgressSequenceConflictError(80));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toMatchObject({ sequence: 81, stage: "filling" });
    await reporter.stop();
  });

  it("aborts in-flight telemetry at stop and never flushes the queued stage", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const send = vi.fn(async (_progress, signal: AbortSignal) => new Promise<void>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const reporter = createAutoApplyProgressReporter(identity, send);
    await reporter.setStage("filling", "填写");
    await reporter.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[1].aborted).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps ordinary conflicts diagnostic and does not use an untrusted sequence", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const send = vi.fn(async () => { throw new Error("HTTP 409 DEVICE_BRIDGE_CONFLICT"); });
    const reporter = createAutoApplyProgressReporter(identity, send);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toMatchObject({ sequence: 2 });
    expect(warn).toHaveBeenCalledTimes(2);
    await reporter.stop();
    warn.mockRestore();
  });
  it("reports stage changes immediately and repeats the current stage every ten seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T02:00:00.000Z"));
    const sent: Array<Record<string, unknown>> = [];
    const reporter = createAutoApplyProgressReporter(
      {
        batchId: "11111111-1111-4111-8111-111111111111",
        batchJobId: "22222222-2222-4222-8222-222222222222",
        jobId: "job-1"
      },
      async (progress) => { sent.push(progress); }
    );
    await vi.runAllTicks();
    await Promise.resolve();
    expect(sent).toMatchObject([{ sequence: 1, stage: "preflight" }]);

    await reporter.setStage("filling", "正在填写申请表");
    expect(sent.at(-1)).toMatchObject({ sequence: 2, stage: "filling", message: "正在填写申请表" });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.at(-1)).toMatchObject({ sequence: 3, stage: "filling" });

    await reporter.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent).toHaveLength(3);
  });

  it("does not block a stage transition behind a slow progress receipt", async () => {
    vi.useFakeTimers();
    let releaseInitial!: () => void;
    const initialReceipt = new Promise<void>((resolve) => { releaseInitial = resolve; });
    const sent: Array<Record<string, unknown>> = [];
    const reporter = createAutoApplyProgressReporter(
      {
        batchId: "11111111-1111-4111-8111-111111111111",
        batchJobId: "22222222-2222-4222-8222-222222222222",
        jobId: "job-1"
      },
      async (progress) => {
        sent.push(progress);
        if (sent.length === 1) await initialReceipt;
      }
    );
    await vi.runAllTicks();
    expect(sent).toMatchObject([{ sequence: 1, stage: "preflight" }]);

    await expect(reporter.setStage("filling", "正在填写申请表")).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);

    releaseInitial();
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.at(-1)).toMatchObject({ sequence: 2, stage: "filling", message: "正在填写申请表" });

    await reporter.stop();
  });
});
