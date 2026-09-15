// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://app.mokahr.com/campus-recruitment/canrui/42687#/job/test-job/apply"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";
import { observedFieldHasValue } from "./form-validation.js";
import { candidateBlockingRequiredFieldFailures } from "./vision-form-runtime.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { readMokaRecruitingSourceInPage } from "./control-adapters/moka-recruiting-source-driver.js";

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

function installSourceField(display = "校园宣讲会", error = "") {
  document.body.innerHTML = `
    <main><form>
      <div class="apply-field-source select_info-source">
        <div class="title-source"><span><span>请选择信息来源渠道</span></span><span class="required-asterisk">*</span></div>
        <div class="ctrl-source">
          <div class="sd-Dropdown-container-source">
            <label class="sd-Input-container-source sd-Select-container-source">
              <span class="sd-Input-display-value-source"><span>${display}</span></span>
              <input id="source" type="text" class="sd-Input-input-source" value="" placeholder="${display ? "" : "请选择"}">
            </label>
          </div>
          ${error}
        </div>
      </div>
      <button type="button">预览并提交</button>
    </form></main>`;
}

const sourceField = () => observeApplicationPage().fields.find((field) => field.selector === "#source")!;

describe("field-owned validation evidence", () => {
  it("reads the real tap4fun error nested beside an input inside its label", () => {
    document.body.innerHTML = `<form><div class="apply-field-graduation string_info-graduation">
      <div class="title-graduation"><span>毕业时间（年月）</span><span class="required-asterisk">*</span></div>
      <div class="ctrl-graduation"><div class="sd-Tooltip-container">
        <label class="sd-Input-container string_info error-graduation sd-Input-error">
          <input id="graduation" type="text" placeholder="毕业时间（年月）" value="2027-06">
          <div id="graduation-error" class="sd-Input-message sd-Input-error"><span class="sd-Icon-iconerror"></span>这是必填项</div>
        </label>
      </div></div>
    </div><div class="form-item"><label for="school">毕业院校</label><input id="school" value="测试大学"></div></form>`;
    const page = observeApplicationPage();
    const field = page.fields.find(item => item.selector === "#graduation")!;
    expect(field.label).toBe("毕业时间（年月）");
    expect(field.validationMessage).toBe("这是必填项");
    // A displayed value and the website's rejection are independent evidence.
    expect(observedFieldHasValue(field)).toBe(true);
    expect(page.validationMessages).toEqual(["这是必填项"]);
    expect(page.fields.find(item => item.selector === "#school")?.validationMessage).toBeNull();
    document.querySelector("#graduation-error")!.remove();
    expect(observeApplicationPage().fields.find(item => item.selector === "#graduation")?.validationMessage).toBeNull();
  });

  it("does not treat an ordinary required hint inside a label as an error", () => {
    document.body.innerHTML = `<form><div class="form-item"><label>
      毕业时间（年月）<input id="graduation" value="2027-06"><span class="hint">这是必填项</span>
    </label></div></form>`;
    const page = observeApplicationPage();
    expect(page.fields.find(item => item.selector === "#graduation")?.validationMessage).toBeNull();
    expect(page.validationMessages).toEqual([]);
  });

  it("reuses style reads only within a snapshot and observes new hidden/visible errors on the next read", () => {
    installSourceField("校园宣讲会", '<div id="changing-error" class="field-error">必填项未填写</div>');
    const styles = vi.spyOn(globalThis, "getComputedStyle");
    expect(sourceField().validationMessage).toBe("必填项未填写");
    const nodes = styles.mock.calls.map(([node]) => node);
    expect(nodes.length).toBe(new Set(nodes).size);
    document.querySelector<HTMLElement>("#changing-error")!.style.display = "none";
    expect(sourceField().validationMessage).toBeNull();
    document.querySelector<HTMLElement>("#changing-error")!.style.display = "block";
    expect(sourceField().validationMessage).toBe("必填项未填写");
  });

  it("does not turn Canrui's selected source title into a validation error", () => {
    installSourceField();
    const observation = observeApplicationPage();
    const field = sourceField();
    expect(field).toMatchObject({
      label: "请选择信息来源渠道", required: true,
      currentValue: "校园宣讲会", validationMessage: null
    });
    expect(observedFieldHasValue(field)).toBe(true);
    expect(candidateBlockingRequiredFieldFailures(observation.fields, {})).toEqual([]);
    expect(observation.validationMessages).toEqual([]);
    expect(observation.actions).toContainEqual(expect.objectContaining({
      kind: "final_submit", text: "预览并提交", disabled: false
    }));
    expect(readMokaRecruitingSourceInPage("#source")).toEqual({
      actual: "校园宣讲会", popupClosed: true, validationCleared: true
    });
    expect(resolveControlAdapter({
      applicationUrl: observation.url, label: field.label,
      semanticKey: field.stableFieldKey, type: "text", controlKind: field.controlKind,
      tagName: "INPUT", readOnly: false,
      classNames: ["sd-Input-input-source", "sd-Select-container-source", "sd-Dropdown-container-source"]
    })).toMatchObject({
      code: "moka.recruiting-source.trusted-focus.v1",
      driver: "site_deterministic", executionSurface: "background_tab"
    });
  });

  it("still reports a genuinely empty required source as missing information", () => {
    installSourceField("");
    const field = sourceField();
    expect(field.validationMessage).toBeNull();
    expect(observedFieldHasValue(field)).toBe(false);
    expect(candidateBlockingRequiredFieldFailures([field], {})).toContainEqual(field);
  });

  it.each(["field-error", "error-message", "ant-form-item-explain-error"])(
    "retains a visible %s even when the source has a display value", (className) => {
      installSourceField("校园宣讲会", `<div class="${className}">必填项未填写</div>`);
      expect(sourceField().validationMessage).toBe("必填项未填写");
      expect(readMokaRecruitingSourceInPage("#source").validationCleared).toBe(false);
    }
  );

  it("preserves the full actual error message instead of just its '请选择' prefix", () => {
    installSourceField("校园宣讲会", '<div role="alert">请选择有效的信息来源渠道</div>');
    expect(sourceField().validationMessage).toBe("请选择有效的信息来源渠道");
  });

  it.each(["hidden", 'aria-hidden="true"', 'style="display:none"', 'style="visibility:hidden"', 'style="opacity:0"'])(
    "ignores stale errors in a hidden ancestor (%s)", (attributes) => {
      installSourceField("校园宣讲会", `<div ${attributes}><div class="field-error">必填项未填写</div></div>`);
      expect(sourceField().validationMessage).toBeNull();
      expect(observeApplicationPage().validationMessages).toEqual([]);
    }
  );

  it("does not read ordinary labels, placeholders, hints, or selected text as errors", () => {
    document.body.innerHTML = `<form><div class="form-item">
      <label for="source">请填写姓名</label>
      <input id="source" required value="测试姓名" placeholder="请填写" aria-describedby="hint">
      <div id="hint">请填写与证件一致的姓名；无效信息会被退回</div>
    </div></form>`;
    expect(sourceField().validationMessage).toBeNull();
  });

  it("retains the standalone required message used by unclassed Moka markup", () => {
    installSourceField("校园宣讲会", '<div><span>必填项未填写</span></div>');
    expect(sourceField().validationMessage).toBe("必填项未填写");
    expect(observeApplicationPage().validationMessages).toEqual(["必填项未填写"]);
  });

  it("binds Moka's unclassed bilingual required message to its custom select", () => {
    installSourceField("", '<div class="sd-Input-message"><span class="sd-Icon-iconerror"></span><span>必填项未填写 / Required items are not filled in</span></div>');
    const field = sourceField();
    expect(field).toMatchObject({
      label: "请选择信息来源渠道",
      currentValue: "",
      validationMessage: "必填项未填写 / Required items are not filled in"
    });
    expect(observeApplicationPage().validationMessages)
      .toEqual(["必填项未填写 / Required items are not filled in"]);
  });

  it("preserves aria-invalid even without a textual error node", () => {
    installSourceField();
    document.querySelector("#source")!.setAttribute("aria-invalid", "true");
    expect(sourceField().validationMessage).toBe("该字段仍被招聘网站标记为无效");
  });

  it("reads an explicitly linked error outside the field only while invalid", () => {
    installSourceField();
    const input = document.querySelector("#source")!;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-errormessage", "source-error");
    document.body.insertAdjacentHTML("beforeend", '<div id="source-error">请选择有效的信息来源渠道</div>');
    expect(sourceField().validationMessage).toBe("请选择有效的信息来源渠道");
    input.setAttribute("aria-invalid", "false");
    expect(sourceField().validationMessage).toBeNull();
  });

  it("does not misattribute a neighboring field's error", () => {
    installSourceField();
    document.querySelector("form")!.insertAdjacentHTML("beforeend", `
      <div class="form-item"><label for="neighbor">姓名</label><input id="neighbor" required>
        <div class="field-error">请填写姓名</div>
      </div>`);
    expect(sourceField().validationMessage).toBeNull();
    expect(observeApplicationPage().fields.find((field) => field.selector === "#neighbor")?.validationMessage)
      .toBe("请填写姓名");
  });

  it("binds a Feishu Formily 'field name is required' error to the outer field root", () => {
    document.body.innerHTML = `<form>
      <div class="ud-formily-item" id="formily-item-name">
        <div class="ud-formily-item-label"><span class="ud-formily-item-label-content">姓名</span></div>
        <div><input id="name" data-form-field-id="name" data-form-field-name="name">
          <div class="ud-formily-item-error-help">姓名为必填</div></div>
      </div>
      <div class="ud-formily-item" id="formily-item-email">
        <div class="ud-formily-item-label"><span class="ud-formily-item-label-content">邮箱</span></div>
        <div><input id="email" data-form-field-id="email" data-form-field-name="email"></div>
      </div>
    </form>`;
    const page = observeApplicationPage();
    expect(page.fields.find((item) => item.selector === "#name")?.validationMessage).toBe("姓名为必填");
    expect(page.fields.find((item) => item.selector === "#email")?.validationMessage).toBeNull();
  });

  it("never assigns another field's error to a bare control under the page body", () => {
    installSourceField("校园宣讲会", '<div class="field-error">必填项未填写</div>');
    document.body.insertAdjacentHTML("beforeend", '<label for="mode">显示方式</label><select id="mode"><option>标准</option></select>');
    expect(observeApplicationPage().fields.find((field) => field.selector === "#mode")?.validationMessage).toBeNull();
  });

  it("keeps a plain related-person name separate from candidate identity without a site-specific wrapper", () => {
    document.body.innerHTML = '<form><div class="form-item"><label for="relation">关系人姓名</label><input id="relation" required></div></form>';
    const field = observeApplicationPage().fields.find((field) => field.selector === "#relation")!;
    expect(field.label).toBe("关系人姓名");
    expect(field.sectionKey).toBe("third_party");
    expect(field.stableFieldKey).toContain("third_party.name");
  });

  it("uses an invalid wrapper as state evidence, not its title as the error text", () => {
    installSourceField();
    document.querySelector(".sd-Select-container-source")!.setAttribute("aria-invalid", "true");
    expect(sourceField().validationMessage).toBe("该字段仍被招聘网站标记为无效");
  });

  it("does not cause any input, change, blur, or submit while observing", () => {
    installSourceField();
    const event = vi.fn();
    for (const name of ["input", "change", "blur", "click", "submit"]) {
      document.body.addEventListener(name, event, { once: true, capture: true });
    }
    const before = document.body.innerHTML;
    observeApplicationPage();
    expect(event).not.toHaveBeenCalled();
    // The observer may annotate field identity; candidate values stay unchanged.
    expect(document.querySelector<HTMLInputElement>("#source")!.value).toBe("");
    expect(sourceField().currentValue).toBe("校园宣讲会");
    expect(before).toContain("校园宣讲会");
  });
});
