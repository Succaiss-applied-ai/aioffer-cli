import { describe, expect, it } from "vitest";
import { createSearchPlan, createSearchPlanFromFilters } from "../search-plan.js";
import { HistoricalBaselineConnector } from "./historical-baseline.js";

describe("historical recruiting baseline", () => {
  it("searches the 338-row shared baseline instead of a two-company demo list", async () => {
    const connector = new HistoricalBaselineConnector();
    const result = await connector.discover(createSearchPlan("天津 安全测试工程师"));
    expect(result).not.toBeInstanceOf(Array);
    const jobs = Array.isArray(result) ? result : result.jobs;
    expect(jobs.some((job) => job.company.includes("国汽") && job.cities.includes("天津"))).toBe(true);
  });

  it("treats all-city model keywords as no location restriction", async () => {
    const connector = new HistoricalBaselineConnector();
    const plan = createSearchPlanFromFilters("所有城市的后端开发", {
      roles: ["后端开发"],
      locations: ["所有城市"]
    });
    const result = await connector.discover(plan);
    const jobs = Array.isArray(result) ? result : result.jobs;
    expect(jobs.length).toBeGreaterThan(0);
  });
});
