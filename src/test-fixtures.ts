import type {
  JobRecord,
  ResumeKnowledgeSnapshot
} from "./domain.js";

export function jobFixture(
  id: string,
  overrides: Partial<JobRecord> = {}
): JobRecord {
  return {
    id,
    canonicalUrl: `https://jobs.example.com/job/${id}`,
    applicationUrl: `https://jobs.example.com/job/${id}/apply`,
    source: "official-careers",
    company: `示例公司${id}`,
    title: "Python后端开发工程师",
    standardRoles: ["Python后端"],
    locations: ["深圳"],
    cities: ["深圳市"],
    channels: ["graduate"],
    employmentType: "full_time",
    description: "负责 Python 服务端研发",
    candidatePreparation: null,
    applicationForm: {
      status: "not_observed",
      fingerprint: null,
      fields: null,
      observedAt: null
    },
    skills: ["Python"],
    degreeRequirement: "本科",
    experienceRequirement: "应届生",
    salary: null,
    publishedAt: "2026-08-01T00:00:00.000Z",
    activeStatus: "active",
    verifiedAt: "2026-08-05T00:00:00.000Z",
    evidence: [`https://jobs.example.com/job/${id}`],
    ...overrides
  };
}

export function resumeFixture(
  userId = "user-1",
  overrides: Partial<ResumeKnowledgeSnapshot> = {}
): ResumeKnowledgeSnapshot {
  return {
    id: crypto.randomUUID(),
    userId,
    version: 1,
    title: "中文后端简历",
    sourceModule: "resume-polish",
    userApproved: true,
    sections: [
      {
        kind: "basic",
        id: "basic",
        facts: {
          fullName: "测试用户",
          email: "candidate@example.test"
        },
        evidenceRefs: ["resume-page-1"]
      },
      {
        kind: "education",
        id: "education-1",
        facts: { highestDegree: "本科", school: "示例大学" },
        evidenceRefs: ["resume-page-1"]
      }
    ],
    createdAt: "2026-08-05T00:00:00.000Z",
    ...overrides
  };
}
