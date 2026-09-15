import type { ApplicationEntryNavigationOptions, ApplicationEntryNavigationResult } from "./page-adapter.js";

export interface TalentBrewEntryTarget {
  kind: "talentbrew_job_pair";
  text: string;
  href: string;
}

export interface TalentBrewEntryResult extends ApplicationEntryNavigationResult {
  taggedTarget?: TalentBrewEntryTarget;
}

/** Disposable repair prototype. The advanced-job template has a job-owned
 * header entry and a description entry. This does not relax generic entry
 * uniqueness. Probe selects this Driver before any interaction; failure after
 * selection must not fall through to a different Driver.
 * Keep this function self-contained for chrome.scripting.executeScript. */
export async function openTalentBrewApplicationFromDetailPage(
  options: ApplicationEntryNavigationOptions & {
    probeOnly?: boolean;
    expectedTarget?: { url: string; target: TalentBrewEntryTarget };
  } = {}
): Promise<TalentBrewEntryResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const path = /^\/job\/[^/]+\/[^/]+\/(\d+)\/(\d+)\/?$/.exec(location.pathname);
  const roots = [...document.querySelectorAll<HTMLElement>("body#advanced-job main#content")];
  const matched = location.protocol === "https:" && Boolean(path) && roots.length === 1;
  const result = (error: string | null, observationCount = 0, candidateCount = 0): TalentBrewEntryResult => ({
    matched, clicked: false, actionText: null, candidateCount, observationCount,
    waitedMs: Math.max(0, Date.now() - startedAt), error
  });
  const startedAt = Date.now();
  if (!matched || options.probeOnly) return result(null);
  if (options.expectedTarget && options.expectedTarget.url !== location.href) {
    return result("职位入口页面在点击前发生变化");
  }
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" ||
        current.matches("[hidden],[aria-hidden='true']")) return false;
    }
    return true;
  };
  const enabled = (element: HTMLElement) => !element.closest("[aria-disabled='true'],[inert]") &&
    !element.matches(":disabled") && getComputedStyle(element).pointerEvents !== "none";
  const root = roots[0]!;
  const timeout = options.expectedTarget ? 0 : Math.max(0, Math.min(30_000, options.waitTimeoutMs ?? 30_000));
  const poll = Math.max(10, Math.min(1_000, options.pollIntervalMs ?? 100));
  let observationCount = 0;
  let candidateCount = 0;
  do {
    observationCount += 1;
    if (location.pathname.match(/^\/job\/[^/]+\/[^/]+\/(\d+)\/(\d+)\/?$/)?.[0] !== path![0] ||
      !root.isConnected || (options.expectedTarget && location.href !== options.expectedTarget.url)) {
      return result("职位入口页面在等待时发生变化", observationCount);
    }
    // Recheck on every observation: an application/login form can appear
    // asynchronously while the old detail markup is still mounted.
    if (root.querySelector("input[type='file'],input[type='password'],form input,form select,form textarea")) {
      return result("当前区域已包含表单，不能作为公开职位入口操作", observationCount);
    }
    const descriptions = [...root.querySelectorAll<HTMLElement>(
      "section.job-description[data-selector-name='jobdetails']"
    )];
    const headers = [...root.querySelectorAll<HTMLElement>("section.ajd_header#ajd-header")];
    const links = [...document.querySelectorAll<HTMLAnchorElement>(
      "a.job-apply[data-selector-name='job-apply-link'][data-page-type='Job']"
    )].filter(visible);
    candidateCount = links.length;
    const description = descriptions[0];
    const header = headers[0];
    if (descriptions.length > 1 || headers.length > 1 || links.length > 2) {
      return result("职位入口结构或数量存在歧义", observationCount, links.length);
    }
    if (description && header && links.length === 2) {
      const top = links.filter(link => link.matches(".top") && !link.matches(".bottom") &&
        link.parentElement?.matches(".ajd_header__job-buttons") && header.contains(link));
      const bottom = links.filter(link => link.matches(".bottom") && !link.matches(".top") &&
        link.parentElement?.matches(".section5__job-description-button-container") && description.contains(link));
      const href = links[0]!.href;
      let destinationValid = false;
      try {
        const url = new URL(href);
        destinationValid = url.protocol === "https:" && !url.username && !url.password &&
          url.href !== location.href && /\/apply\/?$/.test(url.pathname);
      } catch { /* Invalid targets fail closed below. */ }
      const valid = top.length === 1 && bottom.length === 1 && visible(header) && visible(description) &&
        description.dataset.orgId === path![1] && description.dataset.jobId === path![2] &&
        /job description|职位描述|岗位职责/i.test(normalize(description.innerText)) && destinationValid &&
        links.every(link => root.contains(link) && enabled(link) && !link.closest("form") &&
          /^(?:apply|apply now)$/i.test(normalize(link.innerText)) &&
          link.dataset.jobOrganizationId === path![1] && link.dataset.jobId === path![2] &&
          link.href === href && link.dataset.applyUrl === href &&
          link.dataset.overrideCandidateCard === "False" && link.dataset.delayUrl === "False" &&
          !link.hasAttribute("download") && !link.hasAttribute("onclick") &&
          (!link.target || link.target === "_self"));
      if (!valid) return result("职位入口的岗位归属、目标或结构不一致", observationCount, links.length);
      const element = top[0]!;
      const target: TalentBrewEntryTarget = {
        kind: "talentbrew_job_pair", text: normalize(element.innerText), href
      };
      if (options.expectedTarget && (options.expectedTarget.target.kind !== target.kind ||
        options.expectedTarget.target.href !== href || options.expectedTarget.target.text !== target.text)) {
        return result("职位入口目标在点击前发生变化", observationCount, links.length);
      }
      const navigation = { ...result(null, observationCount, links.length), actionText: target.text, taggedTarget: target };
      if (!options.expectedTarget) return navigation;
      // The page may opt into smooth scrolling. Resolve that movement before
      // measuring; the trusted pointer's hover pause must not age the point.
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      const rect = element.getBoundingClientRect();
      const x = rect.left + Math.min(24, rect.width / 2);
      const y = rect.top + Math.min(12, rect.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { ...navigation, trustedTarget: {
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
        hitInsideTarget: Boolean(hit && (hit === element || element.contains(hit)))
      } };
    }
    if (Date.now() - startedAt >= timeout) break;
    await new Promise(resolve => setTimeout(resolve, poll));
  } while (true);
  return result("职位入口未在规定时间内形成完整的岗位对应结构", observationCount, candidateCount);
}
