#!/usr/bin/env node
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { acquireRuntimeLock } from "./runtime-lock.js";
import { createLocalApp, localOrigin } from "./server.js";
import { loadCatalog, searchCatalog } from "./catalog.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const command = args[0] ?? "start";
const dataDir = process.env.AIOFFER_DATA_DIR
  ? resolve(process.env.AIOFFER_DATA_DIR)
  : join(homedir(), ".aioffer-cli");
if (["--help", "-h", "help"].includes(command)) {
  console.log(
    "aioffer-cli — 本地招聘投递助手\n\naioffer start [--no-open]  启动本地界面\naioffer jobs <关键词>     离线搜索岗位\naioffer doctor            检查运行环境\n\nNode.js 22+；Chrome 扩展需手动加载 extension/dist。配置和数据仅在本机保存。",
  );
} else if (command === "jobs") {
  const result = searchCatalog(
    await loadCatalog(join(root, "data/jobs.json.gz")),
    args.slice(1).join(" "),
  );
  console.log(`找到 ${result.total} 个岗位（快照 ${result.exportedAt}）`);
  for (const job of result.items)
    console.log(
      `${job.jobId}\t${job.companyName}\t${job.title}\t${job.locations.join("、")}`,
    );
} else if (command === "doctor") {
  const catalog = await loadCatalog(join(root, "data/jobs.json.gz"));
  const manifest = JSON.parse(
    await readFile(join(root, "extension/dist/manifest.json"), "utf8"),
  );
  console.log(
    `Node.js ${process.versions.node}\n岗位快照：${catalog.total} 条\n插件协议版本：${manifest.version}\n数据目录：${dataDir}\n网络与模型能力请在本地界面点击“测试视觉模型”。`,
  );
} else if (command === "start") {
  process.umask(0o077);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  // 先独占本机端口，避免两个进程同时恢复旧锁或在端口冲突时改写数据。
  const server = createServer((_req, res) => {
    res.writeHead(503).end("本地服务正在启动，请稍后刷新");
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(19876, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  } catch (error) {
    console.error("无法监听本机 19876 端口，请检查是否已启动。");
    process.exitCode = 1;
    throw error;
  }
  let release: (() => Promise<void>) | undefined;
  let local: Awaited<ReturnType<typeof createLocalApp>>;
  try {
    release = await acquireRuntimeLock(join(dataDir, "runtime.lock"));
    local = await createLocalApp({ root, dataDir });
  } catch (e) {
    await release?.();
    server.close();
    throw e;
  }
  server.removeAllListeners("request");
  server.on("request", local.app);
  {
    const url = `${localOrigin}/#token=${local.apiToken}`;
    console.log(
      `aioffer-cli 已启动，仅监听本机。\n访问链接（含本机访问凭据，请勿分享）：\n${url}\n插件目录：${join(root, "extension/dist")}\n按 Ctrl+C 停止。`,
    );
    if (!args.includes("--no-open")) {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "rundll32"
            : "xdg-open";
      const parameters =
        process.platform === "win32"
          ? ["url.dll,FileProtocolHandler", url]
          : [url];
      const child = spawn(command, parameters, { stdio: "ignore" });
      child.on("error", () => console.log("请手动打开上面的访问链接。"));
      child.unref();
    }
  }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await local.close();
    // 先停止接收并等待在途请求结束，再释放锁。端口关闭期间，新实例
    // 仍会因旧进程持锁而拒绝启动，避免新旧请求同时写入同一数据目录。
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await release?.();
  };
  process.on("SIGINT", () => {
    void stop();
  });
  process.on("SIGTERM", () => {
    void stop();
  });
} else {
  console.error("未知命令。运行 aioffer --help 查看中文帮助。");
  process.exitCode = 1;
}
