import type { AutoApplyRuntimeCredential } from "./auto-apply-client.js";

export type InterruptionKind = "page_reloaded" | "tab_closed" | "browser_session_ended" | "execution_session_ended";
export class AutoApplyUserInterruptedError extends Error {
  constructor(readonly kind: InterruptionKind) {
    super(interruptionMessage(kind));
    this.name = "AutoApplyUserInterruptedError";
  }
}
export function interruptionMessage(kind: InterruptionKind): string {
  return kind === "page_reloaded" ? "填表期间招聘页面被刷新，本次自动投递已停止。" :
    kind === "tab_closed" ? "填表期间招聘页面被关闭，本次自动投递已停止。" :
    kind === "browser_session_ended" ? "填表期间浏览器会话中断，本次自动投递已停止。" :
    "填表期间浏览器或小助手会话中断，本次自动投递已停止。";
}
export function interruptionDiagnostic(kind: InterruptionKind, submissionStarted = false) {
  return { code: "user_interrupted", category: "human_action" as const,
    stage: submissionStarted ? "success_verification" as const : "form_fill" as const,
    userMessage: interruptionMessage(kind) + (submissionStarted ? "提交已经触发，最终投递结果暂时无法确认。" : ""),
    developerMessage: "精确绑定的受控执行页中断；停止原轮次，仅补报回执，不恢复页面执行。",
    retryable: false, recommendedAction: "inspect_evidence" as const };
}

// Cancellation belongs to a tab AND its execution object, never the next
// command's global AbortController. A cancelled tab stays fenced for this
// worker lifetime, including promises which return after the owner unwinds.
const fences = new Map<number, AbortController>();
export function armApplicationInterruption(tabId: number): AbortController {
  const previous = fences.get(tabId);
  if (previous?.signal.aborted) throw previous.signal.reason;
  const controller = new AbortController();
  fences.set(tabId, controller);
  return controller;
}
export function disarmApplicationInterruption(tabId: number, controller: AbortController): void {
  if (fences.get(tabId) === controller && !controller.signal.aborted) fences.delete(tabId);
}
export function assertApplicationNotInterrupted(tabId: number): void {
  const signal = fences.get(tabId)?.signal;
  if (signal?.aborted) throw signal.reason;
}
const inFlightCalls = new Map<number, number>();
export function applicationCallsSettled(tabId: number): boolean {
  return !inFlightCalls.get(tabId);
}
async function trackedApplicationCall<T>(tabId: number, action: () => Promise<T>): Promise<T> {
  inFlightCalls.set(tabId, (inFlightCalls.get(tabId) ?? 0) + 1);
  try { return await action(); }
  finally {
    const remaining = (inFlightCalls.get(tabId) ?? 1) - 1;
    if (remaining) inFlightCalls.set(tabId, remaining); else inFlightCalls.delete(tabId);
  }
}
export async function interruptibleApplicationCall<T>(tabId: number, action: () => Promise<T>): Promise<T> {
  const signal = fences.get(tabId)?.signal;
  if (signal?.aborted) throw signal.reason;
  if (!signal) return trackedApplicationCall(tabId, action);
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    const value = await Promise.race([Promise.resolve().then(() => {
      if (signal.aborted) throw signal.reason;
      return trackedApplicationCall(tabId, action);
    }), interrupted]);
    if (signal.aborted) throw signal.reason;
    return value;
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}
export function executeInterruptibleScript<Args extends unknown[], Result>(
  injection: chrome.scripting.ScriptInjection<Args, Result>
): Promise<Array<chrome.scripting.InjectionResult<chrome.scripting.Awaited<Result>>>> {
  return interruptibleApplicationCall(injection.target.tabId, () => chrome.scripting.executeScript(injection));
}
export function sendInterruptibleDebuggerCommand(target: chrome.debugger.Debuggee, method: string, params?: Record<string, unknown>): Promise<unknown> {
  // Release owned focus emulation even after cancellation; this is cleanup,
  // never an input/DOM operation. Debugger.detach itself is not wrapped.
  if (method === "Emulation.setFocusEmulationEnabled" && (params as { enabled?: boolean })?.enabled === false) {
    return chrome.debugger.sendCommand(target, method, params);
  }
  return interruptibleApplicationCall(target.tabId!, () => chrome.debugger.sendCommand(target, method, params));
}

export const INTERRUPTION_JOURNAL_KEY = "autoApplyControlledExecutionsV1";
export const INTERRUPTION_SESSION_KEY = "autoApplyExecutionBrowserSessionV1";
export interface ControlledExecution {
  schemaVersion: "controlled-execution.v1";
  owner: string;
  sessionId: string;
  commandId: string;
  batchId: string;
  batchJobId: string;
  jobId: string;
  tabId: number;
  applicationUrl: string;
  armedAt: string;
  interruptionKind?: InterruptionKind;
  interruptedAt?: string;
}
export function interruptionOwner(c: AutoApplyRuntimeCredential): string {
  return JSON.stringify([c.gatewayBaseUrl, c.tenantId, c.userId, c.deviceId]);
}
export function isControlledReload(event: { tabId: number; frameId: number; transitionType: string; timeStamp: number }, record: ControlledExecution): boolean {
  return event.tabId === record.tabId && event.frameId === 0 && event.transitionType === "reload" &&
    event.timeStamp >= Date.parse(record.armedAt);
}
export function recoveredInterruption(record: ControlledExecution, sessionId: string, tabExists: boolean, browserStartup: boolean): InterruptionKind | null {
  if (record.interruptionKind) return record.interruptionKind;
  if (record.sessionId !== sessionId) return browserStartup ? "browser_session_ended" : "execution_session_ended";
  return tabExists ? null : "tab_closed";
}

/** Only the original, already-produced interruption receipt may leave an
 * expired command outbox through browser-state acknowledgement. Other errors,
 * successes and unknown results retain the existing completion retry policy. */
export function expiredInterruptionReceipt(commandId: string, event: unknown, status: number) {
  if (status !== 409 && status !== 410) return null;
  const object = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const envelope = object(event);
  const result = object(object(envelope?.payload)?.autoApplyResult);
  const details = object(object(result?.evidence)?.failureDetails);
  const kind = details?.interruptionKind;
  if (envelope?.commandId !== commandId || envelope.type !== "browser.batch_auto_apply_job_completed" ||
    result?.schemaVersion !== "auto-apply-job-result.v1" || result.status !== "failed" || result.reasonCode !== "user_interrupted" ||
    !["page_reloaded", "tab_closed", "browser_session_ended", "execution_session_ended"].includes(String(kind)) ||
    ![result.batchId, result.batchJobId, result.jobId].every(value => typeof value === "string" && value)) return null;
  const pageUrl = object(result.evidence)?.pageUrl;
  // No page could be read after closure: the caller must use its durable exact
  // page binding instead of synthesizing a URL from error text.
  return { batchId: result.batchId as string, batchJobId: result.batchJobId as string, jobId: result.jobId as string,
    commandId, outcome: "user_interrupted" as const, interruptionKind: kind as InterruptionKind,
    submissionStarted: details?.submissionStarted === true,
    pageUrl: typeof pageUrl === "string" && /^https?:\/\//.test(pageUrl) ? pageUrl : undefined,
    observedAt: typeof result.occurredAt === "string" ? result.occurredAt : "" };
}
