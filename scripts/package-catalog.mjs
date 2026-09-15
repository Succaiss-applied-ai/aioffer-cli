// 维护者工具：只保留招聘公开字段，不包含鉴权、账号、表单采集或内部调试数据。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const raw = JSON.parse(await readFile(process.argv[2], "utf8"));
if (
  raw.total !== raw.items.length ||
  new Set(raw.items.map((x) => x.jobId)).size !== raw.total
)
  throw Error("岗位导出不完整");
const items = raw.items.map((x) => ({
  jobId: x.jobId,
  companyName: x.company.name,
  title: x.title,
  locations: x.cities ?? [],
  applicationUrl: x.applicationUrl,
  description: x.descriptionText ?? x.description ?? "",
  channel: x.channel ?? "",
  salary: x.salary ?? "",
  tags: x.tags ?? [],
  verifiedAt: x.verifiedAt ?? null,
}));
for (const x of items) {
  const u = new URL(x.applicationUrl);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw Error(`非法岗位地址 ${x.jobId}`);
}
const catalog = {
  schemaVersion: "aioffer-local-catalog.v1",
  total: raw.total,
  exportedAt: raw.exportedAt,
  items,
};
const bytes = gzipSync(JSON.stringify(catalog), { level: 9 });
await mkdir("data", { recursive: true });
await writeFile("data/jobs.json.gz", bytes);
await writeFile(
  "data/manifest.json",
  JSON.stringify(
    {
      schemaVersion: catalog.schemaVersion,
      total: raw.total,
      exportedAt: raw.exportedAt,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: "AI Offer 岗位服务公开职位快照",
      note: "静态快照；以企业招聘官网的实时状态为准。职位描述的权利属于原发布方。",
    },
    null,
    2,
  ) + "\n",
);
console.log(`已打包 ${items.length} 个岗位，${bytes.length} 字节`);
