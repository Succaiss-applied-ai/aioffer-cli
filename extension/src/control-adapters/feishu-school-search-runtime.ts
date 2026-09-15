import type { FillInstruction, FillResult, PageObservation } from "../page-adapter.js";
import { executeInterruptibleScript, sendInterruptibleDebuggerCommand } from "../auto-apply-interruption.js";
import { observeApplicationWithDialectsInTab } from "./browser-dispatch.js";
import { bindObservedInstruction, controlRoutingFailure, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";
import { dispatchTrustedPointerClick, prepareFocusEmulatedTrustedPointerSurface, releaseTrustedPointerSurface } from "../trusted-pointer-driver.js";
import { executeFeishuSchoolSearch, inspectFeishuSchoolInPage } from "./feishu-school-search-driver.js";

export async function executeFeishuSchoolSearchInTab(tabId:number,page:PageObservation,instruction:FillInstruction):Promise<FillResult>{
  const code=instruction.controlAdapter?.adapterCode;
  const kind=code==="feishu.atsx-school-search.trusted-pointer.v1"?"atsx_school":code==="feishu.formily-school-search.trusted-pointer.v1"?"formily_school":null;
  if(!kind)return controlRoutingFailure(instruction,null,"control_route_changed","学校查询未锁定注册");
  const original=bindObservedInstruction(page,instruction);
  const allowReplaceClosedValue=kind==="formily_school"&&original?.sectionKey==="education"&&original.fieldSource?.fieldPath==="school";
  let querySelector="";
  const target={tabId};let attached=false;
  const send=(method:string,params?:Record<string,unknown>)=>sendInterruptibleDebuggerCommand(target,method,params);
  try{
    await chrome.debugger.attach(target,"1.3");attached=true;
    const execution=await executeFeishuSchoolSearch({
      async inspect(phase,queried){
        const fresh=await observeApplicationWithDialectsInTab(tabId);
        if(!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||(page.documentId&&fresh.documentId!==page.documentId))return null;
        const field=bindObservedInstruction(fresh,instruction);
        if(!field||!original||JSON.stringify(field.fieldSource)!==JSON.stringify(original.fieldSource)||resolveControlAdapter(evidenceForField(fresh,field,instruction)).code!==code)return null;
        querySelector=field.selector;
        const result=await executeInterruptibleScript({target,world:"MAIN",func:inspectFeishuSchoolInPage,args:[field.selector,field.label,String(instruction.value),kind,phase,queried]});
        if(page.documentId&&result[0]?.documentId!==page.documentId)return null;
        return result[0]?.result??null;
      },prepareSurface:()=>prepareFocusEmulatedTrustedPointerSurface(send),click:point=>dispatchTrustedPointerClick(send,point),
      typeQuery:async (text,expectedExisting)=>{
        if(expectedExisting){
          if(!allowReplaceClosedValue)throw new Error("学校旧值替换未获当前字段授权");
          await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",modifiers:2,commands:["selectAll"]});
          await send("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA"});
          const selection=await executeInterruptibleScript({target,world:"MAIN",func:(selector:string,value:string)=>{
            const nodes=document.querySelectorAll(selector),input=nodes.length===1?nodes[0]:null;
            return input instanceof HTMLInputElement&&document.activeElement===input&&input.value===value&&
              input.selectionStart===0&&input.selectionEnd===input.value.length;
          },args:[querySelector,expectedExisting]});
          if(!selection[0]?.result||(page.documentId&&selection[0]?.documentId!==page.documentId))
            throw new Error("学校旧文本未完整选中，未写入查询");
        }
        await send("Input.insertText",{text});
      },wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))
    },String(instruction.value),allowReplaceClosedValue);
    return {fieldId:instruction.fieldId,success:execution.success,expected:String(instruction.value),actual:execution.actual,
      error:execution.success?null:`feishu_school_search_failed:${execution.status}`,driverStage:execution.success?"readback":"interaction",
      driverFailureCode:execution.success?null:execution.status==="option_unavailable"?"control_option_unavailable":execution.status,
      availableOptions:execution.options,driverDiagnostics:{...execution},controlAdapter:instruction.controlAdapter};
  }finally{if(attached){await releaseTrustedPointerSurface(send).catch(()=>undefined);await chrome.debugger.detach(target).catch(()=>undefined);}}
}
