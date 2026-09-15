import type { FillInstruction, FillResult, PageObservation } from "../page-adapter.js";
import { executeInterruptibleScript, sendInterruptibleDebuggerCommand } from "../auto-apply-interruption.js";
import { observeApplicationWithDialectsInTab } from "./browser-dispatch.js";
import { bindObservedInstruction, controlRoutingFailure, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";
import { dispatchTrustedPointerClick, prepareFocusEmulatedTrustedPointerSurface, releaseTrustedPointerSurface } from "../trusted-pointer-driver.js";
import { executeFeishuSelectorSearch, inspectFeishuSelectorSearchInPage } from "./feishu-selector-search-driver.js";
import { selectorSearchValues } from "../selector-search-values.js";
import { isPreferredWorkCityField } from "../preferred-city-policy.js";
import { feishuLocationTarget } from "../feishu-location-value.js";

export async function executeFeishuSelectorSearchInTab(tabId:number,page:PageObservation,instruction:FillInstruction):Promise<FillResult> {
  const code=instruction.controlAdapter?.adapterCode;
  if (code!=="feishu.formily-selector-search.trusted-pointer.v1"&&code!=="feishu.formily-city-multi-search.trusted-pointer.v1"&&code!=="feishu.formily-location-tree.trusted-pointer.v1")
    return controlRoutingFailure(instruction,null,"control_route_changed","搜索选择控件未锁定注册");
  const multiple=code==="feishu.formily-city-multi-search.trusted-pointer.v1";
  const values=multiple ? selectorSearchValues(instruction.selectedOptionValues??instruction.value)??[] : [String(instruction.value)];
  const tree=code!=="feishu.formily-selector-search.trusted-pointer.v1";
  const targets=tree?values.map(feishuLocationTarget):[];
  if (tree&&targets.some(t=>!t)) return controlRoutingFailure(instruction,null,"query_fact_missing","请补充一个有效地点及已知的上级地区");
  const original=bindObservedInstruction(page,instruction), target={tabId};
  let attached=false, querySelector="", expectedQuery="";
  const send=(method:string,params?:Record<string,unknown>)=>sendInterruptibleDebuggerCommand(target,method,params);
  try {
    await chrome.debugger.attach(target,"1.3"); attached=true;
    const execution=await executeFeishuSelectorSearch({
      async inspect(value,phase,queried) {
        const fresh=await observeApplicationWithDialectsInTab(tabId);
        if (!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||(page.documentId&&fresh.documentId!==page.documentId)) return null;
        const field=bindObservedInstruction(fresh,instruction);
        if (!field||!original||JSON.stringify(field.fieldSource)!==JSON.stringify(original.fieldSource)||
          resolveControlAdapter(evidenceForField(fresh,{...field,observedControlKind:original.observedControlKind},instruction)).code!==code) return null;
        querySelector=field.selector; expectedQuery=value;
        const result=await executeInterruptibleScript({target,world:"MAIN",func:inspectFeishuSelectorSearchInPage,
          args:[field.selector,field.label,value,multiple,phase,queried,tree?targets.find(t=>t?.query===value)?.path??null:null]});
        if (page.documentId&&result[0]?.documentId!==page.documentId) return null;
        return result[0]?.result??null;
      },
      prepareSurface:()=>prepareFocusEmulatedTrustedPointerSurface(send),
      click:point=>dispatchTrustedPointerClick(send,point),
      async typeQuery(text) {
        if (text!==expectedQuery) throw new Error("搜索词与当前字段指令不一致");
        const check=await executeInterruptibleScript({target,world:"MAIN",func:(selector:string)=>{
          const nodes=document.querySelectorAll(selector), input=nodes.length===1?nodes[0]:null;
          return input instanceof HTMLInputElement&&!input.readOnly&&!input.disabled&&document.activeElement===input&&input.value==="";
        },args:[querySelector]});
        if (!check[0]?.result||(page.documentId&&check[0]?.documentId!==page.documentId)) throw new Error("搜索输入未就绪，未写入查询");
        await send("Input.insertText",{text});
      },
      wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))
    },tree?targets.map(t=>t!.query):values,multiple,tree ? {
      retainOnlyTargets: multiple && Boolean(original && isPreferredWorkCityField(original)),
      verifyExisting: targets.filter(t=>t!.path.length>1).map(t=>t!.query)
    } : {});
    return {fieldId:instruction.fieldId,success:execution.success,expected:String(instruction.value),actual:execution.actual,
      error:execution.success?null:`feishu_selector_search_failed:${execution.status}`,driverStage:execution.success?"readback":"interaction",
      driverFailureCode:execution.success?null:["option_unavailable","option_ambiguous"].includes(execution.status)?"control_option_unavailable":execution.status,
      availableOptions:execution.options,driverDiagnostics:{...execution},controlAdapter:instruction.controlAdapter};
  } finally {
    if (attached) { await releaseTrustedPointerSurface(send).catch(()=>undefined); await chrome.debugger.detach(target).catch(()=>undefined); }
  }
}
