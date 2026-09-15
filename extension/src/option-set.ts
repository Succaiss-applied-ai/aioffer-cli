/** Exact choice identities: punctuation must never split an array option. */
export function decodeExactOptionSet(value: unknown): string[] | null {
  let parsed: unknown = value;
  if (typeof value === "string") { try { parsed = JSON.parse(value); } catch { return null; } }
  if (!Array.isArray(parsed) || !parsed.length ||
    !parsed.every(v => typeof v === "string" && v.trim()) || new Set(parsed).size !== parsed.length) return null;
  return [...parsed];
}

/** Keep legacy scalar answers readable while preserving new exact arrays. */
export function nativeSelectRequestedValues(value: unknown, multiple: boolean): string[] {
  if (!multiple) return [String(value ?? "")];
  const exact = decodeExactOptionSet(value);
  if (exact) return exact;
  if (Array.isArray(value) || String(value ?? "").trimStart().startsWith("[")) return [];
  return String(value ?? "").split(/[、,，;；]/u).map(v => v.replace(/\s+/gu, " ").trim()).filter(Boolean);
}
