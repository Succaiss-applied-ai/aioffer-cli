// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeMokaNativePlaceDriver,
  inspectMokaNativePlaceTargetInPage,
  mokaNativePlaceReadbackMatches,
  normalizeMokaNativePlacePart,
  parseMokaNativePlace,
  readMokaNativePlaceInPage
} from "./moka-native-place-driver.js";

const html = String.raw;

beforeEach(() => {
  vi.unstubAllGlobals();
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const element = this as HTMLElement;
    const top = Number(element.dataset.top ?? 20);
    const left = Number(element.dataset.left ?? 20);
    const width = Number(element.dataset.width ?? 200);
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

function installFixture(popupOpen = true) {
  document.body.innerHTML = html`
    <div class="apply-field-Q2 location_info-test" data-top="20" data-left="20" data-width="580" data-height="620">
      <span class="field-title" data-top="20" data-left="20" data-width="80" data-height="24">籍贯</span>
      <span class="required-asterisk" data-top="20" data-left="90" data-width="8" data-height="24"></span>
      <div class="sd-Dropdown-container-1CigZ" data-top="50" data-left="20" data-width="560" data-height="40">
        <label class="sd-Input-container" data-top="50" data-left="20" data-width="560" data-height="40">
          <span class="sd-Input-display-value" data-top="54" data-left="30" data-width="360" data-height="30">请输入籍贯</span>
          <input id="native-place" readonly placeholder="请输入籍贯"
            data-top="50" data-left="20" data-width="560" data-height="40" />
        </label>
        <div class="native-place-cascader-popup" style="display:${popupOpen ? "block" : "none"}"
          data-top="92" data-left="20" data-width="560" data-height="500">
          <div class="tabs" data-top="100" data-left="30" data-width="520" data-height="50">
            <button id="province-tab" data-top="105" data-left="35" data-width="100" data-height="40">省份</button>
            <button id="city-tab" data-top="105" data-left="160" data-width="100" data-height="40">城市</button>
            <button id="district-tab" data-top="105" data-left="285" data-width="100" data-height="40">县区</button>
          </div>
          <div class="options" data-top="165" data-left="30" data-width="520" data-height="320">
            <button id="province-option" data-top="180" data-left="40" data-width="100" data-height="40">广东</button>
            <button id="city-option" data-top="235" data-left="40" data-width="100" data-height="40">深圳市</button>
            <button id="district-option" data-top="290" data-left="40" data-width="100" data-height="40">南山区</button>
          </div>
          <button id="confirm" data-top="520" data-left="440" data-width="110" data-height="50">确认</button>
        </div>
      </div>
      <div id="error" data-top="600" data-left="20" data-width="160" data-height="24">必填项未填写</div>
    </div>
  `;
}

describe("Moka native-place driver", () => {
  it("parses and compares the three administrative levels", () => {
    expect(parseMokaNativePlace("广东省 深圳市 南山区")).toEqual(["广东省", "深圳市", "南山区"]);
    expect(parseMokaNativePlace("广东省深圳市南山区")).toEqual(["广东省", "深圳市", "南山区"]);
    expect(parseMokaNativePlace("湖南长沙")).toEqual(["湖南", "长沙"]);
    expect(parseMokaNativePlace("湖南省长沙市")).toEqual(["湖南省", "长沙市"]);
    expect(normalizeMokaNativePlacePart("广东省")).toBe("广东");
    expect(mokaNativePlaceReadbackMatches("广东 / 深圳 / 南山", "广东省 深圳市 南山区")).toBe(true);
    expect(mokaNativePlaceReadbackMatches("广东省 深圳市 福田区", "广东省 深圳市 南山区")).toBe(false);
    expect(mokaNativePlaceReadbackMatches("深圳市 广东省 南山区", "广东省 深圳市 南山区")).toBe(false);
    expect(mokaNativePlaceReadbackMatches("湖南省 长沙市", "湖南长沙")).toBe(true);
    expect(mokaNativePlaceReadbackMatches("北京市 东城区", "北京市/北京市/东城区")).toBe(true);
  });

  it("uses the actual component independently of its title and never rebinds a missing selector", () => {
    installFixture(true);
    document.querySelector(".field-title")!.textContent="任意地点";
    document.querySelector<HTMLInputElement>("#native-place")!.placeholder="请选择";
    expect(inspectMokaNativePlaceTargetInPage("#native-place","province_tab").status).toBe("ready");
    expect(inspectMokaNativePlaceTargetInPage("#missing","open").status).toBe("control_missing");
    document.querySelector(".location_info-test")!.classList.remove("location_info-test");
    expect(inspectMokaNativePlaceTargetInPage("#native-place","open").status).toBe("control_missing");
  });

  it("addresses each tab, administrative option and confirmation separately", () => {
    installFixture(true);
    expect(inspectMokaNativePlaceTargetInPage("#native-place", "province_tab")).toMatchObject({
      status: "ready",
      matchingTargetCount: 1,
      point: expect.objectContaining({ tagName: "BUTTON" })
    });
    expect(inspectMokaNativePlaceTargetInPage("#native-place", "province", "广东省")).toMatchObject({
      status: "ready",
      matchingTargetCount: 1
    });
    expect(inspectMokaNativePlaceTargetInPage("#native-place", "city_tab")).toMatchObject({ status: "ready" });
    expect(inspectMokaNativePlaceTargetInPage("#native-place", "city", "深圳市")).toMatchObject({ status: "ready" });
    expect(inspectMokaNativePlaceTargetInPage("#native-place", "district_tab")).toMatchObject({ status: "ready" });
    expect(inspectMokaNativePlaceTargetInPage("#native-place", "district", "南山区")).toMatchObject({ status: "ready" });
    expect(inspectMokaNativePlaceTargetInPage("#native-place", "confirm")).toMatchObject({ status: "ready" });
  });

  it("prefers the canonical alphabet province when a hot-region duplicate exists", () => {
    installFixture(true);
    const options = document.querySelector<HTMLElement>(".options")!;
    options.innerHTML = html`
      <button data-top="180" data-left="40" data-width="100" data-height="40">北京市</button>
      <div class="alphabet-province-list" data-top="230" data-left="40" data-width="200" data-height="80">
        <button data-top="240" data-left="50" data-width="100" data-height="40">北京市</button>
      </div>
    `;

    expect(inspectMokaNativePlaceTargetInPage("#native-place", "province", "北京市")).toMatchObject({
      status: "ready",
      matchingTargetCount: 1
    });
  });

  it("returns a trusted page scroll when the native-place input is outside the viewport", () => {
    installFixture(false);
    document.querySelector<HTMLElement>("#native-place")!.dataset.top = "980";
    document.elementFromPoint = vi.fn(() => document.querySelector(".apply-field-Q2"));

    expect(inspectMokaNativePlaceTargetInPage("#native-place", "open")).toMatchObject({
      status: "target_needs_scroll",
      matchingTargetCount: 1,
      scrollPoint: expect.objectContaining({ tagName: "DIV" }),
      scrollDeltaY: expect.any(Number)
    });
  });

  it("returns the popup scroll surface when a unique province is clipped", () => {
    installFixture(true);
    const options = document.querySelector<HTMLElement>(".options")!;
    options.style.overflowY = "auto";
    Object.defineProperty(options, "clientHeight", { configurable: true, value: 120 });
    Object.defineProperty(options, "scrollHeight", { configurable: true, value: 520 });
    document.querySelector<HTMLElement>("#province-option")!.dataset.top = "470";
    document.elementFromPoint = vi.fn(() => options);

    expect(inspectMokaNativePlaceTargetInPage("#native-place", "province", "广东省")).toMatchObject({
      status: "target_needs_scroll",
      matchingTargetCount: 1,
      scrollPoint: expect.objectContaining({ tagName: "DIV" }),
      scrollDeltaY: expect.any(Number)
    });
  });

  it("commits a two-level native place without requiring a district", async () => {
    const observedSteps: string[] = [];
    let clickCount = 0;
    vi.stubGlobal("chrome", {
      scripting: {
        executeScript: vi.fn(async ({ args }: { args: unknown[] }) => {
          if (args.length === 1) {
            return [{ result: clickCount >= 4
              ? { actual: "湖南省 长沙市", popupClosed: true, validationCleared: true }
              : { actual: "", popupClosed: true, validationCleared: false } }];
          }
          observedSteps.push(String(args[1]));
          return [{ result: {
            status: "ready",
            point: { x: 100, y: 100, tagName: "BUTTON", className: "" },
            popupCount: 1,
            matchingTargetCount: 1,
            availableOptions: []
          } }];
        })
      }
    });

    const result = await executeMokaNativePlaceDriver({
      tabId: 1,
      selector: "#native-place",
      expected: "湖南长沙",
      clickPoint: async () => { clickCount += 1; },
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: true, stage: "readback", actual: "湖南省 长沙市" });
    expect(observedSteps).toEqual([
      "open", "province", "city", "confirm"
    ]);
    expect(result.diagnostics).toMatchObject({ trustedPointerClickCount: 4 });
  });

  it("commits a direct municipality after district without a city or confirm click", async () => {
    const observedSteps: string[] = [];
    let clickCount = 0;
    vi.stubGlobal("chrome", {
      scripting: {
        executeScript: vi.fn(async ({ args }: { args: unknown[] }) => {
          if (args.length === 1) {
            return [{ result: clickCount >= 3
              ? { actual: "北京市 东城区", popupClosed: true, validationCleared: true }
              : { actual: "", popupClosed: true, validationCleared: false } }];
          }
          observedSteps.push(String(args[1]));
          return [{ result: {
            status: "ready",
            point: { x: 100, y: 100, tagName: "BUTTON", className: "" },
            popupCount: 1,
            matchingTargetCount: 1,
            availableOptions: []
          } }];
        })
      }
    });

    const result = await executeMokaNativePlaceDriver({
      tabId: 1,
      selector: "#native-place",
      expected: "北京市/北京市/东城区",
      clickPoint: async () => { clickCount += 1; },
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: true, stage: "readback", actual: "北京市 东城区" });
    expect(observedSteps).toEqual(["open", "province", "district"]);
    expect(result.diagnostics).toMatchObject({ trustedPointerClickCount: 3 });
  });

  it("scrolls the popup list before clicking an offscreen province", async () => {
    let clickCount = 0;
    let provinceProbeCount = 0;
    const scrollDeltas: number[] = [];
    vi.stubGlobal("chrome", {
      scripting: {
        executeScript: vi.fn(async ({ args }: { args: unknown[] }) => {
          if (args.length === 1) {
            return [{ result: clickCount >= 4
              ? { actual: "湖南省 长沙市", popupClosed: true, validationCleared: true }
              : { actual: "", popupClosed: true, validationCleared: false } }];
          }
          const step = String(args[1]);
          if (step === "province" && provinceProbeCount++ === 0) {
            return [{ result: {
              status: "target_needs_scroll",
              point: null,
              scrollPoint: { x: 420, y: 360, tagName: "DIV", className: "native-place-options" },
              scrollDeltaY: 240,
              popupCount: 1,
              matchingTargetCount: 1,
              availableOptions: []
            } }];
          }
          return [{ result: {
            status: "ready",
            point: { x: 100, y: 100, tagName: "BUTTON", className: "" },
            scrollPoint: null,
            scrollDeltaY: 0,
            popupCount: 1,
            matchingTargetCount: 1,
            availableOptions: []
          } }];
        })
      }
    });

    const result = await executeMokaNativePlaceDriver({
      tabId: 1,
      selector: "#native-place",
      expected: "湖南长沙",
      clickPoint: async () => { clickCount += 1; },
      scrollPoint: async (_point, deltaY) => { scrollDeltas.push(deltaY); },
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: true, actual: "湖南省 长沙市" });
    expect(scrollDeltas).toEqual([240]);
    expect(result.diagnostics).toMatchObject({
      trustedPointerClickCount: 4,
      trustedPointerScrollCount: 1
    });
  });

  it("requires the three-level display, closed popup and cleared validation", () => {
    installFixture(false);
    document.querySelector<HTMLElement>(".sd-Input-display-value")!.innerText = "广东省 深圳市 南山区";
    document.querySelector("#error")?.remove();
    expect(readMokaNativePlaceInPage("#native-place")).toEqual({
      actual: "广东省 深圳市 南山区",
      popupClosed: true,
      validationCleared: true
    });
  });

  it.each([
    ["广东 深圳市 南山区", true, "already_committed"],
    ["广东 深圳市 福田区", false, "preexisting_value_mismatch"]
  ])("does not interact with a previously committed value %s", async (actual, success, status) => {
    vi.stubGlobal("chrome", {scripting:{executeScript:vi.fn(async () => [{result:{
      actual,popupClosed:true,validationCleared:true
    }}])}});
    const clickPoint = vi.fn(async () => undefined);
    const scrollPoint = vi.fn(async () => undefined);
    const result = await executeMokaNativePlaceDriver({tabId:1,selector:"#native-place",
      expected:"广东省 深圳市 南山区",clickPoint,scrollPoint,wait:async () => undefined});
    expect(result).toMatchObject({success,stage:"readback",diagnostics:{status,
      trustedPointerClickCount:0,trustedPointerScrollCount:0,retryCount:0,reloadCount:0,fallbackDriverCount:0}});
    expect(clickPoint).not.toHaveBeenCalled();
    expect(scrollPoint).not.toHaveBeenCalled();
  });

  it("opens at most once when the background popup does not appear", async () => {
    vi.stubGlobal("chrome", {scripting:{executeScript:vi.fn(async ({args}: {args:unknown[]}) => [{result:
      args.length === 1 ? {actual:"",popupClosed:true,validationCleared:false} :
        {status:args[1] === "open" ? "ready" : "popup_closed",
          point:args[1] === "open" ? {x:120,y:70,tagName:"INPUT",className:""} : null,
          availableOptions:[]}}])}});
    const clickPoint = vi.fn(async () => undefined);
    const scrollPoint = vi.fn(async () => undefined);
    const result = await executeMokaNativePlaceDriver({tabId:1,selector:"#native-place",
      expected:"广东省 深圳市 南山区",clickPoint,scrollPoint,wait:async () => undefined});
    expect(result).toMatchObject({success:false,stage:"province",diagnostics:{status:"popup_closed",
      eventMechanism:"cdp_trusted_pointer_focus_emulation",trustedPointerClickCount:1,retryCount:0,
      reloadCount:0,fullFormRestartCount:0,fallbackDriverCount:0}});
    expect(clickPoint).toHaveBeenCalledOnce();
    expect(scrollPoint).not.toHaveBeenCalled();
  });
});
