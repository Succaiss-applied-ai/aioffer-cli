import type { ControlAdapterDiagnostic, FieldInformationRequirement } from "./control-adapters/types.js";
import type { ApplicationPageStage } from "./application-page-readiness.js";
import type { TrustedPointerViewportTarget } from "./trusted-pointer-driver.js";
import { readApplicationReceiptInPage } from "./application-receipt.js";
import { submissionActionPatterns, type SubmissionActionPatterns } from "./submission-action-policy.js";

export interface PageFieldObservation {
  informationRequirement?: FieldInformationRequirement;
  /** Supplemental UI only; never establishes the site's date precision or Driver. */
  supplementalInputType?: "date";
  /** Enriched from the unique live registration; not a field-routing hint. */
  optionSource?: "search";
  /** Fresh page provenance for request-time Driver resolution; never an identity or answer key. */
  controlApplicationUrl?: string;
  optionMultiplicity?: "multiple";
  supplementalRegionInput?: boolean;
  fieldId: string;
  stableFieldKey?: string;
  /** Physical provenance from an observed ATS field; never inferred from an answer. */
  fieldSource?: {
    dialect: "feishu_formily" | "feishu_atsx";
    fieldPath: string;
    moduleId: string | null;
    groupIndex: number | null;
    edge?: "start" | "end";
  };
  selector: string;
  label: string;
  sectionKey?: string;
  groupIndex?: number | null;
  labelPath?: string[];
  controlKind?: string;
  /** Ephemeral shape proved by a field-owned, non-writing popup discovery. */
  observedControlKind?: "atsx_flat" | "atsx_city_tree" | "formily_radio_group" | "moka_range_present" | "formily_selector_flat" | "formily_location_tree";
  domHints?: {
    tagName?: string;
    ownedInputCount?: number;
    multiple?: boolean;
    readOnly?: boolean;
    inputType?: string;
    role?: string | null;
    ariaHasPopup?: string | null;
    ariaAutocomplete?: string | null;
    disabled?: boolean;
    fieldLabel?: string;
    name?: string | null;
    dataFieldName?: string | null;
    dataFieldId?: string | null;
    placeholder?: string | null;
    ariaControls?: string | null;
    ariaOwns?: string | null;
    ariaLabel?: string | null;
    testId?: string | null;
    classNames?: string[];
    ancestorIds?: string[];
  };
  popupBinding?: {
    controls?: string | null;
    owns?: string | null;
    listboxId?: string | null;
    expanded?: boolean;
  } | null;
  dateRange?: { kind: "moka_year_month"; role: "start" | "end" | "present"; groupKey: string; ongoing: boolean; fieldScoped: boolean };
  temporal?: {
    groupKey: string;
    layout: "year_month" | "year_month_range";
    edge: "single" | "start" | "end";
    part: "year" | "month";
    scope?: "field";
  } | null;
  compound?:
    | {
        kind: "identity_document";
        role: "type" | "number";
        groupKey: string;
      }
    | {
        kind: "phone_number";
        role: "calling_code" | "number";
        groupKey: string;
        /** Editable Select query text is transient and is never a committed calling code. */
        queryValue?: string;
      };
  type: string;
  required: boolean;
  requiredSource?: "explicit" | "inferred" | "none";
  options: string[];
  nativeSelectedOptions?: Array<{ value: string; label: string }>;
  currentValue: string;
  /**
   * A validation message owned by this field's smallest form wrapper. This is
   * intentionally separate from page-level validationMessages: a custom
   * control can display a value while the ATS still rejects that field.
   */
  validationMessage?: string | null;
  /** Some observed fields require their owned validation to clear on commit. */
  requiresValidationClear?: boolean;
}

export interface PageFieldOptionDiscoveryTarget {
  fieldId: string;
  stableFieldKey?: string;
  selector: string;
  label: string;
}

export interface PageFieldOptionDiscoveryResult {
  fieldId: string;
  stableFieldKey?: string;
  options: string[];
}

export interface PageActionObservation {
  actionId: string;
  selector: string;
  text: string;
  kind: "resume_parse" | "login" | "navigation" | "neutral" | "final_submit" | "consent";
  risk: "safe" | "user_only";
  disabled: boolean;
  context: string;
  requiresConsent?: boolean;
}

export interface PageObservation {
  /** Browser-supplied document identity; never read from page content. */
  documentId?: string;
  url: string;
  title: string;
  pageStage: ApplicationPageStage;
  pageStageEvidence: string[];
  loginRequired: boolean;
  loginReason: string | null;
  formDetected: boolean;
  unavailableReason?: "explicit_unavailable" | "empty_application_shell" | null;
  jobDetailDetected: boolean;
  applicationEntry?: {
    registrationId: "workday.manual-application-entry.v1";
    selector: string;
    text: string;
    href: string;
  };
  fingerprint: string;
  pageStateFingerprint: string;
  fields: PageFieldObservation[];
  actions: PageActionObservation[];
  submitCandidates: string[];
  validationMessages: string[];
  transientBusy: boolean;
  observedAt: string;
}

export type ApplicationUserActionType = "login" | "captcha" | "identity_verification";

export interface ApplicationUserAction {
  type: ApplicationUserActionType;
  message: string;
}

/**
 * Resolve a blocking page-level user action before form filling starts.
 *
 * Some ATS pages (notably Moka) render a complete public application form and
 * an optional, dismissible sign-in prompt at the same time. That prompt must
 * not turn an otherwise usable application form into a login-required result.
 * This function is deliberately self-contained because Chrome serializes it
 * into the target tab through scripting.executeScript.
 */
export function resolveApplicationUserAction(submitPolicy: SubmissionActionPatterns = submissionActionPatterns, allowOptionalLoginDismiss = true): ApplicationUserAction | null {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element: Element) => {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    const rect = html.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
      rect.width > 0 && rect.height > 0 && !html.closest("[hidden],[aria-hidden='true']");
  };
  const candidates = [...document.querySelectorAll<HTMLElement>(
    "[role='dialog'],[aria-modal='true'],[class*='modal'],[class*='Modal'],[class*='captcha'],[class*='Captcha'],iframe,form"
  )].filter(visible);
  const visibleControls = [...document.querySelectorAll<HTMLElement>(
    "button,[role='button'],input,select,textarea,iframe"
  )].filter(visible);
  // The observed Moka SDK uses yidun_* classes, including on English pages
  // without a dialog role or the word "captcha". Require the actual challenge
  // structure; a script, generic verification text, or preload is insufficient.
  const activeYidunPart = (element: Element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth;
  };
  const hasActiveYidunChallenge = [...document.querySelectorAll<HTMLElement>(".yidun")].some(root => {
    if (!activeYidunPart(root) || root.classList.contains("yidun--success")) return false;
    const owned = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)]
      .filter(part => part.closest(".yidun") === root && activeYidunPart(part));
    const slider = owned(".yidun_slider").some(part => part.getAttribute("aria-disabled") !== "true" &&
      !part.matches("[disabled]"));
    return slider && owned(".yidun_panel").length > 0 &&
      owned(".yidun_slide_indicator,.yidun_bgimg").length > 0;
  });
  const loginSurfaces = candidates.filter((candidate) => {
    const inputs = [...candidate.querySelectorAll<HTMLElement>("input,select,textarea")].filter(visible);
    const loginCta = [...candidate.querySelectorAll<HTMLElement>(
      "button,[role='button'],input[type='submit'],input[type='button']"
    )].filter(visible).some((control) => {
      const text = normalize(control instanceof HTMLInputElement
        ? control.value
        : control.innerText || control.getAttribute("aria-label"));
      return /^(?:登录|登录\/?注册|验证码登录|手机号登录|扫码登录|sign\s*in|log\s*in)$/i.test(text);
    });
    return inputs.length <= 8 && loginCta;
  });
  const verificationLoginSurfaces = loginSurfaces.filter((surface) => {
    const surfaceText = normalize(surface.innerText);
    return /登录/i.test(surfaceText) &&
      /(?:获取|发送|重新获取)验证码|请输入(?:短信)?验证码|验证码登录/i.test(surfaceText);
  });
  const outsideLoginSurface = (element: Element) =>
    !loginSurfaces.some((surface) => surface.contains(element));
  const applicationControls = [...document.querySelectorAll<HTMLElement>("input,select,textarea")]
    .filter((control) => visible(control) && outsideLoginSurface(control) &&
      !(control instanceof HTMLInputElement && ["hidden", "password"].includes(control.type)));
  const applicationIdentitySignals = new Set(applicationControls.flatMap((control) => {
    const input = control as HTMLInputElement;
    const identity = normalize([
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute("aria-label"),
      input.labels ? [...input.labels].map((label) => label.innerText).join(" ") : ""
    ].join(" "));
    return [
      /姓名|name/i.test(identity) ? "name" : "",
      /手机|电话|mobile|phone/i.test(identity) ? "phone" : "",
      /邮箱|email/i.test(identity) ? "email" : "",
      /简历|附件|resume|\bcv\b/i.test(identity) ? "resume" : ""
    ].filter(Boolean);
  }));
  const hasResumeUpload = applicationControls.some((control) =>
    control instanceof HTMLInputElement && control.type === "file"
  );
  const hasFinalSubmit = visibleControls.some((control) => {
    if (!outsideLoginSurface(control)) return false;
    const text = normalize(control instanceof HTMLInputElement
      ? control.value
      : control.innerText || control.getAttribute("aria-label"));
    return new RegExp(submitPolicy.initial, "iu").test(text.normalize("NFKC")) &&
      !new RegExp(submitPolicy.forbidden, "iu").test(text.normalize("NFKC"));
  });
  const hasUsableApplicationForm = applicationControls.length >= 6 &&
    applicationIdentitySignals.size >= 2 && (hasResumeUpload || hasFinalSubmit);
  const dismissControl = hasUsableApplicationForm && verificationLoginSurfaces.length === 0
    ? loginSurfaces.flatMap((surface) => [...surface.querySelectorAll<HTMLElement>(
      "button,[role='button'],[aria-label],[title],[class*='close'],[class*='Close']"
    )].filter(visible)).find((control) => {
      const identity = normalize([
        control.innerText,
        control.getAttribute("aria-label"),
        control.getAttribute("title"),
        control.className
      ].join(" "));
      return /(?:^|\s)(?:关闭|取消|稍后|跳过|close|dismiss|×|✕|✖)(?:\s|$)/i.test(identity) ||
        /(?:modal|dialog)[-_ ]?close|close[-_ ]?(?:modal|dialog|button|btn|icon)/i.test(identity);
    })
    : undefined;
  if (allowOptionalLoginDismiss && dismissControl && !hasActiveYidunChallenge) {
    dismissControl.click();
    return null;
  }

  const focusedRegion = normalize(candidates.map((candidate) =>
    `${candidate.innerText || candidate.getAttribute("title") || ""} ${candidate.getAttribute("src") || ""}`
  ).join(" "));
  const controlText = normalize(visibleControls.map((candidate) =>
    `${candidate.innerText || candidate.getAttribute("aria-label") || candidate.getAttribute("placeholder") || ""} ${candidate.getAttribute("src") || ""}`
  ).join(" "));
  const evidenceText = `${focusedRegion} ${controlText}`;
  if (verificationLoginSurfaces.length > 0) {
    return { type: "login", message: "招聘网站要求手机号或验证码登录，请在已打开的投递页面完成登录后继续。" };
  }
  if (hasActiveYidunChallenge || /请完成安全验证|向右拖动滑块|滑块.{0,12}(?:拼图|验证)|网易易盾|图形验证码|短信验证码|captcha/i.test(evidenceText)) {
    return { type: "captcha", message: "招聘网站要求完成安全验证码，请在原投递页面完成验证，插件会继续确认投递结果。" };
  }
  if (/人脸识别|实名认证|身份验证|证件核验|活体检测/i.test(evidenceText)) {
    return { type: "identity_verification", message: "招聘网站要求完成人脸或身份验证，请在已打开的投递页面完成后继续。" };
  }
  const hasPassword = visibleControls.some((candidate) =>
    candidate instanceof HTMLInputElement && candidate.type === "password"
  );
  if (hasPassword || loginSurfaces.length > 0) {
    return { type: "login", message: "招聘网站要求登录，请在已打开的投递页面完成登录后继续。" };
  }
  return null;
}

export interface ResumeFilePayload {
  purpose?: "resume" | "portrait" | "portfolio" | "other";
  name: string;
  type: string;
  base64: string;
}

export interface ApplicationEntryNavigationResult {
  matched: boolean;
  clicked: boolean;
  actionText: string | null;
  entryTarget?: MokaApplicationEntryTarget;
  trustedTarget?: TrustedPointerViewportTarget;
  candidateCount: number;
  observationCount: number;
  waitedMs: number;
  error: string | null;
}

export interface ApplicationEntryNavigationOptions {
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  deferClick?: boolean;
}

export type MokaApplicationEntryTarget = "moka_equivalent_apply" | "moka_primary_apply" | "moka_span_pair_apply";

export interface MokaApplicationEntryNavigationOptions extends ApplicationEntryNavigationOptions {
  /** Re-run the same locator immediately before the trusted pointer, without waiting or clicking. */
  expectedTarget?: { url: string; kind: MokaApplicationEntryTarget };
}

/**
 * Generic public job-detail entry driver. It is deliberately limited to
 * pages with job-description evidence and without an application form. The
 * driver scans the whole DOM, then performs bounded background scrolling so
 * lazy-rendered entry controls can appear. It clicks only one exact entry
 * phrase; the caller must classify the resulting login/form state again.
 */
export async function openGenericApplicationFromDetailPage(
  options: { scrollSteps?: number; settleMs?: number; deferClick?: boolean } = {}
): Promise<ApplicationEntryNavigationResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
      rect.width > 0 && rect.height > 0 && !element.closest("[hidden],[aria-hidden='true']");
  };
  if (!/^https?:$/.test(location.protocol)) {
    return {
      matched: false,
      clicked: false,
      actionText: null,
      candidateCount: 0,
      observationCount: 0,
      waitedMs: 0,
      error: null
    };
  }
  const pageText = normalize(document.body?.innerText);
  const detailSignalCount = [
    /职位描述|岗位描述|工作描述|job description/i,
    /岗位职责|工作职责|职位职责|responsibilit/i,
    /任职要求|职位要求|岗位要求|任职资格|qualification|requirement/i
  ].filter((pattern) => pattern.test(pageText)).length;
  const fields = [...document.querySelectorAll<HTMLElement>("input,select,textarea,[contenteditable='true']")]
    .filter((element) => visible(element) &&
      !(element instanceof HTMLInputElement && ["hidden", "search"].includes(element.type)));
  const fieldIdentity = normalize(fields.map((field) => {
    const input = field as HTMLInputElement;
    return [input.name, input.id, input.placeholder, input.getAttribute("aria-label")].filter(Boolean).join(" ");
  }).join(" "));
  const hasApplicationForm = fields.some((field) =>
    field instanceof HTMLInputElement && field.type === "file"
  ) || fields.filter((field) => field.matches(":required,[aria-required='true']")).length >= 2 ||
    [/姓名|name/i, /手机|电话|mobile|phone/i, /邮箱|email/i, /简历|附件|resume|\bcv\b/i]
      .filter((pattern) => pattern.test(fieldIdentity)).length >= 2;
  const loginPage = /(?:^|[\/#?])(?:login|signin|sign-in)(?:[\/#?]|$)/i.test(location.href) ||
    fields.some((field) => field instanceof HTMLInputElement && field.type === "password");
  if (detailSignalCount < 1 || hasApplicationForm || loginPage) {
    return {
      matched: false,
      clicked: false,
      actionText: null,
      candidateCount: 0,
      observationCount: 1,
      waitedMs: 0,
      error: null
    };
  }
  const startedAt = Date.now();
  const originalScrollY = window.scrollY;
  const scrollSteps = Math.max(1, Math.min(8, Math.floor(options.scrollSteps ?? 5)));
  const settleMs = Math.max(50, Math.min(1_000, Math.floor(options.settleMs ?? 200)));
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const entryPattern = /^(?:投递|立即投递|投递简历|立即投递简历|申请|立即申请|申请职位|申请岗位|去申请|马上申请|apply|apply now|apply for this job)$/i;
  let observationCount = 0;
  for (let step = 0; step <= scrollSteps; step += 1) {
    observationCount += 1;
    const controls = [...document.querySelectorAll<HTMLElement>(
      "button,[role='button'],a[href],input[type='button'],input[type='submit']"
    )].filter((element) => visible(element) && !element.matches(":disabled,[aria-disabled='true']"));
    const candidates = controls.map((element) => ({
      element,
      text: normalize(element instanceof HTMLInputElement
        ? element.value
        : element.innerText || element.getAttribute("aria-label"))
    })).filter(({ element, text }) => entryPattern.test(text) &&
      !(element.matches("button[type='submit'],input[type='submit']") &&
        element.closest("form")?.querySelector("input,select,textarea")));
    if (candidates.length > 1) {
      window.scrollTo({ top: originalScrollY, behavior: "instant" });
      return {
        matched: true,
        clicked: false,
        actionText: candidates.map(({ text }) => text).join("；"),
        candidateCount: candidates.length,
        observationCount,
        waitedMs: Math.max(0, Date.now() - startedAt),
        error: "职位详情页存在多个投递入口或申请入口，已停止自动点击"
      };
    }
    if (candidates.length === 1) {
      const target = candidates[0]!;
      target.element.scrollIntoView({ block: "center", inline: "nearest" });
      if (!options.deferClick) target.element.click();
      return {
        matched: true,
        clicked: !options.deferClick,
        actionText: target.text,
        candidateCount: 1,
        observationCount,
        waitedMs: Math.max(0, Date.now() - startedAt),
        error: null
      };
    }
    if (step === scrollSteps) break;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({
      top: Math.round(maxScroll * ((step + 1) / scrollSteps)),
      behavior: "instant"
    });
    await delay(settleMs);
  }
  window.scrollTo({ top: originalScrollY, behavior: "instant" });
  return {
    matched: false,
    clicked: false,
    actionText: null,
    candidateCount: 0,
    observationCount,
    waitedMs: Math.max(0, Date.now() - startedAt),
    error: null
  };
}

/**
 * Moka public job details can repeat the primary "申请职位" control in an
 * affixed header, the job-operation area, and the footer. The job-operation
 * control is the semantic primary entry when it is present; otherwise a
 * documented header/footer equivalent pair is accepted. Keep that exception
 * inside the Moka driver: the generic driver remains fail-closed on duplicate
 * actions. The background owns the single trusted-pointer click after this
 * driver has verified the exact control.
 */
export async function openMokaApplicationFromDetailPage(
  options: MokaApplicationEntryNavigationOptions = {}
): Promise<ApplicationEntryNavigationResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const mokaDetailPath = /^\/(?:social|campus)-recruitment\/[^/]+\/[^/]+\/?$/i;
  const mokaDetailHash = /^#\/job\/[a-f0-9-]+(?:\?.*)?$/i;
  if ((options.expectedTarget && location.href !== options.expectedTarget.url) || location.hostname !== "app.mokahr.com" ||
    !mokaDetailPath.test(location.pathname) || !mokaDetailHash.test(location.hash)) {
    return {
      matched: false,
      clicked: false,
      actionText: null,
      candidateCount: 0,
      observationCount: 0,
      waitedMs: 0,
      error: null
    };
  }
  const waitTimeoutMs = options.expectedTarget ? 0 : Math.max(0, Math.min(60_000, Math.floor(options.waitTimeoutMs ?? 30_000)));
  const pollIntervalMs = Math.max(50, Math.min(1_000, Math.floor(options.pollIntervalMs ?? 100)));
  const startedAt = Date.now();
  const deadline = startedAt + waitTimeoutMs;
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
      rect.width > 0 && rect.height > 0 && !element.closest("[hidden],[aria-hidden='true']");
  };
  const isMokaApplyButton = (element: HTMLElement) => {
    if (!(element instanceof HTMLButtonElement) || element.type !== "button") return false;
    const classes = String(element.className || "");
    return normalize(element.innerText || element.getAttribute("aria-label")) === "申请职位" &&
      classes.includes("sd-Button-container") && classes.includes("button-container-");
  };
  const isMokaPrimaryOperationButton = (element: HTMLElement) =>
    Boolean(element.closest("[class*='operate-btn-']"));
  const hasClassPrefix = (element: HTMLElement, prefix: string) =>
    [...element.classList].some((token) => token.startsWith(prefix));
  // Moka's older public-detail template uses SPAN controls, not native buttons.
  // Register the header/footer pair and its shared job root, not arbitrary spans
  // with an apply-looking label. No tenant name selects this template.
  const isMokaSpanApply = (element: HTMLElement) => element.tagName === "SPAN" &&
    normalize(element.innerText || element.getAttribute("aria-label")) === "申请职位" &&
    hasClassPrefix(element, "button-") && hasClassPrefix(element, "apply-btn-header-") &&
    getComputedStyle(element).cursor === "pointer";
  let observationCount = 0;
  const entryResult = (element: HTMLElement, kind: MokaApplicationEntryTarget, candidateCount: number): ApplicationEntryNavigationResult => {
    const result: ApplicationEntryNavigationResult = {
      matched: true, clicked: false, actionText: "申请职位", entryTarget: kind,
      candidateCount, observationCount, waitedMs: Math.max(0, Date.now() - startedAt), error: null
    };
    if (options.expectedTarget && options.expectedTarget.kind !== kind) {
      return { ...result, error: "Moka职位入口结构在点击前发生变化，已停止自动点击" };
    }
    element.scrollIntoView({ block: "center", inline: "nearest" });
    if (options.expectedTarget) {
      const rect = element.getBoundingClientRect();
      const x = rect.left + Math.min(24, rect.width / 2);
      const y = rect.top + Math.min(12, rect.height / 2);
      const hit = document.elementFromPoint(x, y);
      result.trustedTarget = {
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
        hitInsideTarget: Boolean(hit && (hit === element || element.contains(hit)))
      };
    }
    return result;
  };
  while (true) {
    observationCount += 1;
    const controls = [...document.querySelectorAll<HTMLElement>("button,span")]
      .filter((element) => visible(element) && !element.closest(":disabled,[disabled],[aria-disabled='true']"));
    const buttons = controls.filter(isMokaApplyButton);
    const spans = controls.filter(isMokaSpanApply);
    const candidates = [...buttons, ...spans];
    const waitedMs = Math.max(0, Date.now() - startedAt);
    const primaryOperationCandidates = buttons.filter(isMokaPrimaryOperationButton);
    if (spans.length === 0 && primaryOperationCandidates.length === 1) {
      return entryResult(primaryOperationCandidates[0]!, "moka_primary_apply", candidates.length);
    }
    if (spans.length === 0 && buttons.length === 2 && primaryOperationCandidates.length === 0) {
      return entryResult(buttons[0]!, "moka_equivalent_apply", 2);
    }
    if (buttons.length === 0 && spans.length === 2) {
      const header = spans.filter((element) => element.parentElement && hasClassPrefix(element.parentElement, "job-info-"));
      const footer = spans.filter((element) => element.parentElement && hasClassPrefix(element.parentElement, "footer-"));
      const root = header[0]?.closest("[class*='job-details-']");
      if (header.length === 1 && footer.length === 1 && root && root === footer[0]!.closest("[class*='job-details-']")) {
        return entryResult(header[0]!, "moka_span_pair_apply", 2);
      }
    }
    if (candidates.length > 0) {
      return {
        matched: true,
        clicked: false,
        actionText: "申请职位",
        candidateCount: candidates.length,
        observationCount,
        waitedMs,
        error: `Moka职位详情页申请入口数量异常或结构未登记（${candidates.length}），已停止自动点击`
      };
    }
    if (Date.now() >= deadline) {
      return {
        matched: true,
        clicked: false,
        actionText: null,
        candidateCount: 0,
        observationCount,
        waitedMs,
        error: `Moka职位详情页等待已登记申请入口渲染超时（${waitedMs}ms，readyState=${document.readyState}，候选入口=0）`
      };
    }
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
}

