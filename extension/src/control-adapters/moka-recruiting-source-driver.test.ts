// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "../page-adapter.js";
import { findDynamicReadbackField } from "../vision-form-runtime.js";
import {
  executeMokaRecruitingSourceDriver,
  inspectMokaRecruitingSourceCommitPointInPage,
  inspectMokaRecruitingSourceTargetInPage,
  isMokaEqhrTravelAcceptanceApplicationUrl,
  isMokaEqhrTravelAcceptanceField,
  isMokaYongxingEthnicityApplicationUrl,
  isMokaYongxingEthnicityField,
  isMokaRecruitingSourceApplicationUrl,
  isMokaRecruitingSourceField,
  isMokaRecruitingSourceInteractionFailure,
  isMokaSinaWeiboFrequencyApplicationUrl,
  isMokaSinaWeiboFrequencyField,
  isMokaSungrowApplicationUrl,
  isMokaSungrowIdentityDocumentTypeField,
  isMokaSungrowRelativeEmploymentField,
  mokaRecruitingSourceReadbackMatches,
  readMokaRecruitingSourceInPage,
  type MokaRecruitingSourceProbe,
  type MokaRecruitingSourceReadback
} from "./moka-recruiting-source-driver.js";

const html = String.raw;

it("keeps the source identity when a committed Select clears its placeholder", () => {
  if (!globalThis.CSS) Object.defineProperty(globalThis, "CSS", {
    configurable: true, value: { escape: (value: string) => value }
  });
  installSourceFixture({ validationError: false });
  const before = observeApplicationPage().fields.find(field => field.selector === "#source-input")!;
  installSourceFixture({ display: "公司官网", validationError: false });
  const after = observeApplicationPage();
  const current = after.fields.find(field => field.selector === "#source-input")!;
  expect(before.label).toBe("请选择信息来源渠道");
  expect(current.currentValue).toBe("公司官网");
  expect(current.stableFieldKey).toBe(before.stableFieldKey);
  expect(findDynamicReadbackField(before, after)).toEqual(current);
});

it("does not assign source identity to an unrelated select sharing the placeholder", () => {
  installSourceFixture({ validationError: false });
  document.querySelector(".title-IWWQ0Xa4L7")!.textContent = "是否接受调剂";
  expect(observeApplicationPage().fields.find(field => field.selector === "#source-input")?.stableFieldKey)
    .not.toContain("recruiting_source");
});

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  if (!("innerText" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() { return this.textContent ?? ""; },
      set(value: string) { this.textContent = value; }
    });
  }
  if (!("scrollIntoView" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined
    });
  }
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const element = this as HTMLElement;
    const top = Number(element.dataset.top ?? 20);
    const left = Number(element.dataset.left ?? 20);
    const width = Number(element.dataset.width ?? 287);
    const height = Number(element.dataset.height ?? 32);
    return {
      x: left, y: top, top, left, right: left + width, bottom: top + height,
      width, height, toJSON: () => ({ top, left, width, height })
    } as DOMRect;
  });
  document.elementFromPoint = vi.fn((x: number, y: number) => {
    const candidates = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
          style.visibility !== "hidden" && x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom;
      });
    return candidates.at(-1) ?? null;
  });
});

function installSourceFixture(input: {
  popupOpen?: boolean;
  display?: string;
  validationError?: boolean;
  title?: string;
  options?: string[];
  inputPresent?: boolean;
} = {}) {
  const popupOpen = input.popupOpen ?? false;
  const display = input.display ?? "请选择";
  const validationError = input.validationError ?? true;
  const title = input.title ?? "请选择信息来源渠道";
  const options = input.options ?? ["IC芯启航", "浦东新区青年人才直通车"];
  const inputPresent = input.inputPresent ?? true;
  document.body.innerHTML = html`
    <div class="apply-field-Q2iJ7AtQGX select_info-zjdod05hST" data-top="20" data-left="20" data-width="320" data-height="220">
      <div class="title-IWWQ0Xa4L7" data-top="20" data-left="20" data-width="287" data-height="25">${title}</div>
      <div class="ctrl-CICMG4Fr4_" data-top="50" data-left="20" data-width="287" data-height="40">
        <div class="sd-Dropdown-container-1CigZ" data-top="50" data-left="20" data-width="287" data-height="40">
          <label class="sd-Input-container sd-Select-container-1Eq4x" data-top="50" data-left="20" data-width="287" data-height="40">
            <span class="sd-Input-display-value" data-top="55" data-left="30" data-width="240" data-height="28">
              <span id="source-display" data-top="55" data-left="30" data-width="240" data-height="28">${display}</span>
            </span>
            ${inputPresent ? `<input id="source-input" class="sd-Input-input-10L0t" type="text"
              placeholder="${display === "请选择" ? "请选择" : ""}" value=""
              data-top="50" data-left="20" data-width="287" data-height="40" />` : ""}
          </label>
          <div class="sd-Dropdown-dropdown-GmACl" style="display:${popupOpen ? "block" : "none"}"
            data-top="90" data-left="20" data-width="287" data-height="130">
            <div class="sd-Menu-container-2WPiF" data-top="90" data-left="20" data-width="287" data-height="130">
              ${options.map((option, index) => `<div class="sd-Menu-content-item-3BOO1" data-top="${98 + index * 28}" data-left="28" data-width="251" data-height="24"><div class="option-label-p2B4X" data-top="${98 + index * 28}" data-left="28" data-width="251" data-height="24">${option}</div></div>`).join("")}
            </div>
          </div>
        </div>
        ${validationError
          ? '<div id="source-error" class="error-message" data-top="224" data-left="20" data-width="160" data-height="24">必填项未填写</div>'
          : ""}
      </div>
    </div>
  `;
}

