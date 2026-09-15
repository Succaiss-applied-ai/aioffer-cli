// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScriptTarget, transpileModule } from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMokaCalendarOnce, type MokaCalendarProbe } from "./control-adapters/moka-calendar-opening.js";
import {
  mokaCalendarPanelStructureMatches,
  mokaPickerHeaderParserExpression,
  mokaPickerMonthParserExpression,
  type MokaCalendarPanelStructure
} from "./date-control-strategy.js";

// Execute the actual Runtime.evaluate expression from the production Driver.
// Do not stub popupCount: that hid the nested-container regression in !111.
const source = readFileSync(resolve("extension/src/background.ts"), "utf8");
const driverStart = source.indexOf("async function executeMokaDateInstructionWithTrustedPointerDriver(");
const start = source.indexOf("let lastPickerProbe:", driverStart);
const end = source.indexOf("const shiftPickerSurface =", start);
if (driverStart < 0 || start < driverStart || end < start) throw new Error("Moka readState source not found");
const compiled = transpileModule(source.slice(start, end), {
  compilerOptions: { target: ScriptTarget.ES2023 }
}).outputText;
const reader = Function(
  "runtimeValue", "selector", "instruction", "mokaPickerHeaderParserExpression", "mokaPickerMonthParserExpression",
  "located", `${compiled}\nreturn { readState, probe: () => lastPickerProbe };`
)(
  (expression: string) => Function(`return ${expression}`)(),
  JSON.stringify("#graduation"),
  { dateValue: { year: 2026, month: 9, day: 2 } },
  mokaPickerHeaderParserExpression,
  mokaPickerMonthParserExpression,
  { placeholder: "日期（年月日）" }
) as { readState: () => Promise<(MokaCalendarPanelStructure & { targetDay: unknown }) | null>;
  probe: () => MokaCalendarProbe<MokaCalendarPanelStructure> };
const readState = reader.readState;

const popupSelector = "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown'],[class*='panal-menu-wrapper'],[class*='panel-menu-wrapper']";

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const hidden = (this as HTMLElement).closest("[hidden]");
    return { x: 100, y: 150, left: 100, top: 150, width: hidden ? 0 : 300,
      height: hidden ? 0 : 334, right: 400, bottom: 484, toJSON: () => ({}) } as DOMRect;
  });
  document.elementFromPoint = vi.fn(() => document.querySelector("[data-target-day]"));
});

function panel(mode: "day" | "month" | "year" = "day"): string {
  const navigation = '<span class="sd-Icon-icondoubleLeft"></span><span class="sd-Icon-icondoubleRight"></span>';
  if (mode === "year") return `${navigation}<span class="sd-basic-selector-year">2020 - 2029</span>
    ${Array.from({ length: 10 }, (_, i) => `<div>${2020 + i}</div>`).join("")}`;
  if (mode === "month") return `${navigation}<span class="sd-basic-selector-year">2026年</span>
    ${Array.from({ length: 12 }, (_, i) => `<div>${i + 1}月</div>`).join("")}`;
  return `${navigation}<span class="sd-basic-selector-year">2026年</span>
    <span class="sd-basic-selector-month">九月</span><table><tbody><tr>
    <td class="sd-basic-fade"><div class="sd-basic-date-item">2</div></td>
    ${Array.from({ length: 30 }, (_, i) => `<td><div class="sd-basic-date-item" ${i === 1 ? "data-target-day" : ""}>${i + 1}</div></td>`).join("")}
    </tr></tbody></table>`;
}

function install(content: string): HTMLElement {
  document.body.innerHTML = `<div class="apply-field-Q2iJ7AtQGX">
    <div class="title-IWWQ0Xa4L7">毕业时间 *</div><div class="ctrl-CICMG4Fr4_">
    <div class="sd-Dropdown-container-1CigZ"><label class="sd-Input-container-2S_vM day_info">
    <input id="graduation" readonly placeholder="日期（年月日）" /></label>${content}</div></div></div>`;
  return document.querySelector(".sd-Dropdown-container-1CigZ")!;
}

