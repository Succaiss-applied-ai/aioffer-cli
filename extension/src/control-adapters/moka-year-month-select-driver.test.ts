// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeMokaYearMonthSelectDriver,
  inspectMokaYearMonthSelectInPage,
  isMokaYearMonthSelectApplicationUrl,
  isMokaYearMonthSelectField,
  mokaYearMonthSelectReadbackMatches,
  mokaYearMonthSelectMayUseLegacyFallback,
  normalizeMokaYearMonthSelectValue,
  readMokaYearMonthSelectInPage,
  type MokaYearMonthSelectProbe,
  type MokaYearMonthSelectReadback
} from "./moka-year-month-select-driver.js";

const html = String.raw;

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  if (!("innerText" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() { return this.textContent ?? ""; },
      set(value: string) { this.textContent = value; }
    });
  }
  if (!("scrollIntoView" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined
    });
  }
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const element = this as HTMLElement;
    const top = Number(element.dataset.top ?? 20);
    const left = Number(element.dataset.left ?? 20);
    const width = Number(element.dataset.width ?? 260);
    const height = Number(element.dataset.height ?? 36);
    return {
      x: left,
      y: top,
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({ top, left, width, height })
    } as DOMRect;
  });
  document.elementFromPoint = vi.fn((x: number, y: number) => {
    const candidates = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
          style.visibility !== "hidden" && x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom;
      });
    return candidates.at(-1) ?? null;
  });
});

function installYearFixture(input: {
  popupOpen?: boolean;
  display?: string;
  validationError?: boolean;
} = {}) {
  const popupOpen = input.popupOpen ?? false;
  const display = input.display ?? "";
  const validationError = input.validationError ?? true;
  document.body.innerHTML = html`
    <div class="apply-field-Q2 Select-field" data-top="20" data-left="20" data-width="560" data-height="220">
      <span class="field-title" data-top="20" data-left="20" data-width="120" data-height="24">毕业时间</span>
      <div class="sd-Dropdown-container" data-top="55" data-left="20" data-width="240" data-height="40">
        <label class="sd-Input-container sd-Select-container" data-top="55" data-left="20" data-width="240" data-height="40">
          <span class="sd-Input-display-value" data-top="60" data-left="30" data-width="200" data-height="28">${display}</span>
          <input id="graduation-year" type="text" placeholder="年" readonly value=""
            data-top="55" data-left="20" data-width="240" data-height="40" />
        </label>
        <div class="sd-Dropdown-dropdown" style="display:${popupOpen ? "block" : "none"}"
          data-top="100" data-left="20" data-width="240" data-height="100">
          <div class="sd-Menu-content-item" title="2126" data-top="108" data-left="28" data-width="224" data-height="28">
            <div id="year-2026" class="option-label" data-top="108" data-left="28" data-width="224" data-height="28">2026</div>
          </div>
          <div class="sd-Menu-content-item" title="2125" data-top="140" data-left="28" data-width="224" data-height="28">
            <div class="option-label" data-top="140" data-left="28" data-width="224" data-height="28">2025</div>
          </div>
        </div>
      </div>
      <div class="sd-Dropdown-container" data-top="55" data-left="290" data-width="240" data-height="40">
        <label class="sd-Input-container sd-Select-container" data-top="55" data-left="290" data-width="240" data-height="40">
          <input id="graduation-month" type="text" placeholder="月" readonly value=""
            data-top="55" data-left="290" data-width="240" data-height="40" />
        </label>
      </div>
      ${validationError
        ? '<div class="error-message" data-top="202" data-left="20" data-width="160" data-height="24">必填项未填写</div>'
        : ""}
    </div>
  `;
}

