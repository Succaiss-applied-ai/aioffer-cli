import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { ResumeKnowledgeSnapshot, ResumeSection } from "../domain.js";

export const MAX_RESUME_BYTES = 15 * 1024 * 1024;

export type ResumeParserName = "mineru-pipeline" | "docx-local" | "plain-text";

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

export interface ResumeParseResult {
  parser: ResumeParserName;
  extractedText: string;
  draft: ResumeProfileDraft;
  warnings: string[];
}

export interface ResumeInput {
  filename: string;
  mediaType: string;
  buffer: Buffer;
}

export interface ResumeParser {
  parse(input: ResumeInput): Promise<ResumeParseResult>;
  capabilities(): {
    pdf: boolean;
    docx: boolean;
    text: boolean;
    pdfParser: "mineru-pipeline";
  };
}

export class ResumeValidationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "ResumeValidationError";
  }
}

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isZip(buffer: Buffer): boolean {
  const signature = buffer.subarray(0, 4).toString("hex");
  return signature === "504b0304" || signature === "504b0506";
}

export function validateResumeInput(input: ResumeInput): "pdf" | "docx" | "text" {
  if (!input.buffer.length) throw new ResumeValidationError("文件内容为空，请重新选择简历。", 400);
  if (input.buffer.length > MAX_RESUME_BYTES) {
    throw new ResumeValidationError("简历不能超过 15 MiB。", 413);
  }
  const extension = extname(input.filename).toLowerCase();
  if (extension === ".pdf" && isPdf(input.buffer)) return "pdf";
  if (extension === ".docx" && isZip(input.buffer)) return "docx";
  if ([".txt", ".md"].includes(extension) && !input.buffer.includes(0)) return "text";
  if (extension === ".doc") {
    throw new ResumeValidationError("暂不支持旧版 .doc，请在 Word 中另存为 .docx 后上传。", 415);
  }
  throw new ResumeValidationError("文件格式或内容不匹配，仅支持 PDF、DOCX、TXT 和 Markdown。", 415);
}

const skillAliases = [
  "Python", "Java", "JavaScript", "TypeScript", "Node.js", "React", "Vue", "Go", "Golang",
  "C++", "C#", "Rust", "PHP", "Django", "Flask", "FastAPI", "Spring Boot", "MySQL",
  "PostgreSQL", "MongoDB", "Redis", "Kafka", "Docker", "Kubernetes", "Linux", "Git", "AWS",
  "Azure", "GCP", "PyTorch", "TensorFlow", "LangChain"
] as const;

const sectionHeadings = [
  "个人简介", "自我介绍", "教育经历", "项目经历", "工作经历", "实习经历", "科研经历",
  "专业技能", "技能", "奖项与证书", "证书与奖项"
] as const;

function firstMatch(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.trim();
}

