import { describe, expect, it } from "vitest";
import type { ModelInvoker } from "./model-config.js";
import { ModelRouter, OpenAICompatibleInvoker } from "./model-config.js";

describe("model routing", () => {
  it("routes text and vision work without binding business logic to a provider", async () => {
    const invoker: ModelInvoker = {
      async invoke(config) {
        return `used:${config.model}`;
      }
    };
    const router = new ModelRouter(
      {
        routes: { formUnderstanding: "vision" },
        models: {
          vision: {
            provider: "qwen-compatible",
            model: "configured-vision-model",
            modalities: ["text", "image"],
            credentialEnv: "TEST_KEY"
          }
        }
      },
      { "qwen-compatible": invoker }
    );
    await expect(
      router.invoke({
        route: "formUnderstanding",
        system: "classify",
        input: "page",
        imageDataUrls: ["data:image/png;base64,AA=="]
      })
    ).resolves.toEqual({
      text: "used:configured-vision-model",
      modelKey: "vision"
    });
  });

  it("calls a local OpenAI-compatible service without requiring an API key", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const invoker = new OpenAICompatibleInvoker(
      () => undefined,
      async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "连接成功" } }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );
    const text = await invoker.invoke(
      {
        provider: "openai-compatible",
        model: "qwen-local",
        modalities: ["text"],
        baseUrl: "http://127.0.0.1:11434/v1",
        timeoutMs: 5_000
      },
      { route: "searchPlanning", system: "test", input: "ping" }
    );
    expect(text).toBe("连接成功");
    expect(requests[0]?.url).toBe(
      "http://127.0.0.1:11434/v1/chat/completions"
    );
    expect(requests[0]?.init?.headers).not.toHaveProperty("authorization");
  });

  it("declares authentication errors returned by a unified model gateway", async () => {
    const invoker = new OpenAICompatibleInvoker(
      () => "bad-key",
      async () => new Response("invalid token", { status: 401 })
    );
    await expect(
      invoker.invoke(
        {
          provider: "openai-compatible",
          model: "qwen-plus",
          modalities: ["text"],
          baseUrl: "https://models.example.com/v1",
          credentialEnv: "MODEL_KEY",
          timeoutMs: 5_000
        },
        { route: "searchPlanning", system: "test", input: "ping" }
      )
    ).rejects.toMatchObject({
      publicError: { code: "MODEL_AUTH_FAILED", retryable: false }
    });
  });
});