describe("Moka split year/month control contract", () => {
  it("recognizes only Moka application URLs and observed split temporal Select fields", () => {
    expect(isMokaYearMonthSelectApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/yokagames/41940#/job/job-1/apply"
    )).toBe(true);
    expect(isMokaYearMonthSelectApplicationUrl("https://careers.example.com/job/job-1/apply")).toBe(false);
    expect(isMokaYearMonthSelectField({
      label: "教育经历 · 结束时间 · 年",
      semanticKey: "resume.education.0.endDate",
      type: "combobox",
      controlKind: "combobox",
      temporal: { layout: "year_month", part: "year" }
    })).toBe(true);
    expect(isMokaYearMonthSelectField({
      label: "教育背景 · 结束时间 · 月",
      semanticKey: "resume.education.0.endDate",
      type: "combobox",
      controlKind: "combobox",
      temporal: { layout: "year_month_range", part: "month" }
    })).toBe(true);
    expect(isMokaYearMonthSelectField({
      label: "毕业时间 · 年",
      semanticKey: "resume.education.0.endDate",
      type: "text",
      controlKind: "native",
      temporal: { layout: "year_month", part: "year" }
    })).toBe(true);
    expect(isMokaYearMonthSelectField({
      label: "教育背景 · 结束时间 · 月",
      semanticKey: "resume.education.0.endDate",
      type: "custom_date_picker",
      controlKind: "custom_date_picker",
      temporal: { layout: "year_month_range", part: "month" }
    })).toBe(true);
    expect(isMokaYearMonthSelectField({
      label: "性别",
      type: "combobox",
      controlKind: "combobox",
      temporal: null
    })).toBe(false);
  });

  it("allows the legacy Moka Select fallback only before the dedicated driver mutates the page", () => {
    expect(mokaYearMonthSelectMayUseLegacyFallback({
      success: false,
      stage: "detect",
      failureCode: "control_missing",
      diagnostics: null
    })).toBe(true);
    expect(mokaYearMonthSelectMayUseLegacyFallback({
      success: false,
      stage: "prepare_open",
      failureCode: "control_not_clickable",
      diagnostics: {
        ledger: {
          scrollCount: 0,
          openClickCount: 0,
          optionClickCount: 0,
          trustedPointerClickCount: 0
        }
      }
    })).toBe(true);
    expect(mokaYearMonthSelectMayUseLegacyFallback({
      success: false,
      stage: "open",
      failureCode: "open_event_not_observed",
      diagnostics: {
        ledger: {
          scrollCount: 0,
          openClickCount: 1,
          optionClickCount: 0,
          trustedPointerClickCount: 1
        }
      }
    })).toBe(false);
    expect(mokaYearMonthSelectMayUseLegacyFallback({
      success: false,
      stage: "readback",
      failureCode: "readback_mismatch",
      diagnostics: null
    })).toBe(false);
  });

  it("uses rendered year text instead of stale title metadata", () => {
    installYearFixture({ popupOpen: true });
    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year"
    )).toMatchObject({
      status: "ready",
      matchingOptionCount: 1,
      availableOptions: ["2026", "2025"],
      optionPoint: { tagName: "DIV", className: "option-label" }
    });
  });

  it("recognizes the bilingual year and month placeholders used by Moka tenants", () => {
    installYearFixture();
    document.querySelector("#graduation-year")?.setAttribute("placeholder", "年 / Year");
    document.querySelector("#graduation-month")?.setAttribute("placeholder", "月 / Month");

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year",
      "prepare_open"
    )).toMatchObject({
      status: "popup_closed",
      controlPoint: expect.objectContaining({ tagName: "LABEL" })
    });
    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-month",
      "6",
      "month",
      "prepare_open"
    )).toMatchObject({
      status: "popup_closed",
      controlPoint: expect.objectContaining({ tagName: "LABEL" })
    });
  });

  it("keeps the real clickable Moka menu item when its label is a plain span", () => {
    installYearFixture({ popupOpen: true });
    const popup = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown")!;
    popup.innerHTML = html`
      <div id="real-year-2026" class="sd-Menu-content-item-3BOO1" title="2126"
        data-top="108" data-left="28" data-width="224" data-height="28">
        <span data-top="108" data-left="36" data-width="40" data-height="28">2026</span>
      </div>
      <div class="sd-Menu-content-item-3BOO1" title="2125"
        data-top="140" data-left="28" data-width="224" data-height="28">
        <span data-top="140" data-left="36" data-width="40" data-height="28">2025</span>
      </div>
    `;

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year"
    )).toMatchObject({
      status: "ready",
      matchingOptionCount: 1,
      availableOptions: ["2026", "2025"],
      optionPoint: { tagName: "SPAN", className: "" }
    });
  });

  it("recognizes normalized leaf labels when a Moka tenant uses an unknown hashed menu-item class", () => {
    installYearFixture({ popupOpen: true });
    const popup = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown")!;
    popup.innerHTML = html`
      <div class="sd-List-row-A1b2" title="2126"
        data-top="108" data-left="28" data-width="224" data-height="28">
        <span id="tenant-year-2026" data-top="108" data-left="36" data-width="40" data-height="28">2026</span>
      </div>
      <div class="sd-List-row-A1b2" title="2125"
        data-top="140" data-left="28" data-width="224" data-height="28">
        <span data-top="140" data-left="36" data-width="40" data-height="28">2025</span>
      </div>
    `;

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year"
    )).toMatchObject({
      status: "ready",
      matchingOptionCount: 1,
      availableOptions: ["2026", "2025"],
      optionPoint: { tagName: "SPAN", className: "" }
    });
  });

  it("recognizes a rebuilt month Select whose placeholder was replaced by the implicit display value", () => {
    installYearFixture();
    const input = document.querySelector<HTMLInputElement>("#graduation-month")!;
    input.removeAttribute("placeholder");
    const select = input.closest<HTMLElement>("[class*='Select-container']")!;
    select.insertAdjacentHTML(
      "afterbegin",
      '<span class="sd-Input-display-value" data-top="60" data-left="300" data-width="200" data-height="28">1</span>'
    );

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-month",
      "6",
      "month",
      "prepare_open"
    )).toMatchObject({
      status: "popup_closed",
      controlPoint: expect.objectContaining({ tagName: "LABEL" })
    });
  });

  it("keeps a rebuilt year Select addressable after Moka clears its placeholder and input value", () => {
    installYearFixture();
    const input = document.querySelector<HTMLInputElement>("#graduation-year")!;
    input.removeAttribute("placeholder");
    document.querySelector("#graduation-year")?.previousElementSibling?.remove();
    const field = input.closest<HTMLElement>(".apply-field-Q2")!;
    const dropdowns = [...field.querySelectorAll<HTMLElement>(":scope > .sd-Dropdown-container")];
    field.insertAdjacentHTML(
      "beforeend",
      "<div><div><div><div><div><div id='deep-select-pair'></div></div></div></div></div></div>"
    );
    document.querySelector("#deep-select-pair")!.append(...dropdowns);
    expect(field.innerText).toContain("毕业时间");
    expect([...field.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")]
      .filter((candidate) => Boolean(candidate.closest("[class*='Select'],[class*='select']"))))
      .toHaveLength(2);

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year",
      "prepare_open"
    )).toMatchObject({
      status: "popup_closed",
      controlPoint: expect.objectContaining({ tagName: "LABEL" })
    });
  });

  it("ignores an unrelated visible global dropdown instead of treating it as this field's popup", () => {
    installYearFixture();
    document.body.insertAdjacentHTML(
      "beforeend",
      html`<div role="listbox" data-top="500" data-left="300" data-width="240" data-height="100">
        <div role="option" data-top="508" data-left="308" data-width="224" data-height="28">男</div>
      </div>`
    );

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year",
      "prepare_open"
    )).toMatchObject({
      status: "popup_closed",
      popupCount: 0,
      controlPoint: expect.objectContaining({ tagName: "LABEL" })
    });
  });

  it("returns a trusted-scroll target when Moka initially renders only the future-year window", () => {
    installYearFixture({ popupOpen: true });
    const popup = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown")!;
    popup.style.overflowY = "auto";
    popup.innerHTML = html`
      <div class="option-label" data-top="108" data-left="28" data-width="224" data-height="28">2126</div>
      <div class="option-label" data-top="140" data-left="28" data-width="224" data-height="28">2027</div>
    `;
    Object.defineProperty(popup, "scrollHeight", { configurable: true, value: 6400 });
    Object.defineProperty(popup, "clientHeight", { configurable: true, value: 100 });

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2023",
      "year"
    )).toMatchObject({
      status: "option_needs_scroll",
      scrollPoint: expect.objectContaining({ x: 140, y: 150 }),
      scrollDeltaY: 240
    });
  });

  it("does not DOM-scroll an exact option when a previous observation left the popup open", () => {
    installYearFixture({ popupOpen: true });
    const target = document.querySelector<HTMLElement>("#year-2026")!;
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year",
      "prepare_open"
    )).toMatchObject({ status: "ready", scrolled: true });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("uses trusted menu scrolling when the exact option is outside the viewport", () => {
    installYearFixture({ popupOpen: true });
    const popup = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown")!;
    const target = document.querySelector<HTMLElement>("#year-2026")!;
    target.dataset.top = "-140";
    Object.defineProperty(popup, "scrollHeight", { configurable: true, value: 6400 });
    Object.defineProperty(popup, "clientHeight", { configurable: true, value: 100 });

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year",
      "prepare_open"
    )).toMatchObject({
      status: "option_needs_scroll",
      matchingOptionCount: 1,
      scrollPoint: expect.objectContaining({ x: 140, y: 150 }),
      scrollDeltaY: -276
    });
  });

  it("scrolls a partially clipped option fully into the popup before clicking it", () => {
    installYearFixture({ popupOpen: true });
    const popup = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown")!;
    const target = document.querySelector<HTMLElement>("#year-2026")!;
    target.dataset.top = "190";
    Object.defineProperty(popup, "scrollHeight", { configurable: true, value: 6400 });
    Object.defineProperty(popup, "clientHeight", { configurable: true, value: 100 });

    expect(inspectMokaYearMonthSelectInPage(
      "#graduation-year",
      "2026",
      "year",
      "prepare_open"
    )).toMatchObject({
      status: "option_needs_scroll",
      matchingOptionCount: 1,
      scrollDeltaY: 120
    });
  });

  it("normalizes only valid exact years and numeric months", () => {
    expect(normalizeMokaYearMonthSelectValue("2026年", "year")).toBe("2026");
    expect(normalizeMokaYearMonthSelectValue("2126", "year")).toBe("");
    expect(normalizeMokaYearMonthSelectValue("06月", "month")).toBe("6");
    expect(normalizeMokaYearMonthSelectValue("13月", "month")).toBe("");
    expect(mokaYearMonthSelectReadbackMatches("06月", "6", "month")).toBe(true);
  });

  it("does not mutate the field when the exact target option is absent", () => {
    installYearFixture({ popupOpen: true });
    const input = document.querySelector<HTMLInputElement>("#graduation-year")!;
    let inputEvents = 0;
    let changeEvents = 0;
    input.addEventListener("input", () => { inputEvents += 1; });
    input.addEventListener("change", () => { changeEvents += 1; });
    expect(inspectMokaYearMonthSelectInPage("#graduation-year", "2024", "year")).toMatchObject({
      status: "option_missing",
      availableOptions: ["2026", "2025"]
    });
    expect(input.value).toBe("");
    expect(inputEvents).toBe(0);
    expect(changeEvents).toBe(0);
  });

  it("reads the selected display value instead of the empty internal input", () => {
    installYearFixture({ display: "2026", validationError: true });
    expect(readMokaYearMonthSelectInPage("#graduation-year")).toEqual({
      actual: "2026",
      popupClosed: true,
      validationCleared: false
    });
  });
});

