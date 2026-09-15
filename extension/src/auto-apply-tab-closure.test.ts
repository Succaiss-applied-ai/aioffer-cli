import { createAutoApplyCompletionOutbox } from "./auto-apply-completion-outbox.js";
import { createAutoApplyStorageQueue } from "./auto-apply-storage-queue.js";
import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { createAutoApplyPageSession, failAutoApplyPageSession, updateAutoApplyPageSession } from "./auto-apply-page-session.js";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.ES2023, true);

function production(name: string, deps: Record<string, unknown>) {
  const node = ast.statements.find(candidate =>
    ts.isFunctionDeclaration(candidate) && candidate.name?.text === name
  );
  if (!node) throw new Error(`missing production function: ${name}`);
  const js = ts.transpileModule(node.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2023 }
  }).outputText;
  return new Function(...Object.keys(withInterruptionDependencies(deps)), `${js}; return ${name};`)(...Object.values(withInterruptionDependencies(deps)));
}

class CompletionRejected extends Error {
  constructor(readonly status: number) {
    super(`completion rejected: ${status}`);
  }
}

function outboxDependencies(chrome: any, extras: Record<string, unknown> = {}) {
  let now = Date.now();
  const box = createAutoApplyCompletionOutbox(chrome.storage.local, () => now);
  return { autoApplyCompletionOutbox: box, autoApplyCompletionOwner: () => "owner",
    autoApplyLifecycleGeneration: 0, autoApplySessionTerminated: false,
    retry: () => { now += 300_000; }, ...extras };
}

function receiptHarness() {
  const stored: Record<string, any> = { outbox: { schemaVersion: "auto-apply-completion-outbox.v1",
    commandId: "command-1", event: {}, createdAt: new Date().toISOString() } };
  const chrome = { storage: { local: {
    get: async defaults => ({ ...defaults, autoApplyCompletionOutbox: stored.outbox,
      autoApplyCompletionOutboxV2: stored.autoApplyCompletionOutboxV2 }),
    set: async value => { Object.assign(stored, value); if ("autoApplyCompletionOutbox" in value) stored.outbox = value.autoApplyCompletionOutbox; }
  } } };
  const complete = vi.fn(async () => undefined), finalize = vi.fn(async () => undefined), forget = vi.fn(async () => undefined);
  const deps = outboxDependencies(chrome, { completeAutoApplyCommand: complete,
    finalizeAcknowledgedAutoApplyTabClosure: finalize, forgetControlledExecution: forget,
    AutoApplyCommandCompletionRejectedError: CompletionRejected,
    readPendingAutoApplyTabClosure: async () => ({ commandId: "command-1", tabId: 42 }), chrome });
  return { stored, complete, finalize, forget, deps, run: production("flushAutoApplyCompletionOutbox", deps) };
}

describe("AI Offer acknowledged tab closure", () => {
  it("closes only after command completion is accepted and then clears only that receipt", async () => {
    const h = receiptHarness();
    const order: string[] = [];
    h.complete.mockImplementation(async () => { order.push("gateway-accepted"); });
    h.finalize.mockImplementation(async () => { order.push("tab-closed"); });
    h.forget.mockImplementation(async () => { order.push("execution-forgotten"); });
    expect(await h.run({})).toEqual({ blockedCommandIds: [], lastError: null });
    expect(order).toEqual(["gateway-accepted", "tab-closed", "execution-forgotten"]);
    expect(await h.deps.autoApplyCompletionOutbox.pending("owner")).toEqual([]);
  });

  it("does not close or clear when AI Offer has not accepted the result", async () => {
    const h = receiptHarness();
    h.complete.mockRejectedValue(new Error("network unavailable"));
    expect(await h.run({})).toEqual({ blockedCommandIds: ["command-1"], lastError: "network unavailable" });
    expect(h.finalize).not.toHaveBeenCalled();
    expect(h.forget).not.toHaveBeenCalled();
    expect(await h.deps.autoApplyCompletionOutbox.pending("owner")).toMatchObject([{ commandId: "command-1", event: {} }]);
  });

  it("releases an accepted command after a cleanup error and keeps the cleanup diagnosis", async () => {
    const h = receiptHarness();
    h.finalize.mockRejectedValue(new Error("close timeout"));
    await h.run({}); await h.run({});
    expect(h.complete).toHaveBeenCalledOnce();
    expect(h.forget).toHaveBeenCalledExactlyOnceWith("command-1");
    expect(await h.deps.autoApplyCompletionOutbox.pending("owner")).toEqual([]);
    expect(h.stored.autoApplyAcknowledgedCleanupFailure).toMatchObject({ commandId: "command-1", closure: { tabId: 42 }, message: "close timeout" });
  });

  it.each([404, 409, 410])("preserves receipt and page on HTTP %s without assuming acknowledgement", async status => {
    const h = receiptHarness();
    h.complete.mockRejectedValue(new CompletionRejected(status));
    expect(await h.run({})).toMatchObject({ blockedCommandIds: ["command-1"] });
    expect(h.finalize).not.toHaveBeenCalled();
    expect(h.forget).not.toHaveBeenCalled();
    expect(await h.deps.autoApplyCompletionOutbox.pending("owner")).toMatchObject([{ commandId: "command-1", event: {} }]);
  });
});

