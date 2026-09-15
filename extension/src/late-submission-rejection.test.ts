import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";
import { siteValidationFieldKey, submissionRejectedFields } from "./auto-apply-site-validation.js";
import { nativeSubmitValidationProbeInPage, reassertedSubmitValidationProbeInPage } from "./submit-validation-probe.js";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import { siteRejectedInformationRequests } from "./vision-form-runtime.js";
import { siteRejectedUploadEvidence } from "./site-upload-rejection.js";
import { createAutoApplyPageSession, beginAutoApplySubmission, updateAutoApplyPageSession,
  completeAutoApplyPageSession, resumeAutoApplyAfterSiteValidation,
  waitAutoApplyForUser, failAutoApplyPageSession } from "./auto-apply-page-session.js";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
function production(name: string, deps: Record<string, unknown>) {
  const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.ES2023, true);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  deps = { detectAutoApplyUserAction: async () => null, ...deps };
  return new Function(...Object.keys(withInterruptionDependencies(deps)), `${js}; return ${name};`)(...Object.values(withInterruptionDependencies(deps)));
}
const field = (key: string, value: string, error: string | null): PageFieldObservation => ({
  fieldId: key, stableFieldKey: key, label: key, type: "text", controlKind: "native", required: true,
  selector: `#${key}`, currentValue: value, options: [], validationMessage: error
});
const page = (fields: PageFieldObservation[]): PageObservation => ({
  url: "https://careers.example/apply", title: "申请表", pageStage: "application_form",
  pageStageEvidence: [], loginRequired: false, loginReason: null, formDetected: true,
  jobDetailDetected: false, fingerprint: "form", pageStateFingerprint: "form", fields, actions: [],
  submitCandidates: [], validationMessages: [], transientBusy: false, observedAt: "now"
});

