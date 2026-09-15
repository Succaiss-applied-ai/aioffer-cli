import { gatewayInfrastructureError } from "./infrastructure-error.js";
import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import type { AutoApplyService } from "./auto-apply-service.js";
import type { DeviceRegistry } from "./device-registry.js";
import {
  autoApplyPluginCompatibilityError,
  CURRENT_AUTO_APPLY_PLUGIN_VERSION,
  PREVIOUS_AUTO_APPLY_PLUGIN_VERSIONS,
  PLUGIN_UPDATE_MESSAGE,
  assertAutoApplyPluginVersion,
  deviceState,
  MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
  PluginUpdateRequiredError,
  requireReadyDevice
} from "./device-registry.js";
import {
  DeviceIdRequiredError,
  DeviceNotFoundError,
  GatewayRequestError
} from "./gateway-errors.js";
import { matchSiteAdapter, siteAdapterCapabilities } from "./site-adapter-registry.js";
import type { DevicePairingRegistry } from "./device-pairing.js";

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response) => {
    void handler(request, response).catch((cause: unknown) => {
      const error = gatewayInfrastructureError(cause) ?? cause;
      const updateRequired = error instanceof PluginUpdateRequiredError;
      const requestError = error instanceof GatewayRequestError;
      response.status(error instanceof ZodError
        ? 400
        : updateRequired || requestError
          ? error.status
          : 409).json({
        schemaVersion: "auto-apply-error.v1",
        code: error instanceof ZodError
          ? "INVALID_INPUT"
          : updateRequired
            ? error.code
            : requestError
              ? error.code
            : "AUTO_APPLY_CONFLICT",
        message: error instanceof Error ? error.message : "批量自动投递执行失败",
        retryable: updateRequired || requestError ? error.retryable : false,
        ...(updateRequired ? {
          nextAction: "update_plugin",
          details: {
            currentVersion: error.currentVersion,
            minimumVersion: error.minimumVersion,
            latestVersion: error.latestVersion,
            userAction: error.userAction
          }
        } : {})
      });
    });
  };
}

function identity(request: Request) {
  const tenantId = request.header("X-Tenant-Id")?.trim();
  const userId = request.header("X-User-Id")?.trim();
  if (!tenantId || !userId) throw new Error("缺少 X-Tenant-Id 或 X-User-Id 请求头");
  return { tenantId, userId };
}

