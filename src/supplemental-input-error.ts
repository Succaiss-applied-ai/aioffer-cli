import { maximumDisplayedChoiceOptions, requiredFieldInputKind, requiredFieldInputKinds } from "./required-field-input.js";

export interface SupplementalInputContract {
  fieldId: string;
  label: string;
  type?: string;
  controlKind?: string | null;
  controlType?: string | null;
  inputKind?: string;
  regionLevel?: string;
  options?: readonly string[];
}

/** Validates the returned input contract, never candidate answers or the whole form. */
export function supplementalInputError(request: SupplementalInputContract) {
  const issue = (code: string, message: string) => ({ code, fieldId: request.fieldId,
    userMessage: `“${request.label}”${message}本次投递已停止，请反馈此问题。` });
  const unsupported = () => issue("supplemental_control_unresolved", "的填写控件未被正确识别，无法提供补充入口。");
  const invalid = () => issue("supplemental_input_contract_invalid", "的填写要求存在冲突，无法提供补充入口。");
  const options = request.options ?? [];
  const explicit = request.inputKind;
  if (explicit !== undefined && !(requiredFieldInputKinds as readonly string[]).includes(explicit)) return unsupported();
  if (explicit === "region" || explicit === undefined && request.regionLevel) {
    return ["province", "city", "district"].includes(request.regionLevel ?? "") ? null : invalid();
  }
  const kinds = [request.type, request.controlKind, request.controlType].filter(Boolean).map(kind => kind!.toLowerCase());
  const known = new Set<string>([...requiredFieldInputKinds, "native", "combobox", "checkbox", "radio", "contenteditable"]);
  if (explicit === undefined && kinds.includes("region")) return invalid();
  if (explicit === undefined && (!kinds.length && !options.length || kinds.some(kind => !known.has(kind)))) return unsupported();
  const largeChoiceInput = options.length > maximumDisplayedChoiceOptions &&
    (explicit === "text" || explicit === "textarea") && requiredFieldInputKind(request) === explicit;
  const choice = largeChoiceInput || explicit === "select" || explicit === "multi_select" || explicit === undefined &&
    (options.length > 0 || kinds.some(kind => ["select", "multi_select", "combobox", "checkbox", "radio"].includes(kind)));
  if (choice) {
    if (!options.length) return issue("supplemental_options_unavailable", "的可选项未能读取，无法提供补充入口。");
    return options.length > 1000 || options.some(option => !option.trim() || option.length > 300) ||
      new Set(options).size !== options.length ? invalid() : null;
  }
  return options.length ? invalid() : null;
}
