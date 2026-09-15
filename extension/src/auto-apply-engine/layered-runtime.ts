import type { PageObservation } from "../page-adapter.js";
import { isMokaAuthenticityDeclarationField } from "../vision-form-runtime.js";
import type { ApplicationAccessHint } from "./contracts.js";
import type { AtomicFieldAction, AtomicFieldExecutionResult } from "./execution/atomic-executor.js";
import { buildLayeredObservationSnapshot, type LayeredObservationSnapshot } from "./observation/snapshot.js";
import { planLayeredDeterministically } from "./planning/deterministic-planner.js";
import {
  buildVisionRepairRequest,
  validateVisionRepairResponse,
  type VisionRepairRequest
} from "./planning/vision-repair.js";

export type LayeredValidateOnlyStatus =
  | "ready_for_final_review"
  | "ready_for_dedicated_declaration"
  | "waiting_for_login"
  | "needs_information"
  | "unsupported_required_control"
  | "field_execution_failed"
  | "model_response_invalid"
  | "no_progress";

export interface LayeredValidateOnlyResult {
  schemaVersion: "layered-validate-only-result.v1";
  status: LayeredValidateOnlyStatus;
  transitions: number;
  snapshotRevision: number;
  unresolvedRequiredRegistryKeys: string[];
  requestInformationRegistryKey: string | null;
  error: string | null;
}

export interface LayeredRuntimeObservation {
  observation: PageObservation;
  snapshot: LayeredObservationSnapshot;
}

export interface LayeredValidateOnlyDependencies {
  observe(): Promise<LayeredRuntimeObservation>;
  execute(action: AtomicFieldAction): Promise<AtomicFieldExecutionResult>;
  requestVisionRepair(request: VisionRepairRequest): Promise<unknown>;
}

function unresolvedFields(snapshot: LayeredObservationSnapshot, keys: readonly string[]) {
  const allowed = new Set(keys);
  return snapshot.fields.filter((field) => allowed.has(field.registryKey));
}

function result(input: {
  status: LayeredValidateOnlyStatus;
  transitions: number;
  snapshot: LayeredObservationSnapshot;
  unresolved?: readonly string[];
  requestInformationRegistryKey?: string | null;
  error?: string | null;
}): LayeredValidateOnlyResult {
  return {
    schemaVersion: "layered-validate-only-result.v1",
    status: input.status,
    transitions: input.transitions,
    snapshotRevision: input.snapshot.revision,
    unresolvedRequiredRegistryKeys: [...(input.unresolved ?? [])],
    requestInformationRegistryKey: input.requestInformationRegistryKey ?? null,
    error: input.error ?? null
  };
}

function deterministicAtomicAction(input: {
  snapshot: LayeredObservationSnapshot;
  fieldId: string;
  stableFieldKey: string | null;
  type: "fill_field" | "select_option";
  semanticKey: string;
  value: string;
}): AtomicFieldAction | null {
  const field = input.snapshot.fields.find((entry) =>
    (input.stableFieldKey && entry.stableFieldKey === input.stableFieldKey) ||
    entry.sourceFieldId === input.fieldId
  );
  return field ? {
    type: input.type,
    registryKey: field.registryKey,
    semanticKey: input.semanticKey,
    value: input.value
  } : null;
}

/**
 * Layered V2 validation runtime. It may fill fields but deliberately has no
 * declaration, preview or final-submit capability. Those remain dedicated
 * post-validation stages guarded by the batch authorization boundary.
 */
