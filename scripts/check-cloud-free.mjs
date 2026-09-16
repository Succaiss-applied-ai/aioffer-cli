import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
const read = (file) => readFile(file, "utf8");
const manifest = JSON.parse(await read("extension/dist/manifest.json"));
assert.deepEqual(manifest.content_scripts[0].matches, [
  "http://127.0.0.1/*",
  "http://localhost/*",
]);
assert.deepEqual(
  manifest.externally_connectable.matches,
  manifest.content_scripts[0].matches,
);
const background = await read("extension/dist/background.js");
assert(
  background.includes("installLocalTransportGuard()"),
  "构建必须包含本地网络出口保护",
);
assert(
  !/https?:\/\/(?:[\w-]+\.)*succaiss\.com/.test(background),
  "插件产物不允许企业云端地址",
);
const profile = await read("extension/src/execution-profile.ts");
assert(!profile.includes("fetch("), "资料快照不能再读取产品云端");
assert(
  !(await read("extension/dist/sidepanel.js")).includes("entitlement"),
  "侧栏不能显示旧云端权益入口",
);
const server = await read("src/local/server.ts");
assert(!server.includes("autoApplyCallbackSecrets:"), "本地运行不配置云端回调");
assert(!server.includes("database:"), "本地运行不依赖数据库服务");
const webIndex = await read("web/index.html");
assert(webIndex.includes('href="/dist/antd.css"') && webIndex.includes('href="/dist/app.css"') &&
  webIndex.includes('src="/dist/app.js"'), "本地工作台必须只加载构建后的同源资源");
for (const file of ["web/dist/app.js", "web/dist/app.css", "web/dist/antd.css"]) {
  assert(!(await read(file)).includes("sourceMappingURL="), `本地工作台产物不得包含 source map 引用：${file}`);
}
assert((await read("web/dist/app.js")).includes("https://aioffer.succaiss.com/"),
  "本地工作台必须包含指定 aioffer 品牌链接");
const bytes = await readFile("data/jobs.json.gz");
const metadata = JSON.parse(await read("data/manifest.json"));
assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.sha256);
const catalog = JSON.parse(gunzipSync(bytes));
assert.equal(catalog.items.length, metadata.total);
assert.equal(new Set(catalog.items.map((x) => x.jobId)).size, metadata.total);
const allowed = new Set([
  "jobId",
  "companyName",
  "title",
  "locations",
  "applicationUrl",
  "description",
  "channel",
  "salary",
  "tags",
  "verifiedAt",
  "sourceJobId",
  "availability",
  "loginRequirement",
  "deliveryEvidence",
]);
for (const job of catalog.items) {
  assert(Object.keys(job).every((key) => allowed.has(key)));
  if (job.loginRequirement) assert(Object.keys(job.loginRequirement).every(k => ["status", "scope", "verificationMethod", "verifiedAt", "evidenceUrl"].includes(k)));
  if (job.deliveryEvidence) assert(Object.keys(job.deliveryEvidence).every(k => ["successfulOn", "latestStatus", "latestOn"].includes(k)));
  const url = new URL(job.applicationUrl);
  assert(
    ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password,
  );
}
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "data"].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (/\.(?:ts|js|mjs|json|md|html|ya?ml)$/.test(path)) {
      const text = await read(path);
      assert(
        !/(?:glpat-|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/.test(
          text,
        ),
        `疑似凭据：${path}`,
      );
    }
  }
}
await scan(".");
console.log(
  `本地边界检查通过；${metadata.total} 条岗位哈希与公开字段校验通过。静态检查不替代真实网络与隐私审查。`,
);
