import { rm, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
if (
  JSON.parse(await readFile(join(root, "package.json"), "utf8")).name !==
  "aioffer-cli"
)
  throw Error("构建目录不正确");
// 仅清理本项目生成的 dist，防止移除的旧云端入口残留在安装包。
await rm(join(root, "dist"), { recursive: true, force: true });
execFileSync(
  process.execPath,
  [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
  { cwd: root, stdio: "inherit" },
);
execFileSync(process.execPath, [join(root, "scripts/build-extension.mjs")], {
  cwd: root,
  stdio: "inherit",
});
