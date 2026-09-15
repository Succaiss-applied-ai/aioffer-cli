import { createAutoApplyCompletionOutbox } from "./auto-apply-completion-outbox.js";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { expiredInterruptionReceipt, AutoApplyUserInterruptedError, interruptionOwner, recoveredInterruption, isControlledReload,
  INTERRUPTION_JOURNAL_KEY, INTERRUPTION_SESSION_KEY, type ControlledExecution } from "./auto-apply-interruption.js";
import { createAutoApplyPageSession, failAutoApplyPageSession, updateAutoApplyPageSession } from "./auto-apply-page-session.js";
import { createAutoApplyStorageQueue } from "./auto-apply-storage-queue.js";

const ast = ts.createSourceFile("background.ts", readFileSync(new URL("./background.ts", import.meta.url), "utf8"), ts.ScriptTarget.ES2023, true);
function production(name: string, deps: Record<string, unknown>) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  return Function(...Object.keys(deps), `${js}; return ${name}`)(...Object.values(deps));
}
const credential = { schemaVersion: "auto-apply-runtime-credential.v1" as const, gatewayBaseUrl: "https://gw.test", tenantId: "tenant", userId: "user", deviceId: "device", deviceToken: "not-stored", pairedAt: "now" };
const record: ControlledExecution = { schemaVersion: "controlled-execution.v1", owner: interruptionOwner(credential), sessionId: "browser-1",
  commandId: "command-1", batchId: "batch", batchJobId: "item", jobId: "job", tabId: 42,
  applicationUrl: "https://ats.test/apply", armedAt: "2026-09-08T00:00:00Z" };
