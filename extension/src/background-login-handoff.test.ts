import { startAutoApplyLeaseWatchdog } from "./auto-apply-lease-watchdog.js";
import { projectCandidateInformation } from "./candidate-information-projection.js";
import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as sessions from "./auto-apply-page-session.js";
import { RecruitingError, toPublicError } from "../../src/errors.js";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.ES2023, true);
function production(name: string, deps: Record<string, unknown> = {}) {
  const node = ast.statements.find(candidate =>
    (ts.isFunctionDeclaration(candidate) || ts.isClassDeclaration(candidate)) && candidate.name?.text === name);
  if (!node) throw new Error(`missing production declaration: ${name}`);
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  return Function(...Object.keys(withInterruptionDependencies(deps)), `${js}; return ${name};`)(...Object.values(withInterruptionDependencies(deps)));
}
const AutoApplyUserActionRequiredError = production("AutoApplyUserActionRequiredError");
const classes = Object.fromEntries(["AutoApplyCancelledError", "AutoApplyCommandExpiredError",
  "AutoApplyUserActionRequiredError"].map(name => [name, production(name)]));
classes.AutoApplyUserActionRequiredError = AutoApplyUserActionRequiredError;
const failureStatus = production("autoApplyFailureStatus", { ...classes, ...sessions, toPublicError,
  AutoApplyDeviceRequestTimeoutError: class extends Error {},
  ...Object.fromEntries(["isUnsupportedRequiredControlFailure", "isDateControlInteractionFailure",
    "isMokaLocationInteractionFailure", "isMokaRecruitingSourceInteractionFailure",
    "isMokaFlatSelectInteractionFailure", "hasRequiredControlUnconfirmedDetails"].map(name => [name, () => false])) });
const ids = { batchId: "batch-1", batchJobId: "item-1", jobId: "job-1" };
const applicationUrl = "https://careers.example.test/jobs/1";
const command = { commandId: "command-1", payload: { ...ids, job: { jobId: ids.jobId, applicationUrl } },
  safety: { allowFinalSubmit: true } };

