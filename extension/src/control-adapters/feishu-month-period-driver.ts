import { executeInterruptibleScript } from "../auto-apply-interruption.js";
const FEISHU_MONTH_PERIOD_INTERACTION_FAILED = "feishu_month_period_control_interaction_failed";

export type FeishuMonthPeriodStage = "prepare" | "detect" | "open" | "year_toggle" | "year" | "month" | "readback";

export type FeishuMonthPeriodVariant = "atsx" | "throne";

export type FeishuMonthPeriodPoint = {
  x: number;
  y: number;
  tagName: string;
  className: string;
};

export type FeishuMonthPeriodProbeStatus =
  | "ready"
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "popup_closed"
  | "popup_ambiguous"
  | "popup_owner_mismatch"
  | "target_missing"
  | "target_ambiguous"
  | "target_not_clickable";

export interface FeishuMonthPeriodProbe {
  status: FeishuMonthPeriodProbeStatus;
  point: FeishuMonthPeriodPoint | null;
  popupCount: number;
  targetCount: number;
  variant: FeishuMonthPeriodVariant | null;
  panelState?: "closed" | "month" | "year";
  yearRange?: [number, number];
  pageDirection?: "previous" | "next";
}

export interface FeishuMonthPeriodObservedField {
  fieldId: string;
  stableFieldKey: string;
  selector: string;
  label: string;
  sectionKey: "education" | "work" | "project" | "other";
  fieldSource?: import("../page-adapter.js").PageFieldObservation["fieldSource"];
  validationMessage?: string | null;
  groupIndex: number;
  labelPath: string[];
  controlKind: "custom_date_picker";
  domHints: { testId: string; ariaLabel: null; placeholder: null; tagName: string; readOnly: false; classNames: string[] };
  popupBinding: null;
  temporal: null;
  type: "custom_date_picker";
  required: boolean;
  requiredSource: "explicit" | "none";
  options: string[];
  currentValue: string;
}

export interface FeishuMonthPeriodReadback {
  actual: string;
  validationCleared: boolean;
  popupClosed: boolean;
  rangeComplete: boolean;
  variant: FeishuMonthPeriodVariant | null;
}

export interface FeishuMonthPeriodDriverResult extends FeishuMonthPeriodReadback {
  success: boolean;
  stage: FeishuMonthPeriodStage;
  error: string | null;
  scrollCount: number;
  reboundByStableIdentity: boolean;
  ledger?: { control: number; yearToggle: number; yearPage: number; year: number; month: number; reusedOpenPanel: boolean };
}

export interface FeishuMonthPeriodDriverInput {
  tabId: number;
  selector: string;
  stableFieldKey: string;
  label: string;
  dateValue: { year: number; month: number };
  clickPoint(point: FeishuMonthPeriodPoint): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}

export interface FeishuMonthPeriodPreparation {
  status: "ready" | "control_missing" | "control_ambiguous";
  scrollCount: number;
  reboundByStableIdentity: boolean;
}

function normalizedMonth(value: unknown): string {
  const match = String(value ?? "").match(/((?:19|20)\d{2})\s*[-/.年]\s*(\d{1,2})/u);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : "";
}

export function isFeishuMonthPeriodInteractionFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${FEISHU_MONTH_PERIOD_INTERACTION_FAILED}:`);
}

export function isFeishuMonthPeriodApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^https?:$/u.test(url.protocol) && /(?:^|\.)jobs\.feishu\.cn$/iu.test(url.hostname) &&
      /^\/[a-zA-Z0-9_-]+\/resume\/\d+\/apply\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function isFeishuMonthPeriodField(input: {
  label?: string | null;
  stableFieldKey?: string | null;
  semanticKey?: string | null;
}): boolean {
  const identity = [input.label, input.stableFieldKey, input.semanticKey]
    .filter(Boolean).join(" ");
  if (/^other\.\d+\.(?:start|end)_date\.custom_date_picker$/u.test(input.stableFieldKey ?? "")) return true;
  return /(?:(?:教育|工作|实习|项目)经历|education|work|internship|project).*?(?:开始时间|结束时间|start.?date|end.?date)|(?:education|work|project)\[\d+\]\.(?:start|end)_date\.custom_date_picker/iu
    .test(identity);
}

/**
 * MAIN-world observation for Feishu's hidden-input month range controls.
 * The returned labels are the only visible, clickable controls; the hidden
 * input is deliberately not surfaced as a writable native field.
 */
export function observeFeishuMonthPeriodFieldsInPage(): FeishuMonthPeriodObservedField[] {
  const normalize = (value: unknown): string => {
    const match = String(value ?? "").match(/((?:19|20)\d{2})\s*[-/.年]\s*(\d{1,2})/u);
    return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : "";
  };
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0" &&
      !element.closest("[hidden],[aria-hidden='true']");
  };
  const selectorForDataCy = (dataCy: string) => `[data-cy="${dataCy.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"]`;
  const atsx = [...document.querySelectorAll<HTMLElement>(
    ".atsx-date-picker-period-month-label[data-cy$='periodInputBegin']," +
    ".atsx-date-picker-period-month-label[data-cy$='periodInputEnd']"
  )].filter(visible).flatMap((element) => {
    const dataCy = element.getAttribute("data-cy") ?? "";
    const match = dataCy.match(/^(education|internship|work|project)\[(\d+)\]\.periodInput(Begin|End)$/u);
    if (!match || !element.closest(".atsx-date-picker-period-month")) return [];
    const sourceSection = match[1]!;
    const sectionKey = sourceSection === "internship" ? "work" : sourceSection as "education" | "work" | "project";
    const title = ({education:"教育经历",internship:"实习经历",work:"工作经历",project:"项目经历"} as Record<string,string>)[sourceSection]!;
    const groupIndex = Number(match[2]);
    const edge = match[3] === "Begin" ? "start" : "end";
    const item = element.closest<HTMLElement>(".atsx-form-item");
    const required = Boolean(item?.querySelector(".atsx-form-item-label .atsx-form-item-required"));
    const label = `${title} ${groupIndex + 1} · ${edge === "start" ? "开始时间" : "结束时间"}`;
    return [{
      fieldId: `feishu-${sourceSection}-${groupIndex}-${edge}-date`,
      stableFieldKey: `${sourceSection}[${groupIndex}].${edge}_date.custom_date_picker`,
      selector: selectorForDataCy(dataCy),
      label,
      sectionKey,
      fieldSource: {dialect:"feishu_atsx" as const,fieldPath:`${sourceSection}[${groupIndex}].period`,moduleId:sourceSection,groupIndex,edge:edge as "start"|"end"},
      validationMessage: item?.querySelector<HTMLElement>(".atsx-form-explain")?.innerText?.trim() || null,
      groupIndex,
      labelPath: [title, `${title} ${groupIndex + 1}`, edge === "start" ? "开始时间" : "结束时间"],
      controlKind: "custom_date_picker" as const,
      domHints: {
        testId: dataCy, ariaLabel: null, placeholder: null, tagName: element.tagName, readOnly: false as const,
        classNames: [String(element.className), String(element.closest(".atsx-date-picker-period-month")?.className ?? "")]
      },
      popupBinding: null,
      temporal: null,
      type: "custom_date_picker" as const,
      required,
      requiredSource: required ? "explicit" as const : "none" as const,
      options: [],
      currentValue: normalize(element.innerText)
    }];
  });

  const escapeID = (value: string) => `#${value.replace(/([^a-zA-Z0-9_-])/gu, "\\$1")}`;
  const selectorFromRoot = (root: HTMLElement, element: HTMLElement): string => {
    const segments: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== root) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) return "";
      const index = [...parent.children].indexOf(current) + 1;
      segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
      current = parent;
    }
    return current === root ? `${escapeID(root.id)} > ${segments.join(" > ")}` : "";
  };
  const sectionSpecs = [
    { id: "formily-item-education_list", sectionKey: "education", title: "教育经历" },
    { id: "formily-item-works_list", sectionKey: "work", title: "工作经历" },
    { id: "formily-item-work_experience_list", sectionKey: "work", title: "工作经历" },
    { id: "formily-item-work_list", sectionKey: "work", title: "工作经历" },
    { id: "formily-item-career_list", sectionKey: "work", title: "工作经历" },
    { id: "formily-item-internship_list", sectionKey: "work", title: "实习经历" },
    { id: "formily-item-project_list", sectionKey: "project", title: "项目经历" }
  ] as const;
  const throne = sectionSpecs.flatMap((spec) => {
    const root = document.getElementById(spec.id);
    if (!(root instanceof HTMLElement) || !visible(root)) return [];
    const ranges = [...root.querySelectorAll<HTMLElement>(
      "[data-form-field-id='start_end_time'] .throne-biz-date-range-picker-wrapper"
    )].filter(visible);
    return ranges.flatMap((range, groupIndex) => {
      const item = range.closest<HTMLElement>("[data-form-field-id='start_end_time']");
      const validationText = String(item?.innerText || "");
      const required = Boolean(item?.querySelector(
        ".ud-formily-item-asterisk,[class*='required'],[aria-required='true']"
      )) || /请填写完整时间|必填项未填写|不能为空|此项为必填|(?:为|是)必填(?:项)?/u.test(validationText);
      const controls = [...range.querySelectorAll<HTMLElement>(
        ":scope > .throne-biz-date-range-picker-input"
      )].filter(visible);
      if (controls.length !== 2) return [];
      return controls.flatMap((control, edgeIndex) => {
        const selector = selectorFromRoot(root, control);
        if (!selector) return [];
        const edge = edgeIndex === 0 ? "start" : "end";
        const edgeLabel = edge === "start" ? "开始时间" : "结束时间";
        const value = (control.querySelector("input") as HTMLInputElement | null)?.value || control.innerText;
        return [{
          fieldId: `feishu-${spec.sectionKey}-${groupIndex}-${edge}-date`,
          stableFieldKey: `${spec.sectionKey}[${groupIndex}].${edge}_date.custom_date_picker`,
          selector,
          label: `${spec.title} ${groupIndex + 1} · ${edgeLabel}`,
          sectionKey: spec.sectionKey,
          groupIndex,
          labelPath: [spec.title, `${spec.title} ${groupIndex + 1}`, edgeLabel],
          controlKind: "custom_date_picker" as const,
          domHints: {
            testId: `${spec.id}:${groupIndex}:${edge}`, ariaLabel: null, placeholder: null,
            tagName: control.tagName, readOnly: false as const,
            classNames: [String(control.className), String(range.className)]
          },
          popupBinding: null,
          temporal: null,
          type: "custom_date_picker" as const,
          required,
          requiredSource: required ? "explicit" as const : "none" as const,
          options: [],
          currentValue: normalize(value)
        }];
      });
    });
  });
  const custom:FeishuMonthPeriodObservedField[] = [...document.querySelectorAll<HTMLElement>(".ud-formily-item[data-form-field-id]")].flatMap(root=>{
    const id=root.getAttribute("data-form-field-id")??"";
    if(!/^\d+$/u.test(id)||!visible(root)||document.querySelectorAll(`[id="${root.id}"]`).length!==1)return [];
    const ranges=root.querySelectorAll<HTMLElement>(".throne-biz-date-range-picker-wrapper");
    if(ranges.length!==1)return [];
    const range=ranges[0]!,ends=[...range.querySelectorAll<HTMLElement>(":scope > .throne-biz-date-range-picker-input")].filter(visible);
    const title=(root.querySelector(".ud-formily-item-label-content")?.textContent??"").replace(/[＊*]/gu,"").trim();
    if(ends.length!==2||!title)return [];
    const required=!!root.querySelector(".ud-formily-item-asterisk,[aria-required='true']");
    return ends.map((control,index)=>{const edge=index===0?"start":"end",edgeLabel=edge==="start"?"开始时间":"结束时间";return {
      fieldId:`feishu-custom-${id}-${edge}`,stableFieldKey:`other.${id}.${edge}_date.custom_date_picker`,selector:selectorFromRoot(root,control),
      label:`${title} · ${edgeLabel}`,sectionKey:"other" as const,groupIndex:0,labelPath:[title,edgeLabel],controlKind:"custom_date_picker" as const,
      fieldSource:{dialect:"feishu_formily" as const,fieldPath:id,moduleId:root.id,groupIndex:null,edge:edge as "start"|"end"},
      domHints:{testId:`${id}:${edge}`,ariaLabel:null,placeholder:null,tagName:control.tagName,readOnly:false as const,classNames:[String(control.className),String(range.className)]},
      popupBinding:null,temporal:null,type:"custom_date_picker" as const,required,requiredSource:required?"explicit" as const:"none" as const,options:[],
      validationMessage:root.querySelector<HTMLElement>(".ud-formily-item-error-help")?.innerText?.trim()||null,
      currentValue:normalize(control.querySelector<HTMLInputElement>("input")?.value)
    };});
  });
  return [...atsx, ...throne, ...custom];
}

