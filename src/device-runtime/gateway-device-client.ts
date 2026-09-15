import type {
  LegacyPluginCommand,
  LegacyPluginEvent
} from "../gateway/legacy-plugin-adapter.js";

export interface ClaimedDeviceCommand {
  schemaVersion: "device-command-claim.v1";
  commandId: string;
  runId: string;
  leaseExpiresAt: string;
  command: LegacyPluginCommand;
}

export interface DeviceGatewayPort {
  heartbeat(status: {
    deviceName?: string;
    runtimeVersion?: string;
    pluginInstalled: boolean;
    pluginVersion?: string;
    capabilities?: string[];
  }): Promise<void>;
  claim(): Promise<ClaimedDeviceCommand | null>;
  submit(commandId: string, event: LegacyPluginEvent): Promise<void>;
}

export interface GatewayDeviceClientOptions {
  baseUrl: string;
  deviceToken: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  leaseSeconds?: number;
  timeoutMs?: number;
}

export class GatewayDeviceClient implements DeviceGatewayPort {
  private readonly baseUrl: string;

  constructor(private readonly options: GatewayDeviceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  async heartbeat(status: {
    deviceName?: string;
    runtimeVersion?: string;
    pluginInstalled: boolean;
    pluginVersion?: string;
    capabilities?: string[];
  }): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/device-bridge/v1/devices/${encodeURIComponent(this.options.deviceId)}/heartbeat`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ userId: this.options.userId, ...status }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000)
      }
    );
    if (!response.ok) throw new Error(`Device Bridge 心跳失败：HTTP ${response.status} ${await response.text()}`);
  }

  async claim(): Promise<ClaimedDeviceCommand | null> {
    const response = await fetch(
      `${this.baseUrl}/device-bridge/v1/devices/${encodeURIComponent(this.options.deviceId)}/commands/claim`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          userId: this.options.userId,
          leaseSeconds: this.options.leaseSeconds ?? 300
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000)
      }
    );
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Device Bridge 领取失败：HTTP ${response.status} ${await response.text()}`);
    return await response.json() as ClaimedDeviceCommand;
  }

  async submit(commandId: string, event: LegacyPluginEvent): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/device-bridge/v1/commands/${encodeURIComponent(commandId)}/results`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ deviceId: this.options.deviceId, event }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000)
      }
    );
    if (!response.ok) throw new Error(`Device Bridge 回传失败：HTTP ${response.status} ${await response.text()}`);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.deviceToken}`,
      "X-Tenant-Id": this.options.tenantId,
      "Content-Type": "application/json"
    };
  }
}

export interface ExchangePairingOptions {
  baseUrl: string;
  pairingCode: string;
  deviceId: string;
  deviceName?: string;
  runtimeVersion?: string;
  pluginInstalled?: boolean;
  pluginVersion?: string;
  capabilities?: string[];
  timeoutMs?: number;
}

export interface ExchangedDeviceCredential {
  schemaVersion: "device-pairing-exchange.v1";
  tenantId: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceToken: string;
  pairedAt: string;
}

export async function exchangeDevicePairing(
  options: ExchangePairingOptions
): Promise<ExchangedDeviceCredential> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/device-bridge/v1/pairings:exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairingCode: options.pairingCode,
      deviceId: options.deviceId,
      deviceName: options.deviceName,
      runtimeVersion: options.runtimeVersion ?? "1.1.0",
      pluginInstalled: options.pluginInstalled === true,
      pluginVersion: options.pluginVersion,
      capabilities: options.capabilities ?? ["manual_copy", "assisted_rpa", "vision_rpa"]
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000)
  });
  if (!response.ok) throw new Error(`设备配对失败：HTTP ${response.status} ${await response.text()}`);
  return await response.json() as ExchangedDeviceCredential;
}
