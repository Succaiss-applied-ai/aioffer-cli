import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

describe("iterative form vision field routing", () => {
  it("does not expose page actions as fill targets", () => {
    expect(backgroundSource).toContain("prevents an actionId such as");
    expect(backgroundSource).toMatch(/task: "fill_application_form",[\s\S]{0,500}actions: \[\]/u);
  });

  it("rebinds a stale dynamic fieldId by stableFieldKey", () => {
    expect(backgroundSource).toContain("requestedStableFieldKey");
    expect(backgroundSource).toContain("candidate.stableFieldKey === requestedStableFieldKey");
    expect(backgroundSource).toContain("field?.fieldId ?? requestedFieldId");
  });
});
