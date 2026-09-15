// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply"}
import {beforeEach,it,expect,vi} from "vitest";
import {inspectFeishuSchoolInPage,executeFeishuSchoolSearch,type FeishuSchoolProbe} from "./feishu-school-search-driver.js";
import {resolveControlAdapter} from "./registry.js";
import {observeApplicationPageWithFieldDialects} from "../form-dialects/application-field-dialects.js";
import {evidenceForField} from "./field-routing.js";
beforeEach(()=>{
  vi.restoreAllMocks();document.body.innerHTML="";
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){const top=this.matches(".ud__select__dropdown")?144:100;
    return {x:20,y:top,left:20,top,right:620,bottom:top+40,width:600,height:40,toJSON(){}};});
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>document.querySelector("#school")});
});
function formily(){document.body.innerHTML=`<form><div id="formily-item-education_list"><div class="apply-form-array-card__fixture"><div class="ud-formily-item" data-form-field-name="school"><div class="ud-formily-item-label"><span class="ud-formily-item-label-content">学校名称</span></div><div class="ud__select ud__select--focus"><div class="ud__input"><input id="school" class="ud__native-input" data-form-field-name="school" value="上海大学"></div></div></div></div></div><button>提交简历</button></form><div class="ud__select__dropdown"><div class="ud__select__list"><div class="ud__select__list__item"><div class="ud__select__list__item__content">上海大学</div></div></div></div>`;document.querySelector<HTMLInputElement>("#school")!.focus();}
it("routes a real wrapped Formily school away from the xTool native Driver, preserving native school",()=>{
  formily();let page=observeApplicationPageWithFieldDialects(),field=page.fields.find(f=>f.selector==="#school")!;
  expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("feishu.formily-school-search.trusted-pointer.v1");
  document.querySelector(".ud__select")!.className="plain-wrapper";
  page=observeApplicationPageWithFieldDialects();field=page.fields.find(f=>f.selector==="#school")!;
  expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("xtool.formily-repeat-native.v1");
});
it("requires query ownership, exact candidates and no ambiguous foreign popups",()=>{
  formily();expect(inspectFeishuSchoolInPage("#school","学校名称","上海大学","formily_school").status).toBe("popup_owner_unproven");
  expect(inspectFeishuSchoolInPage("#school","学校名称","上海大学","formily_school","observe",true)).toMatchObject({options:["上海大学"],actual:"上海大学"});
  document.querySelector(".ud__select__list")!.insertAdjacentHTML("beforeend",'<div class="ud__select__list__item">上海大学</div>');
  expect(inspectFeishuSchoolInPage("#school","学校名称","上海大学","formily_school","observe",true).status).toBe("option_ambiguous");
  document.body.insertAdjacentHTML("beforeend",'<div class="ud__select__dropdown">其他</div>');
  expect(inspectFeishuSchoolInPage("#school","学校名称","上海大学","formily_school","observe",true).status).toBe("popup_ambiguous");
});
function runner(config:{existing?:string;focused?:boolean;missing?:boolean;duplicate?:boolean;error?:boolean;uncommitted?:boolean}={}){
  let value=config.existing??"",focused=config.focused??false,open=false,selected=false,polls=0;const events:string[]=[];
  return {events,io:{prepareSurface:vi.fn(async()=>{}),wait:vi.fn(async()=>{}),
    typeQuery:vi.fn(async(text:string)=>{value=text;open=true;events.push("query");}),
    click:vi.fn(async(p:{x:number;y:number})=>{if(p.x===1){focused=true;events.push("focus");}else if(p.x===2){selected=true;events.push("select");}else{focused=false;open=false;if(config.uncommitted)value="";events.push("blur");}}),
    inspect:vi.fn(async():Promise<FeishuSchoolProbe>=>{if(open)polls++;return {status:!open?"popup_closed":config.duplicate?"option_ambiguous":config.missing||polls<3?"option_unavailable":"ready",actual:value,
      options:open?[config.missing?"上海交通大学":"上海大学"]:[],popupCount:open?1:0,focused,validationCleared:selected&&!config.error,
      inputPoint:{x:1,y:1},optionPoint:{x:2,y:2},closePoint:{x:3,y:3}};})}};
}
it("makes one query and unique exact selection, then verifies two stable blurred readbacks",async()=>{
  const r=runner();expect(await executeFeishuSchoolSearch(r.io,"上海大学")).toMatchObject({success:true,actual:"上海大学",popupClosed:true,ledger:{query:1,select:1,close:1,retry:0}});
  expect(r.events).toEqual(["focus","query","select","blur"]);
});
it("does not treat input text, a missing/duplicate result or validation failure as committed",async()=>{
  const old=runner({existing:"上海大学"});expect(await executeFeishuSchoolSearch(old.io,"上海大学")).toMatchObject({success:false,status:"existing_query_or_value_unverified"});expect(old.events).toEqual([]);
  for(const config of [{missing:true},{duplicate:true}]){const r=runner(config);expect(await executeFeishuSchoolSearch(r.io,"上海大学")).toMatchObject({success:false,ledger:{query:1,select:0,retry:0}});}
  for(const config of [{error:true},{uncommitted:true}]){const r=runner(config);expect(await executeFeishuSchoolSearch(r.io,"上海大学")).toMatchObject({success:false,ledger:{select:1,retry:0}});}
});

it.each([['专业名称','major'],['其他查询项','custom_1']])('routes an identical editable query by structure after rename: %s', (label,key)=>{
  formily();document.querySelector('.ud-formily-item-label-content')!.textContent=label;
  for(const el of document.querySelectorAll('[data-form-field-name]'))el.setAttribute('data-form-field-name',key);
  const page=observeApplicationPageWithFieldDialects();const field=page.fields.find(f=>f.selector==='#school')!;
  expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe('feishu.formily-school-search.trusted-pointer.v1');
  expect(inspectFeishuSchoolInPage('#school',label,'上海大学','formily_school','observe',true)).toMatchObject({options:['上海大学'],actual:'上海大学'});
});

it("replaces an authorized closed school value with one full query and exact committed selection",async()=>{
  const r=runner({existing:"旧学校"});
  expect(await executeFeishuSchoolSearch(r.io,"上海大学",true)).toMatchObject({success:true,actual:"上海大学",ledger:{query:1,select:1,retry:0}});
  expect(r.io.typeQuery).toHaveBeenCalledExactlyOnceWith("上海大学","旧学校");
  expect(r.events).toEqual(["focus","query","select","blur"]);
});
it("does not take over an active old query even when replacement of closed values is allowed",async()=>{
  const r=runner({existing:"用户还在输入",focused:true});
  expect(await executeFeishuSchoolSearch(r.io,"上海大学",true)).toMatchObject({success:false,status:"existing_query_or_value_unverified"});
  expect(r.events).toEqual([]);
});
