import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source boundary missing: ${start} → ${end}`);
  return backgroundSource.slice(from, to);
}

describe("application page readiness integration", () => {
  it("classifies every page before entry navigation without a model fallback", () => {
    const entryAdvance = sourceBetween(
      "async function advanceAutoApplyApplicationEntry(",
      "async function renderAutoApplyOverlay("
    );
    const readinessIndex = entryAdvance.indexOf("waitForApplicationPageReadiness(");
    const genericEntryIndex = entryAdvance.indexOf("openGenericApplicationFromDetailPage");

    expect(readinessIndex).toBeGreaterThan(-1);
    expect(genericEntryIndex).toBeGreaterThan(readinessIndex);
    expect(entryAdvance).toContain('readiness.decision.status === "timed_out"');
    expect(entryAdvance).toContain('readiness.decision.pageStage !== "job_detail"');
    expect(entryAdvance).toContain("deferClick: true");
    expect(entryAdvance).toContain("activateApplicationEntryWithTrustedPointer(");
    expect(entryAdvance).toContain("isMokaJobDetailUrl(detailUrl)");
    expect(entryAdvance).toContain("openMokaApplicationFromDetailPage");
    expect(entryAdvance).toContain("openFeishuApplicationFromDetailPage");
    expect(entryAdvance).toContain("isFeishuJobDetailUrl(detailUrl)");
    expect(entryAdvance).toContain('kind: "feishu_primary_apply"');
    expect(entryAdvance).not.toContain("usedFeishuDomFallback");
    expect(entryAdvance).not.toContain("fallbackExecution");
    expect(entryAdvance).not.toContain("currentUrl === detailUrl");
    expect(entryAdvance).toContain('terminalStages: ["login", "application_form"]');
    expect(entryAdvance).not.toContain("return false;\n  }\n  if (!navigation?.matched");
    expect(entryAdvance).toContain('kind: navigation.entryTarget!');
    expect(entryAdvance).toContain('func: openMokaApplicationFromDetailPage');
    expect(entryAdvance).toContain('expectedTarget: { url: expectedUrl, kind: mokaKind }');
    expect(entryAdvance).not.toContain('includes("sd-Button-container")');
    expect(entryAdvance).not.toContain("classify_application_page");
    expect(entryAdvance).not.toContain("planAutoApplyVision");
  });

  it("fails closed unless the live page is an application form before filling and submission", () => {
    const batchExecution = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "async function executeBatchAutoApplyJob("
    );
    const visionFill = sourceBetween(
      "async function fillAutoApplyFormWithVision(",
      "async function executeFinalSubmitWithDebugger("
    );

    expect(batchExecution).toContain('assertApplicationFormStage(observation, "进入自动填写前复核")');
    expect(batchExecution).toContain('assertApplicationFormStage(observation, "进入视觉填写前复核")');
    expect(batchExecution).toContain('assertApplicationFormStage(finalObservation, "最终提交页面确认")');
    expect(visionFill).toContain("assertApplicationFormStage(observation, `第 ${iteration} 次填写前复核`)");
  });

  it("keeps tenant-scoped Feishu details on the same trusted-entry route as the page adapter", () => {
    const trustedEntry = sourceBetween(
      "async function activateApplicationEntryWithTrustedPointer(",
      "async function renderAutoApplyOverlay("
    );

    expect(trustedEntry).toContain('expectedTarget.kind !== "feishu_primary_apply"');
    expect(trustedEntry).toContain("/^\\/(?:[^/]+\\/)?position\\/[^/]+\\/detail\\/?$/i");
    expect(trustedEntry).toContain("/^\\/(?:[^/]+\\/)?position\\/detail\\/[^/]+\\/?$/i");
  });

  it("shares background render/click/readback without site-specific window branches or URL adoption", () => {
    expect(backgroundSource).not.toMatch(/requiresFeishuDetailVisibleExecutionWindow|requiresXiaopengVisibleExecutionWindow|isolatedExecutionWindow|waitForAutoApplyTabVisible|selectUnboundAutoApplyTab/);
    expect(backgroundSource).toContain("withBackgroundTabEntrySurface(chrome.debugger, tabId");
    expect(backgroundSource).toContain("const existingTab = recalledTab ?? safeLocalValidationTab;");
    expect(backgroundSource).toContain('source: safeLocalValidationTab && !recalledTab ? "local_validation_tab" : executionSurface.source');
    expect(backgroundSource).toContain("windowId: executionSurface.windowId");
    const entry = sourceBetween("async function advanceAutoApplyApplicationEntry(", "async function renderAutoApplyOverlay(");
    expect(entry).not.toContain("!xiaopengDetail && !navigation.clicked");
    expect(entry).toContain("entrySender");
    const click = sourceBetween("async function activateApplicationEntryWithTrustedPointer(", "async function renderAutoApplyOverlay(");
    expect(click).not.toContain("chrome.debugger.attach");
    expect(click).not.toContain("chrome.debugger.detach");
    expect(click).not.toContain("preparedSender");
  });

  it("persists page classification independently from the workflow stage", () => {
    const batchExecution = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "async function executeBatchAutoApplyJob("
    );

    expect(batchExecution).toContain("recordPageStage: async (snapshot) =>");
    expect(batchExecution).toContain("pageStage: snapshot.pageStage");
    expect(batchExecution).toContain("pageStageSource: snapshot.source");
    expect(batchExecution).toContain("pageStageObservationCount: snapshot.observationCount");
    expect(batchExecution).toContain("pageStageWaitedMs: snapshot.waitedMs");
  });
});
