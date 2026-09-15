import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  answerSubmissionSchema,
  applicationConfirmationSchema,
  applicationRunRequestSchema,
  applicationRunSchema,
  type AnswerSubmission,
  type ApplicationConfirmation,
  type ApplicationRun,
  type ApplicationRunEvent,
  type ApplicationRunRequest,
  type ExecutionEvent
} from "./application-contract.js";
import { IdempotencyConflictError } from "./gateway-errors.js";

export interface ApplicationRunRepository {
  save(run: ApplicationRun): Promise<ApplicationRun>;
  get(runId: string): Promise<ApplicationRun | null>;
  findByIdempotencyKey(tenantId: string, key: string): Promise<ApplicationRun | null>;
  getExecutorState(runId: string): Promise<Record<string, unknown>>;
  saveExecutorState(runId: string, state: Record<string, unknown>): Promise<void>;
}

export class MemoryApplicationRunRepository implements ApplicationRunRepository {
  private readonly runs = new Map<string, ApplicationRun>();
  private readonly executorStates = new Map<string, Record<string, unknown>>();

  async save(run: ApplicationRun): Promise<ApplicationRun> {
    const parsed = applicationRunSchema.parse(run);
    this.runs.set(parsed.runId, structuredClone(parsed));
    return structuredClone(parsed);
  }

  async get(runId: string): Promise<ApplicationRun | null> {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : null;
  }

  async findByIdempotencyKey(tenantId: string, key: string): Promise<ApplicationRun | null> {
    const run = [...this.runs.values()].find((candidate) =>
      candidate.request.tenantId === tenantId && candidate.request.idempotencyKey === key
    );
    return run ? structuredClone(run) : null;
  }

  async getExecutorState(runId: string): Promise<Record<string, unknown>> {
    return structuredClone(this.executorStates.get(runId) ?? {});
  }

  async saveExecutorState(runId: string, state: Record<string, unknown>): Promise<void> {
    this.executorStates.set(runId, structuredClone(state));
  }
}

export interface ApplicationExecutionPort {
  start(run: ApplicationRun): Promise<ExecutionEvent>;
  observe(run: ApplicationRun): Promise<ExecutionEvent>;
  provideAnswers(run: ApplicationRun, answers: AnswerSubmission): Promise<ExecutionEvent>;
  confirm(run: ApplicationRun, confirmation: ApplicationConfirmation): Promise<ExecutionEvent>;
}

function reviewHash(run: ApplicationRun, event: ExecutionEvent): string {
  return `sha256:${createHash("sha256").update(JSON.stringify({
    runId: run.runId,
    revision: run.revision,
    jobId: run.request.job.jobId,
    profileRef: run.request.candidate.profileRef,
    snapshotVersion: run.request.candidate.snapshotVersion,
    payload: event.payload ?? {}
  })).digest("hex")}`;
}

/** Supply only with an executor backed by the same transactional command store.
 * Browser/model/network work must stay in workers outside this short transaction. */
export type ApplicationGatewayTransactionRunner = <T>(key: string, work: () => Promise<T>) => Promise<T>;

