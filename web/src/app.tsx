import { useCallback, useEffect, useState } from "react";
import { App as AntdApp, Button, Layout, Menu, Result, Spin, Tag, Typography } from "antd";
import { api } from "./api.js";
import { BrandLink } from "./components.js";
import type { AttemptFilter, LocalStatus, PageKey } from "./types.js";
import { DashboardPage } from "./pages/dashboard.js";
import { ResumesPage } from "./pages/resumes.js";
import { JobsPage } from "./pages/jobs.js";
import { AttemptsPage } from "./pages/attempts.js";
import { SettingsPage } from "./pages/settings.js";

const pageCopy: Record<PageKey, [string, string]> = {
  dashboard: ["投递工作台", "掌握任务状态，快速开始下一次投递"],
  resumes: ["简历资料", "上传、核对并管理不可变资料版本"],
  jobs: ["岗位搜索", "从本地快照筛选并选择目标岗位"],
  attempts: ["投递记录", "查看进度、处理人工接管和确认回执"],
  settings: ["设置", "配置模型、MinerU 与本地插件"],
};

export function WorkbenchApp() {
  const { message } = AntdApp.useApp();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [visited, setVisited] = useState<Set<PageKey>>(() => new Set(["dashboard"]));
  const [attemptFilter, setAttemptFilter] = useState<AttemptFilter>("all");
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api<LocalStatus>("/api/status"));
      setStatusError("");
      return true;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "无法连接本地服务");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const navigate = useCallback((next: PageKey, filter?: AttemptFilter) => {
    if (filter) setAttemptFilter(filter);
    setVisited((current) => current.has(next) ? current : new Set(current).add(next));
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Spin size="large" description="正在连接本地服务" /></div>;
  }

  if (!status) {
    return (
      <Result
        status="error"
        title="无法进入本地工作台"
        subTitle={statusError || "请使用终端显示的私密链接打开页面"}
        extra={<Button type="primary" onClick={() => void loadStatus()}>重新连接</Button>}
      />
    );
  }

  const [title, subtitle] = pageCopy[page];
  return (
    <Layout className="min-h-screen">
      <Layout.Sider
        breakpoint="lg"
        collapsedWidth={72}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className="workbench-sider"
      >
        <div className="px-5 py-5 text-xl font-bold text-white">
          <BrandLink suffix={collapsed ? "" : "-cli"} />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[page]}
          onClick={({ key }) => navigate(key as PageKey)}
          items={[
            { key: "dashboard", label: "工作台" },
            { key: "resumes", label: "简历资料" },
            { key: "jobs", label: "岗位搜索" },
            { key: "attempts", label: "投递记录" },
            { key: "settings", label: "设置" },
          ]}
        />
        {!collapsed && (
          <div className="absolute inset-x-3 bottom-14 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
            <div className="text-emerald-300">● 本机服务正常</div>
            <div className="mt-1">数据保存在本机</div>
          </div>
        )}
      </Layout.Sider>
      <Layout className={collapsed ? "ml-[72px]" : "ml-[200px]"}>
        <Layout.Header className="workbench-header flex items-center justify-between">
          <div>
            <Typography.Title level={4} className="!mb-0">{title}</Typography.Title>
            <Typography.Text type="secondary" className="text-xs">{subtitle}</Typography.Text>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Tag color={status.model ? "success" : "warning"}>模型{status.model ? "已配置" : "未配置"}</Tag>
            <Tag color={status.mineruConfigured ? "success" : "warning"}>MinerU {status.mineruConfigured ? "已配置" : "未配置"}</Tag>
            <Button size="small" onClick={() => void loadStatus().then((ok) => ok ? message.success("状态已刷新") : message.error("状态刷新失败，请检查本地服务"))}>刷新</Button>
          </div>
        </Layout.Header>
        <Layout.Content className="min-h-[calc(100vh-64px)] bg-slate-100 p-4 md:p-6">
          {visited.has("dashboard") && <div hidden={page !== "dashboard"}><DashboardPage active={page === "dashboard"} navigate={navigate} /></div>}
          {visited.has("resumes") && <div hidden={page !== "resumes"}><ResumesPage active={page === "resumes"} /></div>}
          {visited.has("jobs") && <div hidden={page !== "jobs"}><JobsPage active={page === "jobs"} /></div>}
          {visited.has("attempts") && <div hidden={page !== "attempts"}><AttemptsPage active={page === "attempts"} filter={attemptFilter} onFilterChange={setAttemptFilter} /></div>}
          {visited.has("settings") && <div hidden={page !== "settings"}><SettingsPage active={page === "settings"} status={status} onStatusChange={setStatus} /></div>}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
