// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeMokaTap4funBirthDateDriver,
  inspectMokaTap4funBirthDateInPage,
  isMokaTap4funBirthDateApplicationUrl,
  isMokaTap4funBirthDateField,
  readMokaTap4funBirthDateInPage,
  type MokaTap4funBirthDatePoint,
  type MokaTap4funBirthDateProbe,
  type MokaTap4funBirthDateReadback
} from "./moka-tap4fun-birth-date-driver.js";

const targetDate = { year: 2000, month: 3, day: 18 };
const point: MokaTap4funBirthDatePoint = {
  x: 100,
  y: 100,
  tagName: "SPAN",
  className: "target"
};

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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const element = this as HTMLElement;
    const top = Number(element.dataset.top ?? 20);
    const left = Number(element.dataset.left ?? 20);
    const width = Number(element.dataset.width ?? 180);
    const height = Number(element.dataset.height ?? 32);
    return {
      x: left, y: top, top, left, right: left + width, bottom: top + height,
      width, height, toJSON: () => ({ top, left, width, height })
    } as DOMRect;
  });
  document.elementFromPoint = vi.fn((x: number, y: number) => [...document.querySelectorAll<HTMLElement>("body *")]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && x >= rect.left && x <= rect.right &&
        y >= rect.top && y <= rect.bottom;
    }).at(-1) ?? null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

function installDayFixture(input: {
  popupTop?: number;
  value?: string;
  validationError?: boolean;
} = {}) {
  const popupTop = input.popupTop ?? 135;
  const headerTop = popupTop + 22;
  const dayTop = popupTop + 85;
  document.body.innerHTML = `
    <div class="apply-field-Q2iJ7AtQGX" data-top="400" data-left="20" data-width="360" data-height="450">
      <div class="title-IWWQ0Xa4L7">出生日期</div>
      <div class="sd-Dropdown-container-1CigZ" data-top="480" data-left="20" data-width="287" data-height="40">
        <input id="birth" readonly class="sd-Input-input day_info" placeholder="请选择出生日期"
          value="${input.value ?? ""}" data-top="480" data-left="20" data-width="287" data-height="40" />
        <div class="sd-Dropdown-dropdown-CNCZy" data-top="${popupTop}" data-left="20" data-width="302" data-height="336">
          <span class="sd-Icon-icondoubleLeft-c_Yti" data-top="${headerTop}" data-left="30" data-width="24"></span>
          <span class="sd-basic-selector-year-A9lG_" data-top="${headerTop}" data-left="80" data-width="60">2026年</span>
          <span class="sd-basic-selector-month-1YzKp" data-top="${headerTop}" data-left="150" data-width="45">九月</span>
          <span class="sd-Icon-icondoubleRight-3nW5D" data-top="${headerTop}" data-left="250" data-width="24"></span>
          <table><tbody><tr><td class="sd-basic-date-wrapper-fade" data-top="${dayTop}" data-left="30"><div class="sd-basic-date-item">18</div></td>
            <td data-top="${dayTop}" data-left="80"><div class="sd-basic-date-item" data-top="${dayTop}" data-left="80">18</div></td></tr></tbody></table>
        </div>
        ${input.validationError ? '<div class="error-message" data-top="840">这是必填项</div>' : ""}
      </div>
    </div>`;
}

function probe(overrides: Partial<MokaTap4funBirthDateProbe>): MokaTap4funBirthDateProbe {
  return {
    status: "popup_closed",
    mode: "closed",
    controlPoint: point,
    yearTitlePoint: null,
    monthTitlePoint: null,
    previousDecadePoint: null,
    nextDecadePoint: null,
    targetYearPoint: null,
    targetMonthPoint: null,
    targetDayPoint: null,
    year: 0,
    month: 0,
    yearRangeStart: 0,
    yearRangeEnd: 0,
    targetYearMatches: 0,
    targetMonthMatches: 0,
    targetDayMatches: 0,
    popupCount: 0,
    popupTop: 0,
    viewportHeight: 653,
    calendarTargets: [{
      top: 120,
      bottom: 140,
      left: 80,
      right: 120,
      hitVerified: true,
      obstructionBottom: 0
    }],
    preparedScroll: false,
    ...overrides
  };
}

type ScriptInput = { func: { name: string }; args?: unknown[] };

function installScriptHarness(input: {
  probes: MokaTap4funBirthDateProbe[];
  readbacks: MokaTap4funBirthDateReadback[];
}) {
  const executeScript = vi.fn(async (script: ScriptInput) => [{
    result: script.func.name === "inspectMokaTap4funBirthDateInPage"
      ? input.probes.shift() ?? null
      : script.func.name === "readMokaTap4funBirthDateInPage"
        ? input.readbacks.shift() ?? null
        : null
  }]);
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { scripting: { executeScript } }
  });
  return executeScript;
}

