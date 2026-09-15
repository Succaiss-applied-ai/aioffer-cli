import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const driverSource = readFileSync(new URL("./control-adapters/feishu-month-period-driver.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string, source = backgroundSource): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("Feishu month-period registered routing", () => {
  it("collects only visible specialized month-range labels", () => {
    const observer = sourceBetween("async function observeApplicationPageWithControlAdapters(", "async function stableApplicationObservation(");
    expect(observer).toContain("isFeishuMonthPeriodApplicationUrl");
    expect(observer).toContain("observeApplicationWithDialectsInTab(tabId)");
    const dialect = readFileSync(new URL("./form-dialects/application-field-dialects.ts", import.meta.url), "utf8");
    expect(dialect).toContain("observeFeishuMonthPeriodFieldsInPage");
    expect(dialect).toContain("isFeishuMonthPeriodApplicationUrl");
    expect(dialect).toContain("specializedByStableKey");
    expect(dialect).toContain("specializedByStableKey.get(field.stableFieldKey) ?? field");
  });

  it("dispatches the registered month-range exclusively through the central entry", () => {
    const dispatcher = sourceBetween("async function executeApplicationFillInstructions(", "function mokaYearMonthPairIdentity(");
    expect(dispatcher).toContain('"feishu.month-period.trusted-pointer.v3":');
    expect(dispatcher).toContain("executeFeishuMonthPeriodInstructionWithTrustedFocusDriver(");
    expect(dispatcher).toContain("dispatchControlInstruction(");
    expect(dispatcher).not.toContain("genericInstructions");
    expect(backgroundSource).toContain("structuredDateFromValue(nextValue) ?? monthPeriodDateValue");
  });

  it("uses background trusted pointer without value or keyboard fallbacks", () => {
    const executor = sourceBetween("async function executeFeishuMonthPeriodInstructionWithTrustedFocusDriver(", "async function executeApplicationFillInstructions(");
    expect(executor).toContain('controlAdapter.code !== "feishu.month-period.trusted-pointer.v3"');
    expect(executor).toContain("stableFieldKey: instruction.stableFieldKey");
    expect(executor).toContain("prepareFocusEmulatedTrustedPointerSurface");
    expect(executor).toContain("dispatchTrustedPointerClick");
    expect(executor).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update|Page\.bringToFront/u);
    expect(driverSource).not.toMatch(/\.click\(|\.focus\(|\.blur\(|\.value\s*=/u);
    expect(driverSource).not.toMatch(/Input\.insertText|keyDown|keyUp|dispatchEvent/u);
    expect(driverSource).toContain("prepareFeishuMonthPeriodControlInPage");
    expect(driverSource).toContain("scrollIntoView");
  });
});
