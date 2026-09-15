import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoApplyDeviceRequestTimeoutMs,
  autoApplyVisionPlanningRequestTimeoutMs,
  AutoApplyCommandCompletionRejectedError,
  AutoApplyCommandLeaseRejectedError,
  AutoApplyDeviceRequestTimeoutError,
  AutoApplyProgressSequenceConflictError,
  claimAutoApplyCommand,
  commandWithClaimedExecutionDeadline,
  clearAutoApplyCredential,
  completeAutoApplyCommand,
  defaultAutoApplyGatewayBaseUrl,
  exchangeAutoApplyBootstrap,
  heartbeatAutoApplyDevice,
  planAutoApplyVision,
  renewAutoApplyCommandLease,
  reportAutoApplyBrowserState,
  reportAutoApplyCommandProgress,
  verifyAutoApplySubmission,
  type AutoApplyRuntimeCredential
} from "./auto-apply-client.js";

const existingCredential: AutoApplyRuntimeCredential = {
  schemaVersion: "auto-apply-runtime-credential.v1",
  gatewayBaseUrl: defaultAutoApplyGatewayBaseUrl,
  tenantId: "aioffer-test",
  userId: "user-existing",
  deviceId: "device-existing",
  deviceToken: "device-token-existing",
  pairedAt: "2026-08-23T00:00:00.000Z"
};

