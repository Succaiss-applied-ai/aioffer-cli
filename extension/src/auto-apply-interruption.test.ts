import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expiredInterruptionReceipt, armApplicationInterruption, assertApplicationNotInterrupted, AutoApplyUserInterruptedError,
  disarmApplicationInterruption, executeInterruptibleScript, interruptibleApplicationCall,
  interruptionDiagnostic, interruptionOwner, isControlledReload, recoveredInterruption,
  sendInterruptibleDebuggerCommand, type ControlledExecution
} from "./auto-apply-interruption.js";

const record: ControlledExecution = { schemaVersion: "controlled-execution.v1", owner: "owner", sessionId: "browser-1",
  commandId: "command-1", batchId: "batch", batchJobId: "batch-job", jobId: "job", tabId: 1,
  applicationUrl: "https://ats.test/apply", armedAt: "2026-09-08T00:00:00Z" };
afterEach(() => vi.unstubAllGlobals());
describe("controlled application interruption", () => {
  it("allows only an expired original interruption result to use receipt reconciliation", () => {
    const event = { commandId: "command", type: "browser.batch_auto_apply_job_completed", payload: {
      autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: "batch", batchJobId: "item", jobId: "job",
        status: "failed", reasonCode: "user_interrupted", occurredAt: "2026-09-08T00:00:00Z",
        evidence: { pageUrl: "https://ats.test/apply", failureDetails: { interruptionKind: "tab_closed", submissionStarted: false } } } } };
    expect(expiredInterruptionReceipt("command", event, 410)).toMatchObject({ commandId: "command", interruptionKind: "tab_closed", submissionStarted: false });
    expect(expiredInterruptionReceipt("command", event, 409)).not.toBeNull();
    for (const status of [401, 403, 404, 500]) expect(expiredInterruptionReceipt("command", event, status)).toBeNull();
    expect(expiredInterruptionReceipt("another-command", event, 410)).toBeNull();
    event.payload.autoApplyResult.reasonCode = "submission_outcome_unknown";
    expect(expiredInterruptionReceipt("command", event, 410)).toBeNull();
    event.payload.autoApplyResult.status = "succeeded";
    expect(expiredInterruptionReceipt("command", event, 410)).toBeNull();
  });

  it("only matches a fresh top-level reload of the exact bound tab", () => {
    const event = { tabId: 1, frameId: 0, transitionType: "reload", timeStamp: Date.parse(record.armedAt) + 1 };
    expect(isControlledReload(event, record)).toBe(true);
    for (const patch of [{ tabId: 2 }, { frameId: 1 }, { transitionType: "link" },
      { transitionType: "form_submit" }, { timeStamp: event.timeStamp - 2 }]) {
      expect(isControlledReload({ ...event, ...patch }, record)).toBe(false);
    }
  });
  it("does not treat a worker restart with the same browser session as browser exit", () => {
    expect(recoveredInterruption(record, "browser-1", true, false)).toBeNull();
    expect(recoveredInterruption(record, "browser-2", true, true)).toBe("browser_session_ended");
    expect(recoveredInterruption(record, "browser-2", true, false)).toBe("execution_session_ended");
    expect(recoveredInterruption(record, "browser-1", false, false)).toBe("tab_closed");
    expect(recoveredInterruption({ ...record, interruptionKind: "page_reloaded" }, "browser-2", false, true)).toBe("page_reloaded");
  });
  it("fences a pending browser call and every later script/CDP write to that same tab", async () => {
    const scripts = vi.fn(async () => []), cdp = vi.fn(async () => ({}));
    vi.stubGlobal("chrome", { scripting: { executeScript: scripts }, debugger: { sendCommand: cdp } });
    const controller = armApplicationInterruption(201);
    let release!: (value: string) => void;
    const started = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const result = interruptibleApplicationCall(201, started);
    await Promise.resolve();
    controller.abort(new AutoApplyUserInterruptedError("page_reloaded"));
    await expect(result).rejects.toMatchObject({ kind: "page_reloaded" });
    release("late result");
    disarmApplicationInterruption(201, controller);
    await expect(executeInterruptibleScript({ target: { tabId: 201 }, func: () => true })).rejects.toBeInstanceOf(AutoApplyUserInterruptedError);
    await expect(sendInterruptibleDebuggerCommand({ tabId: 201 }, "Input.insertText", { text: "late" })).rejects.toBeInstanceOf(AutoApplyUserInterruptedError);
    expect(scripts).not.toHaveBeenCalled(); expect(cdp).not.toHaveBeenCalled();
    expect(() => armApplicationInterruption(201)).toThrow(AutoApplyUserInterruptedError);
    // A different task keeps its own capability and payload.
    await sendInterruptibleDebuggerCommand({ tabId: 202 }, "Input.insertText", { text: "next" });
    expect(cdp).toHaveBeenCalledExactlyOnceWith({ tabId: 202 }, "Input.insertText", { text: "next" });
  });
  it("preserves unfenced and completed execution behavior and permits owned cleanup", async () => {
    const cdp = vi.fn(async () => ({}));
    vi.stubGlobal("chrome", { debugger: { sendCommand: cdp } });
    const active = armApplicationInterruption(203);
    await expect(interruptibleApplicationCall(203, async () => "readback")).resolves.toBe("readback");
    disarmApplicationInterruption(203, active);
    expect(() => assertApplicationNotInterrupted(203)).not.toThrow();
    const interrupted = armApplicationInterruption(204);
    interrupted.abort(new AutoApplyUserInterruptedError("tab_closed"));
    await sendInterruptibleDebuggerCommand({ tabId: 204 }, "Emulation.setFocusEmulationEnabled", { enabled: false });
    expect(cdp).toHaveBeenCalledOnce();
  });
  it("keeps pending calls bound to their original controller when another task starts", async () => {
    const first = armApplicationInterruption(205), second = armApplicationInterruption(206);
    const action = vi.fn(async () => "must not start");
    const result = interruptibleApplicationCall(205, action);
    first.abort(new AutoApplyUserInterruptedError("tab_closed"));
    await expect(result).rejects.toBeInstanceOf(AutoApplyUserInterruptedError);
    expect(action).not.toHaveBeenCalled();
    await expect(interruptibleApplicationCall(206, async () => "success")).resolves.toBe("success");
    disarmApplicationInterruption(206, second);
  });
  it("reports interruption separately from the site's unknown submission outcome", () => {
    expect(interruptionDiagnostic("page_reloaded", false)).toMatchObject({ code: "user_interrupted", category: "human_action", stage: "form_fill", retryable: false });
    expect(interruptionDiagnostic("tab_closed", true).userMessage).toContain("最终投递结果暂时无法确认");
  });
  it("isolates owners without persisting device tokens", () => {
    const credential = { schemaVersion: "auto-apply-runtime-credential.v1" as const, gatewayBaseUrl: "https://gateway.test", tenantId: "tenant", userId: "user", deviceId: "device", deviceToken: "secret", pairedAt: "now" };
    expect(interruptionOwner(credential)).not.toContain("secret");
    for (const key of ["gatewayBaseUrl", "tenantId", "userId", "deviceId"] as const) {
      expect(interruptionOwner({ ...credential, [key]: "other" })).not.toBe(interruptionOwner(credential));
    }
  });
});
