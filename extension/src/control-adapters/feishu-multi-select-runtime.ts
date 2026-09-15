import type { FillInstruction, FillResult, PageObservation } from "../page-adapter.js";
import { executeInterruptibleScript, sendInterruptibleDebuggerCommand } from "../auto-apply-interruption.js";
import { observeApplicationWithDialectsInTab } from "./browser-dispatch.js";
import { bindObservedInstruction, controlRoutingFailure, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";
import { dispatchTrustedPointerClick, prepareFocusEmulatedTrustedPointerSurface, releaseTrustedPointerSurface } from "../trusted-pointer-driver.js";
import { executeFeishuMultiSelect, inspectFeishuMultiInPage } from "./feishu-multi-select-driver.js";

export async function executeFeishuMultiSelectInTab(tabId:number,page:PageObservation,instruction:FillInstruction,discover=false):Promise<FillResult>{
  const code=instruction.controlAdapter?.adapterCode;
  if(code!=="feishu.formily-multi-select.trusted-pointer.v1")return controlRoutingFailure(instruction,null,"control_route_changed","多选控件未锁定注册");
  const original=bindObservedInstruction(page,instruction);const target={tabId};let attached=false;
  const send=(method:string,params?:Record<string,unknown>)=>sendInterruptibleDebuggerCommand(target,method,params);
  try{
    await chrome.debugger.attach(target,"1.3");attached=true;
    const execution=await executeFeishuMultiSelect({
      async inspect(value,phase,opened){
        const fresh=await observeApplicationWithDialectsInTab(tabId);
        if(!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||(page.documentId&&fresh.documentId!==page.documentId))return null;
        const field=bindObservedInstruction(fresh,instruction);
        if(!field||!original||JSON.stringify(field.fieldSource)!==JSON.stringify(original.fieldSource)||resolveControlAdapter(evidenceForField(fresh,field,instruction)).code!==code)return null;
        const result=await executeInterruptibleScript({target,world:"MAIN",func:inspectFeishuMultiInPage,args:[field.selector,field.label,value,phase,opened]});
        if(page.documentId&&result[0]?.documentId!==page.documentId)return null;
        return result[0]?.result??null;
      },prepareSurface:()=>prepareFocusEmulatedTrustedPointerSurface(send),click:point=>dispatchTrustedPointerClick(send,point),
      async escape(){
        await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
        await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
      },
      wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))
    },instruction.selectedOptionValues??[],discover);
    return {fieldId:instruction.fieldId,success:execution.success,expected:String(instruction.value),actual:execution.actual,
      error:execution.success?null:`feishu_multi_failed:${execution.status}`,driverStage:execution.success?"readback":"interaction",
      driverFailureCode:execution.success?null:execution.status==="option_unavailable"?"control_option_unavailable":execution.status,
      availableOptions:execution.options,driverDiagnostics:{...execution},controlAdapter:instruction.controlAdapter};
  }finally{if(attached){await releaseTrustedPointerSurface(send).catch(()=>undefined);await chrome.debugger.detach(target).catch(()=>undefined);}}
}
