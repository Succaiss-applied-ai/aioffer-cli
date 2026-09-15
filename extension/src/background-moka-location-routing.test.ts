import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source boundary missing: ${start} → ${end}`);
  return backgroundSource.slice(from, to);
}

describe("registered Moka location routing", () => {
  it("dispatches location by its registered code, not by a broad Moka attempt", () => {
    const dispatcher = sourceBetween("async function executeApplicationFillInstructions(", "function mokaYearMonthPairIdentity(");
    expect(dispatcher).toContain("dispatchControlInstruction(");
    expect(dispatcher).toContain("MOKA_LOCATION_DRIVER_CODES");
    expect(dispatcher).toContain("executeDeepSeekLocationInstructionWithTrustedFocusDriver(");
    expect(backgroundSource).not.toContain("mokaTrustedInstructionSupported(");
  });

  it("keeps the exact Moka tenant URL families and accepted adapter codes fail-closed", () => {
    const routing = sourceBetween(
      "function isMokaPhlexingLocationApplicationUrl(",
      "function isMokaLocationInteractionFailure("
    );
    const executor = sourceBetween(
      "async function executeDeepSeekLocationInstructionWithTrustedFocusDriver(",
      "async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver("
    );

    expect(routing).toContain('url.pathname === "/campus-recruitment/phlexing/100123"');
    expect(routing).toContain('"moka.phlexing.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/social-recruitment/yadea/144891"');
    expect(routing).toContain('"moka.yadea.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/social-recruitment/brother/150715"');
    expect(routing).toContain('"moka.brother.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/ztehr4/150449"');
    expect(routing).toContain('"moka.zte.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/jsti/144121"');
    expect(routing).toContain('"moka.jsti.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/sina/43536"');
    expect(routing).toContain('"moka.sina.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/xiwang/146380"');
    expect(routing).toContain('"moka.xiwang.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/yinli/148676"');
    expect(routing).toContain('"moka.yinli.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/wzgroup/76099"');
    expect(routing).toContain('"moka.wzgroup.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/transwarp/3196"');
    expect(routing).toContain('"moka.transwarp.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/newgrand/151701"');
    expect(routing).toContain('"moka.newgrand.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/newonder/146673"');
    expect(routing).toContain('"moka.newonder.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/wandacm/164049"');
    expect(routing).toContain('"moka.wandacm.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/social-recruitment/innostar1/46008"');
    expect(routing).toContain('"moka.innostar.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/ascenpower/166280"');
    expect(routing).toContain('"moka.ascenpower.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/gclpower/140979"');
    expect(routing).toContain('"moka.gclpower.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/xiaoying/148851"');
    expect(routing).toContain('"moka.xiaoying.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/simceredx/74124"');
    expect(routing).toContain('"moka.simceredx.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/eqhr/39786"');
    expect(routing).toContain('"moka.eqhr.location.trusted-focus.v1"');
    expect(routing).toContain('url.pathname === "/campus-recruitment/xgd/7850"');
    expect(routing).toContain('"moka.xgd.location.trusted-focus.v1"');
    expect(executor).toContain("MOKA_LOCATION_DRIVER_CODES.has(controlAdapter.code)");
    expect(executor).toContain("executeDeepSeekLocationDriver({");
    expect(executor).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update|Page\.bringToFront/u);
  });

  it("preflights only the current fill scope before the single per-field planner", () => {
    const legacy = sourceBetween("async function executeLegacyBatchAutoApplyJob(", "async function executeBatchAutoApplyJob(");
    expect(legacy).not.toContain("const deterministicPrefill");
    const loop = sourceBetween("async function fillAutoApplyFormWithVision(", "async function executeLegacyBatchAutoApplyJob(");
    expect(loop.indexOf("prepareScopedWorkCityChoices(")).toBeGreaterThanOrEqual(0);
    expect(loop.indexOf("prepareScopedWorkCityChoices(")).toBeLessThan(loop.indexOf("const planningObservation ="));
    expect(loop).toContain("fillScope(observation).fields.filter");
    expect(loop).toContain("input.onUnavailableRequiredOptions!(field, error)");
  });
  it("keeps the exact MetaX URL family on the same trusted city Driver", () => {
    const routing = sourceBetween(
      "function isMokaMetaxLocationApplicationUrl(",
      "function isMokaLocationInteractionFailure("
    );
    const discovery = sourceBetween(
      "async function discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver(",
      "async function executeDeepSeekLocationInstructionWithTrustedFocusDriver("
    );

    expect(routing).toContain('url.pathname === "/campus-recruitment/metax-tech/58131"');
    expect(routing).toContain('"moka.metax.location.trusted-focus.v1"');
    expect(discovery).toContain("MOKA_LOCATION_DRIVER_CODES.has(controlAdapter.code)");
    expect(discovery).toContain("executeMokaLocationOptionDiscoveryDriver");
  });

  it("uses the registered option discovery route for the sole-city fallback", () => {
    const resolver = sourceBetween(
      "async function resolveSoleMokaPreferredLocationOption(",
      "async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver("
    );

    expect(resolver).toContain("withDiscoveredRequiredFieldOptions(input.tabId, [field])");
    expect(resolver).toContain("bindObservedInstruction(observation,");
    expect(resolver).not.toContain("semanticMatches");
    expect(resolver).not.toContain("{ ...field, currentValue: result.actual }");
    expect(resolver).toContain("result.controlAdapter");
    expect(resolver).not.toContain(
      "discoverMokaLocationFieldOptionsWithTrustedFocusDriver("
    );
  });

  it("does not invent a city fact from a sole live option before the scoped planner", () => {
    const iterativeFill = sourceBetween(
      "async function fillAutoApplyFormWithVision(",
      "async function executeLegacyBatchAutoApplyJob("
    );
    const scopedDiscovery = iterativeFill.indexOf(
      "observation = await prepareScopedWorkCityChoices("
    );
    const soleResolution = iterativeFill.indexOf(
      "const soleLocation = await resolveSoleMokaPreferredLocationOption("
    );
    const planner = iterativeFill.indexOf("const planningObservation =");

    expect(scopedDiscovery).toBeGreaterThanOrEqual(0);
    expect(soleResolution).toBe(-1);
    expect(planner).toBeGreaterThan(scopedDiscovery);
    expect(iterativeFill).not.toContain('source: "live_moka_popup_single_required_option"');
  });

  it("does not route a plain Moka expected-city text input to the popup Driver", () => {
    const predicate = sourceBetween(
      "function isMokaSelectableLocationControl(",
      "function isMokaLocationInteractionFailure("
    );
    const executor = sourceBetween(
      "async function executeDeepSeekLocationInstructionWithTrustedFocusDriver(",
      "async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver("
    );

    expect(predicate).toContain('kind === "select" || kind === "combobox"');
    expect(predicate).toContain("isMokaSelectableLocationControl(input.field)");
    expect(executor).toContain("!isMokaSelectableLocationControl(field)");
  });
});
