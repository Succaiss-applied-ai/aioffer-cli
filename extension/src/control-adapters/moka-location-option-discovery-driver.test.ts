// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DeepSeekLocationOpenObserverSnapshot,
  DeepSeekLocationPreparedProbe,
  DeepSeekLocationReadback,
  DeepSeekLocationTargetProbe
} from "./deepseek-location-driver.js";
import { executeMokaLocationOptionDiscoveryDriver } from "./moka-location-option-discovery-driver.js";

type ScriptInput = { func: { name: string }; args?: unknown[] };

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

const optionProbe = (): DeepSeekLocationTargetProbe => ({
  status: "leaf_missing",
  controlPoint: { x: 120, y: 80, tagName: "INPUT", className: "sd-Input-input" },
  leafPoint: null,
  popupCount: 1,
  matchingLeafCount: 0,
  availableOptions: ["杭州市"]
});

const openObserver = (): DeepSeekLocationOpenObserverSnapshot => ({
  armed: true,
  popupEverOpened: true,
  popupOpen: true,
  popupCount: 1,
  matchingLeafCount: 0,
  transitionCount: 1
});

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Moka location option-discovery Driver", () => {
  it("replaces obsolete options with the latest stable surface and keeps lists over 20", async () => {
    const options = Array.from({ length: 50 }, (_, i) => `城市${i}`);
    let reads = 0;
    const readbacks = [
      { actual: "", validationCleared: false, popupClosed: true },
      { actual: "", validationCleared: false, popupClosed: false },
      { actual: "", validationCleared: false, popupClosed: true }
    ];
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => readbacks.shift(),
      inspectDeepSeekLocationTargetInPage: input => {
        if (input.args?.[2] === "prepare_open") return preparedProbe();
        reads++;
        return reads <= 2 ? closedProbe() : { ...optionProbe(), availableOptions: reads === 3 ? ["旧选项"] : options };
      },
      armDeepSeekLocationOpenObserverInPage: openObserver,
      readDeepSeekLocationOpenObserverInPage: openObserver,
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });
    const result = await executeMokaLocationOptionDiscoveryDriver({
      tabId: 11, selector: "#city-input", prepareSurface: async () => {},
      clickPoint: async () => {}, closePopup: async () => true, wait: async () => {}
    });
    expect(result.success).toBe(true);
    expect(result.options).toEqual(options);
    expect(result.diagnostics.ledger.leafClickCount).toBe(0);
  });
  it("opens once, returns only live city leaves, and closes without selecting or changing the field", async () => {
    let ordinaryInspectCount = 0;
    const readbacks: DeepSeekLocationReadback[] = [
      { actual: "", validationCleared: false, popupClosed: true },
      { actual: "", validationCleared: false, popupClosed: false },
      { actual: "", validationCleared: false, popupClosed: true }
    ];
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => readbacks.shift() ?? null,
      inspectDeepSeekLocationTargetInPage: (input) => {
        if (input.args?.[2] === "prepare_open") return preparedProbe();
        ordinaryInspectCount += 1;
        return ordinaryInspectCount <= 1 ? closedProbe() : ordinaryInspectCount === 2
          ? closedProbe()
          : optionProbe();
      },
      armDeepSeekLocationOpenObserverInPage: openObserver,
      readDeepSeekLocationOpenObserverInPage: openObserver,
      disarmDeepSeekLocationOpenObserverInPage: () => true
    });
    const prepareSurface = vi.fn(async () => undefined);
    const clickPoint = vi.fn(async () => undefined);
    const closePopup = vi.fn(async () => true);

    const result = await executeMokaLocationOptionDiscoveryDriver({
      tabId: 11,
      selector: "#city-input",
      attemptId: "linctex-options-success",
      prepareSurface,
      clickPoint,
      closePopup,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      success: true,
      stage: "readback",
      options: ["杭州市"],
      readback: { actual: "", validationCleared: false, popupClosed: true },
      diagnostics: {
        schemaVersion: "moka-location-option-discovery-diagnostic.v1",
        failureCode: null,
        availableOptions: ["杭州市"],
        ledger: {
          prepareSurfaceCount: 1,
          scrollCount: 1,
          openAttemptCount: 1,
          openClickCount: 1,
          closeAttemptCount: 1,
          closeClickCount: 1,
          leafClickCount: 0,
          nativeEventClickCount: 0,
          trustedPointerClickCount: 2,
          retryCount: 0,
          reloadCount: 0
        }
      }
    });
    expect(prepareSurface).toHaveBeenCalledTimes(1);
    expect(clickPoint).toHaveBeenCalledTimes(1);
    expect(closePopup).toHaveBeenCalledTimes(1);
  });

  it("does not open a field that already contains a city", async () => {
    installChromeScriptHarness({
      readDeepSeekLocationInPage: () => ({
        actual: "杭州市",
        validationCleared: true,
        popupClosed: true
      })
    });
    const prepareSurface = vi.fn(async () => undefined);
    const clickPoint = vi.fn(async () => undefined);
    const closePopup = vi.fn(async () => true);

    const result = await executeMokaLocationOptionDiscoveryDriver({
      tabId: 11,
      selector: "#city-input",
      prepareSurface,
      clickPoint,
      closePopup,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      success: false,
      stage: "detect",
      diagnostics: { failureCode: "preexisting_value" }
    });
    expect(prepareSurface).not.toHaveBeenCalled();
    expect(clickPoint).not.toHaveBeenCalled();
    expect(closePopup).not.toHaveBeenCalled();
  });
});
