// @vitest-environment jsdom
import { expect, it } from "vitest";
import { resolveControlAdapter } from "./registry.js";
import { candidateInformationRequestForField } from "../vision-form-runtime.js";
import type { PageFieldObservation } from "../page-adapter.js";
import { evidenceForField } from "./field-routing.js";
const url="https://is35svcbne.jobs.feishu.cn/youcash/resume/7681641036431968566/apply";
function field(label:string, kind?:"formily_location_tree"|"formily_selector_flat", multiple=false):PageFieldObservation {
  return {fieldId:"f",stableFieldKey:"unknown.field.combobox",label,selector:"#f",type:"combobox",controlKind:"combobox",required:true,currentValue:"",options:[],
    controlApplicationUrl:url,observedControlKind:kind,optionSource:"search",
    fieldSource:{dialect:"feishu_formily",fieldPath:"unknown",moduleId:"basic",groupIndex:null},
    domHints:{tagName:"INPUT",inputType:"search",readOnly:false,classNames:["ud__select__selector__search__input","ud__select__selector","ud-formily-item",...(multiple?["ud__select__selector-multiple"]:[])]}};
}
it.each(["籍贯","出生日期","学校名称","自定义问题"])("routes observed location tree independently of label: %s",label=>{
  const f=field(label,"formily_location_tree");
  expect(resolveControlAdapter(evidenceForField({url},f)).code).toBe("feishu.formily-location-tree.trusted-pointer.v1");
  expect(candidateInformationRequestForField(f)).toMatchObject({controlType:"feishu_location_tree.v1",inputKind:"search",fieldId:"f",stableFieldKey:f.stableFieldKey});
});
it("does not classify a tree from preferred_city_list, hometown or Moka labels",()=>{
  const f=field("期望工作地点",undefined,true);
  f.domHints!.classNames.push("data-form-field-name:preferred_city_list");
  expect(resolveControlAdapter(evidenceForField({url},f)).code).not.toBe("feishu.formily-city-multi-search.trusted-pointer.v1");
  for(const name of ["籍贯","日期","地点"]){
    const tree=field(name,"formily_location_tree");
    expect(resolveControlAdapter(evidenceForField({url:"https://app.mokahr.com/social-recruitment/test/1#/job/2/apply"},tree)).code).not.toContain("feishu");
  }
});
it("keeps ordinary multi-select with the same field name on its original driver",()=>{
  const f=field("期望工作地点","formily_selector_flat",true);
  f.domHints!.classNames.push("data-form-field-name:preferred_city_list");
  expect(resolveControlAdapter(evidenceForField({url},f)).code).toBe("feishu.formily-multi-select.trusted-pointer.v1");
});
