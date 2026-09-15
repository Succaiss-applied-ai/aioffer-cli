import { RecruitingError } from "../../src/errors.js";
import type { PageFieldObservation } from "./page-adapter.js";
import type { AutoApplyUploadRejection } from "../../src/gateway/auto-apply-contract.js";

export function siteRejectedUploadEvidence(rejected: PageFieldObservation[]): AutoApplyUploadRejection | null {
  const uploads = rejected.filter(field => field.type === "file" && field.validationMessage);
  if (!uploads.length) return null;
  return {
    uploadFields: uploads.map(field => ({ stableFieldKey: field.stableFieldKey ?? null,
      label: field.label, type: "file", validationMessage: field.validationMessage! })),
    failures: rejected.map(field => `${field.label}：${field.validationMessage ?? "招聘网站未接受该字段"}`)
  };
}

/** Only call with the exact, freshly confirmed submit-rejection set. A file
 * cannot be repaired with a textual candidate answer or an automatic reupload. */
export function siteRejectedUploadError(
  rejected: PageFieldObservation[], submitTrace: string[] = []
): RecruitingError | null {
  const evidence = siteRejectedUploadEvidence(rejected);
  if (!evidence) return null;
  const labels = evidence.uploadFields.map(field => field.label);
  const message = `招聘网站未接受文件上传（${labels.join("、").slice(0, 400)}），请在原招聘页面检查上传结果。`;
  return new RecruitingError({
    code: "SITE_VALIDATION_BLOCKED", stage: "submission", retryable: false,
    message,
    userAction: "请检查原招聘页面的上传提示；插件已停止自动操作并保留页面。",
    details: {
      failureCode: "site_upload_rejected", message, fields: labels,
      uploadFields: evidence.uploadFields,
      rejectedFields: rejected.map(field => field.label),
      failures: evidence.failures,
      submitTrace
    }
  });
}
