import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import { RecruitingError } from "../../src/errors.js";
import { observedFieldHasValue } from "./form-validation.js";
import { isPreferredWorkCityField } from "./preferred-city-policy.js";
import { authoritativeCandidateFactForField, candidateInformationRequestsForMissingFields } from "./vision-form-runtime.js";

/** Preserve the single fill loop and its site-rejected/excluded field scope.
 * During repair, collect unavailable cities without hiding other known answers.
 * The underlying control sequence is identical to the real-page verifier. */
export async function prepareScopedWorkCityChoices(
  observation: PageObservation, facts: Record<string, string>, eligibleFields: PageFieldObservation[],
  discover: (fields: PageFieldObservation[]) => Promise<PageFieldObservation[]>,
  onUnavailable?: (field: PageFieldObservation, error: RecruitingError) => void
): Promise<PageObservation> {
  let prepared = observation;
  for (const field of eligibleFields) {
    if (!isPreferredWorkCityField(field)) continue;
    try {
      const single = await prepareRequiredWorkCityChoices({ ...prepared, fields: [field] }, facts, discover);
      prepared = { ...prepared, fields: prepared.fields.map(current =>
        current.fieldId === field.fieldId && current.stableFieldKey === field.stableFieldKey
          ? single.fields[0]! : current) };
    } catch (error) {
      if (!(error instanceof RecruitingError) || error.publicError.code !== "MISSING_INFORMATION" || !onUnavailable) throw error;
      onUnavailable(field, error);
    }
  }
  return prepared;
}

/** Discover choices before planning; an unreadable control is not missing candidate data. */
export async function prepareRequiredWorkCityChoices(
  observation: PageObservation, facts: Record<string, string>,
  discover: (fields: PageFieldObservation[]) => Promise<PageFieldObservation[]>
): Promise<PageObservation> {
  const targets = observation.fields.filter(field => field.required && !observedFieldHasValue(field) &&
    isPreferredWorkCityField(field) && /select|combobox|radio/i.test(`${field.type} ${field.controlKind ?? ""}`));
  if (!targets.length) return observation;
  const discovered = await discover(targets);
  const identity = (field: PageFieldObservation) => `${field.stableFieldKey ?? ""}\u0000${field.fieldId}`;
  const byIdentity = new Map(discovered.map(field => [identity(field), field]));
  const unreadable = targets.filter(field => !byIdentity.get(identity(field))?.options.length);
  if (unreadable.length) {
    throw new RecruitingError({
      code: "SITE_VALIDATION_BLOCKED", stage: "form_observation", retryable: false,
      message: "location_control_interaction_failed: 未读到当前岗位的有效城市选项，不能判断城市是否可选",
      userAction: "插件未能读取城市列表，当前岗位未提交，请联系支持。",
      details: { fields: unreadable.map(field => field.label) }
    });
  }
  const unavailable = discovered.filter(field => !authoritativeCandidateFactForField(field, facts));
  if (unavailable.length) {
    const requests = candidateInformationRequestsForMissingFields(unavailable, facts);
    throw new RecruitingError({
      code: "MISSING_INFORMATION", stage: "missing_information", retryable: false,
      message: "当前岗位没有匹配的首选或备选城市，请从返回的有效城市列表中选择。",
      userAction: "请在 AI Offer 中补充确认该岗位的意向城市后继续投递。",
      details: { fields: unavailable.map(field => field.label), requiredFieldRequests: requests, informationRequests: requests }
    });
  }
  return { ...observation, fields: observation.fields.map(field => byIdentity.get(identity(field)) ?? field) };
}
