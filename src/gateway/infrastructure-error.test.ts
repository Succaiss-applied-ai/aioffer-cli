import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { gatewayInfrastructureError } from "./infrastructure-error.js";
import { GatewayRequestError } from "./gateway-errors.js";
import { createDeviceBridgeRouter } from "./device-bridge-router.js";
import { createAutoApplyRouter } from "./auto-apply-router.js";
import { createApplicationGatewayRouter } from "./http-router.js";
import type { ApplicationGateway } from "./application-gateway.js";
import type { AutoApplyService } from "./auto-apply-service.js";
import type { DeviceCommandQueue } from "./device-command-queue.js";
import type { DeviceRegistry } from "./device-registry.js";
import type { DevicePairingRegistry } from "./device-pairing.js";

const privateDetail = "SELECT password FROM credentials; postgresql://private-user:private-password@private-db";
const pgError = (code: string) => Object.assign(new Error(privateDetail), { code, severity: "ERROR" });
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

async function serve(error: unknown, authError = false) {
  const app = express(); app.use(express.json());
  const fail = async () => { throw error; };
  const gateway = { get: fail } as unknown as ApplicationGateway;
  const devices = { get: fail, register: fail } as unknown as DeviceRegistry;
  const pairings = { authenticate: authError ? fail : async () => ({ tenantId: "tenant", userId: "user", deviceId: "device" }) } as unknown as DevicePairingRegistry;
  app.use("/device", createDeviceBridgeRouter({} as DeviceCommandQueue, gateway, devices, pairings));
  app.use("/auto", createAutoApplyRouter({} as AutoApplyService, devices, pairings));
  app.use("/application", createApplicationGatewayRouter(gateway));
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test listener unavailable");
  return `http://127.0.0.1:${address.port}`;
}
const headers = { "X-Tenant-Id": "tenant", "X-User-Id": "user", Authorization: "Bearer fixture", "Content-Type": "application/json" };
const routes = [
  ["device", "/device/devices/device/heartbeat", "POST"],
  ["auto", "/auto/devices/device", "GET"],
  ["application", "/application/application-runs/run", "GET"]
] as const;

describe("Gateway infrastructure error classification", () => {
  it.each(["55P03", "57014", "40001", "40P01", "53300", "57P01", "57P02", "57P03", "08006", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"])(
    "marks %s as retryable service unavailability without returning database details", code => {
      expect(gatewayInfrastructureError(pgError(code))).toMatchObject({ status: 503, retryable: true, code: "GATEWAY_TEMPORARILY_UNAVAILABLE" });
      expect(gatewayInfrastructureError(pgError(code))?.message).not.toContain("private");
    }
  );
  it.each(["timeout exceeded when trying to connect", "Connection terminated due to connection timeout", "Connection terminated unexpectedly"])(
    "recognizes pg-pool failures without SQLSTATE: %s", message => {
      expect(gatewayInfrastructureError(new Error(message))).toMatchObject({ status: 503, retryable: true });
    }
  );
  it("recognizes a nested transport failure but keeps explicit business errors intact", () => {
    expect(gatewayInfrastructureError(new Error("adapter wrapper", { cause: pgError("55P03") }))).toMatchObject({ status: 503 });
    expect(gatewayInfrastructureError(new GatewayRequestError("BUSINESS_CONFLICT", "业务冲突", 409))).toBeNull();
    expect(gatewayInfrastructureError(new Error("当前任务状态不可继续"))).toBeNull();
  });
  it("sanitizes a non-retryable PostgreSQL error as a server failure", () => {
    expect(gatewayInfrastructureError(pgError("42601"))).toMatchObject({ status: 500, retryable: false, code: "GATEWAY_STORAGE_ERROR" });
  });
});

describe("Gateway HTTP transient failure semantics", () => {
  it.each([pgError("55P03"), pgError("57014"), pgError("53300"), new Error("timeout exceeded when trying to connect")])(
    "returns 503/retryable across all public routers for $message", async error => {
      const base = await serve(error);
      for (const [name, path, method] of routes) {
        const response = await fetch(`${base}${path}`, { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });
        expect(response.status, name).toBe(503);
        const body = await response.json();
        expect(body).toMatchObject({ code: "GATEWAY_TEMPORARILY_UNAVAILABLE", retryable: true });
        expect(JSON.stringify(body)).not.toMatch(/SELECT|private-password|private-db|postgresql:/);
      }
    }
  );
  it("does not misreport an authentication database outage as invalid device credentials", async () => {
    const base = await serve(pgError("08006"), true);
    const response = await fetch(`${base}/device/devices/device/heartbeat`, { method: "POST", headers, body: "{}" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "GATEWAY_TEMPORARILY_UNAVAILABLE", retryable: true });
  });
  it("keeps existing business conflicts at 409 and never labels them retryable", async () => {
    const base = await serve(new Error("当前任务状态不可继续"));
    for (const [, path, method] of routes) {
      const response = await fetch(`${base}${path}`, { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ message: "当前任务状态不可继续", retryable: false });
    }
  });
  it("does not expose SQL details for nontransient storage failures", async () => {
    const base = await serve(pgError("23505"));
    for (const [, path, method] of routes) {
      const response = await fetch(`${base}${path}`, { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: "GATEWAY_STORAGE_ERROR", retryable: false });
    }
  });
});
