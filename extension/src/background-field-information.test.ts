import {decodeExactOptionSet,isFeishuFormilyOptionSet,nativeSelectRequestedValues} from "./form-dialects/feishu-option-set.js";
import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { FillInstruction, FillResult, PageFieldObservation, PageObservation } from "./page-adapter.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { bindObservedInstruction, dispatchControlInstruction, lockedControlRouteFailure } from "./control-adapters/field-routing.js";
import * as dateStrategy from "./date-control-strategy.js";
import * as information from "./field-information.js";
import { guardFieldInformation } from "./field-information-guard.js";
import { RecruitingError } from "../../src/errors.js";
import { isPreferredWorkCityField } from "./preferred-city-policy.js";
import { selectorSearchValues } from "./selector-search-values.js";
import { uniqueCityOption } from "./city-option-matching.js";

const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
it.each(["supplemental_control_unresolved", "supplemental_options_unavailable", "supplemental_input_contract_invalid"])(
  "reports %s with the field name instead of asking for an unfillable answer", code => {
    const classify = backgroundFunction<(error: unknown) => Record<string, unknown>>(
      "function autoApplyFailureStatus(", "function hasMokaLocationOptionUnavailableDetails(", "autoApplyFailureStatus", {
        toPublicError: (error: RecruitingError) => error.publicError,
        AutoApplyCancelledError: class extends Error {}, AutoApplyCommandExpiredError: class extends Error {},
        AutoApplyDeviceRequestTimeoutError: class extends Error {}, AutoApplyUserActionRequiredError: class extends Error {}
      });
    const details = {failureCode:"supplemental_control_unresolved",supplementalInputErrors:[{code}],blockedControls:[{label:"教育经历 · 学校"}]};
    const error = new RecruitingError({code:"SITE_VALIDATION_BLOCKED",stage:"form_observation",message:"未能确定招聘页面控件",
      retryable:false,userAction:"反馈问题",details});
    expect(classify(error)).toEqual({status:"failed",reasonCode:code});
    const diagnostic = backgroundFunction<(reason: string, details: Record<string, unknown>) => Record<string, unknown>>(
      "function requiredControlUnconfirmedLabels(", "function candidateFactByKey(", "autoApplyDiagnostic", {});
    expect(diagnostic(code,details)).toMatchObject({code,category:"unsupported",retryable:false,recommendedAction:"inspect_evidence",
      userMessage:expect.stringContaining("教育经历 · 学校")});
  });
