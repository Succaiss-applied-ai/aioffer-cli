import { describe, expect, it } from "vitest";
import type { PageFieldObservation, PageObservation } from "../page-adapter.js";
import { buildLayeredObservationSnapshot } from "./observation/snapshot.js";
import { loginPreflightDecision } from "./planning/deterministic-planner.js";
import { buildLayeredShadowReport } from "./shadow-analysis.js";

function field(input: Partial<PageFieldObservation> = {}): PageFieldObservation {
  return {
    fieldId: "field-1",
    stableFieldKey: "basic.full_name.native",
    selector: "#name",
    label: "姓名",
    sectionKey: "basic",
    groupIndex: null,
    labelPath: ["姓名"],
    controlKind: "native",
    domHints: { placeholder: "姓名" },
    popupBinding: null,
    type: "text",
    required: true,
    requiredSource: "explicit",
    options: [],
    currentValue: "",
    ...input
  };
}

function observation(fields: PageFieldObservation[], loginRequired = false): PageObservation {
  return {
    url: loginRequired ? "https://example.com/login" : "https://example.com/apply",
    title: "Application",
    loginRequired,
    loginReason: loginRequired ? "请先登录" : null,
    formDetected: !loginRequired,
    fingerprint: "form-fingerprint",
    fields,
    actions: [],
    submitCandidates: [],
    validationMessages: [],
    transientBusy: false,
    observedAt: "2026-08-23T00:00:00.000Z"
  };
}

describe("layered observation snapshot", () => {
  it("is immutable and preserves duplicate semantic controls independently", () => {
    const snapshot = buildLayeredObservationSnapshot({
      observation: observation([
        field({ fieldId: "email-0", stableFieldKey: "basic.email.native#0", label: "邮箱" }),
        field({ fieldId: "email-1", stableFieldKey: "basic.email.native#1", label: "个人邮箱" })
      ]),
      revision: 1,
      accessHint: "public"
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.fields)).toBe(true);
    expect(snapshot.fields.map((item) => item.registryKey)).toEqual([
      "basic.email.native#0",
      "basic.email.native#1"
    ]);
  });

  it("builds a stable fallback registry key without relying on field order", () => {
    const source = field({
      fieldId: "field-99",
      stableFieldKey: undefined,
      label: "项目经历 · 项目名称",
      sectionKey: "project",
      groupIndex: 0,
      domHints: { name: "projectName" }
    });
    const first = buildLayeredObservationSnapshot({
      observation: observation([source]), revision: 1, accessHint: "unknown"
    });
    const second = buildLayeredObservationSnapshot({
      observation: observation([{ ...source, fieldId: "field-7" }]), revision: 2, accessHint: "unknown"
    });
    expect(first.fields[0]?.registryKey).toBe(second.fields[0]?.registryKey);
  });
});

describe("login preflight", () => {
  it("lets the live page override an incorrect public tag", () => {
    expect(loginPreflightDecision("public", true)).toBe("wait_for_login");
  });

  it("continues when a login-tagged job already has a valid browser session", () => {
    expect(loginPreflightDecision("login_required", false)).toBe("continue");
  });
});

describe("layered shadow analysis", () => {
  it("plans an authoritative name repair and ignores an optional blank photo blocker", () => {
    const report = buildLayeredShadowReport({
      observation: observation([
        field({ currentValue: "validation@example.com" }),
        field({
          fieldId: "photo",
          stableFieldKey: "attachments.identity_photo.native",
          label: "上传照片",
          type: "file",
          required: false,
          requiredSource: "none"
        })
      ]),
      candidateFacts: {
        "candidate.basic.fullName": "张明",
        "candidate.basic.email": "validation@example.com"
      },
      accessHint: "public"
    });

    expect(report).toMatchObject({
      loginDecision: "continue",
      deterministicActionCount: 1,
      unresolvedRequiredRegistryKeys: [],
      optionalBlankCount: 1
    });
    expect(report.deterministicActionRegistryKeys).toEqual(["basic.full_name.native"]);
    expect(JSON.stringify(report)).not.toContain("张明");
    expect(JSON.stringify(report)).not.toContain("validation@example.com");
  });
});
