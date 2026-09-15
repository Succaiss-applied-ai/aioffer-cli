import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  autoApplyExecutionDeadlineMs,
  MemoryDeviceCommandQueue
} from "./device-command-queue.js";
import type {
  DeviceCommandEnqueueInput,
  DeviceCommandQueue
} from "./device-command-queue.js";
import { JsonDeviceCommandQueue } from "./json-storage.js";
import type { LegacyPluginCommand, LegacyPluginEvent } from "./legacy-plugin-adapter.js";

function command(commandId: string): LegacyPluginCommand {
  return {
    schemaVersion: "ai-plugin-command.v1",
    commandId,
    conversationId: "conversation-1",
    tenantId: "tenant-1",
    userId: "user-1",
    issuedAt: "2026-08-26T00:00:00.000Z",
    expiresAt: "2026-08-26T00:02:00.000Z",
    type: "browser.start_application_rpa",
    idempotencyKey: commandId,
    requiresUserGesture: false,
    payload: {},
    safety: {
      allowFinalSubmit: false,
      allowConsentClick: false,
      allowCaptchaHandling: false
    }
  };
}

function enqueueInput(commandId: string): DeviceCommandEnqueueInput {
  return {
    commandId,
    runId: `run-${commandId}`,
    tenantId: "tenant-1",
    userId: "user-1",
    targetDeviceId: "device-a",
    command: command(commandId)
  };
}

