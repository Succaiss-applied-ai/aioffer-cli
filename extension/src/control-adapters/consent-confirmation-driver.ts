export interface ConsentConfirmationAction {
  actionId: string;
  selector: string;
  text: string;
  kind: string;
  disabled: boolean;
  context: string;
  driverPhase?: "observe" | "prepare_control";
}

export interface ConsentConfirmationPoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export type ConsentConfirmationProbeStatus =
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "ready_to_activate"
  | "checked"
  | "modal_confirmation_missing"
  | "modal_confirmation_ambiguous"
  | "modal_confirmation_disabled"
  | "modal_ready";

export interface ConsentConfirmationProbe {
  status: ConsentConfirmationProbeStatus;
  text: string | null;
  checked: boolean;
  controlPoint: ConsentConfirmationPoint | null;
  modalOpen: boolean;
  scrollPoint: ConsentConfirmationPoint | null;
  confirmationPoint: ConsentConfirmationPoint | null;
  confirmationText: string | null;
  matchingControlCount: number;
  matchingConfirmationCount: number;
  scrollTargetKind: "iframe" | "scrollable" | "modal" | null;
  controlTagName: string | null;
  controlInputType: string | null;
  controlReadOnly: boolean;
  controlClassNames: string[];
}

export type ConsentConfirmationDriverStage =
  | "detect"
  | "prepare_control"
  | "activate_control"
  | "scroll_agreement"
  | "confirm_agreement"
  | "readback";

export type ConsentConfirmationFailureCode =
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "modal_scroll_target_missing"
  | "modal_confirmation_missing"
  | "modal_confirmation_ambiguous"
  | "modal_confirmation_disabled"
  | "checkbox_readback_failed"
  | "driver_interrupted";

export interface ConsentConfirmationDriverDiagnostics {
  schemaVersion: "consent-confirmation-driver-diagnostic.v1";
  failureCode: ConsentConfirmationFailureCode | null;
  ledger: {
    inspectCount: number;
    controlPrepareCount: number;
    controlClickCount: number;
    modalSettleWaitMs: number;
    modalScrollCount: number;
    confirmationClickCount: number;
    confirmationWaitMs: number;
  };
}

export interface ConsentConfirmationDriverResult {
  actionId: string;
  found: boolean;
  checked: boolean;
  changed: boolean;
  text: string | null;
  error: string | null;
  stage: ConsentConfirmationDriverStage;
  diagnostics: ConsentConfirmationDriverDiagnostics;
}

export interface ConsentConfirmationDriverInput {
  action: ConsentConfirmationAction;
  inspect(phase?: "observe" | "prepare_control"): Promise<ConsentConfirmationProbe | null>;
  clickPoint(point: ConsentConfirmationPoint): Promise<void>;
  scrollPoint(point: ConsentConfirmationPoint, deltaY: number): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}

const AGREEMENT_MODAL_SETTLE_POLL_MS = 250;
const AGREEMENT_MODAL_SETTLE_ATTEMPTS = 6;
const AGREEMENT_SCROLL_DELTA = 8_000;
const AGREEMENT_SCROLL_PASSES = 3;
const AGREEMENT_CONFIRMATION_FALLBACK_WAIT_MS = 10_000;

/**
 * MAIN-world, read-only locator for one already observed consent action.
 *
 * The locator deliberately binds by the nearest single-checkbox row instead
 * of relying on `input.labels`. Moka tenants such as VWA render an empty label
 * around the native input and place the policy text in a sibling node.
 */
