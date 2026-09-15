import { describe, expect, it, vi } from "vitest";
import type { LegacyPluginEvent } from "./legacy-plugin-adapter.js";
import {
  autoApplyExecutionDeadlineMs,
  MemoryDeviceCommandQueue
} from "./device-command-queue.js";
import {
  AutoApplyService,
  autoApplyCommandDeadlineMs,
  MemoryAutoApplyBatchRepository,
  type AutoApplyPersistence
} from "./auto-apply-service.js";
import { DisabledAutoApplyCallbackDispatcher } from "./auto-apply-callback.js";
import { matchSiteAdapter } from "./site-adapter-registry.js";

const packageSha256 = "a".repeat(64);

class CountingAutoApplyBatchRepository extends MemoryAutoApplyBatchRepository {
  readonly getCalls: string[] = [];

  override async get(batchId: string) {
    this.getCalls.push(batchId);
    return super.get(batchId);
  }
}

function request(jobIds = ["job-1", "job-2"]) {
  return {
    schemaVersion: "auto-apply-batch-request.v1" as const,
    candidate: {
      packageRef: "file_candidate_package",
      packageVersion: "1",
      packageSha256,
      applicationProfile: {
        schemaVersion: "candidate-application-profile.v1" as const,
        revision: "c".repeat(64),
        facts: []
      }
    },
    assets: [{
      assetId: "resume-main",
      purpose: "resume" as const,
      fileRef: "https://files.example.com/resume.pdf",
      name: "resume.pdf",
      mediaType: "application/pdf",
      sha256: "b".repeat(64)
    }],
    jobs: jobIds.map((jobId) => ({
      jobId,
      companyName: "DeepSeek",
      title: `岗位 ${jobId}`,
      applicationUrl: `https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/${jobId === "job-1" ? "2eb2e75d-29f3-47b5-bb10-39f12547d398" : "01416da2-3c8a-4a20-bbb3-1c925d0facf1"}/apply`,
      adapterHint: "moka.deepseek.v1",
      tags: [jobId === "job-1"
        ? "application_access:public"
        : "application_access:login_required"],
      locations: ["北京市"],
      answers: {}
    })),
    confirmation: {
      scope: "batch" as const,
      confirmedByUser: true as const,
      confirmedAt: "2026-08-18T04:00:00.000Z",
      displayedJobIds: jobIds,
      allowAutomaticFinalSubmit: true as const
    },
    executionPolicy: {
      loginPolicy: "skip_and_report" as const,
      concurrency: 1 as const,
      retryBeforeSubmit: 1,
      captchaPolicy: "skip_and_report" as const,
      missingInformationPolicy: "skip_and_report" as const,
      ambiguousConsentPolicy: "skip_and_report" as const
    }
  };
}

