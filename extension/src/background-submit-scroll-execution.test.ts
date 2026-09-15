import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submissionActionPatterns } from "./submission-action-policy.js";
import { trustedPointerViewportCandidates } from "./trusted-pointer-driver.js";

// Run the production locator and its emitted page functions. Only CDP transport
// and animated geometry are simulated; this is not real-browser acceptance.
const source = readFileSync(resolve(process.env.SUBMIT_DRIVER_SOURCE ?? "extension/src/background.ts"), "utf8");
const start = source.indexOf('  const cdpLivePoint = async (stage: "preview"');
const end = source.indexOf("  const locateTrustedPoint = async", start);
if (start < 0 || end < 0) throw new Error("submit locator source boundary missing");
const compiled = transpileModule(source.slice(start, end), {
  compilerOptions: { target: ScriptTarget.ES2023 }
}).outputText;

let top = 521;
let element: HTMLElement;
let blocked = false;
let scrolls: ScrollBehavior[];
const rect = (y: number) => ({ x: 497, y, left: 497, top: y, width: 118, height: 40,
  right: 615, bottom: y + 40, toJSON: () => ({}) }) as DOMRect;

function scrollToTarget(behavior: ScrollBehavior = "auto", y = 300) {
  scrolls.push(behavior);
  // CSS smooth scroll can outlast the production 250 ms delay and change a
  // point that passed elementFromPoint before the pointer is dispatched.
  if (behavior === "instant") top = y;
  else setTimeout(() => { top = y; }, 300);
}

function fixture(markup: string, mode: "root" | "nested" | "overflow" = "root") {
  document.documentElement.style.scrollBehavior = "smooth";
  document.body.innerHTML = `<div id="scroller" style="overflow-y:auto;scroll-behavior:smooth">${markup}</div>`;
  element = document.querySelector<HTMLElement>("#submit")!;
  const scroller = document.querySelector<HTMLElement>("#scroller")!;
  Object.defineProperty(element, "innerText", { configurable: true, get: () => element.textContent });
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => rect(top));
  for (const other of document.querySelectorAll<HTMLElement>("button:not(#submit),[role='dialog']")) {
    vi.spyOn(other, "getBoundingClientRect").mockReturnValue(rect(100));
  }
  element.scrollIntoView = vi.fn(options => {
    if (mode === "root") scrollToTarget(typeof options === "object" ? options.behavior : "auto");
  });
  if (mode === "nested") {
    Object.defineProperties(scroller, {
      clientHeight: { value: 400 }, scrollHeight: { value: 1400 },
      scrollTop: { configurable: true, get: () => 0, set: () => scrollToTarget("auto") }
    });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(rect(100));
    scroller.scrollTo = vi.fn(options => scrollToTarget((options as ScrollToOptions).behavior));
  }
  if (mode === "overflow") top = 950;
  vi.spyOn(window, "scrollBy").mockImplementation(options => scrollToTarget((options as ScrollToOptions).behavior));
  document.elementFromPoint = vi.fn((x, y) => !blocked && x >= 497 && x <= 615 && y >= top && y <= top + 40
    ? element : document.body);
}

function locate(stage: "preview" | "confirmation", label: string) {
  let bound: Element | null = null;
  const chrome = { debugger: { sendCommand: async (_target: unknown, method: string, params: any) => {
    if (method === "Runtime.evaluate") {
      bound = Function(`return ${params.expression}`)();
      return { result: bound ? { objectId: "submit-target" } : { subtype: "null" } };
    }
    if (method === "Runtime.callFunctionOn") {
      return { result: { value: Function(`return (${params.functionDeclaration})`)()
        .apply(bound, (params.arguments ?? []).map((arg: any) => arg.value)) } };
    }
    throw new Error(`unexpected command: ${method}`);
  } } };
  const dependencies = { chrome, target: { tabId: 1 }, action: { selector: "#initial" },
    expectedText: "预览并提交", allowConsentClick: false, submissionActionPatterns, trustedPointerViewportCandidates };
  const run = Function(...Object.keys(withInterruptionDependencies(dependencies)), `${compiled}; return cdpLivePoint;`)(...Object.values(withInterruptionDependencies(dependencies)));
  return run(stage, label) as Promise<{ x: number; y: number } | null>;
}

beforeEach(() => {
  vi.useFakeTimers(); top = 521; blocked = false; scrolls = [];
  vi.stubGlobal("innerHeight", 653);
  vi.stubGlobal("innerWidth", 1249);
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  document.documentElement.style.scrollBehavior = "";
});

describe("shared final-submit locator on CSS smooth scrolling pages", () => {
  it.each([
    ["Moka preview", '<button id="submit" class="sd-Button-container"><span>预览并提交</span></button>', "预览并提交", "root", "preview"],
    ["unrelated native submit", '<input id="submit" type="submit" value="Submit application">', "Submit application", "root", "preview"],
    ["unrelated ARIA submit", '<div id="submit" role="button">提交简历</div>', "提交简历", "root", "preview"],
    ["nested preview scroller", '<button id="submit">预览并提交</button>', "预览并提交", "nested", "preview"],
    ["nested confirmation", '<div role="dialog"><button id="submit">确认提交</button></div>', "确认提交", "nested", "confirmation"],
    ["viewport correction", '<button id="submit">提交简历</button>', "提交简历", "overflow", "preview"]
  ] as const)("keeps the resolved point on %s after the former animation deadline", async (_name, markup, label, mode, stage) => {
    fixture(markup, mode);
    const pending = locate(stage, label);
    await vi.advanceTimersByTimeAsync(250);
    const point = await pending;
    expect(point).not.toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(document.elementFromPoint(point!.x, point!.y)).toBe(element);
    expect(scrolls.length).toBeGreaterThan(0);
    expect(scrolls.every(behavior => behavior === "instant")).toBe(true);
  });

  it.each([
    '<button id="submit" disabled>提交简历</button>',
    '<button id="submit">提交简历</button><button aria-label="提交简历">提交简历</button>',
    '<button id="submit">上传简历</button>'
  ])("does not scroll or select an ineligible or ambiguous control", async markup => {
    fixture(markup);
    expect(await locate("preview", "提交简历")).toBeNull();
    expect(scrolls).toEqual([]);
  });

  it("still rejects a live point covered by another element", async () => {
    fixture('<button id="submit">提交简历</button>'); blocked = true;
    const pending = locate("preview", "提交简历");
    await vi.advanceTimersByTimeAsync(250);
    expect(await pending).toBeNull();
  });

  it("does not describe an unconfirmed attempt as accepted submission", () => {
    const diagnostic = source.slice(source.indexOf("    submission_outcome_unknown: {"), source.indexOf("    vision_service_unavailable: {"));
    expect(diagnostic).toContain("已尝试提交，但尚未确认招聘网站是否受理。");
    expect(diagnostic).toContain("retryable: false");
  });
});