const point = { x: 100, y: 70, tagName: "INPUT", className: "sd-Input-input" };
const leafPoint = { x: 150, y: 138, tagName: "DIV", className: "option-label" };
const closedProbe = (scrolled = false): MokaRecruitingSourceProbe => ({
  status: "popup_closed",
  controlPoint: point,
  leafPoint: null,
  popupCount: 0,
  matchingLeafCount: 0,
  availableOptions: [],
  scrolled
});
const readyProbe = (): MokaRecruitingSourceProbe => ({
  status: "ready",
  controlPoint: point,
  leafPoint,
  popupCount: 1,
  matchingLeafCount: 1,
  availableOptions: ["IC芯启航", "浦东新区青年人才直通车"],
  scrolled: false
});
const missingProbe = (): MokaRecruitingSourceProbe => ({
  status: "leaf_missing",
  controlPoint: point,
  leafPoint: null,
  popupCount: 1,
  matchingLeafCount: 0,
  availableOptions: ["IC芯启航", "浦东新区青年人才直通车"],
  scrolled: false
});

type ScriptInput = { func: { name: string }; args?: unknown[] };

function installScriptHarness(handlers: Record<string, (input: ScriptInput) => unknown>) {
  const executeScript = vi.fn(async (input: ScriptInput) => [{ result: handlers[input.func.name]?.(input) ?? null }]);
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { scripting: { executeScript } }
  });
  return executeScript;
}

function actions() {
  return {
    prepareSurface: vi.fn(async () => undefined),
    clickPoint: vi.fn(async () => undefined),
    commitSelection: vi.fn(async () => true)
  };
}

