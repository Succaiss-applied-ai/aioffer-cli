import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApplicationGatewaySidecar } from "./sidecar.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("application gateway sidecar HTTP flow", () => {
  it("queues legacy commands for a paired device and converts results to business state", async () => {
    const { app } = createApplicationGatewaySidecar({ accessToken: "test-token" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");
    const base = `http://127.0.0.1:${address.port}/automation`;
    const headers = {
      Authorization: "Bearer test-token",
      "X-Tenant-Id": "tenant-1",
      "X-User-Id": "user-1",
      "Content-Type": "application/json"
    };

    const pairingResponse = await fetch(`${base}/application-gateway/v1/me/device-pairing-sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ deviceName: "测试设备" })
    });
    expect(pairingResponse.status).toBe(201);
    const pairing = await pairingResponse.json() as Record<string, any>;
    const exchangeResponse = await fetch(`${base}/device-bridge/v1/pairings:exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingCode: pairing.pairingCode,
        deviceId: "device-1",
        deviceName: "测试设备",
        runtimeVersion: "1.1.0",
        pluginInstalled: true,
        pluginVersion: "0.10.0"
      })
    });
    expect(exchangeResponse.status).toBe(201);
    const exchange = await exchangeResponse.json() as Record<string, any>;
    const deviceHeaders = {
      Authorization: `Bearer ${exchange.deviceToken}`,
      "X-Tenant-Id": "tenant-1",
      "Content-Type": "application/json"
    };
    const gatewayTokenCannotActAsDevice = await fetch(`${base}/device-bridge/v1/devices/device-1/heartbeat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ pluginInstalled: true, pluginVersion: "0.10.0" })
    });
    expect(gatewayTokenCannotActAsDevice.status).toBe(401);

    const heartbeat = await fetch(`${base}/device-bridge/v1/devices/device-1/heartbeat`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        userId: "user-1",
        runtimeVersion: "1.0.0",
        pluginInstalled: true,
        pluginVersion: "0.9.11"
      })
    });
    expect(heartbeat.status).toBe(200);

    const missingDeviceResponse = await fetch(`${base}/application-gateway/v1/application-runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tenantId: "tenant-1", userId: "user-1" })
    });
    expect(missingDeviceResponse.status).toBe(422);
    expect(await missingDeviceResponse.json()).toMatchObject({ code: "DEVICE_ID_REQUIRED" });

    const createdResponse = await fetch(`${base}/application-gateway/v1/application-runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: "application-run-request.v1",
        tenantId: "tenant-1",
        userId: "user-1",
        deviceId: "device-1",
        idempotencyKey: "run-1",
        job: {
          jobId: "job-1",
          companyName: "小鹏汽车",
          title: "后端开发工程师",
          city: "广州",
          applicationUrl: "https://xiaopeng.jobs.feishu.cn/index/resume/1/apply"
        },
        candidate: { profileRef: "profile-1", snapshotVersion: "1" },
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
    const created = await createdResponse.json() as Record<string, unknown>;
    expect(created.status).toBe("running");
    const runId = String(created.runId);

    const claimOpen = await fetch(`${base}/device-bridge/v1/devices/device-1/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-1" })
    });
    expect(claimOpen.status).toBe(200);
    const openCommand = await claimOpen.json() as Record<string, any>;
    expect(openCommand.command.type).toBe("browser.open_manual_application");

    const openResult = await fetch(`${base}/device-bridge/v1/commands/${openCommand.commandId}/results`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        deviceId: "device-1",
        event: {
          schemaVersion: "ai-plugin-event.v1",
          type: "browser.application_opened",
          status: "completed",
          payload: { tabId: 42 }
        }
      })
    });
    expect(openResult.status).toBe(200);

    const claimObserve = await fetch(`${base}/device-bridge/v1/devices/device-1/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-1" })
    });
    const observeCommand = await claimObserve.json() as Record<string, any>;
    expect(observeCommand.command.type).toBe("browser.observe_visual_rpa_state");
    expect(observeCommand.command.payload.tabId).toBe(42);

    await fetch(`${base}/device-bridge/v1/commands/${observeCommand.commandId}/results`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        deviceId: "device-1",
        event: {
          schemaVersion: "ai-plugin-event.v1",
          type: "browser.login_required",
          status: "waiting_for_user",
          payload: { tabId: 42 }
        }
      })
    });

    const statusResponse = await fetch(`${base}/application-gateway/v1/application-runs/${runId}`, {
      headers
    });
    const status = await statusResponse.json() as Record<string, any>;
    expect(status.status).toBe("waiting_for_user_action");
    expect(status.events.at(-1)).toMatchObject({
      type: "user_action_required",
      reason: "login_required"
    });
  });
});
