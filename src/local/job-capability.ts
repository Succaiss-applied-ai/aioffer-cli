import type { LocalJob } from "./catalog.js";

export const capabilityLabels = {
  auto: "自动投递（免登录）",
  assisted: "半自动投递（需本人登录）",
  unverified: "登录要求未知",
  unavailable: "暂不可投递",
} as const;
export type CapabilityKind = keyof typeof capabilityLabels;
export type CapabilityFilter = CapabilityKind | "actionable" | "all";
export function capabilityFilter(value: unknown): CapabilityFilter {
  if (["auto", "assisted", "unverified", "unavailable", "actionable", "all"].includes(String(value)))
    return value as CapabilityFilter;
  throw Error("无效的投递能力筛选");
}

// 与 AI Offer 数据口径一致：auto_apply -> not_required；login_required -> required。
// CLI 将需本人登录的入口展示为半自动。历史成功和适配器类型不是岗位准入白名单。
export function jobCapability(job: LocalJob) {
  let kind: CapabilityKind = "unverified";
  let reason = "来源未标注登录要求，暂不分类";
  const safeUrl = (() => { try { const u = new URL(job.applicationUrl); return /^https?:$/.test(u.protocol) && !u.username && !u.password; } catch { return false; } })();
  if (job.availability !== "active" || !safeUrl) {
    kind = job.availability === "unavailable" || !safeUrl ? "unavailable" : "unverified";
    reason = job.availability === "unavailable" ? "最新公开有效岗位快照未收录，已禁止创建新任务" : "缺少有效岗位状态或投递地址";
  } else if (job.loginRequirement?.status === "not_required") {
    kind = "auto";
    reason = "生产数据标记免登录（not_required / auto_apply），可选择自动或半自动";
  } else if (job.loginRequirement?.status === "required") {
    kind = "assisted";
    reason = "生产数据标记需登录（required / login_required），本人登录后由助手填写并逐岗确认提交";
  }
  return { kind, label: capabilityLabels[kind], reason,
    allowedModes: (kind === "auto" ? ["auto", "assisted"] : kind === "assisted" ? ["assisted"] : []) as Array<"auto" | "assisted"> };
}
export function assertJobMode(job: LocalJob, mode: "auto" | "assisted") {
  const capability = jobCapability(job);
  if (!capability.allowedModes.includes(mode)) throw Error(`${job.companyName} / ${job.title}：${capability.reason}；不可使用${mode === "auto" ? "自动" : "半自动"}模式`);
}

// 企业名称原样去重；同企业可以同时有免登录与需登录岗位，不相加冒充企业总量。
export function companyCoverage(jobs: LocalJob[]) {
  const groups = new Map<string, { companyName: string; autoJobs: number; assistedJobs: number; entries: Map<string, { url: string; kind: "auto" | "assisted" }> }>();
  for (const j of jobs) {
    const kind = jobCapability(j).kind;
    if (kind !== "auto" && kind !== "assisted") continue;
    let row = groups.get(j.companyName);
    if (!row) { row = { companyName: j.companyName, autoJobs: 0, assistedJobs: 0, entries: new Map() }; groups.set(j.companyName, row); }
    if (kind === "auto") row.autoJobs++; else row.assistedJobs++;
    const u = new URL(j.applicationUrl);
    // 同一 ATS 域名下的不同企业、校招/社招入口不可合并成一家网站。
    const site = u.hostname === "app.mokahr.com" ? u.origin + u.pathname : u.origin;
    const key = `${kind}:${site}`;
    const previous = row.entries.get(key);
    if (!previous || j.applicationUrl < previous.url) row.entries.set(key, { url: j.applicationUrl, kind });
  }
  const companies = [...groups.values()].sort((a,b) => a.companyName.localeCompare(b.companyName,"zh-CN")).map(r=>({companyName:r.companyName,autoJobs:r.autoJobs,assistedJobs:r.assistedJobs,entries:[...r.entries.values()].sort((a,b)=>a.url.localeCompare(b.url,"en"))}));
  const counts = { total: companies.length, auto: companies.filter(c=>c.autoJobs>0).length, assisted: companies.filter(c=>c.assistedJobs>0).length, mixed: companies.filter(c=>c.autoJobs>0&&c.assistedJobs>0).length };
  return { counts, companies };
}
