import { afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import { createLocalApp } from "./server.js";
import { makeVersion } from "./profile.js";
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "aioffer-cli-test-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const local = await createLocalApp({
    root: resolve("."),
    dataDir: dir,
    catalog: {
      total: 1,
      exportedAt: "2026-09-15T00:00:00Z",
      items: [
        {
          jobId: "test-job",
          companyName: "示例公司",
          title: "工程师",
          applicationUrl: "https://example.com/jobs/1",
          locations: ["上海"],
          description: "软件开发",
          channel: "官网",
          tags: [],
          salary: "",
          verifiedAt: null,
        },
      ],
    },
  });
  const server = local.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  cleanup.push(async () => {
    await local.close();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const addr = server.address() as { port: number };
  const request = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Promise<Response>((resolve, reject) => {
      const req = httpRequest(
        `http://127.0.0.1:${addr.port}${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            host: "127.0.0.1:19876",
            authorization: `Bearer ${local.apiToken}`,
            "content-type": "application/json",
            ...headers,
          },
        },
        (res) => {
          const parts: Buffer[] = [];
          res.on("data", (part) => parts.push(part));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(parts), { status: res.statusCode }),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  return { local, dir, request };
}
describe("本地服务安全边界", () => {
  it("任务创建必须明确授权，重试相同请求不重复建批次，跨模式不可重复投递", async () => {
    const { local, request } = await fixture();
    await request("/api/config", {
      model: {
        provider: "compatible",
        baseUrl: "http://127.0.0.1:29999/v1",
        model: "fake-vision",
        apiKey: "test-only",
      },
    });
    await local.sidecar.devices.register({
      tenantId: "local",
      userId: "local-user",
      deviceId: "synthetic-device",
      pluginInstalled: true,
      pluginVersion: "1.0.12",
      capabilities: [
        "batch_auto_apply.v1",
        "account_logout_fence.v1",
        "aioffer.local-runtime.v1",
      ],
    });
    const version = makeVersion(
      {
        schemaVersion: "candidate-profile.v1",
        basic: { fullName: "合成测试用户" },
      },
      [
        {
          assetId: "synthetic-resume",
          purpose: "resume",
          fileRef: "http://127.0.0.1:19876/files/synthetic",
          name: "合成简历.pdf",
          mediaType: "application/pdf",
          sha256: "a".repeat(64),
        },
      ],
    );
    version.confirmedAt = new Date().toISOString();
    await local.store.write("resumes", [version]);
    const body = {
      idempotencyKey: randomUUID(),
      mode: "auto",
      deviceId: "synthetic-device",
      versionId: version.id,
      jobIds: ["test-job"],
      confirmedByUser: true,
      allowAutomaticFinalSubmit: true,
    };
    await local.sidecar.devices.register({
      tenantId: "local",
      userId: "local-user",
      deviceId: "legacy-cloud-device",
      pluginInstalled: true,
      pluginVersion: "1.0.12",
      capabilities: ["batch_auto_apply.v1", "account_logout_fence.v1"],
    });
    const legacy = await request("/api/attempts", {
      ...body,
      deviceId: "legacy-cloud-device",
      idempotencyKey: randomUUID(),
    });
    expect(legacy.status).toBe(409);
    expect(await legacy.text()).toContain("不是 aioffer-cli 本地插件");
    expect(
      (await request("/api/attempts", { ...body, confirmedByUser: false }))
        .status,
    ).toBe(400);
    expect(
      (
        await request("/api/attempts", {
          ...body,
          allowAutomaticFinalSubmit: false,
        })
      ).status,
    ).toBe(409);
    const first = await request("/api/attempts", body);
    const created = await first.json();
    expect(first.status, JSON.stringify(created)).toBe(201);
    const duplicate = await (await request("/api/attempts", body)).json();
    expect(duplicate.batchId).toBe(created.batchId);
    expect(
      (
        await request("/api/attempts", {
          ...body,
          idempotencyKey: randomUUID(),
          mode: "assisted",
        })
      ).status,
    ).toBe(409);
    const attempts = await (await request("/api/attempts")).json();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].batch).toBeTruthy();
  });
  it("离线搜索且拒绝跨站、错误 Host 和无凭据请求", async () => {
    const { request } = await fixture();
    expect((await request("/api/jobs?q=工程师")).status).toBe(200);
    expect(
      (
        await request("/api/status", undefined, {
          origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("/api/status", undefined, { host: "evil.example" }))
        .status,
    ).toBe(403);
    expect(
      (await request("/api/status", undefined, { authorization: "" })).status,
    ).toBe(401);
  });
  it("密钥不回显，配置文件仅本人可读", async () => {
    const { request, dir } = await fixture();
    expect(
      (
        await request("/api/config", {
          model: {
            provider: "qwen",
            baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            model: "example-vision",
            apiKey: "secret-example",
          },
          mineruKey: "mineru-example",
        })
      ).status,
    ).toBe(200);
    const result = await (await request("/api/status")).text();
    expect(result).not.toContain("secret-example");
    expect(result).not.toContain("mineru-example");
    expect((await stat(join(dir, "config.json"))).mode & 0o777).toBe(0o600);
  });
  it("确认生成新版本，原草稿不变；附件只能本机持有链接读取", async () => {
    const { local, request } = await fixture();
    const draft = makeVersion(
      {
        schemaVersion: "candidate-profile.v1",
        basic: { fullName: "示例用户" },
      },
      [],
    );
    await local.store.write("resumes", [draft]);
    const uploaded = await (
      await request("/api/resumes/import", {
        name: "头像.png",
        data: Buffer.from("test").toString("base64"),
        purpose: "portrait",
      })
    ).json();
    const confirmed = await request(`/api/resumes/${draft.id}/confirm`, {
      profile: draft.profile,
      confirmedByUser: true,
      extraAssetIds: [uploaded.asset.assetId],
    });
    expect(confirmed.status).toBe(201);
    const next = await confirmed.json();
    expect(next.id).not.toBe(draft.id);
    expect(next.assets).toHaveLength(1);
    const stored = await local.store.read<any[]>("resumes", []);
    expect(stored[0].confirmedAt).toBeNull();
    expect(stored[1].confirmedAt).toBeTruthy();
    expect((await request(`/files/${uploaded.asset.assetId}`)).status).toBe(
      403,
    );
  });
  it("不能绕过本地确认直接创建旧接口任务", async () => {
    const { request } = await fixture();
    for (const path of [
      "/automation/auto-apply/v1/batches",
      "/automation/auto-apply/v1/batches/",
      "/automation/auto-apply/v1/BATCHES",
      "/automation/application-gateway/v1/application-runs",
      "/automation/mcp",
    ])
      expect((await request(path, {})).status).toBe(403);
  });
});
