import {
  searchFiltersSchema,
  searchPlanSchema,
  type SearchFilters,
  type SearchPlan
} from "../domain.js";

const rolePatterns = [
  "Python后端",
  "后端开发",
  "前端开发",
  "全栈开发",
  "Java开发",
  "算法工程师",
  "数据分析",
  "产品经理",
  "测试工程师",
  "运维工程师"
];

const cityPatterns = [
  "北京",
  "上海",
  "深圳",
  "广州",
  "杭州",
  "成都",
  "武汉",
  "南京",
  "苏州",
  "东莞"
];

const unrestrictedLocationPattern =
  /(?:所有|全部|任意)城市|城市不限|不限城市|不限地点|地点不限|全国(?:均可|可投)?|不(?:限|限制)(?:城市|地区|地点)|anywhere/i;

const skillPatterns = [
  "Python",
  "Java",
  "JavaScript",
  "TypeScript",
  "Go",
  "Rust",
  "C++",
  "React",
  "Vue",
  "Node.js",
  "SQL",
  "大模型",
  "AI Agent"
];

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function includesAny(prompt: string, values: string[]): string[] {
  const normalizedPrompt = prompt.toLocaleLowerCase().replace(/\s+/g, "");
  return values.filter((value) =>
    normalizedPrompt.includes(value.toLocaleLowerCase().replace(/\s+/g, ""))
  );
}

function parseNumberBefore(prompt: string, suffix: string): number | null {
  const match = prompt.match(new RegExp(`(\\d+)\\s*${suffix}`));
  return match ? Number(match[1]) : null;
}

function baseFilters(prompt: string): SearchFilters {
  const maximumExperienceYears = /0\s*年|零经验|无经验|应届/.test(prompt)
    ? 0
    : parseNumberBefore(prompt, "年经验");
  const publishedWithinDays = /最近两周|近两周/.test(prompt)
    ? 14
    : /最近一周|近一周/.test(prompt)
      ? 7
      : parseNumberBefore(prompt, "天");
  const excludedTerms: string[] = [];
  if (/排除外包|不要外包|非外包/.test(prompt)) {
    excludedTerms.push("外包", "人力派遣");
  }
  const channels: SearchFilters["channels"] = [];
  if (/校招|校园招聘/.test(prompt)) channels.push("campus");
  if (/应届/.test(prompt)) channels.push("graduate");
  if (/社招|社会招聘/.test(prompt)) channels.push("social");
  if (/实习/.test(prompt)) channels.push("internship");
  if (maximumExperienceYears === 0 && channels.length === 0) {
    channels.push("campus", "graduate");
  }
  const employmentTypes: SearchFilters["employmentTypes"] = [];
  if (/正式岗|全职/.test(prompt)) employmentTypes.push("full_time");
  if (/实习岗|实习/.test(prompt)) employmentTypes.push("internship");
  const roles = includesAny(prompt, rolePatterns);
  if (roles.length === 0 && /后端/.test(prompt)) roles.push("后端开发");
  const locations = includesAny(prompt, cityPatterns);
  const locationMode = locations.length === 0 && unrestrictedLocationPattern.test(prompt)
    ? "anywhere"
    : "specified";
  return {
    roles,
    locationMode,
    locations: locationMode === "anywhere" ? [] : locations,
    channels: unique(channels),
    employmentTypes: unique(employmentTypes),
    industries: includesAny(prompt, [
      "人工智能",
      "机器人",
      "互联网",
      "新能源",
      "金融",
      "游戏",
      "制造业"
    ]),
    skills: includesAny(prompt, skillPatterns),
    degrees: includesAny(prompt, ["博士", "硕士", "本科", "大专"]),
    excludedTerms,
    maximumExperienceYears,
    publishedWithinDays,
    maximumResults: 100,
    maximumJobsPerCompany: 5
  };
}

