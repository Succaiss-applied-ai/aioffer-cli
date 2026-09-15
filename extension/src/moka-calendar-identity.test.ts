// @vitest-environment jsdom
import {beforeEach, afterEach, describe, expect, it, vi} from "vitest";
import {observeApplicationPage, type FillInstruction} from "./page-adapter.js";
import {bindObservedInstruction, evidenceForField} from "./control-adapters/field-routing.js";
import {resolveControlAdapter} from "./control-adapters/registry.js";
import {registeredControlReadbackMatches} from "./control-adapters/readback-policy.js";
import {authoritativeCandidateFactForField, enrichVisionCandidateFacts} from "./vision-form-runtime.js";
import {fieldInformationRequirement} from "./field-information.js";

// Real Moka day_info structure: a committed MonthPicker clears placeholder,
// retains its bilingual owned caption, and renders YYYY-MM plus age in value.
const caption = "出生日期 (年龄)";
const hint = `${caption} / Birth Date (Age)`;
function markup(title=caption, placeholder=hint, extra="", wrapper="day_info-S5Nug1w6IL") {
  return `<div class="apply-field-Q2iJ7AtQGX ${wrapper} apply-filed-padding-gvR51AnKq6">
  <div class="title-IWWQ0Xa4L7"><span><span>${title}</span><span class="polyglot-separator"> / </span><span lang="en-US">Birth Date (Age)</span></span><span class="required-asterisk-av7daEKsLS"></span></div>
  <div class="ctrl-CICMG4Fr4_"><div class="sd-Dropdown-container-1CigZ"><label class="sd-Input-container-2S_vM day_info sd-Input-lg-3X8ma">
  <input type="text" class="sd-Input-input-10L0t sd-Input-common-input-1XimE sd-Input-has-addon-3djHe" readonly placeholder="${placeholder}" ${extra}><span class="sd-Input-addon-1Dv-z sd-picker-addon-1SMM0"><div></div></span></label><span></span></div></div></div>`;
}
function page(html=markup()) {document.body.innerHTML=`<h1>个人信息</h1>${html}<button>预览并提交</button>`;return observeApplicationPage();}
function instruction(p=observeApplicationPage()):FillInstruction {
  const f=p.fields[0]!;
  return {fieldId:f.fieldId,stableFieldKey:f.stableFieldKey,selector:f.selector,expectedLabel:f.label,type:f.type,
    applicationUrl:p.url,value:"2001-05-15",dateValue:{year:2001,month:5,day:15},datePrecision:"month"};
}
function commit(value="2001-05 (25岁 / Years old)") {
  const original=document.querySelector<HTMLInputElement>("input")!;
  const replacement=original.cloneNode(true) as HTMLInputElement;
  replacement.value=value;replacement.placeholder="";original.replaceWith(replacement);
  return observeApplicationPage();
}
beforeEach(()=>{
  vi.stubGlobal("location",new URL("https://app.mokahr.com/campus-recruitment/zsquant/36544#/job/example/apply"));
  vi.stubGlobal("CSS",{escape:(s:string)=>s});
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({x:0,y:0,left:0,top:0,right:200,bottom:30,width:200,height:30,toJSON(){}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("calendar identity after placeholder clearing",()=>{
  it.each(["campus-recruitment/zsquant/36544","social-recruitment/unrelated/42"])("rebinds the same registered month calendar on %s",path=>{
    vi.stubGlobal("location",new URL(`https://app.mokahr.com/${path}#/job/example/apply`));
    const before=page();const plan=instruction(before);const route=resolveControlAdapter(evidenceForField(before,before.fields[0]!,plan));
    expect(route.code).toBe("moka.date-picker.trusted-pointer.v9");
    const after=commit();const rebound=bindObservedInstruction(after,plan);
    expect(rebound?.stableFieldKey).toBe(before.fields[0]!.stableFieldKey);
    expect(rebound?.label).toBe(caption);
    expect(rebound?.validationMessage??"").toBe("");
    expect(resolveControlAdapter(evidenceForField(after,rebound!,plan)).code).toBe(route.code);
    expect(registeredControlReadbackMatches({controlAdapter:route.diagnostic,field:rebound,expected:plan.value,
      dateValue:plan.dateValue,datePrecision:plan.datePrecision}).matches).toBe(true);
  });
  it("keeps arbitrary date captions stable without classifying by company or birth semantics",()=>{
    const before=page(markup("测评时点","YYYY-MM"));const plan=instruction(before);
    const after=commit("2001-05");expect(bindObservedInstruction(after,plan)?.currentValue).toBe("2001-05");
  });
  it("retains persistent native names and does not change ordinary native text routing",()=>{
    const before=page(markup("测评时点","YYYY-MM",'name="appointment_code"'));
    const plan=instruction(before);expect(plan.stableFieldKey).toContain("appointment_code");
    expect(bindObservedInstruction(commit(),plan)?.stableFieldKey).toBe(plan.stableFieldKey);
    const native=page('<label>出生日期<input type="text" name="date_text" placeholder="自由文本"></label>');
    const f=native.fields[0]!;expect(resolveControlAdapter(evidenceForField(native,f)).code).toBe("generic.native.v1");
    expect(f.stableFieldKey).toContain("date_text");
  });
  it("does not admit an unrelated readonly custom input as a calendar",()=>{
    const p=page('<label>出生日期<input type="text" readonly placeholder="外部控件"></label>');
    const f=p.fields[0]!;expect(resolveControlAdapter(evidenceForField(p,f)).code).toBe("unresolved.custom.v1");
    expect(f.stableFieldKey).toContain("外部控件");
  });
  it("does not guess between two indistinguishable calendar identities",()=>{
    const p=page(markup()+markup());const plan=instruction(p);
    expect(bindObservedInstruction(p,plan)).toBeNull();
    for(const el of document.querySelectorAll<HTMLInputElement>('input')) el.placeholder="";
    expect(bindObservedInstruction(observeApplicationPage(),plan)).toBeNull();
  });
  it("keeps full-day validation strict even beside an age-rendering month calendar",()=>{
    const p=page(markup()+markup("最快到岗时间","日期（年月日） / Date (year-month-day)"));
    const f=p.fields[1]!;expect(fieldInformationRequirement(f)).toEqual({kind:"date",precision:"day"});
    const route=resolveControlAdapter(evidenceForField(p,f));
    expect(registeredControlReadbackMatches({controlAdapter:route.diagnostic,field:{...f,currentValue:"2001-05 (25岁)"},expected:"2001-05-15",datePrecision:"day"}).matches).toBe(false);
    expect(registeredControlReadbackMatches({controlAdapter:route.diagnostic,field:{...f,currentValue:"2001-05-15"},expected:"2001-05-15",datePrecision:"day"}).matches).toBe(true);
  });
  it("retains authoritative candidate dates and rejects unlabeled obsolete job bindings",()=>{
    const f=page().fields[0]!;
    expect(authoritativeCandidateFactForField(f,{"candidate.basic.birthDate":"2001-05-15"})?.value).toBe("2001-05-15");
    const old=enrichVisionCandidateFacts({}, {}, {requiredFieldAnswers:[{fieldId:"old",stableFieldKey:"basic.出生日期_年龄_birth_date_age.native",value:"2001-05-15",source:"user_confirmed"}]});
    expect(authoritativeCandidateFactForField(f,old)).toBeNull();
  });
  it("retains the actual correctly titled legacy birth-date confirmation",()=>{
    const f=page().fields[0]!;
    const saved={label:"出生日期",stableFieldKeys:["basic.日期_年月日.native"],value:"2001-05-15",source:"user_confirmed"};
    const facts=enrichVisionCandidateFacts({}, {}, {}, {facts:[saved]});
    expect(authoritativeCandidateFactForField(f,facts)?.value).toBe(saved.value);
    expect(authoritativeCandidateFactForField(commit().fields[0]!,facts)?.value).toBe(saved.value);
    for(const changed of [{...f,label:"孩子出生日期",domHints:{...f.domHints!,fieldLabel:"孩子出生日期"}},
      {...f,sectionKey:"work",groupIndex:0},
      {...f,label:"最快到岗时间",domHints:{...f.domHints!,fieldLabel:"最快到岗时间"}}]) {
      expect(authoritativeCandidateFactForField(changed,facts)).toBeNull();
    }
    for(const invalid of [{...saved,label:"最快到岗时间"},{...saved,source:"model"},
      {...saved,stableFieldKeys:["basic.unknown.native"]},{...saved,value:"2001"},
      {...saved,fieldBinding:{jobId:"other",stableFieldKey:saved.stableFieldKeys[0],sectionKey:"basic",groupIndex:null}}]) {
      expect(authoritativeCandidateFactForField(f,enrichVisionCandidateFacts({}, {}, {jobId:"current"},{facts:[invalid]}))).toBeNull();
    }
  });
  it("rejects conflicting or indistinguishable legacy date origins",()=>{
    const f=page().fields[0]!;
    for(const value of ["2001-05-15","2001-05-16"]) {
      const saved=[{label:"出生日期",stableFieldKeys:["basic.日期_年月日.native"],value:"2001-05-15",source:"user_confirmed"},
        {label:caption,stableFieldKeys:["basic.出生日期_年龄_birth_date_age.native"],value,source:"user_confirmed"}];
      expect(()=>authoritativeCandidateFactForField(f,enrichVisionCandidateFacts({}, {}, {},{facts:saved}))).toThrow("无法唯一关联");
    }
  });
});
