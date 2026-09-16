import { readFile, writeFile } from "node:fs/promises";
import { loadCatalog } from "../src/local/catalog.js";
import { jobCapability, companyCoverage } from "../src/local/job-capability.js";
const catalog = await loadCatalog("data/jobs.json.gz");
const { counts, companies } = companyCoverage(catalog.items);
const auto = companies.filter(c=>c.autoJobs>0), assisted = companies.filter(c=>c.assistedJobs>0);
const jobCounts = {auto:0,assisted:0,unverified:0,unavailable:0};
for(const j of catalog.items) jobCounts[jobCapability(j).kind]++;
const text = (s:string) => s.replace(/[\r\n]+/g," ").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/[\\|\[\]*_`]/g,"\\$&");
const safeLink = (url:string) => url.replace(/[<>\r\n|]/g,c=>encodeURIComponent(c));
function table(rows:typeof companies, mode?:"auto"|"assisted") {
 return ["| 企业（来源名称） | 投递方式 | 免登录岗位 | 需登录岗位 | 官网 / ATS / 来源投递入口 |","| --- | --- | ---: | ---: | --- |",...rows.map(c=>{
 const modes=[...(c.autoJobs?["自动（免登录）"]:[]),...(c.assistedJobs?["半自动（需本人登录）"]:[])].join("、");
 const entries=c.entries.filter(e=>!mode||e.kind===mode).map((e,i)=>`[${e.kind==="auto"?"免登录":"需登录"}：${text(new URL(e.url).hostname)} ${i+1}](<${safeLink(e.url)}>)`).join(" · ");
 return `| ${text(c.companyName)} | ${modes} | ${c.autoJobs} | ${c.assistedJobs} | ${entries} |`;
 })].join("\n");
}
const explanation = `按 **AI Offer 生产数据库**的公开有效、允许申请记录汇总，企业按来源企业名称去重；同一企业的校招、社招入口可有不同登录要求。链接保留源数据中的真实投递页，不猜测或改写为网站首页；个别源记录指向牛客等第三方招聘平台，表中显示实际域名，不将其伪称企业官网。

- **自动 / 免登录**：\`jobPosting.application.loginRequirement.status = not_required\`，对应 AI Offer 的 \`auto_apply\` 筛选。
- **半自动 / 需本人登录**：原始字段为 \`required\`，对应 AI Offer 的 \`login_required\` 筛选；“半自动”是 CLI 对需要本人登录、再由助手填写并确认提交的展示名称。
- 企业数与岗位数分开统计：**${counts.total} 个企业名称，${jobCounts.auto+jobCounts.assisted} 个岗位**。自动 ${counts.auto} 家、半自动 ${counts.assisted} 家，重叠 ${counts.mixed} 家（${companies.filter(c=>c.autoJobs>0&&c.assistedJobs>0).map(c=>text(c.companyName)).join("、") || "无"}），不能直接相加。

这是来源数据的投递入口分类，不是 ${counts.total} 家全部完成本 CLI 端到端验收的声明。适配器类型与历史成功记录作为补充信息，**不再作为企业或岗位白名单**。登录、验证码和最终提交仍遵守本人授权与确认；快照不会自动更新。`;
const overview = `<!-- delivery-catalog:start -->
## 哪些企业官网可以自动或半自动投递

快照日期：**${catalog.exportedAt.slice(0,10)}**。以下按企业展示，岗位数仅作辅助统计。

| 投递入口分类（按生产数据） | 企业数 | 岗位数 | 使用方式 |
| --- | ---: | ---: | --- |
| 自动 / 免登录 | **${counts.auto}** | ${jobCounts.auto.toLocaleString("en-US")} | 原始状态 not_required，可选自动或半自动 |
| 半自动 / 需本人登录 | **${counts.assisted}** | ${jobCounts.assisted.toLocaleString("en-US")} | 原始状态 required，本人登录、助手填写、逐岗确认提交 |
| 去重合计 | **${counts.total}** | **${(jobCounts.auto+jobCounts.assisted).toLocaleString("en-US")}** | ${counts.mixed} 家同时有两类入口，企业数不可直接相加 |

${explanation}

<details>
<summary><strong>展开自动投递企业（${counts.auto} 家）</strong></summary>

${table(auto,"auto")}

</details>

<details>
<summary><strong>展开半自动投递企业（${counts.assisted} 家）</strong></summary>

${table(assisted,"assisted")}

</details>

**[查看完整企业官网清单 →](docs/company-list.md)** · [数据来源与字段口径](docs/catalog-maintenance.md) · [快照校验](data/manifest.json)

工作台按「投递能力」筛选；命令行使用 \`node dist/local/cli.js jobs --capability auto\` 或 \`--capability assisted\`，用 \`--offset 30\` 翻页。分类覆盖所有相应有效岗位，不要求每个岗位已有历史成功记录。
<!-- delivery-catalog:end -->`;
let readme = await readFile("README.md","utf8");
readme=readme.replace(/<!-- delivery-catalog:start -->[\s\S]*?<!-- delivery-catalog:end -->/,overview);
readme=readme.replace(/内置 \*\*[\d,]+ 条岗位快照\*\*/,`内置 **${catalog.total.toLocaleString("en-US")} 条岗位快照**`);
const doc=`# 企业官网投递清单

快照日期：${catalog.exportedAt.slice(0,10)}。本页由 \`pnpm catalog:docs\` 自动生成，与 README、工作台使用同一分类规则。

[返回 README](../README.md#哪些企业官网可以自动或半自动投递) · [维护与字段口径](catalog-maintenance.md)

${explanation}

## 完整企业清单（${counts.total} 个来源企业名称）

${table(companies)}
`;
const oldDoc=`# 企业官网与岗位投递清单

清单已按企业官网展示：[查看完整企业清单](company-list.md)。企业数与岗位数分别统计，投递方式按生产数据的登录要求分类。

岗位检索使用工作台或 \`node dist/local/cli.js jobs --capability auto\` / \`--capability assisted\`。旧版 82＋7 的逐岗证据清单已撤销，不作为支持范围或投递准入条件。
`;
for(const [path,value] of [["README.md",readme],["docs/company-list.md",doc],["docs/job-list.md",oldDoc]] as const){
 if(process.argv.includes("--check")){if(await readFile(path,"utf8")!==value)throw Error(`${path} 与生产数据分类不一致，请运行 pnpm catalog:docs`);}
 else await writeFile(path,value);
}
console.log(JSON.stringify({companies:counts,jobs:jobCounts}));
