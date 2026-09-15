import {
  prepareFocusEmulatedTrustedPointerSurface,
  releaseTrustedPointerSurface,
  type CdpCommandSender
} from "./trusted-pointer-driver.js";

export interface BackgroundEntryDebuggerApi {
  attach(target: chrome.debugger.Debuggee, version: string): Promise<void>;
  sendCommand(target: chrome.debugger.Debuggee, method: string, params?: object): Promise<unknown>;
  detach(target: chrome.debugger.Debuggee): Promise<void>;
}

/** Keep async render, entry click and destination classification on one tab.
 * Page focus emulation does not activate a browser tab/window. It must start
 * before observing the entry, not only after finding a possibly hidden button.
 * The callback shares this lease: it must not attach/detach the same target.
 */
export async function withBackgroundTabEntrySurface<T>(
  api: BackgroundEntryDebuggerApi,
  tabId: number,
  run: (send: CdpCommandSender) => Promise<T>
): Promise<T> {
  const target = { tabId };
  const send: CdpCommandSender = (method, params) => api.sendCommand(target, method, params);
  let attached = false;
  try {
    await api.attach(target, "1.3");
    attached = true;
    await prepareFocusEmulatedTrustedPointerSurface(send);
    return await run(send);
  } finally {
    // A failed attach must never detach another extension's debugger.
    if (attached) {
      await releaseTrustedPointerSurface(send).catch(() => undefined);
      await api.detach(target).catch(() => undefined);
    }
  }
}