/**
 * Feishu career tenants share a route family but not a single company host.
 * This driver is intentionally narrower than the generic detail driver: it
 * runs only after the universal classifier has proved this is a job-detail
 * page, waits for Feishu's delayed React render, and returns one verified
 * entry for a browser-trusted click owned by the background coordinator.
 */
export async function openFeishuApplicationFromDetailPage(
  options: ApplicationEntryNavigationOptions = {}
): Promise<ApplicationEntryNavigationResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const detailPaths = [
    /^\/(?:[^/]+\/)?position\/[^/]+\/detail\/?$/i,
    /^\/(?:[^/]+\/)?position\/detail\/[^/]+\/?$/i
  ];
  if (!/(?:^|\.)jobs\.feishu\.cn$/i.test(location.hostname) ||
    !detailPaths.some((pattern) => pattern.test(location.pathname))) {
    return {
      matched: false,
      clicked: false,
      actionText: null,
      candidateCount: 0,
      observationCount: 0,
      waitedMs: 0,
      error: null
    };
  }
  const waitTimeoutMs = Math.max(0, Math.min(60_000, Math.floor(options.waitTimeoutMs ?? 30_000)));
  const pollIntervalMs = Math.max(50, Math.min(1_000, Math.floor(options.pollIntervalMs ?? 100)));
  const startedAt = Date.now();
  const deadline = startedAt + waitTimeoutMs;
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
      rect.width > 0 && rect.height > 0 && !element.closest("[hidden],[aria-hidden='true']");
  };
  let observationCount = 0;
  while (true) {
    observationCount += 1;
    const controls = [...document.querySelectorAll<HTMLElement>(
      "button,[role='button'],a[href],input[type='button'],input[type='submit']"
    )].filter((element) => visible(element) &&
      !element.matches(":disabled,[aria-disabled='true']"));
    const textCandidates = controls.map((element) => ({
      element,
      text: normalize(element instanceof HTMLInputElement
        ? element.value
        : element.innerText || element.getAttribute("aria-label"))
    })).filter(({ text }) => /^(?:投递|立即投递|投递简历|立即申请|申请职位)$/.test(text));
    const feishuPrimary = textCandidates.filter(({ element }) =>
      element instanceof HTMLButtonElement && element.type === "button" &&
      String(element.className || "").includes("apply-block-applyBtn")
    );
    const candidates = feishuPrimary.length === 1 ? feishuPrimary : textCandidates;
    const waitedMs = Math.max(0, Date.now() - startedAt);
    if (candidates.length > 1) {
      return {
        matched: true,
        clicked: false,
        actionText: candidates.map(({ text }) => text).join("；"),
        candidateCount: candidates.length,
        observationCount,
        waitedMs,
        error: "飞书职位详情页存在多个投递入口，已停止自动点击"
      };
    }
    if (candidates.length === 1) {
      const target = candidates[0]!;
      target.element.scrollIntoView({ block: "center", inline: "nearest" });
      return {
        matched: true,
        // Application entry is always executed by the background-owned
        // trusted-pointer Driver. A synthetic DOM click can report success
        // while the real Feishu application route remains unchanged.
        clicked: false,
        actionText: target.text,
        candidateCount: 1,
        observationCount,
        waitedMs,
        error: null
      };
    }
    if (Date.now() >= deadline) {
      return {
        matched: true,
        clicked: false,
        actionText: null,
        candidateCount: 0,
        observationCount,
        waitedMs,
        error: `飞书职位详情页等待唯一投递入口渲染超时（${waitedMs}ms，readyState=${document.readyState}，可见控件=${controls.length}）`
      };
    }
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
}

/**
 * Xiaopeng campus discovery returns a public job-detail URL rather than the
 * application form URL. Advancing from that page is navigation, not final
 * submission. Keep the permission narrow: only the two known detail routes
 * and exactly one visible, enabled application-entry control are accepted.
 * The caller must observe the destination again and stop for login/CAPTCHA.
 */
export async function openXiaopengApplicationFromDetailPage(
  options: ApplicationEntryNavigationOptions = {}
): Promise<ApplicationEntryNavigationResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
              const detailPaths = [
                /^\/(?:[^/]+\/)?position\/[^/]+\/detail\/?$/i,
                /^\/(?:[^/]+\/)?position\/detail\/[^/]+\/?$/i
  ];
  if (location.hostname !== "xiaopeng.jobs.feishu.cn" ||
    !detailPaths.some((pattern) => pattern.test(location.pathname))) {
    return {
      matched: false,
      clicked: false,
      actionText: null,
      candidateCount: 0,
      observationCount: 0,
      waitedMs: 0,
      error: null
    };
  }
  const waitTimeoutMs = Math.max(0, Math.min(60_000, Math.floor(options.waitTimeoutMs ?? 30_000)));
  const pollIntervalMs = Math.max(50, Math.min(1_000, Math.floor(options.pollIntervalMs ?? 100)));
  const startedAt = Date.now();
  const deadline = startedAt + waitTimeoutMs;
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
      rect.width > 0 && rect.height > 0 && !element.closest("[hidden],[aria-hidden='true']");
  };
  let observationCount = 0;
  while (true) {
    observationCount += 1;
    const controls = [...document.querySelectorAll<HTMLElement>(
      "button,[role='button'],a[href],input[type='button'],input[type='submit']"
    )].filter((element) => visible(element) &&
      !element.matches(":disabled,[aria-disabled='true']"));
    const candidates = controls.map((element) => ({
      element,
      text: normalize(element instanceof HTMLInputElement
        ? element.value
        : element.innerText || element.getAttribute("aria-label"))
    })).filter(({ text }) => /^(?:投递|立即投递|立即申请|申请职位)$/.test(text));
    const waitedMs = Math.max(0, Date.now() - startedAt);
    if (candidates.length > 1) {
      return {
        matched: true,
        clicked: false,
        actionText: candidates.map(({ text }) => text).join("；"),
        candidateCount: candidates.length,
        observationCount,
        waitedMs,
        error: "小鹏职位详情页存在多个投递入口，已停止自动点击"
      };
    }
    if (candidates.length === 1) {
      const target = candidates[0]!;
      target.element.scrollIntoView({ block: "center", inline: "nearest" });
      return {
        matched: true,
        // The shared background coordinator owns the single trusted click.
        clicked: false,
        actionText: target.text,
        candidateCount: 1,
        observationCount,
        waitedMs,
        error: null
      };
    }
    if (Date.now() >= deadline) {
      return {
        matched: true,
        clicked: false,
        actionText: null,
        candidateCount: 0,
        observationCount,
        waitedMs,
        error: `小鹏职位详情页等待唯一投递入口渲染超时（${waitedMs}ms，readyState=${document.readyState}，visibility=${document.visibilityState}，可见控件=${controls.length}）`
      };
    }
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
}

export interface MokaIdentityFillResult {
  semanticKey: "fullName" | "phone" | "email";
  matched: number;
  verified: number;
}

/**
 * DeepSeek/Moka adapter fallback used immediately after the site's resume
 * parser runs. It deliberately targets only visible identity inputs with
 * explicit placeholders; every other field remains under the generic
 * observation + visual-planning runtime.
 */
export async function ensureMokaIdentityFields(input: {
  fullName?: string;
  phone?: string;
  email?: string;
}): Promise<MokaIdentityFillResult[]> {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const setControlledValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    element.focus();
    const oldValue = element.value;
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    const tracked = element as typeof element & { _valueTracker?: { setValue: (next: string) => void } };
    tracked._valueTracker?.setValue(oldValue);
    for (const type of ["input", "change", "blur"]) {
      element.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    }
  };
  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")]
    .filter((element) => visible(element) && !element.disabled && !element.readOnly && element.type !== "hidden");
  const specs: Array<{
    semanticKey: MokaIdentityFillResult["semanticKey"];
    value: string;
    match: (identity: string) => boolean;
  }> = [
    {
      semanticKey: "fullName",
      value: String(input.fullName ?? "").trim(),
      match: (identity) => /(?:^|\s|[：:])姓名(?:$|\s)|placeholder=姓名/i.test(identity) && !/公司|项目|学校/.test(identity)
    },
    {
      semanticKey: "phone",
      value: String(input.phone ?? "").trim(),
      match: (identity) => /手机号码|手机号|请输入手机号|\bmobile\b|\bphone\b/i.test(identity)
    },
    {
      semanticKey: "email",
      value: String(input.email ?? "").trim(),
      // One candidate email may legitimately fill both “邮箱” and optional
      // “个人邮箱”; each visible control is written and verified separately.
      match: (identity) => /邮箱|电子邮件|\bemail\b/i.test(identity)
    }
  ];
  const results: MokaIdentityFillResult[] = [];
  for (const spec of specs) {
    if (!spec.value) continue;
    const matches = controls.filter((element) => {
      const identity = [
        `placeholder=${element.placeholder}`,
        element.getAttribute("aria-label"),
        element.getAttribute("name"),
        element.labels ? [...element.labels].map((label) => label.innerText).join(" ") : "",
        element.closest<HTMLElement>(
          ".ant-form-item,.form-item,.form-group,[class*='formItem'],[class*='apply-field'],[class*='field']"
        )?.innerText
      ].filter(Boolean).join(" ");
      if (/紧急联系人|应急联系人|关系人(?:信息|姓名|名字|电话|手机|邮箱)|外部推荐人|推荐人|内推人|介绍人|联系人关系|与本人关系/i.test(identity)) {
        return false;
      }
      return spec.match(identity);
    });
    for (const element of matches) setControlledValue(element, spec.value);
    await delay(320);
    results.push({
      semanticKey: spec.semanticKey,
      matched: matches.length,
      verified: matches.filter((element) => element.value === spec.value).length
    });
  }
  return results;
}

export interface FillInstruction {
  /** Lossless, complete target set for a registered multi-choice Driver. */
  selectedOptionValues?: string[];
  fieldId: string;
  stableFieldKey?: string;
  selector: string;
  expectedLabel?: string;
  semanticKey?: string | null;
  popupBinding?: PageFieldObservation["popupBinding"];
  type: string;
  value: string | boolean;
  /** A product-authorized option rule; the selected Driver must revalidate the live field role. */
  optionSelectionPolicy?: "phone_calling_code_default" | "phone_calling_code_confirmed";
  rangeEndChoice?: boolean;
  dateValue?: {
    year: number;
    month: number;
    day: number;
  };
  datePrecision?: "day" | "month";
  file?: ResumeFilePayload;
  /** Locked by the central dispatcher; page execution may verify, never reroute. */
  controlAdapter?: ControlAdapterDiagnostic;
  applicationUrl?: string;
}

export interface FillResult {
  fieldId: string;
  success: boolean;
  expected: string;
  actual: string;
  error: string | null;
  driverStage?: string;
  driverFailureCode?: string | null;
  availableOptions?: string[];
  driverDiagnostics?: Record<string, unknown>;
  controlAdapter?: ControlAdapterDiagnostic;
}

export interface SiteResumeParserResult {
  triggered: boolean;
  actionText: string | null;
  confirmationText: string | null;
}

export interface PageActionExecutionResult {
  executed: boolean;
  actionId: string;
  actionText: string | null;
  confirmationText: string | null;
  error: string | null;
}

export interface FinalSubmitExecutionResult {
  executed: boolean;
  actionId: string | null;
  actionText: string | null;
  observedResult: "submitted_success" | "submitted_or_result_unknown" | "blocked_by_site_validation" |
    "blocked_by_site_policy" | "network_or_navigation_unknown" | "waiting_for_user_action" |
    "waiting_for_site_receipt";
  pageUrlAfterClick: string;
  error: string | null;
  trace?: string[];
  /** Positive evidence from this click, never a stale error or missing button. */
  siteValidationConfirmed?: boolean;
  rejectedFieldKeys?: string[];
  rejectedFields?: PageFieldObservation[];
  /** Transaction-local baseline retained for read-only late rejection detection. */
  validationMonitor?: { token: string; baseline: PageObservation; previouslyRejectedKeys?: string[] };
  nativeValidationErrors?: Array<{ fieldKey: string | null; message: string }>;
  userActionRequired?: {
    type: "login" | "captcha" | "identity_verification";
    message: string;
  };
  sitePolicyBlock?: {
    reasonCode: "site_application_limit_reached";
    message: string;
    source: "visible_site_policy";
  };
}

export interface AuthenticityDeclarationResult {
  found: boolean;
  checked: boolean;
  text: string | null;
  error: string | null;
}

export interface AuthorizedConsentExecutionResult {
  actionId: string;
  found: boolean;
  checked: boolean;
  changed: boolean;
  text: string | null;
  error: string | null;
}

export type DynamicSectionKind = "education" | "work" | "internship" | "project";

export interface DynamicSectionTargets {
  education: number;
  work: number;
  internship?: number;
  project: number;
  requiredSections?: DynamicSectionKind[];
}

export interface DynamicSectionPreparationResult {
  changed: boolean;
  added: Partial<Record<DynamicSectionKind, number>>;
  warnings: string[];
}

export function isSiteResumeParserActionText(text: string): boolean {
  return /解析简历|解析并填充|解析并覆盖|覆盖并解析|简历解析|重新解析|一键填充|自动填充|从简历填充|使用简历填充|parse resume|resume parse|fill from resume|use resume|autofill|auto fill|populate from resume/i.test(text) &&
    !/提交|投递|申请|同意|submit|apply|application|agree|consent|privacy/i.test(text);
}

/** Compatibility exports: ATS parsing is disabled; AI Offer supplies facts. */
export function shouldPrioritizeSiteResumeParser(_input: {
  resumeUploadedThisCycle: boolean;
  structuredResumeFieldsBlank: boolean;
}): boolean {
  return false;
}

export async function triggerSiteResumeParser(): Promise<SiteResumeParserResult> {
  return { triggered: false, actionText: null, confirmationText: null };
}

// Executes only an action that was previously observed and selected by ID.
// The live DOM text is verified again and final submit/consent actions are
// rejected regardless of what a model proposed.
export async function executeObservedPageAction(
  action: PageActionObservation
): Promise<PageActionExecutionResult> {
  if (action.kind === "resume_parse" || /解析|一键填充|自动填充|从简历填充|使用简历填充|parse.*resume|resume.*pars|fill from resume|use resume|autofill|auto fill|populate from resume/i.test(action.text)) {
    return { executed: false, actionId: action.actionId, actionText: action.text,
      confirmationText: null, error: "site_resume_parser_disabled: 使用 AI Offer 已解析的信息包" };
  }
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const isVisible = (candidate: Element) => {
    const style = getComputedStyle(candidate as HTMLElement);
    const rect = (candidate as HTMLElement).getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      rect.width > 0 && rect.height > 0 && !candidate.closest("[hidden],[aria-hidden='true']");
  };
  const liveActionText = (candidate: Element) => normalize(
    candidate instanceof HTMLInputElement
      ? candidate.value
      : (candidate as HTMLElement).innerText || candidate.getAttribute("aria-label")
  );
  const textMatches = (candidateText: string) => Boolean(candidateText) &&
    (candidateText === action.text || candidateText.includes(action.text) || action.text.includes(candidateText));
  let element = document.querySelector(action.selector) as HTMLElement | null;
  if (!element) return {
    executed: false, actionId: action.actionId, actionText: null,
    confirmationText: null, error: "动作控件已从页面消失"
  };
  const liveText = liveActionText(element);
  if (!isVisible(element)) {
    return { executed: false, actionId: action.actionId, actionText: liveText,
      confirmationText: null, error: "动作控件当前不可见" };
  }
  if (element.matches(":disabled,[aria-disabled='true']")) {
    return { executed: false, actionId: action.actionId, actionText: liveText,
      confirmationText: null, error: "动作控件当前不可用" };
  }
  if (!textMatches(liveText)) {
    return { executed: false, actionId: action.actionId, actionText: liveText,
      confirmationText: null, error: "动作控件文案已变化" };
  }
  if (/解析|一键填充|自动填充|从简历填充|使用简历填充|parse.*resume|resume.*pars|fill from resume|use resume|autofill|auto fill|populate from resume/i.test(liveText)) return {
    executed: false, actionId: action.actionId, actionText: liveText, confirmationText: null,
    error: "site_resume_parser_disabled: 不执行招聘网站简历解析"
  };
  if (action.risk !== "safe" ||
    /提交|投递|申请职位|确认申请|同意|隐私|授权|submit application|submit|apply now|send application|finish application|agree|consent|privacy|authorize/i.test(liveText)) {
    return { executed: false, actionId: action.actionId, actionText: liveText,
      confirmationText: null, error: "该动作必须由用户亲自完成" };
  }
  element.click();
  await delay(360);
  // One observed safe action only. Upload-triggered parsing belongs to the
  // website; never accept an unobserved parse/overwrite dialog here.

  return {
    executed: true,
    actionId: action.actionId,
    actionText: liveText,
    confirmationText: null,
    error: null
  };
}

export function isMokaAuthenticityDeclarationText(text: string): boolean {
  const compactText = text.replace(/\s+/g, "").replace(/[。.!！]/g, "");
  return ["本人确保以上所有信息真实有效", "本人已郑重承诺上述信息属实"].includes(compactText);
}

export function isXiaopengPrivacyConsentText(text: string): boolean {
  return text.replace(/\s+/g, "").replace(/[。.!！]/g, "") === "我已阅读并同意隐私政策";
}

/**
 * Executes one checkbox-like consent that was already observed on the page.
 *
 * This executor is deliberately separate from the model action executor: the
 * caller must hold the batch-level `allowConsentClick` authorization. It can
 * never click a submit control and it verifies the live checkbox state after
 * React/Vue has had time to commit the change.
 */
