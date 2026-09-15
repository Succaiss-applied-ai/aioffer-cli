import type { PageObservation } from "../../page-adapter.js";
import {
  deterministicKnownFactActions,
  type DeterministicKnownFactAction
} from "../../vision-form-runtime.js";
import type { ApplicationAccessHint } from "../contracts.js";
import type { LayeredObservationSnapshot } from "../observation/snapshot.js";

export type LoginPreflightDecision = "continue" | "wait_for_login";

export interface LayeredDeterministicPlan {
  schemaVersion: "layered-deterministic-plan.v1";
  snapshotRevision: number;
  loginDecision: LoginPreflightDecision;
  actions: readonly DeterministicKnownFactAction[];
  unresolvedRequiredRegistryKeys: readonly string[];
  optionalBlankRegistryKeys: readonly string[];
}

/** Live-page evidence is authoritative; the AI-side tag only predicts routing. */
export function loginPreflightDecision(
  _accessHint: ApplicationAccessHint,
  liveLoginRequired: boolean
): LoginPreflightDecision {
  return liveLoginRequired ? "wait_for_login" : "continue";
}

export function planLayeredDeterministically(input: {
  snapshot: LayeredObservationSnapshot;
  observation: PageObservation;
  candidateFacts: Record<string, string>;
}): LayeredDeterministicPlan {
  const actions = deterministicKnownFactActions(input.observation, input.candidateFacts);
  const planned = new Set(actions.map((action) => action.stableFieldKey || action.fieldId));
  const unresolvedRequiredRegistryKeys = input.snapshot.fields
    .filter((field) => field.required && !field.currentValue.trim() &&
      !planned.has(field.stableFieldKey || field.sourceFieldId))
    .map((field) => field.registryKey);
  const optionalBlankRegistryKeys = input.snapshot.fields
    .filter((field) => !field.required && !field.currentValue.trim() &&
      !planned.has(field.stableFieldKey || field.sourceFieldId))
    .map((field) => field.registryKey);
  return Object.freeze({
    schemaVersion: "layered-deterministic-plan.v1",
    snapshotRevision: input.snapshot.revision,
    loginDecision: loginPreflightDecision(input.snapshot.accessHint, input.snapshot.liveLoginRequired),
    actions: Object.freeze(actions.map((action) => Object.freeze({ ...action }))),
    unresolvedRequiredRegistryKeys: Object.freeze(unresolvedRequiredRegistryKeys),
    optionalBlankRegistryKeys: Object.freeze(optionalBlankRegistryKeys)
  });
}
