import { describe, expect, it } from "vitest";
import { buildProfileDraft } from "./profile-draft.js";

const completeChineseResume = [
  "林测试",
  "电话：13800000000｜邮箱：lin.test@example.com｜现居住地：深圳",
  "求职意向：后端开发工程师｜意向城市：深圳、广州、杭州｜正式岗",
  "教育经历",
  "华南示例大学｜软件工程｜本科",
  "2017.09 - 2021.06",
  "工作经历",
  "星河示例科技有限公司｜后端开发工程师",
  "2023.07 - 2026.07",
  "负责订单与账户服务研发。",
  "云帆示例网络有限公司｜软件开发工程师",
  "2021.07 - 2023.06",
  "参与企业协作平台后端开发。",
  "项目经历",
  "Recruiting AI 表单助手｜项目负责人",
  "2025.10 - 2026.06",
  "设计岗位检索与投递状态机。",
  "高并发订单服务改造｜核心开发",
  "2024.03 - 2025.02",
  "完成幂等和异步事件改造。",
  "日志检索与告警平台｜全栈开发",
  "2022.01 - 2022.10",
  "实现检索与告警。"
].join("\n");

describe("browser-compatible resume profile draft", () => {
  it("extracts one education, two work and three project entries without duplicating date rows", () => {
    const draft = buildProfileDraft(completeChineseResume);
    expect(draft.name).toBe("林测试");
    expect(draft.currentLocation).toBe("深圳");
    expect(draft.targetLocations).toBe("深圳、广州、杭州");
    expect(draft.educationExperiences).toHaveLength(1);
    expect(draft.workExperiences).toHaveLength(2);
    expect(draft.projectExperiences).toHaveLength(3);
    expect(draft.projectExperiences?.map((entry) => entry.name)).toEqual([
      "Recruiting AI 表单助手",
      "高并发订单服务改造",
      "日志检索与告警平台"
    ]);
    expect(draft.workExperiences?.[0]).toMatchObject({
      company: "星河示例科技有限公司",
      title: "后端开发工程师",
      startDate: "2023-07",
      endDate: "2026-07",
      description: "负责订单与账户服务研发。"
    });
  });
});
