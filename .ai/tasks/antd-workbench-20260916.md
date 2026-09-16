# Ant Design 本地工作台改造

- 状态：设计规范已确认，实施计划编写中
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
- 本期不把候选人 JSON 编辑器扩展为完整结构化字段表单。
- 不把第三方招聘网站嵌入本地页面，不收集其账号、密码或验证码。

## 下一步

按 `docs/superpowers/plans/2026-09-16-antd-workbench-plan.md` 实施并完成获授权的验证。
