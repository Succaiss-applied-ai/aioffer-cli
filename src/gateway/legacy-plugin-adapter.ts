import type {
  AnswerSubmission,
  ApplicationConfirmation,
  ApplicationRun,
  ExecutionEvent,
  InteractionQuestion
} from "./application-contract.js";
import type { ApplicationExecutionPort } from "./application-gateway.js";

export interface LegacyPluginCommand {
  schemaVersion: "ai-plugin-command.v1";
  commandId: string;
  conversationId: string;
  tenantId: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  type: string;
  idempotencyKey: string;
  requiresUserGesture: false;
  payload: Record<string, unknown>;
  safety: {
    allowFinalSubmit: boolean;
    allowConsentClick: boolean;
    allowCaptchaHandling: boolean;
  };
}

export interface LegacyPluginEvent {
  schemaVersion: "ai-plugin-event.v1";
  type: string;
  status: "completed" | "waiting_for_user" | "failed" | "rejected";
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string; userAction?: string } | null;
}

export interface LegacyPluginTransport {
  send(command: LegacyPluginCommand, context: { runId: string; deviceId: string }): Promise<LegacyPluginEvent>;
}

function command(
  run: ApplicationRun,
  type: string,
  payload: Record<string, unknown>,
  allowFinalSubmit = false
): LegacyPluginCommand {
  const issuedAt = new Date().toISOString();
  return {
    schemaVersion: "ai-plugin-command.v1",
    commandId: crypto.randomUUID(),
    conversationId: run.request.conversationId ?? run.runId,
    tenantId: run.request.tenantId,
    userId: run.request.userId,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + 2 * 60_000).toISOString(),
    type,
    idempotencyKey: `${run.request.idempotencyKey}:${run.revision}:${type}`,
    requiresUserGesture: false,
    payload,
    safety: {
      allowFinalSubmit,
      allowConsentClick: false,
      allowCaptchaHandling: allowFinalSubmit
    }
  };
}

function profileSections(run: ApplicationRun): Array<Record<string, unknown>> {
  const profile = run.request.candidate.profile;
  if (!profile) return [];
  const sections: Array<Record<string, unknown>> = [];
  const add = (kind: string, title: string, records: Array<Record<string, unknown>>) => {
    records.forEach((record, index) => {
      sections.push({
        id: `${kind}-${index + 1}`,
        kind,
        title: `${title} ${index + 1}`,
        items: Object.entries(record).map(([key, value]) => ({
          id: `${kind}-${index + 1}-${key}`,
          label: key,
          value,
          valueSource: `candidate.${kind}[${index}].${key}`
        }))
      });
    });
  };
  sections.push({
    id: "basic",
    kind: "basic",
    title: "基本信息",
    items: Object.entries(profile.basic).map(([key, value]) => ({
      id: `basic-${key}`,
      label: key,
      value,
      valueSource: `candidate.basic.${key}`
    }))
  });
  add("education", "教育经历", profile.educations);
  add("work", "工作经历", profile.workExperiences);
  add("project", "项目经历", profile.projects);
  add("research", "科研经历", profile.research);
  add("award", "获奖经历", profile.awards);
  return sections;
}

function questions(payload: Record<string, unknown>): InteractionQuestion[] {
  const request = payload.missingInformationRequest as Record<string, unknown> | undefined;
  const raw = Array.isArray(request?.questions) ? request.questions : [];
  return raw.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const label = String(item.label ?? item.question ?? `缺失信息 ${index + 1}`);
    return {
      questionId: String(item.id ?? item.questionId ?? `legacy:${index + 1}`),
      semanticKey: typeof item.semanticKey === "string" ? item.semanticKey : null,
      label,
      question: String(item.question ?? `请补充「${label}」。`),
      answerType: item.answerType === "file" ? "file" : "text",
      required: item.required !== false,
      sensitive: item.sensitive === true,
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      rememberAllowed: item.rememberPolicy === "ask_user" || item.rememberAllowed === true
    };
  });
}