export async function executeAuthorizedConsentAction(
  action: PageActionObservation
): Promise<AuthorizedConsentExecutionResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const compact = (value: unknown) => normalize(value).replace(/\s+/g, "").replace(/[。.!！]/g, "");
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element: Element) => {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    const rect = html.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
      rect.width > 0 && rect.height > 0 && !html.closest("[hidden],[aria-hidden='true']");
  };
  const checked = (element: Element) => element instanceof HTMLInputElement
    ? element.checked
    : element.getAttribute("aria-checked") === "true" ||
      /(?:^|\s)(?:is-)?checked(?:\s|$)/i.test(String((element as HTMLElement).className ?? ""));
  const textOf = (element: Element) => normalize(
    element instanceof HTMLInputElement
      ? element.value
      : (element as HTMLElement).innerText || element.getAttribute("aria-label") || element.textContent
  );
  const semanticText = compact(`${action.text} ${action.context}`);
  const leafActionText = compact(action.text.split("·").at(-1));
  const textMatches = (value: string) => {
    const candidate = compact(value);
    const actionText = compact(action.text);
    return Boolean(candidate && actionText) &&
      (candidate === actionText || candidate.includes(actionText) || actionText.includes(candidate) ||
        semanticText.includes(candidate) || Boolean(leafActionText) &&
          (candidate === leafActionText || candidate.includes(leafActionText) || leafActionText.includes(candidate)));
  };
  const forbiddenSubmit = /预览并提交|确认提交|提交(?:简历|申请|投递)?|立即投递|申请职位|submit|apply now/i;
  const confirmVisiblePrivacyModal = async () => {
    const dialogs = [...document.querySelectorAll<HTMLElement>(
      "[role='dialog'],[aria-modal='true'],[class*='Modal'],[class*='modal']"
    )].filter((candidate) => visible(candidate));
    const dialog = dialogs.find((candidate) =>
      /隐私协议|个人信息保护政策|招聘数据处理声明|privacy\s*(?:policy|notice)/i.test(textOf(candidate))
    );
    if (!dialog) return false;
    const acceptance = [...dialog.querySelectorAll<HTMLElement>("button,[role='button']")]
      .filter((candidate) => visible(candidate))
      .find((candidate) => {
        const value = compact(textOf(candidate));
        return /^(?:我已阅读并同意|已阅读并同意|同意并继续|agreeandcontinue)$/i.test(value) &&
          !forbiddenSubmit.test(value);
      });
    if (!acceptance) return false;
    acceptance.click();
    await delay(420);
    return true;
  };

  if (action.kind !== "consent") {
    return { actionId: action.actionId, found: false, checked: false, changed: false,
      text: null, error: "动作不是协议勾选控件" };
  }
  if (action.disabled || forbiddenSubmit.test(action.text) && !/同意|协议|隐私|授权|声明|agree|consent|privacy/i.test(action.text)) {
    return { actionId: action.actionId, found: false, checked: false, changed: false,
      text: action.text, error: action.disabled ? "协议控件当前不可用" : "拒绝把提交按钮当作协议控件" };
  }

  const liveActionNode = () => {
    const selected = document.querySelector(action.selector) as HTMLElement | null;
    if (selected && visible(selected) && textMatches(textOf(selected))) return selected;
    return [...document.querySelectorAll<HTMLElement>("label,span,p,div,a,[role='checkbox']")]
      .filter((candidate) => visible(candidate) && textMatches(textOf(candidate)))
      .sort((left, right) => textOf(left).length - textOf(right).length)[0] ?? null;
  };
  const associatedText = (control: Element) => normalize([
    control.getAttribute("aria-label"),
    control instanceof HTMLInputElement && control.labels
      ? [...control.labels].map((label) => label.innerText).join(" ")
      : "",
    (control.closest("label") as HTMLElement | null)?.innerText,
    (control.parentElement as HTMLElement | null)?.innerText
  ].filter(Boolean).join(" "));
  const controlTextMatches = (value: string) => {
    const candidate = compact(value);
    const expected = leafActionText || compact(action.text);
    return Boolean(candidate && expected) && (
      candidate === expected || candidate.includes(expected) ||
      candidate.length >= 6 && expected.includes(candidate)
    );
  };
  const findLiveControl = () => {
    // Moka hides the native checkbox and rebuilds the surrounding React node
    // after validation. Rebind from the live input's associated label before
    // relying on the stale observed selector or section-prefixed action text.
    const globalMatches = [...document.querySelectorAll("input[type='checkbox'],[role='checkbox']")]
      .filter((candidate) => controlTextMatches(associatedText(candidate)));
    if (globalMatches.length === 1) {
      const control = globalMatches[0];
      const container = control.closest("label") as HTMLElement | null;
      return { node: container ?? control, control, container };
    }
    const node = liveActionNode();
    if (!node) return null;
    const direct = node.matches("input[type='checkbox'],[role='checkbox']") ? node : null;
    if (direct) return { node, control: direct, container: node.closest("label") as HTMLElement | null };
    const label = node.closest("label");
    if (label) {
      const byFor = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      const control = byFor?.matches("input[type='checkbox'],[role='checkbox']")
        ? byFor
        : label.querySelector("input[type='checkbox'],[role='checkbox']");
      if (control) return { node, control, container: label };
    }
    let container: HTMLElement | null = node;
    for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
      const controls = [...container.querySelectorAll("input[type='checkbox'],[role='checkbox']")]
        .filter((candidate) => textMatches(associatedText(candidate)) ||
          textMatches((container as HTMLElement).innerText));
      if (controls.length === 1) return { node, control: controls[0], container };
    }
    return globalMatches.length === 1
      ? { node, control: globalMatches[0], container: globalMatches[0].closest("label") as HTMLElement | null }
      : null;
  };
  const stablyChecked = async () => {
    const first = findLiveControl();
    if (!first || !checked(first.control)) return false;
    await delay(360);
    const second = findLiveControl();
    return Boolean(second && checked(second.control));
  };

  let live = findLiveControl();
  for (let attempt = 0; attempt < 8 && !live; attempt += 1) {
    await confirmVisiblePrivacyModal();
    await delay(120);
    live = findLiveControl();
  }
  // A privacy-policy link can be observed as a consent action even though it
  // is not a checkbox. It is not a submission blocker and must not be clicked.
  if (!live) return { actionId: action.actionId, found: false, checked: false, changed: false,
    text: action.text, error: null };
  const liveText = textOf(live.node) || action.text;
  const confirmedExistingModal = await confirmVisiblePrivacyModal();
  if (await stablyChecked()) return { actionId: action.actionId, found: true, checked: true,
    changed: confirmedExistingModal, text: liveText, error: null };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    live = findLiveControl();
    if (!live) break;
    const label = live.control.closest("label") as HTMLElement | null;
    const clickTarget = [
      label && visible(label) ? label : null,
      visible(live.control) ? live.control as HTMLElement : null,
      live.container && visible(live.container) ? live.container : null
    ].find((candidate): candidate is HTMLElement => Boolean(candidate));
    clickTarget?.click();
    await delay(160);
    await confirmVisiblePrivacyModal();
    if (await stablyChecked()) return { actionId: action.actionId, found: true, checked: true,
      changed: true, text: liveText, error: null };

    const rebound = findLiveControl();
    if (rebound?.control instanceof HTMLInputElement) {
      rebound.control.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
      if (setter) setter.call(rebound.control, true);
      else rebound.control.checked = true;
      rebound.control.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      rebound.control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      rebound.control.blur();
      if (await stablyChecked()) return { actionId: action.actionId, found: true, checked: true,
        changed: true, text: liveText, error: null };
    }
  }
  return { actionId: action.actionId, found: true, checked: false, changed: false,
    text: liveText, error: "协议勾选后未能稳定回读" };
}

// Xiaopeng exposes one fixed privacy checkbox immediately before submission.
// This is deliberately separate from the generic consent executor: callers
// must additionally enforce the Xiaopeng adapter, URL and an explicit
// allowConsentClick command. No other agreement text is accepted here.
export async function ensureXiaopengPrivacyConsent(): Promise<AuthenticityDeclarationResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const compact = (value: unknown) => normalize(value).replace(/\s+/g, "").replace(/[。.!！]/g, "");
  const expected = "我已阅读并同意隐私政策";
  const visible = (element: Element) => {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    const rect = html.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      style.opacity !== "0" && rect.width > 0 && rect.height > 0 &&
      !html.closest("[hidden],[aria-hidden='true']");
  };
  const checked = (element: Element) => element instanceof HTMLInputElement
    ? element.checked
    : element.getAttribute("aria-checked") === "true" ||
      /(?:^|\s)(?:is-)?checked(?:\s|$)/i.test((element as HTMLElement).className || "");
  const setNativeChecked = (input: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
    if (setter) setter.call(input, true);
    else input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  };
  const findConsentNode = () => [...document.querySelectorAll<HTMLElement>("label,span,p,div")]
    .filter((element) => compact(element.textContent || element.innerText) === expected)
    .filter(visible)
    .sort((left, right) => normalize(left.textContent || left.innerText).length -
      normalize(right.textContent || right.innerText).length)[0] ?? null;
  const findLiveControl = () => {
    const textNode = findConsentNode();
    if (!textNode) return null;
    let container: HTMLElement | null = textNode.closest("label") ?? textNode;
    for (let depth = 0; container && depth < 6; depth += 1, container = container.parentElement) {
      const control = container.matches("input[type='checkbox'],[role='checkbox']")
        ? container
        : container.querySelector<HTMLElement>("input[type='checkbox'],[role='checkbox']");
      if (control) return { textNode, container, control };
    }
    return null;
  };
  const stablyChecked = async () => {
    const first = findLiveControl();
    if (!first || !checked(first.control)) return false;
    await new Promise((resolve) => setTimeout(resolve, 360));
    const second = findLiveControl();
    return Boolean(second && checked(second.control));
  };

  let live = findLiveControl();
  for (let attempt = 0; attempt < 12 && !live; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    live = findLiveControl();
  }
  if (!live) return { found: false, checked: false, text: null, error: null };
  const text = normalize(live.textNode.textContent || live.textNode.innerText);
  if (compact(text) !== expected) {
    return { found: true, checked: false, text, error: "小鹏隐私政策文案不是允许自动勾选的固定文案" };
  }
  if (await stablyChecked()) return { found: true, checked: true, text, error: null };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    live = findLiveControl();
    if (!live) break;
    const clickTarget = [
      live.textNode.closest("label") as HTMLElement | null,
      visible(live.control) ? live.control : null,
      visible(live.container) ? live.container : null
    ].find((candidate): candidate is HTMLElement => Boolean(candidate && visible(candidate)));
    clickTarget?.click();
    if (await stablyChecked()) return { found: true, checked: true, text, error: null };
    const rebound = findLiveControl();
    if (rebound?.control instanceof HTMLInputElement) {
      setNativeChecked(rebound.control);
      if (await stablyChecked()) return { found: true, checked: true, text, error: null };
    }
  }
  return { found: true, checked: false, text, error: "未能稳定勾选小鹏隐私政策" };
}

export async function ensureMokaAuthenticityDeclaration(): Promise<AuthenticityDeclarationResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  // Moka commonly renders the required marker as a child of the declaration
  // label. Ignore that visual marker, but keep every other character exact so
  // a different consent cannot be mistaken for this fixed declaration.
  const compact = (value: unknown) => normalize(value)
    .replace(/\s+/g, "")
    .replace(/[。.!！＊*]/g, "");
  const visible = (element: Element) => {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    const rect = html.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      style.opacity !== "0" && rect.width > 0 && rect.height > 0 &&
      !html.closest("[hidden],[aria-hidden='true']");
  };
  const event = (element: Element, name: string) =>
    element.dispatchEvent(new Event(name, { bubbles: true, composed: true }));
  const setChecked = (input: HTMLInputElement, checked: boolean) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
    if (setter) setter.call(input, checked);
    else input.checked = checked;
    event(input, "input");
    event(input, "change");
  };
  const findDeclarationNode = () => [...document.querySelectorAll<HTMLElement>("label,div,span,p")]
    .filter((element) => compact(element.textContent || element.innerText).includes("本人确保以上所有信息真实有效"))
    .sort((left, right) => normalize(left.textContent || left.innerText).length -
      normalize(right.textContent || right.innerText).length)[0] ?? null;
  // Moka can rebuild the whole application block immediately after resume
  // parsing. A declaration observed in one stable read may disappear for a
  // short render gap before this guarded action runs, so bind to the live node
  // with a bounded retry rather than treating that transient as a policy stop.
  let declarationNode: HTMLElement | null = null;
  for (let attempt = 0; attempt < 20 && !declarationNode; attempt += 1) {
    declarationNode = findDeclarationNode();
    if (!declarationNode) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!declarationNode) return { found: false, checked: false, text: null, error: null };
  const text = normalize(declarationNode.textContent || declarationNode.innerText);
  // This function is injected with chrome.scripting.executeScript. Keep the
  // policy check self-contained: references to module-level helpers do not
  // exist in the target page's isolated execution world.
  if (compact(text) !== "本人确保以上所有信息真实有效") {
    return { found: true, checked: false, text, error: "真实性声明文案不是允许自动勾选的固定文案" };
  }
  const findLiveControl = () => {
    const inputs = [...document.querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    for (const checkbox of inputs) {
      const label = checkbox.closest("label");
      let container: HTMLElement | null = label ?? checkbox.parentElement;
      for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
        if (!compact(container.textContent || container.innerText).includes("本人确保以上所有信息真实有效")) continue;
        return { checkbox, label, container };
      }
    }
    return null;
  };
  const stablyChecked = async () => {
    const first = findLiveControl();
    if (!first?.checkbox.checked) return false;
    await new Promise((resolve) => setTimeout(resolve, 420));
    return Boolean(findLiveControl()?.checkbox.checked);
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const live = findLiveControl();
    if (!live) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      continue;
    }
    if (await stablyChecked()) return { found: true, checked: true, text, error: null };
    // Moka controls checkbox state through React. Click the real visible label
    // first so React receives its normal onChange path; setting only the native
    // property can look checked briefly and then be reverted on the next render.
    const clickTarget = [
      live.label,
      live.container.querySelector<HTMLElement>("[class*='Checkbox-container'],[class*='checkbox-container']"),
      visible(live.checkbox) ? live.checkbox : null
    ].find((candidate): candidate is HTMLElement => Boolean(candidate && visible(candidate)));
    clickTarget?.click();
    if (await stablyChecked()) return { found: true, checked: true, text, error: null };

    const rebound = findLiveControl();
    if (rebound) {
      setChecked(rebound.checkbox, true);
      if (await stablyChecked()) return { found: true, checked: true, text, error: null };
    }
  }
  return { found: true, checked: false, text, error: "未能勾选真实性声明" };
}

// Legacy in-process harness; production bridge and batch submission use the
// background trusted-pointer transaction. Do not serialize this function into
// Chrome: its receipt reader is an imported module dependency.
export async function executeFinalSubmitAction(
  action: PageActionObservation | null,
  expectedText: string
): Promise<FinalSubmitExecutionResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const trace: string[] = [];
  const visible = (element: Element) => {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    const rect = html.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      style.opacity !== "0" && rect.width > 0 && rect.height > 0 &&
      !html.closest("[hidden],[aria-hidden='true']");
  };
  const textOf = (element: Element) => normalize(
    element instanceof HTMLInputElement
      ? element.value
      : (element as HTMLElement).innerText || element.getAttribute("aria-label")
  );
  const forbidden = /同意|授权|隐私|条款|登录|验证码|保存草稿|下一步|上一步|解析|上传|更新|删除|取消|返回/;
  const finalSubmit = /预览并提交|确认提交|提交(?:简历|申请|投递)?|投递|确认申请|申请职位|立即申请|完成申请|submit|apply/i;
  const textMatches = (candidate: string) => {
    const expected = normalize(expectedText);
    return Boolean(candidate && expected) &&
      (candidate === expected || candidate.includes(expected) || expected.includes(candidate));
  };
  const allControls = () => [...document.querySelectorAll<HTMLElement>(
    "button,[role='button'],input[type='button'],input[type='submit'],a"
  )].filter((candidate) => visible(candidate) && !candidate.matches(":disabled,[aria-disabled='true']"));
  let element: HTMLElement | null = action?.selector
    ? document.querySelector(action.selector) as HTMLElement | null
    : null;
  if (!element || !visible(element) || !textMatches(textOf(element))) {
    const matching = allControls()
      .map((candidate) => ({ candidate, text: textOf(candidate) }))
      .filter(({ text }) => textMatches(text) || (finalSubmit.test(text) && text.includes(normalize(expectedText).slice(0, 4))))
      .filter(({ text }) => finalSubmit.test(text) && !forbidden.test(text));
    if (matching.length !== 1) {
      return {
        executed: false,
        actionId: action?.actionId ?? null,
        actionText: matching.map((item) => item.text).join("；") || null,
        observedResult: "blocked_by_site_validation",
        pageUrlAfterClick: location.href,
        error: matching.length
          ? "最终提交按钮不唯一，已阻止自动点击"
          : "未找到与二次确认匹配的最终提交按钮"
      };
    }
    element = matching[0]!.candidate;
  }
  const liveText = textOf(element);
  if (!finalSubmit.test(liveText) || forbidden.test(liveText)) {
    return {
      executed: false,
      actionId: action?.actionId ?? null,
      actionText: liveText,
      observedResult: "blocked_by_site_validation",
      pageUrlAfterClick: location.href,
      error: "目标控件不是安全的最终提交按钮"
    };
  }
  const validationBefore = normalize([...document.querySelectorAll<HTMLElement>(
    "[role='alert'],.error,.ant-form-item-explain-error,[class*='error'],[class*='Error']"
  )].filter(visible).map((candidate) => candidate.innerText).join(" "));
  if (validationBefore) {
    return {
      executed: false,
      actionId: action?.actionId ?? null,
      actionText: liveText,
      observedResult: "blocked_by_site_validation",
      pageUrlAfterClick: location.href,
      error: validationBefore.slice(0, 500)
    };
  }
  const beforeUrl = location.href;
  element.scrollIntoView({ block: "center", inline: "nearest" });
  element.click();
  trace.push(`preview_clicked:${liveText}`);
  await delay(900);
  const successText = () => readApplicationReceiptInPage().success;
  const validationText = () => normalize([...document.querySelectorAll<HTMLElement>(
    "[role='alert'],.error,.ant-form-item-explain-error,[class*='error'],[class*='Error']"
  )].filter(visible).map((candidate) => candidate.innerText).join(" "));
  let validationAfter = validationText();
  if (!successText()) {
    const dialogRoots = [...document.querySelectorAll<HTMLElement>(
      "[role='dialog'],[role='alertdialog'],.ant-modal,[class*='modal'],[class*='dialog']"
    )].filter(visible);
    const confirmButtons = dialogRoots.flatMap((root) => [...root.querySelectorAll<HTMLElement>(
      "button,[role='button'],input[type='button'],input[type='submit']"
    )]).filter((candidate) => visible(candidate) && !candidate.matches(":disabled,[aria-disabled='true']"))
      .map((candidate) => ({ candidate, text: textOf(candidate) }))
      .filter(({ text }) =>
        /^(?:确认|确定|确认提交|确认投递|确认申请|继续提交|继续投递|仍要提交|仍要投递|仍然提交|仍然投递|提交申请|提交投递|最终提交|提交|投递|confirm|confirm submit|continue submit|submit anyway|submit application)$/i.test(text) &&
        !/取消|返回|关闭|上一步|隐私|授权|同意|cancel|back|close|privacy|authorize|agree/i.test(text)
      );
    if (confirmButtons.length > 1) {
      return {
        executed: true,
        actionId: action?.actionId ?? null,
        actionText: liveText,
        observedResult: "blocked_by_site_validation",
        pageUrlAfterClick: location.href,
        error: `二次确认提交按钮不唯一：${confirmButtons.map((item) => item.text).join("；")}`,
        trace
      };
    }
    if (confirmButtons.length === 1) {
      confirmButtons[0]!.candidate.scrollIntoView({ block: "center", inline: "nearest" });
      confirmButtons[0]!.candidate.click();
      trace.push(`dialog_confirmation_clicked:${confirmButtons[0]!.text}`);
      await delay(1200);
      validationAfter = validationText();
    }
  }
  // Moka can render the preview as a normal route, drawer, or page section
  // rather than a semantic dialog. After the batch-level authorization has
  // already allowed the first "预览并提交" click, locate exactly one narrow,
  // visible final confirmation control across the live page. Never reuse the
  // initial preview control and never click agreement/privacy actions here.
  if (!successText() && !trace.some((entry) => entry.startsWith("dialog_confirmation_clicked:"))) {
    await delay(700);
    const confirmationText = /^(?:确认提交|确认投递|确认申请|继续提交|继续投递|仍要提交|仍要投递|仍然提交|仍然投递|提交申请|提交投递|最终提交|提交|投递|申请职位|立即申请|confirm submit|continue submit|submit anyway|submit application)$/i;
    const pageConfirmButtons = allControls()
      .filter((candidate) => candidate !== element && candidate.isConnected)
      .map((candidate) => ({ candidate, text: textOf(candidate) }))
      .filter(({ text }) => confirmationText.test(text) && !forbidden.test(text));
    trace.push(`page_confirmation_candidates:${pageConfirmButtons.map((item) => item.text).join("|") || "none"}`);
    if (pageConfirmButtons.length > 1) {
      return {
        executed: true,
        actionId: action?.actionId ?? null,
        actionText: liveText,
        observedResult: "blocked_by_site_validation",
        pageUrlAfterClick: location.href,
        error: `预览页最终提交按钮不唯一：${pageConfirmButtons.map((item) => item.text).join("；")}`,
        trace
      };
    }
    if (pageConfirmButtons.length === 1) {
      pageConfirmButtons[0]!.candidate.scrollIntoView({ block: "center", inline: "nearest" });
      pageConfirmButtons[0]!.candidate.click();
      trace.push(`page_confirmation_clicked:${pageConfirmButtons[0]!.text}`);
      await delay(1200);
      validationAfter = validationText();
    }
  }
  validationAfter = validationText();
  if (validationAfter && !successText()) {
    return {
      executed: true,
      actionId: action?.actionId ?? null,
      actionText: liveText,
      observedResult: "blocked_by_site_validation",
      pageUrlAfterClick: location.href,
      error: validationAfter.slice(0, 500),
      trace
    };
  }
  const deadline = Date.now() + 10_000;
  while (!successText() && Date.now() < deadline) {
    await delay(500);
  }
  const success = successText();
  trace.push(success ? "success_observed" : `success_not_observed:${location.href === beforeUrl ? "same_url" : "url_changed"}`);
  return {
    executed: true,
    actionId: action?.actionId ?? null,
    actionText: liveText,
    observedResult: success ? "submitted_success" : location.href !== beforeUrl
      ? "submitted_or_result_unknown" : "network_or_navigation_unknown",
    pageUrlAfterClick: location.href,
    error: null,
    trace
  };
}