/** MAIN-world probe. It only reads current DOM and trusted-pointer targets. */
export function inspectFeishuMonthPeriodTargetInPage(
  targetSelector: string,
  target: "control" | "panel_state" | "year_page" | "year_toggle" | "year" | "month",
  value = "",
  stableFieldKey = "",
  expectedLabel = "",
  prepareTargetViewport = false
): FeishuMonthPeriodProbe {
  const customEndpoint = (): HTMLElement | null => {
    const match = stableFieldKey.match(/^other\.(\d+)\.(start|end)_date\.custom_date_picker$/u);
    if (!match) return null;
    const roots = [...document.querySelectorAll<HTMLElement>(".ud-formily-item[data-form-field-id]")].filter(e=>e.getAttribute("data-form-field-id")===match[1]);
    if (roots.length!==1) return null;
    const root=roots[0]!;
    const title=(root.querySelector(".ud-formily-item-label-content")?.textContent??"").replace(/[＊*]/gu,"").trim();
    if(expectedLabel!==`${title} · ${match[2]==="start"?"开始时间":"结束时间"}`)return null;
    const ranges=root.querySelectorAll(".throne-biz-date-range-picker-wrapper");
    if(ranges.length!==1)return null;
    const ends=ranges[0]!.querySelectorAll<HTMLElement>(":scope > .throne-biz-date-range-picker-input");
    return ends.length===2?ends[match[2]==="start"?0:1]??null:null;
  };

  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0" &&
      !element.closest("[hidden],[aria-hidden='true']");
  };
  const point = (
    element: HTMLElement,
    popup: HTMLElement | null = null
  ): FeishuMonthPeriodPoint | null => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    if (!(hit instanceof Element)) return null;
    const directlyRelated = hit === element || element.contains(hit);
    const containingPopupHit = Boolean(hit instanceof HTMLElement && popup && popup.contains(hit) && hit.contains(element));
    const mokaEquivalentPopupHit = Boolean(
      hit instanceof HTMLElement && popup && popup.contains(hit) && getComputedStyle(element).cursor === "pointer"
    );
    if (!directlyRelated && !containingPopupHit && !mokaEquivalentPopupHit) return null;
    return { x, y, tagName: hit.tagName, className: hit.getAttribute("class") ?? "" };
  };
  const variantFor = (element: Element | null): FeishuMonthPeriodVariant | null => {
    if (!(element instanceof HTMLElement) || !visible(element)) return null;
    if (element.matches(".atsx-date-picker-period-month-label[data-cy$='periodInputBegin'],.atsx-date-picker-period-month-label[data-cy$='periodInputEnd']") && element.closest(".atsx-date-picker-period-month")) return "atsx";
    if (element.matches(".throne-biz-date-range-picker-input") && element.closest(".throne-biz-date-range-picker-wrapper")) return "throne";
    return null;
  };
  const resolveControl = (): HTMLElement | null => {
    if (stableFieldKey.startsWith("other.")) return customEndpoint();
    let selected: Element | null = null;
    try {
      selected = document.querySelector(targetSelector);
    } catch {
      selected = null;
    }
    if (!stableFieldKey && selected instanceof HTMLElement && (
      selected.matches(".atsx-date-picker-period-month-label") ||
      selected.matches(".throne-biz-date-range-picker-input")
    )) return selected;
    const parsed = stableFieldKey.match(
      /^(education|work|internship|project)\[(\d+)\]\.(start|end)_date\.custom_date_picker$/u
    );
    if (!parsed) return null;
    const section = parsed[1]!;
    const groupIndex = Number(parsed[2]);
    const edgeIndex = parsed[3] === "start" ? 0 : 1;
    if (["education", "internship", "work", "project"].includes(section)) {
      const dataCy = `${section}[${groupIndex}].periodInput${edgeIndex === 0 ? "Begin" : "End"}`;
      const atsx = [...document.querySelectorAll<HTMLElement>(
        ".atsx-date-picker-period-month-label"
      )].filter((candidate) => candidate.getAttribute("data-cy") === dataCy);
      if (atsx.length === 1) return atsx[0]!;
    }
    const requested = String(expectedLabel || "");
    const rootIds = section === "education"
      ? ["formily-item-education_list"]
      : section === "project"
        ? ["formily-item-project_list"]
        : /实习/u.test(requested)
          ? ["formily-item-internship_list"]
          : ["formily-item-works_list", "formily-item-work_experience_list", "formily-item-work_list", "formily-item-career_list"];
    const roots = rootIds
      .map((id) => document.getElementById(id))
      .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement &&
          !!candidate.querySelector("[data-form-field-id='start_end_time'] .throne-biz-date-range-picker-wrapper"));
    if (roots.length !== 1) return null;
    const ranges = [...roots[0]!.querySelectorAll<HTMLElement>(
      "[data-form-field-id='start_end_time'] .throne-biz-date-range-picker-wrapper"
    )].filter(visible);
    const endpoints = ranges[groupIndex]?.querySelectorAll<HTMLElement>(
      ":scope > .throne-biz-date-range-picker-input"
    );
    return endpoints?.length === 2 ? endpoints[edgeIndex] ?? null : null;
  };
  const selectedControl = resolveControl();
  const variant = variantFor(selectedControl);
  const result = (
    status: FeishuMonthPeriodProbeStatus,
    targetElement: HTMLElement | null = null,
    popupCount = 0,
    targetCount = 0
  ): FeishuMonthPeriodProbe => ({
    status,
    point: targetElement ? point(targetElement) : null,
    popupCount,
    targetCount,
    variant
  });
  if (target === "control") {
    const controls = variant && selectedControl instanceof HTMLElement ? [selectedControl] : [];
    if (controls.length === 0) return result("control_missing");
    if (controls.length !== 1) return result("control_ambiguous", null, 0, controls.length);
    const controlPoint = point(controls[0]!);
    return controlPoint ? result("ready", controls[0]!, 0, 1) : result("control_not_clickable", null, 0, 1);
  }
  const popupSelector = variant === "throne"
    ? ".throne-biz-date-range-picker-panel"
    : ".atsx-date-picker-dropdown";
  const popups = [...document.querySelectorAll<HTMLElement>(popupSelector)].filter(visible);
  if (target === "panel_state" && popups.length === 0) return { ...result("ready"), panelState: "closed" };
  if (popups.length === 0) return result("popup_closed");
  if (popups.length !== 1) return result("popup_ambiguous", null, popups.length);
  if (target === "panel_state" || target === "year_page") {
    // The open marker belongs to the endpoint, not merely its range or module.
    // A global popup alone never authorizes reuse or navigation of another field.
    const owners = [...document.querySelectorAll<HTMLElement>(
      ".throne-biz-date-range-picker-input.ud__dropdown-open"
    )].filter(visible);
    if (variant !== "throne" || owners.length !== 1 || owners[0] !== selectedControl) {
      return result("popup_owner_mismatch", null, 1);
    }
    const yearCells = [...popups[0]!.querySelectorAll<HTMLElement>(".ud__picker-year-panel-cell")].filter(visible);
    const monthCells = [...popups[0]!.querySelectorAll<HTMLElement>(".ud__picker-month-panel-cell")].filter(visible);
    const years = yearCells.map(cell => Number(cell.textContent?.trim()));
    const contiguousYears = years.length === 20 && years.every((year, index) =>
      Number.isInteger(year) && year >= 1000 && year <= 9999 && (index === 0 || year === years[index - 1]! + 1));
    const yearRange: [number, number] | undefined = contiguousYears ? [years[0]!, years.at(-1)!] : undefined;
    if (target === "panel_state") {
      if (yearCells.length && !monthCells.length) return { ...result("ready", null, 1), panelState: "year", yearRange };
      if (monthCells.length === 12 && !yearCells.length) return { ...result("ready", null, 1), panelState: "month" };
      return result("target_missing", null, 1);
    }
    const requestedYear = Number(value);
    if (!yearRange || monthCells.length || !/^\d{4}$/u.test(value) ||
      requestedYear >= yearRange[0] && requestedYear <= yearRange[1]) return result("target_missing", null, 1);
    const pageDirection = requestedYear < yearRange[0] ? "previous" : "next";
    const icon = pageDirection === "previous" ? "LeftBoldOutlined" : "RightBoldOutlined";
    const buttons = [...popups[0]!.querySelectorAll<HTMLButtonElement>(
      ".ud__picker-panel-header button.ud__picker-panel-header-icon"
    )].filter(visible).filter(button => button.querySelector(`[data-icon="${icon}"]`));
    if (buttons.length !== 1) return result(buttons.length ? "target_ambiguous" : "target_missing", null, 1, buttons.length);
    const button = buttons[0]!;
    const targetPoint = !button.matches(":disabled,[aria-disabled='true']") ? point(button) : null;
    return { ...result(targetPoint ? "ready" : "target_not_clickable", null, 1, 1),
      point: targetPoint, panelState: "year", yearRange, pageDirection };
  }
  const candidates = variant === "throne"
    ? target === "year_toggle"
      ? [...popups[0]!.querySelectorAll<HTMLElement>(".ud__picker-panel-header-btn")].filter(visible)
      : [...popups[0]!.querySelectorAll<HTMLElement>(
          target === "year"
            ? ".ud__picker-year-panel-cell .ud__picker__cell-interactive-area"
            : ".ud__picker__cell-interactive-area"
        )].filter(visible).filter((candidate) => {
          const text = String(candidate.innerText || candidate.textContent || "").trim();
          if (target !== "month") return text === value;
          const month = text.match(/^(\d{1,2})月$/u);
          return Boolean(month && Number(month[1]) === Number(value));
        })
    : target === "year_toggle"
      ? []
      : [...popups[0]!.querySelectorAll<HTMLElement>(".atsx-date-picker-period-month-panel-list-item")]
        .filter(visible).filter((candidate) => candidate.getAttribute("data-cy") === value);
  if (candidates.length === 0) return result("target_missing", null, 1, 0);
  if (candidates.length !== 1) return result("target_ambiguous", null, 1, candidates.length);
  // ATSX renders its whole year list in a scroll container. An exact year can
  // exist in the DOM while being clipped below the panel, so the trusted
  // pointer has no hittable target. This is only viewport preparation for the
  // already uniquely identified option: it never clicks, focuses, writes or
  // changes the form value.
  if (prepareTargetViewport) {
    candidates[0]!.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }
  const targetPoint = point(candidates[0]!, popups[0]!);
  return targetPoint
    ? { status: "ready", point: targetPoint, popupCount: 1, targetCount: 1, variant }
    : result("target_not_clickable", null, 1, 1);
}

