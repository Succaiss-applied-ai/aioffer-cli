// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { button, cleanupTestWorkbench, click, flushReact, input, mountTestWorkbench, selectOption } from "../../web/src/test-mount.js";

type Page = { total: number; items: ReturnType<typeof job>[]; exportedAt?: string };
function job(title: string) {
  return { jobId: title, title, companyName: "测试公司", locations: [], salary: "面议", description: "测试", capability: { kind: "auto", label: "自动投递候选", reason: "合成测试能力", allowedModes: ["auto", "assisted"] }, applicationUrl: "https://example.com/job" };
}
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const next = () => document.querySelector("li[title='下一页'] button");
const previous = () => document.querySelector("li[title='上一页'] button");
async function submitSearch(flush = true) {
  const form = document.querySelector("input[aria-label='岗位关键词']")?.closest("form");
  if (!(form instanceof HTMLFormElement)) throw new Error("搜索表单不存在");
  act(() => { form.requestSubmit(); });
  if (flush) await flushReact();
}
async function navigateToJobs() {
  const item = [...document.querySelectorAll("[role='menuitem']")].find((element) => element.textContent?.includes("岗位搜索"));
  await click(item ?? null);
}
async function boot(search: (url: URL) => Promise<Page>) {
  vi.stubGlobal("fetch", vi.fn(async (path: string, options?: RequestInit) => {
    if (path === "/api/status") return response({ jobs: 31, exportedAt: "2026-09-16", extensionPath: "fixture", model: null, mineruConfigured: false, providers: { qwen: { label: "测试", protocol: "openai", baseUrl: "https://example.com" } } });
    if (path === "/api/devices" || path === "/api/resumes" || path === "/api/attempts") return response([]);
    if (path.startsWith("/api/jobs")) {
      try {
        const pending = search(new URL(path, "http://127.0.0.1:19876"));
        if (options?.signal) {
          const aborted = new Promise<never>((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
          return response(await Promise.race([pending, aborted]));
        }
        return response(await pending);
      }
      catch (error) { return response({ message: error instanceof Error ? error.message : "测试失败" }, 500); }
    }
    return response([]);
  }));
  await mountTestWorkbench();
  await navigateToJobs();
  await flushReact();
}
afterEach(async () => { await cleanupTestWorkbench(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

vi.setConfig({ testTimeout: 45_000 });

it("首页和尾页分页保持正确禁用状态", async () => {
  await boot(async (url) => ({ total: 31, items: [job(url.searchParams.get("offset")!)] }));
  expect((previous() as HTMLButtonElement).disabled).toBe(true);
  await click(next());
  expect(document.body.textContent).toContain("当前 31–31");
  expect((next() as HTMLButtonElement).disabled).toBe(true);
  await click(previous());
  expect(document.body.textContent).toContain("当前 1–30");
  expect((previous() as HTMLButtonElement).disabled).toBe(true);
});

it("晚到的旧查询不能覆盖新查询结果", async () => {
  await boot(async (url) => url.searchParams.get("q") === "旧查询"
    ? new Promise<Page>(() => undefined)
    : { total: 1, items: [job(url.searchParams.get("q") || "初始")] });
  await input(document.querySelector("input[aria-label='岗位关键词']"), "旧查询");
  await submitSearch(false);
  await input(document.querySelector("input[aria-label='岗位关键词']"), "新查询");
  await submitSearch();
  expect(document.body.textContent).toContain("新查询");
  expect(document.body.textContent).toContain("新查询");
  expect(document.body.textContent).toContain("找到 1 个岗位");
});

it("查询失败保留当前页，重试不会跳过一页", async () => {
  const offsets: number[] = [];
  let fail = true;
  await boot(async (url) => {
    const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
    if (offset && fail) { fail = false; throw new Error("测试网络失败"); }
    return { total: 100, items: [job(String(offset))] };
  });
  await click(next());
  expect(document.body.textContent).toContain("测试网络失败");
  expect(document.body.textContent).toContain("当前 1–30");
  await click(next());
  expect(offsets).toEqual([0, 30, 30]);
});

it("修改筛选条件后从第一页搜索", async () => {
  const offsets: number[] = [];
  await boot(async (url) => { offsets.push(Number(url.searchParams.get("offset"))); return { total: 100, items: [job("测试岗位")] }; });
  await click(next());
  await input(document.querySelector("input[aria-label='城市']"), "北京");
  await submitSearch();
  expect(offsets).toEqual([0, 30, 0]);
});

it("默认能力筛选传给后端且未验证岗位不能选择", async () => {
  const urls: URL[] = [];
  await boot(async (url) => {
    urls.push(url);
    return { total: 1, items: [{ ...job("未知网页"), capability: { kind: "unverified", label: "能力待验证", reason: "没有能力依据", allowedModes: [] } }] };
  });
  expect(urls[0]!.searchParams.get("capability")).toBe("actionable");
  expect((document.querySelector("input[aria-label='选择 未知网页']") as HTMLInputElement).disabled).toBe(true);
  expect(document.body.textContent).toContain("没有能力依据");
});

const previewJob = { jobId: "job", title: "测试岗位", companyName: "测试", locations: [], salary: "面议", description: "测试", capability: { kind: "auto", label: "自动投递候选", reason: "合成测试能力", allowedModes: ["auto", "assisted"] }, applicationUrl: "https://example.com/job" };
const previewResult = { resumeName: "合成简历", mode: "assisted", jobs: [{ ...previewJob }] };

async function bootPreview(preview: () => Promise<unknown>, create = async () => ({ batchId: "batch" })) {
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, options: RequestInit = {}) => {
    if (path === "/api/status") return response({ jobs: 1, exportedAt: "2026-09-16", extensionPath: "fixture", model: null, mineruConfigured: false, providers: { qwen: { label: "测试", protocol: "openai", baseUrl: "https://example.com" } } });
    if (path === "/api/devices") return response(["device-a", "device-b"].map((deviceId) => ({ deviceId, deviceName: deviceId, capabilities: ["aioffer.local-runtime.v1"] })));
    if (path === "/api/resumes") return response(["version-a", "version-b"].map((id) => ({ id, assets: [{ name: id }], profile: {}, createdAt: "2026-09-16", confirmedAt: "2026-09-16" })));
    if (path === "/api/attempts" && options.method !== "POST") return response([]);
    if (path.startsWith("/api/jobs")) return response({ total: 1, items: [previewJob] });
    if (path === "/api/preview") return response(await preview());
    if (path === "/api/attempts" && options.method === "POST") { calls.push(JSON.parse(String(options.body))); return response(await create()); }
    return response([]);
  }));
  await mountTestWorkbench();
  await navigateToJobs();
  await click(document.querySelector("input[aria-label='选择 测试岗位']"));
  return calls;
}

function startPreviewWithoutWaiting() {
  act(() => { button("核对本次投递").click(); });
}

it.each(["mode", "device", "version", "consentClick", "selection"])('等待预览时修改 %s，晚到预览不得恢复授权入口', async (kind) => {
  let resolve!: (value: unknown) => void;
  const calls = await bootPreview(() => new Promise((done) => { resolve = done; }));
  startPreviewWithoutWaiting();
  await flushReact();
  if (kind === "mode") await click(document.querySelector("input[value='auto']"));
  if (kind === "device") await selectOption("执行设备", "device-b");
  if (kind === "version") await selectOption("资料版本", "version-a");
  if (kind === "consentClick") await click(document.querySelector("input[aria-label='允许点击网站协议']"));
  if (kind === "selection") await click(document.querySelector("input[aria-label='选择 测试岗位']"));
  await act(async () => { resolve(previewResult); });
  await flushReact();
  expect(document.body.textContent).not.toContain("确认并开始");
  expect(calls).toEqual([]);
});

it("任务创建途中改变模式仍使用已确认的原预览快照", async () => {
  let resolve!: (value: { batchId: string }) => void;
  const calls = await bootPreview(async () => previewResult, () => new Promise((done) => { resolve = done; }));
  await click(button("核对本次投递"));
  await click(document.querySelector("input[aria-label='确认发起投递']"));
  act(() => { button("确认并开始").click(); });
  await click(document.querySelector("input[value='auto']"));
  await act(async () => { resolve({ batchId: "batch" }); });
  await flushReact();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ mode: "assisted", deviceId: "device-a" });
  expect(document.body.textContent).toContain("任务已保存");
});

