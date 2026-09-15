const status = document.querySelector("#status");
const params = new URLSearchParams(location.hash.slice(1));
const bootstrapToken = params.get("token") ?? "";
const gatewayBaseUrl = params.get("gateway") ?? "http://127.0.0.1:19876/automation";
history.replaceState(null, "", location.pathname);

if (!bootstrapToken) {
  status.dataset.state = "error";
  status.textContent = "连接凭据缺失或已失效。";
} else {
  chrome.runtime.sendMessage({
    type: "LOCAL_DEVICE_BOOTSTRAP",
    bootstrapToken,
    gatewayBaseUrl
  }, (response) => {
    const error = chrome.runtime.lastError?.message ?? response?.error ?? null;
    status.dataset.state = response?.ok && !error ? "success" : "error";
    status.textContent = response?.ok && !error
      ? "插件已连接，可以关闭本页。"
      : `连接失败：${error || "未知错误"}`;
  });
}
