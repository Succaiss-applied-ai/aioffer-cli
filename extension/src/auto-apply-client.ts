import { executionProfileOrigin } from "./execution-profile.js";
import { autoApplyDeviceCapabilities } from "./device-context.js";

export interface AutoApplyRuntimeCredential {
  schemaVersion: "auto-apply-runtime-credential.v1";
  gatewayBaseUrl: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  deviceToken: string;
  pairedAt: string;
  productOrigin?: string;
  productClientInstanceId?: string;
}

export interface ClaimedAutoApplyCommand {
  schemaVersion: "device-command-claim.v1";
  commandId: string;
  runId: string;
  leaseExpiresAt: string;
  executionExpiresAt?: string;
  resolvedPendingCommandIds?: string[];
  command: unknown;
}

/**
 * A reclaimed batch command may retain its original short delivery deadline
 * while the Gateway has assigned a longer, authoritative execution deadline.
 * Normalize before command-envelope validation so a browser restart does not
 * incorrectly turn an otherwise live execution into `command_expired`.
 */
export function commandWithClaimedExecutionDeadline(
  command: unknown,
  executionExpiresAt?: string
): unknown {
  const deadline = Date.parse(String(executionExpiresAt ?? ""));
  if (!Number.isFinite(deadline) || !command || typeof command !== "object" || Array.isArray(command)) {
    return command;
  }
  return { ...(command as Record<string, unknown>), expiresAt: new Date(deadline).toISOString() };
}

export type AutoApplyProgressStage =
  | "preflight"
  | "opening"
  | "observing"
  | "uploading"
  | "optional_site_resume_parse"
  | "filling"
  | "auditing"
  | "submitting"
  | "verifying";

export interface AutoApplyProgressInput {
  schemaVersion: "auto-apply-job-progress.v1";
  deviceId: string;
  batchId: string;
  batchJobId: string;
  jobId: string;
  sequence: number;
  stage: AutoApplyProgressStage;
  message: string;
  occurredAt: string;
}

const credentialStorageKey = "autoApplyRuntimeCredential";
export const defaultAutoApplyGatewayBaseUrl = "http://127.0.0.1:19876/automation";
export const autoApplyDeviceRequestTimeoutMs = 10_000;
// The Gateway may spend up to 75 seconds on a single model-backed planning
// request. Keep routine device operations fail-fast, but do not abort a
// planning response while the Gateway is still within its documented window.
export const autoApplyVisionPlanningRequestTimeoutMs = 90_000;

export class AutoApplyDeviceRequestTimeoutError extends Error {
  constructor(path: string) {
    super(`设备桥接请求超时：${path}`);
    this.name = "AutoApplyDeviceRequestTimeoutError";
  }
}

export class AutoApplyCommandLeaseRejectedError extends Error {
  constructor(readonly status: number) {
    super(`续租自动投递任务失败：HTTP ${status}`);
    this.name = "AutoApplyCommandLeaseRejectedError";
  }
}

export class AutoApplyCommandCompletionRejectedError extends Error {
  constructor(readonly status: number) {
    super(`回传自动投递结果失败：HTTP ${status}`);
    this.name = "AutoApplyCommandCompletionRejectedError";
  }
}

export class AutoApplyCommandClaimFenceRejectedError extends Error {
  constructor() {
    super("Gateway 尚未确认旧任务执行权已释放，已保留回执并暂停领取新任务");
    this.name = "AutoApplyCommandClaimFenceRejectedError";
  }
}

export class AutoApplyProgressSequenceConflictError extends Error {
  constructor(readonly acceptedSequence: number) {
    super(`回传自动投递进度失败：HTTP 409（进度序号已到 ${acceptedSequence}）`);
    this.name = "AutoApplyProgressSequenceConflictError";
  }
}

function normalizedGatewayBaseUrl(value: unknown): string {
  const parsed = new URL(String(value || defaultAutoApplyGatewayBaseUrl));
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "19876") throw new Error("aioffer-cli 只连接本机 19876 端口");
  return parsed.toString().replace(/\/$/, "");
}

export async function autoApplyCredential(): Promise<AutoApplyRuntimeCredential | null> {
  const stored = await chrome.storage.local.get({ [credentialStorageKey]: null });
  const credential = stored[credentialStorageKey] as AutoApplyRuntimeCredential | null;
  if (!credential?.deviceToken || !credential.deviceId || !credential.tenantId || !credential.userId) return null;
  return credential;
}

export async function clearAutoApplyCredential(): Promise<void> {
  await chrome.storage.local.set({ [credentialStorageKey]: null });
}

