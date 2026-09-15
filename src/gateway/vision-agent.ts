import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GatewayRequestError } from "./gateway-errors.js";

export const visionProviderCode = z.string().trim().min(1).max(64).default("zhencai");

const screenshotSchema = z.object({
  mediaType: z.string().min(1).default("image/jpeg"),
  dataUrl: z.string().min(1).max(4_000_000)
});

const visionPlanRequestSchema = z.object({
  schemaVersion: z.literal("vision-form-plan-request.v1").default("vision-form-plan-request.v1"),
  providerCode: visionProviderCode,
  task: z.enum([
    "fill_application_form",
    "select_resume_parser_action",
    "audit_form_readback",
    "operate_registered_control"
  ]).default("fill_application_form"),
  observation: z.record(z.string(), z.unknown()).default({}),
  screenshot: screenshotSchema.nullable().default(null),
  candidate: z.record(z.string(), z.unknown()).default({}),
  policy: z.record(z.string(), z.unknown()).default({})
});

const safeActionTypes = new Set([
  "click_action",
  "fill_field",
  "select_option",
  "check_field",
  "upload_file",
  "trigger_site_resume_parser",
  "request_information",
  "readback",
  "click_registered_control",
  "no_action"
]);

// Site visual controls must be registered here explicitly before the Gateway
// accepts model-provided coordinates. Moka's date picker is intentionally not
// registered: it now has one deterministic site Driver and no visual fallback.
const registeredVisualControlRoles: Readonly<Record<string, ReadonlySet<string>>> = {};

export interface VisionAgentOptions {
  completion?: (input: { system: string; text: string; image?: string }) => Promise<string>;
  isConfigured?: () => boolean;
  providerCode?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  now?: () => Date;
  sessionStore?: VisionSessionStore;
  sessionTtlMs?: number;
  maxConcurrentPlans?: number;
}

export interface VisionSession {
  schemaVersion: "vision-rpa-session.v1";
  sessionId: string;
  providerCode: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  createdAt: string;
  expiresAt?: string;
}

export interface VisionSessionStore {
  save(session: VisionSession & { expiresAt: string }): Promise<void>;
  get(sessionId: string): Promise<VisionSession | null>;
}

export interface VisionActionPlan {
  schemaVersion: "vision-form-action-plan.v1";
  sessionId: string;
  providerCode: string;
  configured: boolean;
  task: string;
  next: "execute_actions" | "await_login" | "request_information" | "final_review" | "manual_copy" | "no_action";
  confidence: number;
  actions: Array<Record<string, unknown>>;
  warnings: string[];
  evidenceRefs: string[];
}

function isDashScopeVisionEndpoint(baseUrl: string, model: string): boolean {
  return /(?:dashscope|maas\.aliyuncs)\./i.test(baseUrl) || /^qwen/i.test(model);
}

export class VisionAgent {
  private readonly providerCode: string;
  private readonly sessions = new Map<string, VisionSession>();
  private activePlans = 0;

  constructor(private readonly options: VisionAgentOptions = {}) {
    this.providerCode = (options.providerCode || "zhencai").trim() || "zhencai";
  }

  capabilities(): Record<string, unknown> {
    return {
      schemaVersion: "vision-rpa-capabilities.v1",
      providerCode: this.providerCode,
      mode: "server_managed_model",
      configured: this.configured(),
      supportedProviderCodes: [this.providerCode],
      supportedTasks: [
        "fill_application_form",
        "select_resume_parser_action",
        "audit_form_readback",
        "operate_registered_control"
      ],
      actionPolicy: {
        allowedActions: [...safeActionTypes],
        coordinatesAllowed: false,
        registeredControlCoordinates: {
          allowed: true,
          scope: "registered_custom_controls_only",
          requiresForeground: true,
          normalizedCoordinatesOnly: true,
          oneActionPerScreenshot: true
        },
        arbitraryJavascriptAllowed: false,
        finalSubmitRequiresAiSideConfirmation: true,
        captchaAndLoginCredentialHandling: "human_only"
      }
    };
  }

