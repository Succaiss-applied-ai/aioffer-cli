import type {PageFieldObservation} from "../page-adapter.js";
import {decodeExactOptionSet} from "../option-set.js";
export {decodeExactOptionSet,nativeSelectRequestedValues} from "../option-set.js";

/** Values stay verbatim: punctuation, emoji and zero-width characters are option identity. */
export function isFeishuFormilyOptionSet(field:PageFieldObservation):boolean{
  return field.fieldSource?.dialect==="feishu_formily"&&
    field.domHints?.classNames.some(v=>/\bud__select__selector-multiple\b/u.test(v))===true;
}
export function isMultipleChoiceField(field:PageFieldObservation):boolean{
  return field.optionMultiplicity === "multiple" ||
    field.domHints?.tagName === "SELECT" && field.domHints.multiple === true || isFeishuFormilyOptionSet(field);
}
export function exactOptionSetsMatch(actual:unknown,expected:unknown):boolean{
  const a=decodeExactOptionSet(actual),b=decodeExactOptionSet(expected);
  return !!a&&!!b&&a.length===b.length&&a.every(value=>b.includes(value));
}
