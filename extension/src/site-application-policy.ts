export interface SiteApplicationPolicyBlock {
  blocked: boolean;
  reasonCode: "site_application_limit_reached" | null;
  message: string | null;
  source: "visible_site_policy" | null;
  url: string;
}

/**
 * Self-contained because Chrome serializes this function into the bound tab.
 * A generic wait/loading sentence is not a terminal policy block: the same
 * visible message must describe an application/job, a quantity/frequency
 * limit, and a time/wait boundary.
 */
export function readSiteApplicationPolicyBlockInPage(options?: {
  phase: "arm" | "read" | "cleanup";
  token: string;
  submitText?: string;
}): SiteApplicationPolicyBlock {
  const empty = (): SiteApplicationPolicyBlock => ({
    blocked: false,
    reasonCode: null,
    message: null,
    source: null,
    url: location.href
  });
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element: Element): boolean => {
    if (!element.isConnected || element.closest("[data-recruiting-ai-overlay],#recruiting-ai-auto-apply-overlay")) {
      return false;
    }
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const applicationSignal = /投递|申请|应聘|岗位|职位|application|apply|position|job/i;
  const limitSignal = /太多|过多|过于频繁|频繁操作|达到(?:数量|次数)?上限|超过(?:数量|次数)?上限|数量(?:限制|受限)|次数(?:限制|受限|已满)|投递受限|申请受限|限制投递|限制申请|too\s+many|(?:application|submission).{0,20}(?:limit|quota)|(?:limit|quota).{0,20}(?:application|submission)/i;
  const boundarySignal = /(?:近|最近|过去|这)?\s*(?:\d+|[半一二三四五六七八九十百]+)\s*(?:天|日|周|个月|月|年)|请.{0,8}(?:耐心)?等待|稍后再试|稍后重试|限制期|within.{0,20}(?:day|week|month|year)|try\s+again\s+later|please\s+wait/i;
  const isPolicyBlock = (text: string) => text.length > 0 && text.length <= 600 &&
    applicationSignal.test(text) && limitSignal.test(text) && boundarySignal.test(text);
  const rootSelector = [
    "[role='alertdialog']", "[role='dialog']", "[role='alert']", "[aria-live='assertive']",
    ".ant-modal", ".ant-message-notice", ".ant-notification-notice",
    "[class*='modal']", "[class*='dialog']", "[class*='toast']", "[class*='notification']"
  ].join(",");
  const ignored = "button,a,label,input,select,textarea,nav,header,footer,[role='navigation'],[role='option'],[contenteditable='true'],[data-recruiting-ai-overlay],#recruiting-ai-auto-apply-overlay";
  const textOf = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent && !parent.closest(ignored) && visible(parent)) parts.push(node.textContent ?? "");
    }
    return normalize(parts.join(""));
  };
  const scan = (): SiteApplicationPolicyBlock => {
    const roots = [...document.querySelectorAll(rootSelector)].filter(visible);
    const fallback = [...document.querySelectorAll("h1,h2,h3,p,div,span")]
      .filter((element) => !element.closest(ignored) && visible(element) && (element.textContent?.length ?? 0) <= 600);
    const matches = [...new Set([...roots, ...fallback])]
      .filter(element => !element.closest(ignored))
      .map(textOf).filter(isPolicyBlock).sort((left, right) => left.length - right.length);
    return matches.length ? { blocked: true, reasonCode: "site_application_limit_reached",
      message: matches[0]!.slice(0, 500), source: "visible_site_policy", url: location.href } : empty();
  };
  if (!options) return scan();

  // Keep a short-lived toast in the exact submitting document until the
  // background worker acknowledges it. Never observe another tab or reuse a
  // different attempt's token. No clicks, network interception or form writes.
  type Probe = { observer: MutationObserver; listener: EventListener; url: string;
    captured: SiteApplicationPolicyBlock | null; consume: () => void };
  const owner = document as Document & Record<string, unknown>;
  const key = `${options.token}_site_policy`;
  const previous = owner[key] as Probe | undefined;
  if (options.phase === "read") {
    if (!previous) return scan();
    if (previous.url !== location.href) return scan();
    previous.consume();
    return previous.captured ?? empty();
  }
  if (previous) {
    previous.observer.disconnect();
    document.removeEventListener("click", previous.listener, true);
  }
  delete owner[key];
  if (options.phase === "cleanup") return empty();
  let clicked = false;
  let baselineMessage: string | null = null;
  const probe: Probe = {
    observer: new MutationObserver(() => probe.consume()),
    listener: event => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest("button,[role='button'],input[type='submit'],input[type='button'],a");
      if (!button) return;
      const text = normalize(button instanceof HTMLInputElement ? button.value :
        (button as HTMLElement).innerText || button.textContent || button.getAttribute("aria-label"));
      if (text !== normalize(options.submitText) || !text) return;
      baselineMessage = scan().message;
      clicked = true;
    },
    url: location.href,
    captured: null,
    consume: () => {
      if (!clicked || probe.captured || probe.url !== location.href) return;
      const current = scan();
      if (!current.blocked) baselineMessage = null;
      else if (current.message !== baselineMessage) {
        probe.captured = current;
        // Wake the owning extension promptly; the receiver reads this
        // token-bound probe itself instead of trusting a message payload.
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          void chrome.runtime.sendMessage({ type: "SITE_POLICY_RECEIPT_OBSERVED", token: options.token })
            .catch(() => undefined);
        }
      }
    }
  };
  Object.defineProperty(owner, key, { value: probe, configurable: true });
  document.addEventListener("click", probe.listener, true);
  probe.observer.observe(document, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "role"] });
  return empty();
}
