import { describe, expect, it } from "vitest";
import type { PageObservation } from "../../page-adapter.js";
import { buildLayeredObservationSnapshot } from "../observation/snapshot.js";
import { buildVisionRepairRequest, validateVisionRepairResponse } from "./vision-repair.js";

function snapshot() {
  const observation: PageObservation = {
    url: "https://app.mokahr.com/example/apply?secret=hidden",
    title: "职位申请",
    loginRequired: false,
    loginReason: null,
    formDetected: true,
    fingerprint: "fp-1",
    fields: [
      {
        fieldId: "field-1", stableFieldKey: "basic.email.native#0", selector: "#email",
        label: "邮箱", sectionKey: "basic", groupIndex: null, controlKind: "native", type: "email",
        required: true, requiredSource: "explicit", options: [], currentValue: ""
      },
      {
        fieldId: "field-2", stableFieldKey: "attachments.photo.native", selector: "#photo",
        label: "上传照片", sectionKey: "attachments", groupIndex: null, controlKind: "native", type: "file",
        required: false, requiredSource: "none", options: [], currentValue: ""
      }
    ],
    actions: [{
      actionId: "submit", selector: "button", text: "提交", kind: "final_submit",
      risk: "user_only", disabled: false, context: ""
    }],
    submitCandidates: ["提交"],
    validationMessages: [],
    transientBusy: false,
    observedAt: "2026-08-23T00:00:00.000Z"
  };
  return buildLayeredObservationSnapshot({ observation, revision: 3, accessHint: "public" });
}

describe("vision repair request", () => {
  it("exposes only unresolved required non-file fields and strips URL paths", () => {
    const request = buildVisionRepairRequest({
      snapshot: snapshot(),
      unresolvedRequiredRegistryKeys: ["basic.email.native#0"],
      candidateFacts: { "candidate.basic.email": "candidate@example.com" }
    });
    expect(request.page.origin).toBe("https://app.mokahr.com");
    expect(request.unresolvedRequiredFields.map((field) => field.registryKey)).toEqual(["basic.email.native#0"]);
    expect(JSON.stringify(request)).not.toContain("#photo");
    expect(JSON.stringify(request)).not.toContain("final_submit");
  });
});

describe("vision repair response validation", () => {
  it("accepts a traceable value for the exact unresolved field", () => {
    const result = validateVisionRepairResponse({
      response: { action: {
        type: "fill_field", registryKey: "basic.email.native#0",
        semanticKey: "candidate.basic.email", value: "candidate@example.com", reason: "匹配邮箱"
      } },
      snapshot: snapshot(),
      unresolvedRequiredRegistryKeys: ["basic.email.native#0"],
      candidateFacts: { "candidate.basic.email": "candidate@example.com" }
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invented values, optional files and submit-like actions", () => {
    const common = {
      snapshot: snapshot(),
      unresolvedRequiredRegistryKeys: ["basic.email.native#0"],
      candidateFacts: { "candidate.basic.email": "candidate@example.com" }
    };
    expect(validateVisionRepairResponse({
      ...common,
      response: { type: "fill_field", registryKey: "basic.email.native#0", value: "invented@example.com" }
    }).ok).toBe(false);
    expect(validateVisionRepairResponse({
      ...common,
      response: { type: "fill_field", registryKey: "attachments.photo.native", value: "photo.jpg" }
    }).ok).toBe(false);
    expect(validateVisionRepairResponse({
      ...common,
      response: { type: "final_submit", registryKey: null }
    }).ok).toBe(false);
  });

  it("rejects a traceable email value when the target is an authoritative name field", () => {
    const nameSnapshot = snapshot();
    const source = nameSnapshot.fields[0]!;
    const renamed = {
      ...nameSnapshot,
      fields: [{
        ...source,
        registryKey: "basic.full_name.native",
        stableFieldKey: "basic.full_name.native",
        label: "姓名",
        type: "text"
      }]
    };
    const result = validateVisionRepairResponse({
      response: {
        type: "fill_field", registryKey: "basic.full_name.native",
        semanticKey: "candidate.basic.email", value: "candidate@example.com"
      },
      snapshot: renamed,
      unresolvedRequiredRegistryKeys: ["basic.full_name.native"],
      candidateFacts: {
        "candidate.basic.fullName": "张明",
        "candidate.basic.email": "candidate@example.com"
      }
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.errors.join("；")).toContain("确定性身份字段");
  });
});
