import { z } from "zod";
import {
  formRequirementSchema,
  type FormRequirement,
  type ResumeKnowledgeSnapshot
} from "../domain.js";
import {
  mapFormFieldsWithModel,
  type BrowserModelSettings,
  type ModelExecutionEvidence,
  type ModelFieldMapping,
  type ObservedFieldForModel
} from "../model/model-tasks.js";
import {
  resumeFactIndex,
  resumeRepeatableSectionCounts
} from "../resume/resume-knowledge.js";

export const observedApplicationFieldSchema = z.object({
  fieldId: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean(),
  options: z.array(z.string()).default([]),
  sectionKind: z.enum([
    "basic", "education", "work", "project", "internship", "research",
    "publication", "award", "skill", "intention", "narrative", "other"
  ]).optional(),
  repeatIndex: z.number().int().nonnegative().optional()
});

export type ObservedApplicationField = z.infer<typeof observedApplicationFieldSchema>;

export interface FormFieldMapper {
  readonly id: string;
  map(
    fields: ObservedFieldForModel[],
    availableSemanticKeys: string[]
  ): Promise<{ mappings: ModelFieldMapping[]; evidence: ModelExecutionEvidence }>;
}

export class OpenAiCompatibleFormFieldMapper implements FormFieldMapper {
  readonly id = "configured-model-api";

  constructor(private readonly settings: BrowserModelSettings) {}

  map(fields: ObservedFieldForModel[], availableSemanticKeys: string[]) {
    return mapFormFieldsWithModel(this.settings, fields, availableSemanticKeys);
  }
}

export interface FormFillPlan {
  mapper: string;
  requirements: FormRequirement[];
  answers: Record<string, unknown>;
  missingRequired: Array<{ fieldId: string; label: string; semanticKey: string }>;
  rejectedMappings: Array<{ fieldId: string; semanticKey: string; reason: string }>;
  repeatableSections: ReturnType<typeof resumeRepeatableSectionCounts>;
  evidence: ModelExecutionEvidence;
}

function inferredScope(semanticKey: string): FormRequirement["scope"] {
  return /^(job|application)\./.test(semanticKey) ? "job" : "reusable";
}

function isSensitive(label: string, semanticKey: string): boolean {
  return /身份证|护照|证件号|银行卡|password|otp|captcha/i.test(`${label} ${semanticKey}`);
}

export class FormFillPlanningService {
  constructor(
    private readonly mapper: FormFieldMapper,
    private readonly confidenceThreshold = 0.8
  ) {}

  async plan(
    snapshot: ResumeKnowledgeSnapshot,
    rawFields: ObservedApplicationField[]
  ): Promise<FormFillPlan> {
    const fields = z.array(observedApplicationFieldSchema).parse(rawFields);
    const facts = resumeFactIndex(snapshot);
    const semanticKeys = Object.keys(facts).sort();
    const mapped = await this.mapper.map(
      fields.map(({ fieldId, label, type, required, options }) => ({
        fieldId, label, type, required, options
      })),
      semanticKeys
    );
    const byField = new Map(fields.map((field) => [field.fieldId, field]));
    const accepted = new Map<string, ModelFieldMapping>();
    const rejectedMappings: FormFillPlan["rejectedMappings"] = [];
    for (const mapping of mapped.mappings) {
      if (!byField.has(mapping.fieldId)) continue;
      if (mapping.confidence < this.confidenceThreshold) {
        rejectedMappings.push({
          fieldId: mapping.fieldId,
          semanticKey: mapping.semanticKey,
          reason: `confidence_below_${this.confidenceThreshold}`
        });
        continue;
      }
      if (!(mapping.semanticKey in facts)) {
        rejectedMappings.push({
          fieldId: mapping.fieldId,
          semanticKey: mapping.semanticKey,
          reason: "semantic_key_not_in_approved_resume"
        });
        continue;
      }
      accepted.set(mapping.fieldId, mapping);
    }

    const requirements: FormRequirement[] = [];
    const answers: Record<string, unknown> = {};
    const missingRequired: FormFillPlan["missingRequired"] = [];
    for (const field of fields) {
      const mapping = accepted.get(field.fieldId);
      const semanticKey = mapping?.semanticKey ?? `application.missing.${field.fieldId}`;
      const requirement = formRequirementSchema.parse({
        fieldId: field.fieldId,
        label: field.label,
        inputType: field.type,
        semanticKey,
        required: field.required,
        sensitive: isSensitive(field.label, semanticKey),
        scope: inferredScope(semanticKey),
        options: field.options
      });
      requirements.push(requirement);
      if (mapping) {
        answers[semanticKey] = facts[semanticKey];
      } else if (field.required) {
        missingRequired.push({ fieldId: field.fieldId, label: field.label, semanticKey });
      }
    }

    return {
      mapper: this.mapper.id,
      requirements,
      answers,
      missingRequired,
      rejectedMappings,
      repeatableSections: resumeRepeatableSectionCounts(snapshot),
      evidence: mapped.evidence
    };
  }
}
