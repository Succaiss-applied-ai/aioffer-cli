import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source boundary missing: ${start} → ${end}`);
  return backgroundSource.slice(from, to);
}

describe("background final-submit confirmation transaction", () => {
  it("clicks a unique site confirmation before treating modal inconsistency text as validation failure", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );
    const confirmationLookup = submitFlow.indexOf('const confirmationTarget = await locateTrustedPoint("confirmation", "")');
    const validationFailure = submitFlow.indexOf("if (state.validation)", confirmationLookup);

    expect(confirmationLookup).toBeGreaterThan(-1);
    expect(validationFailure).toBeGreaterThan(confirmationLookup);
    expect(submitFlow).toContain('new RegExp(policy.acknowledgement, "iu")');
    expect(submitFlow).toContain('allowedText(text, "confirmation")');
    expect(submitFlow).toContain("candidate !== initial");
    expect(submitFlow).toContain("confirmation_validation_grace");
  });

  it("hands a stable CAPTCHA to the persistent monitor without waiting for the receipt deadline", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );
    const successCheck = submitFlow.indexOf("if (state.success)");
    const captchaDeferral = submitFlow.indexOf('if (state.userActionRequired?.type === "captcha")');
    const captchaConfirmation = submitFlow.indexOf(
      "const confirmedCaptcha = confirmedFinalSubmitCaptcha(",
      captchaDeferral
    );
    const monitorHandoff = submitFlow.indexOf("captcha_waiting_monitor_started", captchaConfirmation);
    const receiptTimeout = submitFlow.indexOf("trace.push(`site_receipt_monitor_started:");

    expect(successCheck).toBeGreaterThan(-1);
    expect(captchaDeferral).toBeGreaterThan(successCheck);
    expect(captchaConfirmation).toBeGreaterThan(captchaDeferral);
    expect(monitorHandoff).toBeGreaterThan(captchaConfirmation);
    expect(submitFlow.slice(monitorHandoff, receiptTimeout)).toContain(
      'observedResult: "waiting_for_user_action"'
    );
    expect(receiptTimeout).toBeGreaterThan(monitorHandoff);
    expect(submitFlow).toContain("success_observed_after_captcha");
    expect(submitFlow).not.toContain("captcha_persisted_without_success");
  });

  it("releases only checkpointed submissions after twelve seconds to a passive receipt monitor", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );

    expect(submitFlow).toContain("finalSubmitActiveVerificationTimeoutMs");
    expect(submitFlow).toContain('observedResult: "waiting_for_site_receipt"');
    expect(submitFlow).toContain("site_receipt_monitor_started");
    expect(submitFlow).toContain("if (previewIsGate && !confirmationClicked)");
    expect(submitFlow.indexOf("if (previewIsGate && !confirmationClicked)")).toBeLessThan(
      submitFlow.indexOf("trace.push(`site_receipt_monitor_started:")
    );
    expect(submitFlow).toContain("preview_activation_not_observed");
    expect(submitFlow).toContain("结果未确认，不会再次提交");
    expect(backgroundSource).toContain("const finalSubmitActiveVerificationTimeoutMs = 12_000");
    expect(backgroundSource).toContain("const finalSubmitPassiveReceiptTimeoutMs = 108_000");
    expect(backgroundSource).toContain('status: "waiting_for_site_receipt"');
    expect(backgroundSource).toContain('reasonCode: "submission_receipt_pending"');
  });

  it("recognizes the campus Moka receipt route during active success verification", () => {
    const receiptSource = readFileSync(new URL("./application-receipt.ts", import.meta.url), "utf8");
    expect(receiptSource).toContain("(?:campus_)?apply\\/thanks");
    expect(receiptSource).toContain('source: "registered_receipt_url"');
    expect(backgroundSource).toContain('state.source === "registered_receipt_url"');
    expect(backgroundSource.match(/func: readApplicationReceiptInPage/g)).toHaveLength(2);
  });

  it("does not close an owned result tab until Gateway has accepted the command completion", () => {
    const flush = sourceBetween(
      "async function flushAutoApplyCompletionOutbox(",
      "interface PersistedAutoApplyTabRef"
    );
    const execute = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "// Legacy and Shadow remain behavior-compatible."
    );
    expect(flush.indexOf("completeAutoApplyCommand(")).toBeLessThan(
      flush.indexOf("finalizeAcknowledgedAutoApplyTabClosure(")
    );
    expect(execute).toContain("rememberPendingAutoApplyTabClosure({");
    expect(execute).not.toContain('rememberAutoApplyTabCloseIntent(tabId, "task_cleanup")');
  });

  it("uses a focus-emulated trusted pointer only after the final button is visibly hit", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );

    expect(submitFlow).toContain("prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand)");
    expect(submitFlow).toContain("trustedPointerViewportCandidates({");
    expect(submitFlow).toContain("hit?.connected && hit.hitInsideTarget");
    expect(submitFlow).toContain("dispatchFinalSubmitTrustedPointer(previewPoint)");
    expect(submitFlow).toContain("dispatchFinalSubmitTrustedPointer(confirmationPoint)");
    expect(submitFlow).not.toContain("Input.dispatchKeyEvent");
  });

  it("re-observes live coordinates before dispatching the submit transaction", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );
    const retryLoop = submitFlow.indexOf("for (let attempt = 1; attempt <= 3; attempt += 1)");
    const pointerDispatch = submitFlow.indexOf("await dispatchFinalSubmitTrustedPointer(previewPoint)");
    const directCheckpoint = submitFlow.lastIndexOf("await checkpointSubmission(true)", pointerDispatch);
    const confirmationDispatch = submitFlow.indexOf("await dispatchFinalSubmitTrustedPointer(confirmationPoint)");
    const confirmationCheckpoint = submitFlow.lastIndexOf("await checkpointSubmission(true)", confirmationDispatch);

    expect(retryLoop).toBeGreaterThan(-1);
    expect(pointerDispatch).toBeGreaterThan(retryLoop);
    expect(directCheckpoint).toBeGreaterThan(retryLoop);
    expect(directCheckpoint).toBeLessThan(pointerDispatch);
    expect(confirmationCheckpoint).toBeGreaterThan(pointerDispatch);
    expect(confirmationCheckpoint).toBeLessThan(confirmationDispatch);
    expect(submitFlow).toContain("连续三次无法确认最终提交按钮的实时点击位置，未执行点击");
  });

  it("keeps a preview background miss non-retriable without a foreground hop", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );

    expect(submitFlow).toContain('const previewIsGate = isPreviewSubmissionText(');
    expect(submitFlow).toContain('event.type === "click" && event.isTrusted && event.insideTarget');
    expect(submitFlow).not.toContain("previewNoClickRetryAllowed");
    expect(submitFlow).not.toContain("chrome.tabs.update");
    expect(submitFlow).not.toContain("cdp_preview_activation_retry");
    expect(submitFlow).not.toContain("Page.bringToFront");
    expect(submitFlow).not.toContain("Input.dispatchKeyEvent");
    expect(submitFlow).not.toContain(".click()");
    expect(submitFlow).toContain("cdp_preview_target_stale_before_dispatch");
    expect(submitFlow).toContain("cdp_preview_rebound_before_first_dispatch");
    expect(submitFlow).toContain("staleBeforeDispatch");
  });

  it("does not reinterpret unchanged old errors as proof of rejection", () => {
    const submitFlow = sourceBetween("async function executeFinalSubmitWithDebugger(", "async function executeLegacyBatchAutoApplyJob(");
    expect(submitFlow.includes("unchanged_required_validation_after_trusted_preview")).toBe(false);
    expect(submitFlow.includes("newSiteValidationErrors(validationBaseline, observation, reassertedKeys)")).toBe(true);
  });

  it("removes the interactive status overlay before attaching and locating the final submit target", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );
    const removeOverlay = submitFlow.indexOf("await removeAutoApplyOverlay(tabId)");
    const attachDebugger = submitFlow.indexOf('await chrome.debugger.attach(target, "1.3")');
    const locatePreview = submitFlow.indexOf('const previewTarget = await locateTrustedPoint("preview", expectedText)');

    expect(removeOverlay).toBeGreaterThan(-1);
    expect(attachDebugger).toBeGreaterThan(removeOverlay);
    expect(locatePreview).toBeGreaterThan(attachDebugger);
    expect(submitFlow).toContain("auto_apply_status_overlay_removed_before_submit");
    expect(submitFlow).toContain("auto_apply_status_overlay_removal_unconfirmed");
  });

  it("persists submit intent before dispatch, but only after the live target was confirmed", () => {
    const submitFlow = sourceBetween(
      "async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob("
    );
    const jobFlow = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "const autoApplyEngineRouter"
    );
    const executeCall = jobFlow.indexOf("execute: (submissionSignal) => executeFinalSubmitWithDebugger(");
    const checkpoint = jobFlow.indexOf("pageSession = beginAutoApplySubmission(", executeCall);
    const preClickFlow = jobFlow.slice(0, executeCall);

    expect(checkpoint).toBeGreaterThan(executeCall);
    expect(preClickFlow).not.toContain("beginAutoApplySubmission(pageSession");
    expect(jobFlow).toContain("if (pageSession?.submitInitiatedAt && failure.reasonCode");
    expect(jobFlow).not.toContain("if (pageSession?.submissionAttemptId && failure.reasonCode");
    expect(submitFlow).toContain("await onSubmissionActivated?.()");
    expect(submitFlow).toContain("let submissionCheckpointed = false");
    expect(submitFlow.indexOf("await checkpointSubmission(true);")).toBeLessThan(
      submitFlow.indexOf("? await dispatchPreviewGatePointer"));
    expect(submitFlow).toContain("cdp_confirmation_activated:pointer:");
  });

  it("has one submit primitive, one bounded repair round, and no retry loop", () => {
    const jobFlow = sourceBetween("async function executeLegacyBatchAutoApplyJob(", "const autoApplyEngineRouter");
    expect(jobFlow.split("executeFinalSubmitWithDebugger(").length - 1).toBe(1);
    expect(jobFlow.includes("for (let repairCycle")).toBe(false);
    expect(jobFlow).toContain("beginSingleAutomaticSiteValidationRepair(pageSession)");
    expect(jobFlow).toContain("const repairFieldKeys = new Set(partition.repairable.map(siteValidationFieldKey))");
    expect(jobFlow).toContain("repairFieldKeys,");
    expect(jobFlow).toContain("partition.repairable, repaired.observation, candidateFacts");
    expect(jobFlow).toContain("partition.repairable.length === 0");
    expect(jobFlow).toContain("site_validation_single_repair_exhausted");
    expect(jobFlow).not.toContain("const preSubmitRejected = siteRejectedFields(finalObservation)");
    expect(jobFlow.includes("stablePreSubmitObservation(")).toBe(false);
    expect(jobFlow.includes('task: "audit_form_readback"')).toBe(false);
  });

  it("releases the device slot if the active recruitment tab closes or Chrome submit APIs stall", () => {
    const jobFlow = sourceBetween("async function executeLegacyBatchAutoApplyJob(", "const autoApplyEngineRouter");
    const guard = jobFlow.indexOf("await executeWithAutoApplySubmissionLifecycleGuard({");
    const submit = jobFlow.indexOf("execute: (submissionSignal) => executeFinalSubmitWithDebugger(", guard);

    expect(guard).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(guard);
    expect(jobFlow).toContain("tabs: chrome.tabs");
    expect(jobFlow).toContain("timeoutMs: finalSubmitLifecycleGuardTimeoutMs");
    expect(backgroundSource).toContain("const finalSubmitLifecycleGuardTimeoutMs = 30_000");
  });

  it("accepts current-click errors plus unchanged required errors on still-empty owned controls", () => {
    const submitFlow = sourceBetween("async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob(");
    expect(submitFlow).toContain("newSiteValidationErrors(validationBaseline, observation, reassertedKeys)");
    expect(submitFlow).toContain("submissionRejectedFields(validationBaseline, observation");
    expect(submitFlow).toContain("previouslyRejectedKeys");
    expect(submitFlow).toContain("siteValidationConfirmed: state.rejectedFieldKeys.length > 0 || state.nativeValidationErrors.length > 0");
    expect(submitFlow).toContain('args: [validationProbeToken, "cleanup"]');
    expect(submitFlow.indexOf("await armValidationProbe(expectedText)")).toBeLessThan(
      submitFlow.indexOf("? await dispatchPreviewGatePointer"));
  });

  it("does not leave a hover delay between final-submit target revalidation and pointer down", () => {
    const submitFlow = sourceBetween("async function executeFinalSubmitWithDebugger(",
      "async function executeLegacyBatchAutoApplyJob(");

    expect(submitFlow).toContain("const dispatchFinalSubmitTrustedPointer = (");
    expect(submitFlow).toContain(
      "dispatchTrustedPointerClick(sendDebuggerCommand, point, async () => undefined)"
    );
    expect(submitFlow).toContain("await dispatchFinalSubmitTrustedPointer(point)");
    expect(submitFlow).toContain("await dispatchFinalSubmitTrustedPointer(previewPoint)");
    expect(submitFlow).toContain("await dispatchFinalSubmitTrustedPointer(confirmationPoint)");
  });
});
