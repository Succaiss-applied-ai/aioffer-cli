function json(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function bridgePage(extensionId: string, localToken: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AI Offer 招聘小助手 本地执行桥</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, sans-serif; background:#f5f7fb; color:#1b2430; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; }
    main { width:min(560px,calc(100vw - 40px)); background:#fff; border:1px solid #e4e8f0; border-radius:18px; padding:28px; box-shadow:0 16px 50px rgba(31,45,61,.08); }
    .dot { display:inline-block; width:10px; height:10px; margin-right:8px; border-radius:50%; background:#8a94a6; }
    .connected .dot { background:#25a56a; }
    h1 { margin:0 0 8px; font-size:20px; }
    p { margin:8px 0; color:#667085; line-height:1.55; }
    #status { margin-top:20px; padding:14px; border-radius:12px; background:#f7f9fc; font-size:14px; white-space:pre-wrap; }
    code { font-size:12px; }
  </style>
</head>
<body>
  <main id="card">
    <h1><span class="dot"></span>AI Offer 招聘小助手 本地执行桥</h1>
    <p>此页面只负责把 Application Gateway 的受限任务转发给已安装的招聘插件。可以保持后台打开。</p>
    <p><code>${extensionId}</code></p>
    <div id="status">正在连接本地 Runtime…</div>
  </main>
  <script>
    const extensionId = ${json(extensionId)};
    const localToken = ${json(localToken)};
    const status = document.getElementById("status");
    const card = document.getElementById("card");
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const headers = { "X-Local-Bridge-Token": localToken, "Content-Type": "application/json" };

    function contentScriptCommand(command) {
      return new Promise((resolve) => {
        const requestId = crypto.randomUUID();
        const timeout = setTimeout(() => {
          window.removeEventListener("message", listener);
          resolve({ ok:false, error:{ code:"PLUGIN_BRIDGE_UNAVAILABLE", message:"插件 Content Script Bridge 未响应" } });
        }, 2500);
        const listener = (event) => {
          if (event.source !== window || event.data?.type !== "RECRUITING_AI_BRIDGE_RESULT" || event.data?.requestId !== requestId) return;
          clearTimeout(timeout);
          window.removeEventListener("message", listener);
          if (event.data.ok && event.data.response) {
            resolve(event.data.response);
            return;
          }
          const nestedError = event.data.response?.error;
          resolve({
            ok:false,
            error:{
              code:"PLUGIN_BACKGROUND_UNAVAILABLE",
              message:String(event.data.error ?? nestedError?.message ?? nestedError ?? "插件 Content Script 已注入，但后台没有响应")
            }
          });
        };
        window.addEventListener("message", listener);
        window.postMessage({
          type:"RECRUITING_AI_BRIDGE_COMMAND",
          requestId,
          command
        }, window.location.origin);
      });
    }

    function pluginCommand(command) {
      return new Promise((resolve) => {
        if (!globalThis.chrome?.runtime?.sendMessage) {
          void contentScriptCommand(command).then(resolve);
          return;
        }
        chrome.runtime.sendMessage(extensionId, { type:"AI_BRIDGE_COMMAND", command }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            void contentScriptCommand(command).then(resolve);
            return;
          }
          resolve(response ?? { ok:false, error:{ code:"PLUGIN_EMPTY_RESPONSE", message:"插件没有返回结果" } });
        });
      });
    }

    function failedEvent(response) {
      const error = response?.error ?? {};
      return {
        schemaVersion:"ai-plugin-event.v1",
        type:"browser.bridge_execution_failed",
        status:"failed",
        payload:{},
        error:{
          code:String(error.code ?? "PLUGIN_BRIDGE_UNAVAILABLE"),
          message:String(error.message ?? error ?? "插件执行失败"),
          userAction:"确认 AI Offer 招聘小助手已安装、已重载并允许访问本地 Bridge 页面。"
        }
      };
    }

    async function loop() {
      try {
        const response = await fetch("/bridge/commands/claim", { method:"POST", headers, body:"{}" });
        if (response.status === 204) {
          card.classList.add("connected");
          status.textContent = "已连接，等待投递任务。";
          await delay(1000);
          return loop();
        }
        if (!response.ok) throw new Error("本地 Runtime 返回 HTTP " + response.status);
        const task = await response.json();
        status.textContent = "正在执行：" + task.command.type;
        const pluginResponse = await pluginCommand(task.command);
        const event = pluginResponse?.ok && pluginResponse?.event
          ? pluginResponse.event
          : failedEvent(pluginResponse);
        const completed = await fetch("/bridge/commands/" + encodeURIComponent(task.commandId) + "/results", {
          method:"POST", headers, body:JSON.stringify({ event })
        });
        if (!completed.ok) throw new Error("结果回传失败：HTTP " + completed.status);
        card.classList.add("connected");
        status.textContent = event.status === "failed"
          ? "插件后台不可用，已回传诊断。请重载 AI Offer 招聘小助手后刷新本页。"
          : "任务已完成，等待下一步。";
        if (event.status === "failed") await delay(5000);
      } catch (error) {
        card.classList.remove("connected");
        status.textContent = "连接异常：" + (error?.message ?? error) + "\\n正在自动重试…";
        await delay(2000);
      }
      return loop();
    }

    void loop();
  </script>
</body>
</html>`;
}
