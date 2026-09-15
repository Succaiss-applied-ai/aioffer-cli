import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { acquireRuntimeLock } from "./runtime-lock.js";

const dirs: string[] = [];
async function path() {
  const dir = await mkdtemp(join(tmpdir(), "aioffer-runtime-lock-"));
  dirs.push(dir);
  return join(dir, "runtime.lock");
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
describe("本机端口独占后的运行锁恢复", () => {
  it("恢复已退出进程的旧锁，释放可重复调用", async () => {
    const lock = await path();
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    const pid = child.pid!;
    await once(child, "exit");
    await writeFile(lock, String(pid));
    const release = await acquireRuntimeLock(lock);
    expect(await readFile(lock, "utf8")).toBe(String(process.pid));
    await release();
    await release();
    await expect(readFile(lock)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("不抢占存活进程，也不删除异常锁", async () => {
    const lock = await path();
    await writeFile(lock, String(process.pid));
    await expect(acquireRuntimeLock(lock)).rejects.toThrow("仍由进程");
    await writeFile(lock, "broken");
    await expect(acquireRuntimeLock(lock)).rejects.toThrow("运行锁内容异常");
    expect(await readFile(lock, "utf8")).toBe("broken");
  });
  it("释放时不删除其他所有者的新锁", async () => {
    const lock = await path();
    const release = await acquireRuntimeLock(lock);
    await writeFile(lock, "123456789");
    await release();
    expect(await readFile(lock, "utf8")).toBe("123456789");
  });
});
