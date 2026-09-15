import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import {observeApplicationPage, type FillInstruction} from "../page-adapter.js";
import {submissionActionPatterns} from "../submission-action-policy.js";
import {citySelectionValues, citySelectionSetMatches, uniqueCityOption} from "../city-option-matching.js";
import {bindObservedInstruction, evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
import {inspectMokaSharedSelectInPage, type MokaFlatSelectPoint} from "./moka-shared-select-driver.js";

export const MOKA_CITY_MULTI = "moka.work-city-multi.trusted-focus.v1";

/** Serialized read-only metadata; query and close icons never become values. */
export function inspectMokaCityMultiInPage(selector: string) {
  const controls = [...document.querySelectorAll(selector)];
  const control = controls[0];
  if (controls.length !== 1 || !(control instanceof HTMLInputElement) || control.type !== "text" ||
    control.readOnly || control.disabled || !/\bsd-Input-tag-input-/u.test(control.className)) return null;
  const select = control.closest<HTMLElement>("[class*='sd-Select-container'].multi_select_info");
  const container = control.closest<HTMLElement>("[class*='sd-Input-tag-container-']");
  if (!select || !container || select.querySelectorAll("input").length !== 1) return null;
  const visible = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  };
  if (!visible(control)) return null;
  const tags = [...container.querySelectorAll<HTMLElement>("[class*='sd-Tag-container-'][class*='sd-Input-tag-']")].filter(visible);
  const selected: string[] = [];
  for (const tag of tags) {
    const texts = [...tag.querySelectorAll<HTMLElement>("[class*='sd-Tag-text-']")].filter(visible);
    if (texts.length !== 1 || !texts[0]!.textContent?.trim()) return null;
    selected.push(texts[0]!.textContent!.trim());
  }
  if (new Set(selected).size !== selected.length) return null;
  const rect = control.getBoundingClientRect();
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  // Opening on the label centre can click an existing tag's delete icon.
  const inputPoint = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) === control
    ? {x, y, tagName: control.tagName, className: control.className} : null;
  return {selected, query: control.value, inputPoint};
}

