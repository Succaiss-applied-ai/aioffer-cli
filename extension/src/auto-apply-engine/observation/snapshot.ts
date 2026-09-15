import type {
  PageActionObservation,
  PageFieldObservation,
  PageObservation
} from "../../page-adapter.js";
import type { ApplicationAccessHint } from "../contracts.js";

export interface RegisteredObservedField {
  registryKey: string;
  sourceFieldId: string;
  stableFieldKey: string | null;
  label: string;
  sectionKey: string | null;
  groupIndex: number | null;
  controlKind: string;
  type: string;
  required: boolean;
  requiredSource: "explicit" | "inferred" | "none";
  options: readonly string[];
  currentValue: string;
  selector: string;
  occurrence: number;
}

export interface LayeredObservationSnapshot {
  schemaVersion: "layered-observation-snapshot.v1";
  revision: number;
  pageFingerprint: string;
  formFingerprint: string;
  url: string;
  title: string;
  accessHint: ApplicationAccessHint;
  liveLoginRequired: boolean;
  loginReason: string | null;
  formDetected: boolean;
  transientBusy: boolean;
  fields: readonly RegisteredObservedField[];
  actions: readonly PageActionObservation[];
  validationMessages: readonly string[];
  capturedAt: string;
}

function normalized(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[＊*()（）【】\[\]{}<>《》:：｜|·・._\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fallbackBaseKey(field: PageFieldObservation): string {
  const hints = field.domHints ?? {};
  return [
    normalized(field.sectionKey || "general"),
    normalized(field.label),
    normalized(field.controlKind || field.type || "control"),
    normalized(hints.dataFieldId || hints.dataFieldName || hints.name || hints.ariaLabel || hints.placeholder)
  ].filter(Boolean).join(".") || `unidentified.${normalized(field.type) || "control"}`;
}

function cloneAction(action: PageActionObservation): PageActionObservation {
  return Object.freeze({ ...action });
}

function registerFields(fields: PageFieldObservation[]): readonly RegisteredObservedField[] {
  const occurrences = new Map<string, number>();
  return Object.freeze(fields.map((field) => {
    const base = field.stableFieldKey?.replace(/#\d+$/, "") || fallbackBaseKey(field);
    const occurrence = field.stableFieldKey?.match(/#(\d+)$/)?.[1];
    const ordinal = occurrence === undefined
      ? occurrences.get(base) ?? 0
      : Number(occurrence);
    occurrences.set(base, Math.max(occurrences.get(base) ?? 0, ordinal + 1));
    const registryKey = field.stableFieldKey || `${base}#${ordinal}`;
    return Object.freeze({
      registryKey,
      sourceFieldId: field.fieldId,
      stableFieldKey: field.stableFieldKey ?? null,
      label: field.label,
      sectionKey: field.sectionKey ?? null,
      groupIndex: field.groupIndex ?? null,
      controlKind: field.controlKind || field.type || "control",
      type: field.type,
      required: field.required,
      requiredSource: field.requiredSource ?? (field.required ? "inferred" : "none"),
      options: Object.freeze([...field.options]),
      currentValue: field.currentValue,
      selector: field.selector,
      occurrence: ordinal
    });
  }));
}

export function buildLayeredObservationSnapshot(input: {
  observation: PageObservation;
  revision: number;
  accessHint: ApplicationAccessHint;
}): LayeredObservationSnapshot {
  const observation = input.observation;
  return Object.freeze({
    schemaVersion: "layered-observation-snapshot.v1",
    revision: input.revision,
    pageFingerprint: observation.fingerprint,
    formFingerprint: observation.fingerprint,
    url: observation.url,
    title: observation.title,
    accessHint: input.accessHint,
    liveLoginRequired: observation.loginRequired,
    loginReason: observation.loginReason,
    formDetected: observation.formDetected,
    transientBusy: observation.transientBusy,
    fields: registerFields(observation.fields),
    actions: Object.freeze(observation.actions.map(cloneAction)),
    validationMessages: Object.freeze([...observation.validationMessages]),
    capturedAt: observation.observedAt
  });
}
