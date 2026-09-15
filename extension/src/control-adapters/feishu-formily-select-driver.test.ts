// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xtool.jobs.feishu.cn/index/resume/7648900330809985318/apply"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeFeishuFormilySelectDriver,
  inspectFeishuFormilySelectInPage,
  type FeishuFormilySelectProbe
} from "./feishu-formily-select-driver.js";

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() { return this.textContent ?? ""; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const option = this.matches(".ud__select__list__item");
    const label = this.matches(".ud-formily-item-label-content");
    const siblings = option ? [...this.parentElement!.querySelectorAll(".ud__select__list__item")] : [];
    const top = option ? 120 + siblings.indexOf(this) * 40 : label ? 70 : 20;
    return { x: 20, y: top, top, left: 20, right: 300, bottom: top + 40,
      width: 280, height: 40, toJSON: () => ({}) } as DOMRect;
  });
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn((_x: number, y: number) => {
    if (y < 60) return document.querySelector(".ud__select__selector");
    if (y < 120) return document.querySelector(".ud-formily-item-label-content");
    return [...document.querySelectorAll(".ud__select__list__item")][Math.floor((y - 120) / 40)] ?? null;
  }) });
});

function install(options: string[] = [], selected = "", error = "") {
  document.body.innerHTML = `<form><div class="ud-formily-item" id="formily-item-degree">
    <div class="ud-formily-item-label"><span class="ud-formily-item-label-content">学历</span><span class="ud-formily-item-asterisk">*</span></div>
    <div class="ud__select"><div class="ud__select__selector">
      ${selected ? `<div class="ud__select__selector__selectItem">${selected}</div>` : ""}
      <input id="degree" type="search" role="combobox" readonly class="ud__select__selector__search__input ud__native-input"
        data-form-field-i18n-name="学历">
    </div></div>
    ${error ? `<div class="ud-formily-item-error-help">${error}</div>` : ""}
  </div></form>
  ${options.length ? `<div class="ud__select__dropdown"><div class="ud__select__list">${options.map(option =>
    `<div class="ud__select__list__item"><span class="ud__select__list__item__content">${option}</span></div>`).join("")}</div></div>` : ""}`;
}

const inspect = (expected = "本科", phase: "observe" | "prepare_open" = "observe") =>
  inspectFeishuFormilySelectInPage("#degree", "教育经历 1 · 学历", expected, phase);

describe("Feishu Formily flat Select probe", () => {
  it("only scrolls during preparation and then requires an actual hit on the same selector",()=>{
    install();
    let prepared=false;
    const target=document.querySelector<HTMLElement>(".ud__select__selector")!;
    Object.defineProperty(target,"getBoundingClientRect",{configurable:true,value:()=>{
      const y=prepared?20:1200;return {x:20,y,top:y,left:20,right:300,bottom:y+40,width:280,height:40};
    }});
    const scroll=vi.fn(()=>{prepared=true;});
    Object.defineProperty(target,"scrollIntoView",{configurable:true,value:scroll});
    expect(inspect()).toMatchObject({status:"control_not_clickable",controlPoint:null,scrolled:false});
    expect(scroll).not.toHaveBeenCalled();
    expect(inspect("本科","prepare_open")).toMatchObject({status:"popup_closed",scrolled:true,controlPoint:{x:160,y:40}});
    expect(scroll).toHaveBeenCalledExactlyOnceWith({behavior:"instant",block:"center",inline:"nearest"});
    Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>document.body});
    expect(inspect()).toMatchObject({status:"control_not_clickable",controlPoint:null});
  });
  it("binds one readonly Formily search input and reads exact flat options", () => {
    install(["博士", "硕士", "本科", "大专"]);
    expect(inspect()).toMatchObject({
      status: "ready", popupCount: 1, matchingLeafCount: 1,
      availableOptions: ["博士", "硕士", "本科", "大专"], actual: "", validationCleared: true
    });
  });

  it("reads only the committed selection and field-owned validation", () => {
    install([], "本科", "学历为必填");
    expect(inspect()).toMatchObject({ status: "popup_closed", actual: "本科", validationCleared: false });
  });

  it("rejects label drift, duplicate popups and non-flat popup structures", () => {
    install(["本科"]);
    expect(inspectFeishuFormilySelectInPage("#degree", "教育经历 1 · 学位", "本科"))
      .toMatchObject({ status: "field_identity_mismatch" });
    document.body.insertAdjacentHTML("beforeend", '<div class="ud__select__dropdown"><div class="ud__select__list__item">本科</div></div>');
    expect(inspect()).toMatchObject({ status: "popup_ambiguous", popupCount: 2 });
    document.querySelectorAll(".ud__select__dropdown")[1]!.remove();
    document.querySelector(".ud__select__dropdown")!.insertAdjacentHTML("afterbegin", '<div role="tree"></div>');
    expect(inspect()).toMatchObject({ status: "unsupported_popup_structure" });
  });
});

function probe(patch: Partial<FeishuFormilySelectProbe>): FeishuFormilySelectProbe {
  return { status: "popup_closed", controlPoint: { x: 10, y: 10, tagName: "DIV", className: "selector" },
    leafPoint: null, closePoint: { x: 10, y: 60, tagName: "SPAN", className: "close" },
    popupCount: 0, matchingLeafCount: 0, availableOptions: [], actual: "",
    validationCleared: true, scrolled: false, ...patch };
}

