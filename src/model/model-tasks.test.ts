import { afterEach, describe, expect, it, vi } from "vitest";
import {
  auditFilledFormWithModel,
  mapFormFieldsWithModel,
  parseSearchPromptWithModel,
  prepareFormPrefillWithModel,
  rankJobsWithModel,
  selectResumeParseActionWithModel
} from "./model-tasks.js";
import { jobFixture } from "../test-fixtures.js";
import { createSearchPlan } from "../search/search-plan.js";

function responseFor(value: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(value) } }]
  }), { headers: { "content-type": "application/json" } });
}

const searchKeywords = {
  roles: ["Python后端"], locations: ["北京"], channelKeywords: ["社招"],
  employmentTypeKeywords: ["正式岗"], industries: ["人工智能"],
  skills: ["Python"], degrees: [], excludedTerms: ["外包"],
  maximumExperienceYears: 3, publishedWithinDays: 14, maximumResults: 100
} as const;

describe("browser model tasks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a real chat/completions response as the search plan proposal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor(searchKeywords)));
    const result = await parseSearchPromptWithModel(
      { baseUrl: "https://api.example.com", model: "test-model", apiKey: "secret" },
      "北京 Python 后端社招"
    );
    expect(result.filters.locations).toEqual(["北京"]);
    expect(result.evidence).toMatchObject({ task: "parse_search_prompt", status: "validated" });
  });

  it("retries one empty DeepSeek JSON response with thinking disabled", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "" } }]
      })))
      .mockResolvedValueOnce(responseFor(searchKeywords));
    vi.stubGlobal("fetch", fetcher);

    const result = await parseSearchPromptWithModel(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      "北京 Python 后端社招"
    );

    expect(result.filters.roles).toEqual(["Python后端"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(secondRequest.thinking).toEqual({ type: "disabled" });
    expect(secondRequest.messages[1].content).toContain("retryInstruction");
  });

  it("builds the fixed SearchFilters schema locally from AI keywords", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor(searchKeywords)));

    const result = await parseSearchPromptWithModel(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      "北京 Python 后端社招"
    );

    expect(result.filters.locations).toEqual(["北京"]);
    expect(result.filters.channels).toEqual(["social"]);
    expect(result.filters.employmentTypes).toEqual(["full_time"]);
    expect(result.filters.maximumJobsPerCompany).toBe(5);
    expect(result.evidence.warnings[0]).toContain("客户端固定 Schema");
  });

  it("retries when the model echoes the invocation envelope", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(responseFor({
        task: "extract_search_keywords",
        locale: "zh-CN",
        input: { prompt: "深圳 DevOps" },
        outputSchemaVersion: "1.0"
      }))
      .mockResolvedValueOnce(responseFor({
        ...searchKeywords,
        roles: ["DevOps工程师"],
        locations: ["深圳"]
      }));
    vi.stubGlobal("fetch", fetcher);

    const result = await parseSearchPromptWithModel(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      "深圳 DevOps"
    );

    expect(result.filters.roles).toEqual(["DevOps工程师"]);
    expect(result.evidence.warnings).toContain("首次结构无效，严格重试后通过。");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("applies the zero-experience campus rule after keyword extraction", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({
      ...searchKeywords,
      channelKeywords: [],
      employmentTypeKeywords: [],
      maximumExperienceYears: 0
    })));

    const result = await parseSearchPromptWithModel(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      "北京 0 年经验岗位"
    );

    expect(result.filters.channels).toEqual(["campus", "graduate"]);
  });

  it("normalizes an AI-produced all-cities token to an unrestricted location", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({
      ...searchKeywords,
      roles: ["后端开发"],
      locations: ["所有城市"]
    })));

    const result = await parseSearchPromptWithModel(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      "所有城市的后端开发"
    );

    expect(result.filters.locationMode).toBe("anywhere");
    expect(result.filters.locations).toEqual([]);
  });

  it("rejects mappings for fields that were not observed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({
      schemaVersion: "1.0",
      task: "map_form_fields",
      result: { mappings: [
        { fieldId: "name", semanticKey: "basic.fullName", confidence: 0.99, source: "local_profile", evidenceRef: null },
        { fieldId: "invented", semanticKey: "basic.phone", confidence: 0.99, source: "local_profile", evidenceRef: null }
      ] },
      warnings: [], evidenceRefs: []
    })));
    const result = await mapFormFieldsWithModel(
      { baseUrl: "https://api.example.com", model: "test-model" },
      [{ fieldId: "name", label: "姓名", type: "text", required: true, options: [] }],
      ["basic.fullName"]
    );
    expect(result.mappings.map((item) => item.fieldId)).toEqual(["name"]);
  });

  it("normalizes DeepSeek field mappings with wrong envelope literals and nested metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({
      schemaVersion: "v1",
      task: "form_observation",
      result: {
        mappings: [
          { fieldId: "name", semanticKey: "basic.fullName", confidence: 0.99, source: "local_profile", evidenceRef: null }
        ],
        warnings: ["模型把元数据放进了 result"],
        evidenceRefs: []
      }
    })));

    const result = await mapFormFieldsWithModel(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      [{ fieldId: "name", label: "姓名", type: "text", required: true, options: [] }],
      ["basic.fullName"]
    );

    expect(result.mappings).toHaveLength(1);
    expect(result.evidence.warnings).toContain("模型把元数据放进了 result");
    expect(result.evidence.warnings).toContain("客户端已将模型返回归一化为固定字段映射协议。");
  });

  it("keeps only LLM prefill candidates traceable to exact resume facts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({ candidates: [
      {
        fieldId: "project-name",
        semanticKey: "project[0].name",
        proposedValue: "高并发订单服务改造",
        confidence: 0.98,
        reason: "字段属于第一段项目经历的项目名称"
      },
      {
        fieldId: "full-name",
        semanticKey: "basic.fullName",
        proposedValue: "模型编造的名字",
        confidence: 0.99,
        reason: "错误候选"
      }
    ] })));

    const result = await prepareFormPrefillWithModel(
      { baseUrl: "https://api.example.com", model: "test-model" },
      [
        { fieldId: "project-name", label: "项目经历 · 项目名称", type: "text", required: true, options: [] },
        { fieldId: "full-name", label: "基本信息 · 姓名", type: "text", required: true, options: [] }
      ],
      {
        "project[0].name": "高并发订单服务改造",
        "basic.fullName": "林测试"
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.semanticKey).toBe("project[0].name");
    expect(result.evidence.warnings.at(-1)).toContain("丢弃了 1 条");
  });

  it("lets the model rank only tool-returned job IDs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({ rankings: [
      { jobId: "strong", score: 92, reason: "岗位与 Python 后端要求高度匹配" },
      { jobId: "weak", score: 61, reason: "技能匹配但岗位方向较宽" }
    ] })));
    const result = await rankJobsWithModel(
      { baseUrl: "https://api.example.com", model: "test-model" },
      createSearchPlan("深圳 Python后端 应届"),
      [jobFixture("weak"), jobFixture("strong")]
    );
    expect(result.jobs.map((job) => job.id)).toEqual(["strong", "weak"]);
    expect(result.evidence.task).toBe("rank_jobs");
  });

  it("lets AI select only an observed safe resume parser action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({
      actionId: "action-parse",
      confidence: 0.97,
      reason: "按钮明确表示解析并覆盖简历"
    })));
    const result = await selectResumeParseActionWithModel(
      { baseUrl: "https://api.example.com", model: "test-model" },
      [
        { actionId: "action-parse", text: "解析并覆盖", kind: "resume_parse", risk: "safe", disabled: false, context: "上传简历后解析并覆盖" },
        { actionId: "action-submit", text: "提交简历", kind: "final_submit", risk: "user_only", disabled: false, context: "提交" }
      ],
      { pageTitle: "招聘申请", resumeUploaded: true }
    );
    expect(result.decision.actionId).toBe("action-parse");
    expect(result.evidence.task).toBe("select_resume_parse_action");
  });

  it("safely ignores a model-selected action that is not a resume parser", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({
      actionId: "action-upload",
      confidence: 0.94,
      reason: "误认为上传按钮会解析简历"
    })));
    const result = await selectResumeParseActionWithModel(
      { baseUrl: "https://api.example.com", model: "test-model" },
      [{
        actionId: "action-upload", text: "选择文件", kind: "neutral", risk: "safe",
        disabled: false, context: "上传简历"
      }],
      { pageTitle: "招聘申请", resumeUploaded: false }
    );
    expect(result.decision.actionId).toBeNull();
    expect(result.evidence.warnings[0]).toContain("安全忽略");
  });

  it("binds AI form corrections to local resume expected values", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFor({
      verdict: "needs_correction",
      issues: [{
        fieldId: "project-name",
        category: "format_artifact",
        correctionValue: "高并发订单服务改造",
        reason: "站点解析结果混入尾部符号",
        confidence: 0.99
      }]
    })));
    const result = await auditFilledFormWithModel(
      { baseUrl: "https://api.example.com", model: "test-model" },
      [{
        fieldId: "project-name",
        label: "项目经历1 项目名称",
        semanticKey: "project[0].name",
        expected: "高并发订单服务改造",
        actual: "高并发订单服务改造|"
      }]
    );
    expect(result.verdict).toBe("needs_correction");
    expect(result.issues[0]?.correctionValue).toBe("高并发订单服务改造");
    expect(result.evidence.task).toBe("audit_filled_form");
  });
});
