// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { executeFeishuSelectorSearch, inspectFeishuSelectorSearchInPage, type SelectorSearchProbe } from "./feishu-selector-search-driver.js";

beforeEach(()=>{
  vi.restoreAllMocks();document.body.innerHTML="";
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
    const top=this.matches(".ud__select__dropdown")?144:100;
    return {x:20,y:top,left:20,top,right:620,bottom:top+40,width:600,height:40,toJSON(){}};
  });
  HTMLElement.prototype.scrollIntoView=vi.fn();
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>document.querySelector("[data-hit]")});
});
function fixture(options=["中国","中国香港","中国澳门"], tree=false, multiple=false) {
  document.body.innerHTML=`<div class="ud-formily-item" data-form-field-name="${multiple?'preferred_city_list':'nationality'}"><div class="ud-formily-item-label-content">国籍</div><div class="ud__select"><div class="ud__select__selector ud__select__selector-open ${multiple?'ud__select__selector-multiple':''}"><input id="query" type="search" role="combobox" class="ud__select__selector__search__input" value="中国"></div></div></div><div class="ud__select__dropdown"><div class="${tree?'ud__treeSelect__overlay':'ud__select__list'}">${options.map((v,i)=>tree?`<div class="ud__tree__node"><div class="ud__tree__node__label" ${i===0?'data-hit':''}>${v}</div></div>`:`<div class="ud__select__list__item" ${i===0?'data-hit':''}><span class="ud__select__list__item__content">${v}</span></div>`).join('')}</div></div>`;
  document.querySelector<HTMLInputElement>("#query")!.focus();
}
it("distinguishes selected display from query text and exactly matches China",()=>{
  fixture();
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",false,"observe",true)).toMatchObject({status:"ready",query:"中国",selected:[],options:["中国","中国香港","中国澳门"]});
  document.querySelector(".ud__select__dropdown")!.remove();
  document.querySelector<HTMLInputElement>("#query")!.blur();
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",false)).toMatchObject({status:"popup_closed",query:"中国",selected:[]});
  document.querySelector(".ud__select__selector")!.insertAdjacentHTML("afterbegin",'<div class="ud__select__selector__selectItem">中国</div>');
  document.querySelector<HTMLInputElement>("#query")!.value="";
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",false)).toMatchObject({selected:["中国"],query:"",validationCleared:true});
});
it.each([["中国香港","中国澳门"],["中国","中国"]])("rejects missing or duplicate exact search options: %j",(...options)=>{
  fixture(options);
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",false,"observe",true).status).toBe(options[0]==="中国"?"option_ambiguous":"option_unavailable");
});
it("accepts the evidenced tree label, preserving suffixes instead of conflating cities",()=>{
  fixture(["深圳","深圳市"],true);
  document.querySelector<HTMLInputElement>("#query")!.value="深圳";
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","深圳",false,"observe",true)).toMatchObject({status:"ready",options:["深圳","深圳市"]});
});
it("does not conflate punctuation in exact query results",()=>{
  fixture(["广州（研发）","广州(研发)"]);
  document.querySelector<HTMLInputElement>("#query")!.value="广州（研发）";
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","广州（研发）",false,"observe",true)).toMatchObject({status:"ready",options:["广州（研发）","广州(研发)"]});
});
it.each(["readonly","label","foreign popup","unowned","tree mix","disabled option","query changed"])("fails closed for %s",scenario=>{
  fixture();
  const input=document.querySelector<HTMLInputElement>("#query")!;
  if(scenario==="readonly")input.readOnly=true;
  if(scenario==="label")document.querySelector(".ud-formily-item-label-content")!.textContent="他人信息";
  if(scenario==="foreign popup")document.body.insertAdjacentHTML("beforeend",'<div class="ud__select__dropdown"></div>');
  if(scenario==="tree mix")document.querySelector(".ud__select__dropdown")!.insertAdjacentHTML("beforeend",'<div class="ud__treeSelect__overlay"></div>');
  if(scenario==="disabled option")document.querySelector("[data-hit]")!.setAttribute("aria-disabled","true");
  if(scenario==="query changed")input.value="中国香港";
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",false,"observe",scenario!=="unowned").status).not.toBe("ready");
});
it("reads tags from the bound tree independently of its field name",()=>{
  fixture(["中国"],true,true);
  document.querySelector(".ud__select__selector")!.insertAdjacentHTML("afterbegin",'<span class="ud__select__selector__tag"><span class="ud__tag__content">广州</span></span>');
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",true,"observe",true)).toMatchObject({status:"ready",selected:["广州"]});
  document.querySelector(".ud-formily-item")!.setAttribute("data-form-field-name","other");
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",true,"observe",true).status).toBe("ready");
  document.querySelector(".ud__treeSelect__overlay")!.className="unknown-tree";
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国",true,"observe",true).status).toBe("unsupported_popup_structure");
});
it.each([false,true])("focuses the owned selector when its display overlays the input: multiple=%s",multiple=>{
  fixture(["中国"],false,multiple);
  document.querySelector(".ud__select__dropdown")!.remove();
  const input=document.querySelector<HTMLInputElement>("#query")!;
  input.blur();input.value="";input.style.pointerEvents="none";
  const trigger=document.querySelector(".ud__select__selector")!;
  trigger.classList.remove("ud__select__selector-open");
  trigger.insertAdjacentHTML("afterbegin",'<div class="ud__select__selector__selectItem" data-hit>中国</div>');
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国香港",multiple,"prepare_input")).toMatchObject({status:"popup_closed",inputPoint:{x:320,y:120},query:""});
  const unrelated=document.createElement("div");unrelated.setAttribute("data-hit","");document.body.prepend(unrelated);
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","中国香港",multiple,"prepare_input").inputPoint).toBeNull();
});

