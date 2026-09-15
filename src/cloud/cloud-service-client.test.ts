import { describe, expect, it } from "vitest";
import { createSearchPlanFromFilters } from "../search/search-plan.js";
import { CloudServiceClient, CloudServiceError } from "./cloud-service-client.js";

function client(fetcher: typeof fetch) {
  return new CloudServiceClient({
    baseUrl: "https://cloud.example.com/recruiting/v2",
    accessToken: "token",
    deviceId: "device-123",
    tenantId: "tenant-1",
    requestId: () => "request-123456789",
    fetcher
  });
}

describe("CloudServiceClient", () => {
  function jobItem(id: string) {
    return {
      jobId: id,
      company: { companyId: "company-1", name: "示例科技", industries: ["人工智能"] },
      title: `后端开发工程师 ${id}`,
      standardRoles: ["后端开发"],
      cities: ["深圳市"],
      channel: "campus",
      employmentType: "full_time",
      applicationUrl: `https://careers.example.com/jobs/${id}/apply`,
      applicationLoginRequirement: {
        status: "required",
        scope: "company",
        verificationMethod: "manual_apply_flow",
        verifiedAt: "2026-08-22T03:02:00Z",
        evidenceUrl: "https://careers.example.com/jobs/verified"
      },
      description: "负责后端服务开发",
      candidatePreparation: "N/A",
      formSummary: "N/A",
      status: "active",
      publishedAt: null,
      salary: "15000-20000元/月",
      verifiedAt: "2026-08-06T00:00:00Z",
      relevanceScore: 0.9,
      evidence: [{
        url: `https://careers.example.com/jobs/${id}`,
        sourceId: "official",
        observedAt: "2026-08-06T00:00:00Z"
      }]
    };
  }

  it.each([true, false])("preserves optional company-logo fields and supports older responses (logo=%s)", async withLogo => {
    const logoUrl = "https://cloud.example.com/recruiting/v2/company-logos/" + "a".repeat(64) + ".png";
    const logoUpdatedAt = "2026-09-14T00:00:00.000Z";
    const item = jobItem("logo-job");
    const service = client(async () => new Response(JSON.stringify({
      schemaVersion: "job-search-response.v2", indexRevision: 7, indexUpdatedAt: "2026-09-14T00:00:00Z",
      items: [{ ...item, company: { ...item.company, ...(withLogo ? { logoUrl, logoStatus: "available", logoUpdatedAt } : {}) } }],
      page: { nextCursor: null }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const plan = createSearchPlanFromFilters("后端开发", { roles: ["后端开发"], locationMode: "anywhere", locations: [] });
    const result = await service.searchJobs(plan);
    expect(result.jobs[0]).toMatchObject({
      company: "示例科技", companyLogoUrl: withLogo ? logoUrl : null,
      companyLogoStatus: withLogo ? "available" : "pending", companyLogoUpdatedAt: withLogo ? logoUpdatedAt : null
    });
  });

  it("searches the server without putting all-city words into the query filter", async () => {
    let body: Record<string, any> | undefined;
    const service = client(async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        schemaVersion: "job-search-response.v2",
        indexRevision: 7,
        indexUpdatedAt: "2026-08-06T00:00:00Z",
        items: [jobItem("job-1")],
        page: { nextCursor: null }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const plan = createSearchPlanFromFilters("所有城市的后端开发", {
      roles: ["后端开发"],
      locationMode: "anywhere",
      locations: []
    });

    const result = await service.searchJobs(plan);

    expect(body?.filters.location).toEqual({ mode: "anywhere", cities: [] });
    expect(result.jobs[0]).toMatchObject({
      id: "job-1",
      company: "示例科技",
      title: "后端开发工程师 job-1",
      cities: ["深圳市"],
      salary: "15000-20000元/月",
      applicationLoginRequirement: { status: "required", scope: "company" }
    });
  });

  it("follows job search cursors until the requested maximum is reached", async () => {
    const bodies: Record<string, any>[] = [];
    const service = client(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const firstPage = bodies.length === 1;
      return new Response(JSON.stringify({
        schemaVersion: "job-search-response.v2",
        indexRevision: 7,
        indexUpdatedAt: "2026-08-06T00:00:00Z",
        items: firstPage ? [jobItem("job-1"), jobItem("job-2")] : [jobItem("job-3")],
        page: { nextCursor: firstPage ? "cursor-2" : null }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const plan = createSearchPlanFromFilters("后端开发", {
      roles: ["后端开发"],
      locationMode: "anywhere",
      locations: [],
      maximumResults: 3
    });

    const result = await service.searchJobs(plan);

    expect(result.jobs.map((job) => job.id)).toEqual(["job-1", "job-2", "job-3"]);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.page).toEqual({ limit: 3 });
    expect(bodies[1]?.page).toEqual({ limit: 1, cursor: "cursor-2" });
  });

  it("allows the registered 119.29.25.120:8093 HTTP integration endpoint", () => {
    expect(() => new CloudServiceClient({
      baseUrl: "http://119.29.25.120:8093/automation/recruiting/v2",
      accessToken: "token",
      deviceId: "device-123",
      tenantId: "tenant-1"
    })).not.toThrow();
  });

  it("allows the unified 119.45.12.68 HTTP gateway endpoint", () => {
    expect(() => new CloudServiceClient({
      baseUrl: "http://119.45.12.68/automation/recruiting/v2",
      accessToken: "token",
      deviceId: "device-123",
      tenantId: "tenant-1"
    })).not.toThrow();
  });

  it.each([
    "http://182.61.133.130/automation/recruiting/v2",
    "http://192.168.0.2/automation/recruiting/v2"
  ])("allows the registered Baidu Cloud HTTP endpoint %s", (baseUrl) => {
    expect(() => new CloudServiceClient({
      baseUrl,
      accessToken: "token",
      deviceId: "device-123",
      tenantId: "tenant-1"
    })).not.toThrow();
  });

  it("never serializes field values or selectors in form observations", async () => {
    let body = "";
    const service = client(async (_input, init) => {
      body = String(init?.body);
      return new Response(JSON.stringify({
        schemaVersion: "application-form-observation-receipt.v2",
        accepted: true,
        deduplicated: false,
        schemaId: "form-1",
        revision: 1,
        requestId: "request-123456789"
      }), { status: 201, headers: { "content-type": "application/json" } });
    });

    await service.recordApplicationFormObservation("job-1", {
      status: "observed",
      applicationUrl: "https://careers.example.com/jobs/1/apply",
      siteHost: "careers.example.com",
      loginRequired: false,
      fingerprint: "fnv1a-123",
      fields: [{
        fieldKey: "basic.name",
        label: "姓名",
        normalizedLabel: "姓名",
        type: "text",
        required: true,
        sectionKind: "basic_information",
        repeatable: false,
        order: 0,
        semanticKey: "person.name",
        mappingConfidence: 0.99,
        options: []
      }],
      observedAt: "2026-08-06T00:00:00Z"
    }, "idem-1234567890123456");

    expect(body).toContain('"label":"姓名"');
    expect(body).not.toMatch(/"(?:value|answer|selector)"\s*:/i);
  });

  it("rejects candidate values before a form observation leaves the client", async () => {
    const service = client(async () => {
      throw new Error("fetch must not run");
    });
    await expect(service.recordApplicationFormObservation("job-1", {
      status: "observed",
      applicationUrl: "https://careers.example.com/jobs/1/apply",
      siteHost: "careers.example.com",
      loginRequired: false,
      fields: [{
        fieldKey: "basic.name",
        label: "姓名",
        normalizedLabel: "姓名",
        type: "text",
        required: true,
        sectionKind: "basic_information",
        repeatable: false,
        order: 0,
        options: [],
        value: "林测试"
      } as any],
      observedAt: "2026-08-06T00:00:00Z"
    }, "idem-1234567890123456")).rejects.toThrow(/Unrecognized key|unrecognized_keys/i);
  });

  it("preserves contractual cloud errors", async () => {
    const service = client(async () => new Response(JSON.stringify({
      error: {
        code: "AUTH_REQUIRED",
        message: "云服登录已过期",
        userAction: "重新登录招聘 AI。",
        retryable: false,
        requestId: "cloud-request"
      }
    }), { status: 401, headers: { "content-type": "application/json" } }));

    await expect(service.capabilities()).rejects.toMatchObject<Partial<CloudServiceError>>({
      status: 401,
      code: "AUTH_REQUIRED",
      message: "云服登录已过期",
      requestId: "cloud-request"
    });
  });
});
