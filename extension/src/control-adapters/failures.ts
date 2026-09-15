import type { ControlAdapterDiagnostic } from "./types.js";

export const UNSUPPORTED_REQUIRED_CONTROL = "unsupported_required_control";

export type ControlAdapterFailureReasonCode =
  | "unsupported_required_control"
  | "control_interaction_failed"
  | "field_fill_readback_failed"
  | "date_control_interaction_failed"
  | "location_control_interaction_failed"
  | "recruiting_source_control_interaction_failed";

export interface ControlAdapterFailureDetails {
  schemaVersion: "control-adapter-failure.v1";
  reasonCode: ControlAdapterFailureReasonCode;
  fieldId: string;
  stableFieldKey: string | null;
  siteName: string;
  fieldName: string;
  controlType: string;
  adapterCode: string;
  expectedValue: string;
  actualValue: string;
  driverStage: string | null;
  controlAdapter: ControlAdapterDiagnostic | null;
}

export function controlAdapterFailureDetails(input: {
  reasonCode: ControlAdapterFailureReasonCode;
  fieldId: string;
  stableFieldKey?: string | null;
  fieldName: string;
  expectedValue: string;
  actualValue: string;
  driverStage?: string | null;
  controlAdapter?: ControlAdapterDiagnostic | null;
}): ControlAdapterFailureDetails {
  const diagnostic = input.controlAdapter ?? null;
  return {
    schemaVersion: "control-adapter-failure.v1",
    reasonCode: input.reasonCode,
    fieldId: input.fieldId,
    stableFieldKey: input.stableFieldKey ?? null,
    siteName: diagnostic?.siteName ?? "",
    fieldName: diagnostic?.fieldName ?? input.fieldName,
    controlType: diagnostic?.controlType ?? "",
    adapterCode: diagnostic?.adapterCode ?? "",
    expectedValue: input.expectedValue,
    actualValue: input.actualValue,
    driverStage: input.driverStage ?? null,
    controlAdapter: diagnostic
  };
}

export function unsupportedRequiredControlFailure(input: {
  label: string;
  controlType: string;
  adapterCode?: string;
  detail?: string;
}): string {
  const label = input.label.trim() || "未命名必填项";
  const controlType = input.controlType.trim() || "自定义控件";
  const adapter = input.adapterCode?.trim() ? `；识别结果 ${input.adapterCode.trim()}` : "";
  const detail = input.detail?.trim() ? `；${input.detail.trim()}` : "";
  return `${UNSUPPORTED_REQUIRED_CONTROL}: 暂不支持必填项「${label}」的${controlType}${adapter}${detail}`;
}

export function isUnsupportedRequiredControlFailure(value: unknown): boolean {
  return String(value ?? "").startsWith(`${UNSUPPORTED_REQUIRED_CONTROL}:`);
}
