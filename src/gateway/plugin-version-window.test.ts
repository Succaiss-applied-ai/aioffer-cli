import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApplicationGatewaySidecar } from "./sidecar.js";
import { CURRENT_AUTO_APPLY_PLUGIN_VERSION, PREVIOUS_AUTO_APPLY_PLUGIN_VERSIONS,
  MINIMUM_AUTO_APPLY_PLUGIN_VERSION, PLUGIN_UPDATE_MESSAGE, pluginVersionAtLeast } from "./device-registry.js";
import { PgGatewayDatabase } from "./postgres-storage.js";
import type { DeviceCommandEnqueueInput } from "./device-command-queue.js";

const identity = { tenantId: "tenant-version", userId: "user-version", deviceId: "version-device" };
function command(id: string, type = "browser.execute_batch_auto_apply_job"): DeviceCommandEnqueueInput {
  return { commandId: id, runId: `run-${id}`, tenantId: identity.tenantId, userId: identity.userId,
    targetDeviceId: identity.deviceId, command: { schemaVersion: "ai-plugin-command.v1", commandId: id,
      conversationId: id, tenantId: identity.tenantId, userId: identity.userId, issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(), type, idempotencyKey: id,
      requiresUserGesture: false, payload: {}, safety: { allowFinalSubmit: false, allowConsentClick: false, allowCaptchaHandling: false } } };
}

