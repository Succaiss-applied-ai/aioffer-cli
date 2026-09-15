import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { waitAutoApplyForUser } from "./auto-apply-page-session.js";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.ES2023, true);
function monitor(deps: Record<string, unknown>) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "reconcilePersistedAutoApplyTabs")!;
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  return Function(...Object.keys(deps), `${js}; return reconcilePersistedAutoApplyTabs;`)(...Object.values(deps));
}
function fixture() {
  let ref: any = { batchId: "b", batchJobId: "j", jobId: "job", commandId: "command", tabId: 7,
    applicationUrl: "https://app.mokahr.com/campus-recruitment/dolphindb/101962#/job/job/apply",
    updatedAt: new Date().toISOString(), monitorMode: "submission_receipt", receiptDeadlineAt: new Date(0).toISOString() };
  let session: any = { tabId: 7, stage: "reconciling", submissionAttemptId: "attempt", submitInitiatedAt: new Date().toISOString() };
  const captcha = { type: "captcha", message: "请完成安全验证" };
  const report = vi.fn(async () => undefined);
  const retire = vi.fn();
  const cleanup = vi.fn();
  const alarm = vi.fn();
  const lateFields = vi.fn();
  const remember = vi.fn(async (value: any) => { ref = value; });
  const detect = vi.fn(async () => captcha);
  const stopping = new Set<string>();
  const deps = {
    autoApplyStoppingJobs: stopping, autoApplyTabRefKey: (batchId: string, jobId: string) => `${batchId}:${jobId}`,
    autoApplyTabReconciliationRunning: false, autoApplyLifecycleGeneration: 0, autoApplySessionTerminated: false,
    autoApplyTabRefsStorageKey: "refs", asRecord: (v: any) => v && typeof v === "object" ? v : null,
    chrome: { storage: { local: { get: async () => ({ refs: { key: ref } }) } },
      tabs: { get: async () => ({ id: 7, url: ref.applicationUrl }) }, alarms: { clear: alarm } },
    autoApplyCredential: async () => ({}), recalledAutoApplyPageSession: async () => session,
    observedAutoApplyTerminalNavigation: () => null, autoApplyBoundTabUrlMatchesApplication: () => true,
    autoApplyTabOutcomeReporting: new Set(), detectAutoApplySiteSuccess: async () => ({ success: false }),
    detectAutoApplySitePolicyBlock: async () => ({ blocked: false }), detectAutoApplyUserAction: detect,
    rememberAutoApplyTab: remember, reportAutoApplyBrowserState: report,
    persistAutoApplyPageSession: async (value: any) => { session = value; return true; }, waitAutoApplyForUser,
    submissionReceiptAlarmName: () => "alarm", retireReportedAutoApplyTab: retire,
    cleanupSubmissionValidationMonitor: cleanup, readLateSubmissionRejection: lateFields
  };
  return { run: () => monitor(deps)(7), report, retire, cleanup, alarm, lateFields, remember, detect, stopping,
    get ref() { return ref; }, get session() { return session; } };
}
describe("late CAPTCHA in the production receipt monitor", () => {
  it("does not revive a user-stopped job as a late CAPTCHA handoff", async () => {
    const h = fixture();
    h.stopping.add("b:j");
    await h.run();
    expect(h.detect).not.toHaveBeenCalled();
    expect(h.report).not.toHaveBeenCalled();
    expect(h.retire).not.toHaveBeenCalled();
    expect(h.session.stage).toBe("reconciling");
  });
  it("hands off a live CAPTCHA even after the receipt deadline, without closing or touching the form", async () => {
    const h = fixture();
    await h.run();
    expect(h.report).toHaveBeenCalledExactlyOnceWith({}, expect.objectContaining({ outcome: "captcha_required", commandId: "command" }));
    expect(h.session).toMatchObject({ stage: "waiting_for_user_action", waitingFor: "captcha", tabId: 7 });
    expect(h.detect).toHaveBeenCalledWith(7, false);
    expect(h.ref.monitorMode).toBeUndefined();
    expect(h.ref.receiptDeadlineAt).toBeUndefined();
    expect(h.retire).not.toHaveBeenCalled();
    expect(h.cleanup).not.toHaveBeenCalled();
    expect(h.lateFields).not.toHaveBeenCalled();
  });
  it("completes a handoff whose session saved before tab-ref storage failed", async () => {
    const h=fixture();
    h.remember.mockImplementationOnce(async (value:any) => { h.remember.mockImplementationOnce(async () => {throw new Error("disk failure");});
      // Retain the initial pending evidence as the real storage does.
      Object.assign(h.ref, value);
    });
    await expect(h.run()).rejects.toThrow("disk failure");
    expect(h.session.waitingFor).toBe("captcha");
    expect(h.ref.pendingCaptchaHandoff?.type).toBe("captcha");
    await h.run();
    expect(h.ref.monitorMode).toBeUndefined();
    expect(h.retire).not.toHaveBeenCalled();
  });
  it("persists an unacknowledged challenge and retries only its callback without timing out the page", async () => {
    const h = fixture();
    h.report.mockRejectedValueOnce(new Error("transport failure"));
    await expect(h.run()).rejects.toThrow("transport failure");
    expect(h.ref.pendingCaptchaHandoff?.type).toBe("captcha");
    expect(h.session.stage).toBe("reconciling");
    expect(h.alarm).not.toHaveBeenCalled();
    expect(h.retire).not.toHaveBeenCalled();
    await h.run();
    expect(h.report).toHaveBeenCalledTimes(2);
    expect(h.session.waitingFor).toBe("captcha");
    expect(h.ref.pendingCaptchaHandoff).toBeUndefined();
  });
});
