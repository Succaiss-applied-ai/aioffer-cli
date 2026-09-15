// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://is35svcbne.jobs.feishu.cn/youcash/resume/7641043112992131347/apply"}
import { beforeEach, expect, it, vi } from "vitest";
import { observeApplicationPageWithFieldDialects } from "../form-dialects/application-field-dialects.js";
import { evidenceForField } from "./field-routing.js";
import { CONTROL_ADAPTER_REGISTRY, resolveControlAdapter } from "./registry.js";
import { withFieldInformationRequirements } from "../field-information.js";
import { candidateInformationRequestForField, candidateInformationRequestForUnavailableOptions, confirmedCurrentJobFactForField } from "../vision-form-runtime.js";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x:20,y:100,left:20,top:100,right:620,bottom:140,width:600,height:40,toJSON(){} });
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
});
function route(name:string,label:string,multiple=false,readonly=false,kind?:"formily_location_tree"|"formily_selector_flat") {
  document.body.innerHTML=`<form><div id="formily-item-${name}" class="ud-formily-item" data-form-field-id="${name}" data-form-field-name="${name}"><div class="ud-formily-item-label"><div class="ud-formily-item-label-content">${label}</div></div><div class="ud__select"><div class="ud__select__selector ${multiple?'ud__select__selector-multiple':''}"><input id="target" type="search" role="combobox" ${readonly?'readonly':''} class="ud__select__selector__search__input ud__native-input"></div></div></div><button>提交简历</button></form>`;
  const page=observeApplicationPageWithFieldDialects(),field=page.fields.find(f=>f.selector==="#target")!;
  return resolveControlAdapter(evidenceForField(page,{...field,observedControlKind:kind}));
}
function observed() {
  const page=withFieldInformationRequirements(observeApplicationPageWithFieldDialects());
  const field=page.fields.find(f=>f.selector==="#target")!;
  return {page,field:{...field,required:true}};
}
it.each([["nationality","国籍（地区）"],["current_city","所在地点"],["hometown_city","家乡"],["custom-search","同构检索字段"]])("registers editable selector search by structure: %s",(name,label)=>{
  const resolved=route(name,label);
  expect(resolved.code).toBe("feishu.formily-selector-search.trusted-pointer.v1");
  expect(CONTROL_ADAPTER_REGISTRY.find(r=>r.adapterCode===resolved.code)?.optionSource).toBe("search");
});
it("preserves readonly selects with identical semantics",()=>{
  expect(route("nationality","国籍（地区）",false,true).code).toBe("feishu.formily-flat-select.trusted-pointer.v1");
});
it("isolates evidenced multi-city search from successful ordinary multi-select",()=>{
  expect(route("preferred_city_list","期望工作地点",true,false,"formily_location_tree").code).toBe("feishu.formily-city-multi-search.trusted-pointer.v1");
  expect(route("custom-1","期望工作地点",true).code).toBe("feishu.formily-multi-select.trusted-pointer.v1");
});
it.each(["preferred_city_list","custom-1"])("keeps one route when selected tags deepen the multi input: %s",name=>{
  route(name,"期望工作地点",true);
  const input=document.querySelector("#target")!;
  const wrappers=['ud__select__selector__content','ud__overflow ud__select__selector__search','ud__select__selector__search__suffix ud__overflow__suffix','ud__select__selector__search__input_container'];
  for(const className of wrappers.reverse()){const wrapper=document.createElement('div');wrapper.className=className;input.parentNode!.insertBefore(wrapper,input);wrapper.append(input);}
  const select=document.querySelector('.ud__select')!;
  for(const className of ['ud-formily-item-control-content-component','ud-formily-item-control-content','ud-formily-item-control']){const wrapper=document.createElement('div');wrapper.className=className;select.parentNode!.insertBefore(wrapper,select);wrapper.append(select);}
  const {page,field}=observed();
  expect(resolveControlAdapter(evidenceForField(page,{...field,observedControlKind:name==='preferred_city_list'?'formily_location_tree':'formily_selector_flat'})).code).toBe(name==='preferred_city_list'?'feishu.formily-city-multi-search.trusted-pointer.v1':'feishu.formily-multi-select.trusted-pointer.v1');
});
it("does not route plain native text or the existing Formily school search by its label",()=>{
  route("nationality","国籍（地区）");
  const input=document.querySelector<HTMLInputElement>("#target")!;
  input.type="text";input.removeAttribute("role");input.className="ud__native-input";
  document.querySelector(".ud__select__selector")!.className="ud__input";
  input.setAttribute("data-form-field-name","nationality");
  const page=observeApplicationPageWithFieldDialects(),field=page.fields.find(f=>f.selector==="#target")!;
  expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("feishu.formily-school-search.trusted-pointer.v1");
});
it("uses the existing search input contract for no result, including a previous committed value",()=>{
  const resolved=route("nationality","国籍（地区）");const {field}=observed();
  expect(candidateInformationRequestForField(field)).toMatchObject({type:"search",controlKind:"native",options:[]});
  for(const options of [[],["中国香港","中国澳门"]]) {
    expect(candidateInformationRequestForUnavailableOptions({...field,currentValue:"旧值"},"中国",options,
      {fieldId:field.fieldId,controlAdapter:resolved.diagnostic})).toMatchObject({fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,type:"search",options:[]});
  }
  expect(candidateInformationRequestForUnavailableOptions(field,"中国",[],{fieldId:"wrong",controlAdapter:resolved.diagnostic})).toBeNull();
});
it("keeps multi-city query supplementation editable and preserves exact answer binding",()=>{
  route("preferred_city_list","期望工作地点",true);const {field:observedField}=observed(); const field={...observedField,observedControlKind:"formily_location_tree" as const,optionSource:"search" as const};
  expect(candidateInformationRequestForField(field)).toMatchObject({type:"search",inputKind:"search",controlType:"feishu_location_tree.v1",controlKind:"native",options:[],question:expect.stringContaining("一个地点")});
  expect(confirmedCurrentJobFactForField(field,{[`job.requiredField.stable:${field.stableFieldKey}`]:"广州\n深圳"})).toMatchObject({value:'["广州","深圳"]'});
});

it.each([false,true])("preserves the executed location kind when requesting a replacement after a failed exact query: multiple=%s",multiple=>{
  const resolved=route(multiple?"preferred_city_list":"hometown_city",multiple?"期望工作地点":"家乡",multiple,false,"formily_location_tree");
  const {field}=observed();
  const request=candidateInformationRequestForUnavailableOptions({...field,currentValue:"旧地点"},"中国大陆/广东/广州",[],{fieldId:field.fieldId,controlAdapter:resolved.diagnostic});
  expect(request).toMatchObject({fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,controlType:"feishu_location_tree.v1",inputKind:"search",options:[]});
  expect(candidateInformationRequestForUnavailableOptions(field,"广州",[],{fieldId:"another",controlAdapter:resolved.diagnostic})).toBeNull();
});
