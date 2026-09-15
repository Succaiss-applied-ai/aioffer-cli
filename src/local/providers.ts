import { z } from "zod";

export const providers = {
  openai: {
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    label: "Anthropic Claude",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
  },
  gemini: {
    label: "Google Gemini",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  qwen: {
    label: "通义千问 / 百炼",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  doubao: {
    label: "豆包 / 火山方舟",
    protocol: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  },
  glm: {
    label: "智谱 GLM",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  },
  compatible: {
    label: "自定义 OpenAI-compatible",
    protocol: "openai",
    baseUrl: "",
  },
} as const;
export const modelConfigSchema = z.object({
  provider: z.enum([
    "openai",
    "anthropic",
    "gemini",
    "qwen",
    "doubao",
    "glm",
    "compatible",
  ]),
  baseUrl: z.string().url(),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).max(4096),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export interface CompletionInput {
  system: string;
  text: string;
  image?: string;
}

export function validateEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("API 地址不能包含凭据、查询参数或 fragment");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("模型 API 必须使用 HTTPS（本机 API 除外）");
  if (
    /(^|\.)succaiss\.com$/i.test(url.hostname) ||
    ["119.29.25.120", "119.45.12.68", "182.61.133.130", "192.168.0.2"].includes(
      url.hostname,
    )
  )
    throw new Error("本项目不连接 AI Offer 云端");
  return url;
}

function imageParts(image: string) {
  const match =
    /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(
      image,
    );
  if (!match || image.length > 8_000_000)
    throw new Error("只接受大小受限的内联图片");
  return { mimeType: match[1]!, data: match[2]! };
}
export function parseModelJson(text: string): Record<string, unknown> {
  const value = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error("模型必须返回 JSON 对象");
  return value;
}

export async function complete(
  config: ModelConfig,
  input: CompletionInput,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  modelConfigSchema.parse(config);
  const base = validateEndpoint(config.baseUrl).toString().replace(/\/$/, "");
  const protocol = providers[config.provider].protocol;
  const picture = input.image ? imageParts(input.image) : null;
  let url: string;
  let body: unknown;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (protocol === "anthropic") {
    url = `${base}/messages`;
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: config.model,
      max_tokens: 8192,
      system: input.system,
      messages: [
        {
          role: "user",
          content: [
            ...(picture
              ? [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: picture.mimeType,
                      data: picture.data,
                    },
                  },
                ]
              : []),
            { type: "text", text: input.text },
          ],
        },
      ],
    };
  } else if (protocol === "gemini") {
    url = `${base}/models/${encodeURIComponent(config.model)}:generateContent`;
    headers["x-goog-api-key"] = config.apiKey;
    body = {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: input.text },
            ...(picture ? [{ inlineData: picture }] : []),
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    };
  } else {
    url = `${base}/chat/completions`;
    headers.authorization = `Bearer ${config.apiKey}`;
    body = {
      model: config.model,
      messages: [
        { role: "system", content: input.system },
        {
          role: "user",
          content: [
            { type: "text", text: input.text },
            ...(picture
              ? [{ type: "image_url", image_url: { url: input.image } }]
              : []),
          ],
        },
      ],
      ...(config.provider === "qwen" ? { enable_thinking: false } : {}),
    };
  }
  // Never follow redirects with credentials; never report response bodies containing private inputs.
  const response = await fetcher(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(75_000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      `模型 HTTP ${response.status}；请检查模型权限、额度和 API 地址`,
    );
  const data = (await response.json()) as any;
  const text =
    protocol === "anthropic"
      ? data.content
          ?.filter((x: any) => x.type === "text")
          .map((x: any) => x.text)
          .join("")
      : protocol === "gemini"
        ? data.candidates?.[0]?.content?.parts
            ?.filter((x: any) => !x.thought)
            .map((x: any) => x.text ?? "")
            .join("")
        : data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new Error("模型未返回文本（可能拒绝、输出截断或模型不兼容）");
  return text;
}