function harness(options: { browserSession?: string; tabExists?: boolean; terminal?: boolean; newCommand?: boolean; handoff?: boolean; persistedKind?: ControlledExecution["interruptionKind"] } = {}) {
  const journal: Record<string, unknown> = { [record.commandId]: { ...record, interruptionKind: options.persistedKind } };
  const storage: Record<string, unknown> = { [INTERRUPTION_JOURNAL_KEY]: journal, refs: { "batch:item": { ...record, commandId: options.newCommand ? "command-2" : record.commandId } } };
  const chrome = { storage: { local: {
    get: vi.fn(async () => ({ ...storage })),
    set: vi.fn(async (next: object) => { Object.assign(storage, next); })
  } }, tabs: { get: vi.fn(async () => options.tabExists === false ? Promise.reject(new Error("closed")) : { id: 42, url: record.applicationUrl }) } };
  const session = updateAutoApplyPageSession(createAutoApplyPageSession({ ...record, adapterCode: "generic.web.v1", tabOwnership: "plugin" }), {
    stage: options.handoff ? "waiting_for_user_action" : "filling", waitingFor: options.handoff ? "captcha" : null,
    terminalOutcome: options.terminal ? "succeeded" : null
  });
  const report = vi.fn(async () => undefined), save = vi.fn(async () => true), forgetTab = vi.fn(async () => undefined);
  const deps: Record<string, unknown> = { chrome, INTERRUPTION_JOURNAL_KEY, INTERRUPTION_SESSION_KEY,
    autoApplyLifecycleGeneration: 0, autoApplySessionTerminated: false,
    interruptionBrowserStartup: true, currentInterruptionSession: async () => options.browserSession ?? "browser-1",
    controlledExecutions: new Map(), autoApplyTabCloseIntent: new Map(),
    autoApplyTabRefsStorageKey: "refs", autoApplyTabRefKey: (a: string,b: string) => `${a}:${b}`,
    asRecord: (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v : null,
    interruptionOwner, recoveredInterruption, isControlledReload, AutoApplyUserInterruptedError,
    autoApplyStorageQueue: createAutoApplyStorageQueue(),
    recalledAutoApplyPageSession: async () => session,
    observedAutoApplyTerminalNavigation: () => null, reconcilePersistedAutoApplyTabs: vi.fn(),
    reportAutoApplyBrowserState: report, persistAutoApplyPageSession: save, failAutoApplyPageSession,
    forgetAutoApplyTab: forgetTab
  };
  deps.writeControlledExecution = production("writeControlledExecution", deps);
  deps.forgetControlledExecution = production("forgetControlledExecution", deps);
  return { record: journal[record.commandId] as ControlledExecution, storage, chrome, session, deps, report, save, forgetTab,
    run: () => production("reconcileControlledExecutions", deps)(credential) };
}
describe("production interruption callbacks and replay", () => {
  it("reconciles an expired user-interruption outbox before clearing it, keeping ordinary rejected completions unchanged", async () => {
    class Rejected extends Error { constructor(readonly status: number) { super("rejected"); } }
    const event = { commandId: "command", type: "browser.batch_auto_apply_job_completed", payload: {
      autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: "batch", batchJobId: "item", jobId: "job", status: "failed",
        reasonCode: "user_interrupted", occurredAt: "2026-09-08T00:00:00Z", evidence: { pageUrl: "https://ats.test/apply",
          failureDetails: { interruptionKind: "tab_closed", submissionStarted: false } } } } };
    const order: string[] = [];
    let now = Date.now();
    const stored: Record<string, unknown> = {};
    const box = createAutoApplyCompletionOutbox({
      get: async defaults => ({ ...defaults, ...stored }),
      set: async value => { Object.assign(stored, structuredClone(value)); }
    }, () => now);
    await box.enqueue("owner", "command", event);
    const run = production("flushAutoApplyCompletionOutbox", {
      autoApplyCompletionOutbox: box, autoApplyCompletionOwner: () => "owner",
      autoApplyLifecycleGeneration: 0, autoApplySessionTerminated: false,
      completeAutoApplyCommand: async () => { throw new Rejected(410); },
      AutoApplyCommandCompletionRejectedError: Rejected, expiredInterruptionReceipt,
      reportAutoApplyBrowserState: async () => { order.push("accepted-by-original-receipt-channel"); },
      finalizeAcknowledgedAutoApplyTabClosure: async () => { order.push("cleanup"); },
      forgetControlledExecution: async () => { order.push("journal-cleared"); },
      autoApplyCompletionOutboxStorageKey: "outbox",
      chrome: { storage: { local: { set: async () => { order.push("outbox-cleared"); } } } }
    });
    await run(credential);
    expect(order).toEqual(["accepted-by-original-receipt-channel", "cleanup", "journal-cleared"]);
    expect(await box.pending("owner")).toEqual([]);
    order.length = 0; event.payload.autoApplyResult.reasonCode = "submission_outcome_unknown";
    await box.enqueue("owner", "command", event);
    expect(await run(credential)).toMatchObject({ blockedCommandIds: ["command"], lastError: "rejected" });
    expect(await box.pending("owner")).toMatchObject([{ event }]);
    expect(order).toEqual([]);
  });

  it.each(["page_reloaded", "tab_closed"] as const)("stops the active fill synchronously and persists %s", async kind => {
    const h = harness(), pageAbort = new AbortController(), commandAbort = new AbortController();
    (h.deps.controlledExecutions as Map<number, unknown>).set(42, { record, controller: pageAbort, executionAbort: commandAbort, isControlled: () => true });
    production("interruptControlledExecution", h.deps)(42, kind);
    expect(pageAbort.signal.reason).toMatchObject({ kind });
    expect(commandAbort.signal.reason).toBe(pageAbort.signal.reason);
    await (h.deps.autoApplyStorageQueue as ReturnType<typeof createAutoApplyStorageQueue>)(INTERRUPTION_JOURNAL_KEY, async () => undefined);
    expect((h.storage[INTERRUPTION_JOURNAL_KEY] as Record<string, ControlledExecution>)[record.commandId]).toMatchObject({ interruptionKind: kind });
  });
  it("ignores other tabs, explicit cleanup and human handoffs", () => {
    const h = harness(), controller = new AbortController();
    const active = { record, controller, isControlled: () => false };
    (h.deps.controlledExecutions as Map<number, unknown>).set(42, active);
    const interrupt = production("interruptControlledExecution", h.deps);
    interrupt(42, "tab_closed"); interrupt(43, "tab_closed");
    active.isControlled = () => true;
    (h.deps.autoApplyTabCloseIntent as Map<number, string>).set(42, "terminal_outcome");
    interrupt(42, "tab_closed");
    expect(controller.signal.aborted).toBe(false);
  });
  it.each([{ browserSession: "browser-2" }, { tabExists: false }, { persistedKind: "page_reloaded" as const }])(
    "replays only a bound original receipt, never opens or refills a page: %j", async options => {
      const h = harness(options); await h.run();
      expect(h.report).toHaveBeenCalledOnce();
      expect(h.report.mock.calls[0]).toMatchObject([credential, { commandId: "command-1", outcome: "user_interrupted", submissionStarted: false }]);
      expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ stage: "failed" }));
      expect(h.storage[INTERRUPTION_JOURNAL_KEY]).toEqual({});
      expect(Object.keys(h.chrome.tabs)).toEqual(["get"]);
      await h.run(); expect(h.report).toHaveBeenCalledOnce();
    }
  );
  it.each([{ terminal: true }, { handoff: true }, { newCommand: true }, {}])(
    "does not overwrite success, manual waiting, newer command or a surviving worker session: %j", async options => {
      const h = harness({ browserSession: "browser-2", ...options });
      if (!Object.keys(options).length) h.deps.currentInterruptionSession = async () => "browser-1";
      await h.run(); expect(h.report).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled(); expect(h.forgetTab).not.toHaveBeenCalled();
    }
  );
  it("keeps the event on transport failure and does not use another owner's record", async () => {
    const h = harness({ browserSession: "browser-2" });
    h.report.mockRejectedValueOnce(new Error("offline"));
    await expect(h.run()).rejects.toThrow("offline");
    expect(h.save).not.toHaveBeenCalled();
    expect((h.storage[INTERRUPTION_JOURNAL_KEY] as Record<string, ControlledExecution>)[record.commandId]?.interruptionKind).toBe("browser_session_ended");
    await h.run(); expect(h.report).toHaveBeenCalledTimes(2);
    const other = harness({ browserSession: "browser-2" }); other.record.owner = "another-owner";
    await other.run(); expect(other.report).not.toHaveBeenCalled();
  });
  it("retains a known success navigation for the existing receipt reconciler", async () => {
    const h = harness({ browserSession: "browser-2" });
    h.deps.observedAutoApplyTerminalNavigation = () => ({ outcome: "succeeded" });
    await h.run(); expect(h.report).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
    expect(h.deps.reconcilePersistedAutoApplyTabs).toHaveBeenCalledWith(42);
  });
  it("persists reload when the event wakes a worker, without treating a normal navigation as reload", async () => {
    const h = harness(); const run = production("persistControlledReload", h.deps);
    const event = { tabId: 42, frameId: 0, transitionType: "link", timeStamp: Date.parse(record.armedAt) + 1 };
    await run(event); expect(h.chrome.storage.local.set).not.toHaveBeenCalled();
    await run({ ...event, transitionType: "reload" }); await h.run();
    expect(h.report.mock.calls[0]).toMatchObject([credential, { interruptionKind: "page_reloaded" }]);
  });
});
