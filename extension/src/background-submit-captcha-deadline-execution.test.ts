import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmedFinalSubmitCaptcha, createFinalSubmitCaptchaObservation,
  observeFinalSubmitCaptcha, pendingFinalSubmitCaptchaAtDeadline
} from "./final-submit-captcha-arbitration.js";
import { isPreviewSubmissionText } from "./submission-action-policy.js";

// Execute the production observation/decision loop; browser transport and
// observation timing are simulated, not a second implementation of the loop.
const source = readFileSync(resolve(process.env.SUBMIT_DRIVER_SOURCE ?? "extension/src/background.ts"), "utf8");
const functionStart = source.indexOf("async function executeFinalSubmitWithDebugger(");
function productionBody(startText: string, endText: string) {
  const start = source.indexOf(startText, functionStart);
  const end = source.indexOf(endText, start);
  if (start < functionStart || end < start) throw new Error("production submit boundary missing");
  return transpileModule(source.slice(start, end), {
    compilerOptions: { target: ScriptTarget.ES2023 }
  }).outputText;
}
const loopBody = productionBody("    let confirmationClicked = false;", "  } catch (error) {");
const retainBody = productionBody("  const retainSubmitMonitor =", "  const armValidationProbe =");
const inspectBody = productionBody("  const inspect = async () => {", '  const cdpLivePoint = async (stage: "preview"');
const captcha = { type: "captcha" as const, message: "请完成安全验证" };
const noGate = { url: "https://example.org/apply", success: false, validation: "",
  nativeValidationErrors: [], rejectedFieldKeys: [], userActionRequired: null, sitePolicyBlock: null };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

async function runLoop(observations: Array<{ at: number; action?: typeof captcha | null; success?: boolean }>, confirm = false,
  deadlineAction?: typeof captcha | null, automaticStatus?: string) {
  const click = vi.fn();
  const checkpoint = vi.fn();
  const automatic = vi.fn(async () => ({ status: automaticStatus, reason: "test_observation" }));
  let currentAction: typeof captcha | null = null;
  const dependencies = {
    trace: [] as string[], deadline: 12_000, preview: { url: noGate.url, text: "预览并提交" },
    action: null, previewIsGate: true, previewActivationAttempts: 1, pointerDispatchAttempted: true,
    createFinalSubmitCaptchaObservation, observeFinalSubmitCaptcha, confirmedFinalSubmitCaptcha,
    pendingFinalSubmitCaptchaAtDeadline, isPreviewSubmissionText, checkpointSubmission: checkpoint,
    tabId: 1, detectAutoApplyUserAction: async () => deadlineAction === undefined ? currentAction : deadlineAction,
    inspect: async () => {
      const observation = observations.shift();
      if (!observation) throw new Error("unexpected extra inspection");
      vi.setSystemTime(observation.at);
      currentAction = observation.action ?? null;
      return { ...noGate, userActionRequired: observation.action ?? null, success: observation.success ?? false };
    },
    locateTrustedPoint: async () => ({ located: confirm
      ? { found: true, text: "确认提交", x: 100, y: 200, url: noGate.url }
      : { found: false }, point: null }),
    cdpLivePoint: async () => ({ x: 100, y: 200 }), armValidationProbe: vi.fn(), dispatchFinalSubmitTrustedPointer: click,
    latestPostSubmitObservation: null, validationBaseline: { url: noGate.url, fields: [] }, validationProbeToken: "probe",
    previouslyRejectedKeys: new Set(),
    captchaContext: automaticStatus ? {} : undefined,
    attemptPostSubmitSliderWithDebugger: automatic,
    sendDebuggerCommand: vi.fn()
  };
  const execute = Function(...Object.keys(withInterruptionDependencies(dependencies)),
    `return (async () => { let retainValidationMonitor = false; ${retainBody} ${loopBody} })();`);
  const result = execute(...Object.values(withInterruptionDependencies(dependencies)));
  await vi.runAllTimersAsync();
  return { result: await result, click, checkpoint, automatic };
}

