import { AutoApplyJobStoppedError } from "../auto-apply-job-stop.js";
import { AutoApplyCommandCompletionRejectedError } from "../auto-apply-client.js";
import { expiredInterruptionReceipt, AutoApplyUserInterruptedError, interruptionDiagnostic, interruptibleApplicationCall } from "../auto-apply-interruption.js";
import { needsFeishuSelectorDiscovery, isFeishuLocationTree } from "../control-adapters/feishu-selector-discovery.js";
import { prepareFeishuSelectorInTab } from "../control-adapters/feishu-selector-discovery-runtime.js";
import { submissionPhaseCall } from "../auto-apply-submit-lifecycle.js";

/** Source-extraction tests do not execute ES imports. Supply the new browser
 * boundary using their existing Chrome stub and the production cancellation
 * primitive; their original event/readback/business assertions stay intact. */
export function withInterruptionDependencies(deps: Record<string, unknown>): Record<string, unknown> {
  const api = () => (deps.chrome ?? globalThis.chrome) as typeof chrome;
  return {
    // Optional new post-submit capability. Old command fixtures stay disabled;
    // all their original receipt, click and handoff assertions remain intact.
    needsFeishuSelectorDiscovery, isFeishuLocationTree, prepareFeishuSelectorInTab,
    captchaContext: undefined,
    submissionSignal: undefined,
    submissionPhaseCall,
    // Partial-body submit tests omit the local wrappers. Keep the same Chrome
    // stubs and production fences; their original click/receipt assertions stay.
    executeSubmissionScript: (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) =>
      submissionPhaseCall(deps.submissionSignal as AbortSignal | undefined, () =>
        interruptibleApplicationCall(injection.target.tabId, () => api().scripting.executeScript(injection))),
    sendSubmissionCommand: (target: chrome.debugger.Debuggee, method: string, params?: Record<string, unknown>) =>
      submissionPhaseCall(deps.submissionSignal as AbortSignal | undefined, () =>
        interruptibleApplicationCall(target.tabId!, () => api().debugger.sendCommand(target, method, params))),
    AutoApplyJobStoppedError,
    autoApplyStoppingJobs: new Set<string>(),
    autoApplyTabRefKey: (batchId: string, batchJobId: string) => `${batchId}:${batchJobId}`,
    reconcileStoppedAutoApplyJobs: async () => undefined,
    watchAutoApplyJobStop: async () => () => undefined,
    pendingAutoApplyJobStops: async () => [],
    AutoApplyCommandCompletionRejectedError, expiredInterruptionReceipt, AutoApplyUserInterruptedError, interruptionDiagnostic,
    controlledExecution: undefined,
    forgetControlledExecution: async () => undefined,
    reconcileControlledExecutions: async () => undefined,
    executeInterruptibleScript: (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) =>
      interruptibleApplicationCall(injection.target.tabId, () => api().scripting.executeScript(injection)),
    sendInterruptibleDebuggerCommand: (target: chrome.debugger.Debuggee, method: string, params?: Record<string, unknown>) =>
      interruptibleApplicationCall(target.tabId!, () => api().debugger.sendCommand(target, method, params)),
    ...deps
  };
}
