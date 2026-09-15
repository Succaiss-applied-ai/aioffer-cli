import { describe, expect, it } from "vitest";
import {
  attachVisionDiagnosticsToFailure,
  appendVisionDiagnosticRing,
  redactVisionDiagnosticText,
  summarizeVisionDiagnosticValue,
  type VisionIterationDiagnostic
} from "./vision-diagnostics.js";

function diagnostic(iteration: number): VisionIterationDiagnostic {
  return {
    schemaVersion: "auto-apply-vision-diagnostic.v1",
    at: "2026-08-21T00:00:00.000Z",
    batchId: "batch-1",
    batchJobId: "job-1",
    commandId: "command-1",
    iteration,
    phase: "observe",
    requiredBlockers: [],
    criticalFailures: [],
    next: null,
    source: null,
    actionType: null,
    fieldId: null,
    stableFieldKey: null,
    label: null,
    expected: null,
    actual: null,
    success: null,
    error: null
  };
}

describe("vision diagnostics", () => {
  it("summarizes sensitive values without retaining their contents", () => {
    const summary = summarizeVisionDiagnosticValue("candidate@example.com");
    expect(summary).toEqual({ present: true, kind: "email", length: 21 });
    expect(JSON.stringify(summary)).not.toContain("candidate@example.com");
  });

  it("redacts email and phone values in error text", () => {
    const redacted = redactVisionDiagnosticText("回读 candidate@example.com 和 13988523745 失败");
    expect(redacted).toBe("回读 [REDACTED_EMAIL] 和 [REDACTED_PHONE] 失败");
  });

  it("retains only the newest ring entries", () => {
    const result = [1, 2, 3, 4].reduce<unknown>(
      (queue, iteration) => appendVisionDiagnosticRing(queue, diagnostic(iteration), 3),
      []
    );
    expect((result as VisionIterationDiagnostic[]).map((entry) => entry.iteration)).toEqual([2, 3, 4]);
  });

  it("always attaches the in-memory diagnostics to a failure payload", () => {
    const details = attachVisionDiagnosticsToFailure(
      { failures: ["视觉逐步填写未收敛"] },
      [],
      [diagnostic(1), diagnostic(2)]
    );
    expect(details).toMatchObject({
      failures: ["视觉逐步填写未收敛"],
      visionDiagnostics: [
        expect.objectContaining({ iteration: 1 }),
        expect.objectContaining({ iteration: 2 })
      ]
    });
  });
});
