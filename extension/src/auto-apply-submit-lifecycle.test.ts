import { describe, expect, it, vi } from "vitest";
import {
  AutoApplySubmissionGuardTimeoutError,
  AutoApplySubmissionTabClosedError,
  executeWithAutoApplySubmissionLifecycleGuard,
  submissionPhaseCall
} from "./auto-apply-submit-lifecycle.js";

class RemovedTabEvent {
  private readonly listeners = new Set<(tabId: number) => void>();

  addListener(listener: (tabId: number) => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: (tabId: number) => void): void {
    this.listeners.delete(listener);
  }

  emit(tabId: number): void {
    for (const listener of this.listeners) listener(tabId);
  }

  size(): number {
    return this.listeners.size;
  }
}

describe("executeWithAutoApplySubmissionLifecycleGuard", () => {
  it("cancels a delayed Chrome response before it can dispatch a confirmation after timeout", async () => {
    vi.useFakeTimers();
    try {
      let finish!: () => void;
      const click = vi.fn(async () => undefined);
      let execution!: Promise<void>;
      const guarded = executeWithAutoApplySubmissionLifecycleGuard({
        tabs: { get: async () => ({ id: 12 }), onRemoved: new RemovedTabEvent() }, tabId: 12, timeoutMs: 30_000,
        execute: signal => execution = (async () => {
          await submissionPhaseCall(signal, () => new Promise<void>(resolve => { finish = resolve; }));
          await submissionPhaseCall(signal, click);
        })()
      });
      const failed = expect(guarded).rejects.toBeInstanceOf(AutoApplySubmissionGuardTimeoutError);
      await vi.advanceTimersByTimeAsync(30_000);
      await failed;
      finish();
      await expect(execution).rejects.toBeInstanceOf(AutoApplySubmissionGuardTimeoutError);
      expect(click).not.toHaveBeenCalled();
      // Another attempt gets an independent signal and remains usable.
      await expect(executeWithAutoApplySubmissionLifecycleGuard({
        tabs: { get: async () => ({ id: 13 }), onRemoved: new RemovedTabEvent() }, tabId: 13, timeoutMs: 30_000,
        execute: signal => submissionPhaseCall(signal, async () => "next-success")
      })).resolves.toBe("next-success");
    } finally { vi.useRealTimers(); }
  });
  it("returns the submit result and always removes the tab listener", async () => {
    const onRemoved = new RemovedTabEvent();
    const execute = vi.fn(async () => "submitted");

    await expect(executeWithAutoApplySubmissionLifecycleGuard({
      tabs: { get: vi.fn(async () => ({ id: 12 })), onRemoved },
      tabId: 12,
      timeoutMs: 1_000,
      execute
    })).resolves.toBe("submitted");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(onRemoved.size()).toBe(0);
  });

  it("does not start submission when the bound tab is already gone", async () => {
    const onRemoved = new RemovedTabEvent();
    const execute = vi.fn(async () => "submitted");

    await expect(executeWithAutoApplySubmissionLifecycleGuard({
      tabs: { get: vi.fn(async () => { throw new Error("No tab with id: 12"); }), onRemoved },
      tabId: 12,
      timeoutMs: 1_000,
      execute
    })).rejects.toBeInstanceOf(AutoApplySubmissionTabClosedError);

    expect(execute).not.toHaveBeenCalled();
    expect(onRemoved.size()).toBe(0);
  });

  it("ends the active command when the recruitment tab closes during submission", async () => {
    const onRemoved = new RemovedTabEvent();
    let finish!: (value: string) => void;
    const execute = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const guarded = executeWithAutoApplySubmissionLifecycleGuard({
      tabs: { get: vi.fn(async () => ({ id: 12 })), onRemoved },
      tabId: 12,
      timeoutMs: 1_000,
      execute
    });

    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    onRemoved.emit(99);
    expect(onRemoved.size()).toBe(1);
    onRemoved.emit(12);

    await expect(guarded).rejects.toBeInstanceOf(AutoApplySubmissionTabClosedError);
    expect(onRemoved.size()).toBe(0);
    finish("late result");
  });

  it("bounds a stuck Chrome submission API instead of holding the device slot", async () => {
    vi.useFakeTimers();
    try {
      const onRemoved = new RemovedTabEvent();
      const guarded = executeWithAutoApplySubmissionLifecycleGuard({
        tabs: { get: vi.fn(async () => ({ id: 12 })), onRemoved },
        tabId: 12,
        timeoutMs: 30_000,
        execute: () => new Promise<never>(() => undefined)
      });
      const rejection = expect(guarded).rejects.toBeInstanceOf(AutoApplySubmissionGuardTimeoutError);

      await vi.advanceTimersByTimeAsync(30_000);

      await rejection;
      expect(onRemoved.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