function acknowledgedPage(status = "failed", reasonCode: string | null = "login_required") {
  const ids = { batchId: "batch-1", batchJobId: "item-1", jobId: "job-1" };
  const applicationUrl = "https://careers.example.test/jobs/1";
  const closure = { schemaVersion: "auto-apply-pending-tab-closure.v1", commandId: "command-1",
    ...ids, applicationUrl, tabId: 42, createdAt: new Date().toISOString() };
  const event = { commandId: "command-1", type: "browser.batch_auto_apply_job_completed",
    payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", ...ids, status, reasonCode } } };
  // JSON round-trip represents the old v1 record and outbox after worker restart.
  const stored: Record<string, any> = JSON.parse(JSON.stringify({ closure,
    autoApplyCompletionOutbox: { schemaVersion: "auto-apply-completion-outbox.v1", commandId: "command-1", event }, refs: {
      "batch-1:item-1": { ...ids, tabId: 42 },
      "batch-1:item-2": { ...ids, batchJobId: "item-2", jobId: "job-2", tabId: 43 }
    } }));
  let pageSession = failAutoApplyPageSession(createAutoApplyPageSession({ ...ids,
    applicationUrl, adapterCode: "generic.v1", tabId: 42, tabOwnership: "plugin" }));
  const close = vi.fn(async () => undefined);
  const persist = vi.fn(async value => { pageSession = value; });
  const alarm = vi.fn(async () => true);
  const chrome = { storage: { local: {
    get: async defaults => Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, stored[key] ?? fallback])),
    set: async value => { Object.assign(stored, value); }
  } }, tabs: { get: vi.fn(async () => undefined) }, alarms: { clear: alarm } };
  const asRecord = (value: unknown) => value && typeof value === "object" ? value : null;
  const forget = production("forgetAutoApplyTab", { chrome, asRecord,
    autoApplyStorageQueue: async (_key, work) => work(), autoApplyTabRefsStorageKey: "refs",
    autoApplyTabRefKey: (batch, job) => `${batch}:${job}`,
    submissionReceiptAlarmName: (batch, job) => `${batch}:${job}` });
  const closureDeps: Record<string, unknown> = { chrome, asRecord,
    autoApplyPendingTabClosureStorageKey: "closure", autoApplyPendingTabClosuresStorageKey: "closures",
    autoApplyStorageQueue: createAutoApplyStorageQueue(),
    autoApplyLifecycleGeneration: 0, autoApplySessionTerminated: false };
  closureDeps.pendingAutoApplyTabClosures = production("pendingAutoApplyTabClosures", closureDeps);
  closureDeps.readPendingAutoApplyTabClosure = production("readPendingAutoApplyTabClosure", closureDeps);
  closureDeps.clearPendingAutoApplyTabClosure = production("clearPendingAutoApplyTabClosure", closureDeps);
  const finalize = production("finalizeAcknowledgedAutoApplyTabClosure", { ...closureDeps, chrome, asRecord,
    autoApplyPendingTabClosureStorageKey: "closure", recalledAutoApplyPageSession: async () => pageSession,
    forgetAutoApplyTab: forget, persistAutoApplyPageSession: persist, updateAutoApplyPageSession,
    rememberAutoApplyTabCloseIntent: vi.fn(), closeAutoApplyExecutionSurface: close });
  const accepted = vi.fn(async () => undefined);
  const deps = outboxDependencies(chrome, { chrome, ...closureDeps,
    completeAutoApplyCommand: accepted, finalizeAcknowledgedAutoApplyTabClosure: finalize });
  const flush = production("flushAutoApplyCompletionOutbox", deps);
  return { stored, close, persist, alarm, flush, accepted, chrome, retry: deps.retry,
    pending: () => deps.autoApplyCompletionOutbox.pending("owner"), closureDeps,
    get session() { return pageSession; } };
}

