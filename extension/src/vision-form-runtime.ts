import { maskClearedInformation, maskSupersededInformation, projectCandidateInformation } from "./candidate-information-projection.js";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import {decodeExactOptionSet,isFeishuFormilyOptionSet,isMultipleChoiceField,nativeSelectRequestedValues} from "./form-dialects/feishu-option-set.js";
import { selectorSearchValues } from "./selector-search-values.js";
import { isFeishuLocationTree } from "./control-adapters/feishu-selector-discovery.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { evidenceForField } from "./control-adapters/field-routing.js";
import { bindObservedInstruction } from "./control-adapters/field-routing.js";
import type { ControlAdapterDiagnostic } from "./control-adapters/types.js";
import { maximumDisplayedChoiceOptions, requiredFieldInputKind, type RequiredFieldInputKind } from "../../src/required-field-input.js";
import { supplementalInputError } from "../../src/supplemental-input-error.js";
import { RecruitingError } from "../../src/errors.js";
import { enrichPreferredCityFacts, isPreferredWorkCityField, preferredCityFactForField } from "./preferred-city-policy.js";
import { cityDisplayMatchesFact, uniqueCityOption } from "./city-option-matching.js";
import { observedFieldHasValue, requiredFieldFailures } from "./form-validation.js";
import { assessFieldInformation, fieldInformationRequirement } from "./field-information.js";
import {
  structuredDateFromValue,
  structuredDatePartReadbackMatches,
  structuredDateReadbackMatches,
  structuredMonthDateFromValue,
  type StructuredDatePart
} from "./date-control-strategy.js";
import {
  mokaNativePlaceReadbackMatches
} from "./control-adapters/moka-native-place-driver.js";
import {
  normalizePageOptionReadback,
  readbackValueProvenance
} from "./control-adapters/readback-policy.js";

export interface VisionFillAttempt {
  iteration: number;
  fieldId: string;
  stableFieldKey: string | null;
  label: string;
  value: string;
  success: boolean;
  actual: string;
  error: string | null;
  controlAdapter?: ControlAdapterDiagnostic;
}

export interface DeterministicKnownFactAction {
  type: "fill_field" | "select_option";
  fieldId: string;
  stableFieldKey: string | null;
  semanticKey: string;
  value: string;
  optionSelectionPolicy?: "phone_calling_code_default" | "phone_calling_code_confirmed";
  rangeEndChoice?: boolean;
  reason: string;
}

/**
 * A calling-code selector is identified by the observer's bounded Moka phone
 * compound. The shared phone title alone is deliberately insufficient: the
 * sibling phone input, code shell and Select/Dropdown structure must agree.
 */
export function isPhoneCallingCodeField(field: PageFieldObservation): boolean {
  return field.compound?.kind === "phone_number" && field.compound.role === "calling_code" &&
    ["select", "combobox"].includes(field.type) &&
    ["select", "combobox"].includes(field.controlKind ?? field.type);
}

/**
 * Calling codes use exact committed-option identity and additionally require
 * an empty editable query. Generic combobox readback deliberately supports
 * broader localized labels, which is unsafe for prefix-related codes such as
 * +86 and +886 and cannot prove that a stale query was cleared.
 */
export function phoneCallingCodeReadbackMatches(
  field: PageFieldObservation,
  expected: unknown
): boolean {
  if (!isPhoneCallingCodeField(field)) return false;
  const exact = (value: unknown) => String(value ?? "").normalize("NFKC")
    .replace(/\s+/gu, "").trim();
  return Boolean(exact(field.currentValue)) && exact(field.currentValue) === exact(expected) &&
    !exact(field.compound?.kind === "phone_number" ? field.compound.queryValue : "");
}

/**
 * A required Moka work-city control with one live leaf is not a candidate
 * preference question: the recruitment page has already constrained the
 * answer to that single value. The caller must populate `options` from the
 * currently open Moka popup before using this decision.
 */
export function soleRequiredMokaPreferredCityOption(
  field: PageFieldObservation
): string | null {
  if (!field.required || observedFieldHasValue(field) ||
    !isPreferredWorkCityField(field) ||
    !/select|combobox/i.test(`${field.type} ${field.controlKind ?? ""}`)) return null;
  const options = [...new Set(field.options.map((option) => rendered(option)).filter(Boolean))];
  return options.length === 1 ? options[0]! : null;
}

export const REQUIRED_FIELD_ATTEMPT_LIMIT = 1;

export type VisionFieldAttemptDecision =
  | { action: "completed"; failureCount: 0 }
  | { action: "skip_optional"; failureCount: 1 }
  | { action: "retry_required"; failureCount: number }
  | { action: "break_required"; failureCount: number };

/**
 * Field-level failure policy for iterative form filling.
 *
 * Required fields own an independent circuit breaker keyed by their stable
 * identity and expected value. Optional fields never consume that breaker:
 * their first failed readback is skipped for the remainder of the run.
 */
export function registerVisionFieldAttempt(
  requiredFailureCounts: Map<string, number>,
  field: Pick<PageFieldObservation, "stableFieldKey" | "fieldId" | "label" | "type" | "required">,
  expectedValue: unknown,
  success: boolean
): VisionFieldAttemptDecision {
  const identity = field.stableFieldKey ?? `fieldId:${field.fieldId}:${field.label}:${field.type}`;
  const attemptKey = `${identity}\u0000${rendered(expectedValue)}`;
  if (success) {
    requiredFailureCounts.delete(attemptKey);
    return { action: "completed", failureCount: 0 };
  }
  if (!field.required) return { action: "skip_optional", failureCount: 1 };
  const failureCount = (requiredFailureCounts.get(attemptKey) ?? 0) + 1;
  requiredFailureCounts.set(attemptKey, failureCount);
  return failureCount >= REQUIRED_FIELD_ATTEMPT_LIMIT
    ? { action: "break_required", failureCount }
    : { action: "retry_required", failureCount };
}

/**
 * Local convergence guard for iterative visual filling. Once every required
 * control has a value and deterministic identity readback is clean, the form
 * is ready for the dedicated declaration/review/submit stages. The model must
 * not be allowed to keep editing already-correct fields indefinitely.
 */
