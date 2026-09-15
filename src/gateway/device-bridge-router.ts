import { gatewayInfrastructureError } from "./infrastructure-error.js";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { ApplicationGateway } from "./application-gateway.js";
import {
  deviceCommandExecutionExpired,
  isRecordedDeviceCompletion,
  type DeviceCommandQueue
} from "./device-command-queue.js";
import { autoApplyPluginCompatibilityError, PluginUpdateRequiredError, type DeviceRegistry } from "./device-registry.js";
import type {
  DeviceCredential,
  DevicePairingRegistry
} from "./device-pairing.js";
import {
  translateLegacyPluginEvent,
  type LegacyPluginEvent
} from "./legacy-plugin-adapter.js";
import type { VisionAgent } from "./vision-agent.js";
import type { AutoApplyService } from "./auto-apply-service.js";
import type { AutoApplyEvidenceStore } from "./auto-apply-evidence.js";
import {
  AutoApplyProgressSequenceConflictError,
  DeviceCommandExpiredError,
  GatewayRequestError
} from "./gateway-errors.js";

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>
) {
  return (request: Request, response: Response) => {
    void handler(request, response).catch((cause: unknown) => {
      const error = gatewayInfrastructureError(cause) ?? cause;
      const requestError = error instanceof GatewayRequestError || error instanceof PluginUpdateRequiredError;
      response.status(requestError ? error.status : 409).json({
        schemaVersion: "device-bridge-error.v1",
        code: requestError ? error.code : "DEVICE_BRIDGE_CONFLICT",
        message: error instanceof Error ? error.message : "设备任务通道执行失败",
        retryable: requestError ? error.retryable : false,
        ...(error instanceof PluginUpdateRequiredError ? { nextAction: "update_plugin",
          details: { currentVersion: error.currentVersion, minimumVersion: error.minimumVersion,
            latestVersion: error.latestVersion, userAction: error.userAction } } : {}),
        ...(error instanceof AutoApplyProgressSequenceConflictError
          ? { acceptedSequence: error.acceptedSequence } : {})
      });
    });
  };
}

function tenant(request: Request): string {
  const value = request.header("X-Tenant-Id")?.trim();
  if (!value) throw new Error("缺少 X-Tenant-Id 请求头");
  return value;
}

function deviceCredential(response: Response): DeviceCredential {
  const credential = response.locals.deviceCredential as DeviceCredential | undefined;
  if (!credential) throw new Error("缺少已验证的设备凭据");
  return credential;
}

function assertDeviceIdentity(
  request: Request,
  response: Response,
  expectedDeviceId?: string
): DeviceCredential {
  const credential = deviceCredential(response);
  const requestedTenant = request.header("X-Tenant-Id")?.trim();
  if (requestedTenant && requestedTenant !== credential.tenantId) throw new Error("设备 Token 不属于当前租户");
  const requestedUser = request.body?.userId ? String(request.body.userId).trim() : "";
  if (requestedUser && requestedUser !== credential.userId) throw new Error("设备 Token 不属于当前用户");
  if (expectedDeviceId && expectedDeviceId !== credential.deviceId) throw new Error("设备 Token 不属于当前设备");
  return credential;
}

function legacyEvent(value: unknown): LegacyPluginEvent {
  const event = value as Partial<LegacyPluginEvent> | null;
  if (!event || event.schemaVersion !== "ai-plugin-event.v1" ||
    typeof event.type !== "string" ||
    !["completed", "waiting_for_user", "failed", "rejected"].includes(String(event.status))) {
    throw new Error("插件结果不符合 ai-plugin-event.v1");
  }
  return event as LegacyPluginEvent;
}

