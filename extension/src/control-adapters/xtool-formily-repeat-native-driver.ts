import { executeInterruptibleScript } from "../auto-apply-interruption.js";
const XTOOL_FORMILY_REPEAT_NATIVE_INTERACTION_FAILED =
  "xtool_formily_repeat_native_control_interaction_failed";

export type XToolFormilyRepeatNativeStage = "detect" | "write" | "readback";

export interface XToolFormilyRepeatNativeInspection {
  status: "ready" | "target_missing" | "target_ambiguous" | "target_not_editable";
  targetCount: number;
  tagName: string;
  type: string;
  readOnly: boolean;
  placeholder: string;
  classNames: string[];
  actual: string;
  validationCleared: boolean;
}

export interface XToolFormilyRepeatNativeDriverResult
  extends XToolFormilyRepeatNativeInspection {
  success: boolean;
  stage: XToolFormilyRepeatNativeStage;
  error: string | null;
  writeCount: number;
}

export interface XToolFormilyRepeatNativeDriverInput {
  tabId: number;
  selector: string;
  stableFieldKey: string;
  label: string;
  value: string;
}

export function isXToolFormilyApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "xtool.jobs.feishu.cn" &&
      /^\/(?:index|campus|\d+)\/resume\/\d+\/apply\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function isXToolFormilyRepeatNativeField(input: {
  stableFieldKey?: string | null;
  label?: string | null;
  type?: string | null;
  controlKind?: string | null;
  dataFieldName?: string | null;
}): boolean {
  const control = `${input.type ?? ""} ${input.controlKind ?? ""}`;
  if (!/(?:^|\s)(?:text|textarea|native)(?:$|\s)/iu.test(control)) return false;
  const identity = `${input.stableFieldKey ?? ""} ${input.label ?? ""} ${input.dataFieldName ?? ""}`;
  return /(?:education|work|project)\[\d+\]\.(?:school|degree|major|company|title|project_name|role|description|skills|link)\.(?:native|textarea)/iu
    .test(identity);
}

/**
 * MAIN-world resolver for xTool's Formily array cards. The site duplicates
 * element ids and rebuilds every card after array mutations, so an observation
 * selector is never authoritative. The live target is resolved from the
 * section root, repeat index and semantic slot on every call.
 */
export function inspectXToolFormilyRepeatNativeInPage(
  targetSelector: string,
  stableFieldKey: string,
  expectedLabel: string
): XToolFormilyRepeatNativeInspection {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/gu, " ").trim();
  const parsed = stableFieldKey.match(
    /^(education|work|project)\[(\d+)\]\.(school|degree|major|company|title|project_name|role|description|skills|link)\.(native|textarea)$/u
  );
  const empty = (
    status: XToolFormilyRepeatNativeInspection["status"],
    targetCount = 0
  ): XToolFormilyRepeatNativeInspection => ({
    status,
    targetCount,
    tagName: "",
    type: "",
    readOnly: false,
    placeholder: "",
    classNames: [],
    actual: "",
    validationCleared: false
  });
  if (!parsed) return empty("target_missing");
  const section = parsed[1]!;
  const groupIndex = Number(parsed[2]);
  const slot = parsed[3]!;
  const requestedSection = normalize(expectedLabel);
  const rootIds = section === "education"
    ? ["formily-item-education_list"]
    : section === "project"
      ? ["formily-item-project_list"]
      : /实习/u.test(requestedSection)
        ? ["formily-item-internship_list"]
        : ["formily-item-works_list", "formily-item-work_experience_list", "formily-item-work_list"];
  const roots = rootIds
    .map((id) => document.getElementById(id))
    .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement);
  if (roots.length !== 1) return empty(roots.length > 1 ? "target_ambiguous" : "target_missing", roots.length);

  const semanticSlot = (element: HTMLInputElement | HTMLTextAreaElement): string => {
    const field = element.closest<HTMLElement>("[data-form-field-name],[data-form-field-id]");
    const identity = normalize([
      element.getAttribute("data-form-field-i18n-name"),
      field?.getAttribute("data-form-field-i18n-name"),
      element.getAttribute("data-form-field-name"),
      field?.getAttribute("data-form-field-name"),
      element.getAttribute("data-form-field-id"),
      field?.getAttribute("data-form-field-id")
    ].filter(Boolean).join(" ")).toLowerCase();
    if (/项目名称|project.?name|(?:^|\s)name(?:$|\s)/iu.test(identity)) return "project_name";
    if (/项目角色|角色|role/iu.test(identity)) return "role";
    if (/描述|职责|工作内容|description|responsibilit|(?:^|\s)desc(?:$|\s)/iu.test(identity)) return "description";
    if (/学校|院校|school/iu.test(identity)) return "school";
    if (/学历|学位|degree/iu.test(identity)) return "degree";
    if (/专业|major/iu.test(identity)) return "major";
    if (/公司|单位|company/iu.test(identity)) return "company";
    if (/岗位|职位|职务|position|title/iu.test(identity)) return "title";
    if (/技能|skill/iu.test(identity)) return "skills";
    if (/项目链接|链接|project.?url|link|url/iu.test(identity)) return "link";
    return "";
  };
  const all = roots[0]!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input:not([type='hidden']),textarea"
  );
  const candidates = [...all].filter((candidate) => semanticSlot(candidate) === slot);
  const target = candidates[groupIndex] ?? null;
  if (!target) return empty("target_missing", candidates.length);
  if (candidates.length <= groupIndex) return empty("target_missing", candidates.length);
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return empty("target_missing", candidates.length);
  }
  const selected = (() => {
    try {
      return targetSelector ? document.querySelector(targetSelector) : null;
    } catch {
      return null;
    }
  })();
  const field = target.closest<HTMLElement>("[data-form-field-name],[data-form-field-id]");
  const validationText = normalize(field?.innerText);
  const validationCleared = target.getAttribute("aria-invalid") !== "true" &&
    !/(?:为|是)?必填(?:项)?|不能为空|请填写|格式错误|无效/u.test(validationText);
  const classNames = [
    String(target.className || ""),
    String(field?.className || ""),
    roots[0]!.id,
    `data-form-field-name:${target.getAttribute("data-form-field-name") || field?.getAttribute("data-form-field-name") || ""}`,
    `data-form-field-i18n-name:${target.getAttribute("data-form-field-i18n-name") || field?.getAttribute("data-form-field-i18n-name") || ""}`,
    selected === target ? "observation-selector-live" : "stable-identity-rebound"
  ];
  if (target.disabled || target.readOnly) {
    return {
      ...empty("target_not_editable", candidates.length),
      tagName: target.tagName,
      type: target instanceof HTMLTextAreaElement ? "textarea" : target.type || "text",
      readOnly: target.readOnly,
      placeholder: target.placeholder,
      classNames,
      actual: normalize(target.value),
      validationCleared
    };
  }
  return {
    status: "ready",
    targetCount: candidates.length,
    tagName: target.tagName,
    type: target instanceof HTMLTextAreaElement ? "textarea" : target.type || "text",
    readOnly: target.readOnly,
    placeholder: target.placeholder,
    classNames,
    actual: normalize(target.value),
    validationCleared
  };
}