describe("exchangeAutoApplyBootstrap", () => {
  const progress = { schemaVersion: "auto-apply-job-progress.v1" as const, batchId: "batch",
    batchJobId: "batch-job", jobId: "job", sequence: 2, stage: "filling" as const,
    message: "填写", occurredAt: "2026-09-07T00:00:00.000Z" };

  it("recognizes only a valid command-progress sequence conflict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      schemaVersion: "device-bridge-error.v1", code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: 80
    }, { status: 409 })));
    await expect(reportAutoApplyCommandProgress(existingCredential, "command-1", progress))
      .rejects.toEqual(new AutoApplyProgressSequenceConflictError(80));
  });

  it.each([
    { status: 403, code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: 80 },
    { status: 409, code: "DEVICE_BRIDGE_CONFLICT", acceptedSequence: 80 },
    { status: 409, code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: 1 },
    { status: 409, code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: "80" },
    { status: 409, code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: Number.MAX_SAFE_INTEGER },
    { status: 409, code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: 2.5 }
  ])("does not rebase from incompatible progress errors: %j", async ({ status, ...body }) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ schemaVersion: "device-bridge-error.v1", ...body }, { status })));
    const error = await reportAutoApplyCommandProgress(existingCredential, "command-1", progress).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AutoApplyProgressSequenceConflictError);
  });

  it("cancels a pending progress request when its reporter stops", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async (_url, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const pending = reportAutoApplyCommandProgress(existingCredential, "command-1", progress, controller.signal);
    const assertion = expect(pending).rejects.toThrow("stopped");
    controller.abort(new Error("stopped"));
    await assertion;
  });

  it("cancels a stalled progress error body after HTTP headers have arrived", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 409 })));
    const pending = reportAutoApplyCommandProgress(existingCredential, "command-1", progress, controller.signal);
    const assertion = expect(pending).rejects.toThrow("HTTP 409");
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("limits error response size without logging unrelated response text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private".repeat(2000), { status: 409 })));
    await expect(reportAutoApplyCommandProgress(existingCredential, "command-1", progress))
      .rejects.toThrow(/^回传自动投递进度失败：HTTP 409$/);
  });
  const storageSet = vi.fn();

  beforeEach(() => {
    storageSet.mockReset();
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async () => ({ autoApplyRuntimeCredential: existingCredential })),
          set: storageSet
        }
      },
      runtime: {
        getManifest: () => ({ version: "0.14.53" })
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns a transport rejection into an actionable error without overwriting the working credential", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));

    await expect(exchangeAutoApplyBootstrap({ bootstrapToken: "one-time-token" }))
      .rejects.toThrow(`设备自动绑定网络连接失败：无法访问 ${defaultAutoApplyGatewayBaseUrl}`);
    expect(storageSet).not.toHaveBeenCalled();
  });

  it("reports an HTTP bootstrap rejection separately from a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("conflict", { status: 409 })));

    await expect(exchangeAutoApplyBootstrap({ bootstrapToken: "expired-token" }))
      .rejects.toThrow("设备自动绑定失败：HTTP 409");
    expect(storageSet).not.toHaveBeenCalled();
  });

  it("offers a fresh device candidate while identifying the previous binding", async () => {
    let requestDeviceId = "";
    let previousDeviceId = "";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { deviceId?: string; previousDeviceId?: string };
      requestDeviceId = String(body.deviceId ?? "");
      previousDeviceId = String(body.previousDeviceId ?? "");
      return Response.json({
        tenantId: "aioffer-test",
        userId: "user-new",
        deviceId: requestDeviceId,
        deviceToken: "device-token-new"
      });
    }));

    const credential = await exchangeAutoApplyBootstrap({ bootstrapToken: "new-owner-token" });

    expect(requestDeviceId).not.toBe(existingCredential.deviceId);
    expect(previousDeviceId).toBe(existingCredential.deviceId);
    expect(credential).toMatchObject({ userId: "user-new", deviceId: requestDeviceId });
    expect(storageSet).toHaveBeenCalledWith({ autoApplyRuntimeCredential: credential });
  });

  it("clears the account-bound device credential on logout", async () => {
    await clearAutoApplyCredential();
    expect(storageSet).toHaveBeenCalledWith({ autoApplyRuntimeCredential: null });
  });

  it.each([
    {}, { schemaVersion: "device-command-lease.v1", commandId: "another", leaseExpiresAt: "2099-01-01T00:00:00.000Z" },
    { schemaVersion: "device-command-lease.v1", commandId: "command-1", leaseExpiresAt: "invalid" },
    { schemaVersion: "device-command-lease.v1", commandId: "command-1", leaseExpiresAt: "2000-01-01T00:00:00.000Z" }
  ])("rejects malformed, foreign or already expired renewal ACKs: %j", async receipt => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(receipt)));
    await expect(renewAutoApplyCommandLease(existingCredential, "command-1")).rejects.toThrow("未确认");
  });

  it("accepts only a matching live lease renewal ACK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ schemaVersion: "device-command-lease.v1",
      commandId: "command-1", leaseExpiresAt: new Date(Date.now() + 90_000).toISOString() })));
    await expect(renewAutoApplyCommandLease(existingCredential, "command-1")).resolves.toBeUndefined();
  });

  it.each([false, "false", "true", 1, {}])("rejects non-boolean authorization proof: %j", async valid => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ valid })));
    await expect(verifyAutoApplySubmission(existingCredential, {
      token: "synthetic", batchId: "batch", batchJobId: "job", commandId: "command-1"
    })).resolves.toBe(false);
  });

  it("exposes a rejected lease so the runtime can stop an executing task", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

    const error = await renewAutoApplyCommandLease(existingCredential, "command-1")
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AutoApplyCommandLeaseRejectedError);
    expect(error).toMatchObject({ status: 401 });
  });

  it("aborts an unresponsive device bridge request instead of leaving the poller running", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })
    ));

    const request = heartbeatAutoApplyDevice(existingCredential);
    const rejection = request.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(autoApplyDeviceRequestTimeoutMs);

    await expect(rejection).resolves.toBeInstanceOf(AutoApplyDeviceRequestTimeoutError);
  });

  it("keeps model-backed vision planning alive beyond the routine device timeout", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        })
      ));

      const result = planAutoApplyVision(existingCredential, "vision-session-1", {
        task: "fill_application_form",
        observation: {},
        screenshot: null,
        candidate: {}
      }).catch((error: unknown) => error);
      let settled = false;
      void result.finally(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(autoApplyDeviceRequestTimeoutMs);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(
        autoApplyVisionPlanningRequestTimeoutMs - autoApplyDeviceRequestTimeoutMs
      );
      await expect(result).resolves.toBeInstanceOf(AutoApplyDeviceRequestTimeoutError);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("reportAutoApplyCommandProgress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the device-scoped progress receipt to the claimed command", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportAutoApplyCommandProgress(existingCredential, "command-1", {
      schemaVersion: "auto-apply-job-progress.v1",
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      sequence: 3,
      stage: "filling",
      message: "正在填写申请表",
      occurredAt: "2026-08-26T02:00:00.000Z"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${defaultAutoApplyGatewayBaseUrl}/device-bridge/v1/commands/command-1/progress`,
      expect.objectContaining({ method: "POST" })
    );
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      deviceId: "device-existing",
      sequence: 3,
      stage: "filling"
    });
  });
});

describe("auto-apply execution fencing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a bounded lease and preserves the server execution deadline", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      schemaVersion: "device-command-claim.v1",
      commandId: "command-1",
      runId: "run-1",
      leaseExpiresAt: "2026-08-26T02:01:30.000Z",
      executionExpiresAt: "2026-08-26T02:15:00.000Z",
      command: {}
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimAutoApplyCommand(existingCredential)).resolves.toMatchObject({
      commandId: "command-1",
      executionExpiresAt: "2026-08-26T02:15:00.000Z"
    });
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ leaseSeconds: 90 });
  });

  it("uses the Gateway execution deadline before validating a reclaimed command", () => {
    const original = {
      schemaVersion: "ai-plugin-command.v1",
      commandId: "command-1",
      expiresAt: "2026-09-01T15:37:20.616Z"
    };

    const normalized = commandWithClaimedExecutionDeadline(
      original,
      "2026-09-01T15:47:22.128Z"
    ) as { expiresAt?: string };

    expect(normalized.expiresAt).toBe("2026-09-01T15:47:22.128Z");
    expect(original.expiresAt).toBe("2026-09-01T15:37:20.616Z");
  });

  it("does not mask an invalid execution deadline", () => {
    const command = { expiresAt: "2026-09-01T15:37:20.616Z" };
    expect(commandWithClaimedExecutionDeadline(command, "not-a-date")).toBe(command);
  });

  it("binds final-submit verification to the exact claimed command", async () => {
    const fetchMock = vi.fn(async () => Response.json({ valid: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyAutoApplySubmission(existingCredential, {
      token: "signed-batch-authorization",
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      commandId: "command-1"
    })).resolves.toBe(true);
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ commandId: "command-1" });
  });

  it("exposes an expired completion without claiming the result was accepted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("expired", { status: 410 })));

    const error = await completeAutoApplyCommand(existingCredential, "command-1", {})
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AutoApplyCommandCompletionRejectedError);
    expect(error).toMatchObject({ status: 410 });
  });

  it.each([{ accepted: false, commandId: "command-1" }, { accepted: true, commandId: "wrong-command" }, {}])(
    "requires an explicit acknowledgement for the exact command: %j", async (receipt) => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(receipt)));
      await expect(completeAutoApplyCommand(existingCredential, "command-1", {})).rejects.toThrow("Gateway 未确认");
    }
  );

  it("accepts a confirmed receipt for the exact command", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ accepted: true, commandId: "command-1" })));
    await expect(completeAutoApplyCommand(existingCredential, "command-1", {})).resolves.toBeUndefined();
  });
});

describe("reportAutoApplyBrowserState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an already-applied terminal page for persisted-tab reconciliation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportAutoApplyBrowserState(existingCredential, {
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      outcome: "already_applied",
      pageUrl: "https://app.mokahr.com/campus-recruitment/example/1#/job/1/apply",
      observedAt: "2026-08-26T02:03:00.000Z"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${defaultAutoApplyGatewayBaseUrl}/device-bridge/v1/auto-apply/browser-state`,
      expect.objectContaining({ method: "POST" })
    );
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      deviceId: "device-existing",
      outcome: "already_applied",
      jobId: "job-1"
    });
  });

  it("reports a user-closed CAPTCHA tab without occupying the command channel", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportAutoApplyBrowserState(existingCredential, {
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      outcome: "captcha_tab_closed",
      pageUrl: "https://app.mokahr.com/campus-recruitment/example/1#/job/1/apply",
      observedAt: "2026-09-01T09:00:00.000Z"
    });

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      outcome: "captcha_tab_closed",
      jobId: "job-1"
    });
  });

  it("reports a post-CAPTCHA site application limit with its visible message", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportAutoApplyBrowserState(existingCredential, {
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      commandId: "command-1",
      outcome: "site_application_limit_reached",
      siteMessage: "这6个月投递太多岗位，请耐心等待",
      pageUrl: "https://app.mokahr.com/campus-recruitment/example/1#/job/1/apply",
      observedAt: "2026-09-05T14:00:00.000Z"
    });

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      outcome: "site_application_limit_reached",
      commandId: "command-1",
      siteMessage: "这6个月投递太多岗位，请耐心等待",
      jobId: "job-1"
    });
  });

  it("reports a passive submission receipt timeout through Browser State", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportAutoApplyBrowserState(existingCredential, {
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      outcome: "submission_receipt_timeout",
      pageUrl: "https://app.mokahr.com/campus-recruitment/example/1#/job/1/apply",
      observedAt: "2026-09-01T09:01:00.000Z"
    });

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      outcome: "submission_receipt_timeout",
      jobId: "job-1"
    });
  });

  it("sends the original command and user interruption facts without candidate answers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await reportAutoApplyBrowserState(existingCredential, {
      batchId: "11111111-1111-4111-8111-111111111111", batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1", commandId: "original-command", outcome: "user_interrupted", interruptionKind: "browser_session_ended",
      submissionStarted: false, pageUrl: "https://ats.example/apply", observedAt: "2026-09-08T00:00:00Z"
    });
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ commandId: "original-command", outcome: "user_interrupted",
      interruptionKind: "browser_session_ended", submissionStarted: false });
    expect(JSON.parse(String(request.body))).not.toHaveProperty("answers");
  });

  it("reports the exact command when an active submitted tab closes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportAutoApplyBrowserState(existingCredential, {
      batchId: "11111111-1111-4111-8111-111111111111",
      batchJobId: "22222222-2222-4222-8222-222222222222",
      jobId: "job-1",
      commandId: "command-1",
      outcome: "submission_active_tab_closed",
      pageUrl: "https://app.mokahr.com/campus-recruitment/example/1#/job/1/apply",
      observedAt: "2026-09-03T12:00:00.000Z"
    });

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      outcome: "submission_active_tab_closed",
      commandId: "command-1",
      jobId: "job-1"
    });
  });
});


