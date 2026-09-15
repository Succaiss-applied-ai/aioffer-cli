import { observeApplicationPage, type PageObservation } from "../page-adapter.js";
import { isFeishuMonthPeriodApplicationUrl, observeFeishuMonthPeriodFieldsInPage } from "../control-adapters/feishu-month-period-driver.js";
import { withFieldInformationRequirements } from "../field-information.js";
import { observeFeishuAtsxFieldPatchesInPage } from "./feishu-atsx.js";
import {
  applyFeishuFormilyFieldPatches,
  isFeishuFormilyApplicationUrl,
  observeFeishuFormilyFieldPatchesInPage,
  type FeishuFormilyFieldPatch
} from "./feishu-formily.js";

export interface ApplicationFieldDialectSnapshots {
  feishuFormily?: FeishuFormilyFieldPatch[];
  feishuAtsx?: FeishuFormilyFieldPatch[];
}

/**
 * The single field-dialect boundary shared by the background observer and
 * bundled page runtimes. A Driver must never rebind against the raw generic
 * labels after dispatch selected a field from this dialect-aware view.
 */
export function applyApplicationFieldDialects(
  observation: PageObservation,
  snapshots: ApplicationFieldDialectSnapshots
): PageObservation {
  const patches = [...(snapshots.feishuFormily ?? []), ...(snapshots.feishuAtsx ?? [])];
  if (!isFeishuFormilyApplicationUrl(observation.url) || !patches.length) {
    return observation;
  }
  return {
    ...observation,
    fields: applyFeishuFormilyFieldPatches(observation.fields, patches)
  };
}

/**
 * Isolated-world observation for native Drivers. All reads are synchronous and
 * DOM-only, so the stable identity used for dispatch, write and readback stays
 * identical even when Formily reconstructs a control.
 */
export function observeApplicationPageWithFieldDialects(): PageObservation {
  const generic = observeApplicationPage();
  const dialect = applyApplicationFieldDialects(generic, {
    feishuFormily: isFeishuFormilyApplicationUrl(generic.url)
      ? observeFeishuFormilyFieldPatchesInPage()
      : undefined,
    feishuAtsx: isFeishuFormilyApplicationUrl(generic.url)
      ? observeFeishuAtsxFieldPatchesInPage() : undefined
  });
  const merged = isFeishuMonthPeriodApplicationUrl(dialect.url)
    ? mergeFeishuMonthPeriodFields(dialect, observeFeishuMonthPeriodFieldsInPage()) : dialect;
  if (isFeishuMonthPeriodApplicationUrl(merged.url)) {
    // Logical date endpoints join the same DOM order as ordinary fields.
    // Do not append all calendar fields after the last form section.
    merged.fields = [...merged.fields].sort((left, right) => {
      const a = document.querySelectorAll(left.selector), b = document.querySelectorAll(right.selector);
      if (a.length !== 1 || b.length !== 1) return 0;
      const order = a[0]!.compareDocumentPosition(b[0]!);
      return order & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : order & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
  }
  return withFieldInformationRequirements(merged);
}

/** The same pure merge is used for planning, rebinding and readback. */
export function mergeFeishuMonthPeriodFields(observation: PageObservation, specialized: PageObservation["fields"]): PageObservation {
  if (!specialized.length) return observation;
  // The generic observer may expose Feishu's hidden backing input under the
  // same semantic key. The visible specialist observation is authoritative:
  // replace that field rather than keeping the hidden input or a duplicate.
  const specializedByStableKey = new Map(specialized
    .filter((field) => typeof field?.stableFieldKey === "string")
    .map((field) => [field.stableFieldKey, field]));
  const periodIdentity = (field: PageObservation["fields"][number]) => {
    if (field.fieldSource?.edge && /^\d+$/u.test(field.fieldSource.fieldPath)) return `custom:${field.fieldSource.fieldPath}:${field.fieldSource.edge}`;
    const identity = `${field.label} ${field.stableFieldKey ?? ""}`;
    const section = /(?:教育经历|education)/i.test(identity) ? "education" :
      /(?:工作经历|实习经历|work)/i.test(identity) ? "work" :
        /(?:项目经历|project)/i.test(identity) ? "project" : "";
    const edge = /(?:开始时间|入学|start_date)/i.test(identity) ? "start" :
      /(?:结束时间|毕业|end_date)/i.test(identity) ? "end" : "";
    return section && edge ? `${/实习经历|internship/u.test(identity) ? "internship" : section}:${field.groupIndex ?? 0}:${edge}` : "";
  };
  const specializedPeriodIdentities = new Set(specialized.map(periodIdentity).filter(Boolean));
  const fields = [
    ...observation.fields
      .filter((field) => !specializedPeriodIdentities.has(periodIdentity(field)) || specializedByStableKey.has(field.stableFieldKey))
      .filter((field) => !field.domHints?.classNames?.some(value => /\batsx-date-picker-period-hidden-input\b/u.test(value)) ||
        !specialized.some(other => other.sectionKey === field.sectionKey && other.groupIndex === field.groupIndex &&
          (!field.fieldSource || other.fieldSource?.moduleId === field.fieldSource.moduleId)))
      .map((field) => specializedByStableKey.get(field.stableFieldKey) ?? field),
    ...specialized.filter((field) => !observation.fields.some((genericField) =>
      genericField.stableFieldKey === field.stableFieldKey
    ))
  ] as PageObservation["fields"];
  return { ...observation, fields };
}
