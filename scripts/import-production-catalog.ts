// 维护者离线导入工具；输入是授权取得的完整公开岗位快照，绝不随包保存原始批次或账号资料。
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { jobCapability, companyCoverage } from "../src/local/job-capability.js";
import type { LocalJob, Catalog } from "../src/local/catalog.js";
const raw = JSON.parse(await readFile(process.argv[2]!, "utf8"));
if (!raw.queriedAt || !Number.isFinite(Date.parse(raw.queriedAt)) || !Array.isArray(raw.jobs) || !raw.jobs.length ||
    Object.values(raw.counts ?? {}).reduce((n: number, x) => n + Number(x), 0) !== raw.jobs.length ||
    new Set(raw.jobs.map((j: any) => j.jobId)).size !== raw.jobs.length ||
    raw.filter?.['publication.visibility'] !== 'PUBLIC' || raw.filter?.['publication.lifecycle'] !== 'ACTIVE' ||
    raw.filter?.['summary.capabilities.applicationAllowed'] !== true) throw Error("需要完整、非空的公开有效岗位快照与计数，拒绝部分导出");
const old: Catalog = JSON.parse(gunzipSync(await readFile("data/jobs.json.gz")).toString());
const byUrl = new Map(old.items.map(j => [j.applicationUrl, j]));
const bySource = new Map(old.items.filter(j => j.sourceJobId).map(j => [j.sourceJobId, j]));
const used = new Set<string>();
const date = (s: unknown) => typeof s === "string" && Number.isFinite(Date.parse(s)) ? s : "";
function url(s: string) { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw Error("非法公开 URL");return s; }
const items: LocalJob[] = raw.jobs.map((x: any) => {
  const previous = bySource.get(x.jobId) ?? byUrl.get(x.applicationUrl);
  const jobId = previous && !used.has(previous.jobId) ? previous.jobId : x.jobId;
  used.add(jobId);
  const login = x.loginRequirement;
  const events = (raw.executions ?? []).filter((e: any) => e.jobId === x.jobId && e.applicationUrl === x.applicationUrl && date(e.batchUpdatedAt))
    .sort((a: any,b: any) => a.batchUpdatedAt.localeCompare(b.batchUpdatedAt));
  const success = events.filter((e: any) => e.status === "succeeded").at(-1), latest = events.at(-1);
  return {
    jobId, sourceJobId: x.jobId, companyName: String(x.companyName), title: String(x.title),
    locations: [...new Set<string>((x.workplaceOptions ?? []).flatMap((w: any) => (w.physicalLocations ?? []).map((l: any) => l.city).filter(Boolean)))],
    applicationUrl: url(x.applicationUrl), description: x.description ?? previous?.description ?? "", channel: x.sourceContext?.channel ?? previous?.channel ?? "",
    salary: x.salary ?? previous?.salary ?? "", tags: [], verifiedAt: date(login?.verifiedAt) || null, availability: "active",
    ...(login ? { loginRequirement: { status: ["required","not_required","unknown"].includes(login.status) ? login.status : "unknown",
      scope: String(login.scope ?? ""), verificationMethod: String(login.verificationMethod ?? ""), verifiedAt: date(login.verifiedAt), evidenceUrl: login.evidenceUrl ? url(login.evidenceUrl) : "" } } : {}),
    ...(success ? { deliveryEvidence: { successfulOn: success.batchUpdatedAt.slice(0,10), latestStatus: String(latest.status), latestOn: latest.batchUpdatedAt.slice(0,10) } } : {}),
  };
});
// 保留既有 jobId，避免老任务的同岗重复保护因换号失效；缺席最新快照的老岗位只读展示。
for (const j of old.items) if (!used.has(j.jobId)) items.push({ ...j, availability: "unavailable" });
if (new Set(items.map(j => j.jobId)).size !== items.length) throw Error("岗位 ID 冲突");
const counts = { auto: 0, assisted: 0, unverified: 0, unavailable: 0 };
for (const job of items) counts[jobCapability(job).kind]++;
const bytes = gzipSync(JSON.stringify({ schemaVersion: "aioffer-local-catalog.v2", total: items.length, exportedAt: raw.queriedAt, items }),{level:9});
await writeFile("data/jobs.json.gz",bytes);
await writeFile("data/manifest.json",JSON.stringify({schemaVersion:"aioffer-local-catalog.v2",total:items.length,activeTotal:raw.jobs.length,exportedAt:raw.queriedAt,sha256:createHash("sha256").update(bytes).digest("hex"),source:"AI Offer 公开岗位快照及匿名岗位能力摘要",capabilityCounts:counts,companyCounts:companyCoverage(items).counts,note:"按生产登录状态区分免登录自动与需登录半自动；企业按名称去重，两类可重叠；非逐站成功保证，快照不自动更新。"},null,2)+"\n");
console.log(JSON.stringify({total:items.length,active:raw.jobs.length,counts}));
