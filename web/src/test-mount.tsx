import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { setAccessToken } from "./api.js";
import { WorkbenchApp } from "./app.js";

let currentRoot: Root | null = null;

function installDomPrimitives() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, media: "", onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }),
    });
  }
  if (!("ResizeObserver" in globalThis)) {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class { observe() {} unobserve() {} disconnect() {} },
    });
  }
  const computedStyle = window.getComputedStyle.bind(window);
  Object.defineProperty(window, "getComputedStyle", {
    configurable: true,
    value: (element: Element) => computedStyle(element),
  });
  Object.defineProperty(window, "scrollTo", { configurable: true, value() {} });
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value() {} });
  }
}

export async function mountTestWorkbench(): Promise<Root> {
  installDomPrimitives();
  setAccessToken("test-token");
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById("root")!);
  currentRoot = root;
  await act(async () => {
    root.render(<ConfigProvider locale={zhCN} theme={{ zeroRuntime: true, cssVar: { key: "css-var-_R_0_" } }}><AntdApp><WorkbenchApp /></AntdApp></ConfigProvider>);
  });
  return root;
}

export async function flushReact(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

export async function cleanupTestWorkbench(): Promise<void> {
  if (currentRoot) {
    await act(async () => { currentRoot?.unmount(); });
    currentRoot = null;
  }
  document.body.replaceChildren();
}

export async function click(element: Element | null): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error("目标元素不存在");
  act(() => { element.click(); });
  await flushReact();
}

export async function input(element: Element | null, value: string): Promise<void> {
  if (!(element instanceof HTMLInputElement)) throw new Error("输入框不存在");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flushReact();
}

export function button(text: string): HTMLButtonElement {
  const candidate = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!(candidate instanceof HTMLButtonElement)) throw new Error(`按钮不存在：${text}`);
  return candidate;
}

export async function selectOption(label: string, optionText: string): Promise<void> {
  const input = document.querySelector(`[aria-label='${label}']`);
  const selector = input?.closest(".ant-select-selector") ?? input;
  if (!(selector instanceof HTMLElement)) throw new Error(`下拉框不存在：${label}`);
  act(() => { selector.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
  await flushReact();
  const option = [...document.querySelectorAll(".ant-select-item-option")].find((item) => item.textContent?.includes(optionText));
  if (!(option instanceof HTMLElement)) throw new Error(`下拉选项不存在：${optionText}`);
  act(() => {
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    option.click();
  });
  await flushReact();
}