export async function exchangeAutoApplyBootstrap(input: {
  bootstrapToken: string;
  gatewayBaseUrl?: string;
  productOrigin?: string;
  productClientInstanceId?: string;
}): Promise<AutoApplyRuntimeCredential> {
  const gatewayBaseUrl = normalizedGatewayBaseUrl(input.gatewayBaseUrl);
  const previous = await autoApplyCredential();
  // The Gateway reuses previousDeviceId only when it belongs to this same owner.
  // A different owner receives this fresh candidate id instead.
  const deviceId = crypto.randomUUID();
  const manifest = chrome.runtime.getManifest();
  let response: Response;
  try {
    response = await fetch(`${gatewayBaseUrl}/device-bridge/v1/bootstrap:exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bootstrapToken: input.bootstrapToken,
        deviceId,
        previousDeviceId: previous?.deviceId,
        deviceName: "AI Offer 招聘小助手 Chrome",
        pluginInstalled: true,
        pluginVersion: manifest.version,
        capabilities: [...autoApplyDeviceCapabilities]
      })
    });
  } catch (cause) {
    throw new Error(
      `设备自动绑定网络连接失败：无法访问 ${gatewayBaseUrl}，请检查网络或 Gateway 地址后重试。`,
      { cause }
    );
  }
  if (!response.ok) throw new Error(`设备自动绑定失败：HTTP ${response.status}`);
  const result = await response.json() as Record<string, unknown>;
  const credential: AutoApplyRuntimeCredential = {
    schemaVersion: "auto-apply-runtime-credential.v1",
    gatewayBaseUrl,
    tenantId: String(result.tenantId ?? ""),
    userId: String(result.userId ?? ""),
    deviceId: String(result.deviceId ?? deviceId),
    deviceToken: String(result.deviceToken ?? ""),
    pairedAt: String(result.pairedAt ?? new Date().toISOString()),
    ...(input.productOrigin && input.productClientInstanceId ? { productOrigin: executionProfileOrigin(input.productOrigin), productClientInstanceId: input.productClientInstanceId } : {})
  };
  if (!credential.tenantId || !credential.userId || !credential.deviceToken) {
    throw new Error("设备自动绑定响应不完整");
  }
  await chrome.storage.local.set({ [credentialStorageKey]: credential });
  return credential;
}

async function deviceFetch(
  credential: AutoApplyRuntimeCredential,
  path: string,
  init: RequestInit = {},
  timeoutMs = autoApplyDeviceRequestTimeoutMs
): Promise<Response> {
  const controller = new AbortController();
  const timeoutError = new AutoApplyDeviceRequestTimeoutError(path);
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  const timeout = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  if (init.signal) {
    if (init.signal.aborted) abortFromCaller();
    else init.signal.addEventListener("abort", abortFromCaller, { once: true });
  }
  try {
    return await fetch(`${credential.gatewayBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${credential.deviceToken}`,
        "X-Tenant-Id": credential.tenantId,
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    if (controller.signal.reason instanceof AutoApplyDeviceRequestTimeoutError) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function heartbeatAutoApplyDevice(
  credential: AutoApplyRuntimeCredential
): Promise<void> {
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/devices/${encodeURIComponent(credential.deviceId)}/heartbeat`,
    {
      method: "POST",
      body: JSON.stringify({
        userId: credential.userId,
        deviceName: "AI Offer 招聘小助手 Chrome",
        pluginInstalled: true,
        pluginVersion: chrome.runtime.getManifest().version,
        capabilities: [...autoApplyDeviceCapabilities]
      })
    }
  );
  if (!response.ok) throw new Error(`设备心跳失败：HTTP ${response.status}`);
}

export async function claimAutoApplyCommand(
  credential: AutoApplyRuntimeCredential,
  pendingResultCommandIds: string[] = []
): Promise<ClaimedAutoApplyCommand | null> {
  const pending = [...new Set(pendingResultCommandIds)];
  if (pending.length > 100 || pending.some(id => !id || typeof id !== "string")) {
    throw new AutoApplyCommandClaimFenceRejectedError();
  }
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/devices/${encodeURIComponent(credential.deviceId)}/commands/claim`,
    {
      method: "POST",
      body: JSON.stringify({ userId: credential.userId, leaseSeconds: 90,
        ...(pending.length ? { pendingResultCommandIds: pending } : {}) })
    }
  );
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`领取自动投递任务失败：HTTP ${response.status}`);
  const claimed = await response.json() as ClaimedAutoApplyCommand;
  if (pending.length && (pending.includes(claimed.commandId) ||
    !Array.isArray(claimed.resolvedPendingCommandIds) ||
    !pending.every(id => claimed.resolvedPendingCommandIds!.includes(id)))) {
    // Older Gateways may ignore the request field. A claim without explicit
    // server fencing is never permission to execute another application.
    throw new AutoApplyCommandClaimFenceRejectedError();
  }
  return claimed;
}

export async function completeAutoApplyCommand(
  credential: AutoApplyRuntimeCredential,
  commandId: string,
  event: unknown
): Promise<void> {
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/commands/${encodeURIComponent(commandId)}/results`,
    {
      method: "POST",
      body: JSON.stringify({ deviceId: credential.deviceId, event })
    }
  );
  if (!response.ok) throw new AutoApplyCommandCompletionRejectedError(response.status);
  const receipt = await response.json() as Record<string, unknown>;
  if (receipt.accepted !== true || receipt.commandId !== commandId ||
    (receipt.disposition !== undefined && !["applied", "duplicate", "archived_stale"].includes(String(receipt.disposition)))) {
    throw new Error("Gateway 未确认当前命令的投递结果，已保留回执和原页面");
  }
}

async function readProgressError(response: Response, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  if (!response.body || signal.aborted) return null;
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) {
        const parsed = JSON.parse(text + decoder.decode()) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown> : null;
      }
      size += value.byteLength;
      if (size > 8192) return null;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // An old Gateway, truncated body or timeout stays a diagnostic HTTP error.
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return null;
}