  async createSession(input: {
    tenantId: string;
    userId: string;
    deviceId: string;
    providerCode?: string;
  }): Promise<VisionSession> {
    const requestedProvider = (input.providerCode || this.providerCode).trim() || this.providerCode;
    this.assertProvider(requestedProvider);
    const now = this.now();
    const requestedTtl = this.options.sessionTtlMs ?? 24 * 60 * 60_000;
    const ttl = Number.isFinite(requestedTtl) ? Math.min(Math.max(requestedTtl, 60_000), 24 * 60 * 60_000) : 24 * 60 * 60_000;
    const session: VisionSession & { expiresAt: string } = {
      schemaVersion: "vision-rpa-session.v1",
      sessionId: randomUUID(),
      providerCode: requestedProvider,
      tenantId: input.tenantId,
      userId: input.userId,
      deviceId: input.deviceId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl).toISOString()
    };
    if (this.options.sessionStore) await this.options.sessionStore.save(session);
    else {
      for (const [id, prior] of this.sessions) {
        if (prior.expiresAt && Date.parse(prior.expiresAt) <= now.getTime()) this.sessions.delete(id);
      }
      this.sessions.set(session.sessionId, session);
    }
    return session;
  }

  async plan(
    sessionId: string,
    input: unknown,
    identity: { tenantId: string; userId: string; deviceId: string }
  ): Promise<VisionActionPlan> {
    const session = this.options.sessionStore ? await this.options.sessionStore.get(sessionId) : this.sessions.get(sessionId);
    const expiresAt = session?.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;
    if (!session || !Number.isFinite(expiresAt) || expiresAt <= this.now().getTime()) throw new Error("视觉 RPA 会话不存在或已过期");
    if (session.tenantId !== identity.tenantId || session.userId !== identity.userId || session.deviceId !== identity.deviceId) {
      throw new Error("视觉 RPA 会话不属于当前设备");
    }
    this.assertProvider(session.providerCode);
    const request = visionPlanRequestSchema.parse(input);
    this.assertProvider(request.providerCode);
    if (request.providerCode !== session.providerCode) throw new Error("视觉规划服务与会话不匹配");
    if (request.task === "operate_registered_control" && !request.screenshot?.dataUrl) {
      return this.fallbackPlan(session, request.task, [
        "注册困难控件视觉操作缺少当前页面截图；禁止基于旧坐标或无图猜测。"
      ]);
    }
    if (!this.configured()) {
      return this.fallbackPlan(session, request.task, [
        "zhencai 视觉模型链路尚未在 Gateway 环境变量中配置；已降级为手动复制或 AI 侧外部规划。"
      ]);
    }
    const requestedLimit = this.options.maxConcurrentPlans ?? 8;
    const maximum = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 64) : 8;
    if (this.activePlans >= maximum) throw new GatewayRequestError("GATEWAY_BUSY", "视觉规划繁忙，请稍后重试", 503, true);
    // Count actual work until its promise settles; disconnecting HTTP cannot free a model slot early.
    this.activePlans++;
    try {
      let modelPlan: Omit<VisionActionPlan, "sessionId" | "providerCode" | "configured" | "task"> | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          modelPlan = await this.callModel(session, request);
          break;
        } catch (error) {
          if (attempt > 0 || !retryableVisionPlanningError(error)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (!modelPlan) throw new Error("视觉模型未返回动作计划");
      return {
        ...modelPlan,
        sessionId: session.sessionId,
        providerCode: session.providerCode,
        configured: true,
        task: request.task
      };
    } catch (error) {
      return this.fallbackPlan(session, request.task, [
        `zhencai 视觉模型规划失败：${error instanceof Error ? error.message : String(error)}`
      ]);
    } finally {
      this.activePlans--;
    }
  }

  private configured(): boolean {
    if (this.options.completion) return this.options.isConfigured?.() ?? true;
    return Boolean(this.options.baseUrl?.trim() && this.options.model?.trim() && this.options.apiKey?.trim());
  }

  private assertProvider(value: string): void {
    if (value !== this.providerCode) {
      throw new Error(`不支持的视觉模型服务代码：${value}`);
    }
  }

  private now(): Date {
    return (this.options.now ?? (() => new Date()))();
  }

  private fallbackPlan(session: VisionSession, task: string, warnings: string[]): VisionActionPlan {
    return {
      schemaVersion: "vision-form-action-plan.v1",
      sessionId: session.sessionId,
      providerCode: session.providerCode,
      configured: false,
      task,
      next: "manual_copy",
      confidence: 0,
      actions: [],
      warnings,
      evidenceRefs: []
    };
  }

  private async callModel(
    session: VisionSession,
    request: z.infer<typeof visionPlanRequestSchema>
  ): Promise<Omit<VisionActionPlan, "sessionId" | "providerCode" | "configured" | "task">> {
    const baseUrl = (this.options.baseUrl ?? "").replace(/\/+$/, "");
    const payloadText = JSON.stringify({
      schemaVersion: request.schemaVersion,
      task: request.task,
      observation: request.observation,
      candidate: request.candidate,
      policy: {
        ...request.policy,
        allowedActions: [...safeActionTypes],
        coordinatesAllowed: false,
        registeredControlCoordinates: request.task === "operate_registered_control",
        finalSubmitAllowed: false,
        captchaAndLoginCredentials: "human_only"
      }
    });
    const registeredControlTask = request.task === "operate_registered_control";
    const registeredControlPrompt = registeredControlTask
      ? [
          "当前任务是已登记困难控件的唯一执行 Driver，不是通用填写失败后的兜底。",
          "只允许操作 policy.registeredControl.adapterCode 指定的控件，并且返回的 targetRole 必须与 policy.registeredControl.targetRole 完全一致。",
          "根据本次截图查找 policy.registeredControl.targetRole 对应的唯一可点击目标，只返回一个归一化坐标点。",
          "动作格式必须是 {\"type\":\"click_registered_control\",\"adapterCode\":\"...\",\"targetRole\":\"...\",\"xRatio\":0-1,\"yRatio\":0-1,\"confidence\":0-1}。",
          "坐标以截图左上角为原点，并除以截图宽高归一化；禁止返回 CSS、selector、JavaScript、键盘输入、最终提交、登录或验证码动作。",
          "看不清、目标不唯一或置信度不足时返回 no_action，不得猜测。"
        ].join("\n")
      : "只能使用 observation 中已有的 fieldId/actionId，不能返回坐标、CSS selector、任意 JS、密码、验证码或最终提交动作。";
    const taskPrompt = registeredControlTask
      ? [
          "你是招聘网页已登记困难控件的视觉定位器。只返回严格 JSON，不要 Markdown。",
          registeredControlPrompt,
          "输出格式：{ \"next\": \"execute_actions|no_action\", \"confidence\": 0-1, \"actions\": [], \"warnings\": [], \"evidenceRefs\": [] }。",
          payloadText
        ]
      : [
          "你是招聘网页表单 RPA 的视觉规划器。只返回严格 JSON，不要 Markdown。",
          registeredControlPrompt,
          "当 policy.executionMode=observe_decide_execute_reobserve 时，每次只返回一个当前页面动作；动作执行后页面会重新观察，禁止假设旧 fieldId 仍然有效。",
          "候选人字段值只能来自 candidate。日期可以按页面的年/月控件拆分，但不得编造、拼接身份信息或把同一段经历重复映射到候选人整体字段。",
          "“开始工作年月/首次工作时间”是候选人整体字段：年控件使用 candidate.basic.firstWorkStartYear，月控件使用 candidate.basic.firstWorkStartMonth；它不是每段工作经历的 startDate。",
          "最高学历使用 candidate.basic.highestDegree。选择后必须根据最新 observation.currentValue 判断是否已生效；已经正确的字段不要再次操作。",
          "必须优先处理 policy.pendingRequiredFields 中仍为空的必填字段。同一语义出现 #0/#1 时它们是独立控件：#0 已有值不能代表 #1 已完成，必须按各自 fieldId 分别填写和回读。",
          "每个字段动作必须使用 type 字段，例如 {\"type\":\"select_option\",\"fieldId\":\"field-1\",\"value\":\"本科\"}；不要把动作类型写进 actionId。",
          "输出格式：{ \"next\": \"execute_actions|await_login|request_information|final_review|manual_copy|no_action\", \"confidence\": 0-1, \"actions\": [], \"warnings\": [], \"evidenceRefs\": [] }。",
          payloadText
        ];
    const content: Array<Record<string, unknown>> = [{
      type: "text",
      text: taskPrompt.join("\n")
    }];
    if (request.screenshot?.dataUrl) {
      content.push({
        type: "image_url",
        image_url: { url: request.screenshot.dataUrl }
      });
    }
    if (this.options.completion) {
      const text = await this.options.completion({
        system: "你只生成招聘投递表单的受限动作计划 JSON。",
        text: taskPrompt.join("\n"),
        ...(request.screenshot?.dataUrl ? { image: request.screenshot.dataUrl } : {})
      });
      const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
      return sanitizeModelPlan(parsed, session, request.policy);
    }
    const model = this.options.model!;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: registeredControlTask
              ? "你只生成已登记困难控件的一步视觉坐标 JSON。"
              : "你只生成招聘投递表单的受限动作计划 JSON。"
          },
          { role: "user", content }
        ],
        temperature: 0,
        response_format: { type: "json_object" },
        ...(isDashScopeVisionEndpoint(baseUrl, model) ? { enable_thinking: false } : {})
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 75_000)
    });
    if (!response.ok) {
      throw new Error(`模型 HTTP ${response.status} ${String(await response.text()).slice(0, 500)}`);
    }
    const data = await response.json() as Record<string, unknown>;
    const choice = Array.isArray(data.choices) ? data.choices[0] as Record<string, unknown> | undefined : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const rawContent = message?.content;
    const parsed = typeof rawContent === "string"
      ? JSON.parse(rawContent) as Record<string, unknown>
      : rawContent as Record<string, unknown>;
    return sanitizeModelPlan(parsed, session, request.policy);
  }
}

