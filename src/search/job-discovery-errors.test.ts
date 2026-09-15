import { describe, expect, it } from "vitest";
import { RecruitingError } from "../errors.js";
import { createSearchPlan } from "./search-plan.js";
import { JobDiscoveryService } from "./job-discovery.js";

describe("job discovery errors", () => {
  it("preserves a structured local Web tooling error from the only production source", async () => {
    const error = new RecruitingError({
      code: "WEB_SEARCH_NOT_CONFIGURED",
      stage: "search",
      message: "尚未配置本地 Web Search 工具",
      retryable: false,
      userAction: "配置本地 Web Search/Fetch 工具。"
    });
    await expect(new JobDiscoveryService([{
      id: "local-web-runtime",
      async discover() { throw error; }
    }]).run(createSearchPlan("深圳 Python 后端"))).rejects.toBe(error);
  });
});
