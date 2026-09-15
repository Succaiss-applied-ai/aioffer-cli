import type { JobRecord, SearchPlan } from "../domain.js";
import type { KnowledgeSyncReceipt } from "../knowledge/shared-recruiting-knowledge.js";
import { RecruitingError } from "../errors.js";

export interface JobSourceConnector {
  readonly id: string;
  discover(
    plan: SearchPlan,
    signal?: AbortSignal
  ): Promise<JobRecord[] | JobSourceBatch>;
}

export interface WebIndexCoverageReceipt {
  receiptId: string;
  issuedAt: string;
  indexUpdatedAt: string;
  sourceFamilies: string[];
  searchedSources: string[];
  failedSources: string[];
  fullWebClaimAllowed: boolean;
}

export interface JobSourceBatch {
  jobs: JobRecord[];
  coverageReceipt?: WebIndexCoverageReceipt;
  knowledgeSyncReceipt?: KnowledgeSyncReceipt;
}

export interface DiscoveryRun {
  planId: string;
  planVersion: number;
  jobs: JobRecord[];
  sourceCounts: Record<string, number>;
  sourceErrors: Record<string, string>;
  coverage: {
    mode: "limited" | "local_web_refresh" | "cloud_index";
    successfulSources: string[];
    failedSources: string[];
    fullWebClaimAllowed: boolean;
    receipts: WebIndexCoverageReceipt[];
  };
  knowledge: {
    storage: "shared_cloud" | "none";
    persisted: boolean;
    receipts: KnowledgeSyncReceipt[];
  };
  ranking: {
    method: "deterministic_relevance_v1" | "ai_relevance_v1" | "cloud_relevance_v2";
    scores: Record<string, number>;
    reasons: Record<string, string>;
  };
  completedAt: string;
}

function canonicalKey(value: string): string {
  const url = new URL(value);
  url.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "spm"].forEach((key) =>
    url.searchParams.delete(key)
  );
  url.searchParams.sort();
  return url.toString();
}