function retryableVisionPlanningError(error: unknown): boolean {
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /AbortError|TimeoutError|timed?\s*out|operation was aborted|模型 HTTP (?:429|500|502|503|504)\b/i.test(value);
}

function sanitizeModelPlan(
  value: Record<string, unknown>,
  session: VisionSession,
  policy: Record<string, unknown> = {}
): Omit<VisionActionPlan, "sessionId" | "providerCode" | "configured" | "task"> {
  const nextValues = new Set([
    "execute_actions",
    "await_login",
    "request_information",
    "final_review",
    "manual_copy",
    "no_action"
  ]);
  const next = typeof value.next === "string" && nextValues.has(value.next)
    ? value.next as VisionActionPlan["next"]
    : "manual_copy";
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
    ? Math.max(0, Math.min(1, value.confidence))
    : 0.5;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map(String).slice(0, 20)
    : [];
  const evidenceRefs = Array.isArray(value.evidenceRefs)
    ? value.evidenceRefs.map(String).slice(0, 40)
    : [];
  const maximumActions = policy.iterativeSingleAction === true
    ? 1
    : typeof policy.maxActions === "number" && Number.isFinite(policy.maxActions)
      ? Math.max(1, Math.min(50, Math.floor(policy.maxActions)))
      : 50;
  const actions = Array.isArray(value.actions)
    ? value.actions.flatMap((raw, index) => sanitizeAction(raw, index, policy)).slice(0, maximumActions)
    : [];
  return {
    schemaVersion: "vision-form-action-plan.v1",
    next: actions.length ? next : next === "execute_actions" ? "manual_copy" : next,
    confidence,
    actions,
    warnings,
    evidenceRefs: [
      `vision-session:${session.sessionId}`,
      ...evidenceRefs
    ]
  };
}

