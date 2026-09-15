import { describe, expect, it } from "vitest";
import {
  autoApplyPageSessionDisposition,
  autoApplyPageSessionOwnsTab,
  autoApplyPageSessionRequiresOriginalTab,
  autoApplyUserActionOutcome,
  beginSingleAutomaticSiteValidationRepair,
  beginAutoApplySubmission,
  canResumeAutoApplyAfterSiteValidation,
  completeAutoApplyPageSession,
  createAutoApplyPageSession,
  resumeAutoApplyAfterSiteValidation,
  failAutoApplyPageSession,
  isRemovedActiveSubmissionTab,
  isRemovedCaptchaWaitingTab,
  isRemovedSubmissionReceiptTab,
  shouldCloseAutoApplyTab,
  updateAutoApplyPageSession,
  waitAutoApplyForUser
} from "./auto-apply-page-session.js";

function session() {
  return createAutoApplyPageSession({
    batchId: "batch-1",
    batchJobId: "job-item-1",
    jobId: "job-1",
    applicationUrl: "https://example.test/apply",
    adapterCode: "moka.v2",
    tabId: 12,
    now: "2026-08-24T00:00:00.000Z"
  });
}

describe("auto apply page session", () => {
  it("retains missing-information repair scope without requiring the original page", () => {
    const rejected = resumeAutoApplyAfterSiteValidation(beginAutoApplySubmission(session(), "attempt-1"));
    const waiting = waitAutoApplyForUser(updateAutoApplyPageSession(rejected, {
      pendingRepairFieldKeys: ["relation.name", "relation.department"]
    }), "missing_information");
    const persisted = JSON.parse(JSON.stringify(waiting));
    expect(autoApplyPageSessionRequiresOriginalTab(persisted)).toBe(false);
    expect(autoApplyPageSessionDisposition(persisted)).toBe("continue");
    expect(persisted).toMatchObject({ tabId: 12, pendingRepairFieldKeys: ["relation.name", "relation.department"] });
    expect(shouldCloseAutoApplyTab({ createdForExecution: true, resultDisposition: "default" })).toBe(true);
  });

  it("does not erase an uncertain submission just because someone marks it missing information", () => {
    const waiting = waitAutoApplyForUser(beginAutoApplySubmission(session(), "attempt-1"), "missing_information");
    expect(autoApplyPageSessionDisposition(waiting)).toBe("reconcile_only");
  });
  it("keeps only CAPTCHA resumable while login and identity verification are terminal", () => {
    expect(autoApplyUserActionOutcome("login")).toEqual({
      status: "failed",
      reasonCode: "login_required",
      resultDisposition: "login_handoff",
      resumeSupported: false
    });
    expect(autoApplyUserActionOutcome("captcha")).toEqual({
      status: "waiting_for_user_action",
      reasonCode: "captcha_required",
      resultDisposition: "keep_open",
      resumeSupported: true
    });
    expect(autoApplyUserActionOutcome("identity_verification")).toEqual({
      status: "failed",
      reasonCode: "identity_verification_required",
      resultDisposition: "default",
      resumeSupported: false
    });
  });

  it("keeps an explicitly in-progress human-action page open", () => {
    expect(shouldCloseAutoApplyTab({
      createdForExecution: true,
      resultDisposition: "keep_open"
    })).toBe(false);
    expect(shouldCloseAutoApplyTab({
      createdForExecution: false,
      resultDisposition: "keep_open"
    })).toBe(false);
  });

  it("retains a terminal login page without making it a resumable wait or losing its checkpoint", () => {
    const failed = failAutoApplyPageSession(beginAutoApplySubmission(session(), "attempt-1"));
    const persisted = JSON.parse(JSON.stringify(failed));
    expect(autoApplyPageSessionDisposition(persisted)).toBe("terminal");
    expect(autoApplyPageSessionRequiresOriginalTab(persisted)).toBe(false);
    expect(persisted).toMatchObject({ tabId: 12, stage: "failed", submissionAttemptId: "attempt-1" });
    for (const createdForExecution of [true, false]) {
      expect(shouldCloseAutoApplyTab({ createdForExecution,
        resultDisposition: autoApplyUserActionOutcome("login").resultDisposition })).toBe(false);
    }
  });

  it("closes only a plugin-created terminal page", () => {
    expect(shouldCloseAutoApplyTab({
      createdForExecution: true,
      resultDisposition: "default"
    })).toBe(true);
    expect(shouldCloseAutoApplyTab({
      createdForExecution: false,
      resultDisposition: "default"
    })).toBe(false);
  });

  it("requires the original tab only for a CAPTCHA handoff", () => {
    expect(autoApplyPageSessionRequiresOriginalTab(
      waitAutoApplyForUser(session(), "identity_verification")
    )).toBe(false);
    expect(autoApplyPageSessionRequiresOriginalTab(
      waitAutoApplyForUser(session(), "captcha")
    )).toBe(true);
    expect(autoApplyPageSessionRequiresOriginalTab(session())).toBe(false);
  });

  it("persists plugin tab ownership across a bound-tab resume", () => {
    const owned = createAutoApplyPageSession({
      batchId: "batch-1",
      batchJobId: "job-item-1",
      jobId: "job-1",
      applicationUrl: "https://example.test/apply",
      adapterCode: "moka.v2",
      tabId: 12,
      tabOwnership: "plugin"
    });
    const resumed = updateAutoApplyPageSession(owned, {
      executionSurface: {
        mode: "background_tab",
        source: "bound_task_tab",
        tabId: 12,
        windowId: 1,
        windowType: "normal"
      }
    });
    expect(autoApplyPageSessionOwnsTab(JSON.parse(JSON.stringify(resumed)))).toBe(true);
    expect(autoApplyPageSessionOwnsTab(session())).toBe(false);
  });

  it("reports a close only for the exact tab of a live CAPTCHA wait", () => {
    const waiting = waitAutoApplyForUser(session(), "captcha");
    expect(isRemovedCaptchaWaitingTab(waiting, 12)).toBe(true);
    expect(isRemovedCaptchaWaitingTab(waiting, 13)).toBe(false);
    expect(isRemovedCaptchaWaitingTab(
      waitAutoApplyForUser(session(), "identity_verification"),
      12
    )).toBe(false);
    expect(isRemovedCaptchaWaitingTab(failAutoApplyPageSession(waiting), 12)).toBe(false);
  });

  it("binds a passive submission receipt monitor to the exact reconciling tab", () => {
    const reconciling = updateAutoApplyPageSession(
      beginAutoApplySubmission(session(), "attempt-1"),
      { stage: "reconciling" }
    );
    expect(isRemovedSubmissionReceiptTab(reconciling, 12)).toBe(true);
    expect(isRemovedSubmissionReceiptTab(reconciling, 13)).toBe(false);
    expect(isRemovedSubmissionReceiptTab(failAutoApplyPageSession(reconciling), 12)).toBe(false);
    expect(isRemovedSubmissionReceiptTab(session(), 12)).toBe(false);
  });

  it("binds an in-flight irreversible submission to the exact active tab", () => {
    const submitting = beginAutoApplySubmission(session(), "attempt-1");
    expect(isRemovedActiveSubmissionTab(submitting, 12)).toBe(true);
    expect(isRemovedActiveSubmissionTab(submitting, 13)).toBe(false);
    expect(isRemovedActiveSubmissionTab(
      updateAutoApplyPageSession(submitting, { stage: "reconciling" }),
      12
    )).toBe(false);
    expect(isRemovedActiveSubmissionTab(session(), 12)).toBe(false);
  });

  it("creates the submission checkpoint exactly once", () => {
    const initiated = beginAutoApplySubmission(session(), "attempt-1", "2026-08-24T00:02:00.000Z");
    const duplicate = beginAutoApplySubmission(initiated, "attempt-2", "2026-08-24T00:03:00.000Z");
    expect(duplicate.submissionAttemptId).toBe("attempt-1");
    expect(duplicate.submitInitiatedAt).toBe("2026-08-24T00:02:00.000Z");
    expect(autoApplyPageSessionDisposition(duplicate)).toBe("reconcile_only");
  });

  it("reopens only an explicitly validation-blocked submission for field repair", () => {
    const initiated = beginAutoApplySubmission(session(), "attempt-1", "2026-08-24T00:02:00.000Z");
    const reopened = resumeAutoApplyAfterSiteValidation(initiated, "2026-08-24T00:03:00.000Z");

    expect(reopened).toMatchObject({
      stage: "filling",
      submissionAttemptId: null,
      submitInitiatedAt: null,
      waitingFor: null,
      terminalOutcome: null
    });
    expect(autoApplyPageSessionDisposition(reopened)).toBe("continue");
  });

  it("persists exactly one automatic site-validation repair across submission checkpoints", () => {
    const firstSubmit = beginAutoApplySubmission(session(), "attempt-1", "2026-08-24T00:02:00.000Z");
    const repairing = beginSingleAutomaticSiteValidationRepair(firstSubmit, "2026-08-24T00:03:00.000Z");
    expect(repairing).toMatchObject({
      stage: "filling",
      submissionAttemptId: null,
      submitInitiatedAt: null,
      automaticSiteValidationRepairCount: 1
    });

    const secondSubmit = beginAutoApplySubmission(repairing, "attempt-2", "2026-08-24T00:04:00.000Z");
    expect(() => beginSingleAutomaticSiteValidationRepair(secondSubmit)).toThrow("已达到一次上限");
  });

  it("does not start automatic repair without an active persisted submission checkpoint", () => {
    expect(() => beginSingleAutomaticSiteValidationRepair(session())).toThrow("已持久化");
  });

  it("never reopens unknown, receipt-pending, CAPTCHA, or pre-click failures", () => {
    expect(canResumeAutoApplyAfterSiteValidation({
      executed: true,
      observedResult: "blocked_by_site_validation",
      siteValidationConfirmed: true
    })).toBe(true);
    expect(canResumeAutoApplyAfterSiteValidation({
      executed: true,
      observedResult: "blocked_by_site_validation"
    })).toBe(false);
    expect(canResumeAutoApplyAfterSiteValidation({
      executed: true,
      observedResult: "network_or_navigation_unknown"
    })).toBe(false);
    expect(canResumeAutoApplyAfterSiteValidation({
      executed: true,
      observedResult: "waiting_for_site_receipt"
    })).toBe(false);
    expect(canResumeAutoApplyAfterSiteValidation({
      executed: true,
      observedResult: "waiting_for_user_action"
    })).toBe(false);
    expect(canResumeAutoApplyAfterSiteValidation({
      executed: false,
      observedResult: "blocked_by_site_validation"
    })).toBe(false);
  });

  it("keeps a CAPTCHA challenge after submit resumable on the original checkpoint", () => {
    const initiated = beginAutoApplySubmission(session(), "attempt-1");
    const waiting = waitAutoApplyForUser(initiated, "captcha");
    expect(waiting.stage).toBe("waiting_for_user_action");
    expect(waiting.submissionAttemptId).toBe("attempt-1");
    expect(waiting.waitingFor).toBe("captcha");
    expect(autoApplyPageSessionDisposition(waiting)).toBe("reconcile_only");
  });

  it("does not erase a submission checkpoint when page metadata changes", () => {
    const initiated = beginAutoApplySubmission(session(), "attempt-1");
    const updated = updateAutoApplyPageSession(initiated, { tabId: 99, stage: "reconciling" });
    expect(updated.submissionAttemptId).toBe("attempt-1");
    expect(updated.tabId).toBe(99);
  });

  it("persists the observed page stage separately from workflow failure", () => {
    const classified = updateAutoApplyPageSession(session(), {
      pageStage: "login",
      pageStageSource: "deterministic",
      pageStageObservedAt: "2026-08-24T00:01:00.000Z",
      pageStageObservationCount: 4,
      pageStageWaitedMs: 750
    });
    const failed = failAutoApplyPageSession(classified, "2026-08-24T00:02:00.000Z");

    expect(failed).toMatchObject({
      stage: "failed",
      pageStage: "login",
      pageStageSource: "deterministic",
      pageStageObservedAt: "2026-08-24T00:01:00.000Z",
      pageStageObservationCount: 4,
      pageStageWaitedMs: 750
    });
  });

  it("marks authoritative receipt outcomes as terminal", () => {
    const completed = completeAutoApplyPageSession(
      beginAutoApplySubmission(session(), "attempt-1"),
      "already_applied"
    );
    expect(completed.terminalOutcome).toBe("already_applied");
    expect(autoApplyPageSessionDisposition(completed)).toBe("terminal");
  });

  it("marks login-required attempts as terminal failures", () => {
    const failed = failAutoApplyPageSession(
      waitAutoApplyForUser(session(), "login"),
      "2026-08-24T00:04:00.000Z"
    );
    expect(failed.stage).toBe("failed");
    expect(failed.waitingFor).toBeNull();
    expect(autoApplyPageSessionDisposition(failed)).toBe("terminal");
  });
});
