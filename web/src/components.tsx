import { Button, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { safeHttpUrl } from "./api.js";

const brandUrl = "https://aioffer.succaiss.com/";

export function BrandLink({ suffix = "" }: { suffix?: string }) {
  return (
    <span>
      <a href={brandUrl} target="_blank" rel="noopener noreferrer">aioffer</a>
      {suffix}
    </span>
  );
}

export function SafeExternalLink({ href, children }: { href: unknown; children: ReactNode }) {
  const url = safeHttpUrl(href);
  return url ? <Typography.Link href={url} target="_blank" rel="noopener noreferrer">{children}</Typography.Link> : <span>{children}</span>;
}

export const statusLabels: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  preflight: "准备中",
  paused: "已暂停",
  waiting_for_user_action: "等待你处理",
  waiting_for_site_receipt: "等待网站回执",
  succeeded: "投递成功",
  failed: "失败",
  cancelled: "已停止",
  completed: "已完成",
  completed_with_errors: "已结束（含未成功岗位）",
  opening: "打开页面",
  filling: "填写中",
  submitting: "提交中",
  verifying: "核对回执",
  skipped_unsupported_site: "暂不支持该站点",
};

export function StatusTag({ status }: { status: string }) {
  const color = status === "succeeded" || status === "completed"
    ? "success"
    : status === "waiting_for_user_action" || status === "paused"
      ? "warning"
      : status === "failed" || status === "completed_with_errors"
        ? "error"
        : status === "cancelled"
          ? "default"
          : "processing";
  return <Tag color={color}>{statusLabels[status] ?? status}</Tag>;
}

export function CopyButton({ value }: { value: string }) {
  return <Button onClick={() => navigator.clipboard.writeText(value)}>复制</Button>;
}
