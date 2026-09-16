import { describe, expect, it } from "vitest";
import { finalReviewNotice } from "../../web/review-notice.js";

describe("半自动再次确认提示", () => {
  const now = Date.parse("2026-09-16T00:00:00Z");
  const job = {
    localReviewApproval: { reviewHash: "old", expiresAt: "2026-09-16T00:05:00Z" },
    evidence: { failureDetails: { reviewHash: "current" } },
  };
  it("页面变化后说明为什么再次确认，不声称申请未被发送", () => {
    expect(finalReviewNotice(job, now)).toContain("页面内容与上次确认不一致");
    expect(finalReviewNotice(job, now)).not.toContain("未提交");
  });
  it("区分过期确认和初次确认", () => {
    expect(finalReviewNotice({ ...job, evidence: { failureDetails: { reviewHash: "old" } } }, now + 600_000)).toContain("上次确认已过期");
    expect(finalReviewNotice({}, now)).not.toContain("上次确认");
    expect(finalReviewNotice({}, now)).toContain("会触发真实提交");
  });
});
