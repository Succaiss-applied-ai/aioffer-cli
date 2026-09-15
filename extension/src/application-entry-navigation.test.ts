// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xiaopeng.jobs.feishu.cn/campus/position/7658239728123545907/detail"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openXiaopengApplicationFromDetailPage } from "./page-adapter.js";

describe("application entry navigation", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/campus/position/7658239728123545907/detail");
    document.body.innerHTML = "";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
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

  it("returns the unique Xiaopeng entry to the shared trusted-pointer coordinator", async () => {
    document.body.innerHTML = '<main><button id="apply">投递</button></main>';
    const clicked = vi.fn();
    document.querySelector("#apply")!.addEventListener("click", clicked);
    await expect(openXiaopengApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      observationCount: 1,
      error: null
    });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("uses the same guarded entry flow for Xiaopeng's index detail route", async () => {
    history.replaceState({}, "", "/index/position/detail/7679439372929157419");
    document.body.innerHTML = '<main><button id="apply">投递</button></main>';
    const clicked = vi.fn();
    document.querySelector("#apply")!.addEventListener("click", clicked);

    await expect(openXiaopengApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("waits for the React detail page to render its application entry", async () => {
    const clicked = vi.fn();
    setTimeout(() => {
      document.body.innerHTML = '<main><button id="delayed-apply" type="button">投递</button></main>';
      document.querySelector("#delayed-apply")!.addEventListener("click", clicked);
    }, 20);

    const result = await openXiaopengApplicationFromDetailPage({
      waitTimeoutMs: 250,
      pollIntervalMs: 10
    });

    expect(result).toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });
    expect(result.observationCount).toBeGreaterThan(1);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("keeps observing beyond the old eight-second limit", async () => {
    vi.useFakeTimers();
    const clicked = vi.fn();
    try {
      setTimeout(() => {
        document.body.innerHTML = '<main><button id="slow-apply" type="button">投递</button></main>';
        document.querySelector("#slow-apply")!.addEventListener("click", clicked);
      }, 20_000);

      const resultPromise = openXiaopengApplicationFromDetailPage();
      await vi.advanceTimersByTimeAsync(20_100);
      const result = await resultPromise;

      expect(result).toMatchObject({
        matched: true,
        clicked: false,
        candidateCount: 1,
        error: null
      });
      expect(result.waitedMs).toBeGreaterThanOrEqual(20_000);
      expect(clicked).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses an ambiguous application entry instead of guessing", async () => {
    document.body.innerHTML = '<button>投递</button><button>立即申请</button>';
    await expect(openXiaopengApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      candidateCount: 2
    });
  });

  it("does not treat a public header login link as an application entry", async () => {
    document.body.innerHTML = '<header><a href="/campus/login">登录</a></header><main>职位详情</main>';

    await expect(openXiaopengApplicationFromDetailPage({ waitTimeoutMs: 0 })).resolves.toMatchObject({
      matched: true,
      clicked: false,
      candidateCount: 0,
      observationCount: 1,
      error: expect.stringMatching(/等待唯一投递入口渲染超时.*readyState=.*visibility=/)
    });
  });

  it("does not prematurely reject an inactive tab while the entry is rendering", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    document.body.innerHTML = '<header><a href="/campus/login">登录</a></header><main>职位详情</main>';

    setTimeout(() => { document.body.innerHTML += '<button type="button">投递</button>'; }, 20);
    await expect(openXiaopengApplicationFromDetailPage({ waitTimeoutMs: 250, pollIntervalMs: 50 })).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });
  });
});
