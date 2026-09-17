import { copyFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "web/dist");
const tailwindRoot = dirname(fileURLToPath(import.meta.resolve("@tailwindcss/cli/package.json")));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all([
  build({
    entryPoints: [join(root, "web/src/main.tsx")],
    outfile: join(output, "app.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    minify: true,
    sourcemap: false,
    define: { "process.env.NODE_ENV": '"production"' },
  }),
  copyFile(join(root, "node_modules/antd/dist/antd.css"), join(output, "antd.css")),
]);

execFileSync(
  process.execPath,
  [
    join(tailwindRoot, "dist/index.mjs"),
    "-i",
    join(root, "web/src/styles.css"),
    "-o",
    join(output, "app.css"),
    "--minify",
  ],
  { cwd: root, stdio: "inherit" },
);