function constraints(filters: SearchFilters): string[] {
  return [
    filters.locationMode === "anywhere"
      ? "地点：不限城市"
      : filters.locations.length
        ? `地点：${filters.locations.join("、")}`
        : "",
    filters.channels.length ? `招聘通道：${filters.channels.join("、")}` : "",
    filters.maximumExperienceYears !== null
      ? `最高经验：${filters.maximumExperienceYears}年`
      : "",
    filters.degrees.length ? `学历：${filters.degrees.join("、")}` : "",
    filters.excludedTerms.length
      ? `排除：${filters.excludedTerms.join("、")}`
      : ""
  ].filter(Boolean);
}

function questions(filters: SearchFilters): string[] {
  const output: string[] = [];
  if (filters.roles.length === 0) output.push("希望寻找哪些岗位？");
  if (filters.locationMode !== "anywhere" && filters.locations.length === 0) {
    output.push("意向工作城市有哪些？也可以填写“不限城市”。");
  }
  return output;
}

function canonicalPrompt(filters: SearchFilters): string {
  const parts = [
    filters.roles.length ? `岗位：${filters.roles.join("、")}` : "岗位：待补充",
    filters.locationMode === "anywhere"
      ? "城市：不限"
      : filters.locations.length
        ? `城市：${filters.locations.join("、")}`
        : "城市：待补充",
    filters.channels.length ? `通道：${filters.channels.join("、")}` : "",
    filters.employmentTypes.length
      ? `用工类型：${filters.employmentTypes.join("、")}`
      : "",
    filters.industries.length ? `行业：${filters.industries.join("、")}` : "",
    filters.skills.length ? `技能：${filters.skills.join("、")}` : "",
    filters.degrees.length ? `学历：${filters.degrees.join("、")}` : "",
    filters.excludedTerms.length ? `排除：${filters.excludedTerms.join("、")}` : ""
  ].filter(Boolean);
  return parts.join("；");
}

function normalizeLocationIntent(
  prompt: string,
  filters: SearchFilters
): SearchFilters {
  const concreteLocations = filters.locations.filter(
    (location) => !unrestrictedLocationPattern.test(location.trim())
  );
  const locationMode = concreteLocations.length > 0
    ? "specified"
    : filters.locationMode === "anywhere" || unrestrictedLocationPattern.test(prompt)
      ? "anywhere"
      : "specified";
  return {
    ...filters,
    locationMode,
    locations: locationMode === "anywhere" ? [] : unique(concreteLocations)
  };
}

export function createSearchPlanFromFilters(
  prompt: string,
  proposed: Partial<SearchFilters>,
  now = new Date()
): SearchPlan {
  const deterministic = baseFilters(prompt.trim());
  const filters = normalizeLocationIntent(prompt, searchFiltersSchema.parse({
    ...deterministic,
    ...proposed,
    maximumResults: proposed.maximumResults ?? deterministic.maximumResults,
    maximumJobsPerCompany:
      proposed.maximumJobsPerCompany ?? deterministic.maximumJobsPerCompany
  }));
  return searchPlanSchema.parse({
    id: crypto.randomUUID(),
    version: 1,
    sourcePrompt: canonicalPrompt(filters),
    displayPrompt: prompt.trim(),
    filters,
    hardConstraints: constraints(filters),
    preferences: filters.industries.map((item) => `优先行业：${item}`),
    unresolvedQuestions: questions(filters),
    createdAt: now.toISOString()
  });
}

export function createSearchPlan(prompt: string, now = new Date()): SearchPlan {
  return createSearchPlanFromFilters(prompt, {}, now);
}

