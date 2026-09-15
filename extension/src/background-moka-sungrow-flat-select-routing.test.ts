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

describe("Sungrow Moka flat Select registered routing", () => {
  it("routes only the two exact fields through their trusted-pointer Drivers", () => {
    const executor = sourceBetween(
      "async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver(",
      "async function executeMokaYearMonthSelectInstructionWithTrustedPointerDriver("
    );
    expect(executor).toContain("isMokaSungrowApplicationUrl(observation.url)");
    expect(executor).toContain("isMokaSungrowIdentityDocumentTypeField(fieldIdentity)");
    expect(executor).toContain("isMokaSungrowRelativeEmploymentField(fieldIdentity)");
    expect(executor).toContain('"moka.sungrow.identity-document-type.trusted-focus.v1"');
    expect(executor).toContain('"moka.sungrow.relative-employment.trusted-focus.v1"');
    expect(executor).toContain('? "sungrow_identity_document_type"');
    expect(executor).toContain('? "sungrow_relative_employment"');
    expect(executor).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update|Page\.bringToFront/u);
  });
});
