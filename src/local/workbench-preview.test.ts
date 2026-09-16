// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";

const el = (id: string) => document.getElementById(id) as HTMLInputElement;
const flush = () => vi.advanceTimersByTimeAsync(0);
const result = { resumeName: "合成简历", jobs: [{ companyName: "测试", title: "岗位", support: { supported: true } }] };
function change(id: string, value: string) {
  el(id).value = value;
  el(id).dispatchEvent(new Event("change", { bubbles: true }));
}
async function boot(preview: () => Promise<unknown>, create = async () => ({ batchId: "batch" })) {
  vi.useFakeTimers();
  document.documentElement.innerHTML = await readFile("web/index.html", "utf8");
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, options: RequestInit) => {
    let data: unknown = [];
    if (path === "/api/status") data = { jobs: 1, extensionPath: "fixture", providers: { qwen: { label: "测试", baseUrl: "https://example.com" } } };
    if (path === "/api/devices") data = ["device-a", "device-b"].map(deviceId => ({ deviceId, capabilities: ["aioffer.local-runtime.v1"] }));
    if (path === "/api/resumes") data = ["version-a", "version-b"].map(id => ({ id, assets: [], profile: {}, createdAt: "2026-09-16", confirmedAt: "2026-09-16" }));
    if (path.startsWith("/api/jobs")) data = { total: 1, items: [{ jobId: "job", title: "测试岗位", companyName: "测试", locations: [], salary: "面议", applicationUrl: "https://example.com/job" }] };
    if (path === "/api/preview") data = await preview();
    if (path === "/api/attempts" && options.method === "POST") { calls.push(JSON.parse(options.body as string)); data = await create(); }
    return { ok: true, json: async () => data };
  }));
  await import("../../web/app.js");
  (document.querySelector("#jobs input") as HTMLInputElement).click();
  return calls;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); vi.resetModules(); });

it.each(["mode", "device", "version", "consentClick", "selection"])("等待预览时修改 %s，晚到的预览不得恢复授权入口", async (kind) => {
  let resolve!: (value: unknown) => void;
  const calls = await boot(() => new Promise(r => { resolve = r; }));
  el("preview").click(); await flush();
  if (kind === "mode") change("mode", "auto");
  if (kind === "device") change("device", "device-b");
  if (kind === "version") change("version", "version-a");
  if (kind === "consentClick") el("consentClick").click();
  if (kind === "selection") (document.querySelector("#jobs input") as HTMLInputElement).click();
  resolve(result); await flush();
  expect(el("previewArea").hidden).toBe(true);
  el("submitConsent").checked = true; el("start").click(); await flush();
  expect(calls).toEqual([]);
});

it("任务创建途中改变选择，不会丢失任务已保存的提示", async () => {
  let resolve!: (value: { batchId: string }) => void;
  const calls = await boot(async () => result, () => new Promise(r => { resolve = r; }));
  el("preview").click(); await flush();
  el("submitConsent").checked = true; el("start").click(); await flush();
  change("mode", "auto");
  resolve({ batchId: "batch" }); await flush();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ mode: "assisted", deviceId: "device-a" });
  expect(el("notice").textContent).toContain("任务已保存");
  expect(el("notice").textContent).not.toContain("Cannot read");
});

it("旧任务创建完成不清除用户后来生成的新预览", async () => {
  let resolve!: (value: { batchId: string }) => void;
  await boot(async () => result, () => new Promise(r => { resolve = r; }));
  el("preview").click(); await flush();
  el("submitConsent").checked = true; el("start").click(); await flush();
  change("mode", "auto"); el("preview").click(); await flush();
  expect(el("previewArea").hidden).toBe(false);
  resolve({ batchId: "batch" }); await flush();
  expect(el("previewArea").hidden).toBe(false);
  expect(el("previewContent").textContent).toContain("自动");
  expect(el("submitConsent").checked).toBe(false);
});
