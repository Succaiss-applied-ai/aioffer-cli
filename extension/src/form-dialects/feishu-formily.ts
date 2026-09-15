import type { PageFieldObservation } from "../page-adapter.js";

export interface FeishuFormilyFieldPatch {
  selector: string;
  label: string;
  sectionKey: string;
  groupIndex: number | null;
  labelPath: string[];
  semanticSlot: string;
  required: boolean;
  validationMessage: string | null;
  /** Exact committed display value for a Feishu Formily Select; null for other controls. */
  selectedValue: string | null;
  dataFieldId: string | null;
  dataFieldName: string | null;
  fieldSource?: PageFieldObservation["fieldSource"];
  radioGroup?: { ownerSelector: string; options: string[]; selectedValue: string };
}

export function isFeishuFormilyApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(?:^|\.)jobs\.feishu\.cn$/iu.test(url.hostname) &&
      /^\/[a-zA-Z0-9_-]+\/resume\/\d+\/apply\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Read-only Feishu/Formily field dialect. This function is serialized into the
 * application page, so every helper must remain inside it.
 *
 * It translates Formily's field root, label, repeat identity and owned error
 * slot into patches for the shared PageFieldObservation model. It does not
 * choose or execute a control Driver.
 */
export function observeFeishuFormilyFieldPatchesInPage(): FeishuFormilyFieldPatch[] {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/gu, " ").trim();
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !element.isConnected ||
      element.closest("[hidden],[aria-hidden='true']")) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
      style.visibility === "hidden" || style.opacity === "0") return false;
    for (let node = element.parentElement; node; node = node.parentElement) {
      const ancestorStyle = getComputedStyle(node);
      if (ancestorStyle.display === "none" || ancestorStyle.visibility === "hidden" ||
        ancestorStyle.opacity === "0") return false;
    }
    return true;
  };
  const selectorFor = (element: Element) => {
    const html = element as HTMLElement;
    if (html.id && document.querySelectorAll(`#${CSS.escape(html.id)}`).length === 1) return `#${CSS.escape(html.id)}`;
    const testId = html.getAttribute("data-testid");
    if (testId && document.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`).length === 1) return `[data-testid="${CSS.escape(testId)}"]`;
    const segmentFor = (current: Element) => {
      let segment = current.tagName.toLowerCase();
      for (const name of ["name", "data-form-field-name", "role", "type"] as const) {
        const value = current.getAttribute(name);
        if (value && (name !== "type" || current.tagName === "INPUT")) segment += `[${name}="${CSS.escape(value)}"]`;
      }
      const parent = current.parentElement;
      if (parent) {
        const peers = [...parent.children].filter((entry) => entry.tagName === current.tagName);
        if (peers.length > 1) segment += `:nth-of-type(${peers.indexOf(current) + 1})`;
      }
      return segment;
    };
    const segments: string[] = [];
    let current: Element | null = element;
    // Keep this generator byte-for-byte compatible with the shared observer;
    // patches join by selector, including controls deeper than 16 ancestors.
    while (current && current !== document.body) {
      segments.unshift(segmentFor(current));
      const selector = segments.join(" > ");
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {
        // Continue to a wider stable ancestor.
      }
      current = current.parentElement;
    }
    return `${current === document.body ? "body > " : ""}${segments.join(" > ")}`;
  };
  const directFormilyRoot = (control: Element) => control.closest<HTMLElement>(".ud-formily-item");
  const sectionSpecs = [
    { ids: ["formily-item-education_list"], key: "education", title: "教育经历" },
    { ids: ["formily-item-works_list", "formily-item-work_experience_list", "formily-item-work_list", "formily-item-career_list"], key: "work", title: "工作经历" },
    { ids: ["formily-item-internship_list"], key: "work", title: "实习经历" },
    { ids: ["formily-item-project_list"], key: "project", title: "项目经历" },
    { ids: ["formily-item-language_list"], key: "language", title: "语言能力" },
    { ids: ["formily-item-award_list"], key: "award", title: "获奖" },
    { ids: ["formily-item-relation-list", "formily-item-relation_list"], key: "relation", title: "与公司员工是否有亲属关系（如有）" }
  ];
  const sectionFor = (root: HTMLElement, label: string) => {
    let module: HTMLElement | null = root;
    while (module && ![...module.classList].some(value => /^applyFormModuleWrapper(?:__|$)/u.test(value))) module = module.parentElement;
    const title = normalize(module?.querySelector<HTMLElement>("[class*='applyFormModuleWrapper-title'] [class*='applyFormModuleWrapper-text']")?.innerText);
    if (module && /^与公司员工是否有亲属关系(?:[（(]如有[）)])?$/u.test(title)) {
      const groups = [...module.querySelectorAll<HTMLElement>(".ud-formily-item[id]")]
        .filter(candidate => candidate.contains(root) && candidate !== root);
      return { spec: { ids: [], key: "relation", title }, root: groups[0] ?? null };
    }
    for (const spec of sectionSpecs) {
      let node: Element | null = root;
      while (node) {
        if (spec.ids.includes(node.id)) {
          if (node.id === "formily-item-works_list" && title === "作品" &&
            node.querySelector("[data-form-field-name='link'],[data-form-field-id='link']") &&
            node.querySelector("input[type='file']")) {
            return { spec: { ids: [node.id], key: "portfolio", title }, root: node as HTMLElement };
          }
          return { spec, root: node as HTMLElement };
        }
        node = node.parentElement;
      }
    }
    if (/紧急联系人|应急联系人|外部推荐人|推荐人|内推人|介绍人|emergency\s*contact/iu.test(label)) {
      return { spec: { ids: [], key: "third_party", title: "第三方联系人" }, root: null };
    }
    if (/与本人关系|部门\/职位|亲属关系|员工姓名|亲属姓名|关系人姓名/iu.test(label)) {
      return { spec: { ids: [], key: "relation", title: "与公司员工是否有亲属关系（如有）" }, root: null };
    }
    if (/简历|附件|证件照|照片|头像|resume|attachment|photo/iu.test(label)) {
      return { spec: { ids: [], key: "attachments", title: "简历" }, root: null };
    }
    if (/学校|院校|学历|学位|专业|入学|毕业|education|school|degree|major/iu.test(label)) {
      return { spec: { ids: [], key: "education", title: "教育经历" }, root: null };
    }
    if (/意向|期望|工作城市|地点|preference|location/iu.test(label)) {
      return { spec: { ids: [], key: "intention", title: "申请信息" }, root: null };
    }
    if (/姓名|手机|电话|邮箱|性别|出生|证件|name|phone|email|gender/iu.test(label)) {
      return { spec: { ids: [], key: "basic", title: "基本信息" }, root: null };
    }
    return { spec: { ids: [], key: "other", title: "其他" }, root: null };
  };
  const repeatIndexFor = (control: Element, sectionRoot: HTMLElement | null) => {
    if (!sectionRoot) return null;
    const isCard = (node: Element) => [...node.classList].some(name => /^apply-form-array-card(?:__|$)/u.test(name));
    let card: Element | null = control;
    while (card && card !== sectionRoot && !isCard(card)) card = card.parentElement;
    if (!card || !sectionRoot.contains(card)) return null;
    const cards = [...sectionRoot.querySelectorAll<HTMLElement>("[class*='apply-form-array-card']")]
      .filter((candidate) => visible(candidate) && isCard(candidate));
    const index = cards.indexOf(card as HTMLElement);
    return index >= 0 ? index : null;
  };
  const semanticSlotFor = (sectionKey: string, label: string, identity: string, edge: "start" | "end" | null, customQuestion: boolean) => {
    const value = normalize(`${label} ${identity}`).toLowerCase();
    const sourceSlot = () => normalize(identity || label).toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/giu, "_").replace(/^_+|_+$/gu, "").slice(0, 40) || "field";
    if (edge) return `${edge}_date`;
    // Numeric Formily fields are tenant-defined questions. Their wording can
    // mention a school, degree or company without asking for that resume fact.
    // Keep evidenced relationship/contact roles scoped to their own modules.
    if (customQuestion && !["relation", "third_party"].includes(sectionKey)) return sourceSlot();
    if (sectionKey === "portfolio" && /作品附件|(?:^|\s)attachment(?:\s|$)/u.test(value)) return "attachment";
    if (sectionKey === "portfolio" && /作品链接|(?:^|\s)link(?:\s|$)/u.test(value)) return "link";
    if (/简历附件|attachment_resume|resume/iu.test(value)) return "resume_file";
    if (/推荐方式|code_type|referral/iu.test(value)) return "referral_method";
    if (sectionKey === "relation") {
      if (/部门|职位|department|position/iu.test(value)) return "department_position";
      if (/与本人关系|relationship/iu.test(value)) return "relationship";
      if (/姓名|name/iu.test(value)) return "name";
    }
    if (sectionKey === "third_party") {
      if (/姓名|name/iu.test(value)) return "name";
      if (/手机|电话|phone|mobile|tel/iu.test(value)) return "phone";
      if (/邮箱|email/iu.test(value)) return "email";
      if (/关系|relationship/iu.test(value)) return "relationship";
    }
    if (/学校|院校|school/iu.test(value)) return "school";
    if (/学历类型|education_type/iu.test(value)) return "education_type";
    if (/最高学历|学历|学位|degree/iu.test(value)) return "degree";
    if (/专业|field_of_study|major/iu.test(value)) return "major";
    if (/项目名称|project.?name/iu.test(value)) return "project_name";
    if (/公司|单位|company/iu.test(value)) return "company";
    if (/岗位|职位|职务|title|position/iu.test(value)) return "title";
    if (/角色|role/iu.test(value)) return "role";
    if (/描述|职责|内容|description|responsibilit|desc/iu.test(value)) return "description";
    if (/姓名|full.?name|(?:^|\s)name(?:$|\s)/iu.test(value)) return "full_name";
    if (/手机|电话|phone|mobile|tel/iu.test(value)) return "phone";
    if (/邮箱|email/iu.test(value)) return "email";
    if (/城市|地点|city|location/iu.test(value)) return "preferred_city";
    return sourceSlot();
  };
  const validationFor = (root: HTMLElement, control: Element) => {
    const linked = normalize(control.getAttribute("aria-errormessage")).split(" ")
      .map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const nodes = [...new Set([
      ...linked,
      ...root.querySelectorAll<HTMLElement>(
        ".ud-formily-item-error-help,[role='alert'],[aria-live='assertive'],[class*='formily-item-error']"
      )
    ])].filter((node) => visible(node) && !node.querySelector(
      "input,textarea,select,[role='combobox']"
    ));
    const validation = /(?:为|是)必填(?:项)?|不能为空|请(?:填写|选择|上传|勾选)|不正确|无效|未通过|不一致|required|invalid|must\s+(?:enter|select|upload|complete)/iu;
    const message = nodes.map((node) => normalize(node.innerText || node.textContent))
      .find((text) => text && validation.test(text));
    if (message) return message.slice(0, 160);
    return control.getAttribute("aria-invalid") === "true" ? "该字段仍被招聘网站标记为无效" : null;
  };

  const controls = [...document.querySelectorAll<HTMLElement>(
    "input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"
  )].filter((control) => {
    const nested = control.closest("[role='combobox']");
    if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
      nested && nested !== control) return false;
    return (control instanceof HTMLInputElement && control.type === "file") ||
      control.matches("input[type=radio].ud__radio__input") && visible(control.closest("label.ud__radio__wrapper")) || visible(control);
  });

  return controls.flatMap((control) => {
    const root = directFormilyRoot(control);
    if (!root || !root.querySelector(":scope > .ud-formily-item-label,.ud-formily-item-label")) return [];
    const dataFieldId = control.getAttribute("data-form-field-id") || root.getAttribute("data-form-field-id");
    const dataFieldName = control.getAttribute("data-form-field-name") || root.getAttribute("data-form-field-name");
    const dataI18n = control.getAttribute("data-form-field-i18n-name") || root.getAttribute("data-form-field-i18n-name");
    const visibleLabel = normalize(root.querySelector<HTMLElement>(
      ":scope > .ud-formily-item-label .ud-formily-item-label-content"
    )?.innerText).replace(/[＊*]\s*(?:必填)?/gu, "").trim();
    const baseLabel = normalize(dataI18n || visibleLabel);
    if (!baseLabel) return [];
    const section = sectionFor(root, baseLabel);
    const groupIndex = repeatIndexFor(control, section.root);
    const siblings = controls.filter((candidate) => directFormilyRoot(candidate) === root);
    const group = control.matches("input[type=radio].ud__radio__input") ? control.closest(".ud__radio-group") : null;
    const radios = group ? [...group.querySelectorAll<HTMLInputElement>("input[type=radio].ud__radio__input")]
      .filter(input => input.closest(".ud__radio-group") === group) : [];
    const radioLabel = (input: HTMLInputElement) => {
      const wrapper = input.closest("label.ud__radio__wrapper");
      const label = wrapper?.querySelector(".ud__radio__label-content");
      return wrapper?.querySelectorAll("input").length === 1 && label && visible(label) ? normalize(label.textContent) : "";
    };
    const labels = radios.map(radioLabel);
    const checked = radios.filter(input => input.checked);
    const radioGroup = group && root.querySelectorAll(".ud__radio-group").length === 1 &&
      radios.length > 1 && siblings.length === radios.length && labels.every(Boolean) && new Set(labels).size === labels.length && checked.length <= 1
      ? { ownerSelector: selectorFor(radios[0]!), options: radios.filter(input => !input.disabled && !input.matches(":disabled") &&
          input.getAttribute("aria-disabled") !== "true" && input.closest("label")?.getAttribute("aria-disabled") !== "true").map(radioLabel),
          selectedValue: checked.length ? radioLabel(checked[0]!) : "" } : undefined;
    const siblingIndex = siblings.indexOf(control);
    const customRange = /^\d+$/u.test(dataFieldId ?? "") && root.querySelectorAll(".throne-biz-date-range-picker-wrapper").length === 1 && siblings.length === 2;
    const edge = dataFieldId === "start_end_time" || dataFieldName === "start_end_time" || customRange
      ? siblingIndex === 0 ? "start" as const : siblingIndex === 1 ? "end" as const : null
      : null;
    const leafLabel = edge ? `${customRange ? `${baseLabel} · ` : ""}${edge === "start" ? "开始时间" : "结束时间"}` : baseLabel;
    const contextLabel = groupIndex !== null
      ? `${section.spec.title} ${groupIndex + 1} · ${leafLabel}`
      : section.spec.key === "relation" && !baseLabel.includes(section.spec.title)
        ? `${section.spec.title} · ${leafLabel}`
        : leafLabel;
    const identity = normalize(`${dataFieldId ?? ""} ${dataFieldName ?? ""} ${dataI18n ?? ""}`);
    const validationMessage = validationFor(root, control);
    const nativeRequired = (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement) && control.required;
    const requiredError = /(?:为|是)必填(?:项)?|不能为空|请(?:填写|选择|上传|勾选)|required/iu
      .test(validationMessage ?? "");
    const required = nativeRequired || control.getAttribute("aria-required") === "true" ||
      root.getAttribute("aria-required") === "true" || Boolean(root.querySelector(
        ".ud-formily-item-asterisk,[class*='formily-item-required']"
      )) || requiredError;
    const formilySelect = control.matches(
      "input[role='combobox'].ud__select__selector__search__input"
    ) ? control.closest<HTMLElement>(".ud__select") : null;
    const atsxSingle = control.matches(".atsx-select-selection--single[role='combobox']") && !control.closest(".atsx-select-combobox");
    const multiple = formilySelect?.querySelector(".ud__select__selector-multiple");
    const multiValues = multiple ? [...multiple.querySelectorAll<HTMLElement>(".ud__select__selector__tag")].filter(visible)
      .map(node=>(node.querySelector(".ud__tag__content")?.textContent??node.textContent??"").trim()).filter(Boolean) : null;
    const selectedValue = multiValues ? (multiValues.length ? JSON.stringify(multiValues) : "") : atsxSingle ? [...control.querySelectorAll<HTMLElement>(".atsx-select-selection-selected-value")]
      .filter(visible).map(node=>normalize(node.textContent)).join("、") : formilySelect ? [...formilySelect.querySelectorAll<HTMLElement>(
      ".ud__select__selector__selectItem,.ud__select__selector__selection__item," +
      "[class*='selector__selection__item'],[class*='selection-item']"
    )].filter(visible).filter((node) => !node.closest(".ud__select__dropdown") &&
      !/placeholder/iu.test(String(node.className || "")))
      .map((node) => normalize(node.innerText || node.textContent)).filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index).join("、") : null;
    return [{
      selector: selectorFor(control),
      label: contextLabel.slice(0, 160),
      sectionKey: section.spec.key,
      groupIndex,
      labelPath: [section.spec.title, ...(groupIndex !== null ? [`${section.spec.title} ${groupIndex + 1}`] : []), leafLabel]
        .filter((value, index, values) => value && values.indexOf(value) === index),
      semanticSlot: customRange ? `${dataFieldId}.${edge}_date` : semanticSlotFor(section.spec.key, contextLabel, identity, edge, /^\d+$/u.test(dataFieldId ?? "")),
      required,
      validationMessage,
      selectedValue,
      ...(radioGroup ? {radioGroup} : {}),
      dataFieldId,
      dataFieldName,
      fieldSource: {
        dialect: "feishu_formily" as const,
        fieldPath: dataFieldId || dataFieldName || baseLabel,
        moduleId: section.root?.id || null,
        groupIndex,
        ...(edge ? { edge } : {})
      }
    }];
  });
}

/** Merge the ATS dialect without changing control classification or value. */
export function applyFeishuFormilyFieldPatches(
  fields: PageFieldObservation[], patches: FeishuFormilyFieldPatch[]
): PageFieldObservation[] {
  const bySelector = new Map(patches.map((patch) => [patch.selector, patch]));
  const patched = fields.filter(field => {
    const group = bySelector.get(field.selector)?.radioGroup;
    return !group || group.ownerSelector === field.selector;
  }).map((field) => {
    const patch = bySelector.get(field.selector);
    if (!patch) return field;
    const groupPart = patch.groupIndex === null ? "" : `[${patch.groupIndex}]`;
    return {
      ...field,
      label: patch.label,
      sectionKey: patch.sectionKey,
      groupIndex: patch.groupIndex,
      labelPath: patch.labelPath,
      ...(patch.fieldSource ? { fieldSource: patch.fieldSource } : {}),
      ...(patch.fieldSource?.dialect === "feishu_atsx" ? { requiresValidationClear: true } : {}),
      stableFieldKey: `${patch.fieldSource?.dialect === "feishu_atsx" && patch.fieldSource.moduleId === "internship" ? "internship" : patch.sectionKey}${groupPart}.${patch.semanticSlot}.${field.controlKind ?? "native"}`,
      required: patch.required,
      requiredSource: patch.required ? "explicit" as const : "none" as const,
      validationMessage: patch.validationMessage,
      currentValue: patch.selectedValue === null ? field.currentValue : patch.selectedValue,
      ...(patch.radioGroup ? { type: "combobox", controlKind: "combobox", observedControlKind: "formily_radio_group" as const,
        options: patch.radioGroup.options, currentValue: patch.radioGroup.selectedValue, requiresValidationClear: true } : {}),
      domHints: {
        ...field.domHints,
        fieldLabel: patch.labelPath.at(-1) ?? patch.label,
        dataFieldId: patch.dataFieldId,
        dataFieldName: patch.dataFieldName,
        ...(patch.radioGroup ? {disabled: patch.radioGroup.options.length === 0} : {})
      }
    };
  });
  const totals = new Map<string, number>();
  for (const field of patched) totals.set(field.stableFieldKey ?? "", (totals.get(field.stableFieldKey ?? "") ?? 0) + 1);
  const indexes = new Map<string, number>();
  return patched.map((field) => {
    const key = field.stableFieldKey ?? "";
    if (!key || (totals.get(key) ?? 0) <= 1) return field;
    const index = indexes.get(key) ?? 0;
    indexes.set(key, index + 1);
    return { ...field, stableFieldKey: `${key}#${index}` };
  });
}
