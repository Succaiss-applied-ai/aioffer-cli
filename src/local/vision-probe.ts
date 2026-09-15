import sharp from "sharp";
import { randomInt } from "node:crypto";
import { complete, parseModelJson, type ModelConfig } from "./providers.js";
/** 答案仅存在图片中，不在文字提示中提供。测试不会读取用户文件。 */
export async function testVisionModel(config: ModelConfig) {
  const palette = [
    { name: "red", rgb: [240, 30, 30] },
    { name: "green", rgb: [20, 210, 50] },
    { name: "blue", rgb: [30, 60, 240] },
  ];
  for (let i = palette.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [palette[i], palette[j]] = [palette[j]!, palette[i]!];
  }
  const pixels = Buffer.alloc(96 * 48 * 3);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 96; x++)
      for (let c = 0; c < 3; c++)
        pixels[(y * 96 + x) * 3 + c] = palette[Math.floor(x / 32)]!.rgb[c]!;
  const image = await sharp(pixels, {
    raw: { width: 96, height: 48, channels: 3 },
  })
    .png()
    .toBuffer();
  const result = parseModelJson(
    await complete(config, {
      system: "你正在进行图像输入测试，只返回 JSON。",
      text: '读取图片，从左到右列出三个色块的颜色。输出 {"colors":[...]}，各项只使用英文小写颜色名称 red、green 或 blue。',
      image: `data:image/png;base64,${image.toString("base64")}`,
    }),
  );
  if (
    JSON.stringify(result.colors) !== JSON.stringify(palette.map((x) => x.name))
  )
    throw Error("模型未正确识别测试图片，请检查所选模型是否支持视觉输入");
  return "图片请求及颜色识别通过；这不代表所有招聘控件都能正确识别";
}
