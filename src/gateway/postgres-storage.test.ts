import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgGatewayDatabase, PgDeviceCommandQueue, createPostgresGatewayRepositories } from "./postgres-storage.js";
import { applicationRunSchema } from "./application-contract.js";
import { gatewayOwnerKey } from "./postgres-database.js";
import type { AutoApplyBatch, AutoApplyCallbackDelivery } from "./auto-apply-contract.js";
import type { DeviceCommandEnqueueInput } from "./device-command-queue.js";
import type { LegacyPluginEvent } from "./legacy-plugin-adapter.js";

const databaseUrl = process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL;
const tenantId = `pg-test-${randomUUID()}`;
const identity = (userId = randomUUID(), deviceId = randomUUID()) => ({ tenantId, userId, deviceId });

function command(owner: ReturnType<typeof identity>, type = "browser.execute_batch_auto_apply_job"): DeviceCommandEnqueueInput {
  const commandId = randomUUID();
  return {
    commandId, runId: randomUUID(), tenantId, userId: owner.userId, targetDeviceId: owner.deviceId,
    command: {
      schemaVersion: "ai-plugin-command.v1", commandId, conversationId: randomUUID(), tenantId, userId: owner.userId,
      issuedAt: "2026-09-10T00:00:00.000Z", expiresAt: "2026-09-10T00:05:00.000Z", type,
      idempotencyKey: commandId, requiresUserGesture: false, payload: { batchId: randomUUID(), batchJobId: randomUUID(), job: { jobId: randomUUID() } },
      safety: { allowFinalSubmit: false, allowConsentClick: false, allowCaptchaHandling: false }
    }
  };
}

function batch(owner: ReturnType<typeof identity>): AutoApplyBatch {
  return {
    ...owner, schemaVersion: "auto-apply-batch.v1", batchId: randomUUID(), idempotencyKey: randomUUID(),
    status: "queued", candidate: {
      packageRef: "fixture", packageVersion: "1", packageSha256: "a".repeat(64),
      applicationProfile: { schemaVersion: "candidate-application-profile.v1", revision: "b".repeat(64), facts: [] }
    }, assets: [], jobs: [], confirmation: {
      scope: "batch", confirmedByUser: true, confirmedAt: "2026-09-10T00:00:00.000Z", displayedJobIds: [], allowAutomaticFinalSubmit: true
    }, safety: { allowConsentClick: false }, executionPolicy: {
      loginPolicy: "skip_and_report", concurrency: 1, retryBeforeSubmit: 1,
      captchaPolicy: "skip_and_report", missingInformationPolicy: "skip_and_report", ambiguousConsentPolicy: "skip_and_report"
    }, callback: null, authorizationId: randomUUID(), authorizationExpiresAt: "2026-09-10T01:00:00.000Z",
    revision: 1, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z"
  };
}

function linkedBatch(input: DeviceCommandEnqueueInput): AutoApplyBatch {
  const record = batch({ tenantId: input.tenantId, userId: input.userId, deviceId: input.targetDeviceId });
  const payload = input.command.payload as { batchId: string; batchJobId: string; job: { jobId: string } };
  record.batchId = payload.batchId;
  record.status = "running";
  record.jobs = [{
    batchJobId: payload.batchJobId, jobId: payload.job.jobId, companyName: "fixture", title: "fixture",
    applicationUrl: "https://example.com/jobs/fixture", adapterCode: null, status: "preflight", attempt: 1,
    commandId: input.commandId, reasonCode: null, createdAt: input.command.issuedAt,
    startedAt: input.command.issuedAt, completedAt: null, evidence: null
  }];
  return record;
}

const receipt: LegacyPluginEvent = {
  schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed", payload: { marker: "stable-receipt" }
};

