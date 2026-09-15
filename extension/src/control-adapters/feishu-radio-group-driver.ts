export interface FeishuRadioProbe {
  status: string;
  actual: string;
  options: string[];
  validationCleared: boolean;
  point: {x:number; y:number; tagName:string; className:string} | null;
}

/** Serialized DOM probe; only preparation may scroll the exact owned option. */
export function inspectFeishuRadioInPage(selector:string, expectedLabel:string, expected:string, prepare=false):FeishuRadioProbe {
  const result=(status:string, actual="", options:string[]=[], validationCleared=false, point:FeishuRadioProbe["point"]=null):FeishuRadioProbe=>
    ({status,actual,options,validationCleared,point});
  const normalize=(value:unknown)=>String(value??"").replace(/\s+/gu," ").trim();
  const candidates=document.querySelectorAll(selector);
  const input=candidates.length===1?candidates[0]:null;
  if(!(input instanceof HTMLInputElement)||!input.matches("input[type=radio].ud__radio__input"))return result("control_missing");
  const root=input.closest(".ud-formily-item"), group=input.closest(".ud__radio-group");
  if(!root||!group||root.querySelectorAll(".ud__radio-group").length!==1)return result("control_ambiguous");
  const label=normalize(root.querySelector(".ud-formily-item-label-content")?.textContent).replace(/[＊*]/gu,"").trim();
  if(!label||!(expectedLabel===label||expectedLabel.endsWith(` · ${label}`)))return result("field_identity_mismatch");
  const radios=[...group.querySelectorAll<HTMLInputElement>("input[type=radio].ud__radio__input")];
  const visible=(element:Element|null):element is HTMLElement=>{
    if(!(element instanceof HTMLElement)||!element.isConnected)return false;
    const box=element.getBoundingClientRect();
    if(!box.width||!box.height)return false;
    for(let node:Element|null=element;node;node=node.parentElement){const style=getComputedStyle(node);
      if(node.matches("[hidden],[aria-hidden=true]")||style.display==="none"||style.visibility==="hidden"||style.opacity==="0")return false;}
    return true;
  };
  const entries=radios.map(radio=>{const wrapper=radio.closest<HTMLLabelElement>("label.ud__radio__wrapper");
    const ownedLabel=wrapper?.querySelector(".ud__radio__label-content");
    return {radio,wrapper,label:visible(ownedLabel??null)&&wrapper?.querySelectorAll("input").length===1?normalize(ownedLabel?.textContent):"",
      disabled:radio.disabled||radio.matches(":disabled")||radio.getAttribute("aria-disabled")==="true"||wrapper?.getAttribute("aria-disabled")==="true"};});
  if(entries.length<2||entries.some(e=>!e.label)||new Set(entries.map(e=>e.label)).size!==entries.length||radios.some(r=>r.closest(".ud__radio-group")!==group))return result("control_ambiguous");
  const checked=entries.filter(e=>e.radio.checked),options=entries.filter(e=>!e.disabled).map(e=>e.label);
  if(checked.length>1)return result("selection_ambiguous","",options);
  const actual=checked[0]?.label??"";
  const validationCleared=![...root.querySelectorAll(".ud-formily-item-error-help,[role=alert]")].some(e=>visible(e)&&normalize(e.textContent));
  const selected=entries.find(e=>!e.disabled&&e.label===expected);
  if(!selected?.wrapper)return result("option_unavailable",actual,options,validationCleared);
  if(actual===expected)return result("selected",actual,options,validationCleared);
  if(prepare)selected.wrapper.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"});
  const rect=selected.wrapper.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const hit=document.elementFromPoint(x,y);
  if(!visible(selected.wrapper)||x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!selected.wrapper.contains(hit))return result("target_not_clickable",actual,options,validationCleared);
  return result("ready",actual,options,validationCleared,{x,y,tagName:hit.tagName,className:String((hit as HTMLElement).className??"")});
}

export async function executeFeishuRadioGroup(io:{
  inspect(prepare:boolean):Promise<FeishuRadioProbe|null>;
  prepareSurface():Promise<unknown>;
  click(point:NonNullable<FeishuRadioProbe["point"]>):Promise<unknown>;
  wait(ms:number):Promise<unknown>;
}, expected:string, allowReplace=false) {
  let clicks=0;
  const finish=(success:boolean,status:string,probe:FeishuRadioProbe|null)=>({success,status,actual:probe?.actual??"",options:probe?.options??[],clicks});
  await io.prepareSurface();
  let probe=await io.inspect(true);
  if(!probe||!expected||!probe.options.includes(expected))return finish(false,probe?.status??"control_missing",probe);
  if(probe.actual&&probe.actual!==expected&&!allowReplace)return finish(false,"existing_value_conflict",probe);
  if(probe.actual!==expected){
    if(probe.status!=="ready"||!probe.point)return finish(false,probe.status,probe);
    await io.click(probe.point); clicks=1;
  }
  let stable=0;
  for(let index=0;index<8;index++){
    await io.wait(100); probe=await io.inspect(false);
    if(!probe)return finish(false,"control_missing",probe);
    if(probe.status==="selected"&&probe.actual===expected&&probe.validationCleared){if(++stable===2)return finish(true,"selected",probe);}
    else stable=0;
    if(!["selected","ready"].includes(probe.status))return finish(false,probe.status,probe);
  }
  return finish(false,"radio_readback_failed",probe);
}
