// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://lanhevip.jobs.feishu.cn/201093/resume/7655308466768070962/apply"}
import {beforeEach,it,expect,vi} from "vitest";
import {executeFeishuMultiSelect,inspectFeishuMultiInPage,type FeishuMultiProbe} from "./feishu-multi-select-driver.js";
import {observeApplicationPageWithFieldDialects} from "../form-dialects/application-field-dialects.js";
import {evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
const values=["🚀发展空间（内部创业）","​🤝扁平化（不叫哥、姐、总）"];
beforeEach(()=>{
  vi.restoreAllMocks();document.body.innerHTML="";
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({x:20,y:100,left:20,top:100,right:620,bottom:140,width:600,height:40,toJSON(){}});
});
it("isolates multiple-selector routing from readonly flat selects and scalar fields",()=>{
  document.body.innerHTML=`<form><div class="ud-formily-item" data-form-field-id="7547670991724988714"><div class="ud-formily-item-label"><span class="ud-formily-item-label-content">团队氛围</span></div><div class="ud__select"><div class="ud__select__selector ud__select__selector-multiple"><span class="ud__tag ud__select__selector__tag"><div class="ud__tag__content">${values[1]}</div><span class="ud__tag__close-icon"><svg></svg></span></span><input id="multi" class="ud__select__selector__search__input" type="search" role="combobox"></div></div></div><button>提交简历</button></form>`;
  let page=observeApplicationPageWithFieldDialects(),field=page.fields[0]!;
  expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("feishu.formily-multi-select.trusted-pointer.v1");
  expect(JSON.parse(field.currentValue)).toEqual([values[1]]);
  document.querySelector(".ud__select__selector-multiple")!.classList.remove("ud__select__selector-multiple");
  document.querySelector<HTMLInputElement>("#multi")!.readOnly=true;
  page=observeApplicationPageWithFieldDialects();field=page.fields[0]!;
  expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("feishu.formily-flat-select.trusted-pointer.v1");
});
function runner(config:{initial?:string[];options?:string[];partial?:boolean;error?:boolean}={}){
  let open=false,selected=[...(config.initial??[])];const events:string[]=[];
  return {events,io:{prepareSurface:vi.fn(async()=>{}),wait:vi.fn(async()=>{}),
    click:vi.fn(async(p:{x:number;y:number})=>{if(p.x===1){open=true;events.push("open");}else if(p.x===2){open=false;events.push("close");}else{if(!config.partial)selected.push(values[p.y]!);events.push(`select:${p.y}`);}}),
    inspect:vi.fn(async(value:string):Promise<FeishuMultiProbe>=>({status:open?"ready":"popup_closed",selected:[...selected],options:open?config.options??values:[],popupCount:open?1:0,validationCleared:!config.error,
      controlPoint:{x:1,y:1},closePoint:{x:2,y:2},optionPoint:{x:3,y:values.indexOf(value)}}))}};
}
it("preflights the complete set and selects each missing exact option once",async()=>{
  const r=runner();expect(await executeFeishuMultiSelect(r.io,values)).toMatchObject({success:true,selected:values,ledger:{open:1,select:2,close:1,retry:0}});
  expect(r.events).toEqual(["open","select:0","select:1","close"]);
  const same=runner({initial:values});expect(await executeFeishuMultiSelect(same.io,values)).toMatchObject({success:true,ledger:{open:0,select:0}});
  const subset=runner({initial:[values[0]!]});expect(await executeFeishuMultiSelect(subset.io,values)).toMatchObject({success:true,ledger:{select:1}});
});
it("does not remove unknown existing tags or start a partial fill when any target is absent",async()=>{
  const conflict=runner({initial:["另一个偏好"]});expect(await executeFeishuMultiSelect(conflict.io,values)).toMatchObject({success:false,status:"existing_selection_conflict",ledger:{open:0,select:0}});
  for(const options of [[values[0]!],[values[0]!,values[1]!,values[1]!]]){const r=runner({options});expect(await executeFeishuMultiSelect(r.io,values)).toMatchObject({success:false,ledger:{select:0}});}
  const partial=runner({partial:true});expect(await executeFeishuMultiSelect(partial.io,values)).toMatchObject({success:false,status:"partial_selection_unconfirmed",ledger:{select:1,retry:0}});
  const invalid=runner({error:true});expect((await executeFeishuMultiSelect(invalid.io,values)).success).toBe(false);
});
it("discovers options without changing the current complete selection",async()=>{
  const r=runner({initial:[values[0]!]});expect(await executeFeishuMultiSelect(r.io,[],true)).toMatchObject({success:true,selected:[values[0]],options:values,ledger:{open:1,select:0,close:1}});
});

it("reads actual committed tag content and only its focused, anchored popup",()=>{
  document.body.innerHTML=`<div class="ud-formily-item"><div class="ud-formily-item-label-content">团队氛围</div><div class="ud__select"><div class="ud__select__selector ud__select__selector-multiple ud__select__selector-open"><span class="ud__tag ud__select__selector__tag"><div class="ud__tag__content">${values[1]}</div><span class="ud__tag__close-icon">×</span></span><input id="multi" type="search" role="combobox" class="ud__select__selector__search__input"></div></div></div><div class="ud__select__dropdown"><div class="ud__select__list__item"><span class="ud__select__list__item__content">${values[0]}</span></div></div>`;
  const input=document.querySelector<HTMLInputElement>("#multi")!,popup=document.querySelector<HTMLElement>(".ud__select__dropdown")!;
  Object.defineProperty(popup,"getBoundingClientRect",{configurable:true,value:()=>({x:20,y:144,left:20,top:144,right:620,bottom:240,width:600,height:96,toJSON(){}})});
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>document.querySelector(".ud__select__list__item")});
  input.focus();
  expect(inspectFeishuMultiInPage("#multi","团队氛围",values[0]!,"observe",true)).toMatchObject({status:"ready",selected:[values[1]],options:[values[0]],validationCleared:true});
  expect(inspectFeishuMultiInPage("#multi","团队氛围",values[0]!,"observe",false).status).toBe("popup_owner_unproven");
  popup.remove();
  expect(inspectFeishuMultiInPage("#multi","团队氛围","", "observe",false)).toMatchObject({status:"popup_closed",selected:[values[1]]});
});

