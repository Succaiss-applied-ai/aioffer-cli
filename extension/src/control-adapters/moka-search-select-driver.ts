import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import {observeApplicationPage, type FillInstruction} from "../page-adapter.js";
import {submissionActionPatterns} from "../submission-action-policy.js";
import {bindObservedInstruction, evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
import {inspectMokaLegacySchoolInPage} from "./moka-legacy-school-probe.js";
import {inspectMokaSharedSelectInPage, normalizeMokaFlatSelectValue, mokaFlatSelectValuesMatch, type MokaFlatSelectPoint} from "./moka-shared-select-driver.js";

export const MOKA_SEARCH_SELECT = "moka.search-select.trusted-focus.v1";

/** Serialized, read-only probe. A query is never a committed school value. */
export function inspectMokaSearchQueryInPage(selector: string) {
  const matches = [...document.querySelectorAll(selector)];
  const input = matches[0];
  if (matches.length !== 1 || !(input instanceof HTMLInputElement) || input.type !== "text" ||
    input.readOnly || input.disabled) return null;
  const select = input.closest<HTMLElement>("[class*='sd-Select-container']");
  const field = input.closest<HTMLElement>("[class*='apply-field-']");
  const dropdown = select?.closest<HTMLElement>("[class*='sd-Dropdown-container']");
  if (!select || !field || !dropdown || select.querySelectorAll("input").length !== 1 ||
    !/\bstring_info-/u.test(field.className) || field.querySelectorAll("input:not([type=hidden])").length !== 1) return null;
  const titles = [...field.children].filter(el => /(?:^|\s)title-/u.test(el.className));
  if (titles.length !== 1) return null;
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && !el.closest('[hidden],[aria-hidden="true"]') &&
      getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
  };
  const popups = [...dropdown.querySelectorAll<HTMLElement>("[class*='Dropdown-dropdown']")].filter(visible);
  const popup = popups.length === 1 ? popups[0] : null;
  const empty = popup && [...popup.querySelectorAll("[class*='Empty-empty-wrapper']")].some(el => visible(el) && /暂无选项/u.test(el.textContent ?? ""));
  const creationFooter = popup && [...popup.querySelectorAll("[class*='custom-option'] button")].filter(visible).length === 1;
  return {query: input.value, focused: document.activeElement === input,
    emptySearch: Boolean(empty && creationFooter && !popup?.querySelector("[role=tree],[role=grid],[class*='calendar'],[class*='cascader'],[class*='Menu-content-item']"))};
}

/** Search is this Driver's first mechanism, never a fallback after flat Select
 * failure. Focus once, type the exact authorized query once, select one exact
 * returned result and require the owned committed display/validation readback. */
