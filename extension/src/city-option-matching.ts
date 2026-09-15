import { decodeExactOptionSet } from "./option-set.js";
/** City-only matching. Never use this for native-place paths or other answers. */
export function cityOptionMatchToken(expected: unknown): string {
  const value = String(expected ?? "").normalize("NFKC").trim();
  const chinese = value.match(/^[\p{Script=Han}]{2,}/u)?.[0];
  if (chinese) return [...chinese].slice(0, 2).join("");
  // Do not reduce English names to two letters, or a one-character Chinese
  // answer to a province abbreviation.
  if (/\p{Script=Han}/u.test(value)) return "";
  return value.replace(/\s+/gu, "").toLowerCase();
}

export function matchingCityOptions(options: readonly string[], expected: unknown): string[] {
  const token = cityOptionMatchToken(expected);
  if (!token) return [];
  // Keep duplicate DOM leaves: two identical labels are still two targets.
  return options.filter(option => option.normalize("NFKC").replace(/\s+/gu, "")
    .toLowerCase().includes(token));
}

export function uniqueCityOption(options: readonly string[], expected: unknown): string | null {
  const matches = matchingCityOptions(options, expected);
  return matches.length === 1 ? matches[0]! : null;
}

/** The Driver must first select one unique live leaf and verify that exact
 * leaf's display. This predicate only reconciles that committed display with
 * an AI Offer city fact; it is not proof that a click succeeded. */
export function cityDisplayMatchesFact(actual: unknown, expected: unknown): boolean {
  return Boolean(uniqueCityOption([String(actual ?? "")], expected));
}

export function citySelectionValues(value: unknown): string[] {
  const exact = decodeExactOptionSet(value);
  if (exact) return exact;
  if (Array.isArray(value) || String(value ?? "").trimStart().startsWith("[")) return [];
  return String(value ?? "").split(/[、,，;；\n]/u).map(city => city.trim()).filter(Boolean);
}

/** Every authorized city must map to one committed tag, with no extra tags. */
export function citySelectionSetMatches(actual: unknown, expected: unknown): boolean {
  const selected = citySelectionValues(actual);
  const requested = citySelectionValues(expected);
  const matched = requested.map(city => uniqueCityOption(selected, city));
  return selected.length > 0 && selected.length === requested.length && matched.every(Boolean) &&
    new Set(matched).size === selected.length;
}
