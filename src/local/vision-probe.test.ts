import { afterEach, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { testVisionModel } from "./vision-probe.js";
const config = {
  provider: "compatible" as const,
  model: "test",
  apiKey: "test-only",
  baseUrl: "http://127.0.0.1:29999/v1",
};
afterEach(() => vi.unstubAllGlobals());
describe("视觉连接测试", () => {
  it("确实编码三个颜色块，并检验返回顺序", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const payload = JSON.parse(init.body);
        const image = payload.messages[1].content.find(
          (x: any) => x.type === "image_url",
        ).image_url.url;
        const { data, info } = await sharp(
          Buffer.from(image.split(",")[1], "base64"),
        )
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(info.width).toBe(96);
        const colors = [16, 48, 80].map((x) => {
          const pixel = [
            ...data.subarray(x * info.channels, x * info.channels + 3),
          ];
          return ["red", "green", "blue"][pixel.indexOf(Math.max(...pixel))];
        });
        return Response.json({
          choices: [{ message: { content: JSON.stringify({ colors }) } }],
        });
      }),
    );
    await expect(testVisionModel(config)).resolves.toContain("颜色识别通过");
  });
  it("不能用一句图片可读代替识别结果", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        choices: [{ message: { content: '{"imageReadable":true}' } }],
      }),
    );
    await expect(testVisionModel(config)).rejects.toThrow("未正确识别");
  });
});
