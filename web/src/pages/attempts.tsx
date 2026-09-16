import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Alert, Button, Card, Checkbox, Drawer, Empty, Form, Input, Radio, Select, Space, Typography } from "antd";
import { finalReviewNotice } from "../../review-notice.js";
import { api } from "../api.js";
import { bridge } from "../bridge.js";
import { SafeExternalLink, StatusTag, statusLabels } from "../components.js";
import type { Attempt, AttemptFilter, AutoApplyBatch, AutoApplyJob, RequiredFieldRequest } from "../types.js";

interface Props {
  active: boolean;
  filter: AttemptFilter;
  onFilterChange: (filter: AttemptFilter) => void;
}

const finishedStatuses = new Set(["cancelled", "completed", "completed_with_errors", "failed"]);

function jobMessage(job: AutoApplyJob): string {
  return job.evidence?.diagnostic?.userMessage || job.evidence?.siteConfirmation || job.progress?.message || job.reasonCode || "";
}

function RequiredFieldsForm({ batchId, job, onDone }: { batchId: string; job: AutoApplyJob; onDone: () => Promise<void> }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const fields = job.evidence?.requiredFieldRequests ?? [];
  if (!fields.length) return <Alert type="warning" showIcon title="缺少可编辑的问题清单，请检查诊断记录" />;
  const submit = async (values: Record<string, string | string[]>) => {
    setLoading(true);
    try {
      await api(`/automation/auto-apply/v1/batches/${batchId}/jobs/${job.batchJobId}/required-field-answers`, {
        schemaVersion: "required-field-answers.v1",
        answers: fields.map((field) => ({
          fieldId: field.fieldId,
          stableFieldKey: field.stableFieldKey,
          value: values[field.fieldId],
          source: "user_confirmed",
          answeredAt: new Date().toISOString(),
        })),
      });
      message.success("补充资料已提交，任务将继续处理");
      await onDone();
    } finally { setLoading(false); }
  };
  return (
    <Form form={form} layout="vertical" onFinish={(values) => void submit(values).catch((error) => message.error(error instanceof Error ? error.message : String(error)))} className="mt-3">
      {fields.map((field) => (
        <Form.Item key={field.fieldId} name={field.fieldId} label={field.question || field.label} rules={[{ required: true, message: `请填写${field.label}` }]}>
          {field.options?.length ? (
            <Select mode={field.inputKind === "multi_select" || field.type === "checkbox" ? "multiple" : undefined} options={field.options.map((value) => ({ value, label: value }))} />
          ) : <Input />}
        </Form.Item>
      ))}
      <Button type="primary" htmlType="submit" loading={loading}>确认补充资料并继续</Button>
    </Form>
  );
}

function RetryAction({ attempt, batch, job, onDone }: { attempt: Attempt; batch: AutoApplyBatch; job: AutoApplyJob; onDone: () => Promise<void> }) {
  const { message } = App.useApp();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const retryKey = useRef(crypto.randomUUID());
  const retry = async () => {
    if (!checked) throw new Error("请先勾选此岗位的重试确认");
    setLoading(true);
    try {
      const next = await api<{ batchId?: string }>("/api/attempts", {
        idempotencyKey: retryKey.current,
        retryOf: attempt.id,
        mode: attempt.mode,
        deviceId: attempt.deviceId,
        versionId: attempt.versionId,
        jobIds: [job.jobId],
        confirmedByUser: true,
        allowAutomaticFinalSubmit: attempt.mode === "auto",
        allowConsentClick: batch.safety?.allowConsentClick === true,
      });
      await bridge("RECRUITING_AUTO_APPLY_WAKE", { deviceId: attempt.deviceId, batchId: next.batchId })
        .catch(() => message.warning("重试任务已保存在本机，等待插件领取；请勿重复创建"));
      message.success("已创建受保护的登录后重试");
      await onDone();
    } finally { setLoading(false); }
  };
  return (
    <div className="mt-3 rounded-lg bg-amber-50 p-3">
      <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)}>
        {attempt.mode === "auto" ? "我已完成登录，确认用原资料重试并重新授权自动最终提交" : "我已完成登录，确认用原资料重试；最终提交仍需另行确认"}
      </Checkbox>
      <div className="mt-2"><Button type="primary" loading={loading} onClick={() => void retry().catch((error) => message.error(String(error)))}>登录完成，重新尝试此岗位</Button></div>
    </div>
  );
}