describe("Moka recruiting-source real control contract", () => {
  it("recognizes only Moka application URLs and recruiting-source semantics", () => {
    expect(isMokaRecruitingSourceApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/canrui/42687#/job/job-1/apply"
    )).toBe(true);
    expect(isMokaRecruitingSourceApplicationUrl("https://careers.example.com/job/job-1/apply")).toBe(false);
    expect(isMokaRecruitingSourceField({ label: "请选择信息来源渠道" })).toBe(true);
    expect(isMokaRecruitingSourceField({ label: "招聘信息获取渠道" })).toBe(true);
    expect(isMokaRecruitingSourceField({ label: "简历渠道" })).toBe(true);
    expect(isMokaRecruitingSourceField({ label: "意向工作城市" })).toBe(false);
  });

  it("recognizes only the exact Sina campaign and Weibo-frequency field", () => {
    const applicationUrl =
      "https://app.mokahr.com/campus-recruitment/sina/43536#/job/job-1/apply";
    expect(isMokaSinaWeiboFrequencyApplicationUrl(applicationUrl)).toBe(true);
    expect(isMokaSinaWeiboFrequencyApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/sina/43537#/job/job-1/apply"
    )).toBe(false);
    expect(isMokaSinaWeiboFrequencyField({ label: "您使用微博的频率" })).toBe(true);
    expect(isMokaSinaWeiboFrequencyField({ label: "招聘信息获取渠道" })).toBe(false);
  });

  it("locates the exact live Sina Weibo-frequency option without broadening source matching", () => {
    const options = [
      "高频：过去30天或自然月的活跃天数≥20天",
      "中高频：过去30天或自然月的活跃天数 10-19天",
      "中低频：过去30天或自然月的活跃天数 1-9天"
    ];
    installSourceFixture({ popupOpen: true, title: "您使用微博的频率", options });
    expect(inspectMokaRecruitingSourceTargetInPage(
      "#source-input",
      options[2]!,
      "observe",
      "sina_weibo_frequency"
    )).toMatchObject({
      status: "ready",
      matchingLeafCount: 1,
      availableOptions: options
    });
    expect(inspectMokaRecruitingSourceTargetInPage(
      "#source-input",
      options[2]!
    )).toMatchObject({ status: "control_missing" });
  });

  it("recognizes only the exact EQHR campaign and travel-acceptance field", () => {
    const applicationUrl =
      "https://app.mokahr.com/campus-recruitment/eqhr/39786#/job/job-1/apply";
    expect(isMokaEqhrTravelAcceptanceApplicationUrl(applicationUrl)).toBe(true);
    expect(isMokaEqhrTravelAcceptanceApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/eqhr/39787#/job/job-1/apply"
    )).toBe(false);
    expect(isMokaEqhrTravelAcceptanceField({ label: "是否接受出差" })).toBe(true);
    expect(isMokaEqhrTravelAcceptanceField({ label: "意向工作城市" })).toBe(false);
  });

  it("recognizes only the exact Yongxing campaign and ethnicity field", () => {
    const applicationUrl =
      "https://app.mokahr.com/campus-recruitment/yongxingsec/27127#/job/job-1/apply";
    expect(isMokaYongxingEthnicityApplicationUrl(applicationUrl)).toBe(true);
    expect(isMokaYongxingEthnicityApplicationUrl(applicationUrl.replace("27127", "27128"))).toBe(false);
    expect(isMokaYongxingEthnicityField({ label: "民族" })).toBe(true);
    expect(isMokaYongxingEthnicityField({ label: "意向工作城市" })).toBe(false);
  });

  it("locates the Yongxing ethnicity option through the shared flat-select state machine", () => {
    installSourceFixture({ popupOpen: true, title: "民族", options: ["汉族", "满族"] });
    expect(inspectMokaRecruitingSourceTargetInPage(
      "#source-input",
      "汉族",
      "observe",
      "yongxing_ethnicity"
    )).toMatchObject({ status: "ready", matchingLeafCount: 1, availableOptions: ["汉族", "满族"] });
  });

  it("locates the exact live EQHR travel option through authoritative readback", () => {
    const options = ["是", "否", "不确定"];
    installSourceFixture({ popupOpen: true, title: "是否接受出差", options });
    expect(inspectMokaRecruitingSourceTargetInPage(
      "#source-input",
      "否",
      "observe",
      "eqhr_travel_acceptance"
    )).toMatchObject({
      status: "ready",
      matchingLeafCount: 1,
      availableOptions: options
    });
    expect(readMokaRecruitingSourceInPage(
      "#source-input",
      "eqhr_travel_acceptance"
    )).toMatchObject({ popupClosed: false });
  });

  it("recognizes only the exact Sungrow campaign and registered flat Select fields", () => {
    const applicationUrl =
      "https://app.mokahr.com/campus-recruitment/sungrow/94416#/job/job-1/apply";
    expect(isMokaSungrowApplicationUrl(applicationUrl)).toBe(true);
    expect(isMokaSungrowApplicationUrl(
      "https://app.mokahr.com/campus-recruitment/sungrow/94417#/job/job-1/apply"
    )).toBe(false);
    expect(isMokaSungrowIdentityDocumentTypeField({ label: "证件号码" })).toBe(true);
    expect(isMokaSungrowIdentityDocumentTypeField({ label: "证件类型" })).toBe(true);
    expect(isMokaSungrowRelativeEmploymentField({
      label: "有无直系或旁系亲属在本单位（含其他关联公司）任职？"
    })).toBe(true);
    expect(isMokaSungrowRelativeEmploymentField({ label: "是否接受出差" })).toBe(false);
  });

  it("locates each exact Sungrow flat Select without broad field fallback", () => {
    installSourceFixture({ popupOpen: true, title: "证件号码", options: ["身份证", "护照"] });
    expect(inspectMokaRecruitingSourceTargetInPage(
      "#source-input",
      "身份证",
      "observe",
      "sungrow_identity_document_type"
    )).toMatchObject({ status: "ready", matchingLeafCount: 1 });

    installSourceFixture({
      popupOpen: true,
      title: "有无直系或旁系亲属在本单位（含其他关联公司）任职？",
      options: ["有", "无"]
    });
    expect(inspectMokaRecruitingSourceTargetInPage(
      "#source-input",
      "无",
      "observe",
      "sungrow_relative_employment"
    )).toMatchObject({ status: "ready", matchingLeafCount: 1 });
  });

  it("reproduces display selected while required validation remains", () => {
    installSourceFixture({ display: "浦东新区青年人才直通车", validationError: true });
    expect(document.querySelector<HTMLInputElement>("#source-input")?.value).toBe("");
    expect(readMokaRecruitingSourceInPage("#stale-selector")).toEqual({
      actual: "浦东新区青年人才直通车",
      popupClosed: true,
      validationCleared: false
    });
    expect(mokaRecruitingSourceReadbackMatches(
      "浦东新区青年人才直通车",
      "浦东新区青年人才直通车"
    )).toBe(true);
  });

  it("reads and commits the unique semantic field after Moka removes the original input", () => {
    installSourceFixture({ display: "浦东新区青年人才直通车", validationError: false, inputPresent: false });
    expect(readMokaRecruitingSourceInPage("#stale-source-input")).toEqual({
      actual: "浦东新区青年人才直通车",
      popupClosed: true,
      validationCleared: true
    });
    expect(inspectMokaRecruitingSourceCommitPointInPage("#stale-source-input")).toMatchObject({
      tagName: "DIV",
      className: expect.stringContaining("title-")
    });
  });

  it("finds the unique exact option leaf and the unique inert title commit point", () => {
    installSourceFixture({ popupOpen: true });
    expect(inspectMokaRecruitingSourceTargetInPage(
      "#source-input",
      "浦东新区青年人才直通车"
    )).toMatchObject({
      status: "ready",
      popupCount: 1,
      matchingLeafCount: 1,
      availableOptions: ["IC芯启航", "浦东新区青年人才直通车"],
      leafPoint: { tagName: "DIV", className: expect.stringContaining("option-label") }
    });
    expect(inspectMokaRecruitingSourceCommitPointInPage("#source-input")).toMatchObject({
      tagName: "DIV",
      className: expect.stringContaining("title-")
    });
  });

  it("fails closed when the title commit target is genuinely ambiguous", () => {
    installSourceFixture({ display: "浦东新区青年人才直通车" });
    const duplicate = document.createElement("div");
    duplicate.innerText = "请选择信息来源渠道";
    duplicate.dataset.top = "260";
    document.querySelector(".apply-field-Q2iJ7AtQGX")?.append(duplicate);
    expect(inspectMokaRecruitingSourceCommitPointInPage("#source-input")).toBeNull();
  });

  it("returns live options without changing the input when the target option is absent", () => {
    installSourceFixture({ popupOpen: true });
    const input = document.querySelector<HTMLInputElement>("#source-input")!;
    let inputEvents = 0;
    let changeEvents = 0;
    input.addEventListener("input", () => { inputEvents += 1; });
    input.addEventListener("change", () => { changeEvents += 1; });
    expect(inspectMokaRecruitingSourceTargetInPage("#source-input", "朋友推荐")).toMatchObject({
      status: "leaf_missing",
      availableOptions: ["IC芯启航", "浦东新区青年人才直通车"]
    });
    expect(input.value).toBe("");
    expect(inputEvents).toBe(0);
    expect(changeEvents).toBe(0);
  });
});

