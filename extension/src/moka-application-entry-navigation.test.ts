// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://app.mokahr.com/campus-recruitment/shopee/170008#/job/14467caa-7995-428a-a916-5a7e7f7ffde4"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openMokaApplicationFromDetailPage } from "./page-adapter.js";
import { trustedPointerViewportPoint } from "./trusted-pointer-driver.js";

function spanTemplate() {
  return `<div class="job-details-hash"><div class="heading-hash"><div class="job-info-hash">
    <span style="cursor:pointer" class="button-hash apply-btn-header-hash">申请职位</span>
    </div></div><div class="footer-hash">
    <span style="cursor:pointer" class="button-hash apply-btn-header-hash">申请职位</span>
    </div></div>`;
}

describe("Moka application entry navigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/campus-recruitment/shopee/170008#/job/14467caa-7995-428a-a916-5a7e7f7ffde4");
    if (!("innerText" in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, "innerText", {
        configurable: true,
        get() { return this.textContent ?? ""; }
      });
    }
    if (!("scrollIntoView" in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: () => undefined
      });
    }
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 20, y: 20, top: 20, left: 20, right: 140, bottom: 60,
      width: 120, height: 40, toJSON: () => ({})
    } as DOMRect);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("recognizes Moka's two equivalent apply buttons without clicking either one", async () => {
    document.body.innerHTML = `
      <main><h2>职位描述</h2>
        <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>
        <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>
      </main>`;
    await expect(openMokaApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "申请职位",
      entryTarget: "moka_equivalent_apply",
      candidateCount: 2,
      observationCount: 1,
      error: null
    });
  });

  it("selects the single job-operation entry when Moka also renders affixed and footer duplicates", async () => {
    document.body.innerHTML = `
      <div class="affix-apply-x"><button type="button" class="sd-Button-container-x button-container-y">申请职位</button></div>
      <div class="operate-btn-x"><button type="button" class="sd-Button-container-x button-container-y">申请职位</button></div>
      <div class="footer-x"><button type="button" class="sd-Button-container-x button-container-y">申请职位</button></div>`;

    await expect(openMokaApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "申请职位",
      entryTarget: "moka_primary_apply",
      candidateCount: 3,
      error: null
    });
  });

  it("waits for Moka's React detail page to render the equivalent pair", async () => {
    setTimeout(() => {
      document.body.innerHTML = `
        <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>
        <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>`;
    }, 20);
    const result = await openMokaApplicationFromDetailPage({ waitTimeoutMs: 250, pollIntervalMs: 10 });
    expect(result).toMatchObject({ matched: true, candidateCount: 2, error: null });
    expect(result.observationCount).toBeGreaterThan(1);
  });

  it("rejects a superficially similar third control instead of guessing", async () => {
    document.body.innerHTML = `
      <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>
      <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>
      <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>`;
    await expect(openMokaApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      candidateCount: 3,
      error: expect.stringContaining("数量异常")
    });
  });

  it("ignores an unrelated apply-looking control outside the documented Moka pair", async () => {
    document.body.innerHTML = `
      <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>
      <button type="button" class="sd-Button-container-x button-container-y">申请职位</button>
      <button type="button" class="other-component">申请职位</button>`;

    await expect(openMokaApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      candidateCount: 2,
      error: null
    });
  });

  it.each(["tap4fun/291", "different-tenant/170008"])("recognizes the SPAN template by structure, not the %s tenant", async tenant => {
    window.history.replaceState({}, "", `/campus-recruitment/${tenant}#/job/86a269b0-1177-4468-a365-39726252fb55`);
    document.body.innerHTML = spanTemplate();
    const click = vi.fn();
    document.body.addEventListener("click", click, { once: true });
    await expect(openMokaApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true, clicked: false, entryTarget: "moka_span_pair_apply", candidateCount: 2, error: null
    });
    expect(click).not.toHaveBeenCalled();
  });

  it("waits for the SPAN header/footer template to render", async () => {
    setTimeout(() => { document.body.innerHTML = spanTemplate(); }, 20);
    const result = await openMokaApplicationFromDetailPage({ waitTimeoutMs: 250, pollIntervalMs: 50 });
    expect(result).toMatchObject({ entryTarget: "moka_span_pair_apply", error: null });
    expect(result.observationCount).toBeGreaterThan(1);
  });

  it.each([
    ["unregistered spans", () => spanTemplate().replaceAll("apply-btn-header-hash", "other-button")],
    ["noninteractive spans", () => spanTemplate().replaceAll("cursor:pointer", "cursor:default")],
    ["two headers", () => spanTemplate().replace("footer-hash", "job-info-hash")],
    ["different job roots", () => spanTemplate().replace('<div class="footer-hash">', '</div><div class="job-details-other"><div class="footer-hash">')],
    ["third matching entry", () => spanTemplate().replace('</span>', '</span><span style="cursor:pointer" class="button-hash apply-btn-header-hash">申请职位</span>')],
    ["mixed templates", () => spanTemplate() + '<button type="button" class="sd-Button-container-x button-container-y">申请职位</button>'],
    ["hidden header", () => spanTemplate().replace('class="job-info-hash"', 'class="job-info-hash" hidden')],
    ["disabled header", () => spanTemplate().replace('class="job-info-hash"', 'class="job-info-hash" aria-disabled="true"')]
  ] as const)("does not click %s", async (_name, fixture) => {
    document.body.innerHTML = fixture();
    const result = await openMokaApplicationFromDetailPage({ waitTimeoutMs: 0 });
    expect(result.clicked).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.trustedTarget).toBeUndefined();
  });

  it("does not treat two conflicting operation areas as an equivalent pair", async () => {
    document.body.innerHTML = '<div class="operate-btn-x"><button type="button" class="sd-Button-container-x button-container-y">申请职位</button></div>'.repeat(2);
    const result = await openMokaApplicationFromDetailPage({ waitTimeoutMs: 0 });
    expect(result.error).toContain("数量异常");
    expect(result.entryTarget).toBeUndefined();
  });

  it("uses the exact same locator for detection and trusted hit-test preparation", async () => {
    document.body.innerHTML = spanTemplate();
    const entry = document.querySelector<HTMLElement>("span")!;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => entry });
    const detected = await openMokaApplicationFromDetailPage();
    const checked = await openMokaApplicationFromDetailPage({ expectedTarget: { url: location.href, kind: detected.entryTarget! } });
    expect(checked).toMatchObject({ entryTarget: "moka_span_pair_apply", clicked: false, error: null });
    expect(trustedPointerViewportPoint(checked.trustedTarget!)).toEqual({ x: 44, y: 32 });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => document.body });
    const covered = await openMokaApplicationFromDetailPage({ expectedTarget: { url: location.href, kind: detected.entryTarget! } });
    expect(trustedPointerViewportPoint(covered.trustedTarget!)).toBeNull();
  });

  it("refuses a stale URL or changed template at the pre-click boundary", async () => {
    document.body.innerHTML = spanTemplate();
    const stale = await openMokaApplicationFromDetailPage({ expectedTarget: { url: `${location.href}/apply`, kind: "moka_span_pair_apply" } });
    expect(stale).toMatchObject({ matched: false, clicked: false });
    expect(stale.trustedTarget).toBeUndefined();
    const changed = await openMokaApplicationFromDetailPage({ expectedTarget: { url: location.href, kind: "moka_equivalent_apply" } });
    expect(changed.error).toContain("结构在点击前发生变化");
    expect(changed.trustedTarget).toBeUndefined();
  });

  it("does not register the SPAN template on unrelated sites or final application pages", async () => {
    document.body.innerHTML = spanTemplate();
    window.history.replaceState({}, "", `${location.href}/apply`);
    expect((await openMokaApplicationFromDetailPage()).matched).toBe(false);
    vi.stubGlobal("location", { hostname: "jobs.example.test", pathname: "/campus-recruitment/example/1", hash: "#/job/abc-def" });
    expect((await openMokaApplicationFromDetailPage()).matched).toBe(false);
  });
});
