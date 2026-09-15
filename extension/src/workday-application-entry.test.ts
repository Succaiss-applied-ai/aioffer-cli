import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, type PageObservation } from "./page-adapter.js";
import { submissionActionPatterns } from "./submission-action-policy.js";
import { dispatchTrustedPointerClick, trustedPointerViewportPoint } from "./trusted-pointer-driver.js";

const base = "/Professional/job/Shanghai/Analyst_R263801/apply";
const choiceNames = { autofillWithResume: "Autofill with Resume", applyManually: "Apply Manually", useMyLastApplication: "Use My Last Application" };
function fixture() {
  return `<header><button>Sign In</button></header><main><h2>Start Your Application</h2><h3>Analyst</h3><div>${Object.entries(choiceNames).map(([id, text]) =>
    `<a role="button" data-automation-id="${id}" href="${location.origin}/en-US${base}/${id}">${text}</a>`).join("")}</div></main>`;
}
beforeEach(() => {
  vi.stubGlobal("location", new URL(`https://employer.wd1.myworkdayjobs.com${base}`));
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 20, y: 20, left: 20, top: 20, right: 200, bottom: 60, width: 180, height: 40, toJSON() {} });
  document.body.innerHTML = fixture();
  document.elementFromPoint = vi.fn(() => document.querySelector('[data-automation-id="applyManually"]'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("registered Workday application-method navigation", () => {
  it.each(["employer.wd1.myworkdayjobs.com", "unrelated.wd5.myworkdayjobs.com"])("recognizes the same application-method structure on %s without claiming login", hostname => {
    vi.stubGlobal("location", new URL(`https://${hostname}${base}`)); document.body.innerHTML = fixture();
    const page = observeApplicationPage();
    expect(page).toMatchObject({ pageStage: "job_detail", loginRequired: false, formDetected: false,
      applicationEntry: { registrationId: "workday.manual-application-entry.v1", text: "Apply Manually", href: `${location.origin}/en-US${base}/applyManually` } });
    expect(page.fields).toEqual([]);
  });
  it.each([
    ["duplicate manual choice", () => document.querySelector("main")!.insertAdjacentHTML("beforeend", document.querySelector('[data-automation-id="applyManually"]')!.outerHTML)],
    ["different job", () => document.querySelector("a")!.setAttribute("href", `${location.origin}${base.replace("R263801", "R000")}/autofillWithResume`)],
    ["cross origin", () => document.querySelector("a")!.setAttribute("href", `https://other.example${base}/autofillWithResume`)],
    ["disabled", () => document.querySelector('[data-automation-id="applyManually"]')!.setAttribute("aria-disabled", "true")],
    ["download", () => document.querySelector('[data-automation-id="applyManually"]')!.setAttribute("download", "resume")],
    ["new window", () => document.querySelector('[data-automation-id="applyManually"]')!.setAttribute("target", "_blank")],
    ["wrong heading", () => { document.querySelector("h2")!.textContent = "Other choices"; }],
    ["missing job title", () => document.querySelector("h3")!.remove()],
    ["candidate form", () => document.querySelector("main")!.insertAdjacentHTML("beforeend", '<form><label>Name<input name="name"></label></form>')],
    ["hidden main", () => document.querySelector("main")!.setAttribute("hidden", "")],
    ["two main roots", () => document.body.insertAdjacentHTML("beforeend", "<main></main>")],
    ["unrelated host", () => vi.stubGlobal("location", new URL(`https://unrelated.example${base}`))],
    ["already selected method", () => vi.stubGlobal("location", new URL(`${location.href}/applyManually`))]
  ] as const)("does not register %s", (_name, mutate) => {
    mutate(); expect(observeApplicationPage().applicationEntry).toBeUndefined();
  });
  it("waits for the full async structure and changes its readiness fingerprint with the target", async () => {
    vi.useFakeTimers(); const html = fixture(); document.body.innerHTML = "<main></main>";
    expect(observeApplicationPage().pageStage).toBe("unknown");
    setTimeout(() => { document.body.innerHTML = html; }, 20);
    await vi.advanceTimersByTimeAsync(30); const ready = observeApplicationPage();
    expect(ready.applicationEntry).toBeDefined();
    document.querySelector('[data-automation-id="applyManually"]')!.setAttribute("href", `${location.origin}${base}/wrong`);
    const changed = observeApplicationPage(); expect(changed.applicationEntry).toBeUndefined();
    expect(changed.pageStateFingerprint).not.toBe(ready.pageStateFingerprint);
  });
});

describe("site-independent provider login gate", () => {
  const login = '<main><button role="link">Back to Job Posting</button><h2>Analyst</h2><h2>Sign In</h2><button>Sign in with Apple</button><button>Sign in with Google</button><button>Sign in with email</button></main>';
  it.each(["https://any.example/start", "https://another.invalid/application"])("recognizes real login choice without a hostname exception: %s", url => {
    vi.stubGlobal("location", new URL(url)); document.body.innerHTML = login;
    expect(observeApplicationPage()).toMatchObject({ pageStage: "login", loginRequired: true, loginReason: "页面要求选择登录方式后继续" });
  });
  it.each([
    '<header><h2>Sign In</h2><button>Sign in with email</button></header><main><h2>Job Description</h2></main>',
    '<main><h2>Sign In</h2><button>Apply</button></main>',
    '<main><h2>Sign In</h2><button>Sign in with Google</button><label>Name<input name="name"></label><label>Email<input type="email"></label></main>',
    '<main><div hidden><h2>Sign In</h2><button>Sign in with Google</button></div></main>',
    login + '<main><h2>Other</h2></main>'
  ])("does not misclassify public/hidden/application or ambiguous surfaces", html => {
    document.body.innerHTML = html; expect(observeApplicationPage().loginRequired).toBe(false);
  });
});

function protocolHarness(destination = "resolved") {
  const ast = ts.createSourceFile("background.ts", readFileSync("extension/src/background.ts", "utf8"), ts.ScriptTarget.ES2023, true);
  const names = ["advanceRegisteredApplicationChoice", "activateApplicationEntryWithTrustedPointer"];
  const source = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? "")).map(node => node.getText(ast)).join("\n");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  const readiness = vi.fn(async () => ({ decision: { status: destination, pageStage: destination === "resolved" ? "login" : "job_detail" } }));
  const send = vi.fn(async () => undefined);
  const deps = { chrome: { scripting: { executeScript: async ({ func, args }: { func: (...args: any[]) => unknown; args: any[] }) => [{ result: await func(...args) }] } },
    observeApplicationPage, submissionActionPatterns, trustedPointerViewportPoint, dispatchTrustedPointerClick,
    waitForApplicationPageReadiness: readiness };
  const run = new Function(...Object.keys(withInterruptionDependencies(deps)), `${code};return advanceRegisteredApplicationChoice;`)(...Object.values(withInterruptionDependencies(deps))) as (tab: number, page: PageObservation, input: object, sender: typeof send) => Promise<boolean>;
  return { run: (page = observeApplicationPage()) => run(7, page, {}, send), send, readiness };
}
describe("production registered application-choice protocol", () => {
  it("rechecks the original route, clicks only manual once, then requires login/form", async () => {
    const h = protocolHarness(); expect(await h.run()).toBe(true);
    expect(h.send.mock.calls).toHaveLength(3);
    expect(h.readiness).toHaveBeenCalledExactlyOnceWith(7, location.href, { recordPageStage: undefined, terminalStages: ["login", "application_form"] });
  });
  it("does not click a changed target or fall through to another method", async () => {
    const before = observeApplicationPage(), h = protocolHarness();
    document.querySelector('[data-automation-id="applyManually"]')!.setAttribute("href", `${location.origin}${base}/other`);
    await expect(h.run(before)).rejects.toThrow("可信点击"); expect(h.send).not.toHaveBeenCalled();
  });
  it("does not click through an overlay or choose an alternative", async () => {
    document.elementFromPoint = vi.fn(() => document.body); const h = protocolHarness();
    await expect(h.run()).rejects.toThrow("可信点击"); expect(h.send).not.toHaveBeenCalled();
  });
  it("does not loop when the page stays at the method chooser", async () => {
    const h = protocolHarness("timed_out"); await expect(h.run()).rejects.toThrow("没有稳定进入登录页或申请表");
    expect(h.send.mock.calls).toHaveLength(3); expect(h.readiness).toHaveBeenCalledTimes(1);
  });
});
