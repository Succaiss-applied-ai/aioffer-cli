// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";
import { submissionRejectedFields, siteValidationFieldKey } from "./auto-apply-site-validation.js";
import { evidenceForField } from "./control-adapters/field-routing.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true, get() { return this.textContent ?? ""; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 40,
    width: 300, height: 40, toJSON() {}
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function render(tenant = "trunk", origin = "https://app.mokahr.com") {
  vi.stubGlobal("location", new URL(`${origin}/social-recruitment/${tenant}/39504#/job/test/apply`));
  document.body.innerHTML = `<form><h2>个人信息</h2><label>姓名<input id="name" name="name" required></label>
    <div class="apply-block-KRDTLLb5hU" data-nav-id="block-uploadInfo"><div>上传</div>
      <div class="apply-fields-BzcXI4i2Pm">
        <div class="apply-field-Q2iJ7AtQGX file_upload-MPorXc4w3A">
          <div class="title-IWWQ0Xa4L7">上传简历<span class="required-asterisk-x">*</span></div>
          <div class="ctrl-CICMG4Fr4_"><div class="file_upload">
            <button type="button">上传简历</button><input id="resumeKey" name="resumeKey" type="file" accept=".pdf,.docx">
          </div><div>上传附加简历后，会自动解析、填充申请表信息。</div></div>
        </div>
        <div class="apply-field-Q2iJ7AtQGX attachment_upload-rjeAA_yPz7">
          <div class="title-IWWQ0Xa4L7">上传附件<span class="required-asterisk-x">*</span></div>
          <div class="ctrl-CICMG4Fr4_"><div class="sd-Upload-basic-upload-wrap-2ovOz">
            <input id="attachment" type="file" multiple style="display:none"><button type="button">上传</button>
          </div></div>
        </div>
      </div>
    </div><button type="button">预览并提交</button></form>`;
}
const resume = () => observeApplicationPage().fields.find(field => field.selector === "#resumeKey")!;
const markError = () => document.querySelector(".file_upload")!.classList.add("error-ssB9wMzEaC");

describe("Moka native resume's owned border-only validation", () => {
  it.each(["trunk", "bjwgby", "deepseek"])("observes a new error for %s without changing identity/Driver or rejecting the adjacent attachment", tenant => {
    render(tenant);
    const before = observeApplicationPage();
    const old = before.fields.find(field => field.selector === "#resumeKey")!;
    expect(old.validationMessage).toBeNull();
    expect(resolveControlAdapter(evidenceForField(before, old)).code).toBe("generic.native.v1");
    markError();
    const after = observeApplicationPage();
    const field = after.fields.find(field => field.selector === "#resumeKey")!;
    expect(field.validationMessage).toBe("招聘网站未接受简历上传，请检查上传控件");
    expect(field.stableFieldKey).toBe(old.stableFieldKey);
    expect(resolveControlAdapter(evidenceForField(after, field)).code).toBe("generic.native.v1");
    expect(submissionRejectedFields(before, after).map(siteValidationFieldKey)).toEqual([siteValidationFieldKey(field)]);
    expect(after.fields.filter(item => item.selector !== "#resumeKey")).toEqual(before.fields.filter(item => item.selector !== "#resumeKey"));
    document.querySelector(".file_upload")!.classList.remove("error-ssB9wMzEaC");
    expect(resume().validationMessage).toBeNull();
  });
  it("does not infer a missing candidate fact or repeat authorization from an unchanged old red border", () => {
    render(); markError();
    const before = observeApplicationPage(); const after = observeApplicationPage();
    expect(submissionRejectedFields(before, after)).toEqual([]);
    const key = siteValidationFieldKey(resume());
    expect(submissionRejectedFields(before, after, { reassertedKeys: new Set([key]) })).toHaveLength(1);
    expect(submissionRejectedFields(before, after, { previouslyRejectedKeys: new Set([key]) })).toHaveLength(1);
  });
  it("retains successful site filename readback when the error is absent", () => {
    render(); document.querySelector(".file_upload")!.insertAdjacentHTML("beforeend", '<span>resume.pdf</span>');
    expect(resume()).toMatchObject({ currentValue: expect.stringContaining("resume.pdf"), validationMessage: null });
  });
  it.each([
    "foreign-host", "detail-page", "same-name-text", "ambiguous-inputs", "hidden-owner",
    "hidden-ancestor", "global-error", "other-error-class", "attachment-kind", "wrong-owner"
  ])("does not match %s", kind => {
    render(); markError();
    const input = document.querySelector<HTMLInputElement>("#resumeKey")!;
    const shell = document.querySelector<HTMLElement>(".file_upload")!;
    const root = input.closest<HTMLElement>("[class*='apply-field-']")!;
    if (kind === "foreign-host") vi.stubGlobal("location", new URL("https://careers.example.com/social-recruitment/trunk/39504#/job/test/apply"));
    if (kind === "detail-page") vi.stubGlobal("location", new URL("https://app.mokahr.com/social-recruitment/trunk/39504#/job/test"));
    if (kind === "same-name-text") input.type = "text";
    if (kind === "ambiguous-inputs") root.insertAdjacentHTML("beforeend", '<input type="file">');
    if (kind === "hidden-owner") shell.hidden = true;
    if (kind === "hidden-ancestor") root.style.display = "none";
    if (kind === "global-error") { shell.classList.remove("error-ssB9wMzEaC"); root.parentElement!.classList.add("error-ssB9wMzEaC"); }
    if (kind === "other-error-class") shell.className = "file_upload error-message-help";
    if (kind === "attachment-kind") root.className = "apply-field-x attachment_upload-x";
    if (kind === "wrong-owner") { shell.className = "file_upload"; root.insertAdjacentHTML("beforeend", '<div class="file_upload error-ssB9wMzEaC">其他上传</div>'); }
    expect(resume()?.validationMessage ?? null).toBeNull();
  });
  it("prefers a site's explicit error text over the structural diagnostic", () => {
    render(); markError();
    document.querySelector(".file_upload")!.insertAdjacentHTML("afterend", '<div class="field-error">请上传 PDF 格式文件</div>');
    expect(resume().validationMessage).toBe("请上传 PDF 格式文件");
  });
});
