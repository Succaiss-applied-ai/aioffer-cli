import type { AutoApplyJobResult } from "./auto-apply-contract.js";
import { supplementalInputError } from "../supplemental-input-error.js";

/** Keep malformed supplemental requirements out of the user-action queue. */
export function normalizeSupplementalResult(result: AutoApplyJobResult): AutoApplyJobResult {
  if (result.status !== "waiting_for_user_action" || result.reasonCode !== "missing_information") return result;
  const requests = result.evidence?.requiredFieldRequests;
  if (!requests?.length) return result;
  const issues = requests.flatMap(request => {
    const issue = supplementalInputError(request);
    return issue ? [issue] : [];
  });
  if (!issues.length) return result;
  const first = issues[0]!;
  return { ...result, status: "failed", reasonCode: first.code, evidence: {
    ...result.evidence!, requiredFieldRequests: undefined, userActionRequired: undefined,
    failureDetails: { ...result.evidence?.failureDetails, supplementalInputErrors: issues,
      pendingInformationRequests: requests },
    diagnostic: { code: first.code, category: "unsupported", stage: "form_observation",
      userMessage: first.userMessage.slice(0, 500), developerMessage: "补充要求无法呈现为可填写控件；原字段绑定保留在诊断中。",
      retryable: false, recommendedAction: "inspect_evidence" }
  } };
}
