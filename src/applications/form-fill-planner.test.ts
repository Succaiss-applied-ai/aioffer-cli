import { describe, expect, it } from "vitest";
import type { ModelFieldMapping } from "../model/model-tasks.js";
import type { ResumeKnowledgeSnapshot } from "../domain.js";
import {
  FormFillPlanningService,
  type FormFieldMapper,
  type ObservedApplicationField
} from "./form-fill-planner.js";
import completeResume from "../../config/complete-test-resume-knowledge.json";
import completeJobAndForm from "../../config/complete-test-job-and-form.json";

const snapshot: ResumeKnowledgeSnapshot = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "fictional-user",
  version: 1,
  title: "完整虚构中文简历",
  sourceModule: "test-fixture",
  userApproved: true,
  sections: [
    { kind: "basic", id: "basic", facts: { fullName: "林测试" }, evidenceRefs: [] },
    { kind: "work", id: "work-1", facts: { company: "甲示例科技", title: "后端开发工程师" }, evidenceRefs: [] },
    { kind: "work", id: "work-2", facts: { company: "乙示例科技", title: "软件开发实习生" }, evidenceRefs: [] },
    { kind: "project", id: "project-1", facts: { name: "招聘助手" }, evidenceRefs: [] },
    { kind: "project", id: "project-2", facts: { name: "日志平台" }, evidenceRefs: [] }
  ],
  createdAt: "2026-08-06T00:00:00.000Z"
};

class FakeAiMapper implements FormFieldMapper {
  readonly id = "fake-ai-for-contract-test";
  async map(fields: ObservedApplicationField[]) {
    const semanticById: Record<string, string> = {
      name: "basic.fullName",
      work0: "work[0].company",
      work1: "work[1].company",
      project1: "project[1].name"
    };
    const mappings: ModelFieldMapping[] = fields.flatMap((field) => {
      const semanticKey = semanticById[field.fieldId];
      return semanticKey ? [{
        fieldId: field.fieldId,
        semanticKey,
        confidence: 0.99,
        source: "resume" as const,
        evidenceRef: null
      }] : [];
    });
    return {
      mappings,
      evidence: {
        id: "evidence-1",
        task: "map_form_fields" as const,
        model: "fake-contract-model",
        status: "validated" as const,
        completedAt: "2026-08-06T00:00:00.000Z",
        warnings: []
      }
    };
  }
}

describe("AI-assisted MCP form fill planning", () => {
  it("maps repeated work and project sections to indexed resume facts", async () => {
    const planner = new FormFillPlanningService(new FakeAiMapper());
    const plan = await planner.plan(snapshot, [
      { fieldId: "name", label: "姓名", type: "text", required: true, options: [] },
      { fieldId: "work0", label: "工作经历1 公司", type: "text", required: true, options: [], sectionKind: "work", repeatIndex: 0 },
      { fieldId: "work1", label: "工作经历2 公司", type: "text", required: true, options: [], sectionKind: "work", repeatIndex: 1 },
      { fieldId: "project1", label: "项目经历2 名称", type: "text", required: true, options: [], sectionKind: "project", repeatIndex: 1 }
    ]);
    expect(plan.answers).toMatchObject({
      "basic.fullName": "林测试",
      "work[0].company": "甲示例科技",
      "work[1].company": "乙示例科技",
      "project[1].name": "日志平台"
    });
    expect(plan.missingRequired).toEqual([]);
    expect(plan.repeatableSections).toMatchObject({ work: 2, project: 2 });
  });

  it("does not accept a model mapping to an invented resume fact", async () => {
    const mapper: FormFieldMapper = {
      id: "hallucinating-model",
      async map() {
        return {
          mappings: [{
            fieldId: "salary",
            semanticKey: "basic.expectedSalary",
            confidence: 0.99,
            source: "resume",
            evidenceRef: null
          }],
          evidence: {
            id: "evidence-2", task: "map_form_fields", model: "fake",
            status: "validated", completedAt: "2026-08-06T00:00:00.000Z", warnings: []
          }
        };
      }
    };
    const plan = await new FormFillPlanningService(mapper).plan(snapshot, [
      { fieldId: "salary", label: "期望薪资", type: "text", required: true, options: [] }
    ]);
    expect(plan.answers).toEqual({});
    expect(plan.missingRequired).toHaveLength(1);
    expect(plan.rejectedMappings[0]?.reason).toBe("semantic_key_not_in_approved_resume");
  });

  it("plans every text field in the complete two-work three-project fixture", async () => {
    const directKeys: Record<string, string> = {
      "full-name": "basic.fullName",
      phone: "basic.phone",
      email: "basic.email",
      "preferred-city": "intention.preferredCities",
      school: "education.school",
      degree: "education.degree",
      major: "education.major",
      skills: "skill.summary",
      "self-introduction": "narrative.selfIntroduction"
    };
    const mapper: FormFieldMapper = {
      id: "fixture-ai-contract-model",
      async map(fields) {
        const mappings: ModelFieldMapping[] = fields.flatMap((field) => {
          let semanticKey = directKeys[field.fieldId];
          const work = field.fieldId.match(/^work-(\d+)-(company|title|start|end|description)$/);
          if (work) {
            const attribute = { start: "startDate", end: "endDate" }[work[2] ?? ""] ?? work[2];
            semanticKey = `work[${work[1]}].${attribute}`;
          }
          const project = field.fieldId.match(/^project-(\d+)-(name|role|description)$/);
          if (project) semanticKey = `project[${project[1]}].${project[2]}`;
          return semanticKey ? [{
            fieldId: field.fieldId,
            semanticKey,
            confidence: 0.99,
            source: "resume" as const,
            evidenceRef: null
          }] : [];
        });
        return {
          mappings,
          evidence: {
            id: "complete-fixture-evidence", task: "map_form_fields", model: "fixture-ai",
            status: "validated", completedAt: "2026-08-06T00:00:00.000Z", warnings: []
          }
        };
      }
    };
    const plan = await new FormFillPlanningService(mapper).plan(
      completeResume as ResumeKnowledgeSnapshot,
      completeJobAndForm.observedForm.fields as ObservedApplicationField[]
    );

    expect(plan.requirements).toHaveLength(29);
    expect(Object.keys(plan.answers)).toHaveLength(28);
    expect(plan.answers["work[1].company"]).toBe("云帆示例网络有限公司");
    expect(plan.answers["project[2].name"]).toBe("日志检索与告警平台");
    expect(plan.missingRequired).toEqual([{
      fieldId: "resume-file",
      label: "上传中文简历",
      semanticKey: "application.missing.resume-file"
    }]);
    expect(plan.repeatableSections).toMatchObject({ work: 2, project: 3 });
  });
});
