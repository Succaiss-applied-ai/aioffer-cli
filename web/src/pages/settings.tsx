import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Form, Input, Select, Space, Tag, Typography } from "antd";
import { assertLocalPlugin } from "../../plugin-compatibility.js";
import { api } from "../api.js";
import { bridge } from "../bridge.js";
import { CopyButton } from "../components.js";
import type { LocalDevice, LocalStatus } from "../types.js";

interface Props {
  active: boolean;
  status: LocalStatus;
  onStatusChange: (status: LocalStatus) => void;
}

const pluginGuideUrl = "https://cloud.succaiss.com/plugins/recruiting/";
const pluginBridgeReady = () => document.documentElement.dataset.recruitingAiBridge === "ready";

export function SettingsPage({ active, status, onStatusChange }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(pluginBridgeReady);
  const providerOptions = useMemo(() => Object.entries(status.providers).map(([value, item]) => ({ value, label: item.label })), [status.providers]);
  const localPluginConnected = devices.some((device) => device.capabilities?.includes("aioffer.local-runtime.v1"));
  const pluginStatus = !bridgeReady ? { color: "warning", label: "未检测到" } : localPluginConnected ? { color: "success", label: "已连接" } : { color: "processing", label: "待连接" };
  const showError = (error: unknown) => message.error(error instanceof Error ? error.message : String(error));

  const loadDevices = async () => setDevices(await api<LocalDevice[]>("/api/devices"));
  useEffect(() => {
    form.setFieldsValue({
      provider: status.model?.provider ?? "qwen",
      baseUrl: status.model?.baseUrl ?? status.providers.qwen?.baseUrl ?? "",
      model: status.model?.model ?? "",
      apiKey: "",
      mineruKey: "",
    });
  }, [form, status]);
  useEffect(() => {
    if (!active) return;
    setBridgeReady(pluginBridgeReady());
    void loadDevices().catch((error) => message.error(String(error)));
  }, [active]);

  const save = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      await api("/api/config", {
        model: { provider: values.provider, baseUrl: values.baseUrl, model: values.model, apiKey: values.apiKey },
        mineruKey: values.mineruKey,
      });
      form.setFieldsValue({ apiKey: "", mineruKey: "" });
      const next = await api<LocalStatus>("/api/status");
      onStatusChange(next);
      message.success("配置已保存到本机");
    } finally { setSaving(false); }
  };

  const testModel = async () => {
    setTesting(true);
    try {
      const result = await api<{ message: string }>("/api/model/test", {});
      message.success(result.message);
    } finally { setTesting(false); }
  };

  const pair = async () => {
    setPairing(true);
    try {
      if (!pluginBridgeReady()) {
        setBridgeReady(false);
        window.open(pluginGuideUrl, "_blank", "noopener,noreferrer");
        message.info("已打开插件安装指引，安装后请刷新本页面");
        return;
      }
      assertLocalPlugin(await bridge("RECRUITING_AI_PLUGIN_INFO"));
      setBridgeReady(true);
      const bootstrap = await api<Record<string, unknown>>("/api/bootstrap", {});
      await bridge("RECRUITING_DEVICE_BOOTSTRAP", bootstrap);
      await loadDevices();
      message.success("已连接本机插件");
    } finally { setPairing(false); }
  };

  const checkPlugin = async () => {
    const detected = pluginBridgeReady();
    setBridgeReady(detected);
    if (!detected) {
      message.warning("仍未检测到插件，请完成安装或启用后刷新本页面");
      return;
    }
    assertLocalPlugin(await bridge("RECRUITING_AI_PLUGIN_INFO"));
    await loadDevices();
    message.success("插件与本地设备状态已刷新");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="模型与解析服务">
        <Form form={form} layout="vertical" onFinish={(values) => void save(values).catch(showError)}>
          <Form.Item name="provider" label="模型厂商" rules={[{ required: true }]}>
            <Select options={providerOptions} onChange={(provider) => form.setFieldsValue({ baseUrl: status.providers[provider]?.baseUrl ?? "", apiKey: "" })} />
          </Form.Item>
          <Form.Item name="baseUrl" label="API 基础地址" rules={[{ required: true, type: "url" }]}><Input /></Form.Item>
          <Form.Item name="model" label="视觉模型 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="apiKey" label="模型 API Key" extra="已配置时留空可保留原 Key"><Input.Password autoComplete="off" /></Form.Item>
          <Form.Item name="mineruKey" label="MinerU API Key" extra="已配置时留空可保留原 Key"><Input.Password autoComplete="off" /></Form.Item>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saving}>保存配置</Button>
            <Button onClick={() => void testModel().catch(showError)} loading={testing}>测试视觉模型</Button>
          </Space>
        </Form>
      </Card>
      <Card className="min-w-0" title="Chrome 插件" extra={<Tag color={pluginStatus.color}>{pluginStatus.label}</Tag>}>
        {!bridgeReady && <Alert className="mb-4" type="warning" showIcon title="未检测到 Chrome 插件" description="请先安装或启用 aioffer-cli 本地投递助手，安装完成后刷新本页面。" />}
        {devices.map((device) => (
          <Card key={device.deviceId} size="small" className="mb-3">
            <Typography.Text strong>{device.deviceName || device.deviceId}</Typography.Text>
            <div className="mt-1 text-sm text-slate-500">版本 {device.pluginVersion || "未知"} · {device.capabilities?.includes("aioffer.local-runtime.v1") ? "本地版" : "非本地版"}</div>
          </Card>
        ))}
        <Space wrap>
          {bridgeReady
            ? <Button type="primary" onClick={() => void pair().catch(showError)} loading={pairing}>连接本机插件</Button>
            : <Button type="primary" href={pluginGuideUrl} target="_blank" rel="noopener noreferrer">打开安装指引</Button>}
          <Button onClick={() => void checkPlugin().catch(showError)}>{bridgeReady ? "检查连接" : "重新检测"}</Button>
        </Space>
        <div className="mt-5 min-w-0 rounded-lg bg-slate-50 p-3 text-sm">
          <Typography.Text type="secondary">扩展目录</Typography.Text>
          <div className="mt-1 min-w-0 break-all font-mono text-xs leading-5">{status.extensionPath}</div>
          <div className="mt-2"><CopyButton value={status.extensionPath} /></div>
        </div>
      </Card>
    </div>
  );
}
