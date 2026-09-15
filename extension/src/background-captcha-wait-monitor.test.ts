import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("persistent CAPTCHA wait monitor", () => {
  it("reports a closed bound CAPTCHA tab through Browser State without reopening it", () => {
    const closeMonitor = sourceBetween(
      "async function markClosedMonitoredTabForReconciliation(",
      "async function waitForTabReady("
    );
    expect(closeMonitor).toContain("isRemovedCaptchaWaitingTab(session, tabId)");
    expect(closeMonitor).toContain('? "captcha_tab_closed" as const');
    expect(closeMonitor).toContain("pendingOutcome,");
    expect(closeMonitor).toContain("...latestRefs");
    expect(closeMonitor).toContain("reconcilePersistedAutoApplyTabs(tabId)");
    expect(closeMonitor).not.toMatch(/chrome\.tabs\.create|chrome\.tabs\.reload|location\.reload/u);
  });

  it("wires Chrome tab removal to the persisted monitor", () => {
    expect(source).toContain("chrome.tabs.onRemoved.addListener((tabId) => {");
    expect(source).toContain("markClosedMonitoredTabForReconciliation(tabId)");
  });

  it("keeps success and closed-tab outcomes off the command execution path", () => {
    const reconciler = sourceBetween(
      "async function reconcilePersistedAutoApplyTabs(",
      "async function markClosedMonitoredTabForReconciliation("
    );
    expect(reconciler).toContain('? "captcha_tab_closed"');
    expect(reconciler).toContain("reportAutoApplyBrowserState(credential");
    expect(reconciler).toContain("completeAutoApplyPageSession(");
    expect(reconciler.indexOf("reportAutoApplyBrowserState(credential")).toBeLessThan(
      reconciler.lastIndexOf("retireReportedAutoApplyTab(")
    );
    expect(reconciler).not.toContain("executeBatchAutoApplyJob(");
  });

  it("turns a post-CAPTCHA application-limit dialog into a reported terminal failure", () => {
    const reconciler = sourceBetween(
      "async function reconcilePersistedAutoApplyTabs(",
      "async function markClosedMonitoredTabForReconciliation("
    );
    const detection = reconciler.indexOf("detectAutoApplySitePolicyBlock(tabId,");
    const reporting = reconciler.indexOf('outcome: "site_application_limit_reached"', detection);
    const retirement = reconciler.indexOf("retireReportedAutoApplyTab(record, failedSession, tabId)", reporting);
    expect(detection).toBeGreaterThan(-1);
    expect(reporting).toBeGreaterThan(detection);
    expect(retirement).toBeGreaterThan(reporting);
    expect(reconciler.slice(detection, retirement)).not.toMatch(/tabs\.reload|location\.reload|executeBatchAutoApplyJob/u);
  });

  it("keeps a no-signal submission open and reconciles success, close, or timeout off-command", () => {
    const reconciler = sourceBetween(
      "async function reconcilePersistedAutoApplyTabs(",
      "async function markClosedMonitoredTabForReconciliation("
    );
    expect(source).toContain('monitorMode?: "submission_receipt"');
    expect(source).toContain('"submission_active_tab_closed"');
    expect(reconciler).toContain('outcome: "submission_receipt_timeout"');
    expect(reconciler).toContain("isRemovedSubmissionReceiptTab(pageSession, tabId)");
    expect(reconciler).toContain("isRemovedActiveSubmissionTab(pageSession, tabId)");
    expect(reconciler).toContain("commandId: typeof record.commandId === \"string\"");
    expect(source).toContain("autoApplyActiveSubmissionTabs.has(tabId)");
    expect(source).toContain("autoApplyActiveSubmissionTabs.add(tabId)");
    expect(source).toContain("autoApplyActiveSubmissionTabs.delete(tabId)");
    expect(source).toContain("commandId: command.commandId");
    expect(source).toContain('tabResultDisposition = "keep_open"');
    expect(source).toContain("chrome.alarms.create(submissionReceiptAlarmName(batchId, batchJobId)");
    expect(source).toContain("alarm.name.startsWith(submissionReceiptAlarmPrefix)");
    expect(source).toContain("chrome.alarms.clear(submissionReceiptAlarmName(batchId, batchJobId))");
    expect(source).toContain("clearSubmissionReceiptAlarms()");
    expect(reconciler).not.toMatch(/chrome\.tabs\.create|chrome\.tabs\.reload|location\.reload/u);
  });

  it("keeps the CAPTCHA tab open when detection exits through the shared failure handler", () => {
    const failureHandler = sourceBetween(
      "} catch (caughtError) {",
      "} finally {"
    );
    expect(failureHandler).toContain('userActionRequired?.type === "captcha"');
    expect(failureHandler).toContain('? "keep_open"');
    expect(failureHandler).not.toContain('userActionRequired?.type === "identity_verification"');
  });
});
