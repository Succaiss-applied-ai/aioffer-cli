import { withInterruptionDependencies } from "../test-utils/interruption-dependencies.js";
// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import ts from "typescript";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {observeApplicationPage} from "../page-adapter.js";
import {evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
import {executeMokaSearchSelectDriver,MOKA_SEARCH_SELECT} from "./moka-search-select-driver.js";
import {fieldInformationRequirement, withFieldInformationRequirements} from "../field-information.js";
import {candidateInformationRequestForField, authoritativeCandidateFactForField} from "../vision-form-runtime.js";

const expected="测试大学";
beforeEach(()=>{
  vi.stubGlobal('location',new URL('https://app.mokahr.com/campus-recruitment/joycastle/142652#/job/example/apply'));
  vi.stubGlobal('CSS',{escape:(s:string)=>s});
  Object.defineProperty(HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent??''}});
  HTMLElement.prototype.scrollIntoView=vi.fn();
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const y=Number(this.dataset.y??20);return {x:0,y,left:0,top:y,right:200,bottom:y+20,width:200,height:20,toJSON(){}};
  });
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:(_x:number,y:number)=>
    [...document.querySelectorAll<HTMLElement>('[data-y]')].find(el=>Number(el.dataset.y)+10===y)??null});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const backgroundSource = readFileSync(`${process.cwd()}/extension/src/background.ts`, "utf8");
