import { defineConfig } from "vitest/config";
// 本项目入口仅包含投递运行时；不运行未迁移的云端搜索服务测试。
export default defineConfig({
  test: {
    include: [
      "src/local/**/*.test.ts",
      "src/gateway/**/*.test.ts",
      "extension/src/**/*.test.ts",
    ],
  },
});
