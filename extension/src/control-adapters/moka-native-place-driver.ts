import { executeInterruptibleScript } from "../auto-apply-interruption.js";
const MOKA_NATIVE_PLACE_INTERACTION_FAILED = "native_place_control_interaction_failed";

export type MokaNativePlaceStep =
  | "open"
  | "province_tab"
  | "province"
  | "city_tab"
  | "city"
  | "district_tab"
  | "district"
  | "confirm"
  | "readback";

export interface MokaNativePlacePoint {
  x: number;
  y: number;
  tagName: string;
  className: string;
}

export interface MokaNativePlaceProbe {
  status: "ready" | "control_missing" | "control_ambiguous" | "popup_closed" |
    "popup_ambiguous" | "target_missing" | "target_ambiguous" | "target_not_clickable" |
    "target_needs_scroll";
  point: MokaNativePlacePoint | null;
  scrollPoint: MokaNativePlacePoint | null;
  scrollDeltaY: number;
  popupCount: number;
  matchingTargetCount: number;
  availableOptions: string[];
}

export interface MokaNativePlaceReadback {
  actual: string;
  popupClosed: boolean;
  validationCleared: boolean;
}

export interface MokaNativePlaceDriverResult extends MokaNativePlaceReadback {
  success: boolean;
  stage: MokaNativePlaceStep;
  error: string | null;
  availableOptions: string[];
  diagnostics: Record<string, unknown>;
}

export interface MokaNativePlaceDriverInput {
  tabId: number;
  selector: string;
  expected: string;
  clickPoint(point: MokaNativePlacePoint): Promise<void>;
  scrollPoint(point: MokaNativePlacePoint, deltaY: number): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}

export function isMokaNativePlaceInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(MOKA_NATIVE_PLACE_INTERACTION_FAILED);
}

export type MokaNativePlaceParts = [string, string] | [string, string, string];

export const MOKA_NATIVE_PLACE_PROVINCE_PREFIXES = [
  "黑龙江", "内蒙古", "广西", "西藏", "宁夏", "新疆", "香港", "澳门",
  "北京", "天津", "上海", "重庆", "河北", "山西", "辽宁", "吉林",
  "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北",
  "湖南", "广东", "海南", "四川", "贵州", "云南", "陕西", "甘肃",
  "青海", "台湾"
] as const;

export function parseMokaNativePlace(value: unknown): MokaNativePlaceParts | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const delimited = text.split(/[\s/／>＞,，;；|｜]+/u).map((part) => part.trim()).filter(Boolean);
  if (delimited.length >= 3) return [delimited[0]!, delimited[1]!, delimited[2]!];
  if (delimited.length === 2) return [delimited[0]!, delimited[1]!];
  const compact = text.replace(/\s+/gu, "");
  const threeLevel = compact.match(/^(.+?(?:省|自治区|特别行政区|市))(.+?市)(.+?(?:区|县|旗|市))$/u);
  if (threeLevel) return [threeLevel[1]!, threeLevel[2]!, threeLevel[3]!];
  const twoLevel = compact.match(/^(.+?(?:省|自治区|特别行政区|市))(.+?(?:市|州|盟|地区))$/u);
  if (twoLevel) return [twoLevel[1]!, twoLevel[2]!];
  const provincePrefix = MOKA_NATIVE_PLACE_PROVINCE_PREFIXES.find((province) =>
    compact.startsWith(province) && compact.length > province.length
  );
  return provincePrefix ? [provincePrefix, compact.slice(provincePrefix.length)] : null;
}

export function normalizeMokaNativePlacePart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s·._/／>＞,，;；|｜-]+/gu, "")
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市|区|县|旗)$/u, "")
    .toLowerCase();
}

