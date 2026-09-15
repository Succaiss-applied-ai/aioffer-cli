import type { FeishuFormilyFieldPatch } from "./feishu-formily.js";

/** Serializable, read-only ATSX field-root observation. A Formily-owned
 * ATSX trigger is left to the Formily dialect; control routing is separate. */
export function observeFeishuAtsxFieldPatchesInPage(): FeishuFormilyFieldPatch[] {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/gu, " ").trim();
  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.closest("[hidden],[aria-hidden='true']")) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  };
  const selectorFor = (element: Element) => {
    if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) return `#${CSS.escape(element.id)}`;
    const testId = element.getAttribute("data-testid");
    if (testId && document.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`).length === 1) return `[data-testid="${CSS.escape(testId)}"]`;
    const segments: string[] = [];
    let current: Element | null = element;
    for (; current && current !== document.body; current = current.parentElement) {
      let segment = current.tagName.toLowerCase();
      for (const name of ["name", "data-form-field-name", "role", "type"]) {
        const value = current.getAttribute(name);
        if (value && (name !== "type" || current.tagName === "INPUT")) segment += `[${name}="${CSS.escape(value)}"]`;
      }
      if (current.parentElement) {
        const peers = [...current.parentElement.children].filter(peer => peer.tagName === current!.tagName);
        if (peers.length > 1) segment += `:nth-of-type(${peers.indexOf(current) + 1})`;
      }
      segments.unshift(segment);
      if (document.querySelectorAll(segments.join(" > ")).length === 1) return segments.join(" > ");
    }
    return `${current === document.body ? "body > " : ""}${segments.join(" > ")}`;
  };
  const controls = [...document.querySelectorAll<HTMLElement>(
    "input:not([type='hidden']),textarea,select,[contenteditable='true'],[role='combobox']"
  )].filter(control => {
    const containing = control.closest("[role='combobox']");
    if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && containing && containing !== control) return false;
    if (control instanceof HTMLInputElement && control.type === "file") return true;
    return visible(control);
  });
  return controls.flatMap((control): FeishuFormilyFieldPatch[] => {
    if (control.closest(".ud-formily-item")) return [];
    const root = control.closest<HTMLElement>(".atsx-form-item");
    const upload = control instanceof HTMLInputElement && control.type === "file"
      ? control.closest<HTMLElement>("[data-test='uploadResume'].uploadResume") : null;
    const uploadSection = upload?.closest<HTMLElement>(".uploadResume-section");
    const isResume = Boolean(upload && uploadSection && visible(uploadSection) &&
      uploadSection.querySelectorAll("input[type='file']").length === 1 &&
      /^(?:附件简历|简历附件)$/u.test(normalize(uploadSection.querySelector(".createFormSection-title .createFormSection-text")?.textContent)));
    const labelNode = root?.querySelector<HTMLElement>(":scope > .atsx-form-item-label > label");
    const baseLabel = isResume ? "附件简历" : normalize(
      labelNode?.querySelector(".customResumeForm-fieldName")?.textContent || labelNode?.textContent
    ).replace(/[＊*]/gu, "").trim();
    if (!baseLabel || (!isResume && (!root || !visible(root)))) return [];
    const path = isResume ? "attachment_resume" : root?.getAttribute("data-cy") ||
      control.getAttribute("name") || control.id || control.getAttribute("data-cy") || baseLabel;
    const repeated = path.match(/^(education|internship|work|project)\[(\d+)\]\.([^.[\]]+)$/u);
    const groupIndex = repeated ? Number(repeated[2]) : null;
    const sectionKey = isResume ? "attachments" : repeated ? repeated[1] === "internship" ? "work" : repeated[1]! :
      /^(?:姓名|手机号码|手机号|邮箱|性别|年龄|出生日期)$/u.test(baseLabel) ? "basic" :
      /^(?:意向城市|期望工作地点|期望城市)$/u.test(baseLabel) ? "intention" : "other";
    const title = isResume ? "简历" : repeated ? ({education:"教育经历",internship:"实习经历",work:"工作经历",project:"项目经历"}[repeated[1]!] ?? "其他") :
      sectionKey === "basic" ? "基本信息" : sectionKey === "intention" ? "申请信息" : "其他";
    const leaf = repeated?.[3] ?? path;
    const slots: Record<string, string> = {name: sectionKey === "project" ? "project_name" : "full_name", email:"email",phone:"phone",
      school:"school", degree:"degree", education_type:"education_type", fieldOfStudy:"major", company:"company",title:"title",role:"role",desc:"description",link:"link",attachment_resume:"resume_file"};
    const semanticSlot = slots[leaf] || normalize(leaf).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/gu, "_").slice(0,80) || "field";
    const owner = isResume ? uploadSection! : root!;
    const errors = [...owner.querySelectorAll<HTMLElement>(".atsx-form-explain,.uploadFile-errorText,[role='alert']")]
      .filter(node => visible(node) && (isResume || node.closest(".atsx-form-item") === root) &&
        !node.querySelector("input,textarea,select,[role='combobox']"));
    const validationMessage = errors.map(node => normalize(node.innerText)).find(Boolean) ||
      (control.getAttribute("aria-invalid") === "true" ? "该字段仍被招聘网站标记为无效" : null);
    const required = isResume ? uploadSection!.classList.contains("createFormSection-require") :
      Boolean(labelNode?.classList.contains("atsx-form-item-required") || control.getAttribute("aria-required") === "true" ||
        (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) && control.required);
    const selected = control.matches(".atsx-select-selection[role='combobox']")
      ? [...control.querySelectorAll<HTMLElement>(".atsx-select-selection-selected-value")].filter(visible) : null;
    return [{selector:selectorFor(control),label: groupIndex === null ? baseLabel : `${title} ${groupIndex + 1} · ${baseLabel}`,
      sectionKey,groupIndex,labelPath:[title,...(groupIndex === null ? [] : [`${title} ${groupIndex + 1}`]),baseLabel],semanticSlot,
      required,validationMessage,selectedValue:control.closest(".atsx-select-combobox")
        ? normalize(control.querySelector<HTMLInputElement>("input.atsx-select-search__field")?.value)
        : selected === null ? null : selected.map(node=>normalize(node.innerText)).join("、"),
      dataFieldId:path,dataFieldName:leaf,
      fieldSource:{dialect:"feishu_atsx",fieldPath:path,moduleId:repeated?.[1] ?? (isResume ? "attachment_resume" : null),groupIndex}}];
  });
}
