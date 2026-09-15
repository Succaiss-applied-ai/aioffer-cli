import type { PageFieldObservation } from "./page-adapter.js";
import { cityDisplayMatchesFact, uniqueCityOption } from "./city-option-matching.js";

export type CityFact = { key: string; value: string };
export const ACCEPTABLE_CITY_SEMANTIC_PREFIX = "candidate.acceptable_work_city:";

/** A work preference is not a birthplace, residence, school or contact address. */
export function isPreferredWorkCityField(field: Pick<PageFieldObservation, "label" | "stableFieldKey"> &
  Partial<Pick<PageFieldObservation, "domHints">>): boolean {
  const label = field.label;
  // A consent/transfer question may mention a preferred city and inherit an
  // old preferred_city key. Its answer is not a geographical preference.
  if (/(?:^|\s)bool_info(?:[-\s]|$)/u.test(field.domHints?.classNames?.join(" ") ?? "") ||
    /(?:是否|能否|可否|愿否|愿不愿).*(?:接受|调剂|服从)|\b(?:would|will|can|do)\s+you\s+(?:accept|agree|consent)\b/iu.test(label)) return false;
  if (/籍贯|出生|户籍|居住|所在地|学校|院校|联系人|推荐|内推/u.test(label)) return false;
  return /意向.*城市|期望.*城市|工作城市|意向地点|工作地点|preferred[_.\s-]*(?:city|cities|location)/iu.test(label) ||
    /^(?:intention|preferences)\.preferred_city(?:\.|$)/u.test(field.stableFieldKey ?? "");
}

export function normalizePreferredCity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, "").replace(/市$/u, "").toLowerCase();
}

function cities(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(cities);
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (text.startsWith("[")) {
    try { return cities(JSON.parse(text)); } catch { return []; }
  }
  return text.split(/[、,，;；\n]/u).map(city => city.trim()).filter(Boolean);
}

/** Preserve array order and provenance instead of reducing preferences to one scalar. */
export function enrichPreferredCityFacts(
  facts: Record<string, string>, candidate: Record<string, unknown>, profileFacts: unknown[]
): void {
  const preferences = candidate.preferences as Record<string, unknown> | undefined;
  const intention = candidate.intention as Record<string, unknown> | undefined;
  const preferred = cities(preferences?.preferredCities ?? preferences?.preferredCity ??
    intention?.preferredCities ?? intention?.preferredCity);
  if (preferred.length) {
    for (const key of Object.keys(facts)) {
      if (/^(?:candidate\.)?(?:preferences|intention)\.preferredCit(?:y|ies)(?:[.\[]|$)/iu.test(key)) delete facts[key];
    }
    preferred.forEach((value, index) => { facts[`candidate.preferences.preferredCities.${index}`] = value; });
  }
  const confirmed = profileFacts.filter((raw): raw is Record<string, unknown> =>
    Boolean(raw && typeof raw === "object" && !Array.isArray(raw)))
    .filter(fact => fact.source === "user_confirmed" &&
      typeof fact.semanticKey === "string" && fact.semanticKey.startsWith(ACCEPTABLE_CITY_SEMANTIC_PREFIX) &&
      !fact.fieldBinding && typeof fact.value === "string")
    .sort((a, b) => String(a.confirmedAt ?? "").localeCompare(String(b.confirmedAt ?? "")) ||
      String(a.semanticKey).localeCompare(String(b.semanticKey)));
  confirmed.forEach((fact, index) => { facts[`profile.acceptableWorkCity.${index}`] = String(fact.value); });
}

export function preferredCityCandidates(facts: Record<string, string>, supplementalKeys: string[] = []): CityFact[] {
  const entries = Object.entries(facts);
  const primary = entries.filter(([key]) =>
    /^(?:candidate\.)?(?:preferences|intention)\.preferredCit(?:y|ies)(?:[.\[]\d+\]?)?$/iu.test(key))
    .flatMap(([key, value]) => cities(value).map(city => ({ key, value: city })));
  if (!primary.length && facts["profile.preferredCity.noResidenceFallback"] !== "true") {
    const key = ["candidate.basic.currentCity", "basic.currentCity"].find(key => facts[key]?.trim());
    if (key) primary.push({ key, value: facts[key]!.trim() });
  }
  const backups = entries.filter(([key]) => /^profile\.acceptableWorkCity\.\d+$/u.test(key))
    .map(([key, value]) => ({ key, value }));
  for (const key of supplementalKeys) {
    if (facts[key]?.trim()) backups.push({ key, value: facts[key]!.trim() });
  }
  const seen = new Set<string>();
  const excluded = new Set(cities(facts["profile.preferredCity.excluded"]).map(normalizePreferredCity));
  return [...primary, ...backups].filter(fact => {
    const city = normalizePreferredCity(fact.value);
    if (!city || seen.has(city) || excluded.has(city)) return false;
    seen.add(city);
    return true;
  });
}

export function preferredCityFactForField(
  field: Pick<PageFieldObservation, "options"> & Partial<Pick<PageFieldObservation, "currentValue">>,
  facts: Record<string, string>, supplementalKeys: string[]
): CityFact | null {
  const candidates = preferredCityCandidates(facts, supplementalKeys);
  // Closed Moka controls omit their option list after a successful selection.
  // Preserve an existing value only if it is an authorized city fact; never
  // mistake a selected backup for a new empty field and rewrite it to primary.
  if (!field.options.length && field.currentValue?.trim()) {
    const committed = candidates.find(fact => cityDisplayMatchesFact(field.currentValue, fact.value));
    if (committed) return committed;
  }
  return candidates.find(fact => !field.options.length || uniqueCityOption(field.options, fact.value)) ?? null;
}