describe("production final-submit CAPTCHA deadline handoff", () => {
  it("an enabled stable CAPTCHA gets one attempt, then the original explicit receipt wins", async () => {
    const { result, automatic, click } = await runLoop([
      { at: 1000, action: captcha }, { at: 1600, action: captcha }, { at: 2200, action: captcha },
      { at: 3000, success: true }
    ], false, undefined, "verification_passed");
    expect(automatic).toHaveBeenCalledOnce();
    expect(result.observedResult).toBe("submitted_success");
    expect(click).not.toHaveBeenCalled();
  });

  it("a failed attempt at the deadline retains the original manual handoff and does not resubmit", async () => {
    const { result, automatic, click } = await runLoop([
      { at: 12100, action: captcha }, { at: 13000, action: captcha }
    ], false, captcha, "waiting_for_user_action");
    expect(automatic).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ observedResult: "waiting_for_user_action", userActionRequired: captcha });
    expect(result.validationMonitor.token).toBe("probe");
    expect(click).not.toHaveBeenCalled();
  });

  it("a disappearing challenge gets passive receipt monitoring, never application success", async () => {
    const { result, automatic, click } = await runLoop([
      { at: 12100, action: captcha }, { at: 13000 }
    ], false, captcha, "waiting_for_user_action");
    expect(automatic).toHaveBeenCalledOnce();
    expect(result.observedResult).toBe("waiting_for_site_receipt");
    expect(click).not.toHaveBeenCalled();
  });

  it("old commands without CAPTCHA handling never invoke the automatic driver", async () => {
    const { result, automatic } = await runLoop([
      { at: 1000, action: captcha }, { at: 1600, action: captcha }, { at: 2200, action: captcha }
    ]);
    expect(result.observedResult).toBe("waiting_for_user_action");
    expect(automatic).not.toHaveBeenCalled();
  });
  it.each([
    { label: "one late observation", observations: [{ at: 12_100, action: captcha }], count: 1, confirm: false },
    { label: "Style3D two-observation boundary", observations: [
      { at: 1_000 }, { at: 11_600, action: captcha }, { at: 12_200, action: captcha }
    ], count: 2, confirm: true }
  ])("keeps the task in user waiting for $label without another click", async ({ observations, count, confirm }) => {
    const { result, click, checkpoint } = await runLoop(observations, confirm);
    expect(result).toMatchObject({ observedResult: "waiting_for_user_action", userActionRequired: captcha, error: null });
    expect(result.trace).toContain(`captcha_waiting_at_verification_deadline:${count + 1}`);
    expect(result.trace).not.toContain("site_receipt_monitor_started:same_url");
    expect(click).toHaveBeenCalledTimes(confirm ? 1 : 0);
    expect(checkpoint).toHaveBeenCalledTimes(confirm ? 2 : 1);
  });

  it("still prioritizes an observed success after a transient CAPTCHA", async () => {
    const { result, click } = await runLoop([{ at: 11_600, action: captcha }, { at: 12_200, success: true }]);
    expect(result.observedResult).toBe("submitted_success");
    expect(click).not.toHaveBeenCalled();
  });

  it("does not keep a cleared challenge or replay an unconfirmed preview", async () => {
    const { result, click } = await runLoop([{ at: 11_600, action: captcha }, { at: 12_200 }]);
    expect(result.observedResult).toBe("network_or_navigation_unknown");
    expect(result.userActionRequired).toBeUndefined();
    expect(click).not.toHaveBeenCalled();
  });

  it("re-observes a challenge that appears during the last slow form snapshot", async () => {
    const { result, click } = await runLoop([{ at: 1_000 }, { at: 12_200 }], true, captcha);
    expect(result).toMatchObject({ observedResult: "waiting_for_user_action", userActionRequired: captcha });
    expect(result.trace).toContain("captcha_waiting_at_verification_deadline:1");
    expect(result.validationMonitor).toMatchObject({ token: "probe", baseline: { url: noGate.url } });
    expect(result.trace).not.toContain("site_receipt_monitor_started:same_url");
    expect(click).toHaveBeenCalledOnce();
  });

  it("does not retain a challenge that disappears during the last slow form snapshot", async () => {
    const { result, click } = await runLoop([{ at: 1_000 }, { at: 12_200, action: captcha }], true, null);
    expect(result.observedResult).toBe("waiting_for_site_receipt");
    expect(result.userActionRequired).toBeUndefined();
    expect(click).toHaveBeenCalledOnce();
  });

  it("observes a visible human gate without waiting for the obscured form to stabilize", async () => {
    const stabilize = vi.fn(() => { throw new Error("background form must not delay CAPTCHA arbitration"); });
    const dependencies = {
      tabId: 1, target: { tabId: 1 }, readApplicationReceiptInPage: () => {},
      chrome: { scripting: { executeScript: async () => [{ result: noGate }] } },
      detectAutoApplySitePolicyBlock: async () => ({ blocked: false }),
      detectAutoApplyUserAction: async () => captcha, stableApplicationObservation: stabilize,
      validationProbeToken: "probe", nativeSubmitValidationProbeInPage: () => {}
    };
    const inspect = Function(...Object.keys(withInterruptionDependencies(dependencies)), `${inspectBody}; return inspect;`)(...Object.values(withInterruptionDependencies(dependencies)));
    expect(await inspect()).toMatchObject({ success: false, userActionRequired: captcha, rejectedFieldKeys: [] });
    expect(stabilize).not.toHaveBeenCalled();
  });
});
