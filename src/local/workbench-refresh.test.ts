// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); vi.resetModules(); });
describe("工作台记录刷新", () => {
  it("记录不变时保留确认控件，变化后展示新的回读提示", async () => {
    vi.useFakeTimers();
    document.documentElement.innerHTML = await readFile("web/index.html", "utf8");
    let attempts = [{id:"test", mode:"assisted",createdAt:"2026-09-16T00:00:00Z",batch:{batchId:"test",status:"paused",jobs:[{
      batchJobId:"job",jobId:"fixture",companyName:"本机测试",title:"测试岗位",status:"waiting_for_user_action",reasonCode:"final_review_required",
      evidence:{failureDetails:{reviewHash:"current"}},
      localReviewApproval:{reviewHash:"current",expiresAt:"2999-01-01T00:00:00Z"},
    }]}}];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => ({ok:true,json:async()=> {
      if(path === "/api/status") return {jobs:0,extensionPath:"fixture",providers:{qwen:{label:"测试",baseUrl:"https://example.com"}}};
      if(path === "/api/attempts") return structuredClone(attempts);
      if(path.startsWith("/api/jobs")) return {items:[],total:0};
      return [];
    }})));
    await import("../../web/app.js");
    const button = [...document.querySelectorAll("#attempts button")].find(x => x.textContent === "已核对原页面，确认最终投递");
    expect(button).toBeTruthy();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.querySelector("#attempts")!.contains(button!)).toBe(true);
    attempts[0]!.batch.jobs[0]!.evidence.failureDetails.reviewHash = "changed";
    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.querySelector("#attempts")!.contains(button!)).toBe(false);
    expect(document.querySelector("#attempts")!.textContent).toContain("页面内容与上次确认不一致");
  });
});
