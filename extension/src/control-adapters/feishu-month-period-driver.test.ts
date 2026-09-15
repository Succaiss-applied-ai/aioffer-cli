// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeFeishuMonthPeriodDriver,
  inspectFeishuMonthPeriodTargetInPage,
  isFeishuMonthPeriodApplicationUrl,
  isFeishuMonthPeriodField,
  observeFeishuMonthPeriodFieldsInPage,
  prepareFeishuMonthPeriodControlInPage
} from "./feishu-month-period-driver.js";

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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const element = this as HTMLElement;
    const top = Number(element.dataset.top ?? 20);
    const left = Number(element.dataset.left ?? 20);
    const width = Number(element.dataset.width ?? 180);
    const height = Number(element.dataset.height ?? 32);
    return { x: left, y: top, top, left, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) } as DOMRect;
  });
  document.elementFromPoint = vi.fn((x: number, y: number) => [...document.querySelectorAll<HTMLElement>("body *")]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }).at(-1) ?? null);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(function (this: HTMLElement) {
      this.dataset.top = "60";
    })
  });
  window.scrollBy = vi.fn();
});

describe("Feishu throne observed panel state and year pages", () => {
  function fixture(input: { opened?: boolean; yearPanel?: boolean; firstYear?: number; noProgress?: boolean } = {}) {
    let firstYear = input.firstYear ?? 2020;
    document.body.innerHTML = `
      <div id="formily-item-career_list"><div data-form-field-id="start_end_time">
        <div class="throne-biz-date-range-picker-wrapper">
          <div id="paged-start" class="throne-biz-date-range-picker-input ${input.opened ? "ud__dropdown-open" : ""}" data-top="60" data-left="20" data-width="180" data-height="40"><input value="" /></div>
          <div id="paged-end" class="throne-biz-date-range-picker-input" data-top="60" data-left="230"><input value="2050-06" /></div>
        </div><div id="range-error">请填写完整时间</div>
      </div></div>
      <div id="paged-popup" class="throne-biz-date-range-picker-panel" style="display:${input.opened ? "block" : "none"}" data-top="110" data-left="20" data-width="400" data-height="250">
        <div class="ud__picker-panel-header">
          <span id="paged-toggle" class="ud__picker-panel-header-btn" data-top="115" data-left="30" data-width="80" data-height="30">2026年</span>
          <button id="previous" class="ud__picker-panel-header-icon" data-top="115" data-left="300" data-width="30" data-height="30"><svg data-icon="LeftBoldOutlined"></svg></button>
          <button id="next" class="ud__picker-panel-header-icon" data-top="115" data-left="350" data-width="30" data-height="30"><svg data-icon="RightBoldOutlined"></svg></button>
        </div><div id="paged-cells"></div>
      </div>`;
    const popup = document.querySelector<HTMLElement>("#paged-popup")!;
    const start = document.querySelector<HTMLElement>("#paged-start")!;
    let selectedYear = 2026;
    const render = (yearPanel: boolean) => {
      document.querySelector("#paged-cells")!.innerHTML = Array.from({ length: yearPanel ? 20 : 12 }, (_, index) => {
        const value = yearPanel ? firstYear + index : index + 1;
        return `<div class="ud__picker-${yearPanel ? "year" : "month"}-panel-cell"><div class="ud__picker__cell-interactive-area" data-top="${160 + Math.floor(index / 5) * 40}" data-left="${30 + index % 5 * 55}" data-width="45" data-height="30">${value}${yearPanel ? "" : "月"}</div></div>`;
      }).join("");
    };
    render(input.yearPanel === true);
    installScriptHarness();
    const clicks: string[] = [];
    const clickPoint = vi.fn(async (point: {x:number;y:number}) => {
      const hit = document.elementFromPoint(point.x, point.y)!;
      // Native pointer events bubble from an icon to its button. The harness
      // must model that behavior instead of requiring an HTML-only center hit.
      const element = (hit.closest("button") ?? hit) as HTMLElement;
      clicks.push(element.id || element.textContent!.trim());
      if (element === start || start.contains(element)) {
        start.classList.add("ud__dropdown-open"); popup.style.display = "block";
      } else if (element.id === "paged-toggle") render(true);
      else if (element.id === "previous" || element.id === "next") {
        if (!input.noProgress) { firstYear += element.id === "previous" ? -20 : 20; render(true); }
      } else if (element.closest(".ud__picker-year-panel-cell")) {
        selectedYear = Number(element.textContent); render(false);
      } else if (element.closest(".ud__picker-month-panel-cell")) {
        start.querySelector("input")!.value = `${selectedYear}-${String(Number(element.textContent!.replace("月", ""))).padStart(2,"0")}`;
        popup.style.display = "none"; start.classList.remove("ud__dropdown-open");
        document.querySelector("#range-error")!.remove();
      }
    });
    const run = (year = 2019) => executeFeishuMonthPeriodDriver({
      tabId: 123, selector: "#paged-start", stableFieldKey: "work[0].start_date.custom_date_picker",
      label: "工作经历 1 · 开始时间", dateValue: {year, month:9}, clickPoint, wait: vi.fn(async()=>undefined)
    });
    return { run, clickPoint, clicks, start, popup };
  }

  it.each([false, true])("reuses an owned open panel (year panel=%s) without toggling it closed", async (yearPanel) => {
    const f = fixture({opened:true,yearPanel});
    const result = await f.run(2022);
    expect(result).toMatchObject({success:true,actual:"2022-09",validationCleared:true,popupClosed:true,
      ledger:{control:0,yearToggle:yearPanel?0:1,yearPage:0,year:1,month:1,reusedOpenPanel:true}});
    expect(f.clicks).not.toContain("paged-start");
    expect(document.querySelector<HTMLInputElement>("#paged-end input")!.value).toBe("2050-06");
  });

  it.each([{year:2019,direction:"previous"},{year:2041,direction:"next"}])("navigates one real year page toward $year", async ({year,direction}) => {
    const f=fixture();
    expect(await f.run(year)).toMatchObject({success:true,actual:`${year}-09`,validationCleared:true,
      ledger:{control:1,yearToggle:1,yearPage:1,year:1,month:1}});
    expect(f.clicks.filter(x=>x===direction)).toHaveLength(1);
  });

  it("keeps the already accepted same-page sequence and does not navigate", async () => {
    const f=fixture();
    expect(await f.run(2022)).toMatchObject({success:true,ledger:{control:1,yearToggle:1,yearPage:0,year:1,month:1}});
    expect(f.clicks).toHaveLength(4);
  });

  it("stops after one navigation with no progress and reports the current open popup", async () => {
    const f=fixture({opened:true,yearPanel:true,noProgress:true});
    expect(await f.run()).toMatchObject({success:false,error:expect.stringContaining("year_page_no_progress"),popupClosed:false,actual:"",ledger:{yearPage:1}});
    expect(f.clicks).toEqual(["previous"]);
  });

  it("bounds navigation without repeating control, year, or month selection", async () => {
    const f=fixture({opened:true,yearPanel:true});
    expect(await f.run(1880)).toMatchObject({success:false,actual:"",ledger:{control:0,yearToggle:0,yearPage:6,year:0,month:0}});
    expect(f.clicks).toEqual(Array(6).fill("previous"));
  });

  it.each(["foreign","two-owners","no-owner","two-popups"])("rejects %s before any interaction",async (mode)=>{
    const f=fixture({opened:true,yearPanel:true});
    if(mode==="foreign"||mode==="no-owner")f.start.classList.remove("ud__dropdown-open");
    if(mode==="foreign"||mode==="two-owners")document.querySelector("#paged-end")!.classList.add("ud__dropdown-open");
    if(mode==="two-popups")document.body.append(f.popup.cloneNode(true));
    expect(await f.run()).toMatchObject({success:false,error:expect.stringMatching(/popup_(owner_mismatch|ambiguous)/)});
    expect(f.clickPoint).not.toHaveBeenCalled();
  });

  it.each(["disabled","duplicate","missing-icon","incomplete-years"])("rejects %s navigation without a click",async (mode)=>{
    const f=fixture({opened:true,yearPanel:true});
    const previous=document.querySelector<HTMLButtonElement>("#previous")!;
    if(mode==="disabled")previous.disabled=true;
    if(mode==="duplicate")previous.parentElement!.append(previous.cloneNode(true));
    if(mode==="missing-icon")previous.querySelector("svg")!.remove();
    if(mode==="incomplete-years")document.querySelector(".ud__picker-year-panel-cell")!.remove();
    expect(await f.run()).toMatchObject({success:false,actual:""});
    expect(f.clickPoint).not.toHaveBeenCalled();
  });

  it.each(["svg", "path"])("accepts the year-page button's own %s hit", (tag) => {
    fixture({opened:true,yearPanel:true});
    const svg = document.querySelector<SVGElement>("#previous svg")!;
    svg.innerHTML = '<path d="M0 0" class="arrow-path" />';
    const hit = tag === "svg" ? svg : svg.querySelector("path")!;
    document.elementFromPoint = vi.fn(() => hit);
    expect(inspectFeishuMonthPeriodTargetInPage("#paged-start", "year_page", "2019",
      "work[0].start_date.custom_date_picker", "工作经历 1 · 开始时间"))
      .toMatchObject({status:"ready",pageDirection:"previous",point:{tagName:tag}});
  });

  it.each(["inside-popup", "outside-popup"])("rejects an unrelated SVG %s covering the button", (where) => {
    const f=fixture({opened:true,yearPanel:true});
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    (where === "inside-popup" ? f.popup : document.body).append(svg);
    document.querySelector<HTMLElement>("#previous")!.style.cursor="pointer";
    document.elementFromPoint=vi.fn(()=>svg);
    expect(inspectFeishuMonthPeriodTargetInPage("#paged-start", "year_page", "2019",
      "work[0].start_date.custom_date_picker", "工作经历 1 · 开始时间"))
      .toMatchObject({status:"target_not_clickable",point:null});
  });

  it.each([{year:2019,button:"previous"},{year:2041,button:"next"}])("completes year-page navigation through a real SVG hit toward $year", async ({year,button}) => {
    const f=fixture({opened:true,yearPanel:true});
    const originalHit=document.elementFromPoint;
    document.elementFromPoint=vi.fn((x,y)=>{
      const hit=originalHit(x,y);
      return hit?.id===button ? hit.querySelector("svg") : hit;
    });
    expect(await f.run(year)).toMatchObject({success:true,actual:`${year}-09`,popupClosed:true,validationCleared:true,
      ledger:{control:0,yearToggle:0,yearPage:1,year:1,month:1,reusedOpenPanel:true}});
    expect(f.clicks).toEqual([button,String(year),"9月"]);
  });
});

