import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AutoApplyService, type AutoApplyPersistence } from "./auto-apply-service.js";
import type { AutoApplyBatch, AutoApplyBatchRequest } from "./auto-apply-contract.js";
import { autoApplyExecutionDeadlineMs, deviceCommandExecutionExpired } from "./device-command-queue.js";
import { PgGatewayDatabase, PgDeviceCommandQueue, createPostgresGatewayRepositories } from "./postgres-storage.js";
import type { LegacyPluginEvent } from "./legacy-plugin-adapter.js";

const databaseUrl = process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL;
const tenantId = `pg-lease-${randomUUID()}`;
const epoch = Date.parse("2026-09-10T00:00:00.000Z");

function request(): AutoApplyBatchRequest {
  return {
    schemaVersion: "auto-apply-batch-request.v1",
    candidate: { packageRef: "synthetic", packageVersion: "1", packageSha256: "a".repeat(64),
      applicationProfile: { schemaVersion: "candidate-application-profile.v1", revision: "b".repeat(64), facts: [] } },
    assets: [{ assetId: "resume", purpose: "resume", fileRef: "https://load-test.invalid/resume.pdf",
      name: "synthetic.pdf", mediaType: "application/pdf", sha256: "c".repeat(64) }],
    jobs: ["one", "two"].map(jobId => ({ jobId, companyName: "Synthetic", title: "Synthetic",
      applicationUrl: `https://load-test.invalid/jobs/${jobId}`, tags: ["application_access:public"], answers: {} })),
    confirmation: { scope: "batch", confirmedByUser: true, confirmedAt: new Date(epoch).toISOString(),
      displayedJobIds: ["one", "two"], allowAutomaticFinalSubmit: true },
    executionPolicy: { loginPolicy: "skip_and_report", concurrency: 1, retryBeforeSubmit: 1,
      captchaPolicy: "skip_and_report", missingInformationPolicy: "skip_and_report", ambiguousConsentPolicy: "skip_and_report" }
  };
}

function receipt(batch: AutoApplyBatch, index = 0): LegacyPluginEvent {
  const job = batch.jobs[index]!;
  return { schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
    payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
      batchJobId: job.batchJobId, jobId: job.jobId, status: "succeeded", reasonCode: null,
      occurredAt: new Date(epoch).toISOString(), evidence: { redacted: true, siteConfirmation: "synthetic ACK only" } } } };
}

