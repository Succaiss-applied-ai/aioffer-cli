import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const background = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const driver = readFileSync(new URL("./control-adapters/feishu-formily-select-driver.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string, source = background): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("Feishu Formily Select registered routing", () => {
  it("applies the Formily dialect before specialized control overlays", () => {
    const observer = sourceBetween("async function observeApplicationPageWithControlAdapters(",
      "async function stableApplicationObservation(");
    expect(observer).toContain("isFeishuFormilyApplicationUrl(generic.url)");
    expect(observer).toContain("observeApplicationWithDialectsInTab(tabId)");
    const dialect = readFileSync(new URL("./form-dialects/application-field-dialects.ts", import.meta.url), "utf8");
    expect(dialect).toContain("observeFeishuFormilyFieldPatchesInPage()");
    expect(dialect).toContain("applyApplicationFieldDialects(generic, {");
    expect(dialect.indexOf("const dialect = applyApplicationFieldDialects")).toBeLessThan(dialect.indexOf("? mergeFeishuMonthPeriodFields"));
  });

  it("uses the same registered Driver for fill and option discovery", () => {
    const dispatcher = sourceBetween("async function executeApplicationFillInstructions(",
      "function mokaYearMonthPairIdentity(");
    const discovery = sourceBetween("async function withDiscoveredRequiredFieldOptions(",
      "/** Option discovery");
    expect(dispatcher).toContain('"feishu.formily-flat-select.trusted-pointer.v1":');
    expect(dispatcher).toContain("executeFeishuFormilySelectInstruction(tabId, target, next)");
    expect(discovery).toContain('"feishu.formily-flat-select.trusted-pointer.v1":');
    expect(discovery).toContain("executeFeishuFormilySelectInstruction(tabId, field, next, true)");
  });

  it("rebinds stable identity and permits only trusted pointer actions", () => {
    const executor = sourceBetween("async function executeFeishuFormilySelectInstruction(",
      "function mokaYearMonthPairIdentity(");
    expect(executor).toContain("stableApplicationObservation(tabId, { forControlDispatch: true })");
    expect(executor).toContain("bindObservedInstruction(page, instruction)");
    expect(executor).toContain('route.code !== "feishu.formily-flat-select.trusted-pointer.v1"');
    expect(executor).toContain("dispatchTrustedPointerClick");
    expect(executor).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update|Page\.bringToFront/u);
    expect(driver).not.toMatch(/\.click\(|Input\.insertText|keyDown|keyUp|dispatchEvent|\.value\s*=/u);
    expect(driver).toContain("scrollIntoView");
    expect(driver).toContain("matchingLeafCount");
  });
});
