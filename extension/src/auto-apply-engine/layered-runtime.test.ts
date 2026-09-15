import { describe, expect, it, vi } from "vitest";
import type { PageFieldObservation, PageObservation } from "../page-adapter.js";
import { buildLayeredObservationSnapshot } from "./observation/snapshot.js";
import { runLayeredValidateOnly, type LayeredRuntimeObservation } from "./layered-runtime.js";

function field(input: Partial<PageFieldObservation>): PageFieldObservation {
  return {
    fieldId: "field-1", stableFieldKey: "basic.full_name.native", selector: "#name", label: "姓名",
    sectionKey: "basic", groupIndex: null, controlKind: "native", type: "text", required: true,
    requiredSource: "explicit", options: [], currentValue: "", ...input
  };
}

function state(fields: PageFieldObservation[], revision: number, loginRequired = false): LayeredRuntimeObservation {
  const observation: PageObservation = {
    url: loginRequired ? "https://example.com/login" : "https://example.com/apply",
    title: "Apply", loginRequired, loginReason: loginRequired ? "请先登录" : null,
    formDetected: !loginRequired, fingerprint: `fp-${revision}`,
    fields, actions: [], submitCandidates: ["预览并提交"], validationMessages: [], transientBusy: false,
    observedAt: `2026-08-23T00:00:0${revision}.000Z`
  };
  return {
    observation,
    snapshot: buildLayeredObservationSnapshot({ observation, revision, accessHint: "public" })
  };
}

function success(registryKey: string, revision: number) {
  return {
    status: "succeeded" as const, registryKey, beforeRevision: revision,
    afterRevision: revision + 1, rebound: true, readbackMatched: true, error: null
  };
}

describe("layered validate-only runtime", () => {
  it("fills an authoritative identity field then stops before the dedicated declaration", async () => {
    const declaration = field({
      fieldId: "declaration", stableFieldKey: "declaration.authenticity.checkbox",
      label: "本人确保以上所有信息真实有效。", type: "checkbox", currentValue: ""
    });
    const states = [
      state([field({ currentValue: "" }), declaration], 1),
      state([field({ currentValue: "张明" }), declaration], 2)
    ];
    const execute = vi.fn(async (action) => success(action.registryKey, 1));
    const result = await runLayeredValidateOnly({
      candidateFacts: { "candidate.basic.fullName": "张明" }, accessHint: "public",
      dependencies: {
        observe: vi.fn(async () => states.shift()!), execute,
        requestVisionRepair: vi.fn(async () => { throw new Error("不应调用视觉模型"); })
      }
    });
    expect(result.status).toBe("ready_for_dedicated_declaration");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("张明");
  });

  it("returns a precise login wait without attempting any field action", async () => {
    const execute = vi.fn();
    const result = await runLayeredValidateOnly({
      candidateFacts: {}, accessHint: "public",
      dependencies: {
        observe: vi.fn(async () => state([], 1, true)), execute,
        requestVisionRepair: vi.fn()
      }
    });
    expect(result).toMatchObject({ status: "waiting_for_login", error: "请先登录" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses vision only for a traceable unresolved required field", async () => {
    const city = field({
      fieldId: "city", stableFieldKey: "preference.city.select", label: "意向城市",
      type: "select", options: ["深圳", "广州"]
    });
    const states = [state([city], 1), state([{ ...city, currentValue: "深圳" }], 2)];
    const requestVisionRepair = vi.fn(async () => ({ action: {
      type: "select_option", registryKey: "preference.city.select",
      semanticKey: "candidate.preferences.cities", value: "深圳", reason: "匹配候选偏好"
    } }));
    const result = await runLayeredValidateOnly({
      candidateFacts: { "candidate.preferences.cities": "深圳、广州" }, accessHint: "public",
      dependencies: {
        observe: vi.fn(async () => states.shift()!),
        execute: vi.fn(async (action) => success(action.registryKey, 1)),
        requestVisionRepair
      }
    });
    expect(result.status).toBe("ready_for_final_review");
    expect(requestVisionRepair).toHaveBeenCalledTimes(1);
  });
});