function installFixture(popupOpen = false) {
  document.body.innerHTML = `
    <div class="atsx-form-item" data-top="20" data-left="20" data-width="420" data-height="150">
      <label class="atsx-form-item-label"><span class="atsx-form-item-required">*</span>起止时间</label>
      <div class="atsx-date-picker-period-month" data-top="55" data-left="20" data-width="360" data-height="36">
        <div id="start" class="atsx-date-picker-period-month-label" data-cy="education[0].periodInputBegin" data-top="55" data-left="20">未选择</div>
        <input id="hidden-start" type="hidden" value="" />
        <div id="end" class="atsx-date-picker-period-month-label" data-cy="education[0].periodInputEnd" data-top="55" data-left="210">2022-06</div>
      </div>
      <div id="time-error" class="atsx-form-item-error" data-top="100" data-left="20">请填写完整时间</div>
    </div>
    <div id="popup" class="atsx-date-picker-dropdown" style="display:${popupOpen ? "block" : "none"}" data-top="160" data-left="20" data-width="360" data-height="160">
      <div id="year" class="atsx-date-picker-period-month-panel-list-item" data-cy="2018" data-top="170" data-left="30">2018</div>
      <div id="month" class="atsx-date-picker-period-month-panel-list-item" data-cy="09" data-top="205" data-left="30">09</div>
    </div>`;
}

