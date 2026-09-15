import { describe, it, expect } from "vitest";
import {
  AutoApplyService,
  MemoryAutoApplyBatchRepository,
} from "../gateway/auto-apply-service.js";
import { MemoryDeviceCommandQueue } from "../gateway/device-command-queue.js";
import { DisabledAutoApplyCallbackDispatcher } from "../gateway/auto-apply-callback.js";
describe("半自动最终确认", () => {
  it("未确认不能提交，普通继续不能越权，绑定回读哈希且重复确认不重复排队", async () => {
    const now = () => new Date("2026-09-15T00:00:00Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const batches = new MemoryAutoApplyBatchRepository();
    const service = new AutoApplyService(
      batches,
      queue,
      "test-signing-secret-at-least-32-characters",
      now,
      new DisabledAutoApplyCallbackDispatcher(),
    );
    const identity = {
      tenantId: "local",
      userId: "local-user",
      deviceId: "test-device",
    };
    const batch = await service.create({
      ...identity,
      idempotencyKey: "test-assisted",
      request: {
        schemaVersion: "auto-apply-batch-request.v1",
        candidate: {
          packageRef: "http://127.0.0.1:19876/files/test",
          packageVersion: "test",
          packageSha256: "a".repeat(64),
          applicationProfile: {
            schemaVersion: "candidate-application-profile.v1",
            revision: "b".repeat(64),
            facts: [],
          },
        },
        assets: [
          {
            assetId: "test",
            purpose: "resume",
            fileRef: "http://127.0.0.1:19876/files/test",
            name: "示例.pdf",
            mediaType: "application/pdf",
            sha256: "a".repeat(64),
          },
        ],
        jobs: [
          {
            jobId: "test-job",
            companyName: "示例",
            title: "工程师",
            applicationUrl:
              "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/test/apply",
          },
        ],
        confirmation: {
          scope: "batch",
          confirmedByUser: true,
          confirmedAt: now().toISOString(),
          displayedJobIds: ["test-job"],
          allowAutomaticFinalSubmit: false,
        },
      },
    });
    const claim = await queue.claim(identity);
    expect(claim).toBeTruthy();
    expect(claim!.command.safety.allowFinalSubmit).toBe(false);
    expect(claim!.command.payload.localAssisted).toBe(true);
    const job = batch.jobs[0]!;
    const verification = {
      ...identity,
      batchId: batch.batchId,
      batchJobId: job.batchJobId,
      commandId: claim!.commandId,
    };
    expect(
      (
        await service.verifySubmissionAuthorization(
          String(claim!.command.payload.batchAuthorization),
          verification,
        )
      ).valid,
    ).toBe(false);
    const hash = `sha256:${"c".repeat(64)}`;
    await service.completeCommandResult(claim!.commandId, identity.deviceId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: batch.batchId,
          batchJobId: job.batchJobId,
          jobId: job.jobId,
          status: "waiting_for_user_action",
          reasonCode: "final_review_required",
          occurredAt: now().toISOString(),
          evidence: { redacted: true, failureDetails: { reviewHash: hash } },
        },
      },
    });
    await expect(
      service.resumeJob(batch.batchId, job.batchJobId, identity),
    ).rejects.toThrow("最终投递确认");
    await expect(
      service.confirmLocalReview(
        batch.batchId,
        job.batchJobId,
        `sha256:${"d".repeat(64)}`,
        identity,
      ),
    ).rejects.toThrow("确认内容");
    await service.confirmLocalReview(
      batch.batchId,
      job.batchJobId,
      hash,
      identity,
    );
    const approved = await queue.claim(identity);
    expect(approved!.command.safety.allowFinalSubmit).toBe(true);
    expect(approved!.command.payload.localReviewApproval).toMatchObject({
      reviewHash: hash,
    });
    await expect(
      service.confirmLocalReview(batch.batchId, job.batchJobId, hash, identity),
    ).rejects.toThrow();
  });
});