// ATS resume parsers frequently create only the first education/work/project
// row. Expand repeatable sections deterministically from the locally parsed
// resume before mapping individual fields. This function never touches submit,
// consent, login, or navigation controls.
export async function prepareDynamicApplicationSections(
  targets: DynamicSectionTargets
): Promise<DynamicSectionPreparationResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element: Element) => {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    const rect = html.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      rect.width > 0 && rect.height > 0 && !html.closest("[hidden],[aria-hidden='true']");
  };
  const definitions: Array<{
    key: DynamicSectionKind;
    headings: RegExp;
    fieldNames: string[];
  }> = [
    { key: "education", headings: /教育经历|教育背景/, fieldNames: ["school", "school_name"] },
    { key: "work", headings: /工作经历|任职经历/, fieldNames: ["company", "company_name"] },
    { key: "internship", headings: /实习经历/, fieldNames: ["company", "company_name"] },
    { key: "project", headings: /项目经历|项目经验/, fieldNames: ["project_name", "projectName"] }
  ];
  const allModules = () => [...document.querySelectorAll<HTMLElement>(
    "[class*='applyFormModuleWrapper'],[class*='formModule'],[class*='moduleWrapper'],[class*='form-section'],section"
  )].filter(visible);
  const moduleScore = (module: HTMLElement, heading: RegExp) => {
    const text = normalize(module.innerText);
    const controls = module.querySelectorAll("input,textarea,select,button,[role='button']").length;
    let score = 0;
    if (heading.test(text.slice(0, 32))) score += 1000;
    if ([...module.children].some((child) => {
      const childText = normalize((child as HTMLElement).innerText);
      return childText.length <= 16 && heading.test(childText);
    })) score += 600;
    if (text.length < 1200) score += 200;
    // Avoid selecting a full-form wrapper that happens to contain every
    // section heading; with Moka this can make a work target click the
    // internship “添加” button and create required blanks.
    score -= Math.min(300, Math.floor(text.length / 20));
    score += Math.min(80, controls);
    return score;
  };
  const findModule = (heading: RegExp) => allModules()
    .filter((module) => heading.test(normalize(module.innerText)))
    .sort((left, right) => moduleScore(right, heading) - moduleScore(left, heading))[0] ?? null;
  const fieldCount = (module: HTMLElement, names: string[]) => {
    const named = [...module.querySelectorAll<HTMLElement>(
      "[data-form-field-name],[data-form-field-id],[name]"
    )].filter((element) => {
      const values = [
        element.getAttribute("data-form-field-name"),
        element.getAttribute("data-form-field-id"),
        element.getAttribute("name")
      ];
      return names.some((name) => values.includes(name));
    }).length;
    if (named) return named;
    // Generic fallback: count repeated card-like groups that contain visible
    // form controls. A single blank section is still one row.
    const groups = [...module.querySelectorAll<HTMLElement>(
      "[class*='experienceItem'],[class*='educationItem'],[class*='projectItem'],[class*='form-list-item'],[class*='listItem']"
    )].filter((candidate) => visible(candidate) && candidate.querySelector("input,textarea,select,[role='combobox']"));
    return groups.length || (module.querySelector("input,textarea,select,[role='combobox']") ? 1 : 0);
  };
  const addButton = (module: HTMLElement) => [...module.querySelectorAll<HTMLElement>(
    "button,[role='button']"
  )].find((button) => visible(button) && !button.matches(":disabled,[aria-disabled='true']") &&
    /^(添加|新增|添加一项|新增一项)$/.test(normalize(button.innerText || button.getAttribute("aria-label"))) &&
    !/提交|投递|申请|同意|隐私|授权/.test(normalize(button.innerText))) ?? null;
  const waitForCountChange = async (
    module: HTMLElement,
    names: string[],
    before: number
  ) => {
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      await delay(160);
      if (!module.isConnected || fieldCount(module, names) > before) return true;
    }
    return false;
  };
  const result: DynamicSectionPreparationResult = { changed: false, added: {}, warnings: [] };
  const requiredSections = new Set(targets.requiredSections ?? []);
  for (const definition of definitions) {
    // Resume/package cardinality is not authority to add optional application
    // content. A caller must have current-page evidence that the whole repeat
    // section is required before this primitive may click its Add control.
    if (!requiredSections.has(definition.key)) continue;
    const target = Math.max(0, Math.min(10, targets[definition.key] || 0));
    if (!target) continue;
    let module = findModule(definition.headings);
    if (!module) {
      result.warnings.push(`未找到${definition.key}经历区块`);
      continue;
    }
    if (definition.key === "work") {
      const noExperience = [...module.querySelectorAll<HTMLInputElement>("input[type='checkbox']")]
        .find((checkbox) => checkbox.checked && /没有.*(?:工作|实习)经历|暂无.*(?:工作|实习)经历/.test(
          normalize(checkbox.closest("label")?.innerText || checkbox.parentElement?.innerText)
        ));
      if (noExperience) {
        noExperience.click();
        await delay(450);
        result.changed = true;
        module = findModule(definition.headings) ?? module;
      }
    }
    let current = fieldCount(module, definition.fieldNames);
    for (let attempts = 0; current < target && attempts < target + 3; attempts += 1) {
      const button = addButton(module);
      if (!button) break;
      const before = current;
      button.click();
      await waitForCountChange(module, definition.fieldNames, before);
      module = findModule(definition.headings) ?? module;
      current = fieldCount(module, definition.fieldNames);
      if (current <= before) break;
      result.added[definition.key] = (result.added[definition.key] ?? 0) + 1;
      result.changed = true;
    }
    if (current < target) result.warnings.push(
      `${definition.key}经历需要 ${target} 条，页面仅准备 ${current} 条`
    );
  }
  return result;
}

