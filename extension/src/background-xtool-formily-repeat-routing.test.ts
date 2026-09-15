import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const driver = readFileSync(
  new URL("./control-adapters/xtool-formily-repeat-native-driver.ts", import.meta.url),
  "utf8"
);

function sourceBetween(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("xTool Formily repeat native routing", () => {
  it("dispatches registered repeat fields exclusively through the central entry", () => {
    const dispatcher = sourceBetween("async function executeApplicationFillInstructions(", "function mokaYearMonthPairIdentity(");
    expect(dispatcher).toContain('"xtool.formily-repeat-native.v1":');
    expect(dispatcher).toContain("executeXToolFormilyRepeatNativeInstruction(");
    expect(dispatcher).toContain("dispatchControlInstruction(");
    expect(dispatcher).toContain("bindObservedInstruction(live, instruction)");
    expect(dispatcher).not.toContain("xtoolFormilyInstructions");
  });

  it("uses stable Formily identity without refresh, tab activation, or alternate Driver fallback", () => {
    const executor = sourceBetween(
      "async function executeXToolFormilyRepeatNativeInstruction(",
      "async function executeApplicationFillInstructions("
    );
    expect(executor).toContain('controlAdapter.code !== "xtool.formily-repeat-native.v1"');
    expect(executor).toContain("executeXToolFormilyRepeatNativeDriver");
    expect(driver).toContain("stable-identity-rebound");
    expect(driver).toContain("target.focus({ preventScroll: true })");
    expect(driver).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update|Page\.bringToFront/u);
    expect(driver).not.toMatch(/location\.reload|\.reload\(|history\.go/u);
  });
});
