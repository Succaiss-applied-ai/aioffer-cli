export type StableSectionKey =
  "basic" | "education" | "work" | "project" | "research" |
  "award" | "language" | "intention" | "attachments" | "consent" | "other";

export interface StableFieldIdentityInput {
  label: string;
  sectionTitle?: string | null;
  controlKind: string;
  name?: string | null;
  dataFieldName?: string | null;
  placeholder?: string | null;
  groupIndex?: number | null;
  localOrdinal?: number;
}

export interface StableFieldIdentity {
  stableFieldKey: string;
  sectionKey: StableSectionKey;
  semanticSlot: string;
  groupIndex: number | null;
}

const normalizeIdentityText = (value: unknown) => String(value ?? "")
  .replace(/[＊*]\s*(?:必填)?/g, "")
  .replace(/[()（）【】\[\]{}<>《》:：｜|·・._-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

export function stableSectionKey(label: string, sectionTitle?: string | null): StableSectionKey {
  const text = `${sectionTitle ?? ""} ${label}`;
  if (/简历|附件|证件照|照片|头像|上传|resume|cv|photo/i.test(text)) return "attachments";
  if (/隐私|授权|条款|同意|consent/i.test(text)) return "consent";
  if (/教育|学校|院校|学历|学位|专业|毕业|入学|education|school|degree|major/i.test(text)) return "education";
  if (/工作经历|实习经历|任职经历|公司|单位|职位|岗位|职责|work|internship|company|position/i.test(text)) return "work";
  if (/项目经历|项目经验|项目名称|项目描述|project/i.test(text)) return "project";
  if (/科研|论文|专利|publication|research/i.test(text)) return "research";
  if (/获奖|奖项|荣誉|award/i.test(text)) return "award";
  if (/语言|语种|英语|language/i.test(text)) return "language";
  if (/意向|期望|工作城市|求职|城市|地点|preference|intention/i.test(text)) return "intention";
  if (/姓名|名字|手机|电话|邮箱|性别|出生|籍贯|证件|basic|name|phone|email|birth|native.?place|hometown/i.test(text)) return "basic";
  return "other";
}

export function stableSemanticSlot(label: string, fallback?: string | null): string {
  const text = normalizeIdentityText(label);
  const rawFallback = normalizeIdentityText(fallback);
  if (/证件照|头像|个人照片|photo/.test(text)) return "identity_photo";
  if (/证件类型|证件种类|identity document type/.test(text)) return "identity_document_type";
  if (/证件号码|证件号|身份证号码|身份证号|identity document number/.test(text)) return "identity_document_number";
  if (/简历|附件|resume|cv/.test(text)) return "resume_file";
  if (/姓名|名字|full name|^name$/.test(text)) return "full_name";
  if (/手机|电话|mobile|phone/.test(text)) return "phone";
  if (/邮箱|电子邮件|e mail|email/.test(text)) return "email";
  if (/出生(?:日期|年月)|birth date/.test(text)) return "birth_date";
  // Referral controls are commonly plain text inputs with only a placeholder.
  // Treat that intrinsic evidence as stronger than a nearby/geometric city
  // label so a referral code can never inherit preferred-city semantics.
  if (/推荐|内推|referral/.test(`${text} ${rawFallback}`)) return "referral";
  if (/籍贯|native place|nativeplace|hometown|place of origin/.test(`${text} ${rawFallback}`)) return "native_place";
  if (/意向.*城市|期望.*城市|工作城市|意向地点|工作地点|城市|地点/.test(text)) return "preferred_city";
  if (/学校|院校|school/.test(text)) return "school";
  if (/学历|学位|degree/.test(text)) return "degree";
  if (/专业|major/.test(text)) return "major";
  if (/毕业时间|毕业年份|毕业日期|graduation/.test(text)) return "graduation_date";
  if (/入学|开始时间|起始时间|start/.test(text)) return "start_date";
  if (/结束时间|截止时间|end/.test(text)) return "end_date";
  if (/公司|单位|company/.test(text)) return "company";
  if (/岗位|职位|职务|title|position/.test(text)) return "title";
  if (/项目名称|项目名|project name/.test(text)) return "project_name";
  if (/角色|role/.test(text)) return "role";
  if (/描述|内容|职责|成果|介绍|description|detail/.test(text)) return "description";
  if (/技能|技术栈|skill/.test(text)) return "skills";
  if (/自我评价|个人总结|自我介绍/.test(text)) return "self_introduction";
  if (/隐私|条款|同意|consent/.test(text)) return "consent";
  const candidate = rawFallback || text || "field";
  return candidate
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "field";
}

export function stableFieldIdentity(input: StableFieldIdentityInput): StableFieldIdentity {
  const sectionKey = stableSectionKey(input.label, input.sectionTitle);
  const stableName = input.dataFieldName || input.name || input.placeholder || input.label;
  const semanticSlot = stableSemanticSlot(input.label, stableName);
  const groupIndex = Number.isInteger(input.groupIndex) ? input.groupIndex! : null;
  const groupPart = groupIndex === null ? "" : `[${groupIndex}]`;
  const ordinalPart = semanticSlot === "field" || semanticSlot.length <= 2
    ? `.field${Math.max(0, input.localOrdinal ?? 0)}`
    : "";
  return {
    stableFieldKey: `${sectionKey}${groupPart}.${semanticSlot}.${input.controlKind}${ordinalPart}`,
    sectionKey,
    semanticSlot,
    groupIndex
  };
}
