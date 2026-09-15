import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import {
  DEEPSEEK_LOCATION_INTERACTION_FAILED,
  armDeepSeekLocationOpenObserverInPage,
  disarmDeepSeekLocationOpenObserverInPage,
  inspectDeepSeekLocationTargetInPage,
  readDeepSeekLocationInPage,
  readDeepSeekLocationOpenObserverInPage,
  type DeepSeekLocationOpenObserverSnapshot,
  type DeepSeekLocationPoint,
  type DeepSeekLocationPreparedProbe,
  type DeepSeekLocationReadback,
  type DeepSeekLocationTargetProbe
} from "./deepseek-location-driver.js";

const DISCOVERY_SENTINEL = "__recruiting_ai_discover_options_only__";

export type MokaLocationOptionDiscoveryStage =
  | "detect"
  | "prepare_open"
  | "open"
  | "close"
  | "readback";

export type MokaLocationOptionDiscoveryFailureCode =
  | "control_missing"
  | "control_ambiguous"
  | "control_not_clickable"
  | "preexisting_value"
  | "unexpected_popup_state"
  | "open_target_stale"
  | "open_event_dispatch_failed"
  | "open_event_not_observed"
  | "open_then_closed"
  | "popup_ambiguous"
  | "options_missing"
  | "close_target_missing"
  | "close_event_dispatch_failed"
  | "close_not_observed"
  | "readback_unavailable"
  | "value_changed"
  | "driver_interrupted";

export interface MokaLocationOptionDiscoveryLedger {
  prepareSurfaceCount: number;
  scrollCount: number;
  openAttemptCount: number;
  openClickCount: number;
  closeAttemptCount: number;
  closeClickCount: number;
  observerPollCount: number;
  readbackPollCount: number;
  leafClickCount: 0;
  nativeEventClickCount: 0;
  trustedPointerClickCount: number;
  retryCount: 0;
  reloadCount: 0;
}

export interface MokaLocationOptionDiscoveryDiagnostics {
  schemaVersion: "moka-location-option-discovery-diagnostic.v1";
  eventMechanism: "cdp_trusted_pointer_focus_emulation";
  attemptId: string;
  failureCode: MokaLocationOptionDiscoveryFailureCode | null;
  availableOptions: string[];
  ledger: MokaLocationOptionDiscoveryLedger;
}

export interface MokaLocationOptionDiscoveryResult {
  success: boolean;
  stage: MokaLocationOptionDiscoveryStage;
  options: string[];
  error: string | null;
  readback: DeepSeekLocationReadback;
  diagnostics: MokaLocationOptionDiscoveryDiagnostics;
}

export interface MokaLocationOptionDiscoveryInput {
  tabId: number;
  selector: string;
  attemptId?: string;
  prepareSurface(): Promise<void>;
  clickPoint(point: DeepSeekLocationPoint): Promise<void>;
  closePopup(): Promise<boolean>;
  wait(milliseconds: number): Promise<void>;
}

function emptyDiscoveryLedger(): MokaLocationOptionDiscoveryLedger {
  return {
    prepareSurfaceCount: 0,
    scrollCount: 0,
    openAttemptCount: 0,
    openClickCount: 0,
    closeAttemptCount: 0,
    closeClickCount: 0,
    observerPollCount: 0,
    readbackPollCount: 0,
    leafClickCount: 0,
    nativeEventClickCount: 0,
    trustedPointerClickCount: 0,
    retryCount: 0,
    reloadCount: 0
  };
}

/**
 * Opens one registered Moka work-city control, reads only its city leaves and
 * closes it again without choosing an option or changing the field value.
 */
