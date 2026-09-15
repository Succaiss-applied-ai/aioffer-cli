import { afterEach, describe, expect, it, vi } from "vitest";
import { VisionAgent } from "./vision-agent.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VisionAgent DashScope requests", () => {
  it("uses the configured Qwen model with non-thinking structured output", async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              next: "no_action",
              confidence: 1,
              actions: [],
              warnings: [],
              evidenceRefs: []
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const agent = new VisionAgent({
      baseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      model: "qwen3.7-flash",
      apiKey: "test-only"
    });
    const session = await agent.createSession({
      tenantId: "tenant",
      userId: "user",
      deviceId: "device"
    });

    await agent.plan(session.sessionId, {
      providerCode: "zhencai",
      task: "audit_form_readback",
      observation: {},
      screenshot: {
        mediaType: "image/png",
        dataUrl: "data:image/png;base64,AA=="
      },
      candidate: {},
      policy: {}
    }, {
      tenantId: "tenant",
      userId: "user",
      deviceId: "device"
    });

    expect(requestBody?.model).toBe("qwen3.7-flash");
    expect(requestBody?.enable_thinking).toBe(false);
    expect(requestBody?.response_format).toEqual({ type: "json_object" });
  });
});
