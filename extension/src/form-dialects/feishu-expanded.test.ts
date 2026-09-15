// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://hf7l9aiqzx.jobs.feishu.cn/704852/resume/7670761356387846454/apply"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "../page-adapter.js";
import { observeApplicationPageWithFieldDialects, applyApplicationFieldDialects } from "./application-field-dialects.js";
import { observeFeishuAtsxFieldPatchesInPage } from "./feishu-atsx.js";
import { bindObservedInstruction, evidenceForField } from "../control-adapters/field-routing.js";
import { resolveControlAdapter } from "../control-adapters/registry.js";
import { visionPlanningObservation, authoritativeCandidateFactForField, deterministicKnownFactActions, enrichVisionCandidateFacts } from "../vision-form-runtime.js";
import { fillApplicationPage } from "../control-adapters/native-driver.js";
import { readFeishuMonthPeriodInPage, inspectFeishuMonthPeriodTargetInPage } from "../control-adapters/feishu-month-period-driver.js";

beforeEach(() => {
  vi.restoreAllMocks(); document.body.innerHTML = "";
  history.replaceState({}, "", "/704852/resume/7670761356387846454/apply");
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable:true, get() {return this.textContent ?? "";} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this:HTMLElement) {
    const hidden = !!this.closest("[hidden],[style*='display: none']");
    return {x:20,y:100,left:20,top:100,right:620,bottom:140,width:hidden?0:600,height:hidden?0:40,toJSON(){}};
  });
});
const atsx = (id:string,label:string,control:string,error="",required=true) => `<div class="atsx-form-item" data-cy="${id}"><div class="atsx-form-item-label"><label class="${required?'atsx-form-item-required':''}" for="${id}">${label}</label></div><div class="atsx-form-item-control">${control}${error?`<div class="atsx-form-explain">${error}</div>`:''}</div></div>`;
const native = (id:string) => `<input id="${id}" class="atsx-input" type="text">`;
const flat = (id:string,search=false) => `<div class="atsx-select ${search?'atsx-select-combobox':''}" id="${id}"><div role="combobox" class="atsx-select-selection atsx-select-selection--single" aria-haspopup="true" data-cy="${id}Input"><div class="atsx-select-search" ${search?'':'style="display: none"'}><input class="atsx-select-search__field" id="${id}"></div></div></div>`;
const formily = (id:string,label:string,control:string) => `<div class="ud-formily-item" id="formily-item-${id}" data-form-field-id="${id}"><div class="ud-formily-item-label"><span class="ud-formily-item-label-content">${label}</span><span class="ud-formily-item-asterisk">*</span></div>${control}</div>`;
const module = (title:string,groupId:string,content:string) => `<div class="applyFormModuleWrapper"><div class="applyFormModuleWrapper-title"><p class="applyFormModuleWrapper-text">${title}</p></div><div class="ud-formily-item" id="formily-item-${groupId}"><div class="apply-form-array-card__1d6856"><div class="apply-form-array-card-content__1d6856">${content}</div><div class="apply-form-array-card-operate__1d6856"></div></div></div></div>`;
const install = (html:string) => { document.body.innerHTML=`<main><form>${html}<button type="button">提交简历</button></form></main>`; };