it("旧任务创建完成不会清除后来生成的新预览", async () => {
  let resolve!: (value: { batchId: string }) => void;
  await bootPreview(async () => previewResult, () => new Promise((done) => { resolve = done; }));
  await click(button("核对本次投递"));
  await click(document.querySelector("input[aria-label='确认发起投递']"));
  act(() => { button("确认并开始").click(); });
  await click(document.querySelector("input[value='auto']"));
  await click(button("核对本次投递"));
  expect(document.body.textContent).toContain("自动");
  await act(async () => { resolve({ batchId: "batch" }); });
  await flushReact();
  expect(document.body.textContent).toContain("确认并开始");
  expect((document.querySelector("input[aria-label='确认发起投递']") as HTMLInputElement).checked).toBe(false);
});

const menu = (text: string) => [...document.querySelectorAll("[role='menuitem']")].find((element) => element.textContent?.includes(text)) ?? null;
const finalButton = () => [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === "已核对原页面，确认最终投递");

it("记录不变时保留确认控件，变化后重新显示回读提示", async () => {
  let attempts = [{ id: "test", mode: "assisted", deviceId: "device", versionId: "version", jobIds: ["fixture"], createdAt: "2026-09-16T00:00:00Z", batch: { batchId: "test", status: "paused", jobs: [{
    batchJobId: "job", jobId: "fixture", companyName: "本机测试", title: "测试岗位", status: "waiting_for_user_action", reasonCode: "final_review_required",
    evidence: { failureDetails: { reviewHash: "current" } }, localReviewApproval: { reviewHash: "current", expiresAt: "2999-01-01T00:00:00Z" },
  }] } }];
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/status") return response({ jobs: 0, exportedAt: "2026-09-16", extensionPath: "fixture", model: null, mineruConfigured: false, providers: { qwen: { label: "测试", protocol: "openai", baseUrl: "https://example.com" } } });
    if (path === "/api/attempts") return response(structuredClone(attempts));
    if (path === "/api/devices" || path === "/api/resumes") return response([]);
    if (path.startsWith("/api/jobs")) return response({ items: [], total: 0 });
    return response([]);
  }));
  await mountTestWorkbench();
  await click(menu("投递记录"));
  await flushReact();
  const first = finalButton();
  expect(first).toBeTruthy();
  await click(menu("工作台"));
  await click(menu("投递记录"));
  await flushReact();
  expect(finalButton()).toBe(first);
  attempts = structuredClone(attempts);
  attempts[0]!.batch.jobs[0]!.evidence.failureDetails.reviewHash = "changed";
  await click(menu("工作台"));
  await click(menu("投递记录"));
  await flushReact();
  expect(finalButton()).toBeTruthy();
  expect(document.body.textContent).toContain("页面内容与上次确认不一致");
});

it("品牌链接统一指向 aioffer 官网并安全打开", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/status"
    ? response({ jobs: 0, exportedAt: "2026-09-16", extensionPath: "fixture", model: null, mineruConfigured: false, providers: { qwen: { label: "测试", protocol: "openai", baseUrl: "https://example.com" } } })
    : response([])));
  await mountTestWorkbench();
  const link = document.querySelector("a[href='https://aioffer.succaiss.com/']") as HTMLAnchorElement;
  expect(link).toBeTruthy();
  expect(link.target).toBe("_blank");
  expect(link.rel).toContain("noopener");
  expect(link.rel).toContain("noreferrer");
});
