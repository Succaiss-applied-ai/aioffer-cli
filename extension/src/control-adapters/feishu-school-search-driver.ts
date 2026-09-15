export type FeishuSchoolKind = "atsx_school" | "formily_school";
export type SchoolPoint = { x:number; y:number };
export interface FeishuSchoolProbe {
  status:string; actual:string; options:string[]; popupCount:number;
  focused:boolean; validationCleared:boolean;
  inputPoint:SchoolPoint|null; optionPoint:SchoolPoint|null; closePoint:SchoolPoint|null;
}

/** Serialized into MAIN. Only locates the registered school's query, result and label. */
export function inspectFeishuSchoolInPage(selector:string,label:string,value:string,kind:FeishuSchoolKind,
  phase:"observe"|"prepare_input"|"prepare_option"="observe",queried=false):FeishuSchoolProbe {
  const normalize=(v:unknown)=>String(v??"").replace(/\s+/gu," ").trim();
  const result:FeishuSchoolProbe={status:"control_missing",actual:"",options:[],popupCount:0,focused:false,
    validationCleared:false,inputPoint:null,optionPoint:null,closePoint:null};
  const visible=(e:Element|null):e is HTMLElement=>{
    if(!(e instanceof HTMLElement)||!e.isConnected||!e.getBoundingClientRect().width||!e.getBoundingClientRect().height)return false;
    for(let n:HTMLElement|null=e;n;n=n.parentElement){const s=getComputedStyle(n);if(n.hidden||n.getAttribute("aria-hidden")==="true"||s.display==="none"||s.visibility==="hidden"||s.opacity==="0")return false;}return true;
  };
  const point=(e:HTMLElement):SchoolPoint|null=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    if(x<0||y<0||x>=innerWidth||y>=innerHeight)return null;const hit=document.elementFromPoint(x,y);return hit&&(hit===e||e.contains(hit))?{x,y}:null;};
  let controls:Element[]=[];try{controls=[...document.querySelectorAll(selector)];}catch{return result;}
  if(controls.length!==1)return {...result,status:controls.length?"control_ambiguous":"control_missing"};
  const control=controls[0]!;
  const root=control.closest<HTMLElement>(kind==="atsx_school"?".atsx-form-item":".ud-formily-item");
  const select=control.closest<HTMLElement>(kind==="atsx_school"?".atsx-select-combobox":".ud__select");
  const input=kind==="atsx_school"?control.querySelector<HTMLInputElement>("input.atsx-select-search__field"):control;
  if(!root||!select||!visible(control)||!(input instanceof HTMLInputElement)||!visible(input)||input.disabled||input.readOnly)return result;
  if(kind==="atsx_school"&&(!control.matches("div.atsx-select-selection--single[role='combobox']")||
    !root.getAttribute("data-cy")))return result;
  if(kind==="formily_school"&&(!input.matches("input.ud__native-input[data-form-field-name]")||
    !input.closest(".ud__input")||select.querySelector(".ud__select__selector")||input.hasAttribute("role")))return result;
  if(select.querySelectorAll("input").length!==1)return {...result,status:"control_ambiguous"};
  const title=root.querySelector<HTMLElement>(kind==="atsx_school"?".atsx-form-item-label > label":".ud-formily-item-label-content");
  const local=normalize(title?.querySelector(".customResumeForm-fieldName")?.textContent||title?.textContent).replace(/[＊*]/gu,"").trim();
  if(local!==normalize(label).split("·").at(-1)?.trim())return {...result,status:"field_identity_mismatch"};
  if(phase==="prepare_input")input.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});
  result.inputPoint=point(input);result.closePoint=visible(title)?point(title):null;
  result.actual=normalize(input.value);result.focused=document.activeElement===input;
  result.validationCleared=!root.querySelector("[aria-invalid='true']")&&![...root.querySelectorAll<HTMLElement>(".atsx-form-explain,.ud-formily-item-error-help")]
    .some(e=>visible(e)&&normalize(e.textContent));
  const popups=[...document.querySelectorAll<HTMLElement>(kind==="atsx_school"?".atsx-select-dropdown":".ud__select__dropdown")].filter(visible);
  result.popupCount=popups.length;
  if(!popups.length)return {...result,status:"popup_closed"};
  if(popups.length!==1)return {...result,status:"popup_ambiguous"};
  const popup=popups[0]!;
  if(!queried||!result.focused)return {...result,status:"popup_owner_unproven"};
  if(kind==="atsx_school"){
    const id=control.getAttribute("aria-controls");const linked=id?[...document.querySelectorAll("[id]")].filter(e=>e.id===id):[];
    if(linked.length!==1||!popup.contains(linked[0]!)||control.getAttribute("aria-expanded")!=="true")return {...result,status:"popup_owner_unproven"};
  }else{
    const a=select.getBoundingClientRect(),b=popup.getBoundingClientRect();
    if(!select.classList.contains("ud__select--focus")||document.querySelectorAll(".ud__select--focus").length!==1||
      Math.abs(a.left-b.left)>2||Math.abs(a.width-b.width)>2||Math.min(Math.abs(a.bottom-b.top),Math.abs(a.top-b.bottom))>8)return {...result,status:"popup_owner_unproven"};
  }
  if(popup.querySelector("[role='tree'],[role='grid'],[class*='cascader'],[class*='picker-panel']"))return {...result,status:"unsupported_popup_structure"};
  const items=[...popup.querySelectorAll<HTMLElement>(kind==="atsx_school"?"ul[role='listbox'] > li[role='option']":".ud__select__list__item")]
    .filter(visible).filter(e=>!e.matches("[disabled],[aria-disabled='true'],[class*='disabled']"));
  const text=(e:HTMLElement)=>normalize(e.querySelector(kind==="atsx_school"?".atsx-clamp-content[data-cy-value]":".ud__select__list__item__content")?.textContent||e.textContent);
  result.options=items.map(text).filter(Boolean);
  const matched=items.filter(e=>text(e)===normalize(value));
  if(matched.length!==1)return {...result,status:matched.length?"option_ambiguous":"option_unavailable"};
  if(phase==="prepare_option")matched[0]!.scrollIntoView({behavior:"instant",block:"nearest",inline:"nearest"});
  result.optionPoint=point(matched[0]!);return {...result,status:result.optionPoint?"ready":"option_not_clickable"};
}