export async function executeMokaSearchSelectDriver(input: {
  tabId: number; instruction: FillInstruction; discoverOptions?: boolean;
  prepareSurface(): Promise<void>;
  clickPoint(point: MokaFlatSelectPoint): Promise<void>;
  typeQuery(text: string): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}) {
  const ledger = {focusClickCount: 0, queryCount: 0, queryPollCount: 0, leafClickCount: 0, commitClickCount: 0, readbackPollCount: 0};
  let bindingFailure: string | null = null;
  const queryStates: Array<{poll:number;status:string;popupCount:number;matchingLeafCount:number;optionCount:number;emptySearch:boolean;point:{x:number;y:number}|null}> = [];
  let actual = ""; let popupClosed = true; let validationCleared = false; let availableOptions: string[] = [];
  const finish = (success: boolean, stage: string, code: string | null, detail: string) => ({
    success, stage, actual, popupClosed, validationCleared, availableOptions,
    error: success ? null : `moka_search_select_interaction_failed: [${stage}/${code}] ${detail}`,
    diagnostics: {schemaVersion: "moka-search-select-driver-diagnostic.v1", failureCode: code,
      eventMechanism: "cdp_trusted_pointer_and_exact_search_query", ledger: {...ledger}, bindingFailure, queryStates: [...queryStates]}
  });
  const expected = String(input.instruction.value ?? "").trim();
  const inspect = async (phase: "observe" | "prepare_open" | "commit" = "observe") => {
    const page = (await executeInterruptibleScript({target:{tabId:input.tabId},func:observeApplicationPage,args:[submissionActionPatterns]}))[0]?.result;
    if (!page || page.pageStage !== "application_form" || page.url !== input.instruction.applicationUrl) {
      bindingFailure = !page ? "page_unavailable" : page.url !== input.instruction.applicationUrl ? "url_changed" : "page_stage_changed";
      return null;
    }
    const field = bindObservedInstruction(page, input.instruction);
    if (!field) {bindingFailure="field_identity_missing_or_ambiguous";return null;}
    const route = resolveControlAdapter(evidenceForField(page,field,input.instruction));
    if (![MOKA_SEARCH_SELECT, "moka.legacy-school-search.trusted-focus.v1"].includes(route.code) || input.instruction.controlAdapter?.registrationId !== route.code) {bindingFailure="registered_route_changed";return null;}
    const legacy = route.code === "moka.legacy-school-search.trusted-focus.v1"
      ? (await executeInterruptibleScript({target:{tabId:input.tabId},world:"MAIN",func:inspectMokaLegacySchoolInPage,args:[field.selector,expected,phase,ledger.leafClickCount === 1]}))[0]?.result : null;
    const probe = route.code === "moka.legacy-school-search.trusted-focus.v1" ? legacy?.probe
      : (await executeInterruptibleScript({target:{tabId:input.tabId},world:"MAIN",func:inspectMokaSharedSelectInPage,args:[field.selector,expected,phase,null,true]}))[0]?.result;
    const query = route.code === "moka.legacy-school-search.trusted-focus.v1" ? legacy?.query
      : (await executeInterruptibleScript({target:{tabId:input.tabId},world:"MAIN",func:inspectMokaSearchQueryInPage,args:[field.selector]}))[0]?.result;
    if (!probe || !query || ["control_missing","control_ambiguous"].includes(probe.status)) {bindingFailure="owned_probe_missing_or_ambiguous";return null;}
    bindingFailure=null;
    actual=probe.actual;popupClosed=probe.popupCount===0;validationCleared=probe.validationCleared;availableOptions=probe.availableOptions;
    return {probe,query};
  };
  const accepted = () => mokaFlatSelectValuesMatch(actual, expected) && popupClosed && validationCleared;
  const exactResult = (state: NonNullable<Awaited<ReturnType<typeof inspect>>>) =>
    state.probe.status==="ready" && state.probe.matchingLeafCount===1 && Boolean(state.probe.leafPoint) &&
    state.probe.availableOptions.some(option=>normalizeMokaFlatSelectValue(option)===normalizeMokaFlatSelectValue(expected));
  const resultSignature = (state: NonNullable<Awaited<ReturnType<typeof inspect>>>) =>
    JSON.stringify([state.probe.availableOptions,state.probe.leafPoint &&
      {x:Math.round(state.probe.leafPoint.x),y:Math.round(state.probe.leafPoint.y)}]);
  try {
    if (!expected || input.discoverOptions) return finish(false,"detect","search_query_required","检索控件需要明确查询内容，不能空查全部选项");
    const initial=await inspect();
    if (!initial) return finish(false,"detect","control_target_missing","搜索控件身份或签名无法确认");
    if (accepted()) return finish(true,"readback",null,"");
    if (actual) return finish(false,"detect","preexisting_value_mismatch","已有选中值，未清空或覆盖");
    if (initial.query.query || initial.probe.popupCount) return finish(false,"detect","unexpected_query_state","已有搜索草稿或弹层，未接管或重复搜索");
    await input.prepareSurface();
    const prepared=await inspect("prepare_open");
    if (!prepared?.probe.controlPoint || !popupClosed) return finish(false,"focus","control_not_clickable","搜索输入未形成唯一可点击状态");
    const focus=await inspect();
    if (!focus?.probe.controlPoint || focus.query.query || focus.probe.popupCount) return finish(false,"focus","focus_target_stale","搜索输入状态已变化");
    await input.clickPoint(focus.probe.controlPoint);ledger.focusClickCount++;
    const queryTarget=await inspect();
    if (!queryTarget?.query.focused || queryTarget.query.query || queryTarget.probe.actual) return finish(false,"query","query_target_stale","焦点未落到原搜索输入，未输入查询");
    await input.typeQuery(expected);ledger.queryCount++;
    let ready: Awaited<ReturnType<typeof inspect>> = null;
    let lastSignature="";let stable=0;let lastUnsupportedStructure=false;
    for(let attempt=0;attempt<40;attempt++) {
      await input.wait(180);
      ledger.queryPollCount++;
      const state=await inspect();
      if (!state) return finish(false,"query","control_target_missing","检索期间原字段身份失联");
      queryStates.push({poll:ledger.queryPollCount,status:state.probe.status,popupCount:state.probe.popupCount,
        matchingLeafCount:state.probe.matchingLeafCount,optionCount:state.probe.availableOptions.length,
        emptySearch:state.query.emptySearch,point:state.probe.leafPoint &&
          {x:Math.round(state.probe.leafPoint.x),y:Math.round(state.probe.leafPoint.y)}});
      if(queryStates.length>12)queryStates.shift();
      if (state.query.query!==expected || actual) return finish(false,"query","query_changed","检索内容或已提交值发生变化");
      if (state.probe.status==="popup_ambiguous" || state.probe.status==="leaf_ambiguous") return finish(false,"query",state.probe.status,"搜索结果不唯一，未选择");
      // The owned async search can render neither leaves nor an empty-state
      // message on its first frame (observed on JoyCastle). Keep observing in
      // this same bounded query window; only exactResult can authorize a click.
      lastUnsupportedStructure=state.probe.status==="unsupported_popup_structure" && !state.query.emptySearch;
      if (exactResult(state)) {
        const signature=resultSignature(state);
        stable=signature===lastSignature?stable+1:1;lastSignature=signature;
        if(stable>=2){ready=state;break;}
      } else {stable=0;lastSignature="";}
    }
    if (!ready) return lastUnsupportedStructure
      ? finish(false,"query","unsupported_popup_structure","等待后搜索结果结构仍未支持，未执行选择")
      : finish(false,"query","search_result_unconfirmed","等待后仍未确认完整精确结果，未选择相似结果或添加新选项");
    const leaf=await inspect();
    if (!leaf || leaf.query.query!==expected || !exactResult(leaf) || resultSignature(leaf)!==lastSignature) return finish(false,"select","leaf_target_stale","点击前精确结果或位置已变化");
    await input.clickPoint(leaf.probe.leafPoint!);ledger.leafClickCount++;
    for(let attempt=0;attempt<25;attempt++) {
      await input.wait(180);ledger.readbackPollCount++;
      const state=await inspect();
      if (!state) return finish(false,"readback","control_target_missing","选择后字段身份失联");
      if (accepted()) return finish(true,"readback",null,"");
      if (actual && !mokaFlatSelectValuesMatch(actual, expected)) return finish(false,"readback","readback_mismatch","站点提交值与目标名称不同");
      if (actual && popupClosed && !validationCleared && !ledger.commitClickCount) {
        const commit=await inspect("commit");
        if (!commit?.probe.commitPoint) return finish(false,"commit","commit_target_missing","没有唯一所属标题可完成失焦提交");
        await input.clickPoint(commit.probe.commitPoint);ledger.commitClickCount++;
      }
    }
    return finish(false,"readback","readback_unconfirmed","未确认已提交选项、弹层关闭和校验清除");
  } catch(error) {
    return finish(false,"interaction","search_driver_interrupted",error instanceof Error?error.message:String(error));
  }
}
