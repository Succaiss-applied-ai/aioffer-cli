import { isFeishuLocationTree } from "./control-adapters/feishu-selector-discovery.js";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import type { FieldInformationRequirement } from "./control-adapters/types.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { evidenceForField } from "./control-adapters/field-routing.js";
import {
  MOKA_NATIVE_PLACE_PROVINCE_PREFIXES,
  parseMokaNativePlace,
  normalizeMokaNativePlacePart
} from "./control-adapters/moka-native-place-driver.js";
import {
  calendarControlRequiresDayPrecision,
  calendarControlUsesMonthPrecision,
  structuredDateFromValue,
  structuredMonthDateFromValue
} from "./date-control-strategy.js";

/** Requirements come from the live control or its single registered Driver, never from the supplied value. */
export function fieldInformationRequirement(field: PageFieldObservation): FieldInformationRequirement | null {
  if (isFeishuLocationTree(field)) return null;
  const hint = { type: field.type, placeholder: field.domHints?.placeholder };
  if (calendarControlRequiresDayPrecision(hint)) return { kind: "date", precision: "day" };
  if (field.temporal) return { kind: "date", precision: "month", part: field.temporal.part };
  if (calendarControlUsesMonthPrecision(hint)) return { kind: "date", precision: "month" };
  const placeholder = String(field.domHints?.placeholder ?? "").normalize("NFKC");
  if (/^(?:YYYY|年|year)$/iu.test(placeholder)) return { kind: "date", precision: "year", part: "year" };
  const regionHint = placeholder;
  // Only explicit ordered levels prove a generic hierarchy's required depth.
  // A label such as 籍贯/所在地 alone does not imply that a district is required.
  const optionalDistrict = /(?:区\s*[/、]?\s*县|区|县)[\s()（），,:：]*(?:选填|可选|非必填|不必填|可不填)/u.test(regionHint);
  if (!optionalDistrict && /省(?:份)?\s*[/、,，> -]?\s*(?:城市|市)\s*[/、,，> -]?\s*(?:区|县)/u.test(regionHint)) {
    return { kind: "region", level: "district" };
  }
  if (/省(?:份)?\s*[/、,，> -]?\s*(?:城市|市)/u.test(regionHint)) return { kind: "region", level: "city" };
  if (/^(?:请选择)?省份$/u.test(placeholder.trim())) return { kind: "region", level: "province" };
  return field.informationRequirement ?? null;
}

export function withFieldInformationRequirements(observation: PageObservation): PageObservation {
  return { ...observation, fields: observation.fields.map(field => {
    const registration = resolveControlAdapter(evidenceForField(observation, field)).registration;
    // Never carry a previous tenant/Driver's contract across a re-observation.
    const registered = { ...field, informationRequirement: registration?.informationRequirement,
      optionSource: registration?.optionSource,
      controlApplicationUrl: field.domHints?.tagName ? observation.url : undefined,
      optionMultiplicity: field.domHints?.tagName === "SELECT" && field.domHints.multiple ||
        registration?.control.type === "custom_city_multi_select" || registration?.control.type === "custom_multi_select"
        ? "multiple" as const : undefined,
      supplementalRegionInput: registration?.informationRequirement?.kind === "region"
    };
    const informationRequirement = fieldInformationRequirement(registered);
    return { ...registered, informationRequirement: informationRequirement ?? undefined,
      // A registered calendar can be known before its popup reveals month/day
      // precision. Ask for a complete user-provided date without changing the
      // site's precision requirement, existing value or execution route.
      supplementalInputType: registration?.control.type === "custom_date_picker" &&
        registration.readbackStrategy === "structured_temporal" && !field.temporal
        ? "date" : undefined
    };
  }) };
}

export interface FieldInformationAssessment {
  requirement: FieldInformationRequirement | null;
  status: "sufficient" | "insufficient" | "unknown";
  missingParts: string[];
}

