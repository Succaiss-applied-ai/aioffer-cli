import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source boundary missing: ${start} → ${end}`);
  return backgroundSource.slice(from, to);
}

describe("auto-apply failure classification", () => {
  it("reports a device bridge request timeout as retryable transport failure", () => {
    const classification = sourceBetween(
      "function autoApplyFailureStatus(",
      "type AutoApplyDiagnostic ="
    );

    expect(classification).toContain("if (error instanceof AutoApplyDeviceRequestTimeoutError)");
    expect(classification).toContain('return { status: "failed", reasonCode: "transport_failed" };');
  });

  it("reports an application-page load timeout as retryable transport failure", () => {
    const classification = sourceBetween(
      "function autoApplyFailureStatus(",
      "type AutoApplyDiagnostic ="
    );

    expect(classification).toContain('if (/招聘页面加载超时/.test(message)) return { status: "failed", reasonCode: "transport_failed" };');
  });

  it("returns a live Moka city option mismatch to AiOffer as a user-choice request", () => {
    const classification = sourceBetween(
      "function autoApplyFailureStatus(",
      "type AutoApplyDiagnostic ="
    );
    const diagnostics = sourceBetween(
      "function autoApplyDiagnostic(",
      "function candidateFactByKey("
    );

    expect(classification).toContain("hasMokaLocationOptionUnavailableDetails(publicError.details)");
    expect(classification).toContain('return { status: "failed", reasonCode: "location_option_unavailable" };');
    expect(diagnostics).toContain("location_option_unavailable:");
    expect(diagnostics).toContain("AiOffer 中从返回的可选城市确认一项");
    expect(diagnostics).toContain('recommendedAction: "prompt_user_then_resume"');
    expect(classification).toContain("hasMokaLocationSelectionUnconfirmedDetails(publicError.details)");
    expect(classification).toContain('return { status: "failed", reasonCode: "location_selection_unconfirmed" };');
    expect(diagnostics).toContain("location_selection_unconfirmed:");
    expect(diagnostics).toContain("未能完成意向工作城市的站点选择与回读");
    expect(backgroundSource).toContain("preserveFieldInteractionFailureClassification");
    expect(backgroundSource).toContain('"location_selection_unconfirmed"');
    expect(backgroundSource).not.toContain('"location_option_unavailable",\n      "location_selection_unconfirmed"');
  });

  it("retains legacy error decoding but no longer predicts required failures before submit", () => {
    const classification = sourceBetween(
      "function autoApplyFailureStatus(",
      "type AutoApplyDiagnostic ="
    );
    const diagnostics = sourceBetween(
      "function autoApplyDiagnostic(",
      "function candidateFactByKey("
    );
    const preSubmit = sourceBetween(
      "async function commitApplicationFormBlurBeforePreSubmit(",
      "function sanitizedVisionDiagnosticLabels("
    );

    expect(classification).toContain("hasRequiredControlUnconfirmedDetails(publicError.details)");
    expect(classification).toContain('return { status: "failed", reasonCode: "required_control_unconfirmed" };');
    expect(diagnostics).toContain("required_control_unconfirmed:");
    expect(diagnostics).toContain("requiredControlUnconfirmedLabels(failureDetails)");
    expect(diagnostics).toContain("招聘网站仍未确认以下必填项");
    expect(diagnostics).toContain("重新选择对应字段，并确认红色校验提示消失后再重新投递");
    expect(preSubmit).toContain("prepareApplicationFormValidationBlur");
    expect(preSubmit).toContain("dispatchTrustedPointerClick");
    expect(preSubmit).not.toContain("requiredControlUnconfirmed");
    expect(preSubmit).not.toContain("candidateBlockingRequiredFieldFailures");
    expect(preSubmit).not.toContain("candidateInformationRequestsForMissingFields");
    expect(preSubmit.includes("criticalVisualReadbackFailures(")).toBe(false);
    const jobFlow = sourceBetween(
      "async function executeLegacyBatchAutoApplyJob(",
      "const autoApplyEngineRouter"
    );
    expect(jobFlow).toContain("await commitApplicationFormBlurBeforePreSubmit(tabId)");
    expect(jobFlow).not.toContain("const preSubmitRejected = siteRejectedFields(finalObservation)");
    expect(jobFlow).toContain("The site's\n    // real submit transaction owns required-field acceptance");
    expect(jobFlow.indexOf("await commitApplicationFormBlurBeforePreSubmit(tabId)")).toBeLessThan(
      jobFlow.indexOf("const submitActions = [requireUniqueFinalSubmitAction(finalObservation, command.safety?.allowConsentClick === true)]")
    );
    expect(backgroundSource).toContain('"required_control_unconfirmed"');
  });

  it("requires driver success as well as typed readback and never blocks an optional city", () => {
    const visualLoop = sourceBetween(
      "async function fillAutoApplyFormWithVision(",
      "async function executeFinalSubmitWithDebugger"
    );

    expect(backgroundSource).not.toContain("function mokaLocationReadbackConfirmed(");
    expect(visualLoop).toContain("registeredControlReadbackMatches({");
    expect(visualLoop).toContain("const freshReadbackMatches = registeredReadback?.matches");
    expect(visualLoop).toContain("const success = !siteErrorRemains && Boolean(immediate?.success) && freshReadbackMatches;");
    expect(visualLoop).toContain("if (!field.required) {");
    expect(visualLoop).toContain("excludedPlanningFieldKeys.add(field.stableFieldKey");
    expect(backgroundSource).not.toContain("const deterministicPrefill =");
    expect(visualLoop).toContain("isUnconfirmedFieldReadback({");
    expect(backgroundSource).toContain(
      "discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver"
    );
    expect(backgroundSource).toContain("driverFailureCode: \"leaf_missing\"");
  });

  it("reuses typed readback in the final manual pre-submit audit", () => {
    const matcher = sourceBetween(
      "function readbackMatchesInstruction(",
      "function manualFillBlockers("
    );

    expect(matcher).toContain("registeredControlReadbackMatches(");
    expect(matcher).toContain("controlAdapter: result.controlAdapter");
    expect(matcher).toContain("!result?.success");
    expect(matcher).not.toContain("actual.includes(part)");
    expect(matcher).not.toContain("part.includes(actual)");
  });

  it("lets an audited blocker-free form converge despite a stale model next hint", () => {
    const visualLoop = sourceBetween(
      "async function fillAutoApplyFormWithVision(",
      "async function executeFinalSubmitWithDebugger"
    );

    expect(visualLoop).toContain("if (!blockers.length && !critical.length) {");
    expect(visualLoop).not.toContain(
      'if (!blockers.length && !critical.length && ["final_review", "no_action"].includes(next))'
    );
    expect(visualLoop).toContain("const auditedObservation = await stableApplicationObservation(input.tabId)");
  });
});