export interface FeishuSchoolIO {
  inspect(phase:"observe"|"prepare_input"|"prepare_option",queried:boolean):Promise<FeishuSchoolProbe|null>;
  prepareSurface():Promise<void>;click(point:SchoolPoint):Promise<void>;typeQuery(value:string,expectedExisting?:string):Promise<void>;wait(ms:number):Promise<void>;
}
export async function executeFeishuSchoolSearch(io:FeishuSchoolIO,value:string,allowReplaceClosedValue=false){
  const ledger={focus:0,query:0,select:0,close:0,retry:0};let state=await io.inspect("observe",false);
  const finish=(success:boolean,status:string)=>({success,status,actual:state?.actual??"",options:state?.options??[],
    validationCleared:state?.validationCleared??false,popupClosed:state?.popupCount===0,ledger});
  if(!value.trim())return finish(false,"query_fact_missing");
  if(!state||state.status!=="popup_closed")return finish(false,state?.status??"control_missing");
  // These controls expose the query itself. A pre-existing string cannot prove a selection.
  const originalValue=state.actual;
  if(originalValue&&(!allowReplaceClosedValue||state.focused))return finish(false,"existing_query_or_value_unverified");
  await io.prepareSurface();state=await io.inspect("prepare_input",false);
  if(!state?.inputPoint||state.actual!==originalValue||state.popupCount!==0)return finish(false,"query_input_not_ready");
  await io.click(state.inputPoint);ledger.focus++;
  state=await io.inspect("observe",true);
  if(!state?.focused||state.actual!==originalValue)return finish(false,"query_input_not_focused");
  if(originalValue)await io.typeQuery(value,originalValue);else await io.typeQuery(value);
  ledger.query++;
  for(let i=0;i<30;i++){await io.wait(100);state=await io.inspect("observe",true);
    if(state?.status==="ready")break;
    if(state&&["control_missing","control_ambiguous","field_identity_mismatch","popup_ambiguous","option_ambiguous"].includes(state.status))return finish(false,state.status);
  }
  state=await io.inspect("prepare_option",true);
  if(state?.status!=="ready"||!state.optionPoint||state.actual!==value)return finish(false,state?.status??"query_timeout");
  await io.click(state.optionPoint);ledger.select++;
  await io.wait(100);state=await io.inspect("observe",true);
  if(!state?.closePoint)return finish(false,"commit_target_missing");
  await io.click(state.closePoint);ledger.close++;
  let stable=0;
  for(let i=0;i<15;i++){await io.wait(100);state=await io.inspect("observe",false);
    if(state?.status==="popup_closed"&&!state.focused&&state.actual===value&&state.validationCleared){if(++stable>=2)return finish(true,"committed");}else stable=0;
  }
  return finish(false,state?.validationCleared?"commit_readback_mismatch":"validation_not_cleared");
}
