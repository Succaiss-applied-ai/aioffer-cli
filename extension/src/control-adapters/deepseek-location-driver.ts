import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import { cityDisplayMatchesFact, cityOptionMatchToken, uniqueCityOption } from "../city-option-matching.js";

export const DEEPSEEK_LOCATION_INTERACTION_FAILED = "location_control_interaction_failed";

export function isDeepSeekLocationInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${DEEPSEEK_LOCATION_INTERACTION_FAILED}:`);
}

export function isDeepSeekLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/social-recruitment/high-flyer/140576" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

export function isDeepSeekLocationField(input: {
  label: string;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  return /意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市|preferred.?city|preferred.?location|intention.*city|intention.*location/iu.test([
    input.label,
    input.stableFieldKey,
    input.semanticKey
  ].filter(Boolean).join(" "));
}

export type DeepSeekLocationDriverStage =
  | "detect"
  | "prepare_open"
  | "open"
  | "select"
  | "commit"
  | "readback";

export type DeepSeekLocationProbeStatus =
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "popup_closed"
  | "popup_ambiguous"
  | "leaf_missing"
  | "leaf_ambiguous"
  | "ready";

export type DeepSeekLocationFailureCode =
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "preexisting_value_mismatch"
  | "unexpected_popup_state"
  | "open_target_stale"
  | "open_event_dispatch_failed"
  | "open_event_not_observed"
  | "open_then_closed"
  | "popup_ambiguous"
  | "leaf_missing"
  | "leaf_ambiguous"
  | "leaf_target_stale"
  | "leaf_event_dispatch_failed"
  | "commit_target_missing"
  | "commit_validation_not_cleared"
  | "readback_unavailable"
  | "readback_mismatch"
  | "driver_interrupted";

export interface DeepSeekLocationPoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export interface DeepSeekLocationTargetProbe {
  status: DeepSeekLocationProbeStatus;
  controlPoint: DeepSeekLocationPoint | null;
  leafPoint: DeepSeekLocationPoint | null;
  popupCount: number;
  matchingLeafCount: number;
  availableOptions: string[];
}

export interface DeepSeekLocationPreparedProbe extends DeepSeekLocationTargetProbe {
  scrolled: boolean;
}

export interface DeepSeekLocationReadback {
  actual: string;
  validationCleared: boolean;
  popupClosed: boolean;
}

export interface DeepSeekLocationOpenObserverSnapshot {
  armed: boolean;
  popupEverOpened: boolean;
  popupOpen: boolean;
  popupCount: number;
  matchingLeafCount: number;
  transitionCount: number;
}

export interface DeepSeekLocationNativeActionResult {
  clicked: boolean;
  status: DeepSeekLocationProbeStatus | "clicked" | "commit_target_missing";
  popupCount: number;
  matchingLeafCount: number;
  targetTagName: string;
  targetClassName: string;
}

export interface DeepSeekLocationActionLedger {
  prepareSurfaceCount: number;
  scrollCount: number;
  openAttemptCount: number;
  openClickCount: number;
  leafAttemptCount: number;
  leafClickCount: number;
  commitAttemptCount: number;
  commitClickCount: number;
  observerPollCount: number;
  readbackPollCount: number;
  nativeEventClickCount: 0;
  trustedPointerClickCount: number;
  retryCount: 0;
  reloadCount: 0;
  fullFormRestartCount: 0;
}

export interface DeepSeekLocationLifecycleEvent {
  sequence: number;
  stage: DeepSeekLocationDriverStage;
  status: string;
  popupCount: number;
  matchingLeafCount: number;
  popupEverOpened: boolean;
}

export interface DeepSeekLocationDriverDiagnostics {
  schemaVersion: "deepseek-location-driver-diagnostic.v4";
  eventMechanism: "cdp_trusted_pointer_focus_emulation";
  attemptId: string;
  failureCode: DeepSeekLocationFailureCode | null;
  availableOptions: string[];
  ledger: DeepSeekLocationActionLedger;
  lifecycle: DeepSeekLocationLifecycleEvent[];
}

export interface DeepSeekLocationDriverResult extends DeepSeekLocationReadback {
  success: boolean;
  stage: DeepSeekLocationDriverStage;
  error: string | null;
  availableOptions: string[];
  diagnostics: DeepSeekLocationDriverDiagnostics;
}

export interface DeepSeekLocationDriverInput {
  tabId: number;
  selector: string;
  expected: string;
  exactPageOption?: boolean;
  attemptId?: string;
  allowPreopenedExpectedLeaf?: boolean;
  prepareSurface(): Promise<void>;
  clickPoint(point: DeepSeekLocationPoint): Promise<void>;
  commitSelection(): Promise<boolean>;
  wait(milliseconds: number): Promise<void>;
}

export function normalizeDeepSeekLocation(value: unknown): string {
  return String(value ?? "")
    .replace(/[\s·._-]+/gu, "")
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u, "")
    .toLowerCase();
}

export function deepSeekLocationReadbackMatches(actual: unknown, expected: unknown): boolean {
  const left = normalizeDeepSeekLocation(actual);
  const right = normalizeDeepSeekLocation(expected);
  return Boolean(left && right) && left === right;
}

/**
 * MAIN-world probe. `observe` is mutation-free; `prepare_open` is the only
 * mode allowed to scroll and wait for the resulting layout.
 */
export async function inspectDeepSeekLocationTargetInPage(
  targetSelector: string,
  expectedValue: string,
  mode: "observe" | "prepare_open" = "observe",
  cityMatchToken?: string
): Promise<DeepSeekLocationPreparedProbe> {
  let scrolled = false;
  const normalize = (value: unknown) => String(value ?? "")
    .replace(/[\s·._-]+/gu, "")
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u, "")
    .toLowerCase();
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const point = (element: HTMLElement): DeepSeekLocationPoint | null => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!(hit === element || element.contains(hit))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const empty = (
    status: DeepSeekLocationProbeStatus,
    controlPoint: DeepSeekLocationPoint | null = null,
    popupCount = 0,
    matchingLeafCount = 0,
    availableOptions: string[] = []
  ): DeepSeekLocationPreparedProbe => ({
    status,
    controlPoint,
    leafPoint: null,
    popupCount,
    matchingLeafCount,
    availableOptions,
    scrolled
  });
  const isLocationControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const select = candidate.closest("[class*='Select-container'],[class*='select-container']");
    const fieldRoot = candidate.closest("[class*='apply-field'],[class*='Apply-field']");
    const identity = `${candidate.placeholder} ${(fieldRoot as HTMLElement | null)?.innerText ?? ""}`;
    return dropdown instanceof HTMLElement && select instanceof HTMLElement &&
      /意向.*工作.*城市|期望.*工作.*城市|选择意向工作城市/u.test(identity);
  };
  const resolveControls = (): HTMLInputElement[] => {
    const observedControl = document.querySelector(targetSelector);
    const semanticControls = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isLocationControl);
    return isLocationControl(observedControl)
      ? [...new Set([observedControl, ...semanticControls])]
      : semanticControls;
  };
  const waitForLayoutFrame = () => new Promise<void>((resolve) => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(finish, 120);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
  });
  let controls = resolveControls();
  if (controls.length === 0) return empty("control_missing");
  if (controls.length !== 1) return empty("control_ambiguous");
  if (mode === "prepare_open") {
    scrolled = true;
    controls[0]!.scrollIntoView({
      behavior: "instant" as ScrollBehavior,
      block: "center",
      inline: "nearest"
    });
    await waitForLayoutFrame();
    await waitForLayoutFrame();
    controls = resolveControls();
    if (controls.length === 0) return empty("control_missing");
    if (controls.length !== 1) return empty("control_ambiguous");
  }
  const control = controls[0]!;
  const dropdown = control.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
  const select = control.closest("[class*='Select-container'],[class*='select-container']");
  if (!(dropdown instanceof HTMLElement) || !(select instanceof HTMLElement)) return empty("control_missing");
  const controlPoint = point(control);
  const localPopups = [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].filter(visible);
  const popups = localPopups;
  if (popups.length === 0) {
    return controlPoint ? empty("popup_closed", controlPoint) : empty("control_not_clickable");
  }
  const expected = normalize(expectedValue);
  const optionLeaves = popups.flatMap((popup) => [...popup.querySelectorAll<HTMLElement>(
    "[class*='option-label'],[class*='Option-label']"
  )]).filter(visible).filter((candidate) => {
      const item = candidate.closest("[class*='Menu-content-item'],[class*='menu-content-item']");
      const menu = item?.closest("[class*='Menu-container'],[class*='menu-container']");
      const signature = `${candidate.className} ${item?.className ?? ""}`;
      return item instanceof HTMLElement && menu instanceof HTMLElement &&
        !/Menu-header|menu-header|province|Province/.test(signature);
    });
  const availableOptions = [...new Set(optionLeaves
    .map((candidate) => String(candidate.innerText || candidate.textContent || "").trim())
    .filter(Boolean))];
  const labels = optionLeaves.filter(candidate => cityMatchToken !== undefined
    ? Boolean(cityMatchToken) && String(candidate.innerText || candidate.textContent).normalize("NFKC")
      .replace(/\s+/gu, "").toLowerCase().includes(cityMatchToken)
    : normalize(candidate.innerText || candidate.textContent) === expected);
  if (labels.length === 0) {
    return empty(
      popups.length === 1 ? "leaf_missing" : "popup_ambiguous",
      controlPoint,
      popups.length,
      0,
      availableOptions
    );
  }
  if (labels.length !== 1) {
    return empty("leaf_ambiguous", controlPoint, popups.length, labels.length, availableOptions);
  }
  const leafPoint = point(labels[0]!);
  if (!leafPoint) {
    return empty("control_not_clickable", controlPoint, popups.length, labels.length, availableOptions);
  }
  return {
    status: "ready",
    controlPoint,
    leafPoint,
    popupCount: popups.length,
    matchingLeafCount: 1,
    availableOptions,
    scrolled
  };
}

/**
 * Runs inside the page MAIN world and invokes the control's own click event.
 * Unlike a hand-built CDP pointer sequence, this does not require foreground
 * focus and does not write the input value or synthesize keyboard input.
 */
export function clickDeepSeekLocationControlInPage(
  targetSelector: string
): DeepSeekLocationNativeActionResult {
  const result = (
    status: DeepSeekLocationNativeActionResult["status"],
    clicked = false,
    popupCount = 0,
    target: HTMLElement | null = null
  ): DeepSeekLocationNativeActionResult => ({
    clicked,
    status,
    popupCount,
    matchingLeafCount: 0,
    targetTagName: target?.tagName ?? "",
    targetClassName: String(target?.className ?? "")
  });
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const isLocationControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const select = candidate.closest("[class*='Select-container'],[class*='select-container']");
    const fieldRoot = candidate.closest("[class*='apply-field'],[class*='Apply-field']");
    const identity = `${candidate.placeholder} ${(fieldRoot as HTMLElement | null)?.innerText ?? ""}`;
    return dropdown instanceof HTMLElement && select instanceof HTMLElement &&
      /意向.*工作.*城市|期望.*工作.*城市|选择意向工作城市/u.test(identity);
  };
  const observedControl = document.querySelector(targetSelector);
  const semanticControls = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isLocationControl);
  const controls = isLocationControl(observedControl)
    ? [...new Set([observedControl, ...semanticControls])]
    : semanticControls;
  if (controls.length === 0) return result("control_missing");
  if (controls.length !== 1) return result("control_ambiguous");
  const control = controls[0]!;
  const dropdown = control.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
  if (!(dropdown instanceof HTMLElement)) return result("control_missing");
  const localPopups = [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].filter(visible);
  const popups = localPopups.length ? localPopups : [...document.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].filter(visible);
  if (popups.length > 0) return result(popups.length === 1 ? "ready" : "popup_ambiguous", false, popups.length);
  control.focus({ preventScroll: true });
  control.click();
  const openedPopups = [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].filter(visible);
  return result("clicked", true, openedPopups.length, control);
}

/** Atomically revalidates and clicks the one exact city leaf in MAIN world. */
export function clickDeepSeekLocationLeafInPage(
  targetSelector: string,
  expectedValue: string
): DeepSeekLocationNativeActionResult {
  const result = (
    status: DeepSeekLocationNativeActionResult["status"],
    clicked = false,
    popupCount = 0,
    matchingLeafCount = 0,
    target: HTMLElement | null = null
  ): DeepSeekLocationNativeActionResult => ({
    clicked,
    status,
    popupCount,
    matchingLeafCount,
    targetTagName: target?.tagName ?? "",
    targetClassName: String(target?.className ?? "")
  });
  const normalize = (value: unknown) => String(value ?? "")
    .replace(/[\s·._-]+/gu, "")
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u, "")
    .toLowerCase();
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const isLocationControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const select = candidate.closest("[class*='Select-container'],[class*='select-container']");
    const fieldRoot = candidate.closest("[class*='apply-field'],[class*='Apply-field']");
    const identity = `${candidate.placeholder} ${(fieldRoot as HTMLElement | null)?.innerText ?? ""}`;
    return dropdown instanceof HTMLElement && select instanceof HTMLElement &&
      /意向.*工作.*城市|期望.*工作.*城市|选择意向工作城市/u.test(identity);
  };
  const observedControl = document.querySelector(targetSelector);
  const semanticControls = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isLocationControl);
  const controls = isLocationControl(observedControl)
    ? [...new Set([observedControl, ...semanticControls])]
    : semanticControls;
  if (controls.length === 0) return result("control_missing");
  if (controls.length !== 1) return result("control_ambiguous");
  const control = controls[0]!;
  const dropdown = control.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
  if (!(dropdown instanceof HTMLElement)) return result("control_missing");
  const localPopups = [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].filter(visible);
  const popups = localPopups.length ? localPopups : [...document.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].filter(visible);
  if (popups.length === 0) return result("popup_closed");
  if (popups.length !== 1) return result("popup_ambiguous", false, popups.length);
  const expected = normalize(expectedValue);
  const labels = popups.flatMap((popup) => [...popup.querySelectorAll<HTMLElement>(
    "[class*='option-label'],[class*='Option-label']"
  )]).filter(visible).filter((candidate) => normalize(candidate.innerText || candidate.textContent) === expected)
    .filter((candidate) => {
      const item = candidate.closest("[class*='Menu-content-item'],[class*='menu-content-item']");
      const menu = item?.closest("[class*='Menu-container'],[class*='menu-container']");
      const signature = `${candidate.className} ${item?.className ?? ""}`;
      return item instanceof HTMLElement && menu instanceof HTMLElement &&
        !/Menu-header|menu-header|province|Province/.test(signature);
    });
  if (labels.length === 0) return result("leaf_missing", false, 1, 0);
  if (labels.length !== 1) return result("leaf_ambiguous", false, 1, labels.length);
  const leaf = labels[0]!;
  leaf.click();
  return result("clicked", true, 1, 1, leaf);
}

/** Arms a read-only popup lifecycle tracker before the page-native open event. */
export function armDeepSeekLocationOpenObserverInPage(
  targetSelector: string,
  expectedValue: string,
  attemptId: string,
  cityMatchToken?: string
): DeepSeekLocationOpenObserverSnapshot {
  type Tracker = {
    observer: MutationObserver;
    popupEverOpened: boolean;
    popupOpen: boolean;
    popupCount: number;
    matchingLeafCount: number;
    transitionCount: number;
    sample(): void;
  };
  type Scope = typeof globalThis & {
    __recruitingAiDeepSeekLocationOpenTrackers?: Record<string, Tracker>;
  };
  const scope = globalThis as Scope;
  const trackers = scope.__recruitingAiDeepSeekLocationOpenTrackers ?? {};
  scope.__recruitingAiDeepSeekLocationOpenTrackers = trackers;
  trackers[attemptId]?.observer.disconnect();
  delete trackers[attemptId];
  const normalize = (value: unknown) => String(value ?? "")
    .replace(/[\s·._-]+/gu, "")
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u, "")
    .toLowerCase();
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const expected = normalize(expectedValue);
  const tracker = {
    observer: null as unknown as MutationObserver,
    popupEverOpened: false,
    popupOpen: false,
    popupCount: 0,
    matchingLeafCount: 0,
    transitionCount: 0,
    sample: () => undefined
  } satisfies Tracker;
  tracker.sample = () => {
    const observedControl = document.querySelector(targetSelector);
    const localRoot = observedControl?.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const localPopups = localRoot instanceof HTMLElement
      ? [...localRoot.querySelectorAll<HTMLElement>("[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']")]
        .filter(visible)
      : [];
    const popups = localPopups;
    const labels = popups.flatMap((popup) => [...popup.querySelectorAll<HTMLElement>(
      "[class*='option-label'],[class*='Option-label']"
    )]).filter(visible).filter(candidate => cityMatchToken !== undefined
      ? Boolean(cityMatchToken) && String(candidate.innerText || candidate.textContent).normalize("NFKC")
        .replace(/\s+/gu, "").toLowerCase().includes(cityMatchToken)
      : normalize(candidate.innerText || candidate.textContent) === expected)
      .filter((candidate) => {
        const item = candidate.closest("[class*='Menu-content-item'],[class*='menu-content-item']");
        const menu = item?.closest("[class*='Menu-container'],[class*='menu-container']");
        const signature = `${candidate.className} ${item?.className ?? ""}`;
        return item instanceof HTMLElement && menu instanceof HTMLElement &&
          !/Menu-header|menu-header|province|Province/.test(signature);
      });
    const popupOpen = popups.length > 0;
    if (tracker.popupOpen !== popupOpen || tracker.popupCount !== popups.length ||
      tracker.matchingLeafCount !== labels.length) tracker.transitionCount += 1;
    tracker.popupOpen = popupOpen;
    tracker.popupCount = popups.length;
    tracker.matchingLeafCount = labels.length;
    tracker.popupEverOpened ||= popupOpen;
  };
  tracker.observer = new MutationObserver(() => tracker.sample());
  tracker.observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-expanded"]
  });
  trackers[attemptId] = tracker;
  tracker.sample();
  return {
    armed: true,
    popupEverOpened: tracker.popupEverOpened,
    popupOpen: tracker.popupOpen,
    popupCount: tracker.popupCount,
    matchingLeafCount: tracker.matchingLeafCount,
    transitionCount: tracker.transitionCount
  };
}

export function readDeepSeekLocationOpenObserverInPage(
  attemptId: string
): DeepSeekLocationOpenObserverSnapshot {
  type Tracker = {
    observer: MutationObserver;
    popupEverOpened: boolean;
    popupOpen: boolean;
    popupCount: number;
    matchingLeafCount: number;
    transitionCount: number;
    sample(): void;
  };
  type Scope = typeof globalThis & {
    __recruitingAiDeepSeekLocationOpenTrackers?: Record<string, Tracker>;
  };
  const tracker = (globalThis as Scope).__recruitingAiDeepSeekLocationOpenTrackers?.[attemptId];
  if (!tracker) {
    return { armed: false, popupEverOpened: false, popupOpen: false, popupCount: 0, matchingLeafCount: 0, transitionCount: 0 };
  }
  tracker.sample();
  return {
    armed: true,
    popupEverOpened: tracker.popupEverOpened,
    popupOpen: tracker.popupOpen,
    popupCount: tracker.popupCount,
    matchingLeafCount: tracker.matchingLeafCount,
    transitionCount: tracker.transitionCount
  };
}

export function disarmDeepSeekLocationOpenObserverInPage(attemptId: string): boolean {
  type Tracker = { observer: MutationObserver };
  type Scope = typeof globalThis & {
    __recruitingAiDeepSeekLocationOpenTrackers?: Record<string, Tracker>;
  };
  const trackers = (globalThis as Scope).__recruitingAiDeepSeekLocationOpenTrackers;
  const tracker = trackers?.[attemptId];
  if (!tracker) return false;
  tracker.observer.disconnect();
  delete trackers![attemptId];
  return true;
}

/** Runs in the recruitment page MAIN world after the page-native leaf event. */
export function readDeepSeekLocationInPage(targetSelector: string): DeepSeekLocationReadback {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const isLocationControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const select = candidate.closest("[class*='Select-container'],[class*='select-container']");
    const fieldRoot = candidate.closest("[class*='apply-field'],[class*='Apply-field']");
    const identity = `${candidate.placeholder} ${(fieldRoot as HTMLElement | null)?.innerText ?? ""}`;
    return dropdown instanceof HTMLElement && select instanceof HTMLElement &&
      /意向.*工作.*城市|期望.*工作.*城市|选择意向工作城市/u.test(identity);
  };
  const observedControl = document.querySelector(targetSelector);
  const semanticControls = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isLocationControl);
  const controls = isLocationControl(observedControl)
    ? [...new Set([observedControl, ...semanticControls])]
    : semanticControls;
  if (controls.length !== 1) return { actual: "", validationCleared: false, popupClosed: true };
  const control = controls[0]!;
  const dropdown = control.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
  const select = control.closest("[class*='Select-container'],[class*='select-container']");
  const display = select?.querySelector<HTMLElement>(
    "[class*='Input-display-value'],[class*='input-display-value'],[class*='display-value'],[class*='DisplayValue']"
  );
  const fieldRoot = control.closest(
    "[class*='apply-field'],[class*='Apply-field'],[class*='Select-field'],[class*='select-field']"
  ) ?? control.parentElement;
  const invalid = control.getAttribute("aria-invalid") === "true" ||
    [...(fieldRoot?.querySelectorAll<HTMLElement>(
      "[aria-invalid='true'],[class*='error'],[class*='Error'],[class*='invalid'],[class*='Invalid'],span,div,p"
    ) ?? [])].some((candidate) => visible(candidate) &&
      /必填项未填写|不能为空|请选择/u.test(String(candidate.textContent || "").trim()));
  const popupOpen = Boolean(dropdown && [...dropdown.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']"
  )].some(visible));
  const actual = String(display?.textContent || "").trim();
  return {
    actual: /^(?:请选择|请搜索)?$/u.test(actual) ? "" : actual,
    validationCleared: !invalid,
    popupClosed: !popupOpen
  };
}

/** Finds one non-actionable field title for the optional native blur commit. */
export function inspectDeepSeekLocationCommitPointInPage(
  targetSelector: string
): DeepSeekLocationPoint | null {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const isLocationControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const select = candidate.closest("[class*='Select-container'],[class*='select-container']");
    const fieldRoot = candidate.closest("[class*='apply-field'],[class*='Apply-field']");
    const identity = `${candidate.placeholder} ${(fieldRoot as HTMLElement | null)?.innerText ?? ""}`;
    return dropdown instanceof HTMLElement && select instanceof HTMLElement &&
      /意向.*工作.*城市|期望.*工作.*城市|选择意向工作城市/u.test(identity);
  };
  const observedControl = document.querySelector(targetSelector);
  const semanticControls = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isLocationControl);
  const controls = isLocationControl(observedControl)
    ? [...new Set([observedControl, ...semanticControls])]
    : semanticControls;
  if (controls.length !== 1) return null;
  const control = controls[0]!;
  const fieldRoot = control.closest<HTMLElement>("[class*='apply-field'],[class*='Apply-field']");
  if (!fieldRoot) return null;
  const matchingLabels = [...fieldRoot.querySelectorAll<HTMLElement>("label,span,div")]
    .filter((candidate) => candidate !== control && !candidate.contains(control) && visible(candidate))
    .filter((candidate) => !candidate.closest("button,a,[role='button'],[role='link']"))
    .filter((candidate) => /^(?:意向工作城市|期望工作城市)(?:\/(?:Preferred|Expected)workcity)?$/iu.test(
      String(candidate.innerText || candidate.textContent || "").replace(/\s+/gu, "").trim()
    ));
  const labels = matchingLabels
    .filter((candidate) => !matchingLabels.some((other) => other !== candidate && other.contains(candidate)))
    .sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.width * a.height - b.width * b.height;
    });
  if (labels.length !== 1) return null;
  const label = labels[0]!;
  const rect = label.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (!(hit === label || label.contains(hit))) return null;
  return { x, y, tagName: label.tagName, className: String(label.className || "") };
}

/** Atomically rebinds and clicks the one inert field title used for blur commit. */
export function clickDeepSeekLocationCommitInPage(
  targetSelector: string
): DeepSeekLocationNativeActionResult {
  const result = (
    status: DeepSeekLocationNativeActionResult["status"],
    clicked = false,
    target: HTMLElement | null = null
  ): DeepSeekLocationNativeActionResult => ({
    clicked,
    status,
    popupCount: 0,
    matchingLeafCount: 0,
    targetTagName: target?.tagName ?? "",
    targetClassName: String(target?.className ?? "")
  });
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const isLocationControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const select = candidate.closest("[class*='Select-container'],[class*='select-container']");
    const fieldRoot = candidate.closest("[class*='apply-field'],[class*='Apply-field']");
    const identity = `${candidate.placeholder} ${(fieldRoot as HTMLElement | null)?.innerText ?? ""}`;
    return dropdown instanceof HTMLElement && select instanceof HTMLElement &&
      /意向.*工作.*城市|期望.*工作.*城市|选择意向工作城市/u.test(identity);
  };
  const observedControl = document.querySelector(targetSelector);
  const semanticControls = [...document.querySelectorAll<HTMLInputElement>("input")].filter(isLocationControl);
  const controls = isLocationControl(observedControl)
    ? [...new Set([observedControl, ...semanticControls])]
    : semanticControls;
  if (controls.length === 0) return result("control_missing");
  if (controls.length !== 1) return result("control_ambiguous");
  const control = controls[0]!;
  const fieldRoot = control.closest<HTMLElement>("[class*='apply-field'],[class*='Apply-field']");
  if (!fieldRoot) return result("commit_target_missing");
  const matchingLabels = [...fieldRoot.querySelectorAll<HTMLElement>("label,span,div")]
    .filter((candidate) => candidate !== control && !candidate.contains(control) && visible(candidate))
    .filter((candidate) => !candidate.closest("button,a,[role='button'],[role='link']"))
    .filter((candidate) => /^(?:意向工作城市|期望工作城市)$/u.test(
      String(candidate.innerText || candidate.textContent || "").replace(/\s+/gu, "").trim()
    ));
  const labels = matchingLabels
    .filter((candidate) => !matchingLabels.some((other) => other !== candidate && other.contains(candidate)));
  if (labels.length !== 1) return result("commit_target_missing");
  const label = labels[0]!;
  control.blur();
  label.click();
  return result("clicked", true, label);
}

function emptyLedger(): DeepSeekLocationActionLedger {
  return {
    prepareSurfaceCount: 0,
    scrollCount: 0,
    openAttemptCount: 0,
    openClickCount: 0,
    leafAttemptCount: 0,
    leafClickCount: 0,
    commitAttemptCount: 0,
    commitClickCount: 0,
    observerPollCount: 0,
    readbackPollCount: 0,
    nativeEventClickCount: 0,
    trustedPointerClickCount: 0,
    retryCount: 0,
    reloadCount: 0,
    fullFormRestartCount: 0
  };
}

export async function executeDeepSeekLocationDriver(
  input: DeepSeekLocationDriverInput
): Promise<DeepSeekLocationDriverResult> {
  const attemptId = input.attemptId ?? (typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `deepseek-location-${Date.now()}`);
  const ledger = emptyLedger();
  const lifecycle: DeepSeekLocationLifecycleEvent[] = [];
  let observerArmed = false;
  let popupEverOpened = false;
  let availableOptions: string[] = [];
  const cityMatchToken = input.exactPageOption ? undefined : cityOptionMatchToken(input.expected);
  let selectedDisplay = input.expected;
  const rememberSelectedDisplay = (probe: DeepSeekLocationTargetProbe): boolean => {
    const selected = input.exactPageOption
      ? probe.availableOptions.filter(option => deepSeekLocationReadbackMatches(option, input.expected))
      : [uniqueCityOption(probe.availableOptions, input.expected)].filter((value): value is string => value !== null);
    if (selected.length !== 1) return false;
    selectedDisplay = selected[0]!;
    return true;
  };
  const rememberAvailableOptions = (options: string[] | undefined) => {
    if (!options) return;
    availableOptions = [...new Set(options)];
  };
  const record = (
    stage: DeepSeekLocationDriverStage,
    status: string,
    popupCount = 0,
    matchingLeafCount = 0,
    everOpened = popupEverOpened
  ) => {
    if (lifecycle.length >= 48) return;
    lifecycle.push({
      sequence: lifecycle.length + 1,
      stage,
      status,
      popupCount,
      matchingLeafCount,
      popupEverOpened: everOpened
    });
  };
  const diagnostics = (failureCode: DeepSeekLocationFailureCode | null): DeepSeekLocationDriverDiagnostics => ({
    schemaVersion: "deepseek-location-driver-diagnostic.v4",
    eventMechanism: "cdp_trusted_pointer_focus_emulation",
    attemptId,
    failureCode,
    availableOptions: [...availableOptions],
    ledger: { ...ledger },
    lifecycle: lifecycle.map((event) => ({ ...event }))
  });
  const failure = (
    stage: DeepSeekLocationDriverStage,
    failureCode: DeepSeekLocationFailureCode,
    detail: string,
    readback: DeepSeekLocationReadback = { actual: "", validationCleared: false, popupClosed: true }
  ): DeepSeekLocationDriverResult => ({
    success: false,
    stage,
    error: `${DEEPSEEK_LOCATION_INTERACTION_FAILED}: [${stage}/${failureCode}] ${detail}`,
    availableOptions: [...availableOptions],
    diagnostics: diagnostics(failureCode),
    ...readback
  });
  const success = (
    stage: DeepSeekLocationDriverStage,
    readback: DeepSeekLocationReadback
  ): DeepSeekLocationDriverResult => ({
    success: true,
    stage,
    error: null,
    availableOptions: [...availableOptions],
    diagnostics: diagnostics(null),
    ...readback
  });
  const execute = async <T>(func: (...args: never[]) => T, args: unknown[]): Promise<T | null> => {
    const execution = await executeInterruptibleScript({
      target: { tabId: input.tabId },
      world: "MAIN",
      func,
      args
    });
    return execution[0]?.result ?? null;
  };
  const inspect = () => execute(
    inspectDeepSeekLocationTargetInPage as (...args: never[]) => Promise<DeepSeekLocationPreparedProbe>,
    [input.selector, input.expected, "observe", ...(cityMatchToken === undefined ? [] : [cityMatchToken])]
  );
  const prepareOpen = () => execute(
    inspectDeepSeekLocationTargetInPage as (...args: never[]) => Promise<DeepSeekLocationPreparedProbe>,
    [input.selector, input.expected, "prepare_open", ...(cityMatchToken === undefined ? [] : [cityMatchToken])]
  );
  const readback = () => execute(
    readDeepSeekLocationInPage as (...args: never[]) => DeepSeekLocationReadback,
    [input.selector]
  );
  const armObserver = () => execute(
    armDeepSeekLocationOpenObserverInPage as (...args: never[]) => DeepSeekLocationOpenObserverSnapshot,
    [input.selector, input.expected, attemptId, ...(cityMatchToken === undefined ? [] : [cityMatchToken])]
  );
  const readObserver = () => execute(
    readDeepSeekLocationOpenObserverInPage as (...args: never[]) => DeepSeekLocationOpenObserverSnapshot,
    [attemptId]
  );
  const disarmObserver = () => execute(
    disarmDeepSeekLocationOpenObserverInPage as (...args: never[]) => boolean,
    [attemptId]
  );
  const matches = (state: DeepSeekLocationReadback | null) => Boolean(state &&
    deepSeekLocationReadbackMatches(state.actual, selectedDisplay) &&
    state.validationCleared && state.popupClosed);
  const prepareSurface = async () => {
    if (ledger.prepareSurfaceCount !== 0) return;
    ledger.prepareSurfaceCount += 1;
    await input.prepareSurface();
  };
  const commitAndVerify = async (
    initial: DeepSeekLocationReadback
  ): Promise<DeepSeekLocationDriverResult> => {
    ledger.commitAttemptCount += 1;
    let committed = false;
    try {
      committed = await input.commitSelection();
    } catch (error) {
      record("commit", "commit_trusted_pointer_dispatch_failed");
      return failure(
        "commit",
        "commit_target_missing",
        `城市已显示，但后台可信指针失焦提交失败：${error instanceof Error ? error.message : String(error)}`,
        initial
      );
    }
    if (!committed) {
      record("commit", "commit_target_missing");
      return failure("commit", "commit_target_missing", "城市已显示，但没有找到唯一的字段失焦提交位置", initial);
    }
    ledger.commitClickCount += 1;
    ledger.trustedPointerClickCount += 1;
    record("commit", "trusted_commit_click_dispatched");
    let latest: DeepSeekLocationReadback | null = initial;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await input.wait(attempt === 0 ? 160 : 180);
      ledger.readbackPollCount += 1;
      latest = await readback();
      if (!latest) {
        record("readback", "readback_unavailable");
        return failure("readback", "readback_unavailable", "失焦提交后没有返回站点回读", initial);
      }
      record("readback", matches(latest) ? "committed" : "commit_pending");
      if (matches(latest)) return success("readback", latest);
    }
    return failure(
      "commit",
      "commit_validation_not_cleared",
      "城市已显示且只执行了一次失焦提交，但必填校验仍未清除",
      latest ?? initial
    );
  };

  try {
    const initialReadback = await readback();
    if (!initialReadback) {
      record("readback", "initial_readback_unavailable");
      return failure("readback", "readback_unavailable", "地点控件初始回读没有返回结果");
    }
    if (initialReadback.actual && !input.exactPageOption &&
      cityDisplayMatchesFact(initialReadback.actual, input.expected)) selectedDisplay = initialReadback.actual;
    record("readback", matches(initialReadback) ? "already_committed" : "initial");
    if (matches(initialReadback)) return success("readback", initialReadback);
    if (initialReadback.actual) {
      if (!deepSeekLocationReadbackMatches(initialReadback.actual, selectedDisplay)) {
        return failure(
          "readback",
          "preexisting_value_mismatch",
          "地点控件已存在不同城市值；Driver 不覆盖、不重新打开或重新选择",
          initialReadback
        );
      }
      if (!initialReadback.popupClosed) {
        return failure(
          "open",
          "unexpected_popup_state",
          "地点控件已有目标城市值但弹层仍打开；Driver 不接管未知交互状态",
          initialReadback
        );
      }
      await prepareSurface();
      return commitAndVerify(initialReadback);
    }

    const initialProbe = await inspect();
    if (!initialProbe) {
      record("detect", "driver_interrupted");
      return failure("detect", "driver_interrupted", "地点控件初始检查没有返回结果");
    }
    rememberAvailableOptions(initialProbe.availableOptions);
    record("detect", initialProbe.status, initialProbe.popupCount, initialProbe.matchingLeafCount);
    if (initialProbe.status === "control_missing") {
      return failure("detect", "control_missing", "没有定位到唯一 DeepSeek 意向工作城市控件");
    }
    if (initialProbe.status === "control_ambiguous") {
      return failure("detect", "control_ambiguous", "定位到多个 DeepSeek 意向工作城市控件");
    }
    if (input.allowPreopenedExpectedLeaf && initialProbe.status === "ready" &&
      initialProbe.popupCount === 1 && initialProbe.matchingLeafCount === 1 && initialProbe.leafPoint) {
      popupEverOpened = true;
      await prepareSurface();
      const liveLeaf = await inspect();
      rememberAvailableOptions(liveLeaf?.availableOptions);
      if (!liveLeaf || liveLeaf.status !== "ready" || liveLeaf.popupCount !== 1 ||
        liveLeaf.matchingLeafCount !== 1 || !liveLeaf.leafPoint) {
        record(
          "select",
          liveLeaf?.status ?? "leaf_target_missing",
          liveLeaf?.popupCount ?? 0,
          liveLeaf?.matchingLeafCount ?? 0,
          popupEverOpened
        );
        return failure("select", "leaf_target_stale", "已打开弹层中的唯一城市叶子在可信点击前发生变化");
      }
      ledger.leafAttemptCount += 1;
      if (!rememberSelectedDisplay(liveLeaf)) return failure("select", "leaf_ambiguous", "城市名称命中不唯一，未选择");
      try {
        await input.clickPoint(liveLeaf.leafPoint);
      } catch (error) {
        record("select", "leaf_event_dispatch_failed", 1, 1, popupEverOpened);
        return failure(
          "select",
          "leaf_event_dispatch_failed",
          `已打开弹层中的唯一城市叶子可信点击失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
      ledger.leafClickCount += 1;
      ledger.trustedPointerClickCount += 1;
      record("select", "trusted_preopened_leaf_click_dispatched", 1, 1, popupEverOpened);
      let finalReadback: DeepSeekLocationReadback | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await input.wait(attempt === 0 ? 160 : 180);
        ledger.readbackPollCount += 1;
        finalReadback = await readback();
        if (!finalReadback) {
          record("readback", "readback_unavailable");
          return failure("readback", "readback_unavailable", "唯一城市点击后没有返回站点回读");
        }
        record("readback", matches(finalReadback) ? "committed" : "selection_pending");
        if (matches(finalReadback)) return success("readback", finalReadback);
        const selectedNeedsCommit = deepSeekLocationReadbackMatches(finalReadback.actual, selectedDisplay) &&
          finalReadback.popupClosed && !finalReadback.validationCleared;
        if (selectedNeedsCommit) return commitAndVerify(finalReadback);
      }
      return failure(
        "readback",
        "readback_mismatch",
        "已打开弹层中的唯一城市点击后未形成完整回读状态",
        finalReadback ?? initialReadback
      );
    }
    if (!["popup_closed", "control_not_clickable"].includes(initialProbe.status)) {
      return failure(
        "open",
        "unexpected_popup_state",
        `Driver 开始前地点弹层已处于 ${initialProbe.status}，不会接管、关闭或继续选择`
      );
    }

    await prepareSurface();
    const prepared = await prepareOpen();
    if (!prepared) {
      record("prepare_open", "driver_interrupted");
      return failure("prepare_open", "driver_interrupted", "地点控件单次准备没有返回结果");
    }
    rememberAvailableOptions(prepared.availableOptions);
    if (prepared.scrolled) ledger.scrollCount += 1;
    record("prepare_open", prepared.status, prepared.popupCount, prepared.matchingLeafCount);
    if (prepared.status !== "popup_closed" || !prepared.controlPoint) {
      const code: DeepSeekLocationFailureCode = prepared.status === "control_missing"
        ? "control_missing"
        : prepared.status === "control_ambiguous"
          ? "control_ambiguous"
          : prepared.status === "control_not_clickable"
            ? "control_not_clickable"
            : "unexpected_popup_state";
      return failure("prepare_open", code, `单次滚动稳定后地点控件未形成可打开状态（${prepared.status}）`);
    }

    const armed = await armObserver();
    if (!armed?.armed) {
      record("open", "observer_not_armed");
      return failure("open", "driver_interrupted", "地点弹层生命周期观察器未能在点击前安装");
    }
    observerArmed = true;
    popupEverOpened = armed.popupEverOpened;
    record("open", "observer_armed", armed.popupCount, armed.matchingLeafCount, popupEverOpened);

    const liveOpenTarget = await inspect();
    rememberAvailableOptions(liveOpenTarget?.availableOptions);
    if (!liveOpenTarget || liveOpenTarget.status !== "popup_closed" || !liveOpenTarget.controlPoint) {
      record(
        "open",
        liveOpenTarget?.status ?? "open_target_missing",
        liveOpenTarget?.popupCount ?? 0,
        liveOpenTarget?.matchingLeafCount ?? 0
      );
      return failure("open", "open_target_stale", "后台可信指针点击前地点控件的实时状态已变化");
    }
    ledger.openAttemptCount += 1;
    try {
      await input.clickPoint(liveOpenTarget.controlPoint);
    } catch (error) {
      record("open", "open_event_dispatch_failed");
      return failure(
        "open",
        "open_event_dispatch_failed",
        `唯一后台可信指针打开事件发送失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
    ledger.openClickCount += 1;
    ledger.trustedPointerClickCount += 1;
    record("open", "trusted_open_click_dispatched");

    let probe: DeepSeekLocationTargetProbe | null = liveOpenTarget;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await input.wait(attempt === 0 ? 120 : 180);
      ledger.observerPollCount += 1;
      const observer = await readObserver();
      if (!observer?.armed) {
        record("open", "observer_lost");
        return failure("open", "driver_interrupted", "地点弹层生命周期观察器在打开后丢失");
      }
      popupEverOpened ||= observer.popupEverOpened;
      probe = await inspect();
      if (!probe) {
        record("open", "driver_interrupted", observer.popupCount, observer.matchingLeafCount, popupEverOpened);
        return failure("open", "driver_interrupted", "地点弹层只读观察没有返回结果");
      }
      rememberAvailableOptions(probe.availableOptions);
      record("open", probe.status, observer.popupCount, observer.matchingLeafCount, popupEverOpened);
      if (probe.status === "ready" && probe.leafPoint) break;
      if (popupEverOpened && probe.status === "popup_closed") {
        return failure("open", "open_then_closed", "地点弹层曾经打开，但在形成唯一城市叶子项前关闭");
      }
      if (probe.status === "popup_ambiguous") {
        return failure("open", "popup_ambiguous", "地点点击后出现多个无法归属的弹层");
      }
      if (probe.status === "leaf_ambiguous") {
        return failure("select", "leaf_ambiguous", `地点弹层出现 ${probe.matchingLeafCount} 个同名城市叶子项`);
      }
      if (["control_missing", "control_ambiguous"].includes(probe.status)) {
        return failure("open", "open_target_stale", `打开后地点控件状态变化为 ${probe.status}`);
      }
    }
    if (!probe || probe.status !== "ready" || !probe.leafPoint) {
      if (!popupEverOpened) {
        return failure("open", "open_event_not_observed", "唯一后台可信指针打开事件发送后，生命周期观察器从未看到地点弹层");
      }
      if (probe?.status === "popup_closed") {
        return failure("open", "open_then_closed", "地点弹层打开后又关闭，未执行第二次打开动作");
      }
      return failure(
        "select",
        probe?.status === "leaf_ambiguous" ? "leaf_ambiguous" : "leaf_missing",
        `地点弹层未形成唯一城市叶子项（${probe?.status ?? "unknown"}；命中 ${probe?.matchingLeafCount ?? 0}）`
      );
    }

    await disarmObserver().catch(() => null);
    observerArmed = false;
    const liveLeaf = await inspect();
    rememberAvailableOptions(liveLeaf?.availableOptions);
    if (!liveLeaf || liveLeaf.status !== "ready" || !liveLeaf.leafPoint || liveLeaf.matchingLeafCount !== 1) {
      record(
        "select",
        liveLeaf?.status ?? "leaf_target_missing",
        liveLeaf?.popupCount ?? 0,
        liveLeaf?.matchingLeafCount ?? 0,
        popupEverOpened
      );
      return failure("select", "leaf_target_stale", "城市叶子点击前的唯一实时命中点已变化");
    }
    ledger.leafAttemptCount += 1;
    if (!rememberSelectedDisplay(liveLeaf)) return failure("select", "leaf_ambiguous", "城市名称命中不唯一，未选择");
    try {
      await input.clickPoint(liveLeaf.leafPoint);
    } catch (error) {
      record("select", "leaf_event_dispatch_failed", liveLeaf.popupCount, 1, popupEverOpened);
      return failure(
        "select",
        "leaf_event_dispatch_failed",
        `唯一城市叶子后台可信指针事件发送失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
    ledger.leafClickCount += 1;
    ledger.trustedPointerClickCount += 1;
    record("select", "trusted_leaf_click_dispatched", liveLeaf.popupCount, 1, popupEverOpened);

    let finalReadback: DeepSeekLocationReadback | null = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await input.wait(attempt === 0 ? 160 : 180);
      ledger.readbackPollCount += 1;
      finalReadback = await readback();
      if (!finalReadback) {
        record("readback", "readback_unavailable");
        return failure("readback", "readback_unavailable", "城市叶子点击后没有返回站点回读");
      }
      record("readback", matches(finalReadback) ? "committed" : "selection_pending");
      if (matches(finalReadback)) return success("readback", finalReadback);
      const selectedNeedsCommit = deepSeekLocationReadbackMatches(finalReadback.actual, selectedDisplay) &&
        finalReadback.popupClosed && !finalReadback.validationCleared;
      if (selectedNeedsCommit) return commitAndVerify(finalReadback);
    }
    if (!finalReadback) return failure("readback", "readback_unavailable", "地点选择后没有返回站点回读");
    return failure(
      "readback",
      "readback_mismatch",
      "城市叶子点击后未形成目标展示值、关闭弹层且清除校验的完整状态",
      finalReadback
    );
  } catch (error) {
    record("readback", "driver_interrupted");
    return failure(
      "readback",
      "driver_interrupted",
      `地点 Driver 被中断：${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    if (observerArmed) await disarmObserver().catch(() => null);
  }
}
