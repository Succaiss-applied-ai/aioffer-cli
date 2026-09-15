import { describe, expect, it, vi } from "vitest";
import { openMokaCalendarOnce, mokaCalendarOpeningFailureMessage, type MokaCalendarProbe } from "./moka-calendar-opening.js";

type State = { ready: boolean };
const closed: MokaCalendarProbe<State> = { status: "popup_closed", fieldMatchCount: 1, popupCount: 0, state: null };
const unreadable: MokaCalendarProbe<State> = { status: "popup_open", fieldMatchCount: 1, popupCount: 1, state: {ready: false} };
const ready: MokaCalendarProbe<State> = { ...unreadable, state: {ready: true} };

async function run(probes: MokaCalendarProbe<State>[]) {
  let index = 0;
  const input = {
    inspect: vi.fn(async () => probes[Math.min(index++, probes.length - 1)]!),
    ready: (state: State | null) => state?.ready === true,
    prepare: vi.fn(async () => ({ x: 1, y: 2 })),
    click: vi.fn(async () => undefined), wait: vi.fn(async () => undefined)
  };
  return { ...(await openMokaCalendarOnce(input)), input };
}

describe("Moka single-opening gate", () => {
  it("waits for an existing unreadable panel without scrolling or toggling it", async () => {
    const result = await run([unreadable, unreadable, ready]);
    expect(result.failureCode).toBeNull();
    expect(result.input.prepare).not.toHaveBeenCalled();
    expect(result.input.click).not.toHaveBeenCalled();
  });
  it("reports a persistently unreadable open panel truthfully", async () => {
    const result = await run([unreadable]);
    expect(result.failureCode).toBe("popup_state_unparsed");
    expect(result.diagnostics.observationCount).toBe(16);
    expect(result.input.click).not.toHaveBeenCalled();
    expect(mokaCalendarOpeningFailureMessage(result.failureCode!)).toContain("弹层已出现");
  });
  it("opens a confirmed closed control exactly once", async () => {
    const result = await run([closed, closed, closed, unreadable, ready]);
    expect(result.failureCode).toBeNull();
    expect(result.input.prepare).toHaveBeenCalledTimes(1);
    expect(result.input.click).toHaveBeenCalledTimes(1);
  });
  it.each([[closed, ready], [closed, closed, ready]])("does not click a panel that opens during confirmation/preparation (%#)", async (...probes) => {
    const result = await run(probes);
    expect(result.failureCode).toBeNull();
    expect(result.input.click).not.toHaveBeenCalled();
  });
  it("does not retry an unsuccessful opening", async () => {
    const result = await run([closed]);
    expect(result.failureCode).toBe("popup_not_observed");
    expect(result.input.click).toHaveBeenCalledTimes(1);
  });
  it("does not reopen a panel that closes after being observed", async () => {
    const result = await run([unreadable, closed]);
    expect(result.failureCode).toBe("popup_closed_after_observed");
    expect(result.input.click).not.toHaveBeenCalled();
  });
  it.each(["control_missing", "control_ambiguous", "control_signature_changed", "popup_ambiguous", "probe_unavailable"] as const)("fails closed on %s without input clicks", async (status) => {
    const result = await run([{ ...closed, status }]);
    expect(result.failureCode).toBe(status);
    expect(result.input.prepare).not.toHaveBeenCalled();
    expect(result.input.click).not.toHaveBeenCalled();
  });
  it("propagates probe exceptions instead of treating them as closed", async () => {
    const click = vi.fn();
    await expect(openMokaCalendarOnce({
      inspect: async () => { throw new Error("moka_calendar_probe_exception"); },
      ready: () => false, prepare: vi.fn(), click, wait: vi.fn()
    })).rejects.toThrow("moka_calendar_probe_exception");
    expect(click).not.toHaveBeenCalled();
  });
});
