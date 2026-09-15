const mokaTenantPath = /^\/(?:social|campus)-recruitment\/[^/]+\/[^/]+(?:\/|$)/i;
const mokaApplyThanksRoute = /(?:^|[\/#])(?:campus_)?apply\/thanks(?:[/?#]|$)/i;
const mokaJobDetailHash = /^#\/job\/[a-f0-9-]+(?:\?.*)?$/i;
const xiaopengIndexApplicationPath = /^\/index\/(?:resume|position)\/([^/]+)\/applyv?\/?$/i;
const xiaopengIndexDetailPaths = [
  /^\/index\/position\/([^/]+)\/detail\/?$/i,
  /^\/index\/position\/detail\/([^/]+)\/?$/i
] as const;
const xiaopengCampusApplicationPath = /^\/(?:campus\/)?resume\/([^/]+)\/apply\/?$/i;
const xiaopengCampusDetailPaths = [
  /^\/campus\/position\/([^/]+)\/detail\/?$/i,
  /^\/campus\/position\/detail\/([^/]+)\/?$/i
] as const;
const feishuJobDetailPaths = [
  /^\/(?:[^/]+\/)?position\/([^/]+)\/detail\/?$/i,
  /^\/(?:[^/]+\/)?position\/detail\/([^/]+)\/?$/i
] as const;
const localXiaopengApplicationPath = "/__recruiting_ai_test__/xiaopeng/apply";

function xiaopengJobIdFromPath(pathname: string): string {
  return xiaopengIndexApplicationPath.exec(pathname)?.[1] ??
    xiaopengIndexDetailPaths
      .map((pattern) => pattern.exec(pathname)?.[1] ?? "")
      .find(Boolean) ??
    xiaopengCampusApplicationPath.exec(pathname)?.[1] ??
    xiaopengCampusDetailPaths
      .map((pattern) => pattern.exec(pathname)?.[1] ?? "")
      .find(Boolean) ?? "";
}

export function isXiaopengJobDetailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "xiaopeng.jobs.feishu.cn" &&
      [...xiaopengIndexDetailPaths, ...xiaopengCampusDetailPaths]
        .some((pattern) => pattern.test(url.pathname));
  } catch {
    return false;
  }
}

export function isFeishuJobDetailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(?:^|\.)jobs\.feishu\.cn$/i.test(url.hostname) &&
      feishuJobDetailPaths.some((pattern) => pattern.test(url.pathname));
  } catch {
    return false;
  }
}

export function isMokaJobDetailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "app.mokahr.com" &&
      mokaTenantPath.test(url.pathname) && mokaJobDetailHash.test(url.hash);
  } catch {
    return false;
  }
}

export function isXiaopengApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === localXiaopengApplicationPath) return true;
    return url.hostname === "xiaopeng.jobs.feishu.cn" && Boolean(xiaopengJobIdFromPath(url.pathname));
  } catch {
    return false;
  }
}

function xiaopengApplicationIdentity(value: string): { origin: string; jobId: string } | null {
  try {
    const url = new URL(value);
    if (["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === localXiaopengApplicationPath) {
      const jobId = url.searchParams.get("jobId") ?? "local-xiaopeng";
      return { origin: url.origin, jobId };
    }
    if (url.hostname !== "xiaopeng.jobs.feishu.cn") return null;
    const jobId = xiaopengJobIdFromPath(url.pathname);
    return jobId ? { origin: url.origin, jobId } : null;
  } catch {
    return null;
  }
}

export function isMokaApplicationSuccessUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === "/__recruiting_ai_test__/moka/thanks") return true;
    return url.hostname === "app.mokahr.com" &&
      mokaApplyThanksRoute.test(`${url.pathname}${url.hash}`);
  } catch {
    return false;
  }
}

export interface AutoApplyTerminalNavigation {
  outcome: "succeeded";
  url: string;
  observedAt: string;
}

export function isFeishuApplicationSuccessUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(?:^|\.)jobs\.feishu\.cn$/i.test(url.hostname) &&
      /^\/(?:[^/]+\/)?resume\/applied\/?$/i.test(url.pathname);
  } catch { return false; }
}

/**
 * Capture an authoritative terminal route from Chrome's navigation event.
 *
 * Moka can close a script-opened application tab immediately after navigating
 * to its thanks route. Reading the DOM after that close is inherently racy, so
 * the URL carried by tabs.onUpdated must be retained before any asynchronous
 * reconciliation starts.
 */
export function autoApplyTerminalNavigationFromUrl(
  value: string,
  observedAt = new Date().toISOString()
): AutoApplyTerminalNavigation | null {
  return isMokaApplicationSuccessUrl(value) || isFeishuApplicationSuccessUrl(value)
    ? { outcome: "succeeded", url: value, observedAt }
    : null;
}