describe("AutoApplyService", () => {
  it.each([false, true])("closes an unfillable supplemental result and advances the queue (late=%s)", async (late) => {
    const { service, queue, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "unfillable", request: request() });
    const claim = await queue.claim(identity);
    const job = batch.jobs[0]!;
    const fields = [{schemaVersion:"required-field-request.v1",fieldId:"unknown",stableFieldKey:"education[1].school",
      sectionKey:"education",groupIndex:1,label:"学校",type:"combobox",controlKind:"combobox",inputKind:"select",
      required:true,reasonCode:"candidate_information_missing",description:"招聘页面要求",question:"请选择",options:[]}];
    const event: LegacyPluginEvent = {schemaVersion:"ai-plugin-event.v1",type:"browser.batch_auto_apply_job_completed",status:"completed",
      payload:{autoApplyResult:{schemaVersion:"auto-apply-job-result.v1",batchId:batch.batchId,batchJobId:job.batchJobId,
        jobId:job.jobId,status:late?"waiting_for_site_receipt":"waiting_for_user_action",reasonCode:late?"submission_receipt_pending":"missing_information",
        occurredAt:now().toISOString(),evidence:{redacted:true,...(late?{}:{requiredFieldRequests:fields})}}}};
    let result=await service.completeCommandResult(claim!.commandId,identity.deviceId,event);
    if(late) result=await service.acceptBrowserState({batchId:batch.batchId,batchJobId:job.batchJobId,jobId:job.jobId,
      commandId:claim!.commandId,outcome:"site_validation_rejected",pageUrl:job.applicationUrl,
      observedAt:now().toISOString(),requiredFieldRequests:fields},identity);
    expect(result.jobs[0]).toMatchObject({status:"failed",reasonCode:"supplemental_options_unavailable"});
    expect(result.jobs[0]!.evidence?.requiredFieldRequests).toBeUndefined();
    expect(result.jobs[0]!.evidence?.failureDetails?.pendingInformationRequests).toEqual(fields);
    expect(result.jobs[1]!.status).toBe("preflight");
    expect((await queue.claim(identity))?.command.payload?.job).toMatchObject({jobId:"job-2"});
  });
  it("acknowledges a late CAPTCHA without reviving a stopping job, while preserving a truthful success", async () => {
    const { service, queue, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "late-captcha-stop", request: request(["job-1"]) });
    const claim = await queue.claim(identity);
    const job = batch.jobs[0]!;
    await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
      payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
        batchJobId: job.batchJobId, jobId: job.jobId, status: "waiting_for_site_receipt",
        occurredAt: now().toISOString(), reasonCode: "submission_receipt_pending", evidence: { redacted: true } } }
    });
    const stopped = await service.stopJob(batch.batchId, job.batchJobId, "user-stop-late-captcha", identity);
    expect(stopped.jobs[0]!.stopRequest?.confirmedAt).toBeNull();
    const event = { batchId: batch.batchId, batchJobId: job.batchJobId, jobId: job.jobId,
      commandId: claim!.commandId, outcome: "captcha_required" as const,
      pageUrl: job.applicationUrl, observedAt: now().toISOString() };
    const acknowledged = await service.acceptBrowserState(event, identity);
    expect(acknowledged.revision).toBe(stopped.revision);
    expect(acknowledged.jobs[0]).toEqual(stopped.jobs[0]);
    expect((await service.acceptBrowserState({ ...event, outcome: "succeeded" }, identity)).jobs[0]!.status).toBe("succeeded");
  });
  it.each([false, true])("hands a late CAPTCHA to the original receipt command and preserves user pause=%s", async (userPaused) => {
    const { service, queue, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "late-captcha", request: request() });
    const claim = await queue.claim(identity);
    const job = batch.jobs[0]!;
    await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
      payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
        batchJobId: job.batchJobId, jobId: job.jobId, status: "waiting_for_site_receipt",
        occurredAt: now().toISOString(), reasonCode: "submission_receipt_pending", evidence: { redacted: true } } }
    });
    const next = await queue.claim(identity);
    if (userPaused) await service.pause(batch.batchId, {tenantId:identity.tenantId,userId:identity.userId});
    const event = { batchId: batch.batchId, batchJobId: job.batchJobId, jobId: job.jobId,
      commandId: claim!.commandId, outcome: "captcha_required" as const,
      pageUrl: job.applicationUrl, observedAt: now().toISOString() };
    await expect(service.acceptBrowserState({ ...event, commandId: "old-command" }, identity)).rejects.toThrow("当前提交命令");
    await expect(service.acceptBrowserState(event, { ...identity, deviceId: "other" })).rejects.toThrow();
    const waiting = await service.acceptBrowserState(event, identity);
    expect(waiting.jobs[0]).toMatchObject({ status: "waiting_for_user_action", reasonCode: "captcha_required",
      receiptCommandId: claim!.commandId, evidence: { userActionRequired: { type: "captcha", resumeSupported: true } } });
    expect(waiting.jobs[1]!.commandId).toBe(next!.commandId);
    if (userPaused) expect(waiting.status).toBe("paused");
    expect((await service.acceptBrowserState(event, identity)).revision).toBe(waiting.revision);
    await expect(service.acceptBrowserState({ ...event, outcome: "submission_receipt_timeout" }, identity)).rejects.toThrow("人工等待");
    const success = await service.acceptBrowserState({ ...event, outcome: "succeeded" }, identity);
    expect(success.jobs[0]!.status).toBe("succeeded");
    expect((await service.acceptBrowserState(event, identity)).jobs[0]!.status).toBe("succeeded");
  });
  it.each(["page_reloaded", "tab_closed", "browser_session_ended", "execution_session_ended"])(
    "closes the original command once for user interruption %s and advances the next job", async (interruptionKind) => {
      const { service, queue, identity, now } = receiptFixture();
      const batch = await service.create({ ...identity, idempotencyKey: interruptionKind, request: request() });
      const command = await queue.claim(identity);
      const job = batch.jobs[0]!;
      const event = { batchId: batch.batchId, batchJobId: job.batchJobId, jobId: job.jobId,
        commandId: command!.commandId, outcome: "user_interrupted" as const, interruptionKind,
        submissionStarted: false, pageUrl: job.applicationUrl, observedAt: now().toISOString() };
      const ignored = await service.acceptBrowserState({ ...event, commandId: "old-command" }, identity);
      expect(ignored.jobs[0]!.status).not.toBe("failed");
      const result = await service.acceptBrowserState(event, identity);
      expect(result.jobs[0]).toMatchObject({ status: "failed", reasonCode: "user_interrupted",
        evidence: { diagnostic: { category: "human_action", retryable: false },
          failureDetails: { interruptionKind, submissionOutcome: "not_submitted" } } });
      const repeated = await service.acceptBrowserState(event, identity);
      expect(repeated.revision).toBe(result.revision);
      expect(repeated.jobs).toEqual(result.jobs);
      expect((await queue.claim(identity))?.command.payload?.job).toMatchObject({ jobId: "job-2" });
      await expect(service.acceptBrowserState(event, { ...identity, deviceId: "other-device" })).rejects.toThrow();
    }
  );
  it("does not turn a confirmed success into a late browser interruption", async () => {
    const { service, queue, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "success-before-interruption", request: request() });
    const command = await queue.claim(identity);
    const job = batch.jobs[0]!;
    await service.acceptCommandResult(command!.commandId, {
      schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
      payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
        batchJobId: job.batchJobId, jobId: job.jobId, status: "succeeded", occurredAt: now().toISOString(),
        reasonCode: null, evidence: { redacted: true, siteConfirmation: "投递成功" } } }
    });
    const result = await service.acceptBrowserState({ batchId: batch.batchId, batchJobId: job.batchJobId,
      jobId: job.jobId, commandId: command!.commandId, outcome: "user_interrupted", interruptionKind: "tab_closed",
      pageUrl: job.applicationUrl, observedAt: now().toISOString() }, identity);
    expect(result.jobs[0]).toMatchObject({ status: "succeeded", reasonCode: null });
  });

  it("closes a late file rejection with the existing failure receipt instead of asking for a text answer", async () => {
    const { service, queue, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "late-upload", request: request() });
    const claim = await queue.claim(identity);
    const job = batch.jobs[0]!;
    const receipt = { batchId: batch.batchId, batchJobId: job.batchJobId, jobId: job.jobId,
      commandId: claim!.commandId, outcome: "site_validation_rejected" as const,
      pageUrl: job.applicationUrl, observedAt: now().toISOString(),
      uploadRejection: { uploadFields: [{ stableFieldKey: "resume.file", label: "上传简历", type: "file",
        validationMessage: "网站未接受上传" }], failures: ["上传简历：网站未接受上传", "邮箱：格式不正确"] } };
    await expect(service.acceptBrowserState(receipt, identity)).rejects.toThrow("当前不可由浏览器状态收口");
    await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
      payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
        batchJobId: job.batchJobId, jobId: job.jobId, status: "waiting_for_site_receipt",
        occurredAt: now().toISOString(), reasonCode: "submission_receipt_pending",
        evidence: { redacted: true, pageUrl: job.applicationUrl } } }
    });
    const next = await queue.claim(identity);
    await expect(service.acceptBrowserState({ ...receipt, commandId: "old-command" }, identity))
      .rejects.toThrow("不属于当前提交命令");
    await expect(service.acceptBrowserState({ ...receipt, uploadRejection: {
      ...receipt.uploadRejection, uploadFields: [{ ...receipt.uploadRejection.uploadFields[0], type: "text" }]
    } }, identity)).rejects.toThrow();
    const result = await service.acceptBrowserState(receipt, identity);
    expect(result.jobs[0]).toMatchObject({ status: "failed", reasonCode: "site_validation_blocked",
      commandId: null, evidence: { diagnostic: { category: "site_validation", retryable: false,
        recommendedAction: "inspect_evidence" }, failureDetails: { failureCode: "site_upload_rejected",
        ...receipt.uploadRejection } } });
    expect(result.jobs[0]?.evidence?.requiredFieldRequests).toBeUndefined();
    expect(result.jobs[1]?.commandId).toBe(next!.commandId);
    expect((await service.acceptBrowserState(receipt, identity)).revision).toBe(result.revision);
  });

  it("keeps a confirmed success when an older file rejection arrives", async () => {
    const { service, queue, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "success-before-upload-refusal", request: request(["job-1"]) });
    const claim = await queue.claim(identity);
    const succeeded = await service.acceptCommandResult(claim!.commandId, successReceipt(batch));
    const result = await service.acceptBrowserState({ batchId: batch.batchId, batchJobId: batch.jobs[0]!.batchJobId,
      jobId: "job-1", commandId: claim!.commandId, outcome: "site_validation_rejected",
      pageUrl: batch.jobs[0]!.applicationUrl, observedAt: now().toISOString(),
      uploadRejection: { uploadFields: [{ stableFieldKey: "resume.file", type: "file", label: "上传简历",
        validationMessage: "未接受" }], failures: ["上传简历：未接受"] }
    }, identity);
    expect(result.jobs[0]?.status).toBe("succeeded");
    expect(result.revision).toBe(succeeded.revision);
  });
  it("preserves the command sequence on lease reclaim and accepts the rebased next progress", async () => {
    let timestamp = new Date("2026-09-07T00:00:00.000Z");
    const { service, queue, identity } = receiptFixture(() => timestamp);
    const batch = await service.create({ ...identity, idempotencyKey: "reclaimed-progress", request: request(["job-1"]) });
    const first = await queue.claim({ ...identity, leaseSeconds: 30 });
    const progress = { schemaVersion: "auto-apply-job-progress.v1", deviceId: identity.deviceId,
      batchId: batch.batchId, batchJobId: batch.jobs[0]!.batchJobId, jobId: "job-1",
      sequence: 80, stage: "filling", message: "填写", occurredAt: timestamp.toISOString() };
    await service.acceptCommandProgress(first!.commandId, progress);
    timestamp = new Date(timestamp.getTime() + 31_000);
    const reclaimed = await queue.claim({ ...identity, leaseSeconds: 30 });
    expect(reclaimed?.commandId).toBe(first!.commandId);
    await expect(service.acceptCommandProgress(reclaimed!.commandId, { ...progress, sequence: 1 }))
      .rejects.toMatchObject({ code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: 80, status: 409 });
    const updated = await service.acceptCommandProgress(reclaimed!.commandId, { ...progress, sequence: 81 });
    expect(updated.jobs[0]?.progress).toMatchObject({ sequence: 81, commandId: first!.commandId });
    await expect(service.acceptCommandProgress("another-command", { ...progress, sequence: 1 }))
      .rejects.toThrow("进度与已派发命令不匹配");
    await service.cancel(batch.batchId, identity);
    await expect(service.acceptCommandProgress(reclaimed!.commandId, { ...progress, sequence: 1 }))
      .rejects.toThrow("岗位已结束");
  });
  it("stops only an unclaimed job and dispatches the other job", async () => {
    const { service, queue, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "stop-unclaimed", request: request() });
    const job = batch.jobs[0]!;
    const stopped = await service.stopJob(batch.batchId, job.batchJobId, "delete-request-1", identity);
    expect(stopped.jobs[0]).toMatchObject({ status: "cancelled", reasonCode: "job_cancelled",
      stopRequest: { requestId: "delete-request-1", confirmedAt: expect.any(String) } });
    expect((await queue.get(job.commandId!))?.status).toBe("cancelled");
    expect((await queue.claim(identity))?.command.payload?.job).toMatchObject({ jobId: "job-2" });
    expect(await service.pendingJobStops(identity)).toEqual([]);
    expect((await service.stopJob(batch.batchId, job.batchJobId, "delete-request-1", identity)).revision).toBe(stopped.revision);
  });

  it("keeps a claimed job pending until the exact device acknowledges quiescence", async () => {
    const { service, queue, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "stop-claimed", request: request() });
    const claim = (await queue.claim(identity))!;
    const job = batch.jobs[0]!;
    const pending = await service.stopJob(batch.batchId, job.batchJobId, "delete-request-2", identity);
    expect(pending.jobs[0]?.stopRequest?.confirmedAt).toBeNull();
    expect((await queue.get(claim.commandId))?.status).toBe("claimed");
    expect((await service.get(batch.batchId, identity)).jobs[1]?.commandId).toBeNull();
    expect(await service.pendingJobStops({ ...identity, deviceId: "other" })).toEqual([]);
    for (const wrong of [{ ...identity, deviceId: "other" }, { ...identity, userId: "other" }]) {
      await expect(service.acknowledgeJobStop(batch.batchId, job.batchJobId, "delete-request-2", claim.commandId, wrong)).rejects.toThrow();
    }
    await expect(service.acknowledgeJobStop(batch.batchId, job.batchJobId, "delete-request-2", "other-command", identity)).rejects.toThrow();
    await expect(service.stopJob(batch.batchId, job.batchJobId, "different-request", identity)).rejects.toThrow();
    await expect(service.resumeJob(batch.batchId, job.batchJobId, identity)).rejects.toThrow("正在停止");
    const stopped = await service.acknowledgeJobStop(batch.batchId, job.batchJobId, "delete-request-2", claim.commandId, identity);
    expect(stopped.jobs[0]?.stopRequest?.confirmedAt).toEqual(expect.any(String));
    expect((await queue.get(claim.commandId))?.status).toBe("cancelled");
    expect((await queue.claim(identity))?.command.payload?.job).toMatchObject({ jobId: "job-2" });
  });

  it("reconciles a durable success receipt before confirming a stop after restart", async () => {
    const { service, queue, repository, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "stop-receipt-race", request: request() });
    const claim = (await queue.claim(identity))!;
    const job = batch.jobs[0]!;
    await service.stopJob(batch.batchId, job.batchJobId, "delete-request-3", identity);
    const event = successReceipt(batch);
    await queue.complete(claim.commandId, identity.deviceId, event);
    // Crash occurred after queue receipt persistence but before applying batch state.
    const restarted = new AutoApplyService(repository, queue, "test-auto-apply-signing-secret-that-is-long-enough");
    const result = await restarted.acknowledgeJobStop(batch.batchId, job.batchJobId, "delete-request-3", claim.commandId, identity);
    expect(result.jobs[0]).toMatchObject({ status: "succeeded", evidence: { siteConfirmation: "已成功提交申请" },
      stopRequest: { confirmedAt: expect.any(String) } });
    expect((await queue.get(claim.commandId))?.completionEvent).toEqual(event);
    expect(result.jobs[1]?.commandId).toEqual(expect.any(String));
  });

  it("fences submission authorization immediately, before the plugin stops", async () => {
    const { service, queue, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "stop-submit", request: request(["job-1"]) });
    const claim = (await queue.claim(identity))!;
    const token = String(claim.command.payload?.batchAuthorization);
    const scope = { ...identity, batchId: batch.batchId, batchJobId: batch.jobs[0]!.batchJobId, commandId: claim.commandId };
    expect((await service.verifySubmissionAuthorization(token, scope)).valid).toBe(true);
    await service.stopJob(batch.batchId, scope.batchJobId, "delete-request-4", identity);
    expect((await service.verifySubmissionAuthorization(token, scope)).valid).toBe(false);
  });

  it("resumes a waiting neighbour while the selected job is awaiting stop confirmation", async () => {
    const { service, queue, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "stop-and-resume-neighbour", request: request() });
    for (const job of batch.jobs) {
      const claim = (await queue.claim(identity))!;
      await service.completeCommandResult(claim.commandId, identity.deviceId, {
        schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
        payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
          batchJobId: job.batchJobId, jobId: job.jobId, status: "waiting_for_user_action",
          reasonCode: "captcha_required", occurredAt: now().toISOString(), evidence: { redacted: true } } }
      });
    }
    await service.stopJob(batch.batchId, batch.jobs[0]!.batchJobId, "delete-waiting-1", identity);
    const resumed = await service.resume(batch.batchId, identity);
    expect(resumed.jobs[0]).toMatchObject({ status: "waiting_for_user_action", stopRequest: { confirmedAt: null } });
    expect(resumed.jobs[1]?.status).toBe("preflight");
    expect((await queue.claim(identity))?.command.payload?.job).toMatchObject({ jobId: "job-2" });
    await expect(service.resumeJob(batch.batchId, batch.jobs[0]!.batchJobId, identity)).rejects.toThrow("正在停止");
  });

  it("settles an offline stop after its lease expires but retains cleanup until exact device ACK", async () => {
    let time = Date.parse("2026-09-06T06:00:00.000Z");
    const now = () => new Date(time);
    const { service, queue, repository, identity } = receiptFixture(now);
    const batch = await service.create({ ...identity, idempotencyKey: "offline-stop", request: request() });
    const claim = (await queue.claim({ ...identity, leaseSeconds: 300 }))!;
    const job = batch.jobs[0]!;
    await service.stopJob(batch.batchId, job.batchJobId, "offline-delete", identity);
    await expect(queue.renew(claim.commandId, identity.deviceId)).rejects.toThrow("不能续租");
    time += 61_000;
    expect((await service.stopJob(batch.batchId, job.batchJobId, "offline-delete", identity)).jobs[0]?.stopRequest?.confirmedAt).toBeNull();
    time += 240_000;
    const restarted = new AutoApplyService(repository, queue, "test-auto-apply-signing-secret-that-is-long-enough", now);
    const stopped = await restarted.stopJob(batch.batchId, job.batchJobId, "offline-delete", identity);
    expect(stopped.jobs[0]).toMatchObject({ status: "cancelled", stopRequest: {
      confirmedAt: now().toISOString(), confirmationSource: "server_execution_fenced", cleanupAcknowledgedAt: null
    } });
    expect((await queue.get(claim.commandId))?.stopAcknowledgedAt).toBeFalsy();
    expect((await restarted.pendingJobStops(identity)).map(s => s.requestId)).toEqual(["offline-delete"]);
    expect(await restarted.pendingJobStops({ ...identity, deviceId: "replacement-device" })).toEqual([]);
    expect((await queue.claim(identity))?.command.payload?.job).toMatchObject({ jobId: "job-2" });
    const revision = stopped.revision;
    expect((await restarted.stopJob(batch.batchId, job.batchJobId, "offline-delete", identity)).revision).toBe(revision);
    await restarted.completeCommandResult(claim.commandId, identity.deviceId, successReceipt(batch));
    expect((await queue.get(claim.commandId))?.archivedCompletionEvent).toEqual(successReceipt(batch));
    await restarted.acknowledgeJobStop(batch.batchId, job.batchJobId, "offline-delete", claim.commandId, identity);
    expect(await restarted.pendingJobStops(identity)).toEqual([]);
    expect((await restarted.get(batch.batchId, identity)).jobs[0]?.stopRequest).toMatchObject({
      confirmationSource: "server_execution_fenced", cleanupAcknowledgedAt: now().toISOString()
    });
  });

  it("reconciles committed success before server fencing an offline stop", async () => {
    let time = Date.parse("2026-09-06T06:00:00.000Z");
    const { service, queue, identity } = receiptFixture(() => new Date(time));
    const batch = await service.create({ ...identity, idempotencyKey: "offline-success-race", request: request() });
    const claim = (await queue.claim(identity))!;
    await service.stopJob(batch.batchId, batch.jobs[0]!.batchJobId, "offline-success", identity);
    await queue.complete(claim.commandId, identity.deviceId, successReceipt(batch));
    time += 60_000;
    const result = await service.stopJob(batch.batchId, batch.jobs[0]!.batchJobId, "offline-success", identity);
    expect(result.jobs[0]).toMatchObject({ status: "succeeded", evidence: { siteConfirmation: "已成功提交申请" },
      stopRequest: { confirmationSource: "server_execution_fenced", cleanupAcknowledgedAt: null } });
    expect((await queue.get(claim.commandId))?.completionEvent).toEqual(successReceipt(batch));
  });

  it("settles an offline information wait without cancelling a neighbour or losing the cleanup request", async () => {
    let time = Date.parse("2026-09-06T06:00:00.000Z");
    const { service, queue, identity } = receiptFixture(() => new Date(time));
    const batch = await service.create({ ...identity, idempotencyKey: "offline-information-wait", request: request() });
    const claim = (await queue.claim(identity))!;
    await service.completeCommandResult(claim.commandId, identity.deviceId, {
      schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
      payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
        batchJobId: batch.jobs[0]!.batchJobId, jobId: batch.jobs[0]!.jobId, status: "waiting_for_user_action",
        reasonCode: "captcha_required", occurredAt: new Date(time).toISOString(), evidence: { redacted: true } } }
    });
    await service.stopJob(batch.batchId, batch.jobs[0]!.batchJobId, "offline-wait-stop", identity);
    time += 60_000;
    const result = await service.stopJob(batch.batchId, batch.jobs[0]!.batchJobId, "offline-wait-stop", identity);
    expect(result.jobs[0]?.status).toBe("cancelled");
    expect(result.jobs[1]?.stopRequest).toBeUndefined();
    expect((await queue.get(claim.commandId))?.completionEvent).toBeDefined();
    expect(await service.pendingJobStops(identity)).toHaveLength(1);
  });

  function receiptFixture(now = () => new Date("2026-09-06T06:00:00.000Z")) {
    const queue = new MemoryDeviceCommandQueue(now);
    const repository = new MemoryAutoApplyBatchRepository();
    const service = new AutoApplyService(repository, queue,
      "test-auto-apply-signing-secret-that-is-long-enough", now);
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    return { now, queue, repository, service, identity };
  }

  function successReceipt(batch: Awaited<ReturnType<AutoApplyService["create"]>>): LegacyPluginEvent {
    return {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: { autoApplyResult: {
        schemaVersion: "auto-apply-job-result.v1",
        batchId: batch.batchId,
        batchJobId: batch.jobs[0]!.batchJobId,
        jobId: batch.jobs[0]!.jobId,
        status: "succeeded",
        occurredAt: "2026-09-06T06:00:00.000Z",
        evidence: { redacted: true, siteConfirmation: "已成功提交申请" }
      } }
    };
  }

  it("archives a delayed receipt after timeout without changing the job or claiming it again", async () => {
    let timestamp = new Date("2026-09-06T06:00:00.000Z");
    const { queue, service, identity } = receiptFixture(() => timestamp);
    const batch = await service.create({ ...identity, idempotencyKey: "late-receipt", request: request() });
    const claimed = (await queue.claim(identity))!;
    const event = successReceipt(batch);
    (event.payload!.autoApplyResult as Record<string, unknown>).evidence = {
      redacted: true, siteConfirmation: "已成功提交申请",
      validationMessages: Array.from({ length: 40 }, (_, index) => `校验 ${index + 1}`)
    };
    timestamp = new Date(timestamp.getTime() + 30 * 60_000);
    await service.reconcileExpiredBatches();
    const expiredBatch = await service.get(batch.batchId);
    expect(expiredBatch.jobs[0]).toMatchObject({ status: "failed", reasonCode: "task_execution_timeout", commandId: null });
    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, event)).resolves.toEqual(expiredBatch);
    expect(await queue.get(claimed.commandId)).toMatchObject({ status: "expired", archivedCompletionEvent: event });
    expect((await queue.get(claimed.commandId))!.completionEvent).toBeUndefined();
    const next = (await queue.claim(identity))!;
    expect(next.command.payload?.job).toMatchObject({ jobId: "job-2" });
    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, event)).resolves.toEqual(expiredBatch);
    expect(await queue.claim(identity)).toBeNull();
    await service.recoverDeviceQueue(identity);
    expect(await service.get(batch.batchId)).toEqual(expiredBatch);
    await expect(service.completeCommandResult(claimed.commandId, "wrong-device", event)).rejects.toThrow();
    const wrongJob = structuredClone(event);
    (wrongJob.payload!.autoApplyResult as Record<string, unknown>).batchJobId = batch.jobs[1]!.batchJobId;
    (wrongJob.payload!.autoApplyResult as Record<string, unknown>).jobId = batch.jobs[1]!.jobId;
    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, wrongJob)).rejects.toThrow();
    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, { ...event, status: "failed" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await service.get(batch.batchId)).toEqual(expiredBatch);
  });

  it.each([true, false])("never regresses success under concurrent progress (result first: %s)", async (resultFirst) => {
    const { queue, service, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "receipt-race", request: request() });
    const claimed = (await queue.claim(identity))!;
    await service.pause(batch.batchId, identity);
    const result = () => service.completeCommandResult(claimed.commandId, identity.deviceId, successReceipt(batch));
    const progress = () => service.acceptCommandProgress(claimed.commandId, {
      schemaVersion: "auto-apply-job-progress.v1", ...identity,
      batchId: batch.batchId, batchJobId: batch.jobs[0]!.batchJobId, jobId: "job-1",
      sequence: 1, stage: "submitting", message: "正在提交", occurredAt: now().toISOString()
    });
    await Promise.allSettled(resultFirst ? [result(), progress()] : [progress(), result()]);
    expect(await service.get(batch.batchId, identity)).toMatchObject({
      status: "paused", jobs: [{ status: "succeeded" }, { status: "queued" }]
    });
    expect(await queue.claim(identity)).toBeNull();
  });

  it("recovers durable success after a batch write fails without resubmitting the job", async () => {
    const { queue, repository, service, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "receipt-recovery", request: request() });
    const claimed = (await queue.claim(identity))!;
    const event = successReceipt(batch);
    const save = repository.save.bind(repository);
    vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("injected batch write failure"));
    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, event))
      .rejects.toThrow("injected batch write failure");
    expect(await queue.get(claimed.commandId)).toMatchObject({ status: "completed", completionEvent: event });
    vi.mocked(repository.save).mockImplementation(save);
    expect(await service.recoverDeviceQueue(identity)).toBe(1);
    expect(await service.get(batch.batchId)).toMatchObject({ jobs: [{ status: "succeeded", attempt: 1 }, { status: "preflight" }] });
    const next = (await queue.claim(identity))!;
    expect(next.command.payload?.job).toMatchObject({ jobId: "job-2" });
    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, event)).resolves.toMatchObject({
      jobs: [{ status: "succeeded" }, { commandId: next.commandId }]
    });
    expect(await queue.claim(identity)).toBeNull();
  });

  it("does not make profile saves wait for recovery reads of idle historical jobs", async () => {
    const now = () => new Date("2026-09-06T06:00:00.000Z");
    const repository = new CountingAutoApplyBatchRepository();
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(repository, queue, "secret".repeat(8), now);
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    const original = await service.create({ ...identity, idempotencyKey: "idle-history", request: request() });
    const claimed = (await queue.claim(identity))!;
    await service.completeCommandResult(claimed.commandId, identity.deviceId, successReceipt(original));
    await service.pause(original.batchId, identity);
    const next = (await queue.claim(identity))!;
    await service.completeCommandResult(next.commandId, identity.deviceId, {
      ...successReceipt(original),
      payload: { autoApplyResult: {
        ...(successReceipt(original).payload!.autoApplyResult as Record<string, unknown>),
        batchJobId: original.jobs[1]!.batchJobId, jobId: original.jobs[1]!.jobId,
        status: "waiting_for_user_action", reasonCode: "captcha_required"
      } }
    });
    const template = (await repository.get(original.batchId))!;
    for (let index = 0; index < 54; index += 1) {
      await repository.save({ ...structuredClone(template), batchId: `idle-${index}`,
        idempotencyKey: `idle-${index}` });
    }
    const queued = { ...structuredClone(template.jobs[1]!), status: "queued" as const,
      attempt: 0, commandId: null, startedAt: null, completedAt: null };
    await repository.save({ ...template, jobs: [template.jobs[0]!, queued] });
    const before = await repository.listByOwner(identity.tenantId, identity.userId);
    const profile = { ...template.candidate.applicationProfile, sequence: 2, revision: "d".repeat(64) };
    repository.getCalls.length = 0;

    const [recovered, updated] = await Promise.all([
      service.recoverDeviceQueue(identity),
      service.updateCandidateProfile({ sequence: 2, profile }, identity)
    ]);

    expect(recovered).toBe(0);
    expect(updated).toEqual({ updatedJobs: 1 });
    // Each get rereads/parses the complete JSON store in production. No idle
    // job may add one of those reads while the owner's save is queued behind it.
    expect(repository.getCalls).toEqual([]);
    const after = await repository.listByOwner(identity.tenantId, identity.userId);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(after[0]!.jobs[0]).toEqual(before[0]!.jobs[0]);
    expect(after[0]!.jobs[1]).toEqual({ ...before[0]!.jobs[1], candidateProfile: profile });
    expect(await queue.claim(identity)).toBeNull();
  });

  it("validates the batch receipt before marking the device command complete", async () => {
    const { queue, service, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "receipt-validation", request: request() });
    const claimed = (await queue.claim(identity))!;
    const event = successReceipt(batch);
    (event.payload!.autoApplyResult as Record<string, unknown>).jobId = "wrong-job";
    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, event)).rejects.toThrow();
    expect(await queue.get(claimed.commandId)).toMatchObject({ status: "claimed" });
  });

  it.each([21, 40])("persists a failure with %i site validation messages and releases the next job", async (count) => {
    const { queue, service, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: `long-form-receipt-${count}`, request: request() });
    const claimed = (await queue.claim(identity))!;
    const validationMessages = Array.from({ length: count }, (_, index) => `字段 ${index + 1} 为必填`);
    const event: LegacyPluginEvent = {
      ...successReceipt(batch),
      status: "failed",
      payload: { autoApplyResult: {
        ...(successReceipt(batch).payload!.autoApplyResult as Record<string, unknown>),
        status: "failed",
        reasonCode: "control_interaction_failed",
        evidence: { redacted: true, validationMessages }
      } }
    };

    await expect(service.completeCommandResult(claimed.commandId, identity.deviceId, event))
      .resolves.toMatchObject({ jobs: [
        { status: "failed", reasonCode: "control_interaction_failed", evidence: { validationMessages } },
        { status: "preflight" }
      ] });
    expect(await queue.get(claimed.commandId)).toMatchObject({ status: "failed", completionEvent: event });
    const next = (await queue.claim(identity))!;
    expect(next.command.payload?.job).toMatchObject({ jobId: "job-2" });

    // A lost HTTP acknowledgement must replay the receipt, not the ATS action.
    await service.completeCommandResult(claimed.commandId, identity.deviceId, event);
    expect(await queue.claim(identity)).toBeNull();
    expect((await service.get(batch.batchId)).jobs[0]!.evidence?.validationMessages).toEqual(validationMessages);
  });

  it("serializes completion against recovery and keeps the next dispatch unique", async () => {
    const { queue, service, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "receipt-recover-race", request: request() });
    const claimed = (await queue.claim(identity))!;
    await Promise.all([
      service.completeCommandResult(claimed.commandId, identity.deviceId, successReceipt(batch)),
      service.recoverDeviceQueue(identity)
    ]);
    expect(await service.get(batch.batchId)).toMatchObject({ jobs: [{ status: "succeeded" }, { status: "preflight" }] });
    expect(await queue.claim(identity)).not.toBeNull();
    expect(await queue.claim(identity)).toBeNull();
  });
  it("terminates every active batch and command for one owner without affecting another", async () => {
    const queue = new MemoryDeviceCommandQueue(() => new Date("2026-08-26T00:00:01.000Z"));
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      () => new Date("2026-08-26T00:00:01.000Z")
    );
    const ownerA = { tenantId: "tenant-1", userId: "user-a" };
    const ownerB = { tenantId: "tenant-1", userId: "user-b" };
    const batchA = await service.create({
      ...ownerA,
      deviceId: "device-a",
      idempotencyKey: "owner-a-batch",
      request: request(["job-1", "job-2"])
    });
    const batchB = await service.create({
      ...ownerB,
      deviceId: "device-b",
      idempotencyKey: "owner-b-batch",
      request: request(["job-1"])
    });

    await expect(service.terminateOwner(ownerA)).resolves.toEqual({ batches: 1, commands: 1 });
    await expect(service.get(batchA.batchId, ownerA)).resolves.toMatchObject({
      status: "cancelled",
      jobs: [{ status: "cancelled" }, { status: "cancelled" }]
    });
    await expect(service.get(batchB.batchId, ownerB)).resolves.toMatchObject({ status: "running" });
    await expect(queue.claim({ ...ownerA, deviceId: "device-a" })).resolves.toBeNull();
    await expect(service.create({
      ...ownerA,
      deviceId: "device-a",
      idempotencyKey: "owner-a-after-logout",
      request: request(["job-1"])
    })).rejects.toThrow("账号自动投递会话已终止");
    await expect(queue.claim({ ...ownerB, deviceId: "device-b" }))
      .resolves.toMatchObject({ targetDeviceId: "device-b" });

    await service.activateOwner(ownerA);
    await expect(service.create({
      ...ownerA,
      deviceId: "device-a-fresh",
      idempotencyKey: "owner-a-after-rebind",
      request: request(["job-1"])
    })).resolves.toMatchObject({ status: "running", deviceId: "device-a-fresh" });
    await expect(queue.claim({ ...ownerA, deviceId: "device-a-fresh" }))
      .resolves.toMatchObject({ targetDeviceId: "device-a-fresh" });
  });

  it("keeps concurrent reads side-effect free and lets the serialized sweep advance an expired delivery", async () => {
    let currentTime = new Date("2026-08-26T00:00:00.000Z");
    const now = () => currentTime;
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "delivery-deadline",
      request: request()
    });
    const firstCommand = await queue.get(created.jobs[0]!.commandId!);
    expect(Date.parse(firstCommand!.command.expiresAt) - currentTime.getTime())
      .toBe(autoApplyCommandDeadlineMs);

    currentTime = new Date(currentTime.getTime() + autoApplyCommandDeadlineMs);
    const reads = await Promise.all(Array.from(
      { length: 4 },
      () => service.get(created.batchId, { tenantId: "tenant-1", userId: "user-1" })
    ));
    expect(reads).toHaveLength(4);
    for (const read of reads) {
      expect(read.jobs[0]).toMatchObject({
        jobId: "job-1",
        status: "preflight",
        commandId: firstCommand!.commandId
      });
    }
    await expect(queue.get(firstCommand!.commandId)).resolves.toMatchObject({ status: "queued" });

    await expect(service.reconcileExpiredBatches()).resolves.toBe(1);
    const reconciled = await service.get(created.batchId, { tenantId: "tenant-1", userId: "user-1" });

    expect(reconciled).toMatchObject({
      status: "running",
      jobs: [
        { status: "failed", reasonCode: "command_delivery_timeout" },
        { status: "preflight", attempt: 1 }
      ]
    });
    const nextCommand = await queue.claim({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    });
    expect(nextCommand?.command.payload).toMatchObject({ job: { jobId: "job-2" } });
    await expect(queue.get(firstCommand!.commandId)).resolves.toMatchObject({ status: "expired" });
  });

  it("does not let paused batches without commands delay delivery expiration", async () => {
    let currentTime = new Date("2026-08-26T00:00:00.000Z");
    const now = () => currentTime;
    const repository = new CountingAutoApplyBatchRepository();
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      repository,
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "only-command-bearing-batches-expire",
      request: request()
    });
    const commandId = created.jobs[0]!.commandId!;

    for (let index = 0; index < 208; index += 1) {
      await repository.save({
        ...structuredClone(created),
        batchId: `paused-${index}`,
        idempotencyKey: `paused-${index}`,
        status: "paused",
        pauseReason: "waiting_for_user_action",
        jobs: created.jobs.map((job) => ({
          ...structuredClone(job),
          status: "waiting_for_user_action",
          commandId: null,
          completedAt: null
        }))
      });
    }

    repository.getCalls.length = 0;
    currentTime = new Date(currentTime.getTime() + autoApplyCommandDeadlineMs);

    await expect(service.reconcileExpiredBatches()).resolves.toBe(1);
    expect(repository.getCalls).toEqual([created.batchId]);
    await expect(queue.get(commandId)).resolves.toMatchObject({ status: "expired" });
  });

  it("sweeps a claimed command at its execution deadline and advances the queued jobs", async () => {
    expect(autoApplyExecutionDeadlineMs).toBe(30 * 60_000);
    let currentTime = new Date("2026-08-26T00:00:00.000Z");
    const now = () => currentTime;
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "execution-deadline",
      request: request()
    });
    const claim = await queue.claim({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    });
    const other = await service.create({
      tenantId: "tenant-1",
      userId: "user-2",
      deviceId: "device-2",
      idempotencyKey: "execution-deadline-other-owner",
      request: request()
    });
    const otherClaim = await queue.claim({
      tenantId: "tenant-1",
      userId: "user-2",
      deviceId: "device-2"
    });
    expect(Date.parse(claim!.executionExpiresAt!) - currentTime.getTime())
      .toBe(autoApplyExecutionDeadlineMs);

    currentTime = new Date(currentTime.getTime() + autoApplyExecutionDeadlineMs);
    await expect(service.reconcileExpiredBatches()).resolves.toBe(2);
    await expect(service.get(created.batchId, { tenantId: "tenant-1", userId: "user-1" }))
      .resolves.toMatchObject({
        status: "running",
        jobs: [
          { status: "failed", reasonCode: "task_execution_timeout" },
          { status: "preflight", attempt: 1 }
        ]
      });
    await expect(service.get(other.batchId, { tenantId: "tenant-1", userId: "user-2" }))
      .resolves.toMatchObject({
        status: "running",
        jobs: [
          { status: "failed", reasonCode: "task_execution_timeout" },
          { status: "preflight", attempt: 1 }
        ]
      });
    await expect(queue.get(claim!.commandId)).resolves.toMatchObject({ status: "expired" });
    await expect(queue.get(otherClaim!.commandId)).resolves.toMatchObject({ status: "expired" });
  });

  it("treats every plugin failure as terminal even when a legacy caller requests retry", async () => {
    const now = () => new Date("2026-08-31T01:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "terminal-location-failure",
      request: request(["job-1"])
    });
    expect(created.executionPolicy.retryBeforeSubmit).toBe(0);
    const claim = await queue.claim({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    });
    const completed = await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: "job-1",
          status: "failed",
          occurredAt: now().toISOString(),
          reasonCode: "location_control_interaction_failed",
          evidence: {
            redacted: true,
            reasonCode: "location_control_interaction_failed",
            failureDetails: { driverStage: "select" }
          }
        }
      }
    });

    expect(completed).toMatchObject({
      status: "completed_with_errors",
      jobs: [{
        status: "failed",
        attempt: 1,
        reasonCode: "location_control_interaction_failed",
        evidence: { failureDetails: { driverStage: "select" } }
      }]
    });
    await expect(queue.claim({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    })).resolves.toBeNull();
  });

  it("replays only an identical device and payload for an idempotency key", async () => {
    const queue = new MemoryDeviceCommandQueue();
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough"
    );
    const input = {
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "explicit-device-idempotency",
      request: request(["job-1"])
    };
    const created = await service.create(input);
    const replayed = await service.create(input);

    expect(replayed.batchId).toBe(created.batchId);
    await expect(service.create({ ...input, deviceId: "device-2" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.create({
      ...input,
      request: {
        ...input.request,
        jobs: [{ ...input.request.jobs[0]!, title: "不同岗位内容" }]
      }
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rebinds only an unchanged deferred missing-information batch to a newly paired device", async () => {
    const now = () => new Date("2026-09-04T08:45:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const input = {
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-before-plugin-update",
      idempotencyKey: "deferred-device-rebind",
      request: request(["job-1"])
    };
    const created = await service.create(input);
    const claim = await queue.claim({
      tenantId: input.tenantId,
      userId: input.userId,
      deviceId: input.deviceId
    });
    const requiredFieldRequest = {
      schemaVersion: "required-field-request.v1" as const,
      fieldId: "gender",
      stableFieldKey: "basic.gender.combobox",
      label: "个人信息 · 性别",
      sectionKey: "basic",
      groupIndex: null,
      type: "combobox",
      controlKind: "combobox",
      required: true as const,
      reasonCode: "candidate_information_missing" as const,
      description: "招聘网站要求填写",
      question: "请选择性别",
      options: ["女", "男"]
    };
    const missingInformation = {
      schemaVersion: "ai-plugin-event.v1" as const,
      type: "browser.batch_auto_apply_job_completed",
      status: "completed" as const,
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1" as const,
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: created.jobs[0]!.jobId,
          status: "waiting_for_user_action" as const,
          occurredAt: now().toISOString(),
          reasonCode: "missing_information",
          evidence: {
            screenshotRef: null,
            redacted: true as const,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            missingFields: ["个人信息 · 性别"],
            requiredFieldRequests: [requiredFieldRequest]
          }
        }
      }
    };
    await queue.complete(claim!.commandId, input.deviceId, missingInformation);
    const paused = await service.acceptCommandResult(claim!.commandId, missingInformation);
    expect(paused).toMatchObject({
      status: "paused",
      pauseReason: "waiting_for_user_action",
      jobs: [{ status: "waiting_for_user_action", reasonCode: "missing_information", commandId: null }]
    });

    const rebound = await service.create({ ...input, deviceId: "device-after-plugin-update" });
    expect(rebound).toMatchObject({
      batchId: created.batchId,
      deviceId: "device-after-plugin-update",
      status: "paused",
      pauseReason: "waiting_for_user_action"
    });
    expect(rebound.revision).toBe(paused.revision + 1);
    await expect(queue.claim({ ...input, deviceId: "device-before-plugin-update" })).resolves.toBeNull();
    await expect(queue.claim({ ...input, deviceId: "device-after-plugin-update" })).resolves.toBeNull();

    await expect(service.create({
      ...input,
      deviceId: "device-third-instance",
      request: {
        ...input.request,
        jobs: [{ ...input.request.jobs[0]!, title: "已变更的岗位内容" }]
      }
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    await service.provideRequiredFieldAnswers(
      rebound.batchId,
      rebound.jobs[0]!.batchJobId,
      {
        schemaVersion: "required-field-answers.v1",
        answers: [{
          fieldId: requiredFieldRequest.fieldId,
          stableFieldKey: requiredFieldRequest.stableFieldKey,
          value: "女",
          source: "user_confirmed",
          answeredAt: now().toISOString()
        }]
      },
      { tenantId: input.tenantId, userId: input.userId }
    );
    await expect(queue.claim({
      tenantId: input.tenantId,
      userId: input.userId,
      deviceId: "device-after-plugin-update"
    })).resolves.toMatchObject({ targetDeviceId: "device-after-plugin-update" });
  });

  it("serializes concurrent batch creation for one idempotency key", async () => {
    const queue = new MemoryDeviceCommandQueue();
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough"
    );
    const input = {
      tenantId: "tenant-1",
      userId: "user-1",
      idempotencyKey: "concurrent-explicit-device",
      request: request(["job-1"])
    };

    const results = await Promise.allSettled([
      service.create({ ...input, deviceId: "device-1" }),
      service.create({ ...input, deviceId: "device-2" })
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" }))
      .toMatchObject({ targetDeviceId: "device-1" });
    await expect(queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-2" }))
      .resolves.toBeNull();
  });

  it("serializes separate batches for one device and advances the next batch after completion", async () => {
    const now = () => new Date("2026-09-02T11:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const repository = new MemoryAutoApplyBatchRepository();
    const service = new AutoApplyService(
      repository,
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    const first = await service.create({
      ...identity,
      idempotencyKey: "device-global-first",
      request: request(["job-1"])
    });
    const second = await service.create({
      ...identity,
      idempotencyKey: "device-global-second",
      request: request(["job-2"])
    });

    expect(first.jobs[0]).toMatchObject({ status: "preflight", attempt: 1 });
    expect(second.jobs[0]).toMatchObject({ status: "queued", attempt: 0, commandId: null });
    const firstClaim = await queue.claim(identity);
    expect(firstClaim?.command.payload).toMatchObject({ batchId: first.batchId, job: { jobId: "job-1" } });
    await expect(queue.claim(identity)).resolves.toBeNull();

    const event = {
      schemaVersion: "ai-plugin-event.v1" as const,
      type: "browser.batch_auto_apply_job_completed",
      status: "completed" as const,
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1" as const,
          batchId: first.batchId,
          batchJobId: first.jobs[0]!.batchJobId,
          jobId: first.jobs[0]!.jobId,
          status: "succeeded" as const,
          occurredAt: now().toISOString(),
          reasonCode: null,
          evidence: {
            screenshotRef: "evidence-1",
            redacted: true as const,
            pageUrl: first.jobs[0]!.applicationUrl,
            siteConfirmation: "投递成功"
          }
        }
      }
    };
    await queue.complete(firstClaim!.commandId, identity.deviceId, event);
    await service.acceptCommandResult(firstClaim!.commandId, event);

    await expect(service.get(second.batchId, identity)).resolves.toMatchObject({
      status: "running",
      jobs: [{ status: "preflight", attempt: 1 }]
    });
    const secondClaim = await queue.claim(identity);
    expect(secondClaim?.command.payload).toMatchObject({ batchId: second.batchId, job: { jobId: "job-2" } });
  });

  it("recovers a later batch when a completed device command was not applied to the batch state", async () => {
    const now = () => new Date("2026-09-04T06:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const repository = new MemoryAutoApplyBatchRepository();
    const service = new AutoApplyService(
      repository,
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    const first = await service.create({
      ...identity,
      idempotencyKey: "recovery-first",
      request: request(["job-1"])
    });
    const second = await service.create({
      ...identity,
      idempotencyKey: "recovery-second",
      request: request(["job-2"])
    });
    const firstClaim = await queue.claim(identity);
    expect(firstClaim).not.toBeNull();

    // Model the only safe recovery case: the device command is terminal, but
    // the result never reached the batch state. Its outcome is unknowable, so
    // it must not be replayed; the later batch may continue.
    await queue.complete(firstClaim!.commandId, identity.deviceId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {}
    });

    await expect(service.recoverDeviceQueue(identity)).resolves.toBe(1);
    await expect(service.get(first.batchId, identity)).resolves.toMatchObject({
      jobs: [{ status: "failed", reasonCode: "submission_outcome_unknown" }]
    });
    await expect(service.get(second.batchId, identity)).resolves.toMatchObject({
      status: "running",
      jobs: [{ status: "preflight", attempt: 1 }]
    });
    await expect(queue.claim(identity)).resolves.toMatchObject({
      command: { payload: { batchId: second.batchId, job: { jobId: "job-2" } } }
    });
  });

  it("starts a queued batch's command deadline only after earlier serial jobs release the device", async () => {
    let timestamp = new Date("2026-09-06T06:00:00.000Z");
    const { service, queue, identity } = receiptFixture(() => timestamp);
    const first = await service.create({ ...identity, idempotencyKey: "serial-hour", request: request(["job-1", "job-2", "job-3"]) });
    const waiting = await service.create({ ...identity, idempotencyKey: "serial-waiting", request: request(["job-4"]) });
    for (let index = 0; index < first.jobs.length; index += 1) {
      const claimed = (await queue.claim(identity))!;
      timestamp = new Date(timestamp.getTime() + 20 * 60_000);
      await service.reconcileExpiredBatches();
      expect(await service.get(waiting.batchId)).toMatchObject({ status: "queued", jobs: [{ status: "queued", attempt: 0, commandId: null }] });
      await service.completeCommandResult(claimed.commandId, identity.deviceId, successReceipt({ ...first, jobs: first.jobs.slice(index) }));
    }
    const next = (await queue.claim(identity))!;
    expect(next.command.payload?.batchId).toBe(waiting.batchId);
    expect(Date.parse(next.command.expiresAt) - timestamp.getTime()).toBe(autoApplyCommandDeadlineMs);
    expect(await service.get(waiting.batchId)).toMatchObject({ status: "running", jobs: [{ status: "preflight", attempt: 1 }] });
  });

  it("releases the device queue when another batch waits for CAPTCHA", async () => {
    const now = () => new Date("2026-09-02T11:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    const first = await service.create({
      ...identity,
      idempotencyKey: "device-global-captcha",
      request: request(["job-1"])
    });
    const second = await service.create({
      ...identity,
      idempotencyKey: "device-global-after-captcha",
      request: request(["job-2"])
    });
    const firstClaim = await queue.claim(identity);
    const event = {
      schemaVersion: "ai-plugin-event.v1" as const,
      type: "browser.batch_auto_apply_job_completed",
      status: "completed" as const,
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1" as const,
          batchId: first.batchId,
          batchJobId: first.jobs[0]!.batchJobId,
          jobId: first.jobs[0]!.jobId,
          status: "waiting_for_user_action" as const,
          occurredAt: now().toISOString(),
          reasonCode: "captcha_required" as const,
          evidence: {
            screenshotRef: null,
            redacted: true as const,
            pageUrl: first.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            userActionRequired: {
              type: "captcha" as const,
              message: "请完成安全验证码",
              resumeSupported: true as const
            }
          }
        }
      }
    };
    await queue.complete(firstClaim!.commandId, identity.deviceId, event);
    await service.acceptCommandResult(firstClaim!.commandId, event);

    const secondClaim = await queue.claim(identity);
    expect(secondClaim?.command.payload).toMatchObject({ batchId: second.batchId, job: { jobId: "job-2" } });
  });

  it("persists monotonic plugin progress on the original batch job", async () => {
    const now = () => new Date("2026-08-26T02:00:00.100Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "progress-batch",
      request: request(["job-1"])
    });
    const commandId = created.jobs[0]!.commandId!;
    await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const progress = await service.acceptCommandProgress(commandId, {
      schemaVersion: "auto-apply-job-progress.v1",
      deviceId: "device-1",
      batchId: created.batchId,
      batchJobId: created.jobs[0]!.batchJobId,
      jobId: "job-1",
      sequence: 1,
      stage: "opening",
      message: "正在打开招聘页面",
      occurredAt: "2026-08-26T02:00:00.000Z"
    });
    expect(progress.revision).toBe(created.revision + 1);
    expect(progress.jobs[0]).toMatchObject({
      status: "opening",
      progress: {
        schemaVersion: "auto-apply-job-progress.v1",
        commandId,
        sequence: 1,
        stage: "opening",
        message: "正在打开招聘页面",
        receivedAt: "2026-08-26T02:00:00.100Z"
      }
    });
    await expect(service.acceptCommandProgress(commandId, {
      schemaVersion: "auto-apply-job-progress.v1",
      deviceId: "device-1",
      batchId: created.batchId,
      batchJobId: created.jobs[0]!.batchJobId,
      jobId: "job-1",
      sequence: 1,
      stage: "opening",
      message: "正在打开招聘页面",
      occurredAt: "2026-08-26T02:00:01.000Z"
    })).rejects.toThrow("进度序号未递增");
  });

  it("preserves an explicit batch pause when a live command reports late progress", async () => {
    const now = () => new Date("2026-08-26T02:30:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "pause-late-progress",
      request: request(["job-1", "job-2"])
    });
    await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const paused = await service.pause(created.batchId, { tenantId: "tenant-1", userId: "user-1" });
    const updated = await service.acceptCommandProgress(created.jobs[0]!.commandId!, {
      schemaVersion: "auto-apply-job-progress.v1",
      deviceId: "device-1",
      batchId: created.batchId,
      batchJobId: created.jobs[0]!.batchJobId,
      jobId: "job-1",
      sequence: 1,
      stage: "filling",
      message: "正在填写招聘表单",
      occurredAt: now().toISOString()
    });

    expect(updated).toMatchObject({
      status: "paused",
      pauseReason: "user_requested",
      jobs: [
        { status: "filling", progress: { sequence: 1 } },
        { status: "queued", attempt: 0 }
      ]
    });
    await expect(service.control(created.batchId, {
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    })).resolves.toMatchObject({ action: "pause" });
    expect(paused.status).toBe("paused");
  });

  it("adds a server-controlled shadow policy only for allowlisted adapters", async () => {
    const queue = new MemoryDeviceCommandQueue(() => new Date("2026-08-23T04:00:00.000Z"));
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      () => new Date("2026-08-23T04:00:00.000Z"),
      new DisabledAutoApplyCallbackDispatcher(),
      { mode: "shadow_v2", adapterCodes: ["moka.deepseek.v1"] }
    );
    await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "shadow-deepseek",
      request: request(["job-1"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    expect(claim?.command.payload).toMatchObject({
      runtimePolicy: { engine: "shadow_v2" }
    });
  });

  it("preserves AI Offer consent permission only for Xiaopeng's fixed privacy declaration", async () => {
    const queue = new MemoryDeviceCommandQueue(() => new Date("2026-08-23T04:00:00.000Z"));
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      () => new Date("2026-08-23T04:00:00.000Z")
    );
    const xiaopeng = request(["xiaopeng-job-1"]);
    xiaopeng.safety = { allowConsentClick: true };
    xiaopeng.jobs[0] = {
      ...xiaopeng.jobs[0]!,
      companyName: "小鹏汽车",
      applicationUrl: "https://xiaopeng.jobs.feishu.cn/index/resume/7627105760351177010/apply",
      adapterHint: "feishu.xiaopeng.v1",
      tags: ["application_access:login_required"]
    };
    await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "xiaopeng-fixed-consent",
      request: xiaopeng
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    expect(claim?.command.safety).toMatchObject({
      allowFinalSubmit: true,
      allowConsentClick: true,
      allowCaptchaHandling: true
    });
  });

  it("does not infer Xiaopeng consent permission when AI Offer omitted it", async () => {
    const queue = new MemoryDeviceCommandQueue(() => new Date("2026-08-23T04:00:00.000Z"));
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      () => new Date("2026-08-23T04:00:00.000Z")
    );
    const xiaopeng = request(["xiaopeng-job-no-consent"]);
    xiaopeng.jobs[0] = {
      ...xiaopeng.jobs[0]!,
      companyName: "小鹏汽车",
      applicationUrl: "https://xiaopeng.jobs.feishu.cn/index/resume/7627105760351177010/apply",
      adapterHint: "feishu.xiaopeng.v1"
    };
    await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "xiaopeng-no-consent-permission",
      request: xiaopeng
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    expect(claim?.command.safety.allowConsentClick).toBe(false);
  });

  it("serializes jobs, verifies the batch authorization and advances after a terminal result", async () => {
    let currentTime = new Date("2026-08-18T04:00:00.000Z");
    const now = () => currentTime;
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "batch-request-1",
      request: request()
    });

    expect(created.status).toBe("running");
    expect(created.jobs.map((job) => job.status)).toEqual(["preflight", "queued"]);
    const firstClaim = await queue.claim({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    });
    expect(firstClaim?.command.type).toBe("browser.execute_batch_auto_apply_job");
    expect(firstClaim?.command.requiresUserGesture).toBe(false);
    expect(firstClaim?.command.safety).toMatchObject({
      allowFinalSubmit: true,
      allowCaptchaHandling: true
    });
    const payload = firstClaim!.command.payload as Record<string, any>;
    expect(payload).not.toHaveProperty("aiSideConfirmation");
    expect(payload.batchAuthorization).toEqual(expect.any(String));
    expect(payload.job.tags).toEqual(["application_access:public"]);
    expect(payload.job).toMatchObject({
      locations: ["北京市"]
    });
    expect(payload.job.answers).toEqual({});
    const verification = await service.verifySubmissionAuthorization(String(payload.batchAuthorization), {
      batchId: created.batchId,
      batchJobId: created.jobs[0]!.batchJobId,
      commandId: firstClaim!.commandId,
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    });
    expect(verification.valid).toBe(true);
    await expect(service.verifySubmissionAuthorization(String(payload.batchAuthorization), {
      batchId: created.batchId,
      batchJobId: created.jobs[0]!.batchJobId,
      commandId: "stale-command-id",
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    })).resolves.toMatchObject({ valid: false, reason: "scope_mismatch" });
    currentTime = new Date(currentTime.getTime() + autoApplyExecutionDeadlineMs - 30_000);
    await queue.renew(firstClaim!.commandId, "device-1");
    await expect(service.verifySubmissionAuthorization(String(payload.batchAuthorization), {
      batchId: created.batchId,
      batchJobId: created.jobs[0]!.batchJobId,
      commandId: firstClaim!.commandId,
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    })).resolves.toMatchObject({ valid: false, reason: "insufficient_execution_window" });

    const event = {
      schemaVersion: "ai-plugin-event.v1" as const,
      type: "browser.batch_auto_apply_job_completed",
      status: "completed" as const,
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: "job-1",
          status: "succeeded",
          occurredAt: now().toISOString(),
          reasonCode: null,
          evidence: {
            screenshotRef: "evidence-1",
            redacted: true,
            pageUrl: "https://app.mokahr.com/success",
            siteConfirmation: "投递成功"
          }
        }
      }
    };
    await queue.complete(firstClaim!.commandId, "device-1", event);
    const afterFirst = await service.acceptCommandResult(firstClaim!.commandId, event);
    expect(afterFirst.jobs.map((job) => job.status)).toEqual(["succeeded", "preflight"]);

    const secondClaim = await queue.claim({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    });
    expect(secondClaim?.command.payload).toMatchObject({
      batchId: created.batchId,
      job: {
        jobId: "job-2",
        adapterCode: "moka.deepseek.v1",
        tags: ["application_access:login_required"]
      }
    });
  });

  it("rejects a confirmation whose displayed job set differs from the submitted jobs", async () => {
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      new MemoryDeviceCommandQueue(),
      "test-auto-apply-signing-secret-that-is-long-enough"
    );
    const invalid = request(["job-1"]);
    invalid.confirmation.displayedJobIds = ["another-job"];
    await expect(service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "invalid-confirmation",
      request: invalid
    })).rejects.toThrow("岗位集合");
  });

  it("rejects a batch without a resume attachment", async () => {
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      new MemoryDeviceCommandQueue(),
      "test-auto-apply-signing-secret-that-is-long-enough"
    );
    const invalid = request(["job-1"]);
    invalid.assets = [];
    await expect(service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "missing-resume",
      request: invalid
    })).rejects.toThrow("purpose=resume");
  });

  it("pauses on user verification and requeues the same job after resume", async () => {
    const now = () => new Date("2026-08-22T04:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "identity-verification-resume",
      request: request(["job-1"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const event = {
      schemaVersion: "ai-plugin-event.v1" as const,
      type: "browser.batch_auto_apply_job_completed",
      status: "completed" as const,
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: "job-1",
          status: "waiting_for_user_action",
          occurredAt: now().toISOString(),
          reasonCode: "identity_verification_required",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            userActionRequired: {
              type: "identity_verification",
              message: "请完成身份核验",
              resumeSupported: true
            }
          }
        }
      }
    };
    const paused = await service.acceptCommandResult(claim!.commandId, event);
    expect(paused.status).toBe("paused");
    expect(paused.jobs[0]).toMatchObject({
      status: "waiting_for_user_action",
      reasonCode: "identity_verification_required"
    });

    const resumed = await service.resume(created.batchId, { tenantId: "tenant-1", userId: "user-1" });
    expect(resumed.status).toBe("running");
    expect(resumed.jobs[0]).toMatchObject({ status: "preflight", reasonCode: null });
    expect(resumed.jobs[0]!.attempt).toBe(2);
  });

  it("preserves an active job when a user pauses and resumes the whole batch", async () => {
    const now = () => new Date("2026-08-26T00:30:00.000Z");
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      new MemoryDeviceCommandQueue(now),
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "manual-pause-resume",
      request: request(["job-1"])
    });

    const paused = await service.pause(created.batchId, { tenantId: "tenant-1", userId: "user-1" });
    expect(paused).toMatchObject({
      status: "paused",
      pauseReason: "user_requested",
      jobs: [{ status: "preflight", attempt: 1 }]
    });
    const resumed = await service.resume(created.batchId, { tenantId: "tenant-1", userId: "user-1" });
    expect(resumed).toMatchObject({
      status: "running",
      pauseReason: null,
      jobs: [{ status: "preflight", attempt: 1 }]
    });
  });

  it("records legacy login-wait responses as terminal failures and continues the batch", async () => {
    const now = () => new Date("2026-08-26T01:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "job-level-login-resume",
      request: request(["job-1", "job-2"])
    });
    const waitingEvent = (commandJobIndex: number, commandId: string) => ({
      commandId,
      event: {
        schemaVersion: "ai-plugin-event.v1" as const,
        type: "browser.batch_auto_apply_job_completed",
        status: "completed" as const,
        payload: {
          autoApplyResult: {
            schemaVersion: "auto-apply-job-result.v1" as const,
            batchId: created.batchId,
            batchJobId: created.jobs[commandJobIndex]!.batchJobId,
            jobId: created.jobs[commandJobIndex]!.jobId,
            status: "waiting_for_user_action" as const,
            occurredAt: now().toISOString(),
            reasonCode: "login_required",
            evidence: {
              screenshotRef: null,
              redacted: true as const,
              pageUrl: created.jobs[commandJobIndex]!.applicationUrl,
              siteConfirmation: null,
              userActionRequired: {
                type: "login" as const,
                message: "请完成招聘网站登录",
                resumeSupported: true as const
              }
            }
          }
        }
      }
    });

    const firstClaim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const firstWaiting = waitingEvent(0, firstClaim!.commandId);
    const afterFirstWait = await service.acceptCommandResult(firstWaiting.commandId, firstWaiting.event);
    expect(afterFirstWait.status).toBe("running");
    expect(afterFirstWait.jobs).toMatchObject([
      {
        status: "failed",
        reasonCode: "login_required",
        attempt: 1,
        evidence: {
          diagnostic: { code: "login_required", recommendedAction: "retry_job" }
        }
      },
      { status: "preflight", reasonCode: null, attempt: 1 }
    ]);

    const secondClaim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    expect(secondClaim?.command.payload).toMatchObject({
      batchJobId: created.jobs[1]!.batchJobId,
      job: { jobId: "job-2" }
    });
    const secondWaiting = waitingEvent(1, secondClaim!.commandId);
    const completed = await service.acceptCommandResult(secondWaiting.commandId, secondWaiting.event);
    expect(completed).toMatchObject({
      status: "completed_with_errors",
      pauseReason: null,
      jobs: [
        { status: "failed", reasonCode: "login_required" },
        { status: "failed", reasonCode: "login_required" }
      ]
    });
    expect(await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" })).toBeNull();
  });

  it("parks a CAPTCHA job without blocking the next queued job", async () => {
    const now = () => new Date("2026-09-01T00:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "legacy-captcha-wait",
      request: request(["job-1", "job-2"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const waiting = await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: created.jobs[0]!.jobId,
          status: "waiting_for_user_action",
          occurredAt: now().toISOString(),
          reasonCode: "captcha_required",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            userActionRequired: {
              type: "captcha",
              message: "请完成安全验证码",
              resumeSupported: true
            }
          }
        }
      }
    });

    expect(waiting).toMatchObject({
      status: "running",
      pauseReason: null,
      jobs: [
        {
          status: "waiting_for_user_action",
          reasonCode: "captcha_required",
          evidence: {
            userActionRequired: {
              type: "captcha",
              resumeSupported: true
            }
          }
        },
        { status: "preflight", attempt: 1 }
      ]
    });

    const nextClaim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    expect(nextClaim?.command.payload).toMatchObject({
      batchJobId: created.jobs[1]!.batchJobId,
      job: { jobId: "job-2" }
    });
  });

  it("parks a pending site receipt without blocking the next job and accepts late success", async () => {
    const now = () => new Date("2026-09-01T00:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "pending-site-receipt",
      request: request(["job-1", "job-2"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const waiting = await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: created.jobs[0]!.jobId,
          status: "waiting_for_site_receipt",
          occurredAt: now().toISOString(),
          reasonCode: "submission_receipt_pending",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: "已触发投递，正在后台等待招聘网站回执"
          }
        }
      }
    });

    expect(waiting).toMatchObject({
      status: "running",
      jobs: [
        { status: "waiting_for_site_receipt", commandId: null },
        { status: "preflight", attempt: 1 }
      ]
    });
    await expect(queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" }))
      .resolves.toMatchObject({ command: { payload: { job: { jobId: "job-2" } } } });

    const reconciled = await service.acceptBrowserState({
      batchId: waiting.batchId,
      batchJobId: waiting.jobs[0]!.batchJobId,
      jobId: waiting.jobs[0]!.jobId,
      outcome: "succeeded",
      pageUrl: waiting.jobs[0]!.applicationUrl,
      observedAt: "2026-09-01T00:00:30.000Z"
    }, { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });

    expect(reconciled).toMatchObject({
      status: "running",
      jobs: [
        { status: "succeeded", reasonCode: null },
        { status: "preflight" }
      ]
    });
  });

  it("hands late field rejection to the user without reclaiming the next job or losing correction requests", async () => {
    const now = () => new Date("2026-09-03T00:00:00.000Z");
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(new MemoryAutoApplyBatchRepository(), queue,
      "test-auto-apply-signing-secret-that-is-long-enough", now);
    const created = await service.create({ ...identity, idempotencyKey: "late-rejected",
      request: request(["job-1", "job-2"]) });
    const claim = await queue.claim(identity);
    const job = created.jobs[0]!;
    await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
      payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: created.batchId,
        batchJobId: job.batchJobId, jobId: job.jobId, status: "waiting_for_site_receipt",
        occurredAt: now().toISOString(), reasonCode: "submission_receipt_pending",
        evidence: { redacted: true, pageUrl: job.applicationUrl } } }
    });
    const nextClaim = await queue.claim(identity);
    expect(nextClaim?.command.payload).toMatchObject({ job: { jobId: "job-2" } });
    const requests = Array.from({ length: 55 }, (_, index) => ({
      schemaVersion: "required-field-request.v1", fieldId: `f-${index}`,
      stableFieldKey: `custom.${index}.native`, label: `题目${index}`, sectionKey: "custom", groupIndex: null,
      type: "text", controlKind: "native", required: true, reasonCode: "candidate_information_missing",
      description: "招聘网站校验：已有答案不合法", question: "请补充或更正", options: []
    }));
    const input = { batchId: created.batchId, batchJobId: job.batchJobId, jobId: job.jobId,
      outcome: "site_validation_rejected" as const, pageUrl: job.applicationUrl, commandId: claim!.commandId,
      observedAt: "2026-09-03T00:00:40.000Z", requiredFieldRequests: requests };
    await expect(service.acceptBrowserState({ ...input, requiredFieldRequests: [] }, identity))
      .rejects.toThrow("缺少结构化补充请求");
    await expect(service.acceptBrowserState({ ...input, commandId: "older-attempt" }, identity))
      .rejects.toThrow("不属于当前提交命令");
    const waiting = await service.acceptBrowserState(input, identity);
    expect(waiting.jobs[0]).toMatchObject({ status: "waiting_for_user_action", reasonCode: "missing_information",
      commandId: null, evidence: { requiredFieldRequests: requests } });
    expect(waiting.jobs[1]?.commandId).toBe(nextClaim!.commandId);
    expect((await service.acceptBrowserState(input, identity)).revision).toBe(waiting.revision);
    // The receipt deadline cannot overwrite an already reported correction request.
    await expect(service.acceptBrowserState({ ...input, outcome: "submission_receipt_timeout" }, identity))
      .rejects.toThrow("人工等待状态不匹配");
    const resumed = await service.provideRequiredFieldAnswers(created.batchId, job.batchJobId, {
      schemaVersion: "required-field-answers.v1",
      answers: requests.map(request => ({ fieldId: request.fieldId, stableFieldKey: request.stableFieldKey,
        value: "用户已更正", source: "user_confirmed", answeredAt: now().toISOString() }))
    }, identity);
    expect(resumed.jobs[0]?.requiredFieldAnswers).toHaveLength(55);
    expect(resumed.jobs[1]?.commandId).toBe(nextClaim!.commandId);
  });

  it.each([
    {
      label: "the user closes the monitored tab",
      outcome: "submission_receipt_tab_closed" as const,
      reasonCode: "submission_receipt_tab_closed",
      recommendedAction: "retry_job"
    },
    {
      label: "the passive receipt deadline expires",
      outcome: "submission_receipt_timeout" as const,
      reasonCode: "site_success_not_observed",
      recommendedAction: "inspect_evidence"
    }
  ])("fails a pending site receipt when $label", async ({ outcome, reasonCode, recommendedAction }) => {
    const now = () => new Date("2026-09-01T00:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: `pending-site-receipt-${outcome}`,
      request: request(["job-1"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const waiting = await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: created.jobs[0]!.jobId,
          status: "waiting_for_site_receipt",
          occurredAt: now().toISOString(),
          reasonCode: "submission_receipt_pending",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: "已触发投递，正在后台等待招聘网站回执"
          }
        }
      }
    });

    await expect(service.acceptBrowserState({
      batchId: waiting.batchId,
      batchJobId: waiting.jobs[0]!.batchJobId,
      jobId: waiting.jobs[0]!.jobId,
      outcome: "captcha_tab_closed",
      pageUrl: waiting.jobs[0]!.applicationUrl,
      observedAt: "2026-09-01T00:00:30.000Z"
    }, { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" }))
      .rejects.toThrow("验证码关闭结果与当前站点回执状态不匹配");

    const failed = await service.acceptBrowserState({
      batchId: waiting.batchId,
      batchJobId: waiting.jobs[0]!.batchJobId,
      jobId: waiting.jobs[0]!.jobId,
      outcome,
      pageUrl: waiting.jobs[0]!.applicationUrl,
      observedAt: "2026-09-01T00:02:00.000Z"
    }, { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });

    expect(failed).toMatchObject({
      status: "completed_with_errors",
      jobs: [{
        status: "failed",
        reasonCode,
        evidence: {
          diagnostic: { code: reasonCode, recommendedAction },
          failureDetails: { outcome }
        }
      }]
    });
  });

  it("fails and releases the exact active command when its submitted tab closes", async () => {
    const now = () => new Date("2026-09-03T12:00:00.000Z");
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      ...identity,
      idempotencyKey: "active-submission-tab-closed",
      request: request(["job-1", "job-2"])
    });
    const firstClaim = await queue.claim(identity);
    const firstJob = created.jobs[0]!;
    const browserState = {
      batchId: created.batchId,
      batchJobId: firstJob.batchJobId,
      jobId: firstJob.jobId,
      outcome: "submission_active_tab_closed" as const,
      pageUrl: firstJob.applicationUrl,
      observedAt: now().toISOString()
    };

    await expect(service.acceptBrowserState({
      ...browserState,
      commandId: "another-command"
    }, identity)).rejects.toThrow("不属于当前提交命令");

    const advanced = await service.acceptBrowserState({
      ...browserState,
      commandId: firstClaim!.commandId
    }, identity);

    expect(advanced).toMatchObject({
      status: "running",
      jobs: [
        {
          status: "failed",
          commandId: null,
          reasonCode: "submission_outcome_unknown",
          evidence: {
            diagnostic: {
              code: "submission_outcome_unknown",
              recommendedAction: "inspect_evidence"
            },
            failureDetails: { outcome: "submission_active_tab_closed" }
          }
        },
        { status: "preflight" }
      ]
    });
    await expect(queue.get(firstClaim!.commandId)).resolves.toMatchObject({ status: "expired" });
    await expect(queue.claim(identity)).resolves.toMatchObject({
      command: { payload: { job: { jobId: "job-2" } } }
    });
  });

  it("fails only the waiting CAPTCHA job when the user closes its persisted tab", async () => {
    const now = () => new Date("2026-09-01T00:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "captcha-tab-closed",
      request: request(["job-1"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const waiting = await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: created.jobs[0]!.jobId,
          status: "waiting_for_user_action",
          occurredAt: now().toISOString(),
          reasonCode: "captcha_required",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            userActionRequired: {
              type: "captcha",
              message: "请完成安全验证码",
              resumeSupported: true
            }
          }
        }
      }
    });

    const failed = await service.acceptBrowserState({
      batchId: waiting.batchId,
      batchJobId: waiting.jobs[0]!.batchJobId,
      jobId: waiting.jobs[0]!.jobId,
      outcome: "captcha_tab_closed",
      pageUrl: waiting.jobs[0]!.applicationUrl,
      observedAt: "2026-09-01T00:01:00.000Z"
    }, { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });

    expect(failed).toMatchObject({
      status: "completed_with_errors",
      jobs: [{
        status: "failed",
        reasonCode: "captcha_tab_closed",
        evidence: {
          siteConfirmation: null,
          diagnostic: {
            code: "captcha_tab_closed",
            recommendedAction: "retry_job"
          },
          failureDetails: {
            reconciledFromPersistentTab: true,
            outcome: "captcha_tab_closed"
          }
        }
      }]
    });
  });

  it("does not let a later close event overwrite an accepted CAPTCHA success", async () => {
    const now = () => new Date("2026-09-01T00:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "captcha-success-close-race",
      request: request(["job-1"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const waiting = await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: created.jobs[0]!.jobId,
          status: "waiting_for_user_action",
          occurredAt: now().toISOString(),
          reasonCode: "captcha_required",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            userActionRequired: {
              type: "captcha",
              message: "请完成安全验证码",
              resumeSupported: true
            }
          }
        }
      }
    });
    const browserStateBase = {
      batchId: waiting.batchId,
      batchJobId: waiting.jobs[0]!.batchJobId,
      jobId: waiting.jobs[0]!.jobId,
      pageUrl: waiting.jobs[0]!.applicationUrl
    };

    await Promise.all([
      service.acceptBrowserState({
        ...browserStateBase,
        outcome: "succeeded",
        observedAt: "2026-09-01T00:01:00.000Z"
      }, { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" }),
      service.acceptBrowserState({
        ...browserStateBase,
        outcome: "captcha_tab_closed",
        observedAt: "2026-09-01T00:01:00.001Z"
      }, { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" })
    ]);

    expect(await service.get(waiting.batchId, { tenantId: "tenant-1", userId: "user-1" })).toMatchObject({
      status: "completed",
      jobs: [{ status: "succeeded", reasonCode: null }]
    });
  });

  it("ends a CAPTCHA wait when the site reports an application-frequency limit", async () => {
    const now = () => new Date("2026-09-05T14:00:00.000Z");
    const identity = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" };
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      ...identity,
      idempotencyKey: "post-captcha-site-application-limit",
      request: request(["job-1"])
    });
    const claim = await queue.claim(identity);
    const waiting = await service.acceptCommandResult(claim!.commandId, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.batch_auto_apply_job_completed",
      status: "completed",
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: created.jobs[0]!.jobId,
          status: "waiting_for_user_action",
          occurredAt: now().toISOString(),
          reasonCode: "captcha_required",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            userActionRequired: { type: "captcha", message: "请完成滑块", resumeSupported: true }
          }
        }
      }
    });
    const base = {
      batchId: waiting.batchId,
      batchJobId: waiting.jobs[0]!.batchJobId,
      jobId: waiting.jobs[0]!.jobId,
      outcome: "site_application_limit_reached" as const,
      pageUrl: waiting.jobs[0]!.applicationUrl,
      observedAt: "2026-09-05T14:00:30.000Z",
      siteMessage: "这6个月投递太多岗位，请耐心等待"
    };

    await expect(service.acceptBrowserState(base, identity))
      .rejects.toThrow("不属于当前提交命令");
    await expect(service.acceptBrowserState({ ...base, commandId: claim!.commandId, siteMessage: "" }, identity))
      .rejects.toThrow("缺少可见提示");

    const failed = await service.acceptBrowserState({
      ...base,
      commandId: claim!.commandId
    }, identity);
    expect(failed).toMatchObject({
      status: "completed_with_errors",
      jobs: [{
        status: "failed",
        reasonCode: "site_application_limit_reached",
        receiptCommandId: undefined,
        evidence: {
          siteConfirmation: "这6个月投递太多岗位，请耐心等待",
          diagnostic: {
            code: "site_application_limit_reached",
            retryable: false,
            recommendedAction: "inspect_evidence"
          },
          failureDetails: {
            reconciledFromPersistentTab: true,
            outcome: "site_application_limit_reached"
          }
        }
      }]
    });
  });

  it("returns missing required fields without retrying an unchanged candidate package", async () => {
    const now = () => new Date("2026-08-25T04:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "missing-required-fields",
      request: request(["job-1"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const requiredFieldRequest = {
      schemaVersion: "required-field-request.v1" as const,
      fieldId: "gender",
      stableFieldKey: "basic.gender.combobox",
      label: "个人信息 · 性别",
      sectionKey: "basic",
      groupIndex: null,
      type: "combobox",
      controlKind: "combobox",
      required: true as const,
      reasonCode: "candidate_information_missing" as const,
      description: "该字段必须使用页面有效选项，请向用户确认。",
      question: "请选择性别。",
      options: ["男", "女"]
    };
    const event = {
      schemaVersion: "ai-plugin-event.v1" as const,
      type: "browser.batch_auto_apply_job_completed",
      status: "completed" as const,
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1" as const,
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: "job-1",
          status: "waiting_for_user_action" as const,
          occurredAt: now().toISOString(),
          reasonCode: "missing_information",
          evidence: {
            screenshotRef: null,
            redacted: true as const,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            missingFields: ["个人信息 · 性别"],
            requiredFieldRequests: [requiredFieldRequest]
          }
        }
      }
    };

    const paused = await service.acceptCommandResult(claim!.commandId, event);

    expect(paused.status).toBe("paused");
    expect(paused.jobs[0]).toMatchObject({
      status: "waiting_for_user_action",
      attempt: 1,
      reasonCode: "missing_information",
      evidence: { requiredFieldRequests: [requiredFieldRequest] }
    });
    expect(await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" })).toBeNull();

    await expect(service.resume(created.batchId, {
      tenantId: "tenant-1",
      userId: "user-1"
    })).rejects.toThrow("请先提交 required-field-answers");
    await expect(service.provideRequiredFieldAnswers(
      created.batchId,
      created.jobs[0]!.batchJobId,
      {
        schemaVersion: "required-field-answers.v1",
        answers: [{
          fieldId: "gender",
          stableFieldKey: "basic.gender.combobox",
          value: "其他",
          source: "user_confirmed",
          answeredAt: "2026-08-25T06:00:00.000Z"
        }]
      },
      { tenantId: "tenant-1", userId: "user-1" }
    )).rejects.toThrow("答案不在页面选项中");

    const answerPayload = {
      schemaVersion: "required-field-answers.v1" as const,
      answers: [{
        fieldId: "gender",
        stableFieldKey: "basic.gender.combobox",
        value: "女",
        source: "user_confirmed" as const,
        answeredAt: "2026-08-25T06:00:00.000Z"
      }]
    };
    const resumed = await service.provideRequiredFieldAnswers(
      created.batchId,
      created.jobs[0]!.batchJobId,
      answerPayload,
      { tenantId: "tenant-1", userId: "user-1" }
    );
    expect(resumed).toMatchObject({
      batchId: created.batchId,
      status: "running",
      jobs: [{
        batchJobId: created.jobs[0]!.batchJobId,
        status: "preflight",
        attempt: 2,
        requiredFieldAnswers: answerPayload.answers
      }]
    });
    const resumedClaim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    expect(resumedClaim?.command.payload).toMatchObject({
      batchId: created.batchId,
      batchJobId: created.jobs[0]!.batchJobId,
      job: { requiredFieldAnswers: answerPayload.answers }
    });
    const repeated = await service.provideRequiredFieldAnswers(
      created.batchId,
      created.jobs[0]!.batchJobId,
      answerPayload,
      { tenantId: "tenant-1", userId: "user-1" }
    );
    expect(repeated.jobs[0]!.attempt).toBe(2);
    await service.acceptCommandResult(resumedClaim!.commandId, event);
    const confirmedAgain = await service.provideRequiredFieldAnswers(
      created.batchId,
      created.jobs[0]!.batchJobId,
      answerPayload,
      { tenantId: "tenant-1", userId: "user-1" }
    );
    expect(confirmedAgain.jobs[0]).toMatchObject({ status: "preflight", attempt: 3 });
    expect((await service.provideRequiredFieldAnswers(created.batchId, created.jobs[0]!.batchJobId,
      answerPayload, { tenantId: "tenant-1", userId: "user-1" })).jobs[0]?.attempt).toBe(3);
  });

  it("reconciles the same persisted browser tab after a human completes CAPTCHA", async () => {
    const now = () => new Date("2026-08-22T04:00:00.000Z");
    const queue = new MemoryDeviceCommandQueue(now);
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      now
    );
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "captcha-persistent-tab",
      request: request(["job-1"])
    });
    const claim = await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });
    const waitingEvent = {
      schemaVersion: "ai-plugin-event.v1" as const,
      type: "browser.batch_auto_apply_job_completed",
      status: "completed" as const,
      payload: {
        autoApplyResult: {
          schemaVersion: "auto-apply-job-result.v1",
          batchId: created.batchId,
          batchJobId: created.jobs[0]!.batchJobId,
          jobId: "job-1",
          status: "waiting_for_user_action",
          occurredAt: now().toISOString(),
          reasonCode: "captcha_required",
          evidence: {
            screenshotRef: null,
            redacted: true,
            pageUrl: created.jobs[0]!.applicationUrl,
            siteConfirmation: null,
            userActionRequired: {
              type: "captcha",
              message: "请完成安全验证码",
              resumeSupported: true
            }
          }
        }
      }
    };
    const paused = await service.acceptCommandResult(claim!.commandId, waitingEvent);
    const reconciled = await service.acceptBrowserState({
      batchId: paused.batchId,
      batchJobId: paused.jobs[0]!.batchJobId,
      jobId: paused.jobs[0]!.jobId,
      outcome: "already_applied",
      pageUrl: paused.jobs[0]!.applicationUrl,
      observedAt: "2026-08-22T04:01:00.000Z"
    }, { tenantId: "tenant-1", userId: "user-1", deviceId: "device-1" });

    expect(reconciled.status).toBe("completed");
    expect(reconciled.jobs[0]).toMatchObject({
      status: "succeeded",
      reasonCode: "already_applied",
      evidence: {
        siteConfirmation: "招聘网站提示重复申请/已经投递",
        failureDetails: {
          reconciledFromPersistentTab: true,
          outcome: "already_applied"
        }
      }
    });
  });

  it("does not infer a candidate preferred city from one or more job locations", async () => {
    const queue = new MemoryDeviceCommandQueue(() => new Date("2026-08-23T04:00:00.000Z"));
    const service = new AutoApplyService(
      new MemoryAutoApplyBatchRepository(),
      queue,
      "test-auto-apply-signing-secret-that-is-long-enough",
      () => new Date("2026-08-23T04:00:00.000Z")
    );
    const missing = request(["job-1"]);
    missing.jobs[0]!.locations = ["北京市", "杭州市"];
    const withoutCandidatePreference = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "multi-city-missing",
      request: missing
    });
    expect(withoutCandidatePreference.jobs[0]?.answers).toEqual({});

    const selected = request(["job-1"]);
    selected.jobs[0]!.locations = ["北京市", "杭州市"];
    selected.jobs[0]!.answers = {
      preferredCity: {
        value: "北京",
        source: "user_confirmed" as const,
        confirmedAt: "2026-08-23T03:59:00.000Z"
      }
    };
    const created = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "multi-city-selected",
      request: selected
    });
    expect(created.jobs[0]?.answers?.preferredCity).toEqual({
      value: "北京",
      source: "user_confirmed",
      confirmedAt: "2026-08-23T03:59:00.000Z"
    });

    const legacy = request(["job-1"]);
    legacy.jobs[0]!.locations = ["上海市"];
    legacy.jobs[0]!.answers = {
      preferredCity: {
        value: "上海市",
        source: "confirmed_single_job_location" as const,
        confirmedAt: "2026-08-23T03:59:00.000Z"
      }
    };
    const legacyCreated = await service.create({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1",
      idempotencyKey: "legacy-single-location",
      request: legacy
    });
    expect(legacyCreated.jobs[0]?.answers).toEqual({});
  });

  it("archives the incident's orphan claimed receipt after the terminal batch lost its pointer", async () => {
    let timestamp = new Date("2026-09-10T06:59:44.000Z");
    const { repository, queue, service, identity } = receiptFixture(() => timestamp);
    const batch = await service.create({ ...identity, idempotencyKey: "orphan-claimed", request: request(["job-1"]) });
    const command = (await queue.claim(identity))!;
    const terminal = await repository.save({ ...batch, status: "completed_with_errors", revision: batch.revision + 1,
      jobs: batch.jobs.map(job => ({ ...job, status: "failed", commandId: null,
        reasonCode: "command_delivery_timeout", completedAt: timestamp.toISOString() })) });
    timestamp = new Date("2026-09-10T09:18:00.000Z");
    const event = successReceipt(batch);
    await expect(service.completeCommandResult(command.commandId, identity.deviceId, event)).resolves.toEqual(terminal);
    expect(await queue.get(command.commandId)).toMatchObject({ status: "expired", archivedCompletionEvent: event });
    await expect(service.completeCommandResult(command.commandId, identity.deviceId, event)).resolves.toEqual(terminal);
    expect(await repository.get(batch.batchId)).toEqual(terminal);
  });

  it("archives a stale claim without overwriting a confirmed success or another attempt", async () => {
    const { repository, queue, service, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "stale-claim-success", request: request(["job-1"]) });
    const command = (await queue.claim(identity))!;
    const terminal = await repository.save({ ...batch, status: "completed", revision: batch.revision + 1,
      jobs: batch.jobs.map(job => ({ ...job, status: "succeeded", commandId: "new-attempt-command" })) });
    const event = successReceipt(batch);
    (event.payload!.autoApplyResult as Record<string, unknown>).status = "failed";
    await expect(service.completeCommandResult(command.commandId, identity.deviceId, event)).resolves.toEqual(terminal);
    expect(await queue.get(command.commandId)).toMatchObject({ status: "expired", archivedCompletionEvent: event });
    expect(await repository.get(batch.batchId)).toEqual(terminal);
  });

  it("rejects a forged stale receipt before expiring or archiving the actual command", async () => {
    const { queue, service, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "forged-stale", request: request() });
    const command = (await queue.claim(identity))!;
    const event = successReceipt(batch);
    (event.payload!.autoApplyResult as Record<string, unknown>).batchJobId = batch.jobs[1]!.batchJobId;
    (event.payload!.autoApplyResult as Record<string, unknown>).jobId = batch.jobs[1]!.jobId;
    await expect(service.completeCommandResult(command.commandId, identity.deviceId, event)).rejects.toThrow("原设备命令");
    expect(await queue.get(command.commandId)).toMatchObject({ status: "claimed" });
    expect((await queue.get(command.commandId))!.archivedCompletionEvent).toBeUndefined();
  });

  it("acknowledges a cancelled owner's late receipt without reviving the cancelled batch", async () => {
    const { queue, service, identity } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "cancelled-receipt", request: request(["job-1"]) });
    const command = (await queue.claim(identity))!;
    await service.terminateOwner(identity);
    const cancelled = await service.get(batch.batchId);
    const event = successReceipt(batch);
    await expect(service.completeCommandResult(command.commandId, identity.deviceId, event)).resolves.toEqual(cancelled);
    expect(await queue.get(command.commandId)).toMatchObject({ status: "cancelled", archivedCompletionEvent: event });
    await expect(service.completeCommandResult(command.commandId, identity.deviceId, event)).resolves.toEqual(cancelled);
    expect(await service.get(batch.batchId)).toEqual(cancelled);
  });

  it("requires a live lease for final submission even before the execution deadline", async () => {
    let timestamp = new Date("2026-09-10T06:00:00.000Z");
    const { queue, service, identity } = receiptFixture(() => timestamp);
    const batch = await service.create({ ...identity, idempotencyKey: "expired-lease", request: request(["job-1"]) });
    const command = (await queue.claim({ ...identity, leaseSeconds: 45 }))!;
    timestamp = new Date(timestamp.getTime() + 45_000);
    expect(await service.verifySubmissionAuthorization(String(command.command.payload!.batchAuthorization), {
      ...identity, batchId: batch.batchId, batchJobId: batch.jobs[0]!.batchJobId, commandId: command.commandId
    })).toMatchObject({ valid: false, reason: "command_not_active" });
  });

  it("rechecks the durable stop fence before persisting progress", async () => {
    const { queue, service, identity, now } = receiptFixture();
    const batch = await service.create({ ...identity, idempotencyKey: "progress-stop-race", request: request(["job-1"]) });
    const command = (await queue.claim(identity))!;
    await queue.cancelQueued(command.commandId, identity.tenantId, identity.userId, identity.deviceId);
    await expect(service.acceptCommandProgress(command.commandId, {
      schemaVersion: "auto-apply-job-progress.v1", ...identity, batchId: batch.batchId,
      batchJobId: batch.jobs[0]!.batchJobId, jobId: "job-1", sequence: 1, stage: "submitting",
      message: "late progress", occurredAt: now().toISOString()
    })).rejects.toThrow("正在停止");
    expect((await service.get(batch.batchId)).jobs[0]!.progress).toBeUndefined();
  });

  it("independently expires a lost execution and starts a different job only on the next authenticated pull", async () => {
    let timestamp = new Date("2026-09-10T06:00:00.000Z");
    let online = false;
    const { queue, repository, identity, now } = receiptFixture(() => timestamp);
    const commandIds: string[] = [];
    const enqueue = queue.enqueue.bind(queue);
    vi.spyOn(queue, "enqueue").mockImplementation(async command => {
      const item = await enqueue(command); commandIds.push(item.commandId); return item;
    });
    const allCommands = async () => (await Promise.all(commandIds.map(id => queue.get(id)))).map(item => item!);
    Object.assign(queue, {
      listByDevice: async () => { throw new Error("Scheduling must not read completed command history"); },
      listActiveByDevice: async () => (await allCommands()).filter(item => ["queued", "claimed"].includes(item.status)),
      listExpired: async () => (await allCommands()).filter(item => ["queued", "claimed"].includes(item.status) &&
        Date.parse(item.claimedAt ? item.executionExpiresAt! : item.command.expiresAt) <= timestamp.getTime())
    });
    Object.assign(repository, { listSchedulingOwners: async () => [identity] });
    const persistence: AutoApplyPersistence = {
      transaction: async (_key, work) => work(),
      ownerFence: { isTerminated: async () => false, terminate: async () => undefined, clear: async () => undefined },
      callbackOutbox: { enqueue: async () => undefined }, canDispatch: async () => online, dispatchOnClaim: true
    };
    const service = new AutoApplyService(repository, queue, "test-auto-apply-signing-secret-that-is-long-enough", now,
      undefined, undefined, persistence);
    const batch = await service.create({ ...identity, idempotencyKey: "persistent-recovery", request: request() });
    expect(batch.jobs.map(job => job.status)).toEqual(["queued", "queued"]);
    await service.reconcileExpiredBatches();
    expect(commandIds).toHaveLength(0);
    online = true;
    await service.reconcileExpiredBatches();
    expect(commandIds).toHaveLength(0);
    await service.recoverDeviceQueue(identity, { dispatch: true });
    const running = await service.get(batch.batchId);
    const command = (await queue.claim(identity))!;
    expect(running.jobs[0]!.status).toBe("preflight");
    timestamp = new Date(timestamp.getTime() + autoApplyExecutionDeadlineMs);
    await service.reconcileExpiredBatches();
    expect((await service.get(batch.batchId)).jobs).toMatchObject([
      { status: "failed", reasonCode: "task_execution_timeout" }, { status: "queued", attempt: 0, commandId: null }
    ]);
    expect(await service.verifySubmissionAuthorization(String(command.command.payload!.batchAuthorization), {
      ...identity, batchId: batch.batchId, batchJobId: running.jobs[0]!.batchJobId, commandId: command.commandId
    })).toMatchObject({ valid: false });
    await expect(queue.renew(command.commandId, identity.deviceId)).rejects.toThrow();
    await expect(service.acceptCommandProgress(command.commandId, {
      schemaVersion: "auto-apply-job-progress.v1", ...identity, batchId: batch.batchId,
      batchJobId: running.jobs[0]!.batchJobId, jobId: "job-1", sequence: 1, stage: "submitting",
      message: "late process resumed", occurredAt: timestamp.toISOString()
    })).rejects.toThrow();
    timestamp = new Date(timestamp.getTime() + 10 * 60_000);
    await service.reconcileExpiredBatches();
    expect(commandIds).toHaveLength(1);
    // Even if the old receipt was lost with the Worker, another job can proceed
    // after the old execution is fenced; the ambiguous job is never retried.
    await service.recoverDeviceQueue(identity, { dispatch: true });
    expect((await service.get(batch.batchId)).jobs).toMatchObject([
      { status: "failed", reasonCode: "task_execution_timeout", attempt: 1 }, { status: "preflight", attempt: 1 }
    ]);
    expect(commandIds).toHaveLength(2);
    const afterPull = await service.get(batch.batchId);
    await service.completeCommandResult(command.commandId, identity.deviceId, successReceipt(running));
    expect(await service.get(batch.batchId)).toEqual(afterPull);
    expect((await queue.get(command.commandId))!.archivedCompletionEvent).toBeDefined();
  });

  it("joins queue and batch writes in the owner transaction and enqueues callbacks without HTTP", async () => {
    const { queue, repository, identity, now } = receiptFixture();
    let inTransaction = false;
    const fences = new Set<string>();
    const enqueueCallback = vi.fn(async () => { expect(inTransaction).toBe(true); });
    const persistence: AutoApplyPersistence = {
      transaction: async (_key, work) => { inTransaction = true; try { return await work(); } finally { inTransaction = false; } },
      ownerFence: { isTerminated: async key => fences.has(key), terminate: async key => { fences.add(key); }, clear: async key => { fences.delete(key); } },
      callbackOutbox: { enqueue: enqueueCallback }
    };
    const save = repository.save.bind(repository);
    vi.spyOn(repository, "save").mockImplementation(async batch => { expect(inTransaction).toBe(true); return save(batch); });
    const enqueue = queue.enqueue.bind(queue);
    vi.spyOn(queue, "enqueue").mockImplementation(async command => { expect(inTransaction).toBe(true); return enqueue(command); });
    const deliver = vi.fn(async () => { throw new Error("HTTP must run outside the service transaction"); });
    const service = new AutoApplyService(repository, queue, "test-auto-apply-signing-secret-that-is-long-enough", now,
      { validate: () => undefined, deliver }, { mode: "legacy", adapterCodes: [] }, persistence);
    const batch = await service.create({ ...identity, idempotencyKey: "transaction-callback", request: {
      ...request(["job-1"]), callback: { url: "https://callback.example.com/result", secretRef: "test" }
    } });
    const command = (await queue.claim(identity))!;
    const completed = await service.completeCommandResult(command.commandId, identity.deviceId, successReceipt(batch));
    expect(completed.status).toBe("completed");
    expect(enqueueCallback).toHaveBeenCalledOnce();
    expect(deliver).not.toHaveBeenCalled();
    await service.terminateOwner(identity);
    const secondService = new AutoApplyService(repository, queue, "test-auto-apply-signing-secret-that-is-long-enough", now,
      undefined, undefined, persistence);
    await expect(secondService.create({ ...identity, idempotencyKey: "after-logout", request: request() })).rejects.toThrow("会话已终止");
    await secondService.activateOwner(identity);
    await expect(secondService.create({ ...identity, idempotencyKey: "after-rebind", request: request() })).resolves.toMatchObject({ status: "running" });
  });
});

