import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { gatewayOwnerKey } from "./postgres-database.js";
import { ApplicationGateway } from "./application-gateway.js";
import { applicationRunRequestSchema, type ApplicationRunRequest } from "./application-contract.js";
import { LegacyAiPluginBridgeAdapter } from "./legacy-plugin-adapter.js";
import { QueuedLegacyPluginTransport } from "./device-command-queue.js";
import { PgGatewayDatabase, createPostgresGatewayRepositories } from "./postgres-storage.js";

const databaseUrl = process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL;
const tenantId = `application-pg-${randomUUID()}`;
function request(): ApplicationRunRequest {
  return applicationRunRequestSchema.parse({ schemaVersion: "application-run-request.v1", tenantId,
    userId: randomUUID(), deviceId: randomUUID(), idempotencyKey: randomUUID(),
    job: { jobId: randomUUID(), companyName: "队列事务测试", title: "测试岗位", applicationUrl: "https://ats.example.test/job" },
    candidate: { profileRef: "test-profile", snapshotVersion: "1" }, assets: [] });
}

// These tests use only the durable command transport. They never visit an ATS.
describe.skipIf(!databaseUrl)("application-run transactions across Gateway replicas", () => {
  let first: PgGatewayDatabase, second: PgGatewayDatabase;
  let one: ReturnType<typeof createPostgresGatewayRepositories>, two: ReturnType<typeof createPostgresGatewayRepositories>;
  let a: ApplicationGateway, b: ApplicationGateway;
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/recruiting_gateway_test_")) throw new Error("Application tests require a dedicated recruiting_gateway_test_* database");
    first = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    second = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    await first.migrate();
    one = createPostgresGatewayRepositories(first); two = createPostgresGatewayRepositories(second);
    const make = (database: PgGatewayDatabase, repositories: typeof one) => new ApplicationGateway(repositories.runs,
      new LegacyAiPluginBridgeAdapter(new QueuedLegacyPluginTransport(repositories.queue)),
      () => new Date(), (key, work) => database.transaction(key, work));
    a = make(first, one); b = make(second, two);
  });
  afterAll(async () => {
    if (!first) return;
    await first.query("DELETE FROM recruiting_gateway.commands WHERE tenant_id=$1", [tenantId]);
    await first.query("DELETE FROM recruiting_gateway.executor_states WHERE run_id IN (SELECT run_id FROM recruiting_gateway.runs WHERE tenant_id=$1)", [tenantId]);
    await first.query("DELETE FROM recruiting_gateway.runs WHERE tenant_id=$1", [tenantId]);
    await Promise.all([first.close(), second.close()]);
  });

  it("creates one run and one command for concurrent same-key starts on two replicas", async () => {
    const input = request();
    const runs = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? a : b).start(input)));
    expect(new Set(runs.map(run => run.runId)).size).toBe(1);
    expect(runs.every(run => run.revision === runs[0]!.revision)).toBe(true);
    expect((await first.query("SELECT 1 FROM recruiting_gateway.commands WHERE tenant_id=$1 AND user_id=$2", [tenantId, input.userId])).rowCount).toBe(1);
    expect(await two.runs.getExecutorState(runs[0]!.runId)).toMatchObject({ commandId: expect.any(String) });
  });

  it("serializes tenant idempotency across different owners and rejects the losing payload", async () => {
    const input = request();
    const results = await Promise.allSettled([a.start(input), b.start({ ...input, userId: randomUUID() })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "IDEMPOTENCY_CONFLICT" } });
    expect((await first.query("SELECT 1 FROM recruiting_gateway.runs WHERE tenant_id=$1 AND idempotency_key=$2", [tenantId, input.idempotencyKey])).rowCount).toBe(1);
  });

  it("rolls back initial run, command and executor binding together after an injected save failure", async () => {
    const input = request();
    const save = one.runs.save.bind(one.runs);
    const spy = vi.spyOn(one.runs, "save").mockImplementation(async run => {
      if (run.request.userId === input.userId && run.events.at(-1)?.reason === "gateway.command_queued") throw new Error("injected post-enqueue crash");
      return save(run);
    });
    try { await expect(a.start(input)).rejects.toThrow("injected post-enqueue crash"); }
    finally { spy.mockRestore(); }
    expect(await two.runs.findByIdempotencyKey(tenantId, input.idempotencyKey)).toBeNull();
    expect((await first.query("SELECT 1 FROM recruiting_gateway.commands WHERE tenant_id=$1 AND user_id=$2", [tenantId, input.userId])).rowCount).toBe(0);
    const retried = await b.start(input);
    expect(retried.status).toBe("running");
    expect((await first.query("SELECT 1 FROM recruiting_gateway.commands WHERE tenant_id=$1 AND user_id=$2", [tenantId, input.userId])).rowCount).toBe(1);
  });

  it("consumes final confirmation once across replicas without enqueueing two submit commands", async () => {
    let run = await a.start(request());
    const state = await one.runs.getExecutorState(run.runId);
    run = await a.acceptExecutionEvent(run.runId, { type: "review_required", payload: { readbackHash: "stable" } },
      { commandId: String(state.commandId) });
    const confirmation = { schemaVersion: "application-confirmation.v1" as const, ...run.confirmation!, confirmedByUser: true as const };
    const results = await Promise.allSettled([a.confirm(run.runId, confirmation), b.confirm(run.runId, confirmation)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await first.query("SELECT 1 FROM recruiting_gateway.commands WHERE tenant_id=$1 AND user_id=$2 AND command_type=$3",
      [tenantId, run.request.userId, "browser.submit_application_after_ai_confirmation"])).rowCount).toBe(1);
    expect((await b.get(run.runId)).confirmation).toBeNull();
  });

  it("keeps every concurrent event and executor-state update instead of overwriting equal revisions", async () => {
    const run = await a.start(request());
    await Promise.all([a.acceptExecutionEvent(run.runId, { type: "progress", reason: "first", executorState: { first: true } }),
      b.acceptExecutionEvent(run.runId, { type: "progress", reason: "second", executorState: { second: true } })]);
    const final = await a.get(run.runId);
    expect(final.revision).toBe(run.revision + 2);
    expect(final.events.slice(-2).map(event => event.reason).sort()).toEqual(["first", "second"]);
    expect(final.events.map(event => event.sequence)).toEqual(Array.from({ length: final.events.length }, (_, index) => index + 1));
    expect(await two.runs.getExecutorState(run.runId)).toMatchObject({ first: true, second: true });
  });

  it("accepts a receipt inside an existing owner transaction without inverting a process lock", async () => {
    const run = await a.start(request());
    let entered!: () => void, release!: () => void, contending!: () => void;
    const held = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { contending = resolve; });
    const ownerKey = gatewayOwnerKey(tenantId, run.request.userId);
    const transaction = first.transaction.bind(first);
    let ownerCalls = 0;
    const spy = vi.spyOn(first, "transaction").mockImplementation((key, work) => {
      if (key === ownerKey && ++ownerCalls === 2) contending();
      return transaction(key, work);
    });
    const receipt = first.transaction(ownerKey, async () => {
      entered();
      await resume;
      return a.acceptExecutionEvent(run.runId, { type: "run_completed" });
    });
    await held;
    // This independent request must wait for the database owner lock without
    // holding an in-process lock needed by the already-open receipt transaction.
    const continued = a.continue(run.runId);
    await waiting;
    release();
    const results = await Promise.allSettled([receipt, continued]);
    spy.mockRestore();
    expect(results[0]).toMatchObject({ status: "fulfilled", value: { status: "completed" } });
    expect(results[1]).toMatchObject({ status: "rejected" });
    expect((await b.get(run.runId)).status).toBe("completed");
  });

  it("acknowledges a valid old command receipt without replacing a newer command or run outcome", async () => {
    const run = await a.start(request());
    const oldCommand = (await one.runs.getExecutorState(run.runId)).commandId;
    const continued = await b.continue(run.runId);
    const current = await two.runs.getExecutorState(run.runId);
    expect(current.commandId).not.toBe(oldCommand);
    const unchanged = await a.acceptExecutionEvent(run.runId, { type: "run_failed", reason: "late-old-result",
      executorState: { commandId: oldCommand, tabId: 99 } }, { commandId: String(oldCommand) });
    expect(unchanged).toEqual(continued);
    expect(await two.runs.getExecutorState(run.runId)).toEqual(current);
    const completed = await b.acceptExecutionEvent(run.runId, { type: "run_completed" }, { commandId: String(current.commandId) });
    expect(await a.acceptExecutionEvent(run.runId, { type: "run_failed" }, { commandId: String(oldCommand) })).toEqual(completed);
    expect((await b.get(run.runId)).status).toBe("completed");
  });
});
