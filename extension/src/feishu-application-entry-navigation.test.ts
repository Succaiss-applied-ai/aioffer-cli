// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xtool.jobs.feishu.cn/index/position/7678562627672541486/detail"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openFeishuApplicationFromDetailPage } from "./page-adapter.js";

describe("Feishu application entry navigation", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/index/position/7678562627672541486/detail");
    document.body.innerHTML = "";
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
      x: 20, y: 20, top: 20, left: 20, right: 180, bottom: 60,
      width: 160, height: 40, toJSON: () => ({})
    } as DOMRect);
  });

  it("recognizes the real xTool primary entry and defers the trusted click", async () => {
    document.body.innerHTML = `
      <button id="apply" type="button" class="atsx-btn apply-block-applyBtn atsx-btn-primary atsx-btn-lg">
        <span>投递</span>
      </button>`;
    const clicked = vi.fn();
    document.querySelector("#apply")!.addEventListener("click", clicked);

    await expect(openFeishuApplicationFromDetailPage({ deferClick: true })).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("does not fall back to a synthetic DOM click when the trusted pointer is unavailable", async () => {
    document.body.innerHTML = `
      <button id="apply" type="button" class="atsx-btn apply-block-applyBtn atsx-btn-primary atsx-btn-lg">
        <span>投递</span>
      </button>`;
    const clicked = vi.fn();
    document.querySelector("#apply")!.addEventListener("click", clicked);

    await expect(openFeishuApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("waits for a delayed Feishu React entry render", async () => {
    setTimeout(() => {
      document.body.innerHTML = '<button type="button" class="apply-block-applyBtn">投递</button>';
    }, 20);

    const result = await openFeishuApplicationFromDetailPage({
      waitTimeoutMs: 250,
      pollIntervalMs: 10,
      deferClick: true
    });

    expect(result).toMatchObject({ matched: true, candidateCount: 1, error: null });
    expect(result.observationCount).toBeGreaterThan(1);
  });

  it("supports tenant-scoped Feishu detail routes observed in exported jobs", async () => {
    history.replaceState({}, "", "/285572/position/7675695124068534534/detail");
    document.body.innerHTML = '<button type="button" class="apply-block-applyBtn">投递</button>';

    await expect(openFeishuApplicationFromDetailPage({ deferClick: true })).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });

    history.replaceState({}, "", "/graduate/position/7679341586716002596/detail");
    await expect(openFeishuApplicationFromDetailPage({ deferClick: true })).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });
  });

  it("refuses ambiguous Feishu entries when no unique primary control exists", async () => {
    document.body.innerHTML = "<button>投递</button><button>立即申请</button>";
    await expect(openFeishuApplicationFromDetailPage({ deferClick: true })).resolves.toMatchObject({
      matched: true,
      clicked: false,
      candidateCount: 2,
      error: expect.stringContaining("多个投递入口")
    });
  });

  it("does not run on a non-detail Feishu route", async () => {
    history.replaceState({}, "", "/index/login");
    document.body.innerHTML = "<button>投递</button>";
    await expect(openFeishuApplicationFromDetailPage()).resolves.toMatchObject({
      matched: false,
      clicked: false,
      observationCount: 0
    });
  });
});