// Run the production functions, not string assertions or a second implementation.
// The Chrome boundary supplies read-only live probes; all mutation calls are spies.
function backgroundFunction<T>(start: string, end: string, name: string, dependencies: Record<string, unknown>): T {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  const javascript = ts.transpileModule(source.slice(startIndex, endIndex), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return new Function(...Object.keys(withInterruptionDependencies(dependencies)), `${javascript}\nreturn ${name};`)(...Object.values(withInterruptionDependencies(dependencies))) as T;
}

const url = "https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/fd130622-05c8-47d7-bb39-fb45fa8e5aab/apply";
const field: PageFieldObservation = {
  fieldId: "field-20", stableFieldKey: "education.end_date.native", selector: "#graduation",
  label: "教育背景 · 教育经历 · 结束时间", sectionKey: "education", type: "text", controlKind: "native",
  required: true, currentValue: "", options: [], domHints: { placeholder: "结束（YYYY/MM）" }
};
const observation = { url, fields: [field] } as PageObservation;
const instruction: FillInstruction = {
  fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, selector: field.selector,
  expectedLabel: field.label, semanticKey: "resume.education.0.endDate", type: "text",
  value: "2026-06", dateValue: { year: 2026, month: 6, day: 1 }, datePrecision: "month"
};
type Executor = (tabId: number, observation: PageObservation, field: PageFieldObservation, instruction: FillInstruction) => Promise<FillResult | null>;
const deps = { selectorSearchValues,decodeExactOptionSet,isFeishuFormilyOptionSet,nativeSelectRequestedValues,bindObservedInstruction, ...dateStrategy, ...information, guardFieldInformation, resolveControlAdapter, lockedControlRouteFailure,
  isPreferredWorkCityField, uniqueCityOption };
const liveProbe = (value = "") => ({
  tag: "INPUT", type: "text", readOnly: true, placeholder: "日期（年月日）",
  classNames: ["sd-Input-input-10L0t", "day_info", "sd-Dropdown-container-1CigZ"], value
});
function chromeFor(probe: ReturnType<typeof liveProbe>) {
  return {
    scripting: { executeScript: vi.fn(async () => [{ result: probe }]) },
    debugger: { attach: vi.fn(), sendCommand: vi.fn() },
    tabs: { update: vi.fn() }
  };
}
function dateDriver(chrome: ReturnType<typeof chromeFor>) {
  return backgroundFunction<Executor>(
    "async function executeMokaDateInstructionWithTrustedPointerDriver(",
    "async function executeMokaNativePlaceInstructionWithTrustedPointerDriver(",
    "executeMokaDateInstructionWithTrustedPointerDriver", { ...deps, chrome }
  );
}

describe("production precision gates before Driver actions", () => {
  it("reports an answer-binding failure as technical failure, never missing information", () => {
    class OtherError extends Error {}
    const classify = backgroundFunction<(error: unknown) => { status: string; reasonCode: string }>(
      "function autoApplyFailureStatus(", "function hasMokaLocationOptionUnavailableDetails(", "autoApplyFailureStatus", {
        AutoApplyCancelledError: OtherError, AutoApplyCommandExpiredError: OtherError,
        AutoApplyDeviceRequestTimeoutError: OtherError, AutoApplyUserActionRequiredError: OtherError,
        toPublicError: (error: RecruitingError) => error.publicError
      }
    );
    const error = new RecruitingError({ code: "FORM_FILL_VALIDATION_FAILED", stage: "form_observation",
      message: "无法关联", userAction: "请勿重复补填", retryable: false,
      details: { reasonCode: "supplemental_answer_binding_failed" } });
    expect(classify(error)).toEqual({ status: "failed", reasonCode: "supplemental_answer_binding_failed" });
    const diagnostic = backgroundFunction<(reason: string) => Record<string, unknown>>(
      "function requiredControlUnconfirmedLabels(", "function candidateFactByKey(", "autoApplyDiagnostic", {}
    );
    expect(diagnostic("supplemental_answer_binding_failed")).toMatchObject({
      category: "page", recommendedAction: "inspect_evidence", userMessage: expect.stringContaining("请勿重复补填")
    });
  });
  it("catches stale YYYY-MM instructions against the live Zuoyebang YYYY-MM-DD control before debugger attachment", async () => {
    const chrome = chromeFor(liveProbe());
    await expect(dateDriver(chrome)(1, observation, field, instruction)).rejects.toMatchObject({
      publicError: {
        code: "MISSING_INFORMATION", stage: "missing_information", retryable: false,
        details: { requiredFieldRequests: [expect.objectContaining({ type: "date", reasonCode: "candidate_information_missing" })] }
      }
    });
    expect(chrome.debugger.attach).not.toHaveBeenCalled();
    expect(chrome.debugger.sendCommand).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });
  it("does not reopen an already complete date or overwrite it with the synthetic first day", async () => {
    const chrome = chromeFor(liveProbe("2026-06-30"));
    await expect(dateDriver(chrome)(1, observation, field, instruction))
      .resolves.toMatchObject({ success: true, actual: "2026-06-30" });
    expect(chrome.debugger.attach).not.toHaveBeenCalled();
  });
  it("keeps unknown-precision control admission failures out of missing-information classification", async () => {
    const chrome = chromeFor({ ...liveProbe(), placeholder: "日期" });
    await expect(dateDriver(chrome)(1, observation, field, { ...instruction, datePrecision: undefined }))
      .resolves.toMatchObject({ success: false, error: expect.stringContaining("date_control_interaction_failed") });
    expect(chrome.debugger.attach).not.toHaveBeenCalled();
  });
  it("catches legacy province-only cascader instructions before opening the region popup", async () => {
    const chrome = chromeFor({ ...liveProbe(), placeholder: "籍贯",
      classNames: ["sd-Input-input-10L0t", "sd-Dropdown-container-1CigZ", "location_info-test"] });
    const driver = backgroundFunction<Executor>(
      "async function executeMokaNativePlaceInstructionWithTrustedPointerDriver(",
      "async function executeDeepSeekLocationInstructionWithTrustedFocusDriver(",
      "executeMokaNativePlaceInstructionWithTrustedPointerDriver", {
        ...deps, chrome, isMokaApplicationUrl: () => true
      }
    );
    const regionField = { ...field, stableFieldKey: "basic.native_place.native", label: "籍贯", domHints: {} };
    await expect(driver(1, observation, regionField, {
      ...instruction, stableFieldKey: regionField.stableFieldKey, semanticKey: "candidate.basic.nativePlace", value: "广东省"
    })).rejects.toMatchObject({ publicError: {
      code: "MISSING_INFORMATION", details: { requiredFieldRequests: [expect.objectContaining({ regionLevel: "city" })] }
    } });
    expect(chrome.debugger.attach).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });
  it("creates no date instruction until precision is complete, and explicit day evidence wins over birth-label heuristics", () => {
    const factory = backgroundFunction<(field: PageFieldObservation, value: string, key: string) => FillInstruction | null>(
      "function instructionFromObservedField(", "function mergeFillInstructions(", "instructionFromObservedField", {
        ...deps, localizeFieldAnswer: (_field: unknown, _key: unknown, value: string) => value,
        stripTrailingParserArtifact: (value: string) => value, unsafeAutoFillField: () => false,
        isFeishuMonthPeriodField: () => false
      }
    );
    const target = { ...field, domHints: { placeholder: "日期（年月日）" } };
    expect(factory(target, "2026-06", "resume.education.0.endDate")).toBeNull();
    expect(factory({ ...target, label: "出生日期" }, "2000-03-18", "candidate.basic.birthDate"))
      .toMatchObject({ datePrecision: "day", dateValue: { year: 2000, month: 3, day: 18 } });
    expect(factory(field, "2026-06", "resume.education.0.endDate"))
      .toMatchObject({ datePrecision: "month" });
  });
  it("keeps multiple answers as complete sets through the actual instruction factory",()=>{
    const factory=backgroundFunction<(field:PageFieldObservation,value:string,key:string)=>FillInstruction|null>(
      "function instructionFromObservedField(","function mergeFillInstructions(","instructionFromObservedField",{
        ...deps,localizeFieldAnswer:()=>{throw Error("a multi answer must not pass through scalar localization");}
      });
    const multi={...field,type:"combobox",controlKind:"combobox",optionMultiplicity:"multiple" as const};
    for(const value of [JSON.stringify(["研发、测试","产品,设计"]),"上海、北京"]){
      const expected=nativeSelectRequestedValues(value,true);
      expect(factory(multi,value,"job.requiredField.stable:example")).toMatchObject({value:JSON.stringify(expected),selectedOptionValues:expected});
    }
  });
  it("does not briefly open a calendar/cascader through generic option discovery before requesting information", async () => {
    const chrome = chromeFor(liveProbe());
    const discover = backgroundFunction<(id: number, fields: PageFieldObservation[]) => Promise<PageFieldObservation[]>>(
      "async function withDiscoveredRequiredFieldOptions(",
      "function aiBridgeEvent(", "withDiscoveredRequiredFieldOptions", { ...deps, chrome }
    );
    const targets: PageFieldObservation[] = [
      { ...field, type: "combobox", domHints: { placeholder: "YYYY-MM-DD" } },
      { ...field, type: "combobox", domHints: { placeholder: "省/市/区" } }
    ];
    await expect(discover(1, targets)).resolves.toEqual(targets);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("returns Moka recruiting-source options through its registered Driver before user supplementation", async () => {
    const sourceField: PageFieldObservation = {
      ...field,
      fieldId: "source",
      stableFieldKey: "other.recruiting_source.combobox",
      selector: "#source",
      label: "请选择信息来源渠道",
      type: "combobox",
      controlKind: "combobox",
      domHints: {
        tagName: "INPUT",
        inputType: "text",
        readOnly: false,
        placeholder: "请选择",
        classNames: ["sd-Input-input-10L0t", "sd-Select-container-1Eq4x", "sd-Dropdown-container-1CigZ"]
      }
    };
    const sourcePage = {
      ...observation,
      url: "https://app.mokahr.com/campus-recruitment/canrui/42687#/job/test/apply",
      pageStage: "application_form",
      fields: [sourceField]
    } as PageObservation;
    const sourceDriver = vi.fn(async (_tabId, _page, target: PageFieldObservation, next: FillInstruction,
      discoverOptions: boolean) => ({
      fieldId: target.fieldId,
      success: true,
      expected: String(next.value),
      actual: "",
      error: null,
      availableOptions: ["IC芯启航", "校园宣讲会/双选会", "浦东新区青年人才直通车", "其它"]
    }));
    const flatSelectExecutors = backgroundFunction<(
      id: number,
      page: PageObservation,
      discoverOptions?: boolean
    ) => Record<string, (field: PageFieldObservation, instruction: FillInstruction) => Promise<FillResult | null>>>(
      "function mokaFlatSelectControlExecutors(",
      "async function withDiscoveredRequiredFieldOptions(",
      "mokaFlatSelectControlExecutors",
      {
        executeMokaSharedSelectInstruction: vi.fn(),
        executeMokaRecruitingSourceInstructionWithTrustedFocusDriver: sourceDriver
      }
    );
    const discover = backgroundFunction<(id: number, fields: PageFieldObservation[]) => Promise<PageFieldObservation[]>>(
      "async function withDiscoveredRequiredFieldOptions(",
      "function aiBridgeEvent(",
      "withDiscoveredRequiredFieldOptions",
      {
        ...deps,
        stableApplicationObservation: async () => sourcePage,
        dispatchControlInstruction,
        mokaFlatSelectControlExecutors: flatSelectExecutors,
        MOKA_LOCATION_DRIVER_CODES: new Set(),
        discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver: vi.fn(),
        controlExecutionError: (_field: PageFieldObservation, result: FillResult) => new Error(result.error ?? "failed")
      }
    );

    await expect(discover(7, [sourceField])).resolves.toEqual([
      expect.objectContaining({
        stableFieldKey: "other.recruiting_source.combobox",
        options: ["IC芯启航", "校园宣讲会/双选会", "浦东新区青年人才直通车", "其它"]
      })
    ]);
    expect(sourceDriver).toHaveBeenCalledOnce();
    expect(sourceDriver.mock.calls[0]?.[4]).toBe(true);
  });

  it.each(["select", "combobox"])("maps a city fact to the unique live %s label without replacing its provenance", type => {
    const factory = backgroundFunction<(field: PageFieldObservation, value: string, key: string) => FillInstruction | null>(
      "function instructionFromObservedField(", "function mergeFillInstructions(", "instructionFromObservedField", {
        ...deps, localizeFieldAnswer: (_field: unknown, _key: unknown, value: string) => value,
        stripTrailingParserArtifact: (value: string) => value, unsafeAutoFillField: () => false,
        isFeishuMonthPeriodField: () => false
      }
    );
    expect(factory({ ...field, label: "意向工作城市", stableFieldKey: `intention.preferred_city.${type}`,
      type, options: ["北京市 / Beijing", "上海市 / Shanghai"], domHints: {} }, "北京市", "job.answers.preferredCity"))
      .toMatchObject({ value: "北京市 / Beijing", semanticKey: "job.answers.preferredCity", type });
  });
});

it("limits only a structurally proven preferred-location tree to the first confirmed choice",()=>{
  const factory=backgroundFunction<(field:PageFieldObservation,value:string,key:string)=>FillInstruction|null>(
    "function instructionFromObservedField(","function mergeFillInstructions(","instructionFromObservedField",deps);
  const target={...field,type:"combobox",label:"期望工作地点",observedControlKind:"formily_location_tree" as const,
    controlApplicationUrl:"https://test.jobs.feishu.cn/test/resume/123/apply",optionSource:"search" as const,
    fieldSource:{dialect:"feishu_formily" as const,fieldPath:"preferred_city_list",moduleId:"basic",instanceIndex:0},
    domHints:{tagName:"INPUT",inputType:"search",readOnly:false,classNames:["ud__select__selector__search__input","ud__select__selector-multiple","ud-formily-item"]}};
  const answer='["中国大陆/广东省/广州市","深圳"]';
  expect(factory(target,answer,"job.requiredField.stable:location")).toMatchObject({value:'["中国大陆/广东省/广州市"]',selectedOptionValues:["中国大陆/广东省/广州市"]});
  expect(factory({...target,observedControlKind:"formily_selector_flat"},answer,"job.requiredField.stable:location"))
    .toMatchObject({value:answer,selectedOptionValues:["中国大陆/广东省/广州市","深圳"]});
  expect(factory({...target,label:"学校地点"},answer,"job.requiredField.stable:location"))
    .toMatchObject({value:answer});
});
