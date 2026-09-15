// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";
import { dispatchControlInstruction, bindObservedInstruction } from "./control-adapters/field-routing.js";
import { fillApplicationPage } from "./control-adapters/native-driver.js";
import { authoritativeCandidateFactForField, enrichVisionCandidateFacts, isThirdPartyPersonField } from "./vision-form-runtime.js";

// Owned caption/input structure observed on both ZTE recruitment pages.
function field(label: string, id: string) {
  return `<div class="apply-field-Q2iJ7AtQGX string_info-UOJxKN5mtC apply-filed-padding-gvR51AnKq6">
    <div class="title-IWWQ0Xa4L7"><span><span>${label}</span></span><span class="required-asterisk-av7daEKsLS"></span></div>
    <div class="ctrl-CICMG4Fr4_"><div class="sd-Tooltip-container-2B2OE">
      <label class="sd-Input-container-2S_vM string_info no-adaptive-tooltip sd-Input-lg-3X8ma">
        <input id="${id}" type="text" class="sd-Input-input-10L0t sd-Input-common-input-1XimE" placeholder="${label}" maxlength="255">
      </label></div><div><div class="describe-GCCjupJ4ID"></div></div></div></div>`;
}
const pinyinLabels = ["姓名拼音（如:Li Xiaolong/Li Lin)", "姓名拼音（如:Li Xiaolong或Li Lin）"];
const candidateFacts = { "candidate.basic.fullName": "候选人甲" };

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://app.mokahr.com/campus-recruitment/unrelated/1#/job/example/apply"));
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x:0,y:0,left:0,top:0,right:200,bottom:30,width:200,height:30,toJSON(){}
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function page(label = pinyinLabels[0]!) {
  document.body.innerHTML = `<h1>个人信息</h1>${field("姓名","candidate-name")}${field(label,"pinyin-name")}
    <h2>教育背景</h2>${field("导师姓名","advisor-name")}<button>预览并提交</button>`;
  return observeApplicationPage();
}

