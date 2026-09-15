export const AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY = "autoApplyPageSessionsV1";

export type AutoApplyPageSessionStage =
  | "opening"
  | "observing"
  | "filling"
  | "validating"
  | "submit_ready"
  | "submit_initiated"
  | "waiting_for_user_action"
  | "reconciling"
  | "succeeded"
  | "already_applied"
  | "failed"
  | "outcome_unknown";

export type AutoApplyPageSessionDisposition = "continue" | "reconcile_only" | "terminal";
export type AutoApplyObservedPageStage = "job_detail" | "login" | "application_form" | "unknown";
export type AutoApplyPageStageSource = "deterministic" | "model";

export type AutoApplyTabResultDisposition = "default" | "keep_open" | "login_handoff";
export type AutoApplyUserActionType = "login" | "captcha" | "identity_verification";
export type AutoApplyTabOwnership = "plugin" | "user";

export function autoApplyUserActionOutcome(actionType: AutoApplyUserActionType): {
  status: "failed" | "waiting_for_user_action";
  reasonCode: "login_required" | "captcha_required" | "identity_verification_required";
  resultDisposition: AutoApplyTabResultDisposition;
  resumeSupported: boolean;
} {
  if (actionType !== "captcha") {
    return {
      status: "failed",
      reasonCode: actionType === "login" ? "login_required" : "identity_verification_required",
      resultDisposition: actionType === "login" ? "login_handoff" : "default",
      resumeSupported: false
    };
  }
  return {
    status: "waiting_for_user_action",
    reasonCode: actionType === "captcha" ? "captcha_required" : "identity_verification_required",
    resultDisposition: "keep_open",
    resumeSupported: true
  };
}

/** Login hands the page to the user without resuming; CAPTCHA keeps its live monitor. */
export function shouldCloseAutoApplyTab(input: {
  createdForExecution: boolean;
  resultDisposition: AutoApplyTabResultDisposition;
}): boolean {
  if (input.resultDisposition !== "default") return false;
  return input.createdForExecution;
}

export interface AutoApplyPageSession {
  schemaVersion: "auto-apply-page-session.v1";
  sessionKey: string;
  batchId: string;
  batchJobId: string;
  jobId: string;
  applicationUrl: string;
  adapterCode: string;
  tabId: number | null;
  /** Durable ownership survives missing-information/CAPTCHA resume. Only a
   * plugin-owned tab may be closed automatically after a terminal result. */
  tabOwnership: AutoApplyTabOwnership;
  /** Diagnostic only; task/session identity remains the authority for reuse. */
  executionSurface?: {
    mode: "background_tab";
    source: "new_background_tab" | "bound_task_tab" | "local_validation_tab";
    tabId: number;
    windowId: number;
    windowType: string;
  };
  stage: AutoApplyPageSessionStage;
  pageStage: AutoApplyObservedPageStage | null;
  pageStageSource: AutoApplyPageStageSource | null;
  pageStageObservedAt: string | null;
  pageStageObservationCount: number;
  pageStageWaitedMs: number;
  submissionAttemptId: string | null;
  submitInitiatedAt: string | null;
  /** Durable hard cap for the one automatic repair allowed after a confirmed
   * site rejection. Missing means zero for sessions created by older builds. */
  automaticSiteValidationRepairCount?: number;
  waitingFor: "login" | "captcha" | "identity_verification" | "missing_information" | null;
  /** Exact rejected fields retained across a missing-information handoff. */
  pendingRepairFieldKeys?: string[];
  terminalOutcome: "succeeded" | "already_applied" | null;
  createdAt: string;
  updatedAt: string;
}

export function autoApplyPageSessionKey(batchId: string, batchJobId: string): string {
  return `${batchId}:${batchJobId}`;
}

export function createAutoApplyPageSession(input: {
  batchId: string;
  batchJobId: string;
  jobId: string;
  applicationUrl: string;
  adapterCode: string;
  tabId?: number | null;
  tabOwnership?: AutoApplyTabOwnership;
  now?: string;
}): AutoApplyPageSession {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: "auto-apply-page-session.v1",
    sessionKey: autoApplyPageSessionKey(input.batchId, input.batchJobId),
    batchId: input.batchId,
    batchJobId: input.batchJobId,
    jobId: input.jobId,
    applicationUrl: input.applicationUrl,
    adapterCode: input.adapterCode,
    tabId: input.tabId ?? null,
    tabOwnership: input.tabOwnership ?? "user",
    stage: "opening",
    pageStage: null,
    pageStageSource: null,
    pageStageObservedAt: null,
    pageStageObservationCount: 0,
    pageStageWaitedMs: 0,
    submissionAttemptId: null,
    submitInitiatedAt: null,
    automaticSiteValidationRepairCount: 0,
    waitingFor: null,
    terminalOutcome: null,
    createdAt: now,
    updatedAt: now
  };
}

/** Old persisted sessions did not carry ownership. Infer only the original
 * plugin-created surface; every other legacy surface is user-owned for safety. */
export function autoApplyPageSessionOwnsTab(
  session: AutoApplyPageSession | null | undefined
): boolean {
  if (!session) return false;
  if (session.tabOwnership === "plugin") return true;
  if (session.tabOwnership === "user") return false;
  return session.executionSurface?.source === "new_background_tab";
}

