# 维护岗位投递能力

用户运行 CLI 只读本地快照。维护者取得授权的公开有效岗位导出后，在仓库根目录导入；不在客户端连接生产数据库。README 选择能力概览、可折叠小清单、完整列表链接，避免把数万条未验证岗位混入“能投递”清单。

## 输入契约

导入文件包含以下字段。示例是结构说明，不能作为真实能力依据。

- `queriedAt`：完整快照时间，ISO 8601。
- `filter`：至少包含 `publication.visibility: PUBLIC`、`publication.lifecycle: ACTIVE`、`summary.capabilities.applicationAllowed: true`。
- `counts`：按 `required` / `not_required` / `unknown` 等状态汇总，合计必须等于 `jobs.length`。
- `jobs[]`：`jobId`、`companyName`、`title`、`applicationUrl`、`workplaceOptions`（physicalLocations.city）、`description`、`salary`、`sourceContext.channel`、`loginRequirement`。
- `loginRequirement`：`status`、`scope`、`verificationMethod`、`verifiedAt`、`evidenceUrl`。不得只保留笼统的岗位 verifiedAt。
- `executions[]`：仅导入流程在内存中使用的岗位结果。字段为 `jobId`、`applicationUrl`、`status`、`batchUpdatedAt`。必须按相同岗位与相同原始 URL 关联；打包只保存成功日期与最新状态摘要，不保存批次或用户身份。

空快照、计数不符或重复 ID 会失败。源岗位 ID 与旧 CLI ID 不同，导入优先按已保存源 ID，再按原始投递 URL 匹配，保留旧 CLI ID；历史缺席岗位保留为不可用以保护已有记录。实际生产导出及内部日志不能提交本仓库。

## 导入、生成、验证

```bash
node --import tsx scripts/import-production-catalog.ts /absolute/path/authorized-export.json
pnpm catalog:docs
pnpm catalog:check
pnpm typecheck
pnpm test
pnpm build
pnpm check:cloud
```

`data/manifest.json` 保存当前快照时间、总数、有效岗位数、能力数量和 SHA-256。完整候选清单在 `docs/job-list.md`；README 与此清单由同一生成器更新，CI 检测漂移。

自动与半自动是任务权限，免登录与需登录是网站入口要求，来源系统历史成功是另一条证据。当前“候选”规则是保守准入规则，不是逐岗成功率承诺。后续真实 CLI 验收应记录受测岗位、版本、日期、填写/人工交接/最终回执范围，不能只凭通用适配器 supported=true 提升能力。