export function autoApplyTabUrlMatchesApplication(
  currentValue: string,
  applicationValue: string
): boolean {
  if (currentValue === applicationValue) return true;
  try {
    const current = new URL(currentValue);
    const application = new URL(applicationValue);
    if (current.origin !== application.origin) return false;
    const currentXiaopeng = xiaopengApplicationIdentity(currentValue);
    const applicationXiaopeng = xiaopengApplicationIdentity(applicationValue);
    if (applicationXiaopeng) {
      return Boolean(currentXiaopeng && currentXiaopeng.jobId === applicationXiaopeng.jobId);
    }
    if (application.hostname !== "app.mokahr.com" || !mokaTenantPath.test(application.pathname)) {
      return false;
    }
    const applicationTenant = application.pathname.match(mokaTenantPath)?.[0]?.replace(/\/+$/, "") ?? "";
    const currentTenant = current.pathname.match(mokaTenantPath)?.[0]?.replace(/\/+$/, "") ?? "";
    if (currentTenant && currentTenant !== applicationTenant) return false;
    if (isMokaApplicationSuccessUrl(currentValue)) return true;
    if (currentTenant !== applicationTenant) return false;
    const expectedJob = application.hash.match(/#\/job\/([a-f0-9-]+)\/apply/i)?.[1] ?? "";
    const currentJob = current.hash.match(/#\/job\/([a-f0-9-]+)\/apply/i)?.[1] ?? "";
    if (expectedJob && currentJob && expectedJob === currentJob) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * The persisted batchJobId -> tabId binding is stronger than generic URL
 * discovery. Only that exact bound tab may remain associated with a Feishu
 * task while the site redirects it through a login route.
 */
export function autoApplyBoundTabUrlMatchesApplication(
  currentValue: string,
  applicationValue: string
): boolean {
  try {
    const application = new URL(applicationValue);
    if (/(?:^|\.)jobs\.feishu\.cn$/i.test(application.hostname)) {
      const current = new URL(currentValue);
      if (current.origin !== application.origin) return false;
      const identity = (url: URL, inheritedScope = "") => {
        const match = /^\/(?:(?<scope>[^/]+)\/)?(?:position\/(?<detailJob>[^/]+)\/detail|position\/detail\/(?<legacyJob>[^/]+)|(?:resume|position)\/(?<applyJob>[^/]+)\/applyv?)\/?$/i.exec(url.pathname);
        if (!match?.groups) return null;
        return { scope: match.groups.scope ?? inheritedScope,
          job: match.groups.detailJob ?? match.groups.legacyJob ?? match.groups.applyJob };
      };
      const expected = identity(application);
      if (!expected) return currentValue === applicationValue;
      if (isFeishuApplicationSuccessUrl(currentValue)) {
        const receiptScope = /^\/(?:(?<scope>[^/]+)\/)?resume\/applied\/?$/i.exec(current.pathname)?.groups?.scope ?? "";
        return receiptScope === expected.scope;
      }
      const login = /^\/(?:(?<scope>[^/]+)\/)?(?:login|signin|sign-in)\/?$/i.exec(current.pathname);
      const redirect = current.searchParams.get("redirect_path") || current.searchParams.get("redirect");
      if (login && (!redirect || (login.groups?.scope ?? "") !== expected.scope)) return false;
      const destination = login ? new URL(redirect!, current.origin) : current;
      if (destination.origin !== application.origin) return false;
      const actual = identity(destination, login ? expected.scope : "");
      return Boolean(actual && actual.scope === expected.scope && actual.job === expected.job);
    }
  } catch {
    return false;
  }
  return autoApplyTabUrlMatchesApplication(currentValue, applicationValue);
}

/** A Feishu receipt has no job id. Only a navigation after this bound attempt's
 * durable submit intent can be retained as its terminal result. Moka's existing
 * registered-navigation behavior is unchanged. URL discovery never uses this. */
export function autoApplyTerminalNavigationMatchesSubmission(
  terminal: AutoApplyTerminalNavigation,
  applicationUrl: string,
  submittedAt?: string | null
): boolean {
  if (!autoApplyBoundTabUrlMatchesApplication(terminal.url, applicationUrl)) return false;
  if (!isFeishuApplicationSuccessUrl(terminal.url)) return true;
  const submitted = Date.parse(submittedAt ?? "");
  const observed = Date.parse(terminal.observedAt);
  return Number.isFinite(submitted) && Number.isFinite(observed) && observed >= submitted;
}

/**
 * Local submit-boundary acceptance may be rerun against the same already-open
 * page after the harness has restarted and generated new batch identifiers.
 * Only an exact URL is eligible; callers must additionally enforce the local
 * validation, stop-before-submit and final-submit-disabled safety boundary.
 */
export function selectExactLocalValidationTab<T extends { id?: number; url?: string }>(
  tabs: T[],
  applicationUrl: string
): T | undefined {
  const matches = tabs.filter((tab) => tab.id !== undefined && tab.url === applicationUrl);
  return matches.length === 1 ? matches[0] : undefined;
}