function harness(input: { observationLogin?: boolean; action?: string; error?: Error; resumed?: boolean;
  success?: boolean; userOwned?: boolean } = {}) {
  let currentSession = input.resumed ? sessions.beginAutoApplySubmission(sessions.createAutoApplyPageSession({
    ...ids, applicationUrl, adapterCode: "generic.v1", tabId: 42, tabOwnership: "plugin"
  }), "submission-1") : null;
  const monitor = new Map<number, unknown>();
  monitor.set(43, { jobId: "unrelated-job" });
  const rememberClosure = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const update = vi.fn(async (_patch: Record<string, unknown>) => undefined);
  const stop = vi.fn(async () => undefined);
  const forget = vi.fn(async (_batch, _item, tabId) => { monitor.delete(tabId); });
  const controls = new Map([[ids.batchId, "continue"]]);
  const observation = { url: "https://careers.example.test/login", pageStage: input.observationLogin ? "login" : "application_form",
    loginRequired: Boolean(input.observationLogin), validationMessages: [], fields: [], actions: [] };
  const deps = { startAutoApplyLeaseWatchdog, projectCandidateInformation, ...sessions, ...classes, toPublicError, autoApplyFailureStatus: failureStatus,
    asRecord: (value: unknown) => value && typeof value === "object" ? value : null,
    applicationAccessHintFromTags: () => "unknown", autoApplyExecutionAbort: undefined,
    autoApplySessionTerminated: false, assertAutoApplyCommandActive: () => {},
    createAutoApplyProgressReporter: () => ({ setStage: vi.fn(), stop }),
    resolveAutoApplyAdapter: () => ({ supported: true, adapterCode: "generic.v1" }),
    recalledAutoApplyPageSession: async () => currentSession, localAutoApplyControl: controls,
    autoApplyControl: async () => "continue", update,
    readExecutionProfile: async (_credential: unknown, candidate: Record<string, unknown>) => candidate.applicationProfile ?? {},
    candidatePackageFromFileRef: async () => ({}), createCandidatePackageFromPayload: () => ({ manualAssist: {} }),
    enrichVisionCandidateFacts: () => ({}), manualAssistResumeFacts: () => ({}),
    createAutoApplyVisionSession: async () => "vision-1", tabFromAutoApplyPageSession: async () => input.resumed ? { id: 42 } : undefined,
    recalledAutoApplyTab: async () => undefined,
    openAutoApplyExecutionSurface: async () => ({ tab: { id: 42 }, createdForExecution: !input.userOwned,
      source: input.resumed ? "bound_task_tab" : "new_background_tab", windowId: 1, windowType: "normal" }),
    persistAutoApplyPageSession: async value => { currentSession = value; },
    rememberAutoApplyTab: async ref => { monitor.set(ref.tabId, ref); },
    forgetAutoApplyTab: forget, waitForTabReady: async () => undefined,
    advanceAutoApplyApplicationEntry: async () => { if (input.error) throw input.error; },
    detectAutoApplySiteSuccess: async () => ({ success: Boolean(input.success), url: applicationUrl }),
    enforceAutoApplyControl: async () => undefined, stableApplicationObservation: async () => observation,
    requestedApplicationEngineFromPayload: () => "legacy",
    detectAutoApplyUserAction: async () => input.action ? { type: input.action, message: "请手动操作" } : null,
    batchResultEvent: production("batchResultEvent", { aiBridgeEvent: production("aiBridgeEvent") }),
    autoApplyDiagnostic: (code: string) => ({ code }), redactedEvidence: async () => ({ screenshotRef: null }),
    requiredFieldRequestsFromFailure: () => [], requiredInformationEvidence: () => ({}),
    attachVisionDiagnosticsToFailure: details => details, visualFailureDetails: () => ({}),
    removeAutoApplyOverlay: async () => undefined, rememberPendingAutoApplyTabClosure: rememberClosure,
    closeAutoApplyExecutionSurface: close, defaults: { autoApplyRuntime: { status: "idle" } },
    chrome: { tabs: { get: async () => ({ id: 42, url: observation.url }) } }
  };
  const execute = production("executeLegacyBatchAutoApplyJob", deps);
  return { execute: () => execute(command, {}), monitor, rememberClosure, close, update, stop, forget, controls,
    get session() { return currentSession; }, deps };
}

