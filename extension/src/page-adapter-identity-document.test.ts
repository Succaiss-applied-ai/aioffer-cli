// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://app.mokahr.com/campus-recruitment/sungrow/94416#/job/test-job/apply"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";
import { fillApplicationPage } from "./control-adapters/native-driver.js";
import { evidenceForField } from "./control-adapters/field-routing.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { executeMokaRecruitingSourceDriver, identityDocumentTypeReadback, isMokaSungrowIdentityDocumentTypeField, readMokaRecruitingSourceInPage } from "./control-adapters/moka-recruiting-source-driver.js";
import { authoritativeCandidateFactForField, candidateInformationRequestsForMissingFields, deterministicKnownFactActions, siteRejectedInformationRequests } from "./vision-form-runtime.js";
import { siteRejectedFields } from "./auto-apply-site-validation.js";

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true,
    get() { return this.textContent ?? ""; } });
  if (!globalThis.CSS) Object.defineProperty(globalThis, "CSS", {
    configurable: true, value: { escape: (value: string) => value }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 20, y: 20, top: 20, left: 20, right: 300, bottom: 60,
    width: 280, height: 40, toJSON: () => ({})
  } as DOMRect);
});

// Topology captured from the real Sungrow form on 2026-09-03. In particular,
// the group's required error is inside the type Select, NOT beside the number.
function moka(display = "身份证", number = "", error = "必填项未填写") {
  document.body.innerHTML = `<form>
    <div class="apply-field-Q2iJ7AtQGX string_info-UOJxKN5mtC">
      <div class="title-IWWQ0Xa4L7"><span>证件号码</span><span class="required-asterisk-av7"></span></div>
      <div class="ctrl-CIC"><div class="wrapper-Cvo">
        <div><div class="sd-Dropdown-container-1CigZ">
          <label class="sd-Input-container-2S sd-Select-container-1Eq4x sd-Input-error-Z">
            <span class="sd-Input-display-value-RwqDy"><span>${display}</span></span>
            <input id="doc-type" type="text" class="sd-Input-input-10L0t sd-Input-has-addon" value="">
            <span class="sd-Select-addon"></span>
            <div id="group-error" class="sd-Input-message sd-Input-error-Z">${error}</div>
          </label>
        </div></div>
        <div class="number-I4QXxqsyGc"><label class="sd-Input-container-2S input-nyo sd-Input-error-Z">
          <input id="doc-number" type="text" class="sd-Input-input-10L0t" placeholder="证件号码" value="${number}">
          <div class="sd-Input-message sd-Input-error-Z"></div>
        </label></div>
      </div></div>
    </div><button type="button">预览并提交</button>
  </form>`;
}
const pair = () => {
  const page = observeApplicationPage();
  return { page, type: page.fields.find(f => f.selector === "#doc-type")!, number: page.fields.find(f => f.selector === "#doc-number")! };
};

// The pure request generator receives option-enriched observations in production.
const withIdentityTypeOptions = (fields: ReturnType<typeof observeApplicationPage>["fields"]) => fields.map(field =>
  field.compound?.role === "type" ? {...field, options:["身份证", "护照"]} : field);

