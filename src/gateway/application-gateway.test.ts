import { describe, expect, it } from "vitest";
import {
  ApplicationGateway,
  MemoryApplicationRunRepository
} from "./application-gateway.js";
import {
  LegacyAiPluginBridgeAdapter,
  type LegacyPluginCommand,
  type LegacyPluginEvent,
  type LegacyPluginTransport
} from "./legacy-plugin-adapter.js";

class ScriptedLegacyTransport implements LegacyPluginTransport {
  readonly commands: LegacyPluginCommand[] = [];
  private readonly events: LegacyPluginEvent[];

  constructor(events: LegacyPluginEvent[]) {
    this.events = [...events];
  }

  async send(command: LegacyPluginCommand): Promise<LegacyPluginEvent> {
    this.commands.push(structuredClone(command));
    const event = this.events.shift();
    if (!event) throw new Error("测试事件已耗尽");
    return structuredClone(event);
  }
}

function request() {
  return {
    schemaVersion: "application-run-request.v1" as const,
    tenantId: "tenant-1",
    userId: "user-1",
    deviceId: "device-1",
    conversationId: "conversation-1",
    idempotencyKey: "apply-xiaopeng-1",
    job: {
      jobId: "job-1",
      companyName: "小鹏汽车",
      title: "后端开发工程师",
      city: "广州",
      applicationUrl: "https://xiaopeng.jobs.feishu.cn/index/resume/1/apply"
    },
    candidate: {
      profileRef: "profile-1",
      snapshotVersion: "7",
      profile: {
        schemaVersion: "candidate-profile.v1" as const,
        basic: { 姓名: "测试用户", 手机号: "13800000000" },
        preferences: {},
        educations: [],
        workExperiences: [{ 公司名称: "示例科技", 职位名称: "后端工程师" }],
        projects: [{ 项目名称: "订单系统改造" }],
        research: [],
        awards: [],
        skills: [],
        additional: {}
      }
    },
    assets: [],
    executionPolicy: {
      mode: "manual_copy" as const,
      allowAutoFill: false,
      allowSiteResumeParser: true,
      allowFinalSubmit: false as const
    }
  };
}