describe("tap4fun Moka birth-date control contract", () => {
  it("matches only tenant 291 application pages and birth-date fields", () => {
    expect(isMokaTap4funBirthDateApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/job-1/apply"
    )).toBe(true);
    expect(isMokaTap4funBirthDateApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/job-1"
    )).toBe(false);
    expect(isMokaTap4funBirthDateApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/other/291#/job/job-1/apply"
    )).toBe(false);
    expect(isMokaTap4funBirthDateField({ label: "出生日期" })).toBe(true);
    expect(isMokaTap4funBirthDateField({ semanticKey: "basic.birth_date.native" })).toBe(true);
    expect(isMokaTap4funBirthDateField({ label: "毕业日期" })).toBe(false);
  });

  it("reads the real day-grid signature and excludes the faded duplicate day", () => {
    installDayFixture({ popupTop: 135, validationError: true });
    expect(inspectMokaTap4funBirthDateInPage("#birth", targetDate)).toMatchObject({
      status: "day",
      mode: "day",
      popupCount: 1,
      popupTop: 135,
      year: 2026,
      month: 9,
      targetDayMatches: 1,
      yearTitlePoint: expect.objectContaining({ tagName: "SPAN" }),
      monthTitlePoint: expect.objectContaining({ tagName: "SPAN" }),
      targetDayPoint: expect.objectContaining({ tagName: "DIV" })
    });
    expect(readMokaTap4funBirthDateInPage("#birth")).toEqual({
      actual: "",
      popupClosed: false,
      validationCleared: false
    });
  });

  it("positions the control before opening and exposes no value mutation path", () => {
    installDayFixture();
    document.querySelector<HTMLElement>(".sd-Dropdown-dropdown-CNCZy")!.style.display = "none";
    const before = document.querySelector<HTMLInputElement>("#birth")!.value;
    expect(inspectMokaTap4funBirthDateInPage("#birth", targetDate, "prepare_open")).toMatchObject({
      status: "popup_closed",
      preparedScroll: true,
      controlPoint: expect.any(Object)
    });
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLInputElement>("#birth")!.value).toBe(before);
  });

  it("accepts a popup shell under the fixed nav when every registered header target is hittable", () => {
    installDayFixture({ popupTop: 83 });
    expect(inspectMokaTap4funBirthDateInPage("#birth", targetDate)).toMatchObject({
      status: "day",
      popupTop: 83,
      yearTitlePoint: expect.objectContaining({ tagName: "SPAN" }),
      monthTitlePoint: expect.objectContaining({ tagName: "SPAN" })
    });
  });
});

