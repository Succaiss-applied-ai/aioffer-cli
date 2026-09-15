import type {
  FillInstruction,
  FillResult,
  PageObservation
} from "./page-adapter.js";

export interface ApplicationDomMutationState {
  version: number;
  lastMutationAt: number;
}

interface ApplicationDomMutationTracker extends ApplicationDomMutationState {
  observer: MutationObserver;
}

type ApplicationMutationGlobal = typeof globalThis & {
  __recruitingAiApplicationMutationTracker?: ApplicationDomMutationTracker;
};

// Serialized by chrome.scripting.executeScript. Keep this function self-contained.
export function readApplicationDomMutationState(): ApplicationDomMutationState {
  const scope = globalThis as ApplicationMutationGlobal;
  let tracker = scope.__recruitingAiApplicationMutationTracker;
  if (!tracker) {
    tracker = {
      version: 0,
      lastMutationAt: Date.now(),
      observer: new MutationObserver((records) => {
        const changed = records.some((record) =>
          record.type === "childList" ||
          (record.type === "attributes" && [
            "hidden",
            "aria-hidden",
            "aria-expanded",
            "class",
            "style",
            "disabled",
            "required",
            "aria-required"
          ].includes(record.attributeName ?? ""))
        );
        if (!changed || !scope.__recruitingAiApplicationMutationTracker) return;
        scope.__recruitingAiApplicationMutationTracker.version += 1;
        scope.__recruitingAiApplicationMutationTracker.lastMutationAt = Date.now();
      })
    };
    tracker.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "hidden",
        "aria-hidden",
        "aria-expanded",
        "class",
        "style",
        "disabled",
        "required",
        "aria-required"
      ]
    });
    scope.__recruitingAiApplicationMutationTracker = tracker;
  }
  return { version: tracker.version, lastMutationAt: tracker.lastMutationAt };
}

// Serialized by chrome.scripting.executeScript. It detects delayed React/Vue
// rebuilds without imposing a fixed full-page observation after every field.
export async function waitForApplicationDomMutation(input: {
  baselineVersion: number;
  detectionWindowMs: number;
  quietWindowMs: number;
  maxWaitMs: number;
}): Promise<ApplicationDomMutationState & { changed: boolean }> {
  const scope = globalThis as ApplicationMutationGlobal;
  const state = (): ApplicationDomMutationState => {
    let tracker = scope.__recruitingAiApplicationMutationTracker;
    if (!tracker) {
      tracker = {
        version: 0,
        lastMutationAt: Date.now(),
        observer: new MutationObserver((records) => {
          const changed = records.some((record) =>
            record.type === "childList" ||
            (record.type === "attributes" && [
              "hidden",
              "aria-hidden",
              "aria-expanded",
              "class",
              "style",
              "disabled",
              "required",
              "aria-required"
            ].includes(record.attributeName ?? ""))
          );
          if (!changed || !scope.__recruitingAiApplicationMutationTracker) return;
          scope.__recruitingAiApplicationMutationTracker.version += 1;
          scope.__recruitingAiApplicationMutationTracker.lastMutationAt = Date.now();
        })
      };
      tracker.observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          "hidden",
          "aria-hidden",
          "aria-expanded",
          "class",
          "style",
          "disabled",
          "required",
          "aria-required"
        ]
      });
      scope.__recruitingAiApplicationMutationTracker = tracker;
    }
    return { version: tracker.version, lastMutationAt: tracker.lastMutationAt };
  };
  const startedAt = Date.now();
  let latest = state();
  while (Date.now() - startedAt < input.maxWaitMs) {
    latest = state();
    const changed = latest.version !== input.baselineVersion;
    if (!changed && Date.now() - startedAt >= input.detectionWindowMs) {
      return { ...latest, changed: false };
    }
    if (changed && Date.now() - latest.lastMutationAt >= input.quietWindowMs) {
      return { ...latest, changed: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  latest = state();
  return { ...latest, changed: latest.version !== input.baselineVersion };
}

export function fieldFillMayChangeApplicationStructure(instruction: FillInstruction): boolean {
  return Boolean(instruction.popupBinding) || [
    "checkbox",
    "radio",
    "combobox",
    "select",
    "date",
    "month",
    "datetime-local",
    "file"
  ].includes(instruction.type);
}

export function applicationMutationWaitPolicy(instruction: FillInstruction): {
  detectionWindowMs: number;
  quietWindowMs: number;
  maxWaitMs: number;
} {
  return fieldFillMayChangeApplicationStructure(instruction)
    ? { detectionWindowMs: 600, quietWindowMs: 180, maxWaitMs: 1_800 }
    : { detectionWindowMs: 80, quietWindowMs: 80, maxWaitMs: 400 };
}

export function applicationObservationWithFillReadback(
  observation: PageObservation,
  result: FillResult | null | undefined
): PageObservation {
  if (!result?.success) return observation;
  return {
    ...observation,
    fields: observation.fields.map((field) =>
      field.fieldId === result.fieldId ? { ...field, currentValue: result.actual } : field
    )
  };
}

/**
 * A form snapshot is stable only when its actionable structure and validation
 * state are both stable. Conditional controls can appear after a select is
 * committed, while ATS validation and popup options often settle one render
 * later than the input value. Keep this pure so every caller uses the same
 * snapshot-invalidating boundary without mutating the live page.
 */
export function applicationObservationStabilitySignature(observation: PageObservation): string {
  return JSON.stringify({
    url: observation.url,
    pageStage: observation.pageStage,
    pageStateFingerprint: observation.pageStateFingerprint,
    fingerprint: observation.fingerprint,
    fields: observation.fields.map((field) => [
      field.stableFieldKey ?? field.label,
      field.label,
      field.sectionKey ?? null,
      field.groupIndex ?? null,
      field.type,
      field.controlKind ?? null,
      field.required,
      field.requiredSource ?? null,
      field.currentValue,
      field.validationMessage ?? null,
      field.options ?? [],
      field.domHints?.inputType ?? null,
      field.domHints?.readOnly ?? null,
      field.domHints?.role ?? null,
      field.domHints?.ariaHasPopup ?? null,
      field.domHints?.ariaAutocomplete ?? null
    ]),
    validationMessages: observation.validationMessages
  });
}
