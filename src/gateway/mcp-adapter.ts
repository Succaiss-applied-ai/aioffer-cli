import { gatewayInfrastructureError } from "./infrastructure-error.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { toPublicError } from "../errors.js";
import {
  answerSubmissionSchema,
  applicationConfirmationSchema,
  applicationRunRequestSchema
} from "./application-contract.js";
import type { ApplicationGateway } from "./application-gateway.js";
import {
  DEFAULT_PLUGIN_DOWNLOAD_URL,
  DEFAULT_PLUGIN_ZIP_URL,
  DEFAULT_RUNTIME_ZIP_URL,
  RuntimeUnavailableError,
  deviceState,
  requireReadyDevice,
  type DeviceRegistry
} from "./device-registry.js";
import { GatewayRequestError } from "./gateway-errors.js";
import type { DevicePairingRegistry } from "./device-pairing.js";

function result(value: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {})
  };
}

async function invoke(operation: () => Promise<Record<string, unknown>>) {
  try {
    return result({ ok: true, ...(await operation()) });
  } catch (cause) {
    const error = gatewayInfrastructureError(cause) ?? cause;
    if (error instanceof RuntimeUnavailableError) {
      return result({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          userAction: error.userAction
        }
      }, true);
    }
    if (error instanceof GatewayRequestError) {
      return result({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable
        }
      }, true);
    }
    return result({ ok: false, error: toPublicError(error) }, true);
  }
}

export interface ApplicationGatewayMcpContext {
  tenantId: string;
  userId: string;
  devices?: DeviceRegistry;
  pairings?: DevicePairingRegistry;
}

/**
 * Thin AI-facing adapter. It intentionally exposes no browser.*, tabId,
 * selector, actionId, extension ID, or transport-specific concept.
 */
export function createApplicationGatewayMcpServer(
  gateway: ApplicationGateway,
  context?: ApplicationGatewayMcpContext
): McpServer {
  const server = new McpServer({
    name: "recruiting-application-gateway",
    version: "1.1.0-preview"
  });

  server.registerTool(
    "recruiting.start_application",
    {
      title: "开始指定岗位投递",
      description: "创建幂等投递任务。只负责已选岗位，不执行岗位检索，也不会跳过最终用户确认。",
      inputSchema: { request: applicationRunRequestSchema },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ request }) => invoke(async () => {
      if (context && (request.tenantId !== context.tenantId || request.userId !== context.userId)) {
        throw new Error("投递请求与当前鉴权用户不一致");
      }
      if (context?.devices) {
        await requireReadyDevice(
          context.devices,
          request.tenantId,
          request.userId,
          request.deviceId
        );
      }
      return { run: await gateway.start(request) };
    })
  );

  server.registerTool(
    "recruiting.get_runtime_status",
    {
      title: "查询当前用户的投递 Runtime 与插件状态",
      description: "在开始投递前调用。未安装或离线时返回标准安装/启动动作。",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false }
    },
    async () => invoke(async () => {
      if (!context?.devices) throw new Error("设备注册服务未启用");
      const items = (await context.devices.list(context.tenantId, context.userId)).map((device) => ({
        ...device,
        state: deviceState(device)
      }));
      return {
        runtime: {
          schemaVersion: "paired-device-list.v1",
          items,
          installation: {
            downloadPageUrl: DEFAULT_PLUGIN_DOWNLOAD_URL,
            packageUrl: DEFAULT_PLUGIN_ZIP_URL,
            pluginPackageUrl: DEFAULT_PLUGIN_ZIP_URL,
            runtimePackageUrl: DEFAULT_RUNTIME_ZIP_URL,
            pairingRequired: true
          }
        }
      };
    })
  );

  server.registerTool(
    "recruiting.create_device_pairing",
    {
      title: "为当前用户生成本地投递设备配对码",
      description: "Runtime 未注册时调用。返回十分钟内有效的一次性配对码；Device Token 由 Runtime 直接换取，AI 侧不会收到 Device Token。",
      inputSchema: {
        deviceName: z.string().min(1).max(120).optional(),
        expiresInSeconds: z.number().int().min(120).max(1800).default(600)
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ deviceName, expiresInSeconds }) => invoke(async () => {
      if (!context?.pairings) throw new Error("设备配对服务未启用");
      const created = await context.pairings.create({
        tenantId: context.tenantId,
        userId: context.userId,
        deviceName,
        expiresInSeconds
      });
      return {
        pairing: {
          schemaVersion: "device-pairing-instructions.v1",
          ...created,
          installation: {
            downloadPageUrl: DEFAULT_PLUGIN_DOWNLOAD_URL,
            pluginPackageUrl: DEFAULT_PLUGIN_ZIP_URL,
            runtimePackageUrl: DEFAULT_RUNTIME_ZIP_URL
          },
          security: {
            aiReceivesDeviceToken: false,
            pairingCodeOneTime: true,
            pairingCodeExpiresAt: created.session.expiresAt
          }
        }
      };
    })
  );

  server.registerTool(
    "recruiting.get_application_status",
    {
      title: "查询投递任务状态",
      inputSchema: {
        runId: z.string().uuid(),
        afterSequence: z.number().int().nonnegative().default(0)
      },
      annotations: { readOnlyHint: true, destructiveHint: false }
    },
    async ({ runId, afterSequence }) => invoke(async () => {
      const run = await gateway.get(runId);
      if (context && (run.request.tenantId !== context.tenantId || run.request.userId !== context.userId)) {
        throw new Error("投递任务不属于当前鉴权用户");
      }
      return { run, newEvents: await gateway.events(runId, afterSequence) };
    })
  );

  server.registerTool(
    "recruiting.continue_application",
    {
      title: "用户完成登录等动作后继续投递",
      inputSchema: { runId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ runId }) => invoke(async () => {
      const run = await gateway.get(runId);
      if (context && (run.request.tenantId !== context.tenantId || run.request.userId !== context.userId)) {
        throw new Error("投递任务不属于当前鉴权用户");
      }
      return { run: await gateway.continue(runId) };
    })
  );

  server.registerTool(
    "recruiting.provide_application_answers",
    {
      title: "补充投递表单缺失信息",
      description: "只接受当前任务明确请求的问题 ID；记忆行为由宿主私有档案服务处理。",
      inputSchema: {
        runId: z.string().uuid(),
        submission: answerSubmissionSchema
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ runId, submission }) => invoke(async () => {
      const run = await gateway.get(runId);
      if (context && (run.request.tenantId !== context.tenantId || run.request.userId !== context.userId)) {
        throw new Error("投递任务不属于当前鉴权用户");
      }
      return { run: await gateway.provideAnswers(runId, submission) };
    })
  );

  server.registerTool(
    "recruiting.confirm_application",
    {
      title: "用户确认最终内容后执行投递",
      description: "必须原样回传最新 confirmationId 和 reviewHash；页面内容变化后旧确认立即失效。",
      inputSchema: {
        runId: z.string().uuid(),
        confirmation: applicationConfirmationSchema
      },
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ runId, confirmation }) => invoke(async () => {
      const run = await gateway.get(runId);
      if (context && (run.request.tenantId !== context.tenantId || run.request.userId !== context.userId)) {
        throw new Error("投递任务不属于当前鉴权用户");
      }
      return { run: await gateway.confirm(runId, confirmation) };
    })
  );

  return server;
}