describe("Moka production calendar DOM observation", () => {
  it.each(["day", "month", "year"] as const)("accepts the real nested dropdown/menu wrappers in %s mode", async (mode) => {
    const root = install(`<div class="sd-Dropdown-dropdown-GmACl"><div class="sd-panal-menu-wrapper-8Q6m4">${panel(mode)}</div></div>`);
    expect(root.querySelectorAll(popupSelector)).toHaveLength(2);
    const state = await readState();
    expect(state).toMatchObject({ mode, popupCount: 1 });
    expect(mokaCalendarPanelStructureMatches(state!)).toBe(true);
    if (mode === "day") expect(state?.targetDay).not.toBeNull();
  });

  it("keeps the original single visible container supported", async () => {
    install(`<div class="sd-Dropdown-dropdown-GmACl">${panel()}</div>`);
    expect(await readState()).toMatchObject({ mode: "day", popupCount: 1, year: 2026, month: 9 });
  });

  it("accepts a visible panel-menu wrapper without an outer dropdown", async () => {
    install(`<div class="sd-panel-menu-wrapper">${panel()}</div>`);
    expect(await readState()).toMatchObject({ mode: "day", popupCount: 1 });
  });

  it("collapses deeper wrapper nesting without counting the same calendar repeatedly", async () => {
    install(`<div class="sd-dropdown-dropdown"><div class="sd-panel-menu-wrapper"><div class="sd-panal-menu-wrapper">${panel()}</div></div></div>`);
    expect(await readState()).toMatchObject({ mode: "day", popupCount: 1 });
  });

  it("ignores hidden stale wrappers", async () => {
    install(`<div hidden class="sd-Dropdown-dropdown-old"><div class="sd-panal-menu-wrapper-old">${panel()}</div></div>
      <div class="sd-Dropdown-dropdown-live"><div class="sd-panal-menu-wrapper-live">${panel()}</div></div>`);
    expect(await readState()).toMatchObject({ mode: "day", popupCount: 1 });
  });

  it("never uses a calendar belonging to another field", async () => {
    install("");
    document.body.insertAdjacentHTML("beforeend", `<div class="sd-Dropdown-container-other"><input readonly />
      <div class="sd-Dropdown-dropdown-other">${panel()}</div></div>`);
    expect(await readState()).toBeNull();
  });

  it("still rejects two independent visible popups in the same control", async () => {
    install(`<div class="sd-Dropdown-dropdown-a">${panel()}</div><div class="sd-Dropdown-dropdown-b">${panel()}</div>`);
    expect(await readState()).toBeNull();
  });

  it("does not admit two separate day panels inside one wrapper", async () => {
    install(`<div class="sd-Dropdown-dropdown">${panel()}${panel()}</div>`);
    const state = await readState();
    expect(state?.yearTitleMatches).toBe(2);
    expect(mokaCalendarPanelStructureMatches(state!)).toBe(false);
  });

  it("rejects an unrelated menu with no calendar structure", async () => {
    install('<div class="sd-Dropdown-dropdown"><span>选项一</span><span>选项二</span></div>');
    const state = await readState();
    expect(mokaCalendarPanelStructureMatches(state!)).toBe(false);
  });

  it("polls an already-open nested calendar without clicks, writes or scrolling", async () => {
    install(`<div class="sd-Dropdown-dropdown"><div class="sd-panal-menu-wrapper">${panel()}</div></div>`);
    const click = vi.fn();
    const change = vi.fn();
    document.body.addEventListener("click", click);
    document.body.addEventListener("change", change);
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    for (let i = 0; i < 3; i += 1) {
      expect(await readState()).toMatchObject({ mode: "day", year: 2026, month: 9, popupCount: 1 });
    }
    expect(click).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect((document.querySelector("#graduation") as HTMLInputElement).value).toBe("");
    document.body.removeEventListener("click", click);
    document.body.removeEventListener("change", change);
  });

  it("never toggles an open month panel whose header has not rendered yet", async () => {
    install(`<div class="sd-Dropdown-dropdown"><div class="sd-panal-menu-wrapper">${panel("month")}</div></div>`);
    const header = document.querySelector("[class*='selector-year']")!;
    header.setAttribute("hidden", "");
    const click = vi.fn();
    const prepare = vi.fn();
    const execution = await openMokaCalendarOnce({
      inspect: async () => { await readState(); return reader.probe(); },
      ready: (state) => !!state && mokaCalendarPanelStructureMatches(state),
      prepare, click,
      wait: async () => { header.removeAttribute("hidden"); }
    });
    expect(execution.failureCode).toBeNull();
    expect(execution.state).toMatchObject({ mode: "month", year: 2026 });
    expect(click).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(execution.diagnostics.statuses).toEqual(["popup_open", "popup_open"]);
  });

  it("does not mistake an opacity-zero opening transition for a closed popup", async () => {
    install(`<div class="sd-Dropdown-dropdown" style="opacity:0"><div class="sd-panal-menu-wrapper">${panel("month")}</div></div>`);
    expect(await readState()).toBeNull();
    expect(reader.probe()).toMatchObject({ status: "popup_open", popupCount: 1 });
    const click = vi.fn();
    const execution = await openMokaCalendarOnce({
      inspect: async () => { await readState(); return reader.probe(); },
      ready: (state) => !!state && mokaCalendarPanelStructureMatches(state),
      prepare: vi.fn(), click,
      wait: async () => { (document.querySelector(".sd-Dropdown-dropdown") as HTMLElement).style.opacity = "1"; }
    });
    expect(execution.failureCode).toBeNull();
    expect(click).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", "control_missing"], ["duplicate", "control_ambiguous"],
    ["changed", "control_signature_changed"], ["closed", "popup_closed"],
    ["ambiguous", "popup_ambiguous"]
  ])("reports %s separately from unreadable calendar state", async (fixture, status) => {
    const root = install(fixture === "ambiguous"
      ? `<div class="sd-Dropdown-dropdown-a">${panel()}</div><div class="sd-Dropdown-dropdown-b">${panel()}</div>` : "");
    const input = document.querySelector("#graduation")!;
    if (fixture === "missing") input.remove();
    if (fixture === "duplicate") root.append(input.cloneNode(true));
    if (fixture === "changed") input.setAttribute("placeholder", "其他字段");
    expect(await readState()).toBeNull();
    expect(reader.probe().status).toBe(status);
  });

  it("retains month structure and offscreen geometry when a fixed header obscures the year", async () => {
    install(`<div class="sd-Dropdown-dropdown">${panel("month")}</div>`);
    const header = document.querySelector("[class*='selector-year']")!;
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ left: 738, right: 792, top: -11.5,
      bottom: 7.5, width: 54, height: 19 } as DOMRect);
    const state = await readState();
    expect(state).toMatchObject({ mode: "month", year: 2026, yearTitle: null });
    expect(mokaCalendarPanelStructureMatches(state!)).toBe(true);
    expect(state).toMatchObject({surfaceTargets: expect.arrayContaining([
      expect.objectContaining({ top: -11.5, bottom: 7.5, hitVerified: false })
    ])});
  });
});
