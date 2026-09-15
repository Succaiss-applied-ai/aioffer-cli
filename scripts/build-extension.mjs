import { mkdir, copyFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const buildCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const define = {
  __RECRUITING_AI_BUILD_COMMIT__: JSON.stringify(buildCommit),
};

await mkdir("extension/dist", { recursive: true });
await Promise.all([
  rm("extension/dist/background.js.map", { force: true }),
  rm("extension/dist/sidepanel.js.map", { force: true }),
  rm("extension/dist/offscreen.js.map", { force: true }),
]);
await Promise.all([
  build({
    entryPoints: ["extension/src/page-control-runtime.ts"],
    outfile: "extension/dist/page-control-runtime.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    sourcemap: false,
  }),
  build({
    entryPoints: ["extension/src/background.ts"],
    outfile: "extension/dist/background.js",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    define,
    sourcemap: false,
  }),
  build({
    entryPoints: ["extension/src/local-sidepanel.ts"],
    outfile: "extension/dist/sidepanel.js",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    define,
    sourcemap: false,
  }),
  build({
    entryPoints: ["extension/src/offscreen.ts"],
    outfile: "extension/dist/offscreen.js",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    define,
    sourcemap: false,
  }),
  build({
    entryPoints: ["extension/src/bridge-content.ts"],
    outfile: "extension/dist/bridge-content.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    define,
    sourcemap: false,
  }),
  copyFile("extension/manifest.json", "extension/dist/manifest.json"),
  copyFile("extension/local-sidepanel.html", "extension/dist/sidepanel.html"),
  copyFile("extension/sidepanel.css", "extension/dist/sidepanel.css"),
  copyFile("extension/offscreen.html", "extension/dist/offscreen.html"),
  copyFile("extension/connect.html", "extension/dist/connect.html"),
  copyFile("extension/connect.js", "extension/dist/connect.js"),
  copyFile(
    "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    "extension/dist/pdf.worker.min.mjs",
  ),
]);
