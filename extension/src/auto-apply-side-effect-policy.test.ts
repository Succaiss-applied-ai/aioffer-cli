import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const executionSurfaceSource = readFileSync(
  new URL("./auto-apply-execution-surface.ts", import.meta.url),
  "utf8"
);
const trustedPointerSource = readFileSync(new URL("./trusted-pointer-driver.ts", import.meta.url), "utf8");
const mokaLocationOptionDiscoverySource = readFileSync(
  new URL("./control-adapters/moka-location-option-discovery-driver.ts", import.meta.url),
  "utf8"
);

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source boundary missing: ${start} → ${end}`);
  return backgroundSource.slice(from, to);
}

describe("automatic application side-effect policy", () => {
  it("uses tested background native-place interaction and never retries preview in the foreground", () => {
    const nativePlace = sourceBetween("async function executeMokaNativePlaceInstructionWithTrustedPointerDriver(",
      "async function discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver(");
    const submit = sourceBetween("async function executeFinalSubmitWithDebugger(", "async function executeLegacyBatchAutoApplyJob(");
    expect(nativePlace).not.toContain("chrome.tabs.update");
    expect(submit).not.toContain("chrome.tabs.update");
    expect(nativePlace).not.toContain("if (!targetTab.active)");
    expect(nativePlace).toContain("prepareFocusEmulatedTrustedPointerSurface");
    expect(nativePlace).toContain("releaseTrustedPointerSurface");
    expect(nativePlace).not.toMatch(/chrome\.windows\.update|chrome\.tabs\.reload|Page\.bringToFront/u);
  });

  it("closes reported missing-information pages and skips upload/parser replay on the fresh retry", () => {
    const job = sourceBetween("async function executeLegacyBatchAutoApplyJob(", "const autoApplyEngineRouter");
    expect(job).toContain('waitAutoApplyForUser(pageSession, "missing_information")');
    expect(job).toContain('userActionRequired?.type === "captcha"');
    expect(job).not.toContain('failure.reasonCode === "missing_information" ||');
    expect(job).toContain('if (resumeFile && !resumingMissingInformation)');
    expect(job).toContain('if (identityPhoto && !resumingMissingInformation)');
    expect(job).toContain('repairFieldKeys: resumeRepairFieldKeys');
    expect(job).toContain("autoApplyPageSessionRequiresOriginalTab(pageSession) && !recalledTab");
  });
  it("keeps every new task in an inactive normal-window tab without reloads", () => {
    const batchExecution = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "async function executeBatchAutoApplyJob("
    );
    expect(executionSurfaceSource).toContain("active: false");
    expect(executionSurfaceSource).toContain('windowTypes: ["normal"]');
    expect(executionSurfaceSource).not.toMatch(/windows\.(create|update|remove)\(/u);
    expect(executionSurfaceSource).not.toContain("focused: true");
    expect(batchExecution).not.toMatch(/chrome\.tabs\.update\([^)]*active:\s*true/u);
    expect(batchExecution).not.toMatch(/chrome\.windows\.update\([^)]*focused:\s*true/u);
    expect(batchExecution).not.toMatch(/chrome\.tabs\.reload|location\.reload|Page\.reload/u);
    expect(batchExecution).not.toContain("Page.bringToFront");
  });

  it("forbids foreground activation and reload inside the DeepSeek location route", () => {
    const deepSeekDriver = sourceBetween(
      "async function executeDeepSeekLocationInstructionWithTrustedFocusDriver(",
      "async function resolveSoleMokaPreferredLocationOption("
    );
    expect(deepSeekDriver).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update/u);
    expect(deepSeekDriver).not.toMatch(/chrome\.tabs\.reload|location\.reload|Page\.reload/u);
    expect(deepSeekDriver).not.toContain("Page.bringToFront");
    expect(deepSeekDriver).toMatch(/chrome\.debugger|dispatchTrustedPointerClick/u);
    expect(deepSeekDriver).toContain("prepareFocusEmulatedTrustedPointerSurface");
    expect(deepSeekDriver).toContain("releaseTrustedPointerSurface");
    expect(trustedPointerSource).not.toContain('send("Page.bringToFront"');
    expect(trustedPointerSource).toContain('send("Emulation.setFocusEmulationEnabled", { enabled: true })');
  });

  it("discovers city choices only through central registered capability dispatch", () => {
    const optionDiscoveryDispatch = sourceBetween(
      "async function withDiscoveredRequiredFieldOptions(",
      "function aiBridgeEvent("
    );
    const mokaDiscoveryRoute = sourceBetween(
      "async function discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver(",
      "async function executeDeepSeekLocationInstructionWithTrustedFocusDriver("
    );
    expect(optionDiscoveryDispatch).toContain("dispatchControlInstruction(");
    expect(optionDiscoveryDispatch).toContain("discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver");
    expect(optionDiscoveryDispatch).not.toContain("discoverApplicationFieldOptions");
    expect(mokaDiscoveryRoute).toContain("MOKA_LOCATION_DRIVER_CODES.has(controlAdapter.code)");
    expect(mokaDiscoveryRoute).toContain("executeMokaLocationOptionDiscoveryDriver");
    expect(mokaDiscoveryRoute).toContain("dispatchTrustedPointerClick");
    expect(mokaDiscoveryRoute).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update/u);
    expect(mokaDiscoveryRoute).not.toMatch(/chrome\.tabs\.reload|location\.reload|Page\.reload/u);
    expect(mokaDiscoveryRoute).not.toContain("Page.bringToFront");
    expect(mokaLocationOptionDiscoverySource).toContain("leafClickCount: 0");
    expect(mokaLocationOptionDiscoverySource).not.toContain("clickDeepSeekLocationLeafInPage");
  });

  it("enforces the claimed execution deadline before any irreversible submit", () => {
    const batchExecution = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "async function executeBatchAutoApplyJob("
    );
    const pollExecution = sourceBetween(
      "async function pollAutoApplyOnce(",
      "async function recruitingAiDeviceContextResponse("
    );
    const completionOutbox = sourceBetween(
      "async function flushAutoApplyCompletionOutbox(",
      "interface PersistedAutoApplyTabRef"
    );
    expect(batchExecution).toContain("commandId: command.commandId");
    expect(batchExecution).toContain("assertAutoApplyCommandActive(command)");
    expect(batchExecution).toContain("chrome.runtime.reload()");
    expect(pollExecution).toContain("claimed.executionExpiresAt");
    expect(pollExecution).toContain("commandWithClaimedExecutionDeadline");
    expect(pollExecution).toContain("executionAbort.abort(new AutoApplyCommandExpiredError())");
    expect(completionOutbox).not.toContain("[404, 409, 410].includes");
    expect(completionOutbox.indexOf("await completeAutoApplyCommand(")).toBeLessThan(
      completionOutbox.indexOf("await finalizeAcknowledgedAutoApplyTabClosure(")
    );
  });

  it("stops vision planning when the claimed command deadline expires", () => {
    const batchExecution = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "async function executeBatchAutoApplyJob("
    );
    const visionFill = sourceBetween(
      "async function fillAutoApplyFormWithVision(",
      "async function executeLegacyBatchAutoApplyJob("
    );
    expect(visionFill).toContain("assertActive?: () => void");
    expect(visionFill).toContain("input.assertActive?.();");
    expect(visionFill).toContain("}, input.abortSignal)");
    expect(batchExecution).toContain("assertActive: () => assertAutoApplyCommandActive(command)");
    expect(batchExecution).toContain("abortSignal: autoApplyExecutionAbort?.signal");
    expect(batchExecution.includes('task: "audit_form_readback"')).toBe(false);
    expect(batchExecution).toContain("abortReason instanceof AutoApplyCommandExpiredError");
  });

  it("classifies a proven missing Moka city before the generic location interaction error", () => {
    const iterativeUnavailable = backgroundSource.indexOf(
      "if (!success && isMokaLocationOptionUnavailable(immediate))"
    );
    const iterativeInteractionError = backgroundSource.indexOf(
      "if (!success && isMokaLocationInteractionFailure(error))",
      iterativeUnavailable
    );
    expect(iterativeUnavailable).toBeGreaterThan(-1);
    expect(iterativeInteractionError).toBeGreaterThan(iterativeUnavailable);
    expect(backgroundSource).not.toContain("const deterministicPrefill =");
    expect(backgroundSource).toContain('code: "MISSING_INFORMATION"');
    expect(backgroundSource).toContain('source: "live_moka_popup"');
  });
});
