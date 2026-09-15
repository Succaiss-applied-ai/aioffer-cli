export type ApplicationPageStage = "job_detail" | "login" | "application_form" | "unknown";

export interface ApplicationPageReadinessRegistration {
  registrationId: string;
  siteCode: string;
  siteName: string;
  applicationUrlPatterns: string[];
  waitTimeoutMs: number;
  pollIntervalMs: number;
  stableReadCount: number;
  resolvedStages: ApplicationPageStage[];
  evidence: string[];
}

export const APPLICATION_PAGE_READINESS_REGISTRY:
readonly ApplicationPageReadinessRegistration[] = [
  {
    registrationId: "moka.application-page-readiness.v1",
    siteCode: "moka",
    siteName: "Moka",
    applicationUrlPatterns: [
      "^https://app\\.mokahr\\.com/(?:campus|social)-recruitment/[^/?#]+/\\d+/?#/job/[^/?#]+/apply(?:[/?#]|$)"
    ],
    waitTimeoutMs: 30_000,
    pollIntervalMs: 250,
    stableReadCount: 2,
    resolvedStages: ["login", "application_form"],
    evidence: [
      "Moka application routes render their React form after document readyState becomes complete",
      "page-level login evidence remains site-independent",
      "two consecutive form or login observations are required before advancing"
    ]
  },
  {
    registrationId: "universal.application-page-readiness.v1",
    siteCode: "universal",
    siteName: "Universal recruiting page",
    applicationUrlPatterns: ["^https?://"],
    waitTimeoutMs: 30_000,
    pollIntervalMs: 250,
    stableReadCount: 2,
    resolvedStages: ["job_detail", "login", "application_form"],
    evidence: [
      "every recruiting page is classified before navigation, filling, or submission",
      "URL and same-document DOM transitions reset the stable-read counter",
      "unknown pages time out closed instead of being treated as empty forms"
    ]
  }
];

export interface ApplicationPageReadinessSample {
  loginRequired: boolean;
  formDetected: boolean;
  deterministicStage: ApplicationPageStage;
  transitionKey?: string;
  stableFormKey?: string;
}

export interface ApplicationPageReadinessState {
  pageStage: ApplicationPageStage;
  consecutiveReads: number;
  observationCount: number;
  transitionKey: string;
}

export interface ApplicationPageReadinessDecision extends ApplicationPageReadinessState {
  status: "waiting" | "resolved" | "timed_out";
  waitedMs: number;
}

export function resolveApplicationPageReadinessRegistration(
  applicationUrl: string
): ApplicationPageReadinessRegistration | null {
  return APPLICATION_PAGE_READINESS_REGISTRY.find((registration) =>
    registration.applicationUrlPatterns.some((pattern) =>
      new RegExp(pattern, "iu").test(applicationUrl)
    )
  ) ?? null;
}

export function classifyApplicationPageReadinessSample(
  sample: ApplicationPageReadinessSample
): ApplicationPageStage {
  // Login wins when a verification/password gate covers a form. The login
  // evidence itself is produced by the cross-site page classifier, not this
  // Moka readiness route.
  if (sample.loginRequired || sample.deterministicStage === "login") return "login";
  if (sample.formDetected || sample.deterministicStage === "application_form") {
    return "application_form";
  }
  if (sample.deterministicStage === "job_detail") return "job_detail";
  return "unknown";
}

export function advanceApplicationPageReadiness(
  previous: ApplicationPageReadinessState | null,
  sample: ApplicationPageReadinessSample,
  waitedMs: number,
  registration: ApplicationPageReadinessRegistration
): ApplicationPageReadinessDecision {
  const pageStage = classifyApplicationPageReadinessSample(sample);
  // Some React recruiting pages replace their root node while an already
  // rendered form remains structurally unchanged. Root replacement is useful
  // transition evidence for shells and job-detail pages, but requiring that
  // volatile identity to stabilize can make a valid application form wait
  // until timeout. The caller derives stableFormKey from the live form fields,
  // so an actual form-structure change still resets readiness.
  const transitionKey = pageStage === "application_form" && sample.stableFormKey
    ? sample.stableFormKey
    : sample.transitionKey ?? pageStage;
  const consecutiveReads = previous?.pageStage === pageStage &&
    previous.transitionKey === transitionKey
    ? previous.consecutiveReads + 1
    : 1;
  const observationCount = (previous?.observationCount ?? 0) + 1;
  const stableTerminalStage = registration.resolvedStages.includes(pageStage) &&
    consecutiveReads >= registration.stableReadCount;
  return {
    pageStage,
    consecutiveReads,
    observationCount,
    transitionKey,
    waitedMs,
    status: stableTerminalStage
      ? "resolved"
      : waitedMs >= registration.waitTimeoutMs
        ? "timed_out"
        : "waiting"
  };
}