describe("production automatic-application login handoff", () => {
  it.each([
    { label: "stable login page", observationLogin: true },
    { label: "initial human login gate", action: "login" },
    { label: "submitted task reconciliation", action: "login", resumed: true },
    { label: "entry login exception", error: new AutoApplyUserActionRequiredError("login", "需要登录") },
    { label: "public LOGIN_REQUIRED error", error: new RecruitingError({ code: "LOGIN_REQUIRED", stage: "login",
      message: "需要登录", retryable: true, userAction: "登录后重新投递" }) }
  ])("retains $label, removes its monitor and releases execution", async input => {
    const h = harness(input);
    const event = await h.execute();
    expect(event.payload.autoApplyResult).toMatchObject({ ...ids, status: "failed", reasonCode: "login_required" });
    expect(event.payload.autoApplyResult.evidence.userActionRequired).toBeUndefined();
    expect(h.session).toMatchObject({ stage: "failed", tabId: 42, waitingFor: null });
    if (input.resumed) expect(h.session?.submissionAttemptId).toBe("submission-1");
    expect(h.forget).toHaveBeenCalledExactlyOnceWith(ids.batchId, ids.batchJobId, 42);
    expect([...h.monitor.keys()]).toEqual([43]);
    expect(h.close).not.toHaveBeenCalled();
    expect(h.rememberClosure).toHaveBeenCalledExactlyOnceWith({ commandId: "command-1", ...ids, applicationUrl, tabId: 42 });
    expect(h.stop).toHaveBeenCalledOnce();
    expect(h.controls.has(ids.batchId)).toBe(false);
    expect(h.update).toHaveBeenCalledWith({ activeApplication: null });
    expect(h.update.mock.calls.at(-1)?.[0]).toMatchObject({ autoApplyRuntime: { connection: "ready", status: "idle" } });
  });

  it.each([
    { label: "CAPTCHA", action: "captcha", status: "waiting_for_user_action", reasonCode: "captcha_required", queued: false },
    { label: "identity verification", action: "identity_verification", status: "failed", reasonCode: "identity_verification_required", queued: true },
    { label: "success", success: true, status: "succeeded", reasonCode: null, queued: true },
    { label: "uncertain submitted login exception", resumed: true,
      error: new AutoApplyUserActionRequiredError("login", "需要登录"), status: "failed", reasonCode: "submission_outcome_unknown", queued: true }
  ])("preserves existing handling for $label", async input => {
    const h = harness(input);
    const event = await h.execute();
    expect(event.payload.autoApplyResult).toMatchObject({ status: input.status, reasonCode: input.reasonCode });
    expect(h.forget).not.toHaveBeenCalled();
    expect(h.rememberClosure).toHaveBeenCalledTimes(input.queued ? 1 : 0);
    expect(h.close).not.toHaveBeenCalled();
    expect([...h.monitor.keys()]).toEqual([43, 42]);
  });

  it("retains a user-owned login tab without scheduling any automatic close", async () => {
    const h = harness({ observationLogin: true, userOwned: true });
    await h.execute();
    expect(h.session).toMatchObject({ tabId: 42, tabOwnership: "user", stage: "failed" });
    expect(h.rememberClosure).not.toHaveBeenCalled();
    expect(h.close).not.toHaveBeenCalled();
    expect([...h.monitor.keys()]).toEqual([43]);
  });

  it("retains a confirmed post-submit login gate and its duplicate-submit checkpoint", async () => {
    // Execute the production post-submit branch and the same production finally
    // block without simulating unrelated field-filling and submit Drivers.
    const h = harness({ resumed: true });
    const jobNode = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "executeLegacyBatchAutoApplyJob") as ts.FunctionDeclaration;
    const tryNode = jobNode.body!.statements.find(ts.isTryStatement)!;
    const handoff = tryNode.tryBlock.statements.find(node => ts.isIfStatement(node) &&
      node.expression.getText(ast).startsWith('submitResult.observedResult === "waiting_for_user_action"'))!;
    const body = `try { ${handoff.getText(ast)} } finally ${tryNode.finallyBlock!.getText(ast)}`;
    const cleanup = vi.fn(async () => undefined);
    const deps = { ...h.deps, ...ids, applicationUrl, command, tabId: 42, ownsTab: true,
      pageSession: h.session, tabResultDisposition: "default", lease: undefined, leaseWatchdog: null, executionSignal: undefined,
      closeExpiredExecutionSurface: () => {}, recoveryReload: undefined, progressReporter: null,
      submitResult: { observedResult: "waiting_for_user_action", userActionRequired: { type: "login" },
        pageUrlAfterClick: "https://careers.example.test/login", validationMonitor: { token: "probe" } },
      cleanupSubmissionValidationMonitor: cleanup };
    const js = ts.transpileModule(`async function run() { ${body} }`, {
      compilerOptions: { target: ts.ScriptTarget.ES2023 }
    }).outputText;
    const event = await Function(...Object.keys(withInterruptionDependencies(deps)), `${js}; return run();`)(...Object.values(withInterruptionDependencies(deps)));
    expect(event.payload.autoApplyResult).toMatchObject({ status: "failed", reasonCode: "login_required" });
    expect(h.session).toMatchObject({ tabId: 42, stage: "failed", submissionAttemptId: "submission-1" });
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(42, { token: "probe" });
    expect(h.forget).toHaveBeenCalledExactlyOnceWith(ids.batchId, ids.batchJobId, 42);
    expect(h.close).not.toHaveBeenCalled();
  });
});