function extractName(text: string): string | undefined {
  const labelled = firstMatch(text, /(?:姓名|姓\s*名|Name)\s*[:：]\s*([^\n|｜]{2,30})/i);
  if (labelled) return labelled;
  return text.split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => /^[\p{Script=Han}·]{2,8}$/u.test(line) || /^[A-Za-z][A-Za-z .'-]{2,30}$/.test(line));
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

function sectionLines(text: string, heading: string): string[] {
  const lines = text.split("\n")
    .map((line) => line.replace(/^[•·-]\s*/, "").trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => line === heading);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && sectionHeadings.some((candidate) => candidate === line));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function monthValue(year: string, month: string): string {
  return `${year}-${month.padStart(2, "0")}`;
}

function dateRange(value: string): { startDate: string; endDate: string } | undefined {
  const match = value.match(/(\d{4})[.\-/年](\d{1,2})\s*(?:–|—|-|至)\s*(\d{4})[.\-/年](\d{1,2})/);
  if (!match) return undefined;
  return {
    startDate: monthValue(match[1]!, match[2]!),
    endDate: monthValue(match[3]!, match[4]!)
  };
}

function structuredEntries(lines: string[]): Array<{
  title: string;
  dates: { startDate: string; endDate: string };
  details: string[];
}> {
  const starts = lines.flatMap((line, index) => index < lines.length - 1 && dateRange(lines[index + 1]!)
    ? [{ index, line, dates: dateRange(lines[index + 1]!)! }]
    : []);
  return starts.map((entry, position) => ({
    title: entry.line,
    dates: entry.dates,
    details: lines.slice(entry.index + 2, starts[position + 1]?.index ?? lines.length)
  }));
}

function splitRole(value: string): [string, string] {
  const [primary = "", ...rest] = value.split(/[|｜]/).map((part) => part.trim());
  return [primary, rest.join("｜")];
}

function extractStructuredDraft(text: string): Pick<
  ResumeProfileDraft,
  "educationExperiences" | "workExperiences" | "projectExperiences" | "selfIntroduction" | "languages" | "certificates" | "awards"
> {
  const educationExperiences = structuredEntries(sectionLines(text, "教育经历")).map((entry) => {
    const parts = entry.title.split(/[|｜]/).map((part) => part.trim());
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
  const selfIntroduction = [
    ...sectionLines(text, "个人简介"),
    ...sectionLines(text, "自我介绍")
  ].join("\n");
  const skillsLines = [...sectionLines(text, "专业技能"), ...sectionLines(text, "技能")];
  const languageLine = skillsLines.find((line) => /^(?:语言能力|语言)(?:\s|[:：]|$)/.test(line));
  const languages = languageLine?.replace(/^(?:语言能力|语言)\s*[:：]?\s*/, "").trim();
  const awardsAndCertificates = [
    ...sectionLines(text, "奖项与证书"),
    ...sectionLines(text, "证书与奖项")
  ].join("\n");
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

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new ResumeValidationError("DOCX 压缩目录损坏。", 415);
}

function docxEntry(buffer: Buffer, wanted: (name: string) => boolean): Array<{ name: string; content: Buffer }> {
  const end = findEndOfCentralDirectory(buffer);
  const total = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const result: Array<{ name: string; content: Buffer }> = [];
  for (let index = 0; index < total; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (wanted(name)) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("DOCX 本地文件头损坏。");
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (!content) throw new Error(`DOCX 使用了不支持的压缩方式：${method}`);
      result.push({ name, content });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function decodeXml(value: string): string {
  return value
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractDocxText(buffer: Buffer): string {
  const entries = docxEntry(buffer, (name) => /^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name));
  const document = entries.find((entry) => entry.name === "word/document.xml");
  if (!document) throw new ResumeValidationError("DOCX 中缺少 word/document.xml。", 415);
  return entries.map((entry) => decodeXml(entry.content.toString("utf8"))).filter(Boolean).join("\n").trim();
}

function findMarkdown(value: unknown, depth = 0): string | undefined {
  if (depth > 6 || value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.length > 40 ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMarkdown(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["md", "markdown", "md_content", "markdown_content"]) {
    if (typeof record[key] === "string" && record[key].length) return record[key];
  }
  for (const nested of Object.values(record)) {
    const found = findMarkdown(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export class DefaultResumeParser implements ResumeParser {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: {
    mineruApiUrl?: string;
    timeoutMs?: number;
    fetcher?: typeof fetch;
  }) {
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  capabilities() {
    return {
      pdf: Boolean(this.options.mineruApiUrl),
      docx: true,
      text: true,
      pdfParser: "mineru-pipeline" as const
    };
  }

  async parse(input: ResumeInput): Promise<ResumeParseResult> {
    const type = validateResumeInput(input);
    if (type === "pdf") return this.parsePdf(input);
    const text = type === "docx"
      ? extractDocxText(input.buffer)
      : new TextDecoder("utf-8", { fatal: false }).decode(input.buffer).trim();
    if (!text) throw new Error(`${type === "docx" ? "Word" : "文本"} 文件中没有可识别的内容。`);
    return {
      parser: type === "docx" ? "docx-local" : "plain-text",
      extractedText: text,
      draft: buildProfileDraft(text),
      warnings: type === "docx" ? ["DOCX 已在本地提取文字，复杂表格和文本框请在提交前核对。"] : []
    };
  }

  private async parsePdf(input: ResumeInput): Promise<ResumeParseResult> {
    if (!this.options.mineruApiUrl) throw new Error("PDF 解析服务尚未配置，请配置 MinerU 地址。");
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(input.buffer)], { type: "application/pdf" }), input.filename);
    form.append("backend", "pipeline");
    form.append("parse_method", "auto");
    form.append("formula_enable", "false");
    form.append("table_enable", "false");
    form.append("return_md", "true");
    form.append("return_middle_json", "false");
    form.append("return_model_output", "false");
    form.append("return_content_list", "false");
    form.append("return_images", "false");
    const response = await this.fetcher(`${this.options.mineruApiUrl.replace(/\/$/, "")}/file_parse`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`MinerU 解析失败（${response.status}）${detail ? `：${detail}` : ""}`);
    }
    const text = findMarkdown(await response.json())?.trim();
    if (!text) throw new Error("MinerU 未返回可用的 Markdown 内容。");
    return {
      parser: "mineru-pipeline",
      extractedText: text,
      draft: buildProfileDraft(text),
      warnings: ["PDF 版式由 MinerU 识别，请在最终投递前核对结构化字段。"]
    };
  }
}

function section(kind: ResumeSection["kind"], id: string, facts: Record<string, unknown>): ResumeSection {
  return { kind, id, facts, evidenceRefs: ["uploaded-resume"] };
}

export function resumeKnowledgeFromParseResult(
  result: ResumeParseResult,
  input: { filename: string; userId?: string; now?: Date }
): ResumeKnowledgeSnapshot {
  const now = input.now ?? new Date();
  const draft = result.draft;
  const sections: ResumeSection[] = [];
  const basic = {
    ...(draft.name ? { fullName: draft.name } : {}),
    ...(draft.phone ? { phone: draft.phone } : {}),
    ...(draft.email ? { email: draft.email } : {}),
    ...(draft.currentLocation ? { currentCity: draft.currentLocation } : {}),
    ...(draft.targetLocations ? { preferredCities: draft.targetLocations } : {}),
    ...(draft.targetTitles ? { targetTitles: draft.targetTitles } : {})
  };
  if (Object.keys(basic).length) sections.push(section("basic", "basic-0", basic));
  draft.educationExperiences?.forEach((entry, index) => sections.push(section("education", `education-${index}`, entry)));
  draft.workExperiences?.forEach((entry, index) => sections.push(section(
    entry.employmentType === "internship" ? "internship" : "work",
    `work-${index}`,
    entry
  )));
  draft.projectExperiences?.forEach((entry, index) => sections.push(section("project", `project-${index}`, entry)));
  if (draft.skills.length) sections.push(section("skill", "skill-0", { summary: draft.skills.join("、"), items: draft.skills }));
  if (draft.selfIntroduction) sections.push(section("narrative", "narrative-0", { selfIntroduction: draft.selfIntroduction }));
  if (draft.awards || draft.certificates) sections.push(section("award", "award-0", {
    awards: draft.awards ?? "",
    certificates: draft.certificates ?? ""
  }));
  if (draft.targetTitles || draft.targetLocations) sections.push(section("intention", "intention-0", {
    targetTitles: draft.targetTitles ?? "",
    targetLocations: draft.targetLocations ?? ""
  }));
  return {
    id: randomUUID(),
    userId: input.userId ?? "extension-local-user",
    version: Math.max(1, Math.floor(now.getTime() / 1_000)),
    title: input.filename,
    sourceModule: `local-resume-parser:${result.parser}`,
    sourceDocumentRef: "extension-local-file",
    userApproved: true,
    sections,
    createdAt: now.toISOString()
  };
}
