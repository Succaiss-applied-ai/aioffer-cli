import { candidateApplicationProfileSchema } from "../../src/gateway/auto-apply-contract.js";
import type { AutoApplyRuntimeCredential } from "./auto-apply-client.js";
export function executionProfileOrigin(value: unknown): string {
  const url = new URL(String(value ?? ""));
  if (url.username || url.password || url.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "19876") {
    throw new Error("补充资料只能来自本机 aioffer-cli");
  }
  return url.origin;
}
/** 本地任务使用已确认的不可变快照，不读取 AI Offer 登录态或云端资料。 */
export async function readExecutionProfile(
  credential: AutoApplyRuntimeCredential, candidate: Record<string, unknown>,
  task: { batchId: string; jobId: string }, signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  signal?.throwIfAborted();
  if (credential.productOrigin) executionProfileOrigin(credential.productOrigin);
  if (candidate.applicationProfileUrl) throw new Error("本地模式不接受远程补充资料地址");
  const profile = candidateApplicationProfileSchema.parse(candidate.applicationProfile);
  return { ...profile, facts: profile.facts.filter(fact => !fact.fieldBinding || fact.fieldBinding.jobId === task.jobId) };
}