describe("stable v1 plugin compatibility across releases", () => {
  it.each([CURRENT_AUTO_APPLY_PLUGIN_VERSION, ...PREVIOUS_AUTO_APPLY_PLUGIN_VERSIONS, "0.15.112", "0.15.113", "0.15.114", "0.15.115", "0.15.116", "0.16.0", "1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4", `${MINIMUM_AUTO_APPLY_PLUGIN_VERSION}.1`, "1.1.0"])("admits %s", version => {
    expect(pluginVersionAtLeast(version)).toBe(true);
  });
  it.each(["0.15.111", "0.15.110", "0.15.108", "0.15.9", "0.14.999", "invalid", "0.15.113-rc.5", "", null])( "rejects %s", version => {
    expect(pluginVersionAtLeast(version)).toBe(false);
  });
  it("compares semantic components across release lines", () => {
    expect(pluginVersionAtLeast("1.0.0", "0.99.999")).toBe(true);
    expect(pluginVersionAtLeast("0.99.999", "1.0.0")).toBe(false);
  });
  it.each(["memory", "json"])("checks %s claims before queue mutation and preserves running work", async storage => {
    const directory = await mkdtemp(join(tmpdir(), "plugin-version-window-"));
    const sidecar = createApplicationGatewaySidecar({ accessToken: "test-api-token", autoApplySweepIntervalMs: 0,
      ...(storage === "json" ? { dataDir: directory } : {}) });
    const server = sidecar.app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
    const base = `http://127.0.0.1:${address.port}/automation`;
    const bootstrap = await sidecar.pairings.createBootstrap(identity);
    const pairing = await sidecar.pairings.exchangeBootstrap({ bootstrapToken: bootstrap.bootstrapToken, deviceId: identity.deviceId });
    const headers = { Authorization: `Bearer ${pairing.deviceToken}`, "Content-Type": "application/json" };
    const register = (pluginVersion: string) => sidecar.devices.register({ ...identity, pluginVersion, pluginInstalled: true,
      capabilities: ["account_logout_fence.v1", "batch_auto_apply.v1"] });
    const post = (path: string, body: unknown = {}) => fetch(`${base}/device-bridge/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    try {
      await register(MINIMUM_AUTO_APPLY_PLUGIN_VERSION);
      await sidecar.queue.enqueue(command("running"));
      expect((await post(`devices/${identity.deviceId}/commands/claim`)).status).toBe(200);
      await register("0.15.110");
      await sidecar.queue.enqueue(command("queued"));
      const recover = vi.spyOn(sidecar.autoApply, "recoverDeviceQueue");
      const blocked = await post(`devices/${identity.deviceId}/commands/claim`);
      expect(blocked.status).toBe(409);
      expect(await blocked.json()).toMatchObject({ code: "PLUGIN_UPDATE_REQUIRED", message: PLUGIN_UPDATE_MESSAGE, retryable: false,
        nextAction: "update_plugin", details: { currentVersion: "0.15.110", minimumVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION } });
      expect(recover).not.toHaveBeenCalled();
      expect(await sidecar.queue.get("queued")).toMatchObject({ status: "queued", claimedBy: null, targetDeviceId: identity.deviceId });
      expect((await post("commands/running/lease", { deviceId: identity.deviceId })).status).toBe(200);
      const result = { schemaVersion: "ai-plugin-event.v1" as const, type: "browser.batch_auto_apply_job_completed", status: "completed" as const, payload: {} };
      // Actual completion ownership checks still execute in the queue; isolate only the batch fixture.
      const completion = vi.spyOn(sidecar.autoApply, "completeCommandResult").mockImplementation(async (id, device, event) => {
        await sidecar.queue.complete(id, device, event);
        return { batchId: "batch-version", status: "completed" } as Awaited<ReturnType<typeof sidecar.autoApply.completeCommandResult>>;
      });
      expect((await post("commands/running/results", { deviceId: identity.deviceId, event: result })).status).toBe(200);
      expect(completion).toHaveBeenCalledOnce();
      expect(await sidecar.queue.get("running")).toMatchObject({ status: "completed", completionEvent: result });
      await sidecar.queue.enqueue(command("ordinary", "browser.observe_application_page"));
      const ordinary = await post(`devices/${identity.deviceId}/commands/claim`);
      expect(ordinary.status).toBe(200);
      expect(await ordinary.json()).toMatchObject({ commandId: "ordinary" });
      const state = await fetch(`${base}/auto-apply/v1/devices/${identity.deviceId}`, { headers: {
        Authorization: "Bearer test-api-token", "X-Tenant-Id": identity.tenantId, "X-User-Id": identity.userId } });
      expect(await state.json()).toMatchObject({ updateRequired: true, updateMessage: PLUGIN_UPDATE_MESSAGE,
        latestPluginVersion: CURRENT_AUTO_APPLY_PLUGIN_VERSION, compatiblePreviousPluginVersions: PREVIOUS_AUTO_APPLY_PLUGIN_VERSIONS });
      await register("1.0.3");
      const allowed = await post(`devices/${identity.deviceId}/commands/claim`);
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toMatchObject({ commandId: "queued" });
      expect((await post("commands/queued/results", { deviceId: identity.deviceId, event: result })).status).toBe(200);
      for (const version of ["0.15.112", "0.15.115", "0.15.116", "1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4", "1.0.5", "1.0.6"]) {
        await register(version);
        const status = await fetch(base + "/auto-apply/v1/devices/" + identity.deviceId, { headers: {
          Authorization: "Bearer test-api-token", "X-Tenant-Id": identity.tenantId, "X-User-Id": identity.userId } });
        expect(await status.json()).toMatchObject({ status: "ready", pluginVersion: version, updateRequired: false });
        const id = "legacy-" + version;
        await sidecar.queue.enqueue(command(id));
        const claimed = await post("devices/" + identity.deviceId + "/commands/claim");
        expect(claimed.status).toBe(200);
        expect(await claimed.json()).toMatchObject({ commandId: id });
        expect((await post("commands/" + id + "/lease", { deviceId: identity.deviceId })).status).toBe(200);
        expect((await post("commands/" + id + "/results", { deviceId: identity.deviceId, event: result })).status).toBe(200);
        expect(await sidecar.queue.get(id)).toMatchObject({ status: "completed", claimedBy: identity.deviceId });
      }
      await sidecar.devices.register({ ...identity, pluginVersion: CURRENT_AUTO_APPLY_PLUGIN_VERSION,
        pluginInstalled: true, capabilities: ["batch_auto_apply.v1"] });
      await sidecar.queue.enqueue(command("missing-core-capability"));
      const missingCapability = await post("devices/" + identity.deviceId + "/commands/claim");
      expect(missingCapability.status).toBe(409);
      expect(await missingCapability.json()).toMatchObject({ code: "PLUGIN_UPDATE_REQUIRED", retryable: false });
      expect(await sidecar.queue.get("missing-core-capability")).toMatchObject({ status: "queued", claimedBy: null });

    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await sidecar.runtime.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.skipIf(!process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL)("creates, dispatches and settles old v1 batches through PostgreSQL", async () => {
    const databaseUrl = process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL!;
    if (!new URL(databaseUrl).pathname.startsWith("/recruiting_gateway_test_")) throw new Error("Requires an isolated test database");
    const database = new PgGatewayDatabase(databaseUrl, { maxConnections: 4 });
    await database.migrate();
    const id = { tenantId: "legacy-" + randomUUID(), userId: randomUUID(), deviceId: randomUUID() };
    const sidecar = createApplicationGatewaySidecar({ accessToken: "test-api-token", autoApplySigningSecret: "synthetic-compatibility-signing-key", database, autoApplySweepIntervalMs: 0 });
    const server = sidecar.app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
    const base = "http://127.0.0.1:" + address.port + "/automation";
    const bootstrap = await sidecar.pairings.createBootstrap(id);
    const pairing = await sidecar.pairings.exchangeBootstrap({ bootstrapToken: bootstrap.bootstrapToken, deviceId: id.deviceId });
    const deviceHeaders = { Authorization: "Bearer " + pairing.deviceToken, "Content-Type": "application/json" };
    const apiHeaders = { Authorization: "Bearer test-api-token", "X-Tenant-Id": id.tenantId, "X-User-Id": id.userId, "Content-Type": "application/json" };
    const post = (path: string, body: unknown) => fetch(base + "/device-bridge/v1/" + path, { method: "POST", headers: deviceHeaders, body: JSON.stringify(body) });
    try {
      for (const version of ["0.15.112", "0.15.115", "0.15.116", "1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4", "1.0.5", "1.0.6"]) {
        await sidecar.devices.register({ ...id, pluginInstalled: true, pluginVersion: version, capabilities: ["account_logout_fence.v1", "batch_auto_apply.v1"] });
        const body = {
          schemaVersion: "auto-apply-batch-request.v1", deviceId: id.deviceId,
          candidate: { packageRef: "synthetic", packageVersion: "1", packageSha256: "a".repeat(64),
            applicationProfile: { schemaVersion: "candidate-application-profile.v1", revision: "b".repeat(64), facts: [] } },
          assets: [{ assetId: "resume", purpose: "resume", fileRef: "https://fixture.invalid/resume.pdf",
            name: "synthetic.pdf", mediaType: "application/pdf", sha256: "c".repeat(64) }],
          jobs: [{ jobId: "synthetic", companyName: "Synthetic", title: "Synthetic",
            applicationUrl: "https://fixture.invalid/job", tags: ["application_access:public"], answers: {} }],
          confirmation: { scope: "batch", confirmedByUser: true, confirmedAt: new Date().toISOString(),
            displayedJobIds: ["synthetic"], allowAutomaticFinalSubmit: true },
          executionPolicy: { loginPolicy: "skip_and_report", concurrency: 1, retryBeforeSubmit: 1,
            captchaPolicy: "skip_and_report", missingInformationPolicy: "skip_and_report", ambiguousConsentPolicy: "skip_and_report" }
        };
        const created = await fetch(base + "/auto-apply/v1/batches", { method: "POST",
          headers: { ...apiHeaders, "Idempotency-Key": version }, body: JSON.stringify(body) });
        expect(created.status, await created.clone().text()).toBe(201);
        const batch = await created.json();
        const claimed = await post("devices/" + id.deviceId + "/commands/claim", {});
        expect(claimed.status).toBe(200);
        const claim = await claimed.json();
        expect((await post("commands/" + claim.commandId + "/lease", { deviceId: id.deviceId })).status).toBe(200);
        const event = { schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
          payload: { autoApplyResult: { schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId,
            batchJobId: batch.jobs[0].batchJobId, jobId: "synthetic", status: "succeeded", reasonCode: null,
            occurredAt: new Date().toISOString(), evidence: { redacted: true, siteConfirmation: "synthetic ACK only" } } } };
        const receipt = await post("commands/" + claim.commandId + "/results", { deviceId: id.deviceId, event });
        expect(receipt.status).toBe(200);
        expect(await sidecar.queue.get(claim.commandId)).toMatchObject({ status: "completed", claimedBy: id.deviceId });
        expect((await sidecar.autoApply.get(batch.batchId, id)).jobs[0]?.status).toBe("succeeded");
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await sidecar.runtime.stop();
      await database.close();
    }
  });

});
