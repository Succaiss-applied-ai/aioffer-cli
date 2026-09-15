import type { AutoApplyBatch, AutoApplyBatchJob } from "../gateway/auto-apply-contract.js";

/** 仅恢复明确的提交前登录失败，不以 retryable 文案放开所有失败或未知回执。 */
export function canRetryLogin(batch: AutoApplyBatch, job: AutoApplyBatchJob): boolean {
  if (batch.tenantId !== "local" || batch.status === "cancelled" || job.stopRequest ||
      job.status !== "failed" || job.reasonCode !== "login_required" || job.localSubmitAuthorizedAt ||
      job.localReviewApproval || job.receiptCommandId) return false;
  return job.localSubmitAuthorizedAt === null || batch.confirmation.allowAutomaticFinalSubmit === false;
}
