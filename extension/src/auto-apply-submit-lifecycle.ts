export class AutoApplySubmissionTabClosedError extends Error {
  constructor(readonly tabId: number) {
    super("招聘页面在提交结果确认前被关闭");
    this.name = "AutoApplySubmissionTabClosedError";
  }
}

export class AutoApplySubmissionGuardTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`招聘页面提交确认超过 ${Math.ceil(timeoutMs / 1000)} 秒，已释放后续任务`);
    this.name = "AutoApplySubmissionGuardTimeoutError";
  }
}

interface AutoApplySubmissionTabLifecycle {
  get(tabId: number): Promise<unknown>;
  onRemoved: {
    addListener(listener: (tabId: number) => void): void;
    removeListener(listener: (tabId: number) => void): void;
  };
}

/** Fence a call to one submit attempt. A late Chrome response must not resume
 * pointer actions after the lifecycle guard has released that attempt. */
export async function submissionPhaseCall<T>(signal: AbortSignal | undefined, action: () => Promise<T>): Promise<T> {
  if (!signal) return action();
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    const value = await Promise.race([Promise.resolve().then(() => {
      signal.throwIfAborted();
      return action();
    }), aborted]);
    signal.throwIfAborted();
    return value;
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

/**
 * Bound the active submit phase to the exact recruitment tab. Chrome APIs can
 * remain unresolved when a site closes its own tab during navigation. That
 * must end the current command instead of holding the single-device queue.
 */
export async function executeWithAutoApplySubmissionLifecycleGuard<T>(input: {
  tabs: AutoApplySubmissionTabLifecycle;
  tabId: number;
  timeoutMs: number;
  execute: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  let closedError: AutoApplySubmissionTabClosedError | null = null;
  let rejectClosed: ((error: AutoApplySubmissionTabClosedError) => void) | null = null;
  const onRemoved = (removedTabId: number) => {
    if (removedTabId !== input.tabId) return;
    closedError = new AutoApplySubmissionTabClosedError(input.tabId);
    controller.abort(closedError);
    rejectClosed?.(closedError);
  };
  input.tabs.onRemoved.addListener(onRemoved);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    try {
      await input.tabs.get(input.tabId);
    } catch {
      throw closedError ?? new AutoApplySubmissionTabClosedError(input.tabId);
    }
    if (closedError) throw closedError;

    const tabClosed = new Promise<never>((_resolve, reject) => {
      rejectClosed = reject;
      if (closedError) reject(closedError);
    });
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new AutoApplySubmissionGuardTimeoutError(input.timeoutMs);
        controller.abort(error);
        reject(error);
      }, input.timeoutMs);
    });
    return await Promise.race([
      Promise.resolve().then(() => input.execute(controller.signal)),
      tabClosed,
      timedOut
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    rejectClosed = null;
    input.tabs.onRemoved.removeListener(onRemoved);
  }
}