function harness(config:{missing?:boolean;duplicate?:boolean;uncommitted?:boolean;invalid?:boolean;minimum?:number;selected?:string[];oldQuery?:string;multiple?:boolean}={}) {
  let selected=[...(config.selected??[])],query=config.oldQuery??"",focused=false,open=false;
  const events:string[]=[],typed:string[]=[];
  return {events,typed,io:{
    prepareSurface:vi.fn(async()=>{}),wait:vi.fn(async()=>{}),
    typeQuery:vi.fn(async(value:string)=>{query=value;typed.push(value);events.push("query");}),
    click:vi.fn(async(p:{x:number;y:number})=>{
      if(p.x===1){focused=true;open=true;events.push("focus");}
      if(p.x===2){if(!config.uncommitted){selected=config.multiple?[...selected,query]:[query];query="";}events.push("select");}
      if(p.x===3){open=false;focused=false;events.push("close");}
    }),
    inspect:vi.fn(async(_value:string):Promise<SelectorSearchProbe>=>({status:!open?"popup_closed":config.duplicate?"option_ambiguous":config.missing?"option_unavailable":"ready",
      selected:[...selected],query,focused,popupCount:open?1:0,options:open?(config.missing?["中国香港","中国澳门"]:[query]):[],
      validationCleared:!config.invalid&&selected.length>=(config.minimum??0),inputPoint:{x:1,y:1},optionPoint:{x:2,y:2},closePoint:{x:3,y:3}}))
  }};
}
it("makes one complete query then one exact selection and stable committed readback",async()=>{
  const h=harness();expect(await executeFeishuSelectorSearch(h.io,["中国"])).toMatchObject({success:true,actual:"中国",ledger:{query:1,select:1,close:1,retry:0}});
  expect(h.events).toEqual(["focus","query","select","close"]);expect(h.typed).toEqual(["中国"]);
});
it.each([{missing:true},{duplicate:true},{uncommitted:true},{invalid:true}])("does not retry or mistake query text for success: %j",async config=>{
  const h=harness(config);expect(await executeFeishuSelectorSearch(h.io,["中国"])).toMatchObject({success:false,ledger:{query:1,retry:0}});expect(h.typed).toEqual(["中国"]);
});
it("returns actual live options after an unavailable exact query",async()=>{
  const h=harness({missing:true});expect(await executeFeishuSelectorSearch(h.io,["中国"])).toMatchObject({success:false,status:"option_unavailable",options:["中国香港","中国澳门"],ledger:{select:0}});
});
it("does not normalize or rerun the user's city query",async()=>{
  const h=harness({missing:true});await executeFeishuSelectorSearch(h.io,["深圳市"]);expect(h.typed).toEqual(["深圳市"]);
});
it("preserves existing selected cities while adding each missing target once",async()=>{
  const h=harness({selected:["上海"],multiple:true});
  expect(await executeFeishuSelectorSearch(h.io,["上海","广州","深圳"],true)).toMatchObject({success:true,selected:["上海","广州","深圳"],ledger:{query:2,select:2,retry:0}});
  expect(h.typed).toEqual(["广州","深圳"]);
});
it("checks validation after the complete requested set, preserving intermediate selected tags",async()=>{
  const h=harness({multiple:true,minimum:2});
  expect(await executeFeishuSelectorSearch(h.io,["广州","深圳"],true)).toMatchObject({success:true,validationCleared:true,ledger:{query:2,select:2}});
});
it("will not remove old city selections or adopt an uncommitted query",async()=>{
  for(const config of [{selected:["上海"],multiple:true},{oldQuery:"中国香港"}]){
    const h=harness(config);expect(await executeFeishuSelectorSearch(h.io,["中国"],Boolean(config.multiple))).toMatchObject({success:false,ledger:{query:0,select:0}});
  }
});
it("keeps a committed exact value without typing or reopening",async()=>{
  const h=harness({selected:["中国"]});expect(await executeFeishuSelectorSearch(h.io,["中国"])).toMatchObject({success:true,status:"already_committed",ledger:{focus:0,query:0,select:0}});
});

