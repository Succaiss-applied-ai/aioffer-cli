import { bindObservedInstruction } from "./field-routing.js";
import type { PageFieldObservation, PageObservation } from "../page-adapter.js";

export type FeishuSelectorKind = "formily_selector_flat" | "formily_location_tree";

/** Closed selectors are indistinguishable: field names never choose their popup kind. */
export function needsFeishuSelectorDiscovery(field: PageFieldObservation, url = field.controlApplicationUrl ?? ""): boolean {
  return /^https:\/\/[^/]+\.jobs\.feishu\.cn\/[a-zA-Z0-9_-]+\/resume\/\d+\/apply\/?(?:[?#]|$)/u.test(url) &&
    field.domHints?.tagName === "INPUT" && field.domHints.inputType === "search" && !field.domHints.readOnly &&
    /ud__select__selector__search__input/u.test(field.domHints.classNames.join(" ")) &&
    /ud-formily-item/u.test(field.domHints.classNames.join(" "));
}

export function isFeishuLocationTree(field: PageFieldObservation): boolean {
  return field.observedControlKind === "formily_location_tree" && needsFeishuSelectorDiscovery(field);
}

export function withFeishuSelectorKind(page: PageObservation, field: PageFieldObservation, kind: FeishuSelectorKind): PageObservation {
  return { ...page, fields: page.fields.map(item => item === field ? { ...item, observedControlKind: kind } : item) };
}

/** Retain classifications only while refreshing this same document and binding. */
export function carryFeishuSelectorKinds(previous: PageObservation, fresh: PageObservation): PageObservation {
  if (previous.url!==fresh.url || previous.documentId!==fresh.documentId) return fresh;
  const kinds=new Map<PageFieldObservation,FeishuSelectorKind>();
  for (const old of previous.fields) {
    if (old.observedControlKind!=="formily_location_tree" && old.observedControlKind!=="formily_selector_flat") continue;
    const bound=bindObservedInstruction(fresh,{fieldId:old.fieldId,stableFieldKey:old.stableFieldKey,
      selector:old.selector,expectedLabel:old.label,type:old.type,value:""});
    if(bound&&!bound.observedControlKind&&needsFeishuSelectorDiscovery(bound,fresh.url)&&JSON.stringify(bound.fieldSource)===JSON.stringify(old.fieldSource))
      kinds.set(bound,old.observedControlKind);
  }
  return {...fresh,fields:fresh.fields.map(field=>kinds.has(field)?{...field,observedControlKind:kinds.get(field)!}:field)};
}