/** No page actions. Incomplete facts must reach supplementation before any Driver is invoked. */
export function assessFieldInformation(field: PageFieldObservation, value: unknown): FieldInformationAssessment {
  const requirement = fieldInformationRequirement(field);
  const result = (status: FieldInformationAssessment["status"], missingParts: string[] = []): FieldInformationAssessment =>
    ({ requirement, status, missingParts });
  if (!requirement) return result("unknown");
  const text = String(value ?? "").trim();
  if (requirement.kind === "date") {
    if (requirement.part) {
      const valid = requirement.part === "year"
        ? /^[1-9]\d{3}\s*年?$/u.test(text)
        : /^(?:0?[1-9]|1[0-2])\s*月?$/u.test(text);
      return valid ? result("sufficient") : result("insufficient", [requirement.part === "year" ? "年" : "月"]);
    }
    const full = structuredDateFromValue(value);
    const month = structuredMonthDateFromValue(value);
    const year = /^[1-9]\d{3}年?$/u.test(text);
    if (full || requirement.precision === "month" && month || requirement.precision === "year" && (year || month)) {
      return result("sufficient");
    }
    return result("insufficient", requirement.precision === "day" && month ? ["日"] :
      year ? requirement.precision === "day" ? ["月", "日"] : ["月"] : ["有效日期"]);
  }
  const levels = ["省", "市", "区/县"];
  const requiredDepth = { province: 1, city: 2, district: 3 }[requirement.level];
  if (!text) return result("insufficient", levels.slice(0, requiredDepth));
  // Municipality names carry both province and city semantics; never ask for
  // an invented extra geographical level. Selection compatibility stays with the Driver.
  const provinceNames: readonly string[] = MOKA_NATIVE_PLACE_PROVINCE_PREFIXES;
  const normalized = normalizeMokaNativePlacePart(text);
  const path = provinceNames.includes(normalized) ? [text] :
    parseMokaNativePlace(text)?.filter(part => normalizeMokaNativePlacePart(part)) ?? [];
  const province = normalizeMokaNativePlacePart(path[0]);
  const hasProvince = provinceNames.includes(province);
  const municipality = hasProvince && ["北京", "天津", "上海", "重庆"].includes(province);
  const city = path[1] ?? "";
  const hasCity = municipality || hasProvince && Boolean(normalizeMokaNativePlacePart(city)) &&
    !/(?:省|自治区|特别行政区|区|县|旗)$/u.test(city) &&
    !provinceNames.includes(normalizeMokaNativePlacePart(city));
  const district = municipality && normalizeMokaNativePlacePart(city) !== province ? city : path[2] ?? "";
  const hasDistrict = Boolean(normalizeMokaNativePlacePart(district)) && !/(?:省|自治区|特别行政区)$/u.test(district);
  const present = [hasProvince, hasCity, hasDistrict];
  const missing = levels.slice(0, requiredDepth).filter((_, index) => !present[index]);
  // A bare city must not masquerade as province+city merely because its
  // display string is nonempty; no levels are borrowed from the job location.
  return missing.length ? result("insufficient", missing) : result("sufficient");
}

/**
 * Project one candidate date fact onto one observed split year/month control.
 * A full date remains the source of truth; the synthetic day used by month
 * parsing is never returned to the page.
 */
export function temporalFieldPartValue(
  field: Pick<PageFieldObservation, "temporal">,
  value: unknown
): string | null {
  const part = field.temporal?.part;
  if (part !== "year" && part !== "month") return null;
  const date = structuredMonthDateFromValue(value);
  if (date) return part === "year" ? String(date.year) : String(date.month);
  const text = String(value ?? "").trim();
  if (part === "year") {
    const year = text.match(/^(?:19|20)\d{2}\s*年?$/u)?.[0]?.match(/(?:19|20)\d{2}/u)?.[0];
    return year ?? null;
  }
  const month = text.match(/^(0?[1-9]|1[0-2])\s*月?$/u)?.[1];
  return month ? String(Number(month)) : null;
}
