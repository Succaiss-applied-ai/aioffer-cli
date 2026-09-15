import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DeviceNotFoundError, requireDeviceId } from "./gateway-errors.js";

export interface DeviceRegistration {
  schemaVersion: "paired-device.v1";
  tenantId: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  runtimeVersion: string | null;
  pluginInstalled: boolean;
  pluginVersion: string | null;
  registeredAt: string;
  lastSeenAt: string;
  capabilities: string[];
}

export interface RegisterDeviceInput {
  tenantId: string;
  userId: string;
  deviceId: string;
  deviceName?: string;
  runtimeVersion?: string | null;
  pluginInstalled?: boolean;
  pluginVersion?: string | null;
  capabilities?: string[];
}

export interface DeviceRegistry {
  register(input: RegisterDeviceInput): Promise<DeviceRegistration>;
  list(tenantId: string, userId: string): Promise<DeviceRegistration[]>;
  get(tenantId: string, userId: string, deviceId: string): Promise<DeviceRegistration | null>;
  removeOwner(tenantId: string, userId: string): Promise<number>;
}

interface DeviceStore {
  schemaVersion: "paired-device-store.v1";
  devices: DeviceRegistration[];
}

export class MemoryDeviceRegistry implements DeviceRegistry {
  private readonly devices = new Map<string, DeviceRegistration>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async register(input: RegisterDeviceInput): Promise<DeviceRegistration> {
    const key = `${input.tenantId}\u0000${input.userId}\u0000${input.deviceId}`;
    const previous = this.devices.get(key);
    const timestamp = this.now().toISOString();
    const device: DeviceRegistration = {
      schemaVersion: "paired-device.v1",
      tenantId: input.tenantId,
      userId: input.userId,
      deviceId: input.deviceId,
      deviceName: input.deviceName || previous?.deviceName || input.deviceId,
      runtimeVersion: input.runtimeVersion ?? previous?.runtimeVersion ?? null,
      pluginInstalled: input.pluginInstalled ?? previous?.pluginInstalled ?? false,
      pluginVersion: input.pluginVersion ?? previous?.pluginVersion ?? null,
      registeredAt: previous?.registeredAt || timestamp,
      lastSeenAt: timestamp,
      capabilities: input.capabilities ?? previous?.capabilities ?? []
    };
    this.devices.set(key, structuredClone(device));
    return structuredClone(device);
  }

  async list(tenantId: string, userId: string): Promise<DeviceRegistration[]> {
    return [...this.devices.values()]
      .filter((item) => item.tenantId === tenantId && item.userId === userId)
      .map((item) => structuredClone(item));
  }

  async get(tenantId: string, userId: string, deviceId: string): Promise<DeviceRegistration | null> {
    return structuredClone(this.devices.get(`${tenantId}\u0000${userId}\u0000${deviceId}`) ?? null);
  }

  async removeOwner(tenantId: string, userId: string): Promise<number> {
    let removed = 0;
    for (const [key, device] of this.devices) {
      if (device.tenantId !== tenantId || device.userId !== userId) continue;
      this.devices.delete(key);
      removed += 1;
    }
    return removed;
  }
}

export class JsonDeviceRegistry implements DeviceRegistry {
  private operation = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async load(): Promise<DeviceStore> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as DeviceStore;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: "paired-device-store.v1", devices: [] };
      }
      throw error;
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  async register(input: RegisterDeviceInput): Promise<DeviceRegistration> {
    return this.serialize(async () => {
      const store = await this.load();
      const previous = store.devices.find((item) => item.tenantId === input.tenantId &&
        item.userId === input.userId && item.deviceId === input.deviceId);
      const timestamp = this.now().toISOString();
      const device: DeviceRegistration = {
        schemaVersion: "paired-device.v1",
        tenantId: input.tenantId,
        userId: input.userId,
        deviceId: input.deviceId,
        deviceName: input.deviceName || previous?.deviceName || input.deviceId,
        runtimeVersion: input.runtimeVersion ?? previous?.runtimeVersion ?? null,
        pluginInstalled: input.pluginInstalled ?? previous?.pluginInstalled ?? false,
        pluginVersion: input.pluginVersion ?? previous?.pluginVersion ?? null,
        registeredAt: previous?.registeredAt || timestamp,
        lastSeenAt: timestamp,
        capabilities: input.capabilities ?? previous?.capabilities ?? []
      };
      const next = store.devices.filter((item) => !(item.tenantId === input.tenantId &&
        item.userId === input.userId && item.deviceId === input.deviceId));
      next.push(device);
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ ...store, devices: next }, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
      return structuredClone(device);
    });
  }

  async list(tenantId: string, userId: string): Promise<DeviceRegistration[]> {
    return (await this.load()).devices
      .filter((item) => item.tenantId === tenantId && item.userId === userId)
      .map((item) => structuredClone(item));
  }

  async get(tenantId: string, userId: string, deviceId: string): Promise<DeviceRegistration | null> {
    const item = (await this.load()).devices.find((candidate) => candidate.tenantId === tenantId &&
      candidate.userId === userId && candidate.deviceId === deviceId);
    return item ? structuredClone(item) : null;
  }

  async removeOwner(tenantId: string, userId: string): Promise<number> {
    return this.serialize(async () => {
      const store = await this.load();
      const next = store.devices.filter((item) => item.tenantId !== tenantId || item.userId !== userId);
      const removed = store.devices.length - next.length;
      if (removed === 0) return 0;
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ ...store, devices: next }, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
      return removed;
    });
  }
}

