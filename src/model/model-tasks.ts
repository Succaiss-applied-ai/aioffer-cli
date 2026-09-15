import { z } from "zod";
import {
  type JobRecord,
  type SearchPlan,
  type SearchFilters
} from "../domain.js";
import { modelHttpError, RecruitingError } from "../errors.js";

export interface BrowserModelSettings {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ModelExecutionEvidence {
  id: string;
  task: "parse_search_prompt" | "map_form_fields" | "rank_jobs" |
    "select_resume_parse_action" | "prepare_form_prefill" | "audit_filled_form";
  model: string;
  status: "validated";
  completedAt: string;
  warnings: string[];
}

function emptyArrayForNull(value: unknown): unknown {
  return value === null ? [] : value;
}

const keywordArraySchema = z.preprocess(
  emptyArrayForNull,
  z.array(z.string()).default([])
);

const searchKeywordExtractionSchema = z.object({
  roles: keywordArraySchema,
  locations: keywordArraySchema,
  channelKeywords: keywordArraySchema,
  employmentTypeKeywords: keywordArraySchema,
  industries: keywordArraySchema,
  skills: keywordArraySchema,
  degrees: keywordArraySchema,
  excludedTerms: keywordArraySchema,
  maximumExperienceYears: z.number().int().nonnegative().nullable().default(null),
  publishedWithinDays: z.number().int().positive().nullable().default(null),
  maximumResults: z.number().int().min(1).max(500).nullable().default(null)
}).strict();

function uniqueTerms(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildSearchFiltersFromKeywords(
  prompt: string,
  extracted: z.infer<typeof searchKeywordExtractionSchema>
): SearchFilters {
  const channelText = `${extracted.channelKeywords.join(" ")} ${prompt}`.toLowerCase();
  const employmentText = `${extracted.employmentTypeKeywords.join(" ")} ${prompt}`.toLowerCase();
  const channels: SearchFilters["channels"] = [];
  if (/实习|internship/.test(channelText)) channels.push("internship");
  if (/校招|校园招聘|campus/.test(channelText)) channels.push("campus");
  if (/应届|毕业生|graduate/.test(channelText)) channels.push("graduate");
  if (/社招|社会招聘|social/.test(channelText)) channels.push("social");
  const maximumExperienceYears = extracted.maximumExperienceYears
    ?? (/0\s*年|零经验|无经验/.test(prompt) ? 0 : null);
  if (maximumExperienceYears === 0 && channels.length === 0) {
    channels.push("campus", "graduate");
  }
  const employmentTypes: SearchFilters["employmentTypes"] = [];
  if (/实习|internship/.test(employmentText)) employmentTypes.push("internship");
  if (/正式|全职|full[-_ ]?time/.test(employmentText)) employmentTypes.push("full_time");
  const excludedTerms = uniqueTerms(extracted.excludedTerms);
  if (/排除外包|不要外包|非外包/.test(prompt)) {
    excludedTerms.push("外包", "人力派遣");
  }
  const extractedLocations = uniqueTerms(extracted.locations);
  const unrestrictedLocationPattern =
    /^(?:所有|全部|任意)城市$|^城市不限$|^不限城市$|^不限地点$|^地点不限$|^全国(?:均可|可投)?$|^anywhere$/i;
  const concreteLocations = extractedLocations.filter(
    (location) => !unrestrictedLocationPattern.test(location)
  );
  const locationMode = concreteLocations.length === 0 && (
    extractedLocations.some((location) => unrestrictedLocationPattern.test(location)) ||
    /(?:所有|全部|任意)城市|城市不限|不限城市|不限地点|地点不限|全国(?:均可|可投)?|不(?:限|限制)(?:城市|地区|地点)|anywhere/i.test(prompt)
  ) ? "anywhere" : "specified";
  return {
    roles: uniqueTerms(extracted.roles),
    locationMode,
    locations: locationMode === "anywhere" ? [] : concreteLocations,
    channels: [...new Set(channels)],
    employmentTypes: [...new Set(employmentTypes)],
    industries: uniqueTerms(extracted.industries),
    skills: uniqueTerms(extracted.skills),
    degrees: uniqueTerms(extracted.degrees),
    excludedTerms: uniqueTerms(excludedTerms),
    maximumExperienceYears,
    publishedWithinDays: extracted.publishedWithinDays,
    maximumResults: extracted.maximumResults ?? 100,
    maximumJobsPerCompany: 5
  };
}

export interface ObservedFieldForModel {
  fieldId: string;
  stableFieldKey?: string;
  label: string;
  sectionKey?: string;
  groupIndex?: number | null;
  labelPath?: string[];
  controlKind?: string;
  type: string;
  required: boolean;
  options: string[];
}

const fieldMappingSchema = z.object({
  fieldId: z.string().min(1),
  semanticKey: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.enum(["resume", "local_profile", "user_required"]),
  evidenceRef: z.string().nullable()
}).strict();

export type ModelFieldMapping = z.infer<typeof fieldMappingSchema>;

const formPrefillCandidateSchema = z.object({
  fieldId: z.string().min(1),
  semanticKey: z.string().min(1),
  proposedValue: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(300)
}).strict();

const formPrefillPlanSchema = z.object({
  candidates: z.array(formPrefillCandidateSchema)
}).strict();

export type ModelFormPrefillCandidate = z.infer<typeof formPrefillCandidateSchema>;

export interface ObservedActionForModel {
  actionId: string;
  text: string;
  kind: "resume_parse" | "login" | "navigation" | "neutral" | "final_submit" | "consent";
  risk: "safe" | "user_only";
  disabled: boolean;
  context: string;
}

const actionDecisionSchema = z.object({
  actionId: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(300)
}).strict();

export interface AuditableFormField {
  fieldId: string;
  label: string;
  semanticKey: string;
  expected: string;
  actual: string;
}

const auditIssueSchema = z.object({
  fieldId: z.string().min(1),
  category: z.enum(["missing", "mismatch", "format_artifact", "section_mismatch"]),
  correctionValue: z.string(),
  reason: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1)
}).strict();

const filledFormAuditSchema = z.object({
  verdict: z.enum(["pass", "needs_correction"]),
  issues: z.array(auditIssueSchema)
}).strict();

const formMappingResultSchema = z.object({
  mappings: z.array(fieldMappingSchema)
}).strict();

const formMappingEnvelopeSchema = z.object({
  schemaVersion: z.literal("1.0"),
  task: z.literal("map_form_fields"),
  result: formMappingResultSchema,
  warnings: z.array(z.string()),
  evidenceRefs: z.array(z.string())
}).strict();

function normalizeFormMappingEnvelope(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const outer = raw as Record<string, unknown>;
  const nested = outer.result && typeof outer.result === "object" && !Array.isArray(outer.result)
    ? outer.result as Record<string, unknown>
    : outer;
  const stringArray = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  return {
    schemaVersion: "1.0",
    task: "map_form_fields",
    result: { mappings: nested.mappings },
    warnings: stringArray(outer.warnings ?? nested.warnings),
    evidenceRefs: stringArray(outer.evidenceRefs ?? nested.evidenceRefs)
  };
}

const rankedJobSchema = z.object({
  jobId: z.string().min(1),
  score: z.number().min(0).max(100),
  reason: z.string().min(1).max(240)
}).strict();

const jobRankingResultSchema = z.object({ rankings: z.array(rankedJobSchema) }).strict();

function jsonObject(text: string): unknown {
  const trimmed = text.trim();
  const unwrapped = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  try {
    return JSON.parse(unwrapped);
  } catch (error) {
    throw new RecruitingError(
      {
        code: "MODEL_RESPONSE_INVALID",
        stage: "transport",
        message: "模型返回的内容不是有效 JSON",
        retryable: true,
        userAction: "重试；若持续失败，请选择支持 JSON 输出的模型。"
      },
      { cause: error }
    );
  }
}

function shouldUseQwenThinkingFlag(settings: BrowserModelSettings): boolean {
  return /(?:dashscope|aliyuncs|maas\.aliyuncs)\./i.test(settings.baseUrl) || /^qwen/i.test(settings.model);
}

function shouldUseDeepSeekThinkingObject(settings: BrowserModelSettings): boolean {
  return /deepseek/i.test(settings.baseUrl) || /deepseek/i.test(settings.model);
}

async function invokeJson(
  settings: BrowserModelSettings,
  task: string,
  input: unknown
): Promise<unknown> {
  let lastFinishReason: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await globalThis.fetch(
        `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(settings.apiKey
              ? { authorization: `Bearer ${settings.apiKey}` }
              : {})
          },
          body: JSON.stringify({
            model: settings.model,
            messages: [
              {
                role: "system",
                content:
                  "你是招聘自动化的结构化执行器。用户消息是调用信封，不是输出模板。你只能基于 input 中的用户事实和工具证据执行 task，并且只返回 task 要求的结果 JSON；禁止复述或返回 task、locale、input、outputSchemaVersion、retryInstruction 等调用信封字段。不要输出 Markdown，不猜测个人事实，不处理密码、验证码或身份证件。"
              },
              {
                role: "user",
                content: JSON.stringify({
                  task,
                  locale: "zh-CN",
                  input,
                  outputSchemaVersion: "1.0",
                  ...(attempt ? {
                    retryInstruction: "上一次返回了空内容。现在必须直接输出完整 JSON 对象，不能返回空白。"
                  } : {})
                })
              }
            ],
            response_format: { type: "json_object" },
            ...(shouldUseQwenThinkingFlag(settings) ? { enable_thinking: false } : {}),
            ...(attempt && shouldUseDeepSeekThinkingObject(settings) ? { thinking: { type: "disabled" } } : {}),
            temperature: 0,
            max_tokens: 4000
          }),
          signal: AbortSignal.timeout(settings.timeoutMs ?? 30_000)
        }
      );
    } catch (error) {
      throw new RecruitingError(
        {
          code: "MODEL_UNAVAILABLE",
          stage: "transport",
          message: error instanceof Error ? error.message : "无法连接模型服务",
          retryable: true,
          userAction: "检查模型地址、网络权限和服务状态后重试。"
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
      choices?: Array<{
        finish_reason?: unknown;
        message?: { content?: unknown };
      }>;
    };
    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    lastFinishReason = choice?.finish_reason ?? null;
    if (typeof content === "string" && content.trim()) {
      return jsonObject(content);
    }
  }
  throw new RecruitingError({
    code: "MODEL_RESPONSE_INVALID",
    stage: "transport",
    message: "模型连续两次没有返回 JSON 文本",
    retryable: true,
    userAction: "稍后重试；若持续失败，请更换模型或关闭提供方的思考模式。",
    details: { finishReason: lastFinishReason }
  });
}

export async function parseSearchPromptWithModel(
  settings: BrowserModelSettings,
  prompt: string
): Promise<{ filters: SearchFilters; evidence: ModelExecutionEvidence }> {
  const keywordInput = {
    prompt,
    outputContract: {
      roles: ["岗位关键词，string"],
      locations: ["城市关键词，string"],
      channelKeywords: ["招聘通道原始关键词，string"],
      employmentTypeKeywords: ["实习/正式等原始关键词，string"],
      industries: ["行业关键词，string"],
      skills: ["技术关键词，string"],
      degrees: ["学历关键词，string"],
      excludedTerms: ["排除关键词，string"],
      maximumExperienceYears: "nonnegative integer | null",
      publishedWithinDays: "positive integer | null",
      maximumResults: "integer 1..500 | null"
    },
    requirements: {
      rule: "只提取用户明确表达的关键词和数字，不转换业务枚举，不补默认值，只输出上述 JSON 对象。"
    }
  };
  let raw = await invokeJson(settings, "extract_search_keywords", keywordInput);
  let candidate = raw && typeof raw === "object" && "result" in raw
    ? (raw as { result: unknown }).result
    : raw;
  let parsed = searchKeywordExtractionSchema.safeParse(candidate);
  let retriedInvalidStructure = false;
  if (!parsed.success) {
    retriedInvalidStructure = true;
    raw = await invokeJson(settings, "extract_search_keywords", {
      ...keywordInput,
      retryInstruction: "上一次返回了调用信封或错误结构。只能输出 outputContract 中列出的 11 个字段；禁止输出 task、locale、input、outputSchemaVersion、result 以外的外层字段。"
    });
    candidate = raw && typeof raw === "object" && "result" in raw
      ? (raw as { result: unknown }).result
      : raw;
    parsed = searchKeywordExtractionSchema.safeParse(candidate);
  }
  if (!parsed.success) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "transport",
      message: `模型关键词提取未通过结构校验：${z.prettifyError(parsed.error).slice(0, 800)}`,
      retryable: true,
      userAction: "重试；系统只接受固定的关键词提取 JSON，不接受模型自行生成业务 Schema。"
    });
  }
  return {
    filters: buildSearchFiltersFromKeywords(prompt, parsed.data),
    evidence: {
      id: crypto.randomUUID(),
      task: "parse_search_prompt",
      model: settings.model,
      status: "validated",
      completedAt: new Date().toISOString(),
      warnings: [
        "AI 仅提取关键词；完整 SearchFilters 由客户端固定 Schema 确定性构建。",
        ...(retriedInvalidStructure ? ["首次结构无效，严格重试后通过。"] : [])
      ]
    }
  };
}

export async function mapFormFieldsWithModel(
  settings: BrowserModelSettings,
  fields: ObservedFieldForModel[],
  availableSemanticKeys: string[]
): Promise<{
  mappings: z.infer<typeof fieldMappingSchema>[];
  evidence: ModelExecutionEvidence;
}> {
  const mappingInput = {
    fields,
    availableSemanticKeys,
    outputContract: {
      schemaVersion: "1.0",
      task: "map_form_fields",
      result: {
        mappings: [{
          fieldId: "observed fieldId",
          semanticKey: "one availableSemanticKey or a precise new key",
          confidence: 0.98,
          source: "resume | local_profile | user_required",
          evidenceRef: null
        }]
      },
      warnings: ["string"],
      evidenceRefs: ["string"]
    },
    requirements: {
      confidenceThreshold: 0.8,
      allowedSources: ["resume", "local_profile", "user_required"],
      rule: "优先使用 stableFieldKey、sectionKey、groupIndex、labelPath 判断字段身份；只映射标签语义，不生成或猜测字段值；每个 fieldId 最多出现一次。"
    }
  };
  let raw = await invokeJson(settings, "map_form_fields", mappingInput);
  let directEnvelope = formMappingEnvelopeSchema.safeParse(raw);
  let parsed = formMappingEnvelopeSchema.safeParse(normalizeFormMappingEnvelope(raw));
  let retriedInvalidStructure = false;
  if (!parsed.success) {
    retriedInvalidStructure = true;
    raw = await invokeJson(settings, "map_form_fields", {
      ...mappingInput,
      retryInstruction: "上一次字段映射结构无效。只返回 mappings 数组；每项必须包含 fieldId、semanticKey、confidence、source、evidenceRef，禁止复述输入信封。"
    });
    directEnvelope = formMappingEnvelopeSchema.safeParse(raw);
    parsed = formMappingEnvelopeSchema.safeParse(normalizeFormMappingEnvelope(raw));
  }
  if (!parsed.success) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "form_observation",
      message: `模型字段映射未通过结构校验：${z.prettifyError(parsed.error).slice(0, 800)}`,
      retryable: true,
      userAction: "重试字段读取，或更换严格输出 JSON 的模型。"
    });
  }
  const allowedFieldIds = new Set(fields.map((field) => field.fieldId));
  const seen = new Set<string>();
  const mappings = parsed.data.result.mappings.filter((mapping) => {
    if (!allowedFieldIds.has(mapping.fieldId) || seen.has(mapping.fieldId)) return false;
    seen.add(mapping.fieldId);
    return true;
  });
  return {
    mappings,
    evidence: {
      id: crypto.randomUUID(),
      task: "map_form_fields",
      model: settings.model,
      status: "validated",
      completedAt: new Date().toISOString(),
      warnings: [
        ...parsed.data.warnings,
        ...(!directEnvelope.success ? ["客户端已将模型返回归一化为固定字段映射协议。"] : []),
        ...(retriedInvalidStructure ? ["首次结构无效，严格重试后通过。"] : [])
      ]
    }
  };
}

/**
 * Understands form headings together with the parsed resume while keeping the
 * resume snapshot as the only source of candidate facts. Values that cannot be
 * traced exactly to one supplied fact are discarded before browser execution.
 */
export async function prepareFormPrefillWithModel(
  settings: BrowserModelSettings,
  fields: ObservedFieldForModel[],
  resumeFacts: Record<string, string>
): Promise<{
  candidates: ModelFormPrefillCandidate[];
  evidence: ModelExecutionEvidence;
}> {
  const raw = await invokeJson(settings, "prepare_form_prefill", {
    fields,
    resumeFacts,
    requirements: {
      goal: "理解招聘表单表头和重复经历分组，为每个可确定字段选择一条本地简历事实作为预填候选。",
      constraints: [
        "只能使用 fields 中存在的 fieldId",
        "优先使用 stableFieldKey、sectionKey、groupIndex、labelPath 识别重复经历分组",
        "semanticKey 必须逐字等于 resumeFacts 中存在的键",
        "proposedValue 必须逐字等于 resumeFacts[semanticKey]，不得改写、拼接或推测",
        "教育、工作和项目经历必须保持分组索引一致",
        "无法确定、文件、同意条款、验证码和最终提交控件不要返回"
      ]
    },
    outputContract: {
      candidates: [{
        fieldId: "existing fieldId",
        semanticKey: "existing resumeFacts key",
        proposedValue: "exact resumeFacts value",
        confidence: "0..1",
        reason: "short evidence-based reason"
      }]
    }
  });
  const candidate = raw && typeof raw === "object" && "result" in raw
    ? (raw as { result: unknown }).result
    : raw;
  const parsed = formPrefillPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "form_observation",
      message: `模型预填计划未通过结构校验：${z.prettifyError(parsed.error).slice(0, 800)}`,
      retryable: true,
      userAction: "重试表单预备，或更换严格输出 JSON 的模型。"
    });
  }
  const allowedFields = new Set(fields.map((field) => field.fieldId));
  const seen = new Set<string>();
  let discarded = 0;
  const candidates = parsed.data.candidates.filter((entry) => {
    const valid = allowedFields.has(entry.fieldId) && !seen.has(entry.fieldId) &&
      Object.prototype.hasOwnProperty.call(resumeFacts, entry.semanticKey) &&
      resumeFacts[entry.semanticKey] === entry.proposedValue && entry.confidence >= 0.8;
    if (!valid) {
      discarded += 1;
      return false;
    }
    seen.add(entry.fieldId);
    return true;
  });
  return {
    candidates,
    evidence: {
      id: crypto.randomUUID(),
      task: "prepare_form_prefill",
      model: settings.model,
      status: "validated",
      completedAt: new Date().toISOString(),
      warnings: [
        "预填值只允许引用用户已确认的本地简历事实；模型不能生成候选人事实。",
        ...(discarded ? [`客户端丢弃了 ${discarded} 条不可追溯或低置信度候选。`] : [])
      ]
    }
  };
}

export async function selectResumeParseActionWithModel(
  settings: BrowserModelSettings,
  actions: ObservedActionForModel[],
  context: { pageTitle: string; resumeUploaded: boolean }
): Promise<{
  decision: z.infer<typeof actionDecisionSchema>;
  evidence: ModelExecutionEvidence;
}> {
  const safeActions = actions.filter((action) => action.risk === "safe" && !action.disabled);
  const raw = await invokeJson(settings, "select_resume_parse_action", {
    context,
    actions: safeActions,
    requirements: {
      goal: "如果招聘网站提供上传简历后的解析/填充/覆盖表单动作，选择该动作；否则 actionId 返回 null。",
      constraints: [
        "只能返回 actions 中存在的 actionId",
        "不得选择登录、导航、提交、投递、申请、隐私同意或授权动作",
        "仅凭文案和上下文无法确认时返回 null"
      ]
    },
    outputContract: {
      actionId: "existing safe actionId | null",
      confidence: "0..1",
      reason: "short evidence-based reason"
    }
  });
  const candidate = raw && typeof raw === "object" && "result" in raw
    ? (raw as { result: unknown }).result
    : raw;
  const parsed = actionDecisionSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "form_observation",
      message: `模型动作选择未通过结构校验：${z.prettifyError(parsed.error).slice(0, 800)}`,
      retryable: true,
      userAction: "重试页面动作识别，或更换严格输出 JSON 的模型。"
    });
  }
  const selected = parsed.data.actionId
    ? safeActions.find((action) => action.actionId === parsed.data.actionId)
    : null;
  if (parsed.data.actionId && !selected) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "form_observation",
      message: "模型选择了页面上不存在或不安全的动作",
      retryable: true,
      userAction: "重新读取页面后再试。"
    });
  }
  if (selected && selected.kind !== "resume_parse" &&
    !/解析简历|解析并填充|解析并覆盖|覆盖并解析|简历解析|重新解析|从简历填充|使用简历填充/.test(selected.text)) {
    return {
      decision: {
        ...parsed.data,
        actionId: null,
        reason: `已安全忽略非简历解析动作：${selected.text}`
      },
      evidence: {
        id: crypto.randomUUID(), task: "select_resume_parse_action", model: settings.model,
        status: "validated", completedAt: new Date().toISOString(),
        warnings: ["模型选择了非简历解析动作，客户端已安全忽略并继续表单流程。"]
      }
    };
  }
  if (selected && parsed.data.confidence < 0.8) {
    return {
      decision: { ...parsed.data, actionId: null },
      evidence: {
        id: crypto.randomUUID(), task: "select_resume_parse_action", model: settings.model,
        status: "validated", completedAt: new Date().toISOString(),
        warnings: ["动作置信度低于 0.8，客户端未执行。"]
      }
    };
  }
  return {
    decision: parsed.data,
    evidence: {
      id: crypto.randomUUID(),
      task: "select_resume_parse_action",
      model: settings.model,
      status: "validated",
      completedAt: new Date().toISOString(),
      warnings: ["模型只能选择客户端观察到的安全 actionId；执行前仍由客户端二次校验。"]
    }
  };
}

export async function auditFilledFormWithModel(
  settings: BrowserModelSettings,
  fields: AuditableFormField[]
): Promise<{
  verdict: "pass" | "needs_correction";
  issues: z.infer<typeof auditIssueSchema>[];
  evidence: ModelExecutionEvidence;
}> {
  const raw = await invokeJson(settings, "audit_filled_form", {
    fields,
    requirements: {
      goal: "逐项核对招聘网站已填写值与本地简历结构化事实，重点检查教育、工作、项目重复分组、缺失值、错位和尾部符号。",
      constraints: [
        "只能引用输入中的 fieldId",
        "correctionValue 必须逐字等于该字段 expected",
        "不得创造简历中不存在的值",
        "expected 与 actual 相同的字段不得列为问题"
      ]
    },
    outputContract: {
      verdict: "pass | needs_correction",
      issues: [{
        fieldId: "existing fieldId",
        category: "missing | mismatch | format_artifact | section_mismatch",
        correctionValue: "exact expected value",
        reason: "short reason",
        confidence: "0..1"
      }]
    }
  });
  const candidate = raw && typeof raw === "object" && "result" in raw
    ? (raw as { result: unknown }).result
    : raw;
  const parsed = filledFormAuditSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "form_observation",
      message: `模型表单核验未通过结构校验：${z.prettifyError(parsed.error).slice(0, 800)}`,
      retryable: true,
      userAction: "重试表单核验，或更换严格输出 JSON 的模型。"
    });
  }
  const byId = new Map(fields.map((field) => [field.fieldId, field]));
  const modelIssues = parsed.data.issues.filter((issue) => {
    const field = byId.get(issue.fieldId);
    return Boolean(field && field.actual !== field.expected && issue.correctionValue === field.expected);
  });
  const seen = new Set(modelIssues.map((issue) => issue.fieldId));
  const deterministicIssues = fields.flatMap((field): z.infer<typeof auditIssueSchema>[] => {
    if (field.actual === field.expected || seen.has(field.fieldId)) return [];
    return [{
      fieldId: field.fieldId,
      category: !field.actual ? "missing" : /[|｜·・]\s*$/.test(field.actual)
        ? "format_artifact" : "mismatch",
      correctionValue: field.expected,
      reason: !field.actual ? "招聘网站解析后仍为空" : "招聘网站解析值与本地简历事实不一致",
      confidence: 1
    }];
  });
  const issues = [...modelIssues, ...deterministicIssues];
  return {
    verdict: issues.length ? "needs_correction" : "pass",
    issues,
    evidence: {
      id: crypto.randomUUID(),
      task: "audit_filled_form",
      model: settings.model,
      status: "validated",
      completedAt: new Date().toISOString(),
      warnings: [
        "模型只判断已观察字段差异；修正值由客户端强制绑定到本地简历 expected。",
        ...(deterministicIssues.length ? ["客户端补齐了模型遗漏的确定性差异。"] : [])
      ]
    }
  };
}

export async function rankJobsWithModel(
  settings: BrowserModelSettings,
  plan: SearchPlan,
  jobs: JobRecord[]
): Promise<{
  jobs: JobRecord[];
  scores: Record<string, number>;
  reasons: Record<string, string>;
  evidence: ModelExecutionEvidence;
}> {
  const raw = await invokeJson(settings, "rank_jobs", {
    userPrompt: plan.sourcePrompt,
    filters: plan.filters,
    jobs: jobs.map((job) => ({
      jobId: job.id,
      company: job.company,
      title: job.title,
      cities: job.cities,
      channels: job.channels,
      employmentType: job.employmentType,
      skills: job.skills,
      degreeRequirement: job.degreeRequirement,
      experienceRequirement: job.experienceRequirement,
      publishedAt: job.publishedAt,
      jdExcerpt: job.description.slice(0, 1200)
    })),
    rubric: {
      roleAndResponsibilities: 40,
      skills: 25,
      locationAndChannel: 20,
      experienceAndDegree: 10,
      freshness: 5
    },
    outputContract: {
      rankings: [{ jobId: "existing jobId", score: "0..100", reason: "evidence-based short reason" }]
    }
  });
  const candidate = raw && typeof raw === "object" && "result" in raw
    ? (raw as { result: unknown }).result
    : raw;
  const parsed = jobRankingResultSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "search",
      message: `模型岗位排序未通过结构校验：${z.prettifyError(parsed.error).slice(0, 800)}`,
      retryable: true,
      userAction: "重试岗位排序；系统只接受已有岗位 ID 和 0–100 分。"
    });
  }
  const allowed = new Set(jobs.map((job) => job.id));
  const seen = new Set<string>();
  for (const ranking of parsed.data.rankings) {
    if (!allowed.has(ranking.jobId) || seen.has(ranking.jobId)) {
      throw new RecruitingError({
        code: "MODEL_RESPONSE_INVALID",
        stage: "search",
        message: `模型岗位排序包含未知或重复 ID：${ranking.jobId}`,
        retryable: true,
        userAction: "重试；模型只能排序工具真实返回的岗位。"
      });
    }
    seen.add(ranking.jobId);
  }
  if (seen.size !== jobs.length) {
    throw new RecruitingError({
      code: "MODEL_RESPONSE_INVALID",
      stage: "search",
      message: "模型岗位排序遗漏了真实岗位",
      retryable: true,
      userAction: "重试完整排序。"
    });
  }
  const scores = Object.fromEntries(parsed.data.rankings.map((item) => [item.jobId, item.score]));
  const reasons = Object.fromEntries(parsed.data.rankings.map((item) => [item.jobId, item.reason]));
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const ordered = [...parsed.data.rankings]
    .sort((left, right) => right.score - left.score)
    .map((item) => byId.get(item.jobId)!);
  return {
    jobs: ordered,
    scores,
    reasons,
    evidence: {
      id: crypto.randomUUID(),
      task: "rank_jobs",
      model: settings.model,
      status: "validated",
      completedAt: new Date().toISOString(),
      warnings: ["排序只使用工具返回的岗位；硬条件和岗位 ID 由客户端校验。"]
    }
  };
}