describe("tap4fun Moka birth-date Driver", () => {
  it("uses the evidenced day → year → day → month → day sequence and exact readback", async () => {
    installScriptHarness({
      readbacks: [
        { actual: "", popupClosed: true, validationCleared: false },
        { actual: "2000-03-18", popupClosed: true, validationCleared: true }
      ],
      probes: [
        probe({ status: "popup_closed", preparedScroll: true }),
        probe({
          status: "day", mode: "day", year: 2026, month: 9, popupCount: 1, popupTop: 83,
          yearTitlePoint: point, monthTitlePoint: point
        }),
        probe({
          status: "year", mode: "year", yearRangeStart: 2020, yearRangeEnd: 2029,
          previousDecadePoint: point, nextDecadePoint: point
        }),
        probe({
          status: "year", mode: "year", yearRangeStart: 2010, yearRangeEnd: 2019,
          previousDecadePoint: point, nextDecadePoint: point
        }),
        probe({
          status: "year", mode: "year", yearRangeStart: 2000, yearRangeEnd: 2009,
          previousDecadePoint: point, nextDecadePoint: point,
          targetYearPoint: point, targetYearMatches: 1
        }),
        probe({
          status: "day", mode: "day", year: 2000, month: 9,
          yearTitlePoint: point, monthTitlePoint: point
        }),
        probe({
          status: "month", mode: "month", year: 2000,
          targetMonthPoint: point, targetMonthMatches: 1
        }),
        probe({
          status: "day", mode: "day", year: 2000, month: 3,
          yearTitlePoint: point, monthTitlePoint: point,
          targetDayPoint: point, targetDayMatches: 1
        })
      ]
    });
    const clickPoint = vi.fn(async () => undefined);
    const result = await executeMokaTap4funBirthDateDriver({
      tabId: 7,
      selector: "#birth",
      dateValue: targetDate,
      prepareSurface: vi.fn(async () => undefined),
      shiftSurface: vi.fn(async () => 0),
      clickPoint,
      wait: vi.fn(async () => undefined)
    });
    expect(result).toMatchObject({
      success: true,
      stage: "readback",
      actual: "2000-03-18",
      popupClosed: true,
      validationCleared: true,
      diagnostics: {
        schemaVersion: "moka-tap4fun-birth-date-driver-diagnostic.v2",
        eventMechanism: "cdp_trusted_pointer_focus_emulation",
        failureCode: null,
        ledger: {
          positionScrollCount: 1,
          openClickCount: 1,
          yearHeaderClickCount: 1,
          decadeClickCount: 2,
          yearClickCount: 1,
          monthHeaderClickCount: 1,
          monthClickCount: 1,
          dayClickCount: 1,
          trustedPointerClickCount: 8,
          nativeEventClickCount: 0,
          keyboardEventCount: 0,
          retryCount: 0,
          fallbackDriverCount: 0
        }
      }
    });
    expect(clickPoint).toHaveBeenCalledTimes(8);
  });

  it("fails closed when the fixed navigation still covers the popup header", async () => {
    installScriptHarness({
      readbacks: [{ actual: "", popupClosed: true, validationCleared: false }],
      probes: [
        probe({ status: "popup_closed", preparedScroll: true }),
        probe({
          status: "day", mode: "day", year: 2026, month: 9, popupCount: 1,
          popupTop: -12, yearTitlePoint: null, monthTitlePoint: null
        })
      ]
    });
    const clickPoint = vi.fn(async () => undefined);
    await expect(executeMokaTap4funBirthDateDriver({
      tabId: 7,
      selector: "#birth",
      dateValue: targetDate,
      prepareSurface: vi.fn(async () => undefined),
      shiftSurface: vi.fn(async () => 0),
      clickPoint,
      wait: vi.fn(async () => undefined)
    })).resolves.toMatchObject({
      success: false,
      stage: "open",
      diagnostics: {
        failureCode: "popup_obstructed",
        ledger: { openClickCount: 1, trustedPointerClickCount: 1, fallbackDriverCount: 0 }
      }
    });
    expect(clickPoint).toHaveBeenCalledTimes(1);
  });

  it("moves an off-screen header in bounded improving steps before clicking it", async () => {
    installScriptHarness({
      readbacks: [{ actual: "", popupClosed: true, validationCleared: false }],
      probes: [
        probe({ status: "popup_closed", preparedScroll: true }),
        probe({
          status: "day", mode: "day", year: 2026, month: 9,
          calendarTargets: [{
            top: -11, bottom: 8, left: 80, right: 140,
            hitVerified: false, obstructionBottom: 60
          }]
        }),
        probe({
          status: "day", mode: "day", year: 2026, month: 9,
          calendarTargets: [{
            top: 53, bottom: 72, left: 80, right: 140,
            hitVerified: false, obstructionBottom: 60
          }]
        }),
        probe({
          status: "day", mode: "day", year: 2026, month: 9,
          yearTitlePoint: point, monthTitlePoint: point,
          calendarTargets: [{
            top: 72, bottom: 91, left: 80, right: 140,
            hitVerified: true, obstructionBottom: 60
          }]
        })
      ]
    });
    const shiftSurface = vi.fn(async (shiftY: number) => shiftY);
    const clickPoint = vi.fn(async () => undefined);
    await expect(executeMokaTap4funBirthDateDriver({
      tabId: 7,
      selector: "#birth",
      dateValue: targetDate,
      prepareSurface: vi.fn(async () => undefined),
      shiftSurface,
      clickPoint,
      wait: vi.fn(async () => undefined)
    })).resolves.toMatchObject({
      success: false,
      stage: "year_panel",
      diagnostics: {
        ledger: { positionScrollCount: 3, openClickCount: 1, yearHeaderClickCount: 1 }
      }
    });
    expect(shiftSurface.mock.calls.map(([shiftY]) => shiftY)).toEqual([64, 19]);
  });

  it("never overwrites a different existing birth date", async () => {
    installScriptHarness({
      readbacks: [{ actual: "1999-01-01", popupClosed: true, validationCleared: true }],
      probes: []
    });
    const clickPoint = vi.fn(async () => undefined);
    await expect(executeMokaTap4funBirthDateDriver({
      tabId: 7,
      selector: "#birth",
      dateValue: targetDate,
      prepareSurface: vi.fn(async () => undefined),
      shiftSurface: vi.fn(async () => 0),
      clickPoint,
      wait: vi.fn(async () => undefined)
    })).resolves.toMatchObject({
      success: false,
      stage: "detect",
      diagnostics: { failureCode: "readback_mismatch" }
    });
    expect(clickPoint).not.toHaveBeenCalled();
  });
});
