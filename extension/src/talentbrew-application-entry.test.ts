import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://careers.example.test/job/shanghai/analyst/45831/94327989472"}
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openTalentBrewApplicationFromDetailPage } from "./talentbrew-application-entry.js";
import { openGenericApplicationFromDetailPage } from "./page-adapter.js";
import { dispatchTrustedPointerClick, trustedPointerViewportPoint } from "./trusted-pointer-driver.js";

const href = "https://employer.wd1.myworkdayjobs.com/Professional/job/Shanghai/Analyst_R263801/apply";
const path = "/job/shanghai/analyst/45831/94327989472";
function link(position: "top" | "bottom") {
  return `<a class="button job-apply ${position}" data-job-id="94327989472" data-job-organization-id="45831"
    data-selector-name="job-apply-link" data-page-type="Job" data-override-candidate-card="False"
    data-delay-url="False" data-apply-url="${href}" href="${href}" rel="nofollow">${position === "top" ? "Apply Now" : "Apply"}</a>`;
}
// Reduced from the real advanced-job/header/description DOM captured on 2026-09-07.
function fixture() {
  return `<main id="content"><section class="ajd_header" id="ajd-header"><h1>Analyst</h1>
    <div class="ajd_header__job-buttons">${link("top")}</div></section>
    <section class="job-description" data-selector-name="jobdetails" data-org-id="45831" data-job-id="94327989472">
      <h2>Job description</h2><p>Qualifications</p>
      <div class="section5__job-description-button-container">${link("bottom")}</div>
    </section></main>`;
}