export function visionFormReadyForFinalReview(
  observation: PageObservation,
  criticalReadbackFailures: readonly string[] = []
): boolean {
  return requiredFieldFailures(observation.fields).length === 0 &&
    !observation.fields.some(field => field.required &&
      assessFieldInformation(field, field.currentValue).status === "insufficient") &&
    criticalReadbackFailures.length === 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rendered(value: unknown): string {
  if (Array.isArray(value)) return value.map(rendered).filter(Boolean).join("、");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function normalizedDate(value: unknown): string {
  const text = rendered(value)
    .replace(/[年/.]/g, "-")
    .replace(/月/g, "")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const match = text.match(/((?:19|20)\d{2})-(\d{1,2})/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : "";
}

function degreeRank(value: string): number {
  if (/博士|phd|doctor/i.test(value)) return 5;
  if (/硕士|研究生|master/i.test(value)) return 4;
  if (/本科|学士|bachelor/i.test(value)) return 3;
  if (/大专|专科|associate|college/i.test(value)) return 2;
  if (/高中|中专|中职|high/i.test(value)) return 1;
  return 0;
}

function derivedHighestDegree(candidate: Record<string, unknown>): string {
  const basic = record(candidate.basic) ?? record(candidate.profile) ?? record(candidate.personal) ?? {};
  const direct = rendered(basic.highestDegree ?? candidate.highestDegree ?? candidate.degree);
  if (direct) return direct;
  const education = candidate.educations ?? candidate.education;
  if (!Array.isArray(education)) return "";
  return education.flatMap((entry) => {
    const item = record(entry);
    const degree = rendered(item?.degree ?? item?.educationLevel ?? item?.学历);
    return degree ? [{ degree, rank: degreeRank(degree) }] : [];
  }).sort((left, right) => right.rank - left.rank)[0]?.degree ?? "";
}

function derivedFirstWorkStart(candidate: Record<string, unknown>): string {
  const basic = record(candidate.basic) ?? record(candidate.profile) ?? record(candidate.personal) ?? {};
  const direct = normalizedDate(
    basic.firstWorkStartDate ?? basic.workStartDate ?? candidate.firstWorkStartDate ?? candidate.workStartDate
  );
  if (direct) return direct;
  const work = candidate.workExperiences ?? candidate.workExperience ?? candidate.work;
  if (!Array.isArray(work)) return "";
  return work.flatMap((entry) => {
    const item = record(entry);
    const date = normalizedDate(item?.startDate ?? item?.startAt ?? item?.from);
    return date ? [date] : [];
  }).sort()[0] ?? "";
}

function derivedWorkExperienceYears(candidate: Record<string, unknown>): string {
  const work = candidate.workExperiences ?? candidate.workExperience ?? candidate.work;
  if (!Array.isArray(work)) return "";
  const ranges = work.flatMap((entry) => {
    const item = record(entry);
    if (!item) return [];
    const start = normalizedDate(item.startDate ?? item.startAt ?? item.from);
    if (!start) return [];
    const end = normalizedDate(item.endDate ?? item.endAt ?? item.to) || normalizedDate(new Date().toISOString());
    return [{ start, end }];
  });
  if (!ranges.length) return "";
  const [startYear, startMonth] = ranges
    .map((range) => range.start)
    .sort()[0]!
    .split("-")
    .map(Number);
  const [endYear, endMonth] = ranges
    .map((range) => range.end)
    .sort()
    .at(-1)!
    .split("-")
    .map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return "";
  const months = Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth);
  const years = Math.max(1, Math.min(50, Math.round(months / 12)));
  return `${years} 年`;
}

/**
 * Adds only deterministic, candidate-derived aliases needed by whole-form ATS
 * fields. In particular, Moka's “开始工作年月” is one candidate-level value;
 * it must not be expanded once per work-experience entry.
 */
export function enrichVisionCandidateFacts(
  packagePayload: Record<string, unknown>,
  baseFacts: Record<string, string>,
  jobContext: Record<string, unknown> = {},
  applicationProfile: Record<string, unknown> = {}
): Record<string, string> {
  const facts = { ...baseFacts };
  maskSupersededInformation(facts, applicationProfile);
  const candidate = record(projectCandidateInformation(packagePayload, applicationProfile).candidate) ?? {};
  const basic = record(candidate.basic) ?? record(candidate.profile) ?? record(candidate.personal) ?? {};
  const authoritativeIdentityFacts: Array<[string, unknown]> = [
    ["candidate.basic.fullName", basic.fullName ?? basic.name],
    ["candidate.basic.phone", basic.phone ?? basic.mobile],
    ["candidate.basic.email", basic.email],
    ["candidate.basic.currentCity", basic.currentCity ?? basic.city],
    ["candidate.basic.nativePlace", basic.nativePlace ?? basic.hometown ?? basic.placeOfOrigin],
    ["candidate.basic.birthDate", basic.birthDate],
    ["candidate.basic.age", basic.age],
    ["candidate.basic.gender", basic.gender]
  ];
  for (const [key, rawValue] of authoritativeIdentityFacts) {
    const value = rendered(rawValue);
    if (!value) continue;
    facts[key] = value;
    // The final candidate profile overrides stale parser/fieldFacts aliases in
    // the same package. Keep both canonical spellings consistent so helpers
    // that accept legacy `basic.*` keys cannot select the older value first.
    facts[key.replace(/^candidate\./, "")] = value;
  }
  const highestDegree = derivedHighestDegree(candidate);
  if (highestDegree) {
    facts["candidate.basic.highestDegree"] = highestDegree;
    facts["basic.highestDegree"] = highestDegree;
  }
  const firstWorkStart = derivedFirstWorkStart(candidate);
  if (firstWorkStart) {
    const [year, month] = firstWorkStart.split("-");
    facts["candidate.basic.firstWorkStartDate"] = firstWorkStart;
    facts["candidate.basic.firstWorkStartYear"] = year!;
    facts["candidate.basic.firstWorkStartMonth"] = String(Number(month));
  }
  const workExperienceYears = rendered(
    basic.workExperienceYears ?? basic.workYears ?? candidate.workExperienceYears ?? candidate.workYears
  ) || derivedWorkExperienceYears(candidate);
  if (workExperienceYears) {
    facts["candidate.basic.workExperienceYears"] = workExperienceYears;
  }
  const profileFacts = Array.isArray(applicationProfile.facts)
    ? applicationProfile.facts
    : [];
  enrichPreferredCityFacts(facts, candidate, profileFacts);
  if (typeof basic.age === "string" && basic.age !== "") facts["profile.semantic:candidate.age"] = basic.age;
  const ambiguousProfileKeys = new Set<string>();
  const migratedProfileOrigins = new Map<string, string>();
  const putProfileFact = (key: string, value: string) => {
    if (ambiguousProfileKeys.has(key)) return;
    if (facts[key] && facts[key] !== value) {
      delete facts[key];
      ambiguousProfileKeys.add(key);
      // Empty metadata is not a fillable candidate value. Keep conflicts
      // explicit across serialization instead of picking array order.
      facts[`profile.bindingConflict:${key}`] = "";
    } else facts[key] = value;
  };
  const putMigratedProfileFact = (key: string, value: string, origin: string) => {
    facts[`profile.labelIdentityMigration:${key}`] = "";
    const prior = migratedProfileOrigins.get(key);
    if (prior && prior !== origin) {
      // Two old identities cannot become one new fact, even if their current
      // values happen to agree. In particular, never choose a repeat ordinal.
      delete facts[key];
      ambiguousProfileKeys.add(key);
      facts[`profile.bindingConflict:${key}`] = "";
      return;
    }
    migratedProfileOrigins.set(key, origin);
    putProfileFact(key, value);
  };
  for (const rawFact of profileFacts) {
    const fact = record(rawFact);
    if (!fact || rendered(fact.source) !== "user_confirmed") continue;
    const value = rendered(fact.value);
    if (!value) continue;
    const binding = record(fact.fieldBinding);
    if (binding) {
      if (rendered(binding.jobId) !== rendered(jobContext.jobId) || !rendered(binding.jobId)) continue;
      const stable = rendered(binding.stableFieldKey);
      if (!stable || !Array.isArray(fact.stableFieldKeys) ||
        fact.stableFieldKeys.length !== 1 || fact.stableFieldKeys[0] !== stable) continue;
      putProfileFact(boundProfileKey(stable, binding.sectionKey, binding.groupIndex), value);
      const canonicalSource = canonicalLegacySourceProfileKey(stable, rendered(fact.label));
      if (canonicalSource) {
        // Retain the exact job/section/row authority; never publish this
        // migration as a reusable label or semantic fact.
        putProfileFact(boundProfileKey(canonicalSource, binding.sectionKey, binding.groupIndex), value);
      }
      const canonicalChoice = canonicalLegacyChoiceProfileKey(stable, rendered(fact.label)) ??
        canonicalLegacyQualifiedNativeProfileKey(stable, rendered(fact.label));
      if (canonicalChoice) putMigratedProfileFact(
        boundProfileKey(canonicalChoice, binding.sectionKey, binding.groupIndex), value, stable);
      // A bound confirmation must never also become a cross-job label or
      // semantic fact, including when reading alongside old unscoped data.
      continue;
    }
    const normalized = normalizedLabel(fact.normalizedLabel ?? fact.label);
    const labelAliases = normalizedProfileFieldLabelAliases(
      fact.label,
      fact.normalizedLabel
    );
    const stableFieldKeys = Array.isArray(fact.stableFieldKeys) ? fact.stableFieldKeys : [];
    // Older confirmed birth-date requests used a generic date placeholder as
    // the key. Recover only this explicitly titled candidate fact, never a
    // job/row-bound answer or a date inferred from another field's key.
    if (isCandidateBirthDateLabel(rendered(fact.label)) && structuredMonthDateFromValue(value) &&
      stableFieldKeys.length === 1 && /^basic\.(?:日期_年月日|出生日期(?:_年龄)?(?:_birth_date(?:_age)?)?)\.native$/u.test(rendered(stableFieldKeys[0]))) {
      putMigratedProfileFact("profile.semantic:candidate.birth_date", value, rendered(stableFieldKeys[0]));
    }
    const repeatKeys = stableFieldKeys.map(rendered).filter(key => /^(?:education|work|internship|project)(?:[.\[])/i.test(key));
    if (new Set(repeatKeys).size > 1) {
      // Old backend documents could merge two rows by label and union their
      // keys. Their single remaining value cannot safely recover both rows.
      for (const key of repeatKeys) facts[`profile.repeatBindingConflict:${key}`] = "";
      continue;
    }
    const semanticKey = rendered(fact.semanticKey);
    if (semanticKey) putProfileFact(`profile.semantic:${semanticKey}`, value);
    // The Backend's information policy supplies canonical label aliases. They
    // are candidate-only; row and third-party fields exclude reusable labels.
    if (Array.isArray(fact.fieldAliases)) for (const alias of fact.fieldAliases) {
      if (typeof alias === "string" && alias.trim()) putProfileFact(`profile.requiredField.label:${normalizedLabel(alias)}`, value);
    }
    // Never discard a persisted field/row binding by publishing a second,
    // label-only alias. Identical labels in two repeat rows are not one fact.
    if (normalized && !stableFieldKeys.some(key => rendered(key))) {
      putProfileFact(`profile.requiredField.label:${normalized}`, value);
    }
    for (const rawKey of stableFieldKeys) {
      const stableFieldKey = rendered(rawKey);
      // Application-profile facts are reusable across jobs, so a stable key
      // alone is not enough authority. A previous page can accidentally assign
      // the same key to a neighboring semantic field (for example school region
      // and school name). Keep the fact scoped to both the stable identity and
      // a normalized visible-label alias. Current-job answers below remain
      // directly bound because they were confirmed for this exact page/job.
      if (!stableFieldKey) continue;
      for (const labelAlias of labelAliases) {
        putProfileFact(`profile.requiredField.stableLabel:${stableFieldKey}:${labelAlias}`, value);
      }
      const canonicalChoice = canonicalLegacyChoiceProfileKey(stableFieldKey, rendered(fact.label)) ??
        canonicalLegacyQualifiedNativeProfileKey(stableFieldKey, rendered(fact.label));
      if (canonicalChoice) for (const labelAlias of labelAliases) {
        putMigratedProfileFact(`profile.requiredField.stableLabel:${canonicalChoice}:${labelAlias}`, value, stableFieldKey);
      }
    }
  }
  maskClearedInformation(facts,applicationProfile);
  const jobAnswers = record(jobContext.answers) ?? {};
  const preferredCityAnswer = record(jobAnswers.preferredCity);
  const preferredCity = rendered(preferredCityAnswer?.value);
  if (preferredCity && rendered(preferredCityAnswer?.source) === "user_confirmed") {
    // The key is the provenance: unlike resume preferences, this value was
    // fixed for the specific, user-confirmed job in the current batch.
    facts["job.answers.preferredCity"] = preferredCity;
  }
  const requiredFieldAnswers = Array.isArray(jobContext.requiredFieldAnswers)
    ? jobContext.requiredFieldAnswers
    : [];
  for (const rawAnswer of requiredFieldAnswers) {
    const answer = record(rawAnswer);
    if (!answer) continue;
    const fieldId = rendered(answer.fieldId);
    const stableFieldKey = rendered(answer.stableFieldKey);
    const value = rendered(answer.value);
    if (!fieldId || !value) continue;
    // A fieldId is only the ordinal position in one DOM observation. Once the
    // page supplied a stable semantic identity, retaining the ordinal alias can
    // leak this answer into a different control after a repeat section rebuild.
    if (stableFieldKey) facts[`job.requiredField.stable:${stableFieldKey}`] = value;
    else facts[`job.requiredField.field:${fieldId}`] = value;
    const optionSet = Array.isArray(answer.value) ? decodeExactOptionSet(answer.value) : null;
    if (optionSet && stableFieldKey) facts[`job.requiredField.optionSet.stable:${stableFieldKey}`] = JSON.stringify(optionSet);
  }
  return facts;
}

function normalizedLabel(value: unknown): string {
  return rendered(value)
    .toLowerCase()
    .replace(/[＊*()（）【】\[\]{}<>《》:：｜|·・._\s-]+/g, "");
}

function normalizedProfileFieldLabelAliases(...values: unknown[]): string[] {
  const aliases = new Set<string>();
  for (const value of values) {
    const text = rendered(value);
    if (!text) continue;
    const normalized = normalizedLabel(text);
    if (normalized) aliases.add(normalized);
    const segments = text.split(/\s*[·›>]\s*/u).map((segment) => segment.trim()).filter(Boolean);
    for (let index = 1; index < segments.length; index += 1) {
      const suffix = normalizedLabel(segments.slice(index).join(" · "));
      if (suffix) aliases.add(suffix);
    }
  }
  return [...aliases];
}

/** The same display identity must be used when asking and reading the answer. */
function supplementalFieldLabel(field: PageFieldObservation, includeRow = true, legacyRangeLabel = false): string {
  // A custom field-owned range already carries both the original question
  // and its endpoint/unit. Restoring its unsuffixed caption loses that role.
  if (field.temporal?.scope === "field") return rendered(field.label);
  const requirement = fieldInformationRequirement(field);
  const originalLabel = rendered(field.domHints?.fieldLabel);
  const base = requirement && originalLabel
    ? [...(field.labelPath?.slice(0, -1) ?? []), originalLabel].filter(Boolean).join(" · ")
    : candidateInformationRequestLabel(field);
  const part = requirement?.kind === "date" ? requirement.part : undefined;
  const partLabel = part === "year" ? "年" : "月";
  // Keep the question, endpoint and unit in one leaf: clients may shorten a
  // path at its last separator. Only structurally observed split ranges have
  // endpoint metadata; a date-like caption alone must not invent a range.
  const edge = field.temporal?.edge;
  const splitRange = !legacyRangeLabel && part && field.temporal?.layout === "year_month_range"
    && (edge === "start" || edge === "end");
  const label = splitRange
    ? `${base}（${edge === "start" ? "开始" : "结束"}${part === "year" ? "年份" : "月份"}）`
    : part && !new RegExp(`(?:^|[·\\s])${partLabel}$`, "u").test(base)
      ? `${base} · ${partLabel}` : base;
  const row = repeatFieldIndex(field) ?? Number(field.stableFieldKey?.match(/#(\d+)$/)?.[1] ?? -1);
  return includeRow && requirement && repeatSectionKindForField(field) && row >= 0
    && !label.endsWith(`（第${row + 1}条）`) ? `${label}（第${row + 1}条）` : label;
}

function boundProfileKey(stableKey: string, section: unknown, groupIndex: unknown): string {
  return `profile.requiredField.bound:${JSON.stringify([stableKey, rendered(section), groupIndex ?? null])}`;
}

function boundProfileFactForField(field: PageFieldObservation, facts: Record<string, string>) {
  if (!field.stableFieldKey) return null;
  const key = boundProfileKey(field.stableFieldKey, field.sectionKey, field.groupIndex);
  if (`profile.bindingConflict:${key}` in facts) {
    if (field.required) throw supplementalBindingError(field);
    return null;
  }
  const value = rendered(facts[key]);
  return value ? { key, value } : null;
}

function canonicalLegacySourceProfileKey(stable: string, label: string): string | null {
  const leaf = rendered(label).split("·").at(-1)?.trim() ?? "";
  if (!/^(?:请选择)?(?:招聘)?信息来源(?:渠道)?$|^(?:招聘)?来源渠道$|^招聘渠道$|^获知.*(?:渠道|途径)$/.test(leaf)) return null;
  const parts = stable.match(/^(.*\.)([^.]+)\.(combobox|select)(#\d+)?$/);
  if (!parts || !["请选择", leaf].includes(parts[2]!)) return null;
  return `${parts[1]}recruiting_source.${parts[3]}${parts[4] ?? ""}`;
}

/** Only labeled profile facts can migrate an old presentation-only choice
 * slot. Job answers without a title remain bound to their original key. */
function canonicalLegacyChoiceProfileKey(stable: string, label: string): string | null {
  const parts = stable.match(/^(.*\.)([^.]+)\.(combobox|select)(?:#\d+)?$/i);
  if (!parts) return null;
  const leaf = rendered(label).split("·").at(-1)?.trim() ?? "";
  if (!leaf || /^(?:年|月|year|month|请选择|请搜索|please\s*select)$/i.test(leaf)) return null;
  // Same label fallback normalization as the self-contained page observer.
  const slot = leaf.replace(/[＊*]\s*(?:必填)?/g, "")
    .replace(/[()（）【】\[\]{}<>《》:：｜|·・._-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!slot || slot === "field") return null;
  const oldSlot = parts[2]!.toLowerCase();
  const presentationOnly = /^(?:请选择|请搜索|please_select|select_one|choose_one)$/.test(oldSlot) ||
    ["请输入", "请选择", "请搜索"].some(prefix => oldSlot === `${prefix}${slot}` || oldSlot === `${prefix}_${slot}`);
  if (!presentationOnly) return null;
  return `${parts[1]}${slot}.${parts[3]}`;
}

function canonicalLegacyQualifiedNativeProfileKey(stable: string, label: string): string | null {
  const leaf = rendered(label).split("·").at(-1)?.trim() ?? "";
  const slot = /^(?:个人邮箱|个人电子邮件|personal\s+e-?mail(?:\s+address)?)$/i.test(leaf) ? "personal_email"
    : /^(?:姓名|名字)拼音|^(?:name\s+pinyin|pinyin\s+name)/i.test(leaf) ? "name_pinyin"
    : /^(?:导师)(?:姓名|名字)|^(?:academic\s+)?(?:advisor|supervisor|mentor)\s+name/i.test(leaf) ? "advisor_name" : null;
  if (!slot) return null;
  const parts = stable.match(slot === "personal_email"
    ? /^(.*\.)email\.native(?:#\d+)?$/ : /^(.*\.)full_name\.native(?:#\d+)?$/);
  return parts ? `${parts[1]}${slot}.native` : null;
}

function supplementalProfileKeysForField(field: PageFieldObservation): string[] {
  const aliases = normalizedProfileFieldLabelAliases(
    field.label,
    field.labelPath?.join(" · "),
    supplementalFieldLabel(field),
    // Previously saved requests did not display row numbers. The stable key
    // still has to match exactly, so this never crosses a repeat-row boundary.
    supplementalFieldLabel(field, false),
    // Old split-range requests lost the endpoint in their display label.
    // Read those aliases only under the same exact stable key below.
    supplementalFieldLabel(field, true, true),
    supplementalFieldLabel(field, false, true)
  );
  // Before source Select identities were stabilized, confirmed profile facts
  // used the placeholder (or, after commit, the title) as the semantic slot.
  // Migrate only title-scoped profile answers, never an old unlabeled fieldId
  // or job stable-key answer that may belong to another placeholder control.
  const sourceSlot = field.stableFieldKey?.match(/^(.*\.)recruiting_source\.(combobox|select)(#\d+)?$/);
  const legacySourceKeys = sourceSlot && /^(?:请选择)?(?:招聘)?信息来源(?:渠道)?$|^(?:招聘)?来源渠道$|^招聘渠道$|^获知.*(?:渠道|途径)$/.test(
    rendered(field.label).split("·").at(-1)?.replace(/\s+/g, "") ?? ""
  ) ? ["请选择", rendered(field.label).split("·").at(-1)?.trim()].filter(Boolean).map(slot =>
    `${sourceSlot[1]}${slot}.${sourceSlot[2]}${sourceSlot[3] ?? ""}`) : [];
  return [
    ...(field.stableFieldKey ? aliases.map(alias =>
      `profile.requiredField.stableLabel:${field.stableFieldKey}:${alias}`) : []),
    ...legacySourceKeys.flatMap(key => aliases.map(alias => `profile.requiredField.stableLabel:${key}:${alias}`)),
    ...applicationProfileSemanticKeysForField(field).map(key => `profile.semantic:${key}`),
    // Legacy unbound labels cannot identify an education/work repeat row.
    ...(repeatSectionKindForField(field) || isThirdPartyPersonField(field) ? [] :
      [`profile.requiredField.label:${normalizedLabel(field.label)}`])
  ];
}

function supplementalBindingError(field: PageFieldObservation): RecruitingError {
  return new RecruitingError({
    code: "FORM_FILL_VALIDATION_FAILED", stage: "form_observation", retryable: false,
    message: `已收到“${supplementalFieldLabel(field)}”的补充答案，但无法唯一关联当前字段；当前岗位未提交。`,
    userAction: "这是补充答案与页面字段的匹配问题，请勿重复填写同一答案。",
    details: {
      reasonCode: "supplemental_answer_binding_failed", fieldId: field.fieldId,
      stableFieldKey: field.stableFieldKey ?? null, label: supplementalFieldLabel(field)
    }
  });
}

function profileSupplementalFactForField(
  field: PageFieldObservation, facts: Record<string, string>
): { key: string; value: string } | null {
  const customQuestion = field.fieldSource?.dialect === "feishu_formily" && /^\d+$/u.test(field.fieldSource.fieldPath);
  const keys = supplementalProfileKeysForField(field).filter(key => !customQuestion ||
    Boolean(field.stableFieldKey && key.startsWith(`profile.requiredField.stableLabel:${field.stableFieldKey}:`)));
  const requiresUniqueProfileAnswer = customQuestion || fieldInformationRequirement(field) ||
    keys.some(key => `profile.labelIdentityMigration:${key}` in facts) ||
    /\.recruiting_source\.(?:combobox|select)(?:#\d+)?$/.test(field.stableFieldKey ?? "");
  if (requiresUniqueProfileAnswer && (keys.some(key => `profile.bindingConflict:${key}` in facts) ||
    `profile.repeatBindingConflict:${field.stableFieldKey}` in facts)) {
    if (field.required) throw supplementalBindingError(field);
    return null;
  }
  const candidates = keys.flatMap(key => {
    const raw = rendered(facts[key]);
    const value = field.temporal ? temporalDatePart(raw, field.temporal.part) : raw;
    return value && applicationProfileValueCompatibleWithField(field, value) ? [{ key, value }] : [];
  });
  if (new Set(candidates.map(fact => fact.value)).size > 1 && requiresUniqueProfileAnswer) {
    if (field.required) throw supplementalBindingError(field);
    return null;
  }
  return candidates[0] ?? null;
}

function labelSimilarity(left: string, right: string): number {
  const a = normalizedLabel(left);
  const b = normalizedLabel(right);
  if (!a || !b) return 0;
  if (a === b) return 80;
  if (a.includes(b) || b.includes(a)) return 45;
  return 0;
}

/** Rebinds an action to the newly rendered DOM observation. */
export function findDynamicReadbackField(
  before: PageFieldObservation,
  after: PageObservation
): PageFieldObservation | null {
  return bindObservedInstruction(after, {
    fieldId: before.fieldId, stableFieldKey: before.stableFieldKey,
    selector: before.selector, expectedLabel: before.label, type: before.type, value: ""
  });
}

export function visualFailureDetails(message: unknown): string[] {
  return rendered(message)
    .split(/[；;，,、\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function classifyVisualFailureReason(
  details: string[]
): "required_degree_missing" | "site_validation_blocked" {
  const failures = details.map((entry) => rendered(entry)).filter(Boolean);
  return failures.length > 0 && failures.every((entry) => /最高学历|highest[_\s.-]?degree/i.test(entry))
    ? "required_degree_missing"
    : "site_validation_blocked";
}

function normalizedScalar(value: unknown): string {
  return rendered(value).toLowerCase().replace(/[\s·._-]+/g, "");
}

function normalizedCityScalar(value: unknown): string {
  return normalizedScalar(value)
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u, "");
}

function candidateFact(
  facts: Record<string, string>,
  patterns: RegExp[]
): { key: string; value: string } | null {
  for (const pattern of patterns) {
    // Supplemental answers were already checked against their exact field
    // binding above. A failed binding must not become an email/name match
    // merely because its storage key contains that word.
    const match = Object.entries(facts).find(([key, value]) => value &&
      !/^(?:profile\.|job\.requiredField\.)/.test(key) && pattern.test(key));
    if (match) return { key: match[0], value: match[1] };
  }
  return null;
}

function indexedCandidateFact(
  facts: Record<string, string>,
  section: "work" | "internship" | "project" | "education",
  index: number,
  attributes: string[]
): { key: string; value: string } | null {
  const candidates: string[] = [];
  for (const attribute of attributes) {
    candidates.push(
      `resume.${section}.${index}.${attribute}`,
      `${section}[${index}].${attribute}`,
      `${section}.${index}.${attribute}`,
      `${section}-${index + 1}.${attribute}`
    );
    if (index === 0) candidates.push(`${section}.${attribute}`);
  }
  for (const key of candidates) {
    const value = rendered(facts[key]);
    if (value) return { key, value };
  }
  return null;
}

/** The range's end may be an explicit date or Present, never both.
 * Missing dates do not imply current employment. Only this group's exact
 * answer/endDate authorizes the optional toggle. */
export function rangeEndChoiceForField(field: PageFieldObservation, facts: Record<string, string>): { key: string; value: string } | null {
  if (field.dateRange?.role !== "present" || field.observedControlKind !== "moka_range_present") return null;
  const directKey = `job.requiredField.stable:${field.stableFieldKey}`;
  if (/^(?:true|false)$/u.test(facts[directKey] ?? "")) return { key: directKey, value: facts[directKey]! };
  if (field.dateRange.fieldScoped) return null;
  const identity = `${field.label} ${field.sectionKey}`;
  const section = /实习|internship/iu.test(identity) ? "internship" : /项目|project/iu.test(identity) ? "project" :
    /工作|work/iu.test(identity) ? "work" : /教育|education/iu.test(identity) ? "education" : null;
  if (!section) return null;
  const index = field.groupIndex ?? 0;
  const end = indexedCandidateFact(facts, section, index, ["endDate"]);
  if (!end) return null;
  if (/^(?:至今|现在|目前|present|current|now|ongoing)$/iu.test(end.value.trim())) return { key: end.key, value: "true" };
  if (/^\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?$/u.test(end.value.trim()) && normalizedDate(end.value)) return { key: end.key, value: "false" };
  return null;
}

/**
 * Reject an impossible structured resume range before any page Driver runs.
 * A start date after its matching end/graduation date is invalid candidate
 * data, not a control-interaction failure. Job-specific supplemental answers
 * are intentionally excluded because they may be the user's correction.
 */
function structuredTemporalRangeIsInvalid(
  fact: { key: string; value: string },
  facts: Record<string, string>
): boolean {
  const match = fact.key.match(/^(.*\.)(startDate|endDate|graduationDate)$/i);
  if (!match) return false;
  const prefix = match[1]!;
  const edge = match[2]!.toLowerCase();
  const fullFactValue = facts[fact.key] || fact.value;
  const start = normalizedDate(edge === "startdate" ? fullFactValue : facts[`${prefix}startDate`]);
  const end = normalizedDate(edge === "startdate"
    ? facts[`${prefix}endDate`] || facts[`${prefix}graduationDate`]
    : fullFactValue);
  return Boolean(start && end && start > end);
}

function structuredCandidateFactForField(
  field: PageFieldObservation,
  facts: Record<string, string>
): { key: string; value: string } | null {
  const identity = `${field.label} ${field.sectionKey ?? ""} ${field.stableFieldKey ?? ""}`;
  // Moka also exposes one candidate-level graduation summary in personal
  // information. It deliberately has a `basic.graduation_date` identity so
  // it cannot collide with a repeated education-row endpoint; its source is
  // still the first education record's authoritative end date.
  const personalGraduationSummary = field.sectionKey === "basic" &&
    /(?:毕业(?:时间|日期|年月|年份)|graduation(?:[_\s.-]?(?:date|time|year|month))?)/i.test(field.label) &&
    /(?:^|\.)basic\.graduation_date(?:\.|$)/i.test(field.stableFieldKey ?? "");
  if (personalGraduationSummary &&
    (!rendered(field.currentValue) || assessFieldInformation(field, field.currentValue).status === "insufficient")) {
    for (const attribute of ["endDate", "graduationDate"]) {
      const fact = indexedCandidateFact(facts, "education", 0, [attribute]);
      if (fact && applicationProfileValueCompatibleWithField(field, fact.value)) return fact;
    }
    return null;
  }
  // Stable identities may supply the section even when the visible label has
  // no section prefix (for example a graduation field under personal info).
  // Identity components are space-separated; match whole section tokens.
  const section = /实习经历|internship/i.test(identity)
    ? "internship"
    : /工作经历|任职经历|(?:^|[.\[\s])work(?=[.\[\s]|$)/i.test(identity)
      ? "work"
      : /项目经历|项目经验|(?:^|[.\[\s])project(?=[.\[\s]|$)/i.test(identity)
        ? "project"
        : /教育背景|教育经历|(?:^|[.\[\s])education(?=[.\[\s]|$)/i.test(identity)
          ? "education"
          : null;
  if (!section) return null;
  const groupIndex = typeof field.groupIndex === "number" && field.groupIndex >= 0
    ? field.groupIndex
    : Number(
      field.stableFieldKey?.match(/\[(\d+)\]/)?.[1] ??
      field.stableFieldKey?.match(/#(\d+)$/)?.[1] ??
      0
    );
  // A complete date picker is one field, so page observation intentionally
  // leaves `temporal` empty (that metadata is reserved for split year/month
  // controls). It still has an explicit section and edge in its visible/stable
  // identity. Resolve that field from the same indexed package date facts
  // before treating it as missing candidate information.
  const explicitStartDate = /开始(?:时间|日期|年月)|入学(?:时间|日期|年月)|start[_\s.-]?date/i.test(identity);
  const explicitEndDate = /结束(?:时间|日期|年月)|毕业(?:时间|日期)|end[_\s.-]?date|graduation[_\s.-]?date/i.test(identity);
  if ((!rendered(field.currentValue) || assessFieldInformation(field, field.currentValue).status === "insufficient") &&
    explicitStartDate !== explicitEndDate) {
    const attributes = explicitStartDate
      ? ["startDate"]
      : section === "education"
        ? ["endDate", "graduationDate"]
        : ["endDate"];
    for (const attribute of attributes) {
      const fact = indexedCandidateFact(facts, section, groupIndex, [attribute]);
      if (fact && applicationProfileValueCompatibleWithField(field, fact.value)) return fact;
    }
    return null;
  }
  if (section === "education") {
    if (/学校|院校|school/i.test(identity)) return indexedCandidateFact(facts, "education", groupIndex, ["school"]);
    if (/学历|学位|degree/i.test(identity)) return indexedCandidateFact(facts, "education", groupIndex, ["degree", "educationLevel"]);
    if (/专业|major/i.test(identity)) return indexedCandidateFact(facts, "education", groupIndex, ["major"]);
  }
  if (section === "work" || section === "internship") {
    if (/公司|单位|company/i.test(identity)) {
      return indexedCandidateFact(facts, section, groupIndex, ["companyName", "company"]);
    }
    if (/岗位|职位|职务|title|position/i.test(identity)) {
      return indexedCandidateFact(facts, section, groupIndex, ["positionTitle", "title"]);
    }
    if (/地点|城市|city|location/i.test(identity)) return indexedCandidateFact(facts, section, groupIndex, ["city", "location"]);
    if (/职责|描述|内容|description|responsibilities/i.test(identity)) {
      return indexedCandidateFact(facts, section, groupIndex, ["responsibilities", "description"]);
    }
  }
  if (section === "project") {
    if (/项目名称|项目名|project.*name|(?:^|[.\s])name/i.test(identity)) {
      return indexedCandidateFact(facts, "project", groupIndex, ["projectName", "name"]);
    }
    if (/角色|职责|role/i.test(identity)) return indexedCandidateFact(facts, "project", groupIndex, ["role"]);
    if (/描述|内容|成果|description|responsibilities/i.test(identity)) {
      return indexedCandidateFact(facts, "project", groupIndex, ["responsibilities", "description"]);
    }
  }
  return null;
}

function temporalDatePart(value: unknown, part: "year" | "month"): string {
  const date = normalizedDate(value);
  if (date) {
    const [year, month] = date.split("-");
    return part === "year" ? year! : String(Number(month));
  }
  const text = rendered(value);
  if (part === "year") return text.match(/(?:19|20)\d{2}/)?.[0] ?? "";
  const month = text.match(/(?:^|[^0-9])(\d{1,2})(?:月)?(?:$|[^0-9])/)?.[1] ?? "";
  if (!month) return "";
  const numeric = Number(month);
  return numeric >= 1 && numeric <= 12 ? String(numeric) : "";
}

function temporalCandidateFactForField(
  field: PageFieldObservation,
  facts: Record<string, string>
): { key: string; value: string } | null {
  const temporal = field.temporal;
  if (!temporal) return null;
  const identity = `${field.label} ${field.stableFieldKey ?? ""}`;
  if (/开始工作年月|首次工作|参加工作|first[_\s.-]?work|work[_\s.-]?start/i.test(identity)) {
    const key = temporal.part === "year"
      ? "candidate.basic.firstWorkStartYear"
      : "candidate.basic.firstWorkStartMonth";
    const value = rendered(facts[key]);
    return value ? { key, value } : null;
  }

  // Moka can ask for one candidate-level graduation month in Personal Info in
  // addition to the repeated education rows. Its stable identity deliberately
  // remains outside `education[*]` so a React rebuild cannot rebind it to a
  // row below, while the authoritative value still comes from the highest
  // (first) education record in the candidate package.
  if (field.sectionKey === "basic" && /毕业|graduation/i.test(identity)) {
    for (const attribute of ["endDate", "graduationDate", "graduationYear"]) {
      const key = `resume.education.0.${attribute}`;
      const value = temporalDatePart(facts[key], temporal.part);
      if (value) return { key, value };
    }
    return null;
  }

  const section = /工作经历|实习经历|(?:^|[.\[])work/i.test(identity)
    ? "work"
    : /项目经历|(?:^|[.\[])project/i.test(identity)
      ? "project"
      : /教育|学校|院校|学历|专业|毕业|(?:^|[.\[])education/i.test(identity)
        ? "education"
        : null;
  if (!section) return null;
  const groupIndex = typeof field.groupIndex === "number" && field.groupIndex >= 0
    ? field.groupIndex
    : Number(field.stableFieldKey?.match(/\[(\d+)\]/)?.[1] ?? 0);
  const edge = temporal.edge === "start" ? "startDate" : "endDate";
  const attributes = section === "education" && temporal.edge === "end"
    ? ["endDate", "graduationDate", "graduationYear"]
    : [edge];
  for (const attribute of attributes) {
    const key = `resume.${section}.${groupIndex}.${attribute}`;
    const value = temporalDatePart(facts[key], temporal.part);
    if (value) return { key, value };
  }
  return null;
}

function isCandidateBirthDateLabel(value: string): boolean {
  return /^(?:出生(?:日期|年月)(?:\s*\(年龄\))?(?:\s*\/\s*Birth Date(?:\s*\(Age\))?)?|birth\s*(?:date|month)(?:\s*\(age\))?)$/iu
    .test(value.normalize("NFKC").trim());
}

function applicationProfileSemanticKeysForField(field: PageFieldObservation): string[] {
  if (isThirdPartyPersonField(field) || repeatSectionKindForField(field)) return [];
  const identity = `${field.label} ${field.sectionKey ?? ""} ${field.stableFieldKey ?? ""}`.toLowerCase();
  const keys: string[] = [];
  if (field.sectionKey === "basic" && field.groupIndex == null && !isThirdPartyPersonField(field) &&
    isCandidateBirthDateLabel(rendered(field.domHints?.fieldLabel || field.label))) {
    keys.push("candidate.birth_date", "candidate.basic.birthDate");
  }
  if (field.groupIndex == null && !isThirdPartyPersonField(field) &&
    /^(?:年龄|周岁|age)$/iu.test(rendered(field.domHints?.fieldLabel || field.label).replace(/^.*·/u, '').trim())) {
    keys.push("candidate.age");
  }
  if (/当前职位|目前职位|现任职位|current[_.\s-]*(?:position|title)/i.test(identity)) {
    keys.push("candidate.current_position");
  }
  if (/教师资格|teacher[_.\s-]*(?:qualification|certificate)/i.test(identity)) {
    keys.push("candidate.teacher_qualification");
  }
  if (/政治面貌|political[_.\s-]*status/i.test(identity)) keys.push("candidate.political_status");
  if (/婚姻状况|marital[_.\s-]*status/i.test(identity)) keys.push("candidate.marital_status");
  if (/(?:^|[·\s])性别(?:$|[·\s])|(?:^|[_.\s-])gender(?:$|[_.\s-])/i.test(identity)) {
    keys.push("candidate.gender");
  }
  if (/民族|ethnicity/i.test(identity)) keys.push("candidate.ethnicity");
  if (/国籍|nationality/i.test(identity)) keys.push("candidate.nationality");
  return keys;
}

function applicationProfileValueCompatibleWithField(field: PageFieldObservation, value: string): boolean {
  if (field.optionSource === "search" && isFeishuFormilyOptionSet(field)) return selectorSearchValues(value)!==null;
  if (isFeishuFormilyOptionSet(field)) {
    const values=decodeExactOptionSet(value);
    return !!values && (!field.options.length || values.every(v=>field.options.filter(option=>option===v).length===1));
  }
  if (isMultipleChoiceField(field)) {
    const values = nativeSelectRequestedValues(value, true);
    return values.length > 0 && (!field.options.length || values.every(v =>
      isPreferredWorkCityField(field) ? uniqueCityOption(field.options, v) !== null : field.options.filter(option => option === v).length === 1));
  }
  // Traceability alone does not prove the required date/region granularity.
  // Reject incomplete facts before planning, not as failed UI interactions.
  if (assessFieldInformation(field, value).status === "insufficient") return false;
  // A closed split-date Select exposes only its committed display value (and
  // a virtualized popup exposes only the currently rendered window). Neither
  // is a complete option domain. Let the registered date Driver discover and
  // validate the requested year/month instead of rejecting a real candidate
  // fact against this partial snapshot.
  if (field.temporal) return true;
  if (!field.options.length) return true;
  if (isPreferredWorkCityField(field)) return uniqueCityOption(field.options, value) !== null;
  const normalizedValue = normalizedLabel(value);
  if (field.options.some((option) => normalizedLabel(option) === normalizedValue)) return true;
  const identity = `${field.label} ${field.stableFieldKey ?? ""}`;
  if (!isPreferredWorkCityField(field) && !/current.*(?:city|location)|所在地|当前所在|当前城市/i.test(identity)) {
    return false;
  }
  const normalizedCity = normalizedCityScalar(value);
  return Boolean(normalizedCity) && field.options.some((option) =>
    normalizedCityScalar(option) === normalizedCity
  );
}

function thirdPartyFieldIdentity(field: PageFieldObservation): string {
  return `${field.label} ${field.sectionKey ?? ""} ${field.stableFieldKey ?? ""} ${field.domHints?.name ?? ""} ${field.domHints?.dataFieldName ?? ""} ${field.domHints?.placeholder ?? ""} ${field.domHints?.ariaLabel ?? ""}`;
}

/**
 * Third-party person fields must never inherit the candidate's own identity.
 * Keep this semantic guard cross-site: ATS-specific markup belongs in page
 * observation, while the person boundary is a product fact-routing rule.
 */
export function isThirdPartyPersonField(field: PageFieldObservation): boolean {
  const identity = thirdPartyFieldIdentity(field);
  if (/^(?:third_party|relation)$/i.test(rendered(field.sectionKey))) return true;
  if (/导师(?:姓名|名字|电话|手机|邮箱)|(?:academic\s+)?(?:advisor|supervisor|mentor)\s+(?:name|phone|email)/i.test(identity)) return true;
  return /紧急联系人|应急联系人|关系人(?:信息|姓名|名字|电话|手机|邮箱)|外部推荐人|推荐人(?:姓名|邮箱|手机|电话)|内推人|介绍人|联系人关系|与本人关系|关系人信息|亲属关系|与公司员工是否有亲属关系|emergency\s*contact|external\s*(?:referrer|recommender)|introducer/i.test(identity) &&
    !/推荐码|内推码|referral\s*code/i.test(identity);
}

function canonicalCandidateIdentityValue(
  candidateFacts: Record<string, string>,
  kind: "name" | "phone" | "email"
): string {
  const keys = kind === "name"
    ? ["candidate.basic.fullName", "basic.fullName", "candidate.basic.name", "basic.name"]
    : kind === "phone"
      ? ["candidate.basic.phone", "basic.phone", "candidate.basic.mobile", "basic.mobile"]
      : ["candidate.basic.email", "basic.email"];
  return keys.map((key) => rendered(candidateFacts[key])).find(Boolean) ?? "";
}

/**
 * Return a value only when the user confirmed it for this exact job/field.
 * Resume facts and reusable application-profile facts are intentionally not
 * accepted here: they remain valid for required-field completion, but must not
 * cause the plugin to add optional application content on its own.
 */
function rawConfirmedCurrentJobFactForField(
  field: PageFieldObservation,
  facts: Record<string, string>
): { key: string; value: string } | null {
  const supplementalKey = field.stableFieldKey
    ? `job.requiredField.stable:${field.stableFieldKey}`
    : `job.requiredField.field:${field.fieldId}`;
  const supplementalValue = rendered(facts[supplementalKey]);
  if (field.optionSource === "search" && isFeishuFormilyOptionSet(field)) {
    const values=selectorSearchValues(facts[`job.requiredField.optionSet.stable:${field.stableFieldKey}`]||supplementalValue);
    return values ? {key:supplementalKey,value:JSON.stringify(values)} : null;
  }
  if (isFeishuFormilyOptionSet(field)) {
    const values=decodeExactOptionSet(facts[`job.requiredField.optionSet.stable:${field.stableFieldKey}`]);
    return values && supplementalValue ? {key:supplementalKey,value:JSON.stringify(values)} : null;
  }
  if (isMultipleChoiceField(field)) {
    const values = decodeExactOptionSet(facts[`job.requiredField.optionSet.stable:${field.stableFieldKey}`]);
    if (values && supplementalValue) return {key:supplementalKey,value:JSON.stringify(values)};
    // Existing Moka/native scalar answers remain readable by their original Driver.
  }
  if (supplementalValue) {
    const value = field.temporal
      ? temporalDatePart(supplementalValue, field.temporal.part)
      : supplementalValue;
    if (value) return { key: supplementalKey, value };
  }

  const intrinsicIdentity = `${field.label} ${field.stableFieldKey ?? ""} ${field.domHints?.name ?? ""} ${field.domHints?.dataFieldName ?? ""} ${field.domHints?.placeholder ?? ""} ${field.domHints?.ariaLabel ?? ""}`;
  const preferredCity = rendered(facts["job.answers.preferredCity"]);
  if (preferredCity &&
    !/推荐码|推荐人|内推码|内推人|内推|referral/i.test(intrinsicIdentity) &&
    isPreferredWorkCityField(field)) {
    return { key: "job.answers.preferredCity", value: preferredCity };
  }
  return null;
}

export function confirmedCurrentJobFactForField(
  field: PageFieldObservation,
  facts: Record<string, string>
): { key: string; value: string } | null {
  const fact = rawConfirmedCurrentJobFactForField(field, facts);
  return fact && applicationProfileValueCompatibleWithField(field, fact.value) ? fact : null;
}

/**
 * Detect a value left by an older/broken run that copied the candidate's own
 * name, phone or email into a third-party field. A current-job or explicitly
 * confirmed profile answer remains authoritative and is allowed to overwrite
 * that stale value instead of asking again.
 */
export function thirdPartyIdentityCollision(
  field: PageFieldObservation,
  candidateFacts: Record<string, string>
): boolean {
  const current = rendered(field.currentValue);
  if (!field.required || !current || !isThirdPartyPersonField(field)) return false;
  if (directSupplementalFactForField(field, candidateFacts)) return false;
  const identity = thirdPartyFieldIdentity(field);
  const kind = /邮箱|电子邮件|\bemail\b/i.test(identity)
    ? "email"
    : /手机|电话|\b(?:phone|mobile|tel)\b/i.test(identity)
      ? "phone"
      : /姓名|名字|full[_\s.-]?name|(?:^|[.\s])name(?:[.#\s]|$)/i.test(identity)
        ? "name"
        : null;
  if (!kind) return false;
  const candidateValue = canonicalCandidateIdentityValue(candidateFacts, kind);
  if (!candidateValue) return false;
  if (kind === "phone") {
    const comparable = (value: string) => {
      const digits = value.replace(/\D/g, "");
      return digits.length > 11 ? digits.slice(-11) : digits;
    };
    return Boolean(comparable(current)) && comparable(current) === comparable(candidateValue);
  }
  return normalizedScalar(current) === normalizedScalar(candidateValue);
}

function rawAuthoritativeCandidateFactForField(
  field: PageFieldObservation,
  facts: Record<string, string>
): { key: string; value: string } | null {
  const currentJobFact = rawConfirmedCurrentJobFactForField(field, facts);
  if (currentJobFact) return currentJobFact;
  const boundProfileFact = boundProfileFactForField(field, facts);
  if (boundProfileFact) return boundProfileFact;
  // A tenant-defined numeric question has its own source identity. Words such
  // as 学校 inside a ranking question do not authorize borrowing school facts.
  // Exact current-job and bound profile answers above remain valid.
  if (field.fieldSource?.dialect === "feishu_formily" && /^\d+$/u.test(field.fieldSource.fieldPath)) {
    return profileSupplementalFactForField(field, facts);
  }
  // Proven education_type is a different fact from the degree. Do not let
  // broad legacy 学历 aliases borrow 本科 for 统招全日制, or vice versa.
  if (field.fieldSource && /(?:^|\.)education_type$/u.test(field.fieldSource.fieldPath)) {
    return field.groupIndex == null ? null : indexedCandidateFact(facts, "education", field.groupIndex, ["educationType", "education_type"]);
  }
  // A prospective custom range is not the candidate's previous employment,
  // education or available date. Only its exact confirmed binding may fill it.
  if (field.temporal?.scope === "field" || (field.fieldSource?.edge && /^\d+$/u.test(field.fieldSource.fieldPath))) return null;
  const intrinsicIdentity = `${field.label} ${field.stableFieldKey ?? ""} ${field.domHints?.name ?? ""} ${field.domHints?.dataFieldName ?? ""} ${field.domHints?.placeholder ?? ""} ${field.domHints?.ariaLabel ?? ""}`;
  const referralIdentity = /推荐码|推荐人|内推码|内推人|内推|referral/i.test(intrinsicIdentity);
  const identity = `${field.label} ${field.stableFieldKey ?? ""}`;
  if (isPreferredWorkCityField(field) && !referralIdentity && !isThirdPartyPersonField(field)) {
    return preferredCityFactForField(field, facts, supplementalProfileKeysForField(field));
  }
  const supplemental = profileSupplementalFactForField(field, facts);
  if (supplemental) return supplemental;
  // A referral code/person is never derivable from a candidate city or broad
  // profile fact. Exact job/profile supplemental answers above remain valid.
  if (referralIdentity) return null;
  // These labels describe another person. Candidate identity facts are not
  // semantically compatible even when a DOM hint happens to contain name,
  // phone or email. Only an exact supplemental field fact above may fill them.
  if (isThirdPartyPersonField(field) || /部门\/职位/i.test(identity)) {
    return null;
  }
  // School geography is not the school name, degree or candidate residence.
  // Exact job/profile bindings above are usable; do not infer a campus city
  // from a school name (one institution may have multiple campuses).
  if (/学校|院校|\b(?:school|university|college)\b/iu.test(field.label) &&
    /城市|所在地|地址|国家|地区|\b(?:city|location|address|country|region)\b/iu.test(field.label)) return null;
  const temporalFact = temporalCandidateFactForField(field, facts);
  if (temporalFact) return temporalFact;
  const structuredFact = structuredCandidateFactForField(field, facts);
  if (structuredFact) return structuredFact;
  const visibleLabel = field.label;
  const contactCaption = rendered(field.domHints?.fieldLabel || visibleLabel.split("·").at(-1));
  // Chinese fullName does not authorize a transliteration/spelling. Only the
  // exact confirmed job/profile answer resolved above can fill this field.
  if (/^(?:姓名|名字)拼音|^(?:name\s+pinyin|pinyin\s+name)/i.test(contactCaption)) return null;
  // These are different channels, not aliases for a candidate's personal
  // email/phone. Exact confirmed supplemental facts above remain valid.
  if (/^(?:学校|校园|大学|学术|教育)(?:邮箱|电子邮件)|^(?:school|university|academic|student)\s+e-?mail|^(?:微信|we\s*chat|weixin)(?:号|\b|\s)/i.test(contactCaption)) return null;
  const fallbackIdentity = `${field.stableFieldKey ?? ""} ${field.domHints?.name ?? ""} ${field.domHints?.dataFieldName ?? ""}`;
  const visibleName = /(?:^|[·\s])姓名|名字|full[_\s-]?name/i.test(visibleLabel) &&
    !/公司|项目|学校|院校|专业/.test(visibleLabel);
  const visibleEmail = /邮箱|电子邮件|\bemail\b/i.test(visibleLabel);
  // The user-visible label is authoritative. Moka and similar React forms can
  // retain misleading input names after a component is reconstructed (for
  // example a name field whose DOM hint still contains "email").
  if (visibleName) {
    return candidateFact(facts, [
      /^(?:candidate\.)?basic\.(?:fullName|name)$/i,
      /(?:basic|candidate\.basic).*(?:fullName|\.name$)/i,
      /姓名|fullName/i
    ]);
  }
  if (visibleEmail) {
    return candidateFact(facts, [
      /^(?:candidate\.)?basic\.email$/i,
      /(?:basic|candidate\.basic).*email/i,
      /邮箱|email/i
    ]);
  }
  const visibleIdentity = `${visibleLabel} ${fallbackIdentity}`;
  if (/full[_\s-]?name/i.test(fallbackIdentity) && !/company|project|school|major/i.test(fallbackIdentity)) {
    return candidateFact(facts, [
      /^(?:candidate\.)?basic\.(?:fullName|name)$/i,
      /(?:basic|candidate\.basic).*(?:fullName|\.name$)/i,
      /姓名|fullName/i
    ]);
  }
  if (/\bemail\b/i.test(fallbackIdentity)) {
    return candidateFact(facts, [
      /^(?:candidate\.)?basic\.email$/i,
      /(?:basic|candidate\.basic).*email/i,
      /邮箱|email/i
    ]);
  }
  if (/手机|电话号码|联系电话|\b(?:phone|mobile)\b/i.test(visibleIdentity)) {
    return candidateFact(facts, [
      /^(?:candidate\.)?basic\.(?:phone|mobile)$/i,
      /(?:basic|candidate\.basic).*(?:phone|mobile)/i,
      /手机|电话|phone|mobile/i
    ]);
  }
  if (/出生(?:日期|年月)|birth[_\s.-]*date/i.test(visibleIdentity)) {
    return candidateFact(facts, [
      /^(?:candidate\.)?basic\.birthDate$/i,
      /(?:basic|candidate\.basic).*birthDate/i,
      /出生日期|birthDate/i
    ]);
  }
  if (/最高学历|highest[_\s.-]?degree/i.test(visibleIdentity)) {
    return candidateFact(facts, [
      /^candidate\.basic\.highestDegree$/i,
      /^(?:candidate\.)?basic\.highestDegree$/i,
      /最高学历|highestDegree/i
    ]);
  }
  if (/籍贯|native.?place|hometown|place.?of.?origin/i.test(visibleIdentity)) {
    return candidateFact(facts, [
      /^candidate\.basic\.nativePlace$/i,
      /^(?:candidate\.)?basic\.(?:nativePlace|hometown|placeOfOrigin)$/i,
      /籍贯|nativePlace|hometown|placeOfOrigin/i
    ]);
  }
  if (/开始工作年月.*年|first_work_start_year/i.test(visibleIdentity)) {
    return candidateFact(facts, [/^candidate\.basic\.firstWorkStartYear$/i]);
  }
  if (/开始工作年月.*月|first_work_start_month/i.test(visibleIdentity)) {
    return candidateFact(facts, [/^candidate\.basic\.firstWorkStartMonth$/i]);
  }
  if (/所在地|当前所在|当前城市|current.*location|current.*city/i.test(visibleIdentity) &&
    !/意向|期望|preferred/i.test(visibleIdentity)) {
    return candidateFact(facts, [
      /^candidate\.basic\.currentCity$/i,
      /^(?:candidate\.)?basic\.currentCity$/i,
      /当前城市|所在地|currentCity/i
    ]);
  }
  if (/工作经验|工作年限|years.*experience|work.*experience/i.test(identity)) {
    return candidateFact(facts, [
      /^candidate\.basic\.workExperienceYears$/i,
      /workExperienceYears|workYears|工作年限|工作经验/i
    ]);
  }
  if (isPreferredWorkCityField(field)) {
    return candidateFact(facts, [
      /^job\.answers\.preferredCity$/i,
      /(?:preferences|intention).*(?:preferredCity|city|location)/i,
      /意向.*城市|期望.*城市|工作城市/i
    ]);
  }
  return null;
}

/**
 * Return a fact only when both the field semantics and the live control allow
 * it. Choice controls may never receive a package value that is absent from
 * the options observed on the recruitment page.
 */
export function authoritativeCandidateFactForField(
  field: PageFieldObservation,
  facts: Record<string, string>
): { key: string; value: string } | null {
  const fact = rawAuthoritativeCandidateFactForField(field, facts);
  return fact && !scopedTemporalRangeIsInvalid(field, facts) && !structuredTemporalRangeIsInvalid(fact, facts) &&
    applicationProfileValueCompatibleWithField(field, fact.value) ? fact : null;
}

/** Compare only four exact confirmed bindings from this custom range. A
 * partial answer never borrows another range or a past resume date. */
function scopedTemporalRangeIsInvalid(field: PageFieldObservation, facts: Record<string, string>): boolean {
  if (field.temporal?.scope !== "field" || field.temporal.layout !== "year_month_range") return false;
  const key = field.stableFieldKey?.match(/^(.*)_(?:start|end)_(?:year|month)\.(combobox|native)$/u);
  const caption = field.domHints?.fieldLabel;
  if (!key || !caption) return false;
  const values: number[] = [];
  for (const edge of ["start", "end"] as const) {
    for (const part of ["year", "month"] as const) {
      const label = `${caption}（${edge === "start" ? "开始" : "结束"}${part === "year" ? "年份" : "月份"}）`;
      const peer = { ...field, stableFieldKey: `${key[1]}_${edge}_${part}.${key[2]}`,
        label: field.label.replace(`${caption}（${field.temporal.edge === "start" ? "开始" : "结束"}${field.temporal.part === "year" ? "年份" : "月份"}）`, label),
        labelPath: [...(field.labelPath?.slice(0, -1) ?? []), label],
        temporal: { ...field.temporal, edge, part } };
      const fact = rawAuthoritativeCandidateFactForField(peer, facts);
      if (!fact || assessFieldInformation(peer, fact.value).status !== "sufficient") return false;
      values.push(Number(fact.value.replace(/[年月]/gu, "").trim()));
    }
  }
  return values[0]! * 12 + values[1]! > values[2]! * 12 + values[3]!;
}

export interface CandidateInformationRequest {
  schemaVersion: "required-field-request.v1";
  fieldId: string;
  stableFieldKey: string | null;
  label: string;
  sectionKey: string | null;
  groupIndex: number | null;
  type: string;
  controlKind: string | null;
  controlType?: string;
  required: true;
  reasonCode: "candidate_information_missing";
  description: string;
  question: string;
  options: string[];
  regionLevel?: "province" | "city" | "district";
  inputKind?: RequiredFieldInputKind;
}

function completeInformationOptions(values: string[], exact = false): string[] {
  const options = [...new Set(exact ? values.filter(value => value.trim()) : values.map(rendered).filter(Boolean))];
  if (options.length > 1000) {
    throw new RecruitingError({
      code: "SITE_VALIDATION_BLOCKED", stage: "form_observation", retryable: false,
      message: "招聘页面选项超过完整回传上限，未截断列表或猜测字段答案。",
      userAction: "当前控件需要分页选项支持，请联系支持；当前岗位未提交。",
      details: { reasonCode: "option_list_limit_exceeded", optionCount: options.length }
    });
  }
  return options;
}

function candidateInformationRequestLabel(field: PageFieldObservation): string {
  const observed = rendered(field.label);
  const genericValidation = /(?:^|·\s*)(?:必填项未填写|请选择|请输入)$/u;
  if (observed && !genericValidation.test(observed)) return observed;
  const originalStable = rendered(field.stableFieldKey);
  const stable = originalStable
    .replace(/#\d+$/u, "")
    .replace(/\[\d+\]/gu, "");
  const parts = stable.split(".").filter(Boolean);
  const rawSemantic = parts.length >= 2 ? parts.at(-2)! : "";
  const duplicateIndex = Number(originalStable.match(/#(\d+)$/u)?.[1] ?? -1);
  const semanticAliases: Record<string, string> = {
    preferred_city: "意向工作城市",
    job_intention: "求职意向",
    description: "工作职责",
    end_date: "结束时间",
    start_date: "开始时间",
    graduation_date: "毕业时间",
    current_location: "所在地",
    arrival_date: "到岗时间"
  };
  const semantic = rawSemantic === "job_intention" && duplicateIndex === 0
    ? "当前薪资"
    : rawSemantic === "job_intention" && duplicateIndex === 1
      ? "期望薪资"
      : semanticAliases[rawSemantic] ?? rawSemantic.replaceAll("_", " ").trim();
  const sectionAliases: Record<string, string> = {
    basic: "个人信息",
    intention: "求职意向",
    education: "教育背景",
    work: "工作经历",
    project: "项目经历",
    relation: "关系人信息",
    third_party: "第三方联系人",
    other: "其他信息"
  };
  const observedSection = observed.match(/^(.+?)\s*·\s*(?:必填项未填写|请选择|请输入)$/u)?.[1] ?? "";
  const sectionKey = rendered(field.sectionKey) || parts[0] || "";
  const section = observedSection || sectionAliases[sectionKey] || sectionKey;
  if (section && semantic && section !== semantic) return `${section} · ${semantic}`;
  return semantic || section || observed || "未识别必填项";
}

/**
 * These required fields describe user-specific facts or choices and must not be
 * invented by the visual planner. If no traceable package value exists, the AI
 * side receives a concrete information request instead of a model error.
 */
export function candidateInformationRequestForField(
  field: PageFieldObservation
): CandidateInformationRequest | null {
  if (!field.required || observedFieldHasValue(field) &&
    assessFieldInformation(field, field.currentValue).status !== "insufficient") return null;
  const requirement = fieldInformationRequirement(field);
  const requestLabel = supplementalFieldLabel(field);
  const datePart = requirement?.kind === "date" ? requirement.part : undefined;
  const identity = `${requestLabel} ${field.stableFieldKey ?? ""} ${field.type} ${field.controlKind ?? ""}`;
  // File uploads are supplied through batch assets, while fixed declarations
  // and privacy consent have their own bounded authorization flow. Neither is
  // candidate information that the AI side should ask a user to supplement.
  const route = field.controlApplicationUrl
    ? resolveControlAdapter(evidenceForField({url: field.controlApplicationUrl}, field)) : null;
  if (isFeishuLocationTree(field) && (!isMultipleChoiceField(field) || isPreferredWorkCityField(field))) {
    if (field.domHints?.disabled || route?.driver === "unsupported") throw supplementalControlError([field], []);
    return {schemaVersion:"required-field-request.v1",fieldId:field.fieldId,stableFieldKey:field.stableFieldKey??null,
      label:requestLabel,sectionKey:field.sectionKey??null,groupIndex:field.groupIndex??null,
      type:"search",controlKind:"native",controlType:"feishu_location_tree.v1",inputKind:"search",required:true,
      reasonCode:"candidate_information_missing",options:[],
      description:"请选择一个地点，可选到国家／地区、省、市或区。按已知信息选择，无需补全到区；期望工作地点只选首选项。",
      question:`请补充“${requestLabel}”的一个地点及已知上级地区，无需填写未知的下级地区。`};
  }
  if (/\bfile\b/i.test(field.type) || route?.code === "generic.consent-confirmation.trusted-pointer.v1" ||
    !route && field.type === "checkbox" && !requirement &&
    /隐私|协议|声明|授权|同意|真实性|privacy|consent|agreement|declaration/i.test(identity)) return null;
  if (field.domHints?.disabled || route?.driver === "unsupported") throw supplementalControlError([field], []);
  const searchQuery = field.optionSource === "search";
  const multiple = isMultipleChoiceField(field);
  const multipleSearch = searchQuery && isFeishuFormilyOptionSet(field);
  const options = searchQuery ? [] : completeInformationOptions(field.options, multiple);
  const isChoice = options.length > 0 ||
    /select|combobox|radio|checkbox|option/i.test(`${field.type} ${field.controlKind ?? ""}`);
  const isDate = /日期|时间|年月|年|月|date|time|month|year/i.test(identity);
  const datePrecision = requirement?.kind === "date" && !requirement.part ? requirement.precision : null;
  const completeDateSupplement = !datePrecision && !datePart && !options.length &&
    !searchQuery && field.supplementalInputType === "date";
  const dateParts = datePrecision === "day" ? "年、月、日" : datePrecision === "month" ? "年、月" : "年";
  const regionLevel = requirement?.kind === "region" && field.supplementalRegionInput !== false ? requirement.level : undefined;
  const regionParts = regionLevel === "district" ? "省、市、区/县" : regionLevel === "city" ? "省、市" : "省";
  const largeChoice = options.length > maximumDisplayedChoiceOptions;
  const description = largeChoice
    ? multiple
      ? "请填写完整选项名称，每行一个。小助手会在招聘页面逐项精确选择。"
      : "请填写完整选项名称，小助手会在招聘页面精确选择。"
    : multipleSearch
    ? "请填写完整城市名称，每行一个。小助手会逐项检索并精确选中，搜索词本身不代表已经选择。"
    : searchQuery
    ? "请提供完整查询内容，小助手会在招聘页面检索并选择完全匹配的结果。输入搜索词不代表已经选中选项。"
    : datePrecision
    ? `招聘页面要求日期精确到${dateParts}；现有信息不足以确定该精度，请补充确认，插件不会推测或补造日期。`
    : completeDateSupplement
    ? "请填写完整日期，格式 YYYY-MM-DD，无需填写年龄。小助手会按招聘页面日期控件使用所需的年月或年月日，不会补造日期。"
    : regionLevel
    ? `招聘页面要求地区信息包含${regionParts}；请补充确认缺少的层级，插件不会借用岗位地点或自行推测。`
    : options.length
    ? "该字段为招聘页面必填选择项，必须使用页面当前提供的有效选项；AI 侧应向用户确认，不能自行猜测。"
    : isDate
      ? "该字段为招聘页面必填日期或时间信息，候选人信息包中没有可追溯值；AI 侧应向用户补充确认。"
      : isChoice
        ? "该字段为招聘页面必填选择项，但页面没有提供可直接复用的候选人答案；AI 侧应向用户确认。"
        : "该字段为招聘页面必填信息，候选人信息包中没有可追溯值；AI 侧应向用户补充确认，不能编造。";
  const request: CandidateInformationRequest = {
    schemaVersion: "required-field-request.v1",
    fieldId: field.fieldId,
    stableFieldKey: field.stableFieldKey ?? null,
    label: requestLabel,
    sectionKey: field.sectionKey ?? null,
    groupIndex: field.groupIndex ?? null,
    type: multipleSearch ? "textarea" : multiple ? "multi_select" : searchQuery ? "search" : field.type === "datetime-local" ? "datetime-local" : datePrecision === "day" || completeDateSupplement ? "date" : datePrecision === "month" ? "month" :
      datePart && !options.length ? "number" :
      regionLevel ? "text" : field.type,
    controlKind: multipleSearch ? "native" : multiple ? "multi_select" : searchQuery ? "native" : datePrecision === "day" || completeDateSupplement ? "date" : datePrecision === "month" ? "month" :
      datePart && !options.length ? "native" :
      regionLevel ? "native" : field.controlKind ?? null,
    ...(regionLevel ? { regionLevel } : {}),
    required: true,
    reasonCode: "candidate_information_missing",
    description,
    question: largeChoice
      ? `招聘表单必填“${requestLabel}”，请填写完整选项名称${multiple ? "，每行一个" : ""}。`
      : multipleSearch
      ? `招聘表单必填“${requestLabel}”，请填写完整城市名称，每行一个。`
      : multiple
      ? `招聘表单必填“${requestLabel}”，请从页面有效选项中选择一项或多项。`
      : searchQuery
      ? `招聘表单必填“${requestLabel}”，请填写完整${requestLabel.split("·").at(-1)?.trim() || "查询内容"}。`
      : datePrecision
      ? `招聘表单必填“${requestLabel}”，请补充完整日期（${dateParts}）。`
      : completeDateSupplement
      ? `招聘表单必填“${requestLabel}”，请补充完整日期（年、月、日）。`
      : regionLevel
      ? `招聘表单必填“${requestLabel}”，请补充地区信息（${regionParts}）。`
      : options.length
      ? options.join(" / ").length <= 600
        ? `招聘表单必填“${requestLabel}”，可选项为：${options.join(" / ")}。请选择一项。`
        : `招聘表单必填“${requestLabel}”，请从返回的 ${options.length} 个有效选项中选择一项。`
      : `招聘表单必填“${requestLabel}”，请补充该信息。`,
    options
  };
  const inputKind = requiredFieldInputKind(request);
  if (!inputKind) throw supplementalControlError([field], []);
  return { ...request, inputKind };
}

export function candidateInformationRequestsForFields(
  fields: PageFieldObservation[]
): CandidateInformationRequest[] {
  return collectCandidateInformationRequests(fields, candidateInformationRequestForField);
}

/** Explicit site rejection requests correction even for a nonempty, known fact.
 * Reuse the existing AI Offer contract; do not expose the rejected personal value. */
export function siteRejectedInformationRequests(fields: PageFieldObservation[]): CandidateInformationRequest[] {
  const requests: CandidateInformationRequest[] = [];
  const blocked: PageFieldObservation[] = [];
  for (const field of fields) {
    let request: CandidateInformationRequest | null;
    try {
      request = candidateInformationRequestForField({ ...field, required: true, currentValue: "" });
    } catch (error) {
      if (!(error instanceof RecruitingError) || error.publicError.details?.failureCode !== "supplemental_control_unresolved") throw error;
      blocked.push(field);
      continue;
    }
    if (!request) { blocked.push(field); continue; }
    const message = field.validationMessage?.trim();
    requests.push({ ...request,
      description: message ? `招聘网站校验：${message}` : "招聘网站未接受该字段，请补充或更正。",
      question: `招聘网站未接受“${request.label}”，请补充或更正${request.options.length ? "，并从当前选项中选择" : ""}。`
    });
  }
  if (blocked.length) throw supplementalControlError(blocked, requests, fields);
  return requests;
}

function collectCandidateInformationRequests(fields: PageFieldObservation[],
  build: (field: PageFieldObservation) => CandidateInformationRequest | null): CandidateInformationRequest[] {
  const requests: CandidateInformationRequest[] = [];
  const blocked: PageFieldObservation[] = [];
  const needed: PageFieldObservation[] = [];
  for (const field of fields) {
    try {
      const request = build(field);
      if (request) { requests.push(request); needed.push(field); }
    } catch (error) {
      if (!(error instanceof RecruitingError) || error.publicError.details?.failureCode !== "supplemental_control_unresolved") throw error;
      blocked.push(field); needed.push(field);
    }
  }
  if (blocked.length) throw supplementalControlError(blocked, requests, needed);
  return requests;
}

function supplementalControlError(
  blocked: PageFieldObservation[], pending: CandidateInformationRequest[], rejected = blocked
): RecruitingError {
  return new RecruitingError({
    code: "SITE_VALIDATION_BLOCKED", stage: "form_observation", retryable: false,
    message: "未能确定招聘页面控件的补充输入方式",
    userAction: "请打开原招聘页面检查标出的字段；本次投递已停止。",
    details: { failureCode: "supplemental_control_unresolved",
      supplementalInputErrors: blocked.map(field => supplementalInputError({
        fieldId:field.fieldId, label:supplementalFieldLabel(field), type:field.type,
        controlKind:field.controlKind, options:field.options
      })).filter(Boolean),
      fields: rejected.map(field => supplementalFieldLabel(field)),
      rejectedFields: rejected.map(field => supplementalFieldLabel(field)),
      rejectedFieldKeys: rejected.map(field => field.stableFieldKey ?? field.fieldId),
      blockedControls: blocked.map(field => ({ fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
        label: supplementalFieldLabel(field), type: field.type, controlKind: field.controlKind,
        optionSource: field.optionSource, optionCount: field.options.length })),
      // Keep every other request for diagnostics without opening a partial/dead form.
      pendingInformationRequests: pending
    }
  });
}

/**
 * Return only fields that genuinely need a new answer from the candidate.
 * Before site submission, do not mistake a readback failure for a missing fact.
 * After an explicit site rejection use siteRejectedInformationRequests instead,
 * which requests correction regardless of whether a package fact exists.
 */
export function candidateInformationRequestsForMissingFields(
  fields: PageFieldObservation[],
  candidateFacts: Record<string, string>
): CandidateInformationRequest[] {
  return collectCandidateInformationRequests(fields, (field) => {
    if (authoritativeCandidateFactForField(field, candidateFacts) ||
      isIgnorableOptionalRepeatTemplateField(field, candidateFacts)) return null;
    const requestField = thirdPartyIdentityCollision(field, candidateFacts)
      ? { ...field, currentValue: "" }
      : field;
    const request = candidateInformationRequestForField(requestField);
    if (request && field.stableFieldKey && fieldInformationRequirement(field) &&
      !rawConfirmedCurrentJobFactForField(field, candidateFacts) && !boundProfileFactForField(field, candidateFacts)) {
      const prefix = `profile.requiredField.stableLabel:${field.stableFieldKey}:`;
      const matchingKeys = new Set(supplementalProfileKeysForField(field));
      // A complete answer for this exact stable identity exists, but its label
      // can no longer be bound. Do not turn a technical association failure
      // into an endless request to re-enter the same information. Answers for
      // another row/key, incomplete values and incompatible live options are
      // still genuine missing-information cases.
      if (Object.entries(candidateFacts).some(([key, value]) => key.startsWith(prefix) &&
        !matchingKeys.has(key) && applicationProfileValueCompatibleWithField(field, value))) {
        throw supplementalBindingError(field);
      }
    }
    return request;
  });
}

/**
 * Convert a live option-set mismatch into a user choice request. The caller
 * must supply options read from the currently open recruitment-page control;
 * an empty list cannot prove that the requested value is unavailable and is
 * therefore left to the control-interaction error path.
 */
export function candidateInformationRequestForUnavailableOptions(
  field: PageFieldObservation,
  requestedValue: string,
  availableOptions: string[],
  liveResult?: { fieldId: string; controlAdapter?: ControlAdapterDiagnostic }
): CandidateInformationRequest | null {
  if (!field.required) return null;
  const searchDiagnostic=liveResult?.controlAdapter;
  const feishuKind=searchDiagnostic?.adapterCode==="feishu.formily-location-tree.trusted-pointer.v1" ||
    searchDiagnostic?.adapterCode==="feishu.formily-city-multi-search.trusted-pointer.v1" ? "formily_location_tree" : null;
  // Carry only this execution's structurally proven kind across the exact
  // field/route binding. Fresh observations do not persist popup attributes.
  const searchField=feishuKind ? {...field,observedControlKind:feishuKind as "formily_location_tree"} : field;
  const searchRoute=field.controlApplicationUrl ? resolveControlAdapter(evidenceForField({url:field.controlApplicationUrl},searchField)) : null;
  if (searchRoute && searchRoute.registration?.optionSource==="search" &&
    ["feishu.formily-selector-search.trusted-pointer.v1","feishu.formily-city-multi-search.trusted-pointer.v1","feishu.formily-location-tree.trusted-pointer.v1"].includes(searchRoute.code) &&
    liveResult?.fieldId===field.fieldId && field.stableFieldKey && searchDiagnostic?.fieldName===field.label &&
    searchDiagnostic.semanticKey.split(/\s+/u).includes(field.stableFieldKey) && searchDiagnostic.adapterCode===searchRoute.code &&
    searchDiagnostic.registrationId===searchRoute.diagnostic.registrationId && searchDiagnostic.hostname===searchRoute.diagnostic.hostname) {
    const request=candidateInformationRequestForField({...searchField,currentValue:"",options:[]});
    return request ? {...request,description:feishuKind ? "招聘页面未找到该层级下唯一匹配的地点，请核对地点及已知上级地区，无需补全到区。" :
      "招聘页面检索后未找到唯一完全匹配的结果，请核对完整名称后补充。"} : null;
  }
  if (observedFieldHasValue(field)) return null;
  const requested = rendered(requestedValue);
  const options = completeInformationOptions(availableOptions);
  if (!requested || options.length === 0) return null;
  let liveChoiceField: PageFieldObservation = { ...field, options };
  const diagnostic = liveResult?.controlAdapter;
  const kind = diagnostic?.adapterCode === "feishu.atsx-flat-select.trusted-pointer.v1" ? "atsx_flat"
    : diagnostic?.adapterCode === "feishu.atsx-city-tree.trusted-pointer.v1" ? "atsx_city_tree" : null;
  // Popup discovery belongs to this execution, not the earlier planning
  // observation. Carry its proven shape only across the same field binding;
  // resolving again still checks the complete component and URL signature.
  if (kind && field.controlApplicationUrl && field.stableFieldKey && field.fieldSource &&
    liveResult?.fieldId === field.fieldId && diagnostic?.fieldName === field.label &&
    diagnostic.semanticKey.split(/\s+/u).includes(field.stableFieldKey)) {
    const proven: PageFieldObservation = { ...liveChoiceField, observedControlKind: kind };
    const route = resolveControlAdapter(evidenceForField({url: field.controlApplicationUrl}, proven));
    if (route.code === diagnostic.adapterCode && route.diagnostic.registrationId === diagnostic.registrationId &&
      route.diagnostic.hostname === diagnostic.hostname) liveChoiceField = proven;
  }
  if (applicationProfileValueCompatibleWithField(liveChoiceField, requested)) return null;
  const request = candidateInformationRequestForField(liveChoiceField);
  if (!request) return null;
  return {
    ...request,
    description: `信息包中的“${requested}”不在招聘页面当前有效选项中；插件未尝试键盘输入或猜测近似选项。`,
    question: options.join(" / ").length <= 600
      ? `招聘表单必填“${request.label}”，当前“${requested}”不可用，可选项为：${options.join(" / ")}。请选择一项。`
      : `招聘表单必填“${request.label}”，当前“${requested}”不可用，请从返回的 ${options.length} 个有效选项中选择一项。`
  };
}

function directSupplementalFactForField(
  field: PageFieldObservation,
  facts: Record<string, string>
): string {
  const currentJobValue = rendered(field.stableFieldKey
    ? facts[`job.requiredField.stable:${field.stableFieldKey}`]
    : facts[`job.requiredField.field:${field.fieldId}`]);
  if (currentJobValue) return currentJobValue;
  const bound = boundProfileFactForField(field, facts);
  if (bound) return applicationProfileValueCompatibleWithField(field, bound.value) ? bound.value : "";
  return profileSupplementalFactForField(field, facts)?.value ?? "";
}

function repeatSectionKindForField(field: PageFieldObservation): "work" | "internship" | "project" | "education" | null {
  const identity = `${field.label} ${field.sectionKey ?? ""} ${field.stableFieldKey ?? ""}`.toLowerCase();
  if (/实习经历|internship/.test(identity) || /(?:^|[.\[])internship(?:[.\]#]|$)/i.test(identity)) {
    return "internship";
  }
  if (/工作经历|任职经历/.test(identity) || /(?:^|[.\[])work(?:[.\]#]|$)/i.test(identity)) {
    return "work";
  }
  if (/项目经历|项目经验/.test(identity) || /(?:^|[.\[])project(?:[.\]#]|$)/i.test(identity)) {
    return "project";
  }
  if (/教育背景|教育经历/.test(identity) || /(?:^|[.\[])education(?:[.\]#]|$)/i.test(identity)) {
    return "education";
  }
  return null;
}

function repeatSectionFactIndexes(
  facts: Record<string, string>,
  section: "work" | "internship" | "project" | "education"
): Set<number> {
  const indexes = new Set<number>();
  const bracket = new RegExp(`(?:^|[.])${section}\\[(\\d+)\\]\\.`, "i");
  const dotted = new RegExp(`(?:^|[.])${section}\\.(\\d+)\\.`, "i");
  for (const [key, value] of Object.entries(facts)) {
    if (!rendered(value)) continue;
    const match = key.match(bracket) ?? key.match(dotted);
    if (!match) continue;
    indexes.add(Number(match[1]));
  }
  return indexes;
}

function repeatFieldIndex(field: PageFieldObservation): number | null {
  if (typeof field.groupIndex === "number" && field.groupIndex >= 0) return field.groupIndex;
  const stable = rendered(field.stableFieldKey);
  const match = stable.match(/\[(\d+)\]/u) ?? stable.match(/\.(\d+)\./u);
  return match ? Number(match[1]) : null;
}

/**
 * Moka often keeps an empty, addable repeat-section template in the DOM. Once
 * a submit/readback attempt runs, that template can show red "required" text
 * even though the candidate has no such section in the standard information
 * package. Do not ask AI Offer to invent that data, and do not let the local
 * visual loop spend all iterations on it.
 */
export function isIgnorableOptionalRepeatTemplateField(
  field: PageFieldObservation,
  candidateFacts: Record<string, string>
): boolean {
  if (!field.required || observedFieldHasValue(field)) return false;
  if (directSupplementalFactForField(field, candidateFacts)) return false;
  const section = repeatSectionKindForField(field);
  if (!section) return false;
  const indexes = repeatSectionFactIndexes(candidateFacts, section);
  if (section === "internship" && indexes.size === 0) return true;
  const index = repeatFieldIndex(field);
  if (index === null || indexes.size === 0) return false;
  return index > Math.max(...indexes);
}

export function candidateBlockingRequiredFieldFailures(
  fields: PageFieldObservation[],
  candidateFacts: Record<string, string>
): PageFieldObservation[] {
  return fields.filter((field) => field.domHints?.disabled !== true && field.required &&
    (!observedFieldHasValue(field) || assessFieldInformation(field, field.currentValue).status === "insufficient" ||
      thirdPartyIdentityCollision(field, candidateFacts)) &&
    !isIgnorableOptionalRepeatTemplateField(field, candidateFacts));
}

/**
 * Deterministic identity facts take precedence over the model planner. This is
 * intentionally field-instance based: #0 being filled never completes #1.
 */
export function nextDeterministicKnownFactAction(
  observation: PageObservation,
  candidateFacts: Record<string, string>,
  skippedFieldKeys: ReadonlySet<string> = new Set()
): DeterministicKnownFactAction | null {
  return deterministicKnownFactActions(observation, candidateFacts, skippedFieldKeys)[0] ?? null;
}

/**
 * Fill required fields from traceable facts. Blank optional controls are
 * excluded unless the user confirmed an answer for this exact job/field; resume
 * facts and reusable profile facts must not add optional application content.
 * Existing ATS/user values remain untouched.
 */
export function deterministicKnownFactActions(
  observation: PageObservation,
  candidateFacts: Record<string, string>,
  skippedFieldKeys: ReadonlySet<string> = new Set()
): DeterministicKnownFactAction[] {
  const actions: DeterministicKnownFactAction[] = observation.fields.flatMap(field => {
    const choice = rangeEndChoiceForField(field, candidateFacts);
    if (!choice || field.currentValue === choice.value || field.domHints?.disabled ||
      skippedFieldKeys.has(field.stableFieldKey ?? `fieldId:${field.fieldId}`)) return [];
    return [{ type: "fill_field" as const, fieldId: field.fieldId, stableFieldKey: field.stableFieldKey ?? null,
      semanticKey: choice.key, value: choice.value, rangeEndChoice: true,
      reason: "同一条经历的结束时间决定填写结束年月或勾选至今" }];
  });
  const xiaopengStructuredFact = (field: PageFieldObservation): { key: string; value: string } | null => {
    if (!/^https:\/\/xiaopeng\.jobs\.feishu\.cn\//i.test(observation.url)) return null;
    if (field.fieldSource?.dialect === "feishu_formily" && /^\d+$/u.test(field.fieldSource.fieldPath)) return null;
    if (field.fieldSource && /(?:^|\.)education_type$/u.test(field.fieldSource.fieldPath)) return null;
    const identity = `${field.label} ${field.stableFieldKey ?? ""}`;
    const section = /工作经历|实习经历|(?:^|[.\[])work/i.test(identity)
      ? "work"
      : /项目经历|(?:^|[.\[])project/i.test(identity)
        ? "project"
        : /教育经历|(?:^|[.\[])education/i.test(identity)
          ? "education"
          : null;
    if (!section) return null;
    const groupIndex = typeof field.groupIndex === "number" && field.groupIndex >= 0
      ? field.groupIndex
      : Number(field.stableFieldKey?.match(/\[(\d+)\]/)?.[1] ?? 0);
    let attributes: string[] = [];
    if (section === "work" && /公司|单位|company/i.test(identity)) {
      attributes = ["companyName", "company"];
    } else if (section === "work" && /岗位|职位|职务|position|title/i.test(identity)) {
      attributes = ["positionTitle", "title"];
    } else if (section === "project" && /项目名称|(?:^|[.\s])name/i.test(identity)) {
      attributes = ["projectName", "name"];
    } else if (section === "project" && /角色|职责|role/i.test(identity)) {
      attributes = ["role"];
    } else if (/描述|内容|职责|成果|description|responsibilities/i.test(identity)) {
      attributes = ["description", "responsibilities"];
    } else if (section === "education" && /学校|院校|school/i.test(identity)) {
      attributes = ["school"];
    } else if (section === "education" && /学历|学位|degree/i.test(identity)) {
      attributes = ["degree"];
    } else if (section === "education" && /专业|major/i.test(identity)) {
      attributes = ["major"];
    } else if (/起止时间|开始时间|结束时间|入学时间|毕业时间|startDate|endDate/i.test(identity)) {
      const peers = observation.fields.filter((candidate) => {
        const peerIdentity = `${candidate.label} ${candidate.stableFieldKey ?? ""}`;
        const peerGroup = typeof candidate.groupIndex === "number" && candidate.groupIndex >= 0
          ? candidate.groupIndex
          : Number(candidate.stableFieldKey?.match(/\[(\d+)\]/)?.[1] ?? 0);
        return peerGroup === groupIndex &&
          (section === "work" ? /工作经历|实习经历|(?:^|[.\[])work/i.test(peerIdentity) :
            section === "project" ? /项目经历|(?:^|[.\[])project/i.test(peerIdentity) :
              /教育经历|(?:^|[.\[])education/i.test(peerIdentity)) &&
          /起止时间|开始时间|结束时间|入学时间|毕业时间|startDate|endDate/i.test(peerIdentity);
      });
      const explicitEnd = /结束时间|毕业时间|endDate/i.test(identity);
      const explicitStart = /开始时间|入学时间|startDate/i.test(identity);
      const edge = explicitEnd ? "endDate" : explicitStart ? "startDate" :
        Math.max(0, peers.findIndex((candidate) => candidate.fieldId === field.fieldId)) % 2 === 0
          ? "startDate" : "endDate";
      attributes = [edge];
    }
    for (const attribute of attributes) {
      const key = `resume.${section}.${groupIndex}.${attribute}`;
      const value = rendered(candidateFacts[key]);
      if (value) return { key, value };
    }
    return null;
  };
  for (const field of observation.fields) {
    if (field.domHints?.disabled === true) continue;
    if (field.dateRange?.role === "end" && observation.fields.some(toggle =>
      toggle.dateRange?.groupKey === field.dateRange!.groupKey && rangeEndChoiceForField(toggle, candidateFacts)?.value === "true")) continue;
    if (["file", "checkbox", "radio", "hidden", "password"].includes(field.type)) continue;
    const skipKey = field.stableFieldKey ?? `fieldId:${field.fieldId}`;
    const phoneCallingCode = isPhoneCallingCodeField(field);
    if (phoneCallingCode) {
      if (skippedFieldKeys.has(skipKey)) continue;
      const confirmed = confirmedCurrentJobFactForField(field, candidateFacts);
      if (confirmed) {
        if (!phoneCallingCodeReadbackMatches(field, confirmed.value)) {
          actions.push({
            type: "select_option",
            fieldId: field.fieldId,
            stableFieldKey: field.stableFieldKey ?? null,
            semanticKey: confirmed.key,
            value: confirmed.value,
            optionSelectionPolicy: "phone_calling_code_confirmed",
            reason: "用户已为当前岗位明确确认电话国家/地区区号"
          });
        }
        continue;
      }
      if (phoneCallingCodeReadbackMatches(field, "+86")) continue;
      actions.push({
        type: "select_option",
        fieldId: field.fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        semanticKey: "policy.phone_calling_code.default",
        value: "+86",
        optionSelectionPolicy: "phone_calling_code_default",
        reason: "电话国家/地区区号按用户默认策略选择页面真实选项"
      });
      continue;
    }
    const acceptedMokaPreferredCity = /^https:\/\/app\.mokahr\.com\//i.test(observation.url) &&
      field.required &&
      observedFieldHasValue(field) &&
      isPreferredWorkCityField(field);
    if (acceptedMokaPreferredCity) {
      // The Moka page is authoritative once its required city control has a
      // committed value. This is especially important when a stale AI-side
      // answer triggered the site's sole live option: do not immediately try
      // to overwrite the accepted site value with that stale answer again.
      continue;
    }
    if (!field.required && skippedFieldKeys.has(skipKey)) continue;
    if (!field.required && observedFieldHasValue(field)) continue;
    const authoritativeFact = field.required
      ? authoritativeCandidateFactForField(field, candidateFacts)
      : confirmedCurrentJobFactForField(field, candidateFacts);
    const structuredFact = field.required && !authoritativeFact
      ? xiaopengStructuredFact(field)
      : null;
    const fact = authoritativeFact ?? structuredFact;
    if (!fact?.value || !applicationProfileValueCompatibleWithField(field, fact.value)) continue;
    if (structuredFact && rendered(field.currentValue)) {
      // Xiaopeng's corporate parser is the first source of truth for an
      // already-populated resume section. Only repair the known duplicated
      // range failure where an end-date control was filled with the matching
      // start date; otherwise preserve the parser result and supplement blanks.
      const matchingStartKey = structuredFact.key.startsWith("resume.work.") &&
        structuredFact.key.endsWith(".endDate")
        ? structuredFact.key.replace(/\.endDate$/, ".startDate")
        : null;
      const duplicatedStartDate = matchingStartKey &&
        normalizedDate(field.currentValue) === normalizedDate(candidateFacts[matchingStartKey]);
      if (!duplicatedStartDate) continue;
    }
    // Deterministic identity facts do not merely fill blanks. They also repair
    // an ATS parser or earlier planner that placed a traceable but semantically
    // wrong value (for example an email address in the name field).
    if (visionReadbackMatches(field, fact.value, fact.key)) continue;
    actions.push({
      type: ["select", "combobox"].includes(field.type) ? "select_option" : "fill_field",
      fieldId: field.fieldId,
      stableFieldKey: field.stableFieldKey ?? null,
      semanticKey: fact.key,
      value: fact.value,
      reason: field.required
        ? "候选人信息包可确定的必填字段优先填写"
        : "用户已为当前岗位明确确认该非必填字段"
    });
  }
  return actions;
}

export function visionReadbackMatches(
  field: PageFieldObservation | null,
  expected: string | boolean,
  semanticKey?: string | null
): boolean {
  if (!field) return false;
  const actual = rendered(field.currentValue);
  if (typeof expected === "boolean") return actual === String(expected);
  if (!actual) return false;
  if (assessFieldInformation(field, actual).status === "insufficient") return false;
  const informationRequirement = fieldInformationRequirement(field);
  const expectedDay = structuredDateFromValue(expected);
  const expectedDate = expectedDay ?? structuredMonthDateFromValue(expected);
  if (expectedDate) {
    const identity = `${field.label} ${field.stableFieldKey ?? ""} ${field.controlKind ?? ""}`;
    const datePrecision = informationRequirement?.kind === "date" && informationRequirement.precision === "day"
      ? "day"
      : informationRequirement?.kind === "date" && informationRequirement.precision === "month" ||
      field.type === "month" || !expectedDay ||
      /(?:19|20)\d{2}\s*[-/.年]\s*\d{1,2}(?:月)?\s*\([^)]*(?:岁|years?\s*old)/iu.test(actual) ||
      /出生年月|birth[_\s.-]*month/iu.test(identity)
      ? "month"
      : "day";
    if (structuredDateReadbackMatches(actual, expectedDate, datePrecision)) return true;
  }
  const temporalPart: StructuredDatePart | null = field.temporal?.part ??
    (/·\s*年$/u.test(field.label) ? "year" :
      /·\s*月$/u.test(field.label) ? "month" :
        /·\s*日$/u.test(field.label) ? "day" : null);
  if (temporalPart) {
    return structuredDatePartReadbackMatches(actual, expected, temporalPart);
  }
  if (/籍贯|native.?place|hometown|place.?of.?origin/iu.test(
    `${field.label} ${field.stableFieldKey ?? ""} ${semanticKey ?? ""}`
  )) {
    return readbackValueProvenance(semanticKey) === "live_page_option"
      ? normalizePageOptionReadback(actual) === normalizePageOptionReadback(expected)
      : mokaNativePlaceReadbackMatches(actual, expected);
  }
  if (["select", "combobox"].includes(field.type) || /学历|学位|degree/i.test(field.label)) {
    if (isPreferredWorkCityField(field)) return cityDisplayMatchesFact(actual, expected);
    if (readbackValueProvenance(semanticKey) === "live_page_option") {
      return normalizePageOptionReadback(actual) === normalizePageOptionReadback(expected);
    }
    if (/意向.*城市|期望.*城市|工作城市|意向地点|工作地点|city|location/i.test(
      `${field.label} ${field.stableFieldKey ?? ""}`
    )) {
      return isPreferredWorkCityField(field)
        ? cityDisplayMatchesFact(actual, expected)
        : Boolean(normalizedCityScalar(actual) && normalizedCityScalar(expected)) &&
          normalizedCityScalar(actual) === normalizedCityScalar(expected);
    }
    if (/学历|学位|degree/i.test(`${field.label} ${field.stableFieldKey ?? ""}`)) {
      const actualRank = degreeRank(actual);
      const expectedRank = degreeRank(expected);
      if (actualRank > 0 && expectedRank > 0) return actualRank === expectedRank;
    }
    const left = normalizedScalar(actual);
    const right = normalizedScalar(expected);
    return Boolean(left && right) && (left === right || left.includes(right) || right.includes(left));
  }
  return actual === expected;
}

/**
 * V1 convergence is intentionally scoped to required controls. ATS resume
 * parsers may prefill optional fields differently from the candidate package
 * (for example an optional first-work date). Those differences may be reported
 * but must not keep the visual loop alive or block an otherwise valid submit.
 */
export function visualFieldFailureBlocksSubmission(field: PageFieldObservation): boolean {
  return field.required;
}

/**
 * Optional enrichment is allowed only for an answer explicitly confirmed for
 * the current job/field. Resume-derived and reusable profile facts are not
 * enough authority to add optional application content.
 */
export function optionalFieldEnrichmentPending(
  observation: PageObservation,
  candidateFacts: Record<string, string>
): boolean {
  return observation.fields.some(field => {
    const choice = rangeEndChoiceForField(field, candidateFacts);
    return choice && choice.value !== field.currentValue;
  }) || observation.fields.some((field) =>
    !field.required &&
    !observedFieldHasValue(field) &&
    Boolean(confirmedCurrentJobFactForField(field, candidateFacts)) &&
    !["file", "checkbox", "radio", "hidden", "password"].includes(field.type)
  );
}

export function visualSemanticConflict(field: PageFieldObservation): string | null {
  const identity = `${field.label} ${field.stableFieldKey ?? ""}`;
  const intrinsicIdentity = `${field.domHints?.placeholder ?? ""} ${field.domHints?.name ?? ""} ${field.domHints?.dataFieldName ?? ""} ${field.domHints?.ariaLabel ?? ""}`;
  const actual = rendered(field.currentValue);
  const emailValue = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actual);
  const degreeValue = /^(?:博士研究生|博士|硕士研究生|硕士|本科(?:学士)?|学士|大专|专科|高中|中专)$/i.test(actual);
  if (/(?:^|[·\s])姓名|名字|full[_\s-]?name/i.test(field.label) && emailValue) {
    return "姓名字段当前值符合邮箱格式，需按候选人信息包纠正";
  }
  if (/最高学历|学历|学位|degree/i.test(identity) && emailValue) {
    return "学历字段当前值符合邮箱格式，字段观察身份冲突";
  }
  if (/邮箱|email/i.test(identity) && degreeValue) {
    return "邮箱字段当前值符合学历格式，字段观察身份冲突";
  }
  if (/degree/i.test(field.stableFieldKey ?? "") && /email/i.test(field.domHints?.name ?? "")) {
    return "学历稳定键与邮箱 DOM 提示冲突";
  }
  if (/email/i.test(field.stableFieldKey ?? "") && /degree/i.test(field.domHints?.name ?? "")) {
    return "邮箱稳定键与学历 DOM 提示冲突";
  }
  if (/推荐码|推荐人|内推码|内推人|内推|referral/i.test(intrinsicIdentity) &&
    /意向.*城市|期望.*城市|工作城市|preferred.?city|\bcity\b|\blocation\b/i.test(identity)) {
    return "推荐/内推字段与城市稳定语义冲突";
  }
  return null;
}

export function isVisionValueTraceable(
  candidateFacts: Record<string, string>,
  value: unknown
): boolean {
  if (typeof value === "boolean") return true;
  const expected = rendered(value);
  if (!expected) return false;
  const candidates = Object.values(candidateFacts).flatMap((fact) => {
    const date = normalizedDate(fact);
    // Arrays from the standard information package are rendered into a single
    // human-readable fact (for example "北京、杭州"). A model may choose one
    // listed option, but it must not invent a city outside that list.
    const listedValues = fact.split(/[、,，;；|/]+/).map((entry) => entry.trim()).filter(Boolean);
    if (!date) return [fact, ...listedValues];
    const [year, month] = date.split("-");
    return [fact, ...listedValues, date, year!, month!, String(Number(month))];
  });
  return candidates.some((candidate) =>
    normalizedScalar(candidate) === normalizedScalar(expected) ||
    normalizedCityScalar(candidate) === normalizedCityScalar(expected)
  );
}

export function visionPlanningObservation(
  observation: PageObservation,
  skippedFieldKeys: ReadonlySet<string> = new Set(),
  options: {
    confirmedMokaAuthenticityDeclaration?: boolean;
    candidateFacts?: Record<string, string>;
    siteValidationRepair?: boolean;
  } = {}
): PageObservation {
  return {
    ...observation,
    fields: observation.fields.filter((field) =>
      field.domHints?.disabled !== true &&
      field.type !== "file" &&
      !(options.confirmedMokaAuthenticityDeclaration && isMokaAuthenticityDeclarationField(field)) &&
      !(options.candidateFacts && !options.siteValidationRepair &&
        isIgnorableOptionalRepeatTemplateField(field, options.candidateFacts)) &&
      !(!field.required && observedFieldHasValue(field) && !isPhoneCallingCodeField(field) &&
        !(options.candidateFacts && rangeEndChoiceForField(field, options.candidateFacts))) &&
      !(options.candidateFacts && !field.required &&
        !confirmedCurrentJobFactForField(field, options.candidateFacts) && !isPhoneCallingCodeField(field) &&
        !rangeEndChoiceForField(field, options.candidateFacts)) &&
      !skippedFieldKeys.has(field.stableFieldKey ?? `fieldId:${field.fieldId}`)
    )
  };
}

const mokaAuthenticityDeclarations = [
  "本人确保以上所有信息真实有效",
  "本人已郑重承诺上述信息属实"
];

export function isMokaAuthenticityDeclarationField(
  field: Pick<PageFieldObservation, "label" | "type">
): boolean {
  const compactLabel = rendered(field.label)
    .replace(/\s+/g, "")
    .replace(/[。.!！]/g, "");
  return ["checkbox", "radio"].includes(field.type) &&
    mokaAuthenticityDeclarations.some((declaration) => compactLabel.includes(declaration));
}

/**
 * Stable, privacy-preserving fingerprint used only to decide whether an ATS
 * interaction actually changed the page. It deliberately excludes fieldId,
 * selector and observedAt because React pages rebuild those values even when
 * the user-visible form state has not changed.
 */
export function visionObservationStateFingerprint(observation: PageObservation): string {
  const fields = observation.fields.map((field) => ({
    key: field.stableFieldKey ?? `${normalizedLabel(field.label)}:${field.type}`,
    label: normalizedLabel(field.label),
    type: field.type,
    required: field.required,
    value: rendered(field.currentValue)
  })).sort((left, right) =>
    `${left.key}\u0000${left.label}`.localeCompare(`${right.key}\u0000${right.label}`)
  );
  return JSON.stringify({
    fields,
    validationMessages: observation.validationMessages.map(normalizedLabel).filter(Boolean).sort(),
    transientBusy: observation.transientBusy
  });
}

export function iterativeVisionPolicy(
  attempts: VisionFillAttempt[],
  observation?: PageObservation
): Record<string, unknown> {
  const pendingRequiredFields = observation?.fields
    .filter((field) => field.type !== "file" && field.required && !observedFieldHasValue(field))
    .map((field) => ({
      fieldId: field.fieldId,
      stableFieldKey: field.stableFieldKey ?? null,
      label: field.label,
      type: field.type
    }))
    .slice(0, 40) ?? [];
  return {
    executionMode: "observe_decide_execute_reobserve",
    iterativeSingleAction: true,
    maxActions: 1,
    dynamicDom: true,
    candidateValuePolicy: "candidate_facts_only",
    requiredFieldPriority: "必须优先处理 pendingRequiredFields 中的空字段；同一语义的 #0/#1 是两个独立控件，不能互相视为已完成。",
    optionalFieldPolicy: "非必填字段默认不新增内容：简历推导、候选人信息包和跨岗位复用资料均不得触发填写；仅当用户已对当前岗位的当前字段明确确认答案时才可填写。页面已有值必须保留，可选字段不得阻断最终提交。",
    fileFieldPolicy: "文件上传由插件确定性文件链路处理；视觉模型不得生成或填写任何 file 控件值。",
    pendingRequiredFields,
    compositeFieldRules: {
      firstWorkStart: "开始工作年月是候选人整体字段，只填写一组；年控件使用 firstWorkStartYear，月控件使用 firstWorkStartMonth。",
      dateControls: "年、月是两个独立控件时必须拆分填写，不得把 YYYY-MM 同时写入两个控件。",
      degree: "最高学历只选择一次，并在页面显示值中回读确认。"
    },
    priorAttempts: attempts.slice(-20)
  };
}
