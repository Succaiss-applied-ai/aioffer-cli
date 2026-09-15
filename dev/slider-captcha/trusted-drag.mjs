/** Viewport-relative CSS pixels, after debugger attachment and layout settling. */
export function validateDragPlan(plan) {
  if (!plan || !plan.start || !plan.end || !plan.viewport) {
    throw new TypeError('Missing drag geometry');
  }
  const { start, end, viewport, durationMs = 640, steps = 32 } = plan;
  if (![start.x, start.y, end.x, end.y, viewport.width, viewport.height, durationMs, steps]
    .every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 ||
    !Number.isInteger(steps) || steps < 1 || steps > 120 || durationMs < 100 || durationMs > 3000) {
    throw new RangeError('Invalid drag geometry or timing');
  }
  for (const point of [start, end]) {
    if (point.x < 0 || point.y < 0 || point.x >= viewport.width || point.y >= viewport.height) {
      throw new RangeError('Drag endpoint outside current viewport');
    }
  }
  if (start.x === end.x && start.y === end.y) throw new RangeError('Empty drag');
  return { start: { ...start }, end: { ...end }, viewport: { ...viewport }, durationMs, steps };
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Dispatch one drag on an already-owned CDP target. This does NOT solve a
 * puzzle, attach a debugger, submit a form, or establish verification success.
 * isCurrent must check the task, tab and document generation, not just its URL.
 * The caller owns exclusive pointer execution for the duration of this call.
 */
export async function dispatchTrustedDrag(send, input, { isCurrent, signal, pause = delay }) {
  const { start, end, durationMs, steps } = validateDragPlan(input);
  if (typeof send !== 'function' || typeof isCurrent !== 'function') {
    throw new TypeError('A command sender and current-document check are required');
  }
  const assertCurrent = async () => {
    if (signal?.aborted || !(await isCurrent()) || signal?.aborted) {
      throw new DOMException('Drag interrupted', 'AbortError');
    }
  };
  let point = start;
  let pressed = false;
  const event = (type, buttons, button) => send('Input.dispatchMouseEvent', {
    type, x: point.x, y: point.y, buttons, button, modifiers: 0,
    pointerType: 'mouse', ...(type === 'mouseMoved' ? {} : { clickCount: 1 })
  });
  await assertCurrent();
  await event('mouseMoved', 0, 'none');
  try {
    await assertCurrent();
    // A rejected transport response may still have delivered the press.
    pressed = true;
    await event('mousePressed', 1, 'left');
    for (let step = 1; step <= steps; step += 1) {
      await pause(durationMs / steps);
      await assertCurrent();
      const progress = step / steps;
      point = {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress
      };
      await event('mouseMoved', 1, 'left');
    }
    await assertCurrent();
    // Never replay a release if its acknowledgement is lost.
    pressed = false;
    await event('mouseReleased', 0, 'left');
    return { status: 'drag_dispatched', end: point };
  } catch (error) {
    if (pressed) {
      // Release at the last attempted position only on the same owned document.
      // Do not continue the trajectory or send input into a replacement page.
      try {
        if (await isCurrent()) await event('mouseReleased', 0, 'left');
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Drag failed; pointer release unconfirmed');
      }
    }
    throw error;
  }
}
