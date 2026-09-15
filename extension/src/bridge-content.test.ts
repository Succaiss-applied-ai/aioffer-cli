// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://127.0.0.1:19876/"}

import { afterEach, describe, expect, it, vi } from "vitest";
import "./bridge-content.js";

const boundContext = {
  ok: true,
  schemaVersion: "recruiting-ai-device-context.v1",
  pluginVersion: "0.15.15",
  bindingState: "bound",
  deviceId: "device-a",
  capabilities: ["batch_auto_apply.v1"]
};

function requestBridge(data: Record<string, unknown>): Promise<MessageEvent> {
  const response = new Promise<MessageEvent>((resolve) => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== "RECRUITING_AI_BRIDGE_RESULT") return;
      if (event.data?.requestId !== data.requestId) return;
      window.removeEventListener("message", listener);
      resolve(event);
    };
    window.addEventListener("message", listener);
  });
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: window.location.origin,
    data
  }));
  return response;
}

describe("AI Offer page bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the sanitized device context without credential fields", async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({
        ...boundContext,
        tenantId: "tenant-secret",
        userId: "user-secret",
        deviceToken: "token-secret"
      });
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage, lastError: null } });

    const response = await requestBridge({
      type: "RECRUITING_AI_DEVICE_CONTEXT",
      requestId: "context-1"
    });

    expect(response.data).toEqual({
      type: "RECRUITING_AI_BRIDGE_RESULT",
      requestId: "context-1",
      ok: true,
      response: {
        schemaVersion: "recruiting-ai-device-context.v1",
        pluginVersion: "0.15.15",
        bindingState: "bound",
        deviceId: "device-a",
        capabilities: ["batch_auto_apply.v1"]
      },
      error: null
    });
    expect(response.data.response).not.toHaveProperty("tenantId");
    expect(response.data.response).not.toHaveProperty("userId");
    expect(response.data.response).not.toHaveProperty("deviceToken");
    expect(sendMessage).toHaveBeenCalledWith(
      { type: "RECRUITING_AI_DEVICE_CONTEXT" },
      expect.any(Function)
    );
  });

  it("returns plugin info from the manifest without waking the service worker", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: {
        id: "abcdefghijklmnopabcdefghijklmnop",
        getManifest: () => ({ version: "0.15.34" }),
        sendMessage,
        lastError: null
      }
    });

    const response = await requestBridge({
      type: "RECRUITING_AI_PLUGIN_INFO",
      requestId: "plugin-info-local"
    });

    expect(response.data).toEqual({
      type: "RECRUITING_AI_BRIDGE_RESULT",
      requestId: "plugin-info-local",
      ok: true,
      response: { version: "0.15.34", runtime: "aioffer-cli" },
      error: null,
      extensionId: "abcdefghijklmnopabcdefghijklmnop"
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("replaces a stale page listener when the extension is reinjected", async () => {
    const bridgeState = window as typeof window & {
      __recruitingAiBridgeHandler?: EventListener;
    };
    if (bridgeState.__recruitingAiBridgeHandler) {
      window.removeEventListener("message", bridgeState.__recruitingAiBridgeHandler);
    }
    const staleHandler = vi.fn();
    bridgeState.__recruitingAiBridgeHandler = staleHandler;
    window.addEventListener("message", staleHandler);
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    vi.resetModules();
    await import("./bridge-content.js");

    expect(removeEventListener).toHaveBeenCalledWith("message", staleHandler);
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      origin: window.location.origin,
      data: { type: "IGNORED_AFTER_RELOAD" }
    }));
    expect(staleHandler).not.toHaveBeenCalled();
  });

  it("turns an invalidated extension context into an actionable bridge result", async () => {
    const sendMessage = vi.fn(() => {
      throw new Error("Extension context invalidated.");
    });
    vi.stubGlobal("chrome", {
      runtime: { id: "abcdefghijklmnopabcdefghijklmnop", sendMessage, lastError: null }
    });

    const response = await requestBridge({
      type: "RECRUITING_AI_DEVICE_CONTEXT",
      requestId: "context-reloaded"
    });

    expect(response.data).toEqual({
      type: "RECRUITING_AI_BRIDGE_RESULT",
      requestId: "context-reloaded",
      ok: false,
      error: "插件已更新，请刷新 AI Offer 页面后重试",
      extensionId: "abcdefghijklmnopabcdefghijklmnop"
    });
  });

  it("forwards device, group, and batch only after a matching local context check", async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      if ((message as { type?: string }).type === "RECRUITING_AI_DEVICE_CONTEXT") {
        callback(boundContext);
        return;
      }
      callback({ ok: true, status: "polling", acceptedAt: "2026-08-25T08:20:00.000Z" });
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage, lastError: null } });

    const response = await requestBridge({
      type: "RECRUITING_AUTO_APPLY_WAKE",
      requestId: "wake-1",
      deviceId: "device-a",
      groupId: "group-a",
      batchId: "batch-a"
    });

    expect(response.data).toMatchObject({
      type: "RECRUITING_AI_BRIDGE_RESULT",
      requestId: "wake-1",
      ok: true,
      response: { status: "polling" }
    });
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      { type: "RECRUITING_AI_DEVICE_CONTEXT" },
      expect.any(Function)
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      {
        type: "LOCAL_AUTO_APPLY_WAKE",
        deviceId: "device-a",
        groupId: "group-a",
        batchId: "batch-a"
      },
      expect.any(Function)
    );
  });

  it("rejects a different device before asking the background worker to poll", async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback(boundContext);
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage, lastError: null } });

    const response = await requestBridge({
      type: "RECRUITING_AUTO_APPLY_WAKE",
      requestId: "wake-mismatch",
      deviceId: "device-b",
      groupId: "group-a",
      batchId: "batch-a"
    });

    expect(response.data).toMatchObject({
      requestId: "wake-mismatch",
      ok: false,
      error: "唤醒目标设备与当前插件绑定不一致"
    });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "LOCAL_AUTO_APPLY_WAKE" }),
      expect.any(Function)
    );
  });

  it("forwards account logout to the local runtime termination boundary", async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, status: "terminated" });
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage, lastError: null } });

    const response = await requestBridge({
      type: "RECRUITING_AI_ACCOUNT_LOGOUT",
      requestId: "logout-owner-a"
    });

    expect(response.data).toMatchObject({
      requestId: "logout-owner-a",
      ok: true,
      response: { status: "terminated" }
    });
    expect(sendMessage).toHaveBeenCalledWith(
      { type: "LOCAL_ACCOUNT_LOGOUT" },
      expect.any(Function)
    );
  });
});