describe("distinct candidate, pinyin and advisor names", () => {
  it("rebinds the actual Sanechips name without its old pinyin/advisor collision",async()=>{
    vi.stubGlobal("location",new URL("https://app.mokahr.com/campus-recruitment/sanechips/102705#/job/b3999c36-5305-4038-9a64-e3e09ea06c58/apply"));
    const observed=page(pinyinLabels[1]!);const own=observed.fields.find(f=>f.selector==="#candidate-name")!;
    const instruction={fieldId:own.fieldId,stableFieldKey:own.stableFieldKey,selector:own.selector,
      expectedLabel:own.label,type:own.type,value:"候选人甲",applicationUrl:observed.url};
    expect(own.stableFieldKey).not.toContain("#");
    const current=page(pinyinLabels[1]!);expect(bindObservedInstruction(current,instruction)?.selector).toBe("#candidate-name");
    const result=await dispatchControlInstruction(current,instruction,{
      "generic.native.v1":async(_target,next)=>(await fillApplicationPage([next]))[0]!
    });
    expect(result).toMatchObject({success:true,actual:"候选人甲"});
    expect([...document.querySelectorAll<HTMLInputElement>("input")].map(input=>input.value)).toEqual(["候选人甲","",""]);
  });
  it.each(pinyinLabels)("keeps %s separate, fills only the intended native field, and survives a rerender", async label => {
    const observed = page(label);
    const own = observed.fields.find(f => f.selector === "#candidate-name")!;
    const pinyin = observed.fields.find(f => f.selector === "#pinyin-name")!;
    const advisor = observed.fields.find(f => f.selector === "#advisor-name")!;
    expect([own.domHints?.fieldLabel,pinyin.domHints?.fieldLabel,advisor.domHints?.fieldLabel]).toEqual(["姓名",label,"导师姓名"]);
    expect(own.stableFieldKey).toMatch(/\.full_name\.native$/);
    expect(pinyin.stableFieldKey).toMatch(/\.name_pinyin\.native$/);
    expect(advisor.stableFieldKey).toMatch(/\.advisor_name\.native$/);
    const instruction = { fieldId:own.fieldId,stableFieldKey:own.stableFieldKey,selector:own.selector,
      expectedLabel:own.label,type:own.type,value:"候选人甲",applicationUrl:observed.url };
    const fresh = page(label);
    expect(bindObservedInstruction(fresh,instruction)?.selector).toBe("#candidate-name");
    const result = await dispatchControlInstruction(fresh,instruction,{
      "generic.native.v1": async (_target,next) => (await fillApplicationPage([next]))[0]!
    });
    expect(result).toMatchObject({ success:true,actual:"候选人甲",driverStage:"readback" });
    expect([...document.querySelectorAll<HTMLInputElement>("input")].map(input=>input.value)).toEqual(["候选人甲","",""]);
  });

  it("never derives pinyin or an advisor identity from the candidate name, even with stale full_name hints", () => {
    const observed = page();
    const fields = ["candidate-name","pinyin-name","advisor-name"].map(id=>observed.fields.find(f=>f.selector === `#${id}`)!);
    expect(fields.map(f=>authoritativeCandidateFactForField(f,candidateFacts)?.value ?? null)).toEqual(["候选人甲",null,null]);
    expect(isThirdPartyPersonField(fields[2]!)).toBe(true);
    for (const f of fields.slice(1)) expect(authoritativeCandidateFactForField({
      ...f,stableFieldKey:"basic.full_name.native#1",domHints:{...f.domHints!,name:"full_name"}
    },candidateFacts)).toBeNull();
  });

  it("accepts exact confirmed answers but does not migrate old anonymous collision numbers", () => {
    const observed = page();
    const pinyin = observed.fields.find(f=>f.selector === "#pinyin-name")!;
    const advisor = observed.fields.find(f=>f.selector === "#advisor-name")!;
    const direct = enrichVisionCandidateFacts({},candidateFacts,{requiredFieldAnswers:[
      {fieldId:pinyin.fieldId,stableFieldKey:pinyin.stableFieldKey,value:"Confirmed Pinyin",source:"user_confirmed"},
      {fieldId:advisor.fieldId,stableFieldKey:advisor.stableFieldKey,value:"导师乙",source:"user_confirmed"}
    ]});
    expect(authoritativeCandidateFactForField(pinyin,direct)?.value).toBe("Confirmed Pinyin");
    expect(authoritativeCandidateFactForField(advisor,direct)?.value).toBe("导师乙");
    const old = enrichVisionCandidateFacts({},candidateFacts,{requiredFieldAnswers:[{
      fieldId:"old",stableFieldKey:"basic.full_name.native#1",value:"Not attributable",source:"user_confirmed"
    }]});
    expect(authoritativeCandidateFactForField(pinyin,old)).toBeNull();
    expect(authoritativeCandidateFactForField(advisor,old)).toBeNull();
  });

  it("executes an exactly confirmed pinyin answer only in the pinyin native control", async () => {
    const observed = page();
    const target = observed.fields.find(f=>f.selector === "#pinyin-name")!;
    const facts = enrichVisionCandidateFacts({},candidateFacts,{requiredFieldAnswers:[{
      fieldId:target.fieldId,stableFieldKey:target.stableFieldKey,value:"Confirmed Pinyin",source:"user_confirmed"
    }]});
    const fact=authoritativeCandidateFactForField(target,facts)!;
    const result=await dispatchControlInstruction(observed,{
      fieldId:target.fieldId,stableFieldKey:target.stableFieldKey,selector:target.selector,expectedLabel:target.label,
      type:target.type,value:fact.value,applicationUrl:observed.url
    },{"generic.native.v1":async(_target,next)=>(await fillApplicationPage([next]))[0]!});
    expect(result).toMatchObject({success:true,actual:"Confirmed Pinyin",driverStage:"readback"});
    expect([...document.querySelectorAll<HTMLInputElement>("input")].map(input=>input.value)).toEqual(["","Confirmed Pinyin",""]);
  });

  it("migrates only correctly captioned old profile keys, preserving job, section and row ownership", () => {
    const observed = page();
    const pinyin = observed.fields.find(f=>f.selector === "#pinyin-name")!;
    const fact = {label:pinyinLabels[0],stableFieldKeys:["basic.full_name.native#1"],value:"Confirmed Pinyin",source:"user_confirmed"};
    expect(authoritativeCandidateFactForField(pinyin,enrichVisionCandidateFacts({},candidateFacts,{}, {facts:[fact]}))?.value).toBe("Confirmed Pinyin");
    const bound = {...fact,fieldBinding:{jobId:"current",stableFieldKey:fact.stableFieldKeys[0],sectionKey:pinyin.sectionKey,groupIndex:pinyin.groupIndex}};
    expect(authoritativeCandidateFactForField(pinyin,enrichVisionCandidateFacts({},candidateFacts,{jobId:"current"},{facts:[bound]}))?.value).toBe("Confirmed Pinyin");
    expect(authoritativeCandidateFactForField(pinyin,enrichVisionCandidateFacts({},candidateFacts,{jobId:"foreign"},{facts:[bound]}))).toBeNull();
    expect(authoritativeCandidateFactForField(pinyin,enrichVisionCandidateFacts({},candidateFacts,{}, {facts:[{...fact,label:"姓名"}]}))).toBeNull();
    expect(authoritativeCandidateFactForField(pinyin,enrichVisionCandidateFacts({},candidateFacts,{}, {facts:[{...fact,source:"model"}]}))).toBeNull();
    const conflict = {...fact,stableFieldKeys:["basic.full_name.native#0"]};
    expect(()=>authoritativeCandidateFactForField(pinyin,enrichVisionCandidateFacts({},candidateFacts,{}, {facts:[fact,conflict]}))).toThrow("无法唯一关联");
  });

  it("keeps indistinguishable duplicate names ambiguous instead of trusting their ordinal", () => {
    const observed=page();
    document.body.insertAdjacentHTML("beforeend",field("姓名","another-name"));
    const duplicates=observeApplicationPage();
    const own=duplicates.fields.find(f=>f.selector === "#candidate-name")!;
    expect(bindObservedInstruction(duplicates,{fieldId:own.fieldId,stableFieldKey:own.stableFieldKey,
      expectedLabel:own.label,type:own.type,value:"候选人甲",selector:own.selector,applicationUrl:observed.url})).toBeNull();
  });

  it("retains the exact advisor answer without crossing its persisted repeat-row binding", () => {
    const observed=page();
    const target={...observed.fields.find(f=>f.selector === "#advisor-name")!,
      stableFieldKey:"education.row2.advisor_name.native",sectionKey:"education",groupIndex:2};
    const fact={label:"导师姓名",stableFieldKeys:["education.row2.full_name.native#0"],value:"导师乙",source:"user_confirmed",
      fieldBinding:{jobId:"current",stableFieldKey:"education.row2.full_name.native#0",sectionKey:"education",groupIndex:2}};
    const facts=enrichVisionCandidateFacts({},candidateFacts,{jobId:"current"},{facts:[fact]});
    expect(authoritativeCandidateFactForField(target,facts)?.value).toBe("导师乙");
    expect(authoritativeCandidateFactForField({...target,groupIndex:1},facts)).toBeNull();
    expect(authoritativeCandidateFactForField({...target,sectionKey:"work"},facts)).toBeNull();
  });
});
