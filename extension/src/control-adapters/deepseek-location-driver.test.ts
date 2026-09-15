// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  armDeepSeekLocationOpenObserverInPage,
  clickDeepSeekLocationCommitInPage,
  clickDeepSeekLocationControlInPage,
  clickDeepSeekLocationLeafInPage,
  deepSeekLocationReadbackMatches,
  disarmDeepSeekLocationOpenObserverInPage,
  executeDeepSeekLocationDriver,
  inspectDeepSeekLocationCommitPointInPage,
  inspectDeepSeekLocationTargetInPage,
  isDeepSeekLocationApplicationUrl,
  isDeepSeekLocationField,
  isDeepSeekLocationInteractionFailure,
  normalizeDeepSeekLocation,
  readDeepSeekLocationInPage,
  readDeepSeekLocationOpenObserverInPage,
  type DeepSeekLocationOpenObserverSnapshot,
  type DeepSeekLocationPreparedProbe,
  type DeepSeekLocationReadback,
  type DeepSeekLocationTargetProbe
} from "./deepseek-location-driver.js";

const html = String.raw;

it("discovers every current city leaf including the 21st without province headers", async () => {
  installDeepSeekCityFixture();
  const menu = document.querySelector(".sd-Menu-content-bDquM")!;
  for (let i = 0; i < 25; i++) {
    const item = document.createElement("div");
    item.className = "sd-Menu-content-item-3BOO1";
    const label = document.createElement("div");
    label.className = "option-label-p2B4X";
    label.textContent = `测试城市${i}`;
    item.append(label);
    menu.append(item);
  }
  const probe = await inspectDeepSeekLocationTargetInPage("#city-input", "不存在");
  expect(probe.availableOptions).toHaveLength(27);
  expect(probe.availableOptions.at(-1)).toBe("测试城市24");
  expect(probe.availableOptions.filter(value => value === "北京市")).toHaveLength(1);
});

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  if (!("innerText" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() { return this.textContent ?? ""; },
      set(value: string) { this.textContent = value; }
    });
  }
  if (!("scrollIntoView" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined
    });
  }
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const element = this as HTMLElement;
    const top = Number(element.dataset.top ?? 20);
    const left = Number(element.dataset.left ?? 20);
    const width = Number(element.dataset.width ?? 200);
    const height = Number(element.dataset.height ?? 32);
    return {
      x: left, y: top, top, left, right: left + width, bottom: top + height,
      width, height, toJSON: () => ({ top, left, width, height })
    } as DOMRect;
  });
  document.elementFromPoint = vi.fn((x: number, y: number) => {
    const candidates = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
          style.visibility !== "hidden" && x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom;
      });
    return candidates.at(-1) ?? null;
  });
});

function installDeepSeekCityFixture(popupOpen = true) {
  document.body.innerHTML = html`
    <div class="apply-field-Q2iJ7 Select-oqOV0" data-top="20" data-left="20" data-width="300" data-height="180">
      <div class="title-IWWQ0Xa4L7" data-top="20" data-left="20" data-width="120" data-height="24">
        <span data-top="20" data-left="20" data-width="120" data-height="24">
          <span data-top="20" data-left="20" data-width="120" data-height="24">意向工作城市</span>
        </span>
      </div>
      <div class="sd-Dropdown-container-1CigZ" data-top="50" data-left="20" data-width="287" data-height="40">
        <label class="sd-Input-container sd-Select-container-1Eq4x" data-top="50" data-left="20" data-width="287" data-height="40">
          <span class="sd-Input-display-value" data-top="55" data-left="20" data-width="287" data-height="30">
            <span id="city-display" data-top="55" data-left="20" data-width="120" data-height="30">请选择</span>
          </span>
          <input id="city-input" class="sd-Input-input-10L0t" placeholder="选择意向工作城市"
            data-top="50" data-left="20" data-width="287" data-height="40" />
        </label>
        <div class="sd-Dropdown-dropdown-GmACl" style="display:${popupOpen ? "block" : "none"}"
          data-top="90" data-left="20" data-width="287" data-height="152">
          <div class="sd-Menu-container-2WPiF" data-top="98" data-left="20" data-width="287" data-height="68">
            <div id="province-header" class="sd-Menu-header-1n9A0" data-top="98" data-left="20" data-width="287" data-height="32">北京市</div>
            <div class="sd-Select-common-item-3YCIH" data-top="130" data-left="20" data-width="287" data-height="36">
              <div class="sd-Menu-container-1WISQ" data-top="130" data-left="20" data-width="287" data-height="36">
                <div class="sd-Menu-content-bDquM" data-top="138" data-left="36" data-width="259" data-height="20">
                  <div id="city-item" class="sd-Menu-content-item-3BOO1" data-top="138" data-left="36" data-width="251" data-height="20">
                    <div id="city-leaf" class="option-label-p2B4X" data-top="138" data-left="36" data-width="251" data-height="20">北京市</div>
                  </div>
                  <div id="hangzhou-item" class="sd-Menu-content-item-3BOO1" data-top="162" data-left="36" data-width="251" data-height="20">
                    <div id="hangzhou-leaf" class="option-label-p2B4X" data-top="162" data-left="36" data-width="251" data-height="20">杭州市</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="city-error" class="error-message" data-top="244" data-left="20" data-width="160" data-height="24">必填项未填写</div>
    </div>
  `;
}