describe("late submission rejection uses the original click baseline", () => {
  it.each([false, true])("retains a late upload refusal across lost delivery, including closed page: %s", async closed => {
    const url = "https://careers.example/apply", key = "batch:job";
    let session = updateAutoApplyPageSession(beginAutoApplySubmission(createAutoApplyPageSession({
      batchId: "batch", batchJobId: "job", jobId: "job", applicationUrl: url,
      adapterCode: "generic.web.v1", tabId: 7, tabOwnership: "plugin"
    }), "submission-1"), { stage: "reconciling" });
    const refs: Record<string, any> = { [key]: { batchId: "batch", batchJobId: "job", jobId: "job",
      tabId: 7, applicationUrl: url, commandId: "command-1", monitorMode: "submission_receipt",
      validationMonitor: { token: "original-token", baseline: page([]) } } };
    const fields = [{ ...field("resume", "private-filename.pdf", "网站未接受上传"), type: "file" },
      field("email", "private@example.test", "格式错误")];
    const lateRead = vi.fn(async () => fields);
    const requests = vi.fn(siteRejectedInformationRequests);
    const close = vi.fn();
    const retire = vi.fn();
    const cleanup = vi.fn();
    const report = vi.fn(async () => {
      expect(refs[key].pendingUploadRejection).toEqual(siteRejectedUploadEvidence(fields));
      if (report.mock.calls.length === 1) throw new Error("response lost");
    });
    const run = production("reconcilePersistedAutoApplyTabs", {
      autoApplyTabReconciliationRunning: false, autoApplyLifecycleGeneration: 0,
      autoApplySessionTerminated: false, autoApplyTabRefsStorageKey: "refs",
      chrome: { storage: { local: { get: async () => ({ refs: structuredClone(refs) }) } },
        tabs: { get: async () => {
          if (closed && report.mock.calls.length) throw new Error("closed");
          return { id: 7, url };
        }, remove: close }, alarms: { clear: async () => true } },
      asRecord: value => value && typeof value === "object" ? value : null,
      autoApplyCredential: async () => ({}), recalledAutoApplyPageSession: async () => session,
      autoApplyBoundTabUrlMatchesApplication: (actual, expected) => actual === expected,
      autoApplyTabOutcomeReporting: new Set(), autoApplyTerminalNavigationByTabId: new Map(),
      observedAutoApplyTerminalNavigation: () => null, detectAutoApplySiteSuccess: async () => null,
      detectAutoApplySitePolicyBlock: async () => null, readLateSubmissionRejection: lateRead,
      siteRejectedUploadEvidence, siteRejectedInformationRequests: requests, siteValidationFieldKey,
      rememberAutoApplyTab: async ref => { refs[key] = structuredClone(ref); },
      reportAutoApplyBrowserState: report, failAutoApplyPageSession,
      persistAutoApplyPageSession: async next => { session = next; return true; },
      cleanupSubmissionValidationMonitor: cleanup, submissionReceiptAlarmName: () => key,
      forgetAutoApplyTab: async () => { delete refs[key]; }, retireReportedAutoApplyTab: retire
    });
    await expect(run()).rejects.toThrow("response lost");
    expect(session.stage).toBe("reconciling");
    expect(cleanup).not.toHaveBeenCalled();
    if (closed) refs[key].pendingOutcome = "submission_receipt_tab_closed";
    await run();
    expect(report).toHaveBeenCalledTimes(2);
    expect(lateRead).toHaveBeenCalledOnce();
    expect(report.mock.calls[1]?.[1]).toMatchObject({ outcome: "site_validation_rejected",
      commandId: "command-1", uploadRejection: { uploadFields: [{ type: "file", label: "resume" }],
        failures: ["resume：网站未接受上传", "email：格式错误"] } });
    const payload = JSON.stringify(report.mock.calls[1]?.[1]);
    expect(payload).not.toContain("private");
    expect(payload).not.toContain("requiredFieldRequests");
    expect(requests).not.toHaveBeenCalled();
    expect(session).toMatchObject({ stage: "failed", tabId: 7 });
    expect(refs[key]).toBeUndefined();
    expect(close).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("persists an immediate policy wake only for the exact tab, frame, document and submit token", async () => {
    const url = "https://careers.example/apply";
    let refs: Record<string, any> = { "batch:job": { batchId: "batch", batchJobId: "job",
      tabId: 7, applicationUrl: url, validationMonitor: { token: "submit-token" } } };
    const read = vi.fn(async () => ({ blocked: true, reasonCode: "site_application_limit_reached",
      message: "近半年投递岗位数量已达到上限", source: "visible_site_policy", url }));
    const run = production("captureBoundSitePolicyObservation", {
      chrome: { runtime: { id: "extension" }, storage: { local: {
        get: async () => ({ refs: structuredClone(refs) }),
        set: async value => { refs = value.refs; }
      } } },
      autoApplyTabRefsStorageKey: "refs", detectAutoApplySitePolicyBlock: read,
      asRecord: value => value && typeof value === "object" ? value : null,
      autoApplyBoundTabUrlMatchesApplication: (actual, expected) => actual === expected,
      autoApplyTabRefKey: (batch, job) => `${batch}:${job}`,
      autoApplyStorageQueue: async (_key, work) => work()
    });
    const sender = { id: "extension", tab: { id: 7 }, frameId: 0, url };
    for (const invalid of [{ ...sender, id: "other" }, { ...sender, frameId: 1 },
      { ...sender, tab: { id: 8 } }, { ...sender, url: "https://careers.example/other" }]) {
      expect(await run("submit-token", invalid)).toBe(false);
    }
    expect(await run("previous-attempt", sender)).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(await run("submit-token", sender)).toBe(true);
    expect(refs["batch:job"].pendingSitePolicyBlock.message).toContain("半年");
  });

  async function read(before: PageObservation, after: PageObservation,
    options: { native?: Array<{ fieldKey: string; message: string }>; reasserted?: string[];
      previouslyRejectedKeys?: string[] } = {}) {
    const scripting = vi.fn(async ({ func, args }) => {
      expect(args[0]).toBe("original-submit-token");
      expect(args[1]).toBe("read");
      return [{ result: func === nativeSubmitValidationProbeInPage ? options.native ?? [] : options.reasserted ?? [] }];
    });
    const run = production("readLateSubmissionRejection", {
      chrome: { scripting: { executeScript: scripting } },
      stableApplicationObservation: async () => after, siteValidationFieldKey, submissionRejectedFields,
      nativeSubmitValidationProbeInPage, reassertedSubmitValidationProbeInPage
    });
    return run(7, { token: "original-submit-token", baseline: before,
      previouslyRejectedKeys: options.previouslyRejectedKeys }) as Promise<PageFieldObservation[] | null>;
  }

  it("returns late invalid nonempty values together with late empty required fields", async () => {
    const before = page([field("email", "bad", null), field("relation", "", null)]);
    const after = page([field("email", "bad", "邮箱格式不合法"), field("relation", "", "必填")]);
    expect((await read(before, after))?.map(field => field.stableFieldKey)).toEqual(["email", "relation"]);
  });
  it("does not turn unchanged red errors into a new rejection", async () => {
    const current = page([field("name", "", "必填")]);
    expect(await read(current, current)).toEqual([]);
  });
  it("returns an unchanged empty Formily field-name required error", async () => {
    const current = page([field("name", "", "姓名为必填")]);
    expect((await read(current, current))?.map(item => item.stableFieldKey)).toEqual(["name"]);
  });
  it("keeps the frozen second-submit rejection scope during passive monitoring", async () => {
    const current = page([field("email", "bad@example", "邮箱格式不正确")]);
    expect((await read(current, current, { previouslyRejectedKeys: ["email"] }))
      ?.map(item => item.stableFieldKey)).toEqual(["email"]);
  });
  it("accepts reasserted and native-invalid evidence without a new click", async () => {
    const current = page([field("name", "", "必填"), field("email", "bad", null)]);
    expect((await read(current, current, { reasserted: ["name"],
      native: [{ fieldKey: "email", message: "Invalid email" }] }))?.map(field => field.validationMessage))
      .toEqual(["必填", "Invalid email"]);
  });
  it("does not rebind errors to a navigated or login page", async () => {
    const current = page([field("name", "", "必填")]);
    expect(await read(current, { ...current, url: "https://careers.example/login" })).toBeNull();
    expect(await read(current, { ...current, pageStage: "login", loginRequired: true })).toBeNull();
  });

  it("persists corrections, retries a lost response, then retires the page after AI Offer accepts them", async () => {
    const url = "https://careers.example/apply", key = "batch:job";
    let session = updateAutoApplyPageSession(beginAutoApplySubmission(createAutoApplyPageSession({
      batchId: "batch", batchJobId: "job", jobId: "job", applicationUrl: url,
      adapterCode: "generic.web.v1", tabId: 7
    }), "submission-1"), { stage: "reconciling" });
    const refs: Record<string, any> = { [key]: {
      batchId: "batch", batchJobId: "job", jobId: "job", tabId: 7, applicationUrl: url,
      commandId: "command-1", monitorMode: "submission_receipt", updatedAt: new Date().toISOString(),
      validationMonitor: { token: "token", baseline: page([]) }
    } };
    const fields = [field("email", "bad", "邮箱格式错误"), field("contact", "", "请填写")];
    const lateRead = vi.fn(async () => fields);
    const report = vi.fn(async () => {
      expect(session).toMatchObject({ tabId: 7, waitingFor: "missing_information", submissionAttemptId: null });
      if (report.mock.calls.length === 1) throw new Error("response lost");
    });
    const cleanup = vi.fn(async () => undefined);
    const retire = vi.fn(async () => undefined);
    const run = production("reconcilePersistedAutoApplyTabs", {
      autoApplyTabReconciliationRunning: false, autoApplyLifecycleGeneration: 0,
      autoApplySessionTerminated: false, autoApplyTabRefsStorageKey: "refs",
      chrome: { storage: { local: { get: async () => ({ refs: structuredClone(refs) }) } },
        tabs: { get: async () => ({ id: 7, url }) }, alarms: { clear: async () => true } },
      asRecord: (value: unknown) => value && typeof value === "object" ? value : null,
      autoApplyCredential: async () => ({}), recalledAutoApplyPageSession: async () => session,
      autoApplyBoundTabUrlMatchesApplication: (actual: string, expected: string) => actual === expected,
      autoApplyTabOutcomeReporting: new Set(), readLateSubmissionRejection: lateRead,
      autoApplyTerminalNavigationByTabId: new Map(),
      observedAutoApplyTerminalNavigation: () => null,
      detectAutoApplySiteSuccess: async () => null,
      detectAutoApplySitePolicyBlock: async () => null,
      siteRejectedInformationRequests, siteValidationFieldKey,
      rememberAutoApplyTab: async (ref: unknown) => { refs[key] = structuredClone(ref); },
      reportAutoApplyBrowserState: report, updateAutoApplyPageSession,
      resumeAutoApplyAfterSiteValidation, waitAutoApplyForUser,
      persistAutoApplyPageSession: async next => { session = next; return true; },
      cleanupSubmissionValidationMonitor: cleanup,
      forgetAutoApplyTab: async () => { delete refs[key]; },
      retireReportedAutoApplyTab: retire,
      submissionReceiptAlarmName: () => key
    });
    await expect(run()).rejects.toThrow("response lost");
    expect(refs[key].pendingRequiredFieldRequests).toHaveLength(2);
    expect(refs[key].commandId).toBe("command-1");
    expect(cleanup).not.toHaveBeenCalled();
    await run();
    expect(lateRead).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1]?.[1]).toMatchObject({ commandId: "command-1",
      outcome: "site_validation_rejected", requiredFieldRequests: siteRejectedInformationRequests(fields) });
    expect(session.pendingRepairFieldKeys).toEqual(["email", "contact"]);
    expect(retire).toHaveBeenCalledWith(expect.objectContaining({ batchId: "batch" }),
      expect.objectContaining({ waitingFor: "missing_information" }), 7);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("retains a post-CAPTCHA site limit across a lost report before retiring the original tab", async () => {
    const url = "https://careers.example/apply";
    const session = updateAutoApplyPageSession(createAutoApplyPageSession({
      batchId: "batch", batchJobId: "job", jobId: "job", applicationUrl: url,
      adapterCode: "generic.web.v1", tabId: 7, tabOwnership: "plugin"
    }), { stage: "waiting_for_user_action", waitingFor: "captcha" });
    const ref = {
      batchId: "batch", batchJobId: "job", jobId: "job", tabId: 7, applicationUrl: url,
      commandId: "command-1", updatedAt: new Date().toISOString()
    };
    const refs: Record<string, any> = { "batch:job": ref };
    const order: string[] = [];
    const report = vi.fn(async () => {
      order.push("report");
      if (report.mock.calls.length === 1) throw new Error("waiting result not yet persisted");
    });
    const cleanup = vi.fn(async () => { order.push("cleanup"); });
    const retire = vi.fn(async () => { order.push("retire"); });
    const persisted: unknown[] = [];
    const run = production("reconcilePersistedAutoApplyTabs", {
      autoApplyTabReconciliationRunning: false, autoApplyLifecycleGeneration: 0,
      autoApplySessionTerminated: false, autoApplyTabRefsStorageKey: "refs",
      chrome: {
        storage: { local: { get: async () => ({ refs: structuredClone(refs) }) } },
        tabs: { get: async () => {
          if (report.mock.calls.length) throw new Error("tab closed after the policy was captured");
          return { id: 7, url };
        } },
        alarms: { clear: async () => { order.push("alarm"); return true; } }
      },
      asRecord: (value: unknown) => value && typeof value === "object" ? value : null,
      autoApplyCredential: async () => ({}), recalledAutoApplyPageSession: async () => session,
      autoApplyBoundTabUrlMatchesApplication: (actual: string, expected: string) => actual === expected,
      observedAutoApplyTerminalNavigation: () => null,
      autoApplyTabOutcomeReporting: new Set(),
      detectAutoApplySiteSuccess: async () => null,
      detectAutoApplySitePolicyBlock: async () => report.mock.calls.length ? null : ({
        blocked: true, reasonCode: "site_application_limit_reached",
        message: "这6个月投递太多岗位，请耐心等待", source: "visible_site_policy", url
      }),
      reportAutoApplyBrowserState: report,
      rememberAutoApplyTab: async (value: unknown) => { refs["batch:job"] = structuredClone(value); },
      submissionReceiptAlarmName: () => "alarm",
      cleanupSubmissionValidationMonitor: cleanup,
      failAutoApplyPageSession: (value: unknown) => ({ ...(value as object), stage: "failed" }),
      persistAutoApplyPageSession: async (value: unknown) => { persisted.push(value); return true; },
      retireReportedAutoApplyTab: retire
    });

    await expect(run()).rejects.toThrow("waiting result not yet persisted");
    expect(refs["batch:job"].pendingSitePolicyBlock.message).toContain("6个月");
    refs["batch:job"].pendingOutcome = "submission_receipt_tab_closed";
    expect(retire).not.toHaveBeenCalled();
    await run();

    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      commandId: "command-1",
      outcome: "site_application_limit_reached",
      siteMessage: "这6个月投递太多岗位，请耐心等待"
    }));
    expect(persisted).toContainEqual(expect.objectContaining({ stage: "failed" }));
    expect(order.indexOf("report")).toBeLessThan(order.indexOf("retire"));
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("reports a captured Moka success before a later tab-closed event", async () => {
    const applicationUrl = "https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/job-1/apply";
    const receiptUrl = "https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/job-1/campus_apply/thanks?candidateId=1";
    const session = updateAutoApplyPageSession(beginAutoApplySubmission(createAutoApplyPageSession({
      batchId: "batch", batchJobId: "job", jobId: "job", applicationUrl,
      adapterCode: "moka.v2", tabId: 7, tabOwnership: "plugin"
    }), "submission-1"), { stage: "reconciling" });
    const ref = {
      batchId: "batch", batchJobId: "job", jobId: "job", tabId: 7, applicationUrl,
      monitorMode: "submission_receipt", pendingOutcome: "submission_receipt_tab_closed",
      observedTerminalOutcome: "succeeded", observedTerminalUrl: receiptUrl,
      observedTerminalAt: "2026-09-05T14:05:00.000Z", updatedAt: new Date().toISOString()
    };
    const report = vi.fn(async () => undefined);
    const retire = vi.fn(async () => undefined);
    const persisted: unknown[] = [];
    const terminalMap = new Map([[7, {
      outcome: "succeeded" as const,
      url: receiptUrl,
      observedAt: "2026-09-05T14:05:00.000Z"
    }]]);
    const run = production("reconcilePersistedAutoApplyTabs", {
      autoApplyTabReconciliationRunning: false, autoApplyLifecycleGeneration: 0,
      autoApplySessionTerminated: false, autoApplyTabRefsStorageKey: "refs",
      chrome: { storage: { local: { get: async () => ({ refs: { "batch:job": ref } }) } } },
      asRecord: (value: unknown) => value && typeof value === "object" ? value : null,
      autoApplyCredential: async () => ({}), recalledAutoApplyPageSession: async () => session,
      observedAutoApplyTerminalNavigation: () => terminalMap.get(7),
      autoApplyTabOutcomeReporting: new Set(), autoApplyTerminalNavigationByTabId: terminalMap,
      reportAutoApplyBrowserState: report, cleanupSubmissionValidationMonitor: async () => undefined,
      completeAutoApplyPageSession,
      persistAutoApplyPageSession: async (value: unknown) => { persisted.push(value); return true; },
      retireReportedAutoApplyTab: retire
    });

    await run();

    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      outcome: "succeeded", pageUrl: receiptUrl
    }));
    expect(persisted).toContainEqual(expect.objectContaining({ stage: "succeeded", tabId: 7 }));
    expect(retire).toHaveBeenCalledWith(ref, expect.objectContaining({ stage: "succeeded" }), 7);
    expect(terminalMap.has(7)).toBe(false);
  });
});
