// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareApplicationFormValidationBlur } from "./page-adapter.js";

describe("application form pre-submit blur preparation", () => {
  let form: HTMLFormElement;
  let input: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <main><form>
        <input name="name"><input name="email"><div class="form-blank"></div>
      </form></main>`;
    form = document.querySelector("form")!;
    input = document.querySelector("input")!;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 400,
      width: 400, height: 400, toJSON: () => ({})
    } as DOMRect);
    if (!("innerText" in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, "innerText", {
        configurable: true,
        get() { return this.textContent ?? ""; }
      });
    }
    input.focus();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  function mockElementFromPoint(element: Element | null) {
    // jsdom does not implement layout hit-testing. Define just this test
    // double instead of pretending every blank coordinate is safe.
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => element)
    });
  }

  it("returns only a verified inert form surface for the trusted blur click", () => {
    mockElementFromPoint(form);

    expect(prepareApplicationFormValidationBlur()).toEqual({
      point: { x: 24, y: 24 },
      fallbackBlurred: false
    });
    expect(document.activeElement).toBe(input);
  });

  it("does not click an interactive surface and instead blurs the active editor", () => {
    mockElementFromPoint(input);

    expect(prepareApplicationFormValidationBlur()).toEqual({ point: null, fallbackBlurred: true });
    expect(document.activeElement).not.toBe(input);
  });
});