describe("DeepSeek site adapter", () => {
  it("only accepts the DeepSeek Moka organization and apply route", () => {
    expect(matchSiteAdapter(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply"
    )).toMatchObject({ supported: true, knownNoLogin: true, adapterCode: "moka.deepseek.v1" });
    expect(matchSiteAdapter(
      "https://app.mokahr.com/social-recruitment/another/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply"
    )).toMatchObject({ supported: true, knownNoLogin: false, adapterCode: "moka.v2" });
    expect(matchSiteAdapter(
      "https://app.mokahr.com/social-recruitment/another/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply",
      "moka.deepseek.v1"
    )).toMatchObject({ supported: true, adapterCode: "moka.v2", supportLevel: "specialized" });
    expect(matchSiteAdapter("https://example.com/apply")).toMatchObject({
      supported: true,
      adapterCode: "generic.web.v1",
      supportLevel: "adaptive"
    });
  });

  it("matches Moka social and campus tenants without stealing the stable DeepSeek route", () => {
    expect(matchSiteAdapter(
      "https://app.mokahr.com/social-recruitment/bshg/140686#/job/a871a3d5-67a3-4dc9-aa18-f993166dbda9/apply"
    )).toMatchObject({ supported: true, knownNoLogin: false, adapterCode: "moka.v2" });
    expect(matchSiteAdapter(
      "https://app.mokahr.com/campus-recruitment/mbcloud/150116#/job/a989fb77-19c3-4667-b7be-e5a7c8eabd19/apply"
    )).toMatchObject({ supported: true, knownNoLogin: false, adapterCode: "moka.v2" });
    expect(matchSiteAdapter(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/apply"
    )).toMatchObject({ supported: true, knownNoLogin: true, adapterCode: "moka.deepseek.v1" });
    expect(matchSiteAdapter(
      "https://app.mokahr.com/campus-recruitment/mbcloud/150116#/job/a989fb77-19c3-4667-b7be-e5a7c8eabd19"
    )).toMatchObject({ supported: true, adapterCode: "generic.web.v1", supportLevel: "adaptive" });
  });

  it("routes valid unknown recruiting pages through the generic adaptive runtime", () => {
    expect(matchSiteAdapter(
      "https://li.jobs.feishu.cn/index/position/detail/7670055787163814170"
    )).toMatchObject({
      supported: true,
      knownNoLogin: false,
      adapterCode: "generic.web.v1",
      supportLevel: "adaptive",
      reason: null
    });
    expect(matchSiteAdapter("file:///tmp/apply.html")).toMatchObject({
      supported: false,
      reason: "unsupported_application_protocol"
    });
  });

  it("recognizes Xiaopeng Feishu apply routes as login-capable adapters", () => {
    expect(matchSiteAdapter(
      "https://xiaopeng.jobs.feishu.cn/index/resume/7627105760351177010/applyv"
    )).toMatchObject({ supported: true, knownNoLogin: false, adapterCode: "feishu.xiaopeng.v1" });
  });
it("carries job-bound exact option arrays through creation, persistence, idempotency and the device command",async()=>{
  const now=()=>new Date("2026-09-08T04:00:00.000Z");
  const queue=new MemoryDeviceCommandQueue(now);
  const repository=new MemoryAutoApplyBatchRepository();
  const service=new AutoApplyService(repository,queue,"test-auto-apply-signing-secret-that-is-long-enough",now);
  const identity={tenantId:"tenant-1",userId:"user-1",deviceId:"device-1"};
  const base=request(["job-1"]);
  const answer={fieldId:"multi",stableFieldKey:"other.custom.combobox",value:["🚀发展空间（内部创业）","\u200b🤝扁平化（不叫哥、姐、总）"],source:"user_confirmed" as const,answeredAt:"2026-09-08T04:00:00.000Z"};
  const input={...base,jobs:base.jobs.map(job=>({...job,requiredFieldAnswers:[answer]}))};
  const created=await service.create({...identity,idempotencyKey:"exact-option-set",request:input});
  expect((await service.get(created.batchId,identity)).jobs[0]).toMatchObject({requiredFieldAnswers:[answer],initialRequiredFieldAnswers:[answer]});
  expect((await queue.claim(identity))?.command.payload).toMatchObject({job:{jobId:"job-1",requiredFieldAnswers:[answer]}});
  expect((await service.create({...identity,idempotencyKey:"exact-option-set",request:input})).batchId).toBe(created.batchId);
  await expect(service.create({...identity,idempotencyKey:"exact-option-set",request:{...input,jobs:input.jobs.map(job=>({...job,requiredFieldAnswers:[{...answer,value:[answer.value[0]!]}]}))}})).rejects.toThrow();
  expect(await queue.claim(identity)).toBeNull();
});

});

