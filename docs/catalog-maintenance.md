# 维护岗位投递能力

用户运行 CLI 只读本地快照。维护者取得授权的公开有效岗位导出后，在仓库根目录导入；不在客户端连接生产数据库。README 选择能力概览、可折叠小清单、完整列表链接，企业按来源名称去重，官网入口保留原始投递链接；同企业跨登录状态时分别计数并标明重叠。

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

`data/manifest.json` 保存当前快照时间、总数、有效岗位数、能力数量和 SHA-256。完整企业清单在 `docs/company-list.md`；README 与此清单由同一生成器更新，CI 检测漂移。

自动与半自动是任务权限，免登录与需登录是网站入口要求，来源系统历史成功是另一条证据。分类直接使用 `jobPosting.application.loginRequirement.status`：`not_required` 对应上游 `auto_apply`；`required` 对应上游 `login_required`，CLI 展示为“半自动／需本人登录”。不要求历史成功记录、特定适配器或特定核验方法才允许创建任务。未知状态不猜测，失效岗位仍禁止新任务。后续真实 CLI 验收应记录受测岗位、版本、日期、填写/人工交接/最终回执范围，不得把入口分类写成逐站成功率保证。

企业汇总使用来源企业名称原值，不擅自将集团、子公司、事业部合并；这不是工商主体数量。`companyCounts.total` 为去重企业数，`auto`、`assisted` 可重叠，`mixed` 为交集；岗位计数在 `capabilityCounts` 中。生产筛选依据来自 `aioffer_position.job_postings` 的 PUBLIC、ACTIVE、REAL、applicationAllowed=true 记录；源代码的 `internal/jobposting/transporthttp/handler.go` 定义上述筛选映射。
