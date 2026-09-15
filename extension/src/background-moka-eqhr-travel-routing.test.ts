import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return backgroundSource.slice(from, to);
}

describe("EQHR Moka travel-acceptance registered routing", () => {
  it("routes the exact field through the flat Select trusted-pointer Driver", () => {
    const executor = sourceBetween(
      "async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver(",
      "async function executeMokaYearMonthSelectInstructionWithTrustedPointerDriver("
    );
    expect(executor).toContain("isMokaEqhrTravelAcceptanceApplicationUrl(observation.url)");
    expect(executor).toContain("isMokaEqhrTravelAcceptanceField(fieldIdentity)");
    expect(executor).toContain('"moka.eqhr.travel-acceptance.trusted-focus.v1"');
    expect(executor).toMatch(/eqhrTravelAcceptance\s*\?\s*"eqhr_travel_acceptance"/u);
    expect(executor).toContain("executeMokaRecruitingSourceDriver({");
    expect(executor).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update|Page\.bringToFront/u);
  });
});