export function createAutoApplyRouter(
  service: AutoApplyService,
  devices: DeviceRegistry,
  pairings: DevicePairingRegistry,
  now: () => Date = () => new Date()
): Router {
  const router = Router();

  router.post("/owner-session:terminate", asyncRoute(async (request, response) => {
    const current = identity(request);
    const [tasks, credentials, devicesRemoved] = await Promise.all([
      service.terminateOwner(current),
      pairings.terminateOwner(current.tenantId, current.userId),
      devices.removeOwner(current.tenantId, current.userId)
    ]);
    response.json({
      schemaVersion: "auto-apply-owner-termination.v1",
      terminated: true,
      batchesCancelled: tasks.batches,
      commandsCancelled: tasks.commands,
      credentialsRevoked: credentials.credentials,
      pairingSessionsRevoked: credentials.pairingSessions,
      bootstrapSessionsRevoked: credentials.bootstrapSessions,
      devicesRemoved
    });
  }));

  router.get("/devices/current", asyncRoute(async () => {
    throw new DeviceIdRequiredError();
  }));

  router.get("/devices/:deviceId", asyncRoute(async (request, response) => {
    const current = identity(request);
    const device = await devices.get(
      current.tenantId,
      current.userId,
      String(request.params.deviceId).trim()
    );
    if (!device) throw new DeviceNotFoundError();
    const state = deviceState(device, now());
    const updateRequired = device.pluginInstalled && autoApplyPluginCompatibilityError(device) !== null;
    response.json({
      schemaVersion: "auto-apply-device-status.v1",
      status: state === "ready"
        ? "ready"
        : state === "runtime_offline"
          ? "offline"
          : state === "plugin_not_installed"
            ? "not_installed"
            : "not_paired",
      deviceId: device.deviceId,
      pluginVersion: device.pluginVersion,
      minimumAutoApplyPluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
      latestPluginVersion: CURRENT_AUTO_APPLY_PLUGIN_VERSION,
      compatiblePreviousPluginVersions: PREVIOUS_AUTO_APPLY_PLUGIN_VERSIONS,
      updateRequired,
      updateMessage: updateRequired ? PLUGIN_UPDATE_MESSAGE : null,
      pluginDownloadUrl: updateRequired ? "http://127.0.0.1:19876/" : null,
      lastSeenAt: device.lastSeenAt,
      capabilities: device.capabilities
    });
  }));

  router.get("/capabilities", asyncRoute(async (_request, response) => {
    response.json({
      schemaVersion: "auto-apply-capabilities.v1",
      configured: service.configured(),
      concurrencyPerDevice: 1,
      loginPolicy: "pause_and_resume",
      compatibleLoginPolicies: ["pause_and_resume", "skip_and_report"],
      humanInterventionPolicy: "pause_and_resume",
      humanInterventionReasonCodes: [
        "login_required",
        "captcha_required",
        "identity_verification_required"
      ],
      minimumAutoApplyPluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
      latestPluginVersion: CURRENT_AUTO_APPLY_PLUGIN_VERSION,
      compatiblePreviousPluginVersions: PREVIOUS_AUTO_APPLY_PLUGIN_VERSIONS,
      diagnosticSchema: "auto-apply-diagnostic.v1",
      diagnosticCategories: [
        "human_action",
        "candidate_data",
        "asset",
        "page",
        "site_validation",
        "model",
        "transport",
        "authorization",
        "unsupported",
        "cancelled",
        "unknown"
      ],
      adapters: siteAdapterCapabilities()
    });
  }));

  router.post("/site-support:check", asyncRoute(async (request, response) => {
    const jobs = Array.isArray(request.body?.jobs) ? request.body.jobs : [];
    if (jobs.length === 0 || jobs.length > 200) {
      throw new ZodError([{
        code: "custom",
        path: ["jobs"],
        message: "jobs 必须包含 1 到 200 个岗位"
      }]);
    }
    const results = jobs.map((job: Record<string, unknown>, index: number) => {
      const jobId = String(job?.jobId ?? "").trim();
      const applicationUrl = String(job?.applicationUrl ?? "").trim();
      const adapterHint = String(job?.adapterHint ?? "").trim() || undefined;
      if (!jobId || !applicationUrl) {
        throw new ZodError([{
          code: "custom",
          path: ["jobs", index],
          message: "jobId 和 applicationUrl 不能为空"
        }]);
      }
      const match = matchSiteAdapter(applicationUrl, adapterHint);
      return {
        jobId,
        applicationUrl,
        supported: match.supported,
        adapterCode: match.adapterCode || null,
        supportLevel: match.supportLevel,
        knownNoLogin: match.supported ? match.knownNoLogin : null,
        reasonCode: match.reason,
        recommendedAction: match.supported
          ? (match.knownNoLogin ? "start_auto_apply" : "start_and_detect_login")
          : match.reason === "invalid_application_url"
            ? "correct_application_url"
          : match.reason === "unsupported_application_protocol"
              ? "correct_application_url"
              : "manual_apply"
      };
    });
    response.json({
      schemaVersion: "auto-apply-site-support-check.v1",
      allSupported: results.every((item: { supported: boolean }) => item.supported),
      results
    });
  }));

  router.post("/device-bootstrap-sessions", asyncRoute(async (request, response) => {
    const current = identity(request);
    await service.activateOwner(current);
    const created = await pairings.createBootstrap({
      ...current,
      expiresInSeconds: request.body?.expiresInSeconds === undefined
        ? 120
        : Number(request.body.expiresInSeconds)
    });
    response.status(201).json({
      schemaVersion: "device-bootstrap-session.v1",
      bootstrapToken: created.bootstrapToken,
      expiresAt: created.session.expiresAt,
      extensionId: process.env.RECRUITING_EXTENSION_ID?.trim() || null,
      installation: {
        // The server only knows account devices, not whether this browser
        // profile has the extension. The page must use DEVICE_CONTEXT.
        installed: null,
        statusSource: "recruiting-ai-device-context.v1",
        downloadUrl: "http://127.0.0.1:19876/"
      }
    });
  }));

  router.post("/batches", asyncRoute(async (request, response) => {
    const current = identity(request);
    const idempotencyKey = request.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) throw new Error("缺少 Idempotency-Key 请求头");
    const device = await requireReadyDevice(
      devices,
      current.tenantId,
      current.userId,
      request.body?.deviceId,
      now()
    );
    assertAutoApplyPluginVersion(device);
    if (request.body?.candidate?.applicationProfileUrl &&
      !device.capabilities.includes("candidate_profile_fetch.v1")) {
      throw new PluginUpdateRequiredError(null, undefined, "请加载支持直接读取补充资料的新版插件后重试");
    }
    if (request.body?.candidate?.applicationProfile?.overrides?.length &&
      !device.capabilities.includes("candidate_information_merge.v1")) {
      throw new PluginUpdateRequiredError(device.pluginVersion, MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
        "当前补充信息需要新版信息合并能力，请加载最新插件后再投递");
    }
    response.status(201).json(await service.create({
      ...current,
      deviceId: device.deviceId,
      idempotencyKey,
      request: request.body
    }));
  }));

  router.get("/batches/:batchId", asyncRoute(async (request, response) => {
    response.json(await service.get(String(request.params.batchId), identity(request)));
  }));

  router.post("/batches/:batchId/pause", asyncRoute(async (request, response) => {
    response.json(await service.pause(String(request.params.batchId), identity(request)));
  }));

  router.post("/batches/:batchId/resume", asyncRoute(async (request, response) => {
    const current = identity(request);
    const batchId = String(request.params.batchId);
    const batch = await service.get(batchId, current);
    const device = await devices.get(current.tenantId, current.userId, batch.deviceId);
    if (device) assertAutoApplyPluginVersion(device);
    response.json(await service.resume(batchId, current));
  }));

  router.post("/batches/:batchId/jobs/:batchJobId/resume", asyncRoute(async (request, response) => {
    const current = identity(request);
    const batchId = String(request.params.batchId);
    const batch = await service.get(batchId, current);
    const device = await devices.get(current.tenantId, current.userId, batch.deviceId);
    if (device) assertAutoApplyPluginVersion(device);
    response.json(await service.resumeJob(batchId, String(request.params.batchJobId), current));
  }));

  router.post("/application-profile", asyncRoute(async (request, response) => {
    const current = identity(request);
    response.json(await service.updateCandidateProfile(request.body, current, async deviceId => {
      const device = await devices.get(current.tenantId, current.userId, deviceId);
      return Boolean(device?.capabilities.includes("candidate_information_merge.v1"));
    }));
  }));

  router.post("/batches/:batchId/jobs/:batchJobId/required-field-answers", asyncRoute(async (request, response) => {
    const current = identity(request);
    const batchId = String(request.params.batchId);
    const batch = await service.get(batchId, current);
    const device = await devices.get(current.tenantId, current.userId, batch.deviceId);
    if (device) assertAutoApplyPluginVersion(device);
    response.json(await service.provideRequiredFieldAnswers(
      batchId,
      String(request.params.batchJobId),
      request.body,
      current
    ));
  }));

  router.post("/batches/:batchId/jobs/:batchJobId/stop", asyncRoute(async (request, response) => {
    response.json(await service.stopJob(String(request.params.batchId), String(request.params.batchJobId),
      String(request.body?.requestId ?? ""), identity(request)));
  }));

  router.post("/batches/:batchId/cancel", asyncRoute(async (request, response) => {
    response.json(await service.cancel(String(request.params.batchId), identity(request)));
  }));

  return router;
}
