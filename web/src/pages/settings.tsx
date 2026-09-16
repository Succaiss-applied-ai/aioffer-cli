import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Form, Input, Select, Space, Tag, Typography } from "antd";
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

export function SettingsPage({ active, status, onStatusChange }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pairing, setPairing] = useState(false);
  const providerOptions = useMemo(() => Object.entries(status.providers).map(([value, item]) => ({ value, label: item.label })), [status.providers]);

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
  useEffect(() => { if (active) void loadDevices().catch((error) => message.error(String(error))); }, [active]);

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
      assertLocalPlugin(await bridge("RECRUITING_AI_PLUGIN_INFO"));
      const bootstrap = await api<Record<string, unknown>>("/api/bootstrap", {});
      await bridge("RECRUITING_DEVICE_BOOTSTRAP", bootstrap);
      await loadDevices();
      message.success("已连接本机插件");
    } finally { setPairing(false); }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="模型与解析服务">
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
          <Form.Item name="provider" label="模型厂商" rules={[{ required: true }]}>
            <Select options={providerOptions} onChange={(provider) => form.setFieldsValue({ baseUrl: status.providers[provider]?.baseUrl ?? "", apiKey: "" })} />
          </Form.Item>
          <Form.Item name="baseUrl" label="API 基础地址" rules={[{ required: true, type: "url" }]}><Input /></Form.Item>
          <Form.Item name="model" label="视觉模型 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="apiKey" label="模型 API Key" extra="已配置时留空可保留原 Key"><Input.Password autoComplete="off" /></Form.Item>
          <Form.Item name="mineruKey" label="MinerU API Key" extra="已配置时留空可保留原 Key"><Input.Password autoComplete="off" /></Form.Item>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saving}>保存配置</Button>
            <Button onClick={() => void testModel()} loading={testing}>测试视觉模型</Button>
          </Space>
        </Form>
      </Card>
      <Card title="Chrome 插件" extra={<Tag color={devices.length ? "success" : "warning"}>{devices.length ? "已连接" : "未连接"}</Tag>}>
        {devices.map((device) => (
          <Card key={device.deviceId} size="small" className="mb-3">
            <Typography.Text strong>{device.deviceName || device.deviceId}</Typography.Text>
            <div className="mt-1 text-sm text-slate-500">版本 {device.pluginVersion || "未知"} · {device.capabilities?.includes("aioffer.local-runtime.v1") ? "本地版" : "非本地版"}</div>
          </Card>
        ))}
        <Space wrap>
          <Button type="primary" onClick={() => void pair()} loading={pairing}>连接本机插件</Button>
          <Button onClick={() => void loadDevices().then(() => message.success("插件状态已刷新"))}>检查连接</Button>
        </Space>
        <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm">
          <Typography.Text type="secondary">扩展目录</Typography.Text>
          <div className="mt-1 break-all">{status.extensionPath}</div>
          <div className="mt-2"><CopyButton value={status.extensionPath} /></div>
        </div>
      </Card>
    </div>
  );
}
