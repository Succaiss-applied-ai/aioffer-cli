const instanceKey = "aioffer-instance";
const instance = sessionStorage.getItem(instanceKey) || crypto.randomUUID();
sessionStorage.setItem(instanceKey, instance);

export function bridge<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (document.documentElement.dataset.recruitingAiBridge !== "ready") {
      reject(new Error("未检测到插件，请加载扩展后刷新本页面"));
      return;
    }
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("插件响应超时，请检查扩展状态"));
    }, 20_000);
    function listener(event: MessageEvent) {
      const data = event.data as Record<string, unknown> | null;
      if (event.source !== window || event.origin !== location.origin ||
        data?.type !== "RECRUITING_AI_BRIDGE_RESULT" || data.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener("message", listener);
      if (data.ok) resolve(data.response as T);
      else {
        const response = data.response && typeof data.response === "object"
          ? data.response as Record<string, unknown>
          : {};
        reject(new Error(String(data.error || response.error || "插件操作失败")));
      }
    }
    window.addEventListener("message", listener);
    window.postMessage({ type, requestId, clientInstanceId: instance, ...payload }, location.origin);
  });
}
