import { afterEach, describe, expect, it, vi } from "vitest";
import { VisionAgent } from "./vision-agent.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VisionAgent iterative planning", () => {
  it("rejects coordinates for the retired Moka visual route", async () => {
    let requestBody: Record<string, any> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              next: "execute_actions",
              confidence: 0.96,
              actions: [{
                type: "click_registered_control",
                adapterCode: "moka.date-picker.visual.v1",
                targetRole: "date_input",
                xRatio: 0.51,
                yRatio: 0.42,
                confidence: 0.96
              }]
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const agent = new VisionAgent({
      providerCode: "zhencai",
      baseUrl: "https://dashscope.example/compatible-mode/v1",
      model: "qwen3-vl-plus",
      apiKey: "test-key"
    });
    const session = await agent.createSession({ tenantId: "tenant", userId: "user", deviceId: "device" });
    const plan = await agent.plan(session.sessionId, {
      providerCode: "zhencai",
      task: "operate_registered_control",
      observation: { targetDay: 30, viewport: { width: 1200, height: 800 } },
      screenshot: { mediaType: "image/jpeg", dataUrl: "data:image/jpeg;base64,AA==" },
      candidate: {},
      policy: {
        iterativeSingleAction: true,
        registeredControl: {
          adapterCode: "moka.date-picker.visual.v1",
          targetRole: "date_input"
        }
      }
    }, { tenantId: "tenant", userId: "user", deviceId: "device" });
    expect(plan.actions).toEqual([]);
    expect(plan.next).toBe("manual_copy");
    const prompt = JSON.stringify(requestBody);
    expect(prompt).toContain("不是通用填写失败后的兜底");
    expect(prompt).toContain("targetDay");
    expect(prompt).not.toContain("moka.date-picker.visual.v1 的 date_input");
    expect(prompt).not.toContain("candidate.basic.highestDegree");
  });

  it("rejects registered visual coordinates for a different role", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            next: "execute_actions",
            actions: [{
              type: "click_registered_control",
              adapterCode: "moka.date-picker.visual.v1",
              targetRole: "day",
              xRatio: 0.5,
              yRatio: 0.5
            }]
          })
        }
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const agent = new VisionAgent({
      baseUrl: "https://dashscope.example/compatible-mode/v1",
      model: "qwen3-vl-plus",
      apiKey: "test-key"
    });
    const session = await agent.createSession({ tenantId: "tenant", userId: "user", deviceId: "device" });
    const plan = await agent.plan(session.sessionId, {
      providerCode: "zhencai",
      task: "operate_registered_control",
      observation: {},
      screenshot: { mediaType: "image/jpeg", dataUrl: "data:image/jpeg;base64,AA==" },
      candidate: {},
      policy: {
        registeredControl: {
          adapterCode: "moka.date-picker.visual.v1",
          targetRole: "date_input"
        }
      }
    }, { tenantId: "tenant", userId: "user", deviceId: "device" });
    expect(plan.actions).toEqual([]);
    expect(plan.next).toBe("manual_copy");
  });

  it("limits a dynamic ATS turn to one action and tells the model to reobserve", async () => {
    let requestBody: Record<string, any> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              next: "execute_actions",
              confidence: 0.97,
              actions: [
                { actionId: "select_option", fieldId: "field-degree", value: "本科" },
                { type: "fill_field", fieldId: "field-year", value: "2021" }
              ],
              warnings: [],
              evidenceRefs: []
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const agent = new VisionAgent({
      providerCode: "zhencai",
      baseUrl: "https://dashscope.example/compatible-mode/v1",
      model: "qwen3-vl-plus",
      apiKey: "test-key"
    });
    const session = await agent.createSession({
      tenantId: "tenant",
      userId: "user",
      deviceId: "device"
    });
    const plan = await agent.plan(session.sessionId, {
      schemaVersion: "vision-form-plan-request.v1",
      providerCode: "zhencai",
      task: "fill_application_form",
      observation: {
        fields: [
          { fieldId: "field-degree", label: "最高学历", currentValue: "" },
          { fieldId: "field-year", label: "开始工作年月 · 年", currentValue: "" }
        ]
      },
      screenshot: null,
      candidate: {
        "candidate.basic.highestDegree": "本科",
        "candidate.basic.firstWorkStartYear": "2021"
      },
      policy: {
        executionMode: "observe_decide_execute_reobserve",
        iterativeSingleAction: true,
        maxActions: 1
      }
    }, {
      tenantId: "tenant",
      userId: "user",
      deviceId: "device"
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ fieldId: "field-degree", value: "本科" });
    const prompt = JSON.stringify(requestBody);
    expect(prompt).toContain("每次只返回一个当前页面动作");
    expect(prompt).toContain("firstWorkStartYear");
    expect(prompt).toContain("同一语义出现 #0/#1 时它们是独立控件");
    expect(prompt).toContain("observe_decide_execute_reobserve");
  });

  it("retries one read-only planning request after a timeout", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              next: "no_action",
              confidence: 0.99,
              actions: [],
              warnings: [],
              evidenceRefs: []
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new VisionAgent({
      providerCode: "zhencai",
      baseUrl: "https://dashscope.example/compatible-mode/v1",
      model: "qwen3-vl-plus",
      apiKey: "test-key",
      timeoutMs: 1_000
    });
    const session = await agent.createSession({ tenantId: "tenant", userId: "user", deviceId: "device" });
    const plan = await agent.plan(session.sessionId, {
      schemaVersion: "vision-form-plan-request.v1",
      providerCode: "zhencai",
      task: "fill_application_form",
      observation: { fields: [] },
      screenshot: null,
      candidate: {},
      policy: { executionMode: "observe_decide_execute_reobserve", maxActions: 1 }
    }, { tenantId: "tenant", userId: "user", deviceId: "device" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(plan).toMatchObject({ configured: true, next: "no_action", actions: [] });
  });
});
