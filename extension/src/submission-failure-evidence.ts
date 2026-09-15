import type {FinalSubmitExecutionResult} from "./page-adapter.js";

/** Preserve executor evidence without interpreting a pointer dispatch as
 * application acceptance or authorizing another click. */
export function submissionFailureEvidence(result: FinalSubmitExecutionResult | null | undefined): Record<string, unknown> {
  const trace = [...(result?.trace ?? [])];
  const confirmationDispatched = trace.some(step => step.startsWith("cdp_confirmation_activated:pointer:"));
  const previewUnconfirmed = Boolean(result?.executed) && !confirmationDispatched &&
    trace.some(step => step.startsWith("cdp_preview_activated:pointer:")) &&
    trace.some(step => /^preview_activation_not_observed:(?:same_url|url_changed):attempts_\d+$/u.test(step));
  const phase = !result?.executed ? "not_executed" : previewUnconfirmed ? "preview_unconfirmed" : "submission_unconfirmed";
  const message = result?.error?.trim() || (result?.executed
    ? `提交操作的结果尚未确认：${result.observedResult}` : "提交按钮未执行");
  return {schemaVersion:"submission-failure-evidence.v1",submissionPhase:phase,
    observedResult:result?.observedResult ?? null,submitExecuted:result?.executed === true,
    message,failures:[message],submitTrace:trace};
}

export function unconfirmedPreviewDiagnostic(details: Record<string, unknown> | undefined): {
  stage: "submit"; userMessage: string; developerMessage: string;
} | null {
  if (details?.schemaVersion !== "submission-failure-evidence.v1" ||
    details.submissionPhase !== "preview_unconfirmed" || details.submitExecuted !== true) return null;
  return {
    stage: "submit",
    userMessage: "已点击预览，但未确认进入最终提交步骤；招聘网站是否受理仍待核实。",
    developerMessage: "执行器只确认预览指针已发送，未确认最终确认或成功回执。具体原因和轨迹见 failureDetails；保留提交检查点，禁止自动重复投递。"
  };
}
