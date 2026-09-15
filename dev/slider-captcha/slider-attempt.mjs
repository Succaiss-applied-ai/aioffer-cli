import { validateDragPlan } from './trusted-drag.mjs';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Prototype adapter contract:
 * observe() => { state: 'challenge'|'passed'|'failed'|'absent'|'unsupported', challengeId? }
 * resolvePlan(challenge) => a current, evidenced drag plan, or null if unknown.
 * claimAttempt(challengeId) => atomic durable claim scoped to the ORIGINAL
 * submission attempt and document; challengeId is evidence, NEVER the claim key.
 * Return false after any earlier claim, including a new image or worker loss.
 * drag(plan) => dispatchTrustedDrag bound to the same document and exclusive lease.
 * Dependencies are supplied by the Draft final-submit adapter; real plugin
 * acceptance remains separate from the CUA transport experiment.
 */
export async function runSliderAttempt({
  observe, resolvePlan, claimAttempt, drag, isCurrent,
  pause = delay, observations = 12, intervalMs = 250
}) {
  if (![observe, resolvePlan, claimAttempt, drag, isCurrent, pause].every(fn => typeof fn === 'function') ||
    !Number.isInteger(observations) || observations < 1 || observations > 60 ||
    !Number.isFinite(intervalMs) || intervalMs < 50 || intervalMs > 1000) {
    throw new TypeError('Invalid slider attempt dependencies or observation window');
  }
  const current = async () => {
    if (!(await isCurrent())) throw new DOMException('Original document interrupted', 'AbortError');
  };
  const inspect = async () => {
    await current();
    const state = await observe();
    await current();
    return state;
  };
  const waiting = reason => ({ status: 'waiting_for_user_action', reason });
  try {
    const initial = await inspect();
    if (initial.state === 'passed') return { status: 'verification_passed' };
    if (initial.state !== 'challenge' || typeof initial.challengeId !== 'string' || !initial.challengeId) {
      return waiting('no_supported_active_challenge');
    }
    const resolved = await resolvePlan(initial);
    await current();
    if (!resolved) return waiting('target_unresolved');
    const plan = validateDragPlan(resolved);
    // A solver may take long enough for the image to expire or be replaced.
    const fresh = await inspect();
    if (fresh.state !== 'challenge' || fresh.challengeId !== initial.challengeId) {
      return waiting('challenge_changed_before_drag');
    }
    if (!(await claimAttempt(initial.challengeId))) return waiting('attempt_already_claimed');
    const beforeDrag = await inspect();
    if (beforeDrag.state !== 'challenge' || beforeDrag.challengeId !== initial.challengeId) {
      return waiting('challenge_changed_before_drag');
    }
    await drag(plan);
    for (let index = 0; index < observations; index += 1) {
      await pause(intervalMs);
      const result = await inspect();
      // The adapter must retain the identity of the challenge whose result it read.
      if (result.challengeId !== initial.challengeId) {
        return waiting('challenge_changed_after_drag');
      }
      if (result.state === 'passed') return { status: 'verification_passed' };
      if (result.state === 'failed') return waiting('site_rejected_verification');
      if (result.state !== 'challenge') {
        return waiting('challenge_disappeared_without_result');
      }
    }
    return waiting('verification_observation_timeout');
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    await current();
    return waiting('automatic_attempt_failed');
  }
}