export function translateLegacyPluginEvent(event: LegacyPluginEvent): ExecutionEvent {
  const payload = event.payload ?? {};
  const executorState = {
    lastLegacyEventType: event.type,
    commandId: payload.commandId ?? null,
    tabId: payload.tabId ?? null,
    readbackHash: payload.readbackHash ?? null,
    submitAction: payload.submitAction ?? null
  };
  if (event.status === "failed" || event.status === "rejected") {
    return {
      type: "run_failed",
      reason: event.error?.code ?? "plugin_execution_failed",
      message: event.error?.message ?? "浏览器执行失败",
      payload: { userAction: event.error?.userAction ?? null },
      executorState
    };
  }
  if (event.type === "browser.login_required") {
    return {
      type: "user_action_required",
      reason: "login_required",
      message: "请在已打开的招聘网页完成登录，完成后继续当前任务。",
      payload: {},
      executorState
    };
  }
  if (event.type === "browser.missing_information_required") {
    return {
      type: "user_input_required",
      reason: "missing_information",
      message: "需要补充投递表单信息。",
      questions: questions(payload),
      payload: {},
      executorState
    };
  }
  if (event.type === "browser.form_readback") {
    return {
      type: "review_required",
      reason: "final_review",
      message: "表单已填写并完成读回，请用户核对后确认是否投递。",
      payload,
      executorState
    };
  }
  if (event.type === "browser.final_submit_executed") {
    return {
      type: "run_completed",
      message: "招聘网站已执行最终投递。",
      payload,
      executorState
    };
  }
  return {
    type: "progress",
    reason: event.type,
    message: "投递任务正在执行。",
    payload: {},
    executorState
  };
}

function executorState(run: ApplicationRun): Record<string, unknown> {
  return ((run as ApplicationRun & { executorState?: Record<string, unknown> }).executorState ?? {});
}

export class LegacyAiPluginBridgeAdapter implements ApplicationExecutionPort {
  constructor(private readonly transport: LegacyPluginTransport) {}

  async start(run: ApplicationRun): Promise<ExecutionEvent> {
    const manual = run.request.executionPolicy.mode === "manual_copy";
    const resume = run.request.assets.find((asset) => asset.purpose === "resume");
    const event = await this.transport.send(command(run, manual
      ? "browser.open_manual_application"
      : "browser.start_application_rpa", {
      jobId: run.request.job.jobId,
      applicationUrl: run.request.job.applicationUrl,
      job: run.request.job,
      executionPolicy: run.request.executionPolicy,
      modelServiceCode: "zhencai",
      sections: profileSections(run),
      ...(resume ? { resumeFile: resume } : {})
    }), { runId: run.runId, deviceId: run.request.deviceId });
    return translateLegacyPluginEvent(event);
  }

  async observe(run: ApplicationRun): Promise<ExecutionEvent> {
    const state = executorState(run);
    const event = await this.transport.send(command(run, "browser.observe_visual_rpa_state", {
      ...(state.tabId ? { tabId: state.tabId } : {})
    }), { runId: run.runId, deviceId: run.request.deviceId });
    return translateLegacyPluginEvent(event);
  }

  async provideAnswers(run: ApplicationRun, answers: AnswerSubmission): Promise<ExecutionEvent> {
    const pending = new Map(
      [...run.events].reverse().find((event) => event.type === "user_input_required")
        ?.questions.map((question) => [question.questionId, question]) ?? []
    );
    const supplemental = {
      id: "supplemental",
      kind: "other",
      title: "补充信息",
      items: answers.answers.map((answer) => {
        const question = pending.get(answer.questionId);
        return {
          id: answer.questionId,
          label: question?.label ?? answer.questionId,
          value: answer.value,
          valueSource: question?.semanticKey ?? answer.questionId
        };
      })
    };
    const event = await this.transport.send(command(run, "browser.set_manual_application_content", {
      sections: [...profileSections(run), supplemental]
    }), { runId: run.runId, deviceId: run.request.deviceId });
    return translateLegacyPluginEvent(event);
  }

  async confirm(run: ApplicationRun, confirmation: ApplicationConfirmation): Promise<ExecutionEvent> {
    const state = executorState(run);
    const event = await this.transport.send(command(run,
      "browser.submit_application_after_ai_confirmation", {
        ...(state.tabId ? { tabId: state.tabId } : {}),
        readbackHash: state.readbackHash ?? confirmation.reviewHash,
        submitAction: state.submitAction ?? {},
        aiSideConfirmation: {
          confirmedBy: "user_via_ai_side_second_confirm",
          confirmationId: confirmation.confirmationId,
          reviewHash: confirmation.reviewHash
        }
      }, true), { runId: run.runId, deviceId: run.request.deviceId });
    return translateLegacyPluginEvent(event);
  }
}
