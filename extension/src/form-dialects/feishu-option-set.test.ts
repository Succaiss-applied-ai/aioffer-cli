import {it,expect} from "vitest";
import {decodeExactOptionSet,exactOptionSetsMatch} from "./feishu-option-set.js";
import {enrichVisionCandidateFacts,confirmedCurrentJobFactForField,candidateInformationRequestForField} from "../vision-form-runtime.js";
import type {PageFieldObservation} from "../page-adapter.js";
const values=["🚀发展空间（内部创业）","​🏫导师制（考核、晋升）","🤝扁平化（不叫哥、姐、总）"];
const field={fieldId:"field_7",stableFieldKey:"other.7547670991724988714.combobox",label:"团队氛围",type:"combobox",controlKind:"combobox",options:values,
  fieldSource:{dialect:"feishu_formily",fieldPath:"7547670991724988714",moduleId:null,groupIndex:null},domHints:{classNames:["ud__select__selector-multiple"]}} as PageFieldObservation;
it("keeps complete array answers lossless through JSON transport, enrichment and field fact binding",()=>{
  const context=JSON.parse(JSON.stringify({requiredFieldAnswers:[{fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,value:values}]}));
  const facts=enrichVisionCandidateFacts({}, {},context);
  const fact=confirmedCurrentJobFactForField(field,facts);
  expect(decodeExactOptionSet(fact?.value)).toEqual(values);
  expect(exactOptionSetsMatch(fact?.value,[...values].reverse())).toBe(true);
  expect(exactOptionSetsMatch(fact?.value,values.slice(0,2))).toBe(false);
  expect(exactOptionSetsMatch(fact?.value,values.map(v=>v.replace(/\u200b/gu,"")))).toBe(false);
  expect(confirmedCurrentJobFactForField({...field,stableFieldKey:"other.another.combobox"},facts)).toBeNull();
});
it("never splits punctuation or interprets a legacy scalar as a complete multi answer",()=>{
  expect(decodeExactOptionSet(values.join("、"))).toBeNull();expect(decodeExactOptionSet([values[0],values[0]])).toBeNull();
  const scalar=enrichVisionCandidateFacts({}, {},{requiredFieldAnswers:[{fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,value:values.join("、")}]});
  expect(confirmedCurrentJobFactForField(field,scalar)).toBeNull();
  const ordinary={...field,fieldSource:undefined,options:[]};
  expect(confirmedCurrentJobFactForField(ordinary,scalar)?.value).toBe(values.join("、"));
});

it("marks only evidenced multi controls and preserves exact supplemental options",()=>{
  const request=candidateInformationRequestForField({...field,required:true,currentValue:""});
  expect(request).toMatchObject({type:"multi_select",controlKind:"multi_select",options:values});
  expect(request?.question).toContain("多项");
  expect(candidateInformationRequestForField({...field,fieldSource:undefined,required:true,currentValue:""})?.type).toBe("combobox");
});
it.each(["native","moka"])("retains complete supplemental answers for %s multi controls and old scalar facts",kind=>{
  const multi={...field,fieldSource:undefined,domHints:kind==="native"?{tagName:"SELECT",multiple:true}:{},optionMultiplicity:"multiple" as const,
    options:["上海","北京"],required:true,currentValue:""};
  const context={requiredFieldAnswers:[{fieldId:multi.fieldId,stableFieldKey:multi.stableFieldKey,value:["上海","北京"]}]};
  expect(confirmedCurrentJobFactForField(multi,enrichVisionCandidateFacts({}, {},context))?.value).toBe('["上海","北京"]');
  expect(candidateInformationRequestForField(multi)?.inputKind).toBe("multi_select");
  const old={...context,requiredFieldAnswers:[{...context.requiredFieldAnswers[0]!,value:"上海、北京"}]};
  expect(confirmedCurrentJobFactForField(multi,enrichVisionCandidateFacts({}, {},old))?.value).toBe("上海、北京");
});
