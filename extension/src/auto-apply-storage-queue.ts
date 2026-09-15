/** Serialize read/modify/write operations for one chrome.storage map. Different
 * jobs can persist receipt monitors while the next job is actively filling. */
export function createAutoApplyStorageQueue() {
  const pending = new Map<string, Promise<unknown>>();
  return function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const next = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    pending.set(key, next);
    void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => undefined);
    return next;
  };
}
