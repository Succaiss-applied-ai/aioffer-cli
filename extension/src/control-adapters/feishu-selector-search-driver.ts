export type SelectorSearchPoint = { x: number; y: number };
export interface SelectorSearchProbe {
  status: string; query: string; selected: string[]; options: string[];
  popupCount: number; focused: boolean; validationCleared: boolean;
  inputPoint: SelectorSearchPoint | null; optionPoint: SelectorSearchPoint | null;
  closePoint: SelectorSearchPoint | null;
  closeWithEscape?: boolean;
  removePoint?: SelectorSearchPoint | null;
  optionSelected?: boolean;
  popupKind?: "formily_selector_flat" | "formily_location_tree";
}
export type SelectorSearchPhase = "observe" | "prepare_input" | "prepare_option" | "prepare_remove";

/** MAIN-world locator. Search text and committed selected values are independent. */
export function inspectFeishuSelectorSearchInPage(selector: string, label: string, value: string,
  multiple: boolean, phase: SelectorSearchPhase = "observe", queried = false,
  locationPath: string[] | null = null, classify = false): SelectorSearchProbe {
  const normalize = (v: unknown) => String(v ?? "").replace(/\s+/gu, " ").trim();
  const result: SelectorSearchProbe = { status:"control_missing",query:"",selected:[],options:[],popupCount:0,
    focused:false,validationCleared:false,inputPoint:null,optionPoint:null,closePoint:null };
  const visible = (e: Element | null): e is HTMLElement => {
    if (!(e instanceof HTMLElement) || !e.isConnected || !e.getBoundingClientRect().width || !e.getBoundingClientRect().height) return false;
    for (let n: HTMLElement | null = e; n; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (n.hidden || n.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  };
  const point = (e: HTMLElement): SelectorSearchPoint | null => {
    const r=e.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
    if (x<0 || y<0 || x>=innerWidth || y>=innerHeight) return null;
    const hit=document.elementFromPoint(x,y);
    return hit && (hit===e || e.contains(hit)) ? {x,y} : null;
  };
  let controls: Element[]=[];
  try { controls=[...document.querySelectorAll(selector)]; } catch { return result; }
  if (controls.length!==1) return {...result,status:controls.length?"control_ambiguous":"control_missing"};
  const input=controls[0]!;
  if (!(input instanceof HTMLInputElement) || !visible(input) || input.disabled || input.readOnly ||
    !input.matches("input.ud__select__selector__search__input[type='search'][role='combobox']")) return result;
  const root=input.closest<HTMLElement>(".ud-formily-item"), select=input.closest<HTMLElement>(".ud__select"),
    trigger=input.closest<HTMLElement>(".ud__select__selector");
  if (!root || !select || !trigger || select.querySelectorAll("input").length!==1 ||
    trigger.classList.contains("ud__select__selector-multiple")!==multiple) return result;
  const title=root.querySelector<HTMLElement>(".ud-formily-item-label-content");
  if (normalize(title?.textContent).replace(/[＊*]/gu,"").trim()!==normalize(label).split("·").at(-1)?.trim())
    return {...result,status:"field_identity_mismatch"};
  if (phase==="prepare_input") trigger.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});
  // The committed display overlays a pointer-events:none search input until
  // its selector is activated. The runtime still requires the exact input to
  // become focused with an empty query before sending any trusted text.
  result.inputPoint=point(trigger); result.closePoint=visible(title)?point(title):null;
  result.query=normalize(input.value); result.focused=document.activeElement===input;
  result.selected=[...select.querySelectorAll<HTMLElement>(multiple ?
    ".ud__select__selector__tag .ud__tag__content" : ".ud__select__selector__selectItem")]
    .filter(e=>visible(e)&&!e.closest(".ud__select__dropdown")).map(e=>normalize(e.textContent)).filter(Boolean);
  if (!multiple && result.selected.length>1) return {...result,status:"selected_value_ambiguous"};
  result.validationCleared=!root.querySelector("[aria-invalid='true']") &&
    ![...root.querySelectorAll<HTMLElement>(".ud-formily-item-error-help,[role='alert']")]
      .some(e=>visible(e)&&e.closest(".ud-formily-item")===root&&normalize(e.textContent));
  const popups=[...document.querySelectorAll<HTMLElement>(".ud__select__dropdown")].filter(visible);
  result.popupCount=popups.length;
  if (!popups.length && phase === "prepare_remove") {
    if (!multiple || result.query) return {...result,status:"remove_not_ready"};
    const tags=[...select.querySelectorAll<HTMLElement>(".ud__select__selector__tag")]
      .filter(tag=>visible(tag)&&normalize(tag.querySelector(".ud__tag__content")?.textContent)===normalize(value));
    if (tags.length!==1) return {...result,status:"remove_target_ambiguous"};
    const close=tags[0]!.querySelector<HTMLElement>(".ud__tag__close-icon");
    if (!visible(close)) return {...result,status:"remove_target_missing"};
    close.scrollIntoView({behavior:"instant",block:"nearest",inline:"nearest"});
    result.removePoint=point(close);
    return {...result,status:result.removePoint?"remove_ready":"remove_not_clickable"};
  }
  if (!popups.length) return {...result,status:"popup_closed"};
  if (popups.length!==1) return {...result,status:"popup_ambiguous"};
  const popup=popups[0]!, a=select.getBoundingClientRect(), b=popup.getBoundingClientRect();
  if (!queried || !result.focused || !trigger.classList.contains("ud__select__selector-open") ||
    document.querySelectorAll(".ud__select__selector-open").length!==1 ||
    Math.abs(a.left-b.left)>2 || Math.abs(a.width-b.width)>2 ||
    Math.min(Math.abs(a.bottom-b.top),Math.abs(a.top-b.bottom))>8) return {...result,status:"popup_owner_unproven"};
  if (popup.querySelector("[role='grid'],[class*='cascader'],[class*='picker-panel']"))
    return {...result,status:"unsupported_popup_structure"};
  const trees=popup.querySelectorAll(".ud__treeSelect__overlay");
  const flat=popup.querySelectorAll(".ud__select__list__item");
  if (trees.length>1 || (trees.length && flat.length) || (!trees.length && popup.querySelector("[role='tree'],.ud__tree")))
    return {...result,status:"unsupported_popup_structure"};
  const locationTree = trees.length===1 && /(?:^|\s)citySelectWrapper(?:__|\s|$)/u.test(popup.className);
  if (trees.length && !locationTree && (classify || locationPath)) return {...result,status:"unsupported_popup_structure"};
  if (locationPath && !locationTree) return {...result,status:"control_route_changed"};
  if (!locationPath && !classify && multiple && trees.length!==1) return {...result,status:"unsupported_popup_structure"};
  if (locationTree) result.popupKind="formily_location_tree";
  else if (!trees.length && flat.length) result.popupKind="formily_selector_flat";
  // An upward popup can cover its own title. Escape belongs to this proven,
  // focused selector; it must never be sent for an unrelated overlay.
  if (classify && result.popupKind && !result.closePoint && b.top<a.top && b.bottom<=a.top+8)
    result.closeWithEscape=true;
  const leaves=[...popup.querySelectorAll<HTMLElement>(trees.length ? ".ud__tree__node__label" : ".ud__select__list__item")]
    .filter(visible).filter(e=>!e.closest("[disabled],[aria-disabled='true'],.ud__select__list__item-disabled,.ud__tree__node-disabled"));
  const text=(e:HTMLElement)=>normalize(trees.length?e.textContent:e.querySelector(".ud__select__list__item__content")?.textContent||e.textContent);
  result.options=leaves.map(text).filter(Boolean);
  if (classify) return {...result,status:result.popupKind?"classified":"options_pending"};
  if (result.query!==normalize(value)) return {...result,status:"query_changed"};
  let matched=leaves.filter(e=>text(e)===normalize(value));
  if (locationPath) {
    // Flat virtualized rows encode their visible ancestry through indentation.
    // A missing ancestor is unknown, never reconstructed from the target fact.
    const part=(s:string)=>{const n=normalize(s),regions:Record<string,string>={"广西壮族自治区":"广西","宁夏回族自治区":"宁夏","新疆维吾尔自治区":"新疆","内蒙古自治区":"内蒙古","西藏自治区":"西藏"};
      return n==="中国"||n==="中华人民共和国"?"中国大陆":regions[n]??(/^[\p{Script=Han}]{2,12}[省市]$/u.test(n)?n.slice(0,-1):n);};
    const paths=new Map<Element,string[]>(), stack:string[]=[];
    for (const node of popup.querySelectorAll<HTMLElement>(".ud__tree__node")) {
      const target=node.querySelector<HTMLElement>(".ud__tree__node__label");
      if (!target || !visible(target)) continue;
      const depth=node.querySelectorAll(".ud__tree__node__indent").length;
      stack.length=Math.min(stack.length,depth);
      if (stack.length!==depth) continue;
      stack.push(part(text(target))); paths.set(target,[...stack]);
    }
    matched=(locationPath.length>1?leaves.filter(e=>part(text(e))===part(value)):matched).filter(e=>{
      const path=paths.get(e);
      return path && locationPath.length<=path.length && locationPath.every((p,i)=>part(p)===path[path.length-locationPath.length+i]);
    });
  }
  if (matched.length!==1) return {...result,status:matched.length?"option_ambiguous":"option_unavailable"};
  if (phase==="prepare_option") matched[0]!.scrollIntoView({behavior:"instant",block:"nearest",inline:"nearest"});
  result.optionPoint=point(matched[0]!);
  if (locationTree && multiple) {
    const checked=matched[0]!.closest(".ud__tree__node")?.querySelector<HTMLInputElement>("input.ud__checkbox__input[type='checkbox']");
    result.optionSelected=checked?.checked===true && checked.getAttribute("aria-checked")==="true";
  }
  return {...result,status:result.optionPoint?"ready":"option_not_clickable"};
}

