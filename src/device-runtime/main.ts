import { GatewayDeviceClient } from "./gateway-device-client.js";
import {
  createLocalRpaRuntimeApp,
  LocalRpaRuntime
} from "./local-runtime.js";
import { resolveLocalRuntimeConfig, runtimeConfigPath } from "./runtime-config.js";

const host = process.env.RECRUITING_LOCAL_RPA_HOST ?? "127.0.0.1";
const port = Number(process.env.RECRUITING_LOCAL_RPA_PORT ?? 18194);
const configured = await resolveLocalRuntimeConfig();
const extensionId = configured.extensionId;
const client = new GatewayDeviceClient({
  baseUrl: configured.gatewayBaseUrl,
  deviceToken: configured.deviceToken,
  tenantId: configured.tenantId,
  userId: configured.userId,
  deviceId: configured.deviceId,
  leaseSeconds: 300
});
const runtime = new LocalRpaRuntime(client, {
  extensionId,
  deviceName: configured.deviceName,
  runtimeVersion: process.env.RECRUITING_RUNTIME_VERSION ?? "1.1.0",
  pluginInstalled: process.env.RECRUITING_PLUGIN_INSTALLED !== "false",
  pluginVersion: process.env.RECRUITING_PLUGIN_VERSION ?? "0.11.0",
  localToken: process.env.RECRUITING_LOCAL_BRIDGE_TOKEN
});
const app = createLocalRpaRuntimeApp(runtime, extensionId);
const server = app.listen(port, host, () => {
  runtime.start();
  console.log(`Local RPA Runtime: http://${host}:${port}/health`);
  console.log(`Chrome Bridge page: http://${host}:${port}/bridge`);
  console.log(`Extension ID: ${extensionId}`);
  console.log(`Device ID: ${configured.deviceId}`);
  console.log(`Credential file: ${runtimeConfigPath()}`);
});

const shutdown = () => {
  runtime.stop();
  server.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
