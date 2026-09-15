import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, fillApplicationPage, type FillInstruction, type PageFieldObservation } from "./page-adapter.js";
import { dispatchControlInstruction, lockedControlRouteFailure } from "./control-adapters/field-routing.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { unsupportedRequiredControlFailure } from "./control-adapters/failures.js";

const source = readFileSync(`${process.cwd()}/extension/src/background.ts`, "utf8");
function production(name: string, end: string, dependencies: Record<string, unknown> = {}) {
  const start = source.indexOf(`async function ${name}(`) >= 0
    ? source.indexOf(`async function ${name}(`) : source.indexOf(`function ${name}(`);
  const stop = source.indexOf(end, start);
  if (start < 0 || stop < start) throw new Error(name);
  const js = ts.transpileModule(source.slice(start, stop), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(withInterruptionDependencies(dependencies)), `${js};return ${name}`)(...Object.values(withInterruptionDependencies(dependencies)));
}
const url = "https://app.mokahr.com/campus-recruitment/ztehr4/150449#/job/test/apply";
const native: PageFieldObservation = { fieldId: "native-city", selector: "#native-city",
  label: "求职意向 · 期望城市", stableFieldKey: "intention.preferred_city.native", type: "text",
  controlKind: "native", required: true, currentValue: "", options: [], validationMessage: null };
const select: PageFieldObservation = { ...native, fieldId: "select-city", selector: "#select-city",
  label: "申请信息 · 意向工作城市", stableFieldKey: "intention.preferred_city.combobox",
  type: "combobox", controlKind: "combobox" };
const instruction = (field: PageFieldObservation): FillInstruction => ({ fieldId: field.fieldId,
  stableFieldKey: field.stableFieldKey,
  selector: field.selector, expectedLabel: field.label, type: field.type, value: "深圳",
  semanticKey: "candidate.basic.currentCity" });

