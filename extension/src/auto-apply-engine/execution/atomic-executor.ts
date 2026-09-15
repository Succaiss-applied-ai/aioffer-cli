import type { LayeredObservationSnapshot, RegisteredObservedField } from "../observation/snapshot.js";

export interface AtomicFieldAction {
  type: "fill_field" | "select_option";
  registryKey: string;
  value: string;
  semanticKey?: string | null;
}

export interface AtomicFieldExecutionResult {
  status: "succeeded" | "field_not_found" | "execution_failed" | "readback_mismatch";
  registryKey: string;
  beforeRevision: number;
  afterRevision: number | null;
  rebound: boolean;
  readbackMatched: boolean;
  error: string | null;
}

export interface AtomicFieldExecutorDependencies {
  observe(): Promise<LayeredObservationSnapshot>;
  perform(input: {
    action: AtomicFieldAction;
    field: RegisteredObservedField;
    snapshot: LayeredObservationSnapshot;
  }): Promise<{ success: boolean; error?: string | null }>;
  waitForStable(input: {
    before: LayeredObservationSnapshot;
    action: AtomicFieldAction;
  }): Promise<void>;
  readbackMatches(field: RegisteredObservedField, expected: string): boolean;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[\s·._-]+/g, "");
}

export function defaultAtomicReadbackMatches(field: RegisteredObservedField, expected: string): boolean {
  const actual = normalized(field.currentValue);
  const target = normalized(expected);
  if (!actual || !target) return false;
  if (["select", "combobox"].includes(field.type)) {
    return actual === target || actual.includes(target) || target.includes(actual);
  }
  return actual === target;
}

function compactLabel(value: string): string {
  return value.toLowerCase().replace(/[＊*()（）【】\[\]{}<>《》:：｜|·・._\s-]+/g, "");
}

/** Rebinds a field after a React/Vue form rebuild without using sourceFieldId. */
export function rebindRegisteredField(
  before: RegisteredObservedField,
  after: LayeredObservationSnapshot
): RegisteredObservedField | null {
  const exact = after.fields.find((field) => field.registryKey === before.registryKey);
  if (exact) return exact;
  const candidates = after.fields.map((field) => {
    let score = 0;
    if (before.stableFieldKey && field.stableFieldKey === before.stableFieldKey) score += 120;
    if (compactLabel(field.label) === compactLabel(before.label)) score += 80;
    if (field.controlKind === before.controlKind) score += 25;
    if (field.type === before.type) score += 20;
    if (before.sectionKey && field.sectionKey === before.sectionKey) score += 30;
    if (before.groupIndex !== null && field.groupIndex === before.groupIndex) score += 20;
    if (field.occurrence === before.occurrence) score += 15;
    return { field, score };
  }).sort((left, right) => right.score - left.score);
  return candidates[0] && candidates[0].score >= 100 ? candidates[0].field : null;
}

/**
 * Executes exactly one field mutation. A fresh observation is taken before the
 * action, then the page is allowed to settle and observed again for readback.
 * No submit/navigation operation exists in this interface.
 */
export async function executeAtomicFieldAction(input: {
  action: AtomicFieldAction;
  dependencies: AtomicFieldExecutorDependencies;
}): Promise<AtomicFieldExecutionResult> {
  const before = await input.dependencies.observe();
  const field = before.fields.find((entry) => entry.registryKey === input.action.registryKey) ?? null;
  if (!field) {
    return {
      status: "field_not_found", registryKey: input.action.registryKey,
      beforeRevision: before.revision, afterRevision: null, rebound: false,
      readbackMatched: false, error: "执行前重新观察后找不到目标字段"
    };
  }
  const execution = await input.dependencies.perform({ action: input.action, field, snapshot: before });
  if (!execution.success) {
    return {
      status: "execution_failed", registryKey: input.action.registryKey,
      beforeRevision: before.revision, afterRevision: null, rebound: false,
      readbackMatched: false, error: execution.error ?? "字段操作失败"
    };
  }
  await input.dependencies.waitForStable({ before, action: input.action });
  const after = await input.dependencies.observe();
  const rebound = rebindRegisteredField(field, after);
  const matched = Boolean(rebound && input.dependencies.readbackMatches(rebound, input.action.value));
  return {
    status: matched ? "succeeded" : "readback_mismatch",
    registryKey: input.action.registryKey,
    beforeRevision: before.revision,
    afterRevision: after.revision,
    rebound: Boolean(rebound),
    readbackMatched: matched,
    error: matched ? null : rebound ? "字段操作后回读不一致" : "页面重建后无法重新绑定目标字段"
  };
}
