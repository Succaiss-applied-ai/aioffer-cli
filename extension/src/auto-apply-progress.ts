import type { AutoApplyProgressInput, AutoApplyProgressStage } from "./auto-apply-client.js";
import { AutoApplyProgressSequenceConflictError } from "./auto-apply-client.js";

export interface AutoApplyProgressReporter {
  setStage(stage: AutoApplyProgressStage, message: string): Promise<void>;
  stop(): Promise<void>;
}

export function createAutoApplyProgressReporter(
  identity: Pick<AutoApplyProgressInput, "batchId" | "batchJobId" | "jobId">,
  send: (progress: Omit<AutoApplyProgressInput, "deviceId">, signal: AbortSignal) => Promise<void>,
  intervalMs = 10_000
): AutoApplyProgressReporter {
  let sequence = 0;
  let stage: AutoApplyProgressStage = "preflight";
  let message = "插件已领取任务，正在准备";
  let stopped = false;
  let sending = false;
  const controller = new AbortController();
  let latest: Omit<AutoApplyProgressInput, "deviceId"> | null = null;

  const flush = async (): Promise<void> => {
    if (stopped || sending || !latest) return;
    const progress = latest;
    latest = null;
    sending = true;
    try {
      await send(progress, controller.signal);
    } catch (error: unknown) {
      if (stopped) return;
      if (error instanceof AutoApplyProgressSequenceConflictError) {
        // Reclaiming the same command starts a new reporter, while Gateway
        // keeps its accepted sequence. Rebase telemetry only; never replay the
        // browser operation or send an older stage over a newer pending one.
        sequence = Math.max(sequence, error.acceptedSequence);
        if (latest) latest = { ...latest, sequence: ++sequence };
        return;
      }
      console.warn("[AI Offer 招聘小助手] auto-apply progress receipt failed", {
        commandSequence: progress.sequence,
        stage: progress.stage,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      sending = false;
      // A later stage may have arrived while a slow receipt was in flight.
      // Keep only that latest state; progress is telemetry and must never hold
      // the application workflow or the next queue poll hostage.
      if (!stopped && latest) void flush();
    }
  };

  const enqueue = (): void => {
    if (stopped) return;
    sequence += 1;
    latest = {
      schemaVersion: "auto-apply-job-progress.v1" as const,
      ...identity,
      sequence,
      stage,
      message,
      occurredAt: new Date().toISOString()
    };
    void flush();
  };

  enqueue();
  const timer = setInterval(enqueue, intervalMs);

  return {
    setStage(nextStage, nextMessage) {
      if (stopped) return Promise.resolve();
      stage = nextStage;
      message = nextMessage;
      enqueue();
      return Promise.resolve();
    },
    stop() {
      if (stopped) return Promise.resolve();
      stopped = true;
      clearInterval(timer);
      latest = null;
      controller.abort();
      return Promise.resolve();
    }
  };
}