beforeEach(() => {
  window.history.replaceState({}, "", path);
  document.body.id = "advanced-job";
  document.body.innerHTML = fixture();
  if (!("innerText" in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true, get() { return this.textContent ?? ""; }
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 20, y: 20, top: 20, left: 20, right: 140, bottom: 60,
    width: 120, height: 40, toJSON: () => ({})
  } as DOMRect);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true, value: () => document.querySelector(".job-apply.top")
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("job-owned equivalent entry prototype", () => {
  it("reproduces the generic ambiguity and identifies the unique header control from the paired structure", async () => {
    expect(await openGenericApplicationFromDetailPage({ deferClick: true })).toMatchObject({
      clicked: false, candidateCount: 2, error: expect.stringContaining("多个投递入口")
    });
    const clicked = vi.spyOn(HTMLElement.prototype, "click");
    const detected = await openTalentBrewApplicationFromDetailPage();
    expect(detected).toMatchObject({ matched: true, clicked: false, candidateCount: 2, error: null,
      taggedTarget: { kind: "talentbrew_job_pair", text: "Apply Now", href } });
    const checked = await openTalentBrewApplicationFromDetailPage({
      expectedTarget: { url: location.href, target: detected.taggedTarget! }
    });
    expect(trustedPointerViewportPoint(checked.trustedTarget!)).toEqual({ x: 44, y: 32 });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("selects the template before its asynchronous pair is ready, then waits for both entries", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main id="content"></main>';
    expect(await openTalentBrewApplicationFromDetailPage({ probeOnly: true })).toMatchObject({ matched: true });
    setTimeout(() => { document.querySelector("main")!.innerHTML = fixture().replace(/^<main id="content">|<\/main>$/g, ""); }, 20);
    const pending = openTalentBrewApplicationFromDetailPage({ waitTimeoutMs: 100, pollIntervalMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    expect(await pending).toMatchObject({ error: null, candidateCount: 2, observationCount: 3 });
  });

  it("stops if a form appears while waiting and reports an incomplete pair accurately", async () => {
    vi.useFakeTimers();
    document.querySelector(".bottom")!.remove();
    const incomplete = await openTalentBrewApplicationFromDetailPage({ waitTimeoutMs: 0 });
    expect(incomplete).toMatchObject({ candidateCount: 1, error: expect.stringContaining("完整") });
    expect(incomplete.taggedTarget).toBeUndefined();
    setTimeout(() => document.querySelector("main")!.insertAdjacentHTML("beforeend", '<form><input name="email"></form>'), 10);
    const pending = openTalentBrewApplicationFromDetailPage({ waitTimeoutMs: 100, pollIntervalMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toMatchObject({ clicked: false, error: expect.stringContaining("包含表单") });
  });

  it.each([
    ["different destinations", () => document.querySelector<HTMLAnchorElement>(".bottom")!.href = `${href}?other=1`],
    ["stale apply metadata", () => document.querySelector<HTMLElement>(".bottom")!.dataset.applyUrl = `${href}?other=1`],
    ["different job", () => document.querySelector<HTMLElement>(".bottom")!.dataset.jobId = "111"],
    ["different organization", () => document.querySelector<HTMLElement>(".bottom")!.dataset.jobOrganizationId = "111"],
    ["description for another job", () => document.querySelector<HTMLElement>(".job-description")!.dataset.jobId = "111"],
    ["two headers", () => document.querySelector(".ajd_header")!.insertAdjacentHTML("afterend", document.querySelector(".ajd_header")!.outerHTML)],
    ["third entry", () => document.querySelector("main")!.insertAdjacentHTML("beforeend", link("bottom"))],
    ["wrong bottom ownership", () => document.querySelector("main")!.append(document.querySelector(".bottom")!)],
    ["hidden header", () => document.querySelector<HTMLElement>(".ajd_header")!.hidden = true],
    ["disabled ancestor", () => document.querySelector(".ajd_header")!.setAttribute("aria-disabled", "true")],
    ["candidate-card redirect", () => document.querySelector<HTMLElement>(".top")!.dataset.overrideCandidateCard = "True"],
    ["new-window target", () => document.querySelector<HTMLAnchorElement>(".top")!.target = "_blank"],
    ["application form", () => document.querySelector("main")!.insertAdjacentHTML("beforeend", '<form><input name="email"></form>')],
    ["unrelated identical href pair", () => document.querySelector(".job-description")!.removeAttribute("data-selector-name")]
  ] as const)("rejects %s without a click target", async (_name, mutate) => {
    mutate();
    const value = await openTalentBrewApplicationFromDetailPage({ waitTimeoutMs: 0 });
    expect(value.clicked).toBe(false);
    expect(value.error).toBeTruthy();
    expect(value.taggedTarget).toBeUndefined();
    expect(value.trustedTarget).toBeUndefined();
  });

  it("ignores a separate navigation action but never accepts an unrelated page by href equality", async () => {
    document.body.insertAdjacentHTML("afterbegin", `<nav><a href="${href}">Apply</a></nav>`);
    expect(await openTalentBrewApplicationFromDetailPage()).toMatchObject({ error: null, candidateCount: 2 });
    document.body.id = "another-template";
    expect(await openTalentBrewApplicationFromDetailPage({ probeOnly: true })).toMatchObject({ matched: false });
  });

  it("revalidates the target and live hit point immediately before the trusted click", async () => {
    const observed = await openTalentBrewApplicationFromDetailPage();
    const expected = { url: location.href, target: observed.taggedTarget! };
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => document.body });
    const covered = await openTalentBrewApplicationFromDetailPage({ expectedTarget: expected });
    expect(trustedPointerViewportPoint(covered.trustedTarget!)).toBeNull();
    for (const el of document.querySelectorAll<HTMLAnchorElement>(".job-apply")) {
      el.href = `${href}?changed=1`; el.dataset.applyUrl = el.href;
    }
    expect(await openTalentBrewApplicationFromDetailPage({ expectedTarget: expected })).toMatchObject({
      error: expect.stringContaining("目标在点击前发生变化")
    });
    window.history.replaceState({}, "", `${path}?changed=1`);
    expect(await openTalentBrewApplicationFromDetailPage({ expectedTarget: expected })).toMatchObject({
      error: expect.stringContaining("页面在点击前发生变化")
    });
  });
});

const source = ts.createSourceFile("background.ts", readFileSync(resolve("extension/src/background.ts"), "utf8"), ts.ScriptTarget.Latest, true);
const names = ["advanceAutoApplyApplicationEntryInBackground", "activateApplicationEntryWithTrustedPointer"];
const code = ts.transpileModule(source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""))
  .map(node => node.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;

describe("production entry orchestration", () => {
  function harness(transition = true) {
    const generic = vi.fn(openGenericApplicationFromDetailPage);
    const readiness = vi.fn().mockResolvedValueOnce({ decision: { status: "resolved", pageStage: "job_detail" }, observation: { url: location.href } })
      .mockResolvedValue({ decision: { status: transition ? "resolved" : "timed_out", pageStage: transition ? "login" : "job_detail" }, observation: { url: href } });
    const send = vi.fn(async (_method: string, _params?: { type?: string }) => undefined);
    const runtime = {
      chrome: { tabs: { get: async () => ({ url: location.href }) }, scripting: {
        executeScript: async ({ func, args }: { func: (...args: unknown[]) => unknown; args: unknown[] }) => [{ result: await func(...args) }]
      } }, waitForApplicationPageReadiness: readiness,
      isXiaopengJobDetailUrl: () => false, isMokaJobDetailUrl: () => false, isFeishuJobDetailUrl: () => false,
      openTalentBrewApplicationFromDetailPage: (options: Parameters<typeof openTalentBrewApplicationFromDetailPage>[0]) =>
        openTalentBrewApplicationFromDetailPage({ ...options, waitTimeoutMs: 0 }),
      openGenericApplicationFromDetailPage: generic,
      trustedPointerViewportPoint, dispatchTrustedPointerClick,
      setTimeout, Error
    };
    const run = runInNewContext(`${code}\nadvanceAutoApplyApplicationEntryInBackground`, withInterruptionDependencies(runtime)) as
      (tabId: number, input: object, sender: typeof send) => Promise<boolean>;
    return { run: () => run(7, {}, send), generic, readiness, send };
  }

  it("uses the same production locator twice, issues one pointer click, and requires destination readiness", async () => {
    const h = harness();
    expect(await h.run()).toBe(true);
    expect(h.generic).not.toHaveBeenCalled();
    expect(h.send.mock.calls.filter(([, params]) => params?.type === "mousePressed")).toHaveLength(1);
    expect(h.send.mock.calls.filter(([, params]) => params?.type === "mouseReleased")).toHaveLength(1);
    expect(h.readiness).toHaveBeenLastCalledWith(7, location.href, expect.objectContaining({ terminalStages: ["login", "application_form"] }));
  });

  it("does not try the generic Driver after a selected template fails", async () => {
    document.querySelector<HTMLElement>(".bottom")!.dataset.jobId = "111";
    const h = harness();
    await expect(h.run()).rejects.toThrow("岗位归属");
    expect(h.generic).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it("presses the current entry after a smooth-scrolling detail page changes its viewport position", async () => {
    document.documentElement.style.scrollBehavior = "smooth";
    let top = 400;
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => ({
      x: 20, y: top, top, left: 20, right: 140, bottom: top + 40,
      width: 120, height: 40, toJSON: () => ({})
    } as DOMRect));
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementation(options => {
      // Browser smooth scrolling moves the target during the existing 80ms
      // pointer-hover interval. Instant scrolling resolves before readback.
      if (typeof options === "object" && options.behavior === "instant") top = 120;
      else setTimeout(() => { top = 120; }, 20);
    });
    const h = harness();
    try {
      await h.run();
      const presses = h.send.mock.calls.filter(([, params]) => params?.type === "mousePressed");
      expect(presses).toHaveLength(1);
      expect(top).toBe(120);
      const point = presses[0]![1] as { x: number; y: number };
      expect(point.x).toBeGreaterThanOrEqual(20);
      expect(point.x).toBeLessThan(140);
      expect(point.y).toBeGreaterThanOrEqual(top);
      expect(point.y).toBeLessThan(top + 40);
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(h.generic).not.toHaveBeenCalled();
    } finally {
      document.documentElement.style.removeProperty("scroll-behavior");
    }
  });

  it("does not report navigation success when the destination remains a detail page", async () => {
    const h = harness(false);
    await expect(h.run()).rejects.toThrow("没有稳定进入登录页或申请表");
    expect(h.generic).not.toHaveBeenCalled();
  });
});
