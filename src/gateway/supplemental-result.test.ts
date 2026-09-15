import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { supplementalInputError, type SupplementalInputContract } from "../supplemental-input-error.js";
import { autoApplyJobResultSchema } from "./auto-apply-contract.js";
import { normalizeSupplementalResult } from "./supplemental-result.js";

const cases = JSON.parse(readFileSync(new URL("../../docs/fixtures/supplemental-input-contract.json", import.meta.url), "utf8")) as
  {case:string; request:SupplementalInputContract; code:string|null}[];
function receipt(request: SupplementalInputContract, status = "waiting_for_user_action", reasonCode = "missing_information") {
  return autoApplyJobResultSchema.parse({ schemaVersion:"auto-apply-job-result.v1",
    batchId:"11111111-1111-4111-8111-111111111111", batchJobId:"22222222-2222-4222-8222-222222222222",
    jobId:"job", status, reasonCode, occurredAt:"2026-09-09T00:00:00.000Z",
    evidence:{ redacted:true, requiredFieldRequests:[{schemaVersion:"required-field-request.v1",
      required:true, reasonCode:"candidate_information_missing", description:"招聘页面要求", question:"请补充", type:"text",
      stableFieldKey:null, sectionKey:null, groupIndex:null, controlKind:null, options:[], ...request}] } });
}
describe("unfillable requirements are execution errors", () => {
  it.each(cases)("$case", ({request,code}) => {
    expect(supplementalInputError(request)?.code ?? null).toBe(code);
    if (request.options?.some(option => !option.trim())) {
      expect(() => receipt(request)).toThrow(); // Existing wire schema rejects blank options before state mutation.
      return;
    }
    const original=receipt(request);
    const result=normalizeSupplementalResult(original);
    if (!code) { expect(result).toBe(original); return; }
    expect(result).toMatchObject({status:"failed",reasonCode:code,evidence:{diagnostic:{retryable:false,category:"unsupported"}}});
    expect(result.evidence?.requiredFieldRequests).toBeUndefined();
    expect(result.evidence?.failureDetails?.pendingInformationRequests).toEqual(original.evidence?.requiredFieldRequests);
    expect(result.evidence?.diagnostic?.userMessage).toContain(request.label);
    expect(original.status).toBe("waiting_for_user_action");
  });
  it.each([["succeeded",null],["cancelled","batch_cancelled"],["failed","control_interaction_failed"],
    ["waiting_for_user_action","captcha_required"],["waiting_for_user_action","login_required"],
    ["waiting_for_site_receipt","awaiting_site_receipt"]])("does not replace %s/%s with a field wait",(status,reason)=>{
    const original=receipt(cases[8]!.request,status!,reason!);
    expect(normalizeSupplementalResult(original)).toBe(original);
  });
  it("retains valid neighbouring requests and group bindings in diagnostics",()=>{
    const original=receipt(cases[8]!.request);
    const ready=receipt(cases[0]!.request).evidence!.requiredFieldRequests![0]!;
    original.evidence!.requiredFieldRequests!.push({...ready,fieldId:"field-3",groupIndex:2});
    const result=normalizeSupplementalResult(original);
    expect(result.evidence?.failureDetails?.pendingInformationRequests).toEqual(original.evidence?.requiredFieldRequests);
    expect(result.evidence?.requiredFieldRequests).toBeUndefined();
  });
});