function allowed(job: JobRecord, plan: SearchPlan): boolean {
  const text = `${job.company} ${job.title} ${job.description} ${job.standardRoles.join(" ")} ${job.skills.join(" ")}`.toLowerCase();
  if (plan.filters.excludedTerms.some((term) => text.includes(term.toLowerCase()))) {
    return false;
  }
  if (
    plan.filters.locations.length > 0 &&
    !plan.filters.locations.some((location) =>
      job.locations.some(
        (jobLocation) =>
          jobLocation.includes(location) || location.includes(jobLocation)
      )
    )
  ) {
    return false;
  }
  if (
    plan.filters.channels.length > 0 &&
    !plan.filters.channels.some((channel) => job.channels.includes(channel))
  ) {
    return false;
  }
  const relevanceTerms = [...plan.filters.roles, ...plan.filters.skills];
  if (
    relevanceTerms.length > 0 &&
    !relevanceTerms.some((term) =>
      text.replace(/\s+/g, "").includes(term.toLowerCase().replace(/\s+/g, ""))
    )
  ) {
    return false;
  }
  return job.activeStatus !== "inactive";
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function relevanceScore(job: JobRecord, plan: SearchPlan): number {
  const title = normalized(job.title);
  const roleText = normalized(`${job.title} ${job.standardRoles.join(" ")}`);
  const allText = normalized(`${job.company} ${job.title} ${job.description} ${job.skills.join(" ")}`);
  let score = 0;
  const roles = plan.filters.roles.map(normalized).filter(Boolean);
  if (roles.some((role) => title.includes(role) || role.includes(title))) score += 40;
  else if (roles.some((role) => roleText.includes(role))) score += 28;
  const skills = plan.filters.skills.map(normalized).filter(Boolean);
  if (skills.length) {
    score += Math.round(25 * skills.filter((skill) => allText.includes(skill)).length / skills.length);
  }
  if (!plan.filters.locations.length || plan.filters.locations.some((location) =>
    job.cities.some((city) => city.includes(location) || location.includes(city)) ||
    job.locations.some((item) => item.includes(location) || location.includes(item))
  )) score += 15;
  if (!plan.filters.channels.length || plan.filters.channels.some((channel) => job.channels.includes(channel))) {
    score += 10;
  }
  if (!plan.filters.employmentTypes.length ||
    (job.employmentType && plan.filters.employmentTypes.includes(job.employmentType))) score += 5;
  if (job.publishedAt && plan.filters.publishedWithinDays) {
    const age = Date.now() - new Date(job.publishedAt).getTime();
    if (age <= plan.filters.publishedWithinDays * 86_400_000) score += 5;
  }
  return Math.min(100, score);
}

export class JobDiscoveryService {
  constructor(private readonly connectors: JobSourceConnector[]) {}

  async run(plan: SearchPlan, signal?: AbortSignal): Promise<DiscoveryRun> {
    const settled = await Promise.allSettled(
      this.connectors.map(async (connector) => ({
        connector: connector.id,
        batch: await connector.discover(plan, signal)
      }))
    );
    const sourceCounts: Record<string, number> = {};
    const sourceErrors: Record<string, string> = {};
    const results: Array<{
      connector: string;
      jobs: JobRecord[];
      coverageReceipt?: WebIndexCoverageReceipt;
      knowledgeSyncReceipt?: KnowledgeSyncReceipt;
    }> = [];
    settled.forEach((result, index) => {
      const connectorId = this.connectors[index]!.id;
      if (result.status === "fulfilled") {
        const batch = Array.isArray(result.value.batch)
          ? { jobs: result.value.batch }
          : result.value.batch;
        results.push({ connector: result.value.connector, ...batch });
      } else {
        sourceErrors[connectorId] = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      }
    });
    if (!results.length) {
      const onlyResult = settled.length === 1 ? settled[0] : undefined;
      if (
        onlyResult?.status === "rejected" &&
        onlyResult.reason instanceof RecruitingError
      ) {
        throw onlyResult.reason;
      }
      throw new Error(Object.entries(sourceErrors)
        .map(([source, message]) => `${source}: ${message}`)
        .join("；") || "没有配置可用的岗位来源");
    }
    const unique = new Map<string, JobRecord>();
    for (const result of results) {
      sourceCounts[result.connector] = result.jobs.length;
      for (const job of result.jobs) {
        if (!allowed(job, plan)) continue;
        unique.set(canonicalKey(job.canonicalUrl), job);
      }
    }
    const scores = Object.fromEntries(
      [...unique.values()].map((job) => [job.id, relevanceScore(job, plan)])
    );
    const ranked = [...unique.values()].sort((left, right) =>
      (scores[right.id] ?? 0) - (scores[left.id] ?? 0) ||
      new Date(right.publishedAt ?? right.verifiedAt).getTime() -
        new Date(left.publishedAt ?? left.verifiedAt).getTime()
    );
    const perCompany = new Map<string, number>();
    const jobs = ranked.filter((job) => {
      const count = perCompany.get(job.company) ?? 0;
      if (count >= plan.filters.maximumJobsPerCompany) return false;
      perCompany.set(job.company, count + 1);
      return true;
    });
    const receipts = results.flatMap((result) => result.coverageReceipt ? [result.coverageReceipt] : []);
    const knowledgeReceipts = results.flatMap((result) =>
      result.knowledgeSyncReceipt ? [result.knowledgeSyncReceipt] : []
    );
    const fullWebClaimAllowed = receipts.some((receipt) => receipt.fullWebClaimAllowed) &&
      knowledgeReceipts.some((receipt) => receipt.storage === "shared_cloud");
    return {
      planId: plan.id,
      planVersion: plan.version,
      jobs: jobs.slice(0, plan.filters.maximumResults),
      sourceCounts,
      sourceErrors,
      coverage: {
        mode: fullWebClaimAllowed ? "local_web_refresh" : "limited",
        successfulSources: Object.keys(sourceCounts),
        failedSources: Object.keys(sourceErrors),
        fullWebClaimAllowed,
        receipts
      },
      knowledge: {
        storage: knowledgeReceipts.length ? "shared_cloud" : "none",
        persisted: knowledgeReceipts.length > 0,
        receipts: knowledgeReceipts
      },
      ranking: {
        method: "deterministic_relevance_v1",
        scores: Object.fromEntries(jobs.map((job) => [job.id, scores[job.id] ?? 0])),
        reasons: Object.fromEntries(jobs.map((job) => [job.id, "确定性兜底排序"]))
      },
      completedAt: new Date().toISOString()
    };
  }
}