function installScriptHarness() {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { scripting: { executeScript: vi.fn(async (input: { func: (...args: never[]) => unknown; args?: never[] }) => [{ result: input.func(...(input.args ?? [])) }]) } }
  });
}

describe("Feishu month-period Driver", () => {
  it("matches the documented Feishu application families and experience ranges", () => {
    expect(isFeishuMonthPeriodApplicationUrl("https://sample.jobs.feishu.cn/615803/resume/7674912673033029929/apply")).toBe(true);
    expect(isFeishuMonthPeriodApplicationUrl("https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply")).toBe(true);
    expect(isFeishuMonthPeriodApplicationUrl("https://sample.jobs.feishu.cn/615803/position/7674912673033029929/detail")).toBe(false);
    expect(isFeishuMonthPeriodField({ stableFieldKey: "education[0].start_date.custom_date_picker" })).toBe(true);
    expect(isFeishuMonthPeriodField({ stableFieldKey: "project[0].end_date.custom_date_picker" })).toBe(true);
    expect(isFeishuMonthPeriodField({ label: "意向城市 · 开始时间" })).toBe(false);
  });

  it("observes only the visible month labels and excludes their hidden inputs", () => {
    installFixture();
    const fields = observeFeishuMonthPeriodFieldsInPage();
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({ stableFieldKey: "education[0].start_date.custom_date_picker", required: true });
    expect(fields.some((field) => field.selector.includes("hidden-start"))).toBe(false);
  });

  it("fails closed while no popup exists without mutating the page", () => {
    installFixture();
    const before = document.body.innerHTML;
    expect(inspectFeishuMonthPeriodTargetInPage("[data-cy=\"education[0].periodInputBegin\"]", "year", "2018"))
      .toMatchObject({ status: "popup_closed" });
    expect(document.body.innerHTML).toBe(before);
  });

  it("prepares only the exact ATSX year option viewport before trusted hit testing", () => {
    installFixture(true);
    const year = document.querySelector<HTMLElement>("#year")!;
    year.dataset.top = "1200";

    expect(inspectFeishuMonthPeriodTargetInPage(
      "[data-cy=\"education[0].periodInputBegin\"]",
      "year",
      "2018"
    )).toMatchObject({ status: "target_not_clickable" });
    expect(year.scrollIntoView).not.toHaveBeenCalled();

    expect(inspectFeishuMonthPeriodTargetInPage(
      "[data-cy=\"education[0].periodInputBegin\"]",
      "year",
      "2018",
      "education[0].start_date.custom_date_picker",
      "教育经历 1 · 开始时间",
      true
    )).toMatchObject({ status: "ready", targetCount: 1 });
    expect(year.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto"
    });
  });

  it("accepts xTool's unique live popup hit surface like the Moka date driver", () => {
    document.body.innerHTML = `
      <div class="throne-biz-date-range-picker-wrapper">
        <div id="throne-start" class="throne-biz-date-range-picker-input" data-top="50" data-left="20"><input value="" /></div>
      </div>
      <div id="throne-popup" class="throne-biz-date-range-picker-panel" data-top="120" data-left="20" data-width="400" data-height="260">
        <span id="year-toggle" class="ud__picker-panel-header-btn" style="cursor:pointer" data-top="130" data-left="30">2026年</span>
        <div id="year-hit-surface" class="ud__picker-panel-header-hit-surface" data-top="130" data-left="30"></div>
      </div>`;
    const hitSurface = document.querySelector<HTMLElement>("#year-hit-surface")!;
    document.elementFromPoint = vi.fn(() => hitSurface);

    expect(inspectFeishuMonthPeriodTargetInPage("#throne-start", "year_toggle"))
      .toMatchObject({
        status: "ready",
        point: {
          tagName: "DIV",
          className: "ud__picker-panel-header-hit-surface"
        }
      });
  });

  it("accepts xTool's non-zero-padded month label and rejects an outside blocker", () => {
    document.body.innerHTML = `
      <div class="throne-biz-date-range-picker-wrapper">
        <div id="throne-start" class="throne-biz-date-range-picker-input" data-top="50" data-left="20"><input value="" /></div>
      </div>
      <div id="throne-popup" class="throne-biz-date-range-picker-panel" data-top="120" data-left="20" data-width="400" data-height="260">
        <div class="ud__picker-month-panel-cell" data-top="170" data-left="30">
          <div id="month-9" class="ud__picker__cell-interactive-area" data-top="170" data-left="30">9月</div>
        </div>
      </div>
      <div id="outside-blocker" data-top="170" data-left="30">blocked</div>`;
    const month = document.querySelector<HTMLElement>("#month-9")!;
    document.elementFromPoint = vi.fn(() => month);
    expect(inspectFeishuMonthPeriodTargetInPage("#throne-start", "month", "09"))
      .toMatchObject({ status: "ready", targetCount: 1 });

    const blocker = document.querySelector<HTMLElement>("#outside-blocker")!;
    document.elementFromPoint = vi.fn(() => blocker);
    expect(inspectFeishuMonthPeriodTargetInPage("#throne-start", "month", "09"))
      .toMatchObject({ status: "target_not_clickable", point: null, targetCount: 1 });
  });

  it("rebinds a stale xTool selector by stable identity and scrolls the offscreen endpoint once", () => {
    document.body.innerHTML = `
      <div id="formily-item-project_list" data-top="10" data-left="10" data-width="500" data-height="1000">
        <div data-form-field-id="start_end_time">
          <div class="throne-biz-date-range-picker-wrapper">
            <div class="throne-biz-date-range-picker-input" data-top="700"><input value="2024-01" /></div>
            <div class="throne-biz-date-range-picker-input" data-top="700"><input value="2024-12" /></div>
          </div>
        </div>
        <div data-form-field-id="start_end_time">
          <div class="throne-biz-date-range-picker-wrapper">
            <div id="live-second-start" class="throne-biz-date-range-picker-input" data-top="1200"><input value="" /></div>
            <div class="throne-biz-date-range-picker-input" data-top="1200"><input value="2026-09" /></div>
          </div>
        </div>
      </div>`;
    const preparation = prepareFeishuMonthPeriodControlInPage(
      "#removed-observation-node",
      "project[1].start_date.custom_date_picker",
      "项目经历 2 · 开始时间"
    );
    expect(preparation).toEqual({
      status: "ready",
      scrollCount: 1,
      reboundByStableIdentity: true
    });
    expect(document.querySelector<HTMLElement>("#live-second-start")!.scrollIntoView)
      .toHaveBeenCalledTimes(1);
    expect(inspectFeishuMonthPeriodTargetInPage(
      "#removed-observation-node",
      "control",
      "",
      "project[1].start_date.custom_date_picker",
      "项目经历 2 · 开始时间"
    )).toMatchObject({ status: "ready", variant: "throne", targetCount: 1 });
  });

  it("uses one control/year/month sequence and requires value plus validation readback", async () => {
    installFixture();
    installScriptHarness();
    const clickPoint = vi.fn(async () => {
      const count = clickPoint.mock.calls.length;
      if (count === 1) document.querySelector<HTMLElement>("#popup")!.style.display = "block";
      if (count === 3) {
        document.querySelector<HTMLElement>("#start")!.innerText = "2018-09";
        document.querySelector("#time-error")?.remove();
        document.querySelector<HTMLElement>("#popup")!.style.display = "none";
      }
    });
    await expect(executeFeishuMonthPeriodDriver({
      tabId: 123,
      selector: "[data-cy=\"education[0].periodInputBegin\"]",
      stableFieldKey: "education[0].start_date.custom_date_picker",
      label: "教育经历 1 · 开始时间",
      dateValue: { year: 2018, month: 9 },
      clickPoint,
      wait: vi.fn(async () => undefined)
    })).resolves.toMatchObject({ success: true, actual: "2018-09", validationCleared: true });
    expect(clickPoint).toHaveBeenCalledTimes(3);
  });

  it("observes and executes the xTool throne year-toggle flow without native value writes", async () => {
    document.body.innerHTML = `
      <div id="formily-item-project_list" data-top="10" data-left="10" data-width="500" data-height="260">
        <div class="apply-form-array-card">
          <div data-form-field-id="start_end_time">
            <label>起止时间</label>
            <div id="range" class="throne-biz-date-range-picker-wrapper" data-top="50" data-left="20" data-width="400" data-height="40">
              <div id="throne-start" class="throne-biz-date-range-picker-input" data-top="50" data-left="20" data-width="180"><input value="" /></div>
              <div class="throne-biz-date-range-picker-rangeInput-seperator"></div>
              <div id="throne-end" class="throne-biz-date-range-picker-input" data-top="50" data-left="230" data-width="180"><input value="2026-09" /></div>
            </div>
          </div>
        </div>
      </div>
      <div id="throne-popup" class="throne-biz-date-range-picker-panel" style="display:none" data-top="120" data-left="20" data-width="400" data-height="260">
        <span id="year-toggle" class="ud__picker-panel-header-btn" data-top="130" data-left="30">2026年</span>
        <div id="year-2025" class="ud__picker-year-panel-cell" data-top="170" data-left="30"><div class="ud__picker__cell-interactive-area" data-top="170" data-left="30">2025</div></div>
        <div id="month-11" class="ud__picker-month-panel-cell" data-top="210" data-left="30"><div class="ud__picker__cell-interactive-area" data-top="210" data-left="30">11月</div></div>
      </div>`;
    installScriptHarness();
    const fields = observeFeishuMonthPeriodFieldsInPage();
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      stableFieldKey: "project[0].start_date.custom_date_picker",
      currentValue: ""
    });
    const start = fields[0]!;
    const clickPoint = vi.fn(async () => {
      const count = clickPoint.mock.calls.length;
      if (count === 1) document.querySelector<HTMLElement>("#throne-popup")!.style.display = "block";
      if (count === 4) {
        document.querySelector<HTMLInputElement>("#throne-start input")!.value = "2025-11";
        document.querySelector<HTMLElement>("#throne-popup")!.style.display = "none";
      }
    });
    await expect(executeFeishuMonthPeriodDriver({
      tabId: 123,
      selector: start.selector,
      stableFieldKey: start.stableFieldKey,
      label: start.label,
      dateValue: { year: 2025, month: 11 },
      clickPoint,
      wait: vi.fn(async () => undefined)
    })).resolves.toMatchObject({
      success: true,
      actual: "2025-11",
      validationCleared: true,
      rangeComplete: true,
      variant: "throne"
    });
    expect(clickPoint).toHaveBeenCalledTimes(4);
  });

  it("waits for xTool's animated year and month panels before each trusted click", async () => {
    document.body.innerHTML = `
      <div id="formily-item-project_list" data-top="10" data-left="10" data-width="500" data-height="260">
        <div data-form-field-id="start_end_time">
          <div class="throne-biz-date-range-picker-wrapper" data-top="50" data-left="20" data-width="400" data-height="40">
            <div id="throne-start" class="throne-biz-date-range-picker-input" data-top="50" data-left="20" data-width="180"><input value="" /></div>
            <div class="throne-biz-date-range-picker-input" data-top="50" data-left="230" data-width="180"><input value="2026-09" /></div>
          </div>
        </div>
      </div>
      <div id="throne-popup" class="throne-biz-date-range-picker-panel" style="display:none" data-top="120" data-left="20" data-width="400" data-height="260">
        <span id="year-toggle" class="ud__picker-panel-header-btn" data-top="130" data-left="30">2026年</span>
        <div class="ud__picker-year-panel-cell" data-top="170" data-left="30"><div id="year-2025" class="ud__picker__cell-interactive-area" style="display:none" data-top="170" data-left="30">2025</div></div>
        <div class="ud__picker-month-panel-cell" data-top="210" data-left="30"><div id="month-9" class="ud__picker__cell-interactive-area" style="display:none" data-top="210" data-left="30">9月</div></div>
      </div>
      <input id="transient-outside-blocker" class="ud__native-input" data-top="130" data-left="30" />`;
    installScriptHarness();
    const start = observeFeishuMonthPeriodFieldsInPage()[0]!;
    const clickPoint = vi.fn(async () => {
      const count = clickPoint.mock.calls.length;
      if (count === 1) document.querySelector<HTMLElement>("#throne-popup")!.style.display = "block";
      if (count === 4) {
        document.querySelector<HTMLInputElement>("#throne-start input")!.value = "2025-09";
        document.querySelector<HTMLElement>("#throne-popup")!.style.display = "none";
      }
    });
    let toggleDelayObserved = false;
    let yearDelayObserved = false;
    let monthDelayObserved = false;
    const wait = vi.fn(async (milliseconds: number) => {
      if (clickPoint.mock.calls.length === 1 && milliseconds === 90 && !toggleDelayObserved) {
        toggleDelayObserved = true;
        document.querySelector<HTMLElement>("#transient-outside-blocker")!.style.display = "none";
      }
      if (clickPoint.mock.calls.length === 2 && milliseconds === 90 && !yearDelayObserved) {
        yearDelayObserved = true;
        document.querySelector<HTMLElement>("#year-2025")!.style.display = "block";
      }
      if (clickPoint.mock.calls.length === 3 && milliseconds === 90 && !monthDelayObserved) {
        monthDelayObserved = true;
        document.querySelector<HTMLElement>("#month-9")!.style.display = "block";
      }
    });

    await expect(executeFeishuMonthPeriodDriver({
      tabId: 123,
      selector: start.selector,
      stableFieldKey: start.stableFieldKey,
      label: start.label,
      dateValue: { year: 2025, month: 9 },
      clickPoint,
      wait
    })).resolves.toMatchObject({ success: true, actual: "2025-09" });
    expect(toggleDelayObserved).toBe(true);
    expect(yearDelayObserved).toBe(true);
    expect(monthDelayObserved).toBe(true);
    expect(clickPoint).toHaveBeenCalledTimes(4);
  });

  it("promotes xTool's submit-triggered 为必填 month range validation", () => {
    document.body.innerHTML = `
      <div id="formily-item-project_list" data-top="10" data-left="10" data-width="500" data-height="260">
        <div data-form-field-id="start_end_time">
          <label>起止时间</label>
          <div class="throne-biz-date-range-picker-wrapper" data-top="50" data-left="20" data-width="400" data-height="40">
            <div class="throne-biz-date-range-picker-input" data-top="50" data-left="20" data-width="180"><input value="" /></div>
            <div class="throne-biz-date-range-picker-input" data-top="50" data-left="230" data-width="180"><input value="" /></div>
          </div>
          <div class="field-error">起止时间为必填</div>
        </div>
      </div>`;

    expect(observeFeishuMonthPeriodFieldsInPage()).toEqual([
      expect.objectContaining({ stableFieldKey: "project[0].start_date.custom_date_picker", required: true }),
      expect.objectContaining({ stableFieldKey: "project[0].end_date.custom_date_picker", required: true })
    ]);
  });

  it("observes xTool's live works_list month range and ignores an unrelated section", () => {
    document.body.innerHTML = `
      <div id="formily-item-works_list" data-top="10" data-left="10" data-width="500" data-height="260">
        <div data-form-field-id="start_end_time">
          <div class="throne-biz-date-range-picker-wrapper" data-top="50" data-left="20" data-width="400" data-height="40">
            <div class="throne-biz-date-range-picker-input" data-top="50" data-left="20" data-width="180"><input value="2024-03" /></div>
            <div class="throne-biz-date-range-picker-input" data-top="50" data-left="230" data-width="180"><input value="2025-08" /></div>
          </div>
        </div>
      </div>
      <div id="formily-item-unrelated_list" data-top="300" data-left="10" data-width="500" data-height="260">
        <div data-form-field-id="start_end_time">
          <div class="throne-biz-date-range-picker-wrapper" data-top="340" data-left="20" data-width="400" data-height="40">
            <div class="throne-biz-date-range-picker-input" data-top="340" data-left="20" data-width="180"><input value="2020-01" /></div>
            <div class="throne-biz-date-range-picker-input" data-top="340" data-left="230" data-width="180"><input value="2021-01" /></div>
          </div>
        </div>
      </div>`;

    expect(observeFeishuMonthPeriodFieldsInPage()).toEqual([
      expect.objectContaining({
        stableFieldKey: "work[0].start_date.custom_date_picker",
        label: "工作经历 1 · 开始时间",
        currentValue: "2024-03"
      }),
      expect.objectContaining({
        stableFieldKey: "work[0].end_date.custom_date_picker",
        label: "工作经历 1 · 结束时间",
        currentValue: "2025-08"
      })
    ]);
  });

  it("accepts one exact throne endpoint while the sibling endpoint is still empty", async () => {
    document.body.innerHTML = `
      <div id="formily-item-internship_list" data-top="10" data-left="10" data-width="500" data-height="260">
        <div data-form-field-id="start_end_time">
          <div>请填写完整时间</div>
          <div class="throne-biz-date-range-picker-wrapper" data-top="50" data-left="20" data-width="400" data-height="40">
            <div id="throne-start" class="throne-biz-date-range-picker-input" data-top="50" data-left="20" data-width="180"><input value="" /></div>
            <div class="throne-biz-date-range-picker-rangeInput-seperator"></div>
            <div class="throne-biz-date-range-picker-input" data-top="50" data-left="230" data-width="180"><input value="" /></div>
          </div>
        </div>
      </div>
      <div id="throne-popup" class="throne-biz-date-range-picker-panel" style="display:none" data-top="120" data-left="20" data-width="400" data-height="260">
        <span class="ud__picker-panel-header-btn" data-top="130" data-left="30">2026年</span>
        <div class="ud__picker-year-panel-cell" data-top="170" data-left="30"><div class="ud__picker__cell-interactive-area" data-top="170" data-left="30">2025</div></div>
        <div class="ud__picker-month-panel-cell" data-top="210" data-left="30"><div class="ud__picker__cell-interactive-area" data-top="210" data-left="30">11月</div></div>
      </div>`;
    installScriptHarness();
    const start = observeFeishuMonthPeriodFieldsInPage()[0]!;
    const clickPoint = vi.fn(async () => {
      const count = clickPoint.mock.calls.length;
      if (count === 1) document.querySelector<HTMLElement>("#throne-popup")!.style.display = "block";
      if (count === 4) {
        document.querySelector<HTMLInputElement>("#throne-start input")!.value = "2025-11";
        document.querySelector<HTMLElement>("#throne-popup")!.style.display = "none";
      }
    });

    await expect(executeFeishuMonthPeriodDriver({
      tabId: 123,
      selector: start.selector,
      stableFieldKey: start.stableFieldKey,
      label: start.label,
      dateValue: { year: 2025, month: 11 },
      clickPoint,
      wait: vi.fn(async () => undefined)
    })).resolves.toMatchObject({
      success: true,
      actual: "2025-11",
      validationCleared: false,
      rangeComplete: false,
      variant: "throne"
    });
  });
});