/** MAIN-world one-shot viewport preparation and stable semantic rebind. */
export function prepareFeishuMonthPeriodControlInPage(
  targetSelector: string,
  stableFieldKey: string,
  expectedLabel: string
): FeishuMonthPeriodPreparation {
  const customEndpoint = (): HTMLElement | null => {
    const match = stableFieldKey.match(/^other\.(\d+)\.(start|end)_date\.custom_date_picker$/u);
    if (!match) return null;
    const roots = [...document.querySelectorAll<HTMLElement>(".ud-formily-item[data-form-field-id]")].filter(e=>e.getAttribute("data-form-field-id")===match[1]);
    if (roots.length!==1) return null;
    const root=roots[0]!;
    const title=(root.querySelector(".ud-formily-item-label-content")?.textContent??"").replace(/[＊*]/gu,"").trim();
    if(expectedLabel!==`${title} · ${match[2]==="start"?"开始时间":"结束时间"}`)return null;
    const ranges=root.querySelectorAll(".throne-biz-date-range-picker-wrapper");
    if(ranges.length!==1)return null;
    const ends=ranges[0]!.querySelectorAll<HTMLElement>(":scope > .throne-biz-date-range-picker-input");
    return ends.length===2?ends[match[2]==="start"?0:1]??null:null;
  };

  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0" &&
      !element.closest("[hidden],[aria-hidden='true']");
  };
  let selected: Element | null = null;
  try {
    selected = document.querySelector(targetSelector);
  } catch {
    selected = null;
  }
  const liveSelected = !stableFieldKey && selected instanceof HTMLElement && (
    selected.matches(".atsx-date-picker-period-month-label") ||
    selected.matches(".throne-biz-date-range-picker-input")
  ) ? selected : null;
  let control = stableFieldKey.startsWith("other.") ? customEndpoint() : liveSelected;
  if (!control) {
    const parsed = stableFieldKey.match(
      /^(education|work|internship|project)\[(\d+)\]\.(start|end)_date\.custom_date_picker$/u
    );
    if (!parsed) return { status: "control_missing", scrollCount: 0, reboundByStableIdentity: false };
    const section = parsed[1]!;
    const groupIndex = Number(parsed[2]);
    const edgeIndex = parsed[3] === "start" ? 0 : 1;
    if (["education", "internship", "work", "project"].includes(section)) {
      const dataCy = `${section}[${groupIndex}].periodInput${edgeIndex === 0 ? "Begin" : "End"}`;
      const atsx = [...document.querySelectorAll<HTMLElement>(
        ".atsx-date-picker-period-month-label"
      )].filter((candidate) => candidate.getAttribute("data-cy") === dataCy);
      if (atsx.length > 1) return { status: "control_ambiguous", scrollCount: 0, reboundByStableIdentity: true };
      control = atsx[0] ?? null;
    }
    if (!control) {
      const rootIds = section === "education"
        ? ["formily-item-education_list"]
        : section === "project"
          ? ["formily-item-project_list"]
          : /实习/u.test(expectedLabel)
            ? ["formily-item-internship_list"]
            : ["formily-item-works_list", "formily-item-work_experience_list", "formily-item-work_list", "formily-item-career_list"];
      const roots = rootIds
        .map((id) => document.getElementById(id))
        .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement &&
          !!candidate.querySelector("[data-form-field-id='start_end_time'] .throne-biz-date-range-picker-wrapper"));
      if (roots.length > 1) return { status: "control_ambiguous", scrollCount: 0, reboundByStableIdentity: true };
      const ranges = roots.length === 1 ? [...roots[0]!.querySelectorAll<HTMLElement>(
        "[data-form-field-id='start_end_time'] .throne-biz-date-range-picker-wrapper"
      )].filter(visible) : [];
      const endpoints = ranges[groupIndex]?.querySelectorAll<HTMLElement>(
        ":scope > .throne-biz-date-range-picker-input"
      );
      control = endpoints?.length === 2 ? endpoints[edgeIndex] ?? null : null;
    }
  }
  if (!control || !visible(control)) {
    return { status: "control_missing", scrollCount: 0, reboundByStableIdentity: !liveSelected };
  }
  control.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (!/(?:auto|scroll|overlay)/u.test(style.overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
    const rect = control.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    parent.scrollTop += rect.top - (parentRect.top + parent.clientHeight / 2);
  }
  const rect = control.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    window.scrollBy({ top: rect.top - window.innerHeight / 2, behavior: "auto" });
  }
  void control.getBoundingClientRect();
  return { status: "ready", scrollCount: 1, reboundByStableIdentity: !liveSelected };
}