export function inspectConsentConfirmationInPage(
  action: ConsentConfirmationAction
): ConsentConfirmationProbe {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/gu, " ").trim();
  const compact = (value: unknown) => normalize(value)
    .replace(/\s+/gu, "")
    .replace(/[《》“”"'。，、：:；;（）()【】\[\].!！?？]/gu, "")
    .toLowerCase();
  const visible = (element: Element | null): element is HTMLElement => {
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    const html = element as HTMLElement;
    const rect = html.getBoundingClientRect();
    const style = getComputedStyle(html);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0" &&
      !html.closest("[hidden],[aria-hidden='true']");
  };
  const checkbox = (element: Element | null): element is HTMLElement =>
    Boolean(element) && (
      element.matches("input[type='checkbox']") || element.getAttribute("role") === "checkbox"
    );
  const inputElement = (element: Element | null): element is HTMLInputElement =>
    element?.tagName === "INPUT";
  const checked = (element: Element) => inputElement(element)
    ? Boolean((element as HTMLInputElement).checked)
    : element.getAttribute("aria-checked") === "true" ||
      /(?:^|\s)(?:is-)?checked(?:\s|$)/iu.test(String((element as HTMLElement).className ?? ""));
  const textOf = (element: Element | null) => normalize(
    inputElement(element)
      ? (element as HTMLInputElement).value
      : (element as HTMLElement | null)?.innerText || element?.getAttribute("aria-label") || element?.textContent
  );
  const forbiddenSubmit = /预览并提交|确认提交|提交(?:简历|申请|投递)?|立即投递|申请职位|submit(?:application)?|applynow/iu;
  const confirmationPattern = /^(?:我已阅读并同意|已阅读并同意|同意并继续|接受并继续|同意|接受|确认|确定|继续|agreeandcontinue|agree|accept|confirm|continue)$/iu;
  const consentText = (value: unknown) =>
    /同意|授权|知悉|隐私|个人信息保护|数据处理|声明|协议|agree|accept|consent|privacy|authorize/iu.test(
      normalize(value)
    ) && !forbiddenSubmit.test(compact(value));
  const expectedTokens = [action.text, action.context]
    .flatMap((value) => compact(value).split(/[·|/]/u))
    .filter((value) => value.length >= 2);
  const semanticMatch = (value: unknown) => {
    const candidate = compact(value);
    if (!candidate || !consentText(value)) return false;
    return expectedTokens.length === 0 || expectedTokens.some((expected) =>
      candidate === expected || candidate.includes(expected) || expected.includes(candidate)
    );
  };
  const controlsIn = (root: Element) => {
    const native = [...root.querySelectorAll<HTMLElement>("input[type='checkbox']")];
    return native.length ? native : [...root.querySelectorAll<HTMLElement>("[role='checkbox']")];
  };
  const singleControlRow = (control: HTMLElement): HTMLElement | null => {
    let current: HTMLElement | null = control.parentElement;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const controls = controlsIn(current);
      const value = textOf(current);
      if (controls.length === 1 && controls[0] === control && consentText(value)) return current;
      if (controls.length > 1) break;
    }
    return null;
  };
  const associatedText = (control: HTMLElement) => normalize([
    control.getAttribute("aria-label"),
    control.getAttribute("aria-description"),
    inputElement(control) && (control as HTMLInputElement).labels
      ? [...((control as HTMLInputElement).labels ?? [])].map((label) => label.innerText).join(" ")
      : "",
    textOf(singleControlRow(control))
  ].filter(Boolean).join(" "));
  const pointFor = (element: HTMLElement): ConsentConfirmationPoint | null => {
    if (!visible(element)) return null;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return null;
    const x = left + Math.min(24, (right - left) / 2);
    const y = top + Math.min(12, (bottom - top) / 2);
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === element || element.contains(hit) || hit.contains(element))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const scrollPointFor = (element: HTMLElement): ConsentConfirmationPoint | null => {
    if (!visible(element)) return null;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return null;
    const x = left + (right - left) / 2;
    const y = top + (bottom - top) / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === element || element.contains(hit) || hit.contains(element))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const clickSurfaceFor = (control: HTMLElement): HTMLElement | null => {
    const label = control.closest("label");
    if (visible(label)) return label;
    if (visible(control)) return control;
    const row = singleControlRow(control);
    if (visible(row)) {
      const visualBox = [...row.querySelectorAll<HTMLElement>(
        "[class*='Checkbox-box'],[class*='checkbox-box'],[class*='Checkbox-checker'],[class*='checkbox-checker']"
      )].find(visible);
      return visualBox ?? row;
    }
    return null;
  };

  const selected = (() => {
    try {
      return document.querySelector(action.selector) as HTMLElement | null;
    } catch {
      return null;
    }
  })();
  const selectedControl = checkbox(selected)
    ? selected
    : selected?.closest("label")?.querySelector<HTMLElement>("input[type='checkbox'],[role='checkbox']") ?? null;
  const ancestorControl = (() => {
    let current = selected;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const controls = controlsIn(current);
      if (controls.length === 1 && (semanticMatch(textOf(current)) || consentText(textOf(current)))) {
        return controls[0] ?? null;
      }
      if (controls.length > 1) break;
    }
    return null;
  })();
  const semanticControls = [...document.querySelectorAll<HTMLElement>(
    "input[type='checkbox'],[role='checkbox']"
  )].filter((candidate) => {
    const row = singleControlRow(candidate);
    return Boolean(row && semanticMatch(associatedText(candidate)));
  });
  const matchingControls = [...new Set([
    ...(selectedControl && consentText(associatedText(selectedControl)) ? [selectedControl] : []),
    ...(ancestorControl ? [ancestorControl] : []),
    ...semanticControls
  ])];
  const liveControl = ancestorControl ?? selectedControl ??
    (semanticControls.length === 1 ? semanticControls[0] : null);

  const dialogSelectors = [
    "[role='dialog']",
    "[role='alertdialog']",
    "[aria-modal='true']",
    "[class*='Modal-modal']",
    "[class*='modal-content']",
    "[class*='dialog-content']"
  ].join(",");
  const allDialogs = [...document.querySelectorAll<HTMLElement>(dialogSelectors)].filter(visible);
  const buttonText = (element: HTMLElement) => compact(textOf(element));
  const confirmationElementsIn = (candidate: HTMLElement) =>
    [...candidate.querySelectorAll<HTMLElement>(
      "button,[role='button'],input[type='button'],input[type='submit']"
    )].filter((element) => visible(element) && confirmationPattern.test(buttonText(element)) &&
      !forbiddenSubmit.test(buttonText(element)) &&
      !/取消|关闭|返回|拒绝|不同意|cancel|close|back|reject|decline/iu.test(buttonText(element)));
  const privacyDialog = allDialogs
    .filter((candidate) => {
      if (candidate.matches("header,footer") ||
        /(?:modal|dialog)[-_]?(?:header|footer|mask|close|portal)/iu.test(String(candidate.className))) {
        return false;
      }
      const iframeEvidence = [...candidate.querySelectorAll<HTMLIFrameElement>("iframe")]
        .map((frame) => `${frame.src} ${frame.title}`).join(" ");
      return /隐私|个人信息保护|个人信息提供知情同意书|数据处理|授权|协议|声明|privacy|consent|agreement|notice/iu.test(
        `${textOf(candidate)} ${iframeEvidence}`
      );
    })
    .sort((left, right) => {
      const score = (candidate: HTMLElement) =>
        confirmationElementsIn(candidate).length * 100 +
        (candidate.querySelector("iframe") ? 40 : 0) +
        (candidate.matches("[role='dialog'],[role='alertdialog'],[aria-modal='true']") ? 30 : 0) +
        (candidate.querySelector("header,[class*='modal-header'],[class*='Modal-header']") ? 20 : 0);
      const scoreDifference = score(right) - score(left);
      if (scoreDifference) return scoreDifference;
      const leftArea = left.getBoundingClientRect().width * left.getBoundingClientRect().height;
      const rightArea = right.getBoundingClientRect().width * right.getBoundingClientRect().height;
      return leftArea - rightArea;
    })[0] ?? null;
  const confirmationCandidates = privacyDialog ? confirmationElementsIn(privacyDialog) : [];
  const enabledConfirmations = confirmationCandidates.filter((candidate) =>
    !candidate.matches(":disabled,[aria-disabled='true']")
  );
  const confirmation = enabledConfirmations.length === 1 ? enabledConfirmations[0] : null;
  const confirmationPoint = confirmation ? pointFor(confirmation) : null;
  const scrollTarget = (() => {
    if (!privacyDialog) return null;
    const iframe = [...privacyDialog.querySelectorAll<HTMLIFrameElement>("iframe")].find(visible);
    if (iframe) return { element: iframe as HTMLElement, kind: "iframe" as const };
    const scrollable = [...privacyDialog.querySelectorAll<HTMLElement>("*")]
      .filter((candidate) => visible(candidate) && candidate.scrollHeight > candidate.clientHeight + 2)
      .sort((left, right) => (right.scrollHeight - right.clientHeight) -
        (left.scrollHeight - left.clientHeight))[0];
    if (scrollable) return { element: scrollable, kind: "scrollable" as const };
    return { element: privacyDialog, kind: "modal" as const };
  })();
  const scrollPoint = scrollTarget ? scrollPointFor(scrollTarget.element) : null;

  const controlSurface = liveControl ? clickSurfaceFor(liveControl) ?? liveControl : null;
  if (action.driverPhase === "prepare_control" && controlSurface && !privacyDialog) {
    controlSurface.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    for (let parent = controlSurface.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (!/(?:auto|scroll|overlay)/iu.test(style.overflowY) ||
        parent.scrollHeight <= parent.clientHeight + 2) continue;
      const rect = controlSurface.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      parent.scrollTop += rect.top - (parentRect.top + parent.clientHeight / 2);
    }
    void controlSurface.getBoundingClientRect();
  }

  const base = {
    text: liveControl ? associatedText(liveControl) || action.text : action.text || null,
    checked: Boolean(liveControl && checked(liveControl)),
    controlPoint: controlSurface ? pointFor(controlSurface) : null,
    modalOpen: Boolean(privacyDialog),
    scrollPoint,
    confirmationPoint,
    confirmationText: confirmation ? textOf(confirmation) : null,
    matchingControlCount: matchingControls.length,
    matchingConfirmationCount: confirmationCandidates.length,
    scrollTargetKind: scrollTarget?.kind ?? null,
    controlTagName: liveControl?.tagName ?? null,
    controlInputType: inputElement(liveControl) ? (liveControl as HTMLInputElement).type :
      liveControl?.getAttribute("role") === "checkbox" ? "checkbox" : null,
    controlReadOnly: inputElement(liveControl) ? (liveControl as HTMLInputElement).readOnly : false,
    controlClassNames: liveControl ? [
      String(liveControl.className || ""),
      String(liveControl.parentElement?.className || ""),
      String(singleControlRow(liveControl)?.className || "")
    ].filter(Boolean) : []
  };
  if (privacyDialog) {
    if (confirmationCandidates.length === 0) return { ...base, status: "modal_confirmation_missing" };
    if (confirmationCandidates.length > 1) return { ...base, status: "modal_confirmation_ambiguous" };
    if (enabledConfirmations.length === 0) return { ...base, status: "modal_confirmation_disabled" };
    return { ...base, status: "modal_ready" };
  }
  if (!liveControl) {
    return { ...base, status: matchingControls.length > 1 ? "control_ambiguous" : "control_missing" };
  }
  if (base.checked) return { ...base, status: "checked" };
  if (!base.controlPoint) return { ...base, status: "control_not_clickable" };
  return { ...base, status: "ready_to_activate" };
}

