export interface NativeSubmitValidationError {
  fieldKey: string | null;
  message: string;
}

/** Serialized into the page. Observe native constraint rejection; never call
 * checkValidity/reportValidity (which would manufacture a validation event). */
export function nativeSubmitValidationProbeInPage(
  token: string,
  phase: "arm" | "read" | "cleanup",
  fields: Array<{ key: string; selector: string }> = [],
  submitText = ""
): NativeSubmitValidationError[] {
  type InvalidControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  type Probe = {
    listener: EventListener;
    clickListener: EventListener;
    errors: Array<{ fieldKey: string | null; control: InvalidControl }>;
  };
  const owner = document as Document & Record<string, unknown>;
  const previous = owner[token] as Probe | undefined;
  if (phase === "read") {
    return (previous?.errors ?? []).filter(({ control }) => control.isConnected && !control.validity.valid)
      .map(({ fieldKey, control }) => {
        const matches = fields.filter((field) => {
          try { return document.querySelector(field.selector) === control; } catch { return false; }
        });
        return { fieldKey: fields.length ? (matches.length === 1 ? matches[0]!.key : null) : fieldKey,
          message: control.validationMessage.slice(0, 160) };
      });
  }
  if (previous) {
    document.removeEventListener("invalid", previous.listener, true);
    document.removeEventListener("click", previous.clickListener, true);
  }
  delete owner[token];
  if (phase === "cleanup") return [];
  const errors: Probe["errors"] = [];
  let clicked = false;
  let submittedForm: HTMLFormElement | null = null;
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const clickListener: EventListener = (event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const button = event.target.closest("button,[role='button'],input[type='submit'],input[type='button'],a");
    if (!button) return;
    const text = normalize(button instanceof HTMLInputElement ? button.value :
      (button as HTMLElement).innerText || button.textContent || button.getAttribute("aria-label"));
    if (submitText && text === normalize(submitText)) {
      clicked = true;
      submittedForm = button instanceof HTMLButtonElement || button instanceof HTMLInputElement
        ? button.form : button.closest("form");
    }
  };
  const listener: EventListener = (event) => {
    const control = event.target;
    if (!clicked || !event.isTrusted || !(control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
    if (submittedForm && control.form !== submittedForm) return;
    const matches = fields.filter((field) => {
      try { return document.querySelector(field.selector) === control; } catch { return false; }
    });
    if (!errors.some((entry) => entry.control === control)) errors.push({
      fieldKey: matches.length === 1 ? matches[0]!.key : null, control
    });
  };
  Object.defineProperty(owner, token, { value: { listener, clickListener, errors }, configurable: true });
  document.addEventListener("click", clickListener, true);
  document.addEventListener("invalid", listener, true);
  return [];
}

/** Observe a fresh assertion of an already-visible custom error after this
 * transaction's trusted click. Reading an unchanged old error, a focus/scroll
 * change, or an unrelated React render never counts as rejection evidence. */
export function reassertedSubmitValidationProbeInPage(
  token: string,
  phase: "arm" | "read" | "cleanup",
  fields: Array<{ key: string; selector: string; hasError: boolean }> = [],
  submitText = ""
): string[] {
  type Binding = { key: string; selector: string; hasError: boolean };
  type Probe = { observer: MutationObserver; listener: EventListener; keys: Set<string>;
    consume: (records: MutationRecord[]) => void; rebind: (fields: Binding[]) => void };
  const owner = document as Document & Record<string, unknown>;
  const storageKey = `${token}_reasserted`;
  const previous = owner[storageKey] as Probe | undefined;
  if (phase === "read") {
    if (previous) previous.consume(previous.observer.takeRecords());
    if (previous && fields.length) previous.rebind(fields);
    return [...(previous?.keys ?? [])];
  }
  if (previous) {
    previous.observer.disconnect();
    document.removeEventListener("click", previous.listener, true);
  }
  delete owner[storageKey];
  if (phase === "cleanup") return [];
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element: Element) => {
    if (!element.isConnected) return false;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const rootFor = (control: Element) => {
    // Feishu/Formily mirrors data-form-field-id on the INPUT. Prefer the
    // actual form-item ancestor, otherwise the probe cannot see its error
    // help node after the trusted submit.
    const explicit = control.closest("[class*='apply-field-']") ?? control.closest(
      ".ud-formily-item,.ant-form-item,.form-item,.form-group,[class*='formItem']"
    ) ?? control.parentElement?.closest("[data-form-field-id]") ?? control.closest("label");
    const parent = control.parentElement;
    return explicit ?? (parent?.querySelectorAll("input,select,textarea,[role='combobox']").length === 1 ? parent : control);
  };
  const errorSelector = "[role='alert'],[aria-live='assertive'],.ant-form-item-explain-error,[class*='form-error'],[class*='field-error'],[class*='error'],[class*='Error']";
  const bareError = /^(?:(?:必填项未填写|请填写必填项|此项为必填|这是必填项|[^。；;]{1,80}(?:为|是)必填(?:项)?|该字段不能为空|不能为空)(?:\s*[/／|｜]\s*(?:required items? (?:are )?not filled in|this field is required))?|(?:required items? (?:are )?not filled in|this field is required))[.!！。]?$/iu;
  const errorSurface = (element: Element, root: Element) => {
    for (let node: Element | null = element; node && root.contains(node); node = node.parentElement) {
      if (node.matches("label,input,select,textarea,[role='heading']") || node.querySelector("input,select,textarea,[role='combobox']")) continue;
      if (visible(node) && (node.matches(errorSelector) || bareError.test(normalize(node.textContent)))) return true;
    }
    return false;
  };
  const keys = new Set<string>();
  let bindings = fields;
  let pending: MutationRecord[] = [];
  let clicked = false;
  let previewTooltip: Element | null = null, previewForm: Element | null = null;
  let oldPreviewRejection = false, previewRejected = false;
  const visiblePreviewRejection = () => !!previewTooltip && [...previewTooltip.querySelectorAll("[class*='sd-Tooltip-tooltip-']")]
    .some(element => visible(element) && normalize(element.textContent) === "申请表含有错误，请您查找标红字段解决");
  const inspect = (records: MutationRecord[]) => {
    if (!clicked) return;
    if (!oldPreviewRejection && previewTooltip?.isConnected && visiblePreviewRejection() && records.some(record =>
      previewTooltip!.contains(record.target) || [...record.addedNodes].some(node => node.contains(previewTooltip)))) {
      previewRejected = true;
    }
    for (const field of bindings.filter((candidate) => candidate.hasError)) {
      let control: Element | null;
      try { control = document.querySelector(field.selector); } catch { continue; }
      if (!control) continue;
      const root = rootFor(control);
      if (!root) continue;
      if (previewRejected && previewForm?.contains(control) && visible(control) &&
        [...root.querySelectorAll(errorSelector)].some(element => visible(element) &&
          normalize(element.textContent) && !element.querySelector("input,select,textarea,[role='combobox']"))) {
        keys.add(field.key);
      }
      const linkedErrors: Element[] = [];
      for (let owner: Element | null = control; owner && root.contains(owner); owner = owner.parentElement) {
        if (owner.getAttribute("aria-invalid") !== "true") continue;
        for (const id of normalize(owner.getAttribute("aria-errormessage")).split(" ")) {
          const linked = document.getElementById(id);
          if (linked && visible(linked)) linkedErrors.push(linked);
        }
      }
      const linkedErrorSurface = (node: Element) => linkedErrors.some((error) => error === node || error.contains(node));
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (!target) continue;
        const ownInvalidAssertion = record.type === "attributes" && record.attributeName === "aria-invalid" &&
          root.contains(target) && (target === control || target.contains(control)) &&
          record.oldValue !== "true" && target.getAttribute("aria-invalid") === "true" && visible(target);
        const becameVisible = record.type === "attributes" && visible(target) && (
          (record.attributeName === "hidden" && record.oldValue !== null && !target.hasAttribute("hidden")) ||
          (record.attributeName === "aria-hidden" && record.oldValue === "true" && target.getAttribute("aria-hidden") !== "true") ||
          (record.attributeName === "style" && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0*)?)\s*(?:!important\s*)?(?:;|$)/i.test(record.oldValue ?? ""))
        );
        const changedError = (linkedErrorSurface(target) || (root.contains(target) && errorSurface(target, root))) &&
          becameVisible;
        // Replacing a text node with identical text, re-rendering a wrapper,
        // setting aria-invalid=true again, or recoloring old red text proves
        // no new rejection. Require an actual invalid/visibility transition.
        if (ownInvalidAssertion || changedError) keys.add(field.key);
      }
    }
  };
  const consume = (records: MutationRecord[]) => {
    if (!clicked) return;
    // Bounded transaction-local history lets a fresh stable-field observation
    // rebind React replacements without guessing from an obsolete selector.
    pending = [...pending, ...records].slice(-2000);
    inspect(records);
  };
  const rebind = (current: Binding[]) => {
    bindings = fields.flatMap((original) => {
      const matches = current.filter((candidate) => candidate.key === original.key);
      return matches.length === 1 ? [{ ...original, selector: matches[0]!.selector }] : [];
    });
    keys.clear();
    inspect(pending);
  };
  const observer = new MutationObserver(consume);
  const listener: EventListener = (event) => {
    if (clicked || !event.isTrusted || !(event.target instanceof Element)) return;
    const button = event.target.closest("button,[role='button'],input[type='submit'],input[type='button'],a");
    if (!button) return;
    const text = normalize(button instanceof HTMLInputElement ? button.value :
      (button as HTMLElement).innerText || button.textContent || button.getAttribute("aria-label"));
    if (!submitText || text !== normalize(submitText)) return;
    if (location.hostname === "app.mokahr.com" && text === "预览并提交") {
      const tooltip = button.closest("[class*='sd-Tooltip-container-']");
      const form = button.closest("[class*='apply-form-']");
      if (tooltip?.querySelectorAll("button").length === 1 && form) {
        previewTooltip = tooltip; previewForm = form;
        oldPreviewRejection = visiblePreviewRejection();
      }
    }
    observer.takeRecords(); // Discard all pre-click rendering/scroll/focus work.
    clicked = true;
  };
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeOldValue: true, attributeFilter: ["aria-invalid", "hidden", "aria-hidden", "style"] });
  document.addEventListener("click", listener, true);
  Object.defineProperty(owner, storageKey, { value: { observer, listener, keys, consume, rebind }, configurable: true });
  return [];
}
