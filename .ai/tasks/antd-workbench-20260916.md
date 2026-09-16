# Ant Design 本地工作台改造

- 状态：实现与授权验证完成
- 分支：`feat/antd-workbench-20260916`
- 基线：`origin/main@4f6d3c1c1caee0adf4a78974556f724f0203adca`
- 目标：把现有原生单页工作台重构为方案 A 的 React + Ant Design 任务工作台，保留全部本地 API、插件桥和投递保护语义。

## 已确认决策

- 使用左侧导航的任务工作台布局。
- 组件使用 Ant Design；Tailwind CSS 仅负责容器布局和响应式。
- 不增加账号登录页，继续使用 CLI 私密链接和插件配对。
- 登录、验证码在第三方招聘页面完成；本地页面负责打开现场、补充资料和继续任务。
- 本地工作台内所有可见 `aioffer` / `AI Offer` 品牌文字链接到 `https://aioffer.succaiss.com/`。
- 允许修改现有 Web 测试，并执行 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:cli`。

## 约束

- 不修改后端 API、投递状态机、鉴权、设备配对或插件协议。
- 保留最新岗位能力筛选、企业统计、登录核验和投递证据展示。
- 不新增 React Router 或外部状态管理库。
- Ant Design 使用 `zeroRuntime` 和本地静态 CSS；CSP 继续禁止内联 style 元素，仅对组件必需的 style 属性启用 `style-src-attr 'unsafe-inline'`。
- 本期不把候选人 JSON 编辑器扩展为完整结构化字段表单。
- 不把第三方招聘网站嵌入本地页面，不收集其账号、密码或验证码。

## 下一步

## 验证结果

- `pnpm typecheck`：通过。
- `pnpm test`：通过；核心 194 个文件中 189 通过、5 跳过，2844 项通过、48 跳过；Web UI 1 个文件、14 项全部通过。
- `pnpm build`：通过，生成 Web、CLI 和扩展产物。
- `pnpm check:cloud`：通过，29,627 条岗位与本地边界校验通过。
- `pnpm test:cli`：通过，覆盖重复启动、异常锁恢复、请求排空和正常退出。
- 本地浏览器验收：工作台、简历、岗位、记录、设置页面可切换；Ant Design 静态主题生效；品牌链接正确；控制台无页面错误或 CSP 拒绝。

## 未覆盖边界

- 临时空数据目录下未配置真实模型、MinerU 或本地插件。
- 未执行真实招聘网站填写或最终提交。
- 浏览器验收不代表真实 ATS、部署或正式投递成功。

任务已按 `docs/superpowers/plans/2026-09-16-antd-workbench-plan.md` 完成。
