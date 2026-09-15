// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submissionActionPatterns, submissionPhrases } from "./submission-action-policy.js";

// Execute both production locators (isolated-world observation and CDP live
// target), rather than copying their matching rules into a test implementation.
const source = readFileSync("extension/src/background.ts", "utf8");
const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.Latest, true);
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  let match: ts.Node | undefined;
  function visit(node: ts.Node) { if (!match && predicate(node)) match = node; if (!match) node.forEachChild(visit); }
  visit(root);
  if (!match) throw new Error("Production locator not found");
  return match;
}
const flow = find(ast, n => ts.isFunctionDeclaration(n) && n.name?.text === "executeFinalSubmitWithDebugger");
const locate = find(flow, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === "locate");
const func = find(locate, n => ts.isPropertyAssignment(n) && n.name.getText(ast) === "func") as ts.PropertyAssignment;
const locator = new Function(`return ${ts.transpileModule(`(${func.initializer.getText(ast)})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText}`)();
const cdp = find(flow, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === "cdpLivePoint");
const expression = find(cdp, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === "expression") as ts.VariableDeclaration;
const buildExpression = new Function("stage", "selector", "expected", "expectedText", "submissionActionPatterns", "allowConsentClick", "expectedConfirmationIdentity", `return ${expression.initializer!.getText(ast)}`);

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 120, height: 40, left: 0, top: 0 } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent; } });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());

it("rechecks the warning identity and button label in the live CDP target", () => {
  document.body.innerHTML = '<div role="dialog"><p>邮箱不一致，是否继续投递？</p><footer class="modal-footer"><button>确认</button></footer></div>';
  const observed = locator("confirmation", "#initial", "预览并提交", submissionActionPatterns, false);
  expect(observed.confirmationKind).toBe("continuation");
  const live = () => new Function(`return ${buildExpression("confirmation", "#initial", observed.text, "预览并提交",
    submissionActionPatterns, false, observed.confirmationIdentity)}`)();
  expect(live()).toBe(document.querySelector("button"));
  document.querySelector("p")!.textContent = "手机号不一致，是否继续投递？";
  expect(live()).toBeNull();
  document.querySelector("p")!.textContent = "邮箱不一致，是否继续投递？";
  document.querySelector("button")!.textContent = "确定";
  expect(live()).toBeNull();
});

it("keeps the notice identity across DOM rebuilding and action relabeling", () => {
  document.body.innerHTML = '<div role="dialog"><h2>提示</h2><p>毕业时间不同，确认投递？</p><button>取消</button><button>确认</button></div>';
  const first = locator("confirmation", "#initial", "预览并提交", submissionActionPatterns, false);
  expect(first.confirmationIdentity).toBe("提示毕业时间不同，确认投递？");
  document.body.innerHTML = '<div role="dialog"><h2>提示</h2><p>毕业时间不同，确认投递？</p><footer><button>返回</button><button>继续投递</button></footer></div>';
  const rebuilt = locator("confirmation", "#initial", "预览并提交", submissionActionPatterns, false);
  expect(rebuilt.confirmationKind).toBe("continuation");
  expect(rebuilt.confirmationIdentity).toBe(first.confirmationIdentity);
  const live = new Function(`return ${buildExpression("confirmation", "#initial", rebuilt.text, "预览并提交",
    submissionActionPatterns, false, first.confirmationIdentity)}`)();
  expect(live).toBe(document.querySelector("button:last-child"));
  document.querySelector("p")!.textContent = "邮箱不同，确认投递？";
  expect(locator("confirmation", "#initial", "预览并提交", submissionActionPatterns, false).confirmationIdentity)
    .not.toBe(first.confirmationIdentity);
});

describe.each(["observation", "cdp"])("%s confirmation target", (route) => {
  const target = (initialText: string, stage = "confirmation", allowConsent = false) => route === "observation"
    ? locator(stage, "#initial", initialText, submissionActionPatterns, allowConsent).found
    : Boolean(new Function(`return ${buildExpression(stage, "#initial", stage === "preview" ? initialText : "", initialText,
      submissionActionPatterns, allowConsent)}`)());

  it("does not re-click a direct-submit button that React recreated with a new identity", () => {
    document.body.innerHTML = '<form><button id="rebuilt">提交申请</button></form>';
    expect(target("提交申请")).toBe(false);
  });
  it("accepts a real preview-to-final-submit page transition", () => {
    document.body.innerHTML = '<main><h1>申请预览</h1><button>提交申请</button></main>';
    expect(target("预览并提交")).toBe(true);
  });
  it.each(["请填写所有必填字段", "验证码不正确", "网络异常，请重试", "登录后才能投递"])("does not confuse acknowledgement with confirmation: %s", (text) => {
    document.body.innerHTML = `<div role="dialog"><p>${text}</p><button>确定</button></div>`;
    expect(target("提交申请")).toBe(false);
  });
  it("still confirms the explicitly requested resume inconsistency warning", () => {
    document.body.innerHTML = '<div role="alertdialog"><p>简历信息与填写内容不一致，是否继续投递？</p><button>取消</button><button>确认</button></div>';
    expect(target("提交申请")).toBe(true);
  });
  it.each(["邮箱", "手机号"])("reads the Moka %s warning above its footer", (field) => {
    // Structure and class roles from the current public Moka Modal component.
    document.body.innerHTML = `<div class="sd-Modal-portal-for-modal-7W0N1">
      <div class="sd-Modal-modal-mEoeY"><header>${field}不一致</header>
        <div class="sd-Modal-modal-content-1WURr"><p>当前填写的${field}与账号绑定${field}不一致，请确认是否继续使用该${field}投递。</p></div>
        <footer class="sd-Modal-modal-footer-uXRhY"><button>取消</button><button>确认</button></footer>
      </div></div>`;
    expect(target("预览并提交")).toBe(true);
  });
  it.each([
    "本职位面向 2026年9月 ~ 2027年8月 期间毕业的同学。您的毕业时间为 2026年6月，确认投递？",
    "您的工作年限未达到职位建议要求，是否继续投递？",
    "所选工作地点与岗位所在地不同，是否仍然提交申请？",
    "您的学历与岗位建议条件不同，仍然投递吗？",
    "This role targets a different graduation period. Continue with this application?",
    "Your experience differs from the position preferences. Do you still want to apply?",
    "Graduation in 2027 is required for this role. Do you still want to apply?"
  ])("confirms a generic continuation prompt without judging eligibility: %s", text => {
    document.body.innerHTML = `<div class="sd-Modal-modal-test"><header>提示</header><p>${text}</p>
      <footer class="sd-Modal-modal-footer-test"><button>取消</button><button>确认</button></footer></div>`;
    expect(target("预览并提交")).toBe(true);
  });
  it.each(["继续投递", "Continue and submit", "Apply anyway"])("does not spend final confirmation on a continuation action: %s", text => {
    document.body.innerHTML = `<div role="dialog"><p>请核对当前申请信息</p><button>${text}</button></div>`;
    if (route === "observation") {
      expect(locator("confirmation", "#initial", "预览并提交", submissionActionPatterns, false).confirmationKind).toBe("continuation");
    } else expect(target("预览并提交")).toBe(true);
  });
  it.each([
    "您尚未选择必填字段，确认投递？",
    "验证码尚未通过，确认投递？",
    "网络异常，请确认是否重新提交申请？",
    "登录账号后确认投递？",
    "您已经投递成功，请确认。",
    "请检查邮箱格式",
    "无法提交申请，请稍后重试。",
    "Required fields are incomplete. Confirm submission?",
    "You are missing required information. Continue to apply?",
    "投递提示"
  ])("does not treat a failure or unrelated notice as continuation: %s", text => {
    document.body.innerHTML = `<div role="dialog"><p>${text}</p><button>确认</button></div>`;
    expect(target("预览并提交")).toBe(false);
  });
  it("reads an Ant modal warning above nested footer actions", () => {
    document.body.innerHTML = `<div class="ant-modal"><div class="ant-modal-content">
      <p>Resume information mismatch. Continue to submit?</p>
      <div class="ant-modal-footer"><div class="modal-actions"><button>Cancel</button><button>OK</button></div></div>
      </div></div>`;
    expect(target("Submit application")).toBe(true);
  });
  it.each(["请填写所有必填字段", "邮箱验证码不一致，请重新提交", "网络异常，请重试", "登录后才能投递"])(
    "does not acknowledge a footer notification: %s", (text) => {
      document.body.innerHTML = `<div class="sd-Modal-modal-test"><p>${text}</p>
        <footer class="sd-Modal-modal-footer-test"><button>确认</button></footer></div>`;
      expect(target("预览并提交")).toBe(false);
    });
  it("does not borrow warning text from a sibling modal in the same portal", () => {
    document.body.innerHTML = `<div class="modal-portal">
      <div class="modal"><p>邮箱不一致，请确认是否继续投递。</p><footer class="modal-footer"><button disabled>确认</button></footer></div>
      <div class="modal"><p>请检查邮箱格式</p><footer class="modal-footer"><button>确认</button></footer></div>
      </div>`;
    expect(target("预览并提交")).toBe(false);
  });
  it("keeps a semantic dialog inside a footer as its own context boundary", () => {
    document.body.innerHTML = `<div class="modal"><p>邮箱不一致，请确认是否继续投递。</p>
      <footer role="dialog" class="modal-footer"><p>网络异常</p><button>确认</button></footer></div>`;
    expect(target("预览并提交")).toBe(false);
  });
  it("rejects ambiguous confirmation buttons", () => {
    document.body.innerHTML = '<div role="dialog"><button>提交申请</button><button>提交申请</button></div>';
    expect(target("提交申请")).toBe(false);
  });
  it("does not bypass a disabled button through the saved selector", () => {
    document.body.innerHTML = '<button id="initial" disabled>提交申请</button>';
    expect(target("提交申请", "preview")).toBe(false);
  });
  it.each([...submissionPhrases.preview, ...submissionPhrases.submit, ...submissionPhrases.confirmation])(
    "locates the registered initial phrase: %s", text => {
      document.body.innerHTML = `<button id="initial"><span>${text}</span></button>`;
      expect(target(text, "preview")).toBe(true);
    });
  it.each([...submissionPhrases.submit, ...submissionPhrases.confirmation])(
    "locates the registered confirmation phrase: %s", text => {
      document.body.innerHTML = `<div role="dialog"><button>${text}</button></div>`;
      expect(target("预览并提交 / Preview and submit")).toBe(true);
    });
  it("recognizes both stages of a bilingual preview transaction", () => {
    document.body.innerHTML = '<button id="initial"><span><span>预览并提交 / Preview and submit</span></span></button>';
    expect(target("预览并提交 / Preview and submit", "preview")).toBe(true);
    document.body.innerHTML = '<main><h1>预览</h1><button>确认提交 / Confirm submission</button></main>';
    expect(target("预览并提交 / Preview and submit")).toBe(true);
  });
  it("recognizes English Review and submit as a preview, not a direct submit", () => {
    document.body.innerHTML = '<main><button>Submit application</button></main>';
    expect(target("Review and submit")).toBe(true);
  });
  it("does not resolve a duplicate through the saved selector", () => {
    document.body.innerHTML = '<button id="initial">提交简历</button><button>提交申请</button>';
    expect(target("提交简历", "preview")).toBe(false);
  });
  it("does not count a nested ARIA label as another native button", () => {
    document.body.innerHTML = '<button id="initial"><span role="button">提交简历 / Submit resume</span></button>';
    expect(target("提交简历 / Submit resume", "preview")).toBe(true);
  });
  it("does not click a reconstructed direct-submit control again", () => {
    document.body.innerHTML = '<button id="rebuilt">提交简历 / Submit resume</button>';
    expect(target("提交简历 / Submit resume")).toBe(false);
  });
  it("does not accept a stale partial Chinese label for the full bilingual target", () => {
    document.body.innerHTML = '<button id="initial">预览并提交 / Preview and submit</button>';
    expect(target("预览并提交", "preview")).toBe(false);
  });
  it.each(["取消预览并提交", "提交申请失败", "Do not submit application", "提交简历 / Cancel"])(
    "rejects a dangerous initial or confirmation label: %s", text => {
      document.body.innerHTML = `<div role="dialog"><button id="initial">${text}</button></div>`;
      expect(target(text, "preview")).toBe(false);
      expect(target("预览并提交")).toBe(false);
    });
  it("requires consent authority at both click locators", () => {
    document.body.innerHTML = '<button id="initial">同意并提交 / Agree and submit</button>';
    expect(target("同意并提交 / Agree and submit", "preview")).toBe(false);
    expect(target("同意并提交 / Agree and submit", "preview", true)).toBe(true);
  });
  it("rejects a button in a hidden ancestor", () => {
    document.body.innerHTML = '<div style="display:none"><button id="initial">提交申请</button></div>';
    expect(target("提交申请", "preview")).toBe(false);
  });
  it.each(["确认 / Confirm", "确定 / OK"])("accepts %s only in the inconsistency dialog", text => {
    document.body.innerHTML = `<div role="dialog"><p>简历信息不一致，是否继续投递？</p><button>${text}</button></div>`;
    expect(target("提交申请")).toBe(true);
    document.querySelector("p")!.textContent = "必填信息不一致，请完成后提交申请";
    expect(target("提交申请")).toBe(false);
  });
});