describe("evidenced ATSX and mixed Formily observations", () => {
  it("binds career_list month endpoints alongside portfolio without borrowing old unscoped answers",()=>{
    const period=(start:string,end:string)=>formily("start_end_time","起止时间",`<div class="throne-biz-date-range-picker-wrapper"><div class="throne-biz-date-range-picker-input"><input value="${start}"></div><div class="throne-biz-date-range-picker-input"><input value="${end}"></div></div>`);
    install(module("作品","works_list",formily("link","作品链接",'<input data-form-field-name="link">')+formily("attachment","作品附件",'<input type="file">'))+
      module("工作经历","career_list",period("2022-04","2022-10")));
    const page=observeApplicationPageWithFieldDialects(),dates=page.fields.filter(f=>f.type==="custom_date_picker");
    expect(dates.map(f=>f.stableFieldKey)).toEqual(["work[0].start_date.custom_date_picker","work[0].end_date.custom_date_picker"]);
    expect(page.fields.filter(f=>f.sectionKey==="portfolio")).toHaveLength(2);
    for(const date of dates){
      expect(resolveControlAdapter(evidenceForField(page,date)).code).toBe("feishu.month-period.trusted-pointer.v3");
      expect(readFeishuMonthPeriodInPage(date.selector,date.stableFieldKey,date.label)).toMatchObject({actual:date.currentValue,rangeComplete:true,validationCleared:true});
      expect(authoritativeCandidateFactForField(date,{"job.requiredField.stable:other.start_date.native":"2000-01"})).toBeNull();
    }
  });
  it("keeps numeric tenant questions separate from standard school facts across control types",()=>{
    const rankLabel="成绩排名（最高学历院校排名）";
    const custom=(id:string,label:string,control:string)=>formily(id,label,control)
      .replace(`data-form-field-id="${id}"`,`data-form-field-id="${id}" data-form-field-i18n-name="${label}"`);
    install(module("教育经历","education_list",
      formily("school","学校名称",'<input data-form-field-name="school">')+
      custom("7545008465266379050",rankLabel,'<input role="combobox" type="search" readonly>')+
      custom("7545008465266379051",rankLabel,'<input type="text">')+
      formily("degree","学历",'<input role="combobox" type="search" readonly>'))+
      custom("7549098127577221385","您在此次投递前，是否对图拉斯公司或该职位有过初步了解？",'<input role="combobox" type="search" readonly>'));
    const page=observeApplicationPageWithFieldDialects();
    const [school,rank,rankText,degree,companyQuestion]=page.fields;
    const facts={"resume.education.0.school":"上海大学","resume.education.0.degree":"本科","resume.work.0.company":"示例公司"};
    expect(school?.stableFieldKey).toBe("education[0].school.native");
    expect(degree?.stableFieldKey).toBe("education[0].degree.combobox");
    for(const field of [rank!,rankText!,companyQuestion!]){
      expect(field.stableFieldKey).toContain(field.fieldSource!.fieldPath);
      expect(authoritativeCandidateFactForField(field,facts)).toBeNull();
      expect(deterministicKnownFactActions({...page,url:"https://xiaopeng.jobs.feishu.cn/index/resume/123/apply",fields:[field]},facts)).toEqual([]);
      const value="已确认的该题答案";
      expect(authoritativeCandidateFactForField(field,{...facts,[`job.requiredField.stable:${field.stableFieldKey}`]:value})).toMatchObject({value});
      const profile={facts:[{source:"user_confirmed",label:field.label,value,stableFieldKeys:[field.stableFieldKey],
        fieldBinding:{jobId:"current-job",stableFieldKey:field.stableFieldKey,sectionKey:field.sectionKey,groupIndex:field.groupIndex}}]};
      const bound=enrichVisionCandidateFacts({},facts,{jobId:"current-job"},profile);
      expect(authoritativeCandidateFactForField(field,bound)?.value).toBe(value);
      expect(authoritativeCandidateFactForField(field,enrichVisionCandidateFacts({},facts,{jobId:"other-job"},profile))).toBeNull();
      expect(authoritativeCandidateFactForField({...field,groupIndex:1},bound)).toBeNull();
      const oldConfirmed={source:"user_confirmed",label:field.label,value,stableFieldKeys:[field.stableFieldKey]};
      expect(authoritativeCandidateFactForField(field,enrichVisionCandidateFacts({},facts,{}, {facts:[oldConfirmed]}))?.value).toBe(value);
      expect(authoritativeCandidateFactForField(field,enrichVisionCandidateFacts({},facts,{}, {facts:[{...oldConfirmed,label:"学校名称"}]}))).toBeNull();
      expect(authoritativeCandidateFactForField(field,enrichVisionCandidateFacts({},facts,{}, {facts:[{...oldConfirmed,stableFieldKeys:[]}]}))).toBeNull();
      const conflict=enrichVisionCandidateFacts({},facts,{}, {facts:[oldConfirmed,{...oldConfirmed,value:"另一答案"}]});
      expect(()=>authoritativeCandidateFactForField(field,conflict)).toThrow("无法唯一关联");
    }
    expect(authoritativeCandidateFactForField(school!,facts)?.value).toBe("上海大学");
    expect(authoritativeCandidateFactForField(degree!,facts)?.value).toBe("本科");
    expect(authoritativeCandidateFactForField(rank!,{"job.requiredField.stable:education[0].school.combobox":"上海大学"})).toBeNull();
  });
  it("preserves the accepted numeric multi-question identity",()=>{
    const id="7547670991724988714",label="你更期望在图拉斯遇到怎样的团队氛围？";
    install(formily(id,label,'<input role="combobox" type="search">').replace(`data-form-field-id="${id}"`,`data-form-field-id="${id}" data-form-field-i18n-name="${label}"`));
    expect(observeApplicationPageWithFieldDialects().fields[0]?.stableFieldKey).toBe("intention.7547670991724988714_你更期望在图拉斯遇到怎样的团队氛围.combobox");
  });
  it("keeps custom numeric range endpoints separate, bound to their exact question, and refuses borrowed work dates",()=>{
    install(formily("7549005976244111626","可提前实习周期",'<div class="throne-biz-date-range-picker-wrapper"><div class="throne-biz-date-range-picker-input"><input value="2026-09"></div><div class="throne-biz-date-range-picker-input"><input value="2026-12"></div></div>'));
    const page=observeApplicationPageWithFieldDialects();
    expect(page.fields).toHaveLength(2);
    expect(page.fields.map(f=>f.stableFieldKey)).toEqual(["other.7549005976244111626.start_date.custom_date_picker","other.7549005976244111626.end_date.custom_date_picker"]);
    for(const field of page.fields){
      expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("feishu.month-period.trusted-pointer.v3");
      expect(authoritativeCandidateFactForField(field,{"resume.work.0.startDate":"2020-01","resume.work.0.endDate":"2021-02"})).toBeNull();
      expect(readFeishuMonthPeriodInPage(field.selector,field.stableFieldKey,field.label)).toMatchObject({actual:field.currentValue,rangeComplete:true,validationCleared:true});
      expect(inspectFeishuMonthPeriodTargetInPage(field.selector,"control","",field.stableFieldKey,"另一个日期").status).toBe("control_missing");
    }
    document.querySelector('#formily-item-7549005976244111626')!.insertAdjacentHTML("beforeend",'<div class="ud-formily-item-error-help">请填写完整时间</div>');
    expect(readFeishuMonthPeriodInPage(page.fields[0]!.selector,page.fields[0]!.stableFieldKey,page.fields[0]!.label).validationCleared).toBe(false);
  });
  it("observes ATSX project/internship periods in DOM order, suppresses only their backing input and retains unrelated controls",()=>{
    const period=(section:string)=>atsx(`${section}[0].period`,"起止时间",`<div class="atsx-date-picker-period-month"><div class="atsx-date-picker-period-month-label" data-cy="${section}[0].periodInputBegin">2025-01</div><div class="atsx-date-picker-period-month-label" data-cy="${section}[0].periodInputEnd">2025-06</div><input class="atsx-date-picker-period-hidden-input"></div>`);
    install(period("internship")+atsx("email","邮箱",native("email"))+period("project"));
    const fields=observeApplicationPageWithFieldDialects().fields;
    expect(fields.map(f=>f.stableFieldKey)).toEqual(["internship[0].start_date.custom_date_picker","internship[0].end_date.custom_date_picker","basic.email.native","project[0].start_date.custom_date_picker","project[0].end_date.custom_date_picker"]);
    for(const field of fields.filter(f=>f.type==="custom_date_picker"))expect(readFeishuMonthPeriodInPage(field.selector,field.stableFieldKey,field.label).actual).toBe(field.currentValue);
  });
  it("plans required ATSX facts and reads only the owned error", () => {
    install(atsx("name","姓名",native("name"),"请输入姓名")+atsx("email","邮箱",native("email")));
    expect(observeApplicationPage().fields.find(f=>f.selector==="#name")?.required).toBe(false);
    const page=observeApplicationPageWithFieldDialects();
    expect(page.fields.find(f=>f.selector==="#name")).toMatchObject({stableFieldKey:"basic.full_name.native",required:true,validationMessage:"请输入姓名"});
    expect(page.fields.find(f=>f.selector==="#email")?.validationMessage).toBeNull();
    const planned=visionPlanningObservation(page,new Set(),{candidateFacts:{"resume.name":"Fixture Candidate","resume.email":"fixture@example.com"}});
    expect(planned.fields.map(f=>f.selector)).toEqual(expect.arrayContaining(["#name","#email"]));
  });
  it("recognizes the main resume without claiming adjacent attachments or static fields", () => {
    install(`<section class="uploadResume-section createFormSection-require"><div class="createFormSection-title"><p class="createFormSection-text">附件简历</p></div><div data-test="uploadResume" class="uploadResume"><span class="atsx-upload-btn"><input type="file" data-cy="inputUpload"></span></div></section>`+
      atsx("portrait","照片",'<input type="file" id="portrait">')+atsx("phone","手机号码",'<div>已验证手机号</div>')+atsx("city","意向城市",'<div>北京</div>'));
    const fields=observeApplicationPageWithFieldDialects().fields;
    expect(fields.find(f=>f.domHints?.dataFieldId==="attachment_resume")).toMatchObject({required:true,stableFieldKey:"attachments.resume_file.file"});
    expect(fields.find(f=>f.selector==="#portrait")?.stableFieldKey).not.toContain("resume_file");
    expect(fields).toHaveLength(2);
  });
  it("keeps education type separate and does not route the closed tree/search shell as a flat select", () => {
    install(atsx("education[0].degree","学历",flat("education[0].degree"))+atsx("education[0].education_type","学历类型",flat("education[0].education_type"))+atsx("education[0].school","学校名称",flat("education[0].school",true)));
    const page=observeApplicationPageWithFieldDialects();
    expect(page.fields.map(f=>f.stableFieldKey)).toEqual(["education[0].degree.combobox","education[0].education_type.combobox","education[0].school.combobox"]);
    expect(page.fields.map(f=>resolveControlAdapter(evidenceForField(page,f)).code)).toEqual([
      "unresolved.custom.v1","unresolved.custom.v1","feishu.atsx-school-search.trusted-pointer.v1"]);
    const educationType=page.fields.find(f=>f.fieldSource?.fieldPath.endsWith("education_type"))!;
    expect(authoritativeCandidateFactForField(educationType,{"resume.education.0.degree":"本科"})).toBeNull();
    expect(authoritativeCandidateFactForField(educationType,{"resume.education.0.educationType":"统招全日制"})).toMatchObject({value:"统招全日制"});
  });
  it("isolates numeric relation modules and portfolio while rejecting ambiguous old names", () => {
    install(formily("name","姓名",'<input data-form-field-id="name">')+
      module("与公司员工是否有亲属关系（如有）","7077486356423215368",formily("7077486356423526664","姓名",'<input data-form-field-id="7077486356423526664">'))+
      module("作品","works_list",formily("link","作品链接",'<input data-form-field-name="link">')+formily("attachment","作品附件",'<input type="file">')));
    const page=observeApplicationPageWithFieldDialects();
    expect(page.fields.map(f=>f.stableFieldKey)).toEqual(expect.arrayContaining(["basic.full_name.native","relation[0].name.native"]));
    expect(page.fields.filter(f=>f.sectionKey==="portfolio")).toHaveLength(2);
    expect(bindObservedInstruction(page,{fieldId:"old",stableFieldKey:"basic.full_name.native#1",expectedLabel:"姓名",selector:"#old",type:"text",value:"Old name"})).toBeNull();
  });
  it("keeps historical works_list work and Formily native repeated fields intact", () => {
    install(module("工作经历","works_list",formily("company","公司名称",'<input data-form-field-name="company">')));
    expect(observeApplicationPageWithFieldDialects().fields[0]).toMatchObject({sectionKey:"work",groupIndex:0,stableFieldKey:"work[0].company.native"});
  });
  it("binds duplicate ids to separate physical cards", () => {
    install(`<section id="formily-item-education_list">${[0,1].map(()=>`<div class="apply-form-array-card__1d6856"><div class="apply-form-array-card-content__1d6856">${formily("major","专业",'<input id="major" data-form-field-name="major">')}</div></div>`).join('')}</section>`);
    const fields=observeApplicationPageWithFieldDialects().fields;
    expect(fields.map(f=>f.stableFieldKey)).toEqual(["education[0].major.native","education[1].major.native"]);
    expect(new Set(fields.map(f=>f.selector)).size).toBe(2);
    for(const field of fields) expect(document.querySelectorAll(field.selector)).toHaveLength(1);
  });
  it("requires ATSX local error clearance after the native transaction", async () => {
    install(atsx("name","姓名",native("name"),"请输入姓名"));
    const field=observeApplicationPageWithFieldDialects().fields[0]!;
    const instruction={fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,selector:field.selector,expectedLabel:field.label,type:field.type,value:"Fixture Candidate"};
    expect((await fillApplicationPage([instruction]))[0]?.success).toBe(false);
    document.querySelector(".atsx-form-explain")!.remove();
    expect((await fillApplicationPage([instruction]))[0]?.success).toBe(true);
  });
  it("leaves non-Feishu observations unchanged and remains read-only when serialized", () => {
    install(atsx("name","姓名",native("name")));
    const html=document.body.innerHTML;
    const patches=observeFeishuAtsxFieldPatchesInPage();
    const serialized=new Function(`return (${observeFeishuAtsxFieldPatchesInPage.toString()})();`)();
    expect(serialized).toEqual(patches);expect(document.body.innerHTML).toBe(html);
    const page={...observeApplicationPage(),url:"https://app.mokahr.com/campus-recruitment/a/1#/job/b/apply"};
    expect(applyApplicationFieldDialects(page,{feishuAtsx:patches})).toBe(page);
  });
});