describe("acknowledged login page handoff", () => {
  it("retains the original login document after a persisted outbox is acknowledged and disarms only its monitor", async () => {
    const h = acknowledgedPage();
    await h.flush({});
    expect(h.accepted).toHaveBeenCalledOnce();
    expect(h.close).not.toHaveBeenCalled();
    expect(h.chrome.tabs.get).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.session).toMatchObject({ tabId: 42, stage: "failed", waitingFor: null });
    expect(h.stored).toMatchObject({ closure: null, autoApplyCompletionOutbox: null, refs: {
      "batch-1:item-2": { tabId: 43, jobId: "job-2" }
    } });
    expect(Object.keys(h.stored.refs)).toEqual(["batch-1:item-2"]);
    expect(h.alarm).toHaveBeenCalledExactlyOnceWith("batch-1:item-1");
    await h.flush({});
    expect(h.accepted).toHaveBeenCalledOnce();
    expect(h.close).not.toHaveBeenCalled();
  });

  it("keeps the login page and durable result through transport failure, then completes the handoff on retry", async () => {
    const h = acknowledgedPage();
    h.accepted.mockRejectedValueOnce(new Error("network unavailable"));
    expect(await h.flush({})).toMatchObject({ blockedCommandIds: ["command-1"], lastError: "network unavailable" });
    expect(await h.pending()).toHaveLength(1);
    expect(h.stored.closure).not.toBeNull();
    expect(h.close).not.toHaveBeenCalled();
    h.retry();
    await h.flush({});
    expect(await h.pending()).toEqual([]);
    expect(h.close).not.toHaveBeenCalled();
    expect(h.session.tabId).toBe(42);
  });

  it.each([
    ["succeeded", null], ["succeeded", "already_applied"], ["failed", "control_interaction_failed"],
    ["failed", "identity_verification_required"], ["failed", "site_application_limit_reached"],
    ["failed", "submission_outcome_unknown"], ["waiting_for_user_action", "missing_information"]
  ])("preserves acknowledged cleanup for %s/%s", async (status, reasonCode) => {
    const h = acknowledgedPage(status!, reasonCode);
    await h.flush({});
    expect(h.close).toHaveBeenCalledExactlyOnceWith(h.chrome, { tabId: 42, acknowledgedApplicationUrl: "https://careers.example.test/jobs/1" });
    expect(h.session.tabId).toBeNull();
    expect(await h.pending()).toEqual([]);
    expect(h.stored.refs["batch-1:item-2"].tabId).toBe(43);
  });

  it("does not touch another command's pending page or monitor", async () => {
    const h = acknowledgedPage();
    h.stored.closure.commandId = "other-command";
    await h.flush({});
    expect(h.close).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.alarm).not.toHaveBeenCalled();
    expect(h.stored.closures["other-command"].commandId).toBe("other-command");
    expect(h.stored.refs["batch-1:item-1"].tabId).toBe(42);
  });

  it("never treats login text in ordinary failure evidence as a login handoff", async () => {
    const h = acknowledgedPage("failed", "control_interaction_failed");
    h.stored.autoApplyCompletionOutbox.event.payload.autoApplyResult.evidence = { reasonCode: "login_required", message: "登录" };
    await h.flush({});
    expect(h.close).toHaveBeenCalledOnce();
  });
});


describe("per-command pending tab closure persistence", () => {
  it("keeps two pending closures and removes only the exactly acknowledged command", async () => {
    const h = acknowledgedPage();
    const remember = production("rememberPendingAutoApplyTabClosure", h.closureDeps);
    await remember({ commandId: "command-2", batchId: "batch-2", batchJobId: "item-2", jobId: "job-2",
      applicationUrl: "https://other.test/apply", tabId: 99 });
    expect(h.stored.closure).toBeNull();
    expect(h.stored.closures).toMatchObject({ "command-1": { tabId: 42 }, "command-2": { tabId: 99 } });
    await h.flush({});
    expect(h.stored.closures).toEqual({ "command-2": expect.objectContaining({ tabId: 99 }) });
    expect(h.close).not.toHaveBeenCalled();
  });
});
