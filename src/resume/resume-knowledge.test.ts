import { describe, expect, it } from "vitest";
import { resumeFixture } from "../test-fixtures.js";
import { MemoryResumeKnowledgeRepository } from "./resume-knowledge.js";

describe("resume knowledge", () => {
  it("selects the latest user-approved version", async () => {
    const repository = new MemoryResumeKnowledgeRepository();
    await repository.import(resumeFixture("user", { version: 1 }));
    await repository.import(
      resumeFixture("user", { version: 2, userApproved: false })
    );
    const latest = resumeFixture("user", { version: 3 });
    await repository.import(latest);
    expect((await repository.getCurrent("user"))?.id).toBe(latest.id);
  });

  it("rejects conflicting version numbers", async () => {
    const repository = new MemoryResumeKnowledgeRepository();
    await repository.import(resumeFixture("user", { version: 1 }));
    await expect(
      repository.import(resumeFixture("user", { version: 1 }))
    ).rejects.toThrow("版本 1 已存在");
  });
});
