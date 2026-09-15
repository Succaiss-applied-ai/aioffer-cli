import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";
import { createAutoApplyStorageQueue } from "./auto-apply-storage-queue.js";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.ES2023, true);
function harness(aborted = false) {
  const store: Record<string, any> = {};
  const deps = {
    chrome: { storage: { local: {
      get: vi.fn(async (defaults: Record<string, unknown>) => {
        const snapshot = structuredClone({ ...defaults, ...store });
        await Promise.resolve(); return snapshot;
      }),
      set: vi.fn(async (values: object) => { await Promise.resolve(); Object.assign(store, structuredClone(values)); })
    } }, alarms: { clear: vi.fn(async () => true) } },
    autoApplyStorageQueue: createAutoApplyStorageQueue(), AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY: "sessions",
    autoApplyTabRefsStorageKey: "refs", autoApplyLifecycleGeneration: 0, autoApplySessionTerminated: false,
    autoApplyExecutionAbort: { signal: { aborted } },
    asRecord: (value: unknown) => value && typeof value === "object" ? value : null,
    autoApplyTabRefKey: (batch: string, job: string) => `${batch}:${job}`,
    submissionReceiptAlarmName: (batch: string, job: string) => `${batch}:${job}`
  };
  const names = ["persistAutoApplyPageSession", "rememberAutoApplyTab", "forgetAutoApplyTab"];
  const selected = names.map(name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(ast)).join("\n");
  const js = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  return { store, ...new Function(...Object.keys(deps), `${js}; return {${names.join(",")}};`)(...Object.values(deps)) };
}

describe("parked job persistence is isolated from the active job", () => {
  it.each([false, true])("keeps concurrent page sessions and refs even when the active command is aborted=%s", async aborted => {
    const h = harness(aborted), updatedAt = new Date().toISOString();
    await Promise.all([1, 2, 3].map(async job => {
      expect(await h.persistAutoApplyPageSession({ sessionKey: `b:${job}`, updatedAt, submissionAttemptId: `submit-${job}` })).toBe(true);
      await h.rememberAutoApplyTab({ batchId: "b", batchJobId: String(job), tabId: job, updatedAt });
    }));
    expect(Object.keys(h.store.sessions)).toHaveLength(3);
    expect(Object.keys(h.store.refs)).toHaveLength(3);
    await Promise.all([
      h.forgetAutoApplyTab("b", "1", 1),
      h.rememberAutoApplyTab({ batchId: "b", batchJobId: "4", tabId: 4, updatedAt })
    ]);
    expect(Object.keys(h.store.refs).sort()).toEqual(["b:2", "b:3", "b:4"]);
  });

  it("does not let a failed storage operation poison later jobs", async () => {
    const queue = createAutoApplyStorageQueue();
    await expect(queue("refs", async () => { throw new Error("storage failed"); })).rejects.toThrow("storage failed");
    await expect(queue("refs", async () => "next job")).resolves.toBe("next job");
  });
});
