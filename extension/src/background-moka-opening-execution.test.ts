import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { lockedControlRouteFailure } from "./control-adapters/field-routing.js";
import { resolve } from "node:path";
import { ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dates from "./date-control-strategy.js";
import * as visibility from "./calendar-target-visibility.js";
import * as opening from "./control-adapters/moka-calendar-opening.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { fieldInformationRequirement } from "./field-information.js";
import { guardFieldInformation } from "./field-information-guard.js";
import type { FillResult } from "./page-adapter.js";

// Execute the entire production Driver, including its emitted Runtime.evaluate
// expressions. Only the browser transport/site responses are simulated here.
const source = readFileSync(resolve(process.env.MOKA_DRIVER_SOURCE ?? "extension/src/background.ts"), "utf8");
const start = source.indexOf("async function executeMokaDateInstructionWithTrustedPointerDriver(");
const end = source.indexOf("async function executeMokaNativePlaceInstructionWithTrustedPointerDriver(", start);
const compiled = transpileModule(source.slice(start, end), { compilerOptions: { target: ScriptTarget.ES2023 } }).outputText;
let lastHit: Element | null = null;
const click = vi.fn();
let runtimeException = false;

function monthPanel(year = 2000) {
  return `<div class="sd-Dropdown-dropdown"><div class="sd-panal-menu-wrapper">
    <span class="sd-basic-selector-year">${year}年</span>
    <span class="sd-Icon-icondoubleLeft sd-basic-selector-icon" style="cursor:pointer"></span><span class="sd-Icon-icondoubleRight sd-basic-selector-icon" style="cursor:pointer"></span>
    ${["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"]
      .map((month) => `<div class="sd-basic-year-item">${month}月</div>`).join("")}</div></div>`;
}
function install(popup = monthPanel()) {
  document.body.innerHTML = `<div class="apply-field-test"><div class="title-test">出生日期 (年龄) *</div>
    <div class="ctrl-test"><div class="sd-Dropdown-container">
    <label class="sd-Input-container day_info"><input id="birth" readonly placeholder="出生日期 (年龄)" /></label>
    ${popup}</div></div><div class="error">必填项未填写</div></div>`;
}
function run(url = "https://app.mokahr.com/campus-recruitment/garena/148076#/job/fixture/apply") {
  const deps = { ...dates, ...visibility, ...opening, resolveControlAdapter, fieldInformationRequirement, guardFieldInformation, lockedControlRouteFailure,
    prepareFocusEmulatedTrustedPointerSurface: vi.fn(async () => undefined),
    releaseTrustedPointerSurface: vi.fn(async () => undefined),
    dispatchTrustedPointerClick: click };
  const driver = Function(...Object.keys(withInterruptionDependencies(deps)), `${compiled}; return executeMokaDateInstructionWithTrustedPointerDriver;`)(...Object.values(withInterruptionDependencies(deps)));
  return driver(1, { url }, {
    fieldId: "birth", label: "出生日期 (年龄)", stableFieldKey: "basic.birth_date.native",
    type: "text", controlKind: "native", required: true
  }, { selector: "#birth", value: "2000-03-18", dateValue: { year: 2000, month: 3, day: 18 }, datePrecision: "month" }) as Promise<FillResult>;
}

beforeEach(() => {
  vi.useFakeTimers();
  click.mockReset();
  runtimeException = false;
  install();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    lastHit = this as HTMLElement;
    return { x: 100, y: 150, left: 100, top: 150, right: 300, bottom: 170,
      width: 200, height: (this as HTMLElement).hasAttribute("hidden") ? 0 : 20 } as DOMRect;
  });
  document.elementFromPoint = vi.fn(() => lastHit);
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal("chrome", {
    scripting: { executeScript: async ({ func, args }: {func: (...args: unknown[]) => unknown; args: unknown[]}) => [{ result: func(...args) }] },
    debugger: { attach: vi.fn(async () => undefined), detach: vi.fn(async () => undefined), sendCommand: vi.fn(async (target, method, params) => {
      if (method === "Runtime.evaluate") return runtimeException
        ? { exceptionDetails: {text: "private page exception must not escape"} }
        : { result: { value: Function(`return ${params.expression}`)() } };
      return {};
    }) }
  });
  click.mockImplementation(async (_send, point) => {
    if (point.hitTag === "INPUT") {
      const popup = document.querySelector(".sd-Dropdown-dropdown");
      if (popup) popup.remove();
      else document.querySelector(".sd-Dropdown-container")!.insertAdjacentHTML("beforeend", monthPanel());
      return;
    }
    (document.querySelector("#birth") as HTMLInputElement).value = "2000-03 (26岁)";
    document.querySelector(".sd-Dropdown-dropdown")?.remove();
    document.querySelector(".error")?.remove();
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Moka production opening integration", () => {
  it.each(["garena/148076","cti/142093"])("recovers the evidenced %s zero-year panel once, then selects and commits the target month", async tenant => {
    install(monthPanel(0));
    const input = document.querySelector<HTMLInputElement>("#birth")!;
    input.value = "2005-09 (21岁)";
    let phase = "zero";
    let decade = 1900;
    const renderDecade = () => {
      document.querySelector(".sd-Dropdown-dropdown")!.innerHTML = `<div class="sd-panal-menu-wrapper">
        <span class="sd-basic-selector-year">${decade} - ${decade + 9}</span>
        <span class="sd-Icon-icondoubleLeft"></span><span class="sd-Icon-icondoubleRight"></span>
        ${Array.from({length: 10}, (_, i) => `<div class="sd-basic-year-item">${decade + i}</div>`).join("")}</div>`;
    };
    click.mockImplementation(async (_send, point) => {
      expect(point.hitTag).not.toBe("INPUT"); // no reopen/clear/keyboard path
      if (phase === "zero") {
        expect(point.hitClass).toContain("icondoubleRight");
        document.querySelector("[class*='selector-year']")!.textContent = "1901年";
        expect(input.value).toBe("2005-09 (21岁)");
        phase = "recovered";
      } else if (phase === "recovered") {
        expect(point.hitClass).toContain("selector-year");
        phase = "decade";
        renderDecade();
      } else if (phase === "decade" && point.hitClass.includes("icondoubleRight")) {
        decade += 10;
        renderDecade();
      } else if (phase === "decade") {
        expect(decade).toBe(2000);
        expect(point.hitClass).toContain("year-item");
        document.querySelector(".sd-Dropdown-dropdown")!.outerHTML = monthPanel(2000);
        phase = "month";
      } else {
        expect(phase).toBe("month");
        input.value = "2000-03 (26岁)";
        document.querySelector(".sd-Dropdown-dropdown")?.remove();
        document.querySelector(".error")?.remove();
        phase = "committed";
      }
    });
    const execution = run(`https://app.mokahr.com/campus-recruitment/${tenant}#/job/fixture/apply`);
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({ success: true, actual: "2000-03 (26岁)" });
    expect(phase).toBe("committed");
    expect(click).toHaveBeenCalledTimes(14);
    expect(document.querySelector(".sd-Dropdown-dropdown")).toBeNull();
    expect(document.querySelector(".error")).toBeNull();
  });
  it.each(["unchanged", "closed", "wrong-year", "value-changed"])("stops after one recovery when the site response is %s", async (response) => {
    install(monthPanel(0));
    document.querySelector<HTMLInputElement>("#birth")!.value = "2005-09 (21岁)";
    click.mockImplementation(async () => {
      if (response === "closed") document.querySelector(".sd-Dropdown-dropdown")?.remove();
      if (response === "wrong-year") document.querySelector("[class*='selector-year']")!.textContent = "1990年";
      if (response === "value-changed") {
        document.querySelector("[class*='selector-year']")!.textContent = "1901年";
        document.querySelector<HTMLInputElement>("#birth")!.value = "1901-01";
      }
    });
    const execution = run();
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({success:false,driverStage:"recover_panel",driverFailureCode:"zero_year_recovery_unconfirmed"});
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("does not apply zero-year recovery outside a Moka application route", async () => {
    install(monthPanel(0));
    document.querySelector<HTMLInputElement>("#birth")!.value = "2005-09 (21岁)";
    const execution = run("https://app.mokahr.com/unrelated/other/123#/job/fixture/apply");
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({success:false,driverFailureCode:"popup_state_unparsed"});
    expect(click).not.toHaveBeenCalled();
  });
  it.each(["disabled", "duplicate"])("does not operate a %s recovery arrow", async (state) => {
    install(monthPanel(0));
    document.querySelector<HTMLInputElement>("#birth")!.value = "2005-09 (21岁)";
    const arrow = document.querySelector("[class*='icondoubleRight']")!;
    if (state === "disabled") arrow.setAttribute("aria-disabled", "true");
    else arrow.after(arrow.cloneNode(true));
    const execution = run();
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({success:false});
    expect(click).not.toHaveBeenCalled();
  });
  it("recovers an already-open month panel without clicking its input or preparing scroll", async () => {
    const header = document.querySelector("[class*='selector-year']")!;
    header.setAttribute("hidden", "");
    setTimeout(() => header.removeAttribute("hidden"), 50);
    const execution = run();
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({ success: true, actual: "2000-03 (26岁)", controlAdapter: {adapterCode: "moka.date-picker.trusted-pointer.v9"} });
    expect(click).toHaveBeenCalledTimes(1); // month leaf only, no opening toggle
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelector(".error")).toBeNull();
    expect(document.querySelector(".sd-Dropdown-dropdown")).toBeNull();
  });
  it("does not click or request missing information when the open panel stays unreadable", async () => {
    document.querySelector("[class*='selector-year']")!.textContent = "";
    const execution = run();
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({ success: false, driverStage: "open", driverFailureCode: "popup_state_unparsed",
      error: expect.stringContaining("date_control_interaction_failed"), driverDiagnostics: {openClickCount: 0, popupObserved: true} });
    expect(click).not.toHaveBeenCalled();
  });
  it("does not swallow Runtime.evaluate exceptions or expose their page text", async () => {
    runtimeException = true;
    const result = await run();
    expect(result).toMatchObject({ success: false, driverStage: "open", driverFailureCode: "probe_exception" });
    expect(result.error).not.toContain("private page exception");
    expect(click).not.toHaveBeenCalled();
  });
  it("keeps two independent popups ambiguous with zero input clicks", async () => {
    install(monthPanel() + monthPanel());
    const execution = run();
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({ success: false, driverFailureCode: "popup_ambiguous" });
    expect(click).not.toHaveBeenCalled();
  });
  it("still rejects an incorrect month rather than weakening readback", async () => {
    click.mockImplementation(async () => {
      (document.querySelector("#birth") as HTMLInputElement).value = "2000-04 (26岁)";
      document.querySelector(".sd-Dropdown-dropdown")?.remove();
      document.querySelector(".error")?.remove();
    });
    const execution = run();
    await vi.runAllTimersAsync();
    expect(await execution).toMatchObject({ success: false, error: expect.stringContaining("未形成可回读的 YYYY-MM") });
  });
});
