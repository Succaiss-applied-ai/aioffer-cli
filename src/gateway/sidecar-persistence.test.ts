import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { describe, expect, it } from "vitest";
import { createApplicationGatewaySidecar } from "./sidecar.js";

async function listen(dataDir: string): Promise<{ server: Server; base: string }> {
  const { app } = createApplicationGatewaySidecar({ accessToken: "persist-token", dataDir });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试端口不可用");
  return { server, base: `http://127.0.0.1:${address.port}/automation` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

describe("application gateway disk persistence", () => {
  it("survives restarts from task creation through final confirmation", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "recruiting-gateway-persistence-"));
    const headers = {
      Authorization: "Bearer persist-token",
      "X-Tenant-Id": "tenant-persist",
      "X-User-Id": "user-persist",
      "Content-Type": "application/json"
    };

    let current = await listen(dataDir);
    const pairing = await fetch(`${current.base}/application-gateway/v1/me/device-pairing-sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ deviceName: "持久化设备" })
    }).then((response) => response.json()) as Record<string, any>;
    const exchanged = await fetch(`${current.base}/device-bridge/v1/pairings:exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingCode: pairing.pairingCode,
        deviceId: "device-persist",
        deviceName: "持久化设备",
        runtimeVersion: "1.1.0",
        pluginInstalled: true,
        pluginVersion: "0.10.0"
      })
    }).then((response) => response.json()) as Record<string, any>;
    const deviceHeaders = {
      Authorization: `Bearer ${exchanged.deviceToken}`,
      "X-Tenant-Id": "tenant-persist",
      "Content-Type": "application/json"
    };
    await fetch(`${current.base}/device-bridge/v1/devices/device-persist/heartbeat`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        userId: "user-persist",
        runtimeVersion: "1.0.0",
        pluginInstalled: true,
        pluginVersion: "0.9.11"
      })
    });
    const createdResponse = await fetch(`${current.base}/application-gateway/v1/application-runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: "application-run-request.v1",
        tenantId: "tenant-persist",
        userId: "user-persist",
        deviceId: "device-persist",
        idempotencyKey: "persist-run-1",
        job: {
          jobId: "job-persist",
          companyName: "测试公司",
          title: "后端开发工程师",
          city: "深圳",
          applicationUrl: "https://example.com/apply"
        },
        candidate: { profileRef: "profile-persist", snapshotVersion: "1" },
        assets: [],
        executionPolicy: {
          mode: "manual_copy",
          allowAutoFill: false,
          allowSiteResumeParser: true,
          allowFinalSubmit: false
        }
      })
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as Record<string, any>;
    const runId = String(created.runId);
    expect(created.request.deviceId).toBe("device-persist");
    await close(current.server);

    current = await listen(dataDir);
    const recovered = await fetch(`${current.base}/application-gateway/v1/application-runs/${runId}`, { headers });
    expect(recovered.status).toBe(200);
    expect((await recovered.json() as Record<string, unknown>).status).toBe("running");
    const openClaim = await fetch(`${current.base}/device-bridge/v1/devices/device-persist/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-persist" })
    });
    const openCommand = await openClaim.json() as Record<string, any>;
    expect(openCommand.command.type).toBe("browser.open_manual_application");
    await fetch(`${current.base}/device-bridge/v1/commands/${openCommand.commandId}/results`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        deviceId: "device-persist",
        event: {
          schemaVersion: "ai-plugin-event.v1",
          type: "browser.application_opened",
          status: "completed",
          payload: { tabId: 42 }
        }
      })
    });
    await close(current.server);

    current = await listen(dataDir);
    const observeClaim = await fetch(`${current.base}/device-bridge/v1/devices/device-persist/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-persist" })
    });
    const observeCommand = await observeClaim.json() as Record<string, any>;
    expect(observeCommand.command.type).toBe("browser.observe_visual_rpa_state");
    expect(observeCommand.command.payload.tabId).toBe(42);
    await fetch(`${current.base}/device-bridge/v1/commands/${observeCommand.commandId}/results`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        deviceId: "device-persist",
        event: {
          schemaVersion: "ai-plugin-event.v1",
          type: "browser.form_readback",
          status: "completed",
          payload: { tabId: 42, readbackHash: "sha256:page-readback", submitAction: { actionId: "submit" } }
        }
      })
    });
    await close(current.server);

    current = await listen(dataDir);
    const reviewResponse = await fetch(`${current.base}/application-gateway/v1/application-runs/${runId}`, { headers });
    const review = await reviewResponse.json() as Record<string, any>;
    expect(review.status).toBe("review_required");
    const confirmationResponse = await fetch(`${current.base}/application-gateway/v1/application-runs/${runId}/confirmations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: "application-confirmation.v1",
        confirmationId: review.confirmation.confirmationId,
        reviewHash: review.confirmation.reviewHash,
        confirmedByUser: true
      })
    });
    expect(confirmationResponse.status).toBe(200);
    const submitClaim = await fetch(`${current.base}/device-bridge/v1/devices/device-persist/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-persist" })
    });
    const submitCommand = await submitClaim.json() as Record<string, any>;
    expect(submitCommand.command.type).toBe("browser.submit_application_after_ai_confirmation");
    expect(submitCommand.command.payload.tabId).toBe(42);
    expect(submitCommand.command.payload.readbackHash).toBe("sha256:page-readback");
    await fetch(`${current.base}/device-bridge/v1/commands/${submitCommand.commandId}/results`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        deviceId: "device-persist",
        event: {
          schemaVersion: "ai-plugin-event.v1",
          type: "browser.final_submit_executed",
          status: "completed",
          payload: { receiptId: "receipt-1" }
        }
      })
    });
    await close(current.server);

    current = await listen(dataDir);
    const completed = await fetch(`${current.base}/application-gateway/v1/application-runs/${runId}`, { headers });
    expect((await completed.json() as Record<string, unknown>).status).toBe("completed");
    await close(current.server);
  }, 20_000);
});
