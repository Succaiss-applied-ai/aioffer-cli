// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeSubmitValidationProbeInPage, reassertedSubmitValidationProbeInPage } from "./submit-validation-probe.js";

const token = "__test_native_validation";
afterEach(() => {
  nativeSubmitValidationProbeInPage(token, "cleanup");
  reassertedSubmitValidationProbeInPage(token, "cleanup");
  vi.restoreAllMocks();
});
describe("native submission rejection probe", () => {
  function arm(fields = [{ key: "name", selector: "#name" }], submitText = "Submit") {
    const listeners = vi.spyOn(document, "addEventListener");
    nativeSubmitValidationProbeInPage(token, "arm", fields, submitText);
    const listener = listeners.mock.calls.find(([type]) => type === "click")![1] as EventListener;
    return () => listener({ target: document.querySelector("button"), isTrusted: true } as unknown as Event);
  }
  it("does not predict missing fields, and records only a subsequent native validation event", () => {
    document.body.innerHTML = '<form><input id="name" required><button>Submit</button></form>';
    const click = arm();
    expect(nativeSubmitValidationProbeInPage(token, "read")).toEqual([]);
    click();
    document.querySelector("form")!.requestSubmit();
    expect(nativeSubmitValidationProbeInPage(token, "read")).toEqual([
      { fieldKey: "name", message: expect.any(String) }
    ]);
    document.querySelector<HTMLInputElement>("#name")!.value = "测试姓名";
    expect(nativeSubmitValidationProbeInPage(token, "read")).toEqual([]);
  });

  it("ignores synthetic invalid events and clears listeners between attempts", () => {
    document.body.innerHTML = '<form><input id="name" required><button>Submit</button></form>';
    arm()();
    document.querySelector("#name")!.dispatchEvent(new Event("invalid"));
    expect(nativeSubmitValidationProbeInPage(token, "read")).toEqual([]);
    nativeSubmitValidationProbeInPage(token, "cleanup");
    document.querySelector("form")!.requestSubmit();
    expect(nativeSubmitValidationProbeInPage(token, "read")).toEqual([]);
  });
  it.each(["预览并提交 / Preview and submit", "确认提交 / Confirm submission"])(
    "attributes native rejection to the preserved full bilingual label: %s", text => {
      document.body.innerHTML = `<form><input id="name" required><button><span>${text}</span></button></form>`;
      arm(undefined, text)();
      document.querySelector("form")!.requestSubmit();
      expect(nativeSubmitValidationProbeInPage(token, "read").map(error => error.fieldKey)).toEqual(["name"]);
    });
  it("does not arm from a partial Chinese label for a bilingual click", () => {
    document.body.innerHTML = '<form><input id="name" required><button>预览并提交 / Preview and submit</button></form>';
    arm(undefined, "预览并提交")();
    document.querySelector("form")!.requestSubmit();
    expect(nativeSubmitValidationProbeInPage(token, "read")).toEqual([]);
  });

  it("ignores programmatic pre-click validation and collects every invalid field from the actual attempt", () => {
    document.body.innerHTML = '<form><input id="name" required><input id="department" required><button>Submit</button></form>';
    const click = arm([{ key: "name", selector: "#name" }, { key: "department", selector: "#department" }]);
    document.querySelector("form")!.checkValidity();
    expect(nativeSubmitValidationProbeInPage(token, "read")).toEqual([]);
    click();
    document.querySelector("form")!.requestSubmit();
    expect(nativeSubmitValidationProbeInPage(token, "read").map(error => error.fieldKey)).toEqual(["name", "department"]);
  });

  it("rebinds a native invalid event to the current stable field after React replaces its selector", () => {
    document.body.innerHTML = '<form><input id="name" required><button>Submit</button></form>';
    const click = arm();
    click();
    document.querySelector("#name")!.outerHTML = '<input id="new-name" required>';
    document.querySelector("form")!.requestSubmit();
    expect(nativeSubmitValidationProbeInPage(token, "read", [{ key: "name", selector: "#new-name" }]))
      .toEqual([{ fieldKey: "name", message: expect.any(String) }]);
  });
});

