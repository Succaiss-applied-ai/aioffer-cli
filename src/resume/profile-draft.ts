export interface ResumeProfileDraft {
  name?: string;
  email?: string;
  phone?: string;
  currentLocation?: string;
  targetTitles?: string;
  targetLocations?: string;
  educationLevel?: "high_school" | "associate" | "bachelor" | "master" | "doctorate" | "other";
  yearsOfExperience?: number;
  skills: string[];
  educationExperiences?: Array<{
    school: string;
    major: string;
    degree: NonNullable<ResumeProfileDraft["educationLevel"]>;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  workExperiences?: Array<{
    company: string;
    department: string;
    title: string;
    employmentType: "full_time" | "internship";
    startDate: string;
    endDate: string;
    description: string;
  }>;
  projectExperiences?: Array<{
    name: string;
    role: string;
    startDate: string;
    endDate: string;
    techStack: string;
    description: string;
    projectUrl: string;
  }>;
  selfIntroduction?: string;
  languages?: string;
  certificates?: string;
  awards?: string;
}

const skillAliases = [
  "Python", "Java", "JavaScript", "TypeScript", "Node.js", "React", "Vue", "Go", "Golang",
  "C++", "C#", "Rust", "PHP", "Django", "Flask", "FastAPI", "Spring Boot", "MySQL",
  "PostgreSQL", "MongoDB", "Redis", "Kafka", "Docker", "Kubernetes", "Linux", "Git", "AWS",
  "Azure", "GCP", "PyTorch", "TensorFlow", "LangChain"
] as const;

const sectionHeadings = [
  "个人简介", "自我介绍", "自我评价", "教育经历", "教育背景", "项目经历", "项目经验",
  "工作经历", "工作经验", "实习经历", "科研经历", "专业技能", "技能", "奖项与证书",
  "证书与奖项", "荣誉奖项"
] as const;

const headingAliases: Record<string, string> = {
  教育背景: "教育经历",
  项目经验: "项目经历",
  工作经验: "工作经历",
  自我评价: "个人简介",
  荣誉奖项: "奖项与证书"
};

function firstMatch(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.trim();
}

function extractName(text: string): string | undefined {
  const labelled = firstMatch(text, /(?:姓名|姓\s*名|Name)\s*[:：]\s*([^\n|｜]{2,30})/i);
  if (labelled) return labelled;
  const rejected = /简历|求职|教育|经历|技能|项目|党员|团员|群众/;
  return text.split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim().split(/[|｜·,，\s]+/)[0] ?? "")
    .find((line) => !rejected.test(line) &&
      (/^[\p{Script=Han}·]{2,8}$/u.test(line) || /^[A-Za-z][A-Za-z .'-]{2,30}$/.test(line)));
}

function extractEducation(text: string): ResumeProfileDraft["educationLevel"] {
  if (/博士|Ph\.?D|Doctorate/i.test(text)) return "doctorate";
  if (/硕士|研究生|Master/i.test(text)) return "master";
  if (/本科|学士|Bachelor/i.test(text)) return "bachelor";
  if (/大专|专科|Associate/i.test(text)) return "associate";
  if (/高中|High School/i.test(text)) return "high_school";
  return undefined;
}

function extractSkills(text: string): string[] {
  const normalized = text.toLowerCase();
  return [...new Set(skillAliases
    .filter((skill) => normalized.includes(skill.toLowerCase()))
    .map((skill) => skill === "Golang" ? "Go" : skill))];
}

function canonicalHeading(line: string): string {
  const cleaned = line.replace(/^#+\s*/, "").replace(/[:：]$/, "").replace(/\s+/g, "");
  return headingAliases[cleaned] ?? cleaned;
}

function sectionLines(text: string, wanted: string): string[] {
  const lines = text.split("\n")
    .map((line) => line.replace(/^[•·-]\s*/, "").trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => canonicalHeading(line) === wanted);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start &&
    sectionHeadings.some((heading) => canonicalHeading(line) === (headingAliases[heading] ?? heading)));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function monthValue(year: string, month: string): string {
  return `${year}-${month.padStart(2, "0")}`;
}

function dateRange(value: string): { startDate: string; endDate: string } | undefined {
  const match = value.match(/(\d{4})[.\-/年](\d{1,2})\s*月?\s*(?:–|—|-|~|至)\s*(?:(\d{4})[.\-/年](\d{1,2})\s*月?|(至今|现在|present|now))/i);
  if (!match) return undefined;
  return {
    startDate: monthValue(match[1]!, match[2]!),
    endDate: match[3] ? monthValue(match[3], match[4]!) : "至今"
  };
}

function stripDateRange(value: string): string {
  return value.replace(/\d{4}[.\-/年]\d{1,2}\s*月?\s*(?:–|—|-|~|至)\s*(?:(?:\d{4}[.\-/年]\d{1,2}\s*月?)|至今|现在|present|now)/i, "").trim();
}

function structuredEntries(lines: string[]): Array<{
  title: string;
  dates: { startDate: string; endDate: string };
  details: string[];
}> {
  const starts = lines.flatMap((line, index) => {
    const inline = dateRange(line);
    const inlineTitle = inline ? stripDateRange(line) : "";
    if (inline && inlineTitle) return [{ index, line: inlineTitle, dates: inline, dateOnNextLine: false }];
    const next = index < lines.length - 1 ? dateRange(lines[index + 1]!) : undefined;
    return next ? [{ index, line, dates: next, dateOnNextLine: true }] : [];
  });
  return starts.map((entry, position) => ({
    title: entry.line,
    dates: entry.dates,
    details: lines.slice(entry.index + (entry.dateOnNextLine ? 2 : 1), starts[position + 1]?.index ?? lines.length)
  }));
}

function splitRole(value: string): [string, string] {
  const separated = value.split(/[|｜·]/).map((part) => part.trim()).filter(Boolean);
  if (separated.length > 1) return [separated[0]!, separated.slice(1).join("｜")];
  const parts = value.split(/\s{2,}|\t/).map((part) => part.trim()).filter(Boolean);
  return [parts[0] ?? value.trim(), parts.slice(1).join(" ")];
}

function extractStructuredDraft(text: string): Pick<
  ResumeProfileDraft,
  "educationExperiences" | "workExperiences" | "projectExperiences" | "selfIntroduction" | "languages" | "certificates" | "awards"
> {
  const educationExperiences = structuredEntries(sectionLines(text, "教育经历")).map((entry) => {
    const parts = entry.title.split(/[|｜·]/).map((part) => part.trim()).filter(Boolean);
    return {
      school: parts[0] ?? "",
      major: parts[1] ?? "",
      degree: extractEducation(entry.title) ?? "other" as const,
      ...entry.dates,
      description: entry.details.join("\n")
    };
  });
  const projectExperiences = structuredEntries(sectionLines(text, "项目经历")).map((entry) => {
    const [name, role] = splitRole(entry.title);
    const description = entry.details.join("\n");
    return {
      name,
      role,
      ...entry.dates,
      techStack: extractSkills(description).join("、"),
      description,
      projectUrl: firstMatch(description, /(https?:\/\/\S+)/i) ?? ""
    };
  });
  const workExperiences = [
    ...structuredEntries(sectionLines(text, "工作经历")).map((entry) => ({ entry, employmentType: "full_time" as const })),
    ...structuredEntries(sectionLines(text, "实习经历")).map((entry) => ({ entry, employmentType: "internship" as const }))
  ].map(({ entry, employmentType }) => {
    const [company, title] = splitRole(entry.title);
    return {
      company,
      department: "",
      title,
      employmentType,
      ...entry.dates,
      description: entry.details.join("\n")
    };
  });
  const selfIntroduction = sectionLines(text, "个人简介").join("\n");
  const skillsLines = sectionLines(text, "专业技能").length
    ? sectionLines(text, "专业技能") : sectionLines(text, "技能");
  const languageLine = skillsLines.find((line) => /^(?:语言能力|语言)(?:\s|[:：]|$)/.test(line));
  const languages = languageLine?.replace(/^(?:语言能力|语言)\s*[:：]?\s*/, "").trim();
  const awardsAndCertificates = sectionLines(text, "奖项与证书").join("\n");
  return {
    ...(educationExperiences.length ? { educationExperiences } : {}),
    ...(workExperiences.length ? { workExperiences } : {}),
    ...(projectExperiences.length ? { projectExperiences } : {}),
    ...(selfIntroduction ? { selfIntroduction } : {}),
    ...(languages ? { languages } : {}),
    ...(awardsAndCertificates ? { certificates: awardsAndCertificates, awards: awardsAndCertificates } : {})
  };
}

export function buildProfileDraft(text: string): ResumeProfileDraft {
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const experience = firstMatch(normalized, /(\d+(?:\.\d+)?)\s*(?:年(?:以上)?(?:工作|相关|开发)?经验|years?(?:\s+of)?(?:\s+(?:work|relevant|development))?\s+experience)/i);
  const targetTitles = firstMatch(normalized, /(?:求职意向|目标岗位|期望职位|Target Role|Target Position|Career Objective)\s*[:：]\s*([^\n|｜]{2,80})/i);
  const targetLocations = firstMatch(normalized, /(?:意向城市|意向地点|期望城市|工作地点|Target Locations?|Preferred Locations?)\s*[:：]\s*([^\n|｜]{2,80})/i);
  const currentLocation = firstMatch(normalized, /(?:现居住地|现居地|所在地|当前城市|居住地|Current Location|Based In)\s*[:：]\s*([^\n|｜]{2,40})/i);
  const email = firstMatch(normalized, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  const phone = firstMatch(normalized, /((?:\+?86[- ]?)?1[3-9]\d{9})/)?.replace(/[- ]/g, "");
  const name = extractName(normalized);
  const educationLevel = extractEducation(normalized);
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(currentLocation ? { currentLocation } : {}),
    ...(targetTitles ? { targetTitles } : {}),
    ...(targetLocations ? { targetLocations } : {}),
    ...(educationLevel ? { educationLevel } : {}),
    ...(experience ? { yearsOfExperience: Number(experience) }
      : /应届|在校生|校园招聘|new graduate|campus recruitment|student/i.test(normalized)
        ? { yearsOfExperience: 0 } : {}),
    skills: extractSkills(normalized),
    ...extractStructuredDraft(normalized)
  };
}
