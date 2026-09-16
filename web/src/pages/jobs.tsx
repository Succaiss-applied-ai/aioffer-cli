import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Card, Checkbox, Empty, Form, Input, Modal, Pagination, Radio, Select, Space, Tag, Typography } from "antd";
import { api } from "../api.js";
import { bridge } from "../bridge.js";
import { SafeExternalLink } from "../components.js";
import type { AttemptMode, JobsResponse, LocalDevice, LocalJob, PreviewRequest, PreviewResponse, ResumeVersion } from "../types.js";

interface PreviewState {
  request: PreviewRequest & { idempotencyKey: string; confirmedByUser: true };
  response: PreviewResponse;
}

export function JobsPage({ active }: { active: boolean }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [capability, setCapability] = useState("actionable");
  const [displayed, setDisplayed] = useState({ query: "", city: "", capability: "actionable" });
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<JobsResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, LocalJob>>(new Map());
  const [mode, setMode] = useState<AttemptMode>("assisted");
  const [deviceId, setDeviceId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [allowConsentClick, setAllowConsentClick] = useState(false);
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const previewRef = useRef<PreviewState | null>(null);
  const previewRevision = useRef(0);
  const searchRequest = useRef(0);
  const [submitConsent, setSubmitConsent] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);

  const storePreview = (value: PreviewState | null) => {
    previewRef.current = value;
    setPreview(value);
    if (!value) setSubmitConsent(false);
  };
  const invalidatePreview = () => { previewRevision.current += 1; storePreview(null); };

  const search = useCallback(async (requestedOffset = offset) => {
    const request = ++searchRequest.current;
    const current = { query, city, capability };
    if (current.query !== displayed.query || current.city !== displayed.city || current.capability !== displayed.capability) requestedOffset = 0;
    setSearching(true);
    try {
      const data = await api<JobsResponse>(`/api/jobs?q=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}&offset=${requestedOffset}&capability=${encodeURIComponent(capability)}`);
      if (request !== searchRequest.current) return;
      setOffset(requestedOffset);
      setDisplayed(current);
      setResult(data);
    } catch (error) {
      if (request === searchRequest.current) throw error;
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }, [capability, city, displayed, offset, query]);

  useEffect(() => {
    if (!active) return;
    if (!result) void search(0).catch((error) => message.error(String(error)));
    if (!devices.length) void Promise.all([
      api<LocalDevice[]>("/api/devices"), api<ResumeVersion[]>("/api/resumes"),
    ]).then(([nextDevices, nextVersions]) => {
      setDevices(nextDevices);
      setVersions(nextVersions);
      setDeviceId((current) => current || nextDevices.find((device) => device.capabilities?.includes("aioffer.local-runtime.v1"))?.deviceId || "");
      setVersionId((current) => current || [...nextVersions].reverse().find((version) => version.confirmedAt)?.id || "");
    }).catch((error) => message.error(String(error)));
  }, [active, devices.length, result, search]);

  const updateSelected = (job: LocalJob, checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(job.jobId, job); else next.delete(job.jobId);
      return next;
    });
    invalidatePreview();
  };

  const updateDraft = (action: () => void) => { action(); invalidatePreview(); };

  const requestPreview = async () => {
    const jobs = [...selected.values()];
    if (!jobs.length) throw new Error("请至少选择一个岗位");
    if (!deviceId) throw new Error("请先在设置中连接本机插件");
    if (!versionId) throw new Error("请先确认简历资料");
    if (mode === "assisted" && jobs.length !== 1) throw new Error("半自动模式每次选择一个岗位");
    if (jobs.some((job) => !(job.capability?.allowedModes ?? []).includes(mode))) throw new Error(`所选岗位不支持${mode === "auto" ? "自动" : "半自动"}模式`);
    const revision = previewRevision.current;
    const body: PreviewRequest = { versionId, deviceId, mode, jobIds: jobs.map((job) => job.jobId), allowAutomaticFinalSubmit: mode === "auto", allowConsentClick };
    setPreviewing(true);
    try {
      const response = await api<PreviewResponse>("/api/preview", body);
      if (revision !== previewRevision.current) return;
      storePreview({ request: { ...body, idempotencyKey: crypto.randomUUID(), confirmedByUser: true }, response });
    } finally { setPreviewing(false); }
  };

  const createAttempt = async () => {
    const submitted = previewRef.current;
    if (!submitted || !submitConsent) throw new Error("请先核对并勾选本次投递确认");
    setCreating(true);
    try {
      const created = await api<{ batchId?: string }>("/api/attempts", submitted.request);
      await bridge("RECRUITING_AUTO_APPLY_WAKE", { deviceId: submitted.request.deviceId, batchId: created.batchId })
        .catch((error) => message.warning(`任务已保存；${error instanceof Error ? error.message : "插件唤醒失败"}。不要重复创建。`));
      if (previewRef.current === submitted) {
        storePreview(null);
        setSelected(new Map());
      }
      message.success("任务已创建，等待本机插件处理");
    } finally { setCreating(false); }
  };

  const summary = useMemo(() => {
    if (!result?.capabilityCounts) return "";
    const counts = result.capabilityCounts, companies = result.companyCounts;
    return `快照 ${result.exportedAt?.slice(0, 10)} · 企业 ${companies?.total ?? "—"} 家（自动 ${companies?.auto ?? "—"} / 半自动 ${companies?.assisted ?? "—"}，两类重叠 ${companies?.mixed ?? "—"}） · 岗位：自动 ${counts.auto} / 半自动 ${counts.assisted} · 登录未知 ${counts.unverified} · 暂不可用 ${counts.unavailable}`;
  }, [result]);

  return (
    <>
      <Card>
        <Form layout="inline" onFinish={() => void search(0).catch((error) => message.error(String(error)))}>
          <Form.Item label="投递能力"><Select className="w-56" value={capability} onChange={(value) => updateDraft(() => setCapability(value))} options={[
            { value: "actionable", label: "自动 / 半自动投递" }, { value: "auto", label: "自动投递（免登录）" },
            { value: "assisted", label: "半自动投递（需本人登录）" }, { value: "unverified", label: "登录要求未知" },
            { value: "unavailable", label: "暂不可投递" }, { value: "all", label: "全部岗位" },
          ]} /></Form.Item>
          <Form.Item><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="岗位 / 公司 / 技能" allowClear /></Form.Item>
          <Form.Item><Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="城市" allowClear /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={searching}>搜索</Button></Form.Item>
        </Form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm"><Typography.Text>{result ? `找到 ${result.total} 个岗位` : "正在加载岗位"}</Typography.Text><Tag color="blue">已选 {selected.size} 个</Tag></div>
        {summary && <Typography.Paragraph type="secondary" className="!mb-0 !mt-2 text-xs">{summary}</Typography.Paragraph>}
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {result?.items.map((job) => {
          const eligible = Boolean(job.capability?.allowedModes?.length);
          return (
            <Card key={job.jobId} className={selected.has(job.jobId) ? "border-blue-500 bg-blue-50" : ""}>
              <div className="flex items-start gap-3">
                <Checkbox checked={selected.has(job.jobId)} disabled={!eligible} onChange={(event) => updateSelected(job, event.target.checked)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><Typography.Text strong>{job.companyName} · {job.title}</Typography.Text><Tag color={eligible ? "blue" : "default"}>{job.capability?.label || "能力待验证"}</Tag></div>
                  <div className="mt-2 text-sm text-slate-500">{job.locations.join("、")} {job.salary}</div>
                  <div className="mt-2 text-xs text-slate-500">{job.capability?.reason || "缺少能力证据，不能发起任务"}</div>
                  {job.loginRequirement?.verifiedAt && <div className="mt-1 text-xs text-slate-500">登录要求：{job.loginRequirement.status === "not_required" ? "免登录" : job.loginRequirement.status === "required" ? "需要本人登录" : "未知"} · 核验日期 {job.loginRequirement.verifiedAt.slice(0, 10)}</div>}
                  {job.deliveryEvidence?.successfulOn && <div className="mt-1 text-xs text-slate-500">来源系统曾成功：{job.deliveryEvidence.successfulOn} · 本 CLI 尚未逐岗复验</div>}
                  <Typography.Paragraph ellipsis={{ rows: 3, expandable: true }} className="!my-3 text-sm">{job.description}</Typography.Paragraph>
                  <SafeExternalLink href={job.applicationUrl}>查看企业投递页面</SafeExternalLink>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {!searching && result?.items.length === 0 && <Card className="mt-4"><Empty description="没有符合条件的岗位" /></Card>}
      {result && result.total > 0 && <div className="mt-5 flex justify-center"><Pagination current={Math.floor(offset / 30) + 1} pageSize={30} total={result.total} showSizeChanger={false} disabled={searching} onChange={(page) => void search((page - 1) * 30).catch((error) => message.error(String(error)))} /></div>}

      {active && selected.size > 0 && (
        <div className="fixed bottom-0 left-[200px] right-0 z-30 border-t border-slate-200 bg-white/95 px-6 py-3 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Space wrap>
              <Typography.Text strong>已选择 {selected.size} 个岗位</Typography.Text>
              <Select value={versionId || undefined} placeholder="资料版本" className="w-56" onChange={(value) => updateDraft(() => setVersionId(value))} options={[...versions].reverse().filter((item) => item.confirmedAt).map((item) => ({ value: item.id, label: item.assets[0]?.name || "简历" }))} />
              <Select value={deviceId || undefined} placeholder="执行设备" className="w-52" onChange={(value) => updateDraft(() => setDeviceId(value))} options={devices.filter((item) => item.capabilities?.includes("aioffer.local-runtime.v1")).map((item) => ({ value: item.deviceId, label: item.deviceName || item.deviceId }))} />
              <Radio.Group value={mode} onChange={(event) => updateDraft(() => setMode(event.target.value))} options={[{ label: "半自动", value: "assisted" }, { label: "自动", value: "auto" }]} optionType="button" />
              <Checkbox checked={allowConsentClick} onChange={(event) => updateDraft(() => setAllowConsentClick(event.target.checked))}>允许点击网站协议</Checkbox>
            </Space>
            <Space><Button onClick={() => { setSelected(new Map()); invalidatePreview(); }}>清空</Button><Button type="primary" loading={previewing} onClick={() => void requestPreview().catch((error) => message.error(String(error)))}>核对本次投递</Button></Space>
          </div>
        </div>
      )}

      <Modal title="核对本次投递" open={Boolean(preview)} onCancel={() => storePreview(null)} onOk={() => void createAttempt().catch((error) => message.error(String(error)))} okText="确认并开始" confirmLoading={creating} okButtonProps={{ disabled: !submitConsent }}>
        {preview && <>
          <Typography.Paragraph><strong>{preview.request.mode === "auto" ? "自动" : "半自动"}</strong> · {preview.response.resumeName || "已确认资料"}</Typography.Paragraph>
          {preview.response.jobs.map((job) => <Card key={job.jobId} size="small" className="mb-2"><strong>{job.companyName} / {job.title}</strong><div className="mt-1 text-xs text-slate-500">{job.capability?.label || "能力待验证"}：{job.capability?.reason || "缺少能力证据"}</div></Card>)}
          <Checkbox checked={submitConsent} onChange={(event) => setSubmitConsent(event.target.checked)}>
            我已核对岗位与资料，确认发起以上任务；自动模式同时授权最终提交
          </Checkbox>
        </>}
      </Modal>
    </>
  );
}
