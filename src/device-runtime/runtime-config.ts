import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { exchangeDevicePairing } from "./gateway-device-client.js";

export interface LocalRuntimeCredentialConfig {
  schemaVersion: "local-rpa-runtime-config.v1";
  gatewayBaseUrl: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceToken: string;
  extensionId: string;
  pairedAt: string;
}

export function runtimeConfigPath(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.RECRUITING_RUNTIME_CONFIG_PATH?.trim() ||
    join(homedir(), ".config", "recruiting-ai", "runtime.json");
}

async function load(file: string): Promise<LocalRuntimeCredentialConfig | null> {
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as LocalRuntimeCredentialConfig;
    if (value.schemaVersion !== "local-rpa-runtime-config.v1" || !value.deviceToken || !value.extensionId) {
      throw new Error("本地 Runtime 凭据文件格式无效");
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function save(file: string, value: LocalRuntimeCredentialConfig): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function required(value: string | undefined, message: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

export async function resolveLocalRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): Promise<LocalRuntimeCredentialConfig> {
  const file = runtimeConfigPath(environment);
  const stored = await load(file);
  const pairingCode = environment.RECRUITING_PAIRING_CODE?.trim();
  const gatewayBaseUrl = environment.RECRUITING_GATEWAY_BASE_URL?.trim() || stored?.gatewayBaseUrl;
  const extensionId = environment.RECRUITING_EXTENSION_ID?.trim() || stored?.extensionId;

  if (pairingCode && (!stored || environment.RECRUITING_FORCE_REPAIR === "true")) {
    const baseUrl = required(gatewayBaseUrl, "首次配对必须配置 RECRUITING_GATEWAY_BASE_URL");
    const targetExtensionId = required(extensionId, "首次配对必须配置 RECRUITING_EXTENSION_ID");
    const deviceId = environment.RECRUITING_DEVICE_ID?.trim() || stored?.deviceId || randomUUID();
    const deviceName = environment.RECRUITING_DEVICE_NAME?.trim() || stored?.deviceName || hostname();
    const exchanged = await exchangeDevicePairing({
      baseUrl,
      pairingCode,
      deviceId,
      deviceName,
      runtimeVersion: environment.RECRUITING_RUNTIME_VERSION?.trim() || "1.1.0",
      pluginInstalled: environment.RECRUITING_PLUGIN_INSTALLED !== "false",
      pluginVersion: environment.RECRUITING_PLUGIN_VERSION?.trim() || "0.11.0"
    });
    const configured: LocalRuntimeCredentialConfig = {
      schemaVersion: "local-rpa-runtime-config.v1",
      gatewayBaseUrl: baseUrl,
      tenantId: exchanged.tenantId,
      userId: exchanged.userId,
      deviceId: exchanged.deviceId,
      deviceName: exchanged.deviceName,
      deviceToken: exchanged.deviceToken,
      extensionId: targetExtensionId,
      pairedAt: exchanged.pairedAt
    };
    await save(file, configured);
    return configured;
  }

  const directToken = environment.RECRUITING_DEVICE_TOKEN?.trim();
  if (directToken) {
    return {
      schemaVersion: "local-rpa-runtime-config.v1",
      gatewayBaseUrl: required(gatewayBaseUrl, "缺少 RECRUITING_GATEWAY_BASE_URL"),
      tenantId: required(environment.RECRUITING_TENANT_ID, "缺少 RECRUITING_TENANT_ID"),
      userId: required(environment.RECRUITING_USER_ID, "缺少 RECRUITING_USER_ID"),
      deviceId: required(environment.RECRUITING_DEVICE_ID, "缺少 RECRUITING_DEVICE_ID"),
      deviceName: environment.RECRUITING_DEVICE_NAME?.trim() || hostname(),
      deviceToken: directToken,
      extensionId: required(extensionId, "缺少 RECRUITING_EXTENSION_ID"),
      pairedAt: new Date().toISOString()
    };
  }

  if (stored) return {
    ...stored,
    gatewayBaseUrl: gatewayBaseUrl || stored.gatewayBaseUrl,
    extensionId: extensionId || stored.extensionId
  };

  throw new Error("Runtime 尚未配对。请在 AI 会话中生成一次性配对码，并设置 RECRUITING_PAIRING_CODE 后启动。 ");
}