// Integration suite is enabled only with an explicitly selected isolated test database.
describe.skipIf(!databaseUrl)("PostgreSQL gateway replicas", () => {
  let first: PgGatewayDatabase;
  let second: PgGatewayDatabase;
  let one: ReturnType<typeof createPostgresGatewayRepositories>;
  let two: ReturnType<typeof createPostgresGatewayRepositories>;

  async function enqueue(queue: PgDeviceCommandQueue, input: DeviceCommandEnqueueInput) {
    if (input.command.type === "browser.execute_batch_auto_apply_job") await one.batches.save(linkedBatch(input));
    return queue.enqueue(input);
  }

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/recruiting_gateway_test_")) throw new Error("PG tests require a dedicated recruiting_gateway_test_* database");
    first = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    second = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    await Promise.all([first.migrate(), second.migrate()]);
    one = createPostgresGatewayRepositories(first);
    two = createPostgresGatewayRepositories(second);
  });

  afterAll(async () => {
    if (!first) return;
    await first.query("DELETE FROM recruiting_gateway.executor_states WHERE run_id IN (SELECT run_id FROM recruiting_gateway.runs WHERE tenant_id=$1)", [tenantId]);
    for (const table of ["batches", "commands", "devices", "pairing_sessions", "bootstrap_sessions", "credentials", "runs", "owner_fences", "callback_outbox"]) {
      await first.query(`DELETE FROM recruiting_gateway.${table} WHERE tenant_id=$1`, [tenantId]);
    }
    await Promise.all([first.close(), second.close()]);
  });

  it("rolls back batch, command and callback together when dispatch fails", async () => {
    const owner = identity();
    const input = command(owner);
    const record = batch(owner);
    await expect(first.transaction(gatewayOwnerKey(tenantId, owner.userId), async () => {
      await one.batches.save(record);
      await one.queue.enqueue(input);
      await one.callbackOutbox.enqueue(record);
      throw new Error("injected dispatch crash");
    })).rejects.toThrow("injected dispatch crash");
    expect(await two.batches.get(record.batchId)).toBeNull();
    expect(await two.queue.get(input.commandId)).toBeNull();
    expect((await first.query("SELECT 1 FROM recruiting_gateway.callback_outbox WHERE batch_id=$1", [record.batchId])).rowCount).toBe(0);
  });

  it("commits batch and command atomically and hides uncommitted work from another replica", async () => {
    const owner = identity();
    const record = batch(owner);
    const input = command(owner);
    await first.transaction(gatewayOwnerKey(tenantId, owner.userId), async () => {
      await one.batches.save(record);
      await one.queue.enqueue(input);
      expect(await two.batches.get(record.batchId)).toBeNull();
      expect(await two.queue.get(input.commandId)).toBeNull();
    });
    expect(await two.batches.get(record.batchId)).toEqual(record);
    expect((await two.queue.get(input.commandId))?.status).toBe("queued");
  });

  it("allows only one automatic claim across two replicas and never reclaims after a lease lapse", async () => {
    const owner = identity();
    let now = new Date("2026-09-10T00:00:00.000Z");
    const a = new PgDeviceCommandQueue(first, () => now);
    const b = new PgDeviceCommandQueue(second, () => now);
    const input = command(owner);
    const next = command(owner);
    await enqueue(a, input);
    now = new Date(now.getTime() + 1);
    await enqueue(a, next);
    const claims = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? a : b).claim({...owner,leaseSeconds:90})));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.commandId).toBe(input.commandId);
    now = new Date(now.getTime() + 91_000);
    expect(await b.claim(owner)).toBeNull();
    expect((await b.get(input.commandId))?.claimedAt).toBe(claims.find(Boolean)?.claimedAt);
    await b.complete(input.commandId, owner.deviceId, receipt);
    expect((await a.claim(owner))?.commandId).toBe(next.commandId);
  });

  it("keeps another owner responsive while one owner holds its transaction", async () => {
    const blocked = identity();
    const other = identity();
    let release!: () => void;
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => { acquired = resolve; });
    const held = first.transaction(gatewayOwnerKey(tenantId, blocked.userId), async () => {
      acquired();
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await ready;
    try { expect((await two.devices.register(other)).userId).toBe(other.userId); }
    finally { release(); await held; }
  });

  it("finds orphan command deadlines without reading nonterminal batches", async () => {
    const owner = identity();
    let now = new Date("2026-09-10T00:00:00.000Z");
    const queue = new PgDeviceCommandQueue(first, () => now);
    const input = command(owner);
    await enqueue(queue, input);
    await queue.claim(owner);
    now = new Date("2026-09-10T00:31:00.000Z");
    expect((await queue.listExpired()).map((item) => item.commandId)).toContain(input.commandId);
    await queue.expire(input.commandId);
    const archived = await queue.archiveExpiredCompletion(input.commandId, owner.deviceId, receipt);
    expect(archived).toMatchObject({ status: "expired", archivedCompletionEvent: receipt });
    expect(archived.completionEvent).toBeUndefined();
    expect(await queue.archiveExpiredCompletion(input.commandId, owner.deviceId, receipt)).toEqual(archived);
    await expect(queue.archiveExpiredCompletion(input.commandId, owner.deviceId, { ...receipt, payload: { marker: "different" } })).rejects.toThrow();
    await expect(queue.archiveExpiredCompletion(input.commandId, "wrong-device", receipt)).rejects.toThrow();
  });

  it("retains durable receipts across replicas and rejects conflicting command or result retries", async () => {
    const owner = identity();
    const now = () => new Date("2026-09-10T00:00:00.000Z");
    const a = new PgDeviceCommandQueue(first, now);
    const b = new PgDeviceCommandQueue(second, now);
    const input = command(owner);
    await enqueue(a, input);
    await expect(b.enqueue({ ...input, targetDeviceId: "different-device" })).rejects.toThrow();
    await a.claim(owner);
    const completed = await a.complete(input.commandId, owner.deviceId, receipt);
    expect(await b.complete(input.commandId, owner.deviceId, receipt)).toEqual(completed);
    await expect(b.complete(input.commandId, owner.deviceId, { ...receipt, status: "failed" })).rejects.toThrow();
  });

  it("persists stop acknowledgement and keeps the next task blocked during renewal grace", async () => {
    const owner = identity();
    let now = new Date("2026-09-10T00:00:00.000Z");
    const a = new PgDeviceCommandQueue(first, () => now);
    const b = new PgDeviceCommandQueue(second, () => now);
    const input = command(owner);
    await enqueue(a, input);
    now = new Date(now.getTime() + 1);
    const next = command(owner);
    await enqueue(a, next);
    await a.claim({...owner,leaseSeconds:90});
    expect(await a.cancelQueued(input.commandId, tenantId, owner.userId, owner.deviceId)).toBe(false);
    now = new Date(now.getTime() + 91_000);
    expect(await b.claim(owner)).toBeNull();
    await b.acknowledgeStopped(input.commandId, tenantId, owner.userId, owner.deviceId);
    expect((await a.get(input.commandId))?.stopAcknowledgedAt).toBe(now.toISOString());
    expect((await b.claim(owner))?.commandId).toBe(next.commandId);
  });

  it("shares account termination fences across replicas and transaction rollback", async () => {
    const owner = identity();
    await one.ownerFence.terminate(tenantId, owner.userId);
    expect(await two.ownerFence.isTerminated(tenantId, owner.userId)).toBe(true);
    await expect(first.transaction(gatewayOwnerKey(tenantId, owner.userId), async () => {
      await one.ownerFence.clear(tenantId, owner.userId);
      throw new Error("rollback clear");
    })).rejects.toThrow();
    expect(await two.ownerFence.isTerminated(tenantId, owner.userId)).toBe(true);
    await two.ownerFence.clear(tenantId, owner.userId);
    expect(await one.ownerFence.isTerminated(tenantId, owner.userId)).toBe(false);
  });

  it("consumes pairing codes once across replicas and shares token revocation", async () => {
    const owner = identity();
    const created = await one.pairings.create(owner);
    const exchanges = await Promise.allSettled([one.pairings.exchange({ ...owner, pairingCode: created.pairingCode }), two.pairings.exchange({ ...owner, pairingCode: created.pairingCode })]);
    expect(exchanges.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const exchange = exchanges.find((result) => result.status === "fulfilled");
    if (exchange?.status !== "fulfilled") throw new Error("missing paired credential");
    expect(await two.pairings.authenticate(exchange.value.deviceToken)).toMatchObject(owner);
    await one.pairings.terminateOwner(tenantId, owner.userId);
    expect(await two.pairings.authenticate(exchange.value.deviceToken)).toBeNull();
  });

  it("preserves device identity on same-owner bootstrap and revokes prior owner credentials", async () => {
    const owner = identity();
    const created = await one.pairings.createBootstrap(owner);
    const original = await one.pairings.exchangeBootstrap({ bootstrapToken: created.bootstrapToken, deviceId: owner.deviceId });
    const refreshed = await two.pairings.createBootstrap(owner);
    const replacement = await two.pairings.exchangeBootstrap({ bootstrapToken: refreshed.bootstrapToken, deviceId: "unused-new-device", previousDeviceId: owner.deviceId });
    expect(replacement.deviceId).toBe(owner.deviceId);
    expect(await one.pairings.authenticate(original.deviceToken)).toBeNull();
    const other = identity();
    const transfer = await one.pairings.createBootstrap(other);
    const moved = await one.pairings.exchangeBootstrap({ bootstrapToken: transfer.bootstrapToken, deviceId: other.deviceId, previousDeviceId: owner.deviceId });
    expect(moved.deviceId).toBe(other.deviceId);
    expect(await two.pairings.authenticate(replacement.deviceToken)).toBeNull();
    expect(await two.pairings.authenticate(moved.deviceToken)).toMatchObject(other);
    await expect(two.pairings.exchangeBootstrap({ bootstrapToken: transfer.bootstrapToken, deviceId: other.deviceId })).rejects.toThrow();
  });

  it("retains registry metadata on heartbeats from another replica", async () => {
    const owner = identity();
    await one.devices.register({ ...owner, deviceName: "fixture-device", pluginInstalled: true, pluginVersion: "1.0.1", capabilities: ["account_logout_fence.v1"] });
    await two.devices.register(owner);
    expect(await one.devices.get(tenantId, owner.userId, owner.deviceId)).toMatchObject({ deviceName: "fixture-device", pluginVersion: "1.0.1", capabilities: ["account_logout_fence.v1"] });
  });

  it("claims callbacks independently and rejects stale worker acknowledgements", async () => {
    const record = batch(identity());
    await one.callbackOutbox.enqueue(record);
    await two.callbackOutbox.enqueue(record);
    const all = (await Promise.all([one.callbackOutbox.claim(100), two.callbackOutbox.claim(100)])).flat();
    const matching = all.filter((item) => item.batch.batchId === record.batchId);
    expect(matching).toHaveLength(1);
    const claimed = matching[0]!;
    expect(await one.callbackOutbox.complete(claimed.id, "wrong-lease")).toBe(false);
    expect(await two.callbackOutbox.complete(claimed.id, claimed.leaseToken)).toBe(true);
    expect(await one.callbackOutbox.retry(claimed.id, claimed.leaseToken, "late failure")).toBe(false);
  });

  it("updates only callback delivery and ignores an older revision's callback", async () => {
    const record = batch(identity());
    await one.batches.save(record);
    const newer = { ...record, revision: 2, status: "running" as const };
    await two.batches.save(newer);
    const delivery: AutoApplyCallbackDelivery = { status: "delivered", eventId: record.batchId, attempts: 1, lastAttemptAt: new Date().toISOString(), deliveredAt: new Date().toISOString(), lastError: null };
    await one.batches.updateCallbackDelivery(record.batchId, delivery, 1);
    expect(await two.batches.get(record.batchId)).toEqual(newer);
    await one.batches.updateCallbackDelivery(record.batchId, delivery, 2);
    expect(await two.batches.get(record.batchId)).toEqual({ ...newer, callbackDelivery: delivery });
  });

  it("rotates bounded scheduling pages so an old offline owner cannot monopolize dispatch", async () => {
    for (let index = 0; index < 3; index += 1) await one.batches.save(batch(identity()));
    const firstPage = await one.batches.listSchedulingOwners(1);
    const secondPage = await two.batches.listSchedulingOwners(1);
    expect(firstPage).toHaveLength(1);
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]).not.toEqual(firstPage[0]);
  });

  it("bounds lock waits and reuses the rolled-back connection for a healthy owner", async () => {
    const owner = identity();
    const limited = new PgGatewayDatabase(databaseUrl!, { maxConnections: 1, lockTimeoutMs: 100 });
    let release!: () => void;
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => { acquired = resolve; });
    const held = first.transaction(gatewayOwnerKey(tenantId, owner.userId), async () => {
      acquired();
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await ready;
    try {
      await expect(limited.transaction(gatewayOwnerKey(tenantId, owner.userId), async () => undefined)).rejects.toMatchObject({ code: "55P03" });
      await expect(limited.transaction(gatewayOwnerKey(tenantId, "healthy-owner"), async () => "healthy")).resolves.toBe("healthy");
    } finally { release(); await held; await limited.close(); }
  });


  it("fences orphan, terminal and stopped automatic commands before returning a valid attempt", async () => {
    const owner = identity();
    let now = new Date("2026-09-10T00:00:00.000Z");
    const queue = new PgDeviceCommandQueue(first, () => now);
    const orphan = command(owner);
    await queue.enqueue(orphan);
    now = new Date(now.getTime() + 1);
    const terminal = command(owner);
    const terminalBatch = linkedBatch(terminal);
    terminalBatch.status = "completed_with_errors";
    terminalBatch.jobs[0]!.status = "failed";
    await one.batches.save(terminalBatch);
    await queue.enqueue(terminal);
    now = new Date(now.getTime() + 1);
    const stopped = command(owner);
    const stoppedBatch = linkedBatch(stopped);
    stoppedBatch.jobs[0]!.stopRequest = { requestId: randomUUID(), requestedAt: now.toISOString(), commandId: stopped.commandId, confirmedAt: null };
    await one.batches.save(stoppedBatch);
    await queue.enqueue(stopped);
    now = new Date(now.getTime() + 1);
    const valid = command(owner);
    await enqueue(queue, valid);
    expect((await queue.claim(owner))?.commandId).toBe(valid.commandId);
    for (const input of [orphan, terminal, stopped]) expect((await queue.get(input.commandId))?.status).toBe("expired");
  });

  it("does not claim a paused batch and preserves it until explicit resume", async () => {
    const owner = identity();
    const queue = new PgDeviceCommandQueue(first, () => new Date("2026-09-10T00:00:00.000Z"));
    const input = command(owner);
    const record = linkedBatch(input);
    record.status = "paused";
    await one.batches.save(record);
    await queue.enqueue(input);
    expect(await queue.claim(owner)).toBeNull();
    expect((await queue.get(input.commandId))?.status).toBe("queued");
    await two.batches.save({ ...record, status: "running", revision: record.revision + 1 });
    expect((await queue.claim(owner))?.commandId).toBe(input.commandId);
  });

  it("permits deferred missing-information rebinding while rejecting active or cross-owner rebinding", async () => {
    const input = command(identity());
    const record = linkedBatch(input);
    await one.batches.save(record);
    await expect(two.batches.save({ ...record, deviceId: "new-device", revision: 2 })).rejects.toThrow();
    record.status = "paused";
    record.pauseReason = "waiting_for_user_action";
    record.revision = 2;
    record.jobs[0]!.status = "waiting_for_user_action";
    record.jobs[0]!.reasonCode = "missing_information";
    record.jobs[0]!.commandId = null;
    await one.batches.save(record);
    const rebound = { ...record, deviceId: "new-device", revision: 3 };
    expect(await two.batches.save(rebound)).toEqual(rebound);
    expect(await one.batches.get(rebound.batchId)).toEqual(rebound);
    await expect(two.batches.save({ ...rebound, userId: "other-owner", revision: 4 })).rejects.toThrow();
  });

  it("retains the twentieth failed callback in the dead-letter state", async () => {
    const record = batch(identity());
    await one.callbackOutbox.enqueue(record);
    await first.query("UPDATE recruiting_gateway.callback_outbox SET attempts=19 WHERE batch_id=$1", [record.batchId]);
    const claimed = (await two.callbackOutbox.claim(100)).find((item) => item.batch.batchId === record.batchId)!;
    expect(claimed.attempts).toBe(20);
    expect(await one.callbackOutbox.retry(claimed.id, claimed.leaseToken, "callback_timeout")).toBe(true);
    expect((await first.query("SELECT status,last_error FROM recruiting_gateway.callback_outbox WHERE id=$1", [claimed.id])).rows[0]).toEqual({ status: "failed", last_error: "callback_timeout" });
    expect((await two.callbackOutbox.claim(100)).some((item) => item.id === claimed.id)).toBe(false);
  });


  it("dead-letters a worker crash at the attempt limit instead of claiming a twenty-first delivery", async () => {
    const record = batch(identity());
    await one.callbackOutbox.enqueue(record);
    await first.query("UPDATE recruiting_gateway.callback_outbox SET attempts=20,status='delivering',lease_token=$2,lease_expires_at=now()-interval '1 second' WHERE batch_id=$1", [record.batchId, randomUUID()]);
    expect((await two.callbackOutbox.claim(100)).some((item) => item.batch.batchId === record.batchId)).toBe(false);
    expect((await first.query("SELECT status FROM recruiting_gateway.callback_outbox WHERE batch_id=$1", [record.batchId])).rows[0]?.status).toBe("failed");
  });

  it("persists legacy runs and executor state in the same transaction across replicas", async () => {
    const owner = identity();
    const timestamp = new Date().toISOString();
    const run = applicationRunSchema.parse({
      schemaVersion: "application-run.v1", runId: randomUUID(), status: "queued", revision: 1,
      createdAt: timestamp, updatedAt: timestamp, confirmation: null, events: [],
      request: {
        ...owner, schemaVersion: "application-run-request.v1", conversationId: randomUUID(), idempotencyKey: randomUUID(),
        job: { jobId: "fixture", companyName: "fixture", title: "fixture", city: "北京", applicationUrl: "https://example.com/jobs/fixture" },
        candidate: { profileRef: "fixture", snapshotVersion: "1", profile: {
          schemaVersion: "candidate-profile.v1", basic: {}, preferences: {}, educations: [], workExperiences: [],
          projects: [], research: [], awards: [], skills: [], additional: {}
        } }, assets: [], executionPolicy: { mode: "manual_copy", allowAutoFill: false, allowSiteResumeParser: true, allowFinalSubmit: false }
      }
    });
    await first.transaction(gatewayOwnerKey(tenantId, owner.userId), async () => {
      await one.runs.save(run);
      await one.runs.saveExecutorState(run.runId, { boundTab: 42 });
    });
    expect(await two.runs.get(run.runId)).toEqual(run);
    expect(await two.runs.findByIdempotencyKey(tenantId, run.request.idempotencyKey)).toEqual(run);
    expect(await two.runs.getExecutorState(run.runId)).toEqual({ boundTab: 42 });
    await expect(first.transaction(gatewayOwnerKey(tenantId, owner.userId), async () => {
      await one.runs.saveExecutorState(run.runId, { boundTab: 99 });
      throw new Error("executor transaction rollback");
    })).rejects.toThrow();
    expect(await two.runs.getExecutorState(run.runId)).toEqual({ boundTab: 42 });
  });

});
