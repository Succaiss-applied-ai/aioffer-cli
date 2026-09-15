export interface CalendarTargetGeometry {
  top: number;
  bottom: number;
  left: number;
  right: number;
  hitVerified: boolean;
  obstructionBottom: number;
}

export interface CalendarTargetVisibilityCorrection {
  /** Positive moves the calendar down; negative moves it up. */
  shiftY: number;
  reason: "visible" | "above_safe_area" | "below_safe_area" | "insufficient_viewport" | "unverified";
}

export const CALENDAR_VISIBILITY_MAX_CORRECTIONS = 12;

export type CalendarTargetVisibilityProgress =
  | "complete"
  | "progressing"
  | "no_movement"
  | "wrong_direction"
  | "direction_reversed"
  | "not_improving";

/** A navigation can update the calendar contents before its portal position.
 * Establish a stable read-only measurement before issuing any correction. */
export async function settleCalendarTargetGeometry<T>(input: {
  initial: T;
  read(): Promise<T>;
  signature(state: T): string | null;
  wait(ms: number): Promise<unknown>;
}): Promise<{ state: T; stable: boolean; reads: number }> {
  let state = input.initial;
  let signature = input.signature(state);
  if (signature === null) return { state, stable: false, reads: 0 };
  for (let reads = 1; reads <= 4; reads += 1) {
    await input.wait(120);
    state = await input.read();
    const nextSignature = input.signature(state);
    if (nextSignature === null) return { state, stable: false, reads };
    if (nextSignature === signature) return { state, stable: true, reads };
    signature = nextSignature;
  }
  return { state, stable: false, reads: 4 };
}

/** A fixed popup can reposition after its input's scroll event. Wait only
 * after measured anchor movement, without another scroll or a weaker hit test. */
export async function settleCalendarVisibilityProgress<T>(input: {
  initial: T;
  read(): Promise<T>;
  assess(state: T): CalendarTargetVisibilityProgress;
  wait(ms: number): Promise<unknown>;
}): Promise<{state: T; progress: CalendarTargetVisibilityProgress; extraReads: number}> {
  let state = input.initial, progress = input.assess(state), extraReads = 0;
  while (progress === "not_improving" && extraReads < 3) {
    await input.wait(200);
    state = await input.read(); extraReads++;
    progress = input.assess(state);
  }
  return {state, progress, extraReads};
}

/**
 * Calculate the smallest signed viewport correction that makes every target
 * required by the current calendar stage visible. Popup shells are not action
 * targets: an off-screen shell is acceptable while the exact clickable target
 * remains visible and passes hit testing.
 */
export function calendarTargetVisibilityCorrection(input: {
  viewportHeight: number;
  targets: readonly CalendarTargetGeometry[];
  topMargin?: number;
  bottomMargin?: number;
  obstructionGap?: number;
}): CalendarTargetVisibilityCorrection {
  const viewportHeight = Number(input.viewportHeight);
  const topMargin = Math.max(0, Number(input.topMargin ?? 12));
  const bottomMargin = Math.max(0, Number(input.bottomMargin ?? 12));
  const obstructionGap = Math.max(0, Number(input.obstructionGap ?? 12));
  const targets = input.targets.filter((target) =>
    [target.top, target.bottom, target.left, target.right, target.obstructionBottom]
      .every(Number.isFinite) && target.bottom > target.top && target.right > target.left
  );
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0 || targets.length === 0) {
    return { shiftY: 0, reason: "unverified" };
  }

  const safeTop = Math.max(
    topMargin,
    ...targets.map((target) => target.obstructionBottom > 0
      ? target.obstructionBottom + obstructionGap
      : topMargin)
  );
  const safeBottom = viewportHeight - bottomMargin;
  const targetTop = Math.min(...targets.map((target) => target.top));
  const targetBottom = Math.max(...targets.map((target) => target.bottom));
  if (targetBottom - targetTop > safeBottom - safeTop) {
    return { shiftY: 0, reason: "insufficient_viewport" };
  }
  if (targetTop < safeTop) {
    return { shiftY: Math.ceil(safeTop - targetTop), reason: "above_safe_area" };
  }
  if (targetBottom > safeBottom) {
    return { shiftY: -Math.ceil(targetBottom - safeBottom), reason: "below_safe_area" };
  }
  return targets.every((target) => target.hitVerified)
    ? { shiftY: 0, reason: "visible" }
    : { shiftY: 0, reason: "unverified" };
}

