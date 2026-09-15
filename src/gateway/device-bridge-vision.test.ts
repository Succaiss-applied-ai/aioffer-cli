import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApplicationGatewaySidecar } from "./sidecar.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function listen() {
  const { app } = createApplicationGatewaySidecar({
    accessToken: "gateway-token",
    tenantId: "tenant-vision"
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试端口不可用");
  return `http://127.0.0.1:${address.port}/automation`;
}

async function pair(base: string) {
  const headers = {
    Authorization: "Bearer gateway-token",
    "X-Tenant-Id": "tenant-vision",
    "X-User-Id": "user-vision",
    "Content-Type": "application/json"
  };
  const pairing = await fetch(`${base}/application-gateway/v1/me/device-pairing-sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ deviceName: "Vision test device" })
  }).then((response) => response.json()) as Record<string, any>;
  return await fetch(`${base}/device-bridge/v1/pairings:exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairingCode: pairing.pairingCode,
      deviceId: "device-vision",
      deviceName: "Vision test device",
      runtimeVersion: "1.1.0",
      pluginInstalled: true,
      pluginVersion: "0.11.0",
      capabilities: ["manual_copy", "assisted_rpa", "vision_rpa"]
    })
  }).then((response) => response.json()) as Record<string, any>;
}

describe("device bridge vision RPA", () => {
  it("exposes device-token protected zhencai capabilities and safe fallback plans", async () => {
    const base = await listen();
    const exchanged = await pair(base);
    const deviceHeaders = {
      Authorization: `Bearer ${exchanged.deviceToken}`,
      "X-Tenant-Id": "tenant-vision",
      "Content-Type": "application/json"
    };

    const unauthorized = await fetch(`${base}/device-bridge/v1/vision/capabilities`);
    expect(unauthorized.status).toBe(401);

    const capabilities = await fetch(`${base}/device-bridge/v1/vision/capabilities`, {
      headers: deviceHeaders
    }).then((response) => response.json()) as Record<string, any>;
    expect(capabilities.providerCode).toBe("zhencai");
    expect(capabilities.mode).toBe("server_managed_model");
    expect(capabilities.actionPolicy.finalSubmitRequiresAiSideConfirmation).toBe(true);

    const session = await fetch(`${base}/device-bridge/v1/vision/sessions`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ providerCode: "zhencai" })
    }).then((response) => response.json()) as Record<string, any>;
    expect(session.schemaVersion).toBe("vision-rpa-session.v1");

    const plan = await fetch(`${base}/device-bridge/v1/vision/sessions/${session.sessionId}/plan`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        schemaVersion: "vision-form-plan-request.v1",
        providerCode: "zhencai",
        task: "select_resume_parser_action",
        observation: {
          actions: [{ actionId: "a1", text: "解析并覆盖", kind: "resume_parse", risk: "safe" }]
        },
        screenshot: null
      })
    }).then((response) => response.json()) as Record<string, any>;
    expect(plan.schemaVersion).toBe("vision-form-action-plan.v1");
    expect(plan.configured).toBe(false);
    expect(plan.next).toBe("manual_copy");
    expect(plan.actions).toEqual([]);
    expect(plan.warnings.join(" ")).toContain("zhencai");
  });
});
