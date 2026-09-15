import type { FillInstruction, FillResult, PageObservation } from "../page-adapter.js";
import { executeInterruptibleScript, sendInterruptibleDebuggerCommand } from "../auto-apply-interruption.js";
import { observeApplicationWithDialectsInTab } from "./browser-dispatch.js";
import { bindObservedInstruction, controlRoutingFailure } from "./field-routing.js";
import { dispatchTrustedPointerClick, prepareFocusEmulatedTrustedPointerSurface, releaseTrustedPointerSurface } from "../trusted-pointer-driver.js";
import { executeFeishuAtsxChoice, inspectFeishuAtsxChoiceInPage, type FeishuAtsxChoiceKind, type FeishuAtsxChoiceResult } from "./feishu-atsx-select-driver.js";

export function needsFeishuAtsxChoiceDiscovery(field: PageObservation["fields"][number]): boolean {
  const signature=field.domHints?.classNames.join(" ")??"";
  return !!field.fieldSource && field.domHints?.tagName==="DIV" &&
    /atsx-select-selection--single/u.test(signature) && !/atsx-select-combobox/u.test(signature);
}

async function run(tabId:number,page:PageObservation,instruction:FillInstruction,discover:boolean,kind?:FeishuAtsxChoiceKind):Promise<FeishuAtsxChoiceResult>{
  const target={tabId};let attached=false;
  const send=(method:string,params?:Record<string,unknown>)=>sendInterruptibleDebuggerCommand(target,method,params);
  const original=bindObservedInstruction(page,instruction);
  try{
    await chrome.debugger.attach(target,"1.3");attached=true;
    return await executeFeishuAtsxChoice({
      async inspect(value,phase,opened){
        const fresh=await observeApplicationWithDialectsInTab(tabId);
        if(!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||
          (page.documentId&&fresh.documentId!==page.documentId))return null;
        const field=bindObservedInstruction(fresh,instruction);
        if(!field||!original||JSON.stringify(field.fieldSource)!==JSON.stringify(original.fieldSource)||!needsFeishuAtsxChoiceDiscovery(field))return null;
        const result=await executeInterruptibleScript({target,world:"MAIN",func:inspectFeishuAtsxChoiceInPage,
          args:[field.selector,field.label,value,phase,opened]});
        if(page.documentId&&result[0]?.documentId!==page.documentId)return null;
        return result[0]?.result??null;
      },prepareSurface:()=>prepareFocusEmulatedTrustedPointerSurface(send),click:point=>dispatchTrustedPointerClick(send,point),
      wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))
    },{value:String(instruction.value),discover,kind});
  }finally{if(attached){await releaseTrustedPointerSurface(send).catch(()=>undefined);await chrome.debugger.detach(target).catch(()=>undefined);}}
}

/** Classification only. No answer writes and no persistent shape/answer cache. */
export async function prepareFeishuAtsxChoiceInTab(tabId:number,page:PageObservation,instruction:FillInstruction):Promise<{page:PageObservation;failure?:FillResult}>{
  const field=bindObservedInstruction(page,instruction);
  if(!field||!needsFeishuAtsxChoiceDiscovery(field))return {page};
  const found=await run(tabId,page,{...instruction,value:""},true);
  if(!found.success||!found.kind)return {page,failure:{...controlRoutingFailure(instruction,field,"control_discovery_failed",found.status),driverDiagnostics:{...found}}};
  const fresh=await observeApplicationWithDialectsInTab(tabId);
  const after=fresh?bindObservedInstruction(fresh,instruction):null;
  if(!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||(page.documentId&&fresh.documentId!==page.documentId)||
    !after||JSON.stringify(field.fieldSource)!==JSON.stringify(after.fieldSource))return {page,failure:controlRoutingFailure(instruction,field,"control_target_missing","探查后字段身份变化")};
  return {page:{...fresh,fields:fresh.fields.map(f=>f===after?{...f,observedControlKind:found.kind!,options:found.options}:f)}};
}

export async function executeFeishuAtsxChoiceInTab(tabId:number,page:PageObservation,instruction:FillInstruction,discover=false):Promise<FillResult>{
  const kind=instruction.controlAdapter?.adapterCode==="feishu.atsx-flat-select.trusted-pointer.v1"?"atsx_flat":
    instruction.controlAdapter?.adapterCode==="feishu.atsx-city-tree.trusted-pointer.v1"?"atsx_city_tree":null;
  if(!kind)return controlRoutingFailure(instruction,null,"control_route_changed","ATSX 控件没有锁定唯一注册");
  const result=await run(tabId,page,instruction,discover,kind);
  return {fieldId:instruction.fieldId,success:result.success,expected:String(instruction.value),actual:result.actual,
    error:result.success?null:`feishu_atsx_choice_failed:${result.status}`,driverStage:result.success?"readback":"interaction",
    driverFailureCode:result.success?null:result.status==="option_unavailable"?"control_option_unavailable":result.status,
    availableOptions:result.options,driverDiagnostics:{...result},controlAdapter:instruction.controlAdapter};
}