// This function is serialized by chrome.scripting.executeScript. Keep every
// helper inside the function so it works in the isolated page world.
export function observeApplicationPage(submitPolicy: SubmissionActionPatterns = submissionActionPatterns): PageObservation {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  // This observer is synchronous and read-only. Reuse layout/style evidence
  // only within this snapshot; never carry it across page events or reads.
  // Long forms revisit the same ancestor trees for every field and heading.
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const visibility = new WeakMap<Element, boolean>();
  const styleFor = (element: Element) => {
    let style = styles.get(element);
    if (!style) { style = getComputedStyle(element); styles.set(element, style); }
    return style;
  };
  const visible = (element: Element) => {
    const known = visibility.get(element);
    if (known !== undefined) return known;
    const html = element as HTMLElement;
    const style = styleFor(html);
    const rect = html.getBoundingClientRect();
    if (html.closest("[aria-hidden='true'],[hidden]")) { visibility.set(element, false); return false; }
    for (let ancestor = html.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const ancestorStyle = styleFor(ancestor);
      if (ancestorStyle.display === "none" || ancestorStyle.visibility === "hidden" ||
        ancestorStyle.opacity === "0") { visibility.set(element, false); return false; }
    }
    const result = style.display !== "none" && style.visibility !== "hidden" &&
      style.opacity !== "0" && rect.width > 0 && rect.height > 0;
    visibility.set(element, result);
    return result;
  };
  const selectorFor = (element: Element) => {
    const html = element as HTMLElement;
    if (html.id && document.querySelectorAll(`#${CSS.escape(html.id)}`).length === 1) return `#${CSS.escape(html.id)}`;
    const testId = html.getAttribute("data-testid");
    if (testId && document.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`).length === 1) return `[data-testid="${CSS.escape(testId)}"]`;
    const segmentFor = (current: Element) => {
      let segment = current.tagName.toLowerCase();
      const name = current.getAttribute("name");
      if (name) segment += `[name="${CSS.escape(name)}"]`;
      const fieldName = current.getAttribute("data-form-field-name");
      if (fieldName) segment += `[data-form-field-name="${CSS.escape(fieldName)}"]`;
      const role = current.getAttribute("role");
      if (role) segment += `[role="${CSS.escape(role)}"]`;
      const type = current.getAttribute("type");
      if (type && current.tagName.toLowerCase() === "input") segment += `[type="${CSS.escape(type)}"]`;
      const parent: Element | null = current.parentElement;
      if (parent) {
        const peers = [...parent.children].filter((entry) => entry.tagName === current.tagName);
        if (peers.length > 1) segment += `:nth-of-type(${peers.indexOf(current) + 1})`;
      }
      return segment;
    };
    const segments: string[] = [];
    let current: Element | null = element;
    // Preserve the first unique path, but do not return an ambiguous suffix
    // merely because a deeply nested control exceeds an arbitrary depth.
    while (current && current !== document.body) {
      segments.unshift(segmentFor(current));
      const selector = segments.join(" > ");
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {
        // Continue to the next physical ancestor.
      }
      const parent: Element | null = current.parentElement;
      current = parent;
    }
    return `${current === document.body ? "body > " : ""}${segments.join(" > ")}`;
  };
  const labelFor = (element: Element) => {
    const input = element as HTMLInputElement;
    if (input.type === "file") {
      const accept = normalize(input.accept).toLowerCase();
      const fileIdentity = normalize([
        input.id,
        input.name,
        input.getAttribute("data-form-field-name"),
        input.getAttribute("data-testid"),
        input.getAttribute("aria-label")
      ].filter(Boolean).join(" "));
      const documentAccept = /pdf|docx?|msword|officedocument/.test(accept);
      const imageAccept = /image|png|jpe?g/.test(accept);
      const mediaAccept = /video|audio/.test(accept);
      const photoIdentity = /照片|头像|photo|portrait|avatar/i.test(fileIdentity);
      const resumeIdentity = /resum(?:e|é).?key|resume|curriculum|\bcv\b/i.test(fileIdentity);
      if (photoIdentity && !documentAccept) return "证件照";
      if (resumeIdentity) return "简历";
      let nearestUploadText = "";
      let ancestor: HTMLElement | null = input.parentElement;
      for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
        const fileControls = [...ancestor.querySelectorAll("input[type='file']")];
        // Do not classify from a broad upload section containing both resume
        // and photo controls. Only the closest single-file container is valid
        // label evidence for this input.
        if (fileControls.length !== 1 || fileControls[0] !== input) continue;
        nearestUploadText = normalize(ancestor.innerText);
        break;
      }
      if (/上传照片|照片|证件照|头像|个人照片/i.test(nearestUploadText)) return "证件照";
      if (/上传附件|补充附件|其他附件|作品附件|附件材料/i.test(nearestUploadText)) return "附件";
      if (/上传简历|个人简历|更新\s*删除/i.test(nearestUploadText)) return "简历";
      // Moka's generic attachment input accepts documents together with image,
      // audio and video files and is commonly `multiple`. Document support by
      // itself is therefore not resume identity evidence.
      if (input.multiple || (documentAccept && (imageAccept || mediaAccept))) return "附件";
      if (documentAccept) return "简历";
      if (imageAccept) return "证件照";
      return "附件";
    }
    const explicit = normalize(input.labels ? [...input.labels].map((label) => label.innerText).join(" ") : "");
    const invalidLabelEvidence = (value: string) =>
      /必填项未填写|请输入正确|格式错误|校验失败|不能为空|error|invalid/i.test(value);
    const semanticLabelEvidence = (value: string) =>
      /意向工作城市|期望工作城市|推荐码|推荐人|内推码|内推人|referral|姓名|手机号码|手机号|邮箱|个人邮箱|性别|出生国家|证件国家|工作经验|最高学历|学历|最快到岗时间|求职意向|政治面貌|开始工作年月|招聘渠道|确认声明|本人已知悉以上内容/i.test(value);
    if (explicit && !invalidLabelEvidence(explicit) && (
      semanticLabelEvidence(explicit) || ["checkbox", "radio"].includes(input.type)
    )) return explicit.slice(0, 160);
    const ariaLabel = normalize(element.getAttribute("aria-label"));
    const labelledByText = normalize((element.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.innerText)
      .filter(Boolean)
      .join(" "));
    const aria = ariaLabel || labelledByText;
    if (aria && !invalidLabelEvidence(aria) && semanticLabelEvidence(aria)) return aria.slice(0, 160);
    const thirdPartyPersonEvidence = (value: string) =>
      /紧急联系人|应急联系人|关系人(?:信息|姓名|名字|电话|手机|邮箱)|外部推荐人|推荐人(?:姓名|邮箱|手机|电话)|内推人|介绍人|关系人信息|亲属关系|与本人关系|联系人关系|emergency\s*contact|external\s*(?:referrer|recommender)|introducer/i.test(value);
    const mokaFieldWrapper = element.closest("[class*='apply-field-']") as HTMLElement | null;
    const mokaTitleText = (candidate: Element) => {
      // The primary caption and its translation are separate DOM nodes.
      // A Select clears its Chinese placeholder after commit; switching to
      // "意向工作城市 / Preferred work city" then changes both the exact
      // label and (via "work") the section key. Keep the visible primary
      // caption stable, without weakening exact field binding or stripping
      // arbitrary slash-separated text from other sites/controls.
      if (candidate.querySelector(".polyglot-separator") && candidate.querySelector("[lang]")) {
        const primary = candidate.cloneNode(true) as HTMLElement;
        primary.querySelectorAll(".polyglot-separator,[lang]").forEach(node => node.remove());
        const text = normalize(primary.textContent);
        if (/\p{Script=Han}/u.test(text)) return text;
      }
      return normalize((candidate as HTMLElement).innerText);
    };
    // A complete caption owned by this component is stronger than a keyword
    // inside its placeholder. Truncating 学校邮箱 (or 微信号 with an explanatory
    // mention of 邮箱) to 邮箱 merges distinct controls into one identity.
    const mokaLocalTitle = mokaFieldWrapper
      ? [...mokaFieldWrapper.children]
        .filter((candidate) => !candidate.contains(element) && visible(candidate))
        .map((candidate) => mokaTitleText(candidate)
          .replace(/[＊*]\s*(?:必填)?/g, "").trim())
        .find((value) => value && value.length <= 60 && !invalidLabelEvidence(value))
      : "";
    if (mokaLocalTitle) {
      return mokaLocalTitle.slice(0, 160);
    }
    // Strong intrinsic semantics must win over geometric neighbours. Moka
    // renders validation messages and adjacent select captions close enough
    // that a generic nearest-text heuristic can otherwise bind “邮箱” to
    // “最高学历” or name a city field “必填项未填写”.
    const intrinsicSources = [
      input.placeholder,
      input.getAttribute("name"),
      input.getAttribute("data-form-field-name"),
      input.getAttribute("data-form-field-i18n-name")
    ].map((value) => normalize(value)).filter(Boolean);
    const intrinsicThirdPartyLabel = intrinsicSources.find(thirdPartyPersonEvidence);
    if (intrinsicThirdPartyLabel) return intrinsicThirdPartyLabel.slice(0, 160);
    const intrinsicLabel = normalize(intrinsicSources.join(" "));
    const intrinsicKnownLabel = intrinsicLabel.match(
      /意向工作城市|期望工作城市|推荐码|推荐人|内推码|内推人|referral|手机号码|个人邮箱|出生国家|证件国家|工作经验|最高学历|最快到岗时间|求职意向|政治面貌|开始工作年月|招聘渠道|姓名|手机号|邮箱|性别|学历/i
    )?.[0];
    if (intrinsicKnownLabel) return intrinsicKnownLabel.slice(0, 160);
    const mokaWrapperText = normalize(mokaFieldWrapper?.innerText);
    const mokaKnownLabel = mokaWrapperText.match(
      /意向工作城市|期望工作城市|推荐码|推荐人|内推码|内推人|referral|手机号码|个人邮箱|出生国家|证件国家|工作经验|最高学历|最快到岗时间|求职意向|政治面貌|开始工作年月|招聘渠道|本人已知悉以上内容|确认声明|姓名|手机号|邮箱|性别|学历/i
    )?.[0];
    if (mokaKnownLabel) return mokaKnownLabel.slice(0, 160);
    if (explicit && !invalidLabelEvidence(explicit) && explicit !== normalize(input.value)) {
      return explicit.slice(0, 160);
    }
    if (aria && !invalidLabelEvidence(aria) && aria !== normalize(input.value)) return aria.slice(0, 160);
    const container = element.closest(
      ".ant-form-item,.form-item,.form-group,[class*='formItem'],[class*='field'],label"
    ) as HTMLElement | null;
    let localRoot: HTMLElement | null = element.parentElement;
    for (let depth = 0; localRoot && depth < 6; depth += 1, localRoot = localRoot.parentElement) {
      const logicalControls = [...localRoot.querySelectorAll(
        "input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"
      )].filter((candidate) => {
        const nestedCombobox = candidate.closest("[role='combobox']");
        return !(candidate instanceof HTMLInputElement && nestedCombobox && nestedCombobox !== candidate);
      });
      if (logicalControls.length !== 1) continue;
      const localLabels = [...localRoot.querySelectorAll<HTMLElement>(
        "label,[class*='label'],[class*='Label'],[class*='caption'],[class*='Caption']"
      )].filter((candidate) => candidate !== element && !candidate.contains(element) && visible(candidate))
        .map((candidate) => normalize(candidate.innerText))
        .filter((value) => value && value.length <= 60 && value !== normalize(input.placeholder));
      if (localLabels[0]) return localLabels[0].slice(0, 160);
    }
    const identityEvidence = normalize([
      input.type,
      input.id,
      input.name,
      input.placeholder,
      input.autocomplete,
      input.getAttribute("data-form-field-name"),
      input.getAttribute("data-testid")
    ].filter(Boolean).join(" "));
    const containerText = normalize(container?.innerText);
    const ownText = (candidate: Element) => normalize(
      [...candidate.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ")
    );
    const controlRect = (element as HTMLElement).getBoundingClientRect();
    const nearby = [...document.querySelectorAll("label,span,div,p")]
      .filter((candidate) => candidate !== element && !candidate.contains(element) &&
        !element.contains(candidate) && visible(candidate))
      .map((candidate) => {
        const value = ownText(candidate);
        const rect = (candidate as HTMLElement).getBoundingClientRect();
        const sameRow = Math.abs((rect.top + rect.height / 2) -
          (controlRect.top + controlRect.height / 2)) <= 36;
        const closeAbove = rect.bottom <= controlRect.top + 8 &&
          controlRect.top - rect.bottom <= 100;
        const closeBeside = sameRow && Math.abs(rect.left - controlRect.left) <= 360;
        const score = Math.abs(rect.top - controlRect.top) * 4 +
          Math.abs(rect.left - controlRect.left) + (closeAbove ? -80 : 0) +
          (closeBeside ? -50 : 0);
        return { value, score, accepted: (closeAbove || closeBeside) && value.length <= 60 };
      })
      .filter((candidate) => candidate.accepted && candidate.value &&
        candidate.value !== normalize(input.value) &&
        candidate.value !== normalize(element.getAttribute("placeholder")))
      .sort((left, right) => left.score - right.score);
    if (nearby[0]?.value) return nearby[0].value.slice(0, 160);
    // A visible page label is stronger evidence than either a generic DOM
    // identity or the current field value. ATS resume parsers can temporarily
    // place an email in the name input; value-first inference would then bind
    // the name control to basic.email and preserve the corruption.
    if (/\bemail\b|e[-_ ]?mail|邮箱|电子邮件/i.test(identityEvidence)) return "个人邮箱";
    if (/\b(?:phone|mobile|tel)\b|手机|电话/i.test(identityEvidence)) return "手机号";
    const liveValue = normalize(input.value);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(liveValue)) return "个人邮箱";
    if (containerText && containerText.length <= 120) return containerText.slice(0, 160);
    return normalize(
      element.getAttribute("placeholder") || element.getAttribute("name") || element.id
    ).slice(0, 160) || "未命名字段";
  };
  const controls = [...document.querySelectorAll(
    "input:not([type='hidden']), textarea, select, [contenteditable='true'], [role='combobox']"
  )].filter((element) => {
    const input = element as HTMLInputElement;
    const containingCombobox = element.closest("[role='combobox']");
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
      containingCombobox && containingCombobox !== element) return false;
    if (["checkbox", "radio"].includes(input.type)) {
      const interactiveContainer = input.closest("label,[class*='Checkbox-container'],[class*='Radio-container'],[class*='apply-field-']");
      return visible(element) || Boolean(interactiveContainer && visible(interactiveContainer));
    }
    return input.type === "file" || visible(element);
  }).slice(0, 160);
  const fieldValidationMessageFor = (
    element: Element, preferredRoot?: HTMLElement | null,
    compound?: ReturnType<typeof identityDocumentCompoundFor>
  ) => {
    // Formily copies data-form-field-id onto the INPUT itself. The input is
    // not the field root: choosing it here severs the label/error ownership
    // chain and makes post-submit errors such as “姓名为必填” invisible.
    const explicitRoot = preferredRoot ?? element.closest<HTMLElement>(
      ".ud-formily-item,.ant-form-item,.form-item,.form-group,[class*='formItem'],[class*='apply-field-']"
    ) ?? element.parentElement?.closest<HTMLElement>("[data-form-field-id]") ??
      element.closest<HTMLElement>("label");
    // A bare control directly under a form/body must not inherit every other
    // field's errors. Only an explicit field wrapper or single-control parent
    // owns adjacent error nodes; aria-invalid on the control itself still works.
    const parent = element.parentElement;
    const root = explicitRoot ?? (parent?.querySelectorAll("input,select,textarea,[role='combobox']").length === 1
      ? parent : element);
    const validationPattern = /必填项未填写|请填写必填项|此项为必填|这是必填项|(?:为|是)必填(?:项)?|该字段不能为空|不能为空|请选择|请填写|请上传|请勾选|不正确|无效|未通过|不一致|required|invalid|must\s+(?:enter|select|upload|complete)/iu;
    const bareRequiredValidationPattern = /^(?:(?:必填项未填写|请填写必填项|此项为必填|这是必填项|[^。；;]{1,80}(?:为|是)必填(?:项)?|该字段不能为空|不能为空)(?:\s*[/／|｜]\s*(?:required items? (?:are )?not filled in|this field is required))?|(?:required items? (?:are )?not filled in|this field is required))[.!！。]?$/iu;
    const temporalRangeValidationPattern = /(?:开始|起始)(?:时间|日期|年月)?[^。；;]{0,24}(?:不能|不得|不可)[^。；;]{0,12}(?:大于|晚于|超过)(?:结束|截止)(?:时间|日期|年月)?|(?:结束|截止)(?:时间|日期|年月)?[^。；;]{0,24}(?:不能|不得|不可)[^。；;]{0,12}(?:小于|早于)(?:开始|起始)(?:时间|日期|年月)?|start(?:\s+(?:date|time|month|year))?[^.;]{0,40}(?:must\s+(?:be\s+)?before|must\s+not\s+be\s+after|cannot\s+be\s+after|can't\s+be\s+after|may\s+not\s+be\s+after)[^.;]{0,24}end|end(?:\s+(?:date|time|month|year))?[^.;]{0,40}(?:must\s+(?:be\s+)?after|must\s+not\s+be\s+before|cannot\s+be\s+before|can't\s+be\s+before|may\s+not\s+be\s+before)[^.;]{0,24}start/iu;
    const isValidationText = (value: string) => validationPattern.test(value) ||
      temporalRangeValidationPattern.test(value);
    const errorSelector = "[role='alert'],[aria-live='assertive'],.ant-form-item-explain-error,[class*='form-error'],[class*='field-error'],[class*='has-error'],[class*='error'],[class*='Error'],[class*='invalid'],[class*='Invalid']";
    // Older Moka markup also renders a standalone, unclassed required error.
    // Only that exact message node is evidence, never the surrounding title.
    const bareErrors = [...root.querySelectorAll<HTMLElement>("div,span,p")].filter((candidate) => {
      const text = normalize(candidate.innerText);
      return bareRequiredValidationPattern.test(text) ||
        temporalRangeValidationPattern.test(text);
    });
    const owners: Element[] = [];
    for (let owner: Element | null = element; owner && root.contains(owner); owner = owner.parentElement) {
      owners.push(owner);
      if (owner === root) break;
    }
    const invalidOwners = owners.filter((owner) => visible(owner) &&
      owner.getAttribute("aria-invalid") === "true");
    const linkedErrors = invalidOwners.flatMap((owner) =>
      normalize(owner.getAttribute("aria-errormessage")).split(" ")
        .map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node))
    );
    const labels = [
      ...(element.matches("input,select,textarea")
        ? [...((element as HTMLInputElement).labels ?? [])] : []),
      ...normalize(element.getAttribute("aria-labelledby")).split(" ")
        .map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node))
    ];
    const candidates = [...new Set([...linkedErrors, ...root.querySelectorAll<HTMLElement>(errorSelector), ...bareErrors])]
      .filter((candidate) => visible(candidate) && candidate !== element && !candidate.contains(element) &&
        !candidate.matches("input,textarea,select,label,h1,h2,h3,h4,[role='heading']") &&
        !candidate.querySelector("input,textarea,select,[role='combobox']") &&
        // Some inputs place their explicit error node beside the input inside
        // its wrapping label. Exclude label prose, but retain error surfaces.
        !labels.some((label) => label === candidate ||
          (label.contains(candidate) && !candidate.matches(errorSelector))));
    for (const candidate of candidates) {
      const text = normalize(candidate.innerText || candidate.textContent);
      if (compound && !linkedErrors.includes(candidate)) {
        const members = [compound.typeControl, compound.numberControl];
        const linkedOwner = members.find(member => member.getAttribute("aria-invalid") === "true" &&
          normalize(member.getAttribute("aria-errormessage")).split(" ").includes(candidate.id) && candidate.id);
        if (linkedOwner && linkedOwner !== element) continue;
        let owner: Element | null = candidate.parentElement;
        while (owner && owner !== compound.root && !members.some(member => owner!.contains(member))) {
          owner = owner.parentElement;
        }
        const ownedMembers = members.filter(member => owner?.contains(member));
        const missingOnly = bareRequiredValidationPattern.test(text) || /^required$/iu.test(text);
        // This Moka compound renders its group error inside the type Select.
        // Attribute a missing-only error to empty members; retain an unknown
        // or nonempty group rejection for correction of the combination.
        const mokaGroupError = compound.mokaSharedError &&
          ownedMembers[0] === compound.typeControl &&
          !invalidOwners.some(item => item !== compound.root && item.contains(element));
        if (ownedMembers.length === 1 && !mokaGroupError && ownedMembers[0] !== element) continue;
        if ((ownedMembers.length !== 1 || mokaGroupError) && missingOnly &&
          members.some(member => !compoundValue(member)) && compoundValue(element) &&
          invalidOwners.length === 0) continue;
      }
      if (text && (linkedErrors.includes(candidate) || isValidationText(text))) return text.slice(0, 160);
    }
    // A field title (e.g. Canrui's “请选择信息来源渠道”), placeholder or help
    // text is never a validation result. Do not search the whole field root.
    if (invalidOwners.length > 0) return "该字段仍被招聘网站标记为无效";
    // Moka's native resume input reports rejection on its owned upload shell,
    // without a text/ARIA error. Never borrow a section/nav error or the
    // adjacent attachment uploader. This is observation only: upload remains
    // on the native Driver and the submit transaction still owns freshness.
    const upload = element.closest<HTMLElement>(".file_upload");
    if (location.hostname === "app.mokahr.com" &&
      /^\/(?:social|campus)-recruitment\/[^/]+\/[^/]+\/?$/iu.test(location.pathname) &&
      /^#\/job\/[^/?]+\/apply(?:[/?]|$)/iu.test(location.hash) &&
      element.matches("input[type='file']#resumeKey[name='resumeKey']") &&
      [...root.classList].some(value => value.startsWith("apply-field-")) &&
      [...root.classList].some(value => value.startsWith("file_upload-")) &&
      root.querySelectorAll("input,select,textarea,[role='combobox']").length === 1 &&
      upload && root.contains(upload) && visible(upload) &&
      [...upload.classList].some(value => /^error-[A-Za-z0-9_-]{10}$/u.test(value))) {
      return "招聘网站未接受简历上传，请检查上传控件";
    }
    return null;
  };
  const ownText = (candidate: Element) => normalize(
    [...candidate.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")
  );
  const sectionTitles = new WeakMap<Element, string | null>();
  let sectionHeadings: Array<{ element: Element; raw: string; canonical: string }> | undefined;
  const readSectionTitle = (element: Element) => {
    const headingSelector = "h1,h2,h3,h4,p,span,div,[class*='section-title'],[class*='module-title'],[class*='block-title']";
    const canonicalSectionTitle = (value: string): string | null => {
      const title = normalize(value);
      const aliases: Array<[RegExp, string]> = [
        [/^(?:申请信息(?:\s*[／/|]\s*application(?:\s+information)?)?|application(?:\s+information)?)$/iu, "申请信息"],
        [/^(?:基本信息(?:\s*[／/|]\s*basic(?:\s+information)?)?|basic(?:\s+information)?)$/iu, "基本信息"],
        [/^(?:个人信息(?:\s*[／/|]\s*personal(?:\s+information)?)?|personal(?:\s+information)?)$/iu, "个人信息"],
        [/^(?:教育(?:背景|经历)(?:\s*[／/|]\s*education(?:\s+(?:background|experience))?)?|education(?:\s+(?:background|experience))?)$/iu, "教育经历"],
        [/^(?:工作经历(?:\s*[／/|]\s*work(?:\s+experience)?)?|work(?:\s+experience)?)$/iu, "工作经历"],
        [/^(?:实习经历(?:\s*[／/|]\s*internship(?:\s+experience)?)?|internship(?:\s+experience)?)$/iu, "实习经历"],
        [/^(?:项目(?:经历|经验)(?:\s*[／/|]\s*projects?(?:\s+experience)?)?|projects?(?:\s+experience)?)$/iu, "项目经历"],
        [/^(?:科研(?:\s*[／/|]\s*research)?|research)$/iu, "科研"],
        [/^(?:论文|作品|获奖|语言能力|求职意向|自我评价|与公司员工是否有亲属关系（如有）|关系人信息)$/u, title]
      ];
      return aliases.find(([pattern]) => pattern.test(title))?.[1] ?? null;
    };
    const belongsToNavigation = (candidate: Element) => {
      if (candidate.closest("nav,aside,[role='navigation']")) return true;
      let owner: Element | null = candidate;
      for (let depth = 0; owner && depth < 6; depth += 1, owner = owner.parentElement) {
        const identity = `${owner.id} ${(owner as HTMLElement).className || ""}`;
        if (/(?:^|[-_\s])(?:side(?:bar)?|nav(?:igation)?|menu|anchor|toc)(?:[-_\s]|$)/iu.test(identity)) return true;
      }
      return false;
    };
    const headingValue = (candidate: Element) => {
      if (belongsToNavigation(candidate)) return null;
      const raw = ownText(candidate) || normalize((candidate as HTMLElement).innerText);
      const canonical = raw.length <= 64 ? canonicalSectionTitle(raw) : null;
      return canonical ? { raw, canonical } : null;
    };
    // Reuse the existing heading rules and DOM order within this synchronous
    // snapshot only. Re-scanning every ancestor per field slows long forms.
    sectionHeadings ??= [...document.querySelectorAll(headingSelector)]
      .filter(visible)
      .flatMap(candidate => {
        const heading = headingValue(candidate);
        return heading ? [{ element: candidate, ...heading }] : [];
      });
    let ancestor = element.parentElement;
    for (let depth = 0; ancestor && depth < 18; depth += 1, ancestor = ancestor.parentElement) {
      const localHeadings = sectionHeadings
        .filter(({ element: candidate }) => candidate !== ancestor && ancestor!.contains(candidate) &&
          !candidate.contains(element) &&
          Boolean(candidate.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))
        .filter((value, index, values) => values.findIndex((candidate) => candidate.canonical === value.canonical) === index);
      if (localHeadings.length === 1) return localHeadings[0]!.raw;
    }
    const rect = (element as HTMLElement).getBoundingClientRect();
    const headings = sectionHeadings.map((heading) => {
      const candidateRect = (heading.element as HTMLElement).getBoundingClientRect();
      return {
        value: heading.raw,
        bottom: candidateRect.bottom,
        left: candidateRect.left,
        distance: rect.top - candidateRect.bottom
      };
    })
      .filter((candidate) => candidate.distance >= -20 &&
      Math.abs(candidate.left - rect.left) <= 760 &&
      candidate.value.length <= 64
    ).sort((left, right) => left.distance - right.distance);
    return headings[0]?.value ?? null;
  };
  const sectionTitleFor = (element: Element) => {
    if (!sectionTitles.has(element)) sectionTitles.set(element, readSectionTitle(element));
    return sectionTitles.get(element)!;
  };
  const contextualLabel = (element: Element, baseLabel: string) => {
    const heading = sectionTitleFor(element);
    return heading && heading !== "个人信息" && !baseLabel.includes(heading)
      ? `${heading} · ${baseLabel}`.slice(0, 160)
      : baseLabel;
  };
  const identityText = (value: unknown) => normalize(value)
    .replace(/[＊*]\s*(?:必填)?/g, "")
    .replace(/[()（）【】\[\]{}<>《》:：｜|·・._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const sectionKeyFor = (label: string, sectionTitle?: string | null) => {
    const value = `${sectionTitle ?? ""} ${label}`;
    if (/紧急联系人|应急联系人|关系人(?:信息|姓名|名字|电话|手机|邮箱)|外部推荐人|推荐人(?:姓名|邮箱|手机|电话)|内推人|介绍人|联系人关系|emergency\s*contact|external\s*(?:referrer|recommender)|introducer/i.test(value)) return "third_party";
    if (/与公司员工是否有亲属关系|关系人信息|亲属关系|与本人关系/i.test(value)) return "relation";
    if (/简历|附件|证件照|照片|头像|上传|resume|cv|photo/i.test(value)) return "attachments";
    if (/隐私|授权|条款|同意|consent/i.test(value)) return "consent";
    if (/开始工作年月|首次工作|参加工作|first work|work start/i.test(value)) return "basic";
    // A standalone graduation year/month pair can live in Moka's personal
    // information section next to birth date and native place. It is a
    // candidate-level summary field, not another repeated education-row end
    // date. Keeping it under `basic` gives React re-observation a stable
    // identity distinct from the four-part study ranges below the page.
    if (/申请信息|基本信息|个人信息/i.test(sectionTitle ?? "") &&
      /毕业(?:时间|日期|年月|年份)|graduation/i.test(value)) return "basic";
    if (/工作经验|工作年限|work experience/i.test(value) && /申请信息|基本信息|个人信息/i.test(sectionTitle ?? "")) return "basic";
    if (/工作经历|实习经历|任职经历|公司|单位|职位|岗位|职责|work|internship|company|position/i.test(value)) return "work";
    if (/项目经历|项目经验|项目名称|项目描述|project/i.test(value)) return "project";
    if (/教育|学校|院校|学历|学位|专业|毕业|入学|education|school|degree|major/i.test(value)) return "education";
    if (/科研|论文|专利|publication|research/i.test(value)) return "research";
    if (/获奖|奖项|荣誉|award/i.test(value)) return "award";
    if (/语言|语种|英语|language/i.test(value)) return "language";
    if (/意向|期望|工作城市|求职|城市|地点|preference|intention/i.test(value)) return "intention";
    if (/姓名|名字|手机|电话|邮箱|性别|出生|籍贯|证件|basic|name|phone|email|native.?place|hometown/i.test(value)) return "basic";
    return "other";
  };
  const semanticSlotFor = (label: string, fallback?: string | null, preferLabelFallback = false) => {
    const value = identityText(label);
    const rawFallback = identityText(fallback);
    const leafValue = identityText(normalize(label).split("·").at(-1));
    const fieldIdentity = `${leafValue} ${rawFallback}`.trim();
    // Moka clears the Select placeholder after commit. Identity must belong
    // to the field title, not the transient "请选择" input placeholder.
    if (/^(?:请选择)?(?:招聘)?信息来源(?:渠道)?$|^(?:招聘)?来源渠道$|^招聘渠道$|^简历渠道$|^(?:招聘信息(?:获取|获知)|获取招聘信息)(?:的)?渠道$|^获知.*(?:渠道|途径)$/.test(leafValue)) return "recruiting_source";
    const relation = /与公司员工是否有亲属关系|关系人信息|亲属关系|与本人关系/.test(value);
    const thirdParty = /紧急联系人|应急联系人|关系人(?:信息|姓名|名字|电话|手机|邮箱)|外部推荐人|推荐人|内推人|介绍人|联系人关系|关系人信息|亲属关系|与本人关系|emergency contact|external (?:referrer|recommender)|introducer/.test(`${value} ${rawFallback}`);
    // The xTool section title itself contains “关系”. Classify the leaf field,
    // not the full contextual label, or “姓名” becomes a duplicate relationship
    // key and can be rebound to a neighboring control after React rebuilds.
    if (relation && /部门|职位/.test(fieldIdentity)) return "department_position";
    if (thirdParty && /姓名|名字|full name|(?:^|\s)name(?:$|\s)/.test(fieldIdentity)) return "name";
    if (thirdParty && /手机|电话|mobile|phone|tel/.test(fieldIdentity)) return "phone";
    if (thirdParty && /邮箱|电子邮件|e mail|email/.test(fieldIdentity)) return "email";
    if (thirdParty && /与本人关系|联系人关系|关系|relationship/.test(fieldIdentity)) return "relationship";
    if (thirdParty) return "contact";
    // Qualified contact channels have independent identities. In particular,
    // never let an old email collision ordinal move a school address into a
    // personal mailbox after the full caption becomes visible to observation.
    if (/^(?:学校|校园|大学|学术|教育)(?:邮箱|电子邮件)|^(?:school|university|academic|student) (?:e mail|email)/i.test(leafValue)) return "school_email";
    if (/^个人(?:邮箱|电子邮件)|^personal (?:e mail|email)/i.test(leafValue)) return "personal_email";
    if (/^(?:微信|we ?chat|weixin)(?:号|\b|\s)/i.test(leafValue)) return "wechat";
    // A spelling request and another person's name are independent controls,
    // even when both placeholders begin with the candidate-name keyword.
    if (/^(?:姓名|名字)拼音|^(?:name pinyin|pinyin name)/i.test(leafValue)) return "name_pinyin";
    if (/^(?:导师)(?:姓名|名字)|^(?:academic )?(?:advisor|supervisor|mentor) name/i.test(leafValue)) return "advisor_name";
    if (/证件照|头像|个人照片|photo/.test(value)) return "identity_photo";
    if (/^(?:证件类型|证件种类|identity document type)$/i.test(leafValue)) return "identity_document_type";
    if (/^(?:证件号码|证件号|身份证号码|身份证号|identity document number)$/i.test(leafValue)) return "identity_document_number";
    if (/附件|attachment/.test(value) && !/简历|resume|cv/.test(value)) return "attachment";
    if (/简历|resume|cv/.test(value)) return "resume_file";
    if (/姓名|名字|full name|^name$/.test(value)) return "full_name";
    if (/手机|电话|mobile|phone/.test(value)) return "phone";
    if (/邮箱|电子邮件|e mail|email/.test(value)) return "email";
    if (/推荐|内推|referral/.test(`${value} ${rawFallback}`)) return "referral";
    if (/籍贯|native place|nativeplace|hometown|place of origin/.test(`${value} ${rawFallback}`)) return "native_place";
    if (/意向.*城市|期望.*城市|工作城市|意向地点|工作地点|城市|地点|current location|preferred location|location/.test(value)) return "preferred_city";
    if (/性别|gender|sex/.test(value)) return "gender";
    if (/出生国家|出生地国家|country of birth/.test(value)) return "birth_country";
    if (/证件国家|证件签发国家|document country|issuing country/.test(value)) return "document_country";
    if (/工作经验|工作年限|years of experience|work experience/.test(value)) return "work_experience";
    if (/最快到岗时间|到岗时间|available date|availability/.test(value)) return "availability";
    if (/求职意向|求职方向|job intention/.test(value)) return "job_intention";
    if (/学校|院校|school/.test(value)) return "school";
    if (/最高学历|highest degree/.test(value)) return "highest_degree";
    if (/学历|学位|degree/.test(value)) return "degree";
    if (/专业|major/.test(value)) return "major";
    if (/开始工作年月|首次工作|参加工作|first work|work start/.test(value)) {
      if (/(?:^|\s)年(?:\s|$)|year/.test(value) || /^(年|yyyy)$/i.test(rawFallback)) return "first_work_start_year";
      if (/(?:^|\s)月(?:\s|$)|month/.test(value) || /^(月|mm)$/i.test(rawFallback)) return "first_work_start_month";
      return "first_work_start_date";
    }
    if (/毕业时间|毕业年份|毕业日期|graduation/.test(value)) return "graduation_date";
    if (/入学|开始时间|起始时间|start/.test(value)) return "start_date";
    if (/结束时间|截止时间|end/.test(value)) return "end_date";
    if (/公司|单位|company/.test(value)) return "company";
    if (/岗位|职位|职务|title|position/.test(value)) return "title";
    if (/项目名称|项目名|project name/.test(value)) return "project_name";
    if (/角色|role/.test(value)) return "role";
    if (/描述|内容|职责|成果|介绍|description|detail/.test(value)) return "description";
    if (/技能|技术栈|skill/.test(value)) return "skills";
    if (/自我评价|个人总结|自我介绍/.test(value)) return "self_introduction";
    if (/本人已知悉|确认声明|隐私|条款|同意|consent|acknowledg/.test(value)) return "consent";
    return (preferLabelFallback ? leafValue || value || rawFallback || "field" : rawFallback || value || "field")
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field";
  };
  const controlKindFor = (element: Element, type: string) => {
    if (type === "file") return "file";
    if (type === "select") return "select";
    if (type === "combobox") return "combobox";
    if (["date", "month", "datetime-local"].includes(type)) return "date";
    if (["checkbox", "radio"].includes(type)) return type;
    if (type === "textarea") return "textarea";
    if (element.getAttribute("contenteditable") === "true") return "contenteditable";
    return "native";
  };
  const selectLikeNativeControl = (element: Element) => {
    if (!(element instanceof HTMLInputElement)) return false;
    if (["checkbox", "radio", "file"].includes(element.type)) return false;
    const identity = normalize([
      element.placeholder,
      element.getAttribute("aria-haspopup"),
      element.getAttribute("class")
    ].filter(Boolean).join(" "));
    const selectRoot = element.closest(
      "[class*='select'],[class*='Select'],[class*='selector'],[class*='Selector'],[role='combobox']"
    );
    const committedSelectEvidence = selectRoot?.querySelector(
      "[class*='display-value'],[class*='DisplayValue'],[class*='Select-addon'],[class*='select-addon'],[class*='caretDown'],[class*='dropdown']"
    );
    return Boolean(selectRoot) && (
      element.readOnly || /选择|select|listbox/i.test(identity) || Boolean(committedSelectEvidence)
    );
  };
  const domHintsFor = (element: Element) => {
    const classNames: string[] = [];
    const ancestorIds: string[] = [];
    let classNode: Element | null = element;
    for (let depth = 0; classNode && depth < 12; depth += 1, classNode = classNode.parentElement) {
      ancestorIds.push(classNode.id);
      classNames.push([
        String((classNode as HTMLElement).className || ""),
        ...["data-form-field-name", "data-form-field-i18n-name"].flatMap(name =>
          classNode?.hasAttribute(name) ? [`${name}:${classNode.getAttribute(name)}`] : [])
      ].join(" "));
    }
    return {
      tagName: element.tagName,
      ...(element instanceof HTMLSelectElement ? { multiple: element.multiple } : {}),
      ownedInputCount: element.closest("[class*=apply-field-]")?.querySelectorAll("input:not([type=hidden])").length,
      readOnly: (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.readOnly,
      inputType: element instanceof HTMLInputElement ? element.type :
        element instanceof HTMLTextAreaElement ? "textarea" : element instanceof HTMLSelectElement ? "select" : "",
      role: element.getAttribute("role"),
      ariaHasPopup: element.getAttribute("aria-haspopup"),
      ariaAutocomplete: element.getAttribute("aria-autocomplete"),
      disabled: (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement) ? element.disabled || element.matches(":disabled") || element.getAttribute("aria-disabled") === "true"
        : element.getAttribute("aria-disabled") === "true",
      name: element.getAttribute("name"),
      dataFieldName: element.closest("[data-form-field-name],[data-form-field-i18n-name]")?.getAttribute("data-form-field-name") ||
        element.closest("[data-form-field-name],[data-form-field-i18n-name]")?.getAttribute("data-form-field-i18n-name"),
      dataFieldId: element.getAttribute("data-form-field-id"),
      placeholder: element.getAttribute("placeholder"),
      ariaControls: element.getAttribute("aria-controls"),
      ariaOwns: element.getAttribute("aria-owns"),
      ariaLabel: element.getAttribute("aria-label"),
      testId: (element as HTMLElement).getAttribute("data-testid"),
      classNames,
      ancestorIds
    };
  };
  const popupBindingFor = (element: Element) => {
    if (element.getAttribute("role") !== "combobox") return null;
    const controlsId = element.getAttribute("aria-controls");
    const ownsId = element.getAttribute("aria-owns");
    const activeId = element.getAttribute("aria-activedescendant");
    const listbox = [
      controlsId ? document.getElementById(controlsId) : null,
      ownsId ? document.getElementById(ownsId) : null,
      activeId ? document.getElementById(activeId)?.closest("[role='listbox'],[role='tree'],[role='menu']") : null
    ].find(Boolean) as HTMLElement | null;
    return {
      controls: controlsId,
      owns: ownsId,
      listboxId: listbox?.id ?? null,
      expanded: element.getAttribute("aria-expanded") === "true"
    };
  };
  const sectionRootFor = (element: Element, sectionTitle: string | null) => {
    let ancestor = element.parentElement;
    for (let depth = 0; ancestor && depth < 18; depth += 1, ancestor = ancestor.parentElement) {
      const controlCount = ancestor.querySelectorAll(
        "input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"
      ).length;
      const text = normalize(ancestor.innerText).slice(0, 260);
      if (controlCount >= 2 && (
        ancestor.matches("[class*='applyFormModuleWrapper'],[class*='formModule'],[class*='moduleWrapper'],[class*='form-section'],section,fieldset") ||
        (sectionTitle && text.includes(sectionTitle))
      )) return ancestor;
    }
    return element.closest("form") as HTMLElement | null;
  };
  const groupIndexFor = (element: Element, sectionKey: string, sectionTitle: string | null) => {
    if (!["education", "work", "project", "research", "award", "language"].includes(sectionKey)) return null;
    // Moka's addable entries are sibling apply-fields.multi components, not
    // cards. Bind the component row even when only one exists, so adding the
    // next row never turns its identity into an unrelated collision ordinal.
    const mokaRow = element.closest<HTMLElement>("[class*='apply-fields-'][class*='multi-']");
    const mokaBlock = mokaRow?.parentElement;
    if (mokaBlock?.matches("[class*='apply-block-'][data-nav-id]") &&
      mokaRow?.querySelector("[class*='apply-field-']") &&
      element.closest("[class*='apply-field-']")?.parentElement === mokaRow) {
      const rows = [...mokaBlock.children].filter(row =>
        row.matches("[class*='apply-fields-'][class*='multi-']") && visible(row));
      const index = rows.indexOf(mokaRow);
      if (index >= 0) return index;
    }
    const groupSelector = [
      "[data-index]", "[data-repeat-index]", "[data-list-item]", "fieldset",
      "[class*='experienceItem']", "[class*='ExperienceItem']", "[class*='educationItem']",
      "[class*='EducationItem']", "[class*='projectItem']", "[class*='ProjectItem']",
      "[class*='form-list-item']", "[class*='FormListItem']", "[class*='listItem']",
      "[class*='ListItem']", "[class*='resumeItem']", "[class*='ResumeItem']",
      "[class*='card']", "[class*='Card']"
    ].join(",");
    let container: HTMLElement | null = null;
    let ancestor = element.parentElement;
    for (let depth = 0; ancestor && depth < 9; depth += 1, ancestor = ancestor.parentElement) {
      if (!ancestor.matches(groupSelector)) continue;
      const controlsInAncestor = ancestor.querySelectorAll(
        "input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"
      ).length;
      if (controlsInAncestor >= 1 && controlsInAncestor <= 24) {
        container = ancestor;
        break;
      }
    }
    if (!container) return null;
    const explicit = container.getAttribute("data-index") || container.getAttribute("data-repeat-index");
    if (explicit && /^\d+$/.test(explicit)) return Number(explicit);
    const parent = container.parentElement;
    if (!parent) return null;
    const siblings = [...parent.children].filter((candidate) =>
      candidate instanceof HTMLElement && visible(candidate) &&
      candidate.matches(groupSelector) &&
      candidate.querySelector("input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']")
    ) as HTMLElement[];
    if (siblings.length > 1) return siblings.indexOf(container);
    const root = sectionRootFor(element, sectionTitle);
    if (!root) return null;
    const rootGroups = [...root.querySelectorAll<HTMLElement>(groupSelector)]
      .filter((candidate) => visible(candidate) &&
        candidate.querySelector("input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"))
      .filter((candidate, index, all) =>
        !all.some((other) => other !== candidate && candidate.contains(other))
      );
    return rootGroups.length > 1 ? rootGroups.indexOf(container) : null;
  };
  const stableKeyFor = (
    label: string,
    sectionKey: string,
    groupIndex: number | null,
    controlKind: string,
    hints: ReturnType<typeof domHintsFor> & { fieldLabel?: string },
    localOrdinal: number,
    temporal?: PageFieldObservation["temporal"]
  ) => {
    // Both choices and Moka calendar inputs clear their placeholder on commit.
    // Use the owned title when there is no persistent name; a bilingual hint
    // must not disappear from the identity after selecting a month or day.
    // This observes the control signature, not the tenant or date field name.
    const leafLabel = normalize(label).split("·").at(-1)?.trim() ?? "";
    const calendarSignature = hints.classNames.slice(0, 5).join(" ");
    const readonlyCalendar = hints.tagName === "INPUT" && hints.readOnly &&
      /Dropdown-container|dropdown-container/u.test(calendarSignature) &&
      /(?:^|\s|-)day_info(?:\s|-|$)|picker-addon/iu.test(calendarSignature);
    const labelFallback = (["combobox", "select"].includes(controlKind) || readonlyCalendar) && !hints.dataFieldName && !hints.name &&
      Boolean(leafLabel) && !/^(?:年|月|year|month|请选择|请搜索|please\s*select)$/i.test(leafLabel);
    const slot = temporal?.scope === "field"
      ? `range_${identityText(hints.fieldLabel).replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_").slice(0, 64)}_${temporal.edge}_${temporal.part}`
      : semanticSlotFor(label, hints.dataFieldName || hints.name || hints.placeholder || hints.ariaLabel, labelFallback);
    const groupPart = groupIndex === null ? "" : `[${groupIndex}]`;
    const ordinalPart = slot === "field" || (slot.length <= 2 && !labelFallback) ? `.field${localOrdinal}` : "";
    return `${sectionKey}${groupPart}.${slot}.${controlKind}${ordinalPart}`;
  };
  // This concrete component owns two year/month pairs and a separator. Its
  // structure remains authoritative when a tenant calls the range “时长” or
  // clears every Select placeholder. Do not borrow adjacent date controls.
  const ownedMokaMonthRangeFor = (element: Element) => {
    const rangeSelector = ".month-range-select.date_group_info,.month-range-select.date_info";
    const root = element.closest<HTMLElement>(rangeSelector);
    const field = root?.closest<HTMLElement>("[class*='apply-field-']");
    if (!root || !field || field.querySelectorAll(rangeSelector).length !== 1) return null;
    const inputs = [...root.querySelectorAll<HTMLInputElement>("input:not([type='hidden']):not([type='checkbox'])")];
    const toggles = [...root.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].filter(input =>
      /^(?:至今|present)$/iu.test(normalize(input.closest("label")?.textContent)));
    if (toggles.length > 1 || root.querySelectorAll("input[type=checkbox]").length !== toggles.length) return null;
    const toggle = toggles[0] ?? null;
    const ongoing = toggle?.checked === true;
    if (!(inputs.length === 4 || ongoing && inputs.length === 2) || inputs.some(input => input.type !== "text" ||
      !input.closest("[class*='Select-container']"))) return null;
    const children = [...root.children];
    const pairs = children.filter(child => inputs.some(input => child.contains(input)));
    const separators = children.filter(child => /(?:^|\s)till-/u.test(child.className) && normalize(child.textContent) === "-");
    const fullRange = pairs.length === 2 && separators.length === 1 &&
      children.indexOf(pairs[0]!) < children.indexOf(separators[0]!) &&
      children.indexOf(separators[0]!) < children.indexOf(pairs[1]!);
    const ongoingRange = ongoing && inputs.length === 2 && pairs.length === 1 && separators.length === 0;
    if ((!fullRange && !ongoingRange) ||
      pairs.some(pair => inputs.filter(input => pair.contains(input)).length !== 2)) return null;
    for (const [index, input] of inputs.entries()) {
      const hint = normalize(input.placeholder);
      const year = index % 2 === 0;
      if (hint && !(year ? /^(?:年(?:\s*[／/]\s*(?:yyyy|year))?|yyyy|year)$/iu
        : /^(?:月(?:\s*[／/]\s*(?:mm|month))?|mm|month)$/iu).test(hint)) return null;
    }
    const section = sectionTitleFor(element) ?? "";
    const fieldScoped = !/^(?:教育(?:背景|经历)|工作经历|实习经历|项目(?:经历|经验)|education|work experience|internship experience|projects?)$/iu.test(section);
    return { root, inputs, fieldScoped, toggle, ongoing, field };
  };
  const temporalPartForInput = (input: HTMLInputElement): "year" | "month" | null => {
    const hint = normalize([
      input.getAttribute("placeholder"),
      input.getAttribute("aria-label"),
      input.getAttribute("name")
    ].filter(Boolean).join(" "));
    if (/^(?:年(?:\s*[／/]\s*(?:yyyy|year))?|yyyy|year)$/i.test(hint)) return "year";
    if (/^(?:月(?:\s*[／/]\s*(?:mm|month))?|mm|month)$/i.test(hint)) return "month";

    // Once Moka commits one side of a year/month range, React clears the
    // native input placeholder and renders the value in a sibling display
    // node. Keep that committed control in the four-part range; otherwise the
    // two remaining blank controls are misclassified as one ambiguous date.
    const select = input.closest<HTMLElement>(
      "[class*='Select-container'],[class*='select-container'],[class*='Select'],[class*='select']"
    );
    const display = select?.querySelector<HTMLElement>(
      "[class*='Input-display-value'],[class*='input-display-value'],[class*='display-value'],[class*='DisplayValue'],[class*='selection-item'],[class*='selection-text']"
    );
    const committed = normalize([
      input.getAttribute("aria-valuetext"),
      input.value,
      display?.textContent
    ].filter(Boolean).join(" "));
    if (/^(?:19|20)\d{2}年?$/u.test(committed)) return "year";
    const month = Number(committed.replace(/月$/u, ""));
    if (Number.isSafeInteger(month) && month >= 1 && month <= 12) return "month";

    // Some Moka tenants rebuild a committed Select without preserving either
    // its placeholder or a readable value on the input. Within a proven Moka
    // time field, the supported layouts are fixed year/month pairs, so retain
    // the temporal identity by pair position across subsequent observations.
    const mokaField = input.closest<HTMLElement>("[class*='apply-field-']");
    if (!mokaField || !/时间|日期|年月|入学|毕业|开始|起始|结束|截止|start|end|from|to|graduation/i.test(
      normalize(mokaField.innerText).slice(0, 360)
    )) return null;
    const rangeInputs = [...mokaField.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")]
      .filter((candidate) => visible(candidate))
      .filter((candidate) => Boolean(candidate.closest(
        "[class*='Select-container'],[class*='select-container'],[class*='Select'],[class*='select']"
      )));
    if ([2, 4].includes(rangeInputs.length) && rangeInputs.includes(input)) {
      return rangeInputs.indexOf(input) % 2 === 0 ? "year" : "month";
    }
    return null;
  };
  const temporalMetadataFor = (element: Element, baseLabel: string): PageFieldObservation["temporal"] | null => {
    if (!(element instanceof HTMLInputElement) ||
      !["text", "date", "month", "datetime-local"].includes(element.type)) {
      return null;
    }
    const ownedRange = ownedMokaMonthRangeFor(element);
    if (ownedRange && ownedRange.inputs.includes(element) && normalize(baseLabel)) {
      const index = ownedRange.inputs.indexOf(element);
      return { groupKey: identityText(`${sectionTitleFor(element) ?? ""} ${baseLabel}`),
        layout: "year_month_range", edge: index < 2 ? "start" : "end", part: index % 2 === 0 ? "year" : "month", ...(ownedRange.fieldScoped ? { scope: "field" as const } : {}) };
    }
    const hint = normalize([
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("name")
    ].filter(Boolean).join(" "));
    const part = temporalPartForInput(element);
    if (!part) return null;

    const baseIdentity = identityText(baseLabel);
    let twoControlFallback: PageFieldObservation["temporal"] | null = null;
    let ancestor: HTMLElement | null = element.parentElement;
    for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
      const rangeText = normalize(ancestor.innerText).slice(0, 360);
      const identity = `${baseIdentity} ${identityText(rangeText)} ${hint}`;
      if (!/时间|日期|年月|入学|毕业|开始|起始|结束|截止|start|end|from|to|graduation/i.test(identity)) continue;
      const rangeInputs = [...ancestor.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")]
        .filter((candidate) => visible(candidate))
        .filter((candidate) => {
          return temporalPartForInput(candidate) !== null;
        });
      if (![2, 4].includes(rangeInputs.length) || !rangeInputs.includes(element)) continue;
      const index = rangeInputs.indexOf(element);
      const layout: "year_month_range" | "year_month" = rangeInputs.length === 4 ? "year_month_range" : "year_month";
      let edge: "single" | "start" | "end" = "single";
      if (layout === "year_month_range") {
        edge = index < 2 ? "start" : "end";
      } else if (/毕业|结束|截止|end|to|graduation/i.test(identity) &&
        !/开始工作年月|首次工作|参加工作|first work|work start/i.test(identity)) {
        edge = "end";
      } else if (/入学|开始|起始|start|from/i.test(identity) &&
        !/开始工作年月|首次工作|参加工作|first work|work start/i.test(identity)) {
        edge = "start";
      }
      const groupKey = identityText(`${sectionTitleFor(element) ?? ""} ${baseLabel} ${rangeText}`).slice(0, 120) || "date";
      const temporal = { groupKey, layout, edge, part };
      // Moka nests each year/month pair below the actual four-control range.
      // Do not stop at that inner pair: keep it as a fallback and prefer the
      // enclosing start/end range when the same control participates in one.
      if (layout === "year_month_range") return temporal;
      twoControlFallback ??= temporal;
    }
    return twoControlFallback;
  };
  const timeRangeLabel = (
    element: Element,
    baseLabel: string,
    temporal: PageFieldObservation["temporal"] | null
  ) => {
    if (!(element instanceof HTMLInputElement) ||
      !["text", "date", "month", "datetime-local"].includes(element.type)) {
      return baseLabel;
    }
    if (temporal?.scope === "field") {
      return `${baseLabel}（${temporal.edge === "start" ? "开始" : "结束"}${temporal.part === "year" ? "年份" : "月份"}）`;
    }
    // A date-shaped answer does not make an editable scalar input a range
    // endpoint. Keep its visible identity, just as the native rebind does.
    // Select-backed inputs and readonly/calendar controls retain their own
    // temporal observation below.
    if (!temporal && element.type === "text" && !element.readOnly &&
      !selectLikeNativeControl(element)) return baseLabel;
    const baseIdentity = identityText(baseLabel);
    const hint = normalize([
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("name")
    ].filter(Boolean).join(" "));
    const timeSignal = `${baseIdentity} ${hint}`;
    // “最近毕业专业/院校” describes education content, not a date. Plain
    // “毕业” must therefore not turn an ordinary Select into an end-date
    // field; require an actual temporal word or a complete date phrase.
    const hasExplicitTimeSignal = /时间|日期|年月|年份|入学(?:时间|日期|年月|年份)|毕业(?:时间|日期|年月|年份)|开始(?:时间|日期|年月)|起始(?:时间|日期|年月)|结束(?:时间|日期|年月)|截止(?:时间|日期)|\b(?:start|end|from|to|graduation)\s+(?:date|time|year|month)\b/i.test(timeSignal);
    const temporalUnit = temporal?.part === "year" || /^(年|yyyy)$/i.test(hint)
      ? "年"
      : temporal?.part === "month" || /^(月|mm)$/i.test(hint)
        ? "月"
        : "";
    const withTemporalUnit = (value: string) => temporalUnit ? `${value} · ${temporalUnit}` : value;
    if (temporal) {
      const ancestorText = (() => {
        let ancestor: HTMLElement | null = element.parentElement;
        for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
          const value = normalize(ancestor.innerText);
          if (value && value.length <= 400 && /时间|日期|年月|入学|毕业|开始|结束|截止/.test(value)) return value;
        }
        return "";
      })();
      const identity = `${timeSignal} ${sectionTitleFor(element) ?? ""} ${ancestorText}`;
      const sectionFor = (value: string) => /工作经历|实习经历|任职|工作|实习|公司|职位|岗位|work|intern/i.test(value) ? "工作经历" :
        /项目经历|项目经验|项目|project/i.test(value) ? "项目经历" :
          /教育背景/i.test(value) ? "教育背景" : "教育经历";
      if (/开始工作年月|首次工作|参加工作|first work|work start/i.test(identity)) {
        return withTemporalUnit("基本信息 · 开始工作年月");
      }
      if (temporal.layout === "year_month" && temporal.edge === "end" &&
        /申请信息|基本信息|个人信息/i.test(sectionTitleFor(element) ?? "") &&
        /毕业|graduation/i.test(`${baseLabel} ${ancestorText}`)) {
        return withTemporalUnit("个人信息 · 毕业时间");
      }
      if (temporal.edge === "start") return withTemporalUnit(`${sectionFor(identity)} · 开始时间`);
      if (temporal.edge === "end") return withTemporalUnit(`${sectionFor(identity)} · 结束时间`);
      return withTemporalUnit(baseLabel);
    }
    if (!hasExplicitTimeSignal) return baseLabel;
    if (/开始工作年月|首次工作|参加工作|first work|work start/i.test(timeSignal)) {
      return withTemporalUnit("基本信息 · 开始工作年月");
    }
    const sectionFor = (value: string) => /工作经历|实习经历|任职|工作|实习|公司|职位|岗位|work|intern/i.test(value) ? "工作经历" :
      /项目经历|项目经验|项目|project/i.test(value) ? "项目经历" : "教育经历";
    if (/开始|起始|入学|start|from/i.test(timeSignal)) return withTemporalUnit(`${sectionFor(baseLabel)} · 开始时间`);
    if (/结束|截止|毕业|end|to/i.test(timeSignal)) return withTemporalUnit(`${sectionFor(baseLabel)} · 结束时间`);
    let ancestor: HTMLElement | null = element.parentElement;
    for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
      const rangeText = normalize(ancestor.innerText);
      if (!/时间|日期|入学|毕业|开始|起始|结束|截止/.test(baseIdentity)) continue;
      if (!/起止时间|入学时间|毕业时间|开始时间|结束时间/.test(rangeText)) continue;
      const rangeInputs = [...ancestor.querySelectorAll("input:not([type='hidden'])")]
        .filter((candidate) => visible(candidate)) as HTMLInputElement[];
      if (rangeInputs.length < 2 || rangeInputs.length > 4 || !rangeInputs.includes(element)) continue;
      const index = rangeInputs.indexOf(element);
      const edge = index === 0 ? "入学/开始时间" : "毕业/结束时间";
      const section = sectionFor(rangeText);
      return withTemporalUnit(`${section} · ${edge}`);
    }
    return baseLabel;
  };
  const committedDateValue = (element: Element, label: string) => {
    if (!(element instanceof HTMLInputElement)) return "";
    const nativeValue = normalize(element.value);
    if (nativeValue) return nativeValue;
    const identity = normalize([
      label,
      element.placeholder,
      element.name,
      element.getAttribute("aria-label"),
      element.getAttribute("class"),
      element.parentElement?.getAttribute("class")
    ].filter(Boolean).join(" "));
    const pickerRoot = element.closest(
      ".atsx-date-picker-period-month,.atsx-date-picker-period,[class*='date-picker-period'],[class*='datePickerPeriod']"
    ) as HTMLElement | null;
    if (!pickerRoot && !/时间|日期|入学|毕业|开始|起始|结束|截止|start|end|from|to/i.test(identity)) {
      return "";
    }
    const dateToken = (value: unknown) => {
      const rendered = normalize(value);
      if (!rendered || /^(?:请选择|开始时间|结束时间|入学时间|毕业时间)$/i.test(rendered)) return "";
      return rendered.match(/(?:19|20)\d{2}(?:\s*[-/.年]\s*\d{1,2}(?:\s*[-/.月]\s*\d{1,2}\s*日?)?)?|至今|现在/)?.[0]
        ?.replace(/\s+/g, "") ?? "";
    };
    const intrinsic = [
      element.getAttribute("aria-valuetext"),
      element.getAttribute("data-value"),
      element.getAttribute("value"),
      element.getAttribute("title")
    ].map(dateToken).find(Boolean);
    if (intrinsic) return intrinsic;
    if (!pickerRoot) return "";

    // Feishu/Xiaopeng's month range picker commits the selected year/month in
    // sibling labels while leaving the native input value empty. Read only the
    // component's committed-value nodes; popup calendar text and placeholders
    // are deliberately excluded.
    const renderedValues = [
      ...pickerRoot.querySelectorAll<HTMLElement>(
        ".atsx-date-picker-period-month-label,[class*='date-picker-period-month-label']"
      )
    ].map((candidate) => dateToken(candidate.innerText)).filter(Boolean);
    if (!renderedValues.length) {
      const inputBox = element.closest(
        ".atsx-date-picker-period-input-box,[class*='date-picker-period-input-box']"
      ) as HTMLElement | null;
      const localValue = inputBox
        ? [...inputBox.querySelectorAll<HTMLElement>(
            "[aria-valuetext],[data-value],[class*='label-value'],[class*='selected-value']"
          )].map((candidate) => dateToken(
            candidate.getAttribute("aria-valuetext") ||
            candidate.getAttribute("data-value") ||
            candidate.innerText
          )).find(Boolean)
        : "";
      return localValue || "";
    }
    const edge = /结束|截止|毕业|end|to/i.test(identity) ? "end" :
      /开始|起始|入学|start|from/i.test(identity) ? "start" : null;
    if (edge === "end") return renderedValues.at(-1) ?? "";
    if (edge === "start") return renderedValues[0] ?? "";
    const rangeInputs = [...pickerRoot.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")]
      .filter((candidate) => visible(candidate));
    const inputIndex = rangeInputs.indexOf(element);
    return renderedValues[inputIndex >= 0 ? inputIndex : 0] ?? "";
  };
  // A compound is identified by a bounded group title AND distinct physical
  // control roles, never by its title alone. Unproven two-input groups such as
  // date ranges and password confirmation retain their existing observation.
  const compoundValue = (element: Element) => {
    if (element instanceof HTMLSelectElement) return element.value
      ? normalize(element.selectedOptions[0]?.textContent) : "";
    const selectRoot = element.matches("[role='combobox']") ? element : element.closest(
      "[role='combobox'],[class*='Select-container'],[class*='select-container']"
    );
    if (selectRoot) {
      const display = normalize(selectRoot.querySelector<HTMLElement>(
        "[class*='display-value'],[class*='DisplayValue'],[class*='selection-item'],[class*='selected-value']"
      )?.textContent);
      return /^(?:请选择|请搜索|select|please select)?$/iu.test(display) ? "" : display;
    }
    if (element.matches("[aria-haspopup='listbox'],[aria-autocomplete='list']") ||
      selectLikeNativeControl(element)) return ""; // A search draft is not a committed option.
    return element instanceof HTMLInputElement ? normalize(element.value) : "";
  };
  const identityDocumentCompoundFor = (element: Element) => {
    const root = element.closest<HTMLElement>(
      "[class*='apply-field-'],.form-item,.form-group,.ant-form-item,.ud-formily-item,[class*='formItem'],fieldset,[role='group']"
    ) ?? element.parentElement?.closest<HTMLElement>("[data-form-field-id]");
    if (!root) return null;
    const members = controls.filter(control => root.contains(control));
    if (members.length !== 2) return null;
    const typeControls = members.filter(control => control instanceof HTMLSelectElement ||
      control.matches("[role='combobox'],[aria-haspopup='listbox'],[aria-autocomplete='list']") || selectLikeNativeControl(control));
    if (typeControls.length !== 1) return null;
    const typeControl = typeControls[0]!;
    const numberControl = members.find(control => control !== typeControl);
    if (!(numberControl instanceof HTMLInputElement) || numberControl.readOnly ||
      !["text", "tel"].includes(numberControl.type)) return null;
    const headings = [...root.querySelectorAll<HTMLElement>(
      "legend,label,[class*='title'],[class*='Title'],[class*='label'],[class*='Label']"
    )].filter(node => !members.some(member => node.contains(member)) && visible(node) &&
      !(node instanceof HTMLLabelElement && node.control));
    const title = headings.map(node => normalize(node.innerText).replace(/[＊*]/g, "").trim())
      .find(text => /^(?:证件号码|证件号|证件信息|身份证号码|身份证号|identity document(?: number| information)?)$/iu.test(text));
    if (!title) return null;
    return {
      root, typeControl, numberControl,
      role: element === typeControl ? "type" as const : "number" as const,
      label: /identity document/i.test(title)
        ? `Identity document ${element === typeControl ? "type" : "number"}`
        : element === typeControl ? "证件类型" : "证件号码",
      required: root.getAttribute("aria-required") === "true" || headings.some(node => /[*＊]/u.test(node.innerText)) ||
        Boolean(root.querySelector("[class*='required-asterisk'],[class*='requiredAsterisk']")),
      mokaSharedError: root.matches("[class*='apply-field-']") &&
        Boolean(typeControl.closest("[class*='Select-container']")) &&
        Boolean(numberControl.closest("[class*='number-']"))
    };
  };
  const phoneNumberCompoundFor = (element: Element) => {
    if (location.hostname !== "app.mokahr.com" ||
      !/^\/(?:social|campus)-recruitment\/[^/]+\/[^/]+\/?$/iu.test(location.pathname) ||
      !/^#\/job\/[^/?]+\/apply(?:[/?]|$)/iu.test(location.hash)) return null;
    const root = element.closest<HTMLElement>("[class*='apply-field-']");
    if (!root) return null;
    const members = controls.filter(control => root.contains(control));
    if (members.length !== 2) return null;
    const callingCodeControls = members.filter((candidate) => {
      if (!(candidate instanceof HTMLInputElement) || candidate.disabled ||
        !["text", "search"].includes(candidate.type)) return false;
      const codeShell = candidate.closest<HTMLElement>("[class*='code-']");
      const select = candidate.closest<HTMLElement>("[class*='sd-Select-container']");
      const dropdown = select?.closest<HTMLElement>("[class*='sd-Dropdown-container']");
      return Boolean(codeShell && root.contains(codeShell) && select && dropdown &&
        root.contains(dropdown) && select.querySelectorAll("input").length === 1);
    });
    if (callingCodeControls.length !== 1) return null;
    const callingCodeControl = callingCodeControls[0]!;
    const numberControl = members.find(candidate => candidate !== callingCodeControl);
    if (!(numberControl instanceof HTMLInputElement) || numberControl.readOnly || numberControl.disabled ||
      !["text", "tel"].includes(numberControl.type) ||
      !numberControl.closest("[class*='number-']")) return null;
    const numberIdentity = normalize([
      numberControl.placeholder,
      numberControl.name,
      numberControl.getAttribute("aria-label")
    ].filter(Boolean).join(" "));
    if (!/(?:手机(?:号|号码)?|电话(?:号码)?|mobile|phone|tel)/iu.test(numberIdentity)) return null;
    const titles = [...root.children].filter((candidate): candidate is HTMLElement =>
      candidate instanceof HTMLElement && visible(candidate) &&
      /title|label/iu.test(String(candidate.className)) &&
      !candidate.querySelector("input,textarea,select,[role='combobox']"))
      .map(candidate => normalize(candidate.innerText).replace(/[＊*]/gu, "").trim())
      .filter(value => value.length <= 64 &&
        /(?:手机(?:号|号码)?|电话(?:号码)?|\bmobile(?: phone)?\b|\bphone(?: number)?\b|\btelephone\b|\btel\b)/iu.test(value));
    if (titles.length !== 1) return null;
    return {
      root,
      callingCodeControl,
      numberControl,
      role: element === callingCodeControl ? "calling_code" as const : "number" as const
    };
  };
  const rawFields = controls.map((element, index) => {
    const input = element as HTMLInputElement;
    const identityDocumentCompound = identityDocumentCompoundFor(element);
    const phoneNumberCompound = phoneNumberCompoundFor(element);
    const rawBaseLabel = identityDocumentCompound?.label ?? labelFor(element);
    const temporal = temporalMetadataFor(element, rawBaseLabel);
    const baseLabel = timeRangeLabel(element, rawBaseLabel, temporal);
    const sectionTitle = sectionTitleFor(element);
    const label = sectionTitle && sectionTitle !== "个人信息" && !baseLabel.includes(sectionTitle)
      ? `${sectionTitle} · ${baseLabel}`.slice(0, 160)
      : contextualLabel(element, baseLabel);
    const type = element.tagName === "TEXTAREA" ? "textarea" :
      element.tagName === "SELECT" ? "select" :
        element.getAttribute("role") === "combobox" || element.getAttribute("aria-autocomplete") === "list" ||
          element.getAttribute("aria-haspopup") === "listbox" || selectLikeNativeControl(element) ? "combobox" :
          element.getAttribute("contenteditable") === "true" ? "contenteditable" :
            (input.type || "text");
    const controlKind = controlKindFor(element, type);
    const hints = { ...domHintsFor(element), fieldLabel: rawBaseLabel };
    const sectionKey = sectionKeyFor(label, sectionTitle);
    const groupIndex = groupIndexFor(element, sectionKey, sectionTitle);
    const labelPath = [
      ...(sectionTitle ? [sectionTitle] : []),
      baseLabel
    ].filter(Boolean);
    const options = element.tagName === "SELECT"
      ? [...(element as HTMLSelectElement).options].filter(option => option.value !== "" && !option.disabled &&
          !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled))
          .map((option) => normalize(option.textContent)).filter(Boolean)
      : [...(element.closest("[role='radiogroup'],[role='listbox']")?.querySelectorAll(
          "[role='radio'],[role='option'],label"
        ) ?? [])].map((option) => normalize((option as HTMLElement).innerText)).filter(Boolean).slice(0, 40);
    const fileIdentity = type === "file" ? normalize([
      input.id,
      input.name,
      input.getAttribute("data-form-field-name"),
      input.getAttribute("data-testid")
    ].filter(Boolean).join(" ")) : "";
    const documentAccept = type === "file" && /pdf|docx?|msword|officedocument/i.test(input.accept);
    const photoLikeFile = type === "file" && !documentAccept && /(?:image|png|jpe?g|照片|头像|证件照|photo|portrait|avatar)/i.test([
      input.accept,
      fileIdentity,
      label
    ].filter(Boolean).join(" "));
    // Some ATS upload widgets reuse a generic resumeKey-like DOM name for
    // every attachment. Image semantics are stronger evidence than that
    // implementation detail, so an optional portrait must never inherit the
    // required-resume rule.
    const resumeKeyFile = type === "file" && !photoLikeFile && /resum(?:e|é).?key/i.test(fileIdentity);
    // Moka renders the required asterisk through a CSS pseudo-element on a
    // dedicated marker span. The native input has neither `required` nor
    // `aria-required`, and the `*` is therefore absent from innerText. Bind
    // that marker to the field wrapper instead of guessing from field names.
    // A phone wrapper contains both a country-code selector and the actual
    // phone input; only the latter is the required answer control.
    const mokaFieldWrapper = element.closest("[class*='apply-field-']") as HTMLElement | null;
    const mokaRequiredMarker = mokaFieldWrapper?.querySelector(
      "[class*='required-asterisk'],[class*='requiredAsterisk']"
    ) ?? null;
    const mokaWrapperControls = mokaFieldWrapper
      ? [...mokaFieldWrapper.querySelectorAll(
          "input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"
        )].filter((candidate) => {
          const nestedCombobox = candidate.closest("[role='combobox']");
          return !(candidate instanceof HTMLInputElement && nestedCombobox && nestedCombobox !== candidate);
        })
      : [];
    const mokaPhoneAnswer = /手机号码|联系电话|mobile|phone/i.test(normalize(mokaFieldWrapper?.innerText)) &&
      /手机号|mobile|phone|tel/i.test(normalize([
        input.placeholder,
        input.name,
        input.getAttribute("aria-label")
      ].filter(Boolean).join(" ")));
    const ownedRange = ownedMokaMonthRangeFor(element);
    const optionalPresent = input.type === "checkbox" && Boolean(ownedRange) &&
      /^(?:至今|present)$/iu.test(normalize(element.closest("label")?.textContent));
    const mokaTemporalAnswer = temporal?.scope === "field" || Boolean(temporal) && (
      ownedRange?.inputs.includes(input) || mokaWrapperControls.length >= 2 && mokaWrapperControls.length <= 4);
    const mokaMarkedRequired = Boolean(mokaRequiredMarker) && (
      mokaWrapperControls.length <= 1 ||
      mokaPhoneAnswer ||
      mokaTemporalAnswer ||
      resumeKeyFile ||
      input.type === "checkbox" && !optionalPresent ||
      input.type === "radio"
    );
    const explicitRequired = input.required || element.getAttribute("aria-required") === "true" ||
      /(^|\s)[*＊](\s|$)|必填/.test(label) || resumeKeyFile || mokaMarkedRequired ||
      Boolean(identityDocumentCompound?.required) || (() => {
        const validationItem = element.closest<HTMLElement>(
          ".ud-formily-item,.ant-form-item,.form-item,.form-group,[class*='formItem']"
        ) ?? element.parentElement?.closest<HTMLElement>("[data-form-field-id]") ?? null;
        const itemText = normalize(validationItem?.innerText);
        const itemControls = validationItem
          ? [...validationItem.querySelectorAll(
              "input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"
            )].filter((candidate) => visible(candidate))
          : [];
        const validationRequiresValue = /请填写完整时间|必填项未填写|不能为空|此项为必填|(?:为|是)必填(?:项)?/u
          .test(itemText);
        const ownsValidation = itemControls.length <= 1 || Boolean(temporal) || mokaPhoneAnswer ||
          resumeKeyFile || input.type === "checkbox" && !optionalPresent || input.type === "radio";
        return element.getAttribute("aria-invalid") === "true" ||
          (validationRequiresValue && ownsValidation);
      })();
    const inferredCoreRequired = /姓名|邮箱|学校(?:名称)?|学历|专业|意向.*城市|工作城市|起止时间|开始时间|结束时间|毕业时间/i.test(label) &&
      !/可选|非必填|选填/.test(label);
    // Inferred core fields are useful planning hints, but they must never turn
    // an optional ATS control into a submission blocker. Only explicit page
    // evidence (native/ARIA required, a required marker, or a required resume
    // upload) is authoritative for requiredness.
    const required = explicitRequired;
    const selectLikeContainer = element.closest(
      ".ant-form-item,.form-item,.form-group,[class*='formItem'],[class*='field']"
    ) ?? element.parentElement;
    const mokaTagSelect = element instanceof HTMLInputElement &&
      /\bsd-Input-tag-input-/u.test(element.className)
      ? element.closest<HTMLElement>("[class*='sd-Select-container'].multi_select_info") : null;
    // Proven Moka Select controls can own a committed display distinct from
    // their editable query. Keep each use constrained to its structural marker.
    const mokaQuerySelect = element instanceof HTMLInputElement && element.type === "text" && !element.readOnly &&
      /sd-Input-input/u.test(element.className) &&
      /\bstring_info-/u.test(mokaFieldWrapper?.className ?? "") &&
      mokaFieldWrapper?.querySelectorAll("input:not([type=hidden])").length === 1 &&
      element.closest("[class*='sd-Dropdown-container']")
      ? element.closest<HTMLElement>("[class*='sd-Select-container']") : null;
    const committedQuerySelection = mokaQuerySelect
      ? normalize(mokaQuerySelect.querySelector<HTMLElement>("[class*='sd-Input-display-value']")?.textContent) : "";
    // Moka multi-select stores committed labels in individual Tag-text leaves.
    // Its empty tag container and query input are not selected values.
    const selectedDisplayValue = mokaTagSelect
      ? [...mokaTagSelect.querySelectorAll<HTMLElement>("[class*='sd-Tag-text-']")]
        .filter(item => visible(item) && item.closest("[class*='sd-Tag-container-'][class*='sd-Input-tag-']"))
        .map(item => normalize(item.textContent)).filter(Boolean).join("、")
      : normalize([...(selectLikeContainer?.querySelectorAll(
      "[class*='display-value'],[class*='DisplayValue'],[class*='selection-item'],[class*='selection-text'],[class*='selected-value'],[class*='selected'],[class*='Select-value'],[class*='select-value'],[class*='Selector-value'],[class*='selector-value'],[class*='tag'],[class*='value']"
    ) ?? [])].map((item) => (item as HTMLElement).innerText || item.getAttribute("title")).join("、"));
    const selectContainerText = normalize((selectLikeContainer as HTMLElement | null)?.innerText);
    const degreeDisplayValue = /最高学历|学历|学位|degree/i.test([
      input.placeholder,
      label,
      hints.name,
      hints.dataFieldName,
      hints.ariaLabel
    ].filter(Boolean).join(" "))
      ? selectContainerText.match(/博士研究生|博士|硕士研究生|硕士|本科(?:学士)?|学士|大专|专科|高中|中专/i)?.[0] ?? ""
      : "";
    const degreeLike = /最高学历|学历|学位|degree/i.test([
      input.placeholder,
      label,
      hints.name,
      hints.dataFieldName,
      hints.ariaLabel
    ].filter(Boolean).join(" "));
    const committedSelectedDisplay = /^(?:请选择|请搜索|请输入)?$/i.test(selectedDisplayValue)
      ? ""
      : selectedDisplayValue;
    const selectLikeDisplayValue = type === "combobox" || /请选择|最高学历|学历|学位|degree/i.test([
      input.placeholder,
      label,
      hints.name,
      hints.dataFieldName,
      hints.ariaLabel
    ].filter(Boolean).join(" ")) ? selectedDisplayValue || degreeDisplayValue : "";
    const uploadedFileText = input.type === "file" ? normalize((() => {
      let ancestor: HTMLElement | null = input.parentElement;
      for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
        const fileControls = [...ancestor.querySelectorAll("input[type='file']")];
        if (fileControls.length !== 1 || fileControls[0] !== input) continue;
        const value = normalize(ancestor.innerText);
        if (/\.(pdf|docx?|png|jpe?g)(?:\s|$)/i.test(value)) return value;
      }
      return "";
    })()).slice(0, 240) : "";
    const committedDate = committedDateValue(element, label);
    const nativePlaceLike = /籍贯|native.?place|hometown|place.?of.?origin/i.test([
      label,
      input.placeholder,
      hints.name,
      hints.dataFieldName,
      hints.ariaLabel
    ].filter(Boolean).join(" "));
    const nativePlaceDisplayValue = nativePlaceLike && (
      selectedDisplayValue === normalize(input.placeholder) ||
      /^(?:请输入|请选择)?籍贯$/i.test(selectedDisplayValue)
    ) ? "" : selectedDisplayValue;
    const temporalDisplayValue = temporal && element instanceof HTMLInputElement
      ? normalize(element.closest<HTMLElement>(
          "[class*='Select-container'],[class*='select-container'],[class*='Select'],[class*='select']"
        )?.querySelector<HTMLElement>(
          "[class*='Input-display-value'],[class*='input-display-value'],[class*='display-value'],[class*='DisplayValue'],[class*='selection-item'],[class*='selection-text']"
        )?.textContent)
      : "";
    const currentValue = identityDocumentCompound?.role === "type" ? compoundValue(element)
      : phoneNumberCompound?.role === "calling_code" ? compoundValue(element)
      : input.type === "checkbox" || input.type === "radio"
      ? String(input.checked)
      : input.type === "file"
        ? [...(input.files ?? [])].map(file => file.name).join("、") || uploadedFileText
      : element.tagName === "SELECT"
        // Expose only committed option labels, never all choices or an opaque
        // option code. This is also the registry's page_option_exact readback.
        ? Array.from((element as HTMLSelectElement).selectedOptions)
          .filter(option => option.value !== "")
          .map(option => normalize(option.textContent)).join("、")
      : degreeLike && type === "combobox"
        ? degreeDisplayValue || committedSelectedDisplay.slice(0, 240)
      : mokaTagSelect
        ? selectedDisplayValue
      : mokaQuerySelect
        ? committedQuerySelection
      // A proven field-owned range contains four distinct Select answers.
      // An empty owned display must not borrow sibling values or query text.
      : temporal?.scope === "field"
        ? temporalDisplayValue
      : committedDate
        ? committedDate
      : temporalDisplayValue
        ? temporalDisplayValue
      : type === "combobox"
        ? normalize(input.value) || nativePlaceDisplayValue.slice(0, 240)
        : selectLikeDisplayValue
          ? normalize(input.value) || selectLikeDisplayValue.slice(0, 240)
        : element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value : normalize(element.textContent);
    const validationMessage = fieldValidationMessageFor(
      element,
      optionalPresent ? element.closest<HTMLElement>("label") : identityDocumentCompound?.root ?? mokaFieldWrapper,
      identityDocumentCompound
    );
    const rangeTitle = ownedRange ? normalize([...ownedRange.field.children].find(child =>
      /title-/u.test(child.className))?.textContent).replace(/[＊*]/gu, "").trim() : "";
    const rangeGroupKey = `${sectionKey}${groupIndex === null ? "" : `[${groupIndex}]`}.range_${identityText(rangeTitle)}`;
    const dateRange = ownedRange?.toggle ? { kind: "moka_year_month" as const,
      role: (element === ownedRange.toggle ? "present" : ownedRange.inputs.indexOf(input) < 2 ? "start" : "end") as "start" | "end" | "present",
      groupKey: rangeGroupKey, ongoing: ownedRange.ongoing, fieldScoped: ownedRange.fieldScoped } : undefined;
    return {
      fieldId: `field-${index + 1}`,
      stableFieldKey: optionalPresent ? `${rangeGroupKey}.present.checkbox` : stableKeyFor(label, sectionKey, groupIndex, controlKind, hints, index, temporal),
      ...(dateRange ? { dateRange } : {}),
      ...(optionalPresent ? { observedControlKind: "moka_range_present" as const } : {}),
      selector: selectorFor(element),
      label,
      sectionKey,
      groupIndex,
      labelPath,
      controlKind,
      domHints: hints,
      popupBinding: popupBindingFor(element),
      temporal,
      ...(identityDocumentCompound
        ? { compound: { kind: "identity_document" as const, role: identityDocumentCompound.role,
            groupKey: selectorFor(identityDocumentCompound.root) } }
        : phoneNumberCompound
          ? { compound: { kind: "phone_number" as const, role: phoneNumberCompound.role,
              groupKey: selectorFor(phoneNumberCompound.root),
              ...(phoneNumberCompound.role === "calling_code" && element instanceof HTMLInputElement
                ? { queryValue: normalize(element.value) }
                : {}) } }
          : {}),
      type,
      required,
      requiredSource: explicitRequired ? "explicit" : inferredCoreRequired ? "inferred" : "none",
      options: [...new Set(options)],
      ...(element instanceof HTMLSelectElement ? { nativeSelectedOptions: [...element.selectedOptions]
        .filter(option => option.value !== "")
        .map(option => ({ value: option.value, label: normalize(option.textContent) })) } : {}),
      currentValue,
      validationMessage
    } satisfies PageFieldObservation;
  });
  // Preserve the established email key (including its collision ordinals) on
  // ordinary forms. A distinct personal-email identity is needed only where
  // the same physical section also owns a school address: old email ordinals there
  // cannot safely identify whose mailbox an unlabeled answer describes.
  const emailSectionRoots = controls.map(element => element.closest(
    "section,fieldset,[class*='apply-block-'],.form-section,form"
  ) ?? document.body);
  for (const [index, field] of rawFields.entries()) {
    if (!field.stableFieldKey.includes(".personal_email.")) continue;
    const sectionTitle = field.labelPath.length > 1 ? field.labelPath[0] : null;
    const separateSchoolAddress = rawFields.some((peer, peerIndex) =>
      emailSectionRoots[peerIndex] === emailSectionRoots[index] &&
      (peer.labelPath.length > 1 ? peer.labelPath[0] : null) === sectionTitle &&
      peer.stableFieldKey.includes(".school_email."));
    if (!separateSchoolAddress) field.stableFieldKey = field.stableFieldKey.replace(".personal_email.", ".email.");
  }
  const keyCounts = new Map<string, number>();
  for (const field of rawFields) keyCounts.set(field.stableFieldKey, (keyCounts.get(field.stableFieldKey) ?? 0) + 1);
  const duplicateKeyIndexes = new Map<string, number>();
  for (const field of rawFields) {
    if ((keyCounts.get(field.stableFieldKey) ?? 0) <= 1) continue;
    const index = duplicateKeyIndexes.get(field.stableFieldKey) ?? 0;
    duplicateKeyIndexes.set(field.stableFieldKey, index + 1);
    field.stableFieldKey = `${field.stableFieldKey}#${index}`;
  }
  const seenFilledRepeatableLabels = new Set<string>();
  const fields = rawFields.map((field) => {
    const repeatable = /教育经历|工作经历|实习经历|项目经历|作品|获奖|语言能力/.test(field.label);
    const key = field.label.replace(/\s+/g, "");
    // Only suppress a blank template row when its required state was inferred.
    // An ATS can legitimately render two explicitly required controls with the
    // same semantic slot (Moka currently does this for email); each such field
    // must keep its own #N identity and be filled/read back independently.
    const blankDuplicate = repeatable && field.requiredSource === "inferred" &&
      !field.currentValue && seenFilledRepeatableLabels.has(key);
    if (repeatable && field.currentValue) seenFilledRepeatableLabels.add(key);
    return blankDuplicate ? { ...field, required: false } : field;
  });
  const actionSelectorFor = (element: Element) => {
    const html = element as HTMLElement;
    if (html.id) return `#${CSS.escape(html.id)}`;
    const testId = html.getAttribute("data-testid");
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const segments: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body && segments.length < 7) {
      let segment = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const peers = [...parent.children].filter((entry) => entry.tagName === current!.tagName);
        if (peers.length > 1) segment += `:nth-of-type(${peers.indexOf(current) + 1})`;
      }
      segments.unshift(segment);
      current = parent;
    }
    return segments.join(" > ");
  };
  const actionNodes = [...new Set([...document.querySelectorAll(
    "button,a,[role='button'],input[type='button'],input[type='submit'],span,div,p"
  )].map(element => element.closest("button,input[type='button'],input[type='submit']") ??
    element.closest("a,[role='button']") ?? element))].filter((element) => {
    if (!visible(element)) return false;
    const html = element as HTMLElement;
    const text = normalize(
      element instanceof HTMLInputElement ? element.value : html.innerText || element.getAttribute("aria-label")
    );
    if (!text || text.length > 100) return false;
    if (element.matches("span,div,p") && !element.matches("[role='button']")) {
      const cursor = styleFor(html).cursor;
      const actionLike = /解析|填充|覆盖|下一步|继续|登录|提交|投递|申请|同意|确认|parse|fill|autofill|populate|next|continue|login|sign in|submit|apply|agree|confirm|attach|upload/i.test(text);
      if (!actionLike && cursor !== "pointer" && !element.hasAttribute("tabindex")) return false;
    }
    return true;
  }).map((element) => {
    const html = element as HTMLElement;
    const text = normalize(
      element instanceof HTMLInputElement ? element.value : html.innerText || element.getAttribute("aria-label")
    );
    const matchText = text.normalize("NFKC");
    const submitControl = element.matches("button,a,[role='button'],input[type='button'],input[type='submit']");
    const kind: PageActionObservation["kind"] =
      submitControl && new RegExp(submitPolicy.initial, "iu").test(matchText) &&
        !new RegExp(submitPolicy.forbidden, "iu").test(matchText) ? "final_submit" :
        /同意|隐私|授权|agree|consent|privacy|authorize/i.test(text) ? "consent" :
          /解析简历|解析并填充|解析并覆盖|覆盖并解析|简历解析|重新解析|一键填充|自动填充|从简历填充|使用简历填充|parse resume|resume parse|fill from resume|use resume|autofill|auto fill|populate from resume/i.test(text) ? "resume_parse" :
            /登录|注册|login|sign in|signin|register/i.test(text) ? "login" :
              element.matches("a") ? "navigation" : "neutral";
    const context = normalize((element.parentElement as HTMLElement | null)?.innerText).slice(0, 180);
    return {
      element,
      text,
      kind,
      risk: (["final_submit", "consent"] as string[]).includes(kind) ? "user_only" as const : "safe" as const,
      disabled: element.matches(":disabled,[aria-disabled='true']"),
      requiresConsent: kind === "final_submit" && new RegExp(submitPolicy.consent, "iu").test(matchText),
      context
    };
  }).sort((left, right) =>
    Number(right.kind === "final_submit") - Number(left.kind === "final_submit") ||
    Number(right.kind === "resume_parse") - Number(left.kind === "resume_parse") ||
    left.text.length - right.text.length
  );
  const seenAction = new Set<string>();
  const actions: PageActionObservation[] = [];
  for (const candidate of actionNodes) {
    const key = `${candidate.kind}:${candidate.text}`;
    // Text deduplication must not hide two independent submit buttons. Nested
    // spans have already been collapsed to their actual interactive owner.
    if (candidate.kind !== "final_submit" && seenAction.has(key)) continue;
    seenAction.add(key);
    actions.push({
      actionId: `action-${actions.length + 1}`,
      selector: actionSelectorFor(candidate.element),
      text: candidate.text,
      kind: candidate.kind,
      risk: candidate.risk,
      disabled: candidate.disabled,
      ...(candidate.requiresConsent ? { requiresConsent: true } : {}),
      context: candidate.context
    });
    if (actions.length >= 80 && candidate.kind !== "final_submit") break;
  }
  const fullPageText = normalize((document.body as HTMLElement | null)?.innerText);
  const pageText = fullPageText.slice(0, 6000);
  const isBlockingValidationNode = (element: Element) => {
    const text = normalize((element as HTMLElement).innerText);
    if (!text) return false;
    // Feishu may expose remaining-application quota as role=alert even though
    // the notice explicitly says the candidate can continue applying. It is
    // informational and must not block the final submit gate.
    if (/^(?:你)?最多可以有\s*\d+\s*个.*投递在流程中[，,。\s]*还可以投递\s*[1-9]\d*\s*次[。\s]*(?:查看应聘记录)?$/u.test(text)) {
      return false;
    }
    const errorText = /必填|不能为空|请(?:填写|选择|上传|输入|勾选|完成)|不正确|错误|失败|无效|不一致|不符合|未通过|缺少|投递次数已用完|还可以投递\s*0\s*次|required|invalid|error|failed|must\s+|cannot|please\s+(?:enter|select|upload|complete)/iu.test(text);
    const explicitErrorSurface = element.matches(
      ".ant-form-item-explain-error,[class*='form-error'],[class*='field-error'],[class*='has-error'],[class*='danger'],[class*='invalid']"
    );
    const assertiveAlert = element.getAttribute("aria-live") === "assertive" ||
      element.getAttribute("aria-invalid") === "true";
    return errorText || explicitErrorSurface || assertiveAlert;
  };
  const validationMessages = [...new Set([
    ...[...document.querySelectorAll(
      "[role='alert'],.ant-form-item-explain-error,[class*='form-error'],[class*='field-error'],[class*='has-error']"
    )].filter((element) => visible(element) && !element.querySelector("input,textarea,select,[role='combobox']") &&
      isBlockingValidationNode(element))
      .map((element) => normalize((element as HTMLElement).innerText)).filter(Boolean),
    ...fields.map((field) => field.validationMessage).filter((message): message is string => Boolean(message)),
    ...[...document.querySelectorAll<HTMLElement>("div,span,p")].filter((element) =>
      visible(element) && !element.querySelector("input,textarea,select,[role='combobox']") &&
      /^(?:(?:必填项未填写|请填写必填项|此项为必填|该字段不能为空|不能为空)(?:\s*[/／|｜]\s*(?:required items? (?:are )?not filled in|this field is required))?|(?:required items? (?:are )?not filled in|this field is required))[.!！。]?$/iu.test(normalize(element.innerText)))
      .map((element) => normalize(element.innerText))
  ])].slice(0, 40);
  const submitCandidates = [...document.querySelectorAll("button,[role='button'],input[type='submit']")]
    .filter(visible)
    .map((element) => normalize(
      (element as HTMLInputElement).value || (element as HTMLElement).innerText || element.getAttribute("aria-label")
    ))
    .filter((text) => /提交|投递|申请|确认|submit|apply|send application|finish application|confirm/i.test(text))
    .slice(0, 20);
  const applicationIdentitySignals = new Set(fields.flatMap((field) => [
    /姓名|name/i.test(field.label) ? "name" : "",
    /手机|电话|mobile|phone/i.test(field.label) ? "phone" : "",
    /邮箱|email/i.test(field.label) ? "email" : "",
    /简历|附件|resume|\bcv\b/i.test(field.label) ? "resume" : ""
  ].filter(Boolean)));
  const applicationFormAvailable = fields.length >= 6 && applicationIdentitySignals.size >= 2 &&
    (fields.some((field) => field.type === "file") || submitCandidates.length > 0);
  const hasPassword = controls.some((element) => (element as HTMLInputElement).type === "password");
  const verificationLoginChallenge = [...document.querySelectorAll<HTMLElement>(
    "[role='dialog'],[aria-modal='true'],[class*='modal'],[class*='Modal']"
  )].filter(visible).some((surface) => {
    const surfaceText = normalize(surface.innerText);
    if (!/(?:获取|发送|重新获取)验证码|请输入(?:短信)?验证码|验证码登录/i.test(surfaceText)) {
      return false;
    }
    return /登录/i.test(surfaceText) || [...surface.querySelectorAll<HTMLElement>(
      "button,[role='button'],input[type='submit'],input[type='button']"
    )].filter(visible).some((control) => /^(?:登录|验证码登录|手机号登录)$/i.test(normalize(
      control instanceof HTMLInputElement ? control.value : control.innerText || control.getAttribute("aria-label")
    )));
  });
  const explicitLogin = /请先登录|登录后(?:继续|申请|投递)|登录\/注册/.test(pageText);
  const loginUrl = /(?:^|[\/#?])(login|signin|sign-in)(?:[\/#?]|$)/i.test(location.href);
  // A login-provider chooser is a page-level login gate even before its
  // password/email form opens. Public navigation Sign In links do not qualify.
  const loginRoots = [...document.querySelectorAll<HTMLElement>("main,[role='main']")]
    .filter(visible).filter((main, _index, roots) => !roots.some(other => other !== main && other.contains(main)));
  const loginProviderChooser = fields.length === 0 && loginRoots.length === 1 && loginRoots.some(main => {
      const headings = [...main.querySelectorAll<HTMLElement>("h1,h2,[role='heading']")].filter(visible);
      const buttons = [...main.querySelectorAll<HTMLElement>("button:not([role]),[role='button']")].filter(visible);
      return headings.some(heading => /^(?:sign in|log in|login|登录)$/iu.test(normalize(heading.innerText))) &&
        buttons.length > 0 && buttons.every(button => /^(?:sign in|log in|login) with (?:email|apple|google|microsoft|linkedin)$/iu.test(normalize(button.innerText)));
    });
  const loginRequired = loginUrl || verificationLoginChallenge || (!applicationFormAvailable &&
    (hasPassword || loginProviderChooser || (explicitLogin && fields.length <= 6)));
  const loginReason = verificationLoginChallenge ? "检测到手机号或验证码登录弹窗" :
    loginUrl ? "当前位于登录页面" :
    hasPassword && !applicationFormAvailable ? "检测到密码登录表单" :
      loginProviderChooser ? "页面要求选择登录方式后继续" : loginRequired ? "页面要求先登录后继续" : null;
  const applicationRouteHint = /(?:^|[\/#?])(?:applyv?|application|resume)(?:[\/#?]|$)/i.test(location.href);
  const applicationStageFields = fields.filter((field) => !/搜索|search|关键词|keyword/i.test([
    field.label,
    field.domHints?.name,
    field.domHints?.placeholder,
    field.domHints?.ariaLabel
  ].filter(Boolean).join(" ")));
  const requiredApplicationFieldCount = applicationStageFields.filter((field) => field.required).length;
  const hasResumeField = applicationStageFields.some((field) =>
    field.type === "file" && /简历|附件|resume|cv/i.test(field.label)
  );
  const formDetected = applicationFormAvailable || hasResumeField ||
    applicationIdentitySignals.size >= 2 ||
    (submitCandidates.length > 0 && applicationIdentitySignals.size >= 1) ||
    (applicationRouteHint && (requiredApplicationFieldCount > 0 || applicationStageFields.length >= 2));
  const detailSignals = [
    /职位描述|岗位描述|工作描述|job description/i,
    /岗位职责|工作职责|职位职责|responsibilit/i,
    /任职要求|职位要求|岗位要求|任职资格|qualification|requirement/i
  ].filter((pattern) => pattern.test(fullPageText));
  // This registered Workday entry is still navigation, never an application
  // form or a final-submit action. Detection is shared by every observer call.
  const applicationEntry: PageObservation["applicationEntry"] = (() => {
    if (loginRequired || formDetected || fields.length || location.protocol !== "https:" ||
      !/^[a-z0-9.-]+\.myworkdayjobs\.com$/iu.test(location.hostname)) return undefined;
    const stripLocale = (path: string) => path.replace(/^\/[a-z]{2}-[A-Z]{2}(?=\/)/u, "").replace(/\/$/u, "");
    const base = stripLocale(location.pathname);
    if (!/^\/[^/]+\/job\/[^/]+\/[^/]+\/apply$/u.test(base)) return undefined;
    const roots = [...document.querySelectorAll<HTMLElement>("main")].filter(visible);
    if (roots.length !== 1) return undefined;
    const root = roots[0]!;
    if (root.querySelector("form,input,select,textarea")) return undefined;
    const headings = [...root.querySelectorAll<HTMLElement>("h2")].filter(visible);
    const titles = [...root.querySelectorAll<HTMLElement>("h3")].filter(visible);
    if (headings.length !== 1 || normalize(headings[0]!.innerText) !== "Start Your Application" ||
      titles.length !== 1 || !normalize(titles[0]!.innerText)) return undefined;
    const choices = [
      ["autofillWithResume", "Autofill with Resume"],
      ["applyManually", "Apply Manually"],
      ["useMyLastApplication", "Use My Last Application"]
    ] as const;
    const links = [...root.querySelectorAll<HTMLAnchorElement>("a[role='button'][data-automation-id]")].filter(visible);
    if (links.length !== choices.length) return undefined;
    for (const [id, text] of choices) {
      const matches = links.filter(link => link.dataset.automationId === id);
      if (matches.length !== 1) return undefined;
      const link = matches[0]!;
      let href: URL;
      try { href = new URL(link.href); } catch { return undefined; }
      if (normalize(link.innerText) !== text || link.hasAttribute("download") ||
        (link.target && link.target !== "_self") || link.closest("[aria-disabled='true'],[inert]") ||
        href.origin !== location.origin || href.username || href.password || href.search || href.hash ||
        stripLocale(href.pathname) !== `${base}/${id}`) return undefined;
    }
    const manual = links.find(link => link.dataset.automationId === "applyManually")!;
    return { registrationId: "workday.manual-application-entry.v1", selector: actionSelectorFor(manual),
      text: "Apply Manually", href: manual.href };
  })();
  const jobDetailDetected = !loginRequired && !formDetected && (detailSignals.length > 0 || Boolean(applicationEntry));
  const explicitUnavailable = /当前网页已关停|(?:职位|岗位).{0,12}(?:已下线|不存在|已关闭|停止招聘)/i.test(fullPageText);
  const emptyMokaApplicationShell = location.hostname === "app.mokahr.com" && applicationRouteHint &&
    document.readyState === "complete" && !loginRequired && !formDetected &&
    applicationStageFields.length === 0 && submitCandidates.length === 0 && detailSignals.length === 0;
  const unavailableReason = explicitUnavailable
    ? "explicit_unavailable" as const
    : emptyMokaApplicationShell ? "empty_application_shell" as const : null;
  const pageStage: ApplicationPageStage = loginRequired
    ? "login"
    : formDetected
      ? "application_form"
      : jobDetailDetected ? "job_detail" : "unknown";
  const pageStageEvidence = pageStage === "login"
    ? [loginReason ?? "页面级登录证据"]
    : pageStage === "application_form"
      ? [
          `${fields.length} 个可填写控件`,
          `${applicationIdentitySignals.size} 类申请身份字段`,
          `${submitCandidates.length} 个提交候选`
        ]
      : pageStage === "job_detail"
        ? applicationEntry ? [applicationEntry.registrationId] : [`${detailSignals.length} 类职位详情文本证据`]
        : ["未获得稳定的职位详情、登录或申请表证据"];
  const fingerprintSource = JSON.stringify(fields.map(({ label, type, required, options }) => ({
    label, type, required, options
  })));
  let hash = 2166136261;
  for (let index = 0; index < fingerprintSource.length; index += 1) {
    hash ^= fingerprintSource.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const runtimeState = globalThis as typeof globalThis & {
    __recruitingAiPageStageRoot?: Element | null;
    __recruitingAiPageStageRootEpoch?: number;
  };
  const currentPageRoot = document.querySelector("#root,#app,[data-reactroot],main") ??
    document.body?.firstElementChild ?? document.body;
  if (runtimeState.__recruitingAiPageStageRoot !== currentPageRoot) {
    runtimeState.__recruitingAiPageStageRoot = currentPageRoot;
    runtimeState.__recruitingAiPageStageRootEpoch =
      (runtimeState.__recruitingAiPageStageRootEpoch ?? 0) + 1;
  }
  const pageStateSource = JSON.stringify({
    url: location.href,
    pageStage,
    domRootEpoch: runtimeState.__recruitingAiPageStageRootEpoch ?? 0,
    detailSignalCount: detailSignals.length,
    ...(applicationEntry ? { applicationEntry } : {}),
    fields: fields.map(({ stableFieldKey, label, type, required }) => ({
      stableFieldKey: stableFieldKey ?? null,
      label,
      type,
      required
    })),
    actions: actions.map(({ kind, text, disabled }) => ({ kind, text, disabled })),
    loginReason
  });
  let pageStateHash = 2166136261;
  for (let index = 0; index < pageStateSource.length; index += 1) {
    pageStateHash ^= pageStateSource.charCodeAt(index);
    pageStateHash = Math.imul(pageStateHash, 16777619);
  }
  return {
    url: location.href,
    title: document.title,
    pageStage,
    pageStageEvidence,
    loginRequired,
    loginReason,
    formDetected,
    unavailableReason,
    jobDetailDetected,
    ...(applicationEntry ? { applicationEntry } : {}),
    fingerprint: `fnv1a-${(hash >>> 0).toString(16)}`,
    pageStateFingerprint: `fnv1a-${(pageStateHash >>> 0).toString(16)}`,
    fields,
    actions,
    submitCandidates,
    validationMessages,
    transientBusy: /上传中|解析中|处理中|正在上传/.test(
      pageText.replace(/上传中[\s.。…·-]*100%?/g, "")
    ),
    observedAt: new Date().toISOString()
  };
}

/**
 * Prepare a safe, inert click target for the final form validation pass.
 *
 * The executor sends the trusted click from the background context. If the
 * current page has no unambiguous blank form surface, blur only the active
 * editor instead of guessing a coordinate or touching another control.
 */
export function prepareApplicationFormValidationBlur(): {
  point: { x: number; y: number } | null;
  fallbackBlurred: boolean;
} {
  const visible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
      rect.width > 0 && rect.height > 0 && !element.closest("[hidden],[aria-hidden='true']");
  };
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const editorSelector = "input:not([type='hidden']),select,textarea,[contenteditable='true'],[role='combobox']";
  const interactionSelector = [
    "a", "button", "label", "summary", "input", "select", "textarea", "[contenteditable='true']",
    "[role='button']", "[role='link']", "[role='option']", "[role='treeitem']", "[role='checkbox']",
    "[role='radio']", "[role='combobox']", "[role='listbox']", "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  const activeFormRoot = active?.closest<HTMLElement>("form,[role='form'],main,#app,#root") ?? null;
  const roots = [
    activeFormRoot,
    ...document.querySelectorAll<HTMLElement>("form,[role='form'],main")
  ].filter((root, index, values): root is HTMLElement => Boolean(root) && visible(root) &&
    root.querySelectorAll(editorSelector).length >= 2 && values.indexOf(root) === index);
  const root = activeFormRoot && roots.includes(activeFormRoot)
    ? activeFormRoot
    : roots.length === 1 ? roots[0]! : null;
  if (root) {
    const rect = root.getBoundingClientRect();
    const inset = Math.max(8, Math.min(24, Math.floor(Math.min(rect.width, rect.height) / 5)));
    const points = [
      { x: rect.left + inset, y: rect.top + inset },
      { x: rect.right - inset, y: rect.top + inset },
      { x: rect.left + inset, y: rect.bottom - inset },
      { x: rect.right - inset, y: rect.bottom - inset }
    ];
    for (const point of points) {
      if (point.x < 0 || point.x >= window.innerWidth || point.y < 0 || point.y >= window.innerHeight) continue;
      const hit = document.elementFromPoint(point.x, point.y);
      if (!(hit instanceof HTMLElement) || !root.contains(hit)) continue;
      if (hit.closest(interactionSelector) || hit.closest("[role='alert'],[aria-live='assertive']")) continue;
      const cursor = getComputedStyle(hit).cursor;
      if (cursor === "pointer") continue;
      return { point, fallbackBlurred: false };
    }
  }
  if (active?.matches(editorSelector)) {
    active.blur();
    return { point: null, fallbackBlurred: true };
  }
  return { point: null, fallbackBlurred: false };
}

// Read-only native compatibility API. All live custom discovery is owned by
// the centrally selected Driver, never by this page function.
export async function discoverApplicationFieldOptions(
  targets: PageFieldOptionDiscoveryTarget[]
): Promise<PageFieldOptionDiscoveryResult[]> {
  // Compatibility read-only API. Custom popup discovery is dispatched by its
  // registered Driver in the background; this function never opens a control.
  return targets.map(target => {
    const nodes = document.querySelectorAll(target.selector);
    const element = nodes.length === 1 ? nodes[0] : null;
    return { fieldId: target.fieldId, stableFieldKey: target.stableFieldKey,
      options: element instanceof HTMLSelectElement
        ? [...element.options].filter(option => !option.disabled && option.value &&
            !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled))
          .map(option => (option.textContent ?? "").trim()).filter(Boolean)
        : [] };
  });
}

export { fillApplicationPage } from "./control-adapters/native-driver.js";
