import { describe, expect, it, vi } from "vitest";
import { autoApplyCompletionOutboxStorageKey as legacyKey, autoApplyCompletionOutboxV2StorageKey as key,
  completionOutboxFlushLimit, completionOutboxRetryBaseMs, completionOutboxRetryMaxMs,
  createAutoApplyCompletionOutbox } from "./auto-apply-completion-outbox.js";

function harness(initial: Record<string, unknown> = {}) {
  let now = Date.parse("2026-09-10T09:00:00Z");
  const data = structuredClone(initial);
  const storage = {
    get: vi.fn(async defaults => structuredClone({ ...defaults, ...data })),
    set: vi.fn(async value => { Object.assign(data, structuredClone(value)); })
  };
  return { data, storage, now: () => now, advance: (ms: number) => { now += ms; },
    box: createAutoApplyCompletionOutbox(storage, () => now) };
}
const event = { eventId: "event-1", commandId: "command-1", status: "completed", payload: { outcome: "succeeded" } };

describe("durable per-command completion outbox", () => {
  it("durably migrates the old single slot and keeps its original result after restart", async () => {
    const h = harness({ [legacyKey]: { schemaVersion: "auto-apply-completion-outbox.v1", commandId: "command-1", event,
      createdAt: "2026-09-10T08:00:00Z" } });
    expect(await h.box.pending("owner")).toMatchObject([{ commandId: "command-1", event, owner: "owner" }]);
    expect(h.storage.set).toHaveBeenNthCalledWith(1, {
      [key]: { schemaVersion: "auto-apply-completion-outbox.v2", entries: expect.any(Array) } });
    expect(h.storage.set).toHaveBeenNthCalledWith(2, { [legacyKey]: null });
    const restarted = createAutoApplyCompletionOutbox(h.storage, h.now);
    expect(await restarted.pending("owner")).toHaveLength(1);
    expect(h.storage.set).toHaveBeenCalledTimes(2);
  });

  it("recovers a migration interrupted after the new map was persisted", async () => {
    const h = harness({ [legacyKey]: { schemaVersion: "auto-apply-completion-outbox.v1", commandId: "command-1", event } });
    h.storage.set.mockImplementationOnce(async value => { Object.assign(h.data, structuredClone(value)); })
      .mockRejectedValueOnce(new Error("worker terminated"));
    await expect(h.box.pending("owner")).rejects.toThrow("worker terminated");
    expect(h.data[legacyKey]).not.toBeNull();
    const restarted = createAutoApplyCompletionOutbox(h.storage, h.now);
    expect(await restarted.pending("owner")).toMatchObject([{ commandId: "command-1", event }]);
    expect(await restarted.pending("owner")).toHaveLength(1);
    expect(h.data[legacyKey]).toBeNull();
  });

  it("keeps a 409 receipt and retries other commands without closing the rejected page", async () => {
    const h = harness();
    await h.box.enqueue("owner", "command-1", event);
    await h.box.enqueue("owner", "command-2", { ...event, commandId: "command-2" });
    const acknowledged: string[] = [], removed: string[] = [];
    const result = await h.box.flush("owner", {
      acknowledge: async entry => {
        if (entry.commandId === "command-1") throw new Error("HTTP 409");
        acknowledged.push(entry.commandId);
      }, removed: async entry => { removed.push(entry.commandId); }
    });
    expect(result).toEqual({ blockedCommandIds: ["command-1"], lastError: "HTTP 409" });
    expect(acknowledged).toEqual(["command-2"]);
    expect(removed).toEqual(["command-2"]);
    expect(await h.box.pending("owner")).toMatchObject([{ event, attempts: 1 }]);
  });

  it("persists bounded backoff across worker restarts and never silently drops a receipt", async () => {
    const h = harness();
    await h.box.enqueue("owner", "command-1", event);
    const rejected = vi.fn(async () => { throw new Error("HTTP 409"); });
    await h.box.flush("owner", { acknowledge: rejected });
    const restarted = createAutoApplyCompletionOutbox(h.storage, h.now);
    await restarted.flush("owner", { acknowledge: rejected });
    expect(rejected).toHaveBeenCalledOnce();
    h.advance(completionOutboxRetryBaseMs);
    await restarted.flush("owner", { acknowledge: rejected });
    for (let attempt = 0; attempt < 12; attempt++) {
      h.advance(completionOutboxRetryMaxMs);
      await restarted.flush("owner", { acknowledge: rejected });
    }
    const pending = await restarted.pending("owner");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.event).toEqual(event);
    expect(Date.parse(pending[0]!.nextAttemptAt) - h.now()).toBe(completionOutboxRetryMaxMs);
  });

  it("bounds work per flush and gives other due receipts a turn", async () => {
    const h = harness();
    for (let i = 0; i < completionOutboxFlushLimit + 2; i++) {
      await h.box.enqueue("owner", `command-${i}`, { ...event, commandId: `command-${i}` });
    }
    const rejected = vi.fn(async () => { throw new Error("offline"); });
    await h.box.flush("owner", { acknowledge: rejected });
    expect(rejected).toHaveBeenCalledTimes(completionOutboxFlushLimit);
    await h.box.flush("owner", { acknowledge: rejected });
    expect(rejected).toHaveBeenCalledTimes(completionOutboxFlushLimit + 2);
    expect(await h.box.pending("owner")).toHaveLength(completionOutboxFlushLimit + 2);
  });

  it("serializes concurrent enqueue without replacing an unacknowledged result", async () => {
    const h = harness();
    await Promise.all([h.box.enqueue("owner", "command-1", event),
      h.box.enqueue("owner", "command-2", { ...event, commandId: "command-2" })]);
    await h.box.enqueue("owner", "command-1", event);
    await expect(h.box.enqueue("owner", "command-1", { ...event, status: "failed" })).rejects.toThrow("原始投递结果");
    expect(await h.box.pending("owner")).toHaveLength(2);
    expect((await h.box.pending("owner"))[0]!.event).toEqual(event);
  });

  it("never uploads another account's receipt", async () => {
    const h = harness();
    await h.box.enqueue("owner-a", "command-1", event);
    await h.box.enqueue("owner-b", "command-2", { ...event, commandId: "command-2" });
    const acknowledge = vi.fn(async () => undefined);
    await h.box.flush("owner-b", { acknowledge });
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ commandId: "command-2", owner: "owner-b" }));
    expect(await h.box.pending("owner-a")).toHaveLength(1);
  });

  it("does not resurrect or clean an old account after logout during acknowledgement", async () => {
    const h = harness();
    await h.box.enqueue("owner", "command-1", event);
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    let active = true;
    const removed = vi.fn(async () => undefined);
    const result = h.box.flush("owner", { active: () => active, acknowledge: () => gate, removed });
    await vi.waitFor(() => expect(h.storage.get).toHaveBeenCalled());
    active = false;
    await h.box.clear();
    finish();
    await result;
    expect(await h.box.pending("owner")).toEqual([]);
    expect(removed).not.toHaveBeenCalled();
  });

  it("does not erase a concurrently added event after another command is acknowledged", async () => {
    const h = harness();
    await h.box.enqueue("owner", "command-1", event);
    await h.box.flush("owner", { acknowledge: async () => {
      await h.box.enqueue("owner", "command-2", { ...event, commandId: "command-2" });
    } });
    expect(await h.box.pending("owner")).toMatchObject([{ commandId: "command-2" }]);
  });

  it("fails closed for malformed persisted entries without overwriting them", async () => {
    const h = harness({ [key]: { schemaVersion: "auto-apply-completion-outbox.v2", entries: [{ commandId: "orphan" }] } });
    await expect(h.box.pending("owner")).rejects.toThrow("投递回执身份异常");
    expect(h.storage.set).not.toHaveBeenCalled();
  });
});