describe("identity-document compound observation and execution", () => {
  it("splits the real compound, retains requiredness and assigns missing to its empty member", () => {
    moka();
    const { page, type, number } = pair();
    expect(type).toMatchObject({ label: "证件类型", stableFieldKey: "basic.identity_document_type.combobox",
      type: "combobox", required: true, currentValue: "身份证", validationMessage: null,
      compound: { kind: "identity_document", role: "type" } });
    expect(number).toMatchObject({ label: "证件号码", stableFieldKey: "basic.identity_document_number.native",
      type: "text", required: true, currentValue: "", validationMessage: "必填项未填写",
      compound: { kind: "identity_document", role: "number" } });
    expect(type.compound?.groupKey).toBe(number.compound?.groupKey);
    expect(candidateInformationRequestsForMissingFields(page.fields, {}).map(f => f.label)).toEqual(["证件号码"]);
    expect(siteRejectedInformationRequests(siteRejectedFields(page)).map(f => f.label)).toEqual(["证件号码"]);
    expect(resolveControlAdapter(evidenceForField(page, type)).code).toBe("moka.sungrow.identity-document-type.trusted-focus.v1");
    expect(resolveControlAdapter(evidenceForField(page, number)).code).toBe("generic.native.v1");
    expect(identityDocumentTypeReadback(readMokaRecruitingSourceInPage("#doc-type", "sungrow_identity_document_type"), page))
      .toMatchObject({ actual: "身份证", validationCleared: true, popupClosed: true });
  });

  it("asks for both members when both are empty, with independent supplement keys", () => {
    moka("");
    const { page } = pair();
    const requests = candidateInformationRequestsForMissingFields(withIdentityTypeOptions(page.fields), {});
    expect(requests.map(f => f.label)).toEqual(["证件类型", "证件号码"]);
    expect(new Set(requests.map(f => f.stableFieldKey)).size).toBe(2);
    expect(page.fields.every(f => f.validationMessage === "必填项未填写")).toBe(true);
    expect(deterministicKnownFactActions(page, { "candidate.fullName": "候选人", "candidate.phone": "test-phone" })).toEqual([]);
    const { type, number } = pair();
    const facts = { [`job.requiredField.stable:${number.stableFieldKey}`]: "TEST-NOT-A-REAL-ID" };
    expect(authoritativeCandidateFactForField(number, facts)?.value).toBe("TEST-NOT-A-REAL-ID");
    expect(authoritativeCandidateFactForField(type, facts)).toBeNull();
    expect(isMokaSungrowIdentityDocumentTypeField({ label: "基本信息 · 证件类型" })).toBe(true);
    expect(isMokaSungrowIdentityDocumentTypeField({ stableFieldKey: type.stableFieldKey })).toBe(true);
    expect(isMokaSungrowIdentityDocumentTypeField({ stableFieldKey: number.stableFieldKey })).toBe(false);
  });

  it.each(["证件号码无效", "必填项未填写"])("never suppresses a nonempty group rejection: %s", error => {
    moka("身份证", "NOT-A-REAL-ID", error);
    const { page } = pair();
    expect(siteRejectedFields(page).map(f => f.label)).toEqual(["证件类型", "证件号码"]);
    expect(siteRejectedInformationRequests(withIdentityTypeOptions(siteRejectedFields(page)))).toHaveLength(2);
  });

  it("preserves an explicit invalid type and does not assign its linked error to the number", () => {
    moka();
    document.querySelector("#doc-type")!.setAttribute("aria-invalid", "true");
    document.querySelector("#doc-type")!.setAttribute("aria-errormessage", "group-error");
    const { page, type, number } = pair();
    expect(type.validationMessage).toBe("必填项未填写");
    expect(number.validationMessage).toBeNull();
    expect(identityDocumentTypeReadback({ actual: "身份证", validationCleared: false, popupClosed: true }, page).validationCleared).toBe(false);
  });

  it("does not borrow the selected document type as the number's value or mutate the page", () => {
    moka();
    const events = vi.fn();
    document.querySelector("form")!.addEventListener("input", events);
    const before = pair();
    document.querySelector<HTMLInputElement>("#doc-type")!.placeholder = "请选择";
    document.querySelector<HTMLInputElement>("#doc-type")!.value = "search draft";
    const after = pair();
    expect(after.type.stableFieldKey).toBe(before.type.stableFieldKey);
    expect(after.type.currentValue).toBe("身份证");
    expect(after.number.currentValue).toBe("");
    expect(events).not.toHaveBeenCalled();
  });

  it("does not reopen, scroll or poll the selected type because its sibling number is missing", async () => {
    moka();
    const executeScript = vi.fn(async ({ func, args = [] }) => [{ result: func(...args) }]);
    vi.stubGlobal("chrome", { scripting: { executeScript } });
    const actions = { prepareSurface: vi.fn(), clickPoint: vi.fn(), commitSelection: vi.fn(), wait: vi.fn() };
    try {
      const result = await executeMokaRecruitingSourceDriver({ tabId: 1, selector: "#doc-type", expected: "身份证",
        fieldKind: "sungrow_identity_document_type", ...actions });
      expect(result).toMatchObject({ success: true, actual: "身份证", validationCleared: true,
        diagnostics: { ledger: { openClickCount: 0, scrollCount: 0, readbackPollCount: 0, retryCount: 0 } } });
      for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
      expect(executeScript.mock.calls.map(([input]) => input.func.name))
        .toEqual(["readMokaRecruitingSourceInPage", "observeApplicationPage"]);
      expect(pair().number.validationMessage).toBe("必填项未填写");
    } finally { vi.unstubAllGlobals(); }
  });

  it.each(["select", "aria"])("recognizes a %s + text compound outside Moka", kind => {
    document.body.innerHTML = `<form><fieldset><legend>证件号码 *</legend>${kind === "select"
      ? '<select id="doc-type"><option value="id">身份证</option><option value="passport">护照</option></select>'
      : '<div id="doc-type" role="combobox"><span class="selected-value">身份证</span><input placeholder="请选择"></div>'}
      <input id="doc-number"><div class="field-error">必填项未填写</div>
    </fieldset></form>`;
    const { page, type, number } = pair();
    expect(page.fields).toHaveLength(2);
    expect(type).toMatchObject({ label: "证件类型", required: true, currentValue: "身份证", validationMessage: null });
    expect(number).toMatchObject({ label: "证件号码", required: true, validationMessage: "必填项未填写" });
    const route = resolveControlAdapter(evidenceForField({ ...page, url: "https://example.test/apply" }, type));
    expect(route.code).toBe(kind === "select" ? "generic.native.v1" : "unresolved.custom.v1");
  });

  it("keeps a generic member-local invalid number away from its selected type", () => {
    document.body.innerHTML = `<fieldset><legend>证件号码 *</legend><select id="doc-type"><option value="id">身份证</option></select>
      <label><input id="doc-number" value="NOT-A-REAL-ID"><span class="field-error">证件号码无效</span></label></fieldset>`;
    expect(pair().type.validationMessage).toBeNull();
    expect(pair().number.validationMessage).toBe("证件号码无效");
  });

  it("does not promote a member's required label to a group-level requirement", () => {
    document.body.innerHTML = `<div class="form-group"><label for="doc-type">证件类型</label>
      <select id="doc-type"><option value="id">身份证</option></select>
      <label for="doc-number">证件号码 *</label><input id="doc-number" required></div>`;
    expect(pair().type.required).toBe(false);
    expect(pair().number.required).toBe(true);
  });

  it("works as a serialized observer without imported closures, as Chrome executes it", async () => {
    moka();
    const { submissionActionPatterns } = await import("./submission-action-policy.js");
    const serialized = new Function("policy", `return (${observeApplicationPage.toString()})(policy)`);
    expect(serialized(submissionActionPatterns).fields).toEqual(observeApplicationPage().fields);
  });

  it.each(["手机号码", "起止时间", "银行卡号"])("does not classify an unrelated %s pair as identity", title => {
    moka();
    document.querySelector(".title-IWWQ0Xa4L7 span")!.textContent = title;
    expect(observeApplicationPage().fields.every(f => !f.compound)).toBe(true);
  });

  it("does not guess when a third answer control makes the group ambiguous", () => {
    moka();
    document.querySelector(".wrapper-Cvo")!.insertAdjacentHTML("beforeend", '<input placeholder="签发国家">');
    expect(observeApplicationPage().fields.every(f => !f.compound)).toBe(true);
  });

  it("writes only the number through the native Driver and rebinds after a DOM rebuild", async () => {
    moka("其他证件", "", "");
    const { number, type } = pair();
    const typeEvents = vi.fn();
    document.querySelector("#doc-type")!.addEventListener("input", typeEvents);
    document.querySelector("#doc-number")!.addEventListener("change", () => {
      document.querySelector("#doc-number")!.replaceWith(document.querySelector("#doc-number")!.cloneNode(true));
    });
    const result = await fillApplicationPage([{ fieldId: number.fieldId, selector: number.selector,
      stableFieldKey: number.stableFieldKey, expectedLabel: number.label, type: number.type,
      semanticKey: `job.requiredField.stable:${number.stableFieldKey}`, value: "TEST-NOT-A-REAL-ID" }]);
    expect(result).toMatchObject([{ success: true, actual: "TEST-NOT-A-REAL-ID", controlAdapter: { registrationId: "generic.native.text.v1" } }]);
    expect(pair().type.currentValue).toBe(type.currentValue);
    expect(typeEvents).not.toHaveBeenCalled();
    expect(pair().number.validationMessage).toBeNull();
  });
});
