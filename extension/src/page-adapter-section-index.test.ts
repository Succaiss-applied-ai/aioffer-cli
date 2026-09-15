// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";

const headingSelector = "h1,h2,h3,h4,p,span,div,[class*='section-title'],[class*='module-title'],[class*='block-title']";

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://app.mokahr.com/campus-recruitment/xgd/7850#/job/fixture/apply"));
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true, get() { return this.textContent ?? ""; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 200, height: 30, right: 200, bottom: 30
  } as DOMRect);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("per-snapshot section heading index", () => {
  it("scans headings once on a long form without changing field order or ownership", () => {
    const rows = (prefix: string, label: string) => Array.from({ length: 24 }, (_, i) =>
      `<div><label>${label}<input id="${prefix}-${i}"></label></div>`).join("");
    document.body.innerHTML = `<nav><h2>项目经历</h2></nav><form>
      <section><h2>教育背景</h2>${rows("school", "学校名称")}</section>
      <section><h2>工作经历</h2>${rows("company", "公司名称")}</section>
      <button>预览并提交</button></form>`;
    const documentQueries = vi.spyOn(document, "querySelectorAll");
    const elementQueries = vi.spyOn(Element.prototype, "querySelectorAll");
    const fields = observeApplicationPage().fields;
    expect(fields).toHaveLength(48);
    expect(fields.slice(0, 24).map(field => field.labelPath[0])).toEqual(Array(24).fill("教育背景"));
    expect(fields.slice(24).map(field => field.labelPath[0])).toEqual(Array(24).fill("工作经历"));
    expect(fields.map(field => field.selector)).toEqual([
      ...Array.from({ length: 24 }, (_, i) => `#school-${i}`),
      ...Array.from({ length: 24 }, (_, i) => `#company-${i}`)
    ]);
    expect(documentQueries.mock.calls.filter(([selector]) => selector === headingSelector)).toHaveLength(1);
    expect(elementQueries.mock.calls.filter(([selector]) => selector === headingSelector)).toHaveLength(0);
  });

  it.each(["https://example.test/apply", "https://app.mokahr.com/campus-recruitment/wzgroup/76099#/job/fixture/apply"])(
    "rebuilds the index after section and visibility changes at %s", url => {
      vi.stubGlobal("location", new URL(url));
      document.body.innerHTML = '<form><section><h2>工作经历</h2><label>名称<input id="owned"></label></section><button>提交</button></form>';
      expect(observeApplicationPage().fields[0]?.labelPath[0]).toBe("工作经历");
      document.querySelector("h2")!.textContent = "项目经历";
      document.querySelector("section")!.insertAdjacentHTML("afterbegin", '<h2 hidden>教育背景</h2>');
      const next = observeApplicationPage().fields[0]!;
      expect(next.labelPath[0]).toBe("项目经历");
      expect(next.selector).toBe("#owned");
    }
  );
});
