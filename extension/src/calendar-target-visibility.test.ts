// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  calendarTargetVisibilityCorrection,
  calendarTargetVisibilityProgress,
  calendarTargetVisibilityStep,
  settleCalendarTargetGeometry,
  settleCalendarVisibilityProgress,
  shiftCalendarSurfaceInPage,
  type CalendarTargetGeometry
} from "./calendar-target-visibility.js";

function target(overrides: Partial<CalendarTargetGeometry> = {}): CalendarTargetGeometry {
  return {
    top: 120,
    bottom: 140,
    left: 300,
    right: 360,
    hitVerified: true,
    obstructionBottom: 0,
    ...overrides
  };
}

describe("calendar target visibility correction", () => {
  it("measures a settled portal before correcting a stale post-navigation geometry", async () => {
    const read = vi.fn().mockResolvedValueOnce("remaining:4").mockResolvedValueOnce("remaining:4");
    const wait = vi.fn(async () => undefined);
    expect(await settleCalendarTargetGeometry({ initial: "remaining:2", read, signature: value => value, wait }))
      .toEqual({ state: "remaining:4", stable: true, reads: 2 });
    expect(wait.mock.calls).toEqual([[120], [120]]);
  });
  it("stops before correction when the portal keeps moving or loses its bound state", async () => {
    let revision = 0;
    const moving = await settleCalendarTargetGeometry({ initial: 0, read: async () => ++revision,
      signature: value => String(value), wait: async () => undefined });
    expect(moving).toEqual({ state: 4, stable: false, reads: 4 });
    expect(await settleCalendarTargetGeometry({ initial: "bound", read: async () => null,
      signature: value => value, wait: async () => undefined }))
      .toEqual({ state: null, stable: false, reads: 1 });
  });
  it("waits for delayed fixed-popup positioning without another scroll", async () => {
    const read = vi.fn().mockResolvedValueOnce("not_improving").mockResolvedValueOnce("complete");
    const wait = vi.fn(async () => undefined);
    expect(await settleCalendarVisibilityProgress({initial: "not_improving", read,
      assess: state => state as "not_improving" | "complete", wait}))
      .toEqual({state:"complete",progress:"complete",extraReads:2});
    expect(read).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls).toEqual([[200],[200]]);
  });
  it.each(["visible", "stuck", "wrong_direction", "direction_reversed"])("retains the %s visibility boundary", async kind => {
    const value = kind === "visible" ? "complete" : kind === "stuck" ? "not_improving" : kind;
    const read = vi.fn(async () => value), wait = vi.fn(async () => undefined);
    const result = await settleCalendarVisibilityProgress({initial:value,read,assess:state=>state as any,wait});
    expect(result.progress).toBe(value);
    expect(result.extraReads).toBe(kind === "stuck" ? 3 : 0);
  });
  it.each([500, 653, 709, 900])("leaves a verified target unchanged at %ipx", (viewportHeight) => {
    expect(calendarTargetVisibilityCorrection({
      viewportHeight,
      targets: [target()]
    })).toEqual({ shiftY: 0, reason: "visible" });
  });

  it("moves a completely off-screen target down without relying on elementFromPoint", () => {
    expect(calendarTargetVisibilityCorrection({
      viewportHeight: 653,
      targets: [target({ top: -11, bottom: 8, hitVerified: false })]
    })).toEqual({ shiftY: 23, reason: "above_safe_area" });
  });

  it("moves the target below an overlapping fixed navigation bar", () => {
    expect(calendarTargetVisibilityCorrection({
      viewportHeight: 653,
      targets: [target({ top: 76, bottom: 94, hitVerified: false, obstructionBottom: 90 })]
    })).toEqual({ shiftY: 26, reason: "above_safe_area" });
  });

  it("moves a clipped lower target up by the exact overflow", () => {
    expect(calendarTargetVisibilityCorrection({
      viewportHeight: 500,
      targets: [target({ top: 480, bottom: 510, hitVerified: false })]
    })).toEqual({ shiftY: -22, reason: "below_safe_area" });
  });

  it("does not scroll blindly when an in-bounds target fails hit testing for an unknown reason", () => {
    expect(calendarTargetVisibilityCorrection({
      viewportHeight: 653,
      targets: [target({ hitVerified: false })]
    })).toEqual({ shiftY: 0, reason: "unverified" });
  });

  it("fails closed when the required target set cannot fit in the viewport", () => {
    expect(calendarTargetVisibilityCorrection({
      viewportHeight: 500,
      targets: [target({ top: -30, bottom: 495 })]
    })).toEqual({ shiftY: 0, reason: "insufficient_viewport" });
  });

  it("splits the observed 83px correction into bounded steps and preserves the remainder", () => {
    expect(calendarTargetVisibilityStep({
      correction: { shiftY: 83, reason: "above_safe_area" },
      viewportHeight: 653
    })).toBe(64);
    expect(calendarTargetVisibilityStep({
      correction: { shiftY: 19, reason: "above_safe_area" },
      viewportHeight: 653
    })).toBe(19);
    expect(calendarTargetVisibilityStep({
      correction: { shiftY: -83, reason: "below_safe_area" },
      viewportHeight: 653
    })).toBe(-64);
  });

  it("continues only while the remaining correction shrinks in the same direction", () => {
    expect(calendarTargetVisibilityProgress({
      before: { shiftY: 83, reason: "above_safe_area" },
      after: { shiftY: 19, reason: "above_safe_area" },
      requestedStepY: 64,
      actualShiftY: 64
    })).toBe("progressing");
    expect(calendarTargetVisibilityProgress({
      before: { shiftY: 83, reason: "above_safe_area" },
      after: { shiftY: -8, reason: "below_safe_area" },
      requestedStepY: 64,
      actualShiftY: 64
    })).toBe("direction_reversed");
    expect(calendarTargetVisibilityProgress({
      before: { shiftY: 83, reason: "above_safe_area" },
      after: { shiftY: 83, reason: "above_safe_area" },
      requestedStepY: 64,
      actualShiftY: 64
    })).toBe("not_improving");
  });

  it("stops when the page does not move in the requested direction", () => {
    expect(calendarTargetVisibilityProgress({
      before: { shiftY: 40, reason: "above_safe_area" },
      after: { shiftY: 40, reason: "above_safe_area" },
      requestedStepY: 40,
      actualShiftY: 0
    })).toBe("no_movement");
    expect(calendarTargetVisibilityProgress({
      before: { shiftY: 40, reason: "above_safe_area" },
      after: { shiftY: 80, reason: "above_safe_area" },
      requestedStepY: 40,
      actualShiftY: -40
    })).toBe("wrong_direction");
  });

  it("consumes an exact downward correction from a nested scroll container", () => {
    document.body.innerHTML = '<div id="scroll"><input id="calendar" /></div>';
    const scroll = document.querySelector<HTMLElement>("#scroll")!;
    const calendar = document.querySelector<HTMLElement>("#calendar")!;
    scroll.style.overflowY = "auto";
    scroll.scrollTop = 50;
    Object.defineProperties(scroll, {
      scrollHeight: { configurable: true, value: 500 },
      clientHeight: { configurable: true, value: 100 }
    });
    vi.spyOn(calendar, "getBoundingClientRect").mockImplementation(() => ({
      top: 200 - scroll.scrollTop,
      bottom: 220 - scroll.scrollTop,
      left: 20,
      right: 120,
      width: 100,
      height: 20,
      x: 20,
      y: 200 - scroll.scrollTop,
      toJSON: () => ({})
    } as DOMRect));
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    expect(shiftCalendarSurfaceInPage("#calendar", 30)).toBe(30);
    expect(scroll.scrollTop).toBe(20);
  });
});