/** MAIN-world authoritative readback after the two trusted pointer selections. */
export function readFeishuMonthPeriodInPage(
  targetSelector: string,
  stableFieldKey = "",
  expectedLabel = ""
): FeishuMonthPeriodReadback {
  const customEndpoint = (): HTMLElement | null => {
    const match = stableFieldKey.match(/^other\.(\d+)\.(start|end)_date\.custom_date_picker$/u);
    if (!match) return null;
    const roots = [...document.querySelectorAll<HTMLElement>(".ud-formily-item[data-form-field-id]")].filter(e=>e.getAttribute("data-form-field-id")===match[1]);
    if (roots.length!==1) return null;
    const root=roots[0]!;
    const title=(root.querySelector(".ud-formily-item-label-content")?.textContent??"").replace(/[＊*]/gu,"").trim();
    if(expectedLabel!==`${title} · ${match[2]==="start"?"开始时间":"结束时间"}`)return null;
    const ranges=root.querySelectorAll(".throne-biz-date-range-picker-wrapper");
    if(ranges.length!==1)return null;
    const ends=ranges[0]!.querySelectorAll<HTMLElement>(":scope > .throne-biz-date-range-picker-input");
    return ends.length===2?ends[match[2]==="start"?0:1]??null:null;
  };

  const normalize = (value: unknown): string => {
    const match = String(value ?? "").match(/((?:19|20)\d{2})\s*[-/.年]\s*(\d{1,2})/u);
    return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : "";
  };
  let control: HTMLElement | null = customEndpoint();
  try {
    const selected = document.querySelector<HTMLElement>(targetSelector);
    if (!stableFieldKey && selected?.matches(".atsx-date-picker-period-month-label,.throne-biz-date-range-picker-input")) {
      control = selected;
    }
  } catch {
    control = null;
  }
  if (!control) {
    const parsed = stableFieldKey.match(
      /^(education|work|internship|project)\[(\d+)\]\.(start|end)_date\.custom_date_picker$/u
    );
    if (parsed) {
      const section = parsed[1]!;
      const groupIndex = Number(parsed[2]);
      const edgeIndex = parsed[3] === "start" ? 0 : 1;
      if (["education", "internship", "work", "project"].includes(section)) {
        const dataCy = `${section}[${groupIndex}].periodInput${edgeIndex === 0 ? "Begin" : "End"}`;
        const atsx = [...document.querySelectorAll<HTMLElement>(
          ".atsx-date-picker-period-month-label"
        )].filter((candidate) => candidate.getAttribute("data-cy") === dataCy);
        if (atsx.length === 1) control = atsx[0]!;
      }
      if (!control) {
        const rootIds = section === "education"
          ? ["formily-item-education_list"]
          : section === "project"
            ? ["formily-item-project_list"]
            : /实习/u.test(expectedLabel)
              ? ["formily-item-internship_list"]
              : ["formily-item-works_list", "formily-item-work_experience_list", "formily-item-work_list", "formily-item-career_list"];
        const roots = rootIds
          .map((id) => document.getElementById(id))
          .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement &&
          !!candidate.querySelector("[data-form-field-id='start_end_time'] .throne-biz-date-range-picker-wrapper"));
        const ranges = roots.length === 1 ? [...roots[0]!.querySelectorAll<HTMLElement>(
          "[data-form-field-id='start_end_time'] .throne-biz-date-range-picker-wrapper"
        )] : [];
        const endpoints = ranges[groupIndex]?.querySelectorAll<HTMLElement>(
          ":scope > .throne-biz-date-range-picker-input"
        );
        control = endpoints?.length === 2 ? endpoints[edgeIndex] ?? null : null;
      }
    }
  }
  const variant: FeishuMonthPeriodVariant | null = control?.matches(".throne-biz-date-range-picker-input")
    ? "throne"
    : control?.matches(".atsx-date-picker-period-month-label") ? "atsx" : null;
  const formItem = control?.closest<HTMLElement>(
    variant === "throne" ? ".ud-formily-item,[data-form-field-id='start_end_time']" : ".atsx-form-item"
  );
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const rangeControls = variant === "throne"
    ? [...(control?.closest(".throne-biz-date-range-picker-wrapper")?.querySelectorAll<HTMLInputElement>(
        ".throne-biz-date-range-picker-input input"
      ) ?? [])]
    : [];
  const rangeComplete = variant === "throne"
    ? rangeControls.length === 2 && rangeControls.every((input) => normalize(input.value))
    : true;
  const validationText = variant === "throne"
    ? String(formItem?.innerText || "")
    : [...(formItem?.querySelectorAll<HTMLElement>(".atsx-form-item-error,.atsx-form-item-explain-error,.atsx-form-explain,[role='alert']") ?? [])].filter(visible).map((element) => element.innerText).join(" ");
  const actualSource = variant === "throne"
    ? (control?.querySelector("input") as HTMLInputElement | null)?.value
    : control?.innerText;
  return {
    actual: normalize(actualSource),
    validationCleared: !/(?:请填写完整时间|必填|请选择)/u.test(validationText),
    popupClosed: ![...document.querySelectorAll<HTMLElement>(
      ".atsx-date-picker-dropdown,.throne-biz-date-range-picker-panel"
    )].some(visible),
    rangeComplete,
    variant
  };
}

