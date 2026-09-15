// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { inspectMokaSharedSelectInPage, executeMokaSharedSelectDriver,
  isMokaFlatSelectInteractionFailure, mokaFlatSelectValuesMatch } from "./moka-shared-select-driver.js";
import { observeApplicationPage } from "../page-adapter.js";
import { bindObservedInstruction, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";
import { authoritativeCandidateFactForField, enrichVisionCandidateFacts } from "../vision-form-runtime.js";
import { isPreferredWorkCityField } from "../preferred-city-policy.js";

const url = "https://app.mokahr.com/campus-recruitment/unregistered/1#/job/test/apply";
const rendered = (element: Element) => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.getAttribute("style")?.includes("display:none")) return false;
  }
  return true;
};
beforeEach(() => {
  vi.stubGlobal("location", new URL(url)); vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const y = Number((this as HTMLElement).closest("[data-y]")?.getAttribute("data-y") ?? 500);
    return { x: 10, y, left: 10, right: 210, top: y, bottom: y + 24, width: 200, height: 24, toJSON() {} };
  });
  document.elementFromPoint = vi.fn((_x, y) => [...document.querySelectorAll<HTMLElement>("[data-y]")]
    .filter(element => rendered(element) && y >= Number(element.dataset.y) && y <= Number(element.dataset.y) + 24).at(-1) ?? null);
  document.body.innerHTML = `<h1>申请信息</h1><label>姓名<input placeholder="姓名" required></label>
    <label>手机号码<input type="tel" placeholder="手机号码" required></label><label>邮箱<input type="email" placeholder="邮箱" required></label>
    <div class="apply-field-test Select-test"><div class="title-test" data-y="30">性别 / Gender</div>
      <div class="sd-Dropdown-container-test"><label class="sd-Select-container-test" data-y="70">
        <span class="sd-Input-display-value-test"></span><input id="gender" class="sd-Input-input-test" placeholder="请选择" data-y="70"></label>
        <div class="sd-Dropdown-dropdown-test" style="display:none"><div class="sd-Menu-container-test">
          <div class="sd-Menu-content-item-test"><div class="option-label-test" data-y="110">男 / Male</div></div>
          <div class="sd-Menu-content-item-test"><div class="option-label-test" data-y="150">女 / Female</div></div>
        </div></div></div><div class="error-message" data-y="200">必填项未填写</div>
    </div><button>预览并提交</button>`;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function cloneChromeScriptArgs(args: unknown[]): unknown[] {
  const visit = (value: unknown, path: string): void => {
    if (value === undefined || typeof value === "function" || typeof value === "symbol" ||
      typeof value === "bigint") throw new TypeError(`Value is unserializable at ${path}`);
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) return void value.forEach((item, index) => visit(item, `${path}[${index}]`));
    Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`));
  };
  visit(args, "args");
  return JSON.parse(JSON.stringify(args)) as unknown[];
}

function harness(expected = "男 / Male", discoverOptions = false, staleObserverAfterSelection = false) {
  const page = observeApplicationPage();
  const field = page.fields.find(field => field.selector.includes("gender"))!;
  expect(field).toBeTruthy();
  const route = resolveControlAdapter(evidenceForField(page, field));
  expect(route.code).toBe("moka.flat-select.trusted-focus.v1");
  const instruction = { fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, selector: field.selector,
    expectedLabel: field.label, type: field.type, value: expected, applicationUrl: page.url, controlAdapter: route.diagnostic };
  const executeScript = vi.fn(async ({ func, args = [] }) => {
    const serializedArgs = cloneChromeScriptArgs(args);
    const result = await func(...serializedArgs);
    // Exercise the actual observer; unrelated application-stage signals are outside this single-control fixture.
    if (func === observeApplicationPage && staleObserverAfterSelection && display.textContent) {
      return [{ result: { ...result, pageStage: "application_form", fields: result.fields.map((candidate: typeof field) =>
        candidate.fieldId === field.fieldId ? { ...candidate, currentValue: "" } : candidate) } }];
    }
    return [{ result: func === observeApplicationPage ? { ...result, pageStage: "application_form" } : result }];
  });
  vi.stubGlobal("chrome", { scripting: { executeScript } });
  const popup = document.querySelector<HTMLElement>("[class*='Dropdown-dropdown']")!;
  const display = document.querySelector<HTMLElement>("[class*='Input-display-value']")!;
  const input = document.querySelector<HTMLInputElement>("#gender")!;
  const writes = vi.fn(); input.addEventListener("input", writes); input.addEventListener("change", writes);
  document.querySelector("[class*='Select-container']")!.addEventListener("click", () => { popup.style.display = "block"; });
  for (const item of document.querySelectorAll<HTMLElement>("[class*='Menu-content-item']")) {
    item.addEventListener("click", () => {
      display.textContent = item.textContent; popup.style.display = "none";
      const replacement = input.cloneNode() as HTMLInputElement; replacement.id = "gender-rebuilt"; replacement.placeholder = "";
      input.replaceWith(replacement);
    });
  }
  document.querySelector(".title-test")!.addEventListener("click", () => {
    popup.style.display = "none";
    if (display.textContent) document.querySelector(".error-message")!.textContent = "";
  });
  const clickPoint = vi.fn(async point => { (document.elementFromPoint(point.x, point.y) as HTMLElement).click(); });
  return { field, writes, clickPoint, executeScript,
    run: () => executeMokaSharedSelectDriver({ tabId: 1, instruction, discoverOptions,
    prepareSurface: async () => {}, clickPoint, wait: async () => {} }) };
}

function phoneCallingCodeHarness(input: {
  readOnly?: boolean;
  options: string[];
  display?: string;
  query?: string;
  phone?: string;
  phonePlaceholder?: string;
  title?: string;
  expected?: string;
  policy?: "phone_calling_code_default" | "phone_calling_code_confirmed";
}) {
  document.body.innerHTML = `<form><div class="apply-field-phone string_info-test">
    <div class="title-phone" data-y="30">${input.title ?? "手机号码"}</div><span class="required-asterisk-test"></span>
    <div class="code-phone"><div class="sd-Dropdown-container-test">
      <label class="sd-Input-container-test sd-Select-container-test" data-y="70">
        <span class="sd-Input-display-value-test"><span>${input.display ?? ""}</span></span>
        <input id="calling-code" ${input.readOnly ? "readonly" : ""} class="sd-Input-input-test" type="text" autocomplete="nope" maxlength="-1" value="${input.query ?? ""}">
        <span class="sd-Select-addon-test"></span>
      </label>
      <div class="sd-Dropdown-dropdown-test" style="display:none"><div class="sd-Select-menu-test">
        <div class="sd-Select-scrollable-test"><div class="sd-Menu-container-test">${input.options.map((option, index) =>
          `<div class="sd-Menu-content-item-test" data-y="${110 + index * 40}"><span data-key="sugar.select.label">${option}</span></div>`
        ).join("")}</div></div>
      </div></div>
    </div></div>
    <div class="number-phone"><label class="sd-Input-container-test">
      <input id="phone-number" type="text" placeholder="${input.phonePlaceholder ?? "请输入手机号"}" maxlength="255" value="${input.phone ?? ""}" aria-invalid="true">
    </label><div class="error-message">请输入正确手机号</div></div>
  </div></form>`;
  const page = observeApplicationPage();
  const field = page.fields.find(candidate => candidate.selector === "#calling-code")!;
  expect(field).toMatchObject({
    type: "combobox",
    currentValue: input.display ?? "",
    compound: { kind: "phone_number", role: "calling_code", queryValue: input.query ?? "" }
  });
  const route = resolveControlAdapter(evidenceForField(page, field));
  expect(route.code).toBe(input.readOnly ? "moka.readonly-calling-code.trusted-focus.v1" : "moka.flat-select.trusted-focus.v1");
  const instruction = {
    fieldId: field.fieldId,
    stableFieldKey: field.stableFieldKey,
    selector: field.selector,
    expectedLabel: field.label,
    type: field.type,
    value: input.expected ?? "+86",
    applicationUrl: page.url,
    controlAdapter: route.diagnostic,
    optionSelectionPolicy: input.policy ?? "phone_calling_code_default"
  };
  const executeScript = vi.fn(async ({ func, args = [] }) => {
    const serializedArgs = cloneChromeScriptArgs(args);
    const result = await func(...serializedArgs);
    return [{ result: func === observeApplicationPage ? { ...result, pageStage: "application_form" } : result }];
  });
  vi.stubGlobal("chrome", { scripting: { executeScript } });
  const popup = document.querySelector<HTMLElement>("[class*='Dropdown-dropdown']")!;
  const display = document.querySelector<HTMLElement>("[class*='Input-display-value']")!;
  const code = document.querySelector<HTMLInputElement>("#calling-code")!;
  const phone = document.querySelector<HTMLInputElement>("#phone-number")!;
  const codeWrites = vi.fn();
  const phoneWrites = vi.fn();
  code.addEventListener("input", codeWrites); code.addEventListener("change", codeWrites);
  phone.addEventListener("input", phoneWrites); phone.addEventListener("change", phoneWrites);
  document.querySelector("[class*='Select-container']")!.addEventListener("click", () => { popup.style.display = "block"; });
  const leafClicks = vi.fn();
  for (const item of document.querySelectorAll<HTMLElement>("[class*='Menu-content-item']")) {
    item.addEventListener("click", () => {
      leafClicks(item.textContent?.trim());
      display.textContent = item.textContent;
      code.value = ""; // The fixture models Moka clearing its own search draft after a real leaf click.
      popup.style.display = "none";
    });
  }
  document.querySelector(".title-phone")!.addEventListener("click", () => { popup.style.display = "none"; });
  const clickPoint = vi.fn(async point => { (document.elementFromPoint(point.x, point.y) as HTMLElement).click(); });
  return {
    field, code, phone, codeWrites, phoneWrites, leafClicks, clickPoint, executeScript,
    run: () => executeMokaSharedSelectDriver({ tabId: 1, instruction, prepareSurface: async () => {},
      clickPoint, wait: async () => {} })
  };
}

describe("shared Moka flat Select production protocol", () => {
  it.each([
    "https://app.mokahr.com/campus-recruitment/gehc/142250#/job/example/apply",
    "https://app.mokahr.com/social-recruitment/unrelated/2#/job/example/apply"
  ])("uses the boolean Select for a city-transfer question on %s", async applicationUrl => {
    vi.stubGlobal("location", new URL(applicationUrl));
    const label = "是否接受意向城市调剂？";
    document.querySelector(".title-test")!.textContent = label;
    document.querySelector(".apply-field-test")!.classList.add("bool_info-qV6GUinJsJ");
    document.querySelector("[class*='Select-container']")!.classList.add("bool_info");
    const choices = document.querySelectorAll("[class*='option-label']");
    choices[0]!.textContent = "是"; choices[1]!.textContent = "否";
    const test = harness("是");
    expect(isPreferredWorkCityField(test.field)).toBe(false);
    const cityFacts = {"candidate.preferences.preferredCity":"深圳", "job.answers.preferredCity":"上海"};
    expect(authoritativeCandidateFactForField(test.field,cityFacts)).toBeNull();
    const facts = enrichVisionCandidateFacts({}, cityFacts, {}, {facts:[{
      label,stableFieldKeys:[test.field.stableFieldKey],value:"是",source:"user_confirmed"
    }]});
    expect(authoritativeCandidateFactForField(test.field,facts)?.value).toBe("是");
    expect(await test.run()).toMatchObject({success:true,actual:"是",validationCleared:true,popupClosed:true,
      diagnostics:{ledger:{openClickCount:1,leafClickCount:1,commitClickCount:1,retryCount:0,reloadCount:0}}});
    expect(test.writes).not.toHaveBeenCalled();
  });

  it("does not merge or rebind two choices with the same title", () => {
    document.querySelector(".title-test")!.textContent = "民族";
    const root = document.querySelector(".apply-field-test")!;
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelector("input")!.id = "second-choice";
    root.after(clone);
    const page = observeApplicationPage();
    const choices = page.fields.filter(field => field.label.endsWith("民族"));
    expect(choices).toHaveLength(2);
    expect(new Set(choices.map(field => field.stableFieldKey)).size).toBe(2);
    for (const field of choices) expect(bindObservedInstruction(page, {
      fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, selector: field.selector,
      expectedLabel: field.label, type: field.type, value: "汉族"
    })).toBeNull();
  });

  it("preserves persistent field names through placeholder changes", () => {
    document.querySelector(".title-test")!.textContent = "民族";
    const input = document.querySelector<HTMLInputElement>("#gender")!;
    input.name = "ethnicity_code";
    const before = observeApplicationPage().fields.find(field => field.selector.includes("gender"))!;
    input.placeholder = "";
    const after = observeApplicationPage().fields.find(field => field.selector.includes("gender"))!;
    expect(before.stableFieldKey).toContain("ethnicity_code");
    expect(after.stableFieldKey).toBe(before.stableFieldKey);
  });

  it.each(["<input id='gender' placeholder='民族'>", "<select id='gender'><option>汉族</option><option>其他</option></select>"])(
    "keeps the same title rendered as a native control outside the custom Select Driver: %s", markup => {
      document.querySelector(".apply-field-test")!.outerHTML = `<label>民族${markup}</label>`;
      const page = observeApplicationPage();
      const field = page.fields.find(field => field.selector.includes("gender"))!;
      const route = resolveControlAdapter(evidenceForField(page, field));
      expect(route.driver).toBe("generic_native");
      expect(route.code).not.toBe("moka.flat-select.trusted-focus.v1");
    }
  );

  it.each([
    ["民族", "汉族", "其他"],
    ["是否在实习地有住所", "是", "否"],
    ["是否愿意来深圳工作", "是", "否"],
    ["成绩排名", "前10%", "其他"],
    ["获取BIGO校招信息的途径或渠道", "招聘网站", "宣讲会"]
  ].flatMap(([label, expected, alternative]) =>
    [url, "https://app.mokahr.com/social-recruitment/unrelated/2#/job/another/apply"]
      .map(applicationUrl => ({ label: label!, expected: expected!, alternative: alternative!, applicationUrl }))))(
    "preserves $label identity and its labeled legacy answer on $applicationUrl", async ({ label, expected, alternative, applicationUrl }) => {
      vi.stubGlobal("location", new URL(applicationUrl));
      document.querySelector(".title-test")!.textContent = label;
      const options = document.querySelectorAll<HTMLElement>("[class*='option-label']");
      options[0]!.textContent = expected;
      options[1]!.textContent = alternative;
      const test = harness(expected);
      const facts = enrichVisionCandidateFacts({}, {}, {}, { facts: [{
        stableFieldKeys: ["other.请选择.combobox#0"], label, value: expected, source: "user_confirmed"
      }] });
      expect(authoritativeCandidateFactForField(test.field, facts)?.value).toBe(expected);
      expect(test.field.stableFieldKey).not.toContain("请选择");
      expect(test.field.stableFieldKey).not.toMatch(/\.field\d+$/);
      expect(await test.run()).toMatchObject({ success: true, actual: expected, popupClosed: true, validationCleared: true,
        diagnostics: { ledger: { openClickCount: 1, leafClickCount: 1, commitClickCount: 1, retryCount: 0, reloadCount: 0 } } });
      const after = observeApplicationPage().fields.find(field => field.selector.includes("gender-rebuilt"))!;
      expect(after.stableFieldKey).toBe(test.field.stableFieldKey);
      expect(authoritativeCandidateFactForField(after, facts)?.value).toBe(expected);
      expect(test.writes).not.toHaveBeenCalled();
  });

  it.each([
    "https://app.mokahr.com/campus-recruitment/unregistered/1#/job/test/apply",
    "https://app.mokahr.com/social-recruitment/unrelated/2#/job/another/apply"
  ])("opens, selects, rebinds, commits and reads the shared Select on %s", async applicationUrl => {
    vi.stubGlobal("location", new URL(applicationUrl));
    const test = harness();
    expect(await test.run()).toMatchObject({ success: true, actual: "男 / Male", popupClosed: true, validationCleared: true,
      diagnostics: { ledger: { openClickCount: 1, leafClickCount: 1, commitClickCount: 1, retryCount: 0, reloadCount: 0 } } });
    expect(test.writes).not.toHaveBeenCalled();
    expect(test.clickPoint).toHaveBeenCalledTimes(3);
    expect(document.querySelector<HTMLInputElement>("#gender-rebuilt")!.value).toBe("");
  });
  it("uses only Chrome-serializable MAIN-world args for an ordinary flat select", async () => {
    const test = harness("女/Female");
    expect(await test.run()).toMatchObject({ success: true, actual: "女 / Female" });
    const probeArgs = test.executeScript.mock.calls
      .map(([injection]) => injection.args as unknown[])
      .filter(args => args.length === 4);
    expect(probeArgs.length).toBeGreaterThan(0);
    expect(probeArgs.every(args => args[3] === null)).toBe(true);
    expect(() => cloneChromeScriptArgs(["#gender", "女/Female", "observe", undefined])).toThrow(
      "Value is unserializable at args[3]"
    );
  });
  it("keeps the ordinary flat-select rule that refuses to overwrite a different committed value", async () => {
    document.querySelector<HTMLElement>("[class*='Input-display-value']")!.textContent = "女 / Female";
    const test = harness("男 / Male");
    expect(await test.run()).toMatchObject({
      success: false,
      actual: "女 / Female",
      diagnostics: { failureCode: "preexisting_value_mismatch", ledger: { openClickCount: 0, leafClickCount: 0 } }
    });
    expect(test.clickPoint).not.toHaveBeenCalled();
    expect(test.writes).not.toHaveBeenCalled();
  });

  it("clicks the sole +86 leaf to clear a stale editable query without touching the phone input", async () => {
    const test = phoneCallingCodeHarness({ options: ["+86"], display: "+86", query: "1", phone: "13800000000" });
    const result = await test.run();
    expect(result).toMatchObject({
      success: true,
      actual: "+86",
      queryValue: "",
      resolvedExpected: "+86",
      validationCleared: true,
      popupClosed: true,
      diagnostics: { ledger: { openClickCount: 1, leafClickCount: 1, commitClickCount: 0 } }
    });
    expect(test.leafClicks).toHaveBeenCalledWith("+86");
    expect(test.codeWrites).not.toHaveBeenCalled();
    expect(test.phoneWrites).not.toHaveBeenCalled();
    expect(test.phone.value).toBe("13800000000");
    expect(test.phone.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector(".error-message")?.textContent).toBe("请输入正确手机号");
    const policyArgs = test.executeScript.mock.calls
      .map(([injection]) => injection.args as unknown[])
      .filter(args => args.length === 4);
    expect(policyArgs.length).toBeGreaterThan(0);
    expect(policyArgs.every(args => args[3] === "phone_calling_code_default")).toBe(true);
  });

  it("uses the sole real calling-code option and returns its resolved value", async () => {
    const test = phoneCallingCodeHarness({ options: ["+1"], display: "1", query: "1" });
    expect(await test.run()).toMatchObject({
      success: true,
      actual: "+1",
      resolvedExpected: "+1",
      diagnostics: { ledger: { openClickCount: 1, leafClickCount: 1 } }
    });
    expect(test.leafClicks).toHaveBeenCalledWith("+1");
  });

  it("uses the same real-leaf policy for another bounded phone calling code", async () => {
    const test = phoneCallingCodeHarness({
      options: ["+86"], display: "1", query: "1", title: "其他联系电话",
      phonePlaceholder: "请输入电话号码", phone: "13900000000"
    });
    expect(await test.run()).toMatchObject({ success: true, actual: "+86", queryValue: "" });
    expect(test.leafClicks).toHaveBeenCalledWith("+86");
    expect(test.phone.value).toBe("13900000000");
    expect(test.phoneWrites).not.toHaveBeenCalled();
  });

  it("chooses the unique +86 from multiple calling-code options", async () => {
    const test = phoneCallingCodeHarness({ options: ["+1", "+86", "+852"], display: "+1" });
    expect(await test.run()).toMatchObject({ success: true, actual: "+86", resolvedExpected: "+86" });
    expect(test.leafClicks).toHaveBeenCalledTimes(1);
    expect(test.leafClicks).toHaveBeenCalledWith("+86");
  });

  it.each([
    { options: ["+1", "+852"], failureCode: "leaf_missing" },
    { options: ["+86", "+86"], failureCode: "leaf_ambiguous" }
  ])("keeps the original calling code when the default is unavailable: $failureCode", async ({ options, failureCode }) => {
    const test = phoneCallingCodeHarness({ options, display: "+1", query: "1", phone: "13800000000" });
    expect(await test.run()).toMatchObject({
      success: false,
      actual: "+1",
      queryValue: "1",
      popupClosed: true,
      diagnostics: { failureCode, ledger: { openClickCount: 1, leafClickCount: 0, commitClickCount: 1 } }
    });
    expect(test.leafClicks).not.toHaveBeenCalled();
    expect(test.code.value).toBe("1");
    expect(test.phone.value).toBe("13800000000");
    expect(test.codeWrites).not.toHaveBeenCalled();
    expect(test.phoneWrites).not.toHaveBeenCalled();
  });

  it("lets an exact current-job calling-code answer replace the default through the same real leaves", async () => {
    const test = phoneCallingCodeHarness({
      options: ["+86", "+1"], display: "+86", expected: "+1", policy: "phone_calling_code_confirmed"
    });
    expect(await test.run()).toMatchObject({ success: true, actual: "+1", resolvedExpected: "+1" });
    expect(test.leafClicks).toHaveBeenCalledWith("+1");
  });

  it("reports the missing confirmed calling code instead of the default-policy target", async () => {
    const test = phoneCallingCodeHarness({
      options: ["+86", "+852"], display: "+86", expected: "+1", policy: "phone_calling_code_confirmed"
    });
    const result = await test.run();
    expect(result).toMatchObject({ success: false, diagnostics: { failureCode: "leaf_missing" } });
    expect(result.error).toContain("没有唯一 +1");
    expect(test.leafClicks).not.toHaveBeenCalled();
  });

  it("rejects the calling-code override when the live control loses its bounded phone structure", async () => {
    const test = phoneCallingCodeHarness({ options: ["+86"], display: "1", query: "1" });
    document.querySelector(".number-phone")!.className = "ordinary-number";
    expect(await test.run()).toMatchObject({
      success: false,
      diagnostics: { failureCode: "readback_unavailable", ledger: { openClickCount: 0, leafClickCount: 0 } }
    });
    expect(test.clickPoint).not.toHaveBeenCalled();
    expect(test.leafClicks).not.toHaveBeenCalled();
  });
  it("discovers complete options and closes without choosing, changing the value or clearing required validation", async () => {
    const test = harness("", true);
    expect(await test.run()).toMatchObject({ success: true, actual: "", validationCleared: false, popupClosed: true,
      availableOptions: ["男 / Male", "女 / Female"], diagnostics: { ledger: { openClickCount: 1, leafClickCount: 0, commitClickCount: 1 } } });
    expect(test.writes).not.toHaveBeenCalled(); expect(test.clickPoint).toHaveBeenCalledTimes(2);
  });
  it("matches a single-language site option to a bilingual candidate value without writing or searching", async () => {
    for (const item of document.querySelectorAll<HTMLElement>("[class*='Menu-content-item']")) {
      const label = item.querySelector<HTMLElement>("[class*='option-label']")!;
      item.dataset.y = label.dataset.y;
      item.textContent = label.textContent?.startsWith("男") ? "男" : "女";
    }
    const test = harness("女/Female");
    expect(await test.run()).toMatchObject({ success: true, actual: "女", validationCleared: true,
      diagnostics: { schemaVersion: "moka-flat-select-driver-diagnostic.v1",
        ledger: { openClickCount: 1, leafClickCount: 1, retryCount: 0, reloadCount: 0 } } });
    expect(test.writes).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("#gender-rebuilt")!.value).toBe("");
  });
  it("does not use substring or Chinese slash alternatives as bilingual equivalence", async () => {
    expect(mokaFlatSelectValuesMatch("男女不限", "男")).toBe(false);
    expect(mokaFlatSelectValuesMatch("校园宣讲会/双选会", "校园宣讲会")).toBe(false);
    const test = harness("男");
    document.querySelector<HTMLElement>("[class*='option-label']")!.textContent = "男女不限";
    const result = await test.run();
    expect(result).toMatchObject({ success: false, diagnostics: { failureCode: "leaf_missing", ledger: { leafClickCount: 0 } } });
    expect(isMokaFlatSelectInteractionFailure(result.error)).toBe(true);
    expect(result.error).not.toContain("recruiting_source_control_interaction_failed");
    expect(test.writes).not.toHaveBeenCalled(); expect(document.querySelector<HTMLInputElement>("#gender")!.value).toBe("");
    expect(test.clickPoint).toHaveBeenCalledOnce();
  });
  it("trusts the exact live component readback across an observer-lagged React rebuild", async () => {
    const test = harness("男 / Male", false, true);
    expect(await test.run()).toMatchObject({ success: true, actual: "男 / Male",
      popupClosed: true, validationCleared: true });
    expect(test.writes).not.toHaveBeenCalled();
  });
  it.each(["<div class='sd-Menu-header-test'>分组</div>", "<div role='tree'>地区树</div>", "<div role='grid'>日历</div>"])("does not treat %s as a flat Select", async marker => {
    document.querySelector("[class*='Menu-container']")!.insertAdjacentHTML("afterbegin", marker);
    const test = harness();
    expect(await test.run()).toMatchObject({ success: false, diagnostics: { failureCode: "unsupported_popup_structure", ledger: { leafClickCount: 0 } } });
    expect(test.clickPoint).toHaveBeenCalledOnce(); expect(test.writes).not.toHaveBeenCalled();
  });
  it("does not select a global/foreign popup when its own popup is closed", () => {
    const foreign = document.querySelector("[class*='Dropdown-dropdown']")!.cloneNode(true) as HTMLElement;
    foreign.style.display = "block"; document.body.append(foreign);
    expect(inspectMokaSharedSelectInPage("#gender", "男 / Male")).toMatchObject({ status: "popup_closed", popupCount: 0, availableOptions: [] });
  });
  it("keeps the MAIN-world probe self-contained after Chrome serializes it", () => {
    const serialized = new Function(`return (${inspectMokaSharedSelectInPage.toString()});`)() as
      typeof inspectMokaSharedSelectInPage;
    const popup = document.querySelector<HTMLElement>("[class*='Dropdown-dropdown']")!;
    popup.style.display = "block";
    expect(serialized("#gender", "女/Female")).toMatchObject({ status: "ready", matchingLeafCount: 1 });
  });
  it("rejects duplicate leaves and excludes disabled choices", () => {
    const popup = document.querySelector<HTMLElement>("[class*='Dropdown-dropdown']")!; popup.style.display = "block";
    const item = popup.querySelector("[class*='Menu-content-item']")!;
    item.parentElement!.append(item.cloneNode(true));
    expect(inspectMokaSharedSelectInPage("#gender", "男 / Male").status).toBe("leaf_ambiguous");
    for (const leaf of popup.querySelectorAll("[class*='Menu-content-item']")) leaf.setAttribute("aria-disabled", "true");
    expect(inspectMokaSharedSelectInPage("#gender", "男 / Male").availableOptions).toEqual([]);
  });
  it("fails closed when bilingual identities are not unique", () => {
    const popup = document.querySelector<HTMLElement>("[class*='Dropdown-dropdown']")!;
    popup.style.display = "block";
    const original = popup.querySelector<HTMLElement>("[class*='Menu-content-item']")!;
    original.querySelector<HTMLElement>("[class*='option-label']")!.textContent = "男";
    const duplicate = original.cloneNode(true) as HTMLElement;
    duplicate.querySelector<HTMLElement>("[class*='option-label']")!.textContent = "Male";
    duplicate.querySelector<HTMLElement>("[class*='option-label']")!.dataset.y = "190";
    popup.querySelector("[class*='Menu-container']")!.append(duplicate);
    expect(inspectMokaSharedSelectInPage("#gender", "男/Male")).toMatchObject({
      status: "leaf_ambiguous",
      matchingLeafCount: 2
    });
  });
});

 describe('Moka legacy readonly calling code',()=>{
  it.each(['手机号码','紧急联系人电话'])('selects the exact +86 without touching %s number or identity',async title=>{
    const t=phoneCallingCodeHarness({readOnly:true,title,options:['+1','+86','+886'],display:'+1',phone:'13900000000'});
    const identity=observeApplicationPage().fields.map(f=>[f.stableFieldKey,f.label,f.required]);
    const r=await t.run();expect(r.success).toBe(true);expect(r.actual).toBe('+86');
    expect(t.phone.value).toBe('13900000000');expect(t.phoneWrites).not.toHaveBeenCalled();expect(t.codeWrites).not.toHaveBeenCalled();
    expect(observeApplicationPage().fields.map(f=>[f.stableFieldKey,f.label,f.required])).toEqual(identity);
  });
  it('keeps an already correct readonly +86 without opening the menu',async()=>{
    const t=phoneCallingCodeHarness({readOnly:true,options:['+86','+1'],display:'+86'});const r=await t.run();
    expect(r.success).toBe(true);expect(t.clickPoint).not.toHaveBeenCalled();
  });
  it('does not give a readonly select permission without its phone number pair',async()=>{
    const t=phoneCallingCodeHarness({readOnly:true,options:['+86'],display:'+1'});
    document.querySelector('.number-phone')!.className='other-number';
    const r=await t.run();expect(r.success).toBe(false);expect(t.clickPoint).not.toHaveBeenCalled();
  });
  it('does not register an ordinary readonly Select',()=>{
    const control=document.querySelector<HTMLInputElement>('#gender')!;control.readOnly=true;
    const page=observeApplicationPage(),field=page.fields.find(f=>f.selector==='#gender')!;
    expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe('unresolved.custom.v1');
    expect(inspectMokaSharedSelectInPage('#gender','男').status).toBe('control_missing');
  });
 });
