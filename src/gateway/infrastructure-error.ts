import { GatewayRequestError } from "./gateway-errors.js";

const transientCodes = new Set([
  "40001", "40P01", "55P03", "57014", "53300", "57P01", "57P02", "57P03",
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ENOTFOUND"
]);
const poolFailures = [
  /^timeout exceeded when trying to connect$/i,
  /^connection terminated due to connection timeout$/i,
  /^connection terminated unexpectedly$/i,
  /^cannot use a pool after calling end on the pool$/i
];

/** Infrastructure details belong in server diagnostics, never in device/API responses. */
export function gatewayInfrastructureError(error: unknown): GatewayRequestError | null {
  if (error instanceof GatewayRequestError) return null;
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as Record<string, unknown>;
    const code = typeof value.code === "string" ? value.code : "";
    const message = typeof value.message === "string" ? value.message : "";
    if (transientCodes.has(code) || /^08[0-9A-Z]{3}$/.test(code) || poolFailures.some(pattern => pattern.test(message))) {
      return new GatewayRequestError("GATEWAY_TEMPORARILY_UNAVAILABLE", "任务服务暂时繁忙，请稍后重试", 503, true);
    }
    if (/^[0-9A-Z]{5}$/.test(code) && (/^\d{2}/.test(code) || "severity" in value || "routine" in value)) {
      return new GatewayRequestError("GATEWAY_STORAGE_ERROR", "任务数据暂时无法处理，请联系管理员", 500, false);
    }
    current = value.cause;
  }
  return null;
}
