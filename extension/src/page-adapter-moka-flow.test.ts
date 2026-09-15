// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverApplicationFieldOptions,
  executeAuthorizedConsentAction,
  ensureMokaIdentityFields,
  ensureMokaAuthenticityDeclaration,
  ensureXiaopengPrivacyConsent,
  executeFinalSubmitAction,
  fillApplicationPage,
  observeApplicationPage,
  prepareDynamicApplicationSections,
  resolveApplicationUserAction,
  type FillInstruction,
  type PageFieldObservation
} from "./page-adapter.js";
import { candidateInformationRequestsForMissingFields, deterministicKnownFactActions, enrichVisionCandidateFacts, findDynamicReadbackField, visionFormReadyForFinalReview } from "./vision-form-runtime.js";
import { withFieldInformationRequirements } from "./field-information.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";

const html = String.raw;

function installDomTestPrimitives() {
  if (!("innerText" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() {
        return this.textContent ?? "";
      },
      set(value: string) {
        this.textContent = value;
      }
    });
  }

  if (!globalThis.CSS) {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: {
        escape(value: string) {
          return String(value).replace(/["\\]/g, "\\$&");
        }
      }
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
    const top = Number(element.dataset.top ?? 24);
    const left = Number(element.dataset.left ?? 24);
    const width = Number(element.dataset.width ?? 180);
    const height = Number(element.dataset.height ?? 32);
    return {
      x: left,
      y: top,
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({ top, left, width, height })
    } as DOMRect;
  });
}

function installMokaLikePage() {
  document.body.innerHTML = html`
    <main data-top="0" data-left="0" data-width="900" data-height="1200">
      <form id="moka-apply" data-top="20" data-left="20" data-width="760" data-height="980">
        <section class="form-section" data-top="60" data-left="40" data-width="700" data-height="360">
          <h2 data-top="60" data-left="40" data-width="100" data-height="28">个人信息</h2>

          <div class="form-item" data-top="110" data-left="40" data-width="260" data-height="76">
            <label for="candidate-name" data-top="110" data-left="40" data-width="80" data-height="24">姓名 *</label>
            <input id="candidate-name" data-top="140" data-left="40" data-width="220" data-height="32" value="validation@example.testresume" />
          </div>

          <div class="form-item" data-top="110" data-left="330" data-width="260" data-height="76">
            <label for="candidate-phone" data-top="110" data-left="330" data-width="90" data-height="24">手机号 *</label>
            <input id="candidate-phone" data-top="140" data-left="330" data-width="220" data-height="32" value="13800000000" />
          </div>

          <div class="form-item" data-top="200" data-left="40" data-width="260" data-height="76">
            <label for="candidate-email" data-top="200" data-left="40" data-width="80" data-height="24">邮箱 *</label>
            <input id="candidate-email" data-top="230" data-left="40" data-width="220" data-height="32" value="validation@example.testresume" />
          </div>

          <div class="degree-layout-field" data-top="200" data-left="330" data-width="300" data-height="86">
            <div class="field-caption" data-top="200" data-left="330" data-width="90" data-height="24">最高学历</div>
            <div class="moka-select-shell" data-top="230" data-left="330" data-width="260" data-height="40">
              <div
                id="degree-combobox"
                class="moka-custom-select"
                role="combobox"
                aria-controls="degree-options"
                aria-expanded="false"
                data-top="230"
                data-left="330"
                data-width="260"
                data-height="40"
              >
                <span class="display-value" data-top="238" data-left="350" data-width="100" data-height="24">请选择</span>
                <input id="degree-input" placeholder="请选择" readonly data-top="236" data-left="350" data-width="180" data-height="28" />
              </div>
            </div>
          </div>

          <div id="degree-options" class="sd-Menu-content" hidden data-top="274" data-left="330" data-width="260" data-height="120">
            <div class="sd-Menu-content-item-0" data-top="282" data-left="340" data-width="220" data-height="28">大专</div>
            <div class="sd-Menu-content-item-1" data-top="314" data-left="340" data-width="220" data-height="28">本科</div>
            <div class="sd-Menu-content-item-2" data-top="346" data-left="340" data-width="220" data-height="28">硕士</div>
          </div>
        </section>

        <section class="declaration-section" data-top="470" data-left="40" data-width="700" data-height="120">
          <h2 data-top="470" data-left="40" data-width="80" data-height="28">声明</h2>
          <div id="authenticity-row" class="moka-checkbox-row" data-top="520" data-left="40" data-width="360" data-height="32">
            <span role="checkbox" aria-checked="false" class="moka-checkbox" data-top="524" data-left="40" data-width="18" data-height="18"></span>
            <input id="authenticity-checkbox" type="checkbox" style="opacity: 0; width: 1px; height: 1px;" data-top="524" data-left="40" data-width="1" data-height="1" />
            <span data-top="520" data-left="70" data-width="260" data-height="24">本人确保以上所有信息真实有效。</span>
          </div>
        </section>

        <button id="preview-submit" type="button" data-top="680" data-left="300" data-width="140" data-height="40">预览并提交</button>
      </form>
    </main>
  `;

  const combobox = document.querySelector<HTMLElement>("#degree-combobox")!;
  const listbox = document.querySelector<HTMLElement>("#degree-options")!;
  const displayValue = document.querySelector<HTMLElement>("#degree-combobox .display-value")!;
  const degreeInput = document.querySelector<HTMLInputElement>("#degree-input")!;
  combobox.addEventListener("click", () => {
    listbox.hidden = false;
    combobox.setAttribute("aria-expanded", "true");
  });
  for (const option of document.querySelectorAll<HTMLElement>("#degree-options [class*='Menu-content-item']")) {
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => {
      displayValue.innerText = option.innerText;
      degreeInput.value = option.innerText;
      listbox.hidden = true;
      combobox.setAttribute("aria-expanded", "false");
    });
  }

  const declarationRow = document.querySelector<HTMLElement>("#authenticity-row")!;
  const checkbox = document.querySelector<HTMLInputElement>("#authenticity-checkbox")!;
  const roleCheckbox = document.querySelector<HTMLElement>("[role='checkbox']")!;
  const markChecked = () => {
    checkbox.checked = true;
    roleCheckbox.setAttribute("aria-checked", "true");
  };
  declarationRow.addEventListener("click", markChecked);

  const preview = document.querySelector<HTMLButtonElement>("#preview-submit")!;
  preview.addEventListener("click", () => {
    document.body.insertAdjacentHTML("beforeend", html`
      <div role="dialog" id="submit-confirm-dialog" data-top="220" data-left="260" data-width="280" data-height="180">
        <p data-top="250" data-left="280" data-width="220" data-height="24">确认提交本次申请？</p>
        <button id="confirm-submit" type="button" data-top="320" data-left="320" data-width="120" data-height="36">确认提交</button>
      </div>
    `);
    document.querySelector<HTMLButtonElement>("#confirm-submit")!.addEventListener("click", () => {
      document.querySelector("#submit-confirm-dialog")?.remove();
      document.body.insertAdjacentHTML("beforeend", html`
        <div id="success-message" data-top="220" data-left="260" data-width="260" data-height="40">投递成功</div>
      `);
    });
  });
}

function instructionFor(field: PageFieldObservation, semanticKey: string, value: string): FillInstruction {
  return {
    fieldId: field.fieldId,
    stableFieldKey: field.stableFieldKey,
    selector: field.selector,
    expectedLabel: field.label,
    semanticKey,
    popupBinding: field.popupBinding,
    type: field.type,
    value
  };
}

function findField(label: RegExp) {
  const observation = observeApplicationPage();
  const field = observation.fields.find((entry) =>
    label.test(entry.label) || label.test(entry.stableFieldKey ?? "")
  );
  if (!field) {
    throw new Error(`未在仿真页读取到字段：${label}`);
  }
  return field;
}

