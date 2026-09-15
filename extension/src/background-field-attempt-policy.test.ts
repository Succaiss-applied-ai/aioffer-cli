import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function visionFillSource(): string {
  const start = backgroundSource.indexOf("async function fillAutoApplyFormWithVision(");
  const end = backgroundSource.indexOf("async function executeFinalSubmitWithDebugger(", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return backgroundSource.slice(start, end);
}

describe("field-level attempt policy integration", () => {
  it("keeps unconfirmed optional fields read-only across every fill entry point", () => {
    const vision = visionFillSource();
    const dispatcherStart = backgroundSource.indexOf("async function executeApplicationFillInstructions(");
    const dispatcherEnd = backgroundSource.indexOf("async function executeMokaFillInstructionWithDebugger(", dispatcherStart);
    const manualStart = backgroundSource.indexOf("async function fillManualApplicationFromInfoPackage(");
    const manualEnd = backgroundSource.indexOf("function scheduleManualLoginPolling(", manualStart);
    const bridgeStart = backgroundSource.indexOf('if (command.type === "browser.fill_form_fields")');
    const bridgeEnd = backgroundSource.indexOf('if (command.type === "browser.readback_form")', bridgeStart);
    const oneClickStart = backgroundSource.indexOf('if (input.type === "APPLICATION_FILL")');
    const oneClickEnd = backgroundSource.indexOf('respond({ ok: false, error: "未知消息" })', oneClickStart);

    expect(vision).toContain("confirmedCurrentJobFactForField(field, input.candidateFacts)");
    expect(vision).toContain("observedFieldHasValue(field) || !authoritativeFact");
    expect(backgroundSource.slice(dispatcherStart, dispatcherEnd))
      .toContain("optionalInstructionHasCurrentJobConfirmation(field, instruction)");
    expect(backgroundSource.slice(manualStart, manualEnd))
      .toContain("!field.required && !item.confirmedForCurrentApplication");
    expect(backgroundSource.slice(manualStart, manualEnd))
      .toContain('status: "ready_for_review"');
    expect(backgroundSource.slice(bridgeStart, bridgeEnd)).toContain("if (!field.required)");
    expect(backgroundSource.slice(oneClickStart, oneClickEnd))
      .toContain("currentApplicationAnswerForField(field, workingCustomAnswers)");
    expect(backgroundSource.slice(oneClickStart, oneClickEnd))
      .toContain("field.required &&\n        !observedFieldHasValue(field)");
    expect(backgroundSource).not.toContain("dynamicSectionTargets(");
    expect(backgroundSource).toContain("不按简历条数新增非必填经历");
  });

  it("skips a failed optional field before any required-control failure routing", () => {
    const source = visionFillSource();
    const skip = source.indexOf('fieldAttemptDecision.action === "skip_optional"');
    const requiredFailure = source.indexOf("isUnsupportedRequiredControlFailure", skip);

    expect(skip).toBeGreaterThanOrEqual(0);
    expect(requiredFailure).toBeGreaterThan(skip);
    expect(source.slice(skip, requiredFailure)).toContain("excludedPlanningFieldKeys.add");
    expect(source.slice(skip, requiredFailure)).toContain("optional_field_skipped");
  });

  it("only blocks a Moka preferred-city readback mismatch when the city is required", () => {
    const source = visionFillSource();
    const locationGuard = source.lastIndexOf("if (!success && mokaPreferredLocation && (immediate?.success || isMokaLocationOptionUnavailable(immediate)))");
    const skip = source.lastIndexOf('fieldAttemptDecision.action === "skip_optional"');

    expect(locationGuard).toBeGreaterThanOrEqual(0);
    expect(locationGuard).toBeLessThan(skip);
    expect(source.slice(locationGuard, skip)).toContain("if (!field.required)");
    expect(source.slice(locationGuard, skip)).toContain("excludedPlanningFieldKeys.add");
    expect(source.slice(locationGuard, skip)).toContain("mokaLocationSelectionUnconfirmedError");
  });

  it("stops a known-answer control failure without re-entering the planner", () => {
    const source = visionFillSource();

    expect(source).toContain("registerVisionFieldAttempt(");
    expect(source).toContain("throw controlExecutionError(field, immediate)");
    expect(source).not.toContain('fieldAttemptDecision.action === "break_required"');
    expect(source).not.toContain("unchangedActionStreak");
    expect(source).not.toContain("连续两次执行后回读不一致");
  });
});