export async function reportAutoApplyCommandProgress(
  credential: AutoApplyRuntimeCredential,
  commandId: string,
  input: Omit<AutoApplyProgressInput, "deviceId">,
  signal?: AbortSignal
): Promise<void> {
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000);
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/commands/${encodeURIComponent(commandId)}/progress`,
    {
      method: "POST",
      signal: requestSignal,
      body: JSON.stringify({ deviceId: credential.deviceId, ...input })
    }
  );
  if (!response.ok) {
    const error = await readProgressError(response, requestSignal);
    if (response.status === 409 && error?.schemaVersion === "device-bridge-error.v1" &&
      error.code === "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT" &&
      typeof error.acceptedSequence === "number" && Number.isSafeInteger(error.acceptedSequence) &&
      error.acceptedSequence >= input.sequence && error.acceptedSequence < Number.MAX_SAFE_INTEGER - 1) {
      throw new AutoApplyProgressSequenceConflictError(error.acceptedSequence);
    }
    const code = typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
      ? ` (${error.code})` : "";
    throw new Error(`回传自动投递进度失败：HTTP ${response.status}${code}`);
  }
}

export async function renewAutoApplyCommandLease(
  credential: AutoApplyRuntimeCredential,
  commandId: string
): Promise<void> {
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/commands/${encodeURIComponent(commandId)}/lease`,
    {
      method: "POST",
      body: JSON.stringify({ deviceId: credential.deviceId, leaseSeconds: 90 })
    }
  );
  if (!response.ok) throw new AutoApplyCommandLeaseRejectedError(response.status);
  const receipt = await response.json() as Record<string, unknown>;
  if (receipt.schemaVersion !== "device-command-lease.v1" || receipt.commandId !== commandId ||
    typeof receipt.leaseExpiresAt !== "string" || !Number.isFinite(Date.parse(receipt.leaseExpiresAt)) ||
    Date.parse(receipt.leaseExpiresAt) <= Date.now()) {
    throw new Error("Gateway 未确认当前命令的执行租约");
  }
}

export async function verifyAutoApplySubmission(
  credential: AutoApplyRuntimeCredential,
  input: { token: string; batchId: string; batchJobId: string; commandId: string }
): Promise<boolean> {
  const response = await deviceFetch(
    credential,
    "/device-bridge/v1/auto-apply/submission-authorizations:verify",
    { method: "POST", body: JSON.stringify(input) }
  );
  return response.ok && (await response.json() as { valid?: boolean }).valid === true;
}

export async function reportAutoApplyBrowserState(
  credential: AutoApplyRuntimeCredential,
  input: {
    batchId: string;
    batchJobId: string;
    jobId: string;
    outcome: "succeeded" | "already_applied" | "captcha_tab_closed" |
      "submission_active_tab_closed" | "submission_receipt_tab_closed" |
      "submission_receipt_timeout" | "site_validation_rejected" | "captcha_required" |
      "site_application_limit_reached" | "user_interrupted";
    interruptionKind?: string;
    submissionStarted?: boolean;
    requiredFieldRequests?: import("./vision-form-runtime.js").CandidateInformationRequest[];
    uploadRejection?: import("../../src/gateway/auto-apply-contract.js").AutoApplyUploadRejection;
    siteMessage?: string;
    commandId?: string;
    pageUrl: string;
    observedAt: string;
  }
): Promise<void> {
  const response = await deviceFetch(
    credential,
    "/device-bridge/v1/auto-apply/browser-state",
    {
      method: "POST",
      body: JSON.stringify({ deviceId: credential.deviceId, ...input })
    }
  );
  if (!response.ok) throw new Error(`回传招聘页状态失败：HTTP ${response.status}`);
}

