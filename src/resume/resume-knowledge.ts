import {
  resumeKnowledgeSnapshotSchema,
  type ResumeKnowledgeSnapshot
} from "../domain.js";

export interface ResumeKnowledgeRepository {
  import(snapshot: ResumeKnowledgeSnapshot): Promise<ResumeKnowledgeSnapshot>;
  get(id: string): Promise<ResumeKnowledgeSnapshot | null>;
  getCurrent(userId: string): Promise<ResumeKnowledgeSnapshot | null>;
  list(userId: string): Promise<ResumeKnowledgeSnapshot[]>;
}

export class MemoryResumeKnowledgeRepository
  implements ResumeKnowledgeRepository
{
  private readonly snapshots = new Map<string, ResumeKnowledgeSnapshot>();

  async import(
    snapshot: ResumeKnowledgeSnapshot
  ): Promise<ResumeKnowledgeSnapshot> {
    const parsed = resumeKnowledgeSnapshotSchema.parse(snapshot);
    const sameVersion = [...this.snapshots.values()].find(
      (entry) =>
        entry.userId === parsed.userId && entry.version === parsed.version
    );
    if (sameVersion && sameVersion.id !== parsed.id) {
      throw new Error(`简历知识版本 ${parsed.version} 已存在`);
    }
    this.snapshots.set(parsed.id, structuredClone(parsed));
    return structuredClone(parsed);
  }

  async get(id: string): Promise<ResumeKnowledgeSnapshot | null> {
    const result = this.snapshots.get(id);
    return result ? structuredClone(result) : null;
  }

  async getCurrent(userId: string): Promise<ResumeKnowledgeSnapshot | null> {
    const result = [...this.snapshots.values()]
      .filter((entry) => entry.userId === userId && entry.userApproved)
      .sort((left, right) => right.version - left.version)[0];
    return result ? structuredClone(result) : null;
  }

  async list(userId: string): Promise<ResumeKnowledgeSnapshot[]> {
    return [...this.snapshots.values()]
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.version - left.version)
      .map((entry) => structuredClone(entry));
  }
}

export function resumeFactIndex(
  snapshot: ResumeKnowledgeSnapshot
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const sectionIndexes = new Map<string, number>();
  for (const section of snapshot.sections) {
    const sectionIndex = sectionIndexes.get(section.kind) ?? 0;
    sectionIndexes.set(section.kind, sectionIndex + 1);
    for (const [key, value] of Object.entries(section.facts)) {
      if (value === null || value === "") continue;
      const aliases = [
        key,
        key.startsWith(`${section.kind}.`) ? key : `${section.kind}.${key}`,
        `${section.kind}[${sectionIndex}].${key}`
      ];
      for (const alias of aliases) {
        if (!(alias in output)) output[alias] = value;
      }
    }
  }
  return output;
}

export function resumeRepeatableSectionCounts(
  snapshot: ResumeKnowledgeSnapshot
): Partial<Record<"education" | "work" | "project" | "internship" | "research" | "publication" | "award", number>> {
  const repeatable = new Set([
    "education", "work", "project", "internship", "research", "publication", "award"
  ]);
  const output: Record<string, number> = {};
  for (const section of snapshot.sections) {
    if (!repeatable.has(section.kind)) continue;
    output[section.kind] = (output[section.kind] ?? 0) + 1;
  }
  return output;
}
