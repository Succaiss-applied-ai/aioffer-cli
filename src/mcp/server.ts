import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  formRequirementSchema,
  jobRecordSchema,
  type SearchPlan
} from "../domain.js";
import {
  ApplicationService,
  MemoryApplicationRepository
} from "../applications/application-service.js";
import {
  FormFillPlanningService,
  observedApplicationFieldSchema
} from "../applications/form-fill-planner.js";
import { MemoryDeviceBridge } from "../bridge/browser-bridge.js";
import {
  MemoryResumeKnowledgeRepository,
  type ResumeKnowledgeRepository
} from "../resume/resume-knowledge.js";
import {
  DefaultResumeParser,
  MAX_RESUME_BYTES,
  resumeKnowledgeFromParseResult,
  type ResumeParser
} from "../resume/resume-parser.js";
import { createSearchPlan, refineSearchPlan } from "../search/search-plan.js";
import { JobDiscoveryService } from "../search/job-discovery.js";
import { RecruitingError, toPublicError } from "../errors.js";
import { CloudServiceClient } from "../cloud/cloud-service-client.js";
import {
  historicalJobSnapshotSchema,
  knowledgeJobUpsertSchema,
  type SharedRecruitingKnowledgeRepository
} from "../knowledge/shared-recruiting-knowledge.js";

function toolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

async function runTool(
  operation: () => Promise<Record<string, unknown>> | Record<string, unknown>
) {
  try {
    return toolResult({ ok: true, ...(await operation()) });
  } catch (error) {
    return {
      ...toolResult({ ok: false, error: toPublicError(error) }),
      isError: true
    };
  }
}

export interface RecruitingMcpDependencies {
  resumes?: ResumeKnowledgeRepository;
  applications?: ApplicationService;
  plans?: Map<string, SearchPlan>;
  jobDiscovery?: JobDiscoveryService;
  knowledge?: SharedRecruitingKnowledgeRepository;
  formFillPlanner?: FormFillPlanningService;
  resumeParser?: ResumeParser;
}

export interface RecruitingCloudEnvironment {
  RECRUITING_CLOUD_BASE_URL?: string;
  RECRUITING_CLOUD_ACCESS_TOKEN?: string;
  RECRUITING_CLOUD_TENANT_ID?: string;
  RECRUITING_CLOUD_DEVICE_ID?: string;
  JOB_SERVER_BASE_URL?: string;
  JOB_SERVER_TOKEN?: string;
  JOB_SERVER_TENANT_ID?: string;
  JOB_SERVER_DEVICE_ID?: string;
}

export function cloudServiceOptionsFromEnvironment(
  environment: RecruitingCloudEnvironment
) {
  const baseUrl = environment.JOB_SERVER_BASE_URL?.trim() ||
    environment.RECRUITING_CLOUD_BASE_URL?.trim();
  const accessToken = environment.JOB_SERVER_TOKEN?.trim() ||
    environment.RECRUITING_CLOUD_ACCESS_TOKEN?.trim();
  const tenantId = environment.JOB_SERVER_TENANT_ID?.trim() ||
    environment.RECRUITING_CLOUD_TENANT_ID?.trim();
  const deviceId = environment.JOB_SERVER_DEVICE_ID?.trim() ||
    environment.RECRUITING_CLOUD_DEVICE_ID?.trim() ||
    "mcp-runtime";
  return baseUrl && accessToken && tenantId
    ? { baseUrl, accessToken, tenantId, deviceId }
    : null;
}