describe("Moka one-click apply page adapter simulation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installDomTestPrimitives();
    installMokaLikePage();
  });

  it.each(["bjwgby", "unregistered-company"])("keeps bilingual %s work-city identity after the site clears its placeholder", (company) => {
    vi.stubGlobal("location", new URL(`https://app.mokahr.com/campus-recruitment/${company}/1#/job/test/apply`));
    try {
    document.body.innerHTML = html`<form><section><h2>申请信息</h2>
      <div class="apply-field-test Select-test">
        <div class="title-test"><span><span>意向工作城市</span><span class="polyglot-separator"> / </span><span lang="en-US">Preferred work city</span></span><span class="required-asterisk"></span></div>
        <div class="ctrl-test"><div class="sd-Dropdown-container-test"><label class="sd-Input-container-test sd-Select-container-test">
          <input id="city" type="text" class="sd-Input-input-test" placeholder="选择意向工作城市 / Select preferred work city" value="">
          <span class="sd-Select-addon-test"></span>
        </label></div></div>
      </div><div class="apply-field-referral"><div class="title-test">推荐码 / Referral code</div><input id="referral" placeholder="推荐码"></div>
    </section></form>`;
    const before = observeApplicationPage();
    const city = before.fields.find(field => field.selector === "#city")!;
    expect(city.stableFieldKey).toBe("intention.preferred_city.combobox");
    const input = document.querySelector<HTMLInputElement>("#city")!;
    input.placeholder = "";
    input.insertAdjacentHTML("beforebegin", '<span class="sd-Input-display-value-test"><span>北京市 / Beijing</span></span>');
    const after = observeApplicationPage();
    expect(findDynamicReadbackField(city, after)).toMatchObject({
      label: city.label, stableFieldKey: city.stableFieldKey, currentValue: "北京市 / Beijing", validationMessage: null
    });
    expect(after.fields.filter(field => field.selector !== "#city"))
      .toEqual(before.fields.filter(field => field.selector !== "#city"));
    document.querySelector(".title-test span span")!.textContent = "推荐码";
    expect(findDynamicReadbackField(city, observeApplicationPage())).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not strip arbitrary slash captions or manufacture a primary caption from a translation-only title", () => {
    document.body.innerHTML = html`<form>
      <div class="apply-field-test"><div class="title-test">部门 / 职位</div><input id="relation-title"></div>
      <div class="apply-field-test"><div class="title-test"><span class="polyglot-separator"> / </span><span lang="en-US">Custom answer</span></div><input id="english-title"></div>
    </form>`;
    const fields = observeApplicationPage().fields;
    expect(fields.find(field => field.selector === "#relation-title")?.domHints?.fieldLabel).toBe("部门 / 职位");
    expect(fields.find(field => field.selector === "#english-title")?.domHints?.fieldLabel).toBe("/ Custom answer");
  });

  it("observes the real Zuoyebang graduation control and returns missing day information without opening it", () => {
    // Control subtree captured read-only from the actual HRBP[合肥]-27秋招
    // page on 2026-09-03. The section wrapper only supplies form context.
    document.body.innerHTML = html`<form><section class="form-section"><h2>教育背景</h2>
      <div class="apply-field-Q2iJ7AtQGX day_info-S5Nug1w6IL apply-filed-padding-gvR51AnKq6">
        <div class="title-IWWQ0Xa4L7"><span><span>毕业时间</span></span><span class="required-asterisk-av7daEKsLS"></span></div>
        <div class="ctrl-CICMG4Fr4_"><div class="sd-Dropdown-container-1CigZ" style="width: 100%;">
          <label class="sd-Input-container-2S_vM day_info sd-Input-lg-3X8ma" style="width: 100%;">
            <input type="text" class="sd-Input-input-10L0t sd-Input-common-input-1XimE sd-Input-has-addon-3djHe"
              readonly="" placeholder="日期（年月日）" fieldinfo="[object Object]" index="0"
              callingcodelist="[object Object]" callsource="apply-web" placement="bottomLeft" maxlength="255" value="">
            <span class="sd-Input-addon-1Dv-z sd-picker-addon-1SMM0"><div class=""></div></span>
          </label><span></span></div>
          <div style="margin-top: 0px;"><div class="describe-GCCjupJ4ID"></div></div>
        </div>
      </div></section><button type="button">预览并提交</button></form>`;
    const clicks = vi.fn();
    document.body.addEventListener("click", clicks);
    const observation = withFieldInformationRequirements({
      ...observeApplicationPage(),
      url: "https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/fd130622-05c8-47d7-bb39-fb45fa8e5aab/apply"
    });
    const target = observation.fields[0]!;
    expect(target).toMatchObject({
      required: true, currentValue: "", type: "text", controlKind: "native",
      domHints: { fieldLabel: "毕业时间", tagName: "INPUT", readOnly: true, placeholder: "日期（年月日）" },
      informationRequirement: { kind: "date", precision: "day" }
    });
    const route = resolveControlAdapter({
      applicationUrl: observation.url, label: target.label, semanticKey: target.stableFieldKey!,
      type: target.type, controlKind: target.controlKind!, tagName: target.domHints!.tagName!,
      readOnly: target.domHints!.readOnly!, placeholder: target.domHints!.placeholder!,
      classNames: target.domHints!.classNames!
    });
    expect(route.code).toBe("moka.date-picker.trusted-pointer.v9");
    const facts = { "resume.education.0.endDate": "2026-06" };
    expect(deterministicKnownFactActions(observation, facts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields(observation.fields, facts)).toEqual([
      expect.objectContaining({ label: expect.stringContaining("毕业时间"), type: "date", controlKind: "date" })
    ]);
    const request = candidateInformationRequestsForMissingFields(observation.fields, facts)[0]!;
    const saved = JSON.parse(JSON.stringify({ facts: [{
      label: request.label, stableFieldKeys: [request.stableFieldKey], source: "user_confirmed", value: "2026-06-30"
    }] }));
    const nextBatchFacts = enrichVisionCandidateFacts({}, facts, { requiredFieldAnswers: [] }, saved);
    const nextObservation = withFieldInformationRequirements({ ...observeApplicationPage(), url: observation.url });
    expect(candidateInformationRequestsForMissingFields(nextObservation.fields, nextBatchFacts)).toEqual([]);
    expect(deterministicKnownFactActions(nextObservation, nextBatchFacts)).toMatchObject([{ value: "2026-06-30" }]);
    expect(clicks).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("input")!.value).toBe("");
    document.body.removeEventListener("click", clicks);
  });

  it("does not treat third-party Moka fields as candidate identity fields", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="320">
        <div class="form-item" data-top="40" data-left="40" data-width="280" data-height="80">
          <label for="candidate-name">姓名 *</label>
          <input id="candidate-name" placeholder="姓名" data-top="72" data-left="40" data-width="240" data-height="32" />
        </div>
        <div class="form-item" data-top="130" data-left="40" data-width="280" data-height="80">
          <label for="referrer-name">外部推荐人</label>
          <input id="referrer-name" placeholder="姓名" data-top="162" data-left="40" data-width="240" data-height="32" />
        </div>
        <div class="form-item" data-top="220" data-left="40" data-width="280" data-height="80">
          <label for="emergency-email">紧急联系人邮箱</label>
          <input id="emergency-email" placeholder="邮箱" data-top="252" data-left="40" data-width="240" data-height="32" />
        </div>
      </form>
    `;

    const result = await ensureMokaIdentityFields({
      fullName: "候选人本人",
      email: "candidate@example.com"
    });

    expect(result).toEqual([
      expect.objectContaining({ semanticKey: "fullName", matched: 1, verified: 1 }),
      expect.objectContaining({ semanticKey: "email", matched: 0, verified: 0 })
    ]);
    expect(document.querySelector<HTMLInputElement>("#candidate-name")?.value).toBe("候选人本人");
    expect(document.querySelector<HTMLInputElement>("#referrer-name")?.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#emergency-email")?.value).toBe("");
  });

  it("preserves the real Moka emergency-contact title before the generic name placeholder", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="360">
        <div class="apply-field-candidate string_info-candidate"
          data-top="40" data-left="40" data-width="300" data-height="90">
          <div class="field-title" data-top="40" data-left="40" data-width="120" data-height="24">
            <span class="required-asterisk-candidate"></span>姓名
          </div>
          <div class="ctrl-candidate">
            <label class="sd-Input-container-candidate string_info">
              <input id="candidate-name" class="sd-Input-input-candidate" type="text"
                placeholder="姓名" data-top="72" data-left="40" data-width="240" data-height="32" />
            </label>
          </div>
        </div>
        <div class="apply-field-emergency string_info-emergency"
          data-top="150" data-left="40" data-width="300" data-height="90">
          <div class="field-title" data-top="150" data-left="40" data-width="180" data-height="24">
            <span class="required-asterisk-emergency"></span>紧急联系人姓名
          </div>
          <div class="ctrl-emergency">
            <label class="sd-Input-container-emergency string_info">
              <input id="emergency-name" class="sd-Input-input-emergency" type="text"
                placeholder="紧急联系人姓名" data-top="182" data-left="40" data-width="240" data-height="32" />
            </label>
          </div>
        </div>
      </form>
    `;

    const fields = observeApplicationPage().fields;
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "姓名",
        sectionKey: "basic",
        stableFieldKey: "basic.full_name.native",
        required: true,
        currentValue: ""
      }),
      expect.objectContaining({
        label: "紧急联系人姓名",
        sectionKey: "third_party",
        stableFieldKey: "third_party.name.native",
        required: true,
        currentValue: ""
      })
    ]));
    expect(document.querySelector<HTMLInputElement>("#candidate-name")?.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#emergency-name")?.value).toBe("");
  });

  it("binds Feishu relation-person validation fields to their own section", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="620">
        <section class="applyFormModuleWrapper__fixture" data-top="300" data-left="40" data-width="680" data-height="280">
          <div class="module-title" data-top="300" data-left="40" data-width="300" data-height="28">与公司员工是否有亲属关系（如有）</div>
          <div class="applyFormModuleWrapper-right">
            <div id="formily-item-relation-list" class="ud-formily-item">
              <div class="apply-form-array-card">
                <div class="register-form-group-wrapper">
                  <div class="ud-formily-item" data-form-field-id="relation-name">
                    <label>姓名</label>
                    <input data-form-field-id="relation-name" data-form-field-i18n-name="姓名" aria-invalid="true" data-top="350" data-left="60" data-width="220" data-height="32" />
                    <div role="alert">必填项未填写</div>
                  </div>
                  <div class="ud-formily-item" data-form-field-id="relation-department">
                    <label>部门/职位</label>
                    <input data-form-field-id="relation-department" data-form-field-i18n-name="部门/职位" aria-invalid="true" data-top="410" data-left="60" data-width="220" data-height="32" />
                    <div role="alert">必填项未填写</div>
                  </div>
                  <div class="ud-formily-item" data-form-field-id="relation-type">
                    <label>与本人关系</label>
                    <input data-form-field-id="relation-type" data-form-field-i18n-name="与本人关系" aria-invalid="true" data-top="470" data-left="60" data-width="220" data-height="32" />
                    <div role="alert">必填项未填写</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </form>
    `;

    const relationFields = observeApplicationPage().fields.filter((field) => field.sectionKey === "relation");
    expect(relationFields).toHaveLength(3);
    expect(relationFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "与公司员工是否有亲属关系（如有） · 姓名",
        stableFieldKey: "relation.name.native",
        required: true
      }),
      expect.objectContaining({
        label: "与公司员工是否有亲属关系（如有） · 部门/职位",
        stableFieldKey: "relation.department_position.native",
        required: true
      }),
      expect.objectContaining({
        label: "与公司员工是否有亲属关系（如有） · 与本人关系",
        stableFieldKey: "relation.relationship.native",
        required: true
      })
    ]));
  });

  it("rebinds relation answers by stable identity instead of a stale education selector", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="620">
        <section class="form-section" data-top="40" data-left="40" data-width="680" data-height="180">
          <h2>教育经历</h2>
          <div class="form-item">
            <label for="major">专业</label>
            <input id="major" data-form-field-i18n-name="专业" value="计算机科学" data-top="100" data-left="60" data-width="220" data-height="32" />
          </div>
        </section>
        <section class="applyFormModuleWrapper__fixture" data-top="260" data-left="40" data-width="680" data-height="280">
          <div class="module-title">与公司员工是否有亲属关系（如有）</div>
          <div class="ud-formily-item" data-form-field-id="relation-department">
            <label for="relation-department">部门/职位</label>
            <input id="relation-department" data-form-field-i18n-name="部门/职位" data-top="330" data-left="60" data-width="220" data-height="32" />
          </div>
          <div class="ud-formily-item" data-form-field-id="relation-type">
            <label for="relation-type">与本人关系</label>
            <input id="relation-type" data-form-field-i18n-name="与本人关系" data-top="390" data-left="60" data-width="220" data-height="32" />
          </div>
        </section>
      </form>
    `;

    const fields = observeApplicationPage().fields;
    const department = fields.find((field) => field.stableFieldKey === "relation.department_position.native")!;
    const relationship = fields.find((field) => field.stableFieldKey === "relation.relationship.native")!;
    const major = document.querySelector<HTMLInputElement>("#major")!;
    let majorInputEvents = 0;
    major.addEventListener("input", () => { majorInputEvents += 1; });

    const results = await fillApplicationPage([
      { ...instructionFor(department, "job.requiredField.stable:relation.department_position.native", "无"), selector: "#major" },
      { ...instructionFor(relationship, "job.requiredField.stable:relation.relationship.native", "无"), selector: "#major" }
    ]);

    expect(results).toEqual([
      expect.objectContaining({ success: true, actual: "无" }),
      expect.objectContaining({ success: true, actual: "无" })
    ]);
    expect(major.value).toBe("计算机科学");
    expect(majorInputEvents).toBe(0);
    expect(document.querySelector<HTMLInputElement>("#relation-department")?.value).toBe("无");
    expect(document.querySelector<HTMLInputElement>("#relation-type")?.value).toBe("无");
  });

  it("fails closed when a relation target disappeared instead of writing its stale selector", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="220">
        <section class="form-section">
          <h2>教育经历</h2>
          <div class="form-item">
            <label for="major">专业</label>
            <input id="major" value="计算机科学" data-top="100" data-left="60" data-width="220" data-height="32" />
          </div>
        </section>
      </form>
    `;
    const major = document.querySelector<HTMLInputElement>("#major")!;
    let mutationEvents = 0;
    major.addEventListener("input", () => { mutationEvents += 1; });
    major.addEventListener("change", () => { mutationEvents += 1; });

    const result = await fillApplicationPage([{
      fieldId: "field-30",
      stableFieldKey: "relation.relationship.native",
      selector: "#major",
      expectedLabel: "与公司员工是否有亲属关系（如有） · 与本人关系",
      semanticKey: "job.requiredField.stable:relation.relationship.native",
      popupBinding: null,
      type: "text",
      value: "无"
    }]);

    expect(result).toEqual([
      expect.objectContaining({ success: false, driverFailureCode: "control_target_missing" })
    ]);
    expect(major.value).toBe("计算机科学");
    expect(mutationEvents).toBe(0);
  });

  it("promotes submit-triggered Feishu 为必填 validation to explicit required fields", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="360">
        <div class="ud-formily-item" data-form-field-id="relation-name">
          <label>姓名</label>
          <input data-form-field-id="relation-name" data-form-field-i18n-name="姓名"
            data-top="80" data-left="60" data-width="220" data-height="32" />
          <div class="field-error">姓名为必填</div>
        </div>
      </form>
    `;

    expect(observeApplicationPage().fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: expect.stringContaining("姓名"), required: true, requiredSource: "explicit" })
    ]));
  });

  it("dismisses Moka's optional login prompt when the public application form is already usable", () => {
    document.querySelector("#moka-apply")!.insertAdjacentHTML("beforeend", html`
      <label for="candidate-resume" data-top="580" data-left="40" data-width="100" data-height="24">上传简历 *</label>
      <input id="candidate-resume" type="file" data-top="610" data-left="40" data-width="220" data-height="32" />
      <label for="candidate-school" data-top="580" data-left="330" data-width="100" data-height="24">学校名称 *</label>
      <input id="candidate-school" data-top="610" data-left="330" data-width="220" data-height="32" />
      <label for="candidate-major" data-top="650" data-left="40" data-width="100" data-height="24">专业名称 *</label>
      <input id="candidate-major" data-top="680" data-left="40" data-width="220" data-height="32" />
    `);
    document.body.insertAdjacentHTML("beforeend", html`
      <div role="dialog" aria-modal="true" class="moka-login-modal"
        data-top="120" data-left="220" data-width="520" data-height="420">
        <span id="close-login" class="sd-Icon-container sd-Icon-iconminiClose sd-Modal-close-outer"
          data-top="140" data-left="700" data-width="28" data-height="28"></span>
        <h2 data-top="170" data-left="260" data-width="160" data-height="28">手机号登录</h2>
        <form data-top="210" data-left="260" data-width="420" data-height="260">
          <input placeholder="请输入手机号" data-top="230" data-left="280" data-width="360" data-height="36" />
          <input type="password" placeholder="请输入密码" data-top="280" data-left="280" data-width="360" data-height="36" />
          <button type="button" data-top="340" data-left="280" data-width="360" data-height="36">登录</button>
        </form>
      </div>
    `);
    document.querySelector<HTMLElement>("#close-login")!.addEventListener("click", () => {
      document.querySelector(".moka-login-modal")?.remove();
    });

    const observation = observeApplicationPage();
    expect(observation).toMatchObject({ formDetected: true, loginRequired: false });
    resolveApplicationUserAction(undefined, false);
    expect(document.querySelector(".moka-login-modal")).not.toBeNull();
    expect(resolveApplicationUserAction()).toBeNull();
    expect(document.querySelector(".moka-login-modal")).toBeNull();
  });

  it("prioritizes a Moka verification-code login gate over missing fields on a usable form", () => {
    document.querySelector("#moka-apply")!.insertAdjacentHTML("beforeend", html`
      <label for="candidate-resume" data-top="580" data-left="40" data-width="100" data-height="24">上传简历 *</label>
      <input id="candidate-resume" type="file" data-top="610" data-left="40" data-width="220" data-height="32" />
      <label for="candidate-school" data-top="580" data-left="330" data-width="100" data-height="24">学校名称 *</label>
      <input id="candidate-school" data-top="610" data-left="330" data-width="220" data-height="32" />
      <label for="candidate-major" data-top="650" data-left="40" data-width="100" data-height="24">专业名称 *</label>
      <input id="candidate-major" data-top="680" data-left="40" data-width="220" data-height="32" />
    `);
    document.body.insertAdjacentHTML("beforeend", html`
      <div role="dialog" aria-modal="true" class="moka-login-modal"
        data-top="120" data-left="220" data-width="520" data-height="520">
        <span id="close-verification-login" class="sd-Modal-close-outer"
          data-top="140" data-left="700" data-width="28" data-height="28">×</span>
        <div data-top="170" data-left="260" data-width="280" data-height="28">邮箱登录　手机号登录</div>
        <form data-top="210" data-left="260" data-width="420" data-height="320">
          <input placeholder="请输入手机号" data-top="230" data-left="280" data-width="360" data-height="36" />
          <input placeholder="请输入验证码" data-top="280" data-left="280" data-width="240" data-height="36" />
          <button type="button" data-top="280" data-left="530" data-width="110" data-height="36">获取验证码</button>
          <button type="button" data-top="350" data-left="280" data-width="360" data-height="36">登录</button>
          <button type="button" data-top="410" data-left="390" data-width="140" data-height="36">微信登录</button>
        </form>
      </div>
    `);
    const close = vi.fn();
    document.querySelector<HTMLElement>("#close-verification-login")!.addEventListener("click", close);

    expect(observeApplicationPage()).toMatchObject({
      formDetected: true,
      loginRequired: true,
      loginReason: "检测到手机号或验证码登录弹窗"
    });
    expect(resolveApplicationUserAction()).toMatchObject({
      type: "login",
      message: expect.stringContaining("验证码登录")
    });
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps a real login-only page paused", () => {
    document.body.innerHTML = html`
      <div role="dialog" aria-modal="true" class="login-modal"
        data-top="120" data-left="220" data-width="520" data-height="420">
        <h2 data-top="170" data-left="260" data-width="160" data-height="28">账号登录</h2>
        <form data-top="210" data-left="260" data-width="420" data-height="260">
          <input placeholder="请输入手机号" data-top="230" data-left="280" data-width="360" data-height="36" />
          <input type="password" placeholder="请输入密码" data-top="280" data-left="280" data-width="360" data-height="36" />
          <button type="button" data-top="340" data-left="280" data-width="360" data-height="36">登录</button>
        </form>
      </div>
    `;

    expect(observeApplicationPage().loginRequired).toBe(true);
    expect(resolveApplicationUserAction()).toMatchObject({ type: "login" });
    expect(document.querySelector(".login-modal")).not.toBeNull();
  });

  it("corrects native identity fields but leaves an unregistered degree select and submit untouched", async () => {
    const initial = observeApplicationPage();
    expect(initial.formDetected).toBe(true);
    expect(initial.fields.some((field) => /最高学历/.test(field.label))).toBe(true);

    const fillResults = await fillApplicationPage([
      instructionFor(findField(/^姓名/), "candidate.basic.fullName", "陈子航"),
      instructionFor(findField(/^邮箱/), "candidate.basic.email", "chenzihang@example.com"),
      instructionFor(findField(/手机号/), "candidate.basic.phone", "13800001234"),
      instructionFor(findField(/最高学历|education.*degree/), "candidate.basic.highestDegree", "本科")
    ]);

    expect(fillResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: findField(/^姓名/).fieldId, success: true, actual: "陈子航" }),
      expect.objectContaining({ fieldId: findField(/^邮箱/).fieldId, success: true, actual: "chenzihang@example.com" }),
      expect.objectContaining({ fieldId: findField(/手机号/).fieldId, success: true, actual: "13800001234" }),
      expect.objectContaining({ fieldId: findField(/最高学历|education.*degree/).fieldId, success: false,
        driverFailureCode: "unsupported_required_control" })
    ]));
    expect((document.querySelector("#degree-combobox .display-value") as HTMLElement).innerText).not.toBe("本科");
    expect(document.querySelector("#submit-confirm-dialog")).toBeNull();
    expect(document.querySelector<HTMLInputElement>("#authenticity-checkbox")!.checked).toBe(false);
  }, 15_000);

  it("uses the visible Moka label when a parser has placed an email in the name control", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="300">
        <section data-top="40" data-left="40" data-width="680" data-height="220">
          <h2 data-top="40" data-left="40" data-width="100" data-height="28">个人信息</h2>
          <div class="label-row" data-top="90" data-left="40" data-width="620" data-height="24">
            <span data-top="90" data-left="40" data-width="80" data-height="24">姓名 *</span>
            <span data-top="90" data-left="360" data-width="80" data-height="24">手机号 *</span>
          </div>
          <div class="input-row" data-top="122" data-left="40" data-width="620" data-height="36">
            <input id="generic-control-1" value="validation@example.com"
              data-top="122" data-left="40" data-width="260" data-height="36" />
            <input id="generic-control-2" value="13988523745"
              data-top="122" data-left="360" data-width="260" data-height="36" />
          </div>
          <div class="label-row" data-top="180" data-left="40" data-width="620" data-height="24">
            <span data-top="180" data-left="40" data-width="80" data-height="24">邮箱 *</span>
          </div>
          <div class="input-row" data-top="212" data-left="40" data-width="620" data-height="36">
            <input id="generic-control-3" value="validation@example.com"
              data-top="212" data-left="40" data-width="260" data-height="36" />
          </div>
        </section>
      </form>
    `;

    const before = observeApplicationPage();
    const name = before.fields.find((field) => /姓名/.test(field.label));
    const email = before.fields.find((field) => /邮箱/.test(field.label));
    expect(name).toMatchObject({
      stableFieldKey: expect.stringMatching(/^basic\.full_name\.native/),
      currentValue: "validation@example.com"
    });
    expect(email).toMatchObject({
      stableFieldKey: expect.stringMatching(/^basic\.email\.native/),
      currentValue: "validation@example.com"
    });

    const result = await fillApplicationPage([
      instructionFor(name!, "candidate.basic.fullName", "张明")
    ]);
    expect(result).toEqual([expect.objectContaining({ success: true, actual: "张明" })]);
    expect((document.querySelector("#generic-control-1") as HTMLInputElement).value).toBe("张明");
    expect((document.querySelector("#generic-control-3") as HTMLInputElement).value)
      .toBe("validation@example.com");
  });

  it("keeps Moka placeholder selects bound to their local labels and containing sections", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="900">
        <section class="personal-module" data-top="40" data-left="40" data-width="680" data-height="300">
          <h2 data-top="40" data-left="40" data-width="100" data-height="28">个人信息</h2>
          <div class="apply-field-Q1" data-top="90" data-left="40" data-width="280" data-height="70">
            <div data-top="90" data-left="40" data-width="80" data-height="24">性别 *</div>
            <div class="sd-Select" data-top="120" data-left="40" data-width="240" data-height="36">
              <input id="gender" placeholder="请选择" readonly required data-top="124" data-left="48" data-width="200" data-height="28" />
            </div>
          </div>
          <div class="apply-field-Q2" data-top="90" data-left="360" data-width="280" data-height="70">
            <div data-top="90" data-left="360" data-width="100" data-height="24">工作经验 *</div>
            <div class="sd-Select" data-top="120" data-left="360" data-width="240" data-height="36">
              <input id="work-experience" placeholder="请选择" readonly required data-top="124" data-left="368" data-width="200" data-height="28" />
            </div>
          </div>
          <div class="apply-field-Q3" data-top="180" data-left="40" data-width="280" data-height="70">
            <div data-top="180" data-left="40" data-width="100" data-height="24">最高学历 *</div>
            <div class="sd-Select" data-top="210" data-left="40" data-width="240" data-height="36">
              <input id="highest-degree" placeholder="请选择" readonly required data-top="214" data-left="48" data-width="200" data-height="28" />
            </div>
          </div>
        </section>
        <section class="work-module" data-top="380" data-left="40" data-width="680" data-height="220">
          <h2 data-top="380" data-left="40" data-width="100" data-height="28">工作经历</h2>
          <div class="apply-field-Q4" data-top="430" data-left="40" data-width="280" data-height="70">
            <div data-top="430" data-left="40" data-width="80" data-height="24">学历 *</div>
            <div class="sd-Select" data-top="460" data-left="40" data-width="240" data-height="36">
              <input id="work-degree" placeholder="请选择" readonly required data-top="464" data-left="48" data-width="200" data-height="28" />
            </div>
          </div>
        </section>
        <section data-top="640" data-left="40" data-width="680" data-height="120">
          <h2 data-top="640" data-left="40" data-width="100" data-height="28">语言能力</h2>
        </section>
      </form>
    `;

    const observed = observeApplicationPage();
    expect(observed.fields.find((field) => field.selector === "#gender")).toMatchObject({
      label: "性别",
      sectionKey: "basic",
      stableFieldKey: expect.stringMatching(/^basic\.gender\.combobox/)
    });
    expect(observed.fields.find((field) => field.selector === "#work-experience")).toMatchObject({
      label: "工作经验",
      sectionKey: "basic",
      stableFieldKey: expect.stringMatching(/^basic\.work_experience\.combobox/)
    });
    expect(observed.fields.find((field) => field.selector === "#highest-degree")).toMatchObject({
      label: "最高学历",
      stableFieldKey: expect.stringMatching(/^education\.highest_degree\.combobox/)
    });
    expect(observed.fields.find((field) => field.selector === "#work-degree")).toMatchObject({
      label: "工作经历 · 学历",
      sectionKey: "work",
      stableFieldKey: expect.stringMatching(/^work(?:\[0\])?\.degree\.combobox/)
    });
  });

  it("discovers real options from a closed Moka select without changing its value", async () => {
    document.body.innerHTML = html`
      <div class="apply-field-Q1" data-top="90" data-left="40" data-width="280" data-height="70">
        <div data-top="90" data-left="40" data-width="80" data-height="24">性别 *</div>
        <div id="gender-select" class="sd-Select" data-top="120" data-left="40" data-width="240" data-height="36">
          <input id="gender" placeholder="请选择" readonly required value=""
            data-top="124" data-left="48" data-width="200" data-height="28" />
        </div>
      </div>
    `;
    const root = document.querySelector<HTMLElement>("#gender-select")!;
    root.addEventListener("click", () => {
      if (document.querySelector("#gender-options")) return;
      const popup = document.createElement("div");
      popup.id = "gender-options";
      popup.innerHTML = html`
        <div class="sd-Menu-content-item-0" data-top="180" data-left="40" data-width="240" data-height="32">男</div>
        <div class="sd-Menu-content-item-1" data-top="212" data-left="40" data-width="240" data-height="32">女</div>
      `;
      document.body.append(popup);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.querySelector("#gender-options")?.remove();
    }, { once: true });

    const result = await discoverApplicationFieldOptions([{
      fieldId: "field-1",
      stableFieldKey: "basic.gender.combobox",
      selector: "#gender",
      label: "性别"
    }]);

    expect(result).toEqual([{
      fieldId: "field-1",
      stableFieldKey: "basic.gender.combobox",
      options: []
    }]);
    expect((document.querySelector("#gender") as HTMLInputElement).value).toBe("");
    expect(document.querySelector("#gender-options")).toBeNull();
  });

  it("does not open an unregistered year select or consume stale title metadata", async () => {
    document.body.innerHTML = html`
      <div class="apply-field-Q1" data-top="90" data-left="40" data-width="520" data-height="90">
        <div data-top="90" data-left="40" data-width="100" data-height="24">毕业时间 *</div>
        <div id="graduation-year-select" class="sd-Select" data-top="120" data-left="40" data-width="220" data-height="36">
          <input id="graduation-year" placeholder="年" readonly required value=""
            data-top="124" data-left="48" data-width="180" data-height="28" />
        </div>
      </div>
    `;
    const root = document.querySelector<HTMLElement>("#graduation-year-select")!;
    root.addEventListener("click", () => {
      if (document.querySelector("#graduation-year-options")) return;
      const popup = document.createElement("div");
      popup.id = "graduation-year-options";
      popup.innerHTML = html`
        <div class="sd-Menu-content-item-0" title="2126"
          data-top="180" data-left="40" data-width="220" data-height="32">2026</div>
        <div class="sd-Menu-content-item-1" title="2125"
          data-top="212" data-left="40" data-width="220" data-height="32">2025</div>
      `;
      document.body.append(popup);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.querySelector("#graduation-year-options")?.remove();
    }, { once: true });

    const result = await discoverApplicationFieldOptions([{
      fieldId: "field-1",
      stableFieldKey: "education[0].graduation_date.combobox",
      selector: "#graduation-year",
      label: "教育背景 · 结束时间 · 年"
    }]);

    expect(result[0]?.options).toEqual([]);
    expect(document.querySelector("#graduation-year-options")).toBeNull();
    expect(result[0]?.options).not.toContain("2126");
  });

  it("does not probe a custom year dropdown through the native option observer", async () => {
    document.body.innerHTML = html`
      <div class="apply-field-Q1" data-top="90" data-left="40" data-width="520" data-height="90">
        <div data-top="90" data-left="40" data-width="100" data-height="24">毕业时间 *</div>
        <div id="graduation-year-select" class="sd-Select" data-top="120" data-left="40" data-width="220" data-height="36">
          <input id="graduation-year" placeholder="年" readonly required value=""
            data-top="124" data-left="48" data-width="180" data-height="28" />
        </div>
      </div>
    `;
    const root = document.querySelector<HTMLElement>("#graduation-year-select")!;
    root.addEventListener("click", () => {
      if (document.querySelector("#graduation-year-options")) return;
      const popup = document.createElement("div");
      popup.id = "graduation-year-options";
      popup.style.overflowY = "auto";
      popup.dataset.top = "180";
      popup.dataset.left = "40";
      popup.dataset.width = "220";
      popup.dataset.height = "96";
      popup.innerHTML = html`
        <div class="sd-Menu-content-item-future" data-top="-3020" data-left="40" data-width="220" data-height="32">2126</div>
        <div class="sd-Menu-content-item-future" data-top="-2988" data-left="40" data-width="220" data-height="32">2125</div>
        <div class="sd-Menu-content-item-current" data-top="180" data-left="40" data-width="220" data-height="32">2026</div>
        <div class="sd-Menu-content-item-current" data-top="212" data-left="40" data-width="220" data-height="32">2025</div>
        <div class="sd-Menu-content-item-current" data-top="244" data-left="40" data-width="220" data-height="32">2024</div>
        <div class="sd-Menu-content-item-past" data-top="276" data-left="40" data-width="220" data-height="32">2023</div>
      `;
      document.body.append(popup);
    });

    const result = await discoverApplicationFieldOptions([{
      fieldId: "field-1",
      stableFieldKey: "education[0].graduation_date.combobox",
      selector: "#graduation-year",
      label: "教育背景 · 结束时间 · 年"
    }]);

    expect(result[0]?.options).toEqual([]);
    expect(document.querySelector("#graduation-year-options")).toBeNull();
    expect(result[0]?.options).not.toContain("2126");
    expect(result[0]?.options).not.toContain("2023");
  });

  it("does not guess unrelated custom choices from title attributes", async () => {
    document.body.innerHTML = html`
      <div data-top="90" data-left="40" data-width="320" data-height="90">
        <div data-top="90" data-left="40" data-width="100" data-height="24">工作模式 *</div>
        <div id="work-mode-select" class="custom-selector" data-top="120" data-left="40" data-width="240" data-height="36">
          <input id="work-mode" role="combobox" placeholder="请选择" readonly required value=""
            data-top="124" data-left="48" data-width="200" data-height="28" />
        </div>
      </div>
    `;
    const root = document.querySelector<HTMLElement>("#work-mode-select")!;
    root.addEventListener("click", () => {
      if (document.querySelector("#work-mode-options")) return;
      const popup = document.createElement("div");
      popup.id = "work-mode-options";
      popup.innerHTML = html`
        <div class="dropdown-item" title="远程办公"
          data-top="180" data-left="40" data-width="220" data-height="32"></div>
      `;
      document.body.append(popup);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.querySelector("#work-mode-options")?.remove();
    }, { once: true });

    const result = await discoverApplicationFieldOptions([{
      fieldId: "field-2",
      stableFieldKey: "job.work_mode.combobox",
      selector: "#work-mode",
      label: "工作模式"
    }]);

    expect(result[0]?.options).toEqual([]);
    expect(document.querySelector("#work-mode-options")).toBeNull();
  });

  it("does not auto-check non-exact consent or privacy statements", async () => {
    document.body.innerHTML = html`
      <div data-top="20" data-left="20" data-width="500" data-height="80">
        <input id="privacy-consent" type="checkbox" data-top="22" data-left="22" data-width="18" data-height="18" />
        <span data-top="20" data-left="50" data-width="420" data-height="24">本人已阅读并同意隐私政策和用户授权条款。</span>
      </div>
    `;
    const result = await ensureMokaAuthenticityDeclaration();
    expect(result).toMatchObject({ found: false, checked: false, error: null });
    expect((document.querySelector("#privacy-consent") as HTMLInputElement).checked).toBe(false);
  });

  it("treats a nested required asterisk as decoration on the exact authenticity declaration", async () => {
    document.body.innerHTML = html`
      <label data-top="20" data-left="20" data-width="500" data-height="40">
        <input id="required-authenticity" type="checkbox"
          data-top="28" data-left="24" data-width="18" data-height="18" />
        <span data-top="20" data-left="52" data-width="420" data-height="28">
          本人确保以上所有信息真实有效。<span class="required-asterisk">*</span>
        </span>
      </label>
    `;
    const checkbox = document.querySelector<HTMLInputElement>("#required-authenticity")!;
    const result = await ensureMokaAuthenticityDeclaration();
    expect(result).toMatchObject({ found: true, checked: true, error: null });
    expect(checkbox.checked).toBe(true);
  });

  it("checks an observed Moka-family consent after batch authorization and verifies React state", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="560" data-height="140">
        <label id="tenant-consent-row" data-top="40" data-left="40" data-width="440" data-height="34">
          <input id="tenant-consent" type="checkbox" required
            data-top="46" data-left="44" data-width="18" data-height="18" />
          <span data-top="40" data-left="72" data-width="380" data-height="28">
            我已阅读并同意候选人隐私声明及信息使用授权
          </span>
        </label>
        <button id="untouched-submit" type="button"
          data-top="92" data-left="40" data-width="120" data-height="32">提交申请</button>
      </form>
    `;
    const checkbox = document.querySelector<HTMLInputElement>("#tenant-consent")!;
    const row = document.querySelector<HTMLElement>("#tenant-consent-row")!;
    row.addEventListener("click", () => {
      checkbox.checked = true;
    });
    const submit = document.querySelector<HTMLButtonElement>("#untouched-submit")!;
    const submitSpy = vi.fn();
    submit.addEventListener("click", submitSpy);

    const action = observeApplicationPage().actions.find((candidate) =>
      candidate.kind === "consent" && /候选人隐私声明/.test(candidate.text)
    );
    expect(action).toBeTruthy();
    const result = await executeAuthorizedConsentAction(action!);

    expect(result).toMatchObject({ found: true, checked: true, changed: true, error: null });
    expect(checkbox.checked).toBe(true);
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("rebinds a hidden Moka checkbox from its live label after section drift and DOM rebuild", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="560" data-height="140">
        <div class="apply-field-rebuilt" data-top="40" data-left="40" data-width="460" data-height="48">
          <label id="known-row" data-top="40" data-left="40" data-width="420" data-height="36">
            <input id="known-checkbox" class="sd-Checkbox-input-3JNJP" type="checkbox"
              style="opacity: 0; width: 1px; height: 1px"
              data-top="46" data-left="44" data-width="1" data-height="1" />
            <span data-top="40" data-left="72" data-width="320" data-height="28">本人已知悉以上内容</span>
          </label>
        </div>
      </form>
    `;
    const checkbox = document.querySelector<HTMLInputElement>("#known-checkbox")!;
    document.querySelector<HTMLElement>("#known-row")!.addEventListener("click", () => {
      checkbox.checked = true;
    });
    const observed = observeApplicationPage().fields.find((candidate) =>
      candidate.type === "checkbox" && /本人已知悉以上内容/.test(candidate.label)
    );
    expect(observed).toBeTruthy();

    const result = await executeAuthorizedConsentAction({
      actionId: "rebuilt-known-checkbox",
      selector: "#stale-checkbox-selector",
      text: "语言能力 · 本人已知悉以上内容",
      kind: "consent",
      risk: "user_only",
      disabled: false,
      context: "语言能力"
    });

    expect(result).toMatchObject({ found: true, checked: true, changed: true, error: null });
    expect(checkbox.checked).toBe(true);
  });

  it("confirms Moka's privacy-reading modal before accepting the underlying consent", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="640" data-height="180">
        <label id="privacy-row" data-top="40" data-left="40" data-width="520" data-height="34">
          <input id="privacy-checkbox" type="checkbox" required
            data-top="46" data-left="44" data-width="18" data-height="18" />
          <span data-top="40" data-left="72" data-width="460" data-height="28">
            我已阅读并同意《隐私协议》和《招聘数据处理声明》
          </span>
        </label>
        <button id="untouched-final-submit" type="button"
          data-top="110" data-left="40" data-width="120" data-height="32">预览并提交</button>
      </form>
    `;
    const checkbox = document.querySelector<HTMLInputElement>("#privacy-checkbox")!;
    const row = document.querySelector<HTMLElement>("#privacy-row")!;
    const submit = document.querySelector<HTMLButtonElement>("#untouched-final-submit")!;
    const submitSpy = vi.fn();
    submit.addEventListener("click", submitSpy);
    row.addEventListener("click", (event) => {
      event.preventDefault();
      checkbox.checked = false;
      const modal = document.createElement("div");
      modal.setAttribute("role", "dialog");
      modal.dataset.top = "220";
      modal.dataset.left = "180";
      modal.dataset.width = "520";
      modal.dataset.height = "320";
      modal.innerHTML = `
        <h2 data-top="240" data-left="200" data-width="200" data-height="30">隐私协议</h2>
        <div data-top="280" data-left="200" data-width="450" data-height="120">Moka个人信息保护政策</div>
        <button id="privacy-accept" data-top="520" data-left="460" data-width="160" data-height="36">我已阅读并同意</button>
      `;
      document.body.append(modal);
      modal.querySelector<HTMLButtonElement>("#privacy-accept")!.addEventListener("click", () => {
        checkbox.checked = true;
        modal.remove();
      });
    });

    const action = observeApplicationPage().actions.find((candidate) =>
      candidate.kind === "consent" && /招聘数据处理声明/.test(candidate.text)
    );
    expect(action).toBeTruthy();
    const result = await executeAuthorizedConsentAction(action!);

    expect(result).toMatchObject({ found: true, checked: true, changed: true, error: null });
    expect(checkbox.checked).toBe(true);
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("checks only Xiaopeng's exact privacy consent and verifies the live checkbox", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="500" data-height="120">
        <label data-top="40" data-left="40" data-width="300" data-height="32">
          <input id="xiaopeng-privacy" type="checkbox"
            data-top="44" data-left="44" data-width="18" data-height="18" />
          <span data-top="40" data-left="70" data-width="240" data-height="24">我已阅读并同意隐私政策</span>
        </label>
      </form>
    `;

    const result = await ensureXiaopengPrivacyConsent();
    expect(result).toMatchObject({ found: true, checked: true, error: null });
    expect((document.querySelector("#xiaopeng-privacy") as HTMLInputElement).checked).toBe(true);
  });

  it("does not check a broader Xiaopeng agreement text", async () => {
    document.body.innerHTML = html`
      <label data-top="40" data-left="40" data-width="420" data-height="32">
        <input id="broader-consent" type="checkbox"
          data-top="44" data-left="44" data-width="18" data-height="18" />
        <span data-top="40" data-left="70" data-width="340" data-height="24">我已阅读并同意隐私政策和用户授权条款</span>
      </label>
    `;

    const result = await ensureXiaopengPrivacyConsent();
    expect(result).toMatchObject({ found: false, checked: false, error: null });
    expect((document.querySelector("#broader-consent") as HTMLInputElement).checked).toBe(false);
  });

  it("models Moka's single first-work month as distinct year and month controls", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="700" data-height="300">
        <div class="form-item" data-top="40" data-left="40" data-width="500" data-height="90">
          <div data-top="40" data-left="40" data-width="140" data-height="24">开始工作年月 *</div>
          <input id="first-work-year" placeholder="年" required data-top="74" data-left="40" data-width="180" data-height="32" />
          <input id="first-work-month" placeholder="月" required data-top="74" data-left="240" data-width="180" data-height="32" />
        </div>
        <button type="button" data-top="180" data-left="40" data-width="120" data-height="36">预览并提交</button>
      </form>
    `;

    const observed = observeApplicationPage();
    const workStart = observed.fields.filter((field) => /开始工作年月/.test(field.label));
    expect(workStart).toHaveLength(2);
    expect(workStart.map((field) => field.label)).toEqual(expect.arrayContaining([
      expect.stringMatching(/开始工作年月 · 年$/),
      expect.stringMatching(/开始工作年月 · 月$/)
    ]));
    expect(new Set(workStart.map((field) => field.stableFieldKey)).size).toBe(2);
    expect(workStart.every((field) => field.sectionKey === "basic")).toBe(true);
  });

  it("reads Xiaopeng committed education dates when Feishu leaves native inputs empty", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="720">
        <section class="form-section" data-top="40" data-left="40" data-width="680" data-height="560">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">教育经历</h2>
          ${[0, 1].map((index) => html`
            <div class="educationItem" data-index="${index}"
              data-top="${90 + index * 210}" data-left="40" data-width="620" data-height="180">
              <label for="education-${index}-start" data-top="${100 + index * 210}"
                data-left="40" data-width="100" data-height="24">开始时间 *</label>
              <label for="education-${index}-end" data-top="${100 + index * 210}"
                data-left="330" data-width="100" data-height="24">结束时间 *</label>
              <div class="atsx-date-picker atsx-date-picker-period-month"
                data-top="${134 + index * 210}" data-left="40" data-width="560" data-height="40">
                <div class="atsx-date-picker-period-month-label"
                  data-top="${134 + index * 210}" data-left="40" data-width="260" data-height="40">
                  <span class="atsx-date-picker-period-month-label-value">${index === 0 ? "2018-09" : "2020-09"}</span>
                </div>
                <input id="education-${index}-start" required aria-label="教育经历开始时间"
                  data-top="${138 + index * 210}" data-left="40" data-width="260" data-height="32" />
                <span class="atsx-date-picker-period-line"></span>
                <div class="atsx-date-picker-period-month-label"
                  data-top="${134 + index * 210}" data-left="330" data-width="260" data-height="40">
                  <span class="atsx-date-picker-period-month-label-value">${index === 0 ? "2020-06" : "2023-06"}</span>
                </div>
                <input id="education-${index}-end" required aria-label="教育经历结束时间"
                  data-top="${138 + index * 210}" data-left="330" data-width="260" data-height="32" />
              </div>
            </div>
          `).join("")}
          <button type="button" data-top="620" data-left="280" data-width="140" data-height="40">预览并提交</button>
        </section>
      </form>
    `;

    const observed = observeApplicationPage();
    const educationDates = observed.fields.filter((field) =>
      field.sectionKey === "education" && /开始时间|结束时间/.test(field.label)
    );
    expect(educationDates).toHaveLength(4);
    expect(educationDates.map((field) => field.currentValue)).toEqual([
      "2018-09", "2020-06", "2020-09", "2023-06"
    ]);
    expect(educationDates.every((field) => field.required && field.currentValue)).toBe(true);
    expect(visionFormReadyForFinalReview(observed, [])).toBe(true);
  });

  it("re-observes rebuilt year and month controls instead of reusing ordinal field ids", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="700" data-height="320">
        <div id="identity-slot" data-top="30" data-left="40" data-width="400" data-height="40"></div>
        <div id="work-start" class="form-item" data-top="80" data-left="40" data-width="500" data-height="90">
          <div data-top="80" data-left="40" data-width="140" data-height="24">开始工作年月 *</div>
          <input id="first-work-year" placeholder="年" required data-top="114" data-left="40" data-width="180" data-height="32" />
          <input id="first-work-month" placeholder="月" required data-top="114" data-left="240" data-width="180" data-height="32" />
        </div>
      </form>
    `;
    const initial = observeApplicationPage();
    const initialYear = initial.fields.find((field) => /开始工作年月 · 年$/.test(field.label))!;
    const initialMonth = initial.fields.find((field) => /开始工作年月 · 月$/.test(field.label))!;

    document.querySelector("#identity-slot")!.innerHTML = html`
      <label for="rebuilt-email">邮箱</label>
      <input id="rebuilt-email" value="validation@example.com" data-top="34" data-left="40" data-width="200" data-height="28" />
    `;
    const workStart = document.querySelector("#work-start")!;
    workStart.innerHTML = html`
      <div data-top="80" data-left="40" data-width="140" data-height="24">开始工作年月 *</div>
      <input id="rebuilt-work-year" placeholder="年" required data-top="114" data-left="40" data-width="180" data-height="32" />
      <input id="rebuilt-work-month" placeholder="月" required data-top="114" data-left="240" data-width="180" data-height="32" />
    `;

    let rebuilt = observeApplicationPage();
    const rebuiltYear = rebuilt.fields.find((field) => /开始工作年月 · 年$/.test(field.label))!;
    expect(rebuiltYear.fieldId).not.toBe(initialYear.fieldId);
    expect(rebuiltYear.stableFieldKey).toBe(initialYear.stableFieldKey);
    expect(await fillApplicationPage([
      instructionFor(rebuiltYear, "candidate.basic.firstWorkStartYear", "2021")
    ])).toEqual([expect.objectContaining({ success: true, actual: "2021" })]);

    const monthNode = document.querySelector<HTMLInputElement>("#rebuilt-work-month")!;
    monthNode.replaceWith(monthNode.cloneNode(true));
    rebuilt = observeApplicationPage();
    const rebuiltMonth = rebuilt.fields.find((field) => /开始工作年月 · 月$/.test(field.label))!;
    expect(rebuiltMonth.stableFieldKey).toBe(initialMonth.stableFieldKey);
    expect(await fillApplicationPage([
      instructionFor(rebuiltMonth, "candidate.basic.firstWorkStartMonth", "7")
    ])).toEqual([expect.objectContaining({ success: true, actual: "7" })]);
  });

  it("does not accept a degree search input value as a committed selection", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="700" data-height="260">
        <div class="form-item" data-top="60" data-left="40" data-width="320" data-height="100">
          <div data-top="60" data-left="40" data-width="100" data-height="24">最高学历 *</div>
          <div class="moka-select-shell" data-top="92" data-left="40" data-width="260" data-height="40">
            <span class="display-value" data-top="100" data-left="50" data-width="80" data-height="24">请选择</span>
            <input id="degree-search-only" placeholder="请选择" data-top="98" data-left="50" data-width="180" data-height="28" />
          </div>
        </div>
        <div class="sd-Menu-content" data-top="140" data-left="40" data-width="260" data-height="60">
          <div class="sd-Menu-content-item-0" data-top="146" data-left="50" data-width="220" data-height="28">本科</div>
        </div>
      </form>
    `;
    const degree = findField(/最高学历/);
    const result = await fillApplicationPage([
      instructionFor(degree, "candidate.basic.highestDegree", "本科")
    ]);
    expect(result).toEqual([
      expect.objectContaining({ success: false, driverFailureCode: "unsupported_required_control" })
    ]);
    const after = observeApplicationPage().fields.find((field) => field.stableFieldKey === degree.stableFieldKey);
    expect(after?.currentValue).toBe("");
  });

  it("keeps adjacent Moka email and degree controls semantically separate", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="300">
        <section data-top="40" data-left="40" data-width="680" data-height="180">
          <h2 data-top="40" data-left="40" data-width="100" data-height="28">申请信息</h2>
          <div class="moka-field email-cell" data-top="90" data-left="40" data-width="300" data-height="90">
            <span class="field-label" data-top="90" data-left="40" data-width="90" data-height="24">个人邮箱</span>
            <input id="moka-personal-email" value="validation@example.com" data-top="122" data-left="40" data-width="260" data-height="36" />
          </div>
          <div class="moka-field degree-cell" data-top="90" data-left="380" data-width="300" data-height="90">
            <span class="field-label" data-top="90" data-left="380" data-width="90" data-height="24">最高学历</span>
            <div class="sd-Select-selector" data-top="122" data-left="380" data-width="260" data-height="36">
              <span class="sd-Select-value" data-top="128" data-left="392" data-width="80" data-height="24">本科</span>
              <input id="moka-degree-input" placeholder="请选择" readonly data-top="124" data-left="392" data-width="180" data-height="30" />
            </div>
          </div>
        </section>
      </form>
    `;

    const observed = observeApplicationPage();
    const email = observed.fields.find((field) => /个人邮箱|邮箱/.test(field.label));
    const degree = observed.fields.find((field) => /最高学历/.test(field.label));
    expect(email).toMatchObject({
      stableFieldKey: expect.stringMatching(/^basic\.email\.native/),
      currentValue: "validation@example.com"
    });
    expect(degree).toMatchObject({
      stableFieldKey: expect.stringMatching(/^education\.highest_degree\.combobox/),
      currentValue: "本科",
      controlKind: "combobox"
    });
    expect(email?.fieldId).not.toBe(degree?.fieldId);
    expect(email?.selector).not.toBe(degree?.selector);
  });

  it("keeps an adjacent Moka referral code separate from the preferred city", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="820" data-height="320">
        <section class="apply-block-KRDT" data-top="40" data-left="40" data-width="740" data-height="220">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">申请信息</h2>
          <div class="apply-fields-Bzc" data-top="90" data-left="40" data-width="700" data-height="100">
            <div class="apply-field-Q2 Select-field" data-top="90" data-left="40" data-width="300" data-height="82">
              <div class="title-city" data-top="90" data-left="40" data-width="120" data-height="24">
                <span data-top="90" data-left="40" data-width="120" data-height="24">意向工作城市</span>
              </div>
              <div class="ctrl-city" data-top="122" data-left="40" data-width="280" data-height="38">
                <label class="sd-Input-container sd-Select-container" data-top="122" data-left="40" data-width="280" data-height="38">
                  <input id="preferred-city" placeholder="选择意向工作城市"
                    data-top="122" data-left="40" data-width="280" data-height="38" />
                </label>
              </div>
            </div>
            <div class="apply-field-Q2 string_info" data-top="90" data-left="400" data-width="300" data-height="82">
              <div class="title-referral" data-top="90" data-left="400" data-width="80" data-height="24">
                <span data-top="90" data-left="400" data-width="80" data-height="24">推荐码</span>
              </div>
              <div class="ctrl-referral" data-top="122" data-left="400" data-width="280" data-height="38">
                <label class="sd-Input-container string_info" data-top="122" data-left="400" data-width="280" data-height="38">
                  <input id="referral-code" placeholder="推荐码" autocomplete="new_password"
                    data-top="122" data-left="400" data-width="280" data-height="38" />
                </label>
              </div>
            </div>
          </div>
        </section>
      </form>
    `;

    const observed = observeApplicationPage();
    const city = observed.fields.find((field) => field.domHints?.placeholder === "选择意向工作城市")!;
    const referral = observed.fields.find((field) => field.domHints?.placeholder === "推荐码")!;
    const referralInput = document.querySelector<HTMLInputElement>("#referral-code")!;
    let inputEvents = 0;
    let changeEvents = 0;
    referralInput.addEventListener("input", () => { inputEvents += 1; });
    referralInput.addEventListener("change", () => { changeEvents += 1; });

    expect(city).toMatchObject({
      label: expect.stringMatching(/意向工作城市/),
      stableFieldKey: expect.stringMatching(/preferred_city/),
      controlKind: "combobox"
    });
    expect(referral).toMatchObject({
      label: expect.stringMatching(/推荐码/),
      stableFieldKey: "other.referral.native",
      currentValue: ""
    });

    const blockedCityWrite = await fillApplicationPage([
      instructionFor(referral, "job.answers.preferredCity", "深圳市")
    ]);
    expect(blockedCityWrite).toEqual([
      expect.objectContaining({ success: false, driverFailureCode: "unsupported_required_control" })
    ]);
    expect(referralInput.value).toBe("");
    expect(inputEvents).toBe(0);
    expect(changeEvents).toBe(0);

    const allowedReferralWrite = await fillApplicationPage([
      instructionFor(referral, "job.requiredField.field:referral-code", "REF-123")
    ]);
    expect(allowedReferralWrite).toEqual([
      expect.objectContaining({ success: true, actual: "REF-123" })
    ]);
  });

  it("fills and reads back the second required Moka email independently after a rebuild", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="320">
        <section class="form-section" data-top="40" data-left="40" data-width="680" data-height="220">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">申请信息</h2>
          <div class="form-item" data-top="90" data-left="40" data-width="280" data-height="80">
            <span class="field-label" data-top="90" data-left="40" data-width="80" data-height="24">邮箱 *</span>
            <input id="parsed-email" required value="validation@example.com" data-top="122" data-left="40" data-width="240" data-height="36" />
          </div>
          <div class="form-item" data-top="90" data-left="360" data-width="280" data-height="80">
            <span class="field-label" data-top="90" data-left="360" data-width="100" data-height="24">个人邮箱 *</span>
            <input id="personal-email" required value="" data-top="122" data-left="360" data-width="240" data-height="36" />
          </div>
        </section>
      </form>
    `;

    const observed = observeApplicationPage();
    const emails = observed.fields.filter((field) => /^basic\.email\.native#\d+$/.test(field.stableFieldKey ?? ""));
    expect(emails).toHaveLength(2);
    expect(emails.map((field) => field.required)).toEqual([true, true]);
    expect(emails.map((field) => field.currentValue)).toEqual(["validation@example.com", ""]);

    const second = emails.find((field) => field.stableFieldKey?.endsWith("#1"))!;
    const personalEmail = document.querySelector<HTMLInputElement>("#personal-email")!;
    personalEmail.addEventListener("focus", () => {
      // Reproduce Moka's controlled input: focusing restores the React-owned
      // blank value. Writing before focus would therefore be cleared.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(personalEmail, "");
    });
    personalEmail.setAttribute("id", "personal-email-rebuilt");
    const result = await fillApplicationPage([
      instructionFor(second, "candidate.basic.email", "validation@example.com")
    ]);
    expect(result).toEqual([expect.objectContaining({ success: true })]);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect((document.querySelector("#parsed-email") as HTMLInputElement).value).toBe("validation@example.com");
    expect((document.querySelector("#personal-email-rebuilt") as HTMLInputElement).value).toBe("validation@example.com");

    const after = observeApplicationPage().fields
      .filter((field) => /^basic\.email\.native#\d+$/.test(field.stableFieldKey ?? ""));
    expect(after.map((field) => field.currentValue)).toEqual([
      "validation@example.com",
      "validation@example.com"
    ]);
  });

  it("does not infer an optional personal email as required", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="320">
        <section class="form-section" data-top="40" data-left="40" data-width="680" data-height="220">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">申请信息</h2>
          <div class="form-item" data-top="90" data-left="40" data-width="280" data-height="80">
            <span class="field-label" data-top="90" data-left="40" data-width="80" data-height="24">邮箱 *</span>
            <input id="required-email" value="validation@example.com" data-top="122" data-left="40" data-width="240" data-height="36" />
          </div>
          <div class="form-item" data-top="90" data-left="360" data-width="280" data-height="80">
            <span class="field-label" data-top="90" data-left="360" data-width="100" data-height="24">个人邮箱</span>
            <input id="optional-personal-email" value="" data-top="122" data-left="360" data-width="240" data-height="36" />
          </div>
        </section>
      </form>
    `;

    const emails = observeApplicationPage().fields.filter((field) => /邮箱/.test(field.label));
    expect(emails).toEqual([
      expect.objectContaining({ label: expect.stringMatching(/^申请信息 · 邮箱/), required: true }),
      expect.objectContaining({ label: expect.stringMatching(/个人邮箱/), required: false })
    ]);
  });

  it("keeps a Moka image upload optional and recognizes only resumeKey as the required resume", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="360">
        <section class="upload-section" data-top="40" data-left="40" data-width="680" data-height="260">
          <h2 data-top="40" data-left="40" data-width="80" data-height="28">上传</h2>
          <div class="upload-item" data-top="90" data-left="40" data-width="280" data-height="90">
            <span data-top="90" data-left="40" data-width="100" data-height="24">上传简历 *</span>
            <input id="resumeKey" name="resumeKey" type="file" accept=".pdf,.doc,.docx" data-top="122" data-left="40" data-width="240" data-height="36" />
          </div>
          <div class="upload-item" data-top="90" data-left="360" data-width="280" data-height="90">
            <span data-top="90" data-left="360" data-width="100" data-height="24">上传照片</span>
            <input id="avatar-file" name="avatar" type="file" accept="image/jpeg,image/png" data-top="122" data-left="360" data-width="240" data-height="36" />
          </div>
        </section>
      </form>
    `;

    const files = observeApplicationPage().fields.filter((field) => field.type === "file");
    expect(files).toEqual([
      expect.objectContaining({
        label: expect.stringMatching(/简历/),
        stableFieldKey: expect.stringMatching(/resume_file/),
        required: true
      }),
      expect.objectContaining({
        label: expect.stringMatching(/证件照/),
        stableFieldKey: expect.stringMatching(/identity_photo/),
        required: false
      })
    ]);
  });

  it("keeps Moka's mixed-media multiple upload separate from the required resume", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="460">
        <section class="upload-section" data-top="40" data-left="40" data-width="680" data-height="360">
          <h2 data-top="40" data-left="40" data-width="80" data-height="28">上传</h2>
          <div class="upload-item" data-top="90" data-left="40" data-width="280" data-height="90">
            <span data-top="90" data-left="40" data-width="100" data-height="24">上传简历 *</span>
            <input id="resumeKey" name="resumeKey" type="file" accept=".pdf,.doc,.docx"
              data-top="122" data-left="40" data-width="240" data-height="36" />
          </div>
          <div class="upload-item" data-top="190" data-left="40" data-width="280" data-height="90">
            <span data-top="190" data-left="40" data-width="100" data-height="24">上传附件</span>
            <input type="file" multiple accept="video/*,audio/*,image/*,.pdf,.doc,.docx"
              data-top="222" data-left="40" data-width="240" data-height="36" />
          </div>
          <div class="upload-item" data-top="290" data-left="40" data-width="280" data-height="90">
            <span data-top="290" data-left="40" data-width="100" data-height="24">上传照片</span>
            <input id="portrait" name="上传照片" type="file" accept="image/jpeg,image/png"
              data-top="322" data-left="40" data-width="240" data-height="36" />
          </div>
        </section>
      </form>
    `;

    const files = observeApplicationPage().fields.filter((field) => field.type === "file");
    expect(files.map((field) => ({
      label: field.label,
      stableFieldKey: field.stableFieldKey,
      required: field.required
    }))).toEqual([
      { label: "简历", stableFieldKey: "attachments.resume_file.file", required: true },
      { label: "附件", stableFieldKey: "attachments.attachment.file", required: false },
      { label: "证件照", stableFieldKey: "attachments.identity_photo.file", required: false }
    ]);
    expect(files[1]!.stableFieldKey).not.toMatch(/resume_file/);
    expect(files.filter((field) => field.stableFieldKey?.startsWith("attachments.resume_file.file"))).toHaveLength(1);
  });

  it("reads Moka CSS asterisk markers as explicit required evidence without marking the phone prefix", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="560">
        <div class="apply-field-Q2 Select-field" data-top="40" data-left="40" data-width="300" data-height="76">
          <span class="field-title" data-top="40" data-left="40" data-width="120" data-height="24">意向工作城市</span>
          <span class="required-asterisk-av7" data-top="40" data-left="165" data-width="8" data-height="24"></span>
          <input placeholder="选择意向工作城市" data-top="72" data-left="40" data-width="260" data-height="36" />
        </div>
        <div class="apply-field-Q2 string_info" data-top="130" data-left="40" data-width="300" data-height="76">
          <span class="field-title" data-top="130" data-left="40" data-width="80" data-height="24">姓名</span>
          <span class="required-asterisk-av7" data-top="130" data-left="125" data-width="8" data-height="24"></span>
          <input placeholder="姓名" data-top="162" data-left="40" data-width="260" data-height="36" />
        </div>
        <div class="apply-field-Q2 string_info" data-top="220" data-left="40" data-width="420" data-height="76">
          <span class="field-title" data-top="220" data-left="40" data-width="100" data-height="24">手机号码</span>
          <span class="required-asterisk-av7" data-top="220" data-left="145" data-width="8" data-height="24"></span>
          <div class="code-prefix" data-top="252" data-left="40" data-width="90" data-height="36">
            <input value="+86" data-top="252" data-left="40" data-width="90" data-height="36" />
          </div>
          <input placeholder="请输入手机号" data-top="252" data-left="145" data-width="240" data-height="36" />
        </div>
        <div class="apply-field-Q2 string_info" data-top="310" data-left="40" data-width="300" data-height="76">
          <span class="field-title" data-top="310" data-left="40" data-width="100" data-height="24">个人邮箱</span>
          <input placeholder="个人邮箱" data-top="342" data-left="40" data-width="260" data-height="36" />
        </div>
        <div class="apply-field-Q2 confirm_info" data-top="400" data-left="40" data-width="520" data-height="76">
          <span class="field-title" data-top="400" data-left="40" data-width="100" data-height="24">确认声明</span>
          <span class="required-asterisk-av7" data-top="400" data-left="145" data-width="8" data-height="24"></span>
          <label data-top="432" data-left="40" data-width="420" data-height="32">
            <input type="checkbox" data-top="438" data-left="40" data-width="18" data-height="18" />
            本人确保以上所有信息真实有效。
          </label>
        </div>
      </form>
    `;

    const fields = observeApplicationPage().fields;
    expect(fields.find((field) => /意向工作城市/.test(field.label))).toMatchObject({
      required: true,
      requiredSource: "explicit"
    });
    expect(fields.find((field) => /姓名/.test(field.label))).toMatchObject({
      required: true,
      requiredSource: "explicit"
    });
    const phoneFields = fields.filter((field) => /手机号码|手机号/.test(field.label));
    expect(phoneFields).toHaveLength(2);
    expect(phoneFields.find((field) => field.domHints?.placeholder === "请输入手机号")).toMatchObject({
      required: true,
      requiredSource: "explicit"
    });
    expect(phoneFields.find((field) => field.domHints?.placeholder !== "请输入手机号")).toMatchObject({
      required: false
    });
    expect(fields.find((field) => /个人邮箱/.test(field.label))).toMatchObject({ required: false });
    expect(fields.find((field) => /本人确保以上所有信息真实有效/.test(field.label))).toMatchObject({
      required: true,
      requiredSource: "explicit"
    });
  });

  it("separates the committed calling code from its editable query and the adjacent phone number", () => {
    vi.stubGlobal("location", new URL(
      "https://app.mokahr.com/campus-recruitment/yinhetongyong/165930#/job/test/apply"
    ));
    try {
      document.body.innerHTML = html`<form>
        <div class="apply-field-phone string_info-test">
          <div class="title-phone">手机号码</div><span class="required-asterisk-test"></span>
          <div class="code-phone"><div class="sd-Dropdown-container-test">
            <label class="sd-Input-container-test sd-Select-container-test">
              <span class="sd-Input-display-value-test"><span>+86</span></span>
              <input id="calling-code" type="text" value="1" autocomplete="nope" maxlength="-1">
              <span class="sd-Select-addon-test"></span>
            </label>
          </div></div>
          <div class="number-phone"><label class="sd-Input-container-test">
            <input id="phone-number" type="text" placeholder="请输入手机号" maxlength="255" value="">
          </label></div>
        </div>
      </form>`;

      const fields = observeApplicationPage().fields;
      const code = fields.find(field => field.selector === "#calling-code")!;
      const number = fields.find(field => field.selector === "#phone-number")!;
      expect(code).toMatchObject({
        stableFieldKey: "basic.phone.combobox",
        label: "手机号码",
        type: "combobox",
        required: false,
        currentValue: "+86",
        compound: { kind: "phone_number", role: "calling_code", queryValue: "1" }
      });
      expect(number).toMatchObject({
        stableFieldKey: "basic.phone.native",
        label: "手机号码",
        required: true,
        currentValue: "",
        compound: { kind: "phone_number", role: "number" }
      });
      expect(code.compound?.groupKey).toBe(number.compound?.groupKey);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["手机号码", "<input id='plain-phone' placeholder='请输入手机号'><input id='plain-code' value='+86'>"],
    ["邮政编码", "<div class='code-postcode'><div class='sd-Dropdown-container-test'><label class='sd-Select-container-test'><span class='sd-Input-display-value-test'>100000</span><input id='postcode-choice'></label></div></div><div class='number-postcode'><input id='postcode' placeholder='邮政编码'></div>"],
    ["普通数字", "<div class='code-number'><div class='sd-Dropdown-container-test'><label class='sd-Select-container-test'><span class='sd-Input-display-value-test'>1</span><input id='numeric-choice'></label></div></div><div class='number-number'><input id='numeric-value' placeholder='数量'></div>"]
  ])("does not mark an unproven two-control group as a phone calling-code compound: %s", (title, controls) => {
    vi.stubGlobal("location", new URL(
      "https://app.mokahr.com/campus-recruitment/yinhetongyong/165930#/job/test/apply"
    ));
    try {
      document.body.innerHTML = `<form><div class="apply-field-negative"><div class="title-negative">${title}</div>${controls}</div></form>`;
      expect(observeApplicationPage().fields.some(field => field.compound?.kind === "phone_number")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["紧急联系人电话", "third_party", "请输入联系人手机号"],
    ["推荐人手机号", "third_party", "请输入联系人手机号"],
    ["其他联系电话", "basic", "请输入电话号码"]
  ])("marks the same proven calling-code structure for another person's field: %s", (title, sectionKey, placeholder) => {
    vi.stubGlobal("location", new URL(
      "https://app.mokahr.com/campus-recruitment/yinhetongyong/165930#/job/test/apply"
    ));
    try {
      document.body.innerHTML = html`<form><section data-top="20" data-left="20">
        <div class="apply-field-emergency string_info-test" data-top="70" data-left="40">
          <div class="title-emergency" data-top="70" data-left="40">${title}</div>
          <div class="code-emergency"><div class="sd-Dropdown-container-test">
            <label class="sd-Select-container-test"><span class="sd-Input-display-value-test">+86</span>
              <input id="emergency-code" class="sd-Input-input-test" data-top="105" data-left="40">
            </label>
          </div></div>
          <div class="number-emergency"><input id="emergency-phone" placeholder="${placeholder}"
            data-top="105" data-left="145"></div>
        </div>
      </section></form>`;
      const fields = observeApplicationPage().fields;
      const code = fields.find(field => field.selector === "#emergency-code")!;
      const number = fields.find(field => field.selector === "#emergency-phone")!;
      expect(code).toMatchObject({ label: title, sectionKey,
        compound: { kind: "phone_number", role: "calling_code" } });
      expect(number).toMatchObject({ label: title, sectionKey,
        compound: { kind: "phone_number", role: "number" } });
      expect(code.compound?.groupKey).toBe(number.compound?.groupKey);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("propagates a Moka required marker to four year-month study-time controls", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="900" data-height="520">
        <section class="form-section" data-top="40" data-left="40" data-width="820" data-height="420">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">教育背景</h2>
          <div class="apply-field-Q2 Select-field" data-top="90" data-left="40" data-width="760" data-height="110">
            <span class="field-title" data-top="90" data-left="40" data-width="120" data-height="24">就读时间</span>
            <span class="required-asterisk-av7" data-top="90" data-left="130" data-width="8" data-height="24"></span>
            <input placeholder="年 / Year" data-top="124" data-left="40" data-width="150" data-height="36" />
            <input placeholder="月 / Month" data-top="124" data-left="210" data-width="150" data-height="36" />
            <input placeholder="年 / Year" data-top="124" data-left="390" data-width="150" data-height="36" />
            <input placeholder="月 / Month" data-top="124" data-left="560" data-width="150" data-height="36" />
          </div>
        </section>
      </form>
    `;

    const dates = observeApplicationPage().fields.filter((field) =>
      field.temporal?.groupKey.includes("就读时间")
    );
    expect(dates).toHaveLength(4);
    expect(dates.map((field) => field.label)).toEqual([
      "教育背景 · 开始时间 · 年",
      "教育背景 · 开始时间 · 月",
      "教育背景 · 结束时间 · 年",
      "教育背景 · 结束时间 · 月"
    ]);
    expect(dates.map((field) => field.temporal)).toEqual([
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "month" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "month" })
    ]);
    expect(dates.every((field) => field.required && field.requiredSource === "explicit")).toBe(true);
    expect(new Set(dates.map((field) => field.stableFieldKey)).size).toBe(4);
  });

  it("prefers Moka's enclosing four-control date range over an inner year-month pair", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="900" data-height="520">
        <section class="form-section" data-top="40" data-left="40" data-width="820" data-height="420">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">教育背景</h2>
          <div class="apply-field-Q2 date_info" data-top="90" data-left="40" data-width="760" data-height="110">
            <span class="field-title" data-top="90" data-left="40" data-width="120" data-height="24">就读时间</span>
            <span class="required-asterisk-av7" data-top="90" data-left="130" data-width="8" data-height="24"></span>
            <div><input placeholder="年" data-top="124" data-left="40" data-width="150" data-height="36" /><input placeholder="月" data-top="124" data-left="210" data-width="150" data-height="36" /></div>
            <div><input placeholder="年" data-top="124" data-left="390" data-width="150" data-height="36" /><input placeholder="月" data-top="124" data-left="560" data-width="150" data-height="36" /></div>
          </div>
        </section>
      </form>
    `;

    const dates = observeApplicationPage().fields.filter((field) =>
      field.temporal?.groupKey.includes("就读时间")
    );
    expect(dates.map((field) => field.label)).toEqual([
      "教育背景 · 开始时间 · 年",
      "教育背景 · 开始时间 · 月",
      "教育背景 · 结束时间 · 年",
      "教育背景 · 结束时间 · 月"
    ]);
    expect(dates.map((field) => field.temporal)).toEqual([
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "month" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "month" })
    ]);
  });

  it("keeps a four-control Moka study range after the parsed start pair clears its placeholders", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="900" data-height="520">
        <section class="form-section" data-top="40" data-left="40" data-width="820" data-height="420">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">教育背景</h2>
          <div class="apply-field-Q2 date_info" data-top="90" data-left="40" data-width="760" data-height="110">
            <span class="field-title" data-top="90" data-left="40" data-width="120" data-height="24">就读时间</span>
            <span class="required-asterisk-av7" data-top="90" data-left="130" data-width="8" data-height="24"></span>
            <label class="sd-Select-container" data-top="124" data-left="40" data-width="150" data-height="36">
              <span class="sd-Input-display-value">2023</span>
              <input role="combobox" placeholder="" data-top="124" data-left="40" data-width="150" data-height="36" />
            </label>
            <label class="sd-Select-container" data-top="124" data-left="210" data-width="150" data-height="36">
              <span class="sd-Input-display-value">9</span>
              <input role="combobox" placeholder="" data-top="124" data-left="210" data-width="150" data-height="36" />
            </label>
            <label class="sd-Select-container" data-top="124" data-left="390" data-width="150" data-height="36">
              <input role="combobox" placeholder="年" data-top="124" data-left="390" data-width="150" data-height="36" />
            </label>
            <label class="sd-Select-container" data-top="124" data-left="560" data-width="150" data-height="36">
              <input role="combobox" placeholder="月" data-top="124" data-left="560" data-width="150" data-height="36" />
            </label>
          </div>
        </section>
      </form>
    `;

    const dates = observeApplicationPage().fields.filter((field) =>
      field.temporal?.groupKey.includes("就读时间")
    );
    expect(dates).toHaveLength(4);
    expect(dates.map((field) => field.label)).toEqual([
      "教育背景 · 开始时间 · 年",
      "教育背景 · 开始时间 · 月",
      "教育背景 · 结束时间 · 年",
      "教育背景 · 结束时间 · 月"
    ]);
    expect(dates.map((field) => field.temporal)).toEqual([
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "month" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "month" })
    ]);
    expect(new Set(dates.map((field) => field.stableFieldKey)).size).toBe(4);
    const actions = deterministicKnownFactActions(observeApplicationPage(), {
      "resume.education.0.startDate": "2023-09",
      "resume.education.0.endDate": "2026-06"
    });
    expect(actions).toEqual([
      expect.objectContaining({
        semanticKey: "resume.education.0.endDate",
        value: "2026",
        fieldId: dates[2]!.fieldId
      }),
      expect.objectContaining({
        semanticKey: "resume.education.0.endDate",
        value: "6",
        fieldId: dates[3]!.fieldId
      })
    ]);
  });

  it("keeps all four Moka study controls after React clears every placeholder", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="900" data-height="520">
        <section class="form-section" data-top="40" data-left="40" data-width="820" data-height="420">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">教育背景</h2>
          <div class="apply-field-Q2 date_info" data-top="90" data-left="40" data-width="760" data-height="110">
            <span class="field-title" data-top="90" data-left="40" data-width="120" data-height="24">就读时间</span>
            <span class="required-asterisk-av7" data-top="90" data-left="130" data-width="8" data-height="24"></span>
            <div><div><div><div><div><div>
              <label class="sd-Select-container" data-top="124" data-left="40" data-width="150" data-height="36">
                <input role="combobox" placeholder="" data-top="124" data-left="40" data-width="150" data-height="36" />
              </label>
              <label class="sd-Select-container" data-top="124" data-left="210" data-width="150" data-height="36">
                <input role="combobox" placeholder="" data-top="124" data-left="210" data-width="150" data-height="36" />
              </label>
              <label class="sd-Select-container" data-top="124" data-left="390" data-width="150" data-height="36">
                <input role="combobox" placeholder="" data-top="124" data-left="390" data-width="150" data-height="36" />
              </label>
              <label class="sd-Select-container" data-top="124" data-left="560" data-width="150" data-height="36">
                <input role="combobox" placeholder="" data-top="124" data-left="560" data-width="150" data-height="36" />
              </label>
            </div></div></div></div></div></div>
          </div>
        </section>
      </form>
    `;

    const dates = observeApplicationPage().fields.filter((field) =>
      field.temporal?.groupKey.includes("就读时间")
    );
    expect(dates).toHaveLength(4);
    expect(dates.map((field) => field.temporal)).toEqual([
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "start", part: "month" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "year" }),
      expect.objectContaining({ layout: "year_month_range", edge: "end", part: "month" })
    ]);
  });

  it("binds a bilingual Moka project range error to all four date controls and ignores sidebar headings", () => {
    document.body.innerHTML = html`
      <aside class="resume-anchor-sidebar" data-top="20" data-left="20" data-width="180" data-height="500">
        <div data-top="80" data-left="40" data-width="120" data-height="28">实习经历</div>
        <div data-top="120" data-left="40" data-width="120" data-height="28">项目经历</div>
      </aside>
      <form data-top="20" data-left="220" data-width="860" data-height="620">
        <section class="form-section" data-top="40" data-left="240" data-width="800" data-height="420">
          <h2 data-top="40" data-left="240" data-width="220" data-height="28">项目经验 / Projects</h2>
          <div class="projectItem-card" data-index="0" data-top="82" data-left="240" data-width="760" data-height="220">
            <div class="apply-field-Q2 date_info" data-top="100" data-left="260" data-width="720" data-height="150">
              <span class="field-title" data-top="100" data-left="260" data-width="260" data-height="24">起止时间 / Start and end date</span>
              <span class="required-asterisk-av7" data-top="100" data-left="520" data-width="8" data-height="24"></span>
              <div class="range-controls" data-top="132" data-left="260" data-width="680" data-height="44">
                <label class="sd-Select-container"><span class="Input-display-value">2025</span><input value="2025" placeholder="年 / Year" /></label>
                <label class="sd-Select-container"><span class="Input-display-value">11</span><input value="11" placeholder="月 / Month" /></label>
                <label class="sd-Select-container"><span class="Input-display-value">2025</span><input value="2025" placeholder="年 / Year" /></label>
                <label class="sd-Select-container"><span class="Input-display-value">2</span><input value="2" placeholder="月 / Month" /></label>
              </div>
              <div class="field-error" data-top="190" data-left="260" data-width="300" data-height="24">开始时间不能大于结束时间</div>
            </div>
          </div>
        </section>
      </form>
    `;

    const observed = observeApplicationPage();
    const dates = observed.fields.filter((field) => field.sectionKey === "project" && field.temporal);
    expect(dates).toHaveLength(4);
    expect(dates.every((field) => field.label.startsWith("项目经验 / Projects ·"))).toBe(true);
    expect(dates.every((field) => field.groupIndex === 0)).toBe(true);
    expect(dates.every((field) => field.validationMessage === "开始时间不能大于结束时间")).toBe(true);
    expect(observed.validationMessages).toContain("开始时间不能大于结束时间");

    const actions = deterministicKnownFactActions({
      ...observed,
      // A closed/virtualized Moka date popup can expose only the committed
      // value. This partial list must not reject a different package date.
      fields: observed.fields.map((field) => field.temporal
        ? { ...field, options: [field.currentValue] }
        : field)
    }, {
      "resume.project.0.startDate": "2025-10",
      "resume.project.0.endDate": "2026-09"
    });
    expect(actions.map((action) => action.value)).toEqual(["10", "2026", "9"]);
    expect(actions.every((action) => dates.some((field) => field.fieldId === action.fieldId))).toBe(true);
  });

  it("does not borrow date semantics from an outer Moka section for ordinary personal fields", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="900" data-height="620">
        <section class="form-section" data-top="40" data-left="40" data-width="820" data-height="540">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">个人信息</h2>
          <div class="apply-field-Q2 Select-field" data-top="90" data-left="40" data-width="360" data-height="82">
            <div data-top="90" data-left="40" data-width="180" data-height="24">最高学历 / Highest degree</div>
            <label class="sd-Select-container" data-top="122" data-left="40" data-width="320" data-height="38">
              <input id="highest-degree" role="combobox" readonly placeholder="请选择 / Please select"
                data-top="122" data-left="40" data-width="320" data-height="38" />
            </label>
          </div>
          <div class="apply-field-Q2 string_info" data-top="190" data-left="40" data-width="360" data-height="82">
            <div data-top="190" data-left="40" data-width="240" data-height="24">最近毕业专业 / Latest major</div>
            <label class="sd-Select-container" data-top="222" data-left="40" data-width="320" data-height="38">
              <input id="latest-major" role="combobox" readonly placeholder="请输入最近毕业专业 / Enter major"
                data-top="222" data-left="40" data-width="320" data-height="38" />
            </label>
          </div>
          <div class="apply-field-Q2 date_info" data-top="300" data-left="40" data-width="620" data-height="110">
            <div data-top="300" data-left="40" data-width="160" data-height="24">毕业时间 / Graduation date</div>
            <div><div><div><div><div><div>
              <label class="sd-Select-container" data-top="334" data-left="40" data-width="180" data-height="38">
                <input id="graduation-year-cleared" role="combobox" readonly placeholder=""
                  data-top="334" data-left="40" data-width="180" data-height="38" />
              </label>
              <label class="sd-Select-container" data-top="334" data-left="250" data-width="180" data-height="38">
                <input id="graduation-month-cleared" role="combobox" readonly placeholder=""
                  data-top="334" data-left="250" data-width="180" data-height="38" />
              </label>
            </div></div></div></div></div></div>
          </div>
        </section>
      </form>
    `;

    const fields = observeApplicationPage().fields;
    const degree = fields.find((field) => field.selector === "#highest-degree");
    const major = fields.find((field) => field.selector === "#latest-major");
    const graduation = fields.filter((field) => field.temporal?.groupKey.includes("毕业时间"));

    expect(degree).toMatchObject({ temporal: null, stableFieldKey: expect.stringMatching(/highest_degree/) });
    expect(major).toMatchObject({ temporal: null, stableFieldKey: expect.stringMatching(/major/) });
    expect(graduation.map((field) => field.temporal)).toEqual([
      expect.objectContaining({ layout: "year_month", edge: "end", part: "year" }),
      expect.objectContaining({ layout: "year_month", edge: "end", part: "month" })
    ]);
  });

  it("models a two-control Moka graduation date as one required end year-month field", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="900" data-height="420">
        <section class="form-section" data-top="40" data-left="40" data-width="820" data-height="320">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">个人信息</h2>
          <div class="apply-field-Q2 Select-field" data-top="90" data-left="40" data-width="520" data-height="110">
            <span class="field-title" data-top="90" data-left="40" data-width="120" data-height="24">毕业时间</span>
            <span class="required-asterisk-av7" data-top="90" data-left="130" data-width="8" data-height="24"></span>
            <input placeholder="年 / Year" data-top="124" data-left="40" data-width="180" data-height="36" />
            <input placeholder="月 / Month" data-top="124" data-left="250" data-width="180" data-height="36" />
          </div>
        </section>
      </form>
    `;

    const dates = observeApplicationPage().fields.filter((field) => field.temporal);
    expect(dates).toHaveLength(2);
    expect(dates.map((field) => field.label)).toEqual([
      "个人信息 · 毕业时间 · 年",
      "个人信息 · 毕业时间 · 月"
    ]);
    expect(dates.map((field) => field.sectionKey)).toEqual(["basic", "basic"]);
    expect(dates.map((field) => field.stableFieldKey)).toEqual([
      "basic.graduation_date.native#0",
      "basic.graduation_date.native#1"
    ]);
    expect(dates.map((field) => field.temporal)).toEqual([
      expect.objectContaining({ layout: "year_month", edge: "end", part: "year" }),
      expect.objectContaining({ layout: "year_month", edge: "end", part: "month" })
    ]);
    expect(dates.every((field) => field.required && field.requiredSource === "explicit")).toBe(true);
    expect(deterministicKnownFactActions(observeApplicationPage(), {
      "resume.education.0.endDate": "2026-06"
    })).toEqual([
      expect.objectContaining({
        fieldId: dates[0]!.fieldId,
        semanticKey: "resume.education.0.endDate",
        value: "2026"
      }),
      expect.objectContaining({
        fieldId: dates[1]!.fieldId,
        semanticKey: "resume.education.0.endDate",
        value: "6"
      })
    ]);
  });

  it("keeps personal graduation and education-row end dates in separate Moka identities", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="900" data-height="700">
        <section class="form-section" data-top="40" data-left="40" data-width="820" data-height="220">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">个人信息</h2>
          <div class="apply-field-Q2 date_info" data-top="90" data-left="40" data-width="520" data-height="110">
            <span class="field-title" data-top="90" data-left="40" data-width="180" data-height="24">毕业时间（月）</span>
            <span class="required-asterisk-av7" data-top="90" data-left="225" data-width="8" data-height="24"></span>
            <label class="sd-Select-container" data-top="124" data-left="40" data-width="180" data-height="36">
              <input id="personal-graduation-year" role="combobox" placeholder="年" data-top="124" data-left="40" data-width="180" data-height="36" />
            </label>
            <label class="sd-Select-container" data-top="124" data-left="250" data-width="180" data-height="36">
              <input id="personal-graduation-month" role="combobox" placeholder="月" data-top="124" data-left="250" data-width="180" data-height="36" />
            </label>
          </div>
        </section>
        <section class="form-section" data-top="290" data-left="40" data-width="820" data-height="260">
          <h2 data-top="290" data-left="40" data-width="120" data-height="28">教育背景</h2>
          <div class="apply-field-Q2 date_info" data-top="340" data-left="40" data-width="760" data-height="110">
            <span class="field-title" data-top="340" data-left="40" data-width="120" data-height="24">就读时间</span>
            <span class="required-asterisk-av7" data-top="340" data-left="165" data-width="8" data-height="24"></span>
            <label class="sd-Select-container" data-top="374" data-left="40" data-width="150" data-height="36"><input role="combobox" placeholder="年" data-top="374" data-left="40" data-width="150" data-height="36" /></label>
            <label class="sd-Select-container" data-top="374" data-left="210" data-width="150" data-height="36"><input role="combobox" placeholder="月" data-top="374" data-left="210" data-width="150" data-height="36" /></label>
            <label class="sd-Select-container" data-top="374" data-left="390" data-width="150" data-height="36"><input id="education-end-year" role="combobox" placeholder="年" data-top="374" data-left="390" data-width="150" data-height="36" /></label>
            <label class="sd-Select-container" data-top="374" data-left="560" data-width="150" data-height="36"><input id="education-end-month" role="combobox" placeholder="月" data-top="374" data-left="560" data-width="150" data-height="36" /></label>
          </div>
        </section>
      </form>
    `;

    const fields = observeApplicationPage().fields;
    const personal = fields.filter((field) => /个人信息 · 毕业时间/.test(field.label));
    const educationEnd = fields.filter((field) => /教育背景 · 结束时间/.test(field.label));
    expect(personal).toHaveLength(2);
    expect(educationEnd).toHaveLength(2);
    expect(personal.every((field) => field.sectionKey === "basic" &&
      field.stableFieldKey.startsWith("basic.graduation_date."))).toBe(true);
    expect(educationEnd.every((field) => field.sectionKey === "education" &&
      field.stableFieldKey.startsWith("education.end_date."))).toBe(true);
    expect(new Set([...personal, ...educationEnd].map((field) => field.stableFieldKey)).size).toBe(4);

    for (const selector of ["#personal-graduation-year", "#personal-graduation-month", "#education-end-year", "#education-end-month"]) {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.placeholder = "";
      const display = document.createElement("span");
      display.className = "sd-Input-display-value";
      display.textContent = selector.endsWith("year") ? "2026" : "6";
      input.closest("label")!.prepend(display);
    }
    const rebuilt = observeApplicationPage().fields;
    expect(rebuilt.filter((field) => /个人信息 · 毕业时间/.test(field.label)).map((field) => field.stableFieldKey))
      .toEqual(personal.map((field) => field.stableFieldKey));
    expect(rebuilt.filter((field) => /教育背景 · 结束时间/.test(field.label)).map((field) => field.stableFieldKey))
      .toEqual(educationEnd.map((field) => field.stableFieldKey));
  });

  it("keeps a committed Moka select as a combobox after React clears its input placeholder", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="180">
        <div class="apply-field-Q2 Select-field" data-top="40" data-left="40" data-width="320" data-height="90">
          <span class="field-title" data-top="40" data-left="40" data-width="120" data-height="24">意向工作城市</span>
          <span class="required-asterisk-av7" data-top="40" data-left="165" data-width="8" data-height="24"></span>
          <label class="sd-Input-container sd-Select-container select" data-top="72" data-left="40" data-width="280" data-height="38">
            <span class="sd-Input-display-value"><span>北京市</span></span>
            <input class="sd-Input-input" placeholder="" value="" data-top="72" data-left="40" data-width="260" data-height="36" />
            <span class="sd-Select-addon"><span class="sd-Icon-iconcaretDown"></span></span>
          </label>
        </div>
      </form>
    `;

    expect(observeApplicationPage().fields.find((field) => /意向工作城市/.test(field.label))).toMatchObject({
      type: "combobox",
      controlKind: "combobox",
      currentValue: "北京市",
      required: true
    });
  });

  it("observes Moka 籍贯 as a dedicated required basic-information cascader", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="220">
        <section class="form-section" data-top="30" data-left="30" data-width="700" data-height="170">
          <h2 data-top="30" data-left="30" data-width="120" data-height="28">个人信息</h2>
          <div class="apply-field-Q2 Select-field" data-top="70" data-left="40" data-width="560" data-height="100">
            <span class="field-title" data-top="70" data-left="40" data-width="80" data-height="24">籍贯</span>
            <span class="required-asterisk-av7" data-top="70" data-left="90" data-width="8" data-height="24"></span>
            <label class="sd-Input-container sd-Dropdown-container native-place" data-top="102" data-left="40" data-width="540" data-height="38">
              <span class="sd-Input-display-value"><span>请输入籍贯</span></span>
              <input id="native-place" role="combobox" readonly placeholder="请输入籍贯" value=""
                data-top="102" data-left="40" data-width="520" data-height="36" />
            </label>
          </div>
        </section>
      </form>
    `;

    expect(observeApplicationPage().fields.find((field) => /籍贯/.test(field.label))).toMatchObject({
      stableFieldKey: "basic.native_place.combobox",
      sectionKey: "basic",
      type: "combobox",
      controlKind: "combobox",
      required: true,
      currentValue: ""
    });
  });

  it("does not type into a Moka combobox when the requested option is absent", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="240">
        <div class="apply-field-Q2 Select-field" data-top="40" data-left="40" data-width="320" data-height="120">
          <span class="field-title" data-top="40" data-left="40" data-width="120" data-height="24">意向工作城市</span>
          <span class="required-asterisk-av7" data-top="40" data-left="165" data-width="8" data-height="24"></span>
          <label class="sd-Input-container sd-Select-container select" data-top="72" data-left="40" data-width="280" data-height="38">
            <span class="sd-Input-display-value"><span id="city-display">请选择</span></span>
            <input id="city-input" role="combobox" placeholder="选择意向工作城市" value=""
              data-top="72" data-left="40" data-width="260" data-height="36" />
          </label>
          <div id="city-menu" class="sd-Menu-content" style="display:none" data-top="112" data-left="40" data-width="280" data-height="60">
            <div id="hangzhou-option" class="sd-Menu-content-item-city" data-top="116" data-left="44" data-width="260" data-height="32">杭州市</div>
          </div>
        </div>
      </form>
    `;
    const input = document.querySelector<HTMLInputElement>("#city-input")!;
    const menu = document.querySelector<HTMLElement>("#city-menu")!;
    let inputEvents = 0;
    let changeEvents = 0;
    input.addEventListener("click", () => { menu.style.display = "block"; });
    input.addEventListener("input", () => { inputEvents += 1; });
    input.addEventListener("change", () => { changeEvents += 1; });

    const observed = observeApplicationPage().fields.find((entry) => /意向工作城市/.test(entry.label));
    expect(observed?.type).toBe("combobox");
    const result = await fillApplicationPage([
      instructionFor(observed!, "job.answers.preferredCity", "上海市")
    ]);

    expect(result).toEqual([
      expect.objectContaining({ success: false, driverFailureCode: "unsupported_required_control" })
    ]);
    expect(input.value).toBe("");
    expect(inputEvents).toBe(0);
    expect(changeEvents).toBe(0);
  });

  it("does not type into an aria autocomplete when no visible option matches", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="220">
        <div class="form-item" data-top="40" data-left="40" data-width="320" data-height="120">
          <label for="choice-input" data-top="40" data-left="40" data-width="120" data-height="24">工作地点 *</label>
          <input id="choice-input" aria-autocomplete="list" aria-haspopup="listbox" placeholder="请选择"
            value="" data-top="72" data-left="40" data-width="260" data-height="36" />
          <div role="listbox" data-top="112" data-left="40" data-width="260" data-height="50">
            <div role="option" data-top="116" data-left="44" data-width="240" data-height="30">杭州</div>
          </div>
        </div>
      </form>
    `;
    const input = document.querySelector<HTMLInputElement>("#choice-input")!;
    let inputEvents = 0;
    let changeEvents = 0;
    input.addEventListener("input", () => { inputEvents += 1; });
    input.addEventListener("change", () => { changeEvents += 1; });
    const observed = observeApplicationPage().fields.find((entry) => /工作地点/.test(entry.label));
    expect(observed).toBeTruthy();

    const result = await fillApplicationPage([
      instructionFor(observed!, "job.answers.preferredCity", "上海")
    ]);

    expect(result).toEqual([
      expect.objectContaining({ success: false, driverFailureCode: "unsupported_required_control" })
    ]);
    expect(input.value).toBe("");
    expect(inputEvents).toBe(0);
    expect(changeEvents).toBe(0);
  });

  it("never expands a custom province from the native Driver", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="320">
        <div class="apply-field-Q2 Select-field" data-top="40" data-left="40" data-width="320" data-height="90">
          <span class="field-title" data-top="40" data-left="40" data-width="120" data-height="24">意向工作城市</span>
          <span class="required-asterisk-av7" data-top="40" data-left="165" data-width="8" data-height="24"></span>
          <label class="sd-Input-container sd-Select-container select" data-top="72" data-left="40" data-width="280" data-height="38">
            <span class="sd-Input-display-value"><span id="city-display">请选择</span></span>
            <input id="city-input" role="combobox" placeholder="选择意向工作城市" value=""
              data-top="72" data-left="40" data-width="260" data-height="36" />
          </label>
          <div id="city-menu" class="sd-Menu-content" style="display:none" data-top="112" data-left="40" data-width="280" data-height="150">
            <div class="sd-Menu-container-province" data-top="116" data-left="44" data-width="260" data-height="138">
              <div id="province-header" class="sd-Menu-header-normal" data-top="116" data-left="44" data-width="260" data-height="32">浙江</div>
              <div id="province-cities" style="display:none" data-top="150" data-left="44" data-width="260" data-height="64">
                <div id="hangzhou-option" class="sd-Menu-content-item-city" data-top="154" data-left="48" data-width="240" data-height="30">
                  <div class="option-label-city">杭州市</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    `;
    const input = document.querySelector<HTMLInputElement>("#city-input")!;
    const menu = document.querySelector<HTMLElement>("#city-menu")!;
    const cities = document.querySelector<HTMLElement>("#province-cities")!;
    input.addEventListener("click", () => { menu.style.display = "block"; });
    document.querySelector<HTMLElement>("#province-header")!.addEventListener("click", () => {
      cities.style.display = "block";
    });
    document.querySelector<HTMLElement>("#hangzhou-option")!.addEventListener("click", () => {
      input.value = "杭州市";
      document.querySelector<HTMLElement>("#city-display")!.innerText = "杭州市";
      menu.style.display = "none";
    });

    const field = observeApplicationPage().fields.find((entry) => /意向工作城市/.test(entry.label));
    expect(field).toBeTruthy();
    const result = await fillApplicationPage([
      instructionFor(field!, "candidate.preferences.preferredCities", "杭州市")
    ]);

    expect(result).toEqual([
      expect.objectContaining({ success: false, driverFailureCode: "unsupported_required_control" })
    ]);
    expect(input.value).toBe("");
    expect(menu.style.display).toBe("none");
    expect(cities.style.display).toBe("none");
    expect(document.querySelector("#city-display")?.textContent).toBe("请选择");
  });

  it("does not guess a parent or child city through the native Driver", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="340">
        <div class="apply-field-Q2 Select-field" data-top="40" data-left="40" data-width="360" data-height="120">
          <span class="field-title" data-top="40" data-left="40" data-width="120" data-height="24">意向工作城市</span>
          <span class="required-asterisk-av7" data-top="40" data-left="165" data-width="8" data-height="24"></span>
          <label class="sd-Input-container sd-Select-container select" data-top="72" data-left="40" data-width="280" data-height="38">
            <span class="sd-Input-display-value"><span id="city-display">请选择</span></span>
            <input id="city-input" role="combobox" placeholder="选择意向工作城市" value=""
              data-top="72" data-left="40" data-width="260" data-height="36" />
          </label>
          <div id="city-error" class="error-message" data-top="114" data-left="40" data-width="180" data-height="24">必填项未填写</div>
          <div id="city-menu" class="sd-Menu-content" style="display:none" data-top="132" data-left="40" data-width="280" data-height="120">
            <div id="province-option" class="sd-Menu-content-item-province" data-top="136" data-left="44" data-width="260" data-height="32">
              <div class="option-label-province">北京市</div>
            </div>
            <div id="city-leaf-option" class="sd-Menu-content-item-city" data-top="178" data-left="44" data-width="260" data-height="32">
              <div class="option-label-city">北京市</div>
            </div>
          </div>
        </div>
      </form>
    `;
    const input = document.querySelector<HTMLInputElement>("#city-input")!;
    const menu = document.querySelector<HTMLElement>("#city-menu")!;
    let parentClicked = false;
    let leafClicked = false;
    input.addEventListener("click", () => { menu.style.display = "block"; });
    document.querySelector<HTMLElement>("#province-option")!.addEventListener("click", () => {
      parentClicked = true;
      input.value = "北京市";
      document.querySelector<HTMLElement>("#city-display")!.innerText = "北京市";
    });
    document.querySelector<HTMLElement>("#city-leaf-option")!.addEventListener("click", () => {
      leafClicked = true;
      input.value = "北京市";
      document.querySelector<HTMLElement>("#city-display")!.innerText = "北京市";
      document.querySelector("#city-error")?.remove();
      menu.style.display = "none";
    });

    const field = observeApplicationPage().fields.find((entry) => /意向工作城市/.test(entry.label));
    expect(field).toBeTruthy();
    const result = await fillApplicationPage([
      instructionFor(field!, "candidate.preferences.preferredCities", "北京市")
    ]);

    expect(parentClicked).toBe(false);
    expect(leafClicked).toBe(false);
    expect(result).toEqual([
      expect.objectContaining({ success: false, driverFailureCode: "unsupported_required_control" })
    ]);
    expect(document.querySelector("#city-error")).not.toBeNull();
    expect(input.value).toBe("");
  });

  it("keeps a photo optional even when the ATS reuses a resumeKey-like DOM name", () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="240">
        <div class="upload-item" data-top="40" data-left="40" data-width="320" data-height="120">
          <span data-top="40" data-left="40" data-width="100" data-height="24">上传照片</span>
          <input id="resumeKeyPortrait" name="resumeKeyPortrait" type="file"
            accept="image/jpeg,image/png" data-top="76" data-left="40" data-width="240" data-height="36" />
        </div>
      </form>
    `;

    expect(observeApplicationPage().fields).toEqual([
      expect.objectContaining({
        label: expect.stringMatching(/证件照/),
        stableFieldKey: expect.stringMatching(/identity_photo/),
        required: false,
        requiredSource: "none"
      })
    ]);
  });

  it("blocks final submission when more than one matching final button is visible", async () => {
    document.body.innerHTML = html`
      <button id="first-submit" type="button" data-top="20" data-left="20" data-width="120" data-height="36">提交申请</button>
      <button id="second-submit" type="button" data-top="70" data-left="20" data-width="120" data-height="36">提交申请</button>
    `;

    const result = await executeFinalSubmitAction(null, "提交申请");
    expect(result).toMatchObject({
      executed: false,
      observedResult: "blocked_by_site_validation",
      error: "最终提交按钮不唯一，已阻止自动点击"
    });
  });

  it("expands only an explicitly required Moka work section", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="640">
        <section id="work-section" class="form-section" data-top="40" data-left="40" data-width="680" data-height="220">
          <h2 data-top="40" data-left="40" data-width="100" data-height="28">工作经历</h2>
          <button id="add-work" type="button" data-top="40" data-left="600" data-width="80" data-height="28">添加</button>
          <div id="work-rows" data-top="88" data-left="40" data-width="600" data-height="120">
            <input data-form-field-name="company" value="广州讯方信息技术有限公司"
              data-top="100" data-left="40" data-width="220" data-height="32" />
          </div>
        </section>
        <section id="internship-section" class="form-section" data-top="300" data-left="40" data-width="680" data-height="220">
          <h2 data-top="300" data-left="40" data-width="100" data-height="28">实习经历</h2>
          <button id="add-internship" type="button" data-top="300" data-left="600" data-width="80" data-height="28">添加</button>
          <div id="internship-rows" data-top="348" data-left="40" data-width="600" data-height="120"></div>
        </section>
      </form>
    `;
    let workAdds = 0;
    let internshipAdds = 0;
    document.querySelector<HTMLButtonElement>("#add-work")!.addEventListener("click", () => {
      workAdds += 1;
      document.querySelector("#work-rows")!.insertAdjacentHTML("beforeend", html`
        <input data-form-field-name="company" value=""
          data-top="${120 + workAdds * 40}" data-left="40" data-width="220" data-height="32" />
      `);
    });
    document.querySelector<HTMLButtonElement>("#add-internship")!.addEventListener("click", () => {
      internshipAdds += 1;
      document.querySelector("#internship-rows")!.insertAdjacentHTML("beforeend", html`
        <input data-form-field-name="company" value=""
          data-top="${360 + internshipAdds * 40}" data-left="40" data-width="220" data-height="32" />
      `);
    });

    const result = await prepareDynamicApplicationSections({
      education: 0,
      work: 2,
      internship: 0,
      project: 0,
      requiredSections: ["work"]
    });

    expect(result.added).toMatchObject({ work: 1 });
    expect(workAdds).toBe(1);
    expect(internshipAdds).toBe(0);
    expect(document.querySelectorAll("#work-rows [data-form-field-name='company']")).toHaveLength(2);
    expect(document.querySelectorAll("#internship-rows [data-form-field-name='company']")).toHaveLength(0);
  });

  it("does not add optional repeat rows from resume cardinality alone", async () => {
    document.body.innerHTML = html`
      <form data-top="20" data-left="20" data-width="760" data-height="360">
        <section id="project-section" class="form-section" data-top="40" data-left="40" data-width="680" data-height="220">
          <h2 data-top="40" data-left="40" data-width="100" data-height="28">项目经历</h2>
          <button id="add-project" type="button" data-top="40" data-left="600" data-width="80" data-height="28">添加</button>
          <div id="project-rows" data-top="88" data-left="40" data-width="600" data-height="120"></div>
        </section>
      </form>
    `;
    let projectAdds = 0;
    document.querySelector<HTMLButtonElement>("#add-project")!.addEventListener("click", () => {
      projectAdds += 1;
    });

    const result = await prepareDynamicApplicationSections({
      education: 0,
      work: 0,
      internship: 0,
      project: 2
    });

    expect(result).toEqual({ changed: false, added: {}, warnings: [] });
    expect(projectAdds).toBe(0);
  });

  it("confirms a Moka preview rendered as a normal page instead of a dialog", async () => {
    document.body.innerHTML = html`
      <main data-top="0" data-left="0" data-width="900" data-height="700">
        <button id="preview" type="button" data-top="560" data-left="320" data-width="140" data-height="40">预览并提交</button>
      </main>
    `;
    document.querySelector<HTMLButtonElement>("#preview")!.addEventListener("click", () => {
      document.querySelector("main")!.innerHTML = html`
        <section id="normal-preview-page" data-top="20" data-left="20" data-width="760" data-height="620">
          <h2 data-top="40" data-left="40" data-width="120" data-height="28">申请预览</h2>
          <button id="back" type="button" data-top="560" data-left="180" data-width="120" data-height="40">返回修改</button>
          <button id="submit-application" type="button" data-top="560" data-left="340" data-width="120" data-height="40">提交申请</button>
        </section>
      `;
      document.querySelector<HTMLButtonElement>("#submit-application")!.addEventListener("click", () => {
        document.querySelector("main")!.innerHTML = html`
          <div data-top="100" data-left="100" data-width="260" data-height="40">投递成功</div>
        `;
      });
    });

    const action = observeApplicationPage().actions.find((entry) => entry.kind === "final_submit") ?? null;
    const result = await executeFinalSubmitAction(action, "预览并提交");
    expect(result).toMatchObject({
      executed: true,
      observedResult: "submitted_success",
      error: null,
      trace: expect.arrayContaining([
        "preview_clicked:预览并提交",
        "page_confirmation_candidates:提交申请",
        "page_confirmation_clicked:提交申请",
        "success_observed"
      ])
    });
  });

  it("confirms an inconsistency warning dialog before classifying its warning as validation failure", async () => {
    document.body.innerHTML = html`
      <main data-top="0" data-left="0" data-width="900" data-height="700">
        <button id="preview" type="button" data-top="560" data-left="320" data-width="140" data-height="40">预览并提交</button>
      </main>
    `;
    document.querySelector<HTMLButtonElement>("#preview")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", html`
        <section role="alertdialog" class="ant-modal" data-top="180" data-left="180" data-width="520" data-height="260">
          <div class="error" data-top="220" data-left="220" data-width="420" data-height="40">简历信息与填写内容不一致，是否继续投递？</div>
          <button type="button" data-top="360" data-left="320" data-width="90" data-height="40">取消</button>
          <button id="confirm-warning" type="button" data-top="360" data-left="430" data-width="90" data-height="40">确认</button>
        </section>
      `);
      document.querySelector<HTMLButtonElement>("#confirm-warning")!.addEventListener("click", () => {
        document.body.innerHTML = html`
          <main data-top="0" data-left="0" data-width="900" data-height="700">
            <div data-top="100" data-left="100" data-width="260" data-height="40">投递成功</div>
          </main>
        `;
      });
    });

    const action = observeApplicationPage().actions.find((entry) => entry.kind === "final_submit") ?? null;
    const result = await executeFinalSubmitAction(action, "预览并提交");

    expect(result).toMatchObject({
      executed: true,
      observedResult: "submitted_success",
      error: null,
      trace: expect.arrayContaining([
        "preview_clicked:预览并提交",
        "dialog_confirmation_clicked:确认",
        "success_observed"
      ])
    });
  });
});