const closedProbe = (): DeepSeekLocationTargetProbe => ({
  status: "popup_closed",
  controlPoint: { x: 120, y: 80, tagName: "INPUT", className: "sd-Input-input" },
  leafPoint: null,
  popupCount: 0,
  matchingLeafCount: 0,
  availableOptions: []
});

const preparedProbe = (): DeepSeekLocationPreparedProbe => ({
  ...closedProbe(),
  scrolled: true
});

const readyProbe = (): DeepSeekLocationTargetProbe => ({
  status: "ready",
  controlPoint: { x: 120, y: 80, tagName: "INPUT", className: "sd-Input-input" },
  leafPoint: { x: 170, y: 160, tagName: "DIV", className: "option-label" },
  popupCount: 1,
  matchingLeafCount: 1,
  availableOptions: ["北京市", "杭州市"]
});

const leafMissingProbe = (): DeepSeekLocationTargetProbe => ({
  status: "leaf_missing",
  controlPoint: { x: 120, y: 80, tagName: "INPUT", className: "sd-Input-input" },
  leafPoint: null,
  popupCount: 1,
  matchingLeafCount: 0,
  availableOptions: ["北京市", "杭州市"]
});

const observer = (patch: Partial<DeepSeekLocationOpenObserverSnapshot> = {}): DeepSeekLocationOpenObserverSnapshot => ({
  armed: true,
  popupEverOpened: true,
  popupOpen: true,
  popupCount: 1,
  matchingLeafCount: 1,
  transitionCount: 1,
  ...patch
});

type ScriptInput = { func: { name: string }; args?: unknown[] };

function installChromeScriptHarness(
  handlers: Record<string, (input: ScriptInput) => unknown | Promise<unknown>>
) {
  const executeScript = vi.fn(async (input: ScriptInput) => {
    const handler = handlers[input.func.name];
    return [{ result: handler ? await handler(input) : null }];
  });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { scripting: { executeScript } }
  });
  return executeScript;
}

function probeByMode(observe: () => DeepSeekLocationTargetProbe) {
  return (input: ScriptInput) => input.args?.[2] === "prepare_open" ? preparedProbe() : observe();
}

function trustedDriverActions() {
  return {
    prepareSurface: vi.fn(async () => undefined),
    clickPoint: vi.fn(async () => undefined),
    commitSelection: vi.fn(async () => true)
  };
}

