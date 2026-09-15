import type { PageFieldObservation } from "../page-adapter.js";
import {exactOptionSetsMatch,nativeSelectRequestedValues} from "../form-dialects/feishu-option-set.js";
import {
  structuredDateFromValue,
  structuredDateReadbackMatches,
  structuredMonthDateFromValue,
  type StructuredDatePrecision,
  type StructuredDateValue
} from "../date-control-strategy.js";
import { cityDisplayMatchesFact, citySelectionSetMatches } from "../city-option-matching.js";
import { mokaNativePlaceReadbackMatches } from "./moka-native-place-driver.js";
import { mokaFlatSelectValuesMatch } from "./moka-shared-select-driver.js";
import { mokaYearMonthSelectReadbackMatches } from "./moka-year-month-select-driver.js";
import { feishuLocationReadback } from "../feishu-location-value.js";
import type {
  ControlAdapterDiagnostic,
  ControlReadbackStrategy
} from "./types.js";

export type ReadbackValueProvenance =
  | "live_page_option"
  | "ai_offer_taxonomy"
  | "candidate_or_profile_fact"
  | "unknown";

export interface RegisteredControlReadbackInput {
  controlAdapter: ControlAdapterDiagnostic;
  field: PageFieldObservation | null;
  expected: string | boolean;
  semanticKey?: string | null;
  dateValue?: StructuredDateValue | null;
  datePrecision?: StructuredDatePrecision;
}

export interface RegisteredControlReadbackDecision {
  matches: boolean;
  configuredStrategy: ControlReadbackStrategy;
  effectiveStrategy: ControlReadbackStrategy;
  provenance: ReadbackValueProvenance;
  temporalPrecision: StructuredDatePrecision | null;
}

/**
 * Answers keyed by the current page's required-field identity are created
 * from options observed on that exact recruitment page. Candidate/profile
 * location values and job.answers.preferredCity use AI Offer's own taxonomy
 * and can legitimately differ only in administrative suffixes or separators.
 */
export function readbackValueProvenance(semanticKey: unknown): ReadbackValueProvenance {
  const key = String(semanticKey ?? "").trim();
  if (/^(?:job\.requiredField\.(?:stable|field):|site\.liveRequiredSingleOption\.)/u.test(key)) {
    return "live_page_option";
  }
  if (/^(?:job\.answers\.preferredCity|(?:candidate\.)?(?:basic\.(?:nativePlace|hometown|placeOfOrigin|currentCity)|preferences\.preferredCit(?:y|ies)))$/iu.test(key)) {
    return "ai_offer_taxonomy";
  }
  if (/^(?:candidate\.|basic\.|profile\.|resume\.)/u.test(key)) return "candidate_or_profile_fact";
  return "unknown";
}

/** Exact option identity with presentation-only whitespace/delimiter folding. */
export function normalizePageOptionReadback(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s·._/／>＞,，;；|｜-]+/gu, "");
}

function pageOptionReadbackMatches(actual: unknown, expected: unknown): boolean {
  const left = normalizePageOptionReadback(actual);
  const right = normalizePageOptionReadback(expected);
  return Boolean(left && right) && left === right;
}

function checkedStateMatches(actual: unknown, expected: string | boolean): boolean {
  const normalize = (value: unknown) => /^(?:true|1|yes|y|是|有|同意|已勾选)$/iu.test(
    String(value ?? "").trim()
  );
  return normalize(actual) === (typeof expected === "boolean" ? expected : normalize(expected));
}

function effectiveStrategy(
  configured: ControlReadbackStrategy,
  provenance: ReadbackValueProvenance
): ControlReadbackStrategy {
  if (provenance === "live_page_option" && (
    configured === "administrative_hierarchy_semantic"
  )) return "page_option_exact";
  return configured;
}

/**
 * Resolves temporal precision without looking at the readback value. This is
 * intentionally fail-closed: a missing day in the rendered value must not
 * silently downgrade a day control to month precision.
 */
