// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";
import { bindObservedInstruction } from "./control-adapters/field-routing.js";

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://app.mokahr.com/campus-recruitment/dafeng/142387#/job/fixture/apply"));
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true, get() { return this.textContent ?? ""; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 200, height: 30, right: 200, bottom: 30
  } as DOMRect);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const degreeField = (id: string) => `<div class="apply-field-fixture"><div class="title-fixture">学历 *</div><div class="ctrl-fixture"><label class="sd-Input-container sd-Select-container"><input id="${id}" aria-haspopup="listbox" placeholder="请选择"></label></div></div>`;
const degreeRow = (id: string) => `<div class="apply-fields-fixture multi-fixture">${degreeField(id)}</div>`;
const form = (rows: string) => `<form><div class="apply-block-fixture" data-nav-id="block-educationInfo"><h2>教育背景</h2>${rows}</div><button>预览并提交</button></form>`;

describe("Moka owned repeat-row identity", () => {
  it("binds two education rows by group identity rather than a collision ordinal", () => {
    document.body.innerHTML = form(degreeRow("first") + degreeRow("second"));
    const page = observeApplicationPage();
    const fields = page.fields.filter(field => field.label.endsWith("学历"));
    expect(fields.map(field => [field.groupIndex, field.stableFieldKey])).toEqual([
      [0, "education[0].degree.combobox"], [1, "education[1].degree.combobox"]
    ]);
    for (const field of fields) {
      expect(bindObservedInstruction(page, {
        fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
        expectedLabel: field.label, value: "本科"
      })?.selector).toBe(field.selector);
    }
  });

  it("keeps the original row identity when a second row appears", () => {
    document.body.innerHTML = form(degreeRow("first"));
    const before = observeApplicationPage().fields[0]!;
    expect(before.groupIndex).toBe(0);
    document.querySelector(".apply-block-fixture")!.insertAdjacentHTML("beforeend", degreeRow("second"));
    const after = observeApplicationPage();
    expect(after.fields[0]!.stableFieldKey).toBe(before.stableFieldKey);
    expect(bindObservedInstruction(after, {
      fieldId: before.fieldId, stableFieldKey: before.stableFieldKey,
      expectedLabel: before.label, value: "本科"
    })?.selector).toBe("#first");
  });

  it("still rejects ambiguous fields within the same owned row", () => {
    document.body.innerHTML = form(`<div class="apply-fields-fixture multi-fixture">${degreeField("first")}${degreeField("duplicate")}</div>`);
    const page = observeApplicationPage();
    const field = page.fields[0]!;
    expect(bindObservedInstruction(page, {
      fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
      expectedLabel: field.label, value: "本科"
    })).toBeNull();
  });

  it.each([
    '<div class="apply-block-fixture">',
    '<div data-nav-id="block-educationInfo">'
  ])("does not assign Moka row ownership without the full block signature: %s", block => {
    document.body.innerHTML = `<form>${block}<h2>教育背景</h2>${degreeRow("first")}</div><button>预览并提交</button></form>`;
    expect(observeApplicationPage().fields[0]!.groupIndex).toBeNull();
  });

  it("preserves generic explicit repeat indices", () => {
    vi.stubGlobal("location", new URL("https://example.test/apply"));
    document.body.innerHTML = '<form><h2>教育背景</h2><fieldset data-index="2"><label>学历<input id="generic"></label></fieldset><button>提交</button></form>';
    expect(observeApplicationPage().fields[0]).toMatchObject({
      groupIndex: 2, stableFieldKey: "education[2].degree.native"
    });
  });
});
