// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSiteApplicationPolicyBlockInPage } from "./site-application-policy.js";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 320, height: 80 } as DOMRect);
});
afterEach(() => {
  readSiteApplicationPolicyBlockInPage({ phase: "cleanup", token: "submit-1" });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("site application policy block", () => {
  it.each([
    "这6个月投递太多岗位，请耐心等待",
    "近六个月申请职位数量已达到上限，请耐心等待",
    "90天内投递次数过多，请稍后再试",
    "近半年投递岗位数量已达到上限，暂时无法申请",
    "Too many job applications within 6 months. Please wait."
  ])("recognizes a visible terminal application limit: %s", (message) => {
    document.body.innerHTML = `<div role="dialog"><p>${message}</p><button>我知道了</button></div>`;
    expect(readSiteApplicationPolicyBlockInPage()).toMatchObject({
      blocked: true,
      reasonCode: "site_application_limit_reached",
      message,
      source: "visible_site_policy"
    });
  });

  it.each([
    "正在提交，请耐心等待",
    "验证码通过，请耐心等待结果",
    "最近6个月有项目经历",
    "投递成功后请耐心等待通知",
    "岗位申请正在处理中",
    "投递岗位太多"
  ])("does not turn a generic message into a policy failure: %s", (message) => {
    document.body.innerHTML = `<div role="alert">${message}</div>`;
    expect(readSiteApplicationPolicyBlockInPage().blocked).toBe(false);
  });

  it("ignores hidden and extension-owned text", () => {
    document.body.innerHTML = `
      <div role="dialog" hidden>这6个月投递太多岗位，请耐心等待</div>
      <div data-recruiting-ai-overlay>近六个月申请职位数量已达到上限，请耐心等待</div>`;
    expect(readSiteApplicationPolicyBlockInPage().blocked).toBe(false);
  });

  it("does not read hidden policy children, navigation or a button label as a rejection", () => {
    document.body.innerHTML = `<div><span hidden>近半年投递岗位数量已达到上限</span>正在提交</div>
      <nav>近半年投递岗位数量已达到上限</nav><button>近半年投递岗位数量已达到上限</button>`;
    expect(readSiteApplicationPolicyBlockInPage().blocked).toBe(false);
  });

  function arm() {
    let click: EventListener | undefined;
    const add = document.addEventListener.bind(document);
    vi.spyOn(document, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "click") click = listener as EventListener;
      add(type, listener, options);
    });
    readSiteApplicationPolicyBlockInPage({ phase: "arm", token: "submit-1", submitText: "确认提交" });
    return (trusted = true) => click?.({ isTrusted: trusted, target: document.querySelector("button") } as unknown as Event);
  }
  const read = () => readSiteApplicationPolicyBlockInPage({ phase: "read", token: "submit-1" });

  it.each(["div", "p"])("retains a transient %s rejection after the trusted submit until cleanup", async tag => {
    const wake = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("chrome", { runtime: { sendMessage: wake } });
    document.body.innerHTML = "<button>确认提交</button>";
    const click = arm();
    click();
    const toast = document.createElement(tag);
    toast.setAttribute("role", "alert");
    toast.textContent = "近半年投递岗位数量已达到上限，暂时无法申请";
    document.body.append(toast);
    await Promise.resolve();
    toast.remove();
    await Promise.resolve();
    expect(read()).toMatchObject({ blocked: true, message: toast.textContent });
    expect(wake).toHaveBeenCalledExactlyOnceWith({ type: "SITE_POLICY_RECEIPT_OBSERVED", token: "submit-1" });
    expect(readSiteApplicationPolicyBlockInPage().blocked).toBe(false);
    readSiteApplicationPolicyBlockInPage({ phase: "cleanup", token: "submit-1" });
    expect(read().blocked).toBe(false);
  });

  it("ignores an old policy, untrusted click and a different attempt", async () => {
    document.body.innerHTML = '<button>确认提交</button><div role="alert">近半年投递岗位数量已达到上限</div>';
    const click = arm();
    click();
    document.body.dataset.render = "1";
    expect(read().blocked).toBe(false);
    document.querySelector("[role=alert]")?.remove();
    await Promise.resolve();
    readSiteApplicationPolicyBlockInPage({ phase: "arm", token: "submit-1", submitText: "确认提交" });
    // Synthetic dispatch must not arm the receipt observer.
    document.querySelector("button")!.click();
    const toast = document.createElement("p");
    toast.textContent = "Too many job applications within 6 months. Please wait.";
    document.body.append(toast);
    await Promise.resolve();
    toast.remove();
    expect(read().blocked).toBe(false);
    expect(readSiteApplicationPolicyBlockInPage({ phase: "read", token: "other-attempt" }).blocked).toBe(false);
  });
});