export const DEFAULT_PLUGIN_DOWNLOAD_URL = "http://127.0.0.1:19876/";
export const DEFAULT_PLUGIN_ZIP_URL = "http://127.0.0.1:19876/";
export const DEFAULT_RUNTIME_ZIP_URL = "https://recruiting-ai-plugin-download.rare-bison-7872.chatgpt.site/downloads/runtime/stable/latest.zip";
export const AUTO_APPLY_LOGOUT_FENCE_CAPABILITY = "account_logout_fence.v1";
// Release discovery is advisory. The v1 protocol baseline must not roll with releases.
export const CURRENT_AUTO_APPLY_PLUGIN_VERSION = "1.0.12";
export const PREVIOUS_AUTO_APPLY_PLUGIN_VERSIONS = ["1.0.11", "1.0.10"] as const;
export const MINIMUM_AUTO_APPLY_PLUGIN_VERSION = "0.15.112";
export const PLUGIN_UPDATE_MESSAGE = "请尽快更新插件版本，避免任务执行异常";

function numericVersion(value: string | null | undefined): number[] | null {
  const match = String(value ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/);
  return match ? match.slice(1).map((part) => Number(part ?? 0)) : null;
}

export function pluginVersionAtLeast(
  current: string | null | undefined,
  minimum: string = MINIMUM_AUTO_APPLY_PLUGIN_VERSION
): boolean {
  const currentParts = numericVersion(current);
  const minimumParts = numericVersion(minimum);
  if (!currentParts || !minimumParts) return false;
  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (currentParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export class PluginUpdateRequiredError extends Error {
  readonly status = 409;
  readonly code = "PLUGIN_UPDATE_REQUIRED";
  readonly retryable = false;
  readonly latestVersion = CURRENT_AUTO_APPLY_PLUGIN_VERSION;
  readonly userAction = {
    type: "update_plugin",
    downloadPageUrl: DEFAULT_PLUGIN_DOWNLOAD_URL,
    pluginPackageUrl: DEFAULT_PLUGIN_ZIP_URL
  };

  constructor(
    readonly currentVersion: string | null,
    readonly minimumVersion: string = MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
    message?: string
  ) {
    super(message ?? PLUGIN_UPDATE_MESSAGE);
    this.name = "PluginUpdateRequiredError";
  }
}

export function autoApplyPluginCompatibilityError(device: DeviceRegistration): PluginUpdateRequiredError | null {
  if (!pluginVersionAtLeast(device.pluginVersion)) {
    return new PluginUpdateRequiredError(device.pluginVersion);
  }
  if (!device.capabilities.includes(AUTO_APPLY_LOGOUT_FENCE_CAPABILITY)) {
    return new PluginUpdateRequiredError(
      device.pluginVersion,
      MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
      "当前插件缺少账号退出终止能力，请更新插件后再创建批量投递任务"
    );
  }
  return null;
}

export function assertAutoApplyPluginVersion(device: DeviceRegistration): void {
  const error = autoApplyPluginCompatibilityError(device);
  if (error) throw error;
}

export function deviceState(device: DeviceRegistration | null, now = new Date(), onlineSeconds = 90) {
  if (!device) return "runtime_not_registered" as const;
  if (now.getTime() - Date.parse(device.lastSeenAt) > onlineSeconds * 1000) return "runtime_offline" as const;
  if (!device.pluginInstalled || !device.pluginVersion) return "plugin_not_installed" as const;
  return "ready" as const;
}

export class RuntimeUnavailableError extends Error {
  readonly status = 409;
  readonly retryable = true;
  readonly userAction: Record<string, unknown>;

  constructor(readonly code: "RUNTIME_NOT_REGISTERED" | "RUNTIME_OFFLINE" | "PLUGIN_NOT_INSTALLED") {
    const messages = {
      RUNTIME_NOT_REGISTERED: "当前用户尚未配对本地 RPA Runtime",
      RUNTIME_OFFLINE: "已配对的本地 RPA Runtime 当前不在线",
      PLUGIN_NOT_INSTALLED: "本地 Runtime 在线，但未检测到 AI Offer 招聘小助手"
    };
    super(messages[code]);
    this.name = "RuntimeUnavailableError";
    this.userAction = code === "PLUGIN_NOT_INSTALLED" || code === "RUNTIME_NOT_REGISTERED"
      ? {
          type: "install_runtime_and_plugin",
          downloadPageUrl: DEFAULT_PLUGIN_DOWNLOAD_URL,
          pluginPackageUrl: DEFAULT_PLUGIN_ZIP_URL,
          runtimePackageUrl: DEFAULT_RUNTIME_ZIP_URL,
          pairingRequired: true
        }
      : { type: "start_runtime" };
  }
}

export async function requireReadyDevice(
  registry: DeviceRegistry,
  tenantId: string,
  userId: string,
  requestedDeviceId: unknown,
  now = new Date()
): Promise<DeviceRegistration> {
  const deviceId = requireDeviceId(requestedDeviceId);
  const device = await registry.get(tenantId, userId, deviceId);
  if (!device) throw new DeviceNotFoundError();
  const state = deviceState(device, now);
  if (state === "ready") return device;
  throw new RuntimeUnavailableError(state === "plugin_not_installed" ? "PLUGIN_NOT_INSTALLED" : "RUNTIME_OFFLINE");
}
