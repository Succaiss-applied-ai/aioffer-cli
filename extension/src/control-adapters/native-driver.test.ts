// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, triggerSiteResumeParser, executeObservedPageAction, type FillInstruction } from "../page-adapter.js";
import { withFieldInformationRequirements } from "../field-information.js";
import { candidateInformationRequestForField } from "../vision-form-runtime.js";
import { fillApplicationPage } from "./native-driver.js";
import { dispatchControlInstruction } from "./field-routing.js";
import { registeredControlReadbackMatches } from "./readback-policy.js";
import {
  applyFeishuFormilyFieldPatches,
  observeFeishuFormilyFieldPatchesInPage
} from "../form-dialects/feishu-formily.js";

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://careers.example/apply"));
  vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/["\\]/g, "\\$&") });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 200,
    height: 30, right: 200, bottom: 30, x: 0, y: 0, toJSON() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture(control: string) {
  document.body.innerHTML = `<form><label for="target">测试字段 *</label>${control}<button type="button">提交申请</button></form>`;
}
function instruction(value: string | boolean): FillInstruction {
  const field = observeApplicationPage().fields.find(field => field.selector === "#target")!;
  expect(field).toBeDefined();
  return { fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, expectedLabel: field.label,
    selector: field.selector, type: field.type, value };
}
async function execute(next: FillInstruction) {
  const native = vi.fn(async (_field, routed) => (await fillApplicationPage([routed]))[0]!);
  const result = await dispatchControlInstruction(observeApplicationPage(), next, { "generic.native.v1": native });
  return { result, native };
}

describe("native-only Driver contract", () => {
  it.each(['<fieldset disabled><input id="target" required></fieldset>','<input id="target" aria-disabled="true" required>'])("does not ask for an unwriteable answer: %s",markup=>{
    fixture(markup);const page=withFieldInformationRequirements(observeApplicationPage());
    expect(page.fields[0]?.domHints?.disabled).toBe(true);
    expect(()=>candidateInformationRequestForField(page.fields[0]!)).toThrow("未能确定招聘页面控件");
  });
  it("preserves upload-triggered site parsing while never clicking explicit parse buttons", async () => {
    fixture('<input id="target" type="file" required><button id="parse" type="button">解析并覆盖</button>');
    vi.stubGlobal("DataTransfer", class {
      files: File[] = [];
      items = { add: (file: File) => this.files.push(file) };
    });
    const file = document.querySelector("#target")!;
    Object.defineProperty(file, "files", { configurable: true, writable: true, value: [] });
    const automaticParse = vi.fn();
    const explicitParse = vi.fn();
    file.addEventListener("change", automaticParse);
    document.querySelector("#parse")!.addEventListener("click", explicitParse);
    expect((await execute({ ...instruction("resume.txt"),
      file: { name: "resume.txt", type: "text/plain", base64: btoa("fixture") } })).result.success).toBe(true);
    expect(automaticParse).toHaveBeenCalledOnce();
    expect(await triggerSiteResumeParser()).toMatchObject({ triggered: false });
    for (const kind of ["resume_parse", "neutral"] as const) {
      for (const text of ["解析并覆盖", "一键填充", "自动填充", "Fill from resume"]) {
        expect(await executeObservedPageAction({ actionId: "parse", selector: "#parse", text,
        risk: "safe", kind, disabled: false, context: "" })).toMatchObject({ executed: false });
      }
    }
    expect(explicitParse).not.toHaveBeenCalled();
  });

  it("never confirms an unobserved parse-overwrite dialog after a different safe action", async () => {
    fixture('<input id="target"><button id="expand" type="button">展开经历</button><div role="dialog"><button id="confirm" type="button">确认覆盖</button></div>');
    const parse = vi.fn();
    document.querySelector("#confirm")!.addEventListener("click", parse);
    const result = await executeObservedPageAction({ actionId: "expand", selector: "#expand",
      text: "展开经历", risk: "safe", kind: "neutral", disabled: false, context: "" });
    expect(result).toMatchObject({ executed: true, confirmationText: null });
    expect(parse).not.toHaveBeenCalled();
  });

  it.each([
    ['<input id="target" required>', "2027-06", "generic.native.text.v1"],
    ['<textarea id="target" required></textarea>', "项目说明\n第二段  保留空格", "generic.native.text.v1"],
    ['<input id="target" type="date" required>', "2027-06-15", "generic.native.temporal.v1"],
    ['<input id="target" type="month" required>', "2027-06", "generic.native.temporal.v1"],
    ['<input id="target" type="datetime-local" required>', "2027-06-15T10:30", "generic.native.temporal.v1"],
    ['<input id="target" type="checkbox" required>', true, "generic.native.checkbox.v1"],
    ['<input id="target" type="radio" required>', true, "generic.native.radio.v1"]
  ])("uses standard events and exact re-observation for %s", async (markup, value, registrationId) => {
    fixture(markup as string);
    const events: string[] = [];
    const element = document.querySelector("#target")!;
    for (const event of ["input", "change", "blur"]) element.addEventListener(event, () => events.push(event));
    const { result, native } = await execute(instruction(value as string | boolean));
    expect(result).toMatchObject({ success: true, actual: String(value), controlAdapter: { registrationId } });
    expect(native).toHaveBeenCalledOnce();
    expect(events).toEqual(["input", "change", "blur"]);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(["上海市", "310000"])("selects one real coded option and rereads its label for %s", async value => {
    fixture('<select id="target" required><option value="">请选择</option><option value="310000">上海市</option><option value="440300">深圳市</option></select>');
    const { result } = await execute(instruction(value));
    const field = observeApplicationPage().fields[0]!;
    expect(result).toMatchObject({ success: true, actual: "上海市" });
    expect(field.currentValue).toBe("上海市");
    expect(field.options).toEqual(["上海市", "深圳市"]);
    expect(registeredControlReadbackMatches({ field, expected: value, controlAdapter: result.controlAdapter! }).matches).toBe(true);
  });

  it("compares multiple committed options by identity independent of request order", async () => {
    fixture('<select id="target" multiple required><option value="sh">上海市</option><option value="sz">深圳市</option></select>');
    const { result } = await execute(instruction("深圳市、上海市"));
    expect(result.success).toBe(true);
    expect(registeredControlReadbackMatches({ field: observeApplicationPage().fields[0]!,
      expected: "深圳市、上海市", controlAdapter: result.controlAdapter! }).matches).toBe(true);
  });
  it.each([false,true])("preserves punctuation in exact SELECT answers (multiple=%s)",async multiple=>{
    fixture(`<select id="target" ${multiple?'multiple':''} required><option value="a">研发、测试</option><option value="b">产品,设计</option></select>`);
    const value=multiple?JSON.stringify(["产品,设计","研发、测试"]):"研发、测试";
    const {result}=await execute(instruction(value));expect(result.success).toBe(true);
    expect(registeredControlReadbackMatches({field:observeApplicationPage().fields[0]!,expected:value,controlAdapter:result.controlAdapter!}).matches).toBe(true);
  });
  it("rejects malformed or duplicate array answers before changing a native selection",async()=>{
    fixture('<select id="target" multiple><option value="a">A</option><option value="b">B</option></select>');
    const change=vi.fn();document.querySelector("#target")!.addEventListener("change",change);
    for(const value of ['["A","A"]','[broken','[1]'])expect((await execute(instruction(value))).result.success).toBe(false);
    expect(change).not.toHaveBeenCalled();expect(document.querySelector<HTMLSelectElement>("#target")!.selectedOptions).toHaveLength(0);
  });

  it.each(["苏州市", "广州市"])("returns only enabled real choices without changing the existing selection for %s", async value => {
    fixture('<select id="target" required><option value="sh" selected>上海市</option><optgroup disabled label="不可用"><option value="gz">广州市</option></optgroup><option value="sz">深圳市</option></select>');
    const changed = vi.fn();
    document.querySelector("#target")!.addEventListener("change", changed);
    const { result } = await execute(instruction(value));
    expect(result).toMatchObject({ success: false, driverFailureCode: "control_option_unavailable", availableOptions: ["上海市", "深圳市"] });
    expect(document.querySelector<HTMLSelectElement>("#target")!.value).toBe("sh");
    expect(changed).not.toHaveBeenCalled();
  });

  it("refuses ambiguous options and alias-duplicate multiselect targets before mutation", async () => {
    fixture('<select id="target" required><option value="a">上海市</option><option value="b">上海市</option></select>');
    expect((await execute(instruction("上海市"))).result.driverFailureCode).toBe("control_option_ambiguous");
    fixture('<select id="target" multiple required><option value="sh">上海市</option><option value="sz">深圳市</option></select>');
    expect((await execute(instruction("上海市、sh"))).result.driverFailureCode).toBe("control_option_ambiguous");
    expect(document.querySelector<HTMLSelectElement>("#target")!.selectedOptions.length).toBe(0);
  });

  it("writes a native file once and reads its filename rather than fakepath", async () => {
    fixture('<input id="target" type="file" required>');
    vi.stubGlobal("DataTransfer", class {
      files: File[] = [];
      items = { add: (file: File) => this.files.push(file) };
    });
    Object.defineProperty(document.querySelector("#target"), "files", { configurable: true, writable: true, value: [] });
    const next = { ...instruction("resume.txt"), file: { name: "resume.txt", type: "text/plain", base64: btoa("fixture") } };
    const { result } = await execute(next);
    expect(result).toMatchObject({ success: true, actual: "resume.txt", controlAdapter: { registrationId: "generic.native.file.v1" } });
    expect(observeApplicationPage().fields[0]!.currentValue).toBe("resume.txt");
  });

  it("keeps Feishu Formily file identity through upload and a reconstructed input", async () => {
    vi.stubGlobal("location", new URL("https://xtool.jobs.feishu.cn/index/resume/7648900330809985318/apply"));
    document.body.innerHTML = `<form><div class="ud-formily-item" id="formily-item-attachment_resume"
      data-form-field-id="attachment_resume" data-form-field-name="attachment_resume">
      <div class="ud-formily-item-label"><span class="ud-formily-item-label-content">简历附件</span>
        <span class="ud-formily-item-asterisk">*</span></div>
      <div class="ud-formily-item-control"><input type="file" accept="application/pdf"></div>
    </div><button type="button">提交申请</button></form>`;
    vi.stubGlobal("DataTransfer", class {
      files: File[] = [];
      items = { add: (file: File) => this.files.push(file) };
    });
    const input = document.querySelector<HTMLInputElement>("input[type='file']")!;
    Object.defineProperty(input, "files", { configurable: true, writable: true, value: [] });
    const generic = observeApplicationPage();
    const dialectFields = applyFeishuFormilyFieldPatches(
      generic.fields,
      observeFeishuFormilyFieldPatchesInPage()
    );
    const fileField = dialectFields.find(field => field.stableFieldKey === "attachments.resume_file.file")!;
    expect(generic.fields.find(field => field.selector === fileField.selector)?.label).toBe("简历");
    expect(fileField.label).toBe("简历附件");
    input.addEventListener("change", () => {
      const fresh = input.cloneNode(true) as HTMLInputElement;
      Object.defineProperty(fresh, "files", { configurable: true, writable: true, value: [] });
      input.replaceWith(fresh);
      fresh.insertAdjacentHTML("afterend", '<span class="uploaded-file-name">resume.pdf</span>');
    });
    const result = (await fillApplicationPage([{
      fieldId: fileField.fieldId,
      stableFieldKey: fileField.stableFieldKey,
      expectedLabel: fileField.label,
      selector: fileField.selector,
      type: fileField.type,
      value: "resume.pdf",
      file: { name: "resume.pdf", type: "application/pdf", base64: btoa("fixture") }
    }]))[0]!;
    expect(result).toMatchObject({
      success: true,
      actual: "resume.pdf",
      controlAdapter: { registrationId: "generic.native.file.v1" }
    });
  });

  it("reads framework state after focus/change/blur and a DOM rebuild", async () => {
    fixture('<input id="target" required><span id="error">必填项未填写</span>');
    const element = document.querySelector<HTMLInputElement>("#target")!;
    let stored = "";
    element.addEventListener("focus", () => { element.value = ""; });
    element.addEventListener("change", () => { stored = element.value; });
    element.addEventListener("blur", () => {
      const fresh = element.cloneNode(true) as HTMLInputElement;
      fresh.value = stored;
      element.replaceWith(fresh);
      document.querySelector("#error")!.remove();
    });
    expect((await execute(instruction("2027-06"))).result.success).toBe(true);
    expect(stored).toBe("2027-06");
    expect(observeApplicationPage().fields[0]!.currentValue).toBe(stored);
    expect(document.querySelector("#error")).toBeNull();
  });

  it("rejects a framework that clears the value rather than trying again", async () => {
    fixture('<input id="target" required>');
    const changed = vi.fn(() => { document.querySelector<HTMLInputElement>("#target")!.value = ""; });
    document.querySelector("#target")!.addEventListener("change", changed);
    const { result, native } = await execute(instruction("2027-06"));
    expect(result.success).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledOnce();
  });

  it("refuses an invalid native date before focus or value mutation", async () => {
    fixture('<input id="target" type="date" value="2027-06-01" required>');
    const focused = vi.fn(); document.querySelector("#target")!.addEventListener("focus", focused);
    expect((await execute(instruction("2027-02-31"))).result.driverFailureCode).toBe("control_value_invalid");
    expect(focused).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("#target")!.value).toBe("2027-06-01");
  });

  it.each(['readonly', 'role="combobox"', 'aria-autocomplete="list"', 'class="custom-datepicker"'])("never operates an unregistered %s target", async attributes => {
    fixture(`<input id="target" ${attributes} required>`);
    const click = vi.fn(); document.addEventListener("click", click, { once: true });
    const { result, native } = await execute(instruction("2027-06"));
    expect(result).toMatchObject({ success: false, driverFailureCode: "unsupported_required_control" });
    expect(native).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    document.removeEventListener("click", click);
  });

  it("rejects disabled inputs and observer collision ordinals", async () => {
    fixture('<input id="target" disabled required>');
    expect((await execute(instruction("test"))).result.driverFailureCode).toBe("control_disabled");
    fixture('<input id="target" required>');
    const next = instruction("test");
    const page = observeApplicationPage();
    const field = page.fields[0]!;
    field.stableFieldKey += "#0";
    page.fields.push({ ...field, fieldId: "other", stableFieldKey: field.stableFieldKey.replace("#0", "#1") });
    const write = vi.fn();
    expect(await dispatchControlInstruction(page, { ...next, stableFieldKey: field.stableFieldKey }, { "generic.native.v1": write }))
      .toMatchObject({ success: false, driverFailureCode: "control_target_missing" });
    expect(write).not.toHaveBeenCalled();
  });
});