export function createRecruitingMcpServer(
  dependencies: RecruitingMcpDependencies = {}
): McpServer {
  const resumes = dependencies.resumes ?? new MemoryResumeKnowledgeRepository();
  const applications =
    dependencies.applications ??
    new ApplicationService(
      resumes,
      new MemoryApplicationRepository(),
      new MemoryDeviceBridge()
    );
  const plans = dependencies.plans ?? new Map<string, SearchPlan>();
  const knowledge = dependencies.knowledge;
  const formFillPlanner = dependencies.formFillPlanner;
  const resumeParser = dependencies.resumeParser ?? new DefaultResumeParser({
    mineruApiUrl: process.env.RECRUITING_MINERU_URL,
    timeoutMs: Number(process.env.RECRUITING_MINERU_TIMEOUT_MS ?? 120_000)
  });
  const cloudOptions = cloudServiceOptionsFromEnvironment(process.env);
  const cloudClient = cloudOptions ? new CloudServiceClient(cloudOptions) : null;
  const jobDiscovery = dependencies.jobDiscovery ?? new JobDiscoveryService([{
    id: "cloud-job-index",
    async discover(plan, signal) {
      if (!cloudClient) {
        throw new RecruitingError({
          code: "CLOUD_SYNC_NOT_CONFIGURED",
          stage: "configuration",
          message: "MCP Runtime 尚未配置招聘云服",
          retryable: false,
          userAction: "配置 JOB_SERVER_BASE_URL、JOB_SERVER_TOKEN 和 JOB_SERVER_TENANT_ID 后重启 Runtime；旧 RECRUITING_CLOUD_* 配置仍兼容。"
        });
      }
      const result = await cloudClient.searchJobs(plan, signal);
      return { jobs: result.jobs };
    }
  }]);
  const server = new McpServer({
    name: "recruiting-ai-mcp",
    version: "0.6.0"
  });

  server.registerTool(
    "jobs.create_search_plan",
    {
      title: "根据求职提示词创建岗位检索计划",
      description:
        "把用户自然语言中的岗位、城市、渠道、经验、行业、技术栈和排除项转换为可修改的结构化检索范围。",
      inputSchema: { prompt: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ prompt }) =>
      runTool(() => {
        const plan = createSearchPlan(prompt);
        plans.set(plan.id, plan);
        return { plan };
      })
  );

  server.registerTool(
    "jobs.refine_search_plan",
    {
      title: "调整岗位检索范围",
      description: "用后续提示词增量调整已有检索计划，并生成新版本。",
      inputSchema: {
        planId: z.string().uuid(),
        prompt: z.string().min(1)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ planId, prompt }) =>
      runTool(() => {
        const current = plans.get(planId);
        if (!current) throw new Error("检索计划不存在");
        const plan = refineSearchPlan(current, prompt);
        plans.set(plan.id, plan);
        return { plan };
      })
  );

  server.registerTool(
    "jobs.search",
    {
      title: "按检索计划发现真实岗位",
      description:
        "从招聘云服持续更新的企业与岗位知识库检索岗位。MCP 和插件不再直接爬取招聘网站。",
      inputSchema: { planId: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false }
    },
    async ({ planId }) =>
      runTool(async () => {
        const plan = plans.get(planId);
        if (!plan) throw new Error("检索计划不存在");
        return { discovery: await jobDiscovery.run(plan) };
      })
  );

  server.registerTool(
    "knowledge.import_historical_snapshot",
    {
      title: "导入历史岗位快照到共享云端知识库",
      description:
        "供受控后台任务使用。幂等导入已核验的历史岗位记录；必须由宿主注入云端仓储，不提供本地仓储回退。",
      inputSchema: {
        snapshot: historicalJobSnapshotSchema,
        jobs: z.array(knowledgeJobUpsertSchema).min(1).max(500)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ snapshot, jobs }) =>
      runTool(async () => {
        if (!knowledge) {
          throw new RecruitingError({
            code: "CLOUD_KNOWLEDGE_UNAVAILABLE",
            stage: "search",
            message: "宿主尚未注入共享云端招聘知识库",
            retryable: false,
            userAction: "连接云端仓储实现后再导入；不要把历史岗位写入插件或内存仓储。"
          });
        }
        return {
          receipt: await knowledge.importHistoricalSnapshot({ snapshot, jobs })
        };
      })
  );

  server.registerTool(
    "resume.parse_local",
    {
      title: "在用户侧解析简历",
      description:
        "直接解析用户上传的简历并生成投递用知识。PDF 使用用户侧 Runtime 配置的 MinerU，DOCX/TXT 在本地处理；内容不会写入共享岗位库。",
      inputSchema: {
        filename: z.string().min(1).max(255),
        mediaType: z.string().min(1).max(200),
        base64: z.string().min(1).max(Math.ceil(MAX_RESUME_BYTES * 4 / 3) + 16)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ filename, mediaType, base64 }) =>
      runTool(async () => {
        const result = await resumeParser.parse({
          filename,
          mediaType,
          buffer: Buffer.from(base64, "base64")
        });
        const snapshot = resumeKnowledgeFromParseResult(result, { filename });
        await resumes.import(snapshot);
        return {
          parser: result.parser,
          warnings: result.warnings,
          snapshot
        };
      })
  );

  server.registerTool(
    "resume_knowledge.get_current",
    {
      title: "读取当前简历知识",
      inputSchema: { userId: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false }
    },
    async ({ userId }) =>
      runTool(async () => ({ snapshot: await resumes.getCurrent(userId) }))
  );

  server.registerTool(
    "applications.plan_form_fill",
    {
      title: "用 AI 生成招聘表单填写计划",
      description:
        "把真实页面观察到的字段交给宿主配置的大模型做语义映射；MCP 仅接受用户已确认简历中真实存在的事实，支持 work[0]/work[1]、project[0]/project[1] 等重复经历。该工具不操作页面，也不会提交申请。",
      inputSchema: {
        resumeSnapshotId: z.string().uuid(),
        fields: z.array(observedApplicationFieldSchema).min(1).max(300)
      },
      annotations: { readOnlyHint: true, destructiveHint: false }
    },
    async ({ resumeSnapshotId, fields }) =>
      runTool(async () => {
        if (!formFillPlanner) {
          throw new RecruitingError({
            code: "MODEL_NOT_CONFIGURED",
            stage: "configuration",
            message: "MCP 宿主尚未注入表单字段映射模型",
            retryable: false,
            userAction: "在用户侧 Runtime 配置模型 API，并把 FormFillPlanningService 注入 MCP。"
          });
        }
        const snapshot = await resumes.get(resumeSnapshotId);
        if (!snapshot) throw new Error("简历知识不存在");
        if (!snapshot.userApproved) throw new Error("简历知识尚未由用户确认");
        return { plan: await formFillPlanner.plan(snapshot, fields) };
      })
  );

  server.registerTool(
    "applications.create_single",
    {
      title: "创建单岗位投递任务",
      inputSchema: {
        userId: z.string().min(1),
        resumeSnapshotId: z.string().uuid(),
        job: jobRecordSchema
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ userId, resumeSnapshotId, job }) =>
      runTool(async () => ({
        batch: await applications.createSingle(userId, resumeSnapshotId, job)
      }))
  );

  server.registerTool(
    "applications.create_batch",
    {
      title: "创建选中岗位批量投递任务",
      description:
        "为用户明确选中的1至20个岗位创建批次、固定简历版本并向本地浏览器执行器发送准备命令，不会直接提交。",
      inputSchema: {
        userId: z.string().min(1),
        resumeSnapshotId: z.string().uuid(),
        jobs: z.array(jobRecordSchema).min(1).max(20)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ userId, resumeSnapshotId, jobs }) =>
      runTool(async () => ({
        batch: await applications.createBatch(userId, resumeSnapshotId, jobs)
      }))
  );

  server.registerTool(
    "applications.record_login_state",
    {
      title: "记录招聘网站登录状态",
      description:
        "由本地插件上报登录限制。需要登录时暂停并提示用户；登录完成后自动下发真实表单读取命令。",
      inputSchema: {
        batchId: z.string().uuid(),
        applicationItemId: z.string().uuid(),
        loginRequired: z.boolean()
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ batchId, applicationItemId, loginRequired }) =>
      runTool(async () => ({
        batch: await applications.recordLoginState(
          batchId,
          applicationItemId,
          loginRequired
        )
      }))
  );

  server.registerTool(
    "applications.record_form_requirements",
    {
      title: "记录真实招聘表单需求",
      description:
        "接收插件从真实申请页面观察到的字段，并根据简历知识计算仍需向用户索要的信息。",
      inputSchema: {
        batchId: z.string().uuid(),
        applicationItemId: z.string().uuid(),
        formFingerprint: z.string().min(1),
        requirements: z.array(formRequirementSchema)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async (input) =>
      runTool(async () => ({
        batch: await applications.recordFormRequirements(
          input.batchId,
          input.applicationItemId,
          input.formFingerprint,
          input.requirements
        )
      }))
  );

  server.registerTool(
    "applications.answer_missing_information",
    {
      title: "补充投递所缺信息",
      inputSchema: {
        batchId: z.string().uuid(),
        answers: z.array(z.object({ key: z.string(), value: z.unknown() })),
        rememberReusable: z.boolean().default(false)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ batchId, answers, rememberReusable }) =>
      runTool(async () => ({
        batch: await applications.answerMissingInformation(
          batchId,
          answers,
          rememberReusable
        )
      }))
  );

  server.registerTool(
    "applications.dispatch_fill",
    {
      title: "自动填写已准备的招聘表单",
      description:
        "仅在真实表单已读取且必填信息齐全时向本地插件下发填表命令，不会提交申请。",
      inputSchema: { batchId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ batchId }) =>
      runTool(async () => ({ receipts: await applications.dispatchFill(batchId) }))
  );

  server.registerTool(
    "applications.record_fill_validation",
    {
      title: "记录表单填写读回校验结果",
      description:
        "由本地插件在逐字段填写并读回校验后上报结果。校验成功前不能生成投递确认。",
      inputSchema: {
        batchId: z.string().uuid(),
        applicationItemId: z.string().uuid(),
        success: z.boolean(),
        error: z.string().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ batchId, applicationItemId, success, error }) =>
      runTool(async () => ({
        batch: await applications.recordFillValidation(
          batchId,
          applicationItemId,
          success,
          error
        )
      }))
  );

  server.registerTool(
    "applications.request_computer_use_fill",
    {
      title: "请求 AI 视觉接管未解决的表单字段",
      description:
        "仅在 DOM/CDP 填写失败后，对明确的未解决字段启动有步数限制的 Computer Use；禁止登录、验证码、法律声明推断和最终提交。",
      inputSchema: {
        batchId: z.string().uuid(),
        applicationItemId: z.string().uuid(),
        unresolvedFieldIds: z.array(z.string().min(1)).min(1)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ batchId, applicationItemId, unresolvedFieldIds }) =>
      runTool(async () => ({
        receipt: await applications.dispatchComputerUseFallback(
          batchId,
          applicationItemId,
          unresolvedFieldIds
        )
      }))
  );

  server.registerTool(
    "applications.prepare_review",
    {
      title: "生成单投或批投预览",
      inputSchema: { batchId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ batchId }) =>
      runTool(async () => ({ review: await applications.prepareReview(batchId) }))
  );

  server.registerTool(
    "applications.approve_batch",
    {
      title: "确认固定投递清单",
      description:
        "将用户已查看的清单哈希绑定为短期授权；任何岗位、简历、答案或表单变化都会使授权失效。",
      inputSchema: {
        batchId: z.string().uuid(),
        reviewedManifestHash: z.string().length(64)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ batchId, reviewedManifestHash }) =>
      runTool(async () => ({
        batch: await applications.approveBatch(batchId, reviewedManifestHash)
      }))
  );

  server.registerResource(
    "recruiting-capabilities",
    "recruiting://capabilities",
    {
      title: "AI Offer 招聘小助手 MCP capabilities",
      description: "模块能力、安全边界和当前版本。",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            version: "0.6.0",
            userSurface: "chrome-extension-sidepanel",
            capabilities: [
              "prompt-driven-job-search",
              "shared-cloud-job-knowledge",
              "cloud-job-index-search",
              "local-mineru-resume-parsing",
              "pii-free-form-schema-sync",
              "single-application",
              "selected-job-batch-application",
              "missing-information-aggregation",
              "login-pause-and-resume",
              "fill-and-readback-validation",
              "ai-form-fill-planning",
              "indexed-repeatable-resume-sections",
              "immutable-review-approval"
            ],
            boundaries: [
              "no-password-or-otp-collection",
              "no-captcha-bypass",
              "no-final-submit-action"
            ]
          })
        }
      ]
    })
  );

  return server;
}