describe("Moka recruiting-source Driver state machine", () => {
  it("discovers stable live options and closes the popup without selecting an answer", async () => {
    let inspectCount = 0;
    installScriptHarness({
      readMokaRecruitingSourceInPage: () => ({ actual: "", validationCleared: false, popupClosed: true }),
      inspectMokaRecruitingSourceTargetInPage: (input) => input.args?.[2] === "prepare_open"
        ? closedProbe(true)
        : (++inspectCount <= 2 ? closedProbe() : missingProbe())
    });
    const driverActions = actions();
    const result = await executeMokaRecruitingSourceDriver({
      tabId: 7,
      selector: "#source-input",
      expected: "",
      discoverOptions: true,
      ...driverActions,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      success: true,
      actual: "",
      validationCleared: false,
      popupClosed: true,
      availableOptions: ["IC芯启航", "浦东新区青年人才直通车"],
      diagnostics: {
        failureCode: null,
        ledger: {
          openClickCount: 1,
          leafClickCount: 0,
          commitClickCount: 1,
          trustedPointerClickCount: 2
        }
      }
    });
    expect(driverActions.clickPoint).toHaveBeenCalledOnce();
    expect(driverActions.commitSelection).toHaveBeenCalledOnce();
  });

  it("selects once, commits once, and succeeds only after validation clears", async () => {
    let inspectCount = 0;
    const readbacks: MokaRecruitingSourceReadback[] = [
      { actual: "", validationCleared: false, popupClosed: true },
      { actual: "浦东新区青年人才直通车", validationCleared: false, popupClosed: true },
      { actual: "浦东新区青年人才直通车", validationCleared: true, popupClosed: true }
    ];
    installScriptHarness({
      readMokaRecruitingSourceInPage: () => readbacks.shift() ?? null,
      inspectMokaRecruitingSourceTargetInPage: (input) => input.args?.[2] === "prepare_open"
        ? closedProbe(true)
        : (++inspectCount <= 2 ? closedProbe() : readyProbe())
    });
    const driverActions = actions();
    const result = await executeMokaRecruitingSourceDriver({
      tabId: 7,
      selector: "#source-input",
      expected: "浦东新区青年人才直通车",
      ...driverActions,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      success: true,
      stage: "readback",
      actual: "浦东新区青年人才直通车",
      validationCleared: true,
      popupClosed: true,
      diagnostics: {
        failureCode: null,
        ledger: {
          prepareSurfaceCount: 1,
          scrollCount: 1,
          openClickCount: 1,
          leafClickCount: 1,
          commitClickCount: 1,
          trustedPointerClickCount: 3,
          nativeEventClickCount: 0,
          retryCount: 0,
          reloadCount: 0,
          fullFormRestartCount: 0
        }
      }
    });
    expect(driverActions.clickPoint).toHaveBeenCalledTimes(2);
    expect(driverActions.commitSelection).toHaveBeenCalledTimes(1);
  });

  it("returns leaf_missing after one open and never invents a replacement", async () => {
    let inspectCount = 0;
    installScriptHarness({
      readMokaRecruitingSourceInPage: () => ({ actual: "", validationCleared: false, popupClosed: true }),
      inspectMokaRecruitingSourceTargetInPage: (input) => input.args?.[2] === "prepare_open"
        ? closedProbe(true)
        : (++inspectCount <= 2 ? closedProbe() : missingProbe())
    });
    const driverActions = actions();
    const result = await executeMokaRecruitingSourceDriver({
      tabId: 7,
      selector: "#source-input",
      expected: "朋友推荐",
      ...driverActions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: false,
      stage: "select",
      availableOptions: ["IC芯启航", "浦东新区青年人才直通车"],
      diagnostics: {
        failureCode: "leaf_missing",
        ledger: { openClickCount: 1, leafClickCount: 0, commitClickCount: 0 }
      }
    });
    expect(isMokaRecruitingSourceInteractionFailure(result.error)).toBe(true);
    expect(driverActions.clickPoint).toHaveBeenCalledTimes(1);
    expect(driverActions.commitSelection).not.toHaveBeenCalled();
  });

  it("does not overwrite a different pre-existing information source", async () => {
    installScriptHarness({
      readMokaRecruitingSourceInPage: () => ({
        actual: "校园宣讲会/双选会",
        validationCleared: true,
        popupClosed: true
      })
    });
    const driverActions = actions();
    const result = await executeMokaRecruitingSourceDriver({
      tabId: 7,
      selector: "#source-input",
      expected: "浦东新区青年人才直通车",
      ...driverActions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: false,
      stage: "readback",
      diagnostics: { failureCode: "preexisting_value_mismatch" }
    });
    expect(driverActions.prepareSurface).not.toHaveBeenCalled();
    expect(driverActions.clickPoint).not.toHaveBeenCalled();
    expect(driverActions.commitSelection).not.toHaveBeenCalled();
  });

  it("rebinds and scrolls an already displayed target before its one commit click", async () => {
    const readbacks: MokaRecruitingSourceReadback[] = [
      { actual: "浦东新区青年人才直通车", validationCleared: false, popupClosed: true },
      { actual: "浦东新区青年人才直通车", validationCleared: true, popupClosed: true }
    ];
    installScriptHarness({
      readMokaRecruitingSourceInPage: () => readbacks.shift() ?? null,
      inspectMokaRecruitingSourceTargetInPage: () => closedProbe(true)
    });
    const driverActions = actions();
    const result = await executeMokaRecruitingSourceDriver({
      tabId: 7,
      selector: "#stale-source-input",
      expected: "浦东新区青年人才直通车",
      ...driverActions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: true,
      diagnostics: {
        ledger: {
          scrollCount: 1,
          openClickCount: 0,
          leafClickCount: 0,
          commitClickCount: 1,
          trustedPointerClickCount: 1
        }
      }
    });
    expect(driverActions.clickPoint).not.toHaveBeenCalled();
    expect(driverActions.commitSelection).toHaveBeenCalledTimes(1);
  });
});
