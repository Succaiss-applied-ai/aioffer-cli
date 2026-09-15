import { describe, expect, it } from "vitest";
import {
  confirmedFinalSubmitCaptcha,
  createFinalSubmitCaptchaObservation,
  observeFinalSubmitCaptcha,
  pendingFinalSubmitCaptchaAtDeadline
} from "./final-submit-captcha-arbitration.js";

const captcha = {
  type: "captcha" as const,
  message: "请完成安全验证"
};

describe("final-submit CAPTCHA arbitration", () => {
  it("does not confirm a transient CAPTCHA observation", () => {
    let state = createFinalSubmitCaptchaObservation();
    state = observeFinalSubmitCaptcha(state, captcha, 0);
    state = observeFinalSubmitCaptcha(state, null, 600);

    expect(state.totalObservations).toBe(1);
    expect(state.consecutiveObservations).toBe(0);
    expect(confirmedFinalSubmitCaptcha(state, 60_000)).toBeNull();
  });

  it("confirms a CAPTCHA only after it remains stable across observations", () => {
    let state = createFinalSubmitCaptchaObservation();
    state = observeFinalSubmitCaptcha(state, captcha, 0);
    state = observeFinalSubmitCaptcha(state, captcha, 600);
    state = observeFinalSubmitCaptcha(state, captcha, 1_200);

    expect(confirmedFinalSubmitCaptcha(state, 1_199)).toBeNull();
    expect(confirmedFinalSubmitCaptcha(state, 1_200)).toEqual(captcha);
  });

  it("does not confirm stale CAPTCHA evidence at the observation deadline", () => {
    let state = createFinalSubmitCaptchaObservation();
    state = observeFinalSubmitCaptcha(state, captcha, 0);
    state = observeFinalSubmitCaptcha(state, captcha, 600);
    state = observeFinalSubmitCaptcha(state, captcha, 1_200);

    expect(confirmedFinalSubmitCaptcha(state, 60_000)).toBeNull();
  });

  it("never converts login or identity verification into a deferred CAPTCHA", () => {
    let state = createFinalSubmitCaptchaObservation();
    state = observeFinalSubmitCaptcha(state, {
      type: "identity_verification",
      message: "请完成身份验证"
    }, 0);
    state = observeFinalSubmitCaptcha(state, {
      type: "login",
      message: "请登录"
    }, 600);

    expect(state).toEqual(createFinalSubmitCaptchaObservation());
    expect(confirmedFinalSubmitCaptcha(state, 60_000)).toBeNull();
  });

  it.each([1, 2])("preserves a fresh challenge arriving at the deadline after %i observations", count => {
    let state = createFinalSubmitCaptchaObservation();
    for (let index = 0; index < count; index++) state = observeFinalSubmitCaptcha(state, captcha, 11_400 + index * 600);
    expect(confirmedFinalSubmitCaptcha(state, 12_000)).toBeNull();
    expect(pendingFinalSubmitCaptchaAtDeadline(state, 12_000)).toEqual(captcha);
  });

  it("does not retain a cleared, stale or future-dated challenge at the deadline", () => {
    const state = observeFinalSubmitCaptcha(createFinalSubmitCaptchaObservation(), captcha, 600);
    expect(pendingFinalSubmitCaptchaAtDeadline(state, 599)).toBeNull();
    expect(pendingFinalSubmitCaptchaAtDeadline(state, 2_601)).toBeNull();
    expect(pendingFinalSubmitCaptchaAtDeadline(observeFinalSubmitCaptcha(state, null, 1_200), 1_200)).toBeNull();
  });
});
