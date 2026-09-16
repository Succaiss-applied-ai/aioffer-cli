import { useEffect, useState } from "react";
import { App, Button, Card, Checkbox, Empty, List, Select, Space, Tag, Typography, Upload } from "antd";
import { api, fileAsBase64 } from "../api.js";
import type { ApplicationAsset, ResumeVersion } from "../types.js";

export function ResumesPage({ active }: { active: boolean }) {
  const { message } = App.useApp();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [profileText, setProfileText] = useState("");
  const [parsingConsent, setParsingConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [attachmentPurpose, setAttachmentPurpose] = useState<ApplicationAsset["purpose"]>("portrait");
  const [extraAssetIds, setExtraAssetIds] = useState<string[]>([]);
  const [extraAssets, setExtraAssets] = useState<ApplicationAsset[]>([]);

  const load = async (prefer?: string) => {
    const items = await api<ResumeVersion[]>("/api/resumes");
    setVersions(items);
    const id = prefer || selectedId || items.at(-1)?.id || "";
    if (id) selectVersion(items, id);
  };
  useEffect(() => { if (active && versions.length === 0) void load().catch((error) => message.error(String(error))); }, [active]);

  const selectVersion = (items: ResumeVersion[], id: string) => {
    const selected = items.find((item) => item.id === id);
    setSelectedId(id);
    setProfileText(selected ? JSON.stringify(selected.profile, null, 2) : "");
    setExtraAssetIds([]);
    setExtraAssets([]);
  };

  const importResume = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) throw new Error("请选择不超过 20 MB 的简历");
    if (!parsingConsent) throw new Error("请先同意将简历发送给 MinerU 和所选模型提取资料");
    setUploading(true);
    try {
      const result = await api<ResumeVersion>("/api/resumes/import", { name: file.name, data: await fileAsBase64(file), allowExternalParsing: true });
      await load(result.id);
      message.success("解析完成，请核对结构化资料");
    } finally { setUploading(false); }
  };

  const addAttachment = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) throw new Error("请选择不超过 20 MB 的附件");
    setUploading(true);
    try {
      const { asset } = await api<{ asset: ApplicationAsset }>("/api/resumes/import", {
        name: file.name, data: await fileAsBase64(file), purpose: attachmentPurpose,
      });
      setExtraAssetIds((current) => [...current, asset.assetId]);
      setExtraAssets((current) => [...current, asset]);
      message.success("附件已保存在本机，将随新确认版本保存");
    } finally { setUploading(false); }
  };

  const confirm = async () => {
    if (!selectedId) throw new Error("请选择资料版本");
    let profile: unknown;
    try { profile = JSON.parse(profileText); }
    catch { throw new Error("结构化资料不是有效 JSON"); }
    setConfirming(true);
    try {
      const result = await api<ResumeVersion>(`/api/resumes/${selectedId}/confirm`, { profile, confirmedByUser: true, extraAssetIds });
      await load(result.id);
      message.success("已保存新的确认版本");
    } finally { setConfirming(false); }
  };

  const selected = versions.find((item) => item.id === selectedId);
  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <Card title="资料版本" className="xl:col-span-2">
        <Upload.Dragger
          accept=".pdf,.docx,.txt,.md"
          showUploadList={false}
          disabled={uploading}
          beforeUpload={(file) => { void importResume(file).catch((error) => message.error(String(error))); return false; }}
        >
          <p className="font-medium">点击或拖入简历</p><p className="text-xs text-slate-500">PDF、DOCX、TXT、Markdown，最大 20 MB</p>
        </Upload.Dragger>
        <Checkbox className="my-4" checked={parsingConsent} onChange={(event) => setParsingConsent(event.target.checked)}>
          同意将简历发送给 MinerU（纯文本跳过）和所选模型提取资料
        </Checkbox>
        {versions.length ? (
          <List dataSource={[...versions].reverse()} renderItem={(item) => (
            <List.Item onClick={() => selectVersion(versions, item.id)} className={item.id === selectedId ? "cursor-pointer rounded-lg bg-blue-50 px-3" : "cursor-pointer px-3"}>
              <List.Item.Meta title={item.assets[0]?.name || "简历"} description={`${new Date(item.createdAt).toLocaleString("zh-CN")} · ${item.confirmedAt ? "已确认" : "待核对"}`} />
              <Tag color={item.confirmedAt ? "success" : "warning"}>{item.confirmedAt ? "已确认" : "草稿"}</Tag>
            </List.Item>
          )} />
        ) : <Empty description="尚未导入简历" />}
      </Card>
      <Card title="结构化资料" className="xl:col-span-3" extra={selected && <Tag color={selected.confirmedAt ? "success" : "warning"}>{selected.confirmedAt ? "已确认" : "待核对"}</Tag>}>
        <Typography.Paragraph type="secondary">请删除错误内容、补充真实事实；确认时会另存为不可变版本。</Typography.Paragraph>
        <textarea className="h-80 w-full resize-y rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-xs text-emerald-300" value={profileText} onChange={(event) => setProfileText(event.target.value)} spellCheck={false} />
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <Space wrap>
            <Select value={attachmentPurpose} onChange={setAttachmentPurpose} options={[
              { value: "portrait", label: "证件照 / 头像" }, { value: "portfolio", label: "作品集" }, { value: "other", label: "其他附件" },
            ]} />
            <Upload accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg" showUploadList={false} beforeUpload={(file) => { void addAttachment(file).catch((error) => message.error(String(error))); return false; }}>
              <Button loading={uploading}>添加附件</Button>
            </Upload>
          </Space>
          {extraAssets.map((asset) => <Tag className="mt-2" key={asset.assetId}>{asset.name}</Tag>)}
        </div>
        <div className="mt-4 flex justify-end"><Button type="primary" loading={confirming} disabled={!selectedId} onClick={() => void confirm().catch((error) => message.error(String(error)))}>核对无误，保存新版本</Button></div>
      </Card>
    </div>
  );
}
