import { submissionPhaseCall } from "./auto-apply-submit-lifecycle.js";
import { autoApplyBoundTabUrlMatchesApplication } from "./auto-apply-navigation.js";

export interface AutoApplyExecutionSurfaceChromeApi {
  debugger?: Pick<typeof chrome.debugger, "attach" | "detach" | "sendCommand" | "onEvent">;
  tabs: {
    create(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab>;
    get(tabId: number): Promise<chrome.tabs.Tab>;
    remove(tabId: number): Promise<void>;
  };
  windows: {
    get(windowId: number): Promise<chrome.windows.Window>;
    getLastFocused(queryOptions: chrome.windows.QueryOptions): Promise<chrome.windows.Window>;
    getAll(queryOptions: chrome.windows.QueryOptions): Promise<chrome.windows.Window[]>;
  };
}

export interface AutoApplyExecutionSurface {
  tab: chrome.tabs.Tab;
  createdForExecution: boolean;
  source: "new_background_tab" | "bound_task_tab";
  windowId: number;
  windowType: NonNullable<chrome.windows.Window["type"]>;
}

function usableNormalWindow(window: chrome.windows.Window | undefined): window is chrome.windows.Window & { id: number } {
  return window?.type === "normal" && window.incognito !== true &&
    Number.isInteger(window.id) && window.id! > 0;
}

async function normalApplicationWindow(api: AutoApplyExecutionSurfaceChromeApi): Promise<number> {
  const latest = await api.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => undefined);
  if (usableNormalWindow(latest)) return latest.id;
  const windows = (await api.windows.getAll({ windowTypes: ["normal"] })).filter(usableNormalWindow);
  const selected = windows.find(window => window.focused) ?? windows[0];
  if (!selected) throw new Error("没有可用的普通 Chrome 窗口，请先打开普通窗口后重新投递；插件不会创建独立窗口。");
  return selected.id;
}

/** Explicit user-open is active, but must not land in an implicit popup either. */
export async function openManualApplicationTab(
  api: AutoApplyExecutionSurfaceChromeApi,
  applicationUrl: string
): Promise<chrome.tabs.Tab> {
  const windowId = await normalApplicationWindow(api);
  return api.tabs.create({ url: applicationUrl, active: true, windowId });
}

/**
 * One execution surface for every ATS. New tasks create inactive tabs in an
 * explicitly selected normal window, never Chrome's implicit current popup.
 * existingTab must already be bound to this exact task (or explicit no-submit
 * local acceptance). Never adopt another page merely because its URL matches.
 */
export async function openAutoApplyExecutionSurface(
  api: AutoApplyExecutionSurfaceChromeApi,
  input: {
    applicationUrl: string;
    existingTab?: chrome.tabs.Tab;
  }
): Promise<AutoApplyExecutionSurface> {
  if (input.existingTab) {
    if (input.existingTab.id === undefined) throw new Error("原自动投递页缺少标签 ID");
    const tab = await api.tabs.get(input.existingTab.id);
    const window = await api.windows.get(tab.windowId);
    // Resume the original document regardless of its containing window.
    // Window metadata is diagnostic only, never a separate execution strategy.
    return {
      tab,
      createdForExecution: false,
      source: "bound_task_tab",
      windowId: tab.windowId,
      windowType: window.type ?? "normal"
    };
  }

  const windowId = await normalApplicationWindow(api);
  const tab = await api.tabs.create({
    url: input.applicationUrl,
    active: false,
    windowId
  });
  if (tab.id === undefined) throw new Error("Chrome 没有返回自动投递标签 ID");
  return {
    tab,
    createdForExecution: true,
    source: "new_background_tab",
    windowId,
    windowType: "normal"
  };
}

/** Only the owned task tab may close; other tabs in that window are unrelated. */
export async function closeAutoApplyExecutionSurface(
  api: AutoApplyExecutionSurfaceChromeApi,
  input: { tabId: number; acknowledgedApplicationUrl?: string }
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("招聘标签关闭超时；已确认回执保持不变")), 5_000);
  const call = <T>(action: () => Promise<T>) => submissionPhaseCall(controller.signal, action);
  const target = {tabId: input.tabId};
  let attached = false, closing = false, handled = false, liveUrl = "";
  const listener = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
    const event = params as {type?: string; url?: string} | undefined;
    if (!closing || controller.signal.aborted || handled || source.tabId !== input.tabId ||
      source.targetId || source.extensionId || method !== "Page.javascriptDialogOpening" ||
      event?.type !== "beforeunload" || event.url !== liveUrl) return;
    handled = true;
    void call(() => api.debugger!.sendCommand(target, "Page.handleJavaScriptDialog", {accept: true})).catch(() => undefined);
  };
  try {
    if (input.acknowledgedApplicationUrl && api.debugger) {
      const tab = await call(() => api.tabs.get(input.tabId)).catch(() => undefined);
      if (tab?.url && acknowledgedFeishuFormMatches(input.acknowledgedApplicationUrl, tab.url)) {
        liveUrl = tab.url;
        await call(async () => {
          await api.debugger!.attach(target, "1.3");
          if (controller.signal.aborted) { void api.debugger!.detach(target).catch(() => undefined); return; }
          attached = true;
        }).catch(() => undefined);
        if (attached) {
          api.debugger.onEvent.addListener(listener);
          await call(() => api.debugger!.sendCommand(target, "Page.enable"));
          // Recheck after attachment: success/login navigation must not inherit
          // permission to accept the filling page's leave confirmation.
          const current = await call(() => api.tabs.get(input.tabId)).catch(() => undefined);
          if (current?.url !== liveUrl) liveUrl = "";
        }
      }
    }
    closing = true;
    await call(() => api.tabs.remove(input.tabId).catch(() => undefined));
  } finally {
    closing = false;
    clearTimeout(timer);
    if (attached) {
      api.debugger!.onEvent.removeListener(listener);
      void api.debugger!.detach(target).catch(() => undefined);
    }
  }
}

/** Only the same Feishu form route, never another job, login or receipt page. */
export function acknowledgedFeishuFormMatches(applicationUrl: string, currentUrl: string): boolean {
  try {
    const expected = new URL(applicationUrl), current = new URL(currentUrl);
    return expected.protocol === "https:" && current.origin === expected.origin &&
      /(?:^|\.)jobs\.feishu\.cn$/iu.test(expected.hostname) &&
      /^\/[a-zA-Z0-9_-]+\/resume\/\d+\/apply\/?$/u.test(current.pathname) &&
      autoApplyBoundTabUrlMatchesApplication(currentUrl, applicationUrl);
  } catch { return false; }
}
