import { describe, expect, it, vi } from "vitest";
import { createAutoApplyHeartbeat } from "./auto-apply-heartbeat.js";
import type { AutoApplyRuntimeCredential } from "./auto-apply-client.js";

const credential: AutoApplyRuntimeCredential = {
  schemaVersion: "auto-apply-runtime-credential.v1", gatewayBaseUrl: "https://gateway.example",
  tenantId: "tenant", userId: "user", deviceId: "device", deviceToken: "test-token",
  pairedAt: "2026-09-07T00:00:00.000Z"
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("independent automatic-application heartbeat", () => {
  it("coalesces concurrent alarms and sends again after the previous network call completes", async () => {
    const sent = deferred<void>();
    const send = vi.fn(() => sent.promise);
    const beat = createAutoApplyHeartbeat({ credential: async () => credential, send, active: () => true, generation: () => 1 });
    const first = beat();
    const second = beat();
    expect(first).toBe(second);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    sent.resolve();
    await first;
    await beat();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("can keep reporting health throughout a long-running job without waiting for its completion", async () => {
    vi.useFakeTimers();
    const job = deferred<void>();
    let jobFinished = false;
    void job.promise.then(() => { jobFinished = true; });
    const send = vi.fn(async () => undefined);
    const beat = createAutoApplyHeartbeat({ credential: async () => credential, send, active: () => true, generation: () => 1 });
    const alarm = setInterval(() => { void beat(); }, 30_000);
    try {
      await vi.advanceTimersByTimeAsync(120_000);
      expect(send).toHaveBeenCalledTimes(4);
      expect(jobFinished).toBe(false);
    } finally {
      clearInterval(alarm);
      job.resolve();
      vi.useRealTimers();
    }
  });

  it("does not send credentials read before logout or an account generation change", async () => {
    const stored = deferred<AutoApplyRuntimeCredential>();
    let generation = 1;
    const send = vi.fn(async () => undefined);
    const beat = createAutoApplyHeartbeat({ credential: () => stored.promise, send, active: () => true, generation: () => generation });
    const pending = beat();
    generation += 1;
    stored.resolve(credential);
    expect(await pending).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores an old response after logout and releases a failed network call for retry", async () => {
    const response = deferred<void>();
    let active = true;
    const send = vi.fn(() => response.promise);
    const beat = createAutoApplyHeartbeat({ credential: async () => credential, send, active: () => active, generation: () => 1 });
    const pending = beat();
    await Promise.resolve();
    active = false;
    response.resolve();
    expect(await pending).toBeNull();
    active = true;
    send.mockRejectedValueOnce(new Error("network interrupted"));
    await expect(beat()).rejects.toThrow("network interrupted");
    await expect(beat()).resolves.toEqual(credential);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("starts a fresh account heartbeat while an old account response is still pending", async () => {
    const response = deferred<void>();
    let generation = 1;
    let currentCredential = credential;
    const send = vi.fn(async () => undefined).mockImplementationOnce(() => response.promise);
    const beat = createAutoApplyHeartbeat({
      credential: async () => currentCredential, send, active: () => true, generation: () => generation
    });
    const old = beat();
    await Promise.resolve();
    generation += 1;
    currentCredential = { ...credential, userId: "next-user", deviceId: "next-device" };
    await expect(beat()).resolves.toEqual(currentCredential);
    expect(send).toHaveBeenLastCalledWith(currentCredential);
    response.resolve();
    expect(await old).toBeNull();
  });
});
