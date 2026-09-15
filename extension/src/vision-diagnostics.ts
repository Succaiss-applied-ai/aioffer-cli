import type { ControlAdapterDiagnostic } from "./control-adapters/types.js";

export type VisionDiagnosticPhase =
  | "observe"
  | "declaration"
  | "converged"
  | "planned"
  | "unknown_field"
  | "semantic_conflict"
  | "already_satisfied"
  | "executed"
  | "skipped"
  | "blocked"
  | "circuit_breaker";

export type VisionDiagnosticSource = "deterministic" | "vision_model" | null;

export interface VisionValueSummary {
  present: boolean;
  kind: "empty" | "email" | "phone" | "date" | "option" | "text";
  length: number;
}

export interface VisionIterationDiagnostic {
  schemaVersion: "auto-apply-vision-diagnostic.v1";
  at: string;
  batchId: string;
  batchJobId: string;
  commandId: string;
  iteration: number;
  phase: VisionDiagnosticPhase;
  requiredBlockers: string[];
  criticalFailures: string[];
  next: string | null;
  source: VisionDiagnosticSource;
  actionType: string | null;
  fieldId: string | null;
  stableFieldKey: string | null;
  label: string | null;
  expected: VisionValueSummary | null;
  actual: VisionValueSummary | null;
  success: boolean | null;
  error: string | null;
  controlAdapter?: ControlAdapterDiagnostic | null;
}

export function summarizeVisionDiagnosticValue(value: unknown): VisionValueSummary {
  const text = String(value ?? "").trim();
  if (!text) return { present: false, kind: "empty", length: 0 };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { present: true, kind: "email", length: text.length };
  }
  if (/^(?:19|20)\d{2}(?:[-/.年]\d{1,2})?(?:[-/.月]\d{1,2})?(?:日)?$/.test(text)) {
    return { present: true, kind: "date", length: text.length };
  }
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 7 && digits.length <= 15 && digits.length >= Math.ceil(text.length * 0.6)) {
    return { present: true, kind: "phone", length: text.length };
  }
  return {
    present: true,
    kind: text.length <= 16 ? "option" : "text",
    length: text.length
  };
}

export function redactVisionDiagnosticText(value: unknown): string {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g, "[REDACTED_PHONE]")
    .replace(/(?<!\d)\d{7,18}(?!\d)/g, "[REDACTED_NUMBER]")
    .slice(0, 1_000);
}

export function appendVisionDiagnosticRing(
  existing: unknown,
  entry: VisionIterationDiagnostic,
  limit = 200
): VisionIterationDiagnostic[] {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const queue = Array.isArray(existing)
    ? existing.filter((item): item is VisionIterationDiagnostic => Boolean(item && typeof item === "object"))
    : [];
  return [...queue, entry].slice(-normalizedLimit);
}

function diagnosticRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Builds the exact failureDetails object sent to the server. Diagnostics are
 * attached from the in-memory execution ring so a service-worker shutdown or
 * chrome.storage write delay cannot erase the failure trace.
 */
export function attachVisionDiagnosticsToFailure(
  details: unknown,
  fallbackFailures: string[],
  diagnostics: VisionIterationDiagnostic[]
): Record<string, unknown> {
  const existing = diagnosticRecord(details);
  return {
    ...(existing ?? { failures: fallbackFailures.map(redactVisionDiagnosticText).filter(Boolean).slice(0, 30) }),
    visionDiagnostics: diagnostics.slice(-10)
  };
}