export function mokaNativePlaceReadbackMatches(actual: unknown, expected: unknown): boolean {
  const parts = parseMokaNativePlace(expected);
  if (!parts) return false;
  const expectedParts = normalizeMokaNativePlacePart(parts[0]) === normalizeMokaNativePlacePart(parts[1])
    ? [parts[0], ...parts.slice(2)]
    : parts;
  const rendered = String(actual ?? "");
  const normalizedActual = rendered
    .replace(/[\s·._/／>＞,，;；|｜-]+/gu, "")
    .replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市|区|县|旗/gu, "")
    .toLowerCase();
  let cursor = 0;
  for (const part of expectedParts) {
    const normalizedPart = normalizeMokaNativePlacePart(part);
    if (!normalizedPart) return false;
    const index = normalizedActual.indexOf(normalizedPart, cursor);
    if (index < 0) return false;
    cursor = index + normalizedPart.length;
  }
  return true;
}

/** MAIN-world, read-only probe for the Moka 籍贯 popup. */
export function inspectMokaNativePlaceTargetInPage(
  targetSelector: string,
  step: Exclude<MokaNativePlaceStep, "readback">,
  expectedPart = ""
): MokaNativePlaceProbe {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const normalize = (value: unknown) => String(value ?? "")
    .trim()
    .replace(/[\s·._/／>＞,，;；|｜-]+/gu, "")
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市|区|县|旗)$/u, "")
    .toLowerCase();
  const point = (element: HTMLElement): MokaNativePlacePoint | null => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!(hit === element || element.contains(hit))) return null;
    return { x, y, tagName: element.tagName, className: String(element.className || "") };
  };
  const response = (
    status: MokaNativePlaceProbe["status"],
    target: HTMLElement | null = null,
    popupCount = 0,
    matchingTargetCount = 0,
    availableOptions: string[] = []
  ): MokaNativePlaceProbe => ({
    status,
    point: target ? point(target) : null,
    scrollPoint: null,
    scrollDeltaY: 0,
    popupCount,
    matchingTargetCount,
    availableOptions
  });
  const isControl = (candidate: Element | null): candidate is HTMLInputElement => {
    if (!(candidate instanceof HTMLInputElement) || !visible(candidate)) return false;
    const dropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
    const component = candidate.closest("[class*='location_info-'],[class*='location_info_']");
    return candidate.type === "text" && candidate.readOnly && dropdown instanceof HTMLElement && component instanceof HTMLElement;
  };
  // The command already owns a field. Never rebind to another same-named input.
  let controls: HTMLInputElement[];
  try { controls = [...document.querySelectorAll(targetSelector)].filter(isControl); }
  catch { return response("control_missing"); }
  if (controls.length === 0) return response("control_missing");
  if (controls.length !== 1) return response("control_ambiguous");
  const control = controls[0]!;
  if (step === "open") {
    const controlPoint = point(control);
    if (controlPoint) return { ...response("ready", control), point: controlPoint };
    const rect = control.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const scrollX = Math.max(20, Math.min(viewportWidth - 20, rect.left + rect.width / 2));
    const scrollY = Math.max(20, Math.min(viewportHeight - 20, viewportHeight * 0.55));
    const hit = document.elementFromPoint(scrollX, scrollY);
    const rawDelta = rect.top + rect.height / 2 - scrollY;
    const scrollDeltaY = Math.sign(rawDelta || 1) * Math.min(
      Math.max(120, Math.abs(rawDelta)),
      Math.max(160, viewportHeight * 0.7)
    );
    if (hit && Math.abs(scrollDeltaY) >= 1) {
      return {
        ...response("target_needs_scroll", null, 0, 1),
        scrollPoint: {
          x: scrollX,
          y: scrollY,
          tagName: hit instanceof HTMLElement ? hit.tagName : "",
          className: hit instanceof HTMLElement ? String(hit.className || "") : ""
        },
        scrollDeltaY
      };
    }
    return response("target_not_clickable");
  }

  const popupSelectors = [
    "[class*='Dropdown-dropdown']", "[class*='dropdown-dropdown']",
    "[class*='native-place']", "[class*='NativePlace']",
    "[class*='cascader']", "[class*='Cascader']",
    "[class*='popover']", "[class*='Popover']"
  ].join(",");
  const popupCandidates = [...document.querySelectorAll<HTMLElement>(popupSelectors)]
    .filter(visible)
    .filter((candidate) => {
      const text = String(candidate.innerText || candidate.textContent || "");
      return /省份/u.test(text) && /城市/u.test(text) && /县区/u.test(text) && /确认/u.test(text);
    })
    .sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.width * a.height - b.width * b.height;
    });
  const popups = popupCandidates.filter((candidate, index, all) =>
    !all.some((other, otherIndex) => otherIndex < index && candidate.contains(other))
  );
  if (popups.length === 0) return response("popup_closed");
  if (popups.length !== 1) return response("popup_ambiguous", null, popups.length);
  const popup = popups[0]!;

  const tabByStep: Partial<Record<MokaNativePlaceStep, string>> = {
    province_tab: "省份",
    city_tab: "城市",
    district_tab: "县区"
  };
  const tabName = tabByStep[step];
  if (tabName) {
    const tabs = [...popup.querySelectorAll<HTMLElement>("button,[role='tab'],span,div")]
      .filter(visible)
      .filter((candidate) => String(candidate.innerText || candidate.textContent || "").trim() === tabName)
      .filter((candidate) => ![...candidate.children].some((child) =>
        visible(child) && String((child as HTMLElement).innerText || child.textContent || "").trim() === tabName
      ));
    if (tabs.length !== 1) return response(tabs.length ? "target_ambiguous" : "target_missing", null, 1, tabs.length);
    const targetPoint = point(tabs[0]!);
    return targetPoint
      ? { ...response("ready", tabs[0]!, 1, 1), point: targetPoint }
      : response("target_not_clickable", null, 1, 1);
  }

  if (step === "confirm") {
    const confirms = [...popup.querySelectorAll<HTMLElement>("button,[role='button'],span,div")]
      .filter(visible)
      .filter((candidate) => String(candidate.innerText || candidate.textContent || "").trim() === "确认")
      .filter((candidate) => ![...candidate.children].some((child) =>
        visible(child) && String((child as HTMLElement).innerText || child.textContent || "").trim() === "确认"
      ));
    if (confirms.length !== 1) return response(confirms.length ? "target_ambiguous" : "target_missing", null, 1, confirms.length);
    const targetPoint = point(confirms[0]!);
    return targetPoint
      ? { ...response("ready", confirms[0]!, 1, 1), point: targetPoint }
      : response("target_not_clickable", null, 1, 1);
  }

  const expected = normalize(expectedPart);
  const leaves = [...popup.querySelectorAll<HTMLElement>("button,[role='option'],[role='treeitem'],li,span,div")]
    .filter(visible)
    .filter((candidate) => normalize(candidate.innerText || candidate.textContent) === expected)
    .filter((candidate) => ![...candidate.children].some((child) =>
      visible(child) && normalize((child as HTMLElement).innerText || child.textContent) === expected
    ));
  const authoritativeLeaves = step === "province"
    ? leaves.filter((candidate) => candidate.closest("[class*='alphabet'],[class*='Alphabet']"))
    : [];
  const matchingLeaves = authoritativeLeaves.length ? authoritativeLeaves : leaves;
  const availableOptions = [...new Set([...popup.querySelectorAll<HTMLElement>("button,[role='option'],[role='treeitem'],li")]
    .filter(visible)
    .map((candidate) => String(candidate.innerText || candidate.textContent || "").trim())
    .filter((value) => value && !/^(?:省份|城市|县区|确认)$/u.test(value)))].slice(0, 30);
  if (matchingLeaves.length !== 1) {
    return response(matchingLeaves.length ? "target_ambiguous" : "target_missing", null, 1, matchingLeaves.length, availableOptions);
  }
  const targetPoint = point(matchingLeaves[0]!);
  if (!targetPoint) {
    const target = matchingLeaves[0]!;
    let scrollSurface: HTMLElement | null = target.parentElement;
    while (scrollSurface && scrollSurface !== popup) {
      const style = getComputedStyle(scrollSurface);
      if (/(?:auto|scroll|overlay)/u.test(style.overflowY) &&
        scrollSurface.scrollHeight > scrollSurface.clientHeight + 1) break;
      scrollSurface = scrollSurface.parentElement;
    }
    if (scrollSurface) {
      const surfaceRect = scrollSurface.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const surfaceX = surfaceRect.left + surfaceRect.width / 2;
      const surfaceY = surfaceRect.top + surfaceRect.height / 2;
      const hit = document.elementFromPoint(surfaceX, surfaceY);
      const rawDelta = targetRect.top + targetRect.height / 2 - surfaceY;
      const scrollDeltaY = Math.sign(rawDelta) * Math.min(
        Math.abs(rawDelta),
        Math.max(120, surfaceRect.height * 0.7)
      );
      if (hit && popup.contains(hit) && Math.abs(scrollDeltaY) >= 1) {
        return {
          ...response("target_needs_scroll", null, 1, 1, availableOptions),
          scrollPoint: {
            x: surfaceX,
            y: surfaceY,
            tagName: hit instanceof HTMLElement ? hit.tagName : scrollSurface.tagName,
            className: hit instanceof HTMLElement ? String(hit.className || "") : String(scrollSurface.className || "")
          },
          scrollDeltaY
        };
      }
    }
  }
  return targetPoint
    ? { ...response("ready", matchingLeaves[0]!, 1, 1, availableOptions), point: targetPoint }
    : response("target_not_clickable", null, 1, 1, availableOptions);
}

