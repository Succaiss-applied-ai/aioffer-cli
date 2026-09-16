# aioffer-cli Ant Design 本地任务工作台设计

日期：2026-09-16  
状态：已完成交互设计确认，等待书面规范复核

## 1. 背景

当前本地工作台由 `web/index.html`、`web/app.js` 和 `web/style.css` 组成，使用一个纵向长页面依次承载配置、简历、岗位和投递记录。业务闭环完整，但信息层级、运行状态可见性、异步反馈和任务处理效率不足。

本改造采用已确认的方案 A：左侧导航的任务工作台。它不是更换配色，而是把原生 DOM 页面重构为 React + Ant Design 应用，同时保持后端 API、插件桥、设备凭据、投递状态机和提交保护完全不变。

## 2. 目标

1. 首页同时展示本地运行状态、待处理任务和新建投递入口。
2. 将简历、岗位、记录和设置拆成清晰页面，避免长页面滚动。
3. 使用 Ant Design 提供一致的表单、状态、反馈、弹窗、抽屉和空状态。
4. 保留当前全部业务功能与最新岗位能力信息，不降低投递安全边界。
5. 将本地工作台内所有可见的 `aioffer` / `AI Offer` 品牌文字链接到 `https://aioffer.succaiss.com/`。
6. 建立可类型检查、可构建、可回归的 Web 前端入口。

## 3. 非目标

- 不修改任何后端路由、请求或响应结构。
- 不修改 Chrome 插件协议、投递执行器或状态机。
- 不增加本地账号、用户名或密码登录。
- 不在本地页面嵌入第三方招聘网站。
- 不接收或存储第三方招聘网站账号、密码、短信码或验证码。
- 不新增 React Router、Redux、Zustand 等路由或状态管理库。
- 本期不把候选人 JSON 编辑器升级为完整的嵌套结构化表单。
- 不新增实时岗位抓取、云同步或多用户能力。

## 4. 技术架构

### 4.1 前端技术

- React + TypeScript 负责组件和状态。
- Ant Design 负责所有交互组件，包括 `Layout`、`Menu`、`Card`、`Form`、`Upload`、`List`、`Tag`、`Progress`、`Alert`、`Empty`、`Result`、`Modal`、`Drawer`、`Pagination`、`Message` 和 `Notification`。
- Tailwind CSS 只处理少量容器布局、响应式宽度和页面间距；不重复实现 Ant Design 已提供的组件外观。
- Ant Design `ConfigProvider` 使用中文 locale 和统一主题 token。
- 不使用 React Router。当前页面由 `Menu` 的选中状态切换，浏览器刷新回到工作台首页。
- 不使用外部状态管理。应用根组件持有共享状态，页面组件持有局部表单和筛选状态。

### 4.2 文件边界

建议结构：

```text
web/
  index.html                 React 挂载壳
  src/
    main.tsx                 token 初始化和挂载
    app.tsx                  ConfigProvider、Layout、共享状态和导航
    api.ts                   Bearer API 请求与错误规范化
    bridge.ts                本地插件 window message 桥
    types.ts                 当前接口的最小前端类型
    components.tsx           BrandLink、状态标签、任务操作等共享组件
    styles.css               Tailwind 入口和少量全局规则
    pages/
      dashboard.tsx
      resumes.tsx
      jobs.tsx
      attempts.tsx
      settings.tsx
  dist/                      构建生成，不提交
```

页面组件只依赖 `api.ts`、`bridge.ts`、共享类型和 Ant Design，不直接操作全局 DOM。

### 4.3 构建

- 在现有 `scripts/build.mjs` 中增加 Web 构建步骤。
- 使用现有 esbuild 打包 `web/src/main.tsx` 为浏览器 ESM。
- 使用 Tailwind CLI 从 `web/src/styles.css` 生成压缩 CSS，并避免引入会覆盖 Ant Design 的全局 preflight。
- 输出到 `web/dist/`，由现有 `express.static(web)` 直接提供。
- `web/index.html` 只加载 `/dist/app.js` 和 `/dist/app.css`。
- 增加独立 Web TypeScript 配置，并把它纳入 `pnpm typecheck`。
- 新增的 React、Ant Design、Tailwind 依赖使用锁文件固定版本。

## 5. 页面设计

### 5.1 全局框架

桌面端使用 Ant Design `Layout`：

- 左侧 `Sider`：工作台、简历资料、岗位搜索、投递记录、设置。
- 顶部 `Header`：当前页面标题、模型状态、MinerU 状态和刷新操作。
- 主区 `Content`：页面内容。
- 小屏幕下 `Sider` 折叠为抽屉或窄图标栏，内容保持单列。

