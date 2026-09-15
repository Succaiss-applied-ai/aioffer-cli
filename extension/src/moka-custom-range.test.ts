// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {observeApplicationPage, type FillInstruction} from "./page-adapter.js";
import {bindObservedInstruction, evidenceForField} from "./control-adapters/field-routing.js";
import {resolveControlAdapter} from "./control-adapters/registry.js";
import {authoritativeCandidateFactForField, candidateInformationRequestForField, deterministicKnownFactActions, siteRejectedInformationRequests, rangeEndChoiceForField, visionPlanningObservation} from "./vision-form-runtime.js";
import {registeredControlReadbackMatches} from "./control-adapters/readback-policy.js";

// Reconstructed from the independent Garena page's actual field-owned DOM:
// date_group_info > month-range-select > year/month pair, till separator,
// year/month pair, optional Present checkbox. No candidate data or page script.
const title = "【实习】预计可实习时长";
function select(part: string) {
  return `<div class="item-CNFmjn2r6y"><div class="sd-Dropdown-container-1CigZ"><label class="sd-Input-container-2S_vM sd-Select-container-1Eq4x">
    <span class="sd-Input-display-value-RwqDy"></span><input type="text" class="sd-Input-input-10L0t" placeholder="${part}">
    <span class="sd-Select-addon-26oV3"></span></label><span></span></div></div>`;
}
function range(caption = title) {
  return `<div class="apply-field-Q2iJ7AtQGX date_group_info-bnBcnnQiHt"><div class="title-IWWQ0Xa4L7"><span><span>${caption}</span></span><span class="required-asterisk-av7daEKsLS"></span></div>
  <div class="ctrl-CICMG4Fr4_"><div class="month-range-select date_group_info wrapper-Wilqy7sjl0"><label></label>
  <span>${select("年")}${select("月")}</span><span class="till-QjTOI37re2">-<br></span><span>${select("年")}${select("月")}</span>
  <span class="sign-MhIus99jyR"><label class="sd-Checkbox-container-3IoOq"><input type="checkbox" class="sd-Checkbox-input-1uFHv"><span class="sd-Checkbox-label-187mu">至今</span></label></span>
  </div></div></div>`;
}
function install(markup = range()) {
  document.body.innerHTML = `<div class="apply-block-KRDTLLb5hU"><h2>个人信息</h2><div class="apply-fields-BzcXI4i2Pm">${markup}</div></div><button>预览并提交</button>`;
  return observeApplicationPage();
}
function dates() { return observeApplicationPage().fields.filter(f => f.domHints?.inputType === "text"); }
beforeEach(() => {
  vi.stubGlobal("location", new URL("https://app.mokahr.com/campus-recruitment/garena/148076#/job/example/apply"));
  vi.stubGlobal("CSS", {escape: (s: string) => s});
  Object.defineProperty(HTMLElement.prototype, "innerText", {configurable:true, get(){return this.textContent ?? "";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({x:0,y:0,left:0,top:0,right:200,bottom:30,width:200,height:30,toJSON(){}});
});
afterEach(() => {vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("Moka field-owned custom year/month ranges", () => {
  it("keeps all four empty owned displays empty instead of joining sibling separators", () => {
    install();
    expect(dates().map(field => field.currentValue)).toEqual(["", "", "", ""]);
  });
  it("reads only the committed display owned by each endpoint, including empty siblings", () => {
    install(range() + range("另一个可参与区间"));
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="text"]')];
    inputs[0]!.previousElementSibling!.textContent = "2026";
    inputs[0]!.placeholder = "";
    inputs[4]!.previousElementSibling!.textContent = "2027";
    inputs[4]!.placeholder = "";
    // Query/input text is not a committed option in this exact Select shape.
    inputs[1]!.value = "9";
    expect(dates().map(field => field.currentValue)).toEqual(["2026", "", "", "", "2027", "", "", ""]);
    const native = pageNativeSameTitle();
    expect(native.fields.find(field => field.domHints?.name === "native_range")?.currentValue).toBe("2026-09");
  });
  it("retains the field title, both edges and year/month units in each supplement request", () => {
    install(); const fields = dates();
    expect(fields.map(f => f.temporal && [f.temporal.edge, f.temporal.part])).toEqual([
      ["start","year"],["start","month"],["end","year"],["end","month"]
    ]);
    expect(new Set(fields.map(f=>f.stableFieldKey)).size).toBe(4);
    for (const [index, field] of fields.entries()) {
      const suffix = ["开始年份","开始月份","结束年份","结束月份"][index]!;
      expect(field.required).toBe(true);
      expect(field.label).toContain(`${title}（${suffix}）`);
      expect(candidateInformationRequestForField(field)?.label).toContain(`${title}（${suffix}）`);
      expect(resolveControlAdapter(evidenceForField(observeApplicationPage(),field)).code).toBe("moka.year-month-select.trusted-pointer.v1");
    }
  });
  it("keeps each committed part bound after React clears placeholders and values move into siblings", () => {
    install();const before=dates();const values=["2026","9","2027","2"];
    for (const [index, input] of [...document.querySelectorAll<HTMLInputElement>('input[type="text"]')].entries()) {
      const copy=input.cloneNode(true) as HTMLInputElement;copy.placeholder="";input.replaceWith(copy);
      copy.previousElementSibling!.textContent=values[index]!;
      const after=observeApplicationPage();
      for (const [n, field] of before.entries()) {
        const instruction: FillInstruction={fieldId:field.fieldId,selector:field.selector,type:field.type,stableFieldKey:field.stableFieldKey,expectedLabel:field.label,value:values[n]!};
        const bound=bindObservedInstruction(after,instruction);
        expect(bound?.stableFieldKey).toBe(field.stableFieldKey);
        if(n<=index) {
          expect(bound?.currentValue).toBe(values[n]);
          expect(registeredControlReadbackMatches({field:bound,expected:values[n]!,controlAdapter:resolveControlAdapter(evidenceForField(after,bound!)).diagnostic}).matches).toBe(true);
        }
      }
    }
  });
  it("does not fill a prospective custom range from past work, education or availability facts", () => {
    install(); const facts={"resume.work.0.startDate":"2021-01", "resume.work.0.endDate":"2022-02", "resume.education.0.startDate":"2015-09", "candidate.basic.availableDate":"2026-09-01"};
    for (const field of dates()) {
      expect(authoritativeCandidateFactForField(field,facts)).toBeNull();
      expect(authoritativeCandidateFactForField(field,{...facts,[`job.requiredField.stable:${field.stableFieldKey}`]:field.temporal?.part==="year"?"2026":"9"})?.value).toBe(field.temporal?.part==="year"?"2026":"9");
      expect(authoritativeCandidateFactForField(field,{...facts,"job.requiredField.stable:other.年.combobox.field11":"2026"})).toBeNull();
    }
    expect(deterministicKnownFactActions(observeApplicationPage(),facts)).toEqual([]);
    for(const caption of ["未来工作计划", "项目参与安排", "学校活动区间"]) {
      install(range(caption));
      expect(deterministicKnownFactActions(observeApplicationPage(),facts)).toEqual([]);
    }
  });
  it("does not depend on company or custom caption keywords", () => {
    vi.stubGlobal("location", new URL("https://app.mokahr.com/social-recruitment/example/1#/job/example/apply"));
    install(range("可参与区间"));
    expect(dates().every(f=>f.temporal?.layout==="year_month_range")).toBe(true);
    expect(dates()[0]?.label).toContain("可参与区间（开始年份）");
  });
  it("rejects reversed confirmed bounds without borrowing another field's end date", () => {
    install(range()+range("另一个可参与区间"));const fields=dates();
    const facts=Object.fromEntries(fields.map((f,index)=>[`job.requiredField.stable:${f.stableFieldKey}`,["2026","9","2026","8","2026","9","2027","1"][index]!]));
    for(const field of fields.slice(0,4)) expect(authoritativeCandidateFactForField(field,facts)).toBeNull();
    for(const field of fields.slice(4)) expect(authoritativeCandidateFactForField(field,facts)).not.toBeNull();
    facts[`job.requiredField.stable:${fields[3]!.stableFieldKey}`]="9";
    for(const field of fields) expect(authoritativeCandidateFactForField(field,facts)).not.toBeNull();
  });
  it("does not combine independent controls or malformed pair structures into a range", () => {
    for(const markup of [range().replace('class="month-range-select date_group_info wrapper-Wilqy7sjl0"','class="unrelated"'),range().replace('-<br>',''),range().replace('placeholder="年"','placeholder="人数"'),range().replace('</label><span></span>','</label><input placeholder="额外字段"><span></span>')]) {
      install(markup);expect(dates().some(f=>f.temporal?.layout==="year_month_range")).toBe(false);
    }
  });
  it("keeps distinct field titles separate and rejects identical duplicate fields", () => {
    install(range()+range("另一个可参与区间"));
    expect(new Set(dates().map(f=>f.stableFieldKey)).size).toBe(8);
    install(range()+range());const page=observeApplicationPage();const field=page.fields[0]!;
    expect(bindObservedInstruction(page,{fieldId:field.fieldId,selector:field.selector,type:field.type,stableFieldKey:field.stableFieldKey,expectedLabel:field.label,value:"2026"})).toBeNull();
  });
  it("preserves Present as an optional checkbox, not a required Select inside the range", () => {
    install();const checkbox=observeApplicationPage().fields.find(f=>f.domHints?.inputType==="checkbox")!;
    expect(checkbox.type).toBe("checkbox");expect(checkbox.required).toBe(false);
    expect(checkbox.temporal).toBeNull();expect(checkbox.currentValue).toBe("false");
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked=true;
    for(const input of [...document.querySelectorAll<HTMLInputElement>('input[type="text"]')].slice(2)) input.disabled=true;
    const after=observeApplicationPage();
    expect(after.fields.find(f=>f.domHints?.inputType==="checkbox")?.currentValue).toBe("true");
    expect(after.fields.filter(f=>f.temporal?.edge==="end").every(f=>f.domHints?.disabled)).toBe(true);
  });
  it.each(["工作经历", "实习经历", "项目经验"])("owns optional Present and all four required endpoints in %s", (section) => {
    const markup = range("起止时间").replaceAll("date_group_info", "date_info");
    install(markup);
    document.querySelector("h2")!.textContent = section;
    const before = observeApplicationPage();
    const ends = before.fields.filter(f => f.domHints?.inputType === "text");
    expect(ends).toHaveLength(4);
    expect(ends.every(f => f.required)).toBe(true);
    const present = before.fields.find(f => f.type === "checkbox")!;
    expect(present.required).toBe(false);
    const error = document.createElement("div"); error.className="field-error"; error.textContent="请填写完整时间";
    document.querySelector("[class*=apply-field-]")!.append(error);
    const after=observeApplicationPage();
    expect(after.fields.find(f=>f.type==="checkbox")?.validationMessage).toBeNull();
    expect(after.fields.filter(f=>f.type!=="checkbox").every(f=>f.validationMessage==="请填写完整时间")).toBe(true);
    const requests=siteRejectedInformationRequests(after.fields.filter(f=>f.validationMessage));
    expect(requests).toHaveLength(4);
    expect(after.fields.map(f=>f.stableFieldKey)).toEqual(before.fields.map(f=>f.stableFieldKey));
  });
  it("retains explicit required and own validation on Present outside a proven range", () => {
    install('<label>至今<input type="checkbox" required aria-invalid="true" aria-errormessage="own-error"></label><span id="own-error" role="alert">请勾选</span>');
    expect(observeApplicationPage().fields[0]).toMatchObject({required:true, validationMessage:"请勾选"});
  });
  it("keeps start and toggle identity when Present removes the end pair, and restores the same ends", () => {
    install(range("起止时间").replaceAll("date_group_info","date_info")); document.querySelector("h2")!.textContent="实习经历";
    const before=observeApplicationPage(), original=[...before.fields];
    const checkbox=document.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    const root=document.querySelector('.month-range-select')!;
    const separator=root.querySelector('[class*=till-]')!;
    const pair=separator.nextElementSibling!;
    const separatorCopy=separator.cloneNode(true), pairCopy=pair.cloneNode(true);
    checkbox.checked=true;separator.remove();pair.remove();
    const after=observeApplicationPage();
    expect(after.fields.filter(f=>f.dateRange?.role==="end")).toHaveLength(0);
    expect(after.fields.filter(f=>f.dateRange?.role==="start").map(f=>f.stableFieldKey))
      .toEqual(original.filter(f=>f.dateRange?.role==="start").map(f=>f.stableFieldKey));
    const toggle=after.fields.find(f=>f.dateRange?.role==="present")!;
    expect(toggle.stableFieldKey).toBe(original.find(f=>f.dateRange?.role==="present")?.stableFieldKey);
    expect(toggle.required).toBe(false);
    expect(resolveControlAdapter(evidenceForField(after,toggle)).code).toBe("moka.range-present.trusted-pointer.v1");
    checkbox.checked=false;
    const sign=root.querySelector('[class*=sign-]')!;root.insertBefore(separatorCopy,sign);root.insertBefore(pairCopy,sign);
    expect(observeApplicationPage().fields.map(f=>f.stableFieldKey)).toEqual(original.map(f=>f.stableFieldKey));
  });
  it.each(["至今", "现在", "Present"])("selects Present from the same experience endDate %s and leaves missing dates undecided", (endDate) => {
    install(range("起止时间").replaceAll("date_group_info","date_info"));document.querySelector("h2")!.textContent="实习经历";
    const page=observeApplicationPage(),toggle=page.fields.find(f=>f.dateRange?.role==="present")!;
    const facts={"resume.internship.0.startDate":"2025-01","resume.internship.0.endDate":endDate,"resume.internship.1.endDate":"2026-05"};
    expect(rangeEndChoiceForField(toggle,facts)).toEqual({key:"resume.internship.0.endDate",value:"true"});
    const actions=deterministicKnownFactActions(page,facts);
    expect(actions[0]).toMatchObject({fieldId:toggle.fieldId,rangeEndChoice:true,value:"true"});
    expect(actions.some(a=>page.fields.find(f=>f.fieldId===a.fieldId)?.dateRange?.role==="end")).toBe(false);
    expect(visionPlanningObservation(page,new Set(),{candidateFacts:facts}).fields.some(f=>f.fieldId===toggle.fieldId)).toBe(true);
    expect(rangeEndChoiceForField({...toggle,groupIndex:1},facts)?.value).toBe("false");
    expect(rangeEndChoiceForField({...toggle,groupIndex:2},facts)).toBeNull();
    expect(rangeEndChoiceForField(toggle,{"resume.work.0.endDate":"至今"})).toBeNull();
    expect(rangeEndChoiceForField(toggle,{"resume.internship.0.endDate":""})).toBeNull();
    expect(rangeEndChoiceForField({...toggle,observedControlKind:undefined},facts)).toBeNull();
  });
  it("uses the actual background pair identity for a year and its own month only", () => {
    const source=readFileSync('extension/src/background.ts','utf8');
    const ast=ts.createSourceFile('background.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='mokaYearMonthPairIdentity')!;
    const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
    const pair=new Function(`${js};return mokaYearMonthPairIdentity;`)() as (field:ReturnType<typeof dates>[number], key?:string)=>string;
    install(range()+range("另一个可参与区间"));const fields=dates();
    const identities=fields.map(f=>pair(f,`job.requiredField.stable:${f.stableFieldKey}`));
    expect(identities[0]).toBe(identities[1]);expect(identities[2]).toBe(identities[3]);
    expect(identities[0]).not.toBe(identities[2]);expect(identities[0]).not.toBe(identities[4]);
  });
});

function pageNativeSameTitle() {
  document.body.innerHTML = `<label>${title}<input name="native_range" value="2026-09"></label><button>预览并提交</button>`;
  return observeApplicationPage();
}
