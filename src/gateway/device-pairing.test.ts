import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JsonDevicePairingRegistry,
  MemoryDevicePairingRegistry
} from "./device-pairing.js";

describe("one-time device pairing", () => {
  it("exchanges a one-time code for a device-scoped credential", async () => {
    const registry = new MemoryDevicePairingRegistry(() => new Date("2026-08-08T00:00:00.000Z"));
    const created = await registry.create({ tenantId: "tenant-1", userId: "user-1" });
    expect(created.pairingCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(JSON.stringify(created)).not.toContain("codeHash");

    const exchanged = await registry.exchange({
      pairingCode: created.pairingCode,
      deviceId: "device-1",
      deviceName: "用户 Mac"
    });
    expect(exchanged.deviceToken).toMatch(/^rpa_/);
    expect(exchanged.userId).toBe("user-1");
    expect(await registry.authenticate(exchanged.deviceToken)).toMatchObject({
      tenantId: "tenant-1",
      userId: "user-1",
      deviceId: "device-1"
    });
    await expect(registry.exchange({ pairingCode: created.pairingCode, deviceId: "device-2" }))
      .rejects.toThrow("配对码已使用");
  });

  it("persists only token hashes across gateway restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-device-auth-"));
    const file = join(directory, "device-auth.json");
    const first = new JsonDevicePairingRegistry(file, () => new Date("2026-08-08T00:00:00.000Z"));
    const created = await first.create({ tenantId: "tenant-1", userId: "user-1" });
    const exchanged = await first.exchange({ pairingCode: created.pairingCode, deviceId: "device-1" });

    const second = new JsonDevicePairingRegistry(file, () => new Date("2026-08-08T00:01:00.000Z"));
    expect(await second.authenticate(exchanged.deviceToken)).toMatchObject({ deviceId: "device-1" });
    const contents = await import("node:fs/promises").then(({ readFile }) => readFile(file, "utf8"));
    expect(contents).not.toContain(exchanged.deviceToken);
    expect(contents).not.toContain(created.pairingCode.replaceAll("-", ""));
  });

  it("revokes every owner authorization and lets another owner bind as fresh", async () => {
    const registry = new MemoryDevicePairingRegistry(() => new Date("2026-08-08T00:00:00.000Z"));
    const ownerAPairing = await registry.create({ tenantId: "tenant-1", userId: "user-a" });
    const ownerACredential = await registry.exchange({
      pairingCode: ownerAPairing.pairingCode,
      deviceId: "physical-device"
    });
    const unusedPairing = await registry.create({ tenantId: "tenant-1", userId: "user-a" });
    const unusedBootstrap = await registry.createBootstrap({ tenantId: "tenant-1", userId: "user-a" });

    await expect(registry.terminateOwner("tenant-1", "user-a")).resolves.toEqual({
      credentials: 1,
      pairingSessions: 1,
      bootstrapSessions: 1
    });
    await expect(registry.authenticate(ownerACredential.deviceToken)).resolves.toBeNull();
    await expect(registry.exchange({
      pairingCode: unusedPairing.pairingCode,
      deviceId: "late-device"
    })).rejects.toThrow("配对码无效");
    await expect(registry.exchangeBootstrap({
      bootstrapToken: unusedBootstrap.bootstrapToken,
      deviceId: "late-device"
    })).rejects.toThrow("设备绑定凭证无效");

    const ownerBPairing = await registry.create({ tenantId: "tenant-1", userId: "user-b" });
    const ownerBCredential = await registry.exchange({
      pairingCode: ownerBPairing.pairingCode,
      deviceId: "physical-device"
    });
    await expect(registry.authenticate(ownerBCredential.deviceToken)).resolves.toMatchObject({
      tenantId: "tenant-1",
      userId: "user-b",
      deviceId: "physical-device"
    });
  });

  it("refreshes the same owner in place but assigns a fresh device to another owner", async () => {
    const registry = new MemoryDevicePairingRegistry(() => new Date("2026-08-08T00:00:00.000Z"));
    const pairingA = await registry.create({ tenantId: "tenant-1", userId: "user-a" });
    const originalA = await registry.exchange({
      pairingCode: pairingA.pairingCode,
      deviceId: "device-owner-a"
    });
    const refreshA = await registry.createBootstrap({ tenantId: "tenant-1", userId: "user-a" });
    const refreshedA = await registry.exchangeBootstrap({
      bootstrapToken: refreshA.bootstrapToken,
      previousDeviceId: "device-owner-a",
      deviceId: "unused-fresh-candidate"
    });
    expect(refreshedA.deviceId).toBe("device-owner-a");
    await expect(registry.authenticate(originalA.deviceToken)).resolves.toBeNull();

    const bootstrapB = await registry.createBootstrap({ tenantId: "tenant-1", userId: "user-b" });
    const ownerB = await registry.exchangeBootstrap({
      bootstrapToken: bootstrapB.bootstrapToken,
      previousDeviceId: "device-owner-a",
      deviceId: "device-owner-b"
    });
    expect(ownerB.deviceId).toBe("device-owner-b");
    await expect(registry.authenticate(refreshedA.deviceToken)).resolves.toBeNull();
    await expect(registry.authenticate(ownerB.deviceToken)).resolves.toMatchObject({
      userId: "user-b",
      deviceId: "device-owner-b"
    });
  });
});
