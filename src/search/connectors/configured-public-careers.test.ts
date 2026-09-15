import { describe, expect, it } from "vitest";
import { configuredPublicCareerConnectors } from "./configured-public-careers.js";
import { createSearchPlan } from "../search-plan.js";

describe("configured public career connectors", () => {
  it("revalidates each public source and never claims full Web coverage", async () => {
    const calls: string[] = [];
    const connectors = configuredPublicCareerConnectors(async (input) => {
      calls.push(String(input));
      return new Response("ok", { status: 200 });
    });
    const plan = createSearchPlan("找后端岗位");
    const batches = await Promise.all(connectors.map((connector) => connector.discover(plan)));
    expect(calls).toEqual([
      "https://xiaopeng.jobs.feishu.cn/index/position/list",
      "https://talent.deepseek.com/"
    ]);
    expect(batches.flatMap((batch) => Array.isArray(batch) ? batch : batch.jobs)).toHaveLength(3);
    expect(batches.every((batch) => !Array.isArray(batch) && batch.coverageReceipt?.fullWebClaimAllowed === false)).toBe(true);
  });
});