describe.skipIf(!databaseUrl)("PostgreSQL automatic lease recovery", () => {
  let database: PgGatewayDatabase;
  let secondDatabase: PgGatewayDatabase;
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/recruiting_gateway_test_")) throw new Error("Requires an isolated test database");
    database = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    secondDatabase = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    await database.migrate();
  });
  afterAll(async () => {
    if (!database) return;
    for (const table of ["batches", "commands", "owner_fences", "callback_outbox"]) {
      await database.query(`DELETE FROM recruiting_gateway.${table} WHERE tenant_id=$1`, [tenantId]);
    }
    await Promise.all([database.close(), secondDatabase.close()]);
  });

  async function fixture() {
    let timestamp = new Date(epoch);
    const now = () => timestamp;
    const identity = { tenantId, userId: randomUUID(), deviceId: randomUUID() };
    const repositories = createPostgresGatewayRepositories(database);
    const queue = new PgDeviceCommandQueue(database, now);
    const secondQueue = new PgDeviceCommandQueue(secondDatabase, now);
    const persistence: AutoApplyPersistence = {
      transaction: (key, work) => database.transaction(key, work),
      ownerFence: { isTerminated: async () => false, terminate: async () => undefined, clear: async () => undefined },
      callbackOutbox: repositories.callbackOutbox, canDispatch: async () => true, dispatchOnClaim: true
    };
    const service = new AutoApplyService(repositories.batches, queue,
      "synthetic-signing-key-for-lease-recovery-tests", now, undefined, undefined, persistence);
    const batch = await service.create({ ...identity, idempotencyKey: randomUUID(), request: request() });
    await service.recoverDeviceQueue(identity, { dispatch: true });
    const command = (await queue.claim({ ...identity, leaseSeconds: 90 }))!;
    const verify = () => service.verifySubmissionAuthorization(String(command.command.payload!.batchAuthorization),
      { ...identity, batchId: batch.batchId, batchJobId: batch.jobs[0]!.batchJobId, commandId: command.commandId });
    return { identity, service, queue, secondQueue, batch, command, verify,
      advance: (milliseconds: number) => { timestamp = new Date(epoch + milliseconds); } };
  }

  it("durably settles stopped work across instances without inventing a device cleanup ACK", async () => {
    const f = await fixture();
    const job = f.batch.jobs[0]!;
    await f.service.stopJob(f.batch.batchId, job.batchJobId, "pg-offline-stop", f.identity);
    await expect(f.secondQueue.renew(f.command.commandId, f.identity.deviceId)).rejects.toThrow("不能续租");
    f.advance(90_000);
    await f.service.reconcileExpiredBatches();
    const batch = await f.service.get(f.batch.batchId, f.identity);
    expect(batch.jobs[0]).toMatchObject({ status: "cancelled", stopRequest: {
      confirmedAt: new Date(epoch + 90_000).toISOString(),
      confirmationSource: "server_execution_fenced", cleanupAcknowledgedAt: null
    } });
    const command = (await f.secondQueue.get(f.command.commandId))!;
    expect(command.status).toBe("expired");
    expect(command.stopAcknowledgedAt).toBeFalsy();
    expect(await f.service.pendingJobStops(f.identity)).toHaveLength(1);
    expect((await f.verify()).valid).toBe(false);
    await f.service.acknowledgeJobStop(f.batch.batchId, job.batchJobId, "pg-offline-stop", f.command.commandId, f.identity);
    expect(await f.service.pendingJobStops(f.identity)).toEqual([]);
    expect((await f.service.get(f.batch.batchId, f.identity)).jobs[1]?.stopRequest).toBeUndefined();
  });

  it("fences an offline attempt exactly after lease plus grace, preserving late receipts and pull-only next work", async () => {
    const f = await fixture();
    expect(f.command.leaseExpiresAt).toBe(new Date(epoch + 90_000).toISOString());
    expect(f.command.leaseRecoveryDeadlineAt).toBe(new Date(epoch + 120_000).toISOString());
    expect(f.command.executionExpiresAt).toBe(new Date(epoch + autoApplyExecutionDeadlineMs).toISOString());
    f.advance(90_000);
    expect(await f.verify()).toMatchObject({ valid: false, reason: "command_not_active" });
    f.advance(119_999);
    expect((await f.secondQueue.listExpired()).some(item => item.commandId === f.command.commandId)).toBe(false);
    expect(await f.secondQueue.claim({ ...f.identity, leaseSeconds: 90 })).toBeNull();
    await f.service.reconcileExpiredBatches();
    expect((await f.service.get(f.batch.batchId)).jobs[0]!.status).toBe("preflight");
    f.advance(120_000);
    expect((await f.secondQueue.listExpired()).some(item => item.commandId === f.command.commandId)).toBe(true);
    await f.service.reconcileExpiredBatches();
    const recovered = await f.service.get(f.batch.batchId);
    expect(recovered.jobs).toMatchObject([
      { status: "failed", attempt: 1, commandId: null, reasonCode: "execution_lease_lost",
        evidence: { diagnostic: { retryable: false }, failureDetails: { resultUncertain: true } } },
      { status: "queued", attempt: 0, commandId: null }
    ]);
    expect((await f.secondQueue.get(f.command.commandId))!.leaseRecoveryDeadlineAt).toBe(f.command.leaseRecoveryDeadlineAt);
    await expect(f.secondQueue.renew(f.command.commandId, f.identity.deviceId, 90)).rejects.toThrow();
    await expect(f.service.acceptCommandProgress(f.command.commandId, {
      schemaVersion: "auto-apply-job-progress.v1", ...f.identity, batchId: f.batch.batchId,
      batchJobId: f.batch.jobs[0]!.batchJobId, jobId: "one", sequence: 1, stage: "submitting",
      message: "late worker", occurredAt: new Date(epoch + 120_000).toISOString()
    })).rejects.toThrow();
    await f.service.recoverDeviceQueue(f.identity, { dispatch: true });
    const next = (await f.secondQueue.claim({ ...f.identity, leaseSeconds: 90 }))!;
    expect(next.command.payload!.job).toMatchObject({ jobId: "two" });
    const afterPull = await f.service.get(f.batch.batchId);
    await f.service.completeCommandResult(f.command.commandId, f.identity.deviceId, receipt(f.batch));
    await f.service.completeCommandResult(f.command.commandId, f.identity.deviceId, receipt(f.batch));
    expect(await f.service.get(f.batch.batchId)).toEqual(afterPull);
    expect(await f.secondQueue.get(f.command.commandId)).toMatchObject({ status: "expired", archivedCompletionEvent: receipt(f.batch) });
    await f.service.completeCommandResult(next.commandId, f.identity.deviceId, receipt(f.batch, 1));
  });

  it("renews during grace and moves the indexed fence past the previous recovery deadline", async () => {
    const f = await fixture();
    f.advance(119_999);
    const renewed = await f.secondQueue.renew(f.command.commandId, f.identity.deviceId, 90);
    expect(renewed.leaseExpiresAt).toBe(new Date(epoch + 209_999).toISOString());
    expect(renewed.leaseRecoveryDeadlineAt).toBe(new Date(epoch + 239_999).toISOString());
    f.advance(120_000);
    expect(await f.verify()).toMatchObject({ valid: true });
    expect((await f.queue.listExpired()).some(item => item.commandId === f.command.commandId)).toBe(false);
    f.advance(239_999);
    await expect(f.queue.renew(f.command.commandId, f.identity.deviceId, 90)).rejects.toMatchObject({ code: "DEVICE_COMMAND_EXPIRED" });
    expect(await f.secondQueue.get(f.command.commandId)).toMatchObject({ status: "expired", leaseRecoveryDeadlineAt: renewed.leaseRecoveryDeadlineAt });
  });

  it("accepts and deduplicates a genuine result during reconnect grace", async () => {
    const f = await fixture();
    f.advance(119_999);
    const acknowledged = await f.service.completeCommandResult(f.command.commandId, f.identity.deviceId, receipt(f.batch));
    expect(acknowledged.jobs[0]!.status).toBe("succeeded");
    f.advance(autoApplyExecutionDeadlineMs + 1);
    expect(await f.service.completeCommandResult(f.command.commandId, f.identity.deviceId, receipt(f.batch))).toEqual(acknowledged);
    expect(await f.secondQueue.get(f.command.commandId)).toMatchObject({ status: "completed" });
  });

  it("preserves manual command lease reclaim and excludes manual expired rows from automatic reaping", async () => {
    const f = await fixture();
    const manualIdentity = { ...f.identity, userId: randomUUID() };
    const commandId = randomUUID();
    await f.queue.enqueue({ commandId, runId: randomUUID(), tenantId, userId: manualIdentity.userId,
      targetDeviceId: manualIdentity.deviceId,
      command: { ...f.command.command, commandId, type: "browser.fill_application", userId: manualIdentity.userId } });
    const first = (await f.queue.claim({ ...manualIdentity, leaseSeconds: 90 }))!;
    expect(first.leaseRecoveryDeadlineAt).toBeNull();
    f.advance(120_000);
    const reclaimed = await f.secondQueue.claim({ ...manualIdentity, leaseSeconds: 90 });
    expect(reclaimed?.commandId).toBe(commandId);
    expect(reclaimed?.claimedAt).toBe(first.claimedAt);
    f.advance(360_000);
    expect((await f.queue.listExpired()).some(item => item.commandId === commandId)).toBe(false);
  });

  it("keeps historical commands on their original hard deadline until their first successful renewal", async () => {
    const f = await fixture();
    await database.query("UPDATE recruiting_gateway.commands SET data=data-'leaseRecoveryDeadlineAt', deadline_at=$2 WHERE command_id=$1",
      [f.command.commandId, f.command.executionExpiresAt]);
    f.advance(300_000);
    const legacy = (await f.secondQueue.get(f.command.commandId))!;
    expect(deviceCommandExecutionExpired(legacy, new Date(epoch + 300_000))).toBe(false);
    const renewed = await f.secondQueue.renew(f.command.commandId, f.identity.deviceId, 90);
    expect(renewed.leaseRecoveryDeadlineAt).toBe(new Date(epoch + 420_000).toISOString());
  });
});