export class ApplicationGateway {
  private readonly startOperations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly runs: ApplicationRunRepository,
    private readonly executor: ApplicationExecutionPort,
    private readonly now: () => Date = () => new Date(),
    private readonly transaction?: ApplicationGatewayTransactionRunner
  ) {}

  async start(input: ApplicationRunRequest): Promise<ApplicationRun> {
    const request = applicationRunRequestSchema.parse(input);
    return this.serializeStart(
      `idempotency:${JSON.stringify([request.tenantId, request.idempotencyKey])}`,
      () => this.inTransaction(`application-idempotency:${JSON.stringify([request.tenantId, request.idempotencyKey])}`,
        () => this.inTransaction(`${request.tenantId}\u0000${request.userId}`, () => this.startRequest(request)))
    );
  }

  private async startRequest(request: ApplicationRunRequest): Promise<ApplicationRun> {
    const existing = await this.runs.findByIdempotencyKey(
      request.tenantId,
      request.idempotencyKey
    );
    if (existing) {
      if (!isDeepStrictEqual(existing.request, request)) throw new IdempotencyConflictError();
      return existing;
    }

    const timestamp = this.now().toISOString();
    let run = applicationRunSchema.parse({
      schemaVersion: "application-run.v1",
      runId: randomUUID(),
      request,
      status: "queued",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      confirmation: null,
      events: []
    });
    run = this.append(run, {
      type: "run_created",
      message: "投递任务已创建"
    });
    run = await this.runs.save(run);
    return this.applyExecution(run, await this.executor.start(await this.withInternal(run)));
  }

  private serializeStart<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.startOperations.get(key) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    this.startOperations.set(key, current);
    return current.finally(() => {
      if (this.startOperations.get(key) === current) this.startOperations.delete(key);
    });
  }

  async get(runId: string): Promise<ApplicationRun> {
    return this.requiredRun(runId);
  }

  async events(runId: string, afterSequence = 0): Promise<ApplicationRunEvent[]> {
    const run = await this.requiredRun(runId);
    return run.events.filter((event) => event.sequence > afterSequence);
  }

  async continue(runId: string): Promise<ApplicationRun> {
    return this.mutateRun(runId, async (run) => {
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        throw new Error(`当前任务状态不可继续：${run.status}`);
      }
      return this.applyExecution(run, await this.executor.observe(await this.withInternal(run)));
    });
  }

  async provideAnswers(runId: string, input: AnswerSubmission): Promise<ApplicationRun> {
    const answers = answerSubmissionSchema.parse(input);
    return this.mutateRun(runId, async (run) => {
      if (run.status !== "waiting_for_user_input") {
        throw new Error(`当前任务不在等待补充信息状态：${run.status}`);
      }
      const pending = new Set(
        run.events.at(-1)?.questions.map((question) => question.questionId) ?? []
      );
      for (const answer of answers.answers) {
        if (!pending.has(answer.questionId)) {
          throw new Error(`当前任务不存在待回答问题：${answer.questionId}`);
        }
      }
      return this.applyExecution(
        run,
        await this.executor.provideAnswers(await this.withInternal(run), answers)
      );
    });
  }

  async confirm(runId: string, input: ApplicationConfirmation): Promise<ApplicationRun> {
    const confirmation = applicationConfirmationSchema.parse(input);
    return this.mutateRun(runId, async (run) => {
      if (run.status !== "review_required" || !run.confirmation) {
        throw new Error("当前任务尚未进入最终确认阶段");
      }
      if (run.confirmation.confirmationId !== confirmation.confirmationId ||
        run.confirmation.reviewHash !== confirmation.reviewHash) {
        throw new Error("确认内容与最新读回内容不一致");
      }
      if (Date.parse(run.confirmation.expiresAt) <= this.now().getTime()) {
        throw new Error("确认凭证已过期，请重新读取表单并确认");
      }
      const submitting = await this.runs.save({
        ...run,
        status: "submitting",
        updatedAt: this.now().toISOString()
      });
      return this.applyExecution(
        submitting,
        await this.executor.confirm(await this.withInternal(submitting), confirmation)
      );
    });
  }

  /** Accepts an executor event from an internal device broker. Never expose this
   * method as an AI-facing tool; AI clients consume the resulting business event. */
  async acceptExecutionEvent(
    runId: string,
    event: ExecutionEvent,
    identity?: { commandId: string }
  ): Promise<ApplicationRun> {
    return this.mutateRun(runId, async (run) => {
      if (identity) {
        const state = await this.runs.getExecutorState(runId);
        // The broker has already verified the immutable run/owner/device of
        // this command. Its old receipt is ACKed without altering a new attempt.
        if (state.commandId !== identity.commandId || ["completed", "failed", "cancelled"].includes(run.status)) return run;
        event = { ...event, executorState: { ...event.executorState, commandId: identity.commandId } };
      }
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        throw new Error(`当前任务已结束，不能接收执行结果：${run.status}`);
      }
      return this.applyExecution(run, event);
    });
  }

  private inTransaction<T>(key: string, work: () => Promise<T>): Promise<T> {
    return this.transaction ? this.transaction(key, work) : work();
  }

  private mutateRun(runId: string, work: (run: ApplicationRun) => Promise<ApplicationRun>): Promise<ApplicationRun> {
    const operation = async () => {
      const initial = await this.requiredRun(runId);
      return this.inTransaction(`${initial.request.tenantId}\u0000${initial.request.userId}`, async () => {
        // The first read only locates the owner lock. Re-read after taking it
        // so a second replica never validates or saves an obsolete revision.
        const current = await this.requiredRun(runId);
        if (current.request.tenantId !== initial.request.tenantId || current.request.userId !== initial.request.userId) {
          throw new Error("投递任务归属已变化，不能继续执行");
        }
        return work(current);
      });
    };
    // A device receipt can enter with the owner transaction already held.
    // Mixing an outer process lock with that DB lock would invert the order
    // against a concurrent request. PG owns serialization across all replicas.
    return this.transaction ? operation() : this.serializeStart(`run:${runId}`, operation);
  }

  private async withInternal(run: ApplicationRun): Promise<ApplicationRun> {
    const executorState = await this.runs.getExecutorState(run.runId);
    if (!Object.keys(executorState).length) return run;
    return Object.assign(structuredClone(run), {
      executorState
    });
  }

  private async applyExecution(run: ApplicationRun, event: ExecutionEvent): Promise<ApplicationRun> {
    if (event.executorState) {
      const previous = await this.runs.getExecutorState(run.runId);
      const next = Object.fromEntries(
        Object.entries(event.executorState).filter(([, value]) => value !== null && value !== undefined)
      );
      await this.runs.saveExecutorState(run.runId, { ...previous, ...next });
    }
    const next = await this.runs.save(this.append(run, event));
    if (event.type === "progress" && [
      "browser.application_opened",
      "browser.manual_application_content_set"
    ].includes(event.reason ?? "")) {
      return this.applyExecution(
        next,
        await this.executor.observe(await this.withInternal(next))
      );
    }
    return next;
  }

  private append(run: ApplicationRun, input: ExecutionEvent): ApplicationRun {
    const occurredAt = this.now().toISOString();
    const event: ApplicationRunEvent = {
      schemaVersion: "application-run-event.v1",
      eventId: randomUUID(),
      runId: run.runId,
      sequence: run.events.length + 1,
      type: input.type,
      occurredAt,
      reason: input.reason ?? null,
      message: input.message ?? "",
      questions: input.questions ?? [],
      payload: input.payload ?? {}
    };
    const status = input.type === "user_action_required"
      ? "waiting_for_user_action"
      : input.type === "user_input_required"
        ? "waiting_for_user_input"
        : input.type === "review_required"
          ? "review_required"
          : input.type === "run_completed"
            ? "completed"
            : input.type === "run_failed"
              ? "failed"
              : input.type === "run_created"
                ? run.status
                : "running";
    const confirmation = input.type === "review_required"
      ? {
          confirmationId: randomUUID(),
          reviewHash: reviewHash(run, input),
          expiresAt: new Date(this.now().getTime() + 10 * 60_000).toISOString()
        }
      : status === "review_required" ? run.confirmation : null;
    return applicationRunSchema.parse({
      ...run,
      status,
      revision: run.revision + 1,
      updatedAt: occurredAt,
      confirmation,
      events: [...run.events, event]
    });
  }

  private async requiredRun(runId: string): Promise<ApplicationRun> {
    const run = await this.runs.get(runId);
    if (!run) throw new Error(`投递任务不存在：${runId}`);
    return run;
  }
}
