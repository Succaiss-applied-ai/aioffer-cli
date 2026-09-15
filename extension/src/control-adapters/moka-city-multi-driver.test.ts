// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import ts from "typescript";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {observeApplicationPage} from "../page-adapter.js";
import {evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
import {registeredControlReadbackMatches} from "./readback-policy.js";
import {executeMokaCityMultiDriver, MOKA_CITY_MULTI} from "./moka-city-multi-driver.js";

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://app.mokahr.com/campus-recruitment/funplus01/147931#/job/example/apply"));
  vi.stubGlobal("CSS", {escape: (s: string) => s});
  Object.defineProperty(HTMLElement.prototype, "innerText", {configurable: true, get() {return this.textContent ?? "";}});
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const y = Number(this.dataset.y ?? 10);
    return {x: 0, y, left: 0, top: y, right: 200, bottom: y + 20, width: 200, height: 20, toJSON() {}};
  });
  Object.defineProperty(document, "elementFromPoint", {configurable: true, value: (_x: number, y: number) =>
    [...document.querySelectorAll<HTMLElement>("[data-y]")].find(el => Number(el.dataset.y) + 10 === y) ?? null});
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

function production(name: string, dependencies: Record<string, unknown>) {
  const source = readFileSync("extension/src/background.ts", "utf8");
  const ast = ts.createSourceFile("background.ts", source, ts.ScriptTarget.ES2023, true);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  const compiled = ts.transpileModule(node.getText(ast), {compilerOptions: {target: ts.ScriptTarget.ES2023}}).outputText;
  return new Function(...Object.keys(dependencies), `${compiled};return ${name}`)(...Object.values(dependencies));
}
function tag(value: string) {
  return `<span class="sd-Tag-container-test sd-Input-tag-test sd-Select-tag-test"><div class="sd-Tag-text-test">${value}</div><div class="sd-Tag-close-test"><span>×</span></div></span>`;
}
function harness(options: {value?: string; selected?: string[]; query?: string; noCommit?: boolean; duplicate?: boolean; stale?: boolean; validation?: boolean} = {}) {
  document.body.innerHTML = `<div class="apply-block-test"><h2>求职意向</h2><div class="apply-fields-test">
    <div class="apply-field-test multi_select_info-test"><div class="title-test" data-y="20"><span><span>意向城市（可多选）</span></span><span class="required-asterisk-test"></span></div>
    <div class="ctrl-test"><div class="sd-Tooltip-container-test"><div class="sd-Dropdown-container-test">
    <label class="sd-Input-container-test sd-Select-container-test multi_select_info" data-y="60"><div><span class="sd-Input-input-test sd-Input-tag-container-test">
    ${(options.selected ?? []).map(tag).join("")}<input id="city" type="text" class="sd-Input-tag-input-test" placeholder="请选择" data-y="80"></span></div><span class="sd-Select-addon-test"></span></label><span id="popup"></span>
    </div></div></div><div class="error-test">${options.validation ? "必填项未填写" : ""}</div></div></div></div><button>预览并提交</button>`;
  const popup = document.querySelector<HTMLElement>("#popup")!;
  const getInput = () => document.querySelector<HTMLInputElement>("#city")!;
  getInput().value = options.query ?? "";
  const page = observeApplicationPage(), field = page.fields[0]!;
  const route = resolveControlAdapter(evidenceForField(page, field));
  const instruction = {fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, selector: field.selector,
    expectedLabel: field.label, type: field.type, applicationUrl: page.url, value: options.value ?? "成都市", controlAdapter: route.diagnostic};
  vi.stubGlobal("chrome", {scripting: {executeScript: vi.fn(async ({func, args = []}) => [{result: await func(...args)}])}});
  let opened = false, poll = 0;
  getInput().addEventListener("click", () => {opened = true;});
  document.querySelector(".title-test")!.addEventListener("click", () => {popup.innerHTML = ""; opened = false; document.querySelector(".error-test")!.textContent = "";});
  const wait = vi.fn(async () => {
    if (!opened || popup.children.length || ++poll < 2) return;
    const values = ["北京", "上海", "杭州", "成都", ...(options.duplicate ? ["成都"] : []), "广州"];
    popup.innerHTML = `<div class="sd-Dropdown-dropdown-test"><div class="sd-Select-menu-test">${values.map((value, index) =>
      `<div class="sd-Menu-container-test"><div class="sd-Menu-content-item-test"><div class="option-label-test" data-y="${120 + index * 30}">${value}</div></div></div>`).join("")}</div></div>`;
    if (options.stale) vi.stubGlobal("location", new URL("https://app.mokahr.com/campus-recruitment/other/1#/job/else/apply"));
    for (const item of popup.querySelectorAll<HTMLElement>(".option-label-test")) item.addEventListener("click", () => {
      if (options.noCommit) return;
      getInput().insertAdjacentHTML("beforebegin", tag(item.textContent!));
      getInput().placeholder = "";
      item.parentElement!.parentElement!.classList.add("sd-Menu-active-test");
    });
  });
  const clickPoint = vi.fn(async (point: {x: number; y: number}) => {(document.elementFromPoint(point.x, point.y) as HTMLElement)?.click();});
  const run = (discoverOptions = false) => executeMokaCityMultiDriver({tabId: 7, instruction, discoverOptions,
    prepareSurface: async () => {}, clickPoint, wait});
  return {page, field, route, instruction, getInput, popup, run, wait, clickPoint};
}

