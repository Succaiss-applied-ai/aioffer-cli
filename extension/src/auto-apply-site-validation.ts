import type { FillResult, FinalSubmitExecutionResult, PageFieldObservation, PageObservation } from "./page-adapter.js";
import { observedFieldHasValue } from "./form-validation.js";
import { RecruitingError } from "../../src/errors.js";
import { isPreferredWorkCityField } from "./preferred-city-policy.js";
import {
  authoritativeCandidateFactForField,
  confirmedCurrentJobFactForField,
  deterministicKnownFactActions,
  visionReadbackMatches
} from "./vision-form-runtime.js";

export const siteValidationFieldKey = (field: PageFieldObservation): string =>
  field.stableFieldKey ?? `${field.selector}:${field.label}:${field.type}`;

/**
 * A genuinely disabled field is owned by the recruiting site. Moka commonly
 * locks values produced by its resume parser. Observe those values for site
 * diagnostics, but never plan, repair or ask a Driver to overwrite them.
 * `readonly` is deliberately not equivalent: many registered custom selects
 * and calendars expose an operational readonly input.
 */
export const isSiteManagedDisabledField = (field: PageFieldObservation): boolean =>
  field.domHints?.disabled === true;

/** Keep the rejection-time descriptors when a conditional field disappears.
 * Never include unrelated stale errors or discard a field because it has a value. */
