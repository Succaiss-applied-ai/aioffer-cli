import type { ResumeKnowledgeSnapshot, ResumeSection } from "../../src/domain.js";
import { buildProfileDraft } from "../../src/resume/profile-draft.js";
import type { BrowserResumeParseResult } from "./resume-local.js";

function section(kind: ResumeSection["kind"], id: string, facts: Record<string, unknown>): ResumeSection {
  return { kind, id, facts, evidenceRefs: ["uploaded-resume"] };
}

export function resumeKnowledgeFromBrowserText(
  result: BrowserResumeParseResult,
  input: { filename: string; now?: Date }
): ResumeKnowledgeSnapshot {
  const now = input.now ?? new Date();
  const draft = buildProfileDraft(result.extractedText);
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
    id: crypto.randomUUID(),
    userId: "extension-local-user",
    version: Math.max(1, Math.floor(now.getTime() / 1_000)),
    title: input.filename,
    sourceModule: `browser-resume-parser:${result.parser}`,
    sourceDocumentRef: "extension-local-file",
    userApproved: true,
    sections,
    createdAt: now.toISOString()
  };
}