describe("claim with unresolved completion receipts", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("executes no claim unless Gateway explicitly resolves every prior command", async () => {
    const fetchMock = vi.fn(async () => Response.json({ commandId: "new-command", command: {},
      resolvedPendingCommandIds: ["old-command", "other-command"] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(claimAutoApplyCommand(existingCredential, ["old-command", "old-command", "other-command"]))
      .resolves.toMatchObject({ commandId: "new-command" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toMatchObject({
      pendingResultCommandIds: ["old-command", "other-command"] });
  });

  it.each([
    { commandId: "new-command", command: {} },
    { commandId: "new-command", command: {}, resolvedPendingCommandIds: ["old-command"] },
    { commandId: "old-command", command: {}, resolvedPendingCommandIds: ["old-command", "other-command"] }
  ])("rejects missing, partial or self-replay release proof: %j", async response => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response)));
    await expect(claimAutoApplyCommand(existingCredential, ["old-command", "other-command"]))
      .rejects.toThrow("执行权已释放");
  });

  it("bounds pending result identities before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(claimAutoApplyCommand(existingCredential, Array.from({ length: 101 }, (_, i) => `command-${i}`)))
      .rejects.toThrow("执行权已释放");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["applied", "duplicate", "archived_stale"])("accepts exact-command acknowledgement disposition %s", async disposition => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ accepted: true, commandId: "command-1", disposition })));
    await expect(completeAutoApplyCommand(existingCredential, "command-1", {})).resolves.toBeUndefined();
  });

  it("does not discard the result for an unknown acknowledgement disposition", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ accepted: true, commandId: "command-1", disposition: "ignored" })));
    await expect(completeAutoApplyCommand(existingCredential, "command-1", {})).rejects.toThrow("Gateway 未确认");
  });
});
