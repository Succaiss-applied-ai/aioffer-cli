export interface FeishuYearProbe {
  status:string;actual:string;years:string[];popupCount:number;validationCleared:boolean;
  controlPoint:{x:number;y:number}|null;yearPoint:{x:number;y:number}|null;navigationPoint:{x:number;y:number}|null;
}
/** Single YYYY picker only. It must never enter the existing month-range Driver. */
export function inspectFeishuYearInPage(selector:string,label:string,value:string,prepare=false,opened=false):FeishuYearProbe{
  const result:FeishuYearProbe={status:"control_missing",actual:"",years:[],popupCount:0,validationCleared:false,controlPoint:null,yearPoint:null,navigationPoint:null};
  const visible=(e:Element|null):e is HTMLElement=>{
    if(!(e instanceof HTMLElement)||!e.isConnected||!e.getBoundingClientRect().width||!e.getBoundingClientRect().height)return false;
    for(let n:HTMLElement|null=e;n;n=n.parentElement){const s=getComputedStyle(n);if(n.hidden||n.getAttribute("aria-hidden")==="true"||s.display==="none"||s.visibility==="hidden"||s.opacity==="0")return false;}return true;};
  const point=(e:HTMLElement|null)=>{if(!visible(e))return null;const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    if(x<0||y<0||x>=innerWidth||y>=innerHeight)return null;const h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x,y}:null;};
  let matches:Element[]=[];try{matches=[...document.querySelectorAll(selector)];}catch{return result;}
  if(matches.length!==1)return {...result,status:matches.length?"control_ambiguous":"control_missing"};
  const input=matches[0];
  if(!(input instanceof HTMLInputElement)||!visible(input)||input.disabled||input.readOnly||!input.matches("input.ud__picker-input[placeholder='YYYY']"))return result;
  const picker=input.closest<HTMLElement>(".ud__picker"),root=input.closest<HTMLElement>(".ud-formily-item");
  if(!picker||!root||root.querySelectorAll(".ud__picker-input").length!==1||input.closest(".throne-biz-date-range-picker-wrapper"))return result;
  const local=(root.querySelector(".ud-formily-item-label-content")?.textContent??"").replace(/[＊*]/gu,"").trim();
  if(!local||local!==label.split("·").at(-1)?.trim())return {...result,status:"field_identity_mismatch"};
  if(prepare)input.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});
  result.actual=input.value.trim();result.controlPoint=point(input);
  result.validationCleared=!root.querySelector("[aria-invalid='true']")&&![...root.querySelectorAll<HTMLElement>(".ud-formily-item-error-help")].some(e=>visible(e)&&e.textContent?.trim());
  const popups=[...document.querySelectorAll<HTMLElement>(".ud__picker-dropdown")].filter(visible);result.popupCount=popups.length;
  if(!popups.length)return {...result,status:"popup_closed"};
  if(popups.length!==1)return {...result,status:"popup_ambiguous"};
  const popup=popups[0]!,a=picker.getBoundingClientRect(),b=popup.getBoundingClientRect();
  if(!opened||!picker.classList.contains("ud__picker--focus")||document.querySelectorAll(".ud__picker--focus").length!==1||
    Math.abs(a.left-b.left)>2||Math.min(Math.abs(a.bottom-b.top),Math.abs(a.top-b.bottom))>8)return {...result,status:"popup_owner_unproven"};
  const panels=[...popup.querySelectorAll(".ud__picker-year-panel")];
  if(panels.length!==1||popup.querySelector(".ud__picker-month-panel,.ud__picker-day-panel"))return {...result,status:"unsupported_popup_structure"};
  const leaves=[...panels[0]!.querySelectorAll<HTMLElement>(".ud__picker-year-panel-cell .ud__picker__cell-interactive-area")].filter(visible)
    .filter(e=>!e.closest("[disabled],[aria-disabled='true'],[class*='disabled']"));
  result.years=leaves.map(e=>e.textContent?.trim()??"").filter(v=>/^\d{4}$/u.test(v));
  const exact=leaves.filter(e=>e.textContent?.trim()===value);
  if(exact.length>1)return {...result,status:"year_ambiguous"};
  if(exact.length===1){result.yearPoint=point(exact[0]!);return {...result,status:result.yearPoint?"ready":"year_not_clickable"};}
  const years=result.years.map(Number);
  if(!years.length||!/^\d{4}$/u.test(value))return {...result,status:"year_unavailable"};
  const direction=Number(value)<Math.min(...years)?"LeftBoldOutlined":Number(value)>Math.max(...years)?"RightBoldOutlined":null;
  const buttons=[...popup.querySelectorAll<HTMLButtonElement>("button.ud__picker-panel-header-icon")].filter(e=>!e.disabled&&direction&&e.querySelector(`[data-icon='${direction}']`));
  if(buttons.length===1)result.navigationPoint=point(buttons[0]!);
  return {...result,status:result.navigationPoint?"navigate":"year_unavailable"};
}
export async function executeFeishuYear(io:{inspect(prepare:boolean,opened:boolean):Promise<FeishuYearProbe|null>;prepareSurface():Promise<void>;
  click(p:{x:number;y:number}):Promise<void>;wait(ms:number):Promise<void>},value:string){
  const ledger={open:0,navigate:0,select:0,retry:0};let state=await io.inspect(false,false);
  const finish=(success:boolean,status:string)=>({success,status,actual:state?.actual??"",validationCleared:state?.validationCleared??false,popupClosed:state?.popupCount===0,ledger});
  if(!/^(?:19|20)\d{2}$/u.test(value))return finish(false,"year_precision_required");
  if(state?.status!=="popup_closed")return finish(false,state?.status??"control_missing");
  if(state.actual===value&&state.validationCleared)return finish(true,"already_committed");
  if(state.actual)return finish(false,"existing_value_conflict");
  await io.prepareSurface();state=await io.inspect(true,false);if(!state?.controlPoint||state.popupCount)return finish(false,"control_not_clickable");
  await io.click(state.controlPoint);ledger.open++;
  let previous="";
  for(let step=0;step<8;step++){
    for(let poll=0;poll<12;poll++){await io.wait(100);state=await io.inspect(false,true);if(state&&["ready","navigate","year_unavailable","year_ambiguous"].includes(state.status)&&state.years.join(",")!==previous)break;}
    if(state?.status==="ready"&&state.yearPoint){await io.click(state.yearPoint);ledger.select++;break;}
    if(state?.status!=="navigate"||!state.navigationPoint||state.years.join(",")===previous)return finish(false,state?.status??"popup_timeout");
    previous=state.years.join(",");await io.click(state.navigationPoint);ledger.navigate++;
  }
  if(!ledger.select)return finish(false,"year_navigation_limit");
  let stable=0;for(let i=0;i<15;i++){await io.wait(100);state=await io.inspect(false,true);
    if(state?.status==="popup_closed"&&state.actual===value&&state.validationCleared){if(++stable>=2)return finish(true,"committed");}else stable=0;}
  return finish(false,state?.validationCleared?"year_readback_mismatch":"validation_not_cleared");
}
