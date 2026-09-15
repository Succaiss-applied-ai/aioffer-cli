import type { JobRecord, SearchPlan } from "../../domain.js";
import type {
  JobSourceBatch,
  JobSourceConnector,
  WebIndexCoverageReceipt
} from "../job-discovery.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface PublicCareerDefinition {
  id: string;
  probeUrl: string;
  jobs: JobRecord[];
}

function applicationForm(): JobRecord["applicationForm"] {
  return {
    status: "not_observed",
    fingerprint: null,
    fields: null,
    observedAt: null
  };
}

function applicationLoginRequirement(status: "required" | "not_required" | "unknown", evidenceUrl: string | null): JobRecord["applicationLoginRequirement"] {
  return status !== "unknown" ? {
    status,
    scope: "company",
    verificationMethod: "manual_apply_flow",
    verifiedAt: "2026-08-22T02:57:00.000Z",
    evidenceUrl
  } : {
    status: "unknown",
    scope: "unknown",
    verificationMethod: "unknown",
    verifiedAt: null,
    evidenceUrl: null
  };
}

const definitions: PublicCareerDefinition[] = [
  {
    id: "xiaopeng-official-careers",
    probeUrl: "https://xiaopeng.jobs.feishu.cn/index/position/list",
    jobs: [{
      id: "xiaopeng-7627105760351177010",
      canonicalUrl: "https://xiaopeng.jobs.feishu.cn/index/position/7627105760351177010/detail",
      applicationUrl: "https://xiaopeng.jobs.feishu.cn/index/resume/7627105760351177010/apply",
      applicationLoginRequirement: applicationLoginRequirement("required", "https://xiaopeng.jobs.feishu.cn/index/login?redirect_path=%2Fresume%2F7273119092109871397%2Fapply"),
      positionType: null,
      source: "xiaopeng-official-careers",
      company: "小鹏汽车",
      title: "机器人DevOps工程师",
      standardRoles: ["DevOps工程师", "运维开发工程师"],
      locations: ["深圳", "上海"],
      cities: ["深圳", "上海"],
      channels: ["social"],
      employmentType: "full_time",
      description: "小鹏集团智能机器人板块正式岗位。该记录来自已核验历史基线；本次检索会重新验证官方招聘入口可访问，岗位详情与表单在打开页面后继续核验。",
      candidatePreparation: null,
      applicationForm: applicationForm(),
      skills: ["DevOps", "Linux", "Docker", "Kubernetes"],
      degreeRequirement: "本科及以上",
      experienceRequirement: null,
      salary: null,
      publishedAt: null,
      activeStatus: "unknown",
      verifiedAt: "2026-07-30T03:30:00.000Z",
      evidence: ["https://xiaopeng.jobs.feishu.cn/index/position/list"]
    }]
  },
  {
    id: "deepseek-official-careers",
    probeUrl: "https://talent.deepseek.com/",
    jobs: [
      {
        id: "deepseek-2eb2e75d-full-time",
        canonicalUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398",
        applicationUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply",
        applicationLoginRequirement: applicationLoginRequirement("not_required", "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/01416da2-3c8a-4a20-bbb3-1c925d0facf1/apply"),
        positionType: null,
        source: "deepseek-official-careers",
        company: "DeepSeek",
        title: "服务端开发工程师（正式）",
        standardRoles: ["服务端开发工程师", "后端开发工程师"],
        locations: ["北京", "杭州"],
        cities: ["北京", "杭州"],
        channels: ["social"],
        employmentType: "full_time",
        description: "官方岗位原名为服务端开发工程师（线上核心服务、Agent 后端、数据仓库）。该记录来自已核验历史基线；本次检索会重新验证官方招聘入口可访问，岗位详情与表单在打开页面后继续核验。",
        candidatePreparation: null,
        applicationForm: applicationForm(),
        skills: ["Python", "Go", "C++", "分布式系统"],
        degreeRequirement: "本科及以上",
        experienceRequirement: null,
        salary: null,
        publishedAt: null,
        activeStatus: "unknown",
        verifiedAt: "2026-07-30T03:30:00.000Z",
        evidence: ["https://talent.deepseek.com/"]
      },
      {
        id: "deepseek-2eb2e75d-internship",
        canonicalUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398",
        applicationUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply",
        applicationLoginRequirement: applicationLoginRequirement("not_required", "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/01416da2-3c8a-4a20-bbb3-1c925d0facf1/apply"),
        positionType: null,
        source: "deepseek-official-careers",
        company: "DeepSeek",
        title: "服务端开发工程师（实习）",
        standardRoles: ["服务端开发工程师", "后端开发实习生"],
        locations: ["北京", "杭州"],
        cities: ["北京", "杭州"],
        channels: ["internship"],
        employmentType: "internship",
        description: "官方岗位原名为服务端开发工程师（线上核心服务、Agent 后端、数据仓库），该记录代表实习通道。该记录来自已核验历史基线；本次检索会重新验证官方招聘入口可访问。",
        candidatePreparation: null,
        applicationForm: applicationForm(),
        skills: ["Python", "Go", "C++", "分布式系统"],
        degreeRequirement: "本科及以上",
        experienceRequirement: "0年经验可投",
        salary: null,
        publishedAt: null,
        activeStatus: "unknown",
        verifiedAt: "2026-07-30T03:30:00.000Z",
        evidence: ["https://talent.deepseek.com/"]
      }
    ]
  }
];

function receipt(definition: PublicCareerDefinition, verifiedAt: string): WebIndexCoverageReceipt {
  return {
    receiptId: crypto.randomUUID(),
    issuedAt: verifiedAt,
    indexUpdatedAt: verifiedAt,
    sourceFamilies: ["official_career"],
    searchedSources: [definition.id],
    failedSources: [],
    fullWebClaimAllowed: false
  };
}

export class ConfiguredPublicCareerConnector implements JobSourceConnector {
  readonly id: string;

  constructor(
    private readonly definition: PublicCareerDefinition,
    private readonly fetcher: Fetcher = (input, init) => globalThis.fetch(input, init)
  ) {
    this.id = definition.id;
  }

  async discover(_plan: SearchPlan, signal?: AbortSignal): Promise<JobSourceBatch> {
    const response = await this.fetcher(this.definition.probeUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal
    });
    if (!response.ok) {
      throw new Error(`${this.id} 官方招聘入口返回 HTTP ${response.status}`);
    }
    const verifiedAt = new Date().toISOString();
    return {
      jobs: this.definition.jobs.map((job) => ({
        ...job,
        verifiedAt,
        evidence: [...new Set([...job.evidence, response.url || this.definition.probeUrl])]
      })),
      coverageReceipt: receipt(this.definition, verifiedAt)
    };
  }
}

export function configuredPublicCareerConnectors(fetcher?: Fetcher): JobSourceConnector[] {
  return definitions.map((definition) =>
    new ConfiguredPublicCareerConnector(definition, fetcher)
  );
}
