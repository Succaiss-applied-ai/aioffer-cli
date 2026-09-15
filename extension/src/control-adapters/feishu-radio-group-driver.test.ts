// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {observeApplicationPageWithFieldDialects} from "../form-dialects/application-field-dialects.js";
import {candidateInformationRequestForField,confirmedCurrentJobFactForField,enrichVisionCandidateFacts,deterministicKnownFactActions} from "../vision-form-runtime.js";
import {evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
import {executeFeishuRadioGroup,inspectFeishuRadioInPage} from "./feishu-radio-group-driver.js";

beforeEach(()=>{
  vi.stubGlobal("location",new URL("https://xiaopeng.jobs.feishu.cn/index/resume/7534931888630188331/apply"));
  vi.stubGlobal("CSS",{escape:(v:string)=>v});
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  HTMLElement.prototype.scrollIntoView=vi.fn();
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
    const wrapper=this.closest("label.ud__radio__wrapper");const index=wrapper?[...document.querySelectorAll("label.ud__radio__wrapper")].indexOf(wrapper):0;
    const y=20+index*40;return {left:20,top:y,right:220,bottom:y+30,width:200,height:30,x:20,y,toJSON(){}};
  });
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:(_x:number,y:number)=>document.querySelectorAll("label.ud__radio__wrapper")[Math.floor((y-20)/40)]??null});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(label="推荐方式",options=["无","内推"]){
  document.body.innerHTML=`<form><div id="formily-item-code_type" data-form-field-id="code_type" class="ud-formily-item"><div class="ud-formily-item-label"><span class="ud-formily-item-label-content">${label}</span><span class="ud-formily-item-asterisk">*</span></div><div class="ud__radio-group">${options.map((value,index)=>`<label class="ud__radio__wrapper"><span class="ud__radio"><input id="radio-${index}" class="ud__radio__input" type="radio" role="radio"></span><span class="ud__radio__label-content">${value}</span></label>`).join("")}</div><div class="ud-formily-item-error-help">请选择</div></div><button>提交简历</button></form>`;
}
it.each(["推荐方式","学校名称","专业名称"])("returns one complete radio group based on structure for %s",label=>{
  fixture(label);const page=observeApplicationPageWithFieldDialects();expect(page.fields).toHaveLength(1);
  const field=page.fields[0]!;expect(field).toMatchObject({type:"combobox",options:["无","内推"],currentValue:"",observedControlKind:"formily_radio_group"});
  expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("feishu.formily-radio-group.trusted-pointer.v1");
  expect(candidateInformationRequestForField(field)).toMatchObject({inputKind:"select",label,options:["无","内推"]});
  const facts=enrichVisionCandidateFacts({}, {},{requiredFieldAnswers:[{fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,value:"内推"}]});
  expect(confirmedCurrentJobFactForField(field,facts)?.value).toBe("内推");
  expect(deterministicKnownFactActions(page,facts)).toHaveLength(1);
  expect(confirmedCurrentJobFactForField(field,{[`job.requiredField.stable:${field.stableFieldKey}`]:"true"})).toBeNull();
});
function io(expected="内推",commit=true){
  const field=observeApplicationPageWithFieldDialects().fields[0]!;
  return {inspect:async(prepare:boolean)=>inspectFeishuRadioInPage(field.selector,field.label,expected,prepare),
    prepareSurface:vi.fn(async()=>{}),wait:vi.fn(async()=>{}),click:vi.fn(async()=>{
      if(!commit)return;
      const selected=[...document.querySelectorAll<HTMLInputElement>("input[type=radio]")].find(input=>input.closest("label")?.textContent===expected)!;
      for(const input of document.querySelectorAll<HTMLInputElement>("input[type=radio]"))input.checked=input===selected;
      document.querySelector(".ud-formily-item-error-help")!.textContent="";
    })};
}
it("uses one exact click and two checked-label/error readbacks, with no write when already selected",async()=>{
  fixture();const first=io();expect(await executeFeishuRadioGroup(first,"内推")).toMatchObject({success:true,actual:"内推",clicks:1});
  const again=io();expect(await executeFeishuRadioGroup(again,"内推")).toMatchObject({success:true,clicks:0});expect(again.click).not.toHaveBeenCalled();
});
it("keeps existing choices unless correction is authorized and never retries a failed commit",async()=>{
  fixture();document.querySelector<HTMLInputElement>("#radio-0")!.checked=true;
  const r=io();expect(await executeFeishuRadioGroup(r,"内推")).toMatchObject({success:false,status:"existing_value_conflict",clicks:0});
  expect(await executeFeishuRadioGroup(r,"内推",true)).toMatchObject({success:true,clicks:1});
  fixture();const failure=io("内推",false);expect(await executeFeishuRadioGroup(failure,"内推")).toMatchObject({success:false,status:"radio_readback_failed",clicks:1});expect(failure.click).toHaveBeenCalledTimes(1);
});
it("does not click disabled, duplicate, obscured or foreign targets",async()=>{
  fixture();document.querySelector<HTMLInputElement>("#radio-1")!.disabled=true;
  const disabled=io();expect(await executeFeishuRadioGroup(disabled,"内推")).toMatchObject({success:false,status:"option_unavailable",clicks:0});
  fixture("推荐方式",["内推","内推"]);expect(inspectFeishuRadioInPage("#radio-0","推荐方式","内推").status).toBe("control_ambiguous");
  fixture();Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>document.body});
  const obscured=io();expect(await executeFeishuRadioGroup(obscured,"内推")).toMatchObject({success:false,status:"target_not_clickable",clicks:0});
  expect(inspectFeishuRadioInPage("#radio-0","其他字段","内推").status).toBe("field_identity_mismatch");
});
it("keeps hidden native radio inputs bound through their visible labels and leaves ordinary radios unchanged",()=>{
  fixture();for(const input of document.querySelectorAll<HTMLInputElement>("input"))input.style.opacity="0";
  expect(observeApplicationPageWithFieldDialects().fields[0]?.observedControlKind).toBe("formily_radio_group");
  document.querySelector(".ud__radio-group")!.className="ordinary-group";
  expect(observeApplicationPageWithFieldDialects().fields.every(field=>field.observedControlKind!=="formily_radio_group")).toBe(true);
});