export function AttemptsPage({ active, filter, onFilterChange }: Props) {
  const { message, modal } = App.useApp();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const snapshot = useRef("");
  const request = useRef(0);
  const [action, setAction] = useState("");
  const [drawer, setDrawer] = useState<{ batch: AutoApplyBatch; job: AutoApplyJob } | null>(null);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    const items = await api<Attempt[]>("/api/attempts");
    if (current !== request.current) return;
    const nextSnapshot = JSON.stringify(items);
    if (nextSnapshot === snapshot.current) return;
    snapshot.current = nextSnapshot;
    setAttempts(items);
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh().catch((error) => message.error(String(error)));
    const timer = window.setInterval(() => {
      const root = document.querySelector("[data-attempts-root]");
      if (!document.hidden && !(root && root.contains(document.activeElement))) void refresh().catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const runAction = async (key: string, path: string, body: unknown = {}) => {
    setAction(key);
    try { await api(path, body); await refresh(); }
    finally { setAction(""); }
  };

  const confirmStop = (batch: AutoApplyBatch) => modal.confirm({
    title: "停止当前批次？",
    content: "停止会终止后续执行权限，但不能撤回已经提交的网站申请。",
    okText: "确认停止",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: () => runAction(`cancel:${batch.batchId}`, `/automation/auto-apply/v1/batches/${batch.batchId}/cancel`).catch((error) => {
      message.error(error instanceof Error ? error.message : String(error));
      throw error;
    }),
  });
  const confirmFinalSubmit = (batch: AutoApplyBatch, job: AutoApplyJob) => modal.confirm({
    title: "确认最终投递？",
    content: finalReviewNotice(job),
    okText: "已核对，确认提交",
    cancelText: "返回检查",
    onOk: () => runAction(`confirm:${job.batchJobId}`, `/api/batches/${batch.batchId}/jobs/${job.batchJobId}/confirm`, {
      confirmedByUser: true,
      reviewHash: job.evidence?.failureDetails?.reviewHash,
    }).catch((error) => {
      message.error(error instanceof Error ? error.message : String(error));
      throw error;
    }),
  });

  const visibleAttempts = useMemo(() => [...attempts].reverse().filter((attempt) => {
    const status = attempt.batch?.status;
    if (filter === "all") return true;
    if (filter === "waiting") return attempt.batch?.jobs.some((job) => job.status === "waiting_for_user_action");
    if (filter === "finished") return Boolean(status && finishedStatuses.has(status));
    return Boolean(status && !finishedStatuses.has(status));
  }), [attempts, filter]);

  return (
    <div data-attempts-root>
      <Radio.Group value={filter} onChange={(event) => onFilterChange(event.target.value)} optionType="button" buttonStyle="solid" options={[
        { label: `全部 ${attempts.length}`, value: "all" },
        { label: "运行中", value: "active" },
        { label: "等待处理", value: "waiting" },
        { label: "已结束", value: "finished" },
      ]} />
      <Button className="ml-2" onClick={() => void refresh().then(() => message.success("记录已刷新")).catch((error) => message.error(error instanceof Error ? error.message : String(error)))}>刷新</Button>
      <div className="mt-4 space-y-4">
        {visibleAttempts.map((attempt) => {
          const batch = attempt.batch;
          return (
            <Card key={attempt.id} title={`${attempt.mode === "auto" ? "自动" : "半自动"} · ${new Date(attempt.createdAt).toLocaleString("zh-CN")}`} extra={batch && <StatusTag status={batch.status} />}>
              {!batch ? <Alert type="warning" showIcon title="任务创建结果不明确" description="已阻止重复投递，请保留本地数据检查。" /> : <>
                <Space wrap className="mb-4">
                  {["running", "queued"].includes(batch.status) && <Button loading={action === `pause:${batch.batchId}`} onClick={() => void runAction(`pause:${batch.batchId}`, `/automation/auto-apply/v1/batches/${batch.batchId}/pause`).catch((error) => message.error(String(error)))}>暂停批次</Button>}
                  {batch.status === "paused" && batch.pauseReason === "user_requested" && <Button type="primary" loading={action === `resume:${batch.batchId}`} onClick={() => void runAction(`resume:${batch.batchId}`, `/automation/auto-apply/v1/batches/${batch.batchId}/resume`).catch((error) => message.error(String(error)))}>恢复批次</Button>}
                  {!finishedStatuses.has(batch.status) && <Button danger loading={action === `cancel:${batch.batchId}`} onClick={() => confirmStop(batch)}>停止批次</Button>}
                </Space>
                <div className="space-y-3">{batch.jobs.map((job) => {
                  const jobPath = `/automation/auto-apply/v1/batches/${batch.batchId}/jobs/${job.batchJobId}`;
                  return (
                    <div key={job.batchJobId} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div><Typography.Text strong>{job.companyName} · {job.title}</Typography.Text><div className="mt-1 text-sm text-slate-500">{statusLabels[job.status] || job.status} · {jobMessage(job)}</div></div><Space><StatusTag status={job.status} /><Button size="small" onClick={() => setDrawer({ batch, job })}>任务详情</Button></Space></div>
                      {(job.evidence?.pageUrl || job.applicationUrl) && <div className="mt-2"><SafeExternalLink href={job.evidence?.pageUrl || job.applicationUrl}>打开招聘页面</SafeExternalLink></div>}
                      {attempt.retryableLoginJobIds?.includes(job.jobId) && <RetryAction attempt={attempt} batch={batch} job={job} onDone={refresh} />}
                      {job.status === "waiting_for_user_action" && job.reasonCode === "final_review_required" && (
                        <Alert className="mt-3" type="warning" showIcon title="提交前需要你核对原招聘页面" description={<><p>{finalReviewNotice(job)}</p><Button type="primary" loading={action === `confirm:${job.batchJobId}`} onClick={() => confirmFinalSubmit(batch, job)}>已核对原页面，确认最终投递</Button></>} />
                      )}
                      {job.status === "waiting_for_user_action" && job.reasonCode === "missing_information" && <RequiredFieldsForm key={`${job.batchJobId}:${job.evidence?.requiredFieldRequests?.map((field) => field.fieldId).join(",")}`} batchId={batch.batchId} job={job} onDone={refresh} />}
                      {job.status === "waiting_for_user_action" && !["final_review_required", "missing_information"].includes(job.reasonCode ?? "") && (
                        <Alert className="mt-3" type="info" showIcon title="请在第三方招聘页面完成登录或验证" description={<Button type="primary" loading={action === `continue:${job.batchJobId}`} onClick={() => void runAction(`continue:${job.batchJobId}`, `${jobPath}/resume`).catch((error) => message.error(String(error)))}>我已处理，继续</Button>} />
                      )}
                    </div>
                  );
                })}</div>
              </>}
            </Card>
          );
        })}
        {!visibleAttempts.length && <Card><Empty description="没有符合当前筛选的投递记录" /></Card>}
      </div>
      <Drawer title="任务详情" open={Boolean(drawer)} onClose={() => setDrawer(null)}>
        {drawer && <>
          <Typography.Title level={5}>{drawer.job.companyName} · {drawer.job.title}</Typography.Title>
          <StatusTag status={drawer.job.status} />
          <Typography.Paragraph className="!mt-4">{jobMessage(drawer.job) || "暂无更多诊断信息"}</Typography.Paragraph>
          {drawer.job.progress && <Card size="small" title="当前进度">{drawer.job.progress.message}</Card>}
          {(drawer.job.evidence?.pageUrl || drawer.job.applicationUrl) && <div className="mt-4"><SafeExternalLink href={drawer.job.evidence?.pageUrl || drawer.job.applicationUrl}>打开第三方招聘页面</SafeExternalLink></div>}
        </>}
      </Drawer>
    </div>
  );
}