/**
 * Orchestrates one authorized agreement without ever touching final submit.
 * An already enabled unique agreement button is confirmed immediately. If it
 * is unavailable or that direct confirmation does not take effect, the Driver
 * scrolls the agreement to the bottom, waits ten seconds for tenant-specific
 * timers/unlocks, retries the confirmation, and finally reads the checkbox
 * back from the live page.
 */
export async function executeConsentConfirmationDriver(
  input: ConsentConfirmationDriverInput
): Promise<ConsentConfirmationDriverResult> {
  const ledger: ConsentConfirmationDriverDiagnostics["ledger"] = {
    inspectCount: 0,
    controlPrepareCount: 0,
    controlClickCount: 0,
    modalSettleWaitMs: 0,
    modalScrollCount: 0,
    confirmationClickCount: 0,
    confirmationWaitMs: 0
  };
  let stage: ConsentConfirmationDriverStage = "detect";
  let changed = false;
  let lastText: string | null = input.action.text || null;
  let directConfirmationAttempted = false;
  const finish = (
    found: boolean,
    checked: boolean,
    failureCode: ConsentConfirmationFailureCode | null,
    error: string | null
  ): ConsentConfirmationDriverResult => ({
    actionId: input.action.actionId,
    found,
    checked,
    changed,
    text: lastText,
    error,
    stage,
    diagnostics: {
      schemaVersion: "consent-confirmation-driver-diagnostic.v1",
      failureCode,
      ledger
    }
  });
  const inspect = async (phase: "observe" | "prepare_control" = "observe") => {
    ledger.inspectCount += 1;
    const state = await input.inspect(phase);
    if (state?.text) lastText = state.text;
    return state;
  };
  if (input.action.kind !== "consent") {
    return finish(false, false, "control_missing", "动作不是协议控件");
  }
  if (input.action.disabled) {
    return finish(false, false, "control_not_clickable", "协议控件当前不可用");
  }

  try {
    let controlPrepareAttempts = 0;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      let state = await inspect();
      if (!state) return finish(false, false, "driver_interrupted", "协议页面状态读取中断");
      if (state.checked && !state.modalOpen) {
        stage = "readback";
        return finish(true, true, null, null);
      }

      if (state.modalOpen) {
        if (!directConfirmationAttempted && state.status === "modal_confirmation_missing") {
          for (let attempt = 0; attempt < AGREEMENT_MODAL_SETTLE_ATTEMPTS; attempt += 1) {
            await input.wait(AGREEMENT_MODAL_SETTLE_POLL_MS);
            ledger.modalSettleWaitMs += AGREEMENT_MODAL_SETTLE_POLL_MS;
            state = await inspect() ?? state;
            if (!state.modalOpen || state.status !== "modal_confirmation_missing") break;
          }
          if (!state.modalOpen) continue;
        }
        if (!directConfirmationAttempted && state.status === "modal_ready" && state.confirmationPoint) {
          stage = "confirm_agreement";
          directConfirmationAttempted = true;
          await input.clickPoint(state.confirmationPoint);
          ledger.confirmationClickCount += 1;
          changed = true;
          await input.wait(420);
          continue;
        }
        stage = "scroll_agreement";
        if (!state.scrollPoint) {
          return finish(Boolean(state.text), false, "modal_scroll_target_missing", "协议弹窗无法定位滚动区域");
        }
        // Bounded trusted wheel steps reach the bottom of ordinary containers
        // and cross-origin iframe documents without turning one oversized CDP
        // gesture into a long-running or timed-out browser operation.
        for (let pass = 0; pass < AGREEMENT_SCROLL_PASSES; pass += 1) {
          await input.scrollPoint(state.scrollPoint, AGREEMENT_SCROLL_DELTA);
          ledger.modalScrollCount += 1;
          await input.wait(120);
          state = await inspect() ?? state;
        }
        ledger.confirmationWaitMs += AGREEMENT_CONFIRMATION_FALLBACK_WAIT_MS;
        await input.wait(AGREEMENT_CONFIRMATION_FALLBACK_WAIT_MS);
        state = await inspect();
        if (!state) return finish(true, false, "driver_interrupted", "协议弹窗滚动后状态读取中断");
        if (!state.modalOpen) continue;
        if (state.status === "modal_confirmation_ambiguous") {
          return finish(true, false, "modal_confirmation_ambiguous", "协议弹窗确认按钮不唯一");
        }
        if (state.status === "modal_confirmation_disabled") {
          return finish(true, false, "modal_confirmation_disabled", "协议弹窗滚到底后确认按钮仍不可用");
        }
        if (!state.confirmationPoint || state.status === "modal_confirmation_missing") {
          return finish(true, false, "modal_confirmation_missing", "协议弹窗未找到唯一确认按钮");
        }
        stage = "confirm_agreement";
        await input.clickPoint(state.confirmationPoint);
        ledger.confirmationClickCount += 1;
        changed = true;
        await input.wait(420);
        continue;
      }

      if (state.status === "control_ambiguous") {
        return finish(false, false, "control_ambiguous", "协议复选框匹配不唯一");
      }
      if (state.status === "control_missing") {
        return finish(false, false, "control_missing", null);
      }
      if (!state.controlPoint || state.status === "control_not_clickable") {
        // Reactive applicant forms can re-render and move a control out of the
        // viewport immediately after a trusted click. Re-position it for each
        // bounded cycle instead of treating that recoverable state as terminal.
        if (controlPrepareAttempts < 3) {
          stage = "prepare_control";
          controlPrepareAttempts += 1;
          ledger.controlPrepareCount += 1;
          state = await inspect("prepare_control");
          await input.wait(250);
          if (state?.controlPoint && state.status === "ready_to_activate") {
            stage = "activate_control";
            await input.clickPoint(state.controlPoint);
            ledger.controlClickCount += 1;
            changed = true;
            await input.wait(320);
            continue;
          }
          continue;
        }
        return finish(true, false, "control_not_clickable", "协议复选框不可点击");
      }
      stage = "activate_control";
      await input.clickPoint(state.controlPoint);
      ledger.controlClickCount += 1;
      changed = true;
      await input.wait(320);
    }
    stage = "readback";
    const finalState = await inspect();
    if (finalState?.checked && !finalState.modalOpen) return finish(true, true, null, null);
    return finish(Boolean(finalState?.text), false, "checkbox_readback_failed", "协议确认后未能稳定回读勾选状态");
  } catch (error) {
    return finish(false, false, "driver_interrupted",
      `协议确认 Driver 中断：${error instanceof Error ? error.message : String(error)}`);
  }
}
