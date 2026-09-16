# aioffer-cli Ant Design 本地任务工作台实施计划

依据：`docs/superpowers/specs/2026-09-16-antd-workbench-design.md`  
分支：`feat/antd-workbench-20260916`  
基线：`origin/main@4f6d3c1c1caee0adf4a78974556f724f0203adca`

## 约束

- 一名活动写入者；其他审查只读。
- 不修改后端 API、投递状态机、插件协议或安全门禁。
- 不新增路由和状态管理依赖。
- 使用 Ant Design 组件；Tailwind 仅做布局，并关闭 Preflight。
- 保留最新岗位能力、企业统计、登录核验与历史投递证据。
- 现有 Web 测试允许迁移；用户已授权运行全部验证命令。

## 阶段 1：前端构建入口

涉及文件：

- `package.json`
- `pnpm-lock.yaml`
- `scripts/build-web.mjs`（新增）
- `scripts/build.mjs`
- `tsconfig.web.json`（新增）
- `.gitignore`
- `web/index.html`
- `web/src/styles.css`（新增）

步骤：

1. 添加并固定 `react@19.3.0`、`react-dom@19.3.0`、`antd@6.6.4`。
2. 添加并固定 `@types/react@19.3.0`、`@types/react-dom@19.3.0`、`tailwindcss@4.3.3`、`@tailwindcss/cli@4.3.3`。
3. 新建 Web TypeScript 配置并纳入 `pnpm typecheck`。
4. 新建最小 Web 构建脚本：esbuild 打包 TSX，Tailwind CLI 生成 CSS，输出 `web/dist/`。
5. 复制 Ant Design 官方静态 CSS，`ConfigProvider` 启用 `zeroRuntime`；CSP 保持 style 元素仅允许 `self`，单独允许组件所需的 inline style 属性。
6. Tailwind CSS 只导入 theme 和 utilities，不导入 preflight。
7. 更新主构建脚本调用 Web 构建。
8. `web/index.html` 改为 React 挂载壳并加载同源生成产物。

完成条件：依赖、类型配置和构建入口闭合，旧 Web 入口尚未删除也不参与加载。

## 阶段 2：共享运行时

涉及文件：

- `web/src/main.tsx`（新增）
- `web/src/types.ts`（新增）
- `web/src/api.ts`（新增）
- `web/src/bridge.ts`（新增）
- `web/src/components.tsx`（新增）

步骤：

1. 迁移 fragment token → `sessionStorage` → `history.replaceState` 流程。
2. 实现带 Bearer token 的 API 包装和中文错误规范化。
3. 迁移插件桥的 requestId、同源消息、20 秒超时和错误处理。
4. 定义页面需要的最小接口类型，不复制完整后端协议。
5. 实现唯一 `BrandLink`，固定安全外链属性。
6. 实现状态标签、HTTP 外链校验和最终确认提示等共享逻辑。

完成条件：共享模块不直接操作具体页面 DOM，可由 React 页面复用。

## 阶段 3：应用框架、设置和简历

涉及文件：

- `web/src/app.tsx`（新增）
- `web/src/pages/settings.tsx`（新增）
- `web/src/pages/resumes.tsx`（新增）

步骤：

1. 建立 `ConfigProvider`、Ant Design `App`、`Layout`、`Sider`、`Menu`、`Header`、`Content`。
2. 启动时并行加载 status、devices、resumes、jobs、attempts；关键失败用 `Result`。
3. 设置页迁移模型/MinerU 配置、模型测试、插件配对、设备信息和扩展目录。
4. 简历页迁移导入、附件、版本选择、JSON 编辑和不可变确认。
5. 上传和长操作提供独立 loading，保留 20 MB 和外部解析同意边界。

完成条件：配置、配对、简历导入与确认具备旧页面功能等价性。

## 阶段 4：岗位搜索与投递预览

涉及文件：

- `web/src/pages/jobs.tsx`（新增）

步骤：

1. 迁移关键词、城市、能力筛选、分页和迟到响应保护。
2. 显示快照日期、企业/岗位能力统计、登录核验和历史成功来源。
3. 禁用无允许投递模式的岗位；选择状态跨分页保留。
4. 模式、设备、协议授权或岗位选择变化时使旧预览失效。
5. 用 Ant Design `Modal` 展示投递预览及确认复选框。
6. 创建成功后唤醒指定设备；唤醒失败明确提示任务已持久化，禁止重复创建。

完成条件：搜索与任务创建语义和最新 main 保持一致。

## 阶段 5：投递记录与工作台

涉及文件：

- `web/src/pages/attempts.tsx`（新增）
- `web/src/pages/dashboard.tsx`（新增）

步骤：

1. 迁移批次暂停、恢复、停止及岗位状态展示。
2. 迁移明确登录失败的受保护重试。
3. 迁移最终回读确认、缺失资料表单及其他人工继续动作。
4. `evidence.pageUrl` 优先作为第三方现场页面链接。
5. 使用稳定 key 和局部表单状态避免轮询破坏焦点与输入。
6. 工作台从 attempts 派生运行中、等待处理和今日完成统计。
7. “等待你处理”进入记录页并预设等待筛选。
8. 当前任务详情使用 `Drawer`，危险操作使用 `Modal`。

完成条件：所有旧投递记录操作都可在新页面完成，第三方登录边界不变。

## 阶段 6：移除旧入口并迁移测试

涉及文件：

- `web/app.js`（删除）
- `web/style.css`（删除）
- `web/plugin-compatibility.js`
- `web/review-notice.js`
- `src/local/workbench-search.test.ts`
- `src/local/workbench-preview.test.ts`
- `src/local/workbench-refresh.test.ts`
- 其他直接读取旧 `web/index.html` 或导入 `web/app.js` 的相关测试

步骤：

1. 将兼容性检查和最终确认提示迁入 TypeScript，或保留薄 JS 模块供 React 调用。
2. 删除不再加载的旧 DOM 应用与样式。
3. 用 React 挂载入口迁移现有 jsdom 场景，不额外引入测试框架。
4. 保留搜索竞态、分页、预览失效、记录刷新、登录重试、补充资料和最终确认回归语义。
5. 验证工作台可见品牌链接统一指向指定地址。

完成条件：仓库不存在两套活动工作台，相关测试不再依赖旧 DOM ID。

## 阶段 7：验证与独立审查

按顺序执行：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:cli
```

然后：

1. 检查 `git diff --check`。
2. 检查构建产物仍满足本地云边界；必要时运行已有 `pnpm check:cloud`。
3. 启动本地服务并进行浏览器验收：五页面切换、设置、简历、岗位能力、预览、记录、等待处理和品牌链接。
4. 由只读审查者检查 API/插件协议是否意外变化、投递确认是否弱化、是否遗漏旧功能。
5. 更新任务卡，记录每项验证结果和未覆盖边界。

## 完成定义

- 设计规范全部验收标准满足。
- 获授权的四条验证命令通过。
- 本地浏览器交互通过，但不宣称真实 ATS 或正式投递验收。
- 分支只包含本任务相关改动，未提交 `.superpowers/` 原型会话文件。