export function refineSearchPlan(
  current: SearchPlan,
  prompt: string,
  now = new Date()
): SearchPlan {
  const delta = baseFilters(prompt);
  const removeLocations = cityPatterns.filter(
    (city) => new RegExp(`(?:排除|不要|去掉)${city}`).test(prompt)
  );
  const merge = (left: string[], right: string[], removed: string[] = []) =>
    unique([...left, ...right]).filter((value) => !removed.includes(value));
  const filters: SearchFilters = {
    ...current.filters,
    roles: /只(?:检索|看|要|找)/.test(prompt) && delta.roles.length
      ? delta.roles
      : merge(current.filters.roles, delta.roles),
    locationMode: delta.locationMode === "anywhere"
      ? "anywhere"
      : delta.locations.length
        ? "specified"
        : current.filters.locationMode,
    locations: delta.locationMode === "anywhere"
      ? []
      : merge(current.filters.locations, delta.locations, removeLocations),
    channels: delta.channels.length ? delta.channels : current.filters.channels,
    employmentTypes: delta.employmentTypes.length
      ? delta.employmentTypes
      : current.filters.employmentTypes,
    industries: merge(current.filters.industries, delta.industries),
    skills: merge(current.filters.skills, delta.skills),
    degrees: delta.degrees.length ? delta.degrees : current.filters.degrees,
    excludedTerms: merge(current.filters.excludedTerms, delta.excludedTerms),
    maximumExperienceYears:
      delta.maximumExperienceYears ?? current.filters.maximumExperienceYears,
    publishedWithinDays:
      delta.publishedWithinDays ?? current.filters.publishedWithinDays
  };
  const normalizedFilters = normalizeLocationIntent(prompt, filters);
  return searchPlanSchema.parse({
    ...current,
    version: current.version + 1,
    sourcePrompt: canonicalPrompt(normalizedFilters),
    displayPrompt: prompt.trim(),
    filters: normalizedFilters,
    hardConstraints: constraints(normalizedFilters),
    preferences: normalizedFilters.industries.map((item) => `优先行业：${item}`),
    unresolvedQuestions: questions(normalizedFilters),
    createdAt: now.toISOString()
  });
}

export function refineSearchPlanFromFilters(
  current: SearchPlan,
  prompt: string,
  proposed: Partial<SearchFilters>,
  now = new Date()
): SearchPlan {
  const delta = searchFiltersSchema.parse(proposed);
  const removeLocations = cityPatterns.filter(
    (city) => new RegExp(`(?:排除|不要|去掉)${city}`).test(prompt)
  );
  const merge = (left: string[], right: string[], removed: string[] = []) =>
    unique([...left, ...right]).filter((value) => !removed.includes(value));
  const filters = normalizeLocationIntent(prompt, searchFiltersSchema.parse({
    ...current.filters,
    roles: /只(?:检索|看|要|找)/.test(prompt) && delta.roles.length
      ? delta.roles
      : merge(current.filters.roles, delta.roles),
    locationMode: delta.locationMode === "anywhere"
      ? "anywhere"
      : delta.locations.length
        ? "specified"
        : current.filters.locationMode,
    locations: delta.locationMode === "anywhere"
      ? []
      : merge(current.filters.locations, delta.locations, removeLocations),
    channels: delta.channels.length ? delta.channels : current.filters.channels,
    employmentTypes: delta.employmentTypes.length
      ? delta.employmentTypes
      : current.filters.employmentTypes,
    industries: merge(current.filters.industries, delta.industries),
    skills: merge(current.filters.skills, delta.skills),
    degrees: delta.degrees.length ? delta.degrees : current.filters.degrees,
    excludedTerms: merge(current.filters.excludedTerms, delta.excludedTerms),
    maximumExperienceYears:
      delta.maximumExperienceYears ?? current.filters.maximumExperienceYears,
    publishedWithinDays:
      delta.publishedWithinDays ?? current.filters.publishedWithinDays,
    maximumResults: delta.maximumResults ?? current.filters.maximumResults,
    maximumJobsPerCompany:
      delta.maximumJobsPerCompany ?? current.filters.maximumJobsPerCompany
  }));
  return searchPlanSchema.parse({
    ...current,
    version: current.version + 1,
    sourcePrompt: canonicalPrompt(filters),
    displayPrompt: prompt.trim(),
    filters,
    hardConstraints: constraints(filters),
    preferences: filters.industries.map((item) => `优先行业：${item}`),
    unresolvedQuestions: questions(filters),
    createdAt: now.toISOString()
  });
}
