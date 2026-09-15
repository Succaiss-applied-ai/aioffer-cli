import { describe, expect, it } from "vitest";
import { autoApplyJobResultSchema } from "./auto-apply-contract.js";
import { requiredFieldInputKind, requiredFieldInputKinds } from "../required-field-input.js";

function result(inputKind?: string) {
  return {
    schemaVersion: "auto-apply-job-result.v1",
    batchId: "11111111-1111-4111-8111-111111111111",
    batchJobId: "22222222-2222-4222-8222-222222222222",
    jobId: "control-contract", status: "waiting_for_user_action",
    occurredAt: "2026-09-08T00:00:00.000Z", reasonCode: "missing_information",
    evidence: { redacted: true, requiredFieldRequests: [{
      schemaVersion: "required-field-request.v1", fieldId: "field-2",
      stableFieldKey: "education[1].major.combobox", label: "专业名称", type: "combobox",
      controlKind: "combobox", required: true, reasonCode: "candidate_information_missing",
      sectionKey: "education", groupIndex: 1, description: "请补充此字段", question: "请填写此字段",
      options: [], ...(inputKind === undefined ? {} : { inputKind })
    }] }
  };
}

describe("supplemental input type transport", () => {
  it.each(requiredFieldInputKinds)("preserves explicit %s and exact field identity", (inputKind) => {
    const payload = result(inputKind);
    const parsed = autoApplyJobResultSchema.parse(payload);
    expect(parsed.evidence?.requiredFieldRequests?.[0]).toEqual(payload.evidence.requiredFieldRequests[0]);
  });

  it("accepts legacy requests without guessing an input type", () => {
    expect(autoApplyJobResultSchema.parse(result()).evidence?.requiredFieldRequests?.[0])
      .not.toHaveProperty("inputKind");
  });

  it("retains an observed location control marker without imposing district precision", () => {
    const payload=result("search");
    Object.assign(payload.evidence.requiredFieldRequests[0]!,{type:"search",controlKind:"native",controlType:"feishu_location_tree.v1",label:"家乡"});
    const request=autoApplyJobResultSchema.parse(payload).evidence!.requiredFieldRequests![0]!;
    expect(request).toEqual(payload.evidence.requiredFieldRequests[0]);
    expect(request).not.toHaveProperty("regionLevel");
  });

  it.each(["", "combobox", "future_control"])("rejects unrecognized explicit type %j", (inputKind) => {
    expect(() => autoApplyJobResultSchema.parse(result(inputKind))).toThrow();
  });

  it("keeps search, native datetime precision, option-only controls and regions distinct", () => {
    expect(requiredFieldInputKind({type: "search", options: []})).toBe("search");
    expect(requiredFieldInputKind({type: "datetime-local", controlKind: "date"})).toBe("datetime-local");
    expect(requiredFieldInputKind({type: "combobox", options: []})).toBeNull();
    expect(requiredFieldInputKind({type: "text", controlKind: "native"})).toBe("text");
    expect(requiredFieldInputKind({type: "multi_select", options: ["A", "B"]})).toBe("multi_select");
    expect(requiredFieldInputKind({type: "multi_select", options: ["A", "A"]})).toBeNull();
    expect(requiredFieldInputKind({type: "text", regionLevel: "city"})).toBe("region");
  });
});
