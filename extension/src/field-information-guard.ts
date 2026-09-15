import { RecruitingError } from "../../src/errors.js";
import type { FillResult, PageFieldObservation } from "./page-adapter.js";
import { assessFieldInformation } from "./field-information.js";
import { candidateInformationRequestForField } from "./vision-form-runtime.js";

/** Final no-action gate, also used for stale/legacy instructions after live rebind. */
export function guardFieldInformation(field: PageFieldObservation, value: unknown): FillResult | null {
  const assessment = assessFieldInformation(field, value);
  if (assessment.status !== "insufficient") return null;
  if (assessFieldInformation(field, field.currentValue).status === "sufficient") {
    return { fieldId: field.fieldId, success: true, expected: String(value ?? ""), actual: field.currentValue, error: null };
  }
  const request = candidateInformationRequestForField(field);
  if (request) throw new RecruitingError({
    code: "MISSING_INFORMATION",
    stage: "missing_information",
    message: `“${request.label}”的信息精度不足，请补充${assessment.missingParts.join("、")}`,
    retryable: false,
    userAction: "请补充所需日期或地区层级后继续投递。",
    details: {
      fields: [request.label],
      informationRequests: [request],
      requiredFieldRequests: [request]
    }
  });
  return {
    fieldId: field.fieldId,
    success: false,
    expected: String(value ?? ""),
    actual: field.currentValue,
    error: "optional_field_information_incomplete: 非必填字段信息精度不足，已跳过，未操作控件"
  };
}
