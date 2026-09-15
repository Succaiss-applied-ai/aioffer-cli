export type FeishuAtsxChoiceKind = "atsx_flat" | "atsx_city_tree";
export type FeishuChoicePoint = { x: number; y: number };
export interface FeishuAtsxChoiceProbe {
  status: string;
  kind: FeishuAtsxChoiceKind | null;
  actual: string;
  options: string[];
  popupCount: number;
  validationCleared: boolean;
  controlPoint: FeishuChoicePoint | null;
  closePoint: FeishuChoicePoint | null;
  optionPoint: FeishuChoicePoint | null;
}

/** Serializable DOM probe. Scroll is target preparation, never selection.
 * ARIA-bound flat menus and the evidenced anchored Li leaf tree are distinct. */
export function inspectFeishuAtsxChoiceInPage(
  selector: string, expectedLabel: string, value: string,
  phase: "observe" | "prepare_open" | "prepare_option" = "observe",
  openedByAttempt = false
): FeishuAtsxChoiceProbe {
  const normalize = (v: unknown) => String(v ?? "").replace(/\s+/gu," ").trim();
  const result: FeishuAtsxChoiceProbe = {status:"control_missing",kind:null,actual:"",options:[],popupCount:0,
    validationCleared:false,controlPoint:null,closePoint:null,optionPoint:null};
  const visible = (e: Element | null): e is HTMLElement => {
    if (!(e instanceof HTMLElement) || !e.isConnected || !e.getBoundingClientRect().width || !e.getBoundingClientRect().height) return false;
    for(let n:HTMLElement|null=e;n;n=n.parentElement){const s=getComputedStyle(n);if(n.hidden||n.getAttribute("aria-hidden")==="true"||s.display==="none"||s.visibility==="hidden"||s.opacity==="0")return false;}
    return true;
  };
  const point = (e:HTMLElement):FeishuChoicePoint|null => {
    const r=e.getBoundingClientRect(), x=r.left+r.width/2,y=r.top+r.height/2;
    if(x<0||y<0||x>=innerWidth||y>=innerHeight)return null;
    const hit=document.elementFromPoint(x,y);return hit&&(hit===e||e.contains(hit))?{x,y}:null;
  };
  let matches:Element[]=[];try{matches=[...document.querySelectorAll(selector)];}catch{return result;}
  if(matches.length!==1)return {...result,status:matches.length?"control_ambiguous":"control_missing"};
  const control=matches[0]!;
  if(!visible(control)||!control.matches("div.atsx-select-selection--single[role='combobox']")||
    control.closest(".atsx-select-combobox,[aria-disabled='true'],.atsx-select-disabled"))return result;
  const select=control.closest<HTMLElement>(".atsx-select");
  const root=control.closest<HTMLElement>(".atsx-form-item,.ud-formily-item");
  if(!select||!root||root.querySelectorAll(".atsx-select-selection[role='combobox']").length!==1)return result;
  const label=root.matches(".ud-formily-item")?root.querySelector<HTMLElement>(".ud-formily-item-label-content"):
    root.querySelector<HTMLElement>(".atsx-form-item-label > label");
  const leaf=normalize(label?.querySelector(".customResumeForm-fieldName")?.textContent||label?.textContent).replace(/[＊*]/gu,"").trim();
  if(!leaf||leaf!==normalize(expectedLabel).split("·").at(-1)?.trim())return {...result,status:"field_identity_mismatch"};
  if(phase==="prepare_open")control.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});
  result.controlPoint=point(control);result.closePoint=visible(label)?point(label):null;
  const displays=[...control.querySelectorAll<HTMLElement>(".atsx-select-selection-selected-value")].filter(visible);
  if(displays.length>1)return {...result,status:"selected_value_ambiguous"};
  result.actual=normalize(displays[0]?.textContent);
  result.validationCleared=!root.querySelector("[aria-invalid='true']")&&![...root.querySelectorAll<HTMLElement>(".atsx-form-explain,.ud-formily-item-error-help")]
    .some(e=>visible(e)&&e.closest(".atsx-form-item,.ud-formily-item")===root&&normalize(e.textContent));
  const popups=[...document.querySelectorAll<HTMLElement>(".atsx-select-dropdown")].filter(visible);
  result.popupCount=popups.length;
  if(!popups.length)return {...result,status:"popup_closed"};
  if(popups.length!==1)return {...result,status:"popup_ambiguous"};
  const popup=popups[0]!;
  const ids=normalize(control.getAttribute("aria-controls")||control.getAttribute("aria-owns")).split(" ").filter(Boolean);
  const linked=ids.length===1?[...document.querySelectorAll("[id]")].filter(e=>e.id===ids[0]):[];
  const ariaOwned=linked.length===1&&(linked[0]===popup||popup.contains(linked[0]!));
  if(!ariaOwned){
    // Li's observed tree omits the aria-controls target. The dedicated form
    // portal must be anchored to the sole expanded/focused trigger we opened.
    const scope=control.closest(".resumeEditForm-wrapper");
    const a=control.getBoundingClientRect(),b=popup.getBoundingClientRect();
    const anchored=Math.abs(a.left-b.left)<=2&&Math.abs(a.width-b.width)<=2&&
      (Math.abs(b.top-a.bottom)<=8||Math.abs(a.top-b.bottom)<=8);
    if(!openedByAttempt||!scope?.contains(popup)||!control.contains(document.activeElement)||
      control.getAttribute("aria-expanded")!=="true"||
      scope.querySelectorAll(".atsx-select-selection[aria-expanded='true']").length!==1||!anchored||
      !popup.querySelector(".atsx-select-tree-wrapper > [role='tree']"))return {...result,status:"popup_owner_unproven"};
  }
  const trees=[...popup.querySelectorAll<HTMLElement>(".atsx-select-tree-wrapper > [role='tree']")];
  const lists=[...popup.querySelectorAll<HTMLElement>("ul[role='listbox']")];
  let leaves:HTMLElement[]=[];
  if(trees.length===1&&!lists.length){
    const items=[...trees[0]!.querySelectorAll<HTMLElement>("li[role='treeitem']")];
    if(!items.length||items.some(e=>e.querySelector("[role='group'],[role='treeitem'],ul")||!e.querySelector(":scope > .atsx-tree-switcher-noop")))return {...result,status:"unsupported_tree_depth"};
    leaves=items.map(e=>e.querySelector<HTMLElement>(":scope > .atsx-tree-node-content-wrapper")).filter((e):e is HTMLElement=>!!e&&visible(e));
    result.kind="atsx_city_tree";
    if(!/^(?:意向城市|期望工作城市|期望城市)$/u.test(leaf))return {...result,status:"unsupported_tree_semantics"};
  }else if(lists.length===1&&!trees.length){
    if(popup.querySelector("[role='tree'],[role='grid'],[role='group']"))return {...result,status:"unsupported_popup_structure"};
    leaves=[...lists[0]!.querySelectorAll<HTMLElement>(":scope > li[role='option']")].filter(visible);
    result.kind="atsx_flat";
  }else return {...result,status:"popup_loading_or_unsupported"};
  leaves=leaves.filter(e=>!e.closest("[aria-disabled='true'],[disabled],.atsx-select-dropdown-menu-item-disabled,.atsx-tree-treenode-disabled"));
  const optionLabel=(e:HTMLElement)=>normalize(e.querySelector(".atsx-clamp-content[data-cy-value]")?.getAttribute("data-cy-value")||e.textContent);
  result.options=leaves.map(optionLabel).filter(Boolean);
  if(!result.options.length)return {...result,status:"popup_loading_or_unsupported"};
  if(!value)return {...result,status:"ready"};
  const options=leaves.filter(e=>optionLabel(e)===normalize(value));
  if(options.length!==1)return {...result,status:options.length?"option_ambiguous":"option_unavailable"};
  if(phase==="prepare_option")options[0]!.scrollIntoView({behavior:"instant",block:"nearest",inline:"nearest"});
  result.optionPoint=point(options[0]!);
  return {...result,status:result.optionPoint?"ready":"option_not_clickable"};
}