describe("same-message custom validation activity", () => {
  function setup() {
    document.body.innerHTML = `<form>
      <div class="form-item"><label for="a">姓名</label><input id="a"><span class="field-error" id="a-error">请填写</span></div>
      <div class="form-item"><label for="b">部门</label><input id="b"><span class="field-error" id="b-error">请填写</span></div>
      <button id="submit">提交</button><button id="other">其他</button>
      <span id="counter">0</span></form>`;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 20 } as DOMRect);
    const listeners = vi.spyOn(document, "addEventListener");
    reassertedSubmitValidationProbeInPage(token, "arm", [
      { key: "a", selector: "#a", hasError: true }, { key: "b", selector: "#b", hasError: true }
    ], "提交");
    const listener = listeners.mock.calls.find(([type]) => type === "click")![1] as EventListener;
    const click = (id = "submit", trusted = true) => listener({ target: document.getElementById(id), isTrusted: trusted } as unknown as Event);
    const read = () => reassertedSubmitValidationProbeInPage(token, "read");
    return { click, read };
  }

  it("observes two same-message errors reasserted after the trusted submit", () => {
    const { click, read } = setup();
    expect(read()).toEqual([]);
    click();
    for (const id of ["a", "b"]) {
      document.getElementById(id)!.setAttribute("aria-invalid", "false");
      document.getElementById(id)!.setAttribute("aria-invalid", "true");
    }
    expect(read()).toEqual(["a", "b"]);
  });

  it("does not count stale text, unrelated renders, or field focus styling", () => {
    const { click, read } = setup();
    click();
    document.getElementById("counter")!.textContent = "1";
    document.getElementById("a")!.setAttribute("style", "outline: 1px solid blue");
    expect(read()).toEqual([]);
  });

  it.each([["submit", false], ["other", true]] as const)("ignores a synthetic or unrelated click (%s/%s)", (id, trusted) => {
    const { click, read } = setup();
    click(id, trusted);
    document.getElementById("a-error")!.textContent = "请填写";
    expect(read()).toEqual([]);
  });

  it("discards pre-click mutations and keeps sibling errors isolated", () => {
    const { click, read } = setup();
    document.getElementById("b-error")!.textContent = "请填写";
    click();
    document.getElementById("a")!.setAttribute("aria-invalid", "true");
    expect(read()).toEqual(["a"]);
  });

  it("reasserts a Formily error from the outer item when the input carries the same field id", () => {
    document.body.innerHTML = `<form><div class="ud-formily-item" id="formily-item-name">
      <div class="ud-formily-item-label"><span class="ud-formily-item-label-content">姓名</span></div>
      <input id="name" data-form-field-id="name">
      <div id="name-error" class="ud-formily-item-error-help" hidden>姓名为必填</div>
      </div><button id="submit">提交</button></form>`;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 20 } as DOMRect);
    const listeners = vi.spyOn(document, "addEventListener");
    reassertedSubmitValidationProbeInPage(token, "arm", [
      { key: "basic.full_name.native", selector: "#name", hasError: true }
    ], "提交");
    const listener = listeners.mock.calls.find(([type]) => type === "click")![1] as EventListener;
    listener({ target: document.getElementById("submit"), isTrusted: true } as unknown as Event);
    document.getElementById("name-error")!.removeAttribute("hidden");
    expect(reassertedSubmitValidationProbeInPage(token, "read")).toEqual(["basic.full_name.native"]);
  });

  it("ignores an identical aria-invalid attribute assignment", () => {
    const { click, read } = setup();
    document.getElementById("a")!.setAttribute("aria-invalid", "true");
    click();
    document.getElementById("a")!.setAttribute("aria-invalid", "true");
    expect(read()).toEqual([]);
  });

  it("ignores hidden stale errors and cleans up between transactions", () => {
    const { click, read } = setup();
    document.getElementById("a-error")!.parentElement!.setAttribute("hidden", "");
    click();
    document.getElementById("a-error")!.textContent = "请填写";
    expect(read()).toEqual([]);
    reassertedSubmitValidationProbeInPage(token, "cleanup");
    document.getElementById("b-error")!.textContent = "请填写";
    expect(read()).toEqual([]);
  });

  it("does not attribute a sibling error update to a bare invalid control", () => {
    const { read } = setup();
    document.querySelector("form")!.insertAdjacentHTML("beforeend", '<input id="bare" aria-invalid="true">');
    reassertedSubmitValidationProbeInPage(token, "cleanup");
    const listeners = vi.spyOn(document, "addEventListener");
    listeners.mockClear();
    reassertedSubmitValidationProbeInPage(token, "arm", [{ key: "bare", selector: "#bare", hasError: true }], "提交");
    const listener = listeners.mock.calls.find(([type]) => type === "click")![1] as EventListener;
    listener({ target: document.getElementById("submit"), isTrusted: true } as unknown as Event);
    document.getElementById("a-error")!.textContent = "请填写";
    expect(read()).toEqual([]);
  });

  it("observes an explicitly owned ARIA error outside the field container", () => {
    const { click, read } = setup();
    document.body.insertAdjacentHTML("beforeend", '<div id="linked">请填写</div>');
    document.getElementById("a")!.setAttribute("aria-invalid", "true");
    document.getElementById("a")!.setAttribute("aria-errormessage", "linked");
    click();
    document.getElementById("linked")!.setAttribute("hidden", "");
    document.getElementById("linked")!.removeAttribute("hidden");
    expect(read()).toEqual(["a"]);
  });

  it("does not treat React replacing unchanged errors as a new rejection", () => {
    const { click } = setup();
    click();
    document.getElementById("a")!.parentElement!.outerHTML = '<div class="form-item"><input id="new-a"><span class="field-error">请填写</span></div>';
    expect(reassertedSubmitValidationProbeInPage(token, "read", [{ key: "a", selector: "#new-a", hasError: true },
      { key: "b", selector: "#b", hasError: true }])).toEqual([]);
  });

  it.each(["color:red", "margin-top:1px", "opacity:1", "display:block", "visibility:visible"])(
    "ignores cosmetic error styling: %s", (style) => {
      const { click, read } = setup();
      click();
      document.getElementById("a-error")!.setAttribute("style", style);
      expect(read()).toEqual([]);
    }
  );

  it("ignores writing the same old error text again", () => {
    const { click, read } = setup();
    click();
    document.getElementById("a-error")!.textContent = "请填写";
    expect(read()).toEqual([]);
  });

  it.each(["display:none", "visibility:hidden", "opacity:0"])("detects a real error visibility transition: %s", (style) => {
    const { click, read } = setup();
    click();
    document.getElementById("a-error")!.setAttribute("style", style);
    document.getElementById("a-error")!.removeAttribute("style");
    expect(read()).toEqual(["a"]);
  });
});