describe("durable command receipts", () => {
  it.each(["memory", "json"])("never reclaims a stopped command after its lease expires (%s)", async (storage) => {
    const directory = await mkdtemp(join(tmpdir(), "stop-lease-fence-"));
    const file = join(directory, "commands.json");
    let timestamp = new Date("2026-08-26T00:00:00.000Z");
    let queue: DeviceCommandQueue = storage === "json" ? new JsonDeviceCommandQueue(file, () => timestamp) : new MemoryDeviceCommandQueue(() => timestamp);
    const owner = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" };
    try {
      await queue.enqueue(enqueueInput("stopped"));
      await queue.enqueue(enqueueInput("neighbour"));
      expect((await queue.claim(owner))?.commandId).toBe("stopped");
      expect(await queue.cancelQueued("stopped", owner.tenantId, owner.userId, owner.deviceId)).toBe(false);
      timestamp = new Date(timestamp.getTime() + 46_000);
      if (storage === "json") queue = new JsonDeviceCommandQueue(file, () => timestamp);
      expect((await queue.claim(owner))?.commandId).toBe("neighbour");
      expect((await queue.get("stopped"))?.status).toBe("claimed");
      expect((await queue.get("stopped"))?.stopRequestedAt).toEqual(expect.any(String));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(["memory", "json"])("atomically distinguishes unclaimed and acknowledged stops (%s)", async (storage) => {
    const directory = await mkdtemp(join(tmpdir(), "single-job-stop-"));
    const file = join(directory, "commands.json");
    const now = () => new Date("2026-08-26T00:00:00.000Z");
    const queue = storage === "json" ? new JsonDeviceCommandQueue(file, now) : new MemoryDeviceCommandQueue(now);
    const owner = { tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" };
    try {
      await queue.enqueue(enqueueInput("one"));
      await queue.enqueue(enqueueInput("two"));
      const [claim, cancelled] = await Promise.all([queue.claim(owner), queue.cancelQueued("one", owner.tenantId, owner.userId, owner.deviceId)]);
      expect(claim?.commandId).toBe("one");
      expect(cancelled).toBe(false);
      await expect(queue.acknowledgeStopped("one", "tenant-1", "other", "device-a")).rejects.toThrow();
      await queue.acknowledgeStopped("one", owner.tenantId, owner.userId, owner.deviceId);
      expect((await queue.get("one"))?.status).toBe("cancelled");
      expect((await queue.get("two"))?.status).toBe("queued");
      if (storage === "json") expect((await new JsonDeviceCommandQueue(file, now).get("one"))?.status).toBe("cancelled");
      expect((await queue.claim(owner))?.commandId).toBe("two");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(["memory", "json"])("archives late %s receipts without reviving an expired command", async (storage) => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-late-receipts-"));
    const file = join(directory, "commands.json");
    let timestamp = new Date("2026-08-26T00:00:00.000Z");
    let queue: DeviceCommandQueue = storage === "json"
      ? new JsonDeviceCommandQueue(file, () => timestamp) : new MemoryDeviceCommandQueue(() => timestamp);
    try {
      const input = enqueueInput("late-command");
      input.command.type = "browser.execute_batch_auto_apply_job";
      await queue.enqueue(input);
      const event: LegacyPluginEvent = {
        schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
        payload: { autoApplyResult: { status: "succeeded", evidence: { sha256: "b".repeat(64), screenshotRef: "evidence:first" } } }
      };
      await expect(queue.archiveExpiredCompletion(input.commandId, "device-a", event)).rejects.toThrow();
      await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" });
      await expect(queue.archiveExpiredCompletion(input.commandId, "device-a", event)).rejects.toThrow();
      timestamp = new Date(timestamp.getTime() + autoApplyExecutionDeadlineMs);
      await expect(queue.complete(input.commandId, "device-a", event)).rejects.toMatchObject({ status: 410 });
      const expired = (await queue.get(input.commandId))!;
      await expect(queue.archiveExpiredCompletion(input.commandId, "device-b", event)).rejects.toThrow();
      const archived = await queue.archiveExpiredCompletion(input.commandId, "device-a", event);
      expect(archived).toEqual({ ...expired, archivedCompletionAt: timestamp.toISOString(), archivedCompletionEvent: event });
      expect(archived.completionEvent).toBeUndefined();
      timestamp = new Date("2026-08-27T00:00:00.000Z");
      if (storage === "json") queue = new JsonDeviceCommandQueue(file, () => timestamp);
      const retry = structuredClone(event);
      (retry.payload!.autoApplyResult as { evidence: { screenshotRef: string } }).evidence.screenshotRef = "evidence:retry";
      await expect(queue.archiveExpiredCompletion(input.commandId, "device-a", retry)).resolves.toEqual(archived);
      await expect(queue.archiveExpiredCompletion(input.commandId, "device-a", { ...event, status: "failed" }))
        .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(queue.renew(input.commandId, "device-a")).rejects.toThrow();
      expect(await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" })).toBeNull();
      expect(await queue.get(input.commandId)).toEqual(archived);
      const unclaimed = enqueueInput("unclaimed-expired");
      unclaimed.command.type = "browser.execute_batch_auto_apply_job";
      await queue.enqueue(unclaimed);
      await queue.expire(unclaimed.commandId);
      await expect(queue.archiveExpiredCompletion(unclaimed.commandId, "device-a", event)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(["memory", "json"])("replays identical %s receipts, including after reload and deadline", async (storage) => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-receipts-"));
    const file = join(directory, "commands.json");
    let timestamp = new Date("2026-08-26T00:00:00.000Z");
    let queue: DeviceCommandQueue = storage === "json"
      ? new JsonDeviceCommandQueue(file, () => timestamp) : new MemoryDeviceCommandQueue(() => timestamp);
    try {
      await queue.enqueue(enqueueInput("receipt-command"));
      await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" });
      const event: LegacyPluginEvent = {
        schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "completed",
        payload: { autoApplyResult: { status: "succeeded", evidence: { sha256: "a".repeat(64), screenshotRef: "evidence:first" } } }
      };
      const first = await queue.complete("receipt-command", "device-a", event);
      timestamp = new Date("2026-08-27T00:00:00.000Z");
      if (storage === "json") queue = new JsonDeviceCommandQueue(file, () => timestamp);
      await expect(queue.complete("receipt-command", "device-a", structuredClone(event))).resolves.toEqual(first);
      const retry = structuredClone(event);
      (retry.payload!.autoApplyResult as { evidence: { screenshotRef: string } }).evidence.screenshotRef = "evidence:retry";
      await expect(queue.complete("receipt-command", "device-a", retry)).resolves.toEqual(first);
      await expect(queue.complete("receipt-command", "device-b", event)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(queue.complete("receipt-command", "device-a", { ...event, status: "failed" }))
        .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      expect(await queue.get("receipt-command")).toEqual(first);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function expectDuplicateContentConflicts(queue: DeviceCommandQueue): Promise<void> {
  const identical = enqueueInput("command-identical");
  const first = await queue.enqueue(identical);
  await expect(queue.enqueue(structuredClone(identical))).resolves.toEqual(first);

  const mutations: Array<[
    string,
    (input: DeviceCommandEnqueueInput) => DeviceCommandEnqueueInput
  ]> = [
    ["run", (input) => ({ ...input, runId: `${input.runId}-different` })],
    ["tenant", (input) => ({ ...input, tenantId: "tenant-2" })],
    ["user", (input) => ({ ...input, userId: "user-2" })],
    ["target", (input) => ({ ...input, targetDeviceId: "device-b" })],
    ["command", (input) => ({
      ...input,
      command: { ...input.command, conversationId: "conversation-2" }
    })],
    ["payload", (input) => ({
      ...input,
      command: { ...input.command, payload: { jobId: "job-2" } }
    })]
  ];

  for (const [name, mutate] of mutations) {
    const original = enqueueInput(`command-conflict-${name}`);
    await queue.enqueue(original);
    await expect(queue.enqueue(mutate(original))).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409
    });
  }
}

async function expectExpiredCommandsSkipped(queue: DeviceCommandQueue): Promise<void> {
  const expired = enqueueInput("command-expired");
  const fresh = enqueueInput("command-fresh");
  fresh.command = { ...fresh.command, expiresAt: "2026-08-26T00:03:00.000Z" };
  await queue.enqueue(expired);
  await queue.enqueue(fresh);

  await expect(queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" }))
    .resolves.toMatchObject({ commandId: "command-fresh" });
  await expect(queue.get("command-expired")).resolves.toMatchObject({
    status: "expired",
    completedAt: "2026-08-26T00:02:00.000Z"
  });
}

async function expectOwnerCommandsCancelled(queue: DeviceCommandQueue): Promise<void> {
  await queue.enqueue(enqueueInput("command-owner-queued"));
  await queue.enqueue(enqueueInput("command-owner-claimed"));
  await queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" });
  const other = enqueueInput("command-other-owner");
  other.userId = "user-2";
  other.command = { ...other.command, userId: "user-2" };
  await queue.enqueue(other);

  await expect(queue.cancelOwner("tenant-1", "user-1")).resolves.toBe(2);
  await expect(queue.get("command-owner-queued")).resolves.toMatchObject({ status: "cancelled" });
  await expect(queue.get("command-owner-claimed")).resolves.toMatchObject({
    status: "cancelled",
    leaseExpiresAt: null
  });
  await expect(queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" }))
    .resolves.toBeNull();
  await expect(queue.claim({ tenantId: "tenant-1", userId: "user-2", deviceId: "device-a" }))
    .resolves.toMatchObject({ commandId: "command-other-owner" });
}

async function expectAutoApplyExecutionDeadline(
  queue: DeviceCommandQueue,
  setNow: (value: string) => void
): Promise<void> {
  const input = enqueueInput("command-auto-apply-deadline");
  input.command = {
    ...input.command,
    type: "browser.execute_batch_auto_apply_job",
    expiresAt: "2026-08-26T00:05:00.000Z"
  };
  await queue.enqueue(input);
  const claimed = await queue.claim({
    tenantId: "tenant-1",
    userId: "user-1",
    deviceId: "device-a",
    leaseSeconds: 90
  });
  expect(claimed).toMatchObject({
    status: "claimed",
    executionExpiresAt: "2026-08-26T00:30:00.000Z",
    leaseExpiresAt: "2026-08-26T00:01:30.000Z"
  });
  expect(Date.parse(claimed!.executionExpiresAt!) - Date.parse(claimed!.claimedAt!))
    .toBe(autoApplyExecutionDeadlineMs);

  setNow("2026-08-26T00:06:00.000Z");
  await expect(queue.renew(claimed!.commandId, "device-a", 90)).resolves.toMatchObject({
    status: "claimed",
    leaseExpiresAt: "2026-08-26T00:07:30.000Z"
  });

  setNow("2026-08-26T00:30:00.000Z");
  await expect(queue.renew(claimed!.commandId, "device-a", 90)).rejects.toMatchObject({
    code: "DEVICE_COMMAND_EXPIRED",
    status: 410
  });
  await expect(queue.get(claimed!.commandId)).resolves.toMatchObject({
    status: "expired",
    leaseExpiresAt: null
  });
}

describe("device command targeting", () => {
  it("requires a target and only lets that exact device claim", async () => {
    const queue = new MemoryDeviceCommandQueue(() => new Date("2026-08-26T00:00:00.000Z"));
    const base = {
      commandId: "command-1",
      runId: "run-1",
      tenantId: "tenant-1",
      userId: "user-1",
      command: command("command-1")
    };

    await expect(queue.enqueue({ ...base, targetDeviceId: "" }))
      .rejects.toMatchObject({ code: "DEVICE_ID_REQUIRED" });
    await queue.enqueue({ ...base, targetDeviceId: "device-a" });
    await expect(queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-b" }))
      .resolves.toBeNull();
    await expect(queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" }))
      .resolves.toMatchObject({ targetDeviceId: "device-a", claimedBy: "device-a" });
  });

  it("never lets a device claim a historical null-target JSON command", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-device-queue-"));
    const file = join(directory, "device-commands.json");
    try {
      await writeFile(file, JSON.stringify({
        schemaVersion: "device-command-store.v1",
        commands: [{
          commandId: "legacy-null-command",
          runId: "legacy-run",
          tenantId: "tenant-1",
          userId: "user-1",
          targetDeviceId: null,
          command: command("legacy-null-command"),
          status: "queued",
          createdAt: "2026-08-26T00:00:00.000Z",
          claimedBy: null,
          claimedAt: null,
          leaseExpiresAt: null,
          completedAt: null
        }]
      }));
      const queue = new JsonDeviceCommandQueue(file, () => new Date("2026-08-26T00:00:01.000Z"));

      await expect(queue.claim({ tenantId: "tenant-1", userId: "user-1", deviceId: "device-a" }))
        .resolves.toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a reused in-memory commandId when any enqueue content changes", async () => {
    const queue = new MemoryDeviceCommandQueue(() => new Date("2026-08-26T00:00:00.000Z"));
    await expectDuplicateContentConflicts(queue);
  });

  it("rejects a reused JSON commandId when any enqueue content changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-device-queue-conflict-"));
    const file = join(directory, "device-commands.json");
    try {
      const queue = new JsonDeviceCommandQueue(file, () => new Date("2026-08-26T00:00:00.000Z"));
      await expectDuplicateContentConflicts(queue);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("skips an expired in-memory command instead of reclaiming it", async () => {
    await expectExpiredCommandsSkipped(
      new MemoryDeviceCommandQueue(() => new Date("2026-08-26T00:02:00.000Z"))
    );
  });

  it("skips an expired JSON command instead of reclaiming it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-device-queue-expired-"));
    const file = join(directory, "device-commands.json");
    try {
      await expectExpiredCommandsSkipped(
        new JsonDeviceCommandQueue(file, () => new Date("2026-08-26T00:02:00.000Z"))
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("cancels queued and claimed in-memory commands only for the logging-out owner", async () => {
    await expectOwnerCommandsCancelled(
      new MemoryDeviceCommandQueue(() => new Date("2026-08-26T00:00:01.000Z"))
    );
  });

  it("cancels queued and claimed JSON commands only for the logging-out owner", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-device-queue-owner-cancel-"));
    const file = join(directory, "device-commands.json");
    try {
      await expectOwnerCommandsCancelled(
        new JsonDeviceCommandQueue(file, () => new Date("2026-08-26T00:00:01.000Z"))
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("enforces a separate execution deadline for claimed in-memory auto-apply commands", async () => {
    let currentTime = new Date("2026-08-26T00:00:00.000Z");
    await expectAutoApplyExecutionDeadline(
      new MemoryDeviceCommandQueue(() => currentTime),
      (value) => { currentTime = new Date(value); }
    );
  });

  it("enforces a separate execution deadline for claimed JSON auto-apply commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recruiting-device-queue-execution-deadline-"));
    const file = join(directory, "device-commands.json");
    let currentTime = new Date("2026-08-26T00:00:00.000Z");
    try {
      await expectAutoApplyExecutionDeadline(
        new JsonDeviceCommandQueue(file, () => currentTime),
        (value) => { currentTime = new Date(value); }
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
