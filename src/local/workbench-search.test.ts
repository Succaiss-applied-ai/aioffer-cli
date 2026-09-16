// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";

type Page = { total: number; items: ReturnType<typeof job>[] };
function job(title: string) {
  return { jobId: title, title, companyName: "测试公司", locations: [], salary: "面议", description: "测试", applicationUrl: "https://example.com/job" };
}
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const flush = () => vi.advanceTimersByTimeAsync(0);
function submit() {
  document.getElementById("search")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
async function boot(search: (url: URL) => Promise<Page>) {
  vi.useFakeTimers();
  document.documentElement.innerHTML = await readFile("web/index.html", "utf8");
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    let data: unknown = [];
    if (path === "/api/status") data = { jobs: 31, extensionPath: "fixture", providers: { qwen: { label: "测试", baseUrl: "https://example.com" } } };
    if (path.startsWith("/api/jobs")) data = await search(new URL(path, "http://127.0.0.1:19876"));
    return { ok: true, json: async () => data };
  }));
  await import("../../web/app.js");
}
afterEach(() => {
  vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); vi.resetModules();
});

it("首页和尾页按钮不会在请求完成后被重新启用", async () => {
  await boot(async (url) => ({ total: 31, items: [job(url.searchParams.get("offset")!)] }));
  expect(button("previous").disabled).toBe(true);
  button("next").click(); await flush();
  expect(document.getElementById("jobCount")!.textContent).toContain("31–31");
  expect(button("next").disabled).toBe(true);
  button("previous").click(); await flush();
  expect(document.getElementById("jobCount")!.textContent).toContain("1–30");
  expect(button("previous").disabled).toBe(true);
});

it("晚到的旧查询不能覆盖新查询的结果", async () => {
  let resolveOld!: (page: Page) => void;
  await boot(async (url) => url.searchParams.get("q") === "旧查询"
    ? new Promise<Page>((resolve) => { resolveOld = resolve; })
    : { total: 1, items: [job(url.searchParams.get("q") || "初始")] });
  field("query").value = "旧查询"; submit(); await flush();
  field("query").value = "新查询"; submit(); await flush();
  expect(document.getElementById("jobs")!.textContent).toContain("新查询");
  resolveOld({ total: 99, items: [job("旧查询")] }); await flush();
  expect(document.getElementById("jobs")!.textContent).toContain("新查询");
  expect(document.getElementById("jobCount")!.textContent).toContain("找到 1 个");
});

it("查询失败保留当前页，重试不会跳过一页", async () => {
  const offsets: number[] = [];
  let fail = true;
  await boot(async (url) => {
    const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
    if (offset && fail) { fail = false; throw Error("测试网络失败"); }
    return { total: 100, items: [job(String(offset))] };
  });
  button("next").click(); await flush();
  expect(document.getElementById("notice")!.textContent).toContain("测试网络失败");
  expect(document.getElementById("jobCount")!.textContent).toContain("1–30");
  button("next").click(); await flush();
  expect(offsets).toEqual([0, 30, 30]);
});

it("修改筛选条件后翻页，从新条件的第一页开始", async () => {
  const offsets: number[] = [];
  await boot(async (url) => {
    offsets.push(Number(url.searchParams.get("offset")));
    return { total: 100, items: [job("测试岗位")] };
  });
  button("next").click(); await flush();
  field("city").value = "北京";
  button("next").click(); await flush();
  expect(offsets).toEqual([0, 30, 0]);
});
