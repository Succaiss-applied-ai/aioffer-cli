import type { PageObservation } from "../page-adapter.js";
import type { ApplicationAccessHint } from "./contracts.js";
import { buildLayeredObservationSnapshot } from "./observation/snapshot.js";
import { planLayeredDeterministically } from "./planning/deterministic-planner.js";

export interface LayeredShadowReport {
  schemaVersion: "layered-shadow-report.v1";
  snapshotRevision: number;
  accessHint: ApplicationAccessHint;
  liveLoginRequired: boolean;
  loginDecision: "continue" | "wait_for_login";
  observedFieldCount: number;
  deterministicActionCount: number;
  deterministicActionRegistryKeys: readonly string[];
  unresolvedRequiredRegistryKeys: readonly string[];
  optionalBlankCount: number;
}

/**
 * Read-only analysis. The report deliberately excludes candidate values and
 * current form values so it can be persisted as a redacted diagnostic.
 */
export function buildLayeredShadowReport(input: {
  observation: PageObservation;
  candidateFacts: Record<string, string>;
  accessHint: ApplicationAccessHint;
  revision?: number;
}): LayeredShadowReport {
  const snapshot = buildLayeredObservationSnapshot({
    observation: input.observation,
    revision: input.revision ?? 1,
    accessHint: input.accessHint
  });
  const plan = planLayeredDeterministically({
    snapshot,
    observation: input.observation,
    candidateFacts: input.candidateFacts
  });
  const sourceByFieldId = new Map(snapshot.fields.map((field) => [field.sourceFieldId, field.registryKey]));
  return Object.freeze({
    schemaVersion: "layered-shadow-report.v1",
    snapshotRevision: snapshot.revision,
    accessHint: snapshot.accessHint,
    liveLoginRequired: snapshot.liveLoginRequired,
    loginDecision: plan.loginDecision,
    observedFieldCount: snapshot.fields.length,
    deterministicActionCount: plan.actions.length,
    deterministicActionRegistryKeys: Object.freeze(plan.actions.map((action) =>
      action.stableFieldKey || sourceByFieldId.get(action.fieldId) || "unresolved"
    )),
    unresolvedRequiredRegistryKeys: plan.unresolvedRequiredRegistryKeys,
    optionalBlankCount: plan.optionalBlankRegistryKeys.length
  });
}