function production(name: string, dependencies: Record<string, unknown>) {
  const ast = ts.createSourceFile("background.ts", backgroundSource, ts.ScriptTarget.ES2023, true);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  const compiled = ts.transpileModule(node.getText(ast), {compilerOptions:{target:ts.ScriptTarget.ES2023}}).outputText;
  return new Function(...Object.keys(withInterruptionDependencies(dependencies)), `${compiled}; return ${name}`)(...Object.values(withInterruptionDependencies(dependencies)));
}
function harness(options:{major?:boolean; bilingual?:boolean; title?:string; tooltip?:boolean;duplicates?:boolean; noResults?:boolean; wrongFocus?:boolean; staleUrl?:boolean; validation?:boolean; noCommit?:boolean; movingResults?:boolean; pendingWithoutEmptyMessage?:boolean; unsupportedResults?:boolean}={}) {
  document.body.innerHTML=`<h2>教育背景</h2><div class="apply-field-test string_info-test"><div class="title-test" data-y="20"><span>${options.major?"专业名称":"学校名称"}</span><span class="required-asterisk-test"></span></div>
  <div class="ctrl-test">${options.major?'<div class="sd-Tooltip-container-test w-full-test">':''}<div class="sd-Dropdown-container-test"><label class="sd-Input-container-test sd-Select-container-test" data-y="50"><span class="sd-Input-display-value-test"></span><input id="school" type="text" class="sd-Input-input-test" placeholder="${options.major?"请输入专业名称":"请输入就读学校"}"><span class="sd-Select-addon-test"></span></label><span id="results"></span></div>${options.major?'</div>':''}</div><div class="error-test"></div></div><button>预览并提交</button>`;
  if(options.title)document.querySelector('.title-test > span')!.textContent=options.title;
  if(options.tooltip && !options.major){
    const dropdown=document.querySelector('[class*=sd-Dropdown-container]')!;
    const tooltip=document.createElement('div');tooltip.className='sd-Tooltip-container-observed w-full-observed';
    dropdown.replaceWith(tooltip);tooltip.append(dropdown);
  }
  const display=document.querySelector<HTMLElement>('[class*=Input-display-value]')!;
  const results=document.querySelector<HTMLElement>('#results')!;
  const error=document.querySelector<HTMLElement>('.error-test')!;
  if(options.validation)error.textContent='必填项未填写';
  const page=observeApplicationPage();const field=page.fields[0]!;
  const route=resolveControlAdapter(evidenceForField(page,field));expect(route.code).toBe(MOKA_SEARCH_SELECT);
  const instruction={fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,selector:field.selector,expectedLabel:field.label,type:field.type,value:expected,applicationUrl:page.url,controlAdapter:route.diagnostic};
  let polls=0;let searched=false;let clickedResult=false;
  vi.stubGlobal('chrome',{scripting:{executeScript:vi.fn(async({func,args=[]})=>[{result:await func(...args)}])}});
  const school=()=>document.querySelector<HTMLInputElement>('input')!;
  document.querySelector('label')!.addEventListener('click',()=>{
    if(!options.wrongFocus)school().focus();
    if(options.staleUrl)vi.stubGlobal('location',new URL('https://app.mokahr.com/campus-recruitment/other/1#/job/other/apply'));
  });
  document.querySelector('.title-test')!.addEventListener('click',()=>{error.textContent='';results.innerHTML='';});
  const clickPoint=vi.fn(async(point:{x:number;y:number})=>{(document.elementFromPoint(point.x,point.y) as HTMLElement)?.click();});
  const typeQuery=vi.fn(async(text:string)=>{
    expect(document.activeElement).toBe(school());
    // Trusted browser text entry is the only mocked input boundary.
    school().value=text;school().dispatchEvent(new Event('input',{bubbles:true}));searched=true;
    results.innerHTML='<div class="sd-Dropdown-dropdown-test"><div class="sd-Empty-empty-wrapper-test">暂无选项</div><div class="custom-option-test">没有找到学校？<button>添加学校全称</button></div></div>';
    if(options.pendingWithoutEmptyMessage)results.innerHTML='<div class="sd-Dropdown-dropdown-test"><div class="sd-Select-menu-test"></div></div>';
    if(options.unsupportedResults)results.innerHTML='<div class="sd-Dropdown-dropdown-test"><div role="tree"><div role="treeitem">测试大学</div></div></div>';
  });
  const wait=vi.fn(async()=>{
    if(!searched||clickedResult||options.noResults||options.unsupportedResults||++polls<3)return;
    const names=options.duplicates?[expected,expected]:[expected,'相似测试学院'];
    results.innerHTML=`<div class="sd-Dropdown-dropdown-test"><div class="sd-Select-menu-test">${names.map((name,index)=>`<div class="sd-Menu-container-test"><div class="sd-Menu-content-item-test" data-y="${100+index*30}"><div>${name}</div><div class="sd-Menu-sub-title-test"><span class="option-sub-title-test">${options.bilingual?"Test University":""}</span></div></div></div>`).join('')}<div class="custom-option-test"><button>添加学校全称</button></div></div></div>`;
    if(options.movingResults)for(const item of results.querySelectorAll<HTMLElement>('[data-y]'))item.dataset.y=String(Number(item.dataset.y)+Math.min(polls,6)*3);
    for(const item of results.querySelectorAll<HTMLElement>('[class*=Menu-content-item]'))item.addEventListener('click',()=>{
      clickedResult=true;
      if(options.noCommit){results.innerHTML='';return;}
      display.textContent=options.bilingual?`${item.firstElementChild?.textContent} / Test University`:item.textContent;
      const replacement=school().cloneNode() as HTMLInputElement;replacement.id='school-rebuilt';replacement.placeholder='';replacement.value='';school().replaceWith(replacement);results.innerHTML='';
    });
  });
  return {field,route,instruction,school,display,results,error,clickPoint,typeQuery,wait,
    run:()=>executeMokaSearchSelectDriver({tabId:7,instruction,prepareSurface:async()=>{},clickPoint,typeQuery,wait})};
}