/** MAIN-world readback. */
export function readMokaNativePlaceInPage(targetSelector: string): MokaNativePlaceReadback | null {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const control = document.querySelector(targetSelector);
  if (!(control instanceof HTMLInputElement)) return null;
  const fieldRoot = control.closest("[class*='apply-field'],[class*='Apply-field'],[class*='field'],[class*='Field']") ?? control.parentElement;
  const display = fieldRoot?.querySelector<HTMLElement>(
    "[class*='display-value'],[class*='DisplayValue'],[class*='selection-text'],[class*='selected-value'],[class*='selected']"
  );
  const rendered = String(display?.innerText || display?.textContent || control.value || "").trim();
  const actual = rendered === control.placeholder ? "" : rendered;
  const popupOpen = [...document.querySelectorAll<HTMLElement>(
    "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown'],[class*='native-place'],[class*='NativePlace'],[class*='cascader'],[class*='Cascader'],[class*='popover'],[class*='Popover']"
  )].filter(visible).some((candidate) => {
    const text = String(candidate.innerText || candidate.textContent || "");
    return /省份/u.test(text) && /城市/u.test(text) && /县区/u.test(text) && /确认/u.test(text);
  });
  const validationText = String((fieldRoot as HTMLElement | null)?.innerText || fieldRoot?.textContent || "");
  return {
    actual,
    popupClosed: !popupOpen,
    validationCleared: !/必填项未填写|不能为空|请选择籍贯/u.test(validationText)
  };
}