describe("Moka tag-based multi-city controls", () => {
  it("accepts the complete JSON option set returned by supplementation",async()=>{
    const test=harness({value:JSON.stringify(["上海","成都"])});
    expect(await test.run()).toMatchObject({success:true});
    const field=observeApplicationPage().fields[0]!;
    expect(registeredControlReadbackMatches({field,expected:test.instruction.value,controlAdapter:test.route.diagnostic}).matches).toBe(true);
  });
  it("reads empty tags as empty, and reads committed Tag-text once without query text or close icons", () => {
    const test = harness(); expect(test.field.currentValue).toBe("");
    test.getInput().insertAdjacentHTML("beforebegin", tag("成都") + tag("上海"));
    test.getInput().value = "正在搜索"; test.getInput().placeholder = "";
    const after = observeApplicationPage().fields[0]!;
    expect(after.currentValue).toBe("成都、上海"); expect(after.stableFieldKey).toBe(test.field.stableFieldKey);
  });
  it("routes the evidenced tag structure separately from single-city and ordinary flat selects", () => {
    const test = harness(); expect(test.route.code).toBe(MOKA_CITY_MULTI);
    const evidence = evidenceForField(test.page, test.field);
    expect(resolveControlAdapter({...evidence, label: "喜欢的美术风格", semanticKey: "custom.style"}).code).toBe("unresolved.custom.v1");
    expect(resolveControlAdapter({...evidence, classNames: ["sd-Input-input-test", "sd-Select-container-test", "sd-Dropdown-container-test"]}).code).toBe("moka.work-city.trusted-focus.v1");
  });
  it("selects one exact city tag and closes the menu with one field-title commit", async () => {
    const test = harness({validation: true}); const result = await test.run();
    expect(result).toMatchObject({success: true, actual: "成都", popupClosed: true, validationCleared: true});
    expect(result.diagnostics.ledger).toMatchObject({openClickCount: 1, leafClickCount: 1, commitClickCount: 1});
    expect(test.clickPoint.mock.calls[0]![0].y).toBe(90);
    expect(registeredControlReadbackMatches({field: observeApplicationPage().fields[0]!, expected: "成都市", controlAdapter: test.route.diagnostic}).matches).toBe(true);
  });
  it("selects every explicitly requested city once and preserves an existing authorized tag", async () => {
    const test = harness({value: "上海市、成都市", selected: ["成都"]}); const result = await test.run();
    expect(result.success).toBe(true); expect(result.actual).toBe("成都、上海");
    expect(result.diagnostics.ledger.leafClickCount).toBe(1);
    const field = observeApplicationPage().fields[0]!;
    expect(registeredControlReadbackMatches({field, expected: "上海市、成都市", controlAdapter: test.route.diagnostic}).matches).toBe(true);
    expect(registeredControlReadbackMatches({field, expected: "成都市", controlAdapter: test.route.diagnostic}).matches).toBe(false);
  });
  it("selects two explicitly requested cities from an empty control without reopening or removing tags", async () => {
    const result = await harness({value: "成都市、上海市"}).run();
    expect(result).toMatchObject({success: true, actual: "成都、上海", popupClosed: true});
    expect(result.diagnostics.ledger).toMatchObject({openClickCount: 1, leafClickCount: 2, commitClickCount: 1});
  });
  it("rejects empty, duplicated or ambiguously overlapping requested cities before any click", async () => {
    for (const value of ["", "、", "成都、成都市"]) {
      const test = harness({value}); expect((await test.run()).success).toBe(false);
      expect(test.clickPoint).not.toHaveBeenCalled();
    }
  });
  it.each([{selected: []}, {selected: ["上海"]}])("discovers all options without changing selected tags: %j", async ({selected}) => {
    const test = harness({selected, value: "", validation: true}); const result = await test.run(true);
    expect(result.success).toBe(true); expect(result.availableOptions).toEqual(["北京", "上海", "杭州", "成都", "广州"]);
    expect(result.actual).toBe(selected.join("、")); expect(result.diagnostics.ledger.leafClickCount).toBe(0);
    expect(result.popupClosed).toBe(true);
  });
  it.each([{selected: ["广州"]}, {query: "成都"}])("preserves an unrelated existing selection or query: %j", async options => {
    const test = harness(options); expect((await test.run()).success).toBe(false); expect(test.clickPoint).not.toHaveBeenCalled();
  });
  it("does not toggle duplicate results or create a city outside the live options", async () => {
    for (const options of [{duplicate: true}, {value: "深圳市"}]) {
      const test = harness(options); const result = await test.run();
      expect(result.success).toBe(false); expect(result.diagnostics.ledger.leafClickCount).toBe(0);
    }
  });
  it.each([{noCommit: true}, {stale: true}])("fails on missing tag commit or changed original page: %j", async options => {
    const result = await harness(options).run(); expect(result.success).toBe(false); expect(result.actual).toBe("");
    expect(result.diagnostics.ledger.openClickCount).toBe(1); expect(result.diagnostics.ledger.leafClickCount).toBeLessThanOrEqual(1);
  });
  it("uses the actual background capability table and trusted wrapper for discovery and filling", async () => {
    for (const discover of [true, false]) {
      const test = harness(); const attach = vi.fn(async () => {}), detach = vi.fn(async () => {}), release = vi.fn(async () => {});
      const send = vi.fn(); Object.assign(chrome, {debugger: {attach, detach, sendCommand: send}});
      const oldDriver = vi.fn();
      const wrapper = production("executeMokaSharedSelectInstruction", {executeMokaCityMultiDriver,
        executeMokaSharedSelectDriver: oldDriver, executeMokaSearchSelectDriver: oldDriver,
        prepareFocusEmulatedTrustedPointerSurface: async () => {}, releaseTrustedPointerSurface: release,
        dispatchTrustedPointerClick: async (_send, point) => test.clickPoint(point), setTimeout: resolve => {void test.wait().then(resolve);}});
      const executors = production("mokaFlatSelectControlExecutors", {executeMokaSharedSelectInstruction: wrapper,
        executeMokaRecruitingSourceInstructionWithTrustedFocusDriver: oldDriver})(7, test.page, discover);
      expect((await executors[MOKA_CITY_MULTI](test.field, test.instruction)).success).toBe(true);
      expect(attach).toHaveBeenCalledExactlyOnceWith({tabId: 7}, "1.3"); expect(detach).toHaveBeenCalledExactlyOnceWith({tabId: 7});
      expect(release).toHaveBeenCalledOnce(); expect(oldDriver).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    }
  });
});