export function registeredTemporalReadbackPrecision(
  input: RegisteredControlReadbackInput
): StructuredDatePrecision | null {
  if (input.controlAdapter.registrationId === "feishu.month-period.trusted-pointer.v3") {
    return "month";
  }
  if (input.controlAdapter.registrationId === "moka.tap4fun.birth-date.trusted-pointer.v2") {
    return "day";
  }
  if (input.controlAdapter.registrationId === "moka.year-month-select.trusted-pointer.v1") {
    return "month";
  }
  if (input.datePrecision) return input.datePrecision;
  if (input.field?.type === "month") return "month";
  if (structuredDateFromValue(input.expected)) return "day";
  if (structuredMonthDateFromValue(input.expected)) return "month";
  if (input.dateValue) return "day";
  return null;
}

function temporalReadbackMatches(
  input: RegisteredControlReadbackInput,
  precision: StructuredDatePrecision | null
): boolean {
  const expected = input.dateValue ??
    structuredDateFromValue(input.expected) ??
    structuredMonthDateFromValue(input.expected);
  if (!expected || !precision) return false;
  return structuredDateReadbackMatches(
    input.field?.currentValue,
    expected,
    precision
  );
}

/**
 * Applies the readback semantics declared by the selected control adapter.
 * A site-specific Driver is therefore never re-checked with an unrelated
 * generic string comparator after React/Vue rebuilds the field.
 */
export function registeredControlReadbackMatches(
  input: RegisteredControlReadbackInput
): RegisteredControlReadbackDecision {
  const configuredStrategy = input.controlAdapter.readbackStrategy;
  const provenance = readbackValueProvenance(input.semanticKey);
  const strategy = effectiveStrategy(configuredStrategy, provenance);
  const temporalPrecision = strategy === "structured_temporal"
    ? registeredTemporalReadbackPrecision(input)
    : null;
  const actual = input.field?.currentValue ?? "";
  let matches = false;

  switch (strategy) {
    case "feishu_location_path":
      matches = feishuLocationReadback(actual, String(input.expected), input.controlAdapter.adapterCode === "feishu.formily-city-multi-search.trusted-pointer.v1");
      break;
    case "page_option_set_exact":
      matches = exactOptionSetsMatch(actual, input.expected);
      break;
    case "native_value_exact":
      matches = String(actual).trim() === String(input.expected).trim();
      break;
    case "page_option_exact":
      if (input.controlAdapter.registrationId === "generic.native.select.v1" && input.field?.nativeSelectedOptions) {
        const values = nativeSelectRequestedValues(input.expected, input.field.domHints?.multiple ?? input.field.nativeSelectedOptions.length > 1);
        const selected = input.field.nativeSelectedOptions;
        const matched = values.map(value => selected.filter(option => option.value === value || option.label === value));
        matches = values.length > 0 && values.length === selected.length && matched.every(options => options.length === 1) &&
          new Set(matched.map(options => options[0])).size === selected.length;
      } else {
        matches = input.controlAdapter.registrationId === "moka.flat-select.trusted-focus.v1"
          ? mokaFlatSelectValuesMatch(actual, input.expected)
          : pageOptionReadbackMatches(actual, input.expected);
      }
      break;
    case "administrative_city_semantic":
      matches = cityDisplayMatchesFact(actual, input.expected);
      break;
    case "administrative_city_set":
      matches = citySelectionSetMatches(actual, input.expected);
      break;
    case "administrative_hierarchy_semantic":
      matches = mokaNativePlaceReadbackMatches(actual, input.expected);
      break;
    case "structured_temporal":
      matches = input.controlAdapter.registrationId === "moka.year-month-select.trusted-pointer.v1" &&
        (input.field?.temporal?.part === "year" || input.field?.temporal?.part === "month")
        ? mokaYearMonthSelectReadbackMatches(actual, input.expected, input.field.temporal.part)
        : temporalReadbackMatches(input, temporalPrecision);
      break;
    case "checked_state":
      matches = checkedStateMatches(actual, input.expected);
      break;
    case "unsupported":
      matches = false;
      break;
  }

  return {
    matches,
    configuredStrategy,
    effectiveStrategy: strategy,
    provenance,
    temporalPrecision
  };
}
