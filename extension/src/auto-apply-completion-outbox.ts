import { createAutoApplyStorageQueue } from "./auto-apply-storage-queue.js";

export const autoApplyCompletionOutboxStorageKey = "autoApplyCompletionOutbox";
export const autoApplyCompletionOutboxV2StorageKey = "autoApplyCompletionOutboxV2";
export const completionOutboxRetryBaseMs = 30_000;
export const completionOutboxRetryMaxMs = 5 * 60_000;
export const completionOutboxFlushLimit = 8;

export interface PendingAutoApplyCompletion<T = unknown> {
  commandId: string;
  owner: string;
  event: T;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
}

export interface CompletionOutboxFlushResult {
  blockedCommandIds: string[];
  lastError: string | null;
}

interface OutboxStorage {
  get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** A rejected receipt retains its exact event; it never becomes another ATS execution. */
export function createAutoApplyCompletionOutbox<T>(storage: OutboxStorage, now: () => number = Date.now) {
  const serialize = createAutoApplyStorageQueue();
  type Entry = PendingAutoApplyCompletion<T>;
  const key = autoApplyCompletionOutboxV2StorageKey;
  const flushing = new Map<string, Promise<CompletionOutboxFlushResult>>();

  async function load(owner: string): Promise<Entry[]> {
    const stored = await storage.get({ [key]: null, [autoApplyCompletionOutboxStorageKey]: null });
    const value = record(stored[key]);
    if (stored[key] != null && (!value || value.schemaVersion !== "auto-apply-completion-outbox.v2" || !Array.isArray(value.entries))) {
      throw new Error("投递回执存储格式异常，已停止领取新任务并保留原记录");
    }
    const entries = (value?.entries ?? []) as Entry[];
    if (entries.some(entry => !entry || typeof entry.commandId !== "string" || !entry.commandId ||
      typeof entry.owner !== "string" || !record(entry.event) ||
      !Number.isInteger(entry.attempts) || entry.attempts < 0 || !Number.isFinite(Date.parse(entry.nextAttemptAt)))) {
      throw new Error("投递回执身份异常，已停止领取新任务并保留原记录");
    }
    const legacy = record(stored[autoApplyCompletionOutboxStorageKey]);
    if (stored[autoApplyCompletionOutboxStorageKey] != null && !legacy) {
      throw new Error("旧版投递回执格式异常，已保留原记录");
    }
    if (legacy) {
      if (legacy.schemaVersion !== "auto-apply-completion-outbox.v1" ||
        typeof legacy.commandId !== "string" || !legacy.commandId || !record(legacy.event)) {
        throw new Error("旧版投递回执格式异常，已保留原记录");
      }
      const migrated = entries.find(entry => entry.commandId === legacy.commandId && entry.owner === owner);
      if (migrated && JSON.stringify(migrated.event) !== JSON.stringify(legacy.event)) {
        throw new Error("新旧回执身份冲突，已保留两份原始记录");
      }
      if (!migrated) {
        entries.push({ commandId: legacy.commandId, owner, event: legacy.event as T,
          createdAt: String(legacy.createdAt ?? new Date(now()).toISOString()),
          attempts: 0, nextAttemptAt: new Date(now()).toISOString(), lastError: null });
      }
      // Persist the new map first. A worker exit before clearing the old slot
      // safely replays migration and deduplicates the exact original event.
      await save(entries);
      await storage.set({ [autoApplyCompletionOutboxStorageKey]: null });
    }
    return entries;
  }

  async function save(entries: Entry[]) {
    await storage.set({ [key]: { schemaVersion: "auto-apply-completion-outbox.v2", entries } });
  }

  async function pending(owner: string): Promise<Entry[]> {
    return serialize(key, async () => (await load(owner)).filter(entry => entry.owner === owner));
  }

  async function enqueue(owner: string, commandId: string, event: T, active: () => boolean = () => true): Promise<void> {
    await serialize(key, async () => {
      if (!active()) return;
      const entries = await load(owner);
      if (!active()) return;
      const existing = entries.find(entry => entry.owner === owner && entry.commandId === commandId);
      if (existing) {
        if (JSON.stringify(existing.event) !== JSON.stringify(event)) {
          throw new Error("同一命令已有未确认回执，已保留原始投递结果");
        }
        return;
      }
      const timestamp = new Date(now()).toISOString();
      entries.push({ owner, commandId, event, createdAt: timestamp, attempts: 0, nextAttemptAt: timestamp, lastError: null });
      await save(entries);
    });
  }

  async function mutate(owner: string, entry: Entry, change: (entries: Entry[], index: number) => void) {
    await serialize(key, async () => {
      const entries = await load(owner);
      const index = entries.findIndex(candidate => candidate.owner === owner && candidate.commandId === entry.commandId &&
        candidate.createdAt === entry.createdAt && JSON.stringify(candidate.event) === JSON.stringify(entry.event));
      // Logout/rebinding or another ACK may already have removed this record.
      if (index < 0) return;
      change(entries, index);
      await save(entries);
    });
  }

  function flush(owner: string, input: {
    active?: () => boolean;
    acknowledge: (entry: Entry) => Promise<void>;
    removed?: (entry: Entry) => Promise<void>;
  }): Promise<CompletionOutboxFlushResult> {
    const existingFlush = flushing.get(owner);
    if (existingFlush) return existingFlush;
    const active = input.active ?? (() => true);
    const work = async () => {
      const due = (await pending(owner)).filter(entry => Date.parse(entry.nextAttemptAt) <= now())
        .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt) || a.createdAt.localeCompare(b.createdAt))
        .slice(0, completionOutboxFlushLimit);
      for (const entry of due) {
        if (!active()) break;
        try {
          await input.acknowledge(entry);
        } catch (error) {
          if (!active()) break;
          await mutate(owner, entry, (entries, index) => {
            const attempts = entry.attempts + 1;
            entries[index] = { ...entry, attempts,
              nextAttemptAt: new Date(now() + Math.min(completionOutboxRetryMaxMs,
                completionOutboxRetryBaseMs * 2 ** Math.min(attempts - 1, 10))).toISOString(),
              lastError: (error instanceof Error ? error.message : String(error)).slice(0, 240) };
          });
          continue;
        }
        if (!active()) break;
        await mutate(owner, entry, (entries, index) => { entries.splice(index, 1); });
        await input.removed?.(entry);
      }
      const remaining = await pending(owner);
      return { blockedCommandIds: remaining.map(entry => entry.commandId),
        lastError: remaining.find(entry => entry.lastError)?.lastError ?? null };
    };
    const current = work();
    flushing.set(owner, current);
    void current.finally(() => { if (flushing.get(owner) === current) flushing.delete(owner); }).catch(() => undefined);
    return current;
  }

  async function clear(): Promise<void> {
    await serialize(key, () => storage.set({ [key]: null, [autoApplyCompletionOutboxStorageKey]: null }));
  }

  return { enqueue, pending, flush, clear };
}
