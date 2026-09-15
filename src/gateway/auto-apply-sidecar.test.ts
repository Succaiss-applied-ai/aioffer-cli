import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { MINIMUM_AUTO_APPLY_PLUGIN_VERSION } from "./device-registry.js";
import { createApplicationGatewaySidecar } from "./sidecar.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("batch auto apply sidecar", () => {
  it("bootstraps a device, creates a confirmed batch and returns a terminal job result", async () => {
    const callbackRequests: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];
    const callbackServer = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        callbackRequests.push({ headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
        response.statusCode = 204;
        response.end();
      });
    });
    callbackServer.listen(0, "127.0.0.1");
    servers.push(callbackServer);
    await new Promise<void>((resolve) => callbackServer.once("listening", resolve));
    const callbackAddress = callbackServer.address();
    if (!callbackAddress || typeof callbackAddress === "string") throw new Error("回调测试端口不可用");
    const callbackOrigin = `http://127.0.0.1:${callbackAddress.port}`;
    const callbackSigningTestKey = ["callback", "test", "key", "x".repeat(32)].join("-");
    const { app } = createApplicationGatewaySidecar({
      accessToken: "ai-token",
      autoApplySigningSecret: "test-auto-apply-signing-secret-that-is-long-enough",
      autoApplyCallbackSecrets: { "aioffer-test": callbackSigningTestKey },
      autoApplyCallbackAllowedOrigins: [callbackOrigin],
      allowedOrigins: [
        "https://aioffer-test.succaiss.com",
        "https://aioffer.succaiss.com"
      ]
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");
    const base = `http://127.0.0.1:${address.port}/automation`;
    const aiHeaders = {
      Authorization: "Bearer ai-token",
      "X-Tenant-Id": "tenant-1",
      "X-User-Id": "user-1",
      "Content-Type": "application/json"
    };

    const corsPreflight = await fetch(`${base}/auto-apply/v1/devices/chrome-device-1`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://aioffer-test.succaiss.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,x-tenant-id,x-user-id"
      }
    });
    expect(corsPreflight.status).toBe(204);
    expect(corsPreflight.headers.get("access-control-allow-origin"))
      .toBe("https://aioffer-test.succaiss.com");

    const rejectedPreflight = await fetch(`${base}/auto-apply/v1/devices/chrome-device-1`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted.example.com",
        "Access-Control-Request-Method": "GET"
      }
    });
    expect(rejectedPreflight.status).toBe(403);

    const legacyCurrentResponse = await fetch(`${base}/auto-apply/v1/devices/current`, {
      headers: aiHeaders
    });
    expect(legacyCurrentResponse.status).toBe(422);
    expect(await legacyCurrentResponse.json()).toMatchObject({ code: "DEVICE_ID_REQUIRED" });

    const siteSupportResponse = await fetch(`${base}/auto-apply/v1/site-support:check`, {
      method: "POST",
      headers: aiHeaders,
      body: JSON.stringify({
        schemaVersion: "auto-apply-site-support-check-request.v1",
        jobs: [
          {
            jobId: "zhongan-job",
            applicationUrl: "https://app.mokahr.com/campus-recruitment/zhongan/148589#/job/875835a1-8959-41c8-ab56-2314179c1412/apply"
          },
          {
            jobId: "li-auto-job",
            applicationUrl: "https://li.jobs.feishu.cn/index/position/detail/7670055787163814170"
          }
        ]
      })
    });
    expect(siteSupportResponse.status).toBe(200);
    expect(await siteSupportResponse.json()).toMatchObject({
      schemaVersion: "auto-apply-site-support-check.v1",
      allSupported: true,
      results: [
        {
          jobId: "zhongan-job",
          supported: true,
          adapterCode: "moka.v2",
          supportLevel: "specialized",
          knownNoLogin: false,
          reasonCode: null,
          recommendedAction: "start_and_detect_login"
        },
        {
          jobId: "li-auto-job",
          supported: true,
          adapterCode: "generic.web.v1",
          supportLevel: "adaptive",
          knownNoLogin: false,
          reasonCode: null,
          recommendedAction: "start_and_detect_login"
        }
      ]
    });

    const bootstrapResponse = await fetch(`${base}/auto-apply/v1/device-bootstrap-sessions`, {
      method: "POST",
      headers: aiHeaders,
      body: "{}"
    });
    expect(bootstrapResponse.status).toBe(201);
    const bootstrap = await bootstrapResponse.json() as Record<string, any>;
    expect(bootstrap).toMatchObject({
      schemaVersion: "device-bootstrap-session.v1",
      installation: {
        installed: null,
        statusSource: "recruiting-ai-device-context.v1"
      }
    });
    const exchangeResponse = await fetch(`${base}/device-bridge/v1/bootstrap:exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bootstrapToken: bootstrap.bootstrapToken,
        deviceId: "chrome-device-1",
        pluginInstalled: true,
        pluginVersion: "0.15.10",
        capabilities: ["batch_auto_apply.v1", "moka.deepseek.v1"]
      })
    });
    expect(exchangeResponse.status).toBe(201);
    const exchange = await exchangeResponse.json() as Record<string, any>;
    const deviceHeaders = {
      Authorization: `Bearer ${exchange.deviceToken}`,
      "X-Tenant-Id": "tenant-1",
      "Content-Type": "application/json"
    };

    const deviceStatusResponse = await fetch(`${base}/auto-apply/v1/devices/chrome-device-1`, {
      headers: aiHeaders
    });
    expect(deviceStatusResponse.status).toBe(200);
    expect(await deviceStatusResponse.json()).toMatchObject({
      schemaVersion: "auto-apply-device-status.v1",
      status: "ready",
      deviceId: "chrome-device-1",
      pluginVersion: "0.15.10",
      minimumAutoApplyPluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
      updateRequired: true,
      pluginDownloadUrl: "http://127.0.0.1:19876/",
      capabilities: ["batch_auto_apply.v1", "moka.deepseek.v1"]
    });

    const missingDeviceCreateResponse = await fetch(`${base}/auto-apply/v1/batches`, {
      method: "POST",
      headers: { ...aiHeaders, "Idempotency-Key": "missing-device" },
      body: "{}"
    });
    expect(missingDeviceCreateResponse.status).toBe(422);
    expect(await missingDeviceCreateResponse.json()).toMatchObject({
      schemaVersion: "auto-apply-error.v1",
      code: "DEVICE_ID_REQUIRED",
      retryable: false
    });

    const unknownDeviceCreateResponse = await fetch(`${base}/auto-apply/v1/batches`, {
      method: "POST",
      headers: { ...aiHeaders, "Idempotency-Key": "unknown-device" },
      body: JSON.stringify({ deviceId: "another-device" })
    });
    expect(unknownDeviceCreateResponse.status).toBe(404);
    expect(await unknownDeviceCreateResponse.json()).toMatchObject({ code: "DEVICE_NOT_FOUND" });

    const outdatedCreateResponse = await fetch(`${base}/auto-apply/v1/batches`, {
      method: "POST",
      headers: { ...aiHeaders, "Idempotency-Key": "outdated-plugin" },
      body: JSON.stringify({ deviceId: "chrome-device-1" })
    });
    expect(outdatedCreateResponse.status).toBe(409);
    expect(await outdatedCreateResponse.json()).toMatchObject({
      schemaVersion: "auto-apply-error.v1",
      code: "PLUGIN_UPDATE_REQUIRED",
      retryable: false,
      nextAction: "update_plugin",
      details: {
        currentVersion: "0.15.10",
        minimumVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
        userAction: { type: "update_plugin" }
      }
    });

    const heartbeatResponse = await fetch(`${base}/device-bridge/v1/devices/chrome-device-1/heartbeat`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        pluginInstalled: true,
        pluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
        capabilities: ["batch_auto_apply.v1", "account_logout_fence.v1", "moka.deepseek.v1"]
      })
    });
    expect(heartbeatResponse.status).toBe(200);

    const updatedDeviceStatusResponse = await fetch(`${base}/auto-apply/v1/devices/chrome-device-1`, {
      headers: aiHeaders
    });
    expect(await updatedDeviceStatusResponse.json()).toMatchObject({
      pluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
      minimumAutoApplyPluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
      updateRequired: false,
      pluginDownloadUrl: null
    });

    const directProfileBlocked = await fetch(`${base}/auto-apply/v1/batches`, {
      method: "POST", headers: { ...aiHeaders, "Idempotency-Key": "direct-profile-old-plugin" },
      body: JSON.stringify({ deviceId: "chrome-device-1", candidate: { applicationProfileUrl: "https://aioffer-test.succaiss.com/api/v1/gateway/plugin-execution-profile?batchId=local-1" } })
    });
    expect(directProfileBlocked.status).toBe(409);
    expect(await directProfileBlocked.json()).toMatchObject({ code: "PLUGIN_UPDATE_REQUIRED" });

    const createResponse = await fetch(`${base}/auto-apply/v1/batches`, {
      method: "POST",
      headers: { ...aiHeaders, "Idempotency-Key": "batch-1" },
      body: JSON.stringify({
        schemaVersion: "auto-apply-batch-request.v1",
        deviceId: "chrome-device-1",
        candidate: {
          packageRef: "https://files.example.com/candidate.zcresume.json",
          packageVersion: "1",
          packageSha256: "a".repeat(64),
          applicationProfile: {
            schemaVersion: "candidate-application-profile.v1",
            revision: "c".repeat(64),
            facts: []
          }
        },
        assets: [{
          assetId: "resume-main",
          purpose: "resume",
          fileRef: "https://files.example.com/resume.pdf",
          name: "resume.pdf",
          mediaType: "application/pdf",
          sha256: "b".repeat(64)
        }],
        jobs: [{
          jobId: "deepseek-job-1",
          companyName: "DeepSeek",
          title: "服务端开发工程师",
          applicationUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply",
          adapterHint: "moka.deepseek.v1"
        }],
        confirmation: {
          scope: "batch",
          confirmedByUser: true,
          confirmedAt: "2026-08-18T04:00:00.000Z",
          displayedJobIds: ["deepseek-job-1"],
          allowAutomaticFinalSubmit: true
        },
        callback: {
          url: `${callbackOrigin}/events/auto-apply`,
          secretRef: "aioffer-test"
        }
      })
    });
    expect(createResponse.status).toBe(201);
    const batch = await createResponse.json() as Record<string, any>;
    expect(batch.status).toBe("running");

    const claimResponse = await fetch(`${base}/device-bridge/v1/devices/chrome-device-1/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-1" })
    });
    expect(claimResponse.status).toBe(200);
    const claim = await claimResponse.json() as Record<string, any>;
    expect(claim.command.type).toBe("browser.execute_batch_auto_apply_job");

    const progressResponse = await fetch(`${base}/device-bridge/v1/commands/${claim.commandId}/progress`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        schemaVersion: "auto-apply-job-progress.v1",
        deviceId: "chrome-device-1",
        batchId: batch.batchId,
        batchJobId: batch.jobs[0].batchJobId,
        jobId: "deepseek-job-1",
        sequence: 1,
        stage: "opening",
        message: "正在打开招聘页面",
        occurredAt: "2026-08-26T02:00:00.000Z"
      })
    });
    expect(progressResponse.status).toBe(200);
    expect(await progressResponse.json()).toMatchObject({
      schemaVersion: "device-command-progress-receipt.v1",
      accepted: true,
      commandId: claim.commandId,
      batchId: batch.batchId,
      batchJobId: batch.jobs[0].batchJobId,
      sequence: 1
    });
    const staleProgressResponse = await fetch(`${base}/device-bridge/v1/commands/${claim.commandId}/progress`, {
      method: "POST", headers: deviceHeaders,
      body: JSON.stringify({ schemaVersion: "auto-apply-job-progress.v1", deviceId: "chrome-device-1",
        batchId: batch.batchId, batchJobId: batch.jobs[0].batchJobId, jobId: "deepseek-job-1",
        sequence: 1, stage: "preflight", message: "任务恢复", occurredAt: "2026-08-26T02:00:01.000Z" })
    });
    expect(staleProgressResponse.status).toBe(409);
    expect(await staleProgressResponse.json()).toMatchObject({
      schemaVersion: "device-bridge-error.v1", code: "AUTO_APPLY_PROGRESS_SEQUENCE_CONFLICT", acceptedSequence: 1
    });
    const progressStatusResponse = await fetch(`${base}/auto-apply/v1/batches/${batch.batchId}`, {
      headers: aiHeaders
    });
    expect(await progressStatusResponse.json()).toMatchObject({
      jobs: [{
        status: "opening",
        progress: {
          sequence: 1,
          stage: "opening",
          message: "正在打开招聘页面"
        }
      }]
    });

    const verifyResponse = await fetch(`${base}/device-bridge/v1/auto-apply/submission-authorizations:verify`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        token: claim.command.payload.batchAuthorization,
        batchId: batch.batchId,
        batchJobId: batch.jobs[0].batchJobId,
        commandId: claim.commandId
      })
    });
    expect(verifyResponse.status).toBe(200);

    const waitingRequest = {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        deviceId: "chrome-device-1",
        event: {
          schemaVersion: "ai-plugin-event.v1",
          type: "browser.batch_auto_apply_job_completed",
          status: "completed",
          payload: {
            autoApplyResult: {
              schemaVersion: "auto-apply-job-result.v1",
              batchId: batch.batchId,
              batchJobId: batch.jobs[0].batchJobId,
              jobId: "deepseek-job-1",
              status: "waiting_for_user_action",
              occurredAt: "2026-08-18T04:01:00.000Z",
              reasonCode: "login_required",
              evidence: {
                screenshotRef: null,
                screenshotDataUrl: "data:image/png;base64,aGVsbG8=",
                redacted: true,
                pageUrl: "https://app.mokahr.com/login",
                siteConfirmation: null,
                userActionRequired: {
                  type: "login",
                  message: "请完成招聘网站登录",
                  resumeSupported: true
                }
              }
            }
          }
        }
      })
    };
    const waitingResponse = await fetch(`${base}/device-bridge/v1/commands/${claim.commandId}/results`, waitingRequest);
    expect(waitingResponse.status).toBe(200);
    const waitingReceipt = await waitingResponse.json() as Record<string, any>;
    expect(waitingReceipt.batchStatus).toBe("completed_with_errors");
    const repeatedReceipt = await fetch(`${base}/device-bridge/v1/commands/${claim.commandId}/results`, waitingRequest);
    expect(repeatedReceipt.status).toBe(200);
    expect(await repeatedReceipt.json()).toMatchObject({ accepted: true, commandId: claim.commandId });
    expect(callbackRequests).toHaveLength(1);
    const callbackRequest = callbackRequests[0]!;
    const callbackTimestamp = String(callbackRequest.headers["x-recruiting-timestamp"]);
    const callbackSignature = String(callbackRequest.headers["x-recruiting-signature"]);
    const expectedSignature = createHmac("sha256", callbackSigningTestKey)
      .update(`${callbackTimestamp}.${callbackRequest.body}`)
      .digest("hex");
    expect(callbackSignature).toBe(`v1=${expectedSignature}`);
    expect(JSON.parse(callbackRequest.body)).toMatchObject({
      schemaVersion: "auto-apply-callback.v1",
      eventType: "batch.completed",
      batchId: batch.batchId,
      status: "completed_with_errors",
      jobs: [{ jobId: "deepseek-job-1", status: "failed", reasonCode: "login_required" }]
    });

    const statusResponse = await fetch(`${base}/auto-apply/v1/batches/${batch.batchId}`, {
      headers: aiHeaders
    });
    const status = await statusResponse.json() as Record<string, any>;
    expect(status.jobs[0]).toMatchObject({ status: "failed", reasonCode: "login_required", attempt: 1 });
    expect(status.callbackDelivery).toMatchObject({ status: "delivered", attempts: 1 });

    const missingInfoCreate = await fetch(`${base}/auto-apply/v1/batches`, {
      method: "POST",
      headers: { ...aiHeaders, "Idempotency-Key": "batch-required-field-answer" },
      body: JSON.stringify({
        schemaVersion: "auto-apply-batch-request.v1",
        deviceId: "chrome-device-1",
        candidate: {
          packageRef: "https://files.example.com/candidate.zcresume.json",
          packageVersion: "1",
          packageSha256: "a".repeat(64),
          applicationProfile: {
            schemaVersion: "candidate-application-profile.v1",
            revision: "d".repeat(64),
            facts: []
          }
        },
        assets: [{
          assetId: "resume-main",
          purpose: "resume",
          fileRef: "https://files.example.com/resume.pdf",
          name: "resume.pdf",
          mediaType: "application/pdf"
        }],
        jobs: [{
          jobId: "required-field-job",
          companyName: "Moka",
          title: "测试岗位",
          applicationUrl: "https://app.mokahr.com/example/job/required-field-job/apply"
        }],
        confirmation: {
          scope: "batch",
          confirmedByUser: true,
          confirmedAt: "2026-08-25T06:00:00.000Z",
          displayedJobIds: ["required-field-job"],
          allowAutomaticFinalSubmit: true
        }
      })
    });
    expect(missingInfoCreate.status).toBe(201);
    const missingInfoBatch = await missingInfoCreate.json() as Record<string, any>;
    const missingInfoClaimResponse = await fetch(`${base}/device-bridge/v1/devices/chrome-device-1/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-1" })
    });
    const missingInfoClaim = await missingInfoClaimResponse.json() as Record<string, any>;
    await fetch(`${base}/device-bridge/v1/commands/${missingInfoClaim.commandId}/results`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        deviceId: "chrome-device-1",
        event: {
          schemaVersion: "ai-plugin-event.v1",
          type: "browser.batch_auto_apply_job_completed",
          status: "completed",
          payload: {
            autoApplyResult: {
              schemaVersion: "auto-apply-job-result.v1",
              batchId: missingInfoBatch.batchId,
              batchJobId: missingInfoBatch.jobs[0].batchJobId,
              jobId: "required-field-job",
              status: "waiting_for_user_action",
              occurredAt: "2026-08-25T06:01:00.000Z",
              reasonCode: "missing_information",
              evidence: {
                screenshotRef: null,
                redacted: true,
                pageUrl: "https://app.mokahr.com/example/job/required-field-job/apply",
                siteConfirmation: null,
                requiredFieldRequests: [{
                  schemaVersion: "required-field-request.v1",
                  fieldId: "gender",
                  stableFieldKey: "basic.gender.combobox",
                  label: "个人信息 · 性别",
                  sectionKey: "basic",
                  groupIndex: null,
                  type: "combobox",
                  controlKind: "combobox",
                  required: true,
                  reasonCode: "candidate_information_missing",
                  description: "该字段必须使用页面有效选项，请向用户确认。",
                  question: "请选择性别。",
                  options: ["男", "女"]
                }]
              }
            }
          }
        }
      })
    });
    const answerResponse = await fetch(
      `${base}/auto-apply/v1/batches/${missingInfoBatch.batchId}/jobs/${missingInfoBatch.jobs[0].batchJobId}/required-field-answers`,
      {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          schemaVersion: "required-field-answers.v1",
          answers: [{
            fieldId: "gender",
            stableFieldKey: "basic.gender.combobox",
            value: "女",
            source: "user_confirmed",
            answeredAt: "2026-08-25T06:02:00.000Z"
          }]
        })
      }
    );
    expect(answerResponse.status).toBe(200);
    expect(await answerResponse.json()).toMatchObject({
      batchId: missingInfoBatch.batchId,
      status: "running",
      jobs: [{
        batchJobId: missingInfoBatch.jobs[0].batchJobId,
        status: "preflight",
        attempt: 2,
        requiredFieldAnswers: [{ fieldId: "gender", value: "女" }]
      }]
    });
    const answeredClaimResponse = await fetch(`${base}/device-bridge/v1/devices/chrome-device-1/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-1" })
    });
    const answeredClaim = await answeredClaimResponse.json() as Record<string, any>;
    expect(answeredClaim.command.payload).toMatchObject({
      batchId: missingInfoBatch.batchId,
      batchJobId: missingInfoBatch.jobs[0].batchJobId,
      job: {
        requiredFieldAnswers: [{
          fieldId: "gender",
          stableFieldKey: "basic.gender.combobox",
          value: "女"
        }]
      }
    });
  });

  it("rejects expired execution but durably acknowledges its late completion without reviving the job", async () => {
    let currentTime = new Date("2026-08-26T02:00:00.000Z");
    const { app, queue, autoApply } = createApplicationGatewaySidecar({
      accessToken: "ai-token",
      autoApplySigningSecret: "test-auto-apply-signing-secret-that-is-long-enough",
      autoApplySweepIntervalMs: 0,
      now: () => currentTime
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");
    const base = `http://127.0.0.1:${address.port}/automation`;
    const aiHeaders = {
      Authorization: "Bearer ai-token",
      "X-Tenant-Id": "tenant-1",
      "X-User-Id": "user-1",
      "Content-Type": "application/json"
    };
    const bootstrapResponse = await fetch(`${base}/auto-apply/v1/device-bootstrap-sessions`, {
      method: "POST",
      headers: aiHeaders,
      body: "{}"
    });
    const bootstrap = await bootstrapResponse.json() as Record<string, any>;
    const exchangeResponse = await fetch(`${base}/device-bridge/v1/bootstrap:exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bootstrapToken: bootstrap.bootstrapToken,
        deviceId: "deadline-device",
        pluginInstalled: true,
        pluginVersion: MINIMUM_AUTO_APPLY_PLUGIN_VERSION,
        capabilities: ["batch_auto_apply.v1", "account_logout_fence.v1"]
      })
    });
    const exchange = await exchangeResponse.json() as Record<string, any>;
    const deviceHeaders = {
      Authorization: `Bearer ${exchange.deviceToken}`,
      "X-Tenant-Id": "tenant-1",
      "Content-Type": "application/json"
    };
    const createResponse = await fetch(`${base}/auto-apply/v1/batches`, {
      method: "POST",
      headers: { ...aiHeaders, "Idempotency-Key": "deadline-http-410" },
      body: JSON.stringify({
        schemaVersion: "auto-apply-batch-request.v1",
        deviceId: "deadline-device",
        candidate: {
          packageRef: "https://files.example.com/candidate.zcresume.json",
          packageVersion: "1",
          packageSha256: "a".repeat(64),
          applicationProfile: {
            schemaVersion: "candidate-application-profile.v1",
            revision: "c".repeat(64),
            facts: []
          }
        },
        assets: [{
          assetId: "resume-main",
          purpose: "resume",
          fileRef: "https://files.example.com/resume.pdf",
          name: "resume.pdf",
          mediaType: "application/pdf",
          sha256: "b".repeat(64)
        }],
        jobs: [{
          jobId: "deadline-job",
          companyName: "Deadline Test",
          title: "测试岗位",
          applicationUrl: "https://example.com/jobs/deadline/apply"
        }],
        confirmation: {
          scope: "batch",
          confirmedByUser: true,
          confirmedAt: currentTime.toISOString(),
          displayedJobIds: ["deadline-job"],
          allowAutomaticFinalSubmit: true
        }
      })
    });
    const deadlineCreateError = createResponse.status === 201 ? null : await createResponse.clone().json();
    expect(createResponse.status, JSON.stringify(deadlineCreateError)).toBe(201);
    const batch = await createResponse.json() as Record<string, any>;
    const claimResponse = await fetch(`${base}/device-bridge/v1/devices/deadline-device/commands/claim`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ userId: "user-1", leaseSeconds: 90 })
    });
    const claim = await claimResponse.json() as Record<string, any>;
    currentTime = new Date(String(claim.executionExpiresAt));

    const progressResponse = await fetch(`${base}/device-bridge/v1/commands/${claim.commandId}/progress`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        schemaVersion: "auto-apply-job-progress.v1",
        deviceId: "deadline-device",
        batchId: batch.batchId,
        batchJobId: batch.jobs[0].batchJobId,
        jobId: "deadline-job",
        sequence: 1,
        stage: "filling",
        message: "仍在执行",
        occurredAt: currentTime.toISOString()
      })
    });

    expect(progressResponse.status).toBe(410);
    expect(await progressResponse.json()).toMatchObject({
      schemaVersion: "device-bridge-error.v1",
      code: "DEVICE_COMMAND_EXPIRED",
      retryable: false
    });
    await autoApply.reconcileExpiredBatches();
    const expiredBatch = await autoApply.get(String(batch.batchId));
    expect(expiredBatch.jobs[0]).toMatchObject({ status: "failed", reasonCode: "task_execution_timeout" });
    const event = {
      schemaVersion: "ai-plugin-event.v1", type: "browser.batch_auto_apply_job_completed", status: "failed",
      payload: { autoApplyResult: {
        schemaVersion: "auto-apply-job-result.v1", batchId: batch.batchId, batchJobId: batch.jobs[0].batchJobId,
        jobId: "deadline-job", status: "failed", reasonCode: "control_interaction_failed", occurredAt: currentTime.toISOString(),
        evidence: { redacted: true, validationMessages: Array.from({ length: 40 }, (_, index) => `字段 ${index + 1} 为必填`) }
      } }
    };
    for (let retry = 0; retry < 2; retry += 1) {
      const late = await fetch(`${base}/device-bridge/v1/commands/${claim.commandId}/results`, {
        method: "POST", headers: deviceHeaders, body: JSON.stringify({ deviceId: "deadline-device", event })
      });
      expect(late.status).toBe(200);
      expect(await late.json()).toMatchObject({
        schemaVersion: "device-command-result-receipt.v1", accepted: true, commandId: claim.commandId,
        batchStatus: "completed_with_errors"
      });
    }
    const archived = await queue.get(String(claim.commandId));
    expect(archived).toMatchObject({ status: "expired", archivedCompletionEvent: event });
    expect(archived?.completionEvent).toBeUndefined();
    expect(await autoApply.get(String(batch.batchId))).toEqual(expiredBatch);
  });

  it("terminates owner A and lets owner B bind without inheriting A device authority", async () => {
    const { app } = createApplicationGatewaySidecar({
      accessToken: "ai-token",
      autoApplySigningSecret: "test-auto-apply-signing-secret-that-is-long-enough"
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");
    const base = `http://127.0.0.1:${address.port}/automation`;
    const ownerHeaders = (userId: string) => ({
      Authorization: "Bearer ai-token",
      "X-Tenant-Id": "tenant-1",
      "X-User-Id": userId,
      "Content-Type": "application/json"
    });

    const bind = async (userId: string, deviceId: string) => {
      const bootstrapResponse = await fetch(`${base}/auto-apply/v1/device-bootstrap-sessions`, {
        method: "POST",
        headers: ownerHeaders(userId),
        body: "{}"
      });
      expect(bootstrapResponse.status).toBe(201);
      const bootstrap = await bootstrapResponse.json() as Record<string, any>;
      const exchangeResponse = await fetch(`${base}/device-bridge/v1/bootstrap:exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken: bootstrap.bootstrapToken,
          deviceId,
          pluginInstalled: true,
          pluginVersion: "0.15.15",
          capabilities: ["batch_auto_apply.v1", "account_logout_fence.v1"]
        })
      });
      expect(exchangeResponse.status).toBe(201);
      return await exchangeResponse.json() as Record<string, any>;
    };

    const ownerA = await bind("user-a", "shared-device");
    const unusedBootstrapResponse = await fetch(`${base}/auto-apply/v1/device-bootstrap-sessions`, {
      method: "POST",
      headers: ownerHeaders("user-a"),
      body: "{}"
    });
    expect(unusedBootstrapResponse.status).toBe(201);

    const terminationResponse = await fetch(`${base}/auto-apply/v1/owner-session:terminate`, {
      method: "POST",
      headers: { ...ownerHeaders("user-a"), "Idempotency-Key": "logout-user-a" },
      body: "{}"
    });
    expect(terminationResponse.status).toBe(200);
    expect(await terminationResponse.json()).toEqual({
      schemaVersion: "auto-apply-owner-termination.v1",
      terminated: true,
      batchesCancelled: 0,
      commandsCancelled: 0,
      credentialsRevoked: 1,
      pairingSessionsRevoked: 0,
      bootstrapSessionsRevoked: 1,
      devicesRemoved: 1
    });

    const ownerAHeartbeat = await fetch(`${base}/device-bridge/v1/devices/shared-device/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerA.deviceToken}`,
        "X-Tenant-Id": "tenant-1",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pluginInstalled: true, pluginVersion: "0.15.15", capabilities: [] })
    });
    expect(ownerAHeartbeat.status).toBe(401);
    const ownerADevice = await fetch(`${base}/auto-apply/v1/devices/shared-device`, {
      headers: ownerHeaders("user-a")
    });
    expect(ownerADevice.status).toBe(404);

    const ownerB = await bind("user-b", "shared-device");
    expect(ownerB.userId).toBe("user-b");
    const ownerBDevice = await fetch(`${base}/auto-apply/v1/devices/shared-device`, {
      headers: ownerHeaders("user-b")
    });
    expect(ownerBDevice.status).toBe(200);
  });
});
