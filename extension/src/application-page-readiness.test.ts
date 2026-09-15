import { describe, expect, it } from "vitest";
import {
  APPLICATION_PAGE_READINESS_REGISTRY,
  advanceApplicationPageReadiness,
  classifyApplicationPageReadinessSample,
  resolveApplicationPageReadinessRegistration,
  type ApplicationPageReadinessSample,
  type ApplicationPageReadinessState
} from "./application-page-readiness.js";

const registration = APPLICATION_PAGE_READINESS_REGISTRY[0]!;
const sample = (overrides: Partial<ApplicationPageReadinessSample> = {}): ApplicationPageReadinessSample => ({
  loginRequired: false,
  formDetected: false,
  deterministicStage: "unknown",
  ...overrides
});

describe("application page readiness routing", () => {
  it("keeps the Moka application override and classifies every other HTTP page", () => {
    expect(resolveApplicationPageReadinessRegistration(
      "https://app.mokahr.com/campus-recruitment/robosense/141961#/job/job-1/apply"
    )).toMatchObject({
      registrationId: "moka.application-page-readiness.v1",
      waitTimeoutMs: 30_000,
      pollIntervalMs: 250,
      stableReadCount: 2
    });
    expect(resolveApplicationPageReadinessRegistration(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/job-1/apply"
    )).toMatchObject({ registrationId: "moka.application-page-readiness.v1" });
    expect(resolveApplicationPageReadinessRegistration(
      "https://app.mokahr.com/campus-recruitment/robosense/141961#/job/job-1"
    )).toMatchObject({ registrationId: "universal.application-page-readiness.v1" });
    expect(resolveApplicationPageReadinessRegistration(
      "https://careers.example.com/job/job-1/apply"
    )).toMatchObject({
      registrationId: "universal.application-page-readiness.v1",
      resolvedStages: ["job_detail", "login", "application_form"]
    });
    expect(() => JSON.stringify(APPLICATION_PAGE_READINESS_REGISTRY)).not.toThrow();
  });

  it("waits through the empty Moka shell until two form observations are stable", () => {
    let state: ApplicationPageReadinessState | null = null;
    const decisions = [
      advanceApplicationPageReadiness(state, sample(), 0, registration),
      advanceApplicationPageReadiness({ pageStage: "unknown", consecutiveReads: 1, observationCount: 1, transitionKey: "unknown" },
        sample(), 250, registration),
      advanceApplicationPageReadiness({ pageStage: "unknown", consecutiveReads: 2, observationCount: 2, transitionKey: "unknown" },
        sample({ formDetected: true, deterministicStage: "application_form" }), 750, registration),
      advanceApplicationPageReadiness({ pageStage: "application_form", consecutiveReads: 1, observationCount: 3, transitionKey: "application_form" },
        sample({ formDetected: true, deterministicStage: "application_form" }), 1_000, registration)
    ];
    state = decisions.at(-1)!;

    expect(decisions.map((decision) => decision.status)).toEqual([
      "waiting", "waiting", "waiting", "resolved"
    ]);
    expect(state).toMatchObject({
      pageStage: "application_form",
      consecutiveReads: 2,
      observationCount: 4
    });
  });

  it("resolves a stable site-independent login observation", () => {
    const first = advanceApplicationPageReadiness(null, sample({ loginRequired: true }), 0, registration);
    const second = advanceApplicationPageReadiness(first, sample({ loginRequired: true }), 250, registration);

    expect(first.status).toBe("waiting");
    expect(second).toMatchObject({ status: "resolved", pageStage: "login", consecutiveReads: 2 });
  });

  it("does not let job-detail text end an application-route wait early", () => {
    const first = advanceApplicationPageReadiness(null,
      sample({ deterministicStage: "job_detail" }), 1_000, registration);
    const repeated = advanceApplicationPageReadiness(first,
      sample({ deterministicStage: "job_detail" }), 5_000, registration);
    const timeout = advanceApplicationPageReadiness(repeated,
      sample({ deterministicStage: "job_detail" }), 30_000, registration);

    expect(first.status).toBe("waiting");
    expect(repeated.status).toBe("waiting");
    expect(timeout).toMatchObject({ status: "timed_out", pageStage: "job_detail" });
  });

  it("keeps login precedence when a verification gate covers a rendered form", () => {
    expect(classifyApplicationPageReadinessSample(sample({
      loginRequired: true,
      formDetected: true,
      deterministicStage: "application_form"
    }))).toBe("login");
  });

  it("resets stability when the URL or same-document page fingerprint changes", () => {
    const universal = APPLICATION_PAGE_READINESS_REGISTRY[1]!;
    const first = advanceApplicationPageReadiness(null, sample({
      deterministicStage: "job_detail",
      transitionKey: "https://xtool.jobs.feishu.cn/detail:empty-shell"
    }), 0, universal);
    const rebuilt = advanceApplicationPageReadiness(first, sample({
      deterministicStage: "job_detail",
      transitionKey: "https://xtool.jobs.feishu.cn/detail:react-detail"
    }), 250, universal);
    const stable = advanceApplicationPageReadiness(rebuilt, sample({
      deterministicStage: "job_detail",
      transitionKey: "https://xtool.jobs.feishu.cn/detail:react-detail"
    }), 500, universal);

    expect(rebuilt).toMatchObject({ status: "waiting", consecutiveReads: 1 });
    expect(stable).toMatchObject({ status: "resolved", pageStage: "job_detail", consecutiveReads: 2 });
  });

  it("lets an unchanged rendered form settle across equivalent React root replacements", () => {
    const first = advanceApplicationPageReadiness(null, sample({
      formDetected: true,
      deterministicStage: "application_form",
      transitionKey: "https://jobs.example.com/apply:root-1",
      stableFormKey: "https://jobs.example.com/apply:form-fields-a"
    }), 0, registration);
    const rebuilt = advanceApplicationPageReadiness(first, sample({
      formDetected: true,
      deterministicStage: "application_form",
      transitionKey: "https://jobs.example.com/apply:root-2",
      stableFormKey: "https://jobs.example.com/apply:form-fields-a"
    }), 250, registration);

    expect(rebuilt).toMatchObject({
      status: "resolved",
      pageStage: "application_form",
      consecutiveReads: 2,
      transitionKey: "https://jobs.example.com/apply:form-fields-a"
    });
  });

  it("still resets readiness when the rendered form structure changes", () => {
    const first = advanceApplicationPageReadiness(null, sample({
      formDetected: true,
      deterministicStage: "application_form",
      transitionKey: "https://jobs.example.com/apply:root-1",
      stableFormKey: "https://jobs.example.com/apply:form-fields-a"
    }), 0, registration);
    const changed = advanceApplicationPageReadiness(first, sample({
      formDetected: true,
      deterministicStage: "application_form",
      transitionKey: "https://jobs.example.com/apply:root-2",
      stableFormKey: "https://jobs.example.com/apply:form-fields-b"
    }), 250, registration);

    expect(changed).toMatchObject({ status: "waiting", consecutiveReads: 1 });
  });

  it("never resolves an unknown page as an empty application form", () => {
    const universal = APPLICATION_PAGE_READINESS_REGISTRY[1]!;
    const first = advanceApplicationPageReadiness(null, sample({ transitionKey: "empty" }), 0, universal);
    const timeout = advanceApplicationPageReadiness(first, sample({ transitionKey: "empty" }), 30_000, universal);

    expect(first.status).toBe("waiting");
    expect(timeout).toMatchObject({ status: "timed_out", pageStage: "unknown" });
  });
});
