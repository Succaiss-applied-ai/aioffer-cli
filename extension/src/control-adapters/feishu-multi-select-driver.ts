import {decodeExactOptionSet,exactOptionSetsMatch} from "../form-dialects/feishu-option-set.js";
export interface FeishuMultiProbe {
  status:string;selected:string[];options:string[];popupCount:number;validationCleared:boolean;
  controlPoint:{x:number;y:number}|null;optionPoint:{x:number;y:number}|null;closePoint:{x:number;y:number}|null;
  closeWithEscape?:boolean;
}
/** Draft: multiple-selector structure is evidenced; committed-tag real-page gate is recorded separately. */
export function inspectFeishuMultiInPage(selector:string,label:string,value:string,phase:"observe"|"prepare_open"|"prepare_option"="observe",opened=false):FeishuMultiProbe{
  const result:FeishuMultiProbe={status:"control_missing",selected:[],options:[],popupCount:0,validationCleared:false,controlPoint:null,optionPoint:null,closePoint:null};
  const visible=(e:Element|null):e is HTMLElement=>{
    if(!(e instanceof HTMLElement)||!e.isConnected||!e.getBoundingClientRect().width||!e.getBoundingClientRect().height)return false;
    for(let n:HTMLElement|null=e;n;n=n.parentElement){const s=getComputedStyle(n);if(n.hidden||n.getAttribute("aria-hidden")==="true"||s.display==="none"||s.visibility==="hidden"||s.opacity==="0")return false;}return true;};
  const point=(e:HTMLElement|null)=>{if(!visible(e))return null;const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    if(x<0||y<0||x>=innerWidth||y>=innerHeight)return null;const h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x,y}:null;};
  let controls:Element[]=[];try{controls=[...document.querySelectorAll(selector)];}catch{return result;}
  if(controls.length!==1)return {...result,status:controls.length?"control_ambiguous":"control_missing"};
  const input=controls[0];
  if(!(input instanceof HTMLInputElement)||!visible(input)||input.disabled||input.readOnly||!input.matches("input.ud__select__selector__search__input[role='combobox'][type='search']"))return result;
  const trigger=input.closest<HTMLElement>(".ud__select__selector-multiple"),select=input.closest<HTMLElement>(".ud__select"),root=input.closest<HTMLElement>(".ud-formily-item");
  if(!trigger||!select||!root||root.querySelectorAll("input[role='combobox']").length!==1)return result;
  const title=root.querySelector<HTMLElement>(".ud-formily-item-label-content");
  if((title?.textContent??"").replace(/[＊*]/gu,"").trim()!==label.split("·").at(-1)?.trim())return {...result,status:"field_identity_mismatch"};
  if(phase==="prepare_open")trigger.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});
  result.controlPoint=point(input);result.closePoint=point(title);
  // Never parse the concatenated container text: punctuation belongs to each tag.
  const tags=[...trigger.querySelectorAll<HTMLElement>(".ud__select__selector__tag")].filter(visible);
  result.selected=tags.map(e=>(e.querySelector(".ud__tag__content")?.textContent??e.textContent??"").trim()).filter(Boolean);
  if(new Set(result.selected).size!==result.selected.length)return {...result,status:"selected_set_ambiguous"};
  result.validationCleared=!root.querySelector("[aria-invalid='true']")&&![...root.querySelectorAll<HTMLElement>(".ud-formily-item-error-help")].some(e=>visible(e)&&e.textContent?.trim());
  const popups=[...document.querySelectorAll<HTMLElement>(".ud__select__dropdown")].filter(visible);result.popupCount=popups.length;
  if(!popups.length)return {...result,status:"popup_closed"};
  if(popups.length!==1)return {...result,status:"popup_ambiguous"};
  const popup=popups[0]!,a=trigger.getBoundingClientRect(),b=popup.getBoundingClientRect();
  if(!opened||document.activeElement!==input||!trigger.classList.contains("ud__select__selector-open")||
    document.querySelectorAll(".ud__select__selector-open").length!==1||Math.abs(a.left-b.left)>2||Math.abs(a.width-b.width)>2||
    Math.min(Math.abs(a.bottom-b.top),Math.abs(a.top-b.bottom))>8)return {...result,status:"popup_owner_unproven"};
  if(popup.querySelector("[role='tree'],[role='grid'],[class*='cascader'],[class*='picker-panel']"))return {...result,status:"unsupported_popup_structure"};
  const items=[...popup.querySelectorAll<HTMLElement>(".ud__select__list__item")].filter(visible).filter(e=>!e.matches("[disabled],[aria-disabled='true'],[class*='disabled']"));
  const text=(e:HTMLElement)=>(e.querySelector(".ud__select__list__item__content")?.textContent??e.textContent??"").trim();
  result.options=items.map(text).filter(Boolean);
  if(items.length&&!result.closePoint&&b.top<a.top&&b.bottom<=a.top+8)result.closeWithEscape=true;
  if(!value)return {...result,status:items.length?"ready":"popup_loading"};
  const matches=items.filter(e=>text(e)===value);
  if(matches.length!==1)return {...result,status:matches.length?"option_ambiguous":"option_unavailable"};
  if(phase==="prepare_option")matches[0]!.scrollIntoView({behavior:"instant",block:"nearest",inline:"nearest"});
  result.optionPoint=point(matches[0]!);return {...result,status:result.optionPoint?"ready":"option_not_clickable"};
}
export async function executeFeishuMultiSelect(io:{inspect(value:string,phase:"observe"|"prepare_open"|"prepare_option",opened:boolean):Promise<FeishuMultiProbe|null>;
  prepareSurface():Promise<void>;click(point:{x:number;y:number}):Promise<void>;escape?():Promise<void>;wait(ms:number):Promise<void>},values:string[],discover=false){
  let state=await io.inspect("","observe",false);let options:string[]=[];
  const ledger={open:0,select:0,close:0,retry:0};
  const finish=(success:boolean,status:string)=>({success,status,actual:JSON.stringify(state?.selected??[]),selected:state?.selected??[],options,
    validationCleared:state?.validationCleared??false,popupClosed:state?.popupCount===0,ledger});
  if(!discover&&!decodeExactOptionSet(values))return finish(false,"complete_option_set_required");
  if(state?.status!=="popup_closed")return finish(false,state?.status??"control_missing");
  const initial=[...state.selected];
  if(!discover&&exactOptionSetsMatch(initial,values)&&state.validationCleared)return finish(true,"already_committed");
  if(!discover&&initial.some(v=>!values.includes(v)))return finish(false,"existing_selection_conflict");
  await io.prepareSurface();state=await io.inspect("","prepare_open",false);
  if(!state?.controlPoint||state.popupCount)return finish(false,"control_not_clickable");
  await io.click(state.controlPoint);ledger.open++;
  for(let i=0;i<12;i++){await io.wait(100);state=await io.inspect("","observe",true);if(state?.status==="ready")break;}
  if(state?.status!=="ready")return finish(false,state?.status??"popup_timeout");options=[...state.options];
  if(!discover&&values.some(v=>options.filter(option=>option===v).length!==1))return finish(false,"option_unavailable_or_ambiguous");
  for(const value of discover?[]:values.filter(v=>!initial.includes(v))){
    state=await io.inspect(value,"prepare_option",true);
    if(state?.status!=="ready"||!state.optionPoint||state.selected.some(v=>!values.includes(v)))return finish(false,state?.status??"option_missing");
    if(state.selected.includes(value))return finish(false,"selection_changed_before_click");
    const previous=[...state.selected];await io.click(state.optionPoint);ledger.select++;
    let committed=false;
    for(let i=0;i<12;i++){await io.wait(100);state=await io.inspect("","observe",true);
      if(state?.status==="ready"&&exactOptionSetsMatch(state.selected,[...previous,value])){committed=true;break;}}
    if(!committed)return finish(false,"partial_selection_unconfirmed");
  }
  if(state?.closePoint)await io.click(state.closePoint);
  else if(state?.closeWithEscape&&io.escape)await io.escape();
  else return finish(false,"close_target_missing");
  ledger.close++;
  let stable=0;for(let i=0;i<12;i++){await io.wait(100);state=await io.inspect("","observe",false);
    const same=discover?JSON.stringify(state?.selected)===JSON.stringify(initial):exactOptionSetsMatch(state?.selected,values);
    if(state?.status==="popup_closed"&&same&&(discover||state.validationCleared)){if(++stable>=2)return finish(true,discover?"discovered":"committed");}else stable=0;}
  return finish(false,"selection_readback_mismatch");
}
