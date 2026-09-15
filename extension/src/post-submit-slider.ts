import { attemptPostSubmitSlider } from "../../dev/slider-captcha/integration.mjs";
import { observeYidunJigsawInPage } from "../../dev/slider-captcha/yidun-observe.mjs";
import { executeInterruptibleScript } from "./auto-apply-interruption.js";
import type { CdpCommandSender } from "./trusted-pointer-driver.js";

export interface PostSubmitSliderContext {
  ownerId: string;
  deviceId: string;
  pageSessionKey: string;
  submissionAttemptId: string;
  assertActive: () => void;
  signal?: AbortSignal;
}

/** Draft integration: callers already hold the final-submit debugger lease.
 * This function never attaches, activates a tab, or submits an application.
 */
export async function attemptPostSubmitSliderWithDebugger(
  tabId: number, context: PostSubmitSliderContext, send: CdpCommandSender
): Promise<{ status: string; reason?: string }> {
  return attemptPostSubmitSlider({
    binding: { ownerId: context.ownerId, deviceId: context.deviceId,
      pageSessionKey: context.pageSessionKey, submissionAttemptId: context.submissionAttemptId, tabId },
    assertActive: context.assertActive,
    signal: context.signal,
    send,
    storage: chrome.storage.local,
    locks: navigator.locks,
    read: async () => {
      const results = await executeInterruptibleScript({ target: { tabId, frameIds: [0] }, func: observeYidunJigsawInPage });
      const result = results.find(frame => frame.frameId === 0);
      return { documentId: result?.documentId, observation: result?.result };
    },
    currentDocumentId: async () => {
      const frame = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
      return frame?.documentId;
    }
  });
}