export function rejectedSubmissionFields(page: PageObservation, result: FinalSubmitExecutionResult): PageFieldObservation[] {
  if (!result.siteValidationConfirmed || page.url !== result.pageUrlAfterClick) return [];
  const pageOrder = new Map(page.fields.map((field, index) => [siteValidationFieldKey(field), index]));
  const orderedKeys = [...new Set(result.rejectedFieldKeys ?? [])].sort((left, right) =>
    (pageOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (pageOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
  return orderedKeys.flatMap(key => {
    const matches = page.fields.filter(field => siteValidationFieldKey(field) === key);
    const original = result.rejectedFields?.find(field => siteValidationFieldKey(field) === key);
    const field = matches.length === 1 ? matches[0] : original;
    if (!field) return [];
    return [{ ...field, required: true, validationMessage:
      result.nativeValidationErrors?.find(error => error.fieldKey === key)?.message ??
      field.validationMessage ?? original?.validationMessage ?? "招聘网站未接受该字段" }];
  });
}

/** An uncertain/empty readback is not proof of corrupted content. Never defer
 * unsafe targeting, an unregistered driver or missing live identity. A bound
 * field's readback mismatch is recorded, then the site owns acceptance. */
export function isUnconfirmedFieldReadback(input: {
  result: FillResult | null;
  current: PageFieldObservation | null | undefined;
  matches: boolean;
  error: string | null;
}): boolean {
  if (!input.result || !input.current) return false;
  const diagnosis = `${input.result.driverFailureCode ?? ""} ${input.error ?? ""}`;
  if (/unsupported|semantic|ambiguous|not_unique|target_missing|field_missing|option_unavailable|disappear|歧义|不唯一|语义|不存在|消失|错误控件/i.test(diagnosis)) return false;
  return /^(?:readback|commit)$/i.test(input.result.driverStage ?? "") ||
    /readback|validation_not_cleared|回读|未确认|未生效/i.test(diagnosis);
}

export function partitionSiteRejectedFields(
  observation: PageObservation, facts: Record<string, string>, rejectedKeys: ReadonlySet<string>
): { repairable: PageFieldObservation[]; missing: PageFieldObservation[]; locked: PageFieldObservation[] } {
  const rejected = siteRejectedFields(observation).filter((field) => rejectedKeys.has(siteValidationFieldKey(field)));
  const actionableIds = new Set(deterministicKnownFactActions({ ...observation, fields: rejected.map((field) =>
    ({ ...field, currentValue: "" })) }, facts).map((action) => action.fieldId));
  const hasFact = (field: PageFieldObservation) => Boolean(authoritativeCandidateFactForField(field, facts)) ||
    actionableIds.has(field.fieldId);
  const locked = rejected.filter(isSiteManagedDisabledField);
  const editable = rejected.filter((field) => !isSiteManagedDisabledField(field));
  return {
    repairable: editable.filter(hasFact),
    missing: editable.filter((field) => !hasFact(field)),
    locked
  };
}

/** A repaired value must exist and match its fact; a stale custom error alone
 * is not a new rejection. Some sites clear their errors only on next submit. */
export function siteRepairReadbackFailures(
  targets: PageFieldObservation[], current: PageObservation, facts: Record<string, string>
): PageFieldObservation[] {
  const actions = deterministicKnownFactActions({ ...current,
    fields: targets.map((field) => ({ ...field, currentValue: "" })) }, facts);
  return targets.filter((field) => {
    const live = current.fields.find((candidate) => siteValidationFieldKey(candidate) === siteValidationFieldKey(field));
    if (live && isSiteManagedDisabledField(live)) return false;
    const fact = authoritativeCandidateFactForField(isPreferredWorkCityField(field) && live ? live : field, facts);
    const action = actions.find((action) => action.fieldId === field.fieldId);
    const expected = fact?.value ?? action?.value;
    return !live || !expected || !observedFieldHasValue(live) ||
      !visionReadbackMatches(live, expected, fact?.key ?? action?.semanticKey);
  });
}

/**
 * Missing package facts are not proof that a site will reject a submission.
 * Keep the original observation intact, but do not ask the model to invent
 * answers or let an unfilled, unactionable field hold the initial fill open.
 * In a post-submit repair, only the exact site-rejected fields are editable.
 */
export function autoApplyFillObservation(
  observation: PageObservation,
  facts: Record<string, string>,
  repairFieldKeys?: ReadonlySet<string>
): PageObservation {
  // Preserve existing site-specific fact planning (e.g. Xiaopeng ranges).
  const actionableIds = new Set(deterministicKnownFactActions(observation, facts).map((action) => action.fieldId));
  return {
    ...observation,
    fields: observation.fields.flatMap((field) => {
      if (isSiteManagedDisabledField(field)) return [];
      if (repairFieldKeys) {
        return repairFieldKeys.has(siteValidationFieldKey(field)) ? [{ ...field, required: true }] : [];
      }
      const fact = field.required
        ? authoritativeCandidateFactForField(field, facts)
        : confirmedCurrentJobFactForField(field, facts);
      return fact || actionableIds.has(field.fieldId) ? [field] : [];
    })
  };
}

/** Only a field-owned site error, not a required marker or empty value. */
export function siteRejectedFields(observation: PageObservation): PageFieldObservation[] {
  return observation.fields.filter((field) => Boolean(field.validationMessage))
    .map((field) => ({ ...field, required: true }));
}

/** Disabled is a site gate, not evidence that a particular package fact is missing. */
export function requireUniqueFinalSubmitAction(observation: PageObservation, allowConsentClick = false) {
  const candidates = observation.actions.filter((action) => action.kind === "final_submit");
  const enabled = candidates.filter((action) => !action.disabled);
  if (enabled.length === 1) {
    if (enabled[0]!.requiresConsent && !allowConsentClick) throw new RecruitingError({
      code: "APPROVAL_INVALID", stage: "submission", retryable: false,
      message: "提交按钮同时包含协议授权，本次没有获得协议确认许可，未点击提交",
      userAction: "请确认该网站的协议授权后重新发起投递。",
      details: { failureCode: "final_submit_consent_not_authorized" }
    });
    return enabled[0]!;
  }
  const disabled = candidates.length === 1 && candidates[0]!.disabled;
  throw new RecruitingError({
    code: "FORM_FILL_VALIDATION_FAILED", stage: "submission", retryable: false,
    message: disabled ? "招聘网站禁用了最终提交按钮，本次未点击提交" : "最终提交按钮不唯一或不存在",
    userAction: disabled
      ? "请查看网站提示；插件不会强行启用按钮，也不会据此猜测缺失信息。"
      : "插件已停止，不会猜测或重复点击提交按钮。",
    details: { failureCode: disabled ? "final_submit_disabled" : "final_submit_target_unresolved",
      targetDiagnosis: disabled ? "disabled" : enabled.length > 1 ? "ambiguous" : "not_recognized",
      candidates: candidates.map(action => ({ text: action.text, selector: action.selector, disabled: action.disabled })),
      observedSubmitTexts: observation.submitCandidates,
      siteMessages: observation.validationMessages }
  });
}

export function siteValidationStateKey(observation: PageObservation): string {
  return JSON.stringify({
    url: observation.url,
    fields: siteRejectedFields(observation).map((field) => [
      siteValidationFieldKey(field), field.currentValue, field.validationMessage
    ]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    messages: [...observation.validationMessages].sort()
  });
}

/** Stale errors and notices cannot prove that this particular click failed. */
export function newlySiteRejectedFields(
  before: PageObservation, after: PageObservation, reassertedKeys: ReadonlySet<string> = new Set()
): PageFieldObservation[] {
  if (before.url !== after.url || after.pageStage !== "application_form") return [];
  const prior = new Set(siteRejectedFields(before).map((field) =>
    `${siteValidationFieldKey(field)}\u0000${field.validationMessage}`));
  return siteRejectedFields(after).filter((field) =>
    reassertedKeys.has(siteValidationFieldKey(field)) ||
    !prior.has(`${siteValidationFieldKey(field)}\u0000${field.validationMessage}`));
}

/**
 * An ATS validation node can survive between user-supplement rounds without a
 * new React mutation. After a new trusted submit, an unchanged field-owned
 * required error is still authoritative when that exact control remains
 * empty. Never apply this fallback to filled fields or arbitrary stale errors.
 */
export function persistedRequiredEmptyRejections(
  before: PageObservation, after: PageObservation
): PageFieldObservation[] {
  if (before.url !== after.url || after.pageStage !== "application_form") return [];
  const requiredMissing = /必填项未填写|请填写必填项|此项为必填|这是必填项|(?:为|是)必填(?:项)?|不能为空|required items? (?:are )?not filled in|this field is required/iu;
  const prior = new Set(siteRejectedFields(before).map((field) =>
    `${siteValidationFieldKey(field)}\u0000${field.validationMessage}`));
  return siteRejectedFields(after).filter((field) =>
    !observedFieldHasValue(field) &&
    requiredMissing.test(field.validationMessage ?? "") &&
    prior.has(`${siteValidationFieldKey(field)}\u0000${field.validationMessage}`));
}

/**
 * One rejection collector is shared by the active 12-second submit observer
 * and the passive receipt monitor. This prevents a Formily rejection that
 * arrives near the handoff boundary from being classified differently.
 */
export function submissionRejectedFields(
  before: PageObservation,
  after: PageObservation,
  options: {
    reassertedKeys?: ReadonlySet<string>;
    nativeErrors?: ReadonlyArray<{ fieldKey: string | null; message: string }>;
    previouslyRejectedKeys?: ReadonlySet<string>;
  } = {}
): PageFieldObservation[] {
  if (before.url !== after.url || after.pageStage !== "application_form") return [];
  const reassertedKeys = options.reassertedKeys ?? new Set<string>();
  const nativeErrors = options.nativeErrors ?? [];
  const previouslyRejectedKeys = options.previouslyRejectedKeys ?? new Set<string>();
  const byKey = new Map<string, PageFieldObservation>();
  for (const field of [
    ...newlySiteRejectedFields(before, after, reassertedKeys),
    ...persistedRequiredEmptyRejections(before, after),
    ...persistedPreviouslyRejectedFields(before, after, previouslyRejectedKeys)
  ]) byKey.set(siteValidationFieldKey(field), field);
  for (const error of nativeErrors) {
    if (!error.fieldKey) continue;
    const field = after.fields.find((candidate) => siteValidationFieldKey(candidate) === error.fieldKey);
    if (field) byKey.set(error.fieldKey, { ...field, validationMessage: error.message });
  }
  return after.fields.flatMap((field) => {
    const rejected = byKey.get(siteValidationFieldKey(field));
    return rejected ? [{ ...rejected, required: true }] : [];
  });
}

/**
 * The one permitted resubmission carries the exact frozen rejection scope from
 * the first click. If one of those field-owned errors survives unchanged after
 * that second trusted click, it is still a current rejection even when the
 * control displays the repaired value. This authority never applies to fields
 * outside the frozen set.
 */
export function persistedPreviouslyRejectedFields(
  before: PageObservation,
  after: PageObservation,
  previouslyRejectedKeys: ReadonlySet<string>
): PageFieldObservation[] {
  if (before.url !== after.url || after.pageStage !== "application_form" || previouslyRejectedKeys.size === 0) return [];
  const prior = new Set(siteRejectedFields(before).map((field) =>
    `${siteValidationFieldKey(field)}\u0000${field.validationMessage}`));
  return siteRejectedFields(after).filter((field) => {
    const key = siteValidationFieldKey(field);
    return previouslyRejectedKeys.has(key) &&
      prior.has(`${key}\u0000${field.validationMessage}`);
  });
}

export function newSiteValidationErrors(
  before: PageObservation, after: PageObservation, reassertedKeys: ReadonlySet<string> = new Set()
): string[] {
  if (before.url !== after.url || after.pageStage !== "application_form") return [];
  const errors = newlySiteRejectedFields(before, after, reassertedKeys)
    .map((field) => `${field.label}：${field.validationMessage}`);
  errors.push(...after.validationMessages.filter((message) => !before.validationMessages.includes(message)));
  return [...new Set(errors)];
}
