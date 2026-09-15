type BridgeRequest = {
  type: "RECRUITING_AI_BRIDGE_COMMAND" | "RECRUITING_DEVICE_BOOTSTRAP" |
    "RECRUITING_AI_PLUGIN_INFO" | "RECRUITING_AI_DEVICE_CONTEXT" |
    "RECRUITING_AUTO_APPLY_WAKE" | "RECRUITING_AI_ACCOUNT_LOGOUT";
  requestId?: string;
  command?: unknown;
  bootstrapToken?: string;
  clientInstanceId?: string;
  gatewayBaseUrl?: string;
  deviceId?: unknown;
  groupId?: unknown;
  batchId?: unknown;
};

type BridgeResponse = {
  type: "RECRUITING_AI_BRIDGE_RESULT";
  requestId: string;
  ok: boolean;
  response?: unknown;
  error?: string | null;
  extensionId?: string;
};

import {
  allowedBridgeHosts,
  allowedProductBridgeHosts
} from "./bridge-hosts.js";
import {
  assertRecruitingAiWakeDevice,
  publicRecruitingAiDeviceContext,
  recruitingAiWakeRequest,
  type RecruitingAiWakeRequest
} from "./device-context.js";

if (allowedBridgeHosts.has(window.location.hostname) && window.location.port === "19876") {
  document.documentElement.dataset.recruitingAiBridge = "ready";
}

type BridgeWindow = typeof window & {
  __recruitingAiBridgeHandler?: EventListener;
};

const bridgeWindow = window as BridgeWindow;
const bridgeReloadRequiredMessage = "插件已更新，请刷新 AI Offer 页面后重试";

