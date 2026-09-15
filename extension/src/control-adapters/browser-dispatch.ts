import { executeInterruptibleScript } from "../auto-apply-interruption.js";
import type { FillInstruction, FillResult, PageObservation } from "../page-adapter.js";

export async function observeApplicationWithDialectsInTab(tabId: number): Promise<PageObservation | undefined> {
  await executeInterruptibleScript({ target: { tabId }, files: ["page-control-runtime.js"] });
  const result = await executeInterruptibleScript({
    target: { tabId },
    func: () => {
      const runtime = (globalThis as typeof globalThis & {
        __recruitingNativeControlRuntime?: { observe(): PageObservation }
      }).__recruitingNativeControlRuntime;
      if (!runtime) throw new Error("字段观察运行时未加载");
      return runtime.observe();
    }
  });
  return result[0]?.result ? { ...result[0].result, documentId: result[0].documentId } : undefined;
}

export async function executeNativeControlInTab(tabId: number, instruction: FillInstruction): Promise<FillResult | null> {
  await executeInterruptibleScript({ target: { tabId }, files: ["page-control-runtime.js"] });
  const result = await executeInterruptibleScript({
    target: { tabId },
    func: async (instruction: FillInstruction) => {
      const runtime = (globalThis as typeof globalThis & {
        __recruitingNativeControlRuntime?: { fill(instructions: FillInstruction[]): Promise<FillResult[]> }
      }).__recruitingNativeControlRuntime;
      if (!runtime) throw new Error("原生控件运行时未加载");
      return (await runtime.fill([instruction]))[0] ?? null;
    }, args: [instruction]
  });
  return result[0]?.result ?? null;
}

export async function executeFeishuResumeUploadInTab(tabId: number, instruction: FillInstruction): Promise<FillResult | null> {
  await executeInterruptibleScript({ target: { tabId }, files: ["page-control-runtime.js"] });
  const result = await executeInterruptibleScript({
    target: { tabId },
    func: async (next: FillInstruction) => {
      const runtime = (globalThis as typeof globalThis & {
        __recruitingNativeControlRuntime?: { uploadResume(instruction: FillInstruction): Promise<FillResult> }
      }).__recruitingNativeControlRuntime;
      if (!runtime) throw new Error("附件控件运行时未加载");
      return runtime.uploadResume(next);
    }, args: [instruction]
  });
  return result[0]?.result ?? null;
}