侧栏底部固定展示本机服务与 Chrome 插件状态。侧栏品牌显示为 `aioffer-cli`，其中 `aioffer` 是外部链接。

### 5.2 工作台

工作台是默认首页，包含：

1. 三张统计卡：正在执行、等待你处理、今日完成。
2. “等待你处理”可点击，进入投递记录并自动筛选 `waiting_for_user_action`。
3. “开始新的投递”卡：当前已确认资料、当前设备、推荐的半自动模式及前往岗位搜索按钮。
4. 当前任务卡：公司、岗位、阶段、进度、查看详情和暂停操作。

统计数据从现有 `/api/attempts` 返回值派生，不增加新的统计接口。

### 5.3 简历资料

- 左侧展示版本列表，区分已确认与待核对。
- 提供 Ant Design `Upload.Dragger` 上传简历或附件。
- 上传和解析显示 loading 与阶段反馈。
- 右侧继续使用 JSON 编辑器编辑结构化资料，保留现有数据格式和确认逻辑。
- 点击确认后仍调用 `/api/resumes/:id/confirm`，保存新的不可变版本。
- 附件用途继续支持头像、作品集和其他附件。

### 5.4 岗位搜索

- 搜索区包含关键词、城市和最新的能力筛选条件。
- 展示快照日期、企业数量、自动/半自动岗位统计、登录核验状态和来源系统历史证据。
- 岗位结果使用 `List` 或响应式卡片，不使用横向信息密集的表格。
- 没有允许模式的岗位禁用选择，并显示不可投递原因。
- 保留每页 30 条和现有分页语义。
- 选中岗位后显示固定操作栏，展示数量、清空选择和“核对本次投递”。
- 预览使用 `Modal`，展示资料版本、设备、模式、岗位能力说明和协议授权。
- 自动模式仍必须单独勾选最终提交授权；协议点击权限保持独立。

### 5.5 投递记录

- 顶部按全部、运行中、等待处理、已结束筛选。
- 批次使用 `Card`，岗位使用内嵌列表。
- 任务详情使用 `Drawer`，展示阶段、诊断、更新时间、招聘页面和操作历史。
- 轮询使用现有十秒周期；页面不可见时不刷新。
- React 更新必须保留用户正在填写的补充资料、复选框和焦点。
- 状态无变化时不重建表单；迟到响应不得覆盖新状态。

不同等待状态的处理：

- `missing_information`：在本地页面通过 Ant Design `Form`、`Input`、`Select` 填写 `requiredFieldRequests`，提交到现有 `required-field-answers` 路由。
- `final_review_required`：显示回读变化或过期提示，要求先打开第三方招聘页面检查，再调用现有本地确认接口。
- 登录、验证码、身份核验：显示 `Alert`、“打开招聘页面”和“我已处理，继续”。实际凭据只在第三方招聘页面输入。
- 明确的提交前登录失败：保留原岗位、资料、设备、模式和协议权限，勾选确认后创建带 `retryOf` 的新尝试。
- 有 `job.evidence.pageUrl` 时优先打开该现场页面；否则回退到岗位 `applicationUrl`。

### 5.6 设置

- 模型和 MinerU 配置使用 Ant Design `Form`。
- 密钥字段使用 `Input.Password`，已配置时留空代表保留。
- 保存、测试模型和插件检查均有独立 loading 状态。
- 插件卡展示设备名、版本、能力、最近心跳和扩展目录。
- 配对继续使用现有 bootstrap 及 window message bridge。

## 6. 品牌链接规则

本规则只作用于本地工作台的用户可见文案，不修改协议字段、代码标识符、仓库名或日志文本。

- `aioffer-cli` 品牌中只把 `aioffer` 子串包裹为链接，`-cli` 保持普通文本。
- 单独出现的 `aioffer` 或 `AI Offer` 使用同一链接。
- URL 固定为 `https://aioffer.succaiss.com/`。
- 使用新标签页打开，并设置 `target="_blank"`、`rel="noopener noreferrer"`。
- 通过唯一的 `BrandLink` 组件实现，避免不同页面重复拼写 URL。

## 7. 数据与状态

### 7.1 鉴权

- 保留 URL fragment 中的 token 读取流程。
- token 写入 `sessionStorage` 后立即通过 `history.replaceState` 清除地址栏 fragment。
- API 请求继续使用 `Authorization: Bearer`。
- 不把 token 放入 React 日志、错误消息、DOM 属性或外部链接。

### 7.2 启动数据

应用首次加载并行获取：

- `/api/status`
- `/api/devices`
- `/api/resumes`
- `/api/jobs`
- `/api/attempts`

单项失败不应让整个应用空白：关键鉴权失败显示页面级 `Result`；岗位或记录等局部失败在对应页面提供重试。