describe("decoupled application gateway", () => {
  it("hides legacy browser commands behind business run states", async () => {
    const transport = new ScriptedLegacyTransport([
      {
        schemaVersion: "ai-plugin-event.v1",
        type: "browser.application_opened",
        status: "completed",
        payload: { tabId: 42 }
      },
      {
        schemaVersion: "ai-plugin-event.v1",
        type: "browser.login_required",
        status: "waiting_for_user",
        payload: { tabId: 42 }
      },
      {
        schemaVersion: "ai-plugin-event.v1",
        type: "browser.missing_information_required",
        status: "waiting_for_user",
        payload: {
          tabId: 42,
          missingInformationRequest: {
            questions: [{
              id: "identity.idNumber",
              semanticKey: "identity.idNumber",
              label: "身份证号",
              question: "请提供身份证号。",
              required: true,
              sensitive: true,
              rememberPolicy: "ask_user"
            }]
          }
        }
      },
      {
        schemaVersion: "ai-plugin-event.v1",
        type: "browser.manual_application_content_set",
        status: "completed",
        payload: { tabId: 42 }
      },
      {
        schemaVersion: "ai-plugin-event.v1",
        type: "browser.form_readback",
        status: "completed",
        payload: {
          tabId: 42,
          readbackHash: "sha256:page-readback",
          submitAction: { actionId: "submit-1", expectedText: "提交申请" }
        }
      },
      {
        schemaVersion: "ai-plugin-event.v1",
        type: "browser.final_submit_executed",
        status: "completed",
        payload: { submittedAt: "2026-08-07T00:00:00.000Z" }
      }
    ]);
    const gateway = new ApplicationGateway(
      new MemoryApplicationRunRepository(),
      new LegacyAiPluginBridgeAdapter(transport),
      () => new Date("2026-08-07T00:00:00.000Z")
    );

    let run = await gateway.start(request());
    expect(run.status).toBe("waiting_for_user_action");
    expect(transport.commands[0]?.type).toBe("browser.open_manual_application");
    expect(transport.commands[0]?.payload.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "work" }),
      expect.objectContaining({ kind: "project" })
    ]));
    expect(transport.commands[1]?.type).toBe("browser.observe_visual_rpa_state");
    expect(run.events.at(-1)).toMatchObject({
      type: "user_action_required",
      reason: "login_required"
    });

    run = await gateway.continue(run.runId);
    expect(run.status).toBe("waiting_for_user_input");
    expect(run.events.at(-1)?.questions[0]).toMatchObject({
      questionId: "identity.idNumber",
      sensitive: true,
      rememberAllowed: true
    });

    run = await gateway.provideAnswers(run.runId, {
      schemaVersion: "application-answers.v1",
      answers: [{
        questionId: "identity.idNumber",
        value: "440000000000000000",
        remember: false
      }]
    });
    expect(run.status).toBe("review_required");
    expect(transport.commands.at(-2)?.type).toBe("browser.set_manual_application_content");
    expect(transport.commands.at(-1)?.type).toBe("browser.observe_visual_rpa_state");
    expect(run.confirmation).not.toBeNull();
    await expect(gateway.confirm(run.runId, {
      schemaVersion: "application-confirmation.v1",
      confirmationId: run.confirmation!.confirmationId,
      reviewHash: "wrong-hash",
      confirmedByUser: true
    })).rejects.toThrow("最新读回内容不一致");

    run = await gateway.confirm(run.runId, {
      schemaVersion: "application-confirmation.v1",
      confirmationId: run.confirmation!.confirmationId,
      reviewHash: run.confirmation!.reviewHash,
      confirmedByUser: true
    });
    expect(run.status).toBe("completed");
    expect(transport.commands.at(-1)).toMatchObject({
      type: "browser.submit_application_after_ai_confirmation",
      safety: { allowFinalSubmit: true }
    });
  });

  it("returns the same run for the same tenant idempotency key", async () => {
    const transport = new ScriptedLegacyTransport([{
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.application_opened",
      status: "completed",
      payload: { tabId: 1 }
    }, {
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.login_required",
      status: "waiting_for_user",
      payload: { tabId: 1 }
    }]);
    const gateway = new ApplicationGateway(
      new MemoryApplicationRunRepository(),
      new LegacyAiPluginBridgeAdapter(transport)
    );
    const first = await gateway.start(request());
    const second = await gateway.start(request());
    expect(second.runId).toBe(first.runId);
    expect(transport.commands).toHaveLength(2);
  });

  it("rejects reuse of an idempotency key for another device or payload", async () => {
    const transport = new ScriptedLegacyTransport([{
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.login_required",
      status: "waiting_for_user",
      payload: { tabId: 1 }
    }]);
    const gateway = new ApplicationGateway(
      new MemoryApplicationRunRepository(),
      new LegacyAiPluginBridgeAdapter(transport)
    );
    await gateway.start(request());

    await expect(gateway.start({ ...request(), deviceId: "device-2" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(gateway.start({
      ...request(),
      job: { ...request().job, title: "不同岗位内容" }
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(transport.commands).toHaveLength(1);
  });

  it("serializes concurrent reuse of an idempotency key", async () => {
    const transport = new ScriptedLegacyTransport([{
      schemaVersion: "ai-plugin-event.v1",
      type: "browser.login_required",
      status: "waiting_for_user",
      payload: { tabId: 1 }
    }]);
    const gateway = new ApplicationGateway(
      new MemoryApplicationRunRepository(),
      new LegacyAiPluginBridgeAdapter(transport)
    );

    const results = await Promise.allSettled([
      gateway.start(request()),
      gateway.start({ ...request(), deviceId: "device-2" })
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(transport.commands).toHaveLength(1);
  });
});
