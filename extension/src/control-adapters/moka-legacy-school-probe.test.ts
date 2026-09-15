// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {observeApplicationPage} from '../page-adapter.js';
import {withFieldInformationRequirements} from '../field-information.js';
import {resolveControlAdapter} from './registry.js';
import {evidenceForField} from './field-routing.js';
import {executeMokaSearchSelectDriver} from './moka-search-select-driver.js';
import {inspectMokaLegacySchoolInPage} from './moka-legacy-school-probe.js';
beforeEach(()=>{
  vi.stubGlobal('location',new URL('https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/example/apply'));
  vi.stubGlobal('CSS',{escape:(s:string)=>s});
  Object.defineProperty(HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent??''}});
  HTMLElement.prototype.scrollIntoView=vi.fn();
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const y=Number(this.dataset.y??20);return {x:0,y,left:0,top:y,right:200,bottom:y+20,width:200,height:20,toJSON(){}};});
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:(_x:number,y:number)=>[...document.querySelectorAll<HTMLElement>('[data-y]')].find(el=>Number(el.dataset.y)+10===y)??null});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function harness(options:{duplicate?:boolean;noResult?:boolean;noCommit?:boolean;wrongValue?:boolean;foreignMenu?:boolean}={}) {
 document.body.innerHTML=`<h2>教育背景</h2><div class="apply-field-old string_info-old"><div class="title-old" data-y="10">学校名称</div><div class="ctrl-old"><div><div><div class="school-select-old school-input"><div class="header-old"><input id="school" class="input-old" placeholder="请输入就读学校" data-y="50"></div><span id="results"></span></div></div></div></div></div><label>毕业院校<input id="plain" placeholder="毕业院校" value="已有院校"></label><button>预览并提交</button>`;
 const page=withFieldInformationRequirements(observeApplicationPage());const field=page.fields.find(f=>f.selector==='#school')!;
 const route=resolveControlAdapter(evidenceForField(page,field));expect(route.code).toBe('moka.legacy-school-search.trusted-focus.v1');
 expect(field).toMatchObject({required:false,optionSource:'search'});
 const input=document.querySelector<HTMLInputElement>('#school')!,results=document.querySelector('#results')!;
 const instruction={fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,selector:field.selector,expectedLabel:field.label,type:field.type,value:'广东海洋大学',applicationUrl:page.url,controlAdapter:route.diagnostic};
 vi.stubGlobal('chrome',{scripting:{executeScript:vi.fn(async({func,args=[]})=>[{result:func(...args)}])}});
 input.addEventListener('click',()=>input.focus());
 const clickPoint=vi.fn(async(p:{x:number;y:number})=>{(document.elementFromPoint(p.x,p.y) as HTMLElement)?.click();});
 const typeQuery=vi.fn(async(text:string)=>{
   input.value=text;
   const leaves=options.noResult?[]:options.duplicate?[text,text]:[text,'湛江科技学院'];
   results.innerHTML=`<div class="school-list-old"><ul class="list-wrapper-old">${leaves.map((name,i)=>`<li class="school-name-old" data-y="${100+i*30}">${name}</li>`).join('')}<li class="school-name-old">没有找到学校？<span class="option-text-btn-old">添加学校全称</span></li></ul></div>`;
   if(options.foreignMenu)document.body.append(results.firstElementChild!);
   for(const leaf of results.querySelectorAll<HTMLElement>('[data-y]'))leaf.addEventListener('click',()=>{
     if(options.noCommit)return;
     input.value=options.wrongValue?'其他大学':leaf.textContent!;results.innerHTML='';
   });
 });
 return {field,input,clickPoint,typeQuery,run:()=>executeMokaSearchSelectDriver({tabId:7,instruction,prepareSurface:async()=>{},clickPoint,typeQuery,wait:async()=>{}})};
}
it('selects one exact legacy leaf and preserves both the old binding and adjacent native school',async()=>{
 const t=harness();const before=observeApplicationPage().fields.map(f=>[f.fieldId,f.stableFieldKey,f.label,f.type,f.required]);
 const r=await t.run();expect(r.success).toBe(true);expect(r.actual).toBe('广东海洋大学');
 expect(r.diagnostics.ledger).toMatchObject({queryCount:1,leafClickCount:1});
 expect(document.querySelector<HTMLInputElement>('#plain')!.value).toBe('已有院校');
 expect(observeApplicationPage().fields.map(f=>[f.fieldId,f.stableFieldKey,f.label,f.type,f.required])).toEqual(before);
});
it.each([{duplicate:true},{noResult:true},{foreignMenu:true}])('does not select ambiguous/absent/foreign results %j',async options=>{
 const t=harness(options);const r=await t.run();expect(r.success).toBe(false);expect(r.diagnostics.ledger.leafClickCount).toBe(0);expect(t.typeQuery).toHaveBeenCalledTimes(1);
});
it.each([{noCommit:true},{wrongValue:true}])('does not accept an uncommitted or wrong result %j',async options=>{
 const r=await harness(options).run();expect(r.success).toBe(false);expect(r.diagnostics.ledger.leafClickCount).toBe(1);
});
it('never treats a retained query as proof before an exact leaf click',async()=>{
 const t=harness();t.input.value='广东海洋大学';
 expect(inspectMokaLegacySchoolInPage('#school','广东海洋大学')!.probe.actual).toBe('');
 const r=await t.run();expect(r.success).toBe(false);expect(t.clickPoint).not.toHaveBeenCalled();expect(t.typeQuery).not.toHaveBeenCalled();
});
it('does not match a similarly named plain school or a component from another ATS',()=>{
 const t=harness();const page=observeApplicationPage();const plain=page.fields.find(f=>f.selector==='#plain')!;
 expect(resolveControlAdapter(evidenceForField(page,plain)).code).toBe('generic.native.v1');
 expect(resolveControlAdapter(evidenceForField({url:'https://careers.example.com/apply'},t.field)).code).not.toBe('moka.legacy-school-search.trusted-focus.v1');
 document.querySelector('.header-old')!.className='plain-header';expect(inspectMokaLegacySchoolInPage('#school','广东海洋大学')).toBeNull();
});
it('does not rebind a legacy school to a second indistinguishable education group',async()=>{
 const t=harness();const duplicate=document.querySelector('.apply-field-old')!.cloneNode(true) as HTMLElement;
 duplicate.querySelector('input')!.id='school-second';document.body.append(duplicate);
 const r=await t.run();expect(r.success).toBe(false);expect(t.clickPoint).not.toHaveBeenCalled();expect(t.typeQuery).not.toHaveBeenCalled();
});
