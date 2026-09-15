import { describe, expect, it } from "vitest";
import { isInvalidVisionPlanWarning } from "./vision-plan-failure.js";

describe("legacy Gateway malformed-plan classification", () => {
  it.each([
    "Expected ',' or ']' after array element in JSON at position 2644 (line 699 column 1)",
    "Unexpected end of JSON input", "Unexpected token 'x', x is not valid JSON",
    "Unterminated string in JSON at position 10"
  ])("identifies a malformed response: %s", message => {
    expect(isInvalidVisionPlanWarning([`zhencai 视觉模型规划失败：${message}`])).toBe(true);
  });
  it.each([undefined, [], ["模型未配置"], ["zhencai 视觉模型规划失败：request timed out"],
    ["zhencai 视觉模型规划失败：HTTP 503"], ["zhencai 视觉模型规划失败：HTTP 401"],
    ["zhencai 视觉模型规划失败：JSON response request aborted"], ["请填写 JSON 专业"]
  ])("does not relabel service/configuration failures: %j", warnings => {
    expect(isInvalidVisionPlanWarning(warnings)).toBe(false);
  });
});
