# Chrome 插件安装引导优化

- 状态：实现与浏览器验收完成
- 分支：`fix/plugin-install-guidance-20260917`
- 基线：`origin/main@4dd808ca081d6ca752007d401d60aaea6ca89a77`
- 目标：设置页未检测到 Chrome 扩展时，明确展示未安装状态并跳转至官方安装指引；检测到扩展后保留现有本机配对流程。

## 已确认决策

- 安装指引地址：`https://cloud.succaiss.com/plugins/recruiting/`。
- 未检测到页面 Bridge 时显示安装入口，不再以“连接失败”错误提示代替安装指引。
- 插件状态区分为“未安装”“待连接”“已连接”。
- “检查连接”同时检查页面 Bridge 与本地设备记录。
- 继续使用现有 Ant Design 与 Tailwind CSS，不新增依赖，不修改插件协议或后端 API。

## 验证

- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- 本地 CLI 已重启，健康页面正常。
- Chrome 浏览器验收：未检测到扩展时显示安装警告和“未检测到”状态；“打开安装指引”在新标签页进入 `https://cloud.succaiss.com/plugins/recruiting/`；“重新检测”给出明确未检测提示；扩展目录完整换行显示。
