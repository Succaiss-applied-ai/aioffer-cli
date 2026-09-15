/** Search supplementation uses one complete value per line; punctuation is identity. */
export function selectorSearchValues(value: unknown): string[] | null {
  let values: unknown = value;
  if (typeof value === "string") {
    const text=value.trim();
    if (text.startsWith("[")) { try { values=JSON.parse(text); } catch { return null; } }
    else values=text.split(/\r?\n/u).map(v=>v.trim()).filter(Boolean);
  }
  if (!Array.isArray(values)||!values.length||values.some(v=>typeof v!=="string"||!v.trim())) return null;
  const exact=values.map(v=>(v as string).trim());
  return new Set(exact).size===exact.length ? exact : null;
}