export function autoApplyPageSessionDisposition(
  session: AutoApplyPageSession | null | undefined
): AutoApplyPageSessionDisposition {
  if (!session) return "continue";
  if (["succeeded", "already_applied", "failed"].includes(session.stage)) return "terminal";
  if (session.submissionAttemptId || ["submit_initiated", "reconciling", "outcome_unknown"].includes(session.stage)) {
    return "reconcile_only";
  }
  return "continue";
}

/** A paused job may resume only from its original live application tab. */
export function autoApplyPageSessionRequiresOriginalTab(
  session: AutoApplyPageSession | null | undefined
): boolean {
  return session?.stage === "waiting_for_user_action" && session.waitingFor === "captcha";
}

/** A removed tab fails only the CAPTCHA wait session bound to that exact tab. */
export function isRemovedCaptchaWaitingTab(
  session: AutoApplyPageSession | null | undefined,
  removedTabId: number
): boolean {
  return Boolean(session && session.tabId === removedTabId &&
    session.stage === "waiting_for_user_action" && session.waitingFor === "captcha");
}

/** A receipt-only monitor owns the exact submitted tab without requiring user action. */
export function isRemovedSubmissionReceiptTab(
  session: AutoApplyPageSession | null | undefined,
  removedTabId: number
): boolean {
  return Boolean(session && session.tabId === removedTabId &&
    session.stage === "reconciling" && session.submissionAttemptId);
}

/** An irreversible submission owns its exact tab until a result is classified. */
export function isRemovedActiveSubmissionTab(
  session: AutoApplyPageSession | null | undefined,
  removedTabId: number
): boolean {
  return Boolean(session && session.tabId === removedTabId &&
    session.stage === "submit_initiated" && session.submissionAttemptId);
}

export function updateAutoApplyPageSession(
  session: AutoApplyPageSession,
  patch: Partial<Pick<AutoApplyPageSession,
    "tabId" | "tabOwnership" | "executionSurface" | "stage" | "pageStage" | "pageStageSource" | "pageStageObservedAt" |
    "pageStageObservationCount" | "pageStageWaitedMs" | "waitingFor" | "terminalOutcome" | "pendingRepairFieldKeys" |
    "automaticSiteValidationRepairCount">>,
  now = new Date().toISOString()
): AutoApplyPageSession {
  return { ...session, ...patch, updatedAt: now };
}

export function beginAutoApplySubmission(
  session: AutoApplyPageSession,
  submissionAttemptId: string,
  now = new Date().toISOString()
): AutoApplyPageSession {
  if (session.submissionAttemptId) return session;
  return {
    ...session,
    stage: "submit_initiated",
    submissionAttemptId,
    submitInitiatedAt: now,
    waitingFor: null,
    updatedAt: now
  };
}

export function canResumeAutoApplyAfterSiteValidation(result: {
  executed: boolean;
  observedResult: string;
  siteValidationConfirmed?: boolean;
}): boolean {
  return result.executed && result.observedResult === "blocked_by_site_validation" &&
    result.siteValidationConfirmed === true;
}

/**
 * A site-validation response is positive evidence that the application was
 * not accepted. Only that explicit outcome may reopen the same transaction
 * for required-field repair; unknown/network/receipt states keep the original
 * submission checkpoint and remain reconcile-only.
 */
export function resumeAutoApplyAfterSiteValidation(
  session: AutoApplyPageSession,
  now = new Date().toISOString()
): AutoApplyPageSession {
  return {
    ...session,
    stage: "filling",
    submissionAttemptId: null,
    submitInitiatedAt: null,
    waitingFor: null,
    terminalOutcome: null,
    updatedAt: now
  };
}

/**
 * Start the sole automatic field-repair round after a confirmed site rejection.
 * Persist the increment before touching the page so a worker restart cannot
 * authorize another repair/submit cycle.
 */
export function beginSingleAutomaticSiteValidationRepair(
  session: AutoApplyPageSession,
  now = new Date().toISOString()
): AutoApplyPageSession {
  if (!session.submissionAttemptId || session.stage !== "submit_initiated") {
    throw new Error("自动修复只能从已持久化且被网站明确拒绝的提交检查点开始");
  }
  if ((session.automaticSiteValidationRepairCount ?? 0) >= 1) {
    throw new Error("网站字段自动修复已达到一次上限");
  }
  return {
    ...resumeAutoApplyAfterSiteValidation(session, now),
    automaticSiteValidationRepairCount: 1,
    updatedAt: now
  };
}

export function waitAutoApplyForUser(
  session: AutoApplyPageSession,
  waitingFor: NonNullable<AutoApplyPageSession["waitingFor"]>,
  now = new Date().toISOString()
): AutoApplyPageSession {
  return {
    ...session,
    stage: "waiting_for_user_action",
    waitingFor,
    updatedAt: now
  };
}

export function failAutoApplyPageSession(
  session: AutoApplyPageSession,
  now = new Date().toISOString()
): AutoApplyPageSession {
  return {
    ...session,
    stage: "failed",
    waitingFor: null,
    terminalOutcome: null,
    updatedAt: now
  };
}

export function completeAutoApplyPageSession(
  session: AutoApplyPageSession,
  outcome: "succeeded" | "already_applied",
  now = new Date().toISOString()
): AutoApplyPageSession {
  return {
    ...session,
    stage: outcome,
    terminalOutcome: outcome,
    waitingFor: null,
    updatedAt: now
  };
}
