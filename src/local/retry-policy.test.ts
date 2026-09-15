import { describe, it, expect } from "vitest";
import { canRetryLogin } from "./retry-policy.js";
import type { AutoApplyBatch, AutoApplyBatchJob } from "../gateway/auto-apply-contract.js";
const batch = { tenantId: "local", status: "completed_with_errors",
  confirmation: { allowAutomaticFinalSubmit: true } } as AutoApplyBatch;
const job = { status: "failed", reasonCode: "login_required", localSubmitAuthorizedAt: null } as AutoApplyBatchJob;
describe("登录失败重试的防重复提交边界", () => {
  it("只接受有明确未提交证据的登录失败", () => {
    expect(canRetryLogin(batch, job)).toBe(true);
    expect(canRetryLogin(batch, { ...job, localSubmitAuthorizedAt: undefined })).toBe(false);
    expect(canRetryLogin({ ...batch, confirmation: { ...batch.confirmation, allowAutomaticFinalSubmit: false } },
      { ...job, localSubmitAuthorizedAt: undefined })).toBe(true);
  });
  it.each([
    { status: "succeeded" }, { status: "cancelled" }, { status: "waiting_for_site_receipt" },
    { reasonCode: "submission_outcome_unknown" }, { reasonCode: "user_interrupted" },
    { localSubmitAuthorizedAt: "2026-09-16T00:00:00Z" }, { receiptCommandId: "receipt" },
    { localReviewApproval: { reviewHash: "hash", confirmedAt: "", expiresAt: "" } },
    { stopRequest: { requestId: "stop" } },
  ])("不放开其他状态或已提交可能性 %j", change => {
    expect(canRetryLogin(batch, { ...job, ...change } as AutoApplyBatchJob)).toBe(false);
  });
});
