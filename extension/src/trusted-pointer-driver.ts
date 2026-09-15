export interface TrustedPointerPoint {
  x: number;
  y: number;
}

export interface TrustedPointerViewportTarget {
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  hitInsideTarget: boolean;
}

export type TrustedPointerViewportGeometry = Omit<TrustedPointerViewportTarget, "hitInsideTarget">;

/**
 * Return a bounded set of viewport points inside the visible part of a live
 * control.  Callers still have to verify every candidate with
 * document.elementFromPoint before dispatching an irreversible click.
 */
export function trustedPointerViewportCandidates(
  target: TrustedPointerViewportGeometry
): TrustedPointerPoint[] {
  const values = [
    target.left,
    target.top,
    target.width,
    target.height,
    target.viewportWidth,
    target.viewportHeight
  ];
  if (values.some((value) => !Number.isFinite(value)) ||
    target.width <= 0 || target.height <= 0 || target.viewportWidth <= 0 || target.viewportHeight <= 0) {
    return [];
  }

  const visibleLeft = Math.max(0, target.left);
  const visibleTop = Math.max(0, target.top);
  const visibleRight = Math.min(target.viewportWidth, target.left + target.width);
  const visibleBottom = Math.min(target.viewportHeight, target.top + target.height);
  const visibleWidth = visibleRight - visibleLeft;
  const visibleHeight = visibleBottom - visibleTop;
  if (visibleWidth <= 2 || visibleHeight <= 2) return [];

  const centerX = visibleLeft + visibleWidth / 2;
  const centerY = visibleTop + visibleHeight / 2;
  const insetX = Math.min(8, visibleWidth / 4);
  const insetY = Math.min(8, visibleHeight / 4);
  const candidates: TrustedPointerPoint[] = [
    {
      x: visibleLeft + Math.min(24, visibleWidth / 2),
      y: visibleTop + Math.min(12, visibleHeight / 2)
    },
    { x: centerX, y: centerY },
    { x: visibleLeft + insetX, y: centerY },
    { x: visibleRight - insetX, y: centerY },
    { x: centerX, y: visibleTop + insetY },
    { x: centerX, y: visibleBottom - insetY }
  ];

  const seen = new Set<string>();
  return candidates.filter((point) => {
    if (point.x < 0 || point.y < 0 ||
      point.x >= target.viewportWidth || point.y >= target.viewportHeight) return false;
    const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A CDP mouse event uses viewport coordinates.  Never compensate for an
 * off-screen target with a keyboard event: a site may intentionally only
 * handle its pointer interaction, and Enter would make the outcome
 * unverifiable.  Callers must scroll and re-observe until this returns a
 * point that is both in the viewport and still hits the live target.
 */
export function trustedPointerViewportPoint(
  target: TrustedPointerViewportTarget
): TrustedPointerPoint | null {
  if (!target.hitInsideTarget) return null;
  return trustedPointerViewportCandidates(target)[0] ?? null;
}

export type CdpCommandSender = (
  method: string,
  params?: Record<string, unknown>
) => Promise<unknown>;

export async function prepareTrustedPointerSurface(send: CdpCommandSender): Promise<void> {
  // Input.dispatchMouseEvent is addressed to the debugger target itself. Do
  // not call Page.bringToFront here: that command activates the recruitment
  // tab and steals the user's current AI Offer page.
  await send("Input.setIgnoreInputEvents", { ignore: false });
}

export async function prepareFocusEmulatedTrustedPointerSurface(send: CdpCommandSender): Promise<void> {
  // A hidden/background Moka tab otherwise reports document.hasFocus() as
  // false and can ignore the pointer-down chain used by its Select control.
  // Focus emulation changes the debugger target's page focus only; it does not
  // activate the Chrome tab or window.
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await prepareTrustedPointerSurface(send);
}

export async function releaseTrustedPointerSurface(send: CdpCommandSender): Promise<void> {
  await send("Emulation.setFocusEmulationEnabled", { enabled: false });
}

export async function dispatchTrustedPointerClick(
  send: CdpCommandSender,
  point: TrustedPointerPoint,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<void> {
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "none",
    buttons: 0,
    modifiers: 0,
    force: 0
  });
  await pause(80);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers: 0,
    force: 0.5
  });
  // Do not pause between press and release. Controlled forms can re-render the
  // focused field's blur state and replace the button before mouseReleased;
  // Chrome then emits mouseup but correctly suppresses the click.
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers: 0
  });
}

export async function dispatchTrustedPointerScroll(
  send: CdpCommandSender,
  point: TrustedPointerPoint,
  deltaY: number,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<void> {
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    buttons: 0,
    pointerType: "mouse"
  });
  await pause(60);
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: point.x,
    y: point.y,
    deltaX: 0,
    deltaY
  });
}
