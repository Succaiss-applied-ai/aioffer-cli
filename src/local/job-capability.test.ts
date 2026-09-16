import { describe, expect, it } from "vitest";
import { jobCapability, assertJobMode, companyCoverage } from "./job-capability.js";
import { searchCatalog, type LocalJob } from "./catalog.js";
const job: LocalJob = {
  jobId: "synthetic", companyName: "合成企业", title: "测试工程师", locations: ["上海"], description: "开发", channel: "social", tags: [], salary: "", verifiedAt: null,
  availability: "active", applicationUrl: "https://app.mokahr.com/social-recruitment/fixture/1#/job/abc/apply",
  loginRequirement: { status: "not_required", scope: "job", verificationMethod: "manual_apply_flow", verifiedAt: "2026-09-16T00:00:00Z", evidenceUrl: "https://example.com/application" },
};
describe("岗位能力证据与模式准入", () => {
  it("免登录按来源状态分类，不额外要求专用适配或特定核验方法", () => {
    expect(jobCapability(job)).toMatchObject({ kind: "auto", allowedModes: ["auto", "assisted"] });
    expect(jobCapability({ ...job, applicationUrl: "https://example.com/ordinary-page" }).kind).toBe("auto");
    expect(jobCapability({ ...job, loginRequirement: undefined }).kind).toBe("unverified");
    expect(jobCapability({ ...job, loginRequirement: { ...job.loginRequirement!, verifiedAt: "" } }).kind).toBe("auto");
  });
  it("需登录按来源分类为半自动，没有历史成功也可用", () => {
    const required = { ...job, loginRequirement: { ...job.loginRequirement!, status: "required" as const } };
    expect(jobCapability(required).kind).toBe("assisted");
    const succeeded = { ...required, deliveryEvidence: { successfulOn: "2026-09-15", latestStatus: "succeeded", latestOn: "2026-09-15" } };
    expect(jobCapability(succeeded)).toMatchObject({ kind: "assisted", allowedModes: ["assisted"] });
    expect(() => assertJobMode(succeeded, "auto")).toThrow("不可使用自动模式");
  });
  it("关闭岗位和非法 URL 不能被历史成功或伪造支持标记放行", () => {
    const succeeded = { ...job, deliveryEvidence: { successfulOn: "2026-09-15", latestStatus: "succeeded", latestOn: "2026-09-15" } };
    expect(jobCapability({ ...succeeded, availability: "unavailable" }).kind).toBe("unavailable");
    for (const applicationUrl of ["javascript:alert(1)", "https://user:password@example.com/"]) {
      expect(jobCapability({ ...succeeded, applicationUrl }).allowedModes).toEqual([]);
    }
    expect(() => assertJobMode({ ...job, availability: undefined }, "assisted")).toThrow();
  });
  it("能力过滤发生在分页之前，统计不随关键字改变", () => {
    const items = [job, { ...job, jobId: "closed", availability: "unavailable" as const }, { ...job, jobId: "unknown", loginRequirement: undefined }];
    const c = { total: 3, exportedAt: "2026-09-16", items };
    expect(searchCatalog(c, "", "", 0, 30, "actionable")).toMatchObject({ total: 1, capabilityCounts: { auto: 1, assisted: 0, unverified: 1, unavailable: 1 } });
    expect(searchCatalog(c, "", "", 0, 30, "unavailable").items[0]?.jobId).toBe("closed");
    expect(searchCatalog(c, "不存在", "", 0, 30, "actionable").capabilityCounts.auto).toBe(1);
  });
});

it("企业统计去重但保留跨模式与 ATS 租户入口", () => {
 const required = {...job, jobId:"second", loginRequirement:{...job.loginRequirement!,status:"required" as const}};
 const other = {...required,jobId:"third",companyName:"另一企业",applicationUrl:"https://app.mokahr.com/social-recruitment/another/2#/job/def/apply"};
 const result=companyCoverage([job,required,other,{...job,jobId:"closed",companyName:"关闭企业",availability:"unavailable"}]);
 expect(result.counts).toEqual({total:2,auto:1,assisted:2,mixed:1});
 const company=result.companies.find(x=>x.companyName===job.companyName)!;
 expect(company).toMatchObject({autoJobs:1,assistedJobs:1});
 expect(company.entries).toHaveLength(2);
});
