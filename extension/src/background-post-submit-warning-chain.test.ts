import { readFileSync } from "node:fs";
import { ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { confirmedFinalSubmitCaptcha, createFinalSubmitCaptchaObservation,
  observeFinalSubmitCaptcha, pendingFinalSubmitCaptchaAtDeadline } from "./final-submit-captcha-arbitration.js";
import { isPreviewSubmissionText } from "./submission-action-policy.js";
import type { ApplicationUserAction } from "./page-adapter.js";

const source = readFileSync("extension/src/background.ts", "utf8");
const start = source.indexOf("    let confirmationClicked = false;", source.indexOf("async function executeFinalSubmitWithDebugger("));
const end = source.indexOf("  } catch (error) {", start);
if (start < 0 || end < start) throw new Error("production loop boundary missing");
const body = transpileModule(source.slice(start, end), { compilerOptions: { target: ScriptTarget.ES2023 } }).outputText;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

type Confirmation = { text: string; kind: "submission" | "continuation"; identity?: string };
const submit: Confirmation = { text: "Confirm submission", kind: "submission" };
const email: Confirmation = { text: "Confirm", kind: "continuation", identity: "Email mismatch, continue to submit?" };
const phone: Confirmation = { text: "Confirm", kind: "continuation", identity: "Phone mismatch, continue to submit?" };
async function runConfirmationChain(chain: Confirmation[], options: {
  success?: boolean; rejected?: string[]; gate?: ApplicationUserAction; liveTargetChanged?: boolean; ambiguousAfterClick?: boolean;
  confirmationDelayMs?: number;
} = {}) {
  const url = "https://example.org/apply";
  let dispatched = 0;
  const clicks = vi.fn(async () => { dispatched += 1; });
  const locate = vi.fn(async () => {
    if (options.ambiguousAfterClick && dispatched > 0) return { located: { found: false, ambiguous: true, texts: ["Confirm", "Confirm"], url }, point: null };
    const current = chain[Math.min(dispatched, chain.length - 1)];
    return { located: current ? {
      found: true, text: current.text, x: 100, y: 200, url,
      confirmationKind: current.kind, confirmationIdentity: current.identity
    } : { found: false }, point: null };
  });
  const dependencies = withInterruptionDependencies({
    trace: [] as string[], deadline: 12000, preview: { url, text: "预览并提交" }, action: null,
    previewIsGate: true, previewActivationAttempts: 1, pointerDispatchAttempted: true,
    createFinalSubmitCaptchaObservation, observeFinalSubmitCaptcha, confirmedFinalSubmitCaptcha,
    pendingFinalSubmitCaptchaAtDeadline, isPreviewSubmissionText,
    checkpointSubmission: vi.fn(), tabId: 1, detectAutoApplyUserAction: async () => null,
    inspect: async () => ({ url, success: options.success !== false && dispatched === chain.length,
      validation: options.rejected?.length ? "Required field rejected" : "", nativeValidationErrors: [],
      rejectedFieldKeys: options.rejected ?? [], userActionRequired: options.gate ?? null, sitePolicyBlock: null }),
    locateTrustedPoint: locate, cdpLivePoint: async () => {
      if (options.confirmationDelayMs) await new Promise(resolve => setTimeout(resolve, options.confirmationDelayMs));
      return options.liveTargetChanged ? null : ({ x: 100, y: 200 });
    },
    armValidationProbe: vi.fn(), dispatchFinalSubmitTrustedPointer: clicks,
    latestPostSubmitObservation: null, retainSubmitMonitor: () => ({ token: "probe" }),
    captchaContext: undefined, attemptPostSubmitSliderWithDebugger: vi.fn(), sendDebuggerCommand: vi.fn()
  });
  const execute = Function(...Object.keys(dependencies), `return (async () => { ${body} })()`);
  const pending = execute(...Object.values(dependencies));
  await vi.runAllTimersAsync();
  return { result: await pending, clicks, locate };
}

describe("production preview then contact-warning transaction", () => {
  it("confirms the contact inconsistency after the preview final confirmation", async () => {
    const { result, clicks } = await runConfirmationChain([submit, email]);
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(result.observedResult).toBe("submitted_success");
  });
});


describe("confirmation allowances preserve one submission and explicit readback", () => {
  it.each([[email, submit], [phone, email, submit], [submit, phone, email]])(
    "handles the ordered warning/preview chain %j", async (...chain) => {
      const { result, clicks } = await runConfirmationChain(chain as Confirmation[]);
      expect(clicks).toHaveBeenCalledTimes(chain.length);
      expect(result.observedResult).toBe("submitted_success");
    });
  it.each([submit, email])("never re-clicks a stuck or recreated %j", async (control) => {
    const { result, clicks } = await runConfirmationChain([control], { success: false });
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
  });
  it("does not permit a second final submission even when its label changes", async () => {
    const { result, clicks } = await runConfirmationChain([submit, { ...submit, text: "Submit application" }]);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
  });
  it("does not click the same warning again when its button label changes", async () => {
    const { result, clicks } = await runConfirmationChain([email, { ...email, text: "OK" }]);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
  });
  it("continues through graduation, email and phone notices before final confirmation", async () => {
    const graduation: Confirmation = { text: "Confirm", kind: "continuation", identity: "Graduation period differs. Continue to apply?" };
    const { result, clicks } = await runConfirmationChain([graduation, email, phone, submit]);
    expect(clicks).toHaveBeenCalledTimes(4);
    expect(result.observedResult).toBe("submitted_success");
  });
  it("finishes a progressing multi-notice transaction with real browser transport latency", async () => {
    const graduation: Confirmation = { text: "确认", kind: "continuation", identity: "毕业时间不同，确认投递？" };
    const { result, clicks } = await runConfirmationChain([graduation, email, phone, submit], { confirmationDelayMs: 4000 });
    expect(clicks).toHaveBeenCalledTimes(4);
    expect(result.observedResult).toBe("submitted_success");
    expect(Date.now()).toBeLessThan(24000);
  });
  it("bounds progress to one extra window even when the site generates different notices", async () => {
    const notices = Array.from({ length: 100 }, (_, i) => ({ ...email, identity: `Notice ${i}. Continue to apply?` }));
    const { result, clicks } = await runConfirmationChain(notices, { success: false });
    expect(clicks.mock.calls.length).toBeLessThan(notices.length);
    expect(Date.now()).toBe(24000);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
  });
  it("does not renew the continuation allowance for a stuck notice or final confirmation", async () => {
    const { result, clicks } = await runConfirmationChain([email, submit], { success: false });
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(Date.now()).toBe(12600);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
  });
  it("keeps the original window when there are no continuation notices", async () => {
    const { result, clicks } = await runConfirmationChain([submit], { success: false });
    expect(clicks).toHaveBeenCalledOnce();
    expect(Date.now()).toBe(12000);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
  });
  it.each(["email:text", "phone:combobox"])("leaves a real field rejection to its original owner: %s", async key => {
    const { result, clicks } = await runConfirmationChain([email], { rejected: [key] });
    expect(clicks).not.toHaveBeenCalled();
    expect(result.observedResult).toBe("blocked_by_site_validation");
    expect(result.rejectedFieldKeys).toEqual([key]);
  });
  it("preserves an identity verification handoff without clicking its acknowledgement", async () => {
    const gate: ApplicationUserAction = { type: "identity_verification", message: "Please complete identity verification" };
    const { result, clicks } = await runConfirmationChain([email], { gate });
    expect(clicks).not.toHaveBeenCalled();
    expect(result).toMatchObject({ observedResult: "waiting_for_user_action", userActionRequired: gate });
  });
  it("does not click when the warning changes during the baseline read", async () => {
    const { result, clicks } = await runConfirmationChain([email], { liveTargetChanged: true });
    expect(clicks).not.toHaveBeenCalled();
    expect(result.observedResult).toBe("network_or_navigation_unknown");
  });
  it("accepts an explicit receipt before looking for another confirmation", async () => {
    const { result, clicks, locate } = await runConfirmationChain([]);
    expect(clicks).not.toHaveBeenCalled();
    expect(locate).not.toHaveBeenCalled();
    expect(result.observedResult).toBe("submitted_success");
  });
  it("does not claim success merely because all confirmation clicks were sent", async () => {
    const { result, clicks } = await runConfirmationChain([submit, email], { success: false });
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
    expect(result.validationMonitor.token).toBe("probe");
    expect(result.trace.join(" ")).not.toContain(email.identity);
  });
});

it("keeps waiting for the original receipt if later buttons become ambiguous", async () => {
  const { result, clicks } = await runConfirmationChain([submit], { success: false, ambiguousAfterClick: true });
  expect(clicks).toHaveBeenCalledTimes(1);
  expect(result.observedResult).toBe("waiting_for_site_receipt");
});