function bridgeRequestId(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw) return raw.slice(0, 160);
  if (typeof globalThis.crypto?.randomUUID === "function") return crypto.randomUUID();
  return `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function postBridgeResult(payload: BridgeResponse): void {
  let extensionId = "";
  try {
    extensionId = String(chrome.runtime.id ?? "").trim();
  } catch {
    // An invalidated content-script context can no longer identify its runtime.
  }
  window.postMessage(extensionId ? { ...payload, extensionId } : payload, window.location.origin);
}

function runtimeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Extension context invalidated/i.test(message)
    ? bridgeReloadRequiredMessage
    : message || "插件通信失败";
}

function runtimeLastErrorMessage(): string | null {
  try {
    const message = chrome.runtime.lastError?.message ?? null;
    return message ? runtimeErrorMessage(new Error(message)) : null;
  } catch (error) {
    return runtimeErrorMessage(error);
  }
}

function sendRuntimeMessage(
  message: unknown,
  callback: (response: unknown, error: string | null) => void
): void {
  try {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      callback(response, runtimeLastErrorMessage());
    });
  } catch (error) {
    callback(undefined, runtimeErrorMessage(error));
  }
}

const productBridgeMessageTypes = new Set<BridgeRequest["type"]>([
  "RECRUITING_AI_PLUGIN_INFO",
  "RECRUITING_AI_DEVICE_CONTEXT",
  "RECRUITING_DEVICE_BOOTSTRAP",
  "RECRUITING_AUTO_APPLY_WAKE",
  "RECRUITING_AI_ACCOUNT_LOGOUT"
]);

function forwardRuntimeMessage(
  requestId: string,
  message: Record<string, unknown>
): void {
  sendRuntimeMessage(message, (response, lastError) => {
    const result = response as { ok?: boolean } | null;
    postBridgeResult({
      type: "RECRUITING_AI_BRIDGE_RESULT",
      requestId,
      ok: !lastError && Boolean(result?.ok),
      response,
      error: lastError
    });
  });
}

function handleBridgeMessage(event: MessageEvent<BridgeRequest>): void {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  if (!allowedBridgeHosts.has(window.location.hostname)) return;
  if (window.location.port !== "19876") return;
  const data = event.data;
  if (!data || ![
    "RECRUITING_AI_BRIDGE_COMMAND",
    "RECRUITING_DEVICE_BOOTSTRAP",
    "RECRUITING_AI_PLUGIN_INFO",
    "RECRUITING_AI_DEVICE_CONTEXT",
    "RECRUITING_AUTO_APPLY_WAKE",
    "RECRUITING_AI_ACCOUNT_LOGOUT"
  ].includes(data.type)) return;
  const requestId = bridgeRequestId(data.requestId);
  if (productBridgeMessageTypes.has(data.type) &&
    !allowedProductBridgeHosts.has(window.location.hostname)) {
    postBridgeResult({
      type: "RECRUITING_AI_BRIDGE_RESULT",
      requestId,
      ok: false,
      error: "当前页面无权调用产品设备桥"
    });
    return;
  }
  if (data.type === "RECRUITING_AI_PLUGIN_INFO") {
    // Plugin info is manifest-local and must remain available even while the
    // MV3 service worker is waking up. This also gives AI Offer an immediate,
    // deterministic signal that the content bridge itself is alive.
    try {
      postBridgeResult({
        type: "RECRUITING_AI_BRIDGE_RESULT",
        requestId,
        ok: true,
        response: { version: chrome.runtime.getManifest().version },
        error: null
      });
    } catch (error) {
      postBridgeResult({
        type: "RECRUITING_AI_BRIDGE_RESULT",
        requestId,
        ok: false,
        error: runtimeErrorMessage(error)
      });
    }
    return;
  }
  if (data.type === "RECRUITING_AI_DEVICE_CONTEXT") {
    sendRuntimeMessage({ type: "RECRUITING_AI_DEVICE_CONTEXT" }, (response, lastError) => {
      const context = publicRecruitingAiDeviceContext(response);
      postBridgeResult({
        type: "RECRUITING_AI_BRIDGE_RESULT",
        requestId,
        ok: !lastError && Boolean(context),
        response: !lastError && context ? context : undefined,
        error: lastError ?? (context ? null : "设备上下文响应无效")
      });
    });
    return;
  }
  if (data.type === "RECRUITING_AI_ACCOUNT_LOGOUT") {
    sendRuntimeMessage({ type: "LOCAL_ACCOUNT_LOGOUT" }, (response, lastError) => {
      postBridgeResult({
        type: "RECRUITING_AI_BRIDGE_RESULT",
        requestId,
        ok: !lastError && Boolean((response as { ok?: boolean } | null)?.ok),
        response,
        error: lastError
      });
    });
    return;
  }
  if (data.type === "RECRUITING_DEVICE_BOOTSTRAP") {
    const bootstrapToken = String(data.bootstrapToken ?? "").trim();
    if (!bootstrapToken) {
      postBridgeResult({
        type: "RECRUITING_AI_BRIDGE_RESULT",
        requestId,
        ok: false,
        error: "缺少一次性 bootstrapToken"
      });
      return;
    }
    forwardRuntimeMessage(requestId, {
      type: "LOCAL_DEVICE_BOOTSTRAP",
      bootstrapToken,
      clientInstanceId: data.clientInstanceId,
      gatewayBaseUrl: data.gatewayBaseUrl ? String(data.gatewayBaseUrl) : undefined
    });
    return;
  }
  if (data.type === "RECRUITING_AUTO_APPLY_WAKE") {
    let wake: RecruitingAiWakeRequest;
    try {
      wake = recruitingAiWakeRequest(data);
    } catch (error) {
      postBridgeResult({
        type: "RECRUITING_AI_BRIDGE_RESULT",
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : "唤醒请求格式错误"
      });
      return;
    }
    sendRuntimeMessage({ type: "RECRUITING_AI_DEVICE_CONTEXT" }, (contextResponse, contextLastError) => {
      const context = publicRecruitingAiDeviceContext(contextResponse);
      try {
        if (contextLastError) throw new Error(contextLastError);
        if (!context) throw new Error("设备上下文响应无效");
        assertRecruitingAiWakeDevice(wake, context.deviceId);
      } catch (error) {
        postBridgeResult({
          type: "RECRUITING_AI_BRIDGE_RESULT",
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : "唤醒目标设备校验失败"
        });
        return;
      }
      const localWake: { type: "LOCAL_AUTO_APPLY_WAKE"; clientInstanceId?: string } & RecruitingAiWakeRequest = {
        type: "LOCAL_AUTO_APPLY_WAKE",
        deviceId: wake.deviceId,
        batchId: wake.batchId,
        ...(data.clientInstanceId ? { clientInstanceId: data.clientInstanceId } : {})
      };
      if (wake.groupId !== undefined) localWake.groupId = wake.groupId;
      sendRuntimeMessage(localWake, (response, lastError) => {
        postBridgeResult({
          type: "RECRUITING_AI_BRIDGE_RESULT",
          requestId,
          ok: !lastError && Boolean((response as { ok?: boolean } | null)?.ok),
          response,
          error: lastError
        });
      });
    });
    return;
  }
  if (!data.command || typeof data.command !== "object") {
    postBridgeResult({
      type: "RECRUITING_AI_BRIDGE_RESULT",
      requestId,
      ok: false,
      error: "command 必须是 ai-plugin-command.v1 对象"
    });
    return;
  }
  forwardRuntimeMessage(requestId, { type: "AI_BRIDGE_COMMAND", command: data.command });
}

// Static manifest injection is the primary path. The background service worker
// also performs a best-effort injection for tabs that were already open when an
// unpacked extension was reloaded. A boolean marker is insufficient here: its
// old listener can survive with an invalidated runtime context. Always replace
// the previous handler owned by this extension world with the current one.
if (bridgeWindow.__recruitingAiBridgeHandler) {
  window.removeEventListener("message", bridgeWindow.__recruitingAiBridgeHandler);
}
const installedBridgeHandler = handleBridgeMessage as EventListener;
bridgeWindow.__recruitingAiBridgeHandler = installedBridgeHandler;
window.addEventListener("message", installedBridgeHandler);
