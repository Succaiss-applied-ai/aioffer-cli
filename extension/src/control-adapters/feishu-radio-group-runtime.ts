import type {FillInstruction,FillResult,PageObservation} from "../page-adapter.js";
import {executeInterruptibleScript,sendInterruptibleDebuggerCommand} from "../auto-apply-interruption.js";
import {observeApplicationWithDialectsInTab} from "./browser-dispatch.js";
import {bindObservedInstruction,controlRoutingFailure,evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
import {dispatchTrustedPointerClick,prepareFocusEmulatedTrustedPointerSurface,releaseTrustedPointerSurface} from "../trusted-pointer-driver.js";
import {executeFeishuRadioGroup,inspectFeishuRadioInPage} from "./feishu-radio-group-driver.js";

export async function executeFeishuRadioGroupInTab(tabId:number,page:PageObservation,instruction:FillInstruction,allowReplace=false):Promise<FillResult>{
  const code="feishu.formily-radio-group.trusted-pointer.v1";
  if(instruction.controlAdapter?.adapterCode!==code)return controlRoutingFailure(instruction,null,"control_route_changed","单选组未锁定注册");
  const original=bindObservedInstruction(page,instruction),target={tabId}; let attached=false;
  const send=(method:string,params?:Record<string,unknown>)=>sendInterruptibleDebuggerCommand(target,method,params);
  try{
    await chrome.debugger.attach(target,"1.3");attached=true;
    const execution=await executeFeishuRadioGroup({
      async inspect(prepare){
        const fresh=await observeApplicationWithDialectsInTab(tabId);
        if(!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||(page.documentId&&fresh.documentId!==page.documentId))return null;
        const field=bindObservedInstruction(fresh,instruction);
        if(!original||!field||JSON.stringify(original.fieldSource)!==JSON.stringify(field.fieldSource)||resolveControlAdapter(evidenceForField(fresh,field)).code!==code)return null;
        const result=await executeInterruptibleScript({target,world:"MAIN",func:inspectFeishuRadioInPage,args:[field.selector,field.label,String(instruction.value),prepare]});
        if(page.documentId&&result[0]?.documentId!==page.documentId)return null;
        return result[0]?.result??null;
      },
      prepareSurface:()=>prepareFocusEmulatedTrustedPointerSurface(send),click:point=>dispatchTrustedPointerClick(send,point),
      wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))
    },String(instruction.value),allowReplace);
    return {fieldId:instruction.fieldId,success:execution.success,expected:String(instruction.value),actual:execution.actual,
      error:execution.success?null:`feishu_radio_failed:${execution.status}`,driverStage:execution.success?"readback":"interaction",
      driverFailureCode:execution.success?null:execution.status,availableOptions:execution.options,
      driverDiagnostics:{...execution},controlAdapter:instruction.controlAdapter};
  }finally{if(attached){await releaseTrustedPointerSurface(send).catch(()=>undefined);await chrome.debugger.detach(target).catch(()=>undefined);}}
}
