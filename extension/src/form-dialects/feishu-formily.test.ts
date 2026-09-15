// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xtool.jobs.feishu.cn/index/resume/7648900330809985318/apply"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "../page-adapter.js";
import {
  applyFeishuFormilyFieldPatches,
  isFeishuFormilyApplicationUrl,
  observeFeishuFormilyFieldPatchesInPage
} from "./feishu-formily.js";

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() { return this.textContent ?? ""; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 20, y: 20, top: 20, left: 20, right: 300, bottom: 60,
    width: 280, height: 40, toJSON: () => ({})
  } as DOMRect);
});

function field(name: string, label: string, control: string, error = "") {
  return `<div class="ud-formily-item" id="formily-item-${name}" data-form-field-id="${name}">
    <div class="ud-formily-item-label"><span class="ud-formily-item-label-content">${label}</span><span class="ud-formily-item-asterisk">*</span></div>
    <div class="ud-formily-item-control">${control}${error ? `<div class="ud-formily-item-error-help">${error}</div>` : ""}</div>
  </div>`;
}

function installForm(errors: Record<string, string> = {}) {
  document.body.innerHTML = `<main><form>
    ${field("name", "姓名", '<input type="text" data-form-field-id="name" data-form-field-name="name" data-form-field-i18n-name="姓名">', errors.name)}
    ${field("email", "邮箱", '<input type="email" data-form-field-id="email" data-form-field-name="email" data-form-field-i18n-name="邮箱">', errors.email)}
    <section id="formily-item-education_list">
      <article class="apply-form-array-card__item">
        ${field("school_name", "学校名称", '<input type="text" data-form-field-id="school_name" data-form-field-name="school_name" data-form-field-i18n-name="学校名称">', errors.school)}
        ${field("degree", "学历", '<div class="ud__select"><div class="ud__select__selector"><input type="search" role="combobox" readonly class="ud__select__selector__search__input ud__native-input" data-form-field-id="degree" data-form-field-name="degree" data-form-field-i18n-name="学历"></div></div>', errors.degree)}
        ${field("major", "专业", '<input type="text" data-form-field-id="major" data-form-field-name="major" data-form-field-i18n-name="专业">', errors.major)}
        ${field("start_end_time", "起止时间", '<input type="text" data-form-field-id="start_end_time" data-form-field-name="start_end_time" data-form-field-i18n-name="起止时间"><input type="text" data-form-field-id="start_end_time" data-form-field-name="start_end_time" data-form-field-i18n-name="起止时间">', errors.period)}
      </article>
    </section>
    ${field("relation_name", "员工姓名", '<input type="text" data-form-field-id="relation_name" data-form-field-name="relation_name" data-form-field-i18n-name="员工姓名">')}
    <button type="button">提交申请</button>
  </form></main>`;
}

function observedWithDialect() {
  const generic = observeApplicationPage();
  return {
    generic,
    fields: applyFeishuFormilyFieldPatches(generic.fields, observeFeishuFormilyFieldPatchesInPage())
  };
}

describe("Feishu Formily field dialect", () => {
  it("recognizes the Feishu application family without leaking into Moka", () => {
    expect(isFeishuFormilyApplicationUrl(location.href)).toBe(true);
    expect(isFeishuFormilyApplicationUrl("https://another.jobs.feishu.cn/campus/resume/123/apply?x=1")).toBe(true);
    expect(isFeishuFormilyApplicationUrl("https://app.mokahr.com/campus-recruitment/x/1#/job/a/apply")).toBe(false);
    expect(isFeishuFormilyApplicationUrl("https://xtool.jobs.feishu.cn/index/position/1/detail")).toBe(false);
  });

  it("translates Formily labels, repeat identity and control-owned errors into the shared schema", () => {
    installForm({ name: "姓名为必填", degree: "学历为必填", period: "起止时间为必填" });
    const { fields } = observedWithDialect();
    expect(fields.find(item => item.domHints?.dataFieldName === "name")).toMatchObject({
      label: "姓名", sectionKey: "basic", stableFieldKey: "basic.full_name.native",
      required: true, validationMessage: "姓名为必填"
    });
    expect(fields.find(item => item.domHints?.dataFieldName === "school_name")).toMatchObject({
      label: "教育经历 1 · 学校名称", sectionKey: "education", groupIndex: 0,
      stableFieldKey: "education[0].school.native"
    });
    expect(fields.find(item => item.domHints?.dataFieldName === "degree")).toMatchObject({
      label: "教育经历 1 · 学历", controlKind: "combobox",
      stableFieldKey: "education[0].degree.combobox", validationMessage: "学历为必填"
    });
    const period = fields.filter(item => item.domHints?.dataFieldName === "start_end_time");
    expect(period.map(item => item.stableFieldKey)).toEqual([
      "education[0].start_date.native", "education[0].end_date.native"
    ]);
    expect(period.every(item => item.validationMessage === "起止时间为必填")).toBe(true);
  });

  it("keeps neighboring and unrelated validation text isolated", () => {
    installForm({ degree: "学历为必填" });
    document.body.insertAdjacentHTML("beforeend", '<div class="ud-formily-item-error-help">姓名为必填</div>');
    const { fields } = observedWithDialect();
    expect(fields.find(item => item.domHints?.dataFieldName === "degree")?.validationMessage).toBe("学历为必填");
    expect(fields.find(item => item.domHints?.dataFieldName === "name")?.validationMessage).toBeNull();
    expect(fields.find(item => item.domHints?.dataFieldName === "email")?.validationMessage).toBeNull();
  });

  it("reads the committed value from Feishu's real selectItem display node", () => {
    installForm();
    document.querySelector("#formily-item-degree .ud__select__selector")!.insertAdjacentHTML(
      "afterbegin",
      '<div class="ud__select__selector__selectItem ud__textOverflow">本科</div>'
    );
    const { fields } = observedWithDialect();
    expect(fields.find(item => item.domHints?.dataFieldName === "degree")?.currentValue).toBe("本科");
  });

  it("is a read-only serializable observer", () => {
    installForm();
    const before = document.body.innerHTML;
    const serialized = new Function(`return (${observeFeishuFormilyFieldPatchesInPage.toString()})();`);
    expect(serialized()).toEqual(observeFeishuFormilyFieldPatchesInPage());
    expect(document.body.innerHTML).toBe(before);
  });
});
