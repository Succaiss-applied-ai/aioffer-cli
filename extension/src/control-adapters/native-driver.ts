import type { FillInstruction, FillResult } from "../page-adapter.js";
import { observeApplicationPageWithFieldDialects } from "../form-dialects/application-field-dialects.js";
import { bindObservedInstruction, controlRoutingFailure, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";
import { nativeSelectRequestedValues } from "../option-set.js";

/** Native only. Observation and rebinding deliberately use the very same
 * observer; there is no second label/section/ordinal implementation here. */
export async function fillApplicationPage(instructions: FillInstruction[]): Promise<FillResult[]> {
  const results: FillResult[] = [];
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const emit = (element: Element, name: string) => element.dispatchEvent(new Event(name, { bubbles: true, composed: true }));
  for (const original of instructions) {
    const page = observeApplicationPageWithFieldDialects();
    // Legacy callers may bind their initial field once, but execution always
    // uses the observer's stable key and exact visible label from then on.
    const instruction = original.stableFieldKey ? original : {
      ...original, stableFieldKey: page.fields.find(field => field.selector === original.selector &&
        (!original.expectedLabel || field.label === original.expectedLabel))?.stableFieldKey
    };
    const field = bindObservedInstruction(page, instruction);
    if (!field || (instruction.applicationUrl && instruction.applicationUrl !== page.url)) {
      results.push(controlRoutingFailure(instruction, field, "control_target_missing", "页面或稳定字段身份已变化"));
      continue;
    }
    const route = resolveControlAdapter(evidenceForField(page, field, instruction));
    if (route.code !== "generic.native.v1") {
      results.push(controlRoutingFailure(instruction, field, "unsupported_required_control", "不是已登记的原生控件，未执行操作", route));
      continue;
    }
    if (instruction.controlAdapter && instruction.controlAdapter.registrationId !== route.diagnostic.registrationId) {
      results.push(controlRoutingFailure(instruction, field, "control_route_changed", "实时控件类型与选定 Driver 不一致", route));
      continue;
    }
    const candidates = document.querySelectorAll(field.selector);
    const element = candidates.length === 1 ? candidates[0] : null;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) ||
      element.disabled || element.matches(":disabled") || ("readOnly" in element && element.readOnly)) {
      results.push(controlRoutingFailure(instruction, field, "control_target_missing", "实时目标不唯一或不可编辑", route));
      continue;
    }
    const expected = String(instruction.value ?? "");
    let selectedValues: string[] | null = null;
    try {
      if (element instanceof HTMLSelectElement) {
        const requested = nativeSelectRequestedValues(expected, element.multiple);
        const matches = requested.map(value => [...element.options].filter(option => !option.disabled &&
          !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) &&
          (option.value === value || normalize(option.textContent) === value)));
        if (!requested.length || matches.some(options => options.length !== 1)) {
          results.push({ ...controlRoutingFailure(instruction, field,
            matches.some(options => options.length > 1) ? "control_option_ambiguous" : "control_option_unavailable",
            "真实选项不存在或不唯一，未改变原值", route),
            availableOptions: [...element.options].filter(option => !option.disabled && option.value &&
              !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled))
              .map(option => normalize(option.textContent)) });
          continue;
        }
        const options = matches.map(items => items[0]!);
        if (new Set(options).size !== options.length) {
          results.push(controlRoutingFailure(instruction, field, "control_option_ambiguous", "多个目标指向同一选项，未改变原值", route));
          continue;
        }
        selectedValues = options.map(option => option.value);
        for (const option of element.options) option.selected = options.includes(option);
      } else if (element instanceof HTMLInputElement && element.type === "file") {
        if (!instruction.file) throw new Error("未提供文件");
        const binary = atob(instruction.file.base64);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], instruction.file.name, { type: instruction.file.type }));
        element.files = transfer.files;
      } else if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
        if (typeof instruction.value !== "boolean" && !/^(?:true|false)$/.test(expected)) throw new Error("复选/单选需要明确布尔值");
        const checked = instruction.value === true || expected === "true";
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
        if (!setter) throw new Error("原生 checked setter 不可用");
        setter.call(element, checked);
      } else {
        // Dates in plain text inputs remain strings. Native date/month controls
        // consume their platform format; no calendar actions or inferred day.
        if (element instanceof HTMLInputElement && element.type === "month" && !/^\d{4}-\d{2}$/.test(expected)) throw new Error("原生年月控件需要 YYYY-MM");
        if (element instanceof HTMLInputElement && element.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(expected)) throw new Error("原生日期控件需要 YYYY-MM-DD");
        if (element instanceof HTMLInputElement && ["date", "month", "datetime-local", "number"].includes(element.type)) {
          const probe = document.createElement("input");
          probe.type = element.type;
          probe.value = expected;
          if (!expected || probe.value !== expected) {
            results.push(controlRoutingFailure(instruction, field, "control_value_invalid", "答案不符合原生控件格式，未改变原值", route));
            continue;
          }
        }
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (!setter) throw new Error("原生 value setter 不可用");
        element.focus({ preventScroll: true });
        if (!element.isConnected) throw new Error("control_target_missing: 焦点事件后目标被页面重建");
        setter.call(element, expected);
      }
      emit(element, "input");
      emit(element, "change");
      if (document.activeElement === element) element.blur();
      else emit(element, "blur");
      // Let framework change handlers finish; this wait performs no scroll,
      // click or retry. Rebind with the observer again after a React rebuild.
      await new Promise(resolve => setTimeout(resolve, 0));
      const after = observeApplicationPageWithFieldDialects();
      const rebound = bindObservedInstruction(after, instruction);
      const afterRoute = rebound ? resolveControlAdapter(evidenceForField(after, rebound, instruction)) : null;
      if (after.url !== page.url || !rebound || afterRoute?.diagnostic.registrationId !== route.diagnostic.registrationId) {
        results.push(controlRoutingFailure(instruction, rebound, "control_target_missing", "操作后字段失联或控件类型变化", route));
        continue;
      }
      const readbackCandidates = document.querySelectorAll(rebound.selector);
      const live = readbackCandidates.length === 1 ? readbackCandidates[0] : null;
      let actual = rebound.currentValue;
      let success = false;
      if (selectedValues && live instanceof HTMLSelectElement) {
        success = JSON.stringify([...live.selectedOptions].map(option => option.value).sort()) === JSON.stringify([...selectedValues].sort());
        actual = [...live.selectedOptions].map(option => normalize(option.textContent)).join("、");
      } else if (live instanceof HTMLInputElement && live.type === "file") {
        const expectedFileName = normalize(instruction.file?.name);
        const nativeFileName = normalize(live.files?.[0]?.name);
        const observedFileValue = normalize(rebound.currentValue);
        const ownedDisplayCommitted = Boolean(expectedFileName &&
          observedFileValue !== normalize(field.currentValue) &&
          observedFileValue.includes(expectedFileName));
        success = nativeFileName === expectedFileName || ownedDisplayCommitted;
        actual = nativeFileName || (ownedDisplayCommitted ? expectedFileName : observedFileValue);
      } else if (live instanceof HTMLInputElement || live instanceof HTMLTextAreaElement) {
        actual = live instanceof HTMLInputElement && ["checkbox", "radio"].includes(live.type)
          ? String(live.checked) : live.value;
        success = actual === expected;
      }
      if (rebound.requiresValidationClear && rebound.validationMessage) success = false;
      results.push({ fieldId: instruction.fieldId, success, expected, actual,
        error: success ? null : "native_control_readback_failed: 原生控件重新观察后与目标值不一致",
        driverStage: "readback", controlAdapter: route.diagnostic });
    } catch (error) {
      results.push({ ...controlRoutingFailure(instruction, field, "native_control_execution_failed",
        error instanceof Error ? error.message : "原生操作失败", route), driverStage: "interaction" });
    }
  }
  return results;
}
