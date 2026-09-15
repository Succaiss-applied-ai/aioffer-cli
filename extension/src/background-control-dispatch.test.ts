import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, fillApplicationPage, type FillInstruction, type PageObservation } from "./page-adapter.js";
import { isPhoneCallingCodeField } from "./vision-form-runtime.js";
import { bindObservedInstruction, controlRoutingFailure, dispatchControlInstruction, executeSelectedControl } from "./control-adapters/field-routing.js";
import { CONTROL_ADAPTER_REGISTRY, resolveControlAdapter } from "./control-adapters/registry.js";

const source = readFileSync(`${process.cwd()}/extension/src/background.ts`, "utf8");
function production(name: string, dependencies: Record<string, unknown>) {
  const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.ES2023, true);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  const compiled = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  return new Function(...Object.keys(withInterruptionDependencies(dependencies)), `${compiled}; return ${name}`)(...Object.values(withInterruptionDependencies(dependencies)));
}
const applicationUrl = "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/test/apply";
const instructionFor = (page: PageObservation, selector: string, value: string | boolean = "2027-06"): FillInstruction => {
  const field = page.fields.find(field => field.selector === selector)!;
  return { fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, expectedLabel: field.label,
    selector, type: field.type, value, semanticKey: "candidate.education.endDate",
    dateValue: { year: 2027, month: 6, day: 1 }, datePrecision: "month" };
};
beforeEach(() => {
  vi.stubGlobal("location", new URL(applicationUrl));
  vi.stubGlobal("CSS", { escape: (text: string) => text.replace(/["\\]/g, "\\$&") });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
    right: 180, bottom: 30, width: 180, height: 30, toJSON() {} });
  document.body.innerHTML = `<form><h2>个人信息</h2>
    <label>毕业时间（年月） *<input id="date" placeholder="毕业时间（年月）" required></label>
    <label>毕业院校 *<input id="school" placeholder="毕业院校" required></label>
    <button type="button">预览并提交</button></form>`;
});

describe("consent operations share the selected-control boundary", () => {
  function consentHarness(input: { unknown?: boolean; required?: boolean; changedPage?: boolean; fail?: boolean }) {
    const page = observeApplicationPage();
    page.actions = [{ actionId: "agreement", selector: "#old-control", text: "我已阅读并同意隐私政策",
      kind: "consent", risk: "user_only", disabled: false, context: "agreement" }];
    const fresh = { ...page, url: input.changedPage ? "https://other.example/login" : page.url,
      actions: page.actions.map(action => ({ ...action, selector: "#rebuilt-control" })) };
    const api = { debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn() },
      scripting: { executeScript: vi.fn(async () => [{ result: {
        controlTagName: "INPUT", controlInputType: input.unknown ? "combobox" : "checkbox",
        controlReadOnly: Boolean(input.unknown), controlClassNames: []
      } }]) } };
    vi.stubGlobal("chrome", api);
    const driver = vi.fn(async options => {
      await options.inspect();
      return { checked: !input.fail, found: true, changed: !input.fail, text: "隐私政策",
        stage: "readback", error: input.fail ? "commit failed" : null, diagnostics: {} };
    });
    const run = production("ensureAuthorizedPageConsents", {
      authorizedConsentCandidates: observation => observation.actions.map(action => ({ action, required: input.required ?? true })),
      stableApplicationObservation: async () => fresh,
      controlExecutionError: (_field, result) => new Error(result.error), controlRoutingFailure,
      inspectConsentConfirmationInPage: () => {}, resolveControlAdapter, executeSelectedControl,
      executeConsentConfirmationDriver: driver,
      prepareFocusEmulatedTrustedPointerSurface: vi.fn(async () => {}), releaseTrustedPointerSurface: vi.fn(async () => {}),
      dispatchTrustedPointerClick: vi.fn(), dispatchTrustedPointerScroll: vi.fn()
    });
    return { run: () => run(7, page), api, driver };
  }

  it("re-observes a rebuilt agreement and invokes its Driver once", async () => {
    const test = consentHarness({});
    expect(await test.run()).toMatchObject({ changed: true, labels: ["隐私政策"] });
    expect(test.driver).toHaveBeenCalledOnce();
    expect(test.driver.mock.calls[0][0].action.selector).toBe("#rebuilt-control");
    expect(test.api.debugger.attach).toHaveBeenCalledOnce();
    expect(test.api.debugger.detach).toHaveBeenCalledOnce();
  });

  it("rejects an unknown required agreement before attaching or clicking", async () => {
    const test = consentHarness({ unknown: true });
    await expect(test.run()).rejects.toThrow("unsupported_required_control");
    expect(test.driver).not.toHaveBeenCalled();
    expect(test.api.debugger.attach).not.toHaveBeenCalled();
  });

  it.each([{ unknown: true }, { fail: true }])("skips optional agreement failure without retry: %j", async options => {
    const test = consentHarness({ ...options, required: false });
    expect(await test.run()).toMatchObject({ changed: false, labels: [] });
    expect(test.driver).toHaveBeenCalledTimes(options.unknown ? 0 : 1);
  });

  it("does no probe or action after navigation", async () => {
    const test = consentHarness({ changedPage: true });
    await expect(test.run()).rejects.toThrow("control_page_changed");
    expect(test.driver).not.toHaveBeenCalled();
    expect(test.api.scripting.executeScript).not.toHaveBeenCalled();
    expect(test.api.debugger.attach).not.toHaveBeenCalled();
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function harness(pages?: PageObservation[], dispatch = dispatchControlInstruction) {
  const read = vi.fn(async () => pages?.length ? pages.shift()! : observeApplicationPage());
  const native = vi.fn(async (_tab, instruction) => (await fillApplicationPage([instruction]))[0]);
  const custom = vi.fn(async (_tab, _page, field, instruction) => ({ fieldId: field.fieldId, success: true,
    expected: instruction.value, actual: instruction.value, error: null, controlAdapter: instruction.controlAdapter }));
  const optional = production("optionalInstructionHasCurrentJobConfirmation", {
    observedFieldHasValue: field => Boolean(field.currentValue),
    currentJobFieldSemanticKey: field => `job.requiredField.stable:${field.stableFieldKey}`,
    isPhoneCallingCodeField
  });
  const execute = production("executeApplicationFillInstructions", {
    bindObservedInstruction, controlRoutingFailure, dispatchControlInstruction: dispatch,
    stableApplicationObservation: read, optionalInstructionHasCurrentJobConfirmation: optional,
    guardFieldInformation: () => null,
    instructionFromObservedField: () => null,
    mokaYearMonthPairIdentity: () => null, executeNativeControlInTab: native,
    executeXToolFormilyRepeatNativeInstruction: custom,
    executeFeishuFormilySelectInstruction: custom,
    executeFeishuMonthPeriodInstructionWithTrustedFocusDriver: custom,
    executeMokaYearMonthSelectInstructionWithTrustedPointerDriver: custom,
    executeMokaNativePlaceInstructionWithTrustedPointerDriver: custom,
    executeMokaRecruitingSourceInstructionWithTrustedFocusDriver: custom,
    executeMokaDateInstructionWithTrustedPointerDriver: custom,
    executeDeepSeekLocationInstructionWithTrustedFocusDriver: custom,
    mokaFlatSelectControlExecutors: production("mokaFlatSelectControlExecutors", {
      executeMokaSharedSelectInstruction: (tabId, field, instruction) => custom(tabId, null, field, instruction),
      executeMokaRecruitingSourceInstructionWithTrustedFocusDriver: custom
    }),
    MOKA_LOCATION_DRIVER_CODES: new Function(
      source.slice(source.indexOf("const MOKA_LOCATION_DRIVER_CODES ="),
        source.indexOf("function isMokaSelectableLocationControl(")) + ";return MOKA_LOCATION_DRIVER_CODES"
    )()
  });
  return { execute, read, native, custom };
}

describe("one production field dispatch boundary", () => {
  it("provides an executor for every registered non-consent field route", async () => {
    const page = observeApplicationPage();
    const dispatcher = vi.fn(async (live, instruction, executors) => {
      const codes = new Set(CONTROL_ADAPTER_REGISTRY.filter(route => route.driver !== "unsupported" &&
        route.adapterCode !== "generic.consent-confirmation.trusted-pointer.v1").map(route => route.adapterCode));
      for (const code of codes) expect(typeof executors[code], code).toBe("function");
      return dispatchControlInstruction(live, instruction, executors);
    });
    expect((await harness(undefined, dispatcher).execute(7, page, [instructionFor(page, "#date")]))[0].success).toBe(true);
    expect(dispatcher).toHaveBeenCalledOnce();
  });

  it.each([
    ["sina/43536", "您使用微博的频率", "custom.weibo_use_frequency.combobox", "moka.sina.weibo-frequency.trusted-focus.v1"],
    ["eqhr/39786", "是否接受出差", "custom.travel_acceptance.combobox", "moka.eqhr.travel-acceptance.trusted-focus.v1"],
    ["sungrow/94416", "证件号码", "basic.identity_document_type.combobox", "moka.sungrow.identity-document-type.trusted-focus.v1"],
    ["sungrow/94416", "有无直系或旁系亲属在本单位（含其他关联公司）任职？", "custom.relative_employment.combobox", "moka.sungrow.relative-employment.trusted-focus.v1"]
  ])("executes the registered flat select, not an unsupported gap: %s / %s", async (tenant, label, stableFieldKey, code) => {
    const page = observeApplicationPage();
    page.url = `https://app.mokahr.com/campus-recruitment/${tenant}#/job/fixture/apply`;
    const field = { ...page.fields[0]!, label, stableFieldKey, type: "combobox", controlKind: "combobox",
      domHints: { tagName: "INPUT", inputType: "text", readOnly: false, placeholder: "请选择",
        classNames: ["sd-Input-input-10L0t", "sd-Input-container sd-Select-container-1Eq4x", "sd-Dropdown-container-1CigZ"] } };
    page.fields = [field];
    const run = harness([page]);
    const result = await run.execute(7, page, [{ fieldId: field.fieldId, stableFieldKey,
      selector: field.selector, expectedLabel: label, type: field.type, value: "是" }]);
    expect(result[0]).toMatchObject({ success: true, controlAdapter: { adapterCode: code } });
    expect(run.custom).toHaveBeenCalledOnce();
    expect(run.native).not.toHaveBeenCalled();
  });

  it("invokes the registered split-date executor on its background execution surface", async () => {
    const page = observeApplicationPage();
    const field = page.fields.find((entry) => entry.selector === "#date")!;
    const route = resolveControlAdapter({
      applicationUrl: page.url,
      label: "毕业时间 · 年",
      semanticKey: "education.endDate.year",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "年",
      classNames: ["sd-Input-input", "sd-Select-container", "年"]
    });
    expect(route).toMatchObject({
      code: "moka.year-month-select.trusted-pointer.v1",
      requiresForeground: false,
      executionSurface: "background_tab"
    });
    const executor = vi.fn(async () => ({
      fieldId: field.fieldId,
      success: true,
      expected: "2027",
      actual: "2027",
      error: null
    }));
    expect(await executeSelectedControl(route, instructionFor(page, "#date", "2027"), field, {
      [route.code]: executor
    })).toMatchObject({ success: true, actual: "2027" });
    expect(executor).toHaveBeenCalledOnce();
  });

  it.each([applicationUrl, "https://careers.unrelated.example/apply"])("fills graduation TEXT, not a calendar, at %s", async url => {
    vi.stubGlobal("location", new URL(url));
    const page = observeApplicationPage();
    const run = harness();
    const results = await run.execute(7, page, [instructionFor(page, "#date")]);
    expect(results).toMatchObject([{ success: true, actual: "2027-06", controlAdapter: { registrationId: "generic.native.text.v1" } }]);
    expect(document.querySelector<HTMLInputElement>("#school")!.value).toBe("");
    expect(run.custom).not.toHaveBeenCalled();
    expect(run.native.mock.calls[0][1].dateValue).toBeUndefined();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("uses a registered calendar solely from the live readonly/DOM signature", async () => {
    document.querySelector("#date")!.outerHTML = `<div class="sd-Dropdown-container"><div class="day_info"><input id="date" placeholder="出生日期" readonly required></div></div>`;
    const page = observeApplicationPage();
    const run = harness();
    const result = await run.execute(7, page, [instructionFor(page, "#date", "2004-06-01")]);
    expect(result[0].controlAdapter.adapterCode).toMatch(/moka\.(?:tap4fun\.birth-date|date-picker)/);
    expect(run.custom).toHaveBeenCalledOnce();
    expect(run.native).not.toHaveBeenCalled();
  });

  it("keeps the JSTI foreground-dependent birth control unsupported without blocking other tenants", async () => {
    vi.stubGlobal("location", new URL("https://app.mokahr.com/campus-recruitment/jsti/144121#/job/test/apply"));
    document.body.innerHTML = '<form><label>出生日期 *<div class="sd-Dropdown-container"><div class="day_info"><input id="date" readonly required></div></div></label></form>';
    const page = observeApplicationPage();
    const run = harness();
    expect(await run.execute(7, page, [instructionFor(page, "#date", "2004-06-01")]))
      .toMatchObject([{ success: false, driverFailureCode: "unsupported_required_control",
        controlAdapter: { registrationId: "moka.jsti.birth-date.unsupported-background.v1" } }]);
    expect(run.native).not.toHaveBeenCalled();
    expect(run.custom).not.toHaveBeenCalled();
  });

  it("observes ancestor Formily ids before selecting the xTool repeat Driver", async () => {
    vi.stubGlobal("location", new URL("https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply"));
    document.body.innerHTML = `<form><section id="formily-item-project_list"><h2>项目经历</h2>
      <div class="apply-form-array-card__hashed"><div><div><div><div><div data-form-field-name="name" data-form-field-i18n-name="项目名称">
        <label for="project">项目名称 *</label><input id="project" class="ud__native-input" required>
      </div></div></div></div></div></div></section></form>`;
    const page = observeApplicationPage();
    expect(page.fields[0]!.domHints?.ancestorIds).toContain("formily-item-project_list");
    const run = harness();
    expect(await run.execute(7, page, [instructionFor(page, "#project", "项目甲")]))
      .toMatchObject([{ success: true, controlAdapter: { registrationId: "xtool.formily-repeat-native.v1" } }]);
    expect(run.custom).toHaveBeenCalledOnce();
    expect(run.native).not.toHaveBeenCalled();
  });

  it("does not fall back after a selected Driver throws or returns null", async () => {
    const page = observeApplicationPage();
    const run = harness();
    run.native.mockRejectedValueOnce(new Error("driver interrupted"));
    expect(await run.execute(7, page, [instructionFor(page, "#date")]))
      .toMatchObject([{ success: false, driverFailureCode: "control_execution_failed" }]);
    run.native.mockResolvedValueOnce(null);
    expect(await run.execute(7, page, [instructionFor(page, "#date")]))
      .toMatchObject([{ success: false, driverFailureCode: "control_driver_rejected" }]);
    expect(run.native).toHaveBeenCalledTimes(2);
    expect(run.custom).not.toHaveBeenCalled();
  });

  it("stops a required unregistered custom control before invoking any executor", async () => {
    document.querySelector("#date")!.setAttribute("role", "combobox");
    const page = observeApplicationPage();
    const run = harness();
    const result = await run.execute(7, page, [instructionFor(page, "#date"), instructionFor(page, "#school", "学校")]);
    expect(result).toMatchObject([{ success: false, driverFailureCode: "unsupported_required_control",
      controlAdapter: { controlSignature: { role: "combobox", tenantPath: "/campus-recruitment/tap4fun/291" } } }]);
    expect(run.native).not.toHaveBeenCalled();
    expect(run.custom).not.toHaveBeenCalled();
  });

  it("skips a confirmed optional failure and continues to the next required field", async () => {
    document.body.innerHTML = `<form><label>备注<input id="optional" role="combobox"></label><label>姓名 *<input id="name" required></label></form>`;
    const page = observeApplicationPage();
    const optional = instructionFor(page, "#optional", "test");
    optional.semanticKey = `job.requiredField.stable:${optional.stableFieldKey}`;
    const run = harness();
    const result = await run.execute(7, page, [optional, instructionFor(page, "#name", "测试姓名")]);
    expect(result.map(result => result.success)).toEqual([false, true]);
    expect(run.native).toHaveBeenCalledOnce();
  });

  it("permits only an exact site-rejected optional field through the repair boundary", async () => {
    document.body.innerHTML = `<form><label>项目开始年份<input id="project-year" value="2025"></label></form>`;
    const page = observeApplicationPage();
    const field = { ...page.fields[0]!, stableFieldKey: "project.start_date.combobox#0",
      required: false, requiredSource: "none" as const, currentValue: "2025" };
    page.fields = [field];
    page.pageStage = "application_form";
    const instruction: FillInstruction = { fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
      expectedLabel: field.label, selector: field.selector, type: field.type, value: "2025",
      semanticKey: "resume.project.0.startDate" };
    const dispatch = vi.fn(async () => ({ fieldId: field.fieldId, success: true,
      expected: "2025", actual: "2025", error: null }));
    const allowed = harness([page], dispatch);
    const allowedResult = await allowed.execute(7, page, [instruction], {
      siteValidationRepairKeys: new Set([field.stableFieldKey])
    });
    expect(allowedResult, JSON.stringify(allowedResult)).toMatchObject([{ success: true }]);
    expect(dispatch).toHaveBeenCalledOnce();

    const blocked = harness([page], dispatch);
    expect(await blocked.execute(7, page, [instruction], {
      siteValidationRepairKeys: new Set(["project.other.combobox"])
    })).toMatchObject([{ success: false, driverFailureCode: "optional_field_not_confirmed_for_current_job" }]);
  });

  it("re-observes after a rebuild and rejects ordinal reuse or an changed page", async () => {
    const before = observeApplicationPage();
    const instruction = instructionFor(before, "#date");
    document.querySelector("#date")!.remove();
    const run = harness();
    expect(await run.execute(7, before, [instruction])).toMatchObject([{ success: false, driverFailureCode: "control_target_missing" }]);
    expect(run.native).not.toHaveBeenCalled();
    const redirected = harness([{ ...before, url: `${applicationUrl}/login`, pageStage: "login" }]);
    expect(await redirected.execute(7, before, [instruction])).toMatchObject([{ success: false, driverFailureCode: "control_page_changed" }]);
    expect(redirected.native).not.toHaveBeenCalled();
  });

  it("never retries, switches driver, or upgrades a failed Driver's displayed value", async () => {
    const page = observeApplicationPage();
    const run = harness();
    run.native.mockResolvedValueOnce({ fieldId: "field-1", success: false, expected: "2027-06", actual: "2027-06", error: "failed_commit" });
    expect(await run.execute(7, page, [instructionFor(page, "#date"), instructionFor(page, "#school")]))
      .toMatchObject([{ success: false, actual: "2027-06" }]);
    expect(run.native).toHaveBeenCalledOnce();
    expect(run.custom).not.toHaveBeenCalled();
  });

  it("accepts the optional override only for a live bounded phone calling-code field", () => {
    const optional = production("optionalInstructionHasCurrentJobConfirmation", {
      observedFieldHasValue: field => Boolean(field.currentValue),
      currentJobFieldSemanticKey: field => `job.requiredField.stable:${field.stableFieldKey}`,
      isPhoneCallingCodeField
    });
    const base = observeApplicationPage().fields[0]!;
    const instruction = { ...instructionFor(observeApplicationPage(), "#date"),
      optionSelectionPolicy: "phone_calling_code_default" as const };
    const callingCode = { ...base, required: false, type: "combobox", controlKind: "combobox",
      currentValue: "+1", compound: { kind: "phone_number" as const, role: "calling_code" as const,
        groupKey: "#phone-field", queryValue: "" } };
    expect(optional(callingCode, instruction)).toBe(true);
    expect(optional({ ...callingCode, compound: undefined }, instruction)).toBe(false);
  });

  it.each([
    { failureCode: "leaf_missing", options: ["+1", "+852"] },
    { failureCode: "leaf_ambiguous", options: ["+86", "+86"] }
  ])("maps $failureCode calling-code policy failures to one option-unavailable result", async ({ failureCode, options }) => {
    const route = resolveControlAdapter({
      applicationUrl,
      label: "手机号码",
      semanticKey: "basic.phone.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "",
      classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    });
    const field = { ...observeApplicationPage().fields[0]!, fieldId: "calling-code", label: "手机号码" };
    const driver = vi.fn(async () => ({
      success: false,
      stage: "select",
      actual: "+1",
      queryValue: "1",
      popupClosed: true,
      validationCleared: true,
      error: "control failed",
      availableOptions: options,
      resolvedExpected: "",
      diagnostics: { failureCode }
    }));
    vi.stubGlobal("chrome", { debugger: {
      attach: vi.fn(async () => {}),
      detach: vi.fn(async () => {}),
      sendCommand: vi.fn(async () => ({}))
    } });
    const execute = production("executeMokaSharedSelectInstruction", {
      executeMokaSearchSelectDriver: driver,
      executeMokaCityMultiDriver: driver,
      executeMokaSharedSelectDriver: driver,
      prepareFocusEmulatedTrustedPointerSurface: vi.fn(async () => {}),
      dispatchTrustedPointerClick: vi.fn(async () => {}),
      releaseTrustedPointerSurface: vi.fn(async () => {})
    });
    const instruction = { fieldId: field.fieldId, selector: field.selector, expectedLabel: field.label,
      type: "combobox", value: "+86", applicationUrl,
      optionSelectionPolicy: "phone_calling_code_default" as const,
      controlAdapter: route.diagnostic };
    expect(await execute(7, field, instruction)).toMatchObject({
      success: false,
      expected: "+86",
      actual: "+1",
      driverFailureCode: "control_option_unavailable",
      availableOptions: options
    });
    expect(driver).toHaveBeenCalledOnce();
  });

  it("keeps required calling-code policy values independent from candidate phone facts", () => {
    const start = source.indexOf("const phoneCallingCodePolicy = deterministicKnownFact?.fieldId === field.fieldId");
    const end = source.indexOf("const semanticConflict = visualSemanticConflict(field);", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const authorization = source.slice(start, end);
    expect(authorization).toContain("? confirmedCurrentJobFactForField(field, input.candidateFacts)");
    expect(authorization).toContain(": field.required");
    expect(authorization.indexOf("? confirmedCurrentJobFactForField(field, input.candidateFacts)"))
      .toBeLessThan(authorization.indexOf(": field.required"));
  });

  it("rejects a control that changes to custom between dispatch and native execution", async () => {
    const page = observeApplicationPage();
    const run = harness([page]);
    document.querySelector("#date")!.setAttribute("aria-haspopup", "listbox");
    expect(await run.execute(7, page, [instructionFor(page, "#date")])).toMatchObject([{ success: false }]);
    expect(document.querySelector<HTMLInputElement>("#date")!.value).toBe("");
    expect(run.custom).not.toHaveBeenCalled();
  });

  it("keeps every browser form write behind the dispatcher, not serialized legacy fill", () => {
    expect(source).not.toContain("func: fillApplicationPage");
    expect(source).not.toMatch(/func: (ensureMokaAuthenticityDeclaration|ensureMokaIdentityFields|ensureXiaopengPrivacyConsent|discoverApplicationFieldOptions)/);
    expect(source).not.toContain("applicationObservationWithFillReadback(");
    const wrapper = production("executeMokaFillInstructionWithDebugger", { executeApplicationFillInstructions: vi.fn(async () => []) });
    expect(wrapper).toBeTypeOf("function");
    const nativeSource = readFileSync(`${process.cwd()}/extension/src/control-adapters/native-driver.ts`, "utf8");
    expect(nativeSource).not.toMatch(/mokahr|feishu|xiaopeng|\.click\(|scrollIntoView|Input\.insertText/);
  });
});
