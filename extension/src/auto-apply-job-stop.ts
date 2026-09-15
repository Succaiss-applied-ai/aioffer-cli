import type { AutoApplyJobStop } from "./auto-apply-client.js";

export class AutoApplyJobStoppedError extends Error {
  constructor() {
    super("已按你的要求停止该岗位投递");
    this.name = "AutoApplyJobStoppedError";
  }
}

export function matchesAutoApplyJobStop(stop: AutoApplyJobStop, command: {
  commandId: string; payload?: Record<string, unknown>;
}): boolean {
  const job = command.payload?.job as { jobId?: string } | undefined;
  return stop.commandId === command.commandId && stop.batchId === command.payload?.batchId &&
    stop.batchJobId === command.payload?.batchJobId && stop.jobId === job?.jobId;
}

/** Polls independently of model/browser waits. It only fences execution; the
 * caller must await execution/finally, flush receipts and clean up before ACK. */
export async function watchAutoApplyJobStop(input: {
  command: { commandId: string; payload?: Record<string, unknown> };
  controller: AbortController;
  list: () => Promise<AutoApplyJobStop[]>;
  active: () => boolean;
  intervalMs?: number;
}): Promise<() => void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = async () => {
    try {
      const stops = await input.list();
      if (!stopped && input.active() && stops.some((stop) => matchesAutoApplyJobStop(stop, input.command))) {
        input.controller.abort(new AutoApplyJobStoppedError());
      }
    } catch {
      // A transport failure cannot confirm stopping or turn into account logout.
      // Keep retrying; final-submit authorization is independently fenced server-side.
    } finally {
      if (!stopped && input.active() && !input.controller.signal.aborted) {
        timer = setTimeout(() => { void check(); }, input.intervalMs ?? 1000);
      }
    }
  };
  await check();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

export async function reconcileAutoApplyJobStops(input: {
  list: () => Promise<AutoApplyJobStop[]>;
  active: () => boolean;
  flush: () => Promise<void>;
  cleanup: (stop: AutoApplyJobStop) => Promise<boolean>;
  acknowledge: (stop: AutoApplyJobStop) => Promise<void>;
}): Promise<void> {
  for (const stop of await input.list()) {
    if (!input.active()) return;
    await input.flush();
    if (!input.active()) return;
    if (!await input.cleanup(stop) || !input.active()) continue;
    // A monitor may have produced a receipt during cleanup. ACK is the last step.
    await input.flush();
    if (input.active()) await input.acknowledge(stop);
  }
}
