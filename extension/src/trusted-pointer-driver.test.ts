import { describe, expect, it, vi } from "vitest";
import {
  dispatchTrustedPointerClick,
  dispatchTrustedPointerScroll,
  prepareFocusEmulatedTrustedPointerSurface,
  prepareTrustedPointerSurface,
  releaseTrustedPointerSurface,
  trustedPointerViewportCandidates,
  trustedPointerViewportPoint
} from "./trusted-pointer-driver.js";

describe("trusted pointer driver", () => {
  it("enables target input without activating the recruitment tab", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    await prepareTrustedPointerSurface(async (method, params) => {
      calls.push([method, params]);
      return undefined;
    });
    expect(calls).toEqual([["Input.setIgnoreInputEvents", { ignore: false }]]);
  });

  it("emulates focus for a hidden target without bringing its tab forward", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    await prepareFocusEmulatedTrustedPointerSurface(async (method, params) => {
      calls.push([method, params]);
      return undefined;
    });
    expect(calls).toEqual([
      ["Emulation.setFocusEmulationEnabled", { enabled: true }],
      ["Input.setIgnoreInputEvents", { ignore: false }]
    ]);
  });

  it("releases focus emulation without activating another tab", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    await releaseTrustedPointerSurface(async (method, params) => {
      calls.push([method, params]);
      return undefined;
    });
    expect(calls).toEqual([
      ["Emulation.setFocusEmulationEnabled", { enabled: false }]
    ]);
  });

  it("dispatches one ordered trusted mouse click without keyboard or DOM mutation", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const pause = vi.fn(async () => undefined);
    await dispatchTrustedPointerClick(async (method, params) => {
      calls.push([method, params]);
      return undefined;
    }, { x: 624.5, y: 319.25 }, pause);

    expect(calls.map(([method]) => method)).toEqual([
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent"
    ]);
    expect(calls.map(([, params]) => params?.type)).toEqual([
      "mouseMoved",
      "mousePressed",
      "mouseReleased"
    ]);
    expect(calls[1]?.[1]).toMatchObject({
      x: 624.5,
      y: 319.25,
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers: 0,
      force: 0.5
    });
    expect(calls[0]?.[1]).toMatchObject({ button: "none", buttons: 0, modifiers: 0, force: 0 });
    expect(calls[2]?.[1]).toMatchObject({ button: "left", buttons: 0, modifiers: 0, clickCount: 1 });
    expect(calls.every(([, params]) => !("pointerType" in (params ?? {})))).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledWith(80);
  });

  it("dispatches a trusted wheel event at the popup scroll surface", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const pause = vi.fn(async () => undefined);
    await dispatchTrustedPointerScroll(async (method, params) => {
      calls.push([method, params]);
      return undefined;
    }, { x: 420, y: 360 }, 240, pause);

    expect(calls.map(([, params]) => params?.type)).toEqual(["mouseMoved", "mouseWheel"]);
    expect(calls[1]?.[1]).toMatchObject({
      x: 420,
      y: 360,
      deltaX: 0,
      deltaY: 240
    });
    expect(pause).toHaveBeenCalledWith(60);
  });

  it("rejects an off-screen final-submit target instead of falling back to Enter", () => {
    expect(trustedPointerViewportPoint({
      left: 1136,
      top: 2958,
      width: 160,
      height: 40,
      viewportWidth: 1440,
      viewportHeight: 900,
      hitInsideTarget: false
    })).toBeNull();
  });

  it("accepts only a live target hit inside the current viewport", () => {
    expect(trustedPointerViewportPoint({
      left: 100,
      top: 280,
      width: 180,
      height: 40,
      viewportWidth: 1440,
      viewportHeight: 900,
      hitInsideTarget: true
    })).toEqual({ x: 124, y: 292 });
    expect(trustedPointerViewportPoint({
      left: 100,
      top: 280,
      width: 180,
      height: 40,
      viewportWidth: 1440,
      viewportHeight: 900,
      hitInsideTarget: false
    })).toBeNull();
  });

  it("offers several bounded points for a partially visible final-submit target", () => {
    const points = trustedPointerViewportCandidates({
      left: -30,
      top: 840,
      width: 220,
      height: 100,
      viewportWidth: 1440,
      viewportHeight: 900
    });

    expect(points.length).toBeGreaterThan(1);
    expect(new Set(points.map((point) => `${point.x}:${point.y}`)).size).toBe(points.length);
    expect(points.every((point) =>
      point.x >= 0 && point.x < 190 && point.y >= 840 && point.y < 900
    )).toBe(true);
  });

  it("does not offer a coordinate when the target is fully outside the viewport", () => {
    expect(trustedPointerViewportCandidates({
      left: 100,
      top: 1200,
      width: 180,
      height: 40,
      viewportWidth: 1440,
      viewportHeight: 900
    })).toEqual([]);
  });
});
