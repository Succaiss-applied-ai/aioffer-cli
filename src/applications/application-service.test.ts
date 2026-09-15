import { describe, expect, it } from "vitest";
import { MemoryDeviceBridge } from "../bridge/browser-bridge.js";
import type { FormRequirement } from "../domain.js";
import { MemoryResumeKnowledgeRepository } from "../resume/resume-knowledge.js";
import { jobFixture, resumeFixture } from "../test-fixtures.js";
import {
  ApplicationService,
  MemoryApplicationRepository
} from "./application-service.js";

function requirement(
  semanticKey: string,
  scope: FormRequirement["scope"],
  overrides: Partial<FormRequirement> = {}
): FormRequirement {
  return {
    fieldId: semanticKey,
    label: semanticKey,
    semanticKey,
    required: true,
    sensitive: false,
    scope,
    options: [],
    ...overrides
  };
}

async function serviceFixture(now: () => Date = () => new Date("2026-08-05T00:00:00Z")) {
  const resumes = new MemoryResumeKnowledgeRepository();
  const applications = new MemoryApplicationRepository();
  const bridge = new MemoryDeviceBridge();
  const resume = resumeFixture();
  await resumes.import(resume);
  return {
    service: new ApplicationService(resumes, applications, bridge, now),
    bridge,
    resume
  };
}

