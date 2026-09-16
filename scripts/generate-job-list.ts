import { readFile, writeFile } from "node:fs/promises";
import { loadCatalog } from "../src/local/catalog.js";
import { jobCapability } from "../src/local/job-capability.js";
const catalog = await loadCatalog("data/jobs.json.gz");
const groups = {auto: [] as typeof catalog.items, assisted: [] as typeof catalog.items, unverified: [] as typeof catalog.items, unavailable: [] as typeof catalog.items};
for (const j of catalog.items) groups[jobCapability(j).kind].push(j);
for (const jobs of Object.values(groups)) jobs.sort((a,b) => a.companyName.localeCompare(b.companyName,"zh-CN") || a.title.localeCompare(b.title,"zh-CN"));
const text = (s: string) => s.replace(/[\r\n]+/g," ").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/[\\|\[\]*_`]/g,"\\$&");
const link = (j: typeof catalog.items[number]) => `[${text(j.title)}](<${j.applicationUrl.replace(/[<>\r\n]/g,c=>encodeURIComponent(c))}>)`;
const table = (jobs: typeof catalog.items) => ["| 企业 | 岗位申请页 | 城市 | 依据日期 |", "| --- | --- | --- | --- |", ...jobs.map(j=>`| ${text(j.companyName)} | ${link(j)} | ${text(j.locations.join("、") || "未标注")} | ${(j.deliveryEvidence?.successfulOn || j.loginRequirement?.verifiedAt || "").slice(0,10)} |`)].join("\n");
const overview = `<!-- delivery-catalog:start -->
## 哪些岗位可以自动或半自动投递

快照日期：**${catalog.exportedAt.slice(0,10)}**。工作台默认只显示下列有依据的候选；分类、数量与完整清单由同一份岗位快照自动生成。

| 清单 | 岗位数 | 当前依据与使用方式 |
| --- | ---: | --- |
| 自动投递候选 | **${groups.auto.length}** | 免登录入口已核验 + 专用适配器；可选自动或半自动，完整投递仍待本 CLI 实测 |
| 半自动投递候选 | **${groups.assisted.length}** | 来源系统有该岗位成功记录；本人处理登录等环节，逐岗核对最终提交 |
| 能力待验证 | ${groups.unverified.length.toLocaleString("en-US")} | 登录状态或通用网页支持不能证明可投递，暂不开放任务 |
| 暂不可投递 | ${groups.unavailable.length.toLocaleString("en-US")} | 已不在最新公开有效快照中，保留旧 ID 和记录，不创建新任务 |

**候选不是已验证成功保证。** 来源系统历史结果不等于本 CLI 已逐岗验收；“免登录”不等于完整自动投递，“需登录”也不等于已支持半自动。最终以招聘网站回执为准。

<details>
<summary><strong>展开半自动候选岗位（${groups.assisted.length} 条，有来源成功记录）</strong></summary>

${table(groups.assisted)}

</details>

<details>
<summary><strong>展开自动候选企业与依据（${groups.auto.length} 条）</strong></summary>

| 企业 | 岗位数 | 依据 |
| --- | ---: | --- |
${[...new Set(groups.auto.map(j=>j.companyName))].map(c=>`| ${text(c)} | ${groups.auto.filter(j=>j.companyName===c).length} | 免登录流程核验 + 专用适配；完整岗位与申请链接见下方清单 |`).join("\n")}

</details>

**[查看完整候选清单和每个岗位的申请链接 →](docs/job-list.md)** · [查看快照数量与校验](data/manifest.json)

启动后在「选择岗位 → 投递能力」筛选；也可运行 \`node dist/local/cli.js jobs --capability auto\` 或 \`--capability assisted\`，用 \`--offset 30\` 翻页。
<!-- delivery-catalog:end -->`;
let readme = await readFile("README.md","utf8");
if (readme.includes("<!-- delivery-catalog:start -->")) readme = readme.replace(/<!-- delivery-catalog:start -->[\s\S]*?<!-- delivery-catalog:end -->/, overview);
else readme = readme.replace("## 快速开始",overview+"\n\n## 快速开始");
readme = readme.replace(/内置 \*\*[\d,]+ 条岗位快照\*\*/,`内置 **${catalog.total.toLocaleString("en-US")} 条岗位快照**`);
const doc = `# 岗位投递候选清单

快照日期：${catalog.exportedAt.slice(0,10)}。本页由 \`pnpm catalog:docs\` 生成，不手工编辑数量或岗位。

[返回 README](../README.md#哪些岗位可以自动或半自动投递) · [快照元信息](../data/manifest.json)

## 分类规则

- **自动候选（${groups.auto.length}）**：公开有效岗位，来源免登录核验含范围、方法、日期、公开证据地址，且命中本 CLI 专用适配器。允许自动和半自动；未宣称完成本 CLI 逐岗提交验收。
- **半自动候选（${groups.assisted.length}）**：公开有效岗位，来源系统存在同一岗位、同一申请地址的成功结果。要求本人处理登录、验证码等环节并确认最终提交；不从历史结果推断全程无人介入。
- **待验证（${groups.unverified.length}）**：证据不足。包括仅免登录但无专用适配/成功记录、仅需登录、仅命中通用网页执行器等。不可发起投递任务。
- **暂不可投递（${groups.unavailable.length}）**：旧快照岗位未出现在新的公开有效快照，或地址无效。不可发起新任务。

核验可能作用于单岗位、企业或企业来源，不能将企业级入口核验写成每个岗位已经成功。快照离线使用，不自动访问生产服务；重新更新后能力可能变化。

## 半自动候选：来源系统已有成功记录

${table(groups.assisted)}

## 自动候选：免登录 + 专用适配

${table(groups.auto)}

## 维护与更新

维护者在获得授权后取得完整公开有效岗位导出，保留登录要求及其证据，按岗位与原始申请 URL 关联脱敏的成功摘要。不要提交原始批次、用户标识、简历、答案、密钥或内部验收文件。

\`\`\`bash
node --import tsx scripts/import-production-catalog.ts /absolute/path/authorized-export.json
pnpm catalog:docs
pnpm catalog:check
\`\`\`

输入契约与操作步骤见 [维护者导入说明](catalog-maintenance.md)。导入保留已有 jobId，并将退出有效快照的岗位标记为不可用。工作台和服务端均按同一能力函数检查模式，不能用请求参数绕过限制。所有条目和公开验证依据保存在压缩岗位快照中，CLI 用户不需要数据库账号。
`;
for (const [path,value] of [["README.md",readme],["docs/job-list.md",doc]] as const) {
 if (process.argv.includes("--check")) { if (await readFile(path,"utf8") !== value) throw Error(`${path} 与岗位数据不一致，请运行 pnpm catalog:docs`); }
 else await writeFile(path,value);
}
console.log("README 与完整投递清单已同步校验");
