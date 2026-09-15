// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readApplicationReceiptInPage } from "./application-receipt.js";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 20 } as DOMRect);
});
afterEach(() => vi.restoreAllMocks());

describe("authoritative application receipts (not substring matches)", () => {
  it.each([
    "已收到验证码，请填写验证码", "未投递成功，请稍后重试", "未申请成功", "提交未成功",
    "提交成功后将收到邮件通知", "如果投递成功，我们将联系您", "请确认是否提交成功",
    "申请尚未提交", "已投递岗位 12 个", "已收到您的反馈", "简历上传成功", "保存成功",
    "验证码发送成功", "successfully uploaded resume", "not submitted", "application not submitted",
    "Application submission failed", "Once submitted, you will receive an email",
    "Your application has not been submitted", "already submitted documents", "请勿重复申请",
    "不可重复申请", "每个岗位只能申请一次", "投递成功率", "Submitted applications",
    "Application submitted successfully?", "Submission successful after verification"
  ])("rejects %s", (text) => {
    document.body.innerHTML = `<main><p>${text}</p></main>`;
    expect(readApplicationReceiptInPage().success).toBe(false);
  });

  it.each([
    "投递成功", "申请成功！", "简历投递成功", "您的简历已成功投递", "申请已提交",
    "我们已收到您的申请", "Your application has been submitted successfully.",
    "Application submitted successfully", "Application received", "Thank you for applying!"
  ])("accepts a complete visible receipt: %s", (text) => {
    document.body.innerHTML = `<main><h1>${text}</h1></main>`;
    expect(readApplicationReceiptInPage()).toMatchObject({
      success: true,
      outcome: "succeeded",
      source: "visible_receipt"
    });
  });

  it.each(["您已申请过该职位", "您已投递过该岗位", "You have already applied for this position"])("recognizes scoped duplicate receipts: %s", (text) => {
    document.body.innerHTML = `<div role="alert">${text}</div>`;
    expect(readApplicationReceiptInPage().outcome).toBe("already_applied");
  });

  it.each([
    '<p hidden>投递成功</p>', '<div style="display:none"><p>申请成功</p></div>',
    '<button>投递成功</button>', '<nav><span>申请已提交</span></nav>',
    '<label>提交成功</label>', '<select><option>投递成功</option></select>',
    '<div data-recruiting-ai-overlay><p>申请成功</p></div>',
    '<p>如果<span>投递成功</span>，您将收到通知</p>',
    '<div><p hidden>投递成功</p></div>', '<div><button>申请成功</button></div>',
    '<div><nav><span>申请已提交</span></nav></div>',
    '<main><div><span style="display:none">投递成功</span></div></main>',
    '<div><div contenteditable="true">申请成功</div></div>'
  ])("ignores hidden, navigation, form labels, extension UI and nested conditional fragments: %s", (html) => {
    document.body.innerHTML = html;
    expect(readApplicationReceiptInPage().success).toBe(false);
  });

  it("does not let stale success override an explicit failure on the same page", () => {
    document.body.innerHTML = '<main><h1>投递成功</h1><div role="alert">未投递成功，请重试</div></main>';
    expect(readApplicationReceiptInPage().success).toBe(false);
  });

  it.each([
    ["https://app.mokahr.com/campus_apply/thanks", true],
    ["https://app.mokahr.com/#/apply/thanks", true],
    ["https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/b6d725c5-9972-44df-a513-3fbbea7806a2/campus_apply/thanks?jobId=b6d725c5-9972-44df-a513-3fbbea7806a2", true],
    ["https://other.example/apply/thanks", false],
    ["https://app.mokahr.com/jobs?redirect=/apply/thanks", false],
    ["https://app.mokahr.com/apply/thanks-for-visiting", false],
    ["https://xtool.jobs.feishu.cn/index/resume/applied", true],
    ["https://metaapp.jobs.feishu.cn/campus/resume/applied", true],
    ["https://dexmal-inc.jobs.feishu.cn/285572/resume/applied", true],
    ["https://other.example/index/resume/applied", false],
    ["https://xtool.jobs.feishu.cn/index/resume/applied-later", false],
    ["https://xtool.jobs.feishu.cn/index/login?redirect=/index/resume/applied", false]
  ])("validates the exact registered receipt route: %s", (url, expected) => {
    vi.stubGlobal("location", new URL(url));
    document.body.innerHTML = "";
    try { expect(readApplicationReceiptInPage().success).toBe(expected); }
    finally { vi.unstubAllGlobals(); }
  });

  it("marks the registered Moka terminal route as authoritative over stale form residue", () => {
    vi.stubGlobal("location", new URL(
      "https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/b6d725c5-9972-44df-a513-3fbbea7806a2/campus_apply/thanks?candidateId=798424465"
    ));
    document.body.innerHTML = "";
    try {
      expect(readApplicationReceiptInPage()).toMatchObject({
        success: true,
        outcome: "succeeded",
        source: "registered_receipt_url"
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
