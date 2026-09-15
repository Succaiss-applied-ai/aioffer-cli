import { afterEach, describe, expect, it, vi } from "vitest";
import { recruitingAiPluginInfo } from "./plugin-info.js";

describe("recruitingAiPluginInfo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the current manifest version without reading storage or calling the server", () => {
    const getManifest = vi.fn(() => ({ version: "0.15.34" }));
    vi.stubGlobal("chrome", { runtime: { getManifest } });

    expect(recruitingAiPluginInfo()).toEqual({
      ok: true,
      version: "0.15.34",
      buildCommit: "development"
    });
    expect(getManifest).toHaveBeenCalledOnce();
  });
});
