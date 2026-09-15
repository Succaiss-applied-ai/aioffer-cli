import { isVisionValueTraceable } from "../../vision-form-runtime.js";
import type { LayeredObservationSnapshot, RegisteredObservedField } from "../observation/snapshot.js";

export type VisionRepairActionType =
  | "fill_field"
  | "select_option"
  | "request_information"
  | "stop_for_user"
  | "stop_unsupported";

export interface VisionRepairAction {
  type: VisionRepairActionType;
  registryKey: string | null;
  semanticKey: string | null;
  value: string | null;
  reason: string;
}

export interface VisionRepairRequest {
  schemaVersion: "vision-repair-request.v2";
  task: "repair_required_application_field";
  page: {
    origin: string;
    title: string;
    formFingerprint: string;
    snapshotRevision: number;
  };
  unresolvedRequiredFields: Array<{
    registryKey: string;
    label: string;
    sectionKey: string | null;
    groupIndex: number | null;
    controlKind: string;
    type: string;
    options: string[];
  }>;
  candidateFacts: Array<{ semanticKey: string; value: string }>;
  policy: {
    oneActionOnly: true;
    requiredFieldsOnly: true;
    candidateFactsOnly: true;
    fileControlsForbidden: true;
    consentControlsForbidden: true;
    finalSubmitForbidden: true;
  };
}

export interface VisionRepairValidationResult {
  ok: boolean;
  action: VisionRepairAction | null;
  errors: string[];
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "unknown";
  }
}

function factEntries(candidateFacts: Record<string, string>): Array<{ semanticKey: string; value: string }> {
  return Object.entries(candidateFacts)
    .map(([semanticKey, value]) => ({ semanticKey: clean(semanticKey), value: clean(value) }))
    .filter((entry) => entry.semanticKey && entry.value)
    .sort((left, right) => left.semanticKey.localeCompare(right.semanticKey));
}

function unresolvedField(
  snapshot: LayeredObservationSnapshot,
  unresolvedRequiredRegistryKeys: readonly string[],
  registryKey: string
): RegisteredObservedField | null {
  if (!unresolvedRequiredRegistryKeys.includes(registryKey)) return null;
  const field = snapshot.fields.find((entry) => entry.registryKey === registryKey) ?? null;
  if (!field?.required || field.currentValue.trim()) return null;
  return field;
}

function firstFact(candidateFacts: Record<string, string>, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = Object.entries(candidateFacts).find(([key, value]) => value.trim() && pattern.test(key));
    if (match) return match[1].trim();
  }
  return null;
}

function authoritativeValueForField(
  field: RegisteredObservedField,
  candidateFacts: Record<string, string>
): string | null {
  if (/(?:^|[·\s])姓名|名字|full[_\s-]?name/i.test(field.label) &&
      !/公司|项目|学校|院校|专业/.test(field.label)) {
    return firstFact(candidateFacts, [
      /^(?:candidate\.)?basic\.(?:fullName|name)$/i,
      /(?:basic|candidate\.basic).*(?:fullName|\.name$)/i
    ]);
  }
  if (/邮箱|电子邮件|\bemail\b/i.test(field.label)) {
    return firstFact(candidateFacts, [/^(?:candidate\.)?basic\.email$/i, /candidate\.basic.*email/i]);
  }
  if (/手机|联系电话|电话号码|\b(?:phone|mobile)\b/i.test(field.label)) {
    return firstFact(candidateFacts, [
      /^(?:candidate\.)?basic\.(?:phone|mobile)$/i,
      /candidate\.basic.*(?:phone|mobile)/i
    ]);
  }
  if (/最高学历|学历|学位|degree/i.test(field.label)) {
    return firstFact(candidateFacts, [/(?:candidate\.)?basic\.highestDegree$/i, /highestDegree/i]);
  }
  return null;
}

