import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApplicationGateway, MemoryApplicationRunRepository, type ApplicationGatewayTransactionRunner } from "./application-gateway.js";
import { applicationRunRequestSchema } from "./application-contract.js";
import { LegacyAiPluginBridgeAdapter, type LegacyPluginEvent } from "./legacy-plugin-adapter.js";
import { MemoryDeviceCommandQueue, QueuedLegacyPluginTransport, type DeviceCommandQueue } from "./device-command-queue.js";
import { createDeviceBridgeRouter } from "./device-bridge-router.js";
import type { DevicePairingRegistry } from "./device-pairing.js";
import { PgGatewayDatabase, createPostgresGatewayRepositories } from "./postgres-storage.js";

const tenantId = `receipt-http-${randomUUID()}`;
const identity = { tenantId, userId: randomUUID(), deviceId: randomUUID() };
const headers = { Authorization: "Bearer fixture", "Content-Type": "application/json", "X-Tenant-Id": tenantId };
const event: LegacyPluginEvent = { schemaVersion: "ai-plugin-event.v1", type: "browser.application_progress",
  status: "completed", payload: { tabId: 42, note: "exact original receipt" } };
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});
function request() {
  return applicationRunRequestSchema.parse({ schemaVersion: "application-run-request.v1", ...identity,
    idempotencyKey: randomUUID(), job: { jobId: randomUUID(), companyName: "HTTP事务测试", title: "测试岗位", applicationUrl: "https://ats.example.test/job" },
    candidate: { profileRef: "test-profile", snapshotVersion: "1" }, assets: [] });
}
async function serve(queue: DeviceCommandQueue, gateway: ApplicationGateway, transaction?: ApplicationGatewayTransactionRunner) {
  const app = express(); app.use(express.json());
  const pairings = { authenticate: async token => ({ ...identity, deviceId: token === "other-device" ? "other-device" : identity.deviceId }) } as unknown as DevicePairingRegistry;
  app.use(createDeviceBridgeRouter(queue, gateway, undefined, pairings, undefined, undefined, undefined, () => new Date(), transaction));
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test listener unavailable");
  return `http://127.0.0.1:${address.port}`;
}
function post(base: string, commandId: string, payload = event, deviceId = identity.deviceId) {
  return fetch(`${base}/commands/${commandId}/results`, { method: "POST",
    headers: { ...headers, Authorization: deviceId === identity.deviceId ? "Bearer fixture" : "Bearer other-device" },
    body: JSON.stringify({ deviceId, event: payload }) });
}

describe("generic device result HTTP idempotency", () => {
  it("acknowledges an exact duplicate once but rejects a changed receipt or claiming device", async () => {
    const queue = new MemoryDeviceCommandQueue();
    const gateway = new ApplicationGateway(new MemoryApplicationRunRepository(), new LegacyAiPluginBridgeAdapter(new QueuedLegacyPluginTransport(queue)));
    const run = await gateway.start(request());
    const command = await queue.claim(identity);
    expect(command).not.toBeNull();
    const base = await serve(queue, gateway);
    const first = await post(base, command!.commandId);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ disposition: "applied", accepted: true });
    const accepted = await gateway.get(run.runId);
    const duplicate = await post(base, command!.commandId);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ disposition: "duplicate", accepted: true });
    expect(await gateway.get(run.runId)).toEqual(accepted);
    const changed = await post(base, command!.commandId, { ...event, payload: { tabId: 99 } });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT", retryable: false });
    const otherDevice = await post(base, command!.commandId, event, "other-device");
    expect(otherDevice.status).toBe(409);
    expect(await otherDevice.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await gateway.get(run.runId)).toEqual(accepted);
    expect((await queue.get(command!.commandId))?.completionEvent).toEqual(event);
  });
});

const databaseUrl = process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("generic HTTP receipt transactions across PostgreSQL replicas", () => {
  let first: PgGatewayDatabase, second: PgGatewayDatabase;
  let one: ReturnType<typeof createPostgresGatewayRepositories>, two: ReturnType<typeof createPostgresGatewayRepositories>;
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/recruiting_gateway_test_")) throw new Error("Receipt tests require a dedicated recruiting_gateway_test_* database");
    first = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    second = new PgGatewayDatabase(databaseUrl!, { maxConnections: 4 });
    await first.migrate(); one = createPostgresGatewayRepositories(first); two = createPostgresGatewayRepositories(second);
  });
  afterAll(async () => {
    if (!first) return;
    await first.query("DELETE FROM recruiting_gateway.commands WHERE tenant_id=$1", [tenantId]);
    await first.query("DELETE FROM recruiting_gateway.executor_states WHERE run_id IN (SELECT run_id FROM recruiting_gateway.runs WHERE tenant_id=$1)", [tenantId]);
    await first.query("DELETE FROM recruiting_gateway.runs WHERE tenant_id=$1", [tenantId]);
    await Promise.all([first.close(), second.close()]);
  });
  it("commits one receipt event when identical HTTP results race across two replicas", async () => {
    const txA: ApplicationGatewayTransactionRunner = (key, work) => first.transaction(key, work);
    const txB: ApplicationGatewayTransactionRunner = (key, work) => second.transaction(key, work);
    const a = new ApplicationGateway(one.runs, new LegacyAiPluginBridgeAdapter(new QueuedLegacyPluginTransport(one.queue)), () => new Date(), txA);
    const b = new ApplicationGateway(two.runs, new LegacyAiPluginBridgeAdapter(new QueuedLegacyPluginTransport(two.queue)), () => new Date(), txB);
    const run = await a.start(request());
    const command = await one.queue.claim(identity);
    expect(command).not.toBeNull();
    const [baseA, baseB] = await Promise.all([serve(one.queue, a, txA), serve(two.queue, b, txB)]);
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => post(index % 2 ? baseA : baseB, command!.commandId)));
    expect(responses.every(response => response.status === 200)).toBe(true);
    const receipts = await Promise.all(responses.map(response => response.json()));
    expect(receipts.filter(receipt => receipt.disposition === "applied")).toHaveLength(1);
    expect(receipts.filter(receipt => receipt.disposition === "duplicate")).toHaveLength(7);
    const final = await b.get(run.runId);
    expect(final.revision).toBe(run.revision + 1);
    expect(final.events.filter(record => record.reason === event.type)).toHaveLength(1);
    expect((await two.queue.get(command!.commandId))?.completionEvent).toEqual(event);
  });
});