describe("DeepSeek location Driver v3 page protocol", () => {
  it("matches only the exact DeepSeek application family and location field", () => {
    expect(isDeepSeekLocationApplicationUrl(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/job-1/apply"
    )).toBe(true);
    expect(isDeepSeekLocationApplicationUrl(
      "https://app.mokahr.com/social-recruitment/other/140576#/job/job-1/apply"
    )).toBe(false);
    expect(isDeepSeekLocationField({ label: "意向工作城市", semanticKey: "preferences.preferredCity" })).toBe(true);
    expect(isDeepSeekLocationField({ label: "招聘渠道" })).toBe(false);
  });

  it("normalizes only administrative suffixes and requires an exact city", () => {
    expect(normalizeDeepSeekLocation("北京市")).toBe("北京");
    expect(deepSeekLocationReadbackMatches("北京市", "北京")).toBe(true);
    expect(deepSeekLocationReadbackMatches("北京市杭州市", "北京市")).toBe(false);
  });

  it("keeps ordinary inspection mutation-free while selecting only the city leaf", async () => {
    installDeepSeekCityFixture(true);
    const probe = await inspectDeepSeekLocationTargetInPage("#city-input", "北京市");
    expect(probe).toMatchObject({
      status: "ready",
      popupCount: 1,
      matchingLeafCount: 1,
      leafPoint: { x: 161.5, y: 148, className: expect.stringContaining("option-label") }
    });
    expect(probe.leafPoint?.y).not.toBe(114);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("reports the live city leaves when the requested city is unavailable", async () => {
    installDeepSeekCityFixture(true);
    const input = document.querySelector<HTMLInputElement>("#city-input")!;
    const before = input.value;
    await expect(inspectDeepSeekLocationTargetInPage("#city-input", "深圳市")).resolves.toMatchObject({
      status: "leaf_missing",
      popupCount: 1,
      matchingLeafCount: 0,
      availableOptions: ["北京市", "杭州市"]
    });
    expect(input.value).toBe(before);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("matches the unique bilingual city leaf by two Han characters and commits its bilingual title", async () => {
    installDeepSeekCityFixture(true);
    document.querySelector("#city-leaf")!.textContent = "北京市 / Beijing";
    document.querySelector("#province-header")!.textContent = "北京市 / Beijing";
    document.querySelector(".title-IWWQ0Xa4L7 span span")!.textContent = "意向工作城市 / Preferred work city";
    await expect(inspectDeepSeekLocationTargetInPage("#city-input", "北京", "observe", "北京"))
      .resolves.toMatchObject({ status: "ready", matchingLeafCount: 1,
        availableOptions: ["北京市 / Beijing", "杭州市"] });
    expect(armDeepSeekLocationOpenObserverInPage("#city-input", "北京", "bilingual", "北京"))
      .toMatchObject({ popupOpen: true, matchingLeafCount: 1 });
    disarmDeepSeekLocationOpenObserverInPage("bilingual");
    expect(inspectDeepSeekLocationCommitPointInPage("#city-input")).toMatchObject({ tagName: "DIV" });
  });

  it("rejects two different live leaves containing the same city prefix", async () => {
    installDeepSeekCityFixture(true);
    document.querySelector("#city-leaf")!.textContent = "北京市 / Beijing";
    document.querySelector("#hangzhou-leaf")!.textContent = "北京经济开发区";
    await expect(inspectDeepSeekLocationTargetInPage("#city-input", "北京市", "observe", "北京"))
      .resolves.toMatchObject({ status: "leaf_ambiguous", matchingLeafCount: 2, leafPoint: null });
    expect(document.querySelector<HTMLInputElement>("#city-input")!.value).toBe("");
  });

  it("never borrows an unrelated popup for city discovery or its open observer", async () => {
    installDeepSeekCityFixture(false);
    const foreign = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown-GmACl")!.cloneNode(true) as HTMLElement;
    foreign.style.display = "block";
    document.body.append(foreign);
    await expect(inspectDeepSeekLocationTargetInPage("#city-input", "北京", "observe", "北京"))
      .resolves.toMatchObject({ popupCount: 0, availableOptions: [], matchingLeafCount: 0 });
    expect(armDeepSeekLocationOpenObserverInPage("#city-input", "北京", "foreign", "北京"))
      .toMatchObject({ popupOpen: false, popupCount: 0, matchingLeafCount: 0 });
    disarmDeepSeekLocationOpenObserverInPage("foreign");
  });

  it("opens and selects through one bubbling page-native click per target without writing the input value", async () => {
    installDeepSeekCityFixture(false);
    const input = document.querySelector<HTMLInputElement>("#city-input")!;
    const selectLabel = input.closest<HTMLElement>("[class*='Select-container']")!;
    const popup = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown-GmACl")!;
    const leaf = document.querySelector<HTMLElement>("#city-leaf")!;
    const menuItem = leaf.closest<HTMLElement>("[class*='Menu-content-item']")!;
    const display = document.querySelector<HTMLElement>("#city-display")!;
    const inputClicks = vi.fn(() => { popup.style.display = "block"; });
    const leafClicks = vi.fn(() => {
      display.innerText = "北京市";
      input.placeholder = "";
      popup.style.display = "none";
      document.querySelector("#city-error")?.remove();
    });
    // The current Moka Select binds its open handler on the Input label and
    // its select handler on the Menu item. HTMLElement.click() on the exact
    // input/leaf must bubble to those component-owned handlers once.
    selectLabel.addEventListener("click", inputClicks);
    menuItem.addEventListener("click", leafClicks);

    expect(clickDeepSeekLocationControlInPage("#city-input")).toMatchObject({
      clicked: true,
      status: "clicked",
      targetTagName: "INPUT"
    });
    expect(inputClicks).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
    expect(clickDeepSeekLocationLeafInPage("#city-input", "北京市")).toMatchObject({
      clicked: true,
      status: "clicked",
      matchingLeafCount: 1,
      targetClassName: expect.stringContaining("option-label")
    });
    expect(leafClicks).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
    expect(readDeepSeekLocationInPage("#stale-input")).toEqual({
      actual: "北京市",
      validationCleared: true,
      popupClosed: true
    });
  });

  it("uses one page-native title event for an optional commit", () => {
    installDeepSeekCityFixture(false);
    document.querySelector<HTMLElement>("#city-display")!.innerText = "北京市";
    document.querySelector<HTMLInputElement>("#city-input")!.placeholder = "";
    const title = document.querySelector<HTMLElement>(".title-IWWQ0Xa4L7")!;
    const commitClicks = vi.fn(() => document.querySelector("#city-error")?.remove());
    title.addEventListener("click", commitClicks);
    expect(clickDeepSeekLocationCommitInPage("#stale-input")).toMatchObject({
      clicked: true,
      status: "clicked",
      targetClassName: expect.stringContaining("title-IWWQ0Xa4L7")
    });
    expect(commitClicks).toHaveBeenCalledTimes(1);
    expect(readDeepSeekLocationInPage("#stale-input").validationCleared).toBe(true);
  });

  it("performs the smooth-scroll stabilization exactly once in prepare_open", async () => {
    installDeepSeekCityFixture(false);
    const input = document.querySelector<HTMLInputElement>("#city-input")!;
    input.dataset.top = "-653";
    let frames = 0;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames += 1;
      if (frames === 2) input.dataset.top = "194";
      callback(frames * 16);
      return frames;
    });

    const prepared = await inspectDeepSeekLocationTargetInPage("#city-input", "北京市", "prepare_open");
    expect(prepared).toMatchObject({
      status: "popup_closed",
      scrolled: true,
      controlPoint: { x: 163.5, y: 214 }
    });
    expect(frames).toBe(2);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);

    await inspectDeepSeekLocationTargetInPage("#city-input", "北京市");
    await inspectDeepSeekLocationTargetInPage("#city-input", "北京市");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("records a transient popup open and close between service-worker polls", async () => {
    installDeepSeekCityFixture(false);
    const popup = document.querySelector<HTMLElement>(".sd-Dropdown-dropdown-GmACl")!;
    expect(armDeepSeekLocationOpenObserverInPage("#city-input", "北京市", "attempt-transient"))
      .toMatchObject({ armed: true, popupEverOpened: false });
    popup.style.display = "block";
    await Promise.resolve();
    popup.style.display = "none";
    await Promise.resolve();
    expect(readDeepSeekLocationOpenObserverInPage("attempt-transient")).toMatchObject({
      armed: true,
      popupEverOpened: true,
      popupOpen: false,
      popupCount: 0
    });
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(disarmDeepSeekLocationOpenObserverInPage("attempt-transient")).toBe(true);
  });

  it("fails closed for duplicate leaves and unrelated selects", async () => {
    installDeepSeekCityFixture(true);
    const duplicate = document.querySelector("#city-leaf")!.cloneNode(true) as HTMLElement;
    duplicate.id = "city-leaf-duplicate";
    duplicate.dataset.top = "170";
    document.querySelector("#city-item")!.append(duplicate);
    await expect(inspectDeepSeekLocationTargetInPage("#city-input", "北京市")).resolves.toMatchObject({
      status: "leaf_ambiguous",
      matchingLeafCount: 2,
      leafPoint: null
    });

    document.body.innerHTML = html`
      <div class="sd-Dropdown-container"><label class="sd-Select-container">
        <input id="unrelated" placeholder="请选择招聘渠道" />
      </label></div>
    `;
    await expect(inspectDeepSeekLocationTargetInPage("#unrelated", "北京市")).resolves.toMatchObject({
      status: "control_missing"
    });
  });

  it("fails closed before dispatching an event when two semantic location controls are visible", () => {
    installDeepSeekCityFixture(false);
    const duplicate = document.querySelector<HTMLElement>(".apply-field-Q2iJ7")!.cloneNode(true) as HTMLElement;
    duplicate.querySelector<HTMLInputElement>("#city-input")!.id = "city-input-duplicate";
    duplicate.dataset.top = "280";
    document.body.append(duplicate);
    const firstControlClick = vi.fn();
    const secondControlClick = vi.fn();
    document.querySelector<HTMLInputElement>("#city-input")!.addEventListener("click", firstControlClick);
    duplicate.querySelector<HTMLInputElement>("#city-input-duplicate")!.addEventListener("click", secondControlClick);

    expect(clickDeepSeekLocationControlInPage("#city-input")).toMatchObject({
      clicked: false,
      status: "control_ambiguous"
    });
    expect(firstControlClick).not.toHaveBeenCalled();
    expect(secondControlClick).not.toHaveBeenCalled();
  });

  it("rebinds after React replacement and collapses one nested title chain", async () => {
    installDeepSeekCityFixture(true);
    await expect(inspectDeepSeekLocationTargetInPage("#stale-input", "北京市")).resolves.toMatchObject({ status: "ready" });
    document.querySelector<HTMLInputElement>("#city-input")!.placeholder = "";
    expect(inspectDeepSeekLocationCommitPointInPage("#stale-input")).toMatchObject({
      tagName: "DIV",
      className: expect.stringContaining("title-IWWQ0Xa4L7")
    });
    const duplicate = document.createElement("div");
    duplicate.innerText = "意向工作城市";
    duplicate.dataset.top = "170";
    document.querySelector(".apply-field-Q2iJ7")!.append(duplicate);
    expect(inspectDeepSeekLocationCommitPointInPage("#stale-input")).toBeNull();
  });

  it("accepts only display match, closed popup and cleared validation", () => {
    installDeepSeekCityFixture(false);
    document.querySelector("#city-error")?.remove();
    document.querySelector<HTMLElement>("#city-display")!.innerText = "北京市";
    document.querySelector<HTMLInputElement>("#city-input")!.placeholder = "";
    expect(readDeepSeekLocationInPage("#stale-input")).toEqual({
      actual: "北京市",
      validationCleared: true,
      popupClosed: true
    });
  });
});

describe("DeepSeek location Driver v4 state machine", () => {
  it("selects the unique expected leaf from the popup left open by option-unavailable discovery", async () => {
    const readbacks: DeepSeekLocationReadback[] = [
      { actual: "", validationCleared: false, popupClosed: false },
      { actual: "上海市", validationCleared: true, popupClosed: true }
    ];
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => readbacks.shift() ?? null,
      inspectDeepSeekLocationTargetInPage: () => ({
        ...readyProbe(),
        availableOptions: ["上海市"]
      })
    });
    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "上海市",
      attemptId: "attempt-preopened-sole-option",
      allowPreopenedExpectedLeaf: true,
      ...actions,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: true, actual: "上海市" });
    expect(actions.prepareSurface).toHaveBeenCalledTimes(1);
    expect(actions.clickPoint).toHaveBeenCalledTimes(1);
    expect(actions.commitSelection).not.toHaveBeenCalled();
    expect(result.diagnostics.ledger).toMatchObject({
      openClickCount: 0,
      leafClickCount: 1,
      trustedPointerClickCount: 1,
      retryCount: 0
    });
  });

  it("uses one focus-emulated trusted open and leaf click with a zero-retry ledger", async () => {
    let inspectCount = 0;
    const readbacks: DeepSeekLocationReadback[] = [
      { actual: "", validationCleared: false, popupClosed: true },
      { actual: "北京市", validationCleared: true, popupClosed: true }
    ];
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => readbacks.shift() ?? null,
      inspectDeepSeekLocationTargetInPage: probeByMode(() => (++inspectCount <= 2 ? closedProbe() : readyProbe())),
      armDeepSeekLocationOpenObserverInPage: observer,
      readDeepSeekLocationOpenObserverInPage: observer,
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });

    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "北京",
      attemptId: "attempt-success",
      ...actions,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ success: true, stage: "readback", actual: "北京市" });
    expect(actions.prepareSurface).toHaveBeenCalledTimes(1);
    expect(actions.clickPoint).toHaveBeenCalledTimes(2);
    expect(actions.commitSelection).not.toHaveBeenCalled();
    expect(result.diagnostics).toMatchObject({
      schemaVersion: "deepseek-location-driver-diagnostic.v4",
      eventMechanism: "cdp_trusted_pointer_focus_emulation",
      attemptId: "attempt-success",
      failureCode: null,
      ledger: {
        prepareSurfaceCount: 1,
        scrollCount: 1,
        openAttemptCount: 1,
        openClickCount: 1,
        leafAttemptCount: 1,
        leafClickCount: 1,
        commitClickCount: 0,
        nativeEventClickCount: 0,
        trustedPointerClickCount: 2,
        retryCount: 0,
        reloadCount: 0,
        fullFormRestartCount: 0
      }
    });
  });

  it("distinguishes opened-then-closed and never sends a second open event", async () => {
    let inspectCount = 0;
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => ({ actual: "", validationCleared: false, popupClosed: true }),
      inspectDeepSeekLocationTargetInPage: probeByMode(() => {
        inspectCount += 1;
        return closedProbe();
      }),
      armDeepSeekLocationOpenObserverInPage: () => observer({ popupEverOpened: false, popupOpen: false, popupCount: 0 }),
      readDeepSeekLocationOpenObserverInPage: () => observer({ popupEverOpened: true, popupOpen: false, popupCount: 0 }),
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });
    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "北京",
      attemptId: "attempt-closed",
      ...actions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: false,
      stage: "open",
      diagnostics: { failureCode: "open_then_closed" }
    });
    expect(isDeepSeekLocationInteractionFailure(result.error)).toBe(true);
    expect(actions.clickPoint).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.ledger).toMatchObject({ openClickCount: 1, leafClickCount: 0, retryCount: 0 });
    expect(inspectCount).toBe(3);
  });

  it("returns open_event_not_observed after one trusted event and read-only polling", async () => {
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => ({ actual: "", validationCleared: false, popupClosed: true }),
      inspectDeepSeekLocationTargetInPage: probeByMode(closedProbe),
      armDeepSeekLocationOpenObserverInPage: () => observer({ popupEverOpened: false, popupOpen: false, popupCount: 0 }),
      readDeepSeekLocationOpenObserverInPage: () => observer({ popupEverOpened: false, popupOpen: false, popupCount: 0 }),
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });
    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "北京",
      attemptId: "attempt-never-opened",
      ...actions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: false,
      stage: "open",
      diagnostics: {
        failureCode: "open_event_not_observed",
        ledger: { openClickCount: 1, leafClickCount: 0, observerPollCount: 30, retryCount: 0 }
      }
    });
    expect(actions.clickPoint).toHaveBeenCalledTimes(1);
  });

  it("keeps live options on leaf_missing without clicking or typing a replacement", async () => {
    let inspectCount = 0;
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => ({ actual: "", validationCleared: false, popupClosed: true }),
      inspectDeepSeekLocationTargetInPage: probeByMode(
        () => (++inspectCount <= 2 ? closedProbe() : leafMissingProbe())
      ),
      armDeepSeekLocationOpenObserverInPage: observer,
      readDeepSeekLocationOpenObserverInPage: () => observer({ matchingLeafCount: 0 }),
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });
    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "深圳市",
      attemptId: "attempt-option-unavailable",
      ...actions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: false,
      stage: "select",
      availableOptions: ["北京市", "杭州市"],
      diagnostics: {
        failureCode: "leaf_missing",
        availableOptions: ["北京市", "杭州市"],
        ledger: { openClickCount: 1, leafClickCount: 0, commitClickCount: 0 }
      }
    });
    expect(actions.clickPoint).toHaveBeenCalledTimes(1);
    expect(actions.commitSelection).not.toHaveBeenCalled();
  });

  it("commits an already selected city without reopening or reselecting it", async () => {
    const readbacks: DeepSeekLocationReadback[] = [
      { actual: "北京市", validationCleared: false, popupClosed: true },
      { actual: "北京市", validationCleared: true, popupClosed: true }
    ];
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => readbacks.shift() ?? null
    });
    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "北京",
      attemptId: "attempt-preselected",
      ...actions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({ success: true, actual: "北京市" });
    expect(actions.prepareSurface).toHaveBeenCalledTimes(1);
    expect(actions.clickPoint).not.toHaveBeenCalled();
    expect(actions.commitSelection).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.ledger).toMatchObject({
      scrollCount: 0,
      openClickCount: 0,
      leafClickCount: 0,
      commitAttemptCount: 1,
      commitClickCount: 1,
      nativeEventClickCount: 0,
      trustedPointerClickCount: 1,
      retryCount: 0
    });
  });

  it("fails on a different pre-existing city without overwriting it", async () => {
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => ({ actual: "上海市", validationCleared: true, popupClosed: true })
    });
    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "北京",
      attemptId: "attempt-mismatch",
      ...actions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: false,
      stage: "readback",
      diagnostics: { failureCode: "preexisting_value_mismatch" }
    });
    expect(actions.prepareSurface).not.toHaveBeenCalled();
    expect(actions.clickPoint).not.toHaveBeenCalled();
    expect(actions.commitSelection).not.toHaveBeenCalled();
  });

  it("returns driver_interrupted if the armed observer disappears", async () => {
    let inspectCount = 0;
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => ({ actual: "", validationCleared: false, popupClosed: true }),
      inspectDeepSeekLocationTargetInPage: probeByMode(() => (++inspectCount <= 2 ? closedProbe() : readyProbe())),
      armDeepSeekLocationOpenObserverInPage: observer,
      readDeepSeekLocationOpenObserverInPage: () => observer({ armed: false }),
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });
    const actions = trustedDriverActions();
    const result = await executeDeepSeekLocationDriver({
      tabId: 7,
      selector: "#city-input",
      expected: "北京",
      attemptId: "attempt-interrupted",
      ...actions,
      wait: async () => undefined
    });
    expect(result).toMatchObject({
      success: false,
      diagnostics: { failureCode: "driver_interrupted", ledger: { openClickCount: 1, retryCount: 0 } }
    });
    expect(actions.clickPoint).toHaveBeenCalledTimes(1);
  });

  it("does not report stale choices when a previously nonempty menu becomes empty", async () => {
    let reads = 0;
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => ({ actual: "", validationCleared: false, popupClosed: true }),
      inspectDeepSeekLocationTargetInPage: probeByMode(() => {
        reads++;
        return reads <= 2 ? closedProbe() : { ...leafMissingProbe(), availableOptions: reads === 3 ? ["旧城市"] : [] };
      }),
      armDeepSeekLocationOpenObserverInPage: observer,
      readDeepSeekLocationOpenObserverInPage: observer,
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });
    const result = await executeDeepSeekLocationDriver({
      tabId: 7, selector: "#city-input", expected: "深圳", ...trustedDriverActions(), wait: async () => {}
    });
    expect(result.success).toBe(false);
    expect(result.availableOptions).toEqual([]);
  });
});
