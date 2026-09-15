import { describe, expect, it, vi } from "vitest";
import { withBackgroundTabEntrySurface } from "./background-tab-entry-surface.js";

function api(failure?: string) {
  const events: string[] = [];
  return {
    events,
    attach: vi.fn(async () => { events.push("attach"); if (failure === "attach") throw new Error("busy"); }),
    sendCommand: vi.fn(async (_target, method, params) => {
      events.push(`${method}:${JSON.stringify(params)}`);
      if (failure === method && params?.enabled !== false) throw new Error("prepare failed");
    }),
    detach: vi.fn(async () => { events.push("detach"); })
  };
}

describe("background entry debugger ownership", () => {
  it("emulates before observing and shares one lease through click and destination", async () => {
    const chromeApi = api();
    await expect(withBackgroundTabEntrySurface(chromeApi, 42, async send => {
      chromeApi.events.push("observe_detail");
      await send("Input.dispatchMouseEvent", { type: "mouseReleased" });
      chromeApi.events.push("observe_destination");
      return "login";
    })).resolves.toBe("login");
    expect(chromeApi.events).toEqual([
      "attach", 'Emulation.setFocusEmulationEnabled:{"enabled":true}',
      'Input.setIgnoreInputEvents:{"ignore":false}', "observe_detail",
      'Input.dispatchMouseEvent:{"type":"mouseReleased"}', "observe_destination",
      'Emulation.setFocusEmulationEnabled:{"enabled":false}', "detach"
    ]);
    expect(chromeApi.attach).toHaveBeenCalledExactlyOnceWith({ tabId: 42 }, "1.3");
  });

  it("does not detach an unrelated debugger when attach fails", async () => {
    const chromeApi = api("attach"), run = vi.fn();
    await expect(withBackgroundTabEntrySurface(chromeApi, 42, run)).rejects.toThrow("busy");
    expect(run).not.toHaveBeenCalled();
    expect(chromeApi.sendCommand).not.toHaveBeenCalled();
    expect(chromeApi.detach).not.toHaveBeenCalled();
  });

  it.each(["Emulation.setFocusEmulationEnabled", "Input.setIgnoreInputEvents"])("releases its lease when %s fails", async failure => {
    const chromeApi = api(failure), run = vi.fn();
    await expect(withBackgroundTabEntrySurface(chromeApi, 42, run)).rejects.toThrow("prepare failed");
    expect(run).not.toHaveBeenCalled();
    expect(chromeApi.events.slice(-2)).toEqual(['Emulation.setFocusEmulationEnabled:{"enabled":false}', "detach"]);
  });

  it("releases on classification/entry/navigation failure without another attempt", async () => {
    const chromeApi = api();
    await expect(withBackgroundTabEntrySurface(chromeApi, 42, async () => { throw new Error("entry unavailable"); })).rejects.toThrow("entry unavailable");
    expect(chromeApi.events.slice(-2)).toEqual(['Emulation.setFocusEmulationEnabled:{"enabled":false}', "detach"]);
    expect(chromeApi.attach).toHaveBeenCalledTimes(1);
  });
});