### 7.3 搜索与预览

- 岗位搜索使用 `AbortController` 或单调请求序号丢弃迟到响应。
- 修改关键词、城市或能力筛选时回到第一页。
- 修改岗位选择、模式、设备或协议权限时立即废弃旧预览和旧确认。
- 只有最新预览可以创建任务。

### 7.4 投递记录轮询

- 页面可见且存在非终态任务时每十秒刷新。
- 轮询不覆盖用户正在编辑的补充资料。
- 状态对象按 `attempt.id`、`batchId` 和 `batchJobId` 稳定合并。
- 组件卸载或页面隐藏时取消定时器及在途请求。

## 8. 错误处理和安全交互

- `api.ts` 将非 2xx 响应规范化为包含状态码和后端中文消息的错误。
- 普通操作失败使用 Ant Design `message.error`。
- 需要持续关注的问题使用页面内 `Alert`。
- 首屏鉴权或服务不可用使用 `Result`，提供重试但不建议删除本地数据。
- 空岗位、空简历、空记录使用 `Empty`。
- 保存、上传、搜索、预览和确认按钮具有独立 loading，避免全局锁住页面。
- 自动模式授权、半自动最终提交确认和停止任务使用不同文案的 `Modal`。
- 停止确认明确说明“停止不等于撤回已提交申请”。
- 本地页面不提供第三方登录输入框，不通过 iframe 嵌入招聘网站。
- 招聘页面链接只允许 HTTP/HTTPS，并使用 `noopener noreferrer`。

## 9. 测试迁移与验证

用户已明确授权修改现有 Web 测试并执行构建验证。

### 9.1 测试修改

- 迁移当前 `workbench-search`、`workbench-preview`、`workbench-refresh` 等 jsdom 测试，使其挂载 React 工作台，而不是依赖原生 DOM ID 和 `web/app.js` 的顶层副作用。
- 使用 React 自带挂载与原生 DOM 事件完成现有场景，不额外引入测试框架依赖，除非现有能力无法可靠表达交互。
- 保留以下回归语义：搜索迟到响应、分页、预览失效、设备/模式切换、无变化轮询保留用户操作、页面回读变化、重试权限、补充资料和最终确认。
- 增加或调整一个断言，验证用户可见品牌链接统一指向 `https://aioffer.succaiss.com/`。

### 9.2 验证命令

按顺序运行并分别报告：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:cli
```

若任何检查失败，只修复本改造引入或暴露的相关问题；不顺带重构插件执行器。

### 9.3 浏览器验收

构建成功后，在本地服务中核对：

- 私密 token 链接可正常进入工作台且地址栏 token 被清除。
- 五个页面可切换，小屏幕布局可使用。
- 配置、模型测试、插件配对、简历导入和确认可操作。
- 最新岗位能力筛选和禁用规则正确呈现。
- 预览变化会撤销旧确认。
- 等待处理卡可以进入对应记录筛选。
- 缺失资料可在本地提交；登录和验证码会打开第三方页面。
- 最终确认与停止操作显示正确警示。
- 所有可见品牌链接指向指定 `aioffer` 地址。

浏览器页面验收不代表真实招聘网站填写、部署或最终投递成功。

## 10. 兼容与迁移

- 后端继续静态提供 `web/`，无需新增服务端渲染或开发服务器。
- 原 `/api/*`、`/automation/*`、文件签名 URL 和插件消息类型保持不变。
- 原生 `web/app.js` 和 `web/style.css` 在 React 入口完成后删除，避免两套 UI 并存。
- 保留 `plugin-compatibility.js` 和 `review-notice.js` 的业务逻辑；可转换为 TypeScript 模块或由新组件直接导入，但不能弱化现有检查和提示语义。
- `web/dist/` 为生成产物，加入忽略列表；发布包继续通过构建生成并包含它。

## 11. 验收标准

1. 启动后默认显示方案 A 的任务工作台，而非旧纵向长页面。
2. 五个导航页面均使用 Ant Design 组件并具备对应业务功能。
3. Tailwind CSS 仅承担布局和响应式，不复制 Ant Design 组件。
4. 最新岗位能力筛选、公司统计、登录核验和历史投递证据完整保留。
5. 等待处理状态可以从工作台直接进入相应任务，并按原因提供正确操作。
6. 第三方登录和验证码不在本地输入；招聘页面以新标签打开。
7. 后端 API、插件桥和投递状态机没有协议变化。
8. 所有本地工作台可见 `aioffer` / `AI Offer` 品牌文字链接到指定地址。
9. `pnpm typecheck`、`pnpm test`、`pnpm build` 和 `pnpm test:cli` 全部通过。
10. 未把自动化、构建或本地页面验收表述为真实招聘网站成功投递。
