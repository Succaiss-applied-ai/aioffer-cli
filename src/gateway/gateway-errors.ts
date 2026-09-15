export class GatewayRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "GatewayRequestError";
  }
}

export class DeviceIdRequiredError extends GatewayRequestError {
  constructor() {
    super("DEVICE_ID_REQUIRED", "新任务必须明确指定 deviceId", 422);
    this.name = "DeviceIdRequiredError";
  }
}

export class DeviceNotFoundError extends GatewayRequestError {
  constructor() {
    super("DEVICE_NOT_FOUND", "指定设备不存在或不属于当前用户", 404);
    this.name = "DeviceNotFoundError";
  }
}

export class IdempotencyConflictError extends GatewayRequestError {
  constructor() {
    super(
      "IDEMPOTENCY_CONFLICT",
      "相同 Idempotency-Key 已用于不同设备或不同请求内容",
      409
    );
    this.name = "IdempotencyConflictError";
  }
}

export class DeviceCommandExpiredError extends GatewayRequestError {
  constructor() {
    super(
      "DEVICE_COMMAND_EXPIRED",
      "设备命令已超过执行时限，不能继续续租、上报进度或提交结果",
      410
    );
    this.name = "DeviceCommandExpiredError";
  }
}

export class AutoApplyProgressSequenceConflictError extends GatewayRequestError {
  constructor(sequence: number, readonly acceptedSequence: number) {
    super("AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", `自动投递进度序号未递增：${sequence}`, 409);
    this.name = "AutoApplyProgressSequenceConflictError";
  }
}

export function requireDeviceId(value: unknown): string {
  const deviceId = typeof value === "string" ? value.trim() : "";
  if (!deviceId) throw new DeviceIdRequiredError();
  if (deviceId.length > 128) {
    throw new GatewayRequestError("DEVICE_ID_INVALID", "deviceId 长度不能超过 128", 422);
  }
  return deviceId;
}
