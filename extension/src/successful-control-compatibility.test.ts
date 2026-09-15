// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage, type FillInstruction } from "./page-adapter.js";
import { bindObservedInstruction, evidenceForField } from "./control-adapters/field-routing.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { registeredControlReadbackMatches } from "./control-adapters/readback-policy.js";

// These are previously accepted control shapes and readbacks, not a claim of
// a new live application. Keep them independent of the newly repaired fields.
const accepted = JSON.parse(readFileSync(
  `${process.cwd()}/docs/evidence/moka-control-type-routing-20260903.json`, "utf8"
)).acceptedControls as Array<{
  site: string; urlFamily: string; field: string; route: string;
  stableFieldKeyBeforeAndAfter: string; executionExpected: string; immediate: string;
}>;

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true, get() { return this.textContent ?? ""; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 40,
    width: 300, height: 40, toJSON() {}
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function renderMoka(url: string, title: string, hint: string, section: string) {
  vi.stubGlobal("location", new URL(url.replace("<job>", "accepted-control")));
  document.body.innerHTML = `<form><h2>${section}</h2>
    <div class="apply-field-test select_info-test"><div class="title-test">${title}</div>
      <div class="ctrl-test"><div class="sd-Dropdown-container-test">
        <label class="sd-Input-container-test sd-Select-container-test">
          <span class="sd-Input-display-value-test"></span>
          <input id="accepted" class="sd-Input-input-test" placeholder="${hint}" required>
        </label>
      </div></div>
    </div>
    <label>姓名<input id="name" name="fullName" value="测试姓名" required></label>
    <label>邮箱<input id="email" name="email" type="email" value="test@example.com" required></label>
    <button type="button">预览并提交</button></form>`;
}

describe("previously accepted controls remain compatible with failure-site repairs", () => {
  for (const control of accepted) {
    it(`${control.site}: ${control.field} preserves its selected Driver, field binding and readback`, () => {
      const title = control.field.split(" · ").at(-1)!;
      renderMoka(control.urlFamily, title,
        title === "性别" ? "选择性别" : "选择意向工作城市",
        title === "性别" ? "个人信息" : "申请信息");
      const before = observeApplicationPage();
      const field = before.fields.find(item => item.selector === "#accepted")!;
      expect(field.stableFieldKey).toBe(control.stableFieldKeyBeforeAndAfter);
      const route = resolveControlAdapter(evidenceForField(before, field));
      expect(route.code).toBe(control.route);
      const instruction: FillInstruction = {
        fieldId: field.fieldId, stableFieldKey: field.stableFieldKey,
        selector: field.selector, expectedLabel: field.label, type: field.type,
        value: control.executionExpected, applicationUrl: before.url,
        controlAdapter: route.diagnostic
      };
      const others = before.fields.filter(item => item.selector !== "#accepted")
        .map(({ label, stableFieldKey, currentValue }) => ({ label, stableFieldKey, currentValue }));
      const previous = document.querySelector<HTMLInputElement>("#accepted")!;
      const rebuilt = previous.cloneNode() as HTMLInputElement;
      rebuilt.id = "rebuilt"; rebuilt.placeholder = ""; previous.replaceWith(rebuilt);
      document.querySelector("[class*='Input-display-value']")!.textContent = control.immediate;
      const after = observeApplicationPage();
      const bound = bindObservedInstruction(after, instruction)!;
      expect(bound).toBeTruthy();
      expect(bound.currentValue).toBe(control.immediate);
      expect(bound.stableFieldKey).toBe(field.stableFieldKey);
      // HEAD's DeepSeek exception needs its original placeholder. A later
      // cold resolution uses the existing shared city route; the completed
      // instruction still reads back through the selected Driver. Preserve
      // that baseline behavior instead of introducing a new route here.
      const committedRoute = control.route === "moka.deepseek.location.trusted-focus.v4"
        ? "moka.work-city.trusted-focus.v1" : control.route;
      expect(resolveControlAdapter(evidenceForField(after, bound)).code).toBe(committedRoute);
      expect(registeredControlReadbackMatches({ field: bound, expected: control.executionExpected,
        controlAdapter: route.diagnostic }).matches).toBe(true);
      expect(after.fields.filter(item => item.selector !== "#rebuilt")
        .map(({ label, stableFieldKey, currentValue }) => ({ label, stableFieldKey, currentValue })))
        .toEqual(others);
    });
  }

  it.each([
    ["linctex", "46055", "moka.linctex.location.trusted-focus.v1"],
    ["yadea", "144891", "moka.yadea.location.trusted-focus.v1"],
    ["brother", "150715", "moka.brother.location.trusted-focus.v1"]
  ])("keeps the %s single-city exception separate from the new multi-city Driver", (tenant, campaign, expected) => {
    renderMoka(`https://app.mokahr.com/social-recruitment/${tenant}/${campaign}#/job/control/apply`,
      "意向工作城市", "选择意向工作城市", "申请信息");
    const page = observeApplicationPage();
    const field = page.fields.find(item => item.selector === "#accepted")!;
    expect(resolveControlAdapter(evidenceForField(page, field)).code).toBe(expected);
  });

  it.each(["https://careers.example.com/apply", "https://app.mokahr.com/campus-recruitment/example/1#/job/test/apply"])(
    "leaves native school, ordinary choice and upload controls on their existing routes (%s)", url => {
      vi.stubGlobal("location", new URL(url));
      document.body.innerHTML = `<form><h2>个人信息</h2>
        <label>学校名称<input id="school" name="school" required></label>
        <label>学历<select id="degree" name="degree" required><option value="本科">本科</option></select></label>
        <label>简历附件<input id="file" type="file" required></label>
        <button type="button">提交申请</button></form>`;
      const page = observeApplicationPage();
      for (const field of page.fields) {
        expect(resolveControlAdapter(evidenceForField(page, field)).code).toBe("generic.native.v1");
      }
      expect(page.fields).toHaveLength(3);
    }
  );
});
