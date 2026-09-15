/** Self-contained because Chrome serializes this function into the bound tab.
 * Only complete, visible application receipts count. A substring of guidance,
 * a CAPTCHA acknowledgement, a button label or an upload result is not one. */
export function readApplicationReceiptInPage(): {
  success: boolean;
  outcome: "succeeded" | "already_applied" | null;
  source: "registered_receipt_url" | "visible_receipt" | null;
  url: string;
} {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element: Element): boolean => {
    if (!element.isConnected) return false;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const ignored = "button,a,label,input,select,textarea,nav,header,footer,[role='navigation'],[role='option'],[contenteditable='true'],[data-recruiting-ai-overlay],#recruiting-ai-auto-apply-overlay";
  const visibleText = (element: Element) => {
    // textContent on a visible wrapper still includes hidden children and
    // button labels. Filter at text-node ownership, not only at wrapper level.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent && !parent.closest(ignored) && visible(parent)) parts.push(node.textContent ?? "");
    }
    return normalize(parts.join(""));
  };
  const texts = [...document.querySelectorAll("h1,h2,h3,p,div,span,[role='alert'],[role='status']")]
    .filter((element) => !element.closest(ignored) && visible(element))
    .map((element) => {
      // Do not turn the highlighted fragment in “如果 <span>投递成功</span>”
      // into an independent receipt. Preserve its sentence/block context.
      const sentence = element.matches("span")
        ? element.closest("p,h1,h2,h3,div,[role='alert'],[role='status']") ?? element
        : element;
      return (sentence.textContent?.length ?? 0) <= 1200 ? visibleText(sentence) : "";
    }).filter((text) => text.length > 0 && text.length <= 280);
  const failed = texts.some((text) => /(?:未|没有|尚未|尚未能|未能)(?:成功)?(?:投递|申请|提交)(?:成功)?|(?:投递|申请|提交)(?:未成功|失败)|(?:application|submission)\s+(?:has\s+)?(?:not\s+been\s+submitted|not\s+submitted|failed)/i.test(text));
  const submitted = /^(?:(?:您的?|你的?)?(?:简历|职位申请|求职申请|申请)?(?:已)?(?:投递|申请|提交)(?:已)?成功|(?:您的?|你的?)?(?:简历|申请)(?:已成功(?:提交|投递)|已(?:提交|投递))|投递已完成|(?:我们)?已收到(?:您的?|你的?)(?:简历|申请)|(?:your\s+)?application\s+(?:(?:has\s+been\s+)?(?:successfully\s+)?submitted(?:\s+successfully)?|received)|thank\s+you\s+for\s+applying)[。.!！]*$/i;
  const duplicate = /^(?:(?:您|你)(?:已经|已)(?:申请|投递)过?(?:该|此|本)(?:职位|岗位)|(?:you\s+have\s+)?already\s+applied\s+for\s+this\s+(?:position|job|role))[。.!！]*$/i;
  const receiptUrl = (location.hostname === "app.mokahr.com" &&
    /(?:^|[\/#])(?:campus_)?apply\/thanks(?:[/?#]|$)/i.test(`${location.pathname}${location.hash}`)) ||
    (/(?:^|\.)jobs\.feishu\.cn$/i.test(location.hostname) &&
      /^\/(?:[^/]+\/)?resume\/applied\/?$/i.test(location.pathname));
  const outcome = failed ? null : texts.some((text) => duplicate.test(text)) ? "already_applied" :
    receiptUrl || texts.some((text) => submitted.test(text)) ? "succeeded" : null;
  const source = outcome === null ? null : receiptUrl ? "registered_receipt_url" : "visible_receipt";
  return { success: outcome !== null, outcome, source, url: location.href };
}
