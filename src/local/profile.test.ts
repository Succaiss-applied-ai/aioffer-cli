import { describe, expect, it } from "vitest";
import { normalizeExtractedProfile } from "./profile.js";

describe("真实模型资料结构兼容", () => {
  it("无损转换技能字符串，保留对象且不补充未知身份信息", () => {
    const input = {
      schemaVersion: "candidate-profile.v1",
      basic: { fullName: "合成测试" },
      skills: ["TypeScript", { summary: "Node.js", level: "熟练" }],
    };
    const result = normalizeExtractedProfile(input);
    expect(result.skills).toEqual([
      { summary: "TypeScript" },
      { summary: "Node.js", level: "熟练" },
    ]);
    expect(result.basic).toEqual({ fullName: "合成测试" });
    expect(input.skills[0]).toBe("TypeScript");
  });
  it("不把无效技能或经历伪装成有效事实", () => {
    expect(() =>
      normalizeExtractedProfile({
        schemaVersion: "candidate-profile.v1",
        skills: [null],
      }),
    ).toThrow();
    expect(() =>
      normalizeExtractedProfile({
        schemaVersion: "candidate-profile.v1",
        educations: ["未知学校"],
      }),
    ).toThrow();
  });
});
