import type { FillInstruction, FillResult, PageObservation } from "../page-adapter.js";
import { executeInterruptibleScript, sendInterruptibleDebuggerCommand } from "../auto-apply-interruption.js";
import { observeApplicationWithDialectsInTab } from "./browser-dispatch.js";
import { bindObservedInstruction, controlRoutingFailure } from "./field-routing.js";
import { dispatchTrustedPointerClick, prepareFocusEmulatedTrustedPointerSurface, releaseTrustedPointerSurface } from "../trusted-pointer-driver.js";
import { inspectFeishuSelectorSearchInPage, type SelectorSearchPhase } from "./feishu-selector-search-driver.js";
import { needsFeishuSelectorDiscovery, withFeishuSelectorKind, carryFeishuSelectorKinds } from "./feishu-selector-discovery.js";
import { withFieldInformationRequirements } from "../field-information.js";

/** Opens only to classify the owned popup. Does not query, select or persist a shape cache. */
export async function prepareFeishuSelectorInTab(tabId:number,page:PageObservation,instruction:FillInstruction):Promise<{page:PageObservation;failure?:FillResult}> {
  const original=bindObservedInstruction(page,instruction);
  if (!original || !needsFeishuSelectorDiscovery(original,page.url)) return {page};
  const multiple=original.domHints!.classNames.some(s=>/\bud__select__selector-multiple\b/u.test(s));
  const target={tabId}; let attached=false;
  const send=(method:string,params?:Record<string,unknown>)=>sendInterruptibleDebuggerCommand(target,method,params);
  const fail=(status:string)=>({page,failure:controlRoutingFailure(instruction,original,"control_discovery_failed",status)});
  const inspect=async (phase:SelectorSearchPhase,opened=false)=>{
    const fresh=await observeApplicationWithDialectsInTab(tabId), field=fresh&&bindObservedInstruction(fresh,instruction);
    if (!fresh||fresh.url!==page.url||fresh.pageStage!=="application_form"||(page.documentId&&fresh.documentId!==page.documentId)||
      !field||JSON.stringify(field.fieldSource)!==JSON.stringify(original.fieldSource)||!needsFeishuSelectorDiscovery(field,fresh.url)) return null;
    const found=await executeInterruptibleScript({target,world:"MAIN",func:inspectFeishuSelectorSearchInPage,
      args:[field.selector,field.label,"",multiple,phase,opened,null,true]});
    return page.documentId&&found[0]?.documentId!==page.documentId?null:found[0]?.result??null;
  };
  try {
    await chrome.debugger.attach(target,"1.3"); attached=true;
    const before=await inspect("observe");
    if (!before||before.status!=="popup_closed"||before.query) return fail("控件有未完成的查询或弹层");
    await prepareFocusEmulatedTrustedPointerSurface(send);
    const ready=await inspect("prepare_input");
    if (!ready?.inputPoint) return fail("分类入口不可点击");
    await dispatchTrustedPointerClick(send,ready.inputPoint);
    let opened=await inspect("observe",true);
    for (let i=0;i<20&&opened?.status!=="classified";i++) {
      if (opened && ["popup_ambiguous","unsupported_popup_structure","field_identity_mismatch"].includes(opened.status)) break;
      await new Promise(r=>setTimeout(r,100)); opened=await inspect("observe",true);
    }
    if (opened?.closePoint) await dispatchTrustedPointerClick(send,opened.closePoint);
    else if (opened?.closeWithEscape) {
      await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
      await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    } else return fail("分类弹层无法按原字段关闭");
    let closed=await inspect("observe");
    for(let i=0;i<12&&closed?.popupCount!==0;i++){await new Promise(r=>setTimeout(r,100));closed=await inspect("observe");}
    if (!opened.popupKind||opened.status!=="classified"||!closed||closed.popupCount!==0||closed.query||JSON.stringify(closed.selected)!==JSON.stringify(before.selected))
      return fail("弹层结构未确定或分类改变了已选值");
    const fresh=await observeApplicationWithDialectsInTab(tabId), field=fresh&&bindObservedInstruction(fresh,instruction);
    if (!fresh||!field||fresh.url!==page.url||(page.documentId&&fresh.documentId!==page.documentId)||JSON.stringify(field.fieldSource)!==JSON.stringify(original.fieldSource)) return fail("分类后字段身份变化");
    return {page:withFieldInformationRequirements(carryFeishuSelectorKinds(page,withFeishuSelectorKind(fresh,field,opened.popupKind)))};
  } finally {
    if (attached) { await releaseTrustedPointerSurface(send).catch(()=>undefined); await chrome.debugger.detach(target).catch(()=>undefined); }
  }
}