/** One owned menu serves discovery and authorized multi-city selection. */
export async function executeMokaCityMultiDriver(input: {
  tabId: number; instruction: FillInstruction; discoverOptions?: boolean;
  prepareSurface(): Promise<void>;
  clickPoint(point: MokaFlatSelectPoint): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}) {
  const ledger = {openClickCount: 0, leafClickCount: 0, commitClickCount: 0, readbackPollCount: 0};
  let actual = "", popupClosed = true, validationCleared = false;
  let availableOptions: string[] = [];
  const finish = (success: boolean, stage: string, code: string | null, detail: string) => ({
    success, stage, actual, popupClosed, validationCleared, availableOptions,
    error: success ? null : `moka_city_multi_interaction_failed: [${stage}/${code}] ${detail}`,
    diagnostics: {schemaVersion: "moka-city-multi-driver-diagnostic.v1", failureCode: code,
      eventMechanism: "cdp_trusted_pointer_focus_emulation", ledger: {...ledger}}
  });
  const expected = String(input.instruction.value ?? "").trim();
  const wanted = citySelectionValues(expected);
  const inspect = async (leaf = "", phase: "observe" | "prepare_open" | "commit" = "observe") => {
    const page = (await executeInterruptibleScript({target: {tabId: input.tabId}, func: observeApplicationPage,
      args: [submissionActionPatterns]}))[0]?.result;
    if (!page || page.url !== input.instruction.applicationUrl || page.pageStage !== "application_form") return null;
    const field = bindObservedInstruction(page, input.instruction);
    if (!field) return null;
    const route = resolveControlAdapter(evidenceForField(page, field, input.instruction));
    if (route.code !== MOKA_CITY_MULTI || input.instruction.controlAdapter?.registrationId !== route.code) return null;
    const probe = (await executeInterruptibleScript({target: {tabId: input.tabId}, world: "MAIN",
      func: inspectMokaSharedSelectInPage, args: [field.selector, leaf, phase]}))[0]?.result;
    const state = (await executeInterruptibleScript({target: {tabId: input.tabId}, world: "MAIN",
      func: inspectMokaCityMultiInPage, args: [field.selector]}))[0]?.result;
    if (!probe || !state || ["control_missing", "control_ambiguous"].includes(probe.status)) return null;
    actual = state.selected.join("、"); popupClosed = probe.popupCount === 0; validationCleared = probe.validationCleared;
    if (probe.availableOptions.length) availableOptions = probe.availableOptions;
    return {probe, state};
  };
  const same = (left: string[], right: string[]) => left.length === right.length && left.every(value => right.includes(value));
  const selectedSubset = (selected: string[]) => selected.every(city => wanted.some(value => uniqueCityOption([city], value)));
  const rejectedPopup = (status: string) => ["popup_ambiguous", "unsupported_popup_structure"].includes(status);
  try {
    if (!input.discoverOptions && (!wanted.length || !citySelectionSetMatches(expected, expected))) {
      return finish(false, "detect", "invalid_city_set", "没有唯一明确的城市集合");
    }
    const initial = await inspect();
    if (!initial) return finish(false, "detect", "control_target_missing", "多选城市身份或签名未确认");
    if (initial.state.query) return finish(false, "detect", "preexisting_query", "保留用户已有检索草稿");
    const before = initial.state.selected;
    if (!input.discoverOptions && !selectedSubset(before)) return finish(false, "detect", "preexisting_value_mismatch", "已有未授权城市，未移除标签");
    if (!input.discoverOptions && citySelectionSetMatches(actual, expected) && popupClosed && validationCleared) {
      return finish(true, "readback", null, "");
    }
    if (!popupClosed) return finish(false, "detect", "unexpected_popup_state", "已有打开弹层，未接管");
    await input.prepareSurface();
    const prepared = await inspect("", "prepare_open");
    if (!prepared?.state.inputPoint) return finish(false, "open", "control_not_clickable", "输入区域无唯一命中点");
    const opening = await inspect();
    if (!opening?.state.inputPoint || opening.state.query || !same(opening.state.selected, before) || !popupClosed) {
      return finish(false, "open", "open_target_stale", "打开前多选状态已变化");
    }
    await input.clickPoint(opening.state.inputPoint); ledger.openClickCount++;
    let ready: Awaited<ReturnType<typeof inspect>> = null;
    let signature = "", stable = 0;
    for (let attempt = 0; attempt < 25; attempt++) {
      await input.wait(160);
      const state = await inspect();
      if (!state || state.state.query || !same(state.state.selected, before)) return finish(false, "open", "control_changed", "打开期间原控件发生变化");
      if (rejectedPopup(state.probe.status)) return finish(false, "open", state.probe.status, "多选菜单结构不唯一或尚未支持");
      const next = JSON.stringify(state.probe.availableOptions);
      stable = state.probe.popupCount === 1 && state.probe.availableOptions.length && next === signature ? stable + 1 : 0;
      signature = next;
      if (stable >= 1) {ready = state; break;}
    }
    if (!ready) return finish(false, "open", "options_unconfirmed", "未确认稳定选项列表");
    if (!input.discoverOptions) {
      const targets = wanted.map(city => uniqueCityOption(availableOptions, city));
      if (targets.some(city => !city) || new Set(targets).size !== targets.length) {
        return finish(false, "select", "city_option_unavailable", "城市没有唯一真实选项，未猜选");
      }
      let selected = before;
      for (const target of targets as string[]) {
        if (selected.includes(target)) continue;
        const leaf = await inspect(target);
        if (!leaf || leaf.state.query || !same(leaf.state.selected, selected) || leaf.probe.status !== "ready" ||
          leaf.probe.matchingLeafCount !== 1 || !leaf.probe.leafPoint) return finish(false, "select", "leaf_target_unconfirmed", "没有唯一且仍有效的城市叶子");
        await input.clickPoint(leaf.probe.leafPoint); ledger.leafClickCount++;
        const nextSelected = [...selected, target]; let committed = false; let confirmedReads = 0;
        for (let attempt = 0; attempt < 20; attempt++) {
          await input.wait(160); ledger.readbackPollCount++;
          const state = await inspect();
          if (!state || state.state.query) return finish(false, "readback", "control_changed", "选择后原多选字段失联");
          if (!same(state.state.selected, selected) && !same(state.state.selected, nextSelected)) {
            return finish(false, "readback", "selection_changed", "站点选择值与本次目标不一致");
          }
          confirmedReads = same(state.state.selected, nextSelected) ? confirmedReads + 1 : 0;
          if (confirmedReads >= 2) {committed = true; break;}
        }
        if (!committed) return finish(false, "readback", "tag_unconfirmed", "点击后未确认新增城市标签");
        selected = nextSelected;
      }
    }
    const closing = await inspect("", "commit");
    const selectionMatches = () => input.discoverOptions ? same(citySelectionValues(actual), before) : citySelectionSetMatches(actual, expected);
    if (!closing || closing.state.query || !selectionMatches()) return finish(false, "commit", "selection_changed", "关闭前已选集合不一致");
    if (!popupClosed || !validationCleared && !input.discoverOptions) {
      if (!closing.probe.commitPoint) return finish(false, "commit", "commit_target_missing", "没有唯一所属标题");
      await input.clickPoint(closing.probe.commitPoint); ledger.commitClickCount++;
    }
    for (let attempt = 0; attempt < 25; attempt++) {
      await input.wait(160); ledger.readbackPollCount++;
      const state = await inspect();
      if (!state || state.state.query || !selectionMatches()) return finish(false, "readback", "selection_changed", "关闭后选择集合未保持");
      if (popupClosed && (input.discoverOptions || validationCleared)) return finish(true, "readback", null, "");
    }
    return finish(false, "readback", "readback_unconfirmed", "弹层关闭或字段校验未确认");
  } catch (error) {
    return finish(false, "interaction", "multi_driver_interrupted", error instanceof Error ? error.message : String(error));
  }
}