export async function executeMokaLocationOptionDiscoveryDriver(
  input: MokaLocationOptionDiscoveryInput
): Promise<MokaLocationOptionDiscoveryResult> {
  const attemptId = input.attemptId ?? (typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `moka-location-options-${Date.now()}`);
  const ledger = emptyDiscoveryLedger();
  let observerArmed = false;
  let popupEverOpened = false;
  let availableOptions: string[] = [];
  const emptyReadback: DeepSeekLocationReadback = {
    actual: "",
    validationCleared: false,
    popupClosed: true
  };
  const remember = (options: string[] | undefined) => {
    if (!options) return;
    // Keep the latest complete surface, not a union containing stale options.
    availableOptions = [...new Set(options)];
  };
  const diagnostics = (
    failureCode: MokaLocationOptionDiscoveryFailureCode | null
  ): MokaLocationOptionDiscoveryDiagnostics => ({
    schemaVersion: "moka-location-option-discovery-diagnostic.v1",
    eventMechanism: "cdp_trusted_pointer_focus_emulation",
    attemptId,
    failureCode,
    availableOptions: [...availableOptions],
    ledger: { ...ledger }
  });
  const failure = (
    stage: MokaLocationOptionDiscoveryStage,
    failureCode: MokaLocationOptionDiscoveryFailureCode,
    detail: string,
    readback: DeepSeekLocationReadback = emptyReadback
  ): MokaLocationOptionDiscoveryResult => ({
    success: false,
    stage,
    options: [...availableOptions],
    error: `${DEEPSEEK_LOCATION_INTERACTION_FAILED}: [option_discovery/${stage}/${failureCode}] ${detail}`,
    readback,
    diagnostics: diagnostics(failureCode)
  });
  const success = (readback: DeepSeekLocationReadback): MokaLocationOptionDiscoveryResult => ({
    success: true,
    stage: "readback",
    options: [...availableOptions],
    error: null,
    readback,
    diagnostics: diagnostics(null)
  });
  const execute = async <T>(func: (...args: never[]) => T, args: unknown[]): Promise<T | null> => {
    const execution = await executeInterruptibleScript({
      target: { tabId: input.tabId },
      world: "MAIN",
      func,
      args
    });
    return execution[0]?.result ?? null;
  };
  const inspect = (mode: "observe" | "prepare_open" = "observe") => execute(
    inspectDeepSeekLocationTargetInPage as (...args: never[]) => Promise<DeepSeekLocationPreparedProbe>,
    [input.selector, DISCOVERY_SENTINEL, mode]
  );
  const readback = () => execute(
    readDeepSeekLocationInPage as (...args: never[]) => DeepSeekLocationReadback,
    [input.selector]
  );
  const armObserver = () => execute(
    armDeepSeekLocationOpenObserverInPage as (...args: never[]) => DeepSeekLocationOpenObserverSnapshot,
    [input.selector, DISCOVERY_SENTINEL, attemptId]
  );
  const readObserver = () => execute(
    readDeepSeekLocationOpenObserverInPage as (...args: never[]) => DeepSeekLocationOpenObserverSnapshot,
    [attemptId]
  );
  const disarmObserver = () => execute(
    disarmDeepSeekLocationOpenObserverInPage as (...args: never[]) => boolean,
    [attemptId]
  );
  const closeAndVerify = async (): Promise<{
    readback: DeepSeekLocationReadback;
    failureCode: MokaLocationOptionDiscoveryFailureCode | null;
  }> => {
    const beforeClose = await readback();
    ledger.readbackPollCount += 1;
    if (!beforeClose) return { readback: emptyReadback, failureCode: "readback_unavailable" };
    if (beforeClose.actual) return { readback: beforeClose, failureCode: "value_changed" };
    if (!beforeClose.popupClosed) {
      ledger.closeAttemptCount += 1;
      let closed = false;
      try {
        closed = await input.closePopup();
      } catch {
        return { readback: beforeClose, failureCode: "close_event_dispatch_failed" };
      }
      if (!closed) return { readback: beforeClose, failureCode: "close_target_missing" };
      ledger.closeClickCount += 1;
      ledger.trustedPointerClickCount += 1;
    }
    let latest = beforeClose;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (latest.popupClosed && !latest.actual) return { readback: latest, failureCode: null };
      await input.wait(attempt === 0 ? 120 : 160);
      ledger.readbackPollCount += 1;
      const observed = await readback();
      if (!observed) return { readback: latest, failureCode: "readback_unavailable" };
      latest = observed;
      if (latest.actual) return { readback: latest, failureCode: "value_changed" };
    }
    return { readback: latest, failureCode: "close_not_observed" };
  };

  try {
    const initialReadback = await readback();
    ledger.readbackPollCount += 1;
    if (!initialReadback) {
      return failure("readback", "readback_unavailable", "地点选项探测前没有返回站点回读");
    }
    if (initialReadback.actual) {
      return failure("detect", "preexisting_value", "地点字段已有值，选项探测不会打开或覆盖该控件", initialReadback);
    }
    if (!initialReadback.popupClosed) {
      return failure("detect", "unexpected_popup_state", "地点选项探测开始前弹层已经打开", initialReadback);
    }

    const initialProbe = await inspect();
    if (!initialProbe) return failure("detect", "driver_interrupted", "地点控件初始检查没有返回结果");
    remember(initialProbe.availableOptions);
    if (initialProbe.status === "control_missing") {
      return failure("detect", "control_missing", "没有定位到唯一的 Moka 意向工作城市控件");
    }
    if (initialProbe.status === "control_ambiguous") {
      return failure("detect", "control_ambiguous", "定位到多个 Moka 意向工作城市控件");
    }
    if (!["popup_closed", "control_not_clickable"].includes(initialProbe.status)) {
      return failure("detect", "unexpected_popup_state", `地点控件初始状态为 ${initialProbe.status}`);
    }

    ledger.prepareSurfaceCount += 1;
    await input.prepareSurface();
    const prepared = await inspect("prepare_open");
    if (!prepared) return failure("prepare_open", "driver_interrupted", "地点控件准备没有返回结果");
    remember(prepared.availableOptions);
    if (prepared.scrolled) ledger.scrollCount += 1;
    if (prepared.status !== "popup_closed" || !prepared.controlPoint) {
      const code: MokaLocationOptionDiscoveryFailureCode = prepared.status === "control_missing"
        ? "control_missing"
        : prepared.status === "control_ambiguous"
          ? "control_ambiguous"
          : prepared.status === "control_not_clickable"
            ? "control_not_clickable"
            : "unexpected_popup_state";
      return failure("prepare_open", code, `地点控件准备后状态为 ${prepared.status}`);
    }

    const armed = await armObserver();
    if (!armed?.armed) return failure("open", "driver_interrupted", "地点弹层观察器未能在打开前安装");
    observerArmed = true;
    popupEverOpened = armed.popupEverOpened;
    const liveOpenTarget = await inspect();
    if (!liveOpenTarget || liveOpenTarget.status !== "popup_closed" || !liveOpenTarget.controlPoint) {
      return failure("open", "open_target_stale", "可信点击前地点控件状态已变化");
    }
    ledger.openAttemptCount += 1;
    try {
      await input.clickPoint(liveOpenTarget.controlPoint);
    } catch (error) {
      return failure(
        "open",
        "open_event_dispatch_failed",
        `唯一可信打开事件发送失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
    ledger.openClickCount += 1;
    ledger.trustedPointerClickCount += 1;

    let stableOptionReads = 0;
    let previousOptionSignature = "";
    let latestProbe: DeepSeekLocationTargetProbe | null = liveOpenTarget;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await input.wait(attempt === 0 ? 120 : 180);
      ledger.observerPollCount += 1;
      const observer = await readObserver();
      if (!observer?.armed) {
        const closed = await closeAndVerify();
        return failure("open", "driver_interrupted", "地点弹层观察器在打开后丢失", closed.readback);
      }
      popupEverOpened ||= observer.popupEverOpened;
      latestProbe = await inspect();
      if (!latestProbe) {
        const closed = await closeAndVerify();
        return failure("open", "driver_interrupted", "地点弹层只读检查没有返回结果", closed.readback);
      }
      remember(latestProbe.availableOptions);
      if (latestProbe.popupCount > 1 || latestProbe.status === "popup_ambiguous") {
        const closed = await closeAndVerify();
        return failure("open", "popup_ambiguous", "地点点击后出现多个无法归属的弹层", closed.readback);
      }
      if (popupEverOpened && latestProbe.status === "popup_closed") {
        return failure("open", "open_then_closed", "地点弹层打开后在选项读取完成前关闭");
      }
      if (latestProbe.popupCount === 1 && latestProbe.availableOptions.length > 0) {
        const signature = JSON.stringify(latestProbe.availableOptions);
        stableOptionReads = signature === previousOptionSignature ? stableOptionReads + 1 : 1;
        previousOptionSignature = signature;
        if (stableOptionReads >= 2) break;
      } else {
        stableOptionReads = 0;
        previousOptionSignature = "";
      }
    }
    if (!popupEverOpened) {
      return failure("open", "open_event_not_observed", "唯一可信打开事件后没有观察到地点弹层");
    }
    if (!latestProbe || stableOptionReads < 2 || availableOptions.length === 0) {
      const closed = await closeAndVerify();
      return failure("open", "options_missing", "地点弹层没有形成稳定的城市叶子选项", closed.readback);
    }

    await disarmObserver().catch(() => null);
    observerArmed = false;
    const closed = await closeAndVerify();
    if (closed.failureCode) {
      return failure("close", closed.failureCode, "读取选项后未能在不选择城市的情况下关闭弹层", closed.readback);
    }
    return success(closed.readback);
  } catch (error) {
    let cleanupReadback = emptyReadback;
    if (popupEverOpened) cleanupReadback = (await closeAndVerify()).readback;
    return failure(
      "readback",
      "driver_interrupted",
      `地点选项探测被中断：${error instanceof Error ? error.message : String(error)}`,
      cleanupReadback
    );
  } finally {
    if (observerArmed) await disarmObserver().catch(() => null);
  }
}
