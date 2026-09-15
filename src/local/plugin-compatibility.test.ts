import { describe, expect, it } from "vitest";
import { assertLocalPlugin } from "../../web/plugin-compatibility.js";

describe("本地插件握手", () => {
  it("拒绝同协议的旧云端插件，不仅依赖版本号", () => {
    expect(() => assertLocalPlugin({ version: "0.15.61" })).toThrow(
      "尚未发送配对凭据",
    );
    expect(() => assertLocalPlugin({ version: "1.0.12" })).toThrow(
      "不是 aioffer-cli 本地版",
    );
    expect(() => assertLocalPlugin(null)).toThrow();
  });
  it("接受明确标识的本地插件", () => {
    expect(() =>
      assertLocalPlugin({ version: "1.0.12", runtime: "aioffer-cli" }),
    ).not.toThrow();
  });
});
