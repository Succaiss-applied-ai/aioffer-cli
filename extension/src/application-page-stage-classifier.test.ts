// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xtool.jobs.feishu.cn/index/position/7678562627672541486/detail"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";

describe("universal application page stage classifier", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/index/position/7678562627672541486/detail");
    document.title = "DIY案例设计实习生";
    document.body.innerHTML = "";
    if (!("innerText" in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, "innerText", {
        configurable: true,
        get() { return this.textContent ?? ""; }
      });
    }
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 20, y: 20, top: 20, left: 20, right: 180, bottom: 60,
      width: 160, height: 40, toJSON: () => ({})
    } as DOMRect);
  });

  it("classifies the real xTool Feishu detail signature before its entry is clicked", () => {
    document.body.innerHTML = `
      <main>
        <h2>职位描述</h2><p>工作职责</p><h3>职位要求</h3>
        <button type="button" class="atsx-btn apply-block-applyBtn atsx-btn-primary atsx-btn-lg">
          <span>投递</span>
        </button>
      </main>`;

    expect(observeApplicationPage()).toMatchObject({
      pageStage: "job_detail",
      jobDetailDetected: true,
      formDetected: false,
      loginRequired: false
    });
  });

  it("keeps a delayed detail render separate from the initial unknown shell", () => {
    document.body.innerHTML = "<main><div>加载中</div></main>";
    const shell = observeApplicationPage();
    document.body.innerHTML = "<main><h2>职位描述</h2><p>任职要求</p></main>";
    const detail = observeApplicationPage();

    expect(shell.pageStage).toBe("unknown");
    expect(detail.pageStage).toBe("job_detail");
    expect(detail.pageStateFingerprint).not.toBe(shell.pageStateFingerprint);
  });

  it("changes the state fingerprint when an SPA replaces an equivalent page root", () => {
    const markup = "<main><h2>职位描述</h2><p>任职要求</p><button>投递</button></main>";
    document.body.innerHTML = markup;
    const first = observeApplicationPage();
    document.body.innerHTML = markup;
    const rebuilt = observeApplicationPage();

    expect(first.pageStage).toBe("job_detail");
    expect(rebuilt.pageStage).toBe("job_detail");
    expect(rebuilt.pageStateFingerprint).not.toBe(first.pageStateFingerprint);
  });

  it("classifies the xTool redirect destination as a login page", () => {
    history.replaceState({}, "", "/index/login?redirect_path=%2Fresume%2F7678562627672541486%2Fapply");
    document.body.innerHTML = `
      <main><h1>登录</h1><input placeholder="手机号码"><input placeholder="验证码">
      <button>获取验证码</button><button>登录</button></main>`;

    expect(observeApplicationPage()).toMatchObject({
      pageStage: "login",
      loginRequired: true,
      formDetected: false
    });
  });

  it("classifies a rendered application form and gives it precedence over detail copy", () => {
    history.replaceState({}, "", "/index/resume/7678562627672541486/apply");
    document.body.innerHTML = `
      <main><h2>职位描述</h2><form>
        <label>姓名<input required name="name"></label>
        <label>手机号码<input required name="phone"></label>
        <label>邮箱<input required name="email"></label>
        <button type="submit">提交申请</button>
      </form></main>`;

    expect(observeApplicationPage()).toMatchObject({
      pageStage: "application_form",
      formDetected: true,
      jobDetailDetected: false,
      loginRequired: false
    });
  });

  it("does not treat a positive remaining-application quota notice as a validation blocker", () => {
    history.replaceState({}, "", "/index/resume/7678562627672541486/apply");
    document.body.innerHTML = `
      <main><form>
        <div role="alert">你最多可以有 2 个社招投递在流程中，还可以投递 2 次。 查看应聘记录</div>
        <label>姓名<input required name="name" value="测试候选人"></label>
        <label>手机号码<input required name="phone" value="13900000000"></label>
        <label>邮箱<input required name="email" value="candidate@example.com"></label>
        <button type="submit">提交申请</button>
      </form></main>`;

    expect(observeApplicationPage()).toMatchObject({
      pageStage: "application_form",
      validationMessages: []
    });
  });

  it("keeps actual required and exhausted-quota alerts as validation blockers", () => {
    history.replaceState({}, "", "/index/resume/7678562627672541486/apply");
    document.body.innerHTML = `
      <main><form>
        <div role="alert">还可以投递 0 次</div>
        <div role="alert">请填写必填项</div>
        <label>姓名<input required name="name"></label>
        <label>手机号码<input required name="phone"></label>
        <label>邮箱<input required name="email"></label>
        <button type="submit">提交申请</button>
      </form></main>`;

    expect(observeApplicationPage().validationMessages).toEqual([
      "还可以投递 0 次",
      "请填写必填项"
    ]);
  });

  it("keeps a field-owned validation error when a required Moka select visibly has a value", () => {
    history.replaceState({}, "", "/campus-recruitment/eqhr/39786#/job/example/apply");
    document.body.innerHTML = `
      <main><form>
        <div class="apply-field-choice">
          <span class="required-asterisk">*</span><div class="title">是否接受出差</div>
          <input role="combobox" value="是" aria-invalid="true" class="sd-Select-input">
          <div class="field-error">必填项未填写</div>
        </div>
        <label>姓名<input required name="name" value="测试候选人"></label>
        <label>手机号码<input required name="phone" value="13900000000"></label>
        <label>邮箱<input required name="email" value="candidate@example.com"></label>
        <button type="submit">提交申请</button>
      </form></main>`;

    const field = observeApplicationPage().fields.find((candidate) =>
      candidate.label.includes("是否接受出差")
    );
    expect(field).toMatchObject({
      required: true,
      currentValue: "是",
      validationMessage: "必填项未填写"
    });
  });

  it("recognizes a Moka direct apply hash route as an application form", () => {
    history.replaceState({}, "", "/campus-recruitment/newonder/146673#/job/916f8334-1e74-42fa-8d5b-9f63810e0df4/apply");
    document.body.innerHTML = `
      <main>
        <h2>校招-研发工程师（硕博）</h2>
        <form>
          <label>姓名<input required name="name"></label>
          <label>手机号码<input required name="phone"></label>
          <label>邮箱<input required name="email"></label>
          <label>预计毕业年月<input required name="graduationMonth"></label>
          <label>最快到岗日期<input required name="availableDate"></label>
          <label>上传简历<input type="file" name="resume"></label>
          <button type="button">预览并提交</button>
        </form>
      </main>`;

    expect(observeApplicationPage()).toMatchObject({
      pageStage: "application_form",
      formDetected: true,
      jobDetailDetected: false,
      loginRequired: false
    });
  });

  it("does not classify a public header login link as a blocking login page", () => {
    document.body.innerHTML = `
      <header><a href="/index/login">登录</a></header>
      <main><h2>职位描述</h2><p>任职要求</p><button type="button">投递</button></main>`;

    expect(observeApplicationPage()).toMatchObject({
      pageStage: "job_detail",
      loginRequired: false
    });
  });

  it("does not turn a required job-search box into an application form", () => {
    document.body.innerHTML = `
      <header><input type="search" required placeholder="搜索职位"></header>
      <main><h2>职位描述</h2><p>任职要求</p><button type="button">投递</button></main>`;

    expect(observeApplicationPage()).toMatchObject({
      pageStage: "job_detail",
      formDetected: false,
      jobDetailDetected: true
    });
  });

  it("keeps unrelated pages unknown", () => {
    document.body.innerHTML = "<main><h1>个人中心</h1><a href='/applications'>我的申请</a></main>";
    expect(observeApplicationPage()).toMatchObject({
      pageStage: "unknown",
      formDetected: false,
      jobDetailDetected: false,
      loginRequired: false
    });
  });

  it.each([
    ["当前网页已关停", "explicit_unavailable"],
    ["校园招聘 首页 社招职位", "empty_application_shell"]
  ])("marks a completed Moka apply shell as unavailable: %s", (text, unavailableReason) => {
    if (unavailableReason === "empty_application_shell") {
      vi.stubGlobal("location", new URL(
        "https://app.mokahr.com/campus-recruitment/rastar/96229#/job/closed-job/apply"
      ));
      vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    } else {
      history.replaceState({}, "", "/campus-recruitment/rastar/96229#/job/closed-job/apply");
    }
    document.body.innerHTML = `<header>${text}</header><main></main>`;
    expect(observeApplicationPage()).toMatchObject({
      pageStage: "unknown",
      formDetected: false,
      unavailableReason
    });
  });
});
