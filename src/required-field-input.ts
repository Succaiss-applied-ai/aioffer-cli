/** Supplemental input is a control contract, never a field-name heuristic. */
export const requiredFieldInputKinds = [
  "text", "textarea", "email", "tel", "url", "number", "date", "month",
  "datetime-local", "search", "select", "multi_select", "region"
] as const;
export type RequiredFieldInputKind = typeof requiredFieldInputKinds[number];
export const maximumDisplayedChoiceOptions = 100;

export function requiredFieldInputKind(request: {
  type?: string; controlKind?: string | null; options?: readonly string[]; regionLevel?: string;
}): RequiredFieldInputKind | null {
  if (["province", "city", "district"].includes(request.regionLevel ?? "")) return "region";
  const type = request.type?.toLowerCase() ?? "";
  const control = request.controlKind?.toLowerCase() ?? "";
  const options = request.options ?? [];
  const kinds = [type, control].filter(Boolean);
  const known = new Set<string>([...requiredFieldInputKinds, "native", "combobox", "radio", "checkbox", "contenteditable"]);
  if (!kinds.length || kinds.some(kind => !known.has(kind))) return null;
  if (kinds.includes("multi_select")) return options.length > 0 && options.every(x => x.trim() && x.length <= 300) &&
    new Set(options).size === options.length ? options.length > maximumDisplayedChoiceOptions ? "textarea" : "multi_select" : null;
  if (options.length) return options.every(x => x.trim() && x.length <= 300) &&
    (options.length <= maximumDisplayedChoiceOptions || new Set(options).size === options.length) ?
    options.length > maximumDisplayedChoiceOptions ? "text" : "select" : null;
  // Empty option-only controls are not editable text, even with an internal INPUT.
  if (kinds.some(kind => ["select", "combobox", "radio", "checkbox"].includes(kind))) return null;
  if (kinds.includes("contenteditable")) return "textarea";
  // A native datetime-local type must not lose its time to controlKind=date.
  return kinds.find(kind => kind !== "region" &&
    (requiredFieldInputKinds as readonly string[]).includes(kind)) as RequiredFieldInputKind | undefined ?? null;
}
