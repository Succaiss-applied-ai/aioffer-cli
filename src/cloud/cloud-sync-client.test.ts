import { describe, expect, it } from "vitest";
import { CloudSyncClient } from "./cloud-sync-client.js";

describe("CloudSyncClient", () => {
  it("pulls shared knowledge without invoking any model endpoint", async () => {
    const calls: string[] = [];
    const client = new CloudSyncClient({
      baseUrl: "https://cloud.example.com/v1",
      accessToken: "secret",
      deviceId: "dev-1",
      tenantId: "tenant-1",
      fetcher: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify({
          schemaVersion: "job-knowledge-pull-result.v1",
          snapshotId: "snapshot-1",
          cursor: "cursor-1",
          hasMore: false,
          jobs: [],
          forms: []
        }), { status: 200 });
      }
    });
    const result = await client.pullJobs({
      cursor: null,
      filters: { roles: [], cities: [], channels: [], employmentTypes: [], updatedAfter: null },
      include: { inactive: false, restricted: true, formSchemas: true },
      limit: 100
    });
    expect(result.cursor).toBe("cursor-1");
    expect(calls).toEqual(["https://cloud.example.com/v1/job-knowledge:pull"]);
  });
});
