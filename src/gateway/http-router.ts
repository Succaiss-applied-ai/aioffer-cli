import { gatewayInfrastructureError } from "./infrastructure-error.js";
import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { ApplicationGateway } from "./application-gateway.js";
import {
  DEFAULT_PLUGIN_DOWNLOAD_URL,
  DEFAULT_PLUGIN_ZIP_URL,
  DEFAULT_RUNTIME_ZIP_URL,
  RuntimeUnavailableError,
  deviceState,
  requireReadyDevice,
  type DeviceRegistry
} from "./device-registry.js";
import { GatewayRequestError, requireDeviceId } from "./gateway-errors.js";
import type { DevicePairingRegistry } from "./device-pairing.js";

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>
) {
  return (request: Request, response: Response) => {
    void handler(request, response).catch((cause: unknown) => {
      const error = gatewayInfrastructureError(cause) ?? cause;
      if (error instanceof RuntimeUnavailableError) {
        response.status(error.status).json({
          schemaVersion: "application-gateway-error.v1",
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          userAction: error.userAction
        });
        return;
      }
      const requestError = error instanceof GatewayRequestError;
      const status = error instanceof ZodError ? 400 : requestError ? error.status : 409;
      response.status(status).json({
        schemaVersion: "application-gateway-error.v1",
        code: error instanceof ZodError
          ? "INVALID_INPUT"
          : requestError
            ? error.code
            : "APPLICATION_STATE_CONFLICT",
        message: error instanceof Error ? error.message : "Application Gateway 执行失败",
        retryable: requestError ? error.retryable : false
      });
    });
  };
}

export function createApplicationGatewayRouter(
  gateway: ApplicationGateway,
  devices?: DeviceRegistry,
  pairings?: DevicePairingRegistry
): Router {
  const router = Router();

  const tenant = (request: Request): string => {
    const value = request.header("X-Tenant-Id")?.trim();
    if (!value) throw new Error("缺少 X-Tenant-Id 请求头");
    return value;
  };

  const assertTenant = async (request: Request, runId: string) => {
    const run = await gateway.get(runId);
    if (run.request.tenantId !== tenant(request)) throw new Error("投递任务不属于当前租户");
    const userId = request.header("X-User-Id")?.trim();
    if (userId && run.request.userId !== userId) throw new Error("投递任务不属于当前用户");
    return run;
  };

  router.get("/me/devices", asyncRoute(async (request, response) => {
    if (!devices) throw new Error("设备注册服务未启用");
    const userId = request.header("X-User-Id")?.trim();
    if (!userId) throw new Error("缺少 X-User-Id 请求头");
    const items = (await devices.list(tenant(request), userId)).map((device) => ({
      ...device,
      state: deviceState(device)
    }));
    response.json({
      schemaVersion: "paired-device-list.v1",
      userId,
      items,
      installation: {
        downloadPageUrl: DEFAULT_PLUGIN_DOWNLOAD_URL,
        packageUrl: DEFAULT_PLUGIN_ZIP_URL,
        pluginPackageUrl: DEFAULT_PLUGIN_ZIP_URL,
        runtimePackageUrl: DEFAULT_RUNTIME_ZIP_URL,
        pairingRequired: true
      }
    });
  }));

  router.post("/me/device-pairing-sessions", asyncRoute(async (request, response) => {
    if (!pairings) throw new Error("设备配对服务未启用");
    const userId = request.header("X-User-Id")?.trim();
    if (!userId) throw new Error("缺少 X-User-Id 请求头");
    const created = await pairings.create({
      tenantId: tenant(request),
      userId,
      deviceName: request.body?.deviceName ? String(request.body.deviceName) : undefined,
      expiresInSeconds: request.body?.expiresInSeconds === undefined
        ? undefined
        : Number(request.body.expiresInSeconds)
    });
    response.status(201).json({
      schemaVersion: "device-pairing-instructions.v1",
      ...created,
      installation: {
        downloadPageUrl: DEFAULT_PLUGIN_DOWNLOAD_URL,
        pluginPackageUrl: DEFAULT_PLUGIN_ZIP_URL,
        runtimePackageUrl: DEFAULT_RUNTIME_ZIP_URL
      },
      runtimeConfiguration: {
        pairingCode: created.pairingCode,
        pairingCodeExpiresAt: created.session.expiresAt
      }
    });
  }));

  router.post("/application-runs", asyncRoute(async (request, response) => {
    if (request.body?.tenantId !== tenant(request)) throw new Error("请求体 tenantId 与请求头不一致");
    const headerUserId = request.header("X-User-Id")?.trim();
    if (headerUserId && request.body?.userId !== headerUserId) throw new Error("请求体 userId 与当前用户不一致");
    const deviceId = requireDeviceId(request.body?.deviceId);
    let body = { ...request.body, deviceId };
    if (devices) {
      const device = await requireReadyDevice(
        devices,
        tenant(request),
        String(request.body?.userId || ""),
        deviceId
      );
      body = { ...request.body, deviceId: device.deviceId };
    }
    response.status(201).json(await gateway.start(body));
  }));

  router.get("/application-runs/:runId", asyncRoute(async (request, response) => {
    response.json(await assertTenant(request, String(request.params.runId)));
  }));

  router.get("/application-runs/:runId/events", asyncRoute(async (request, response) => {
    await assertTenant(request, String(request.params.runId));
    const after = Number(request.query.afterSequence ?? 0);
    response.json({
      schemaVersion: "application-run-events.v1",
      events: await gateway.events(String(request.params.runId), Number.isFinite(after) ? after : 0)
    });
  }));

  router.post("/application-runs/:runId/continue", asyncRoute(async (request, response) => {
    await assertTenant(request, String(request.params.runId));
    response.json(await gateway.continue(String(request.params.runId)));
  }));

  router.post("/application-runs/:runId/answers", asyncRoute(async (request, response) => {
    await assertTenant(request, String(request.params.runId));
    response.json(await gateway.provideAnswers(String(request.params.runId), request.body));
  }));

  router.post("/application-runs/:runId/confirmations", asyncRoute(async (request, response) => {
    await assertTenant(request, String(request.params.runId));
    response.json(await gateway.confirm(String(request.params.runId), request.body));
  }));

  return router;
}