export async function createAutoApplyVisionSession(
  credential: AutoApplyRuntimeCredential
): Promise<string> {
  const response = await deviceFetch(
    credential,
    "/device-bridge/v1/vision/sessions",
    {
      method: "POST",
      body: JSON.stringify({ providerCode: "zhencai" })
    }
  );
  if (!response.ok) throw new Error(`创建视觉填写会话失败：HTTP ${response.status}`);
  const result = await response.json() as { sessionId?: string };
  if (!result.sessionId) throw new Error("视觉填写会话响应缺少 sessionId");
  return result.sessionId;
}

export async function planAutoApplyVision(
  credential: AutoApplyRuntimeCredential,
  sessionId: string,
  input: {
    task: "fill_application_form" | "select_resume_parser_action" | "audit_form_readback" |
      "operate_registered_control";
    observation: Record<string, unknown>;
    screenshot: { mediaType: string; dataUrl: string } | null;
    candidate: Record<string, unknown>;
    policy?: Record<string, unknown>;
  },
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/vision/sessions/${encodeURIComponent(sessionId)}/plan`,
    {
      method: "POST",
      signal,
      body: JSON.stringify({
        schemaVersion: "vision-form-plan-request.v1",
        providerCode: "zhencai",
        ...input,
        policy: {
          allowFinalSubmit: false,
          allowConsentClick: false,
          allowCaptchaHandling: false,
          ...(input.policy ?? {})
        }
      })
    },
    autoApplyVisionPlanningRequestTimeoutMs
  );
  if (!response.ok) throw new Error(`视觉填写规划失败：HTTP ${response.status}`);
  return await response.json() as Record<string, unknown>;
}

export async function autoApplyControl(
  credential: AutoApplyRuntimeCredential,
  batchId: string
): Promise<"continue" | "pause" | "cancel"> {
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/auto-apply/batches/${encodeURIComponent(batchId)}/control`
  );
  if (!response.ok) throw new Error(`读取批次控制状态失败：HTTP ${response.status}`);
  const result = await response.json() as { action?: "continue" | "pause" | "cancel" };
  return result.action ?? "continue";
}

export async function setAutoApplyControl(
  credential: AutoApplyRuntimeCredential,
  batchId: string,
  action: "pause" | "resume" | "cancel"
): Promise<void> {
  const response = await deviceFetch(
    credential,
    `/device-bridge/v1/auto-apply/batches/${encodeURIComponent(batchId)}/${action}`,
    { method: "POST", body: "{}" }
  );
  if (!response.ok) throw new Error(`更新批次控制状态失败：HTTP ${response.status}`);
}

export interface AutoApplyJobStop {
  requestId: string;
  batchId: string;
  batchJobId: string;
  jobId: string;
  commandId: string | null;
  requestedAt: string;
}

export async function pendingAutoApplyJobStops(credential: AutoApplyRuntimeCredential): Promise<AutoApplyJobStop[]> {
  const response = await deviceFetch(credential, "/device-bridge/v1/auto-apply/job-stops");
  // Additive capability: existing Gateways keep their proven polling path.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`读取岗位停止请求失败：HTTP ${response.status}`);
  const result = await response.json() as { stops?: AutoApplyJobStop[] };
  if (!Array.isArray(result.stops) || result.stops.some((stop) =>
    !stop.requestId || !stop.batchId || !stop.batchJobId || !stop.jobId ||
    (stop.commandId !== null && typeof stop.commandId !== "string"))) throw new Error("岗位停止请求格式无效");
  return result.stops;
}

export async function acknowledgeAutoApplyJobStop(credential: AutoApplyRuntimeCredential, stop: AutoApplyJobStop): Promise<void> {
  const response = await deviceFetch(credential,
    `/device-bridge/v1/auto-apply/job-stops/${encodeURIComponent(stop.requestId)}/ack`, {
      method: "POST", body: JSON.stringify({ batchId: stop.batchId, batchJobId: stop.batchJobId, commandId: stop.commandId })
    });
  if (!response.ok) throw new Error(`确认岗位已停止失败：HTTP ${response.status}`);
}

export async function rememberAutoApplyProductOrigin(source: unknown, deviceId: unknown, clientInstanceId: unknown): Promise<void> {
  const origin = executionProfileOrigin(source);
  if (typeof clientInstanceId !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(clientInstanceId)) throw new Error("请刷新 AI Offer 页面后重新连接插件");
  const credential = await autoApplyCredential();
  if (!credential || credential.deviceId !== deviceId) throw new Error("当前产品设备绑定不一致");
  if (credential.productOrigin && credential.productOrigin !== origin) throw new Error("请在此产品环境重新连接插件");
  await chrome.storage.local.set({ [credentialStorageKey]: { ...credential, productOrigin: origin, productClientInstanceId: clientInstanceId } });
}