/**
 * Convert the remaining measured correction into a viewport-bounded step.
 * Callers must re-observe after every step instead of assuming the initially
 * measured distance remains valid while a portal and its anchor are moving.
 */
export function calendarTargetVisibilityStep(input: {
  correction: CalendarTargetVisibilityCorrection;
  viewportHeight: number;
  minStep?: number;
  maxStep?: number;
  viewportRatio?: number;
}): number {
  const remaining = Math.abs(Number(input.correction.shiftY));
  const viewportHeight = Number(input.viewportHeight);
  if (!Number.isFinite(remaining) || remaining < 1 ||
    !Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;

  const minStep = Math.max(1, Number(input.minStep ?? 24));
  const maxStep = Math.max(minStep, Number(input.maxStep ?? 64));
  const viewportRatio = Math.max(0.01, Number(input.viewportRatio ?? 0.1));
  const stepLimit = Math.min(maxStep, Math.max(minStep, Math.floor(viewportHeight * viewportRatio)));
  const magnitude = Math.min(remaining, stepLimit);
  return Math.sign(input.correction.shiftY) * magnitude;
}

/**
 * Verify that one measured step moved in the requested direction and reduced
 * the remaining occlusion. Direction reversal is rejected to avoid oscillating
 * around a moving or misidentified surface.
 */
export function calendarTargetVisibilityProgress(input: {
  before: CalendarTargetVisibilityCorrection;
  after: CalendarTargetVisibilityCorrection;
  requestedStepY: number;
  actualShiftY: number;
  improvementTolerance?: number;
}): CalendarTargetVisibilityProgress {
  const requestedDirection = Math.sign(input.requestedStepY);
  const actualShiftY = Number(input.actualShiftY);
  if (!Number.isFinite(actualShiftY) || Math.abs(actualShiftY) < 1) return "no_movement";
  if (requestedDirection === 0 || Math.sign(actualShiftY) !== requestedDirection) {
    return "wrong_direction";
  }
  if (input.after.reason === "visible") return "complete";
  if (input.after.shiftY === 0) return "not_improving";
  if (Math.sign(input.after.shiftY) !== Math.sign(input.before.shiftY)) {
    return "direction_reversed";
  }
  const tolerance = Math.max(0, Number(input.improvementTolerance ?? 0.5));
  return Math.abs(input.after.shiftY) < Math.abs(input.before.shiftY) - tolerance
    ? "progressing"
    : "not_improving";
}

/**
 * MAIN-world surface correction shared by calendar Drivers. It consumes the
 * requested bounded step from the window and then from the nearest scrollable
 * ancestors. No fixed distance, fallback click, keyboard event or value write
 * is involved; callers must re-observe and hit-test after every step.
 */
export function shiftCalendarSurfaceInPage(targetSelector: string, requestedShiftY: number): number {
  const target = document.querySelector<HTMLElement>(targetSelector);
  const requested = Number(requestedShiftY);
  if (!target || !Number.isFinite(requested) || Math.abs(requested) < 1) return 0;
  const beforeTop = target.getBoundingClientRect().top;
  let remaining = Math.abs(requested);
  const moveScrollPosition = (
    current: number,
    maximum: number,
    assign: (value: number) => void
  ) => {
    const desired = requested > 0
      ? Math.max(0, current - remaining)
      : Math.min(maximum, current + remaining);
    assign(desired);
    remaining -= Math.abs(current - desired);
  };

  const documentRoot = document.scrollingElement ?? document.documentElement;
  moveScrollPosition(
    window.scrollY,
    Math.max(0, documentRoot.scrollHeight - window.innerHeight),
    (value) => window.scrollTo({ top: value, left: window.scrollX, behavior: "instant" })
  );
  for (let node = target.parentElement; node && remaining > 0; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (!/(auto|scroll|overlay)/u.test(style.overflowY)) continue;
    moveScrollPosition(
      node.scrollTop,
      Math.max(0, node.scrollHeight - node.clientHeight),
      (value) => { node.scrollTop = value; }
    );
  }
  return target.getBoundingClientRect().top - beforeTop;
}