it("removes only extra tags after committing the explicitly preferred location",async()=>{
  const h=harness({selected:["上海"],multiple:true});
  const originalInspect=h.io.inspect, originalClick=h.io.click;
  let removed=false;
  h.io.inspect=vi.fn(async(value:string,phase?:string)=>{
    const probe=await originalInspect(value);
    if(removed)probe.selected=probe.selected.filter(v=>v!=="上海");
    return phase==="prepare_remove"?{...probe,status:"remove_ready",removePoint:{x:4,y:4}}:probe;
  });
  h.io.click=vi.fn(async p=>{if(p.x===4){removed=true;h.events.push("remove:上海");}else await originalClick(p);});
  expect(await executeFeishuSelectorSearch(h.io,["广州"],true,{retainOnlyTargets:true})).toMatchObject({success:true,selected:["广州"]});
  expect(h.events).toEqual(["focus","query","select","close","remove:上海"]);
});
it("keeps existing tags when the preferred option cannot be found",async()=>{
  const h=harness({selected:["上海"],multiple:true,missing:true});
  expect(await executeFeishuSelectorSearch(h.io,["广州"],true,{retainOnlyTargets:true})).toMatchObject({success:false,selected:["上海"],ledger:{select:0}});
  expect(h.events).not.toContain("remove:上海");
});
it.each([true,false])("verifies an existing hierarchical tag against its searched checked row: %s",async checked=>{
  const h=harness({selected:["广州"],multiple:true});
  const inspect=h.io.inspect,click=h.io.click;
  let blurred=false;
  h.io.inspect=vi.fn(async value=>({...await inspect(value),...(blurred?{query:""}:{}),optionSelected:checked}));
  h.io.click=vi.fn(async p=>{if(p.x===3)blurred=true;await click(p);});
  const result=await executeFeishuSelectorSearch(h.io,["广州"],true,{verifyExisting:["广州"]});
  expect(result.success).toBe(checked);
  expect(result.selected).toEqual(["广州"]);
  expect(result.ledger.select).toBe(0);
  expect(h.typed).toEqual(["广州"]);
  if(!checked)expect(result.status).toBe("existing_selection_path_mismatch");
});
it("locates a tag close icon only inside the original bound field",()=>{
  fixture([],true,true);
  document.querySelector(".ud__select__dropdown")!.remove();
  const input=document.querySelector<HTMLInputElement>("#query")!;input.value="";input.blur();
  document.querySelector(".ud__select__selector")!.insertAdjacentHTML("beforeend",'<span class="ud__select__selector__tag"><span class="ud__tag__content">上海</span><span class="ud__tag__close-icon" data-hit></span></span>');
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","上海",true,"prepare_remove")).toMatchObject({status:"remove_ready",selected:["上海"]});
  document.querySelector(".ud__select__selector__tag")!.remove();
  document.body.insertAdjacentHTML("beforeend",'<span class="ud__select__selector__tag"><span class="ud__tag__content">上海</span><span class="ud__tag__close-icon" data-hit></span></span>');
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","上海",true,"prepare_remove").status).toBe("remove_target_ambiguous");
});

it("allows classification Escape only for the owned upward popup covering its title",()=>{
  fixture();const input=document.querySelector<HTMLInputElement>("#query")!;input.value="";
  const popup=document.querySelector<HTMLElement>(".ud__select__dropdown")!;
  Object.defineProperty(popup,"getBoundingClientRect",{configurable:true,value:vi.fn(()=>({x:20,y:20,left:20,top:20,right:620,bottom:96,width:600,height:76,toJSON(){}}))});
  Object.defineProperty(document.querySelector(".ud-formily-item-label-content"),"getBoundingClientRect",{configurable:true,value:()=>({x:20,y:70,left:20,top:70,right:220,bottom:95,width:200,height:25,toJSON(){}})});
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","",false,"observe",true,null,true)).toMatchObject({status:"classified",closePoint:null,closeWithEscape:true});
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","",false,"observe",false,null,true).closeWithEscape).toBeUndefined();
  input.blur();expect(inspectFeishuSelectorSearchInPage("#query","国籍","",false,"observe",true,null,true).closeWithEscape).toBeUndefined();
  input.focus();vi.mocked(popup.getBoundingClientRect).mockReturnValue({x:20,y:144,left:20,top:144,right:620,bottom:240,width:600,height:96,toJSON(){}});
  expect(inspectFeishuSelectorSearchInPage("#query","国籍","",false,"observe",true,null,true).closeWithEscape).toBeUndefined();
});
