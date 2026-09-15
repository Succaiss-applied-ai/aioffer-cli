import { describe, expect, it, vi } from "vitest";
import {
  acceptRecruitingAiWake,
  autoApplyDeviceCapabilities,
  publicRecruitingAiDeviceContext,
  recruitingAiDeviceContext,
  recruitingAiWakeRequest
} from "./device-context.js";

describe("AI Offer 招聘小助手 device context", () => {
  it("exposes only the public bound-device context", () => {
    const credential = {
      deviceId: "device-a",
      tenantId: "tenant-secret",
      userId: "user-secret",
      deviceToken: "token-secret"
    };
    const context = recruitingAiDeviceContext("0.15.15", credential);

    expect(context).toEqual({
      schemaVersion: "recruiting-ai-device-context.v1",
      pluginVersion: "0.15.15",
      bindingState: "bound",
      deviceId: "device-a",
      capabilities: [...autoApplyDeviceCapabilities]
    });
    expect(context).not.toHaveProperty("tenantId");
    expect(context).not.toHaveProperty("userId");
    expect(context).not.toHaveProperty("deviceToken");
  });

  it("reports an unbound device without inventing an id", () => {
    expect(recruitingAiDeviceContext("0.15.15", null)).toMatchObject({
      bindingState: "unbound",
      deviceId: null
    });
  });

  it("sanitizes the runtime envelope before exposing it to the page", () => {
    expect(publicRecruitingAiDeviceContext({
      ok: true,
      ...recruitingAiDeviceContext("0.15.15", { deviceId: "device-a" }),
      tenantId: "tenant-secret",
      userId: "user-secret",
      deviceToken: "token-secret"
    })).toEqual(recruitingAiDeviceContext("0.15.15", { deviceId: "device-a" }));
  });
});

describe("AI Offer 招聘小助手 wake validation", () => {
  it("preserves the exact device, group, and batch identifiers", () => {
    expect(recruitingAiWakeRequest({
      deviceId: "device-a",
      groupId: "group-a",
      batchId: "batch-a"
    })).toEqual({ deviceId: "device-a", groupId: "group-a", batchId: "batch-a" });
  });

  it("does not start polling when the requested device differs from the credential", async () => {
    const startPolling = vi.fn();

    await expect(acceptRecruitingAiWake({
      deviceId: "device-b",
      groupId: "group-a",
      batchId: "batch-a"
    }, {
      loadCredential: vi.fn(async () => ({ deviceId: "device-a" })),
      startPolling
    })).rejects.toThrow("唤醒目标设备与当前插件绑定不一致");

    expect(startPolling).not.toHaveBeenCalled();
  });

  it("uses exact device equality without trimming the requested identifier", async () => {
    const startPolling = vi.fn();

    await expect(acceptRecruitingAiWake({
      deviceId: "device-a ",
      batchId: "batch-a"
    }, {
      loadCredential: vi.fn(async () => ({ deviceId: "device-a" })),
      startPolling
    })).rejects.toThrow("唤醒目标设备与当前插件绑定不一致");

    expect(startPolling).not.toHaveBeenCalled();
  });

  it("rejects a missing batch before loading a credential or starting polling", async () => {
    const loadCredential = vi.fn(async () => ({ deviceId: "device-a" }));
    const startPolling = vi.fn();

    await expect(acceptRecruitingAiWake({ deviceId: "device-a" }, {
      loadCredential,
      startPolling
    })).rejects.toThrow("唤醒请求缺少 batchId");

    expect(loadCredential).not.toHaveBeenCalled();
    expect(startPolling).not.toHaveBeenCalled();
  });

  it("starts polling only after an exact device match", async () => {
    const startPolling = vi.fn();

    await expect(acceptRecruitingAiWake({
      deviceId: "device-a",
      batchId: "batch-a"
    }, {
      loadCredential: vi.fn(async () => ({ deviceId: "device-a" })),
      startPolling,
      now: () => new Date("2026-08-25T08:20:00.000Z")
    })).resolves.toEqual({
      ok: true,
      status: "polling",
      acceptedAt: "2026-08-25T08:20:00.000Z"
    });

    expect(startPolling).toHaveBeenCalledOnce();
  });
});
