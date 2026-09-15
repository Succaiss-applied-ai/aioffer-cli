import { describe, expect, it } from "vitest";
import { jobFixture } from "../test-fixtures.js";
import { createSearchPlan } from "./search-plan.js";
import {
  JobDiscoveryService,
  type JobSourceConnector
} from "./job-discovery.js";

describe("job discovery", () => {
  it("deduplicates URLs, removes inactive/excluded jobs and keeps provenance counts", async () => {
    const connectors: JobSourceConnector[] = [
      {
        id: "official",
        async discover() {
          return [
            jobFixture("1"),
            jobFixture("2", { company: "某外包公司" }),
            jobFixture("3", { activeStatus: "inactive" })
          ];
        }
      },
      {
        id: "ats",
        async discover() {
          return [
            jobFixture("same", {
              canonicalUrl: "https://jobs.example.com/job/1?utm_source=feed"
            })
          ];
        }
      }
    ];
    const result = await new JobDiscoveryService(connectors).run(
      createSearchPlan("深圳 Python后端 应届 排除外包")
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.id).toBe("same");
    expect(result.sourceCounts).toEqual({ official: 3, ats: 1 });
  });

  it("matches a city name against a more detailed source location", async () => {
    const connector: JobSourceConnector = {
      id: "official",
      async discover() {
        return [jobFixture("beijing", { locations: ["北京市 海淀区"] })];
      }
    };
    const result = await new JobDiscoveryService([connector]).run(
      createSearchPlan("北京 Python后端 应届")
    );
    expect(result.jobs).toHaveLength(1);
  });

  it("does not return a role-irrelevant job just because its city matches", async () => {
    const connector: JobSourceConnector = {
      id: "official",
      async discover() {
        return [
          jobFixture("admin", {
            title: "行政助理",
            standardRoles: ["行政"],
            description: "负责办公室行政支持",
            skills: [],
            locations: ["北京市 海淀区"]
          })
        ];
      }
    };
    const result = await new JobDiscoveryService([connector]).run(
      createSearchPlan("北京 Python后端 应届")
    );
    expect(result.jobs).toHaveLength(0);
  });

  it("keeps a semantic Server match when the requested role is in standardRoles", async () => {
    const connector: JobSourceConnector = {
      id: "cloud-index",
      async discover() {
        return [jobFixture("semantic", {
          title: "研发工程师",
          standardRoles: ["后端开发"],
          description: "负责核心服务建设",
          skills: ["Java"],
          locations: ["北京市"]
        })];
      }
    };
    const result = await new JobDiscoveryService([connector]).run(
      createSearchPlan("北京 后端开发")
    );
    expect(result.jobs.map((job) => job.id)).toEqual(["semantic"]);
  });

  it("keeps successful sources and reports failed sources without claiming full-web coverage", async () => {
    const result = await new JobDiscoveryService([
      { id: "company-careers", async discover() { return [jobFixture("ok")]; } },
      { id: "blocked-board", async discover() { throw new Error("需要登录"); } }
    ]).run(createSearchPlan("深圳 Python后端 应届"));

    expect(result.jobs).toHaveLength(1);
    expect(result.sourceErrors).toEqual({ "blocked-board": "需要登录" });
    expect(result.coverage).toEqual({
      mode: "limited",
      successfulSources: ["company-careers"],
      failedSources: ["blocked-board"],
      fullWebClaimAllowed: false,
      receipts: []
    });
    expect(result.knowledge).toEqual({
      storage: "none",
      persisted: false,
      receipts: []
    });
  });

  it("orders relevant title and skill matches before weaker matches", async () => {
    const connector: JobSourceConnector = {
      id: "ranked",
      async discover() {
        return [
          jobFixture("weak", {
            title: "软件工程师",
            standardRoles: ["软件开发"],
            description: "使用 Python 参与系统开发",
            skills: ["Python"]
          }),
          jobFixture("strong", {
            title: "Python 后端工程师",
            standardRoles: ["Python后端"],
            description: "Python SQL 后端服务",
            skills: ["Python", "SQL"]
          })
        ];
      }
    };
    const result = await new JobDiscoveryService([connector]).run(
      createSearchPlan("深圳 Python后端 应届")
    );
    expect(result.jobs.map((job) => job.id)).toEqual(["strong", "weak"]);
    expect(result.ranking.scores.strong).toBeGreaterThan(result.ranking.scores.weak!);
  });

  it("allows a full-web label only with a qualifying backend receipt", async () => {
    const connector: JobSourceConnector = {
      id: "web-job-index",
      async discover() {
        return {
          jobs: [jobFixture("indexed")],
          coverageReceipt: {
            receiptId: "receipt",
            issuedAt: new Date().toISOString(),
            indexUpdatedAt: new Date().toISOString(),
            sourceFamilies: ["company_careers", "job_boards"],
            searchedSources: ["official", "board"],
            failedSources: [],
            fullWebClaimAllowed: true
          },
          knowledgeSyncReceipt: {
            receiptId: "knowledge-receipt",
            issuedAt: new Date().toISOString(),
            storage: "shared_cloud",
            namespace: "recruiting/jobs",
            baseline: {
              snapshotId: "recruiting-jobs-2026-07-30",
              datasetName: "全岗位招聘信息_C端数据结构版_20260730",
              observedAt: "2026-07-30T00:00:00.000Z",
              importedAt: new Date().toISOString(),
              recordCount: 338,
              sourceArtifact: "全岗位招聘信息_C端数据结构版_20260730.xlsx",
              sourceSha256: null
            },
            refresh: {
              executor: "local_model_web_runtime",
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              queryCount: 1,
              fetchedPageCount: 1,
              verifiedJobCount: 1
            },
            mutations: {
              inserted: 0,
              updated: 0,
              unchanged: 1,
              deactivated: 0,
              formSchemasUpserted: 0
            },
            persistedAt: new Date().toISOString()
          }
        };
      }
    };
    const result = await new JobDiscoveryService([connector]).run(
      createSearchPlan("深圳 Python后端 应届")
    );
    expect(result.coverage.mode).toBe("local_web_refresh");
    expect(result.coverage.fullWebClaimAllowed).toBe(true);
    expect(result.knowledge.storage).toBe("shared_cloud");
    expect(result.knowledge.persisted).toBe(true);
  });
});
