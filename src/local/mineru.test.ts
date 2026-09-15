import { describe, it, expect, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseMineru } from "./mineru.js";
describe("MinerU 本地上传", () => {
  it("只向 API 发送 Key，按任务标识读取 Markdown", async () => {
    let id = "";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: any, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/file-urls/batch")) {
        id = JSON.parse(init?.body as string).files[0].data_id;
        return Response.json({
          code: 0,
          data: {
            batch_id: "batch-1",
            file_urls: ["https://bucket.aliyuncs.com/upload?signature=example"],
          },
        });
      }
      if (init?.method === "PUT") return new Response("");
      if (url.includes("/extract-results/"))
        return Response.json({
          code: 0,
          data: {
            extract_result: [
              {
                data_id: id,
                state: "done",
                full_zip_url: "https://cdn-mineru.openxlab.org.cn/result.zip",
              },
            ],
          },
        });
      return new Response(
        zipSync({
          "full.md": strToU8("中文简历"),
          "../private.txt": strToU8("不会写盘"),
        }),
      );
    });
    expect(
      await parseMineru(strToU8("pdf"), "简历.pdf", "test-mineru", fetcher, 0),
    ).toBe("中文简历");
    for (const call of calls.filter(
      (x) => !x.url.startsWith("https://mineru.net/"),
    ))
      expect(call.init?.headers).toBeUndefined();
    expect(calls.every((x) => x.init?.redirect === "error")).toBe(true);
  });
  it("拒绝第三方上传地址", async () => {
    await expect(
      parseMineru(
        strToU8("pdf"),
        "简历.pdf",
        "test",
        async () =>
          Response.json({
            code: 0,
            data: { batch_id: "x", file_urls: ["https://evil.example/upload"] },
          }),
        0,
      ),
    ).rejects.toThrow("不受信任");
  });
});