export function createDeviceBridgeRouter(
  queue: DeviceCommandQueue,
  gateway: ApplicationGateway,
  devices?: DeviceRegistry,
  pairings?: DevicePairingRegistry,
  visionAgent?: VisionAgent,
  autoApply?: AutoApplyService,
  evidenceStore?: AutoApplyEvidenceStore,
  now: () => Date = () => new Date(),
  transaction?: <T>(ownerKey: string, work: () => Promise<T>) => Promise<T>
): Router {
  const router = Router();

  router.post("/pairings:exchange", asyncRoute(async (request, response) => {
    if (!pairings || !devices) throw new Error("设备配对服务未启用");
    const exchanged = await pairings.exchange({
      pairingCode: String(request.body?.pairingCode ?? ""),
      deviceId: String(request.body?.deviceId ?? ""),
      deviceName: request.body?.deviceName ? String(request.body.deviceName) : undefined
    });
    const device = await devices.register({
      tenantId: exchanged.tenantId,
      userId: exchanged.userId,
      deviceId: exchanged.deviceId,
      deviceName: exchanged.deviceName,
      runtimeVersion: request.body?.runtimeVersion ? String(request.body.runtimeVersion) : null,
      pluginInstalled: request.body?.pluginInstalled === true,
      pluginVersion: request.body?.pluginVersion ? String(request.body.pluginVersion) : null,
      capabilities: Array.isArray(request.body?.capabilities) ? request.body.capabilities.map(String) : []
    });
    response.status(201).json({ ...exchanged, device });
  }));

  router.post("/bootstrap:exchange", asyncRoute(async (request, response) => {
    if (!pairings || !devices) throw new Error("设备绑定服务未启用");
    const exchanged = await pairings.exchangeBootstrap({
      bootstrapToken: String(request.body?.bootstrapToken ?? ""),
      deviceId: String(request.body?.deviceId ?? ""),
      previousDeviceId: request.body?.previousDeviceId ? String(request.body.previousDeviceId) : undefined,
      deviceName: request.body?.deviceName ? String(request.body.deviceName) : undefined
    });
    const device = await devices.register({
      tenantId: exchanged.tenantId,
      userId: exchanged.userId,
      deviceId: exchanged.deviceId,
      deviceName: exchanged.deviceName,
      runtimeVersion: request.body?.runtimeVersion ? String(request.body.runtimeVersion) : null,
      pluginInstalled: request.body?.pluginInstalled !== false,
      pluginVersion: request.body?.pluginVersion ? String(request.body.pluginVersion) : null,
      capabilities: Array.isArray(request.body?.capabilities) ? request.body.capabilities.map(String) : []
    });
    response.status(201).json({ ...exchanged, device });
  }));

  router.use((request: Request, response: Response, next: NextFunction) => {
    void (async () => {
      if (!pairings) {
        response.status(503).json({
          schemaVersion: "device-bridge-error.v1",
          code: "DEVICE_PAIRING_UNAVAILABLE",
          message: "设备配对服务未启用"
        });
        return;
      }
      const authorization = request.header("Authorization") ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      const credential = await pairings.authenticate(token);
      if (!credential) {
        response.status(401).json({
          schemaVersion: "device-bridge-error.v1",
          code: "DEVICE_UNAUTHORIZED",
          message: "Device Token 无效或已撤销"
        });
        return;
      }
      response.locals.deviceCredential = credential;
      next();
    })().catch((error: unknown) => {
      const infrastructure = gatewayInfrastructureError(error);
      response.status(infrastructure?.status ?? 500).json({
        schemaVersion: "device-bridge-error.v1",
        code: infrastructure?.code ?? "DEVICE_AUTH_FAILED",
        message: infrastructure?.message ?? "设备鉴权失败",
        retryable: infrastructure?.retryable ?? false
      });
    });
  });

  router.post("/devices/:deviceId/heartbeat", asyncRoute(async (request, response) => {
    if (!devices) throw new Error("设备注册服务未启用");
    const deviceId = String(request.params.deviceId).trim();
    if (!deviceId) throw new Error("缺少 deviceId");
    const credential = assertDeviceIdentity(request, response, deviceId);
    const device = await devices.register({
      tenantId: credential.tenantId,
      userId: credential.userId,
      deviceId,
      deviceName: String(request.body?.deviceName || deviceId),
      runtimeVersion: request.body?.runtimeVersion ? String(request.body.runtimeVersion) : null,
      pluginInstalled: request.body?.pluginInstalled === true,
      pluginVersion: request.body?.pluginVersion ? String(request.body.pluginVersion) : null,
      capabilities: Array.isArray(request.body?.capabilities) ? request.body.capabilities.map(String) : []
    });
    response.json({ schemaVersion: "device-heartbeat-receipt.v1", accepted: true, device });
  }));

  router.get("/vision/capabilities", asyncRoute(async (request, response) => {
    if (!visionAgent) throw new Error("视觉 RPA 服务未启用");
    const credential = assertDeviceIdentity(request, response);
    response.json({
      ...visionAgent.capabilities(),
      tenantId: credential.tenantId,
      userId: credential.userId,
      deviceId: credential.deviceId
    });
  }));

  router.post("/vision/sessions", asyncRoute(async (request, response) => {
    if (!visionAgent) throw new Error("视觉 RPA 服务未启用");
    const credential = assertDeviceIdentity(request, response);
    const session = await visionAgent.createSession({
      tenantId: credential.tenantId,
      userId: credential.userId,
      deviceId: credential.deviceId,
      providerCode: request.body?.providerCode ? String(request.body.providerCode) : undefined
    });
    response.status(201).json(session);
  }));

  router.post("/vision/sessions/:sessionId/plan", asyncRoute(async (request, response) => {
    if (!visionAgent) throw new Error("视觉 RPA 服务未启用");
    const credential = assertDeviceIdentity(request, response);
    response.json(await visionAgent.plan(String(request.params.sessionId), request.body, {
      tenantId: credential.tenantId,
      userId: credential.userId,
      deviceId: credential.deviceId
    }));
  }));

  router.post("/devices/:deviceId/commands/claim", asyncRoute(async (request, response) => {
    const deviceId = String(request.params.deviceId);
    const credential = assertDeviceIdentity(request, response, deviceId);
    let versionError: PluginUpdateRequiredError | undefined;
    if (devices) {
      const device = await devices.register({
        tenantId: credential.tenantId,
        userId: credential.userId,
        deviceId
      });
      versionError = autoApplyPluginCompatibilityError(device) ?? undefined;
    }
    const claimInput = {
      tenantId: credential.tenantId,
      userId: credential.userId,
      deviceId,
      leaseSeconds: Number(request.body?.leaseSeconds ?? 45),
      excludedCommandTypes: versionError ? ["browser.execute_batch_auto_apply_job"] : []
    };
    const pendingValue = request.body?.pendingResultCommandIds;
    if (pendingValue !== undefined && (!Array.isArray(pendingValue) || pendingValue.length > 100 ||
      pendingValue.some((id: unknown) => typeof id !== "string" || !id || id.length > 128))) {
      throw new Error("待确认命令列表无效或超过100条");
    }
    const pendingIds = [...new Set<string>(pendingValue ?? [])];
    const resolvedPendingCommandIds: string[] = [];
    for (const commandId of pendingIds) {
      const pending = await queue.get(commandId);
      if (!pending || pending.tenantId !== credential.tenantId || pending.userId !== credential.userId ||
        pending.targetDeviceId !== deviceId || pending.claimedBy !== deviceId) {
        throw new Error("待确认命令不属于当前设备");
      }
      if (!["completed", "failed", "expired", "cancelled"].includes(pending.status)) {
        // A live attempt still owns the execution slot. Never let a poisoned
        // receipt retry become permission to execute another browser command.
        response.status(204).end();
        return;
      }
      resolvedPendingCommandIds.push(commandId);
    }
    if (autoApply && !versionError) {
      await autoApply.recoverDeviceQueue({ tenantId: credential.tenantId, userId: credential.userId, deviceId }, { dispatch: true });
    }
    const item = await queue.claim(claimInput);
    if (!item) {
      if (versionError) throw versionError;
      response.status(204).end();
      return;
    }
    if (autoApply && item.command.type === "browser.execute_batch_auto_apply_job") {
      const stop = (await autoApply.pendingJobStops(credential)).find((pending) => pending.commandId === item!.commandId);
      if (stop) {
        // Covers both the claim/stop race and a crash between batch fence and
        // queue fence persistence. Never return this command for execution.
        await autoApply.stopJob(stop.batchId, stop.batchJobId, stop.requestId, credential);
        response.status(204).end();
        return;
      }
    }
    response.json({
      schemaVersion: "device-command-claim.v1",
      resolvedPendingCommandIds,
      commandId: item.commandId,
      runId: item.runId,
      leaseExpiresAt: item.leaseExpiresAt,
      executionExpiresAt: item.executionExpiresAt ?? item.command.expiresAt,
      command: item.command
    });
  }));

  router.post("/commands/:commandId/lease", asyncRoute(async (request, response) => {
    const deviceId = String(request.body?.deviceId ?? "").trim();
    if (!deviceId) throw new Error("缺少 deviceId");
    const credential = assertDeviceIdentity(request, response, deviceId);
    const current = await queue.get(String(request.params.commandId));
    if (!current || current.tenantId !== credential.tenantId || current.userId !== credential.userId) {
      throw new Error("设备命令不属于当前用户");
    }
    const item = await queue.renew(
      String(request.params.commandId),
      deviceId,
      Number(request.body?.leaseSeconds ?? 300)
    );
    response.json({
      schemaVersion: "device-command-lease.v1",
      commandId: item.commandId,
      leaseExpiresAt: item.leaseExpiresAt
    });
  }));

  router.get("/auto-apply/job-stops", asyncRoute(async (request, response) => {
    if (!autoApply) throw new Error("批量自动投递服务未启用");
    response.json({ stops: await autoApply.pendingJobStops(assertDeviceIdentity(request, response)) });
  }));

  router.post("/auto-apply/job-stops/:requestId/ack", asyncRoute(async (request, response) => {
    if (!autoApply) throw new Error("批量自动投递服务未启用");
    response.json(await autoApply.acknowledgeJobStop(
      String(request.body?.batchId ?? ""), String(request.body?.batchJobId ?? ""),
      String(request.params.requestId), request.body?.commandId == null ? null : String(request.body.commandId),
      assertDeviceIdentity(request, response)
    ));
  }));

  router.get("/auto-apply/batches/:batchId/control", asyncRoute(async (request, response) => {
    if (!autoApply) throw new Error("批量自动投递服务未启用");
    const credential = assertDeviceIdentity(request, response);
    response.json(await autoApply.control(String(request.params.batchId), {
      tenantId: credential.tenantId,
      userId: credential.userId,
      deviceId: credential.deviceId
    }));
  }));

  router.post("/auto-apply/batches/:batchId/:action", asyncRoute(async (request, response) => {
    if (!autoApply) throw new Error("批量自动投递服务未启用");
    const credential = assertDeviceIdentity(request, response);
    const batchId = String(request.params.batchId);
    const action = String(request.params.action);
    const batch = await autoApply.get(batchId, {
      tenantId: credential.tenantId,
      userId: credential.userId
    });
    if (batch.deviceId !== credential.deviceId) throw new Error("批次不属于当前设备");
    const identity = { tenantId: credential.tenantId, userId: credential.userId };
    const updated = action === "pause"
      ? await autoApply.pause(batchId, identity)
      : action === "resume"
        ? await autoApply.resume(batchId, identity)
        : action === "cancel"
          ? await autoApply.cancel(batchId, identity)
          : null;
    if (!updated) throw new Error(`不支持的批次控制动作：${action}`);
    response.json(updated);
  }));

  router.post("/auto-apply/submission-authorizations:verify", asyncRoute(async (request, response) => {
    if (!autoApply) throw new Error("批量自动投递服务未启用");
    const credential = assertDeviceIdentity(request, response);
    const result = await autoApply.verifySubmissionAuthorization(String(request.body?.token ?? ""), {
      batchId: String(request.body?.batchId ?? ""),
      batchJobId: String(request.body?.batchJobId ?? ""),
      commandId: String(request.body?.commandId ?? ""),
      tenantId: credential.tenantId,
      userId: credential.userId,
      deviceId: credential.deviceId
    });
    response.status(result.valid ? 200 : 403).json({
      schemaVersion: "auto-apply-submission-authorization-verification.v1",
      ...result
    });
  }));

  router.post("/auto-apply/browser-state", asyncRoute(async (request, response) => {
    if (!autoApply) throw new Error("批量自动投递服务未启用");
    const credential = assertDeviceIdentity(request, response, String(request.body?.deviceId ?? ""));
    const outcome = String(request.body?.outcome ?? "");
    if (![
      'succeeded', 'already_applied', 'captcha_tab_closed',
      'submission_active_tab_closed', 'submission_receipt_tab_closed',
      'submission_receipt_timeout', 'site_validation_rejected', 'captcha_required',
      'site_application_limit_reached', 'user_interrupted'
    ].includes(outcome)) {
      throw new Error("浏览器状态不受支持");
    }
    const pageUrl = String(request.body?.pageUrl ?? "");
    if (!/^https?:\/\//i.test(pageUrl)) throw new Error("浏览器状态缺少有效 pageUrl");
    const batch = await autoApply.acceptBrowserState({
      batchId: String(request.body?.batchId ?? ""),
      batchJobId: String(request.body?.batchJobId ?? ""),
      jobId: String(request.body?.jobId ?? ""),
      outcome: outcome as "succeeded" | "already_applied" | "captcha_tab_closed" |
        "submission_active_tab_closed" | "submission_receipt_tab_closed" |
        "submission_receipt_timeout" | "site_validation_rejected" | "captcha_required" |
        "site_application_limit_reached" | "user_interrupted",
      interruptionKind: typeof request.body?.interruptionKind === "string" ? request.body.interruptionKind : undefined,
      submissionStarted: request.body?.submissionStarted === true,
      requiredFieldRequests: request.body?.requiredFieldRequests,
      uploadRejection: request.body?.uploadRejection,
      siteMessage: typeof request.body?.siteMessage === "string"
        ? request.body.siteMessage.slice(0, 500)
        : undefined,
      commandId: typeof request.body?.commandId === "string" ? request.body.commandId : undefined,
      pageUrl,
      observedAt: String(request.body?.observedAt ?? new Date().toISOString())
    }, credential);
    response.json({
      schemaVersion: "auto-apply-browser-state-receipt.v1",
      accepted: true,
      batchId: batch.batchId,
      batchStatus: batch.status,
      jobStatus: batch.jobs.find((job) => job.batchJobId === String(request.body?.batchJobId ?? ""))?.status,
      revision: batch.revision
    });
  }));

  router.post("/commands/:commandId/results", asyncRoute(async (request, response) => {
    let event = legacyEvent(request.body?.event);
    const deviceId = String(request.body?.deviceId ?? "").trim();
    if (!deviceId) throw new Error("缺少 deviceId");
    const credential = assertDeviceIdentity(request, response, deviceId);
    const current = await queue.get(String(request.params.commandId));
    if (!current || current.tenantId !== credential.tenantId || current.userId !== credential.userId) {
      throw new Error("设备命令不属于当前租户");
    }
    if (current.command.type === "browser.execute_batch_auto_apply_job" && evidenceStore) {
      const payload = structuredClone(event.payload ?? {});
      const result = payload.autoApplyResult as Record<string, unknown> | undefined;
      const evidence = result?.evidence as Record<string, unknown> | undefined;
      const dataUrl = typeof evidence?.screenshotDataUrl === "string" ? evidence.screenshotDataUrl : "";
      if (dataUrl) {
        if (evidence?.redacted !== true) throw new Error("自动投递证据未声明完成脱敏");
        const receipt = await evidenceStore.saveRedactedScreenshot(dataUrl);
        delete evidence.screenshotDataUrl;
        evidence.screenshotRef = receipt.evidenceRef;
        evidence.sha256 = receipt.sha256;
        event = { ...event, payload };
      }
    }
    if (current.command.type === "browser.execute_batch_auto_apply_job") {
      if (!autoApply) throw new Error("批量自动投递服务未启用");
      const batch = await autoApply.completeCommandResult(current.commandId, deviceId, event);
      const recorded = await queue.get(current.commandId);
      response.json({
        schemaVersion: "device-command-result-receipt.v1",
        commandId: current.commandId,
        accepted: true,
        disposition: recorded?.archivedCompletionEvent ? "archived_stale" : current.completionEvent ? "duplicate" : "applied",
        batchId: batch.batchId,
        batchStatus: batch.status
      });
      return;
    }
    const complete = async () => {
      const before = await queue.get(String(request.params.commandId));
      if (!before) throw new Error("设备命令不存在");
      // Check the original event and claiming device inside the same transaction
      // as completion. A changed result is a conflict, not an idempotent ACK.
      const duplicate = isRecordedDeviceCompletion(before, deviceId, event);
      const item = await queue.complete(String(request.params.commandId), deviceId, event);
      const run = duplicate ? await gateway.get(item.runId)
        : await gateway.acceptExecutionEvent(item.runId, translateLegacyPluginEvent(event), { commandId: item.commandId });
      return { item, run, duplicate };
    };
    const { item, run, duplicate } = transaction
      ? await transaction(`${credential.tenantId}\u0000${credential.userId}`, complete)
      : await complete();
    response.json({
      schemaVersion: "device-command-result-receipt.v1",
      commandId: item.commandId,
      accepted: true,
      disposition: duplicate ? "duplicate" : "applied",
      runStatus: run.status,
      latestEvent: run.events.at(-1) ?? null
    });
  }));

  router.post("/commands/:commandId/progress", asyncRoute(async (request, response) => {
    if (!autoApply) throw new Error("批量自动投递服务未启用");
    const commandId = String(request.params.commandId);
    const deviceId = String(request.body?.deviceId ?? "").trim();
    if (!deviceId) throw new Error("缺少 deviceId");
    const credential = assertDeviceIdentity(request, response, deviceId);
    const current = await queue.get(commandId);
    if (!current || current.tenantId !== credential.tenantId || current.userId !== credential.userId) {
      throw new Error("设备命令不属于当前租户");
    }
    if (current.status !== "claimed" || current.claimedBy !== deviceId) {
      throw new Error("设备命令未由当前设备领取");
    }
    if (deviceCommandExecutionExpired(current, now())) {
      await queue.expire(commandId);
      throw new DeviceCommandExpiredError();
    }
    if (current.command.type !== "browser.execute_batch_auto_apply_job") {
      throw new Error("当前设备命令不支持自动投递进度回执");
    }
    const batch = await autoApply.acceptCommandProgress(commandId, request.body);
    const job = batch.jobs.find((candidate) => candidate.commandId === commandId);
    if (!job?.progress) throw new Error("自动投递进度未写入原岗位");
    response.json({
      schemaVersion: "device-command-progress-receipt.v1",
      accepted: true,
      commandId,
      batchId: batch.batchId,
      batchJobId: job.batchJobId,
      sequence: job.progress.sequence,
      receivedAt: job.progress.receivedAt
    });
  }));

  return router;
}
