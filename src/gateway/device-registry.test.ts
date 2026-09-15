import { describe, expect, it } from "vitest";
import {
  assertAutoApplyPluginVersion,
  MemoryDeviceRegistry,
  MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
  requireReadyDevice
} from "./device-registry.js";

describe("explicit device routing", () => {
  it("requires the account-logout fence capability even at the current semantic version", () => {
    const device = {
      schemaVersion: "paired-device.v1" as const,
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-a",
      deviceName: "device-a",
      runtimeVersion: null,
      pluginInstalled: true,
      pluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
      registeredAt: "2026-08-26T00:00:00.000Z",
      lastSeenAt: "2026-08-26T00:00:00.000Z",
      capabilities: ["batch_auto_apply.v1"]
    };

    expect(() => assertAutoApplyPluginVersion(device)).toThrow("缺少账号退出终止能力");
    expect(() => assertAutoApplyPluginVersion({
      ...device,
      capabilities: [...device.capabilities, "account_logout_fence.v1"]
    })).not.toThrow();
  });

  it("never selects the only or most recently seen ready device", async () => {
    const registry = new MemoryDeviceRegistry(() => new Date("2026-08-26T00:00:00.000Z"));
    await registry.register({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-a",
      pluginInstalled: true,
      pluginVersion: "0.15.15"
    });

    await expect(requireReadyDevice(registry, "tenant-1", "user-1", undefined))
      .rejects.toMatchObject({ code: "DEVICE_ID_REQUIRED" });
    await expect(requireReadyDevice(registry, "tenant-1", "user-1", "device-b"))
      .rejects.toMatchObject({ code: "DEVICE_NOT_FOUND" });
    await expect(requireReadyDevice(
      registry,
      "tenant-1",
      "user-1",
      "device-a",
      new Date("2026-08-26T00:00:00.000Z")
    ))
      .resolves.toMatchObject({ deviceId: "device-a" });
  });

  it("does not fail over from an offline target to another ready device", async () => {
    let current = new Date("2026-08-26T00:00:00.000Z");
    const registry = new MemoryDeviceRegistry(() => current);
    await registry.register({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-a",
      pluginInstalled: true,
      pluginVersion: "0.15.15"
    });
    current = new Date("2026-08-26T00:02:00.000Z");
    await registry.register({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-b",
      pluginInstalled: true,
      pluginVersion: "0.15.15"
    });

    await expect(requireReadyDevice(registry, "tenant-1", "user-1", "device-a", current))
      .rejects.toMatchObject({ code: "RUNTIME_OFFLINE" });
    await expect(requireReadyDevice(registry, "tenant-1", "user-1", "device-b", current))
      .resolves.toMatchObject({ deviceId: "device-b" });
  });

  it("keeps every explicitly registered device without a count limit", async () => {
    const registry = new MemoryDeviceRegistry(() => new Date("2026-08-26T00:00:00.000Z"));
    await Promise.all(Array.from({ length: 8 }, (_, index) => registry.register({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: `device-${index + 1}`,
      pluginInstalled: true,
      pluginVersion: "0.15.15"
    })));

    await expect(registry.list("tenant-1", "user-1")).resolves.toHaveLength(8);
  });
});
