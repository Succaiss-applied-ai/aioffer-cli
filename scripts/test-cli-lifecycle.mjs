// 使用隔离数据目录验证真实 CLI 生命周期；不读取用户配置、不连接外部服务。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const dir = await mkdtemp(join(tmpdir(), "aioffer-cli-lifecycle-"));
const children = [];
function launch() {
  const child = spawn(process.execPath, ["dist/local/cli.js", "start", "--no-open"], {
    env: { ...process.env, AIOFFER_DATA_DIR: dir }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  const done = once(child, "exit");
  children.push(child);
  return { child, done, output: () => output };
}
async function started(run) {
  for (let i = 0; i < 150; i++) {
    if (run.output().includes("aioffer-cli 已启动")) return;
    if (run.child.exitCode !== null) throw Error("隔离 CLI 启动失败，请先停止本机正在使用 19876 端口的服务");
    await delay(100);
  }
  throw Error("隔离 CLI 启动超时");
}
try {
  const first = launch();
  await started(first);
  const configBefore = await readFile(join(dir, "secrets.json"), "utf8");
  const competing = launch();
  const [code] = await competing.done;
  assert.notEqual(code, 0);
  assert.equal(await readFile(join(dir, "runtime.lock"), "utf8"), String(first.child.pid));
  assert.equal(await readFile(join(dir, "secrets.json"), "utf8"), configBefore);
  console.log("重复启动被拒绝，原进程锁和配置不变：通过");
  first.child.kill("SIGKILL");
  await first.done;
  const recovered = launch();
  await started(recovered);
  assert.equal(await readFile(join(dir, "runtime.lock"), "utf8"), String(recovered.child.pid));
  assert.equal(await readFile(join(dir, "secrets.json"), "utf8"), configBefore);
  console.log("异常退出后的旧锁自动恢复，配置保留：通过");
  recovered.child.kill("SIGTERM");
  await recovered.done;
  await assert.rejects(readFile(join(dir, "runtime.lock")), { code: "ENOENT" });
  console.log("正常退出清理锁：通过");
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, "exit");
      child.kill("SIGKILL");
      await done;
    }
  }
  await rm(dir, { recursive: true, force: true });
}
