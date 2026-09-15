// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://careers.example.test/jobs/example-role"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, resolveApplicationUserAction } from "./page-adapter.js";

describe("generic application login classification", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    if (!("innerText" in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, "innerText", {
        configurable: true,
        get() { return this.textContent ?? ""; }
      });
    }
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 20,
      top: 20,
      left: 20,
      right: 240,
      bottom: 60,
      width: 220,
      height: 40,
      toJSON: () => ({})
    } as DOMRect);
  });

  it("does not classify a public job detail header login link as a login wall", () => {
    document.body.innerHTML = `
      <header><a href="/login">登录</a></header>
      <main><h1>职位详情</h1><button type="button">投递</button></main>
    `;

    expect(resolveApplicationUserAction()).toBeNull();
    expect(observeApplicationPage()).toMatchObject({
      loginRequired: false,
      formDetected: false
    });
  });

  it("classifies a site-independent verification login form as login required", () => {
    document.body.innerHTML = `
      <main>
        <form>
          <h1>手机号登录</h1>
          <input placeholder="手机号码" />
          <input placeholder="验证码" />
          <button type="button">获取验证码</button>
          <button type="button">登录</button>
        </form>
      </main>
    `;

    expect(resolveApplicationUserAction()).toMatchObject({
      type: "login",
      message: expect.stringContaining("验证码登录")
    });
  });

  it("classifies a site-independent password form as login required", () => {
    document.body.innerHTML = `
      <main>
        <form>
          <h1>账号登录</h1>
          <input placeholder="账号" />
          <input type="password" placeholder="密码" />
          <button type="button">登录</button>
        </form>
      </main>
    `;

    expect(resolveApplicationUserAction()).toMatchObject({ type: "login" });
    expect(observeApplicationPage().loginRequired).toBe(true);
  });
});
