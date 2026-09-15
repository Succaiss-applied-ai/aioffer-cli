export const autoApplyDeviceCapabilities = [
  "batch_auto_apply.v1",
  "candidate_information_merge.v1",
  "candidate_profile_fetch.v1",
  "account_logout_fence.v1",
  "single_job_stop.v1",
  "moka.deepseek.v1",
  "moka.v2",
  "feishu.xiaopeng.v1",
  "generic.web.v1"
] as const;

export interface RecruitingAiDeviceContext {
  schemaVersion: "recruiting-ai-device-context.v1";
  pluginVersion: string;
  bindingState: "bound" | "unbound";
  deviceId: string | null;
  capabilities: string[];
}

export interface RecruitingAiWakeRequest {
  deviceId: string;
  groupId?: string;
  batchId: string;
}

export interface RecruitingAiWakeReceipt {
  ok: true;
  status: "polling";
  acceptedAt: string;
}

type BoundDevice = { deviceId: string };

function requiredWakeId(value: unknown, field: "deviceId" | "batchId"): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`唤醒请求缺少 ${field}`);
  }
  return value;
}

export function recruitingAiWakeRequest(value: unknown): RecruitingAiWakeRequest {
  if (!value || typeof value !== "object") throw new Error("唤醒请求格式错误");
  const record = value as Record<string, unknown>;
  const request: RecruitingAiWakeRequest = {
    deviceId: requiredWakeId(record.deviceId, "deviceId"),
    batchId: requiredWakeId(record.batchId, "batchId")
  };
  if (record.groupId !== undefined && record.groupId !== null) {
    if (typeof record.groupId !== "string" || !record.groupId.trim()) {
      throw new Error("唤醒请求 groupId 格式错误");
    }
    request.groupId = record.groupId;
  }
  return request;
}

export function assertRecruitingAiWakeDevice(
  request: RecruitingAiWakeRequest,
  boundDeviceId: string | null
): void {
  if (!boundDeviceId) throw new Error("插件尚未完成设备绑定");
  if (request.deviceId !== boundDeviceId) {
    throw new Error("唤醒目标设备与当前插件绑定不一致");
  }
}

export function recruitingAiDeviceContext(
  pluginVersion: string,
  credential: BoundDevice | null
): RecruitingAiDeviceContext {
  const deviceId = typeof credential?.deviceId === "string" && credential.deviceId.trim()
    ? credential.deviceId
    : null;
  return {
    schemaVersion: "recruiting-ai-device-context.v1",
    pluginVersion,
    bindingState: deviceId ? "bound" : "unbound",
    deviceId,
    capabilities: [...autoApplyDeviceCapabilities]
  };
}

export function publicRecruitingAiDeviceContext(value: unknown): RecruitingAiDeviceContext | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true || record.schemaVersion !== "recruiting-ai-device-context.v1") return null;
  if (typeof record.pluginVersion !== "string") return null;
  if (record.bindingState !== "bound" && record.bindingState !== "unbound") return null;
  if (
    record.bindingState === "bound" &&
    (typeof record.deviceId !== "string" || !record.deviceId.trim())
  ) return null;
  if (record.bindingState === "unbound" && record.deviceId !== null) return null;
  if (!Array.isArray(record.capabilities) || !record.capabilities.every((item) => typeof item === "string")) {
    return null;
  }
  return {
    schemaVersion: "recruiting-ai-device-context.v1",
    pluginVersion: record.pluginVersion,
    bindingState: record.bindingState,
    deviceId: record.deviceId as string | null,
    capabilities: [...record.capabilities]
  };
}

export async function acceptRecruitingAiWake(
  value: unknown,
  dependencies: {
    loadCredential: () => Promise<BoundDevice | null>;
    startPolling: () => void;
    now?: () => Date;
  }
): Promise<RecruitingAiWakeReceipt> {
  const request = recruitingAiWakeRequest(value);
  const credential = await dependencies.loadCredential();
  assertRecruitingAiWakeDevice(request, credential?.deviceId ?? null);
  dependencies.startPolling();
  return {
    ok: true,
    status: "polling",
    acceptedAt: (dependencies.now ?? (() => new Date()))().toISOString()
  };
}
