// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://jobs.example/position/123"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openGenericApplicationFromDetailPage } from "./page-adapter.js";

describe("generic application entry navigation", () => {
  beforeEach(() => {
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
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 2400 });
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 20, y: 20, top: 20, left: 20, right: 140, bottom: 60,
      width: 120, height: 40, toJSON: () => ({})
    } as DOMRect);
  });

  it("clicks one exact application phrase on a public job detail page", async () => {
    document.body.innerHTML = '<main><h2>职位描述</h2><p>工作内容</p><button id="apply">立即申请</button></main>';
    const clicked = vi.fn();
    document.querySelector("#apply")!.addEventListener("click", clicked);

    await expect(openGenericApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: true,
      actionText: "立即申请",
      candidateCount: 1,
      error: null
    });
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("can defer a unique entry click for a registered trusted-pointer driver", async () => {
    document.body.innerHTML = '<main><h2>职位描述</h2><p>工作内容</p><button id="apply">投递</button></main>';
    const clicked = vi.fn();
    document.querySelector("#apply")!.addEventListener("click", clicked);

    await expect(openGenericApplicationFromDetailPage({ deferClick: true })).resolves.toMatchObject({
      matched: true,
      clicked: false,
      actionText: "投递",
      candidateCount: 1,
      error: null
    });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("scrolls in bounded steps to discover a lazy-rendered application entry", async () => {
    document.body.innerHTML = '<main><h2>岗位职责</h2><p>工作内容</p></main>';
    const clicked = vi.fn();
    vi.mocked(window.scrollTo).mockImplementation(() => {
      if (document.querySelector("#lazy-apply")) return;
      document.body.insertAdjacentHTML("beforeend", '<button id="lazy-apply">投递简历</button>');
      document.querySelector("#lazy-apply")!.addEventListener("click", clicked);
    });

    const result = await openGenericApplicationFromDetailPage({ scrollSteps: 3, settleMs: 50 });

    expect(result).toMatchObject({ matched: true, clicked: true, actionText: "投递简历" });
    expect(result.observationCount).toBeGreaterThan(1);
    expect(window.scrollTo).toHaveBeenCalled();
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("refuses ambiguous application entries", async () => {
    document.body.innerHTML = '<main><h2>任职要求</h2><button>投递</button><a href="/apply">申请</a></main>';

    await expect(openGenericApplicationFromDetailPage()).resolves.toMatchObject({
      matched: true,
      clicked: false,
      candidateCount: 2,
      error: expect.stringContaining("多个投递入口或申请入口")
    });
  });

  it("does not treat a real application form submit as a detail-page entry", async () => {
    document.body.innerHTML = `
      <main><h2>职位描述</h2><form>
        <input required name="name" placeholder="姓名">
        <input required name="phone" placeholder="手机号码">
        <input name="email" placeholder="邮箱">
        <button type="submit">申请</button>
      </form></main>`;

    await expect(openGenericApplicationFromDetailPage()).resolves.toMatchObject({
      matched: false,
      clicked: false
    });
  });

  it("ignores similar words without job-detail evidence", async () => {
    document.body.innerHTML = '<nav><a href="/applications">申请</a></nav><main>个人中心</main>';

    await expect(openGenericApplicationFromDetailPage()).resolves.toMatchObject({
      matched: false,
      clicked: false
    });
  });
});