it('updates only never-started queued jobs and ignores stale profile deliveries', async () => {
  const repository=new MemoryAutoApplyBatchRepository();
  const queue=new MemoryDeviceCommandQueue();
  const now=()=>new Date('2026-08-18T04:01:00.000Z');
  const service=new AutoApplyService(repository,queue,'secret'.repeat(8),now);
  const owner={tenantId:'tenant-1',userId:'user-1'};
  const batch=await service.create({...owner,deviceId:'device-1',idempotencyKey:'profile-update-test',request:request()});
  const before=structuredClone(batch);
  const profile={...batch.candidate.applicationProfile,sequence:2,revision:'d'.repeat(64),overrides:[{semanticKey:'candidate.gender',value:'女'}]};
  await expect(service.updateCandidateProfile({sequence:2,profile},owner,async()=>false)).rejects.toThrow("信息合并");
  expect((await service.get(batch.batchId,owner)).jobs).toEqual(before.jobs);
  expect(await service.updateCandidateProfile({sequence:2,profile},owner)).toEqual({updatedJobs:1});
  const updated=await service.get(batch.batchId,owner);
  expect(updated.candidate).toEqual(before.candidate);
  expect(updated.jobs[0]).toEqual(before.jobs[0]);
  expect(updated.jobs[1]?.candidateProfile).toEqual(profile);
  expect(await service.updateCandidateProfile({sequence:1,profile:{...profile,sequence:1}},owner)).toEqual({updatedJobs:0});
  expect(await service.updateCandidateProfile({sequence:2,profile},owner)).toEqual({updatedJobs:0});
  expect(await service.updateCandidateProfile({sequence:3,profile:{...profile,sequence:3}},{...owner,userId:'other'})).toEqual({updatedJobs:0});
  await repository.save({...updated,jobs:updated.jobs.map(job=>job.status==='queued'?{...job,stopRequest:{requestId:'stop-request',requestedAt:now().toISOString(),commandId:null,confirmedAt:null}}:job)});
  expect(await service.updateCandidateProfile({sequence:3,profile:{...profile,sequence:3}},owner)).toEqual({updatedJobs:0});
});