type ScriptInput = { func: { name: string }; args?: unknown[] };

function installScriptHarness(handlers: Record<string, (input: ScriptInput) => unknown>) {
  const executeScript = vi.fn(async (input: ScriptInput) => [{ result: handlers[input.func.name]?.(input) ?? null }]);
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { scripting: { executeScript } }
  });
  return executeScript;
}

const controlPoint = { x: 120, y: 75, tagName: "LABEL", className: "sd-Select-container" };
const optionPoint = { x: 140, y: 122, tagName: "DIV", className: "option-label" };
const closedProbe = (scrolled = false): MokaYearMonthSelectProbe => ({
  status: "popup_closed",
  controlPoint,
  optionPoint: null,
  scrollPoint: null,
  scrollDeltaY: 0,
  popupCount: 0,
  matchingOptionCount: 0,
  availableOptions: [],
  scrolled
});
const readyProbe = (): MokaYearMonthSelectProbe => ({
  status: "ready",
  controlPoint,
  optionPoint,
  scrollPoint: null,
  scrollDeltaY: 0,
  popupCount: 1,
  matchingOptionCount: 1,
  availableOptions: ["2026", "2025"],
  scrolled: false
});
const scrollProbe = (): MokaYearMonthSelectProbe => ({
  status: "option_needs_scroll",
  controlPoint,
  optionPoint: null,
  scrollPoint: { x: 140, y: 150, tagName: "DIV", className: "sd-Dropdown-dropdown" },
  scrollDeltaY: 560,
  popupCount: 1,
  matchingOptionCount: 0,
  availableOptions: ["2099", "2027"],
  scrolled: false
});

