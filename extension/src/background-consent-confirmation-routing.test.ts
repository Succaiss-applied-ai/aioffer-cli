import { readFileSync } from "node:fs";
import ts from "typescript";
import { requiredFieldFailures } from "./form-validation.js";
import { evidenceForField } from "./control-adapters/field-routing.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const driverSource = readFileSync(
  new URL("./control-adapters/consent-confirmation-driver.ts", import.meta.url),
  "utf8"
);

function sourceBetween(start: string, end: string): string {
  const from = backgroundSource.indexOf(start);
  const to = backgroundSource.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source boundary missing: ${start} → ${end}`);
  return backgroundSource.slice(from, to);
}

describe("background consent confirmation routing", () => {
  it("does not promote required date toggles or ordinary boolean answers to agreements", () => {
    const ast=ts.createSourceFile("background.ts",backgroundSource,ts.ScriptTarget.Latest,true);
    const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==="authorizedConsentCandidates")!;
    const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2023}}).outputText;
    const run=Function("requiredFieldFailures","evidenceForField","resolveControlAdapter",`${js};return authorizedConsentCandidates;`)(requiredFieldFailures,evidenceForField,resolveControlAdapter);
    const fields=["至今","是否有工作经验","我已阅读并同意隐私协议"].map((label,index)=>({fieldId:`f${index}`,selector:`#f${index}`,stableFieldKey:`other.${label}.checkbox`,label,type:"checkbox",controlKind:"checkbox",required:true,currentValue:"false",options:[],domHints:{tagName:"INPUT",inputType:"checkbox",readOnly:false,classNames:[]}}));
    const observed={url:"https://app.mokahr.com/social-recruitment/trunk/39504#/job/example/apply",fields,actions:[]};
    expect(run(observed).map((c:any)=>c.action.text)).toEqual(["我已阅读并同意隐私协议"]);
    fields[2]!.currentValue="true";
    expect(run(observed)).toEqual([]);
  });
  it("routes authorized Moka/generic agreements through the dedicated trusted-pointer driver", () => {
    const flow = sourceBetween(
      "async function ensureAuthorizedPageConsents(",
      "async function fillAutoApplyFormWithVision("
    );

    expect(flow).toContain("executeConsentConfirmationDriver");
    expect(flow).toContain("inspectConsentConfirmationInPage");
    expect(flow).toContain("dispatchTrustedPointerScroll");
    expect(flow).toContain("dispatchTrustedPointerClick");
    expect(flow).toContain("prepareFocusEmulatedTrustedPointerSurface");
    expect(flow).toContain("releaseTrustedPointerSurface");
    expect(flow).toContain("chrome.debugger.detach");
    expect(flow).not.toContain("executeAuthorizedConsentAction");
    expect(flow).not.toMatch(/chrome\.tabs\.update|chrome\.windows\.update|Page\.bringToFront|Page\.reload/u);
  });

  it("uses direct confirmation first and the bottom-scroll plus ten-second wait only as fallback", () => {
    const direct = driverSource.indexOf("!directConfirmationAttempted && state.status === \"modal_ready\"");
    const scroll = driverSource.indexOf("stage = \"scroll_agreement\"", direct);
    const fallbackWait = driverSource.indexOf("AGREEMENT_CONFIRMATION_FALLBACK_WAIT_MS", scroll);

    expect(direct).toBeGreaterThan(-1);
    expect(scroll).toBeGreaterThan(direct);
    expect(fallbackWait).toBeGreaterThan(scroll);
    expect(driverSource).toContain("const AGREEMENT_CONFIRMATION_FALLBACK_WAIT_MS = 10_000");
    expect(driverSource).toContain("const AGREEMENT_SCROLL_DELTA = 8_000");
    expect(driverSource).toContain("const AGREEMENT_SCROLL_PASSES = 3");
  });

  it("scopes generic confirm text to a privacy dialog and excludes final submit controls", () => {
    expect(driverSource).toContain("const forbiddenSubmit");
    expect(driverSource).toContain("const privacyDialog");
    expect(driverSource).toContain("confirmationPattern");
    expect(driverSource).toMatch(/!forbiddenSubmit\.test\(buttonText\(element\)\)/u);
    expect(driverSource).toContain("matchingConfirmationCount");
  });

  it("defers generic agreement actions until after the candidate fields have passed the fill flow", () => {
    const visionFill = sourceBetween(
      "async function fillAutoApplyFormWithVision(",
      "async function executeFinalSubmitWithDebugger("
    );
    const finalConsentGate = backgroundSource.indexOf(
      '// All sites share the registered consent operation after re-observation.'
    );
    const finalPreSubmit = backgroundSource.indexOf("const submitActions = [requireUniqueFinalSubmitAction", finalConsentGate);

    expect(visionFill).not.toContain("ensureAuthorizedPageConsents(input.tabId, observation)");
    expect(visionFill).not.toContain("func: ensureMokaAuthenticityDeclaration");
    expect(visionFill).toContain("mokaAuthenticityDeclarationDeferred");
    expect(finalConsentGate).toBeGreaterThan(-1);
    expect(finalPreSubmit).toBeGreaterThan(finalConsentGate);
  });
});
