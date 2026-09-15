import { describe, it, expect, vi } from "vitest";
import {
  complete,
  providers,
  validateEndpoint,
  parseModelJson,
} from "./providers.js";
describe("用户自带视觉模型", () => {
  it.each(Object.keys(providers))(
    "%s 使用选定协议且不转发凭据到重定向",
    async (name) => {
      const p = name as keyof typeof providers;
      const fetcher = vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: '{"ok":true}' } }],
          content: [{ type: "text", text: '{"ok":true}' }],
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
      );
      const result = await complete(
        {
          provider: p,
          baseUrl: providers[p].baseUrl || "https://model.example/v1",
          model: "vision-test",
          apiKey: "test-only-not-real",
        },
        {
          system: "中文提示",
          text: "识别图片",
          image: "data:image/png;base64,YWJj",
        },
        fetcher as typeof fetch,
      );
      expect(parseModelJson(result)).toEqual({ ok: true });
      const [url, init] = fetcher.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(init.redirect).toBe("error");
      expect(url).not.toContain("test-only");
      expect(JSON.parse(init.body as string)).toBeTruthy();
      expect(JSON.stringify(init.body)).toContain(
        providers[p].protocol === "gemini"
          ? "inlineData"
          : providers[p].protocol === "anthropic"
            ? "base64"
            : "image_url",
      );
    },
  );
  it("拒绝云端、明文远端、凭据地址和远程图片", async () => {
    for (const url of [
      "http://model.example/v1",
      "https://aioffer.succaiss.com",
      "https://u:p@api.example/v1",
      "https://api.example/v1?key=secret",
    ])
      expect(() => validateEndpoint(url)).toThrow();
    expect(() => validateEndpoint("http://127.0.0.1:9999/v1")).not.toThrow();
    await expect(
      complete(
        {
          provider: "qwen",
          baseUrl: providers.qwen.baseUrl,
          model: "test",
          apiKey: "test",
        },
        { system: "", text: "", image: "https://evil.example/image" },
      ),
    ).rejects.toThrow("内联图片");
  });
  it("错误不回显厂商响应中的密钥和简历", async () => {
    await expect(
      complete(
        {
          provider: "qwen",
          baseUrl: providers.qwen.baseUrl,
          model: "test",
          apiKey: "test",
        },
        { system: "", text: "" },
        async () => new Response("private resume or secret", { status: 401 }),
      ),
    ).rejects.toThrow("模型 HTTP 401；请检查模型权限、额度和 API 地址");
  });
});