describe("Moka split year/month Driver state machine", () => {
  it("refuses to overwrite a preexisting mismatch without an explicit repair authorization", async () => {
    installScriptHarness({
      readMokaYearMonthSelectInPage: () => ({ actual: "2025", validationCleared: false, popupClosed: true })
    });
    const prepareSurface = vi.fn(async () => undefined);
    const clickPoint = vi.fn(async () => undefined);
    const result = await executeMokaYearMonthSelectDriver({
      tabId: 4,
      selector: "#project-end-year",
      expected: "2026",
      part: "year",
      prepareSurface,
      clickPoint,
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: false, stage: "readback",
      diagnostics: { failureCode: "preexisting_value_mismatch" } });
    expect(prepareSurface).not.toHaveBeenCalled();
    expect(clickPoint).not.toHaveBeenCalled();
  });

  it("replaces only a Moka month default explicitly attributed to the sibling year action", async () => {
    const readbacks: MokaYearMonthSelectReadback[] = [
      { actual: "1", validationCleared: true, popupClosed: true },
      { actual: "6", validationCleared: true, popupClosed: true }
    ];
    installScriptHarness({
      readMokaYearMonthSelectInPage: () => readbacks.shift() ?? {
        actual: "6", validationCleared: true, popupClosed: true
      },
      inspectMokaYearMonthSelectInPage: () => closedProbe()
    });
    let inspectCount = 0;
    const executeScript = vi.mocked(chrome.scripting.executeScript);
    executeScript.mockImplementation(async (input: ScriptInput) => [{
      result: input.func.name === "readMokaYearMonthSelectInPage"
        ? readbacks.shift() ?? { actual: "6", validationCleared: true, popupClosed: true }
        : inspectCount++ === 0 ? closedProbe() : readyProbe()
    }] as never);
    const clickPoint = vi.fn(async () => undefined);
    const result = await executeMokaYearMonthSelectDriver({
      tabId: 4,
      selector: "#graduation-month",
      expected: "6",
      part: "month",
      allowReplacePreexisting: true,
      prepareSurface: async () => undefined,
      clickPoint,
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: true, actual: "6" });
    expect(clickPoint).toHaveBeenCalledTimes(2);
  });

  it("uses bounded trusted wheel input until the target year enters the virtualized window", async () => {
    let inspectCount = 0;
    const readbacks: MokaYearMonthSelectReadback[] = [
      { actual: "", validationCleared: false, popupClosed: false },
      { actual: "2023", validationCleared: false, popupClosed: true }
    ];
    installScriptHarness({
      readMokaYearMonthSelectInPage: () => readbacks.shift() ?? {
        actual: "2023", validationCleared: false, popupClosed: true
      },
      inspectMokaYearMonthSelectInPage: () => inspectCount++ === 0 ? scrollProbe() : readyProbe()
    });
    const clickPoint = vi.fn(async () => undefined);
    const scrollPoint = vi.fn(async () => undefined);
    const result = await executeMokaYearMonthSelectDriver({
      tabId: 5,
      selector: "#graduation-year",
      expected: "2023",
      part: "year",
      prepareSurface: async () => undefined,
      clickPoint,
      scrollPoint,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      success: true,
      actual: "2023",
      diagnostics: { ledger: { scrollCount: 1, optionClickCount: 1 } }
    });
    expect(scrollPoint).toHaveBeenCalledTimes(1);
    expect(scrollPoint).toHaveBeenCalledWith(scrollProbe().scrollPoint, 560);
    expect(clickPoint).toHaveBeenCalledWith(optionPoint);
  });

  it("selects directly from the unique popup when option discovery left it open", async () => {
    const readbacks: MokaYearMonthSelectReadback[] = [
      { actual: "", validationCleared: false, popupClosed: false },
      { actual: "2026", validationCleared: false, popupClosed: true }
    ];
    installScriptHarness({
      readMokaYearMonthSelectInPage: () => readbacks.shift() ?? {
        actual: "2026", validationCleared: false, popupClosed: true
      },
      inspectMokaYearMonthSelectInPage: () => ({ ...readyProbe(), scrolled: true })
    });
    const clickPoint = vi.fn(async () => undefined);
    const result = await executeMokaYearMonthSelectDriver({
      tabId: 6,
      selector: "#graduation-year",
      expected: "2026",
      part: "year",
      prepareSurface: async () => undefined,
      clickPoint,
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      success: true,
      actual: "2026",
      diagnostics: {
        ledger: {
          openAttemptCount: 0,
          openClickCount: 0,
          optionAttemptCount: 1,
          optionClickCount: 1,
          trustedPointerClickCount: 1
        }
      }
    });
    expect(clickPoint).toHaveBeenCalledTimes(1);
    expect(clickPoint).toHaveBeenCalledWith(optionPoint);
  });

  it("selects the year once and permits the shared validation to remain until month selection", async () => {
    let inspectCount = 0;
    const readbacks: MokaYearMonthSelectReadback[] = [
      { actual: "", validationCleared: false, popupClosed: true },
      { actual: "2026", validationCleared: false, popupClosed: true }
    ];
    installScriptHarness({
      readMokaYearMonthSelectInPage: () => readbacks.shift() ?? readbacks.at(-1) ?? {
        actual: "2026", validationCleared: false, popupClosed: true
      },
      inspectMokaYearMonthSelectInPage: (input) => input.args?.[3] === "prepare_open"
        ? closedProbe(true)
        : (++inspectCount ? readyProbe() : closedProbe())
    });
    const clickPoint = vi.fn(async () => undefined);
    const result = await executeMokaYearMonthSelectDriver({
      tabId: 7,
      selector: "#graduation-year",
      expected: "2026",
      part: "year",
      prepareSurface: async () => undefined,
      clickPoint,
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      success: true,
      actual: "2026",
      validationCleared: false,
      diagnostics: {
        failureCode: null,
        ledger: {
          openClickCount: 1,
          optionClickCount: 1,
          trustedPointerClickCount: 2,
          nativeEventClickCount: 0,
          keyboardEventCount: 0,
          retryCount: 0
        }
      }
    });
    expect(clickPoint).toHaveBeenCalledTimes(2);
  });

  it("does not block the next split part on the range's shared required validation", async () => {
    const readbacks: MokaYearMonthSelectReadback[] = [
      { actual: "", validationCleared: false, popupClosed: true },
      { actual: "6月", validationCleared: false, popupClosed: true }
    ];
    installScriptHarness({
      readMokaYearMonthSelectInPage: () => readbacks.shift() ?? {
        actual: "6月", validationCleared: false, popupClosed: true
      },
      inspectMokaYearMonthSelectInPage: (input) => input.args?.[3] === "prepare_open"
        ? closedProbe(true)
        : { ...readyProbe(), availableOptions: ["5月", "6月", "7月"] }
    });
    const result = await executeMokaYearMonthSelectDriver({
      tabId: 8,
      selector: "#graduation-month",
      expected: "6",
      part: "month",
      prepareSurface: async () => undefined,
      clickPoint: async () => undefined,
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: true, actual: "6月", validationCleared: false });
  });
});