describe("Feishu Formily flat Select transaction", () => {
  it("prepares an initially out-of-viewport control before judging whether it can be clicked",async()=>{
    let prepared=false,opened=false,selected=false;
    const prepareSurface=vi.fn(async()=>undefined);
    const clickPoint=vi.fn(async(point)=>{if(point.className==="option")selected=true;else opened=true;});
    const run=await executeFeishuFormilySelectDriver({expected:"统招全日制",prepareSurface,clickPoint,wait:async()=>undefined,
      inspect:async phase=>{
        if(phase==="prepare_open")prepared=true;
        if(!prepared)return probe({status:"control_not_clickable",controlPoint:null});
        if(selected)return probe({actual:"统招全日制"});
        return opened?probe({status:"ready",popupCount:1,matchingLeafCount:1,availableOptions:["统招全日制"],leafPoint:{x:20,y:100,tagName:"DIV",className:"option"}}):probe({});
      }});
    expect(run).toMatchObject({success:true,actual:"统招全日制",validationCleared:true,popupClosed:true});
    expect(run.diagnostics.ledger).toMatchObject({prepareSurfaceCount:1,controlClickCount:1,optionClickCount:1,retryCount:0});
  });
  it("still refuses an obscured control after one preparation without clicking or falling back",async()=>{
    const prepareSurface=vi.fn(async()=>undefined),clickPoint=vi.fn(async()=>undefined);
    const run=await executeFeishuFormilySelectDriver({expected:"本科",prepareSurface,clickPoint,wait:async()=>undefined,
      inspect:async()=>probe({status:"control_not_clickable",controlPoint:null})});
    expect(run).toMatchObject({success:false,stage:"prepare_open"});
    expect(prepareSurface).toHaveBeenCalledTimes(1);expect(clickPoint).not.toHaveBeenCalled();
  });
  it("keeps an already committed offscreen choice unchanged after preparation",async()=>{
    const clickPoint=vi.fn(async()=>undefined);
    const run=await executeFeishuFormilySelectDriver({expected:"本科",prepareSurface:async()=>undefined,clickPoint,wait:async()=>undefined,
      inspect:async phase=>phase==="prepare_open"?probe({actual:"本科"}):probe({status:"control_not_clickable",controlPoint:null})});
    expect(run).toMatchObject({success:true,actual:"本科"});expect(clickPoint).not.toHaveBeenCalled();
  });
  it("opens and selects exactly once, then accepts exact closed validated readback", async () => {
    let opened = false, selected = false;
    const click = vi.fn(async (point: { className: string }) => {
      if (point.className === "option") selected = true;
      else opened = true;
    });
    const run = await executeFeishuFormilySelectDriver({
      expected: "本科",
      prepareSurface: async () => undefined,
      clickPoint: click,
      wait: async () => undefined,
      inspect: async () => selected
        ? probe({ actual: "本科" })
        : opened
          ? probe({ status: "ready", popupCount: 1, matchingLeafCount: 1, availableOptions: ["硕士", "本科"],
            leafPoint: { x: 20, y: 100, tagName: "DIV", className: "option" } })
          : probe({})
    });
    expect(run).toMatchObject({ success: true, stage: "readback", actual: "本科", popupClosed: true });
    expect(run.diagnostics.ledger).toMatchObject({ controlClickCount: 1, optionClickCount: 1, retryCount: 0 });
  });

  it("returns exact options without selecting any value during discovery", async () => {
    let opened = false;
    const click = vi.fn(async () => { opened = !opened; });
    const run = await executeFeishuFormilySelectDriver({
      expected: "", discoverOptions: true,
      prepareSurface: async () => undefined,
      clickPoint: click,
      wait: async () => undefined,
      inspect: async () => opened
        ? probe({ status: "leaf_missing", popupCount: 1, availableOptions: ["硕士", "本科"] })
        : probe({})
    });
    expect(run).toMatchObject({ success: true, availableOptions: ["硕士", "本科"], actual: "" });
    expect(run.diagnostics.ledger).toMatchObject({ controlClickCount: 1, closeClickCount: 1, optionClickCount: 0 });
  });

  it("uses one inert field-label click when selection readback needs blur validation commit", async () => {
    let opened = false, selected = false, committed = false;
    const run = await executeFeishuFormilySelectDriver({
      expected: "本科",
      prepareSurface: async () => undefined,
      clickPoint: async (point) => {
        if (point.className === "option") selected = true;
        else if (point.className === "close") committed = true;
        else opened = true;
      },
      wait: async () => undefined,
      inspect: async () => selected
        ? probe({ actual: "本科", validationCleared: committed })
        : opened
          ? probe({ status: "ready", popupCount: 1, matchingLeafCount: 1, availableOptions: ["本科"],
            leafPoint: { x: 20, y: 100, tagName: "DIV", className: "option" } })
          : probe({})
    });
    expect(run).toMatchObject({ success: true, actual: "本科", validationCleared: true });
    expect(run.diagnostics.ledger).toMatchObject({ controlClickCount: 1, optionClickCount: 1, closeClickCount: 1 });
  });

  it("does not click an approximate or absent option", async () => {
    const click = vi.fn(async () => undefined);
    let opened = false;
    const run = await executeFeishuFormilySelectDriver({
      expected: "本科生",
      prepareSurface: async () => undefined,
      clickPoint: async (point) => { opened = true; await click(point); },
      wait: async () => undefined,
      inspect: async () => opened
        ? probe({ status: "leaf_missing", popupCount: 1, availableOptions: ["本科"] })
        : probe({})
    });
    expect(run).toMatchObject({ success: false, stage: "select", availableOptions: ["本科"] });
    expect(click).toHaveBeenCalledOnce();
    expect(run.diagnostics.ledger.optionClickCount).toBe(0);
  });
});
