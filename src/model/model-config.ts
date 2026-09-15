import { readFile } from "node:fs/promises";
import { z } from "zod";
import { modelHttpError, RecruitingError } from "../errors.js";

const modelConfigSchema = z.object({
  routes: z.record(z.string(), z.string()),
  models: z.record(
    z.string(),
    z.object({
      provider: z.string().min(1),
      model: z.string().min(1),
      modalities: z.array(z.enum(["text", "image"])).min(1),
      baseUrl: z.string().url().optional(),
      credentialEnv: z.string().min(1).optional(),
      timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000)
    })
  )
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

export async function loadModelConfig(path: string): Promise<ModelConfig> {
  return modelConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export interface ModelRequest {
  route: string;
  system: string;
  input: string;
  imageDataUrls?: string[];
}

export interface ModelResponse {
  text: string;
  modelKey: string;
}

export interface ModelInvoker {
  invoke(config: ModelConfig["models"][string], request: ModelRequest): Promise<string>;
}

export class OpenAICompatibleInvoker implements ModelInvoker {
  constructor(
    private readonly credential: (environmentName: string) => string | undefined =
      (environmentName) => process.env[environmentName],
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async invoke(
    config: ModelConfig["models"][string],
    request: ModelRequest
  ): Promise<string> {
    if (!config.baseUrl) throw new Error(`缺少模型服务地址：${config.model}`);
    const apiKey = config.credentialEnv
      ? this.credential(config.credentialEnv)
      : undefined;
    if (config.credentialEnv && !apiKey) {
      throw new RecruitingError({
        code: "MODEL_AUTH_FAILED",
        stage: "configuration",
        message: `没有读取到模型凭证：${config.credentialEnv}`,
        retryable: false,
        userAction: `设置环境变量 ${config.credentialEnv}，或改用无需密钥的本地服务。`
      });
    }
    const userContent = request.imageDataUrls?.length
      ? [
          { type: "text", text: request.input },
          ...request.imageDataUrls.map((url) => ({
            type: "image_url",
            image_url: { url }
          }))
        ]
      : request.input;
    let response: Response;
    try {
      response = await this.fetcher(
        `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: userContent }
            ],
            temperature: 0
          }),
          signal: AbortSignal.timeout(config.timeoutMs)
        }
      );
    } catch (error) {
      throw new RecruitingError(
        {
          code: "MODEL_UNAVAILABLE",
          stage: "transport",
          message: error instanceof Error ? error.message : "无法连接模型服务",
          retryable: true,
          userAction: "检查模型服务是否启动、地址是否正确以及网络是否可达。"
        },
        { cause: error }
      );
    }
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw modelHttpError(
        response.status,
        `模型服务返回 HTTP ${response.status}${body ? `：${body}` : ""}`
      );
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new RecruitingError({
        code: "MODEL_RESPONSE_INVALID",
        stage: "transport",
        message: "模型服务没有返回可用文本",
        retryable: true,
        userAction: "确认服务兼容 OpenAI chat/completions 响应格式。"
      });
    }
    return content;
  }
}

export class ModelRouter {
  constructor(
    private readonly config: ModelConfig,
    private readonly invokers: Record<string, ModelInvoker>
  ) {}

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const modelKey = this.config.routes[request.route];
    if (!modelKey) throw new Error(`未配置模型路由：${request.route}`);
    const model = this.config.models[modelKey];
    if (!model) throw new Error(`模型不存在：${modelKey}`);
    if (request.imageDataUrls?.length && !model.modalities.includes("image")) {
      throw new Error(`模型 ${modelKey} 不支持图片输入`);
    }
    const invoker = this.invokers[model.provider];
    if (!invoker) throw new Error(`模型提供方尚未接入：${model.provider}`);
    return {
      text: await invoker.invoke(model, request),
      modelKey
    };
  }
}
