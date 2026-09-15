import { describe, expect, it, vi } from "vitest";
import { acknowledgedFeishuFormMatches, closeAutoApplyExecutionSurface, openAutoApplyExecutionSurface, openManualApplicationTab } from "./auto-apply-execution-surface.js";

function api() {
  return {
    tabs: {
      create: vi.fn().mockResolvedValue({ id: 11, windowId: 20, active: false }),
      get: vi.fn(), remove: vi.fn().mockResolvedValue(undefined)
    },
    windows: {
      get: vi.fn().mockResolvedValue({ id: 20, type: "normal" }),
      getLastFocused: vi.fn().mockResolvedValue({ id: 20, type: "normal", incognito: false }),
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn(), update: vi.fn(), remove: vi.fn()
    }
  };
}

describe("unified automatic background tabs", () => {
  const formUrl = "https://youcash.jobs.feishu.cn/youcash/resume/123/apply";
  it.each([
    [formUrl, true], ["https://youcash.jobs.feishu.cn/youcash/resume/applied", false],
    ["https://youcash.jobs.feishu.cn/youcash/resume/456/apply", false],
    ["https://youcash.jobs.feishu.cn/index/resume/123/apply", false],
    ["https://youcash.jobs.feishu.cn/youcash/login", false],
    ["https://example.test/youcash/resume/123/apply", false]
  ])("limits acknowledged leave handling to the same Feishu form: %s", (current, expected) => {
    expect(acknowledgedFeishuFormMatches("https://youcash.jobs.feishu.cn/youcash/position/123/detail", String(current))).toBe(expected);
  });

  it("acknowledges one same-tab beforeunload only while the accepted Feishu form is closing", async () => {
    let listener: ((source: any, method: string, event: any) => void) | undefined;
    let release!: () => void;
    const removed = new Promise<void>(resolve => { release = resolve; });
    const chromeApi = {...api(), debugger: {
      attach: vi.fn(async () => undefined), detach: vi.fn(async () => undefined),
      sendCommand: vi.fn(async (_target, method) => { if (method === "Page.handleJavaScriptDialog") release(); }),
      onEvent: {addListener: vi.fn(fn => { listener = fn; }), removeListener: vi.fn(fn => { if (listener === fn) listener = undefined; })}
    }};
    chromeApi.tabs.get.mockResolvedValue({url: formUrl});
    chromeApi.tabs.remove.mockImplementation(async () => {
      for (const [tabId, type, url] of [[16,"beforeunload",formUrl],[15,"confirm",formUrl],
        [15,"beforeunload",formUrl.replace("123","456")]] as const) {
        listener!({tabId}, "Page.javascriptDialogOpening", {type,url});
      }
      expect(chromeApi.debugger.sendCommand.mock.calls.filter(call => call[1] === "Page.handleJavaScriptDialog")).toHaveLength(0);
      listener!({tabId:15}, "Page.javascriptDialogOpening", {type:"beforeunload",url:formUrl});
      listener!({tabId:15}, "Page.javascriptDialogOpening", {type:"beforeunload",url:formUrl});
      return removed;
    });
    await closeAutoApplyExecutionSurface(chromeApi as any, {tabId:15, acknowledgedApplicationUrl:formUrl});
    expect(chromeApi.debugger.sendCommand.mock.calls.filter(call => call[1] === "Page.handleJavaScriptDialog"))
      .toEqual([[{tabId:15}, "Page.handleJavaScriptDialog", {accept:true}]]);
    expect(chromeApi.tabs.remove).toHaveBeenCalledExactlyOnceWith(15);
    expect(listener).toBeUndefined();
    expect(chromeApi.debugger.detach).toHaveBeenCalledExactlyOnceWith({tabId:15});
  });

  it("bounds a stuck close without retrying the tab operation", async () => {
    vi.useFakeTimers();
    try {
      const chromeApi = api();
      chromeApi.tabs.remove.mockReturnValue(new Promise(() => {}));
      const done = expect(closeAutoApplyExecutionSurface(chromeApi, {tabId:15})).rejects.toThrow("招聘标签关闭超时");
      await vi.advanceTimersByTimeAsync(5_000); await done;
      expect(chromeApi.tabs.remove).toHaveBeenCalledExactlyOnceWith(15);
    } finally { vi.useRealTimers(); }
  });
  it.each([
    "https://dcar.jobs.feishu.cn/campus/position/detail/7537904088508336423",
    "https://xiaopeng.jobs.feishu.cn/campus/position/7658239728123545907/detail",
    "https://xtool.jobs.feishu.cn/index/position/7678562627672541486/detail",
    "https://app.mokahr.com/campus-recruitment/example/1#/job/abc/apply",
    "https://jobs.example.test/apply"
  ])("creates a new inactive normal-window tab for %s", async applicationUrl => {
    const chromeApi = api();
    const result = await openAutoApplyExecutionSurface(chromeApi, { applicationUrl });
    expect(result).toMatchObject({ createdForExecution: true, source: "new_background_tab", windowId: 20, windowType: "normal" });
    expect(chromeApi.windows.getLastFocused).toHaveBeenCalledWith({ windowTypes: ["normal"] });
    expect(chromeApi.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: applicationUrl, active: false, windowId: 20 });
    expect(chromeApi.windows.create).not.toHaveBeenCalled();
    expect(chromeApi.windows.update).not.toHaveBeenCalled();
  });

  it("does not open in a previously focused popup or an incognito window", async () => {
    const chromeApi = api();
    chromeApi.windows.getLastFocused.mockResolvedValue({ id: 99, type: "popup" });
    chromeApi.windows.getAll.mockResolvedValue([
      { id: 99, type: "popup", focused: true },
      { id: 88, type: "normal", incognito: true },
      { id: 20, type: "normal", incognito: false }
    ]);
    await openAutoApplyExecutionSurface(chromeApi, { applicationUrl: "https://example.test/apply" });
    expect(chromeApi.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ windowId: 20, active: false }));
  });

  it("uses another available normal window if the last-focused lookup fails", async () => {
    const chromeApi = api();
    chromeApi.windows.getLastFocused.mockRejectedValue(new Error("window closed"));
    chromeApi.windows.getAll.mockResolvedValue([{ id: 30, type: "normal" }]);
    await openAutoApplyExecutionSurface(chromeApi, { applicationUrl: "https://example.test/apply" });
    expect(chromeApi.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ windowId: 30 }));
  });

  it("reports no normal window without creating a popup or focusing anything", async () => {
    const chromeApi = api();
    chromeApi.windows.getLastFocused.mockResolvedValue({ id: 99, type: "popup" });
    await expect(openAutoApplyExecutionSurface(chromeApi, { applicationUrl: "https://example.test/apply" }))
      .rejects.toThrow("没有可用的普通 Chrome 窗口");
    expect(chromeApi.tabs.create).not.toHaveBeenCalled();
    expect(chromeApi.windows.create).not.toHaveBeenCalled();
  });

  it.each(["normal", "popup"])("resumes only the provided bound tab in its existing %s window", async type => {
    const chromeApi = api();
    const existingTab = { id: 14, windowId: 41 } as chrome.tabs.Tab;
    chromeApi.tabs.get.mockResolvedValue(existingTab);
    chromeApi.windows.get.mockResolvedValue({ id: 41, type, state: "minimized" });
    const result = await openAutoApplyExecutionSurface(chromeApi, { applicationUrl: "https://example.test/apply", existingTab });
    expect(result).toMatchObject({ tab: existingTab, source: "bound_task_tab", createdForExecution: false, windowId: 41, windowType: type });
    expect(chromeApi.windows.getLastFocused).not.toHaveBeenCalled();
    expect(chromeApi.tabs.create).not.toHaveBeenCalled();
    expect(chromeApi.windows.create).not.toHaveBeenCalled();
    expect(chromeApi.windows.update).not.toHaveBeenCalled();
  });

  it("does not reopen a bound page that disappears before resume", async () => {
    const chromeApi = api();
    chromeApi.tabs.get.mockRejectedValue(new Error("tab closed"));
    await expect(openAutoApplyExecutionSurface(chromeApi, { applicationUrl: "https://example.test/apply", existingTab: { id: 14 } as chrome.tabs.Tab })).rejects.toThrow("tab closed");
    expect(chromeApi.tabs.create).not.toHaveBeenCalled();
  });

  it("does not switch windows or create a second tab if creation fails", async () => {
    const chromeApi = api();
    chromeApi.tabs.create.mockRejectedValue(new Error("window closed"));
    await expect(openAutoApplyExecutionSurface(chromeApi, { applicationUrl: "https://example.test/apply" })).rejects.toThrow("window closed");
    expect(chromeApi.tabs.create).toHaveBeenCalledTimes(1);
    expect(chromeApi.windows.create).not.toHaveBeenCalled();
  });

  it("closes only the task tab, never the containing window", async () => {
    const chromeApi = api();
    await closeAutoApplyExecutionSurface(chromeApi, { tabId: 15 });
    expect(chromeApi.tabs.remove).toHaveBeenCalledExactlyOnceWith(15);
    expect(chromeApi.windows.remove).not.toHaveBeenCalled();
  });

  it("opens an explicitly requested manual page in a normal window, not the current popup", async () => {
    const chromeApi = api();
    chromeApi.windows.getLastFocused.mockResolvedValue({ id: 99, type: "popup" });
    chromeApi.windows.getAll.mockResolvedValue([{ id: 20, type: "normal" }]);
    await openManualApplicationTab(chromeApi, "https://example.test/apply");
    expect(chromeApi.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: "https://example.test/apply", active: true, windowId: 20 });
    expect(chromeApi.windows.create).not.toHaveBeenCalled();
    expect(chromeApi.windows.update).not.toHaveBeenCalled();
  });

  it("does not create a window for an explicit manual page when no normal window exists", async () => {
    const chromeApi = api();
    chromeApi.windows.getLastFocused.mockResolvedValue({ id: 99, type: "popup" });
    await expect(openManualApplicationTab(chromeApi, "https://example.test/apply")).rejects.toThrow("没有可用的普通 Chrome 窗口");
    expect(chromeApi.tabs.create).not.toHaveBeenCalled();
    expect(chromeApi.windows.create).not.toHaveBeenCalled();
  });
});
