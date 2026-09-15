import { describe, expect, it, vi } from "vitest";
import { applicationAccessHintFromTags } from "./contracts.js";
import { ApplicationEngineRouter } from "./engine-router.js";

describe("application access hint", () => {
  it("uses AI Offer's public and login-required advisory tags", () => {
    expect(applicationAccessHintFromTags(["application_access:public"])).toBe("public");
    expect(applicationAccessHintFromTags(["application_access:login_required"])).toBe("login_required");
    expect(applicationAccessHintFromTags([])).toBe("unknown");
  });

  it("fails safe when conflicting tags are present", () => {
    expect(applicationAccessHintFromTags([
      "application_access:public",
      "application_access:login_required"
    ])).toBe("login_required");
  });
});

describe("ApplicationEngineRouter", () => {
  it("keeps legacy as the default without changing current behavior", async () => {
    const execute = vi.fn(async () => "legacy-result");
    const router = new ApplicationEngineRouter([{ code: "legacy", execute }]);

    expect(router.route({})).toEqual({
      requested: "legacy",
      selected: "legacy",
      fellBack: false,
      fallbackReason: null
    });
    await expect(router.execute("command", "credential", {})).resolves.toBe("legacy-result");
    expect(execute).toHaveBeenCalledWith("command", "credential");
  });

  it("falls back before execution when a future engine is not registered", () => {
    const router = new ApplicationEngineRouter([{
      code: "legacy",
      execute: async () => "legacy-result"
    }]);
    expect(router.route({ runtimePolicy: { engine: "layered_v2" } })).toMatchObject({
      requested: "layered_v2",
      selected: "legacy",
      fellBack: true
    });
  });

  it("routes to a registered layered engine without changing the command envelope", async () => {
    const layered = vi.fn(async () => "layered-result");
    const router = new ApplicationEngineRouter([
      { code: "legacy", execute: async () => "legacy-result" },
      { code: "layered_v2", execute: layered }
    ]);
    const command = { payload: { runtimePolicy: { engine: "layered_v2" } } };
    await expect(router.execute(command, "credential", command.payload)).resolves.toBe("layered-result");
    expect(layered).toHaveBeenCalledWith(command, "credential");
  });
});