describe("single and batch application workflow", () => {
  it("creates a selected-job batch and queues one browser command per job", async () => {
    const { service, bridge, resume } = await serviceFixture();
    const batch = await service.createBatch("user-1", resume.id, [
      jobFixture("1"),
      jobFixture("2")
    ]);
    expect(batch.items).toHaveLength(2);
    expect(bridge.commands.map((entry) => entry.command.type)).toEqual([
      "open_job",
      "open_job"
    ]);
  });

  it("aggregates reusable missing information but keeps job questions separate", async () => {
    const { service, resume } = await serviceFixture();
    let batch = await service.createBatch("user-1", resume.id, [
      jobFixture("1"),
      jobFixture("2")
    ]);
    const shared = [
      requirement("fullName", "reusable"),
      requirement("phone", "reusable", { sensitive: true }),
      requirement("whyThisJob", "job")
    ];
    batch = await service.recordFormRequirements(
      batch.id,
      batch.items[0]!.id,
      "fingerprint-1",
      shared
    );
    expect(batch.items[0]?.job.applicationForm).toMatchObject({
      status: "observed",
      fingerprint: "fingerprint-1",
      observedAt: "2026-08-05T00:00:00.000Z"
    });
    expect(batch.items[0]?.job.applicationForm.fields?.[0]).toMatchObject({
      label: "fullName",
      type: "unknown",
      semanticKey: "fullName"
    });
    batch = await service.recordFormRequirements(
      batch.id,
      batch.items[1]!.id,
      "fingerprint-2",
      shared
    );
    expect(batch.missingInformation).toHaveLength(3);
    const phone = batch.missingInformation.find((entry) => entry.key === "phone");
    expect(phone?.applicationItemIds).toHaveLength(2);
    expect(batch.items[0]?.answers.fullName).toBe("测试用户");
  });

  it("pauses for login and resumes form observation without user intervention", async () => {
    const { service, bridge, resume } = await serviceFixture();
    let batch = await service.createSingle("user-1", resume.id, jobFixture("1"));
    const itemId = batch.items[0]!.id;
    batch = await service.recordLoginState(batch.id, itemId, true);
    expect(batch.items[0]?.status).toBe("login_required");
    expect(batch.items[0]?.job.applicationForm.status).toBe("login_required");
    batch = await service.recordLoginState(batch.id, itemId, false);
    expect(batch.items[0]?.status).toBe("observing_form");
    expect(bridge.commands.at(-1)?.command.type).toBe("observe_form");
  });

  it("preserves supplied answers when the same form is observed again", async () => {
    const { service, resume } = await serviceFixture();
    let batch = await service.createSingle("user-1", resume.id, jobFixture("1"));
    const itemId = batch.items[0]!.id;
    batch = await service.recordFormRequirements(
      batch.id,
      itemId,
      "fingerprint-1",
      [requirement("question:detail", "job")]
    );
    const missingKey = batch.missingInformation[0]!.key;
    batch = await service.answerMissingInformation(batch.id, [
      { key: missingKey, value: "已准备的岗位回答" }
    ]);
    batch = await service.recordFormRequirements(
      batch.id,
      itemId,
      "fingerprint-2",
      [requirement("question:detail", "job")]
    );
    expect(batch.items[0]?.answers["question:detail"]).toBe("已准备的岗位回答");
    expect(batch.missingInformation).toEqual([]);
  });

  it("requires an immutable review before dispatching approved submissions", async () => {
    const { service, bridge, resume } = await serviceFixture();
    let batch = await service.createSingle("user-1", resume.id, jobFixture("1"));
    batch = await service.recordFormRequirements(
      batch.id,
      batch.items[0]!.id,
      "fingerprint-1",
      [requirement("phone", "reusable")]
    );
    batch = await service.answerMissingInformation(
      batch.id,
      [{ key: "phone", value: "13800000000" }],
      true
    );
    expect(batch.missingInformation).toEqual([]);
    const fillReceipts = await service.dispatchFill(batch.id);
    expect(fillReceipts).toHaveLength(1);
    batch = await service.recordFillValidation(
      batch.id,
      batch.items[0]!.id,
      true
    );
    const review = await service.prepareReview(batch.id);
    await expect(service.approveBatch(batch.id, "0".repeat(64))).rejects.toThrow(
      "内容已变化"
    );
    await service.approveBatch(batch.id, review.manifestHash);
    const receipts = await service.dispatchApproved(batch.id);
    expect(receipts).toHaveLength(1);
    expect(bridge.commands.at(-1)?.command.type).toBe("submit");
  });

  it("rejects unapproved resume knowledge and batches over twenty jobs", async () => {
    const resumes = new MemoryResumeKnowledgeRepository();
    const resume = resumeFixture("user-1", { userApproved: false });
    await resumes.import(resume);
    const service = new ApplicationService(
      resumes,
      new MemoryApplicationRepository(),
      new MemoryDeviceBridge()
    );
    await expect(
      service.createSingle("user-1", resume.id, jobFixture("1"))
    ).rejects.toThrow("尚未由用户确认");
    const approved = resumeFixture("user-1", { version: 2 });
    await resumes.import(approved);
    await expect(
      service.createBatch(
        "user-1",
        approved.id,
        Array.from({ length: 21 }, (_, index) => jobFixture(String(index)))
      )
    ).rejects.toThrow("1–20");
  });

  it("expires a batch approval before external submission", async () => {
    let current = new Date("2026-08-05T00:00:00Z");
    const { service, resume } = await serviceFixture(() => current);
    let batch = await service.createSingle("user-1", resume.id, jobFixture("1"));
    batch = await service.recordFormRequirements(
      batch.id,
      batch.items[0]!.id,
      "fingerprint-1",
      []
    );
    await service.dispatchFill(batch.id);
    batch = await service.recordFillValidation(
      batch.id,
      batch.items[0]!.id,
      true
    );
    const review = await service.prepareReview(batch.id);
    await service.approveBatch(batch.id, review.manifestHash, 1);
    current = new Date("2026-08-05T00:02:00Z");
    await expect(service.dispatchApproved(batch.id)).rejects.toThrow("授权已过期");
  });

  it("blocks review until the plugin confirms fill and readback validation", async () => {
    const { service, bridge, resume } = await serviceFixture();
    let batch = await service.createSingle("user-1", resume.id, jobFixture("1"));
    batch = await service.recordFormRequirements(
      batch.id,
      batch.items[0]!.id,
      "fingerprint-1",
      []
    );
    await expect(service.prepareReview(batch.id)).rejects.toThrow("读回校验");
    await service.dispatchFill(batch.id);
    batch = await service.recordFillValidation(
      batch.id,
      batch.items[0]!.id,
      false,
      "页面拒绝该字段"
    );
    expect(batch.items[0]?.status).toBe("failed");
    const fallback = await service.dispatchComputerUseFallback(
      batch.id,
      batch.items[0]!.id,
      []
    ).catch((error: unknown) => error);
    expect(fallback).toBeInstanceOf(Error);
    await expect(service.prepareReview(batch.id)).rejects.toThrow("读回校验");
  });

  it("allows bounded Computer Use only after DOM filling fails", async () => {
    const { service, bridge, resume } = await serviceFixture();
    let batch = await service.createSingle("user-1", resume.id, jobFixture("1"));
    const itemId = batch.items[0]!.id;
    batch = await service.recordFormRequirements(
      batch.id,
      itemId,
      "fingerprint",
      [requirement("city", "reusable", { fieldId: "field-city" })]
    );
    batch = await service.answerMissingInformation(batch.id, [{
      key: batch.missingInformation[0]!.key,
      value: "深圳"
    }]);
    await service.dispatchFill(batch.id);
    await service.recordFillValidation(batch.id, itemId, false, "复杂城市组件无法选择");
    const receipt = await service.dispatchComputerUseFallback(batch.id, itemId, ["field-city"]);
    expect(receipt.status).toBe("queued");
    expect(bridge.commands.at(-1)?.command).toMatchObject({
      type: "computer_use_fill",
      unresolvedFieldIds: ["field-city"],
      policy: {
        requireFreshObservationAfterEachAction: true,
        forbiddenActions: expect.arrayContaining(["final_submit", "captcha"])
      }
    });
  });
});
