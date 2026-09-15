import { describe, expect, it } from "vitest";
import { cloudServiceOptionsFromEnvironment } from "./server.js";

describe("MCP Job Server environment", () => {
  it("uses the documented JOB_SERVER variables", () => {
    expect(cloudServiceOptionsFromEnvironment({
      JOB_SERVER_BASE_URL: "http://182.61.133.130/automation/recruiting/v2",
      JOB_SERVER_TOKEN: "job-token",
      JOB_SERVER_TENANT_ID: "zhencai-dev"
    })).toEqual({
      baseUrl: "http://182.61.133.130/automation/recruiting/v2",
      accessToken: "job-token",
      tenantId: "zhencai-dev",
      deviceId: "mcp-runtime"
    });
  });

  it("keeps the legacy RECRUITING_CLOUD variables compatible", () => {
    expect(cloudServiceOptionsFromEnvironment({
      RECRUITING_CLOUD_BASE_URL: "https://jobs.example.com/recruiting/v2",
      RECRUITING_CLOUD_ACCESS_TOKEN: "legacy-token",
      RECRUITING_CLOUD_TENANT_ID: "legacy-tenant",
      RECRUITING_CLOUD_DEVICE_ID: "legacy-device"
    })).toEqual({
      baseUrl: "https://jobs.example.com/recruiting/v2",
      accessToken: "legacy-token",
      tenantId: "legacy-tenant",
      deviceId: "legacy-device"
    });
  });

  it("does not silently configure a client when a required value is missing", () => {
    expect(cloudServiceOptionsFromEnvironment({
      JOB_SERVER_BASE_URL: "http://182.61.133.130/automation/recruiting/v2",
      JOB_SERVER_TENANT_ID: "zhencai-dev"
    })).toBeNull();
  });
});