export interface FeishuAtsxChoiceExecution {
  inspect(value:string,phase:"observe"|"prepare_open"|"prepare_option",opened:boolean):Promise<FeishuAtsxChoiceProbe|null>;
  prepareSurface():Promise<void>;
  click(point:FeishuChoicePoint):Promise<void>;
  wait(ms:number):Promise<void>;
}
export interface FeishuAtsxChoiceResult {
  success:boolean;status:string;kind:FeishuAtsxChoiceKind|null;actual:string;options:string[];
  validationCleared:boolean;popupClosed:boolean;
  ledger:{open:number;select:number;close:number;retry:0};
}

/** One non-writing discovery OR one locked variant's fill; no fallback. */
export async function executeFeishuAtsxChoice(
  io:FeishuAtsxChoiceExecution, target:{value:string;kind?:FeishuAtsxChoiceKind;discover?:boolean}
):Promise<FeishuAtsxChoiceResult>{
  const ledger={open:0,select:0,close:0,retry:0 as const};
  let state=await io.inspect(target.value,"observe",false);
  let kind=target.kind??null;
  let options:string[]=[];
  const finish=(success:boolean,status:string):FeishuAtsxChoiceResult=>({success,status,kind,actual:state?.actual??"",options,
    validationCleared:state?.validationCleared??false,popupClosed:state?.popupCount===0,ledger});
  if(!state||state.status!=="popup_closed")return finish(false,state?.status??"control_missing");
  const initial=state.actual;
  if(!target.discover&&target.kind&&initial===target.value&&state.validationCleared)return finish(true,"already_committed");
  if(!target.discover&&initial&&initial!==target.value)return finish(false,"existing_value_conflict");
  await io.prepareSurface();state=await io.inspect(target.value,"prepare_open",false);
  if(!state?.controlPoint||state.popupCount!==0)return finish(false,"control_not_clickable");
  await io.click(state.controlPoint);ledger.open++;
  for(let i=0;i<12;i++){
    await io.wait(100);state=await io.inspect(target.value,"observe",true);
    if(state?.kind&&state.options.length&&["ready","option_unavailable","option_not_clickable"].includes(state.status))break;
    if(state&&["popup_ambiguous","popup_owner_unproven","unsupported_tree_depth","field_identity_mismatch"].includes(state.status))return finish(false,state.status);
  }
  if(!state?.kind||!state.options.length)return finish(false,state?.status??"popup_timeout");
  options=state.options;
  if(target.kind&&state.kind!==target.kind)return finish(false,"control_route_changed");
  kind=state.kind;
  if(target.discover){
    if(!state.closePoint)return finish(false,"close_target_missing");
    await io.click(state.closePoint);ledger.close++;
    for(let i=0;i<8;i++){await io.wait(100);state=await io.inspect("","observe",false);if(state?.popupCount===0)break;}
    return finish(state?.popupCount===0&&state.actual===initial,state?.actual!==initial?"discovery_changed_value":state?.popupCount===0?"discovered":"popup_not_closed");
  }
  if(!target.kind)return finish(false,"route_not_locked");
  state=await io.inspect(target.value,"prepare_option",true);
  if(state?.kind!==target.kind||state.status!=="ready"||!state.optionPoint)return finish(false,state?.status??"option_missing");
  await io.click(state.optionPoint);ledger.select++;
  for(let i=0;i<12;i++){
    await io.wait(100);state=await io.inspect(target.value,"observe",true);
    if(state?.popupCount===0&&state.actual===target.value&&state.validationCleared)return finish(true,"committed");
  }
  return finish(false,state?.validationCleared?"readback_mismatch":"validation_not_cleared");
}
