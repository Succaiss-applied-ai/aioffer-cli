import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Card, Col, Empty, Progress, Row, Space, Statistic, Tag, Typography } from "antd";
import { api } from "../api.js";
import { StatusTag, statusLabels } from "../components.js";
import type { Attempt, LocalDevice, PageKey, ResumeVersion, AttemptFilter } from "../types.js";

const finished = new Set(["cancelled", "completed", "completed_with_errors", "failed"]);

export function DashboardPage({ active, navigate }: { active: boolean; navigate: (page: PageKey, filter?: AttemptFilter) => void }) {
  const { message } = App.useApp();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const load = useCallback(async () => {
    const [nextAttempts, nextDevices, nextVersions] = await Promise.all([
      api<Attempt[]>("/api/attempts"), api<LocalDevice[]>("/api/devices"), api<ResumeVersion[]>("/api/resumes"),
    ]);
    setAttempts(nextAttempts); setDevices(nextDevices); setVersions(nextVersions);
  }, []);
  useEffect(() => {
    if (!active) return;
    void load().catch((error) => message.error(String(error)));
    const timer = window.setInterval(() => { if (!document.hidden) void load().catch(() => undefined); }, 10_000);
    return () => clearInterval(timer);
  }, [active, load]);

  const summary = useMemo(() => {
    const batches = attempts.map((attempt) => attempt.batch).filter(Boolean);
    return {
      active: batches.filter((batch) => batch && !finished.has(batch.status)).length,
      waiting: batches.reduce((count, batch) => count + (batch?.jobs.filter((job) => job.status === "waiting_for_user_action").length ?? 0), 0),
      today: batches.filter((batch) => batch?.updatedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10) && batch && finished.has(batch.status)).length,
    };
  }, [attempts]);
  const current = [...attempts].reverse().find((attempt) => attempt.batch && !finished.has(attempt.batch.status));
  const confirmed = [...versions].reverse().find((version) => version.confirmedAt);
  const device = devices.find((item) => item.capabilities?.includes("aioffer.local-runtime.v1"));
  const currentJob = current?.batch?.jobs.find((job) => !finished.has(job.status)) ?? current?.batch?.jobs[0];

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><Card hoverable onClick={() => navigate("attempts", "active")}><Statistic title="正在执行" value={summary.active} /><Typography.Link>查看当前任务 →</Typography.Link></Card></Col>
        <Col xs={24} md={8}><Card hoverable onClick={() => navigate("attempts", "waiting")}><Statistic title="等待你处理" value={summary.waiting} valueStyle={{ color: "#d97706" }} /><Typography.Link>登录或补充信息 →</Typography.Link></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title="今日完成" value={summary.today} valueStyle={{ color: "#059669" }} /><Typography.Text type="secondary">仅以网站回执为准</Typography.Text></Card></Col>
      </Row>
      <Row gutter={[20, 20]} className="mt-5">
        <Col xs={24} xl={10}>
          <Card title="开始新的投递" extra={<Tag color="blue">半自动推荐</Tag>}>
            <Space direction="vertical" className="w-full" size="middle">
              <Card size="small" hoverable onClick={() => navigate("resumes")}><Typography.Text type="secondary">资料版本</Typography.Text><div><strong>{confirmed?.assets[0]?.name || "请先确认简历资料"}</strong></div><Tag color={confirmed ? "success" : "warning"}>{confirmed ? "已确认" : "未准备"}</Tag></Card>
              <Card size="small" hoverable onClick={() => navigate("settings")}><Typography.Text type="secondary">执行设备</Typography.Text><div><strong>{device?.deviceName || "请先连接本机插件"}</strong></div><Tag color={device ? "success" : "warning"}>{device ? "在线" : "未连接"}</Tag></Card>
              <Button type="primary" block size="large" disabled={!confirmed || !device} onClick={() => navigate("jobs")}>搜索并选择岗位</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="当前任务" extra={<Button type="link" onClick={() => navigate("attempts", "active")}>查看全部</Button>}>
            {current?.batch && currentJob ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><Typography.Text strong>{currentJob.companyName} · {currentJob.title}</Typography.Text><div className="mt-1 text-sm text-blue-700">{statusLabels[currentJob.status] || currentJob.status} · {currentJob.progress?.message || currentJob.evidence?.siteConfirmation || currentJob.reasonCode || "正在处理"}</div></div><StatusTag status={currentJob.status} /></div>
                <Progress className="mt-4" percent={currentJob.status === "submitting" ? 85 : currentJob.status === "filling" ? 60 : 35} showInfo={false} />
                <Button className="mt-3" onClick={() => navigate("attempts", "active")}>查看任务详情</Button>
              </div>
            ) : <Empty description="当前没有运行中的任务" />}
          </Card>
        </Col>
      </Row>
    </>
  );
}