beforeEach(() => {
  vi.stubGlobal("location", new URL(url));
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => undefined;
  document.body.innerHTML = `<div class="sd-Dropdown-container-1CigZ">
    <label class="sd-Select-container-1Eq4x"><input id="select-city" class="sd-Input-input-10L0t" placeholder="选择意向工作城市"></label></div>
    <div><label class="sd-Input-container string_info">期望城市<input id="native-city" class="sd-Input-input-10L0t" placeholder="期望城市"></label></div>
    <label>紧急联系人<input id="unknown-required" required></label>`;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 1, y: 1,
    top: 1, left: 1, right: 101, bottom: 31, width: 100, height: 30, toJSON() {} });
  vi.stubGlobal("getComputedStyle", () => ({ display: "block", visibility: "visible", opacity: "1" }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function harness(specializedResult: Record<string, unknown> = { success: true, actual: "深圳市", error: null,
  stage: "readback", diagnostics: { failureCode: null } }) {
  const specialized = vi.fn(async () => specializedResult);
  const nativeFill = vi.fn(async (_tab, _page, instructions) => fillApplicationPage(instructions));
  const attach = vi.fn(async () => undefined);
  const chrome = { scripting: { executeScript: vi.fn(async ({ func, args }) => [{ result: await func(...args) }]) },
    tabs: { query: async () => [{ id: 99 }] }, debugger: { attach, detach: vi.fn(async () => undefined) } };
  const dispatch = production("executeDeepSeekLocationInstructionWithTrustedFocusDriver",
    "async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver(", {
      chrome, resolveControlAdapter, unsupportedRequiredControlFailure, lockedControlRouteFailure,
      isMokaApplicationUrl: () => true, isDeepSeekLocationField: () => true,
      isMokaSelectableLocationControl: field => field.controlKind === "combobox",
      MOKA_LOCATION_DRIVER_CODES: new Set(["moka.zte.location.trusted-focus.v1"]),
      executeApplicationFillInstructions: nativeFill, executeDeepSeekLocationDriver: specialized,
      recruitingAiPluginInfo: () => ({ buildCommit: "test" })
    });
  return { nativeFill, specialized, attach, run: (requested: PageFieldObservation) => {
    const page = observeApplicationPage();
    const field = page.fields.find(field => field.selector === requested.selector)!;
    return dispatchControlInstruction(page, instruction(field), {
      "generic.native.v1": async (_field, next) => (await nativeFill(7, page, [next]))[0],
      "moka.zte.location.trusted-focus.v1": (target, next) => dispatch(7, page, target, next)
    });
  } };
}

describe("production same-page native/custom city dispatch", () => {
  it.each(["选择意向工作城市", "committed-only"])("fills only the native city with a neighbouring %s selector, using its observed stable key", async (variant) => {
    if (variant === "committed-only") {
      const control = document.querySelector<HTMLInputElement>(select.selector)!;
      control.placeholder = "";
      control.parentElement!.insertAdjacentHTML("beforeend", '<span class="sd-Select-addon"></span>');
    }
    const driver = harness();
    const events: string[] = [];
    const element = document.querySelector<HTMLInputElement>(native.selector)!;
    for (const event of ["focus", "input", "change", "blur"]) element.addEventListener(event, () => events.push(event));
    const result = await driver.run(native);
    expect(result.error).toBeNull();
    expect(result).toMatchObject({ success: true, actual: "深圳", controlAdapter: {
      registrationId: "generic.native.text.v1", driver: "generic_native" } });
    expect(element.value).toBe("深圳");
    expect(events).toEqual(["focus", "input", "change", "blur"]);
    expect(document.querySelector<HTMLInputElement>(select.selector)!.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#unknown-required")!.value).toBe("");
    expect(driver.nativeFill).toHaveBeenCalledOnce();
    expect(driver.specialized).not.toHaveBeenCalled();
    expect(driver.attach).not.toHaveBeenCalled();
  });

  it("keeps the neighbouring custom city on its registered driver", async () => {
    const driver = harness();
    expect(await driver.run(select)).toMatchObject({ success: true, actual: "深圳市",
      controlAdapter: { adapterCode: "moka.zte.location.trusted-focus.v1" } });
    expect(driver.specialized).toHaveBeenCalledOnce();
    expect(driver.nativeFill).not.toHaveBeenCalled();
  });

  it("does not fall through to text on an unregistered custom city", async () => {
    document.querySelector(select.selector)!.parentElement!.className = "unknown-select";
    const driver = harness();
    expect(await driver.run(select)).toMatchObject({ success: false,
      error: expect.stringContaining("unsupported_required_control"),
      controlAdapter: { adapterCode: "unresolved.custom.v1" } });
    expect(driver.nativeFill).not.toHaveBeenCalled();
    expect(driver.specialized).not.toHaveBeenCalled();
    expect(driver.attach).not.toHaveBeenCalled();
  });

  it("preserves an actual specialized driver failure and never tries the native driver afterwards", async () => {
    const driver = harness({ success: false, actual: "深圳市", error: "location_control_interaction_failed:select:target_missing",
      stage: "select", diagnostics: { failureCode: "target_missing" } });
    expect(await driver.run(select)).toMatchObject({ success: false, driverFailureCode: "target_missing" });
    expect(driver.specialized).toHaveBeenCalledOnce();
    expect(driver.nativeFill).not.toHaveBeenCalled();
  });
});

describe("failure supplement evidence", () => {
  const evidence = production("requiredInformationEvidence", "function createCandidatePackageFromPayload(");
  it("does not manufacture missing information from fields left unfilled by a driver failure", () => {
    expect(evidence([])).toEqual({ missingFields: [] });
    const catchBlock = source.slice(source.indexOf("const requiredFieldRequests = requiredFieldRequestsFromFailure(publicFailure.details)"));
    expect(catchBlock).not.toContain("missingFields: observation.fields");
    expect(catchBlock.match(/\.\.\.requiredInformationEvidence\(requiredFieldRequests\)/g)).toHaveLength(4);
  });
  it("keeps all genuine questions and their live option lists, including more than 20 fields", () => {
    const requests = Array.from({ length: 25 }, (_, index) => ({ schemaVersion: "required-field-request.v1",
      label: `未知必填项${index}`, stableFieldKey: `custom.${index}`, options: ["甲", "乙"] }));
    expect(evidence(requests)).toEqual({ missingFields: requests.map(request => request.label), requiredFieldRequests: requests });
  });
});
