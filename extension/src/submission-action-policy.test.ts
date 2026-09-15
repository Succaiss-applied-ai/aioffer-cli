// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submissionPhrases, submissionActionPatterns, isSubmissionActionText, isPreviewSubmissionText } from "./submission-action-policy.js";
import { observeApplicationPage } from "./page-adapter.js";
import { requireUniqueFinalSubmitAction } from "./auto-apply-site-validation.js";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 120, height: 40, left: 0, top: 0 } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent; } });
});
afterEach(() => vi.restoreAllMocks());

describe("shared submission phrase policy", () => {
  it.each([...submissionPhrases.preview, ...submissionPhrases.submit, ...submissionPhrases.confirmation])(
    "recognizes complete phrase: %s", text => {
      expect(isSubmissionActionText(text)).toBe(true);
      document.body.innerHTML = `<button><span><span>${text}</span></span></button>`;
      expect(requireUniqueFinalSubmitAction(observeApplicationPage()).text).toBe(text);
    });
  it.each([
    "预览并提交 / Preview and submit", "Preview and submit / 预览并提交", "预览并提交（Preview and submit）",
    "预览并提交\nPreview and submit", "预览并提交 ／ Ｐｒｅｖｉｅｗ ａｎｄ ｓｕｂｍｉｔ", "预 览 并 提 交 / Preview and submit",
    "提交简历 / Send my resume", "确认提交 / Confirm submission", "提交 / Submit", "Submit / 提交"
  ])("accepts bilingual formatting without requiring translation equality: %s", text => {
    expect(isSubmissionActionText(text)).toBe(true);
  });
  it.each([
    "取消提交", "取消预览并提交 / Cancel", "暂不提交申请", "不要提交简历", "未完成申请", "不能继续提交",
    "提交申请失败", "提交简历成功", "已提交申请", "查看提交申请记录", "如何提交申请", "提交申请指南",
    "保存草稿后提交申请", "返回修改后确认提交", "提交 / Cancel", "Do not submit application",
    "Submit application failed", "Not now / Apply now", "View submitted application", "application status",
    "resubmit", "submitter", "application", "确定", "确认 / Confirm", "OK"
  ])("does not turn a notice, negative or weak word into submission: %s", text => {
    expect(isSubmissionActionText(text)).toBe(false);
    document.body.innerHTML = `<button>${text}</button>`;
    expect(observeApplicationPage().actions.filter(a => a.kind === "final_submit")).toHaveLength(0);
  });
  it.each(submissionPhrases.preview)("does not treat the preview itself as final confirmation: %s", text => {
    expect(isPreviewSubmissionText(text)).toBe(true);
    expect(isSubmissionActionText(text, "confirmation")).toBe(false);
  });
  it.each(submissionPhrases.consentSubmit)("requires independent consent permission: %s", text => {
    expect(isSubmissionActionText(text)).toBe(false);
    expect(isSubmissionActionText(text, "initial", true)).toBe(true);
    document.body.innerHTML = `<button>${text}</button>`;
    const page = observeApplicationPage();
    expect(() => requireUniqueFinalSubmitAction(page)).toThrow("协议确认许可");
    expect(requireUniqueFinalSubmitAction(page, true).requiresConsent).toBe(true);
  });
  it("observes the original bjwgby button once, preserving its full label", () => {
    document.body.innerHTML = '<div class="submitApply-s_IljbB0Og"><div class="sd-Tooltip-container-2B2OE"><button class="sd_global_focus_controller_class sd-Button-container-1cq0K sd-foundation-bold-body-secondary-1UKiw sd-Button-primary-Riulm sd-Button-lg-3bz1y btn-bg-color no-adaptive-tooltip" type="button"><span class="sd-Button-content-1Zgzx"><span>预览并提交 / Preview and submit</span></span></button></div></div>';
    const page = observeApplicationPage();
    const action = requireUniqueFinalSubmitAction(page);
    expect(page.actions.filter(a => a.kind === "final_submit")).toHaveLength(1);
    expect(action.text).toBe("预览并提交 / Preview and submit");
    expect(document.querySelector(action.selector)?.tagName).toBe("BUTTON");
  });
  it("does not inherit a parent container's submit text into another button", () => {
    document.body.innerHTML = '<div><p>请填写信息后提交申请</p><button>保存</button></div>';
    expect(observeApplicationPage().actions.filter(a => a.kind === "final_submit")).toHaveLength(0);
  });
  it.each(["div", "span", "p"])("recognizes semantic ARIA %s buttons without CSS cursor heuristics", tag => {
    document.body.innerHTML = `<${tag} role="button"><span>Finish application</span></${tag}>`;
    const action = requireUniqueFinalSubmitAction(observeApplicationPage());
    expect(action.text).toBe("Finish application");
    expect(document.querySelector(action.selector)?.getAttribute("role")).toBe("button");
  });
  it("keeps ambiguity visible even when there are more than 80 submit actions", () => {
    document.body.innerHTML = Array.from({length: 85}, () => '<button>提交申请</button>').join("");
    const page = observeApplicationPage();
    expect(page.actions.filter(a => a.kind === "final_submit")).toHaveLength(85);
    expect(() => requireUniqueFinalSubmitAction(page)).toThrow("不唯一");
  });
  it("keeps two independent identical submit controls ambiguous", () => {
    document.body.innerHTML = '<button>提交简历 / Submit resume</button><button>提交简历 / Submit resume</button>';
    const page = observeApplicationPage();
    expect(page.actions.filter(a => a.kind === "final_submit")).toHaveLength(2);
    expect(() => requireUniqueFinalSubmitAction(page)).toThrow("不唯一");
  });
  it("does not hide a late submit control behind the action display limit", () => {
    document.body.innerHTML = Array.from({length: 90}, (_, i) => `<button>操作${i}</button>`).join("") +
      '<button>预览并提交 / Preview and submit</button>';
    expect(requireUniqueFinalSubmitAction(observeApplicationPage()).text).toBe("预览并提交 / Preview and submit");
  });
  it("ignores hidden controls but does not force disabled buttons", () => {
    document.body.innerHTML = '<div hidden><button>提交申请</button></div><button disabled>提交简历</button>';
    expect(() => requireUniqueFinalSubmitAction(observeApplicationPage())).toThrow("禁用了");
  });
  it("runs the observer with explicit JSON patterns in a closure-free Chrome world", () => {
    document.body.innerHTML = '<button>预览并提交 / Preview and submit</button>';
    const serialized = new Function("policy", `return (${observeApplicationPage.toString()})(policy)`);
    expect(serialized(JSON.parse(JSON.stringify(submissionActionPatterns))).actions).toEqual(observeApplicationPage().actions);
  });
});
