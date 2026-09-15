import type { ApplicationUserAction } from "./page-adapter.js";

export type FinalSubmitUserAction = ApplicationUserAction;

export interface FinalSubmitCaptchaObservation {
  action: (FinalSubmitUserAction & { type: "captcha" }) | null;
  firstObservedAt: number | null;
  lastObservedAt: number | null;
  consecutiveObservations: number;
  totalObservations: number;
}

export const FINAL_SUBMIT_CAPTCHA_MIN_STABLE_OBSERVATIONS = 3;
export const FINAL_SUBMIT_CAPTCHA_MIN_STABLE_MS = 1_200;
export const FINAL_SUBMIT_CAPTCHA_MAX_OBSERVATION_GAP_MS = 2_000;

export function createFinalSubmitCaptchaObservation(): FinalSubmitCaptchaObservation {
  return {
    action: null,
    firstObservedAt: null,
    lastObservedAt: null,
    consecutiveObservations: 0,
    totalObservations: 0
  };
}

export function observeFinalSubmitCaptcha(
  state: FinalSubmitCaptchaObservation,
  action: FinalSubmitUserAction | null | undefined,
  observedAt: number
): FinalSubmitCaptchaObservation {
  if (action?.type !== "captcha") {
    if (!state.action) return state;
    return {
      ...state,
      action: null,
      firstObservedAt: null,
      lastObservedAt: null,
      consecutiveObservations: 0
    };
  }
  return {
    action,
    firstObservedAt: state.action ? state.firstObservedAt : observedAt,
    lastObservedAt: observedAt,
    consecutiveObservations: state.action ? state.consecutiveObservations + 1 : 1,
    totalObservations: state.totalObservations + 1
  };
}

export function confirmedFinalSubmitCaptcha(
  state: FinalSubmitCaptchaObservation,
  observedAt: number
): (FinalSubmitUserAction & { type: "captcha" }) | null {
  if (!state.action || state.firstObservedAt === null || state.lastObservedAt === null) return null;
  if (state.consecutiveObservations < FINAL_SUBMIT_CAPTCHA_MIN_STABLE_OBSERVATIONS) return null;
  if (observedAt - state.firstObservedAt < FINAL_SUBMIT_CAPTCHA_MIN_STABLE_MS) return null;
  if (observedAt - state.lastObservedAt > FINAL_SUBMIT_CAPTCHA_MAX_OBSERVATION_GAP_MS) return null;
  return state.action;
}

// The active verification deadline limits work, not the user's time to solve
// a challenge. Preserve a still-present, fresh challenge even when it arrived
// too late to collect three active observations. Cleared/stale evidence does
// not create a user wait.
export function pendingFinalSubmitCaptchaAtDeadline(
  state: FinalSubmitCaptchaObservation,
  observedAt: number
): (FinalSubmitUserAction & { type: "captcha" }) | null {
  if (!state.action || state.lastObservedAt === null) return null;
  const age = observedAt - state.lastObservedAt;
  return age >= 0 && age <= FINAL_SUBMIT_CAPTCHA_MAX_OBSERVATION_GAP_MS ? state.action : null;
}
