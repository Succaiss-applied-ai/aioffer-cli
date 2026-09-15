#!/usr/bin/env node
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { open, unlink, mkdir, readFile } from "node:fs/promises";
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
  const lock = join(dataDir, "runtime.lock");
  try {
    const file = await open(lock, "wx", 0o600);
    await file.writeFile(String(process.pid));
    await file.close();
  } catch {
    throw Error(
      `数据目录已被占用。若上次异常退出，请确认旧进程已结束，再移除 ${lock}`,
    );
  }
  let local: Awaited<ReturnType<typeof createLocalApp>>;
  try {
    local = await createLocalApp({ root, dataDir });
  } catch (e) {
    await unlink(lock);
    throw e;
  }
  const server = local.app.listen(19876, "127.0.0.1");
  server.on("error", async () => {
    await local.close();
    await unlink(lock);
    console.error("无法监听本机 19876 端口，请检查是否已启动。");
    process.exitCode = 1;
  });
  server.on("listening", () => {
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
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await local.close();
    server.close();
    await unlink(lock);
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
