import type {FillInstruction,FillResult,PageObservation} from "../page-adapter.js";
import {executeInterruptibleScript,sendInterruptibleDebuggerCommand} from "../auto-apply-interruption.js";
import {observeApplicationWithDialectsInTab} from "./browser-dispatch.js";
import {bindObservedInstruction,controlRoutingFailure,evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
import {dispatchTrustedPointerClick,prepareFocusEmulatedTrustedPointerSurface,releaseTrustedPointerSurface} from "../trusted-pointer-driver.js";

interface RangeProbe {
  actual:string; startValues:string[]; endCount:number; endDisabled:boolean; endEnabled:boolean;
  point:{x:number;y:number;tagName:string;className:string}|null;
}
/** Invoked only after the production observer proves the exact range shape. */
export function inspectMokaRangePresentInPage(selector:string,prepare=false):RangeProbe|null {
  const nodes=document.querySelectorAll(selector), input=nodes.length===1?nodes[0]:null;
  if(!(input instanceof HTMLInputElement)||input.type!=="checkbox"||input.disabled)return null;
  const root=input.closest(".month-range-select.date_info,.month-range-select.date_group_info");
  const label=input.closest<HTMLElement>("label");
  if(!root||!label||root.querySelectorAll('input[type=checkbox]').length!==1||
    !/^(?:至今|present)$/iu.test(label.textContent?.trim()??""))return null;
  const parts=[...root.querySelectorAll<HTMLInputElement>('input[type=text]')];
  if(parts.length!==4&&!(input.checked&&parts.length===2))return null;
  if(prepare)label.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});
  const rect=label.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const hit=document.elementFromPoint(x,y),style=getComputedStyle(label);
  const point=rect.width>0&&rect.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&
    style.visibility!=="hidden"&&style.display!=="none"&&style.opacity!=="0"&&hit&&label.contains(hit)
    ?{x,y,tagName:hit.tagName,className:String((hit as HTMLElement).className??"")}:null;
  const value=(part:HTMLInputElement)=>part.closest('[class*="Select-container"]')?.querySelector('[class*="Input-display-value"]')?.textContent?.trim()??part.value;
  return {actual:String(input.checked),startValues:parts.slice(0,2).map(value),endCount:parts.length-2,
    endDisabled:parts.slice(2).every(part=>part.disabled),endEnabled:parts.slice(2).every(part=>!part.disabled),point};
}

export async function executeMokaRangePresent(io:{
  inspect(prepare:boolean):Promise<RangeProbe|null>; prepareSurface():Promise<unknown>;
  click(point:NonNullable<RangeProbe['point']>):Promise<unknown>; wait(ms:number):Promise<unknown>;
},expected:string){
  let clicks=0;
  const result=(success:boolean,status:string,probe:RangeProbe|null)=>({success,status,actual:probe?.actual??"",clicks});
  if(!/^(?:true|false)$/u.test(expected))return result(false,"invalid_range_choice",null);
  await io.prepareSurface();
  const before=await io.inspect(true);
  if(!before)return result(false,"control_missing",null);
  if(before.actual!==expected){
    const live=await io.inspect(false);
    if(!live||!live.point||live.actual!==before.actual||JSON.stringify(live.startValues)!==JSON.stringify(before.startValues))return result(false,"target_changed",live);
    await io.click(live.point);clicks=1;
  }
  let latest:RangeProbe|null=before,stable=0;
  for(let n=0;n<8;n++){
    await io.wait(120);latest=await io.inspect(false);
    if(!latest)return result(false,"control_missing",null);
    if(JSON.stringify(latest.startValues)!==JSON.stringify(before.startValues))return result(false,"start_value_changed",latest);
    const endMatches=expected==="true"?latest.endCount===0||latest.endDisabled:latest.endCount===2&&latest.endEnabled;
    stable=latest.actual===expected&&endMatches?stable+1:0;
    if(stable>=2)return result(true,"completed",latest);
  }
  return result(false,"range_readback_failed",latest);
}

export async function executeMokaRangePresentInTab(tabId:number,page:PageObservation,instruction:FillInstruction):Promise<FillResult>{
  const code="moka.range-present.trusted-pointer.v1", original=bindObservedInstruction(page,instruction),target={tabId};
  if(!original?.dateRange||original.dateRange.role!=="present"||instruction.controlAdapter?.adapterCode!==code)
    return controlRoutingFailure(instruction,original,"control_route_changed","不是已绑定日期范围的至今控件");
  let attached=false;
  const send=(method:string,params?:Record<string,unknown>)=>sendInterruptibleDebuggerCommand(target,method,params);
  try{
    const outcome=await executeMokaRangePresent({
      async inspect(prepare){
        const fresh=await observeApplicationWithDialectsInTab(tabId);
        if(!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||(page.documentId&&fresh.documentId!==page.documentId))return null;
        const field=bindObservedInstruction(fresh,instruction);
        if(!field||field.dateRange?.groupKey!==original.dateRange!.groupKey||resolveControlAdapter(evidenceForField(fresh,field)).code!==code)return null;
        const r=await executeInterruptibleScript({target,world:"MAIN",func:inspectMokaRangePresentInPage,args:[field.selector,prepare]});
        if(page.documentId&&r[0]?.documentId!==page.documentId)return null;
        return r[0]?.result??null;
      },
      async prepareSurface(){await chrome.debugger.attach(target,"1.3");attached=true;await prepareFocusEmulatedTrustedPointerSurface(send);},
      click:point=>dispatchTrustedPointerClick(send,point),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))
    },String(instruction.value));
    return {fieldId:instruction.fieldId,success:outcome.success,expected:String(instruction.value),actual:outcome.actual,
      error:outcome.success?null:`moka_range_present_failed:${outcome.status}`,driverStage:outcome.success?"readback":"interaction",
      driverFailureCode:outcome.success?null:outcome.status,driverDiagnostics:{...outcome},controlAdapter:instruction.controlAdapter};
  }finally{if(attached){await releaseTrustedPointerSurface(send).catch(()=>undefined);await chrome.debugger.detach(target).catch(()=>undefined);}}
}