export interface SelectorSearchIO {
  inspect(value:string,phase:SelectorSearchPhase,queried:boolean):Promise<SelectorSearchProbe|null>;
  prepareSurface():Promise<void>;
  click(point:SelectorSearchPoint):Promise<void>;
  typeQuery(value:string):Promise<void>;
  wait(ms:number):Promise<void>;
}

/** Each desired value gets one query and one exact selection; no alternate query. */
export async function executeFeishuSelectorSearch(io:SelectorSearchIO, values:string[], multiple=false,
  policy: { retainOnlyTargets?: boolean; verifyExisting?: string[] } = {}) {
  const normalize=(v:string)=>v.replace(/\s+/gu," ").trim();
  const targets=values.map(normalize), ledger={focus:0,query:0,select:0,close:0,retry:0};
  let state=await io.inspect("","observe",false), options:string[]=[];
  const same=(a:string[],b:string[])=>a.length===b.length&&a.every(v=>b.includes(v));
  const finish=(success:boolean,status:string)=>({success,status,actual:multiple?JSON.stringify(state?.selected??[]):state?.selected[0]??"",
    selected:state?.selected??[],options,popupClosed:state?.popupCount===0,validationCleared:state?.validationCleared??false,ledger});
  if (!targets.length || targets.some(v=>!v) || new Set(targets).size!==targets.length || (!multiple&&targets.length!==1))
    return finish(false,"query_fact_missing");
  if (!state || state.status!=="popup_closed" || state.query) return finish(false,state?.query?"existing_query_unverified":state?.status??"control_missing");
  if (same(state.selected,targets)&&state.validationCleared&&!policy.verifyExisting?.length) return finish(true,"already_committed");
  if (multiple&&!policy.retainOnlyTargets&&state.selected.some(v=>!targets.includes(v))) return finish(false,"existing_selection_conflict");
  let committed=[...state.selected];
  await io.prepareSurface();
  for (const value of targets.filter(v=>!committed.includes(v)||policy.verifyExisting?.includes(v))) {
    state=await io.inspect(value,"prepare_input",false);
    if (!state?.inputPoint || state.popupCount!==0 || state.query || !same(state.selected,committed))
      return finish(false,"query_input_not_ready");
    await io.click(state.inputPoint); ledger.focus++;
    state=await io.inspect(value,"observe",true);
    if (!state?.focused || state.query) return finish(false,"query_input_not_focused");
    await io.typeQuery(value); ledger.query++;
    for (let i=0;i<30;i++) {
      await io.wait(100); state=await io.inspect(value,"observe",true);
      if (state?.status==="ready" || state?.status==="option_not_clickable") break;
      if (state&&["control_missing","control_ambiguous","field_identity_mismatch","popup_ambiguous","option_ambiguous","unsupported_popup_structure","query_changed"].includes(state.status))
        return finish(false,state.status);
    }
    state=await io.inspect(value,"prepare_option",true); options=state?.options??[];
    if (state?.status!=="ready" || !state.optionPoint) return finish(false,state?.status??"query_timeout");
    const verifySelected=multiple&&committed.includes(value);
    if (verifySelected && !state.optionSelected) return finish(false,"existing_selection_path_mismatch");
    if (!verifySelected) { await io.click(state.optionPoint); ledger.select++; }
    const expected=multiple?(verifySelected?committed:[...committed,value]):[value];
    if (verifySelected) {
      // The searched row proves the existing tag's path. Clicking it would
      // toggle the user's valid selection off; blur clears only the query.
      if (!state.closePoint) return finish(false,"commit_target_missing");
      await io.click(state.closePoint); ledger.close++;
    }
    // Only selected display/tags count; the editable query never supplies readback.
    for (let i=0;i<12;i++) {
      await io.wait(100); state=await io.inspect(value,"observe",true);
      if (state&&same(state.selected,expected)&&!state.query) break;
    }
    if (!state||!same(state.selected,expected)||state.query) return finish(false,"selection_not_committed");
    if (!state.closePoint) return finish(false,"commit_target_missing");
    if (!verifySelected) { await io.click(state.closePoint); ledger.close++; }
    let stable=0;
    for (let i=0;i<12;i++) {
      await io.wait(100); state=await io.inspect(value,"observe",false);
      if (state?.status==="popup_closed"&&!state.focused&&!state.query&&same(state.selected,expected)&&
        (expected.length<targets.length||state.validationCleared)) {
        if (++stable>=2) break;
      } else stable=0;
    }
    if (stable<2) return finish(false,state?.validationCleared?"commit_readback_mismatch":"validation_not_cleared");
    committed=expected;
  }
  if (multiple && policy.retainOnlyTargets) {
    // Only the explicit one-preferred-location policy may remove extras, and
    // only after its desired selection was committed. Never clear the field.
    for (const extra of committed.filter(value=>!targets.includes(value))) {
      state=await io.inspect(extra,"prepare_remove",false);
      if (state?.status!=="remove_ready"||!state.removePoint||!same(state.selected,committed)||state.query||state.popupCount)
        return finish(false,"remove_not_ready");
      await io.click(state.removePoint);
      const expected=committed.filter(value=>value!==extra);
      let stable=0;
      for (let i=0;i<12;i++) {
        await io.wait(100);state=await io.inspect(extra,"observe",false);
        if (state?.status==="popup_closed"&&!state.query&&same(state.selected,expected)&&state.validationCleared) {
          if (++stable>=2) break;
        } else stable=0;
      }
      if (stable<2) return finish(false,"remove_not_committed");
      committed=expected;
    }
  }
  return finish(same(committed,targets)&&Boolean(state?.validationCleared),"committed");
}
