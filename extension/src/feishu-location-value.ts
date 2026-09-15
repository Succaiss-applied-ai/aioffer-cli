/** Geography normalization is confined to a structurally proven Feishu location tree. */
export function feishuLocationPart(value: string): string {
  const text = value.trim().replace(/\s+/gu, " ");
  if (text === "中国" || text === "中华人民共和国") return "中国大陆";
  const regions: Record<string,string> = {"广西壮族自治区":"广西","宁夏回族自治区":"宁夏","新疆维吾尔自治区":"新疆","内蒙古自治区":"内蒙古","西藏自治区":"西藏"};
  if (regions[text]) return regions[text];
  return /^[\p{Script=Han}]{2,12}[省市]$/u.test(text) ? text.slice(0, -1) : text;
}

export function feishuLocationTarget(value: unknown): { path: string[]; query: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const path = value.split(/[／/]/u).map(part => part.trim());
  if (!path.length || path.length > 4 || path.some(part => !part || part.length > 120 || /[\r\n]/u.test(part))) return null;
  const query = feishuLocationPart(path.at(-1)!);
  return query ? { path: path.map(feishuLocationPart), query } : null;
}

export function feishuLocationReadback(actual: string, expected: string, multiple: boolean): boolean {
  let desired: unknown = expected;
  if (multiple && expected.trim().startsWith("[")) {
    try { desired = JSON.parse(expected); } catch { return false; }
  }
  const values = Array.isArray(desired) ? desired : [desired];
  let selected: unknown = actual;
  if (multiple) { try { selected = JSON.parse(actual); } catch { return false; } }
  const tags = Array.isArray(selected) ? selected : [selected];
  return tags.length === values.length && values.every(value => {
    const target = feishuLocationTarget(value);
    return target && tags.some(tag => typeof tag === "string" && feishuLocationPart(tag) === target.query);
  });
}