it.each([false,true])("uses a proven Escape close while retaining the complete selected set; stuck=%s",async stuck=>{
  const r=runner(),base=r.io.inspect;
  r.io.inspect=vi.fn(async(...args:Parameters<typeof base>)=>({...await base(...args),closePoint:null,closeWithEscape:true}));
  const escape=vi.fn(async()=>{if(!stuck)await r.io.click({x:2,y:2});});
  const result=await executeFeishuMultiSelect({...r.io,escape},values);
  expect(result).toMatchObject({success:!stuck,selected:values,ledger:{open:1,select:2,close:1,retry:0}});
  expect(escape).toHaveBeenCalledTimes(1);
  if(stuck)expect(result.status).toBe("selection_readback_mismatch");
});
it("does not send Escape without the owned upward-popup proof",async()=>{
  const r=runner(),base=r.io.inspect,escape=vi.fn();
  r.io.inspect=vi.fn(async(...args:Parameters<typeof base>)=>({...await base(...args),closePoint:null}));
  expect(await executeFeishuMultiSelect({...r.io,escape},values)).toMatchObject({success:false,status:"close_target_missing"});
  expect(escape).not.toHaveBeenCalled();
});
it("offers Escape for an owned upward flat menu, never a foreign menu or unproven focus",()=>{
  document.body.innerHTML=`<div class="ud-formily-item"><div class="ud-formily-item-label-content">任意标题</div><div class="ud__select"><div class="ud__select__selector ud__select__selector-multiple ud__select__selector-open"><input id="multi" type="search" role="combobox" class="ud__select__selector__search__input"></div></div></div><div class="ud__select__dropdown"><div class="ud__select__list__item">选项</div></div>`;
  const input=document.querySelector<HTMLInputElement>("#multi")!,popup=document.querySelector<HTMLElement>(".ud__select__dropdown")!;
  Object.defineProperty(popup,"getBoundingClientRect",{configurable:true,value:vi.fn(()=>({x:20,y:20,left:20,top:20,right:620,bottom:96,width:600,height:76,toJSON(){}}))});
  Object.defineProperty(document.querySelector(".ud-formily-item-label-content"),"getBoundingClientRect",{configurable:true,value:()=>({x:20,y:70,left:20,top:70,right:220,bottom:95,width:200,height:25,toJSON(){}})});
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>popup.querySelector(".ud__select__list__item")});
  input.focus();expect(inspectFeishuMultiInPage("#multi","任意标题","","observe",true)).toMatchObject({status:"ready",closePoint:null,closeWithEscape:true});
  expect(inspectFeishuMultiInPage("#multi","任意标题","","observe",false).closeWithEscape).toBeUndefined();
  input.blur();expect(inspectFeishuMultiInPage("#multi","任意标题","","observe",true).closeWithEscape).toBeUndefined();
  input.focus();document.body.insertAdjacentHTML("beforeend",'<div class="ud__select__dropdown">其他弹层</div>');
  expect(inspectFeishuMultiInPage("#multi","任意标题","","observe",true).closeWithEscape).toBeUndefined();
});
