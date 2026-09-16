import { matchSiteAdapter } from "../gateway/site-adapter-registry.js";
import type { LocalJob } from "./catalog.js";

export const capabilityLabels = {
  auto: "自动投递候选",
  assisted: "半自动投递候选",
  unverified: "能力待验证",
  unavailable: "暂不可投递",
} as const;
export type CapabilityKind = keyof typeof capabilityLabels;
export type CapabilityFilter = CapabilityKind | "actionable" | "all";
export function capabilityFilter(value: unknown): CapabilityFilter {
  if (["auto", "assisted", "unverified", "unavailable", "actionable", "all"].includes(String(value)))
    return value as CapabilityFilter;
  throw Error("无效的投递能力筛选");
}

// 登录要求、适配器与历史结果是不同证据。不得从 HTTP URL 或 required 推导支持。
export function jobCapability(job: LocalJob) {
  let kind: CapabilityKind = "unverified";
  let reason = "缺少可核实的填写或投递证据，暂不开放任务";
  const login = job.loginRequirement;
  const adapter = matchSiteAdapter(job.applicationUrl);
  const safeUrl = (() => { try { const u = new URL(job.applicationUrl); return /^https?:$/.test(u.protocol) && !u.username && !u.password; } catch { return false; } })();
  const verifiedLogin = login && ["manual_apply_flow", "automated_apply_probe", "form_observation", "source_config"].includes(login.verificationMethod)
    && ["job", "company", "company_source"].includes(login.scope) && Number.isFinite(Date.parse(login.verifiedAt)) && /^https?:\/\//.test(login.evidenceUrl);
  if (job.availability !== "active" || !safeUrl) {
    kind = job.availability === "unavailable" || !safeUrl ? "unavailable" : "unverified";
    reason = job.availability === "unavailable" ? "最新公开有效岗位快照未收录，已禁止创建新任务" : "缺少有效岗位状态或投递地址";
  } else if (verifiedLogin && login.status === "not_required" && adapter.supportLevel === "specialized") {
    kind = "auto";
    reason = "免登录入口已核验，并匹配专用适配器；完整投递仍需实际回执验证";
  } else if (job.deliveryEvidence?.successfulOn && Number.isFinite(Date.parse(job.deliveryEvidence.successfulOn))) {
    kind = "assisted";
    reason = "来源系统有该岗位成功记录；请处理登录等人工环节，逐岗确认提交，本 CLI 尚未逐岗复验";
  } else if (login?.status === "not_required") {
    reason = "仅有免登录依据，尚无专用适配器或成功记录，不作为可自动投递岗位";
  } else if (login?.status === "required") {
    reason = "需要登录，且缺少该岗位的成功证据，不能直接归为可半自动投递";
  }
  return { kind, label: capabilityLabels[kind], reason,
    allowedModes: (kind === "auto" ? ["auto", "assisted"] : kind === "assisted" ? ["assisted"] : []) as Array<"auto" | "assisted"> };
}
export function assertJobMode(job: LocalJob, mode: "auto" | "assisted") {
  const capability = jobCapability(job);
  if (!capability.allowedModes.includes(mode)) throw Error(`${job.companyName} / ${job.title}：${capability.reason}；不可使用${mode === "auto" ? "自动" : "半自动"}模式`);
}
