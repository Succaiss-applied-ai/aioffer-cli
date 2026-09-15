export interface SelectLikeField {
  label: string;
  type: string;
  options: string[];
}

const DEGREE_ALIASES: Record<string, string[]> = {
  high_school: ["高中", "中专", "中职"],
  associate: ["大专", "专科"],
  bachelor: ["本科", "学士"],
  master: ["硕士", "研究生"],
  doctorate: ["博士", "博士研究生"],
  other: ["其他"]
};

const normalize = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[\s·・()（）\[\]【】_-]+/g, "")
  .replace(/市$/, "");

function aliasesFor(semanticKey: string | null, value: string): string[] {
  if (/^(?:education(?:\[\d+\])?\.degree|(?:candidate\.)?basic\.highestDegree)$/.test(semanticKey ?? "")) {
    const direct = DEGREE_ALIASES[value.trim().toLowerCase()];
    if (direct) return direct;
    const matching = Object.values(DEGREE_ALIASES).find((aliases) =>
      aliases.some((alias) => normalize(alias) === normalize(value))
    );
    if (matching) return matching;
  }
  return [value];
}

/**
 * Convert resume-domain enum values into values actually displayed by an ATS.
 * When options are known, always return the site's exact option text.
 */
export function localizeFieldAnswer(
  field: SelectLikeField,
  semanticKey: string | null,
  value: string
): string {
  const cleanValue = /^(?:project(?:\[\d+\])?\.name|work(?:\[\d+\])?\.(?:company|title))$/.test(semanticKey ?? "")
    ? value.replace(/[|｜·・]+\s*$/g, "").trim()
    : value;
  if (!["select", "combobox", "radio"].includes(field.type)) return cleanValue;
  const requested = aliasesFor(semanticKey, cleanValue);
  for (const alias of requested) {
    const exact = field.options.find((option) => {
      const normalizedOption = normalize(option);
      const normalizedAlias = normalize(alias);
      return normalizedOption === normalizedAlias || normalizedOption.includes(normalizedAlias);
    });
    if (exact) return exact;
  }
  return requested[0] ?? cleanValue;
}
