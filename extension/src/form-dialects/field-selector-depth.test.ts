// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply"}
import { beforeEach, expect, it, vi } from "vitest";
import { observeApplicationPage } from "../page-adapter.js";
import { observeApplicationPageWithFieldDialects } from "./application-field-dialects.js";
import { observeFeishuFormilyFieldPatchesInPage } from "./feishu-formily.js";
import { observeFeishuAtsxFieldPatchesInPage } from "./feishu-atsx.js";
import { bindObservedInstruction } from "../control-adapters/field-routing.js";

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 20, y: 100, left: 20, top: 100, right: 620, bottom: 140, width: 600, height: 40, toJSON() {}
  });
});

// Real xTool relation controls have indistinguishable 16-element suffixes.
// Keep that relevant structure while omitting tenant text and candidate data.
const deep = (html: string) => "<div>".repeat(18) + html + "</div>".repeat(18);
const formily = (id: string, label: string, control: string) => `<div class="ud-formily-item" id="formily-item-${id}" data-form-field-id="${id}"><div class="ud-formily-item-label"><span class="ud-formily-item-label-content">${label}</span><span class="ud-formily-item-asterisk">*</span></div>${deep(control)}</div>`;
const install = (html: string) => { document.body.innerHTML = `<main><form>${html}<button type="button">提交简历</button></form></main>`; };

it("keeps deep generic targets unique without changing successful short selectors or field identities", () => {
  install(`<label>本人姓名${deep('<input name="person">')}</label><label>联系人姓名${deep('<input name="person">')}</label><input id="email" type="email" aria-label="邮箱"><input data-testid="phone" type="tel" aria-label="手机号码">`);
  const page = observeApplicationPage();
  const inputs = [...document.querySelectorAll("input")];
  expect(page.fields).toHaveLength(4);
  page.fields.forEach((field, index) => {
    expect(document.querySelectorAll(field.selector)).toHaveLength(1);
    expect(document.querySelector(field.selector)).toBe(inputs[index]);
  });
  expect(page.fields.slice(2).map(f => f.selector)).toEqual(["#email", '[data-testid="phone"]']);
  const keys = page.fields.map(f => f.stableFieldKey);
  document.querySelector("form")!.insertAdjacentHTML("afterbegin", "<div>无控件的页面说明</div>");
  const rebound = observeApplicationPage();
  expect(rebound.fields.map(f => f.stableFieldKey)).toEqual(keys);
  rebound.fields.forEach((field, index) => expect(document.querySelector(field.selector)).toBe(inputs[index]));
});

it("joins deep Formily patches to the exact repeated card and rebinds after DOM reconstruction", () => {
  const card = () => `<div class="apply-form-array-card__1d6856">${formily("major", "专业", '<input id="major" data-form-field-name="major">')}</div>`;
  install(`<section id="formily-item-education_list">${card()}${card()}</section>`);
  const page = observeApplicationPageWithFieldDialects();
  expect(page.fields.map(f => f.stableFieldKey)).toEqual(["education[0].major.native", "education[1].major.native"]);
  const patches = observeFeishuFormilyFieldPatchesInPage();
  expect(patches.map(p => p.selector)).toEqual(page.fields.map(f => f.selector));
  for (const field of page.fields) expect(document.querySelectorAll(field.selector)).toHaveLength(1);
  const original = page.fields[1]!;
  const section = document.querySelector("section")!;
  section.innerHTML = section.innerHTML;
  const current = observeApplicationPageWithFieldDialects();
  const bound = bindObservedInstruction(current, { fieldId: original.fieldId, stableFieldKey: original.stableFieldKey,
    expectedLabel: original.label, selector: original.selector, type: original.type, value: "测试专业" });
  expect(bound?.stableFieldKey).toBe("education[1].major.native");
  expect(document.querySelector(bound!.selector)).toBe(document.querySelectorAll("input")[1]);
});

it("keeps deep ATSX labels and native versus select controls attached to their physical owner", () => {
  const root = (id: string, control: string) => `<div class="atsx-form-item" data-cy="${id}"><div class="atsx-form-item-label"><label class="atsx-form-item-required">学历</label></div>${deep(control)}</div>`;
  install(root("education[0].degree", '<input>') + root("education[1].degree", '<input>') +
    root("education[2].degree", '<select><option>本科</option></select>'));
  const page = observeApplicationPageWithFieldDialects();
  expect(page.fields.map(f => f.stableFieldKey)).toEqual(["education[0].degree.native", "education[1].degree.native", "education[2].degree.select"]);
  expect(observeFeishuAtsxFieldPatchesInPage().map(p => p.selector)).toEqual(page.fields.map(f => f.selector));
  for (const field of page.fields) expect(document.querySelectorAll(field.selector)).toHaveLength(1);
});

it("restores logical date order before later deep controls without borrowing their field identity", () => {
  const period = formily("7549005976244111626", "可提前实习周期", '<div class="throne-biz-date-range-picker-wrapper"><div class="throne-biz-date-range-picker-input"><input value="2026-10"></div><div class="throne-biz-date-range-picker-input"><input value="2026-10"></div></div>');
  install(period + formily("name", "姓名", '<input>') + formily("7077486356423526664", "亲属姓名", '<input>'));
  const fields = observeApplicationPageWithFieldDialects().fields;
  expect(fields.map(f => f.stableFieldKey)).toEqual([
    "other.7549005976244111626.start_date.custom_date_picker", "other.7549005976244111626.end_date.custom_date_picker",
    "basic.full_name.native", "relation.name.native"
  ]);
  for (const field of fields) expect(document.querySelectorAll(field.selector)).toHaveLength(1);
});