export async function executeMokaNativePlaceDriver(
  input: MokaNativePlaceDriverInput
): Promise<MokaNativePlaceDriverResult> {
  const parts = parseMokaNativePlace(input.expected);
  const availableOptions: string[] = [];
  let trustedPointerClickCount = 0;
  let trustedPointerScrollCount = 0;
  const execute = async <T>(func: (...args: never[]) => T, args: unknown[]) => {
    const execution = await executeInterruptibleScript({
      target: { tabId: input.tabId },
      world: "MAIN",
      func,
      args
    });
    return execution[0]?.result ?? null;
  };
  const readback = () => execute(
    readMokaNativePlaceInPage as (...args: never[]) => MokaNativePlaceReadback,
    [input.selector]
  );
  const diagnostics = (stage: MokaNativePlaceStep, status: string) => ({
    schemaVersion: "moka-native-place-driver-diagnostic.v2",
    eventMechanism: "cdp_trusted_pointer_focus_emulation",
    stage,
    status,
    trustedPointerClickCount,
    trustedPointerScrollCount,
    retryCount: 0,
    reloadCount: 0,
    fullFormRestartCount: 0,
    fallbackDriverCount: 0,
    expectedParts: parts,
    availableOptions: [...new Set(availableOptions)]
  });
  const result = (
    success: boolean,
    stage: MokaNativePlaceStep,
    status: string,
    state: MokaNativePlaceReadback = { actual: "", popupClosed: true, validationCleared: false }
  ): MokaNativePlaceDriverResult => ({
    success,
    stage,
    error: success ? null : `${MOKA_NATIVE_PLACE_INTERACTION_FAILED}: [${stage}/${status}] Moka 籍贯级联选择失败`,
    availableOptions: [...new Set(availableOptions)],
    diagnostics: diagnostics(stage, status),
    ...state
  });
  if (!parts) return result(false, "open", "invalid_expected_value");
  const initial = await readback();
  if (initial && mokaNativePlaceReadbackMatches(initial.actual, input.expected) &&
    initial.popupClosed && initial.validationCleared) {
    return result(true, "readback", "already_committed", initial);
  }
  if (initial?.actual) return result(false, "readback", "preexisting_value_mismatch", initial);

  const actions: Array<[Exclude<MokaNativePlaceStep, "readback">, string]> = [
    ["open", ""],
    ["province", parts[0]]
  ];
  const directMunicipality = normalizeMokaNativePlacePart(parts[0]) === normalizeMokaNativePlacePart(parts[1]);
  if (!directMunicipality) actions.push(["city", parts[1]]);
  if (parts[2]) {
    actions.push(["district", parts[2]]);
  }
  actions.push(["confirm", ""]);
  for (const [step, expectedPart] of actions) {
    let probe: MokaNativePlaceProbe | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (attempt) await input.wait(120);
      probe = await execute(
        inspectMokaNativePlaceTargetInPage as (...args: never[]) => MokaNativePlaceProbe,
        [input.selector, step, expectedPart]
      );
      if (probe?.availableOptions?.length) availableOptions.push(...probe.availableOptions);
      if (probe?.status === "ready" && probe.point) break;
      if (probe?.status === "target_needs_scroll" && probe.scrollPoint && probe.scrollDeltaY) {
        await input.scrollPoint(probe.scrollPoint, probe.scrollDeltaY);
        trustedPointerScrollCount += 1;
        await input.wait(180);
        continue;
      }
      if (probe && !["popup_closed", "target_missing"].includes(probe.status)) break;
    }
    if (!probe || probe.status !== "ready" || !probe.point) {
      return result(false, step, probe?.status ?? "probe_unavailable", (await readback()) ?? undefined);
    }
    await input.clickPoint(probe.point);
    trustedPointerClickCount += 1;
    await input.wait(step === "confirm" ? 260 : 160);
    const committed = await readback();
    if (committed && mokaNativePlaceReadbackMatches(committed.actual, input.expected) &&
      committed.popupClosed && committed.validationCleared) {
      return result(true, "readback", "committed", committed);
    }
  }

  let finalState: MokaNativePlaceReadback | null = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (attempt) await input.wait(140);
    finalState = await readback();
    if (finalState && mokaNativePlaceReadbackMatches(finalState.actual, input.expected) &&
      finalState.popupClosed && finalState.validationCleared) {
      return result(true, "readback", "committed", finalState);
    }
  }
  return result(false, "readback", "readback_mismatch", finalState ?? undefined);
}