function sanitizeAction(
  raw: unknown,
  index: number,
  policy: Record<string, unknown> = {}
): Array<Record<string, unknown>> {
  const action = raw as Record<string, unknown> | null;
  if (!action || typeof action !== "object") return [];
  const actionIdValue = typeof action.actionId === "string" ? action.actionId.trim() : "";
  const type = String(
    action.type ??
    action.actionType ??
    (safeActionTypes.has(actionIdValue) ? actionIdValue : "")
  );
  if (!safeActionTypes.has(type)) return [];
  const fieldId = typeof action.fieldId === "string" ? action.fieldId.trim() : "";
  const actionId = actionIdValue && actionIdValue !== type ? actionIdValue : "";
  const value = action.value;
  if (type === "click_registered_control") {
    const registeredControl = policy.registeredControl && typeof policy.registeredControl === "object" &&
      !Array.isArray(policy.registeredControl)
      ? policy.registeredControl as Record<string, unknown>
      : null;
    const adapterCode = typeof action.adapterCode === "string" ? action.adapterCode.trim() : "";
    const expectedAdapterCode = typeof registeredControl?.adapterCode === "string"
      ? registeredControl.adapterCode.trim()
      : "";
    const targetRole = typeof action.targetRole === "string" ? action.targetRole.trim() : "";
    const expectedTargetRole = typeof registeredControl?.targetRole === "string"
      ? registeredControl.targetRole.trim()
      : "";
    const allowedRoles = registeredVisualControlRoles[adapterCode];
    const xRatio = action.xRatio;
    const yRatio = action.yRatio;
    if (!allowedRoles || adapterCode !== expectedAdapterCode || targetRole !== expectedTargetRole ||
      !allowedRoles.has(targetRole) || typeof xRatio !== "number" || typeof yRatio !== "number" ||
      !Number.isFinite(xRatio) || !Number.isFinite(yRatio) ||
      xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return [];
    return [{
      id: String(action.id ?? `vision-action-${index + 1}`),
      type,
      adapterCode,
      targetRole,
      xRatio,
      yRatio,
      ...(typeof action.reason === "string" ? { reason: action.reason.slice(0, 500) } : {}),
      confidence: typeof action.confidence === "number" && Number.isFinite(action.confidence)
        ? Math.max(0, Math.min(1, action.confidence))
        : 0.5
    }];
  }
  if (["fill_field", "select_option", "check_field"].includes(type) && !fieldId) return [];
  if (["click_action", "trigger_site_resume_parser"].includes(type) && !actionId) return [];
  if (type === "upload_file" && (!fieldId || typeof action.assetId !== "string")) return [];
  return [{
    id: String(action.id ?? `vision-action-${index + 1}`),
    type,
    ...(fieldId ? { fieldId } : {}),
    ...(actionId ? { actionId } : {}),
    ...(value !== undefined && ["fill_field", "select_option", "check_field"].includes(type) ? { value } : {}),
    ...(typeof action.assetId === "string" ? { assetId: action.assetId } : {}),
    ...(typeof action.reason === "string" ? { reason: action.reason.slice(0, 500) } : {}),
    confidence: typeof action.confidence === "number" && Number.isFinite(action.confidence)
      ? Math.max(0, Math.min(1, action.confidence))
      : 0.5
  }];
}

export function visionAgentFromEnv(environment: NodeJS.ProcessEnv = process.env, sessionStore?: VisionSessionStore): VisionAgent {
  return new VisionAgent({
    sessionStore,
    providerCode: environment.RECRUITING_VISION_PROVIDER_CODE?.trim() || "zhencai",
    baseUrl: environment.RECRUITING_VISION_BASE_URL?.trim(),
    model: environment.RECRUITING_VISION_MODEL?.trim(),
    apiKey: environment.RECRUITING_VISION_API_KEY?.trim(),
    timeoutMs: environment.RECRUITING_VISION_TIMEOUT_MS
      ? Number(environment.RECRUITING_VISION_TIMEOUT_MS)
      : undefined
  });
}