export function buildVisionRepairRequest(input: {
  snapshot: LayeredObservationSnapshot;
  unresolvedRequiredRegistryKeys: readonly string[];
  candidateFacts: Record<string, string>;
}): VisionRepairRequest {
  const allowed = new Set(input.unresolvedRequiredRegistryKeys);
  return {
    schemaVersion: "vision-repair-request.v2",
    task: "repair_required_application_field",
    page: {
      origin: safeOrigin(input.snapshot.url),
      title: input.snapshot.title,
      formFingerprint: input.snapshot.formFingerprint,
      snapshotRevision: input.snapshot.revision
    },
    unresolvedRequiredFields: input.snapshot.fields
      .filter((field) => allowed.has(field.registryKey) && field.required && !field.currentValue.trim())
      .filter((field) => field.type !== "file" && !["checkbox", "radio"].includes(field.type))
      .map((field) => ({
        registryKey: field.registryKey,
        label: field.label,
        sectionKey: field.sectionKey,
        groupIndex: field.groupIndex,
        controlKind: field.controlKind,
        type: field.type,
        options: [...field.options]
      })),
    candidateFacts: factEntries(input.candidateFacts),
    policy: {
      oneActionOnly: true,
      requiredFieldsOnly: true,
      candidateFactsOnly: true,
      fileControlsForbidden: true,
      consentControlsForbidden: true,
      finalSubmitForbidden: true
    }
  };
}

export function validateVisionRepairResponse(input: {
  response: unknown;
  snapshot: LayeredObservationSnapshot;
  unresolvedRequiredRegistryKeys: readonly string[];
  candidateFacts: Record<string, string>;
}): VisionRepairValidationResult {
  const root = object(input.response);
  const candidate = object(root?.action ?? root?.result ?? input.response);
  if (!candidate) return { ok: false, action: null, errors: ["视觉补缺响应必须包含一个 action 对象"] };

  const type = clean(candidate.type) as VisionRepairActionType;
  const supported: VisionRepairActionType[] = [
    "fill_field", "select_option", "request_information", "stop_for_user", "stop_unsupported"
  ];
  if (!supported.includes(type)) {
    return { ok: false, action: null, errors: [`不允许的视觉补缺动作：${type || "空"}`] };
  }

  const registryKey = clean(candidate.registryKey) || null;
  const semanticKey = clean(candidate.semanticKey) || null;
  const value = candidate.value === null || candidate.value === undefined ? null : clean(candidate.value);
  const reason = clean(candidate.reason) || "视觉补缺未提供原因";
  const action: VisionRepairAction = { type, registryKey, semanticKey, value, reason };

  if (["stop_for_user", "stop_unsupported"].includes(type)) {
    return { ok: true, action, errors: [] };
  }

  if (type === "request_information") {
    if (!registryKey || !unresolvedField(input.snapshot, input.unresolvedRequiredRegistryKeys, registryKey)) {
      return { ok: false, action: null, errors: ["索要信息的字段不是当前未解决必填字段"] };
    }
    return { ok: true, action, errors: [] };
  }

  if (!registryKey) return { ok: false, action: null, errors: ["填写动作缺少 registryKey"] };
  const field = unresolvedField(input.snapshot, input.unresolvedRequiredRegistryKeys, registryKey);
  if (!field) return { ok: false, action: null, errors: ["模型试图操作非必填、已完成或不存在的字段"] };
  if (field.type === "file" || ["checkbox", "radio"].includes(field.type)) {
    return { ok: false, action: null, errors: ["文件和声明控件不得交给视觉补缺模型操作"] };
  }
  if (!value) return { ok: false, action: null, errors: ["填写动作缺少非空 value"] };
  const authoritativeValue = authoritativeValueForField(field, input.candidateFacts);
  if (authoritativeValue && authoritativeValue.trim() !== value) {
    return { ok: false, action: null, errors: ["视觉模型不得覆盖候选人信息包中的确定性身份字段"] };
  }
  if (semanticKey && input.candidateFacts[semanticKey] !== undefined &&
      !isVisionValueTraceable({ [semanticKey]: input.candidateFacts[semanticKey]! }, value)) {
    return { ok: false, action: null, errors: ["动作值与声明的候选事实不一致"] };
  }
  if (!isVisionValueTraceable(input.candidateFacts, value)) {
    return { ok: false, action: null, errors: ["动作值无法追溯到候选人信息包"] };
  }
  if (type === "select_option" && field.options.length > 0 &&
      !field.options.some((option) => option.trim() === value)) {
    return { ok: false, action: null, errors: ["选择值不在页面当前可选项中"] };
  }
  return { ok: true, action, errors: [] };
}
