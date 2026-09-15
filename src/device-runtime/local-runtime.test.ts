import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { LegacyPluginEvent } from "../gateway/legacy-plugin-adapter.js";
import type {
  ClaimedDeviceCommand,
  DeviceGatewayPort
} from "./gateway-device-client.js";
import {
  createLocalRpaRuntimeApp,
  LocalRpaRuntime
} from "./local-runtime.js";

class FakeGateway implements DeviceGatewayPort {
  claims: ClaimedDeviceCommand[] = [];
  submissions: Array<{ commandId: string; event: LegacyPluginEvent }> = [];

  async heartbeat(): Promise<void> {}

  async claim(): Promise<ClaimedDeviceCommand | null> {
    return this.claims.shift() ?? null;
  }

  async submit(commandId: string, event: LegacyPluginEvent): Promise<void> {
    this.submissions.push({ commandId, event: structuredClone(event) });
  }
}

function command(): ClaimedDeviceCommand {
  return {
    schemaVersion: "device-command-claim.v1",
    commandId: "command-1",
    runId: "e609a4b4-5b2a-4529-8b1a-cb70e37867f4",
    leaseExpiresAt: "2026-08-07T10:05:00.000Z",
    command: {
      schemaVersion: "ai-plugin-command.v1",
      commandId: "command-1",
      conversationId: "conversation-1",
      tenantId: "tenant-1",
      userId: "user-1",
      issuedAt: "2026-08-07T10:00:00.000Z",
      expiresAt: "2026-08-07T10:05:00.000Z",
      type: "browser.open_manual_application",
      idempotencyKey: "command-1",
      requiresUserGesture: false,
      payload: { applicationUrl: "https://example.com/apply" },
      safety: {
        allowFinalSubmit: false,
        allowConsentClick: false,
        allowCaptchaHandling: false
      }
    }
  };
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("local RPA runtime", () => {
  it("leases one gateway command to the browser and forwards its plugin event", async () => {
    const gateway = new FakeGateway();
    gateway.claims.push(command());
    const runtime = new LocalRpaRuntime(gateway, {
      extensionId: "extension-1",
      localToken: "local-token"
    });
    await runtime.tick();
    expect(runtime.claimForBrowser()?.command.type).toBe("browser.open_manual_application");
    expect(runtime.claimForBrowser()).toBeNull();
    runtime.completeFromBrowser("command-1", {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.application_opened",
      status: "completed",
      payload: { tabId: 42 }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gateway.submissions).toEqual([expect.objectContaining({
      commandId: "command-1",
      event: expect.objectContaining({ type: "browser.application_opened" })
    })]);
  });

  it("serves a token-protected bridge page without changing the extension", async () => {
    const gateway = new FakeGateway();
    gateway.claims.push(command());
    const runtime = new LocalRpaRuntime(gateway, {
      extensionId: "cjpidfkekaofhnfdlgaomhodjpaoiaie",
      localToken: "local-token"
    });
    await runtime.tick();
    const app = createLocalRpaRuntimeApp(runtime, "cjpidfkekaofhnfdlgaomhodjpaoiaie");
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");
    const base = `http://127.0.0.1:${address.port}`;

    const page = await fetch(`${base}/bridge`).then((response) => response.text());
    expect(page).toContain("cjpidfkekaofhnfdlgaomhodjpaoiaie");
    expect(page).toContain("chrome.runtime.sendMessage");
    expect(page).toContain("RECRUITING_AI_BRIDGE_COMMAND");

    const unauthorized = await fetch(`${base}/bridge/commands/claim`, { method: "POST" });
    expect(unauthorized.status).toBe(401);
    const claimed = await fetch(`${base}/bridge/commands/claim`, {
      method: "POST",
      headers: {
        "X-Local-Bridge-Token": "local-token",
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    expect(claimed.status).toBe(200);
    expect((await claimed.json() as Record<string, any>).command.type)
      .toBe("browser.open_manual_application");
  });
});
