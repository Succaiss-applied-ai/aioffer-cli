import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { AutoApplyJobStop } from "./auto-apply-client.js";

const source = ts.createSourceFile("background.ts", readFileSync(new URL("./background.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const node = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === "cleanupStoppedAutoApplyJob")!;
const code = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
const stop: AutoApplyJobStop = { batchId: "batch", batchJobId: "one", jobId: "job-one", commandId: "command-one", requestId: "stop-one", requestedAt: "2026-09-09T00:00:00Z" };
function fixture() {
  const ref = { ...stop, tabId: 10, tabOwnership: "plugin" };
  const session = { ...stop, tabId: 10, tabOwnership: "plugin", confirmedAnswers: ["keep"], terminalOutcome: "succeeded" };
  const refs = { "batch:one": ref, "batch:two": { tabId: 20, commandId: "command-two" } };
  const sessions = { one: session, two: { batchId: "batch", batchJobId: "two", jobId: "job-two", tabId: 20 } };
  const tabs = new Set([10, 20]);
  const dependencies = {
    autoApplyTabReconciliationRunning: false,
    reconcilePersistedAutoApplyTabs: vi.fn(async () => undefined),
    autoApplyTabRefKey: (batch: string, job: string) => `${batch}:${job}`,
    autoApplyStoppingJobs: new Set<string>(), controlledExecutions: new Map(),
    autoApplyTabRefsStorageKey: "refs", AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY: "sessions", INTERRUPTION_JOURNAL_KEY: "journal",
    asRecord: (value: unknown) => value,
    chrome: { storage: { local: { get: async () => ({ refs, sessions, journal: {} }) } }, tabs: { get: async (tabId: number) => tabs.has(tabId) ? { id: tabId } : undefined } },
    autoApplyPageSessionFromStored: (value: unknown) => value,
    interruptionOwner: () => "owner",
    autoApplyTabOutcomeReporting: new Set<number>(), autoApplyActiveSubmissionTabs: new Set<number>(),
    applicationCallsSettled: vi.fn(() => true), cleanupSubmissionValidationMonitor: vi.fn(async () => undefined),
    removeAutoApplyOverlay: vi.fn(async () => undefined), persistedAutoApplyTabOwnedByPlugin: () => true,
    rememberAutoApplyTabCloseIntent: vi.fn(),
    closeAutoApplyExecutionSurface: vi.fn(async (_: unknown, input: { tabId: number }) => { tabs.delete(input.tabId); }),
    persistAutoApplyPageSession: vi.fn(async () => undefined),
    updateAutoApplyPageSession: (current: object, patch: object) => ({ ...current, ...patch }),
    forgetAutoApplyTab: vi.fn(async () => undefined), forgetControlledExecution: vi.fn(async () => undefined)
  };
  const run = () => new Function(...Object.keys(dependencies), `${code};return cleanupStoppedAutoApplyJob;`)(...Object.values(dependencies))(stop, {});
  return { run, dependencies, ref, session, tabs };
}
describe("production job stop cleanup", () => {
  it("closes only the exact owned page and retains answers and confirmed receipt", async () => {
    const { run, dependencies: deps, tabs } = fixture();
    expect(await run()).toBe(true);
    expect(deps.closeAutoApplyExecutionSurface).toHaveBeenCalledTimes(1);
    expect(deps.closeAutoApplyExecutionSurface).toHaveBeenCalledWith(deps.chrome, { tabId: 10 });
    expect(tabs.has(20)).toBe(true);
    expect(deps.persistAutoApplyPageSession).toHaveBeenCalledWith(expect.objectContaining({ tabId: null, confirmedAnswers: ["keep"], terminalOutcome: "succeeded" }));
    expect(deps.forgetAutoApplyTab).toHaveBeenCalledWith("batch", "one", 10);
  });
  it.each(["browser-pending", "monitor-running", "close-failed", "wrong-command"])("never confirms %s", async (scenario) => {
    const { run, dependencies: deps, ref } = fixture();
    if (scenario === "browser-pending") deps.applicationCallsSettled.mockReturnValue(false);
    if (scenario === "monitor-running") deps.autoApplyTabReconciliationRunning = true;
    if (scenario === "close-failed") deps.closeAutoApplyExecutionSurface.mockImplementation(async () => undefined);
    if (scenario === "wrong-command") ref.commandId = "newer-command";
    expect(await run()).toBe(false);
    expect(deps.forgetAutoApplyTab).not.toHaveBeenCalled();
    expect(deps.forgetControlledExecution).not.toHaveBeenCalled();
  });
});
