import express from "express";
import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createApplicationGatewaySidecar } from "../gateway/sidecar.js";
import { VisionAgent } from "../gateway/vision-agent.js";
import {
  requireReadyDevice,
  assertAutoApplyPluginVersion,
} from "../gateway/device-registry.js";
import { matchSiteAdapter } from "../gateway/site-adapter-registry.js";
import { candidateProfileSchema } from "../gateway/application-contract.js";
import { JsonAutoApplyBatchRepository } from "../gateway/auto-apply-service.js";
import {
  modelConfigSchema,
  providers,
  complete,
  validateEndpoint,
  type ModelConfig,
} from "./providers.js";
import { LocalStore } from "./store.js";
import { loadCatalog, searchCatalog, type Catalog } from "./catalog.js";
import { parseMineru } from "./mineru.js";
import { testVisionModel } from "./vision-probe.js";
import {
  makeVersion,
  candidatePackage,
  extractProfile,
  sha256,
  type ResumeVersion,
} from "./profile.js";

export const localOrigin = "http://127.0.0.1:19876";
const owner = { tenantId: "local", userId: "local-user" };
interface Configuration {
  model?: ModelConfig;
  mineruKey?: string;
}
interface Attempt {
  id: string;
  mode: "assisted" | "auto";
  jobIds: string[];
  versionId: string;
  deviceId: string;
  createdAt: string;
  runIds: string[];
  batchId?: string;
  state: "creating" | "created" | "uncertain";
  payload?: unknown;
}
const attemptInput = z.object({
  idempotencyKey: z.string().uuid(),
  mode: z.enum(["assisted", "auto"]),
  deviceId: z.string().min(1),
  versionId: z.string().uuid(),
  jobIds: z.array(z.string().min(1)).min(1).max(100),
  confirmedByUser: z.literal(true),
  allowAutomaticFinalSubmit: z.boolean().default(false),
  allowConsentClick: z.boolean().default(false),
});
function sameSecret(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createLocalApp(options: {
  dataDir: string;
  root: string;
  catalog?: Catalog;
}) {
  const store = new LocalStore(options.dataDir);
  await store.init();
  await mkdir(join(store.dir, "files"), { recursive: true, mode: 0o700 });
  const secrets = await store.read("secrets", {
    apiToken: randomBytes(32).toString("hex"),
    signingSecret: randomBytes(32).toString("hex"),
  });
  await store.write("secrets", secrets);
  let config = await store.read<Configuration>("config", {});
  const catalog =
    options.catalog ??
    (await loadCatalog(join(options.root, "data/jobs.json.gz")));
  const jobs = new Map(catalog.items.map((x) => [x.jobId, x]));
  const vision = new VisionAgent({
    completion: (input) => {
      if (!config.model) throw Error("请先配置视觉模型");
      return complete(config.model, input);
    },
    isConfigured: () => Boolean(config.model),
  });
  const sidecar = createApplicationGatewaySidecar({
    dataDir: join(store.dir, "gateway"),
    accessToken: secrets.apiToken,
    tenantId: owner.tenantId,
    visionAgent: vision,
    autoApplySigningSecret: secrets.signingSecret,
    allowedOrigins: [localOrigin, "http://localhost:19876"],
  });
  // 恢复“已建批次、尚未保存映射”的断点，只恢复记录，不重发浏览器动作。
  const repository = new JsonAutoApplyBatchRepository(
    join(store.dir, "gateway/auto-apply-batches.json"),
  );
  const pending = await store.read<Attempt[]>("attempts", []);
  let recovered = false;
  for (const attempt of pending.filter((x) => x.state !== "created")) {
    const batch = await repository.findByIdempotencyKey(
      owner.tenantId,
      owner.userId,
      attempt.id,
    );
    if (
      batch &&
      batch.deviceId === attempt.deviceId &&
      batch.candidate.packageVersion === attempt.versionId
    ) {
      attempt.batchId = batch.batchId;
      attempt.state = "created";
      recovered = true;
    }
  }
  if (recovered) await store.write("attempts", pending);
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (
      !["127.0.0.1:19876", "localhost:19876"].includes(req.headers.host ?? "")
    ) {
      res.status(403).json({ message: "本地服务拒绝此 Host" });
      return;
    }
    const origin = req.headers.origin;
    const device = req.path.startsWith("/automation/device-bridge/");
    if (
      origin &&
      ![localOrigin, "http://localhost:19876"].includes(origin) &&
      !(device && /^chrome-extension:\/\/[a-p]{32}$/.test(origin))
    ) {
      res.status(403).json({ message: "拒绝跨站请求" });
      return;
    }
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  const signature = (id: string) =>
    createHmac("sha256", secrets.signingSecret)
      .update(`local-file:${id}`)
      .digest("hex");
  const fileUrl = (id: string) =>
    `${localOrigin}/files/${id}?access=${signature(id)}`;
  app.get("/files/:id", async (req, res) => {
    const id = String(req.params.id);
    if (
      !/^[a-f0-9-]{36}(?:\.json)?$/.test(id) ||
      !sameSecret(String(req.query.access ?? ""), signature(id))
    ) {
      res.status(403).end();
      return;
    }
    try {
      const data = await readFile(join(store.dir, "files", id));
      res
        .type(
          id.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
        )
        .send(data);
    } catch {
      res.status(404).end();
    }
  });
  app.get("/health", (_req, res) =>
    res.json({ ok: true, mode: "local", jobs: catalog.total }),
  );
  app.use(express.static(join(options.root, "web"), { index: "index.html" }));
  app.use((req, res, next) => {
    // Device pairing uses one-time bootstrap tokens; subsequent requests use device credentials.
    if (req.path.startsWith("/automation/device-bridge/")) {
      next();
      return;
    }
    if (
      !sameSecret(
        req.header("authorization") ?? "",
        `Bearer ${secrets.apiToken}`,
      )
    ) {
      res.status(401).json({ message: "请使用终端显示的本地访问链接打开界面" });
      return;
    }
    req.headers["x-tenant-id"] = owner.tenantId;
    req.headers["x-user-id"] = owner.userId;
    next();
  });
  app.use("/api", express.json({ limit: "30mb" }));
  app.get("/api/status", async (_req, res) =>
    res.json({
      mode: "local",
      dataDir: store.dir,
      extensionPath: join(options.root, "extension/dist"),
      jobs: catalog.total,
      exportedAt: catalog.exportedAt,
      model: config.model
        ? {
            provider: config.model.provider,
            model: config.model.model,
            baseUrl: config.model.baseUrl,
            configured: true,
          }
        : null,
      mineruConfigured: Boolean(config.mineruKey),
      providers,
    }),
  );
  app.post("/api/config", async (req, res) => {
    const input = z
      .object({
        model: modelConfigSchema
          .omit({ apiKey: true })
          .extend({ apiKey: z.string().optional() })
          .optional(),
        mineruKey: z.string().max(4096).optional(),
      })
      .parse(req.body);
    if (input.model) {
      validateEndpoint(input.model.baseUrl);
      const same =
        config.model?.provider === input.model.provider &&
        config.model?.baseUrl === input.model.baseUrl;
      config = {
        ...config,
        model: modelConfigSchema.parse({
          ...input.model,
          apiKey:
            input.model.apiKey || (same ? config.model?.apiKey : undefined),
        }),
      };
    }
    if (input.mineruKey?.trim())
      config = { ...config, mineruKey: input.mineruKey.trim() };
    await store.write("config", config);
    res.json({ ok: true });
  });
  app.post("/api/model/test", async (_req, res) => {
    if (!config.model) throw Error("请先配置视觉模型");
    res.json({ ok: true, message: await testVisionModel(config.model) });
  });
  app.get("/api/jobs", (req, res) => {
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json(
      searchCatalog(
        catalog,
        String(req.query.q ?? ""),
        String(req.query.city ?? ""),
        offset,
      ),
    );
  });
  app.get("/api/resumes", async (_req, res) =>
    res.json(await store.read<ResumeVersion[]>("resumes", [])),
  );
  app.post("/api/resumes/import", async (req, res) => {
    const input = z
      .object({
        name: z.string().min(1).max(200),
        data: z.string().max(28_000_000),
        purpose: z
          .enum(["resume", "portrait", "portfolio", "other"])
          .default("resume"),
        allowExternalParsing: z.boolean().default(false),
      })
      .parse(req.body);
    const name = input.name.replace(/[\\/\r\n]/g, "_");
    const bytes = Buffer.from(input.data, "base64");
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw Error("文件不能为空且不能超过 20 MB");
    const mediaType = /\.pdf$/i.test(name)
      ? "application/pdf"
      : /\.docx$/i.test(name)
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : /\.png$/i.test(name)
          ? "image/png"
          : /\.jpe?g$/i.test(name)
            ? "image/jpeg"
            : /\.(txt|md)$/i.test(name)
              ? "text/plain"
              : null;
    if (!mediaType) throw Error("请上传 PDF、DOCX、TXT、Markdown、PNG 或 JPG");
    const id = randomUUID();
    const asset = {
      assetId: id,
      purpose: input.purpose,
      fileRef: fileUrl(id),
      name,
      mediaType,
      sha256: sha256(bytes),
    };
    if (input.purpose !== "resume") {
      await writeFile(join(store.dir, "files", id), bytes, { mode: 0o600 });
      await store.exclusive(async () => {
        const assets = await store.read<any[]>("extra-assets", []);
        assets.push(asset);
        await store.write("extra-assets", assets);
      });
      res.json({ asset });
      return;
    }
    if (!input.allowExternalParsing)
      throw Error("请明确同意将简历发送给 MinerU 和所选模型");
    if (!config.model) throw Error("请先配置模型");
    const text =
      mediaType === "text/plain"
        ? bytes.toString("utf8")
        : await parseMineru(bytes, name, config.mineruKey ?? "");
    const profile = await extractProfile(text, config.model);
    await writeFile(join(store.dir, "files", id), bytes, { mode: 0o600 });
    const version = makeVersion(profile, [asset], text);
    await store.exclusive(async () => {
      const versions = await store.read<ResumeVersion[]>("resumes", []);
      versions.push(version);
      await store.write("resumes", versions);
    });
    res.status(201).json(version);
  });
  app.post("/api/resumes/:id/confirm", async (req, res) => {
    if (req.body.confirmedByUser !== true)
      throw Error("必须确认资料真实、完整且允许用于投递");
    const profile = candidateProfileSchema.parse(req.body.profile);
    const version = await store.exclusive(async () => {
      const versions = await store.read<ResumeVersion[]>("resumes", []);
      const draft = versions.find((x) => x.id === req.params.id);
      if (!draft) throw Error("简历版本不存在");
      const extra = z
        .array(z.string().uuid())
        .max(10)
        .parse(req.body.extraAssetIds ?? []);
      const assetIndex = await store.read<any[]>("extra-assets", []);
      const assets = extra.map((id) => {
        const asset = assetIndex.find((x) => x.assetId === id);
        if (!asset) throw Error("附件不存在");
        return asset;
      });
      const next = makeVersion(
        profile,
        [...draft.assets, ...assets],
        draft.text,
      );
      next.confirmedAt = new Date().toISOString();
      versions.push(next);
      await store.write("resumes", versions);
      return next;
    });
    res.status(201).json(version);
  });
  app.post("/api/bootstrap", async (_req, res) => {
    await sidecar.autoApply.activateOwner(owner);
    const created = await sidecar.pairings.createBootstrap({
      ...owner,
      expiresInSeconds: 120,
    });
    res.json({
      bootstrapToken: created.bootstrapToken,
      gatewayBaseUrl: `${localOrigin}/automation`,
    });
  });
  app.get("/api/devices", async (_req, res) =>
    res.json(await sidecar.devices.list(owner.tenantId, owner.userId)),
  );
  app.post("/api/preview", async (req, res) => {
    const input = attemptInput
      .omit({ confirmedByUser: true, idempotencyKey: true })
      .parse(req.body);
    const versions = await store.read<ResumeVersion[]>("resumes", []);
    const version = versions.find(
      (x) => x.id === input.versionId && x.confirmedAt,
    );
    if (!version) throw Error("请先确认简历资料");
    const selected = input.jobIds.map((id) => {
      const job = jobs.get(id);
      if (!job) throw Error("岗位不存在");
      return { ...job, support: matchSiteAdapter(job.applicationUrl) };
    });
    res.json({
      versionId: version.id,
      resumeName: version.assets.find((x) => x.purpose === "resume")?.name,
      jobs: selected,
      mode: input.mode,
    });
  });
  app.post("/api/attempts", async (req, res) => {
    const input = attemptInput.parse(req.body);
    if (new Set(input.jobIds).size !== input.jobIds.length)
      throw Error("岗位列表中有重复项");
    if (input.mode === "assisted" && input.jobIds.length !== 1)
      throw Error("半自动模式每次处理一个岗位");
    if (input.mode === "auto" && !input.allowAutomaticFinalSubmit)
      throw Error("自动模式必须单独授权最终提交");
    if (!config.model) throw Error("请先配置视觉模型");
    const result = await store.exclusive(async () => {
      const attempts = await store.read<Attempt[]>("attempts", []);
      const existing = attempts.find((x) => x.id === input.idempotencyKey);
      if (existing) {
        if (JSON.stringify(existing.payload) !== JSON.stringify(input))
          throw Error("幂等键与原请求不一致");
        return existing;
      }
      const overlap = attempts.find((x) =>
        x.jobIds.some((id) => input.jobIds.includes(id)),
      );
      if (overlap)
        throw Error(
          "该岗位已有投递记录，请先在记录中处理原任务，不能跨模式重复投递",
        );
      const device = await requireReadyDevice(
        sidecar.devices,
        owner.tenantId,
        owner.userId,
        input.deviceId,
      );
      assertAutoApplyPluginVersion(device);
      if (!device.capabilities.includes("aioffer.local-runtime.v1"))
        throw Error("此设备不是 aioffer-cli 本地插件，请加载本项目扩展并重新连接");
      const versions = await store.read<ResumeVersion[]>("resumes", []);
      const version = versions.find(
        (x) => x.id === input.versionId && x.confirmedAt,
      );
      if (!version) throw Error("简历尚未确认");
      const selected = input.jobIds.map((id) => {
        const job = jobs.get(id);
        if (!job) throw Error("岗位不存在");
        return job;
      });
      const attempt: Attempt = {
        id: input.idempotencyKey,
        mode: input.mode,
        jobIds: input.jobIds,
        versionId: version.id,
        deviceId: input.deviceId,
        createdAt: new Date().toISOString(),
        runIds: [],
        state: "creating",
        payload: input,
      };
      // Persist cross-mode ownership before creating work. A crash remains visible, never auto-retries a submit.
      attempts.push(attempt);
      await store.write("attempts", attempts);
      try {
        {
          const body = JSON.stringify(candidatePackage(version));
          const id = `${version.id}.json`;
          await writeFile(join(store.dir, "files", id), body, { mode: 0o600 });
          const batch = await sidecar.autoApply.create({
            ...owner,
            deviceId: input.deviceId,
            idempotencyKey: input.idempotencyKey,
            request: {
              schemaVersion: "auto-apply-batch-request.v1",
              candidate: {
                packageRef: fileUrl(id),
                packageVersion: version.id,
                packageSha256: sha256(body),
                applicationProfile: {
                  schemaVersion: "candidate-application-profile.v1",
                  revision: sha256("[]"),
                  facts: [],
                },
              },
              assets: version.assets,
              jobs: selected,
              confirmation: {
                scope: "batch",
                confirmedByUser: true,
                confirmedAt: new Date().toISOString(),
                displayedJobIds: input.jobIds,
                allowAutomaticFinalSubmit: input.mode === "auto",
              },
              safety: { allowConsentClick: input.allowConsentClick },
            } as any,
          });
          attempt.batchId = batch.batchId;
        }
        attempt.state = "created";
      } catch (error) {
        attempt.state = "uncertain";
        await store.write("attempts", attempts);
        throw error;
      }
      await store.write("attempts", attempts);
      return attempt;
    });
    res.status(201).json(result);
  });
  app.get("/api/attempts", async (_req, res) => {
    const attempts = await store.read<Attempt[]>("attempts", []);
    res.json(
      await Promise.all(
        attempts.map(async (attempt) => ({
          ...attempt,
          payload: undefined,
          batch: attempt.batchId
            ? await sidecar.autoApply.get(attempt.batchId, owner)
            : null,
          runs: await Promise.all(
            attempt.runIds.map((id) => sidecar.gateway.get(id)),
          ),
        })),
      ),
    );
  });
  app.post("/api/batches/:batchId/jobs/:jobId/confirm", async (req, res) => {
    const input = z
      .object({
        confirmedByUser: z.literal(true),
        reviewHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .parse(req.body);
    res.json(
      await sidecar.autoApply.confirmLocalReview(
        String(req.params.batchId),
        String(req.params.jobId),
        input.reviewHash,
        owner,
      ),
    );
  });
  // Creation must go through the local authority/duplicate guard, not raw legacy endpoints.
  app.use((req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/+$/, "");
    if (
      path.startsWith("/automation/application-gateway/") ||
      path.startsWith("/automation/mcp") ||
      (req.method === "POST" && path === "/automation/auto-apply/v1/batches")
    ) {
      res.status(403).json({ message: "请通过本地投递确认界面创建任务" });
      return;
    }
    next();
  });
  app.use(sidecar.app);
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error instanceof z.ZodError ? 400 : 409)
        .json({
          message:
            error instanceof z.ZodError
              ? "输入格式错误，请检查必填字段"
              : error instanceof Error
                ? error.message
                : "本地操作失败",
        });
    },
  );
  return {
    app,
    store,
    sidecar,
    apiToken: secrets.apiToken,
    close: () => sidecar.runtime.stop(),
  };
}
