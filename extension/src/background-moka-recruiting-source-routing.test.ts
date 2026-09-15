import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const driverSource = readFileSync(
  new URL("./control-adapters/moka-recruiting-source-driver.ts", import.meta.url),
  "utf8"
);

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return backgroundSource.slice(from, to);
}

describe("Moka recruiting-source registered routing", () => {
  it("dispatches source fields only by the registered code", () => {
    const dispatcher = sourceBetween("async function executeApplicationFillInstructions(", "function mokaYearMonthPairIdentity(");
    const executors = sourceBetween("function mokaFlatSelectControlExecutors(",
      "async function withDiscoveredRequiredFieldOptions(");
    expect(dispatcher).toContain("mokaFlatSelectControlExecutors(tabId, live)");
    expect(executors).toContain('"moka.recruiting-source.trusted-focus.v1":');
    expect(executors).toContain('"moka.sina.weibo-frequency.trusted-focus.v1":');
    expect(executors).toContain('"moka.eqhr.travel-acceptance.trusted-focus.v1":');
    expect(executors).toContain('"moka.yongxing.ethnicity.trusted-focus.v1":');
    expect(executors).toContain('"moka.sungrow.identity-document-type.trusted-focus.v1":');
    expect(executors).toContain('"moka.sungrow.relative-employment.trusted-focus.v1":');
    expect(dispatcher).toContain("dispatchControlInstruction(");
    expect(backgroundSource).not.toContain("mokaTrustedInstructionSupported(");
  });

  it("uses one background focus-emulated trusted pointer Driver without alternate input paths", () => {
    const executor = sourceBetween(
      "async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver(",
      "async function executeMokaYearMonthSelectInstructionWithTrustedPointerDriver("
    );
    expect(executor).toContain("controlAdapter.code !== expectedAdapterCode");
    expect(executor).toContain('"moka.recruiting-source.trusted-focus.v1"');
    expect(executor).toContain('"moka.sina.weibo-frequency.trusted-focus.v1"');
    expect(executor).toContain("executeMokaRecruitingSourceDriver({");
    expect(executor).toContain("prepareFocusEmulatedTrustedPointerSurface");
    expect(executor).toContain("inspectMokaRecruitingSourceCommitPointInPage");
    expect(executor).toContain("dispatchTrustedPointerClick");
    expect(executor).toContain("releaseTrustedPointerSurface");
    expect(executor).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update/u);
    expect(executor).not.toMatch(/chrome\.tabs\.reload|location\.reload|Page\.reload/u);
    expect(executor).not.toContain("Page.bringToFront");
    expect(driverSource).not.toMatch(/\.click\(|\.focus\(|\.blur\(|\.value\s*=/u);
    expect(driverSource).not.toMatch(/dispatchEvent|Input\.insertText|keyDown|keyUp/u);
  });

  it("leaves the compatibility entry without any combobox, keyboard or pointer fallback", () => {
    const executor = sourceBetween("async function executeMokaFillInstructionWithDebugger(", "function criticalVisualReadbackFailures(");
    expect(executor).toContain("executeApplicationFillInstructions(");
    expect(executor).not.toMatch(/chrome\.|Input\.|clickPoint|combobox|instruction\.dateValue/);
  });

  it("accepts success only after exact display, closed popup and cleared validation", () => {
    expect(driverSource).toContain("mokaRecruitingSourceReadbackMatches(state.actual, input.expected)");
    expect(driverSource).toContain("state.popupClosed && state.validationCleared");
    expect(driverSource).toContain("commit_validation_not_cleared");
    expect(driverSource).toContain("trustedPointerClickCount");
    expect(driverSource).toContain("retryCount: 0");
  });
});
