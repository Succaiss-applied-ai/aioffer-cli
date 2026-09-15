import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayRequestError } from "./gateway-errors.js";
import { createApplicationGatewaySidecar } from "./sidecar.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("AI-facing MCP transport", () => {
  it("negotiates Streamable HTTP and exposes runtime-aware tools", async () => {
    const { app } = createApplicationGatewaySidecar({
      accessToken: "mcp-token",
      tenantId: "tenant-mcp"
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");
    const base = `http://127.0.0.1:${address.port}/automation`;
    const headers = {
      Authorization: "Bearer mcp-token",
      "X-Tenant-Id": "tenant-mcp",
      "X-User-Id": "user-mcp"
    };
    const pairing = await fetch(`${base}/application-gateway/v1/me/device-pairing-sessions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "MCP 测试设备" })
    }).then((response) => response.json()) as Record<string, any>;
    const exchanged = await fetch(`${base}/device-bridge/v1/pairings:exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingCode: pairing.pairingCode,
        deviceId: "device-mcp",
        deviceName: "MCP 测试设备",
        runtimeVersion: "1.1.0",
        pluginInstalled: true,
        pluginVersion: "0.10.0"
      })
    }).then((response) => response.json()) as Record<string, any>;
    await fetch(`${base}/device-bridge/v1/devices/device-mcp/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${exchanged.deviceToken}`,
        "X-Tenant-Id": "tenant-mcp",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: "user-mcp",
        runtimeVersion: "1.0.0",
        pluginInstalled: true,
        pluginVersion: "0.9.11"
      })
    });

    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers }
    });
    const client = new Client({ name: "ai-side-test", version: "1.0.0" });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("recruiting.get_runtime_status");
    expect(tools.tools.map((tool) => tool.name)).toContain("recruiting.start_application");
    expect(tools.tools.map((tool) => tool.name)).toContain("recruiting.create_device_pairing");
    const status = await client.callTool({ name: "recruiting.get_runtime_status", arguments: {} });
    expect((status.structuredContent as Record<string, any>).runtime.items).toEqual([
      expect.objectContaining({ deviceId: "device-mcp", state: "ready" })
    ]);
    expect((status.structuredContent as Record<string, any>).runtime).not.toHaveProperty("readyDeviceId");
    expect(transport.protocolVersion).toBe("2025-11-25");
    await transport.close();
  });
});


describe("MCP infrastructure failures", () => {
  it.each([
    [Object.assign(new Error("SELECT secret FROM credentials postgresql://user:private-password@db"), { code: "55P03" }), "GATEWAY_TEMPORARILY_UNAVAILABLE", true],
    [Object.assign(new Error("private query and parameter"), { code: "57014" }), "GATEWAY_TEMPORARILY_UNAVAILABLE", true],
    [new Error("timeout exceeded when trying to connect"), "GATEWAY_TEMPORARILY_UNAVAILABLE", true],
    [Object.assign(new Error("SELECT secret FROM credentials"), { code: "42601" }), "GATEWAY_STORAGE_ERROR", false],
    [new GatewayRequestError("IDEMPOTENCY_CONFLICT", "请求内容不一致", 409), "IDEMPOTENCY_CONFLICT", false]
  ] as const)("returns safe structured tool errors for %s", async (failure, code, retryable) => {
    const sidecar = createApplicationGatewaySidecar({ accessToken: "mcp-token", tenantId: "tenant-mcp", autoApplySweepIntervalMs: 0 });
    const spy = vi.spyOn(sidecar.devices, "list").mockRejectedValue(failure);
    const server = sidecar.app.listen(0, "127.0.0.1"); servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/automation/mcp`), {
      requestInit: { headers: { Authorization: "Bearer mcp-token", "X-Tenant-Id": "tenant-mcp", "X-User-Id": "user-mcp" } }
    });
    const client = new Client({ name: "mcp-error-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const response = await client.callTool({ name: "recruiting.get_runtime_status", arguments: {} });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: false, error: { code, retryable } });
      expect(JSON.stringify(response)).not.toMatch(/SELECT|private-password|postgresql:|private query/);
    } finally { spy.mockRestore(); await transport.close(); }
  });
});