describe('Moka input-driven school search protocol',()=>{
  it.each(['专业名称', '学校名称', '自定义查询项'])('uses observed query structure with the Qianli Tooltip wrapper regardless of title: %s', async title => {
    const test=harness({title,tooltip:true,validation:true});
    const before=withFieldInformationRequirements(observeApplicationPage()).fields[0]!;
    expect(candidateInformationRequestForField(before)).toMatchObject({inputKind:'search',type:'search',options:[],stableFieldKey:before.stableFieldKey});
    test.school().value=expected;
    expect(observeApplicationPage().fields[0]?.currentValue).toBe('');
    test.school().value='';
    const result=await test.run();
    expect(result.success).toBe(true);expect(test.typeQuery).toHaveBeenCalledOnce();
    expect(test.display.textContent).toBe(expected);expect(test.error.textContent).toBe('');
    expect(observeApplicationPage().fields[0]?.currentValue).toBe(expected);
  });

  it('does not ask for a query when its field contains another editable input',()=>{
    harness();document.querySelector('.ctrl-test')!.insertAdjacentHTML('beforeend','<input type="text" class="unknown-sibling">');
    const page=withFieldInformationRequirements(observeApplicationPage());
    const field=page.fields.find(f=>f.selector==='#school')!;
    expect(resolveControlAdapter(evidenceForField(page,field)).code).not.toBe(MOKA_SEARCH_SELECT);
    expect(field.optionSource).toBeUndefined();
    expect(candidateInformationRequestForField(field)).toBeNull();
    expect(()=>candidateInformationRequestForField({...field,required:true,currentValue:''})).toThrow('未能确定招聘页面控件');
  });
  it('keeps an uncommitted query out of page readback and asks for the full school name as text',()=>{
    const test=harness();test.school().value=expected;
    const page=withFieldInformationRequirements(observeApplicationPage());
    const field=page.fields[0]!;
    expect(field.currentValue).toBe('');
    const request=candidateInformationRequestForField(field)!;
    expect(request).toMatchObject({type:'search',controlKind:'native',options:[],stableFieldKey:test.field.stableFieldKey});
    expect(request.question).toContain('完整学校名称');
    expect(authoritativeCandidateFactForField(field,{[`job.requiredField.stable:${field.stableFieldKey}`]:expected})?.value).toBe(expected);
    test.display.textContent=expected;
    expect(withFieldInformationRequirements(observeApplicationPage()).fields[0]?.currentValue).toBe(expected);
  });
  it('requests a query without opening an empty school dropdown, and does not carry that contract to another site',async()=>{
    harness();const page=withFieldInformationRequirements(observeApplicationPage());
    const observe=vi.fn(async()=>page),dispatch=vi.fn();
    const discover=production('withDiscoveredRequiredFieldOptions',{
      fieldInformationRequirement,stableApplicationObservation:observe,dispatchControlInstruction:dispatch
    });
    expect(await discover(7,page.fields)).toEqual(page.fields);
    expect(observe).not.toHaveBeenCalled();expect(dispatch).not.toHaveBeenCalled();
    const other=withFieldInformationRequirements({...page,url:'https://careers.example.com/apply'});
    expect(other.fields[0]?.optionSource).toBeUndefined();
    expect(() => candidateInformationRequestForField(other.fields[0]!)).toThrow('未能确定招聘页面控件');
  });
  it.each([false,true])('production dispatch sends one trusted query to the bound tab and releases its connection (missing results: %s)',async noResults=>{
    const test=harness({noResults});
    const attach=vi.fn(async()=>{}),detach=vi.fn(async()=>{}),release=vi.fn(async()=>{});
    const sendCommand=vi.fn(async(target,method,params)=>{
      expect(target).toEqual({tabId:7});
      if(method==='Input.insertText')await test.typeQuery(params.text);
    });
    Object.assign(chrome,{debugger:{attach,detach,sendCommand}});
    const flat=vi.fn();
    const execute=production('executeMokaSharedSelectInstruction',{
      executeMokaSearchSelectDriver,executeMokaSharedSelectDriver:flat,
      prepareFocusEmulatedTrustedPointerSurface:async()=>{},releaseTrustedPointerSurface:release,
      dispatchTrustedPointerClick:async(_send,point)=>test.clickPoint(point),
      setTimeout:(resolve)=>{void test.wait().then(resolve);}
    });
    const executors=production('mokaFlatSelectControlExecutors',{
      executeMokaSharedSelectInstruction:execute,executeMokaRecruitingSourceInstructionWithTrustedFocusDriver:vi.fn()
    })(7,observeApplicationPage());
    const result=await executors[test.route.code](test.field,test.instruction);
    expect(result.success).toBe(!noResults);
    expect(result.controlAdapter.adapterCode).toBe(MOKA_SEARCH_SELECT);
    expect(result.driverDiagnostics.ledger.queryCount).toBe(1);
    expect(sendCommand).toHaveBeenCalledExactlyOnceWith({tabId:7},'Input.insertText',{text:expected});
    expect(attach).toHaveBeenCalledExactlyOnceWith({tabId:7},'1.3');
    expect(detach).toHaveBeenCalledExactlyOnceWith({tabId:7});expect(release).toHaveBeenCalledOnce();
    expect(flat).not.toHaveBeenCalled();
  });
  it('focuses, searches once, waits past the transient empty list, and selects the exact committed result',async()=>{
    const test=harness({validation:true});const result=await test.run();
    expect(result.success).toBe(true);expect(result.actual).toBe(expected);
    expect(result.popupClosed&&result.validationCleared).toBe(true);
    expect(test.school().value).toBe('');expect(test.school().placeholder).toBe('');
    expect(observeApplicationPage().fields[0]).toMatchObject({stableFieldKey:test.field.stableFieldKey,currentValue:expected});
    expect(test.typeQuery).toHaveBeenCalledExactlyOnceWith(expected);
    expect(result.diagnostics.ledger).toMatchObject({focusClickCount:1,queryCount:1,leafClickCount:1,commitClickCount:1});
  });
  it('waits for the owned result position as well as its text to settle without another query',async()=>{
    const test=harness({movingResults:true});const result=await test.run();
    expect(result.success).toBe(true);expect(result.diagnostics.ledger.queryPollCount).toBe(7);
    expect(result.diagnostics.queryStates.slice(-2).map(state=>state.point)).toEqual([{x:100,y:128},{x:100,y:128}]);
    expect(test.typeQuery).toHaveBeenCalledOnce();expect(result.diagnostics.ledger.leafClickCount).toBe(1);
  });
  it('waits for asynchronous school results even before the empty-result message has rendered',async()=>{
    const test=harness({pendingWithoutEmptyMessage:true});const result=await test.run();
    expect(result.success).toBe(true);expect(result.actual).toBe(expected);
    expect(result.diagnostics.queryStates[0]).toMatchObject({status:'unsupported_popup_structure',emptySearch:false});
    expect(result.diagnostics.ledger).toMatchObject({focusClickCount:1,queryCount:1,leafClickCount:1});
    expect(test.typeQuery).toHaveBeenCalledOnce();expect(result.popupClosed&&result.validationCleared).toBe(true);
  });
  it('never selects permanently unsupported results and retains the original bounded observation window',async()=>{
    const test=harness({unsupportedResults:true});const result=await test.run();
    expect(result.success).toBe(false);expect(result.diagnostics.failureCode).toBe('unsupported_popup_structure');
    expect(result.diagnostics.ledger).toMatchObject({focusClickCount:1,queryCount:1,queryPollCount:40,leafClickCount:0});
    expect(test.clickPoint).toHaveBeenCalledOnce();expect(test.typeQuery).toHaveBeenCalledOnce();
    expect(test.display.textContent).toBe('');expect(test.school().value).toBe(expected);
  });
  it.each(['cti','another-school-tenant'])('uses the same evidenced structure on %s, not a company branch',async tenant=>{
    vi.stubGlobal('location',new URL(`https://app.mokahr.com/campus-recruitment/${tenant}/1#/job/example/apply`));
    expect((await harness().run()).success).toBe(true);
  });
  it('does not count typed query text as a committed school or click the add-school button',async()=>{
    const test=harness({noResults:true});const result=await test.run();
    expect(result.success).toBe(false);expect(result.actual).toBe('');expect(test.school().value).toBe(expected);
    expect(result.diagnostics.failureCode).toBe('search_result_unconfirmed');expect(test.clickPoint).toHaveBeenCalledTimes(1);expect(test.typeQuery).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.ledger.queryPollCount).toBe(40);expect(result.diagnostics.queryStates).toHaveLength(12);
  });
  it('rejects duplicate exact results without a selection or another query',async()=>{
    const test=harness({duplicates:true});const result=await test.run();
    expect(result.diagnostics.failureCode).toBe('leaf_ambiguous');expect(test.clickPoint).toHaveBeenCalledTimes(1);expect(test.typeQuery).toHaveBeenCalledTimes(1);
  });
  it.each([{wrongFocus:true},{staleUrl:true}])('never types after a failed focus or changed original URL: %j',async options=>{
    const test=harness(options);expect((await test.run()).success).toBe(false);expect(test.typeQuery).not.toHaveBeenCalled();
  });
  it('does not report success when a result click fails to commit a display value',async()=>{
    const test=harness({noCommit:true});const result=await test.run();expect(result.success).toBe(false);expect(result.actual).toBe('');expect(result.diagnostics.ledger.leafClickCount).toBe(1);
  });
  it('preserves a preexisting search draft',async()=>{
    const test=harness();test.school().value='用户尚未完成的学校';expect((await test.run()).diagnostics.failureCode).toBe('unexpected_query_state');expect(test.clickPoint).not.toHaveBeenCalled();expect(test.typeQuery).not.toHaveBeenCalled();
  });
  it('accepts an already committed exact value without typing and rejects a different value',async()=>{
    const test=harness();test.display.textContent=expected;expect((await test.run()).success).toBe(true);expect(test.typeQuery).not.toHaveBeenCalled();
    test.display.textContent='另一所学校';expect((await test.run()).diagnostics.failureCode).toBe('preexisting_value_mismatch');expect(test.clickPoint).not.toHaveBeenCalled();
  });
  it('keeps query routing after relabeling but excludes actual flat Selects and native inputs',()=>{
    const test=harness();const evidence=evidenceForField({url:test.instruction.applicationUrl!},test.field);
    expect(resolveControlAdapter({...evidence,label:'学校邮箱',semanticKey:'education.school.combobox'}).code).toBe('moka.search-select.trusted-focus.v1');
    expect(resolveControlAdapter({...evidence,classNames:evidence.classNames.filter(x=>!x.includes('string_info'))}).code).toBe('moka.flat-select.trusted-focus.v1');
    expect(resolveControlAdapter({...evidence,controlKind:'native',classNames:[]}).code).toBe('generic.native.v1');
  });
});

 describe('Moka 20260908 confirmed query gaps',()=>{
  it.each([{major:true},{bilingual:true},{major:true,bilingual:true}])('selects the unique primary result with %j',async options=>{
    const test=harness(options);const result=await test.run();
    expect(result.success).toBe(true);expect(result.actual).toBe(options.bilingual?`${expected} / Test University`:expected);
    expect(result.diagnostics.ledger).toMatchObject({queryCount:1,leafClickCount:1});
    expect(observeApplicationPage().fields[0]?.stableFieldKey).toBe(test.field.stableFieldKey);
  });
  it('does not treat a professional query as a committed value',()=>{
    const test=harness({major:true});test.school().value=expected;
    const field=withFieldInformationRequirements(observeApplicationPage()).fields[0]!;
    expect(field.currentValue).toBe('');expect(field.optionSource).toBe('search');
  });
  it('rejects duplicate primary school labels even when both have subtitles',async()=>{
    const test=harness({bilingual:true,duplicates:true});const result=await test.run();
    expect(result.success).toBe(false);expect(result.diagnostics.failureCode).toBe('leaf_ambiguous');
    expect(result.diagnostics.ledger.leafClickCount).toBe(0);
  });
 });
it('keeps plain professional text on its existing native route',()=>{
 const t=harness({major:true});document.querySelector('label')!.className='sd-Input-container-test';
 const page=observeApplicationPage(),field=page.fields[0]!;
 expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe('generic.native.v1');
 expect(field.stableFieldKey).toContain('education.major.native');
 expect(field.stableFieldKey).not.toBe(t.field.stableFieldKey);
});
it('registers the legacy search and readonly code at the production dispatch boundary',async()=>{
 const execute=vi.fn(async()=>({success:true}));
 const executors=production('mokaFlatSelectControlExecutors',{
   executeMokaSharedSelectInstruction:execute,executeMokaRecruitingSourceInstructionWithTrustedFocusDriver:vi.fn()
 })(7,{});
 for(const code of ['moka.legacy-school-search.trusted-focus.v1','moka.readonly-calling-code.trusted-focus.v1']){
   await executors[code]({fieldId:'owned'},{stableFieldKey:'original',controlAdapter:{registrationId:code}});
   expect(execute).toHaveBeenLastCalledWith(7,{fieldId:'owned'},{stableFieldKey:'original',controlAdapter:{registrationId:code}},false);
 }
});
