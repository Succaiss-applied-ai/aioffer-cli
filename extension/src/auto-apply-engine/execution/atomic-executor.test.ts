import { describe, expect, it, vi } from "vitest";
import type { PageObservation } from "../../page-adapter.js";
import { buildLayeredObservationSnapshot } from "../observation/snapshot.js";
import {
  defaultAtomicReadbackMatches,
  executeAtomicFieldAction,
  rebindRegisteredField
} from "./atomic-executor.js";

function page(
  fieldId: string,
  value: string,
  revision: number,
  identity: { stableFieldKey?: string; label?: string } = {}
) {
  const observation: PageObservation = {
    url: "https://example.com/apply", title: "Apply", loginRequired: false, loginReason: null,
    formDetected: true, fingerprint: `fp-${revision}`,
    fields: [{
      fieldId, stableFieldKey: identity.stableFieldKey ?? "basic.email.native#1", selector: `#${fieldId}`,
      label: identity.label ?? "个人邮箱", sectionKey: "basic", groupIndex: null, controlKind: "native",
      type: "email", required: true, requiredSource: "explicit", options: [], currentValue: value
    }],
    actions: [], submitCandidates: [], validationMessages: [], transientBusy: false,
    observedAt: `2026-08-23T00:00:0${revision}.000Z`
  };
  return buildLayeredObservationSnapshot({ observation, revision, accessHint: "public" });
}

describe("atomic field executor", () => {
  it("re-observes and rebinds after a dynamic DOM rebuild", async () => {
    const snapshots = [page("field-7", "", 1), page("field-42", "candidate@example.com", 2)];
    const observe = vi.fn(async () => snapshots.shift()!);
    const perform = vi.fn(async () => ({ success: true }));
    const waitForStable = vi.fn(async () => undefined);
    const result = await executeAtomicFieldAction({
      action: { type: "fill_field", registryKey: "basic.email.native#1", value: "candidate@example.com" },
      dependencies: { observe, perform, waitForStable, readbackMatches: defaultAtomicReadbackMatches }
    });
    expect(result).toMatchObject({ status: "succeeded", rebound: true, readbackMatched: true });
    expect(observe).toHaveBeenCalledTimes(2);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(waitForStable).toHaveBeenCalledTimes(1);
  });

  it("never falls back to a transient field id after the target disappears", () => {
    const before = page("field-7", "", 1).fields[0]!;
    const wrong = page("field-7", "candidate@example.com", 2, {
      stableFieldKey: "basic.full_name.native", label: "姓名"
    });
    expect(rebindRegisteredField(before, wrong)).toBeNull();
  });
});
