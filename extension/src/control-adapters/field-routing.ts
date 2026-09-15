import type { FillInstruction, FillResult, PageFieldObservation, PageObservation } from "../page-adapter.js";
import { resolveControlAdapter } from "./registry.js";
import type { ControlAdapterEvidence, ControlAdapterResolution } from "./types.js";

export function evidenceForField(page: Pick<PageObservation, "url">, field: PageFieldObservation,
  instruction?: FillInstruction): ControlAdapterEvidence {
  const hints = field.domHints;
  return {
    observedControlKind: field.observedControlKind,
    compoundKind: field.compound?.kind,
    ownedInputCount: hints?.ownedInputCount,
    applicationUrl: page.url, label: field.label,
    semanticKey: [field.stableFieldKey, instruction?.semanticKey].filter(Boolean).join(" "),
    type: hints?.inputType || field.type, controlKind: field.controlKind ?? "",
    tagName: hints?.tagName ?? "", readOnly: hints?.readOnly ?? true,
    placeholder: hints?.placeholder || (field.temporal?.part === "year" ? "年" : field.temporal?.part === "month" ? "月" : ""),
    classNames: hints?.classNames ?? [], role: hints?.role ?? "",
    ancestorIds: hints?.ancestorIds ?? [],
    ariaHasPopup: hints?.ariaHasPopup ?? "", ariaAutocomplete: hints?.ariaAutocomplete ?? "",
    disabled: hints?.disabled
  };
}

/** An ordinal is usable only to locate the original observation. Never rebind
 * a live field by it, by a nearby label or by a cached structural selector. */
export function bindObservedInstruction(page: PageObservation, instruction: FillInstruction): PageFieldObservation | null {
  if (!instruction.stableFieldKey) return null;
  // #N is only an observer collision ordinal. For colliding semantic keys,
  // bind by the semantic base AND exact visible label, never by that ordinal.
  const base = instruction.stableFieldKey.replace(/#\d+$/, "");
  // A selected option can reveal another control with the same semantic base.
  // Its #N suffix then appears only in the new observation, not in the plan.
  const collision = /#\d+$/.test(instruction.stableFieldKey) || page.fields.some(field =>
    /#\d+$/.test(field.stableFieldKey ?? "") && field.stableFieldKey?.replace(/#\d+$/, "") === base);
  if (collision && !instruction.expectedLabel) return null;
  const matches = page.fields.filter(field => collision
    ? field.stableFieldKey?.replace(/#\d+$/, "") === base && field.label === instruction.expectedLabel
    : field.stableFieldKey === instruction.stableFieldKey);
  if (matches.length !== 1) return null;
  const field = matches[0]!;
  // A corrected ATS identity must not adopt an old collision ordinal whose
  // original owner (for example, a relative named 姓名) is no longer known.
  if (collision && field.fieldSource && field.stableFieldKey !== instruction.stableFieldKey) return null;
  if (instruction.expectedLabel && field.label !== instruction.expectedLabel) return null;
  return field;
}

export function controlRoutingFailure(instruction: FillInstruction, field: PageFieldObservation | null,
  code: string, detail: string, route?: ControlAdapterResolution): FillResult {
  return { fieldId: instruction.fieldId, success: false, expected: String(instruction.value ?? ""),
    actual: field?.currentValue ?? "", error: `${code}: ${field?.label ?? instruction.expectedLabel ?? "未知字段"}；${detail}`,
    driverStage: "detect", driverFailureCode: code,
    ...(route ? { controlAdapter: route.diagnostic } : {}) };
}

export type ControlExecutor = (field: PageFieldObservation, instruction: FillInstruction,
  route: ControlAdapterResolution) => Promise<FillResult | null>;

export function lockedControlRouteFailure(field: PageFieldObservation, instruction: FillInstruction,
  route: ControlAdapterResolution): FillResult | null {
  return instruction.controlAdapter && instruction.controlAdapter.registrationId !== route.diagnostic.registrationId
    ? controlRoutingFailure(instruction, field, "control_route_changed", "实时验签与已选 Driver 不一致，未执行动作", route)
    : null;
}

export async function executeSelectedControl(route: ControlAdapterResolution, instruction: FillInstruction,
  field: PageFieldObservation, executors: Readonly<Record<string, ControlExecutor>>): Promise<FillResult> {
  const execute = executors[route.code];
  if (route.driver === "unsupported" || !execute) return controlRoutingFailure(instruction, field,
    "unsupported_required_control", `未登记可在当前执行面运行的唯一 Driver（${route.diagnostic.controlName}）`, route);
  if (field.domHints?.disabled) return controlRoutingFailure(instruction, field,
    "control_disabled", "控件不可编辑，未操作或改走其他 Driver", route);
  const { dateValue, datePrecision, ...scalar } = instruction;
  const liveInstruction: FillInstruction = {
    ...(route.readbackStrategy === "structured_temporal" ? instruction : scalar),
    fieldId: field.fieldId, selector: field.selector, type: field.type,
    expectedLabel: field.label, popupBinding: field.popupBinding,
    controlAdapter: route.diagnostic
  };
  try {
    const result = await execute(field, liveInstruction, route);
    if (!result) return controlRoutingFailure(instruction, field, "control_driver_rejected",
      "已选 Driver 未接受当前控件，未尝试其他 Driver", route);
    if (result.controlAdapter && result.controlAdapter.registrationId !== route.diagnostic.registrationId) {
      return controlRoutingFailure(instruction, field, "control_route_changed", "执行时控件签名发生变化，需重新检查", route);
    }
    return { ...result, fieldId: instruction.fieldId, controlAdapter: route.diagnostic };
  } catch (error) {
    return { ...controlRoutingFailure(instruction, field, "control_execution_failed",
      error instanceof Error ? error.message : "Driver 执行异常", route), driverStage: "interaction" };
  }
}

/** The sole dispatch boundary. Select once, invoke once, never fall through. */
export async function dispatchControlInstruction(page: PageObservation, instruction: FillInstruction,
  executors: Readonly<Record<string, ControlExecutor>>): Promise<FillResult> {
  if (page.pageStage !== "application_form" || (instruction.applicationUrl && instruction.applicationUrl !== page.url)) {
    return controlRoutingFailure(instruction, null, "control_page_changed", "当前页面不是原申请表，未执行操作");
  }
  const field = bindObservedInstruction(page, instruction);
  if (!field) return controlRoutingFailure(instruction, null, "control_target_missing", "稳定字段身份失联或存在歧义，未执行写入");
  const route = resolveControlAdapter(evidenceForField(page, field, instruction));
  return executeSelectedControl(route, { ...instruction, applicationUrl: page.url }, field, executors);
}