export async function executeFeishuMonthPeriodDriver(input: FeishuMonthPeriodDriverInput): Promise<FeishuMonthPeriodDriverResult> {
  const expected = `${input.dateValue.year}-${String(input.dateValue.month).padStart(2, "0")}`;
  const ledger = { control: 0, yearToggle: 0, yearPage: 0, year: 0, month: 0, reusedOpenPanel: false };
  const probe = async (
    target: "control" | "panel_state" | "year_page" | "year_toggle" | "year" | "month",
    value = "",
    prepareTargetViewport = false
  ) => {
    const execution = await executeInterruptibleScript({ target: { tabId: input.tabId }, world: "MAIN", func: inspectFeishuMonthPeriodTargetInPage, args: [input.selector, target, value, input.stableFieldKey, input.label, prepareTargetViewport] });
    return execution[0]?.result as FeishuMonthPeriodProbe | undefined;
  };
  const readback = async () => {
    const execution = await executeInterruptibleScript({ target: { tabId: input.tabId }, world: "MAIN", func: readFeishuMonthPeriodInPage, args: [input.selector, input.stableFieldKey, input.label] });
    return execution[0]?.result as FeishuMonthPeriodReadback | undefined;
  };
  let scrollCount = 0;
  let reboundByStableIdentity = false;
  const failure = async (stage: FeishuMonthPeriodStage, detail: string, state?: FeishuMonthPeriodReadback): Promise<FeishuMonthPeriodDriverResult> => {
    const current = state ?? await readback();
    return { success: false, stage, actual: current?.actual ?? "", validationCleared: current?.validationCleared ?? false, popupClosed: current?.popupClosed ?? true, rangeComplete: current?.rangeComplete ?? false, variant: current?.variant ?? null, scrollCount, reboundByStableIdentity, ledger, error: `${FEISHU_MONTH_PERIOD_INTERACTION_FAILED}:${stage}:${detail}` };
  };
  const waitForTarget = async (
    target: "year_toggle" | "year" | "month",
    value = ""
  ): Promise<FeishuMonthPeriodProbe | undefined> => {
    let current: FeishuMonthPeriodProbe | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      current = await probe(target, value, target !== "year_toggle" && attempt === 0);
      if (current?.status === "ready") return current;
      if (current?.status === "popup_ambiguous" || current?.status === "target_ambiguous") return current;
      if (attempt < 9) await input.wait(90);
    }
    return current;
  };
  const preparationExecution = await executeInterruptibleScript({
    target: { tabId: input.tabId },
    world: "MAIN",
    func: prepareFeishuMonthPeriodControlInPage,
    args: [input.selector, input.stableFieldKey, input.label]
  });
  const preparation = preparationExecution[0]?.result as FeishuMonthPeriodPreparation | undefined;
  scrollCount = preparation?.scrollCount ?? 0;
  reboundByStableIdentity = preparation?.reboundByStableIdentity ?? false;
  if (preparation?.status !== "ready") return failure("prepare", preparation?.status ?? "prepare_failed");
  await input.wait(160);
  const initial = await readback();
  if (initial?.actual === expected && initial.popupClosed && (initial.validationCleared || !initial.rangeComplete)) return { success: true, stage: "readback", error: null, scrollCount, reboundByStableIdentity, ledger, ...initial };
  const control = await probe("control");
  if (control?.status !== "ready" || !control.point) return failure("detect", control?.status ?? "probe_failed", initial);
  const panel = control.variant === "throne" ? await probe("panel_state") : undefined;
  if (panel && panel.status !== "ready") return failure("open", panel.status);
  ledger.reusedOpenPanel = panel?.panelState === "year" || panel?.panelState === "month";
  if (!ledger.reusedOpenPanel) {
    ledger.control += 1;
    await input.clickPoint(control.point);
    await input.wait(180);
  }
  if (control.variant === "throne" && panel?.panelState !== "year") {
    const yearToggle = await waitForTarget("year_toggle");
    if (yearToggle?.status !== "ready" || !yearToggle.point) return failure("year_toggle", yearToggle?.status ?? "probe_failed");
    ledger.yearToggle += 1;
    await input.clickPoint(yearToggle.point);
    await input.wait(140);
  }
  let year = await waitForTarget("year", String(input.dateValue.year));
  // The evidenced throne year grid has twenty contiguous years per page.
  // Navigation is progress toward one requested year, never a retry of a field.
  while (control.variant === "throne" && year?.status === "target_missing" && ledger.yearPage < 6) {
    const navigation = await probe("year_page", String(input.dateValue.year));
    if (navigation?.status !== "ready" || !navigation.point || !navigation.yearRange) {
      return failure("year", navigation?.status ?? "probe_failed");
    }
    const before = navigation.yearRange;
    ledger.yearPage += 1;
    await input.clickPoint(navigation.point);
    let after: FeishuMonthPeriodProbe | undefined;
    for (let poll = 0; poll < 10; poll += 1) {
      await input.wait(90);
      after = await probe("panel_state");
      if (after?.status === "popup_owner_mismatch" || after?.status === "popup_ambiguous") {
        return failure("year", after.status);
      }
      // An animated year grid may be temporarily absent. Wait without another
      // navigation click, then require a complete, newly observed year page.
      if (after.yearRange && after.yearRange.join(":") !== before.join(":")) break;
    }
    const next = after?.yearRange;
    const distance = (range: [number, number]) => Math.max(range[0] - input.dateValue.year, input.dateValue.year - range[1], 0);
    if (!next || after?.panelState !== "year" || distance(next) >= distance(before) ||
      next[0] !== before[0] + (navigation.pageDirection === "previous" ? -20 : 20)) {
      return failure("year", "year_page_no_progress");
    }
    year = await waitForTarget("year", String(input.dateValue.year));
  }
  if (year?.status !== "ready" || !year.point) return failure("year", year?.status ?? "probe_failed");
  ledger.year += 1;
  await input.clickPoint(year.point);
  await input.wait(180);
  const month = await waitForTarget("month", String(input.dateValue.month).padStart(2, "0"));
  if (month?.status !== "ready" || !month.point) return failure("month", month?.status ?? "probe_failed");
  ledger.month += 1;
  await input.clickPoint(month.point);
  await input.wait(260);
  let final = await readback();
  for (let attempt = 0; attempt < 8 && !(
    final?.actual === expected && final.popupClosed && (final.validationCleared || !final.rangeComplete)
  ); attempt += 1) {
    await input.wait(120);
    final = await readback();
  }
  if (!final || final.actual !== expected) return failure("readback", "value_mismatch", final);
  if (!final.popupClosed) return failure("readback", "popup_not_closed", final);
  if (final.rangeComplete && !final.validationCleared) return failure("readback", "validation_not_cleared", final);
  return { success: true, stage: "readback", error: null, scrollCount, reboundByStableIdentity, ledger, ...final };
}
