import { describe, expect, it } from "vitest";
import { createSearchPlan, refineSearchPlan } from "./search-plan.js";

describe("prompt-driven search plans", () => {
  it("extracts hard filters and exclusions from a Chinese prompt", () => {
    const plan = createSearchPlan(
      "找深圳和广州的 Python后端 应届岗位，排除外包，最近两周发布，本科"
    );
    expect(plan.filters.locations).toEqual(["深圳", "广州"]);
    expect(plan.filters.roles).toEqual(["Python后端"]);
    expect(plan.filters.skills).toContain("Python");
    expect(plan.filters.channels).toContain("graduate");
    expect(plan.filters.excludedTerms).toEqual(["外包", "人力派遣"]);
    expect(plan.filters.publishedWithinDays).toBe(14);
    expect(plan.filters.maximumExperienceYears).toBe(0);
    expect(plan.unresolvedQuestions).toEqual([]);
  });

  it("recognizes mixed Chinese and English roles when users insert spaces", () => {
    const plan = createSearchPlan(
      "找深圳和广州的 Python 后端应届正式岗，0年经验，排除外包"
    );
    expect(plan.filters.roles).toEqual(["Python后端"]);
    expect(plan.filters.employmentTypes).toEqual(["full_time"]);
    expect(plan.unresolvedQuestions).toEqual([]);
  });

  it("defaults zero-experience searches to campus and graduate channels", () => {
    const plan = createSearchPlan("深圳 Python后端 0年经验");
    expect(plan.filters.channels).toEqual(["campus", "graduate"]);
  });

  it("creates a new version when the user refines the range", () => {
    const initial = createSearchPlan("深圳 Python后端 应届");
    const refined = refineSearchPlan(initial, "再加上东莞，只看最近7天");
    expect(refined.id).toBe(initial.id);
    expect(refined.version).toBe(2);
    expect(refined.filters.locations).toEqual(["深圳", "东莞"]);
    expect(refined.filters.publishedWithinDays).toBe(7);
  });

  it("can remove a city without losing the rest of the plan", () => {
    const initial = createSearchPlan("深圳和广州 Python后端 应届");
    const refined = refineSearchPlan(initial, "去掉广州");
    expect(refined.filters.locations).toEqual(["深圳"]);
    expect(refined.filters.roles).toEqual(["Python后端"]);
  });

  it("treats all cities as no location filter instead of a keyword", () => {
    const plan = createSearchPlan("所有城市的后端开发");
    expect(plan.filters.locationMode).toBe("anywhere");
    expect(plan.filters.locations).toEqual([]);
    expect(plan.filters.roles).toEqual(["后端开发"]);
    expect(plan.unresolvedQuestions).toEqual([]);
    expect(plan.sourcePrompt).toContain("城市：不限");
  });

  it("keeps only the latest editor sentence instead of accumulating adjustment history", () => {
    const initial = createSearchPlan("所有城市的后端开发");
    const once = refineSearchPlan(initial, "调整为后端开发");
    const final = refineSearchPlan(once, "只检索后端开发");
    expect(final.displayPrompt).toBe("只检索后端开发");
    expect(final.sourcePrompt).not.toContain("调整：");
    expect(final.sourcePrompt).not.toContain("\n");
    expect(final.filters.locationMode).toBe("anywhere");
  });
});