export async function runLayeredValidateOnly(input: {
  candidateFacts: Record<string, string>;
  accessHint: ApplicationAccessHint;
  dependencies: LayeredValidateOnlyDependencies;
  maxTransitions?: number;
}): Promise<LayeredValidateOnlyResult> {
  const maxTransitions = Math.max(1, Math.min(input.maxTransitions ?? 24, 60));
  let transitions = 0;
  let previousFingerprint: string | null = null;
  let unchangedTransitions = 0;

  while (transitions < maxTransitions) {
    const current = await input.dependencies.observe();
    const snapshot = current.snapshot.schemaVersion === "layered-observation-snapshot.v1"
      ? current.snapshot
      : buildLayeredObservationSnapshot({
        observation: current.observation, revision: transitions + 1, accessHint: input.accessHint
      });
    if (snapshot.liveLoginRequired) {
      return result({ status: "waiting_for_login", transitions, snapshot, error: snapshot.loginReason });
    }
    if (!snapshot.formDetected) {
      return result({ status: "no_progress", transitions, snapshot, error: "当前页面未检测到投递表单" });
    }

    const plan = planLayeredDeterministically({
      snapshot,
      observation: current.observation,
      candidateFacts: input.candidateFacts
    });
    const unresolved = plan.unresolvedRequiredRegistryKeys;
    if (plan.actions.length === 0 && unresolved.length === 0) {
      return result({ status: "ready_for_final_review", transitions, snapshot });
    }

    if (plan.actions.length > 0) {
      const planned = plan.actions[0]!;
      const action = deterministicAtomicAction({ snapshot, ...planned });
      if (!action) {
        return result({
          status: "field_execution_failed", transitions, snapshot, unresolved,
          error: "确定性动作无法绑定到当前快照字段"
        });
      }
      const execution = await input.dependencies.execute(action);
      transitions += 1;
      if (execution.status !== "succeeded") {
        return result({
          status: "field_execution_failed", transitions, snapshot, unresolved,
          error: execution.error ?? execution.status
        });
      }
      continue;
    }

    const pending = unresolvedFields(snapshot, unresolved);
    if (pending.length > 0 && pending.every((field) =>
      isMokaAuthenticityDeclarationField({ label: field.label, type: field.type })
    )) {
      return result({ status: "ready_for_dedicated_declaration", transitions, snapshot, unresolved });
    }
    if (pending.some((field) => field.type === "file" || ["checkbox", "radio"].includes(field.type))) {
      return result({
        status: "unsupported_required_control", transitions, snapshot, unresolved,
        error: "存在必须由专用文件或声明步骤处理的必填控件"
      });
    }

    const request = buildVisionRepairRequest({
      snapshot,
      unresolvedRequiredRegistryKeys: unresolved,
      candidateFacts: input.candidateFacts
    });
    if (request.unresolvedRequiredFields.length === 0) {
      return result({
        status: "unsupported_required_control", transitions, snapshot, unresolved,
        error: "没有可安全交给视觉补缺模型的必填字段"
      });
    }
    const response = await input.dependencies.requestVisionRepair(request);
    const validated = validateVisionRepairResponse({
      response, snapshot, unresolvedRequiredRegistryKeys: unresolved,
      candidateFacts: input.candidateFacts
    });
    if (!validated.ok || !validated.action) {
      return result({
        status: "model_response_invalid", transitions, snapshot, unresolved,
        error: validated.errors.join("；")
      });
    }
    const action = validated.action;
    if (action.type === "request_information") {
      return result({
        status: "needs_information", transitions, snapshot, unresolved,
        requestInformationRegistryKey: action.registryKey
      });
    }
    if (["stop_for_user", "stop_unsupported"].includes(action.type)) {
      return result({
        status: action.type === "stop_for_user" ? "needs_information" : "unsupported_required_control",
        transitions, snapshot, unresolved, requestInformationRegistryKey: action.registryKey,
        error: action.reason
      });
    }
    const execution = await input.dependencies.execute({
      type: action.type,
      registryKey: action.registryKey!,
      semanticKey: action.semanticKey,
      value: action.value!
    });
    transitions += 1;
    if (execution.status !== "succeeded") {
      return result({
        status: "field_execution_failed", transitions, snapshot, unresolved,
        error: execution.error ?? execution.status
      });
    }

    if (previousFingerprint === snapshot.formFingerprint) unchangedTransitions += 1;
    else unchangedTransitions = 0;
    previousFingerprint = snapshot.formFingerprint;
    if (unchangedTransitions >= 2) {
      return result({ status: "no_progress", transitions, snapshot, unresolved, error: "连续操作后页面状态未变化" });
    }
  }

  const current = await input.dependencies.observe();
  return result({
    status: "no_progress",
    transitions: maxTransitions,
    snapshot: current.snapshot,
    error: `达到 ${maxTransitions} 次受控状态转换上限`
  });
}