/** MAIN-world single-write transaction with authoritative live rebind readback. */
export async function executeXToolFormilyRepeatNativeInPage(
  targetSelector: string,
  stableFieldKey: string,
  expectedLabel: string,
  expectedValue: string
): Promise<XToolFormilyRepeatNativeDriverResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/gu, " ").trim();
  const parsed = stableFieldKey.match(
    /^(education|work|project)\[(\d+)\]\.(school|degree|major|company|title|project_name|role|description|skills|link)\.(native|textarea)$/u
  );
  const section = parsed?.[1] ?? "";
  const groupIndex = Number(parsed?.[2] ?? -1);
  const slot = parsed?.[3] ?? "";
  const rootIds = section === "education"
    ? ["formily-item-education_list"]
    : section === "project"
      ? ["formily-item-project_list"]
      : /实习/u.test(expectedLabel)
        ? ["formily-item-internship_list"]
        : ["formily-item-works_list", "formily-item-work_experience_list", "formily-item-work_list"];
  const semanticSlot = (element: HTMLInputElement | HTMLTextAreaElement): string => {
    const field = element.closest<HTMLElement>("[data-form-field-name],[data-form-field-id]");
    const identity = normalize([
      element.getAttribute("data-form-field-i18n-name"),
      field?.getAttribute("data-form-field-i18n-name"),
      element.getAttribute("data-form-field-name"),
      field?.getAttribute("data-form-field-name"),
      element.getAttribute("data-form-field-id"),
      field?.getAttribute("data-form-field-id")
    ].filter(Boolean).join(" ")).toLowerCase();
    if (/项目名称|project.?name|(?:^|\s)name(?:$|\s)/iu.test(identity)) return "project_name";
    if (/项目角色|角色|role/iu.test(identity)) return "role";
    if (/描述|职责|工作内容|description|responsibilit|(?:^|\s)desc(?:$|\s)/iu.test(identity)) return "description";
    if (/学校|院校|school/iu.test(identity)) return "school";
    if (/学历|学位|degree/iu.test(identity)) return "degree";
    if (/专业|major/iu.test(identity)) return "major";
    if (/公司|单位|company/iu.test(identity)) return "company";
    if (/岗位|职位|职务|position|title/iu.test(identity)) return "title";
    if (/技能|skill/iu.test(identity)) return "skills";
    if (/项目链接|链接|project.?url|link|url/iu.test(identity)) return "link";
    return "";
  };
  const roots = () => rootIds
    .map((id) => document.getElementById(id))
    .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement);
  const resolve = (): {
    target: HTMLInputElement | HTMLTextAreaElement | null;
    targetCount: number;
    root: HTMLElement | null;
  } => {
    const liveRoots = roots();
    if (liveRoots.length !== 1) return { target: null, targetCount: liveRoots.length, root: null };
    const candidates = [...liveRoots[0]!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([type='hidden']),textarea"
    )].filter((candidate) => semanticSlot(candidate) === slot);
    return { target: candidates[groupIndex] ?? null, targetCount: candidates.length, root: liveRoots[0]! };
  };
  const inspect = (): XToolFormilyRepeatNativeInspection => {
    const resolved = resolve();
    const target = resolved.target;
    if (!target) return {
      status: resolved.targetCount > 1 && groupIndex < 0 ? "target_ambiguous" : "target_missing",
      targetCount: resolved.targetCount,
      tagName: "",
      type: "",
      readOnly: false,
      placeholder: "",
      classNames: [],
      actual: "",
      validationCleared: false
    };
    let selected: Element | null = null;
    try {
      selected = targetSelector ? document.querySelector(targetSelector) : null;
    } catch {
      selected = null;
    }
    const field = target.closest<HTMLElement>("[data-form-field-name],[data-form-field-id]");
    const validationText = normalize(field?.innerText);
    const state: XToolFormilyRepeatNativeInspection = {
      status: target.disabled || target.readOnly ? "target_not_editable" : "ready",
      targetCount: resolved.targetCount,
      tagName: target.tagName,
      type: target instanceof HTMLTextAreaElement ? "textarea" : target.type || "text",
      readOnly: target.readOnly,
      placeholder: target.placeholder,
      classNames: [
        String(target.className || ""),
        String(field?.className || ""),
        resolved.root?.id ?? "",
        `data-form-field-name:${target.getAttribute("data-form-field-name") || field?.getAttribute("data-form-field-name") || ""}`,
        `data-form-field-i18n-name:${target.getAttribute("data-form-field-i18n-name") || field?.getAttribute("data-form-field-i18n-name") || ""}`,
        selected === target ? "observation-selector-live" : "stable-identity-rebound"
      ],
      actual: normalize(target.value),
      validationCleared: target.getAttribute("aria-invalid") !== "true" &&
        !/(?:为|是)?必填(?:项)?|不能为空|请填写|格式错误|无效/u.test(validationText)
    };
    return state;
  };
  const before = inspect();
  const fail = (
    stage: XToolFormilyRepeatNativeStage,
    detail: string,
    state: XToolFormilyRepeatNativeInspection = before,
    writeCount = 0
  ): XToolFormilyRepeatNativeDriverResult => ({
    ...state,
    success: false,
    stage,
    writeCount,
    error: `${XTOOL_FORMILY_REPEAT_NATIVE_INTERACTION_FAILED}:${stage}:${detail}`
  });
  if (before.status !== "ready") return fail("detect", before.status);
  if (before.actual === expectedValue && before.validationCleared) {
    return { ...before, success: true, stage: "readback", writeCount: 0, error: null };
  }

  if (!parsed) return fail("detect", "stable_identity_invalid");
  const target = resolve().target;
  if (!target) return fail("detect", "target_missing_after_rebind", before);
  if (target.disabled || target.readOnly) return fail("write", "target_not_editable", before);
  target.focus({ preventScroll: true });
  const oldValue = target.value;
  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return fail("write", "native_setter_missing", before);
  setter.call(target, expectedValue);
  const tracked = target as typeof target & { _valueTracker?: { setValue(value: string): void } };
  tracked._valueTracker?.setValue(oldValue);
  target.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    composed: true,
    inputType: "insertText",
    data: expectedValue
  }));
  const committedTarget = target.isConnected ? target : resolve().target;
  committedTarget?.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  committedTarget?.blur();
  await new Promise((resolve) => setTimeout(resolve, 180));
  let after = inspect();
  for (let attempt = 0; attempt < 5 && after.actual !== expectedValue; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    after = inspect();
  }
  if (after.status !== "ready") return fail("readback", after.status, after, 1);
  if (after.actual !== expectedValue) return fail("readback", "value_mismatch", after, 1);
  if (!after.validationCleared) return fail("readback", "validation_not_cleared", after, 1);
  return { ...after, success: true, stage: "readback", writeCount: 1, error: null };
}

export async function executeXToolFormilyRepeatNativeDriver(
  input: XToolFormilyRepeatNativeDriverInput
): Promise<XToolFormilyRepeatNativeDriverResult> {
  const execution = await executeInterruptibleScript({
    target: { tabId: input.tabId },
    world: "MAIN",
    func: executeXToolFormilyRepeatNativeInPage,
    args: [input.selector, input.stableFieldKey, input.label, input.value]
  });
  return execution[0]?.result as XToolFormilyRepeatNativeDriverResult;
}
