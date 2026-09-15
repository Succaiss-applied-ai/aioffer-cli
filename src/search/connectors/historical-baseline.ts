import baseline from "../../../config/job-baseline-2026-07-30.json" with { type: "json" };
import { jobRecordSchema, type JobRecord, type SearchPlan } from "../../domain.js";
import type {
  JobSourceBatch,
  JobSourceConnector,
  WebIndexCoverageReceipt
} from "../job-discovery.js";

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function looselyMatches(job: JobRecord, plan: SearchPlan): boolean {
  if (job.activeStatus === "inactive") return false;
  const text = normalized([
    job.company,
    job.title,
    ...job.standardRoles,
    ...job.skills,
    job.description
  ].join(" "));
  if (plan.filters.excludedTerms.some((term) => text.includes(normalized(term)))) return false;
  const concreteLocations = plan.filters.locationMode === "anywhere" ? [] : plan.filters.locations.filter((location) =>
    !/^(所有城市|不限|全国|任意城市|全部城市|anywhere)$/i.test(normalized(location))
  );
  if (concreteLocations.length && !concreteLocations.some((location) =>
    [...job.cities, ...job.locations].some((item) =>
      normalized(item).includes(normalized(location)) || normalized(location).includes(normalized(item))
    )
  )) return false;
  const relevance = [...plan.filters.roles, ...plan.filters.skills].filter(Boolean);
  return !relevance.length || relevance.some((term) => text.includes(normalized(term)));
}

export class HistoricalBaselineConnector implements JobSourceConnector {
  readonly id = "shared-baseline-2026-07-30";
  private readonly jobs = baseline.jobs.map((job) => jobRecordSchema.parse(job));

  async discover(plan: SearchPlan): Promise<JobSourceBatch> {
    const jobs = this.jobs.filter((job) => looselyMatches(job, plan));
    const receipt: WebIndexCoverageReceipt = {
      receiptId: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
      indexUpdatedAt: baseline.observedAt,
      sourceFamilies: ["shared_historical_baseline"],
      searchedSources: [this.id],
      failedSources: [],
      fullWebClaimAllowed: false
    };
    return { jobs, coverageReceipt: receipt };
  }
}
