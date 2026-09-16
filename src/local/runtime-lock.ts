import { open, readFile, unlink } from "node:fs/promises";

/** 调用方必须先独占固定的本机监听端口，串行化旧锁恢复和新实例启动。 */
export async function acquireRuntimeLock(path: string): Promise<() => Promise<void>> {
  try {
    const owner = await readFile(path, "utf8");
    const pid = Number(owner);
    if (!/^\d+$/.test(owner) || !Number.isSafeInteger(pid) || pid <= 0)
      throw Error(`运行锁内容异常，请保留文件并检查：${path}`);
    try {
      process.kill(pid, 0);
      throw Error(`数据目录仍由进程 ${pid} 使用，请先停止旧实例`);
    } catch (error) {
      // 无权限不等于进程不存在，PID 复用时宁可拒绝，也不抢占存活进程。
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(String(process.pid));
  } finally {
    await file.close();
  }
  let released = false;
  return async () => {
    if (released) return;
    const owner = await readFile(path, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (owner === String(process.pid)) await unlink(path);
    released = true;
  };
}
