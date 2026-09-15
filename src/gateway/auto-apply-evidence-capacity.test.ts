import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AutoApplyEvidenceStore } from "./auto-apply-evidence.js";
it("bounds actual pending file writes and recovers capacity after completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-evidence-capacity-"));
  try {
    const store = new AutoApplyEvidenceStore(directory);
    const data = "data:image/png;base64,AQID";
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => store.saveRedactedScreenshot(data)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(4);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "GATEWAY_BUSY", status: 503, retryable: true } });
    expect((await store.saveRedactedScreenshot(data)).size).toBe(3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
