import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = backgroundSource.indexOf(start);
  const endIndex = backgroundSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return backgroundSource.slice(startIndex, endIndex);
}

describe("Moka date background routing", () => {
  it("selects split dates centrally through the registered background executor", () => {
    const dispatcher = sourceBetween("async function executeApplicationFillInstructions(", "function mokaYearMonthPairIdentity(");
    const routing = readFileSync(new URL("./control-adapters/field-routing.ts", import.meta.url), "utf8");
    expect(dispatcher).toContain('"moka.year-month-select.trusted-pointer.v1":');
    expect(dispatcher).toContain("dispatchControlInstruction(");
    expect(routing).not.toContain('route.driver === "unsupported" || route.requiresForeground');
    expect(backgroundSource).not.toContain("mokaTrustedInstructionSupported(");
  });

  it("keeps the split year/month trusted-pointer driver off the user's active tab", () => {
    const driver = sourceBetween(
      "async function executeMokaYearMonthSelectInstructionWithTrustedPointerDriver(",
      "function isMokaLocationOptionUnavailable("
    );
    expect(driver).toContain("prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand)");
    expect(driver).toContain("releaseTrustedPointerSurface(sendDebuggerCommand)");
    expect(driver).toContain("backgroundTabPreserved: activeTabDuring === activeTabBefore");
    expect(driver).not.toMatch(/chrome\.tabs\.update|Page\.bringToFront/);
  });

  it("sends manual date facts through the same central dispatcher and observer identity", () => {
    const manual = sourceBetween("async function fillManualApplicationFromInfoPackage(", "function scheduleManualLoginPolling(");
    expect(manual).toContain("manualTemporalItemForObservedField(manualAssist.items, field)");
    expect(manual).toContain("executeApplicationFillInstructions(");
    expect(manual).toContain("bindObservedInstruction(postObservation, instruction)");
    expect(manual).not.toMatch(/mokaDateInstructions|mokaYearMonthInstructions|executeMokaDateInstructionWithTrustedPointerDriver\(/);
  });

  it("rebinds a React-rebuilt month by temporal identity and only replaces its year-induced default", () => {
    const rebind = sourceBetween(
      "function mokaYearMonthPairIdentity(",
      "async function executeMokaFillInstructionWithDebugger("
    );
    const iterativeFill = sourceBetween(
      "async function fillAutoApplyFormWithVision(",
      "async function executeLegacyBatchAutoApplyJob("
    );

    expect(rebind).toContain("semanticKey || stableSemantic || field.temporal.groupKey");
    expect(backgroundSource).not.toContain("findRebuiltMokaYearMonthField");
    expect(iterativeFill).toContain("const mokaImplicitMonthPairs = new Set<string>()");
    expect(iterativeFill).toContain("mokaYearMonthPairIdentity(field, instruction.semanticKey)");
    expect(iterativeFill).toContain('field.temporal?.part === "year"');
    expect(iterativeFill).toContain("mokaImplicitMonthPairs.add(mokaPairIdentity)");
    expect(iterativeFill).toContain("allowReplaceMokaImplicitMonth");
  });

  it("keeps every calendar action on the background target with no hidden foreground exception", () => {
    const dateDriver = sourceBetween(
      "async function executeMokaDateInstructionWithTrustedPointerDriver(",
      "async function executeMokaNativePlaceInstructionWithTrustedPointerDriver("
    );
    const locateOpenPoint = dateDriver.slice(
      dateDriver.indexOf("const locateOpenPoint"),
      dateDriver.indexOf("const readState")
    );

    expect(locateOpenPoint).toContain("scrollIntoView({behavior:'instant'");
    expect(locateOpenPoint).not.toContain("requestAnimationFrame");
    expect(dateDriver).toContain("const uniqueNavigationPoint = (query) =>");
    expect(dateDriver).toContain("const anchoredGlobalPopups");
    expect(dateDriver).toContain("const structuralLocalPopups");
    expect(dateDriver).toContain("explicitLocalPopups.length === 0");
    expect(dateDriver).toContain('positioned(candidate) && Boolean(candidate.querySelector("[class*=\'selector-year\']"))');
    expect(dateDriver).toContain('Boolean(root.querySelector("[class*=\'selector-year\']"))');
    expect(dateDriver).toContain("other !== candidate && other.contains(candidate)");
    expect(dateDriver).toContain("horizontalOverlap > 0 && verticalGap <= 180");
    expect(dateDriver).toContain("localPopups.length ? localPopups : anchoredGlobalPopups");
    expect(dateDriver).toContain("!popup.contains(hit) || style.cursor !== 'pointer'");
    expect(dateDriver).toContain('previousMonth: monthPanel ? null : uniqueNavigationPoint');
    expect(dateDriver).toContain('nextMonth: monthPanel ? null : uniqueNavigationPoint');
    expect(dateDriver).toContain("surfaceTargets");
    expect(dateDriver).toContain("calendarTargetVisibilityCorrection");
    expect(dateDriver).toContain("calendarTargetVisibilityStep");
    expect(dateDriver).toContain("calendarTargetVisibilityProgress");
    expect(dateDriver).toContain("shiftPickerSurface");
    expect(dateDriver).toContain("ensurePickerTargetsVisible");
    expect(dateDriver).toContain("attempt < CALENDAR_VISIBILITY_MAX_CORRECTIONS");
    expect(dateDriver).toContain("mokaCalendarPanelStructureMatches(pickerState)");
    expect(dateDriver).toContain("通用候选控件打开后未形成唯一且完整的日、月或年份面板结构");
    expect(dateDriver).toContain("日历渐进校正没有缩小目标遮挡距离");
    expect(dateDriver).toContain("日历渐进校正方向发生反复");
    expect(dateDriver).toContain("日历渐进校正达到安全上限后仍未完全显露");
    expect(dateDriver).toContain("prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand)");
    expect(dateDriver).toContain("releaseTrustedPointerSurface(sendDebuggerCommand)");
    expect(dateDriver).not.toMatch(/requiresForegroundBirthDate|chrome\.tabs\.update|Page\.bringToFront/);
  });

  it("classifies a YYYY-MM Moka placeholder as a month-precision date instruction", () => {
    const instructionFactory = sourceBetween(
      "function instructionFromObservedField(",
      "function mergeFillInstructions("
    );

    expect(instructionFactory).toContain("calendarMonthHint");
    expect(instructionFactory).toContain("calendarDateHint");
    expect(instructionFactory).toContain("calendarControlHasTemporalEvidence");
    expect(instructionFactory).toContain("field.domHints?.classNames");
    expect(instructionFactory).toContain("structurallyBoundMonthDateValue");
    expect(instructionFactory).toContain("calendarControlUsesMonthPrecision");
    expect(instructionFactory).toContain("structuredMonthDateFromValue(nextValue)");
    expect(instructionFactory).toContain("calendarMonthDateValue");
  });

  it("forces the exact Zuoyebang education end-time route to month precision", () => {
    const dateDriver = sourceBetween(
      "async function executeMokaDateInstructionWithTrustedPointerDriver(",
      "async function executeMokaNativePlaceInstructionWithTrustedPointerDriver("
    );

    expect(dateDriver).toContain('controlAdapter.code !== "moka.zuoyebang.education-end-month.trusted-pointer.v1"');
    expect(dateDriver).toContain('controlAdapter.code === "moka.zuoyebang.education-end-month.trusted-pointer.v1"');
    expect(dateDriver).toContain('[instruction.stableFieldKey, instruction.semanticKey].filter(Boolean).join(" ")');
    expect(dateDriver).toContain('? "month" as const');
    expect(dateDriver).toContain("monthOnlyInput");
    expect(dateDriver).toContain("拒绝按其他租户字段规则填写");
    expect(dateDriver).toContain("structuredDateReadbackMatches(located.value, instruction.dateValue, datePrecision)");
  });

  it("discovers newly revealed fields through a bounded cross-site loop without retrying old targets", () => {
    const manual = sourceBetween("async function fillManualApplicationFromInfoPackage(", "function scheduleManualLoginPolling(");
    expect(manual).toContain("mergeManualAssistWithObservation(manualAssist, postObservation)");
    expect(manual).toContain("attemptedKeys.has(field.stableFieldKey)");
    expect(manual).toContain("round < 3");
    expect(manual).not.toContain("mokaDynamicDatePrerequisites");
  });

  it("does not reopen a Moka date picker when the exact structured date is already committed", () => {
    const dateDriver = sourceBetween(
      "async function executeMokaDateInstructionWithTrustedPointerDriver(",
      "async function executeMokaNativePlaceInstructionWithTrustedPointerDriver("
    );

    expect(dateDriver).toContain(
      "structuredDateReadbackMatches(located.value, instruction.dateValue, datePrecision)"
    );
  });

  it("keeps the existing day grid and adds a distinct Moka birth month-panel path", () => {
    const dateDriver = sourceBetween(
      "async function executeMokaDateInstructionWithTrustedPointerDriver(",
      "async function executeMokaNativePlaceInstructionWithTrustedPointerDriver("
    );

    expect(dateDriver).toContain('mode: "day" | "month"');
    expect(dateDriver).toContain("const monthPanel = !month");
    expect(dateDriver).toContain("const yearPanel = !monthPanel && !month");
    expect(dateDriver).toContain("yearTitle:");
    expect(dateDriver).toContain("yearRangeNavigationPlan(");
    expect(dateDriver).toContain("nextDecade");
    expect(dateDriver).toContain("await clickTrustedPoint(pickerState.yearTitle)");
    expect(dateDriver).toContain("await clickTrustedPoint(pickerState.targetYear)");
    expect(dateDriver).toContain("targetMonthMatches");
    expect(dateDriver).toContain('datePrecision !== "month"');
    expect(dateDriver).toContain("选择月份后日期面板状态丢失");
    expect(dateDriver).toContain("await clickTrustedPoint(pickerState.targetMonth)");
    expect(dateDriver).toContain("await clickTrustedPoint(pickerState.targetDay)");
    expect(dateDriver).toContain("structuredDateReadbackMatches(actual, instruction.dateValue, datePrecision)");
  });

  it("routes the evidenced tap4fun birth day-grid to one dedicated Driver without v9 fallback", () => {
    const dateDriver = sourceBetween(
      "async function executeMokaDateInstructionWithTrustedPointerDriver(",
      "async function executeMokaNativePlaceInstructionWithTrustedPointerDriver("
    );
    const dedicatedDriver = sourceBetween(
      "async function executeMokaTap4funBirthDateInstructionWithTrustedPointerDriver(",
      "/**\n * Moka fields are React controlled."
    );

    expect(dateDriver).toContain('controlAdapter.code === "moka.tap4fun.birth-date.trusted-pointer.v2"');
    expect(dateDriver).toContain("return executeMokaTap4funBirthDateInstructionWithTrustedPointerDriver(");
    expect(dedicatedDriver).toContain("executeMokaTap4funBirthDateDriver({");
    expect(dedicatedDriver).toContain("prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand)");
    expect(dedicatedDriver).toContain("releaseTrustedPointerSurface(sendDebuggerCommand)");
    expect(dedicatedDriver).not.toContain("chrome.tabs.update(tabId, { active: true })");
    expect(dedicatedDriver).toContain('precision: "day"');
    expect(dedicatedDriver).not.toContain("executeMokaDateInstructionWithTrustedPointerDriver(");
  });

});
