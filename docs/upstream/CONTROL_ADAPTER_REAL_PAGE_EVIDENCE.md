# 控件 Driver 真实页面验收记录

本文只记录脱敏后的控件证据，不保存候选人真实答案、简历内容、联系方式或完整岗位标识。最终投递始终由产品任务链路控制；控件验收不得点击预览或提交。

## 2026-09-08 Moka 联系信息不一致确认（已加载 rc.1）

候选运行代码为 `f3aa8508f39ba066c03f08806b2a0dafa46dc234`，基线为正式 `0.15.111 / b172ceb`。
执行归属保持共享提交动作策略和可信指针执行器，不新增字段注册或公司专用提交 Driver。

绎立锐光同一原失败岗位的独立验收页，按用户指定的旧 QQ 邮箱触发真实“邮箱不一致”提示。按钮位于
`footer.sd-Modal-modal-footer-uXRhY`，真实所属根为无 role 的 `div.sd-Modal-modal-mEoeY`；footer
仅含取消/确认，正文位于所属根内。首次观察后取消该提示，从未重填的表单调用已加载插件的生产提交
入口。生产 trace 记录一次预览可信点击和一次确认指针点击；随后真实回读为原提示关闭、出现邮箱验证
和滑块，返回 `waiting_for_user_action / captcha`，没有最终“确认提交”点击。本次验收命令未启用
滑块处理，不能当作邮箱验证完成或投递成功。见 [真实邮箱提示记录](../dev/moka-contact-confirmation/evidence/real-email-warning-qq.json)。

成功路径单独验收：当前候选通过正常 AI Offer 单岗位流程得到 Moka 明确成功页和后台 `succeeded`
回执，该轮未出现不一致提示。另按用户后来指定的 hu 完整邮箱重查，发现其与此前 yi 信息包及网站
默认邮箱相同，实际进入最终确认预览，没有不一致提示，也没有点最终提交。
见 [成功回执](../dev/moka-contact-confirmation/evidence/real-receipt-sanitized.json) 和
[hu 邮箱预览记录](../dev/moka-contact-confirmation/evidence/real-email-hu-preview.json)。

本机 Chrome 四场景验证提示在最终确认之前/之后、同一提示重绘不重复点、网络通知不确认，事件均为
可信指针。手机号不一致和其他站点的同类 footer 具有自动化覆盖，本轮不声称它们全部完成真实验收。
原候选与生产代码保持已测版本，正式版本发布独立于此修复 MR。

## 2026-09-06 共享提交滚动与验证码等待（明确授权的完整投递验收）

Style3D 原申请页的平滑滚动导致提交命中点存在移动风险；即时滚动修订后，真实后台预览与最终确认推进。
随后修复迟到验证码误入普通回执超时的问题，用户重新加载并明确授权最终一次投递。
验证码期间原页与人工等待状态保持，用户亲自完成验证后，23:19:43 网站显示投递成功及“初筛”记录，
Gateway 与 AI Offer 自动回写成功，无再次提交。此项是用户明确授权的产品端到端验收，非默认字段控件测试。
执行归属仍为共享最终提交可信指针事务；没有新增字段 Driver 或公司例外。
原型哈希、失败对照、自动化/本机/真实站点覆盖与剩余范围见
[脱敏验收记录](evidence/submit-scroll-captcha-handoff-20260906.md)。

## 2026-09-06 tap4fun Moka 直接文本平面下拉（真实单控件验收通过，未发布）

生产失败证据显示，tap4fun 的“性别”仍是 Moka 可编辑 Select/Dropdown 结构，但弹层叶子的文字直接位于
`Menu-content-item`，没有旧实现要求的 `option-label` 子节点。旧共享实现还复用了招聘信息来源 Driver，
因此真实选项“男/女”虽然已经出现，仍返回 `unsupported_popup_structure`，并把普通性别错误误写成
招聘信息来源控件失败。

修正后 `moka.flat-select.trusted-focus.v1` 使用独立状态机和错误命名空间，同时接受已取证的
`Menu-content-item > option-label` 与直接文本 `Menu-content-item` 两种平面叶子。匹配先做完整精确匹配；
只有值确实由汉字与拉丁文双语两半组成时，才允许信息包 `女/Female` 唯一匹配页面 `女`。普通子串、
中文业务斜杠选项、重复/禁用选项以及分组、树、级联、日历弹层全部拒绝，不输入搜索、不按 Enter、
不写 DOM 值、不重试、不刷新、不整表重填，也不切换其他 Driver。

在真实 tap4fun 申请页只对空的 `basic.gender.combobox` 执行生产观察、指令工厂、集中分派、注册 Driver
和注册回读。页面实时选项为“男、女”，合成测试事实 `女/Female` 唯一点击“女”；立即及额外五秒后的
权威回读均为“女”，字段校验为空、弹层关闭、其他字段值哈希不变。只发生一次打开和一次叶子点击，
失焦提交为零；执行前后保持同一个 AI Offer 标签为活动页，招聘页没有激活或导航事件。没有上传简历、
调用模型、点击预览或最终提交，所有临时招聘页随后关闭。

脱敏结构化记录见
[tap4fun Moka 平面下拉验收](evidence/moka-flat-select-direct-item-20260906.json)。验收包
`background.js` SHA-256 为 `d9d9497a502a53850cc24878279995549e467db8c4ad40ce54adf156c59f87b8`。
151 个测试文件、1,930 项测试、类型检查、插件构建和差异检查通过。本证据只覆盖该共享组件形态，
不代表完整岗位投递或未知 Moka 自定义面板已经验收。

## 2026-09-03 统一后台标签页及 Moka SPAN 入口（五个真实样本通过，未发布）

懂车帝、小鹏、xTool、VWA、tap4fun 由候选生产函数在普通 inactive 标签中完成唯一可信入口点击与目标登录
状态回读；旧 popup 成为当前窗口时也没有把新任务开入该窗口。没有字段填写、登录或最终提交。
小鹏删除合成点击分支，页面级模拟贯穿渲染到目标分类；任务原页续接与精确标签清理通过。
首轮 tap4fun SPAN 入口未命中，随后复现并登记了同一职位根内的 header/footer 结构对；16:29 全部
五例重新执行通过。入口识别与点击前实时命中点复核使用同一个 Moka 定位函数。没有把任意 SPAN
或同名按钮放入通用 Driver，也没有输入登录凭据、填写信息或最终提交。1,410 条自动化用例通过。
完整源码哈希、前后对照与脱敏原始记录见
[五站点验收数据](evidence/unified-background-tab-entry-20260903.json)及
[统一后台标签页验收](UNIFIED_BACKGROUND_TAB_ACCEPTANCE_20260903.md)。

## 2026-09-03 Moka 控件类型分流与双语城市（真实单控件验收通过，未发布）

基于远端 `3f508cf` 的隔离分支 `fix/control-type-routing-20260903`。
[结构化证据](evidence/moka-control-type-routing-20260903.json) 记录已加载验收包 SHA-256、现场失败、修订与最终回读。
用户手动加载独立包；生产启动监听器被移除，不配对、领取任务、上传简历或调用模型。
执行的仍是生产稳定观察、事实与选项处理、指令工厂、集中分派、注册 Driver 和两层回读。

初次原型现场已选中城市并清除错误，但选中后 placeholder 消失，观察器从中文占位语义变成双语标题，
`Preferred work city` 中的 `work` 把城市归到工作经历，精确字段绑定也因标签变化失败。
该轮明确记为未通过，没有以 Driver 局部成功代替外层成功。按实际 Moka 多语种 DOM 保持主标题后，
新增生产观察器反例先复现失败、再验证修复；用户重新加载修订包，重新从空字段验收。

最终在 **17:00–17:02 Asia/Shanghai** 完成：

| 真实页面 / 控件 | 实际唯一 Driver | 合成事实 → 站点回读 |
|---|---|---|
| 微观博易 / 意向工作城市 | `moka.work-city.trusted-focus.v1`，共享组件 | `北京市` → `北京市 / Beijing` |
| 微观博易 / 性别平面下拉 | `moka.flat-select.trusted-focus.v1`，共享组件 | `男 / Male` → 真实选项 `男/Male` |
| DeepSeek / 意向工作城市 | `moka.deepseek.location.trusted-focus.v4`，公司控件例外 | `北京` → `北京市` |

三项都是可编辑 INPUT + Moka Select/Dropdown 结构；选项发现先打开并关闭空控件，自然触发网站必填红字。
填写阶段再执行一次可信打开、一次叶子点击、一次标题失焦提交；没有注入错误 DOM，也没有使用预览制造校验。
立即和额外五秒后的生产观察均保持原 stableFieldKey、正确展示值及 `validationMessage=null`；
弹层关闭、注册回读和规划回读全部通过，其他字段值摘要不变。
执行期间 AI Offer 保持同一个前台标签，激活和导航事件为零，重试、刷新和整表重填计数为零。

同一修订包另测“深圳”不在微观博易真实列表：返回首选/备选均无匹配及北京、上海两项完整双语选项，
现场只读确认输入和展示仍为空、弹层关闭，没有擅自选别的城市。该错误路径不输出激活/导航计数，
不把前三次的隔离统计冒充这一反例的统计。

验收包 `background.js` SHA-256 为 `5ca5aedec90c5c64c9294ce5092c6ad88fe8ed401e0ff034723d1832786e7c9f`；
通过门禁后仅更新 registry 证据说明和文档，交互、观察、路由和回读逻辑与该包一致。
测试页全部关闭。本次没有修改提交事务、信息包协议、Gateway 或 AI Offer；没有发布正式插件或提交岗位。
自动化另覆盖两个无关公司 URL 的平面下拉交互/重建/清错、原生类型分流、同优先级歧义、错误控件、
外部弹层、重复城市和普通字段不能使用城市包含匹配等反例。共享平面下拉仅完成一个真实公司的验收，
其他 ATS/未知自定义面板仍需要独立证据，不能声称全部站点或整表投递通过。

最终检查：142 个测试文件、1,414 项测试通过；项目和控件运行时/共享 Driver 类型检查、文档版本检查、
插件构建、`git diff --check` 通过。版本仍为开发基线 `0.15.95`，未在本次验收中发布正式版本。

提交 MR 前已 rebase 到 `main=3df173e`（`0.15.96`），保留上游统一后台标签和职位入口改动。
TypeScript AST 对比确认上述八个生产控件函数未变，Driver/路由/城市事实/可信指针依赖文件也未变；
唯一手工冲突为两份验收记录同时插入文档，已同时保留。Rebase 后 144 个文件 / 1,448 项测试、
项目及控件类型检查、文档检查、插件构建和差异检查均通过；不将此表述为重跑真实页面或完整投递。

## 2026-09-03 tap4fun 毕业年月（已加载完整插件验收通过）

同日后续验收已完成前一条记录缺失的“真实字段红字 → 正式填写 → 红字清除”门禁。
证据见 [已加载插件验收报告](evidence/tap4fun-loaded-plugin-graduation-20260903.json)。
验证使用用户已加载的 `0.15.93` 本地构建，基础提交 `d87fe16`；观察器原型 SHA-256 为
`3a6181e345f88d7830624e67d8eff92d6c444953902b1e76f2b59510c94b6eeb`。

固定 tap4fun 申请页的“毕业时间（年月）”为可编辑 `INPUT[type=text]`、`readonly=false`，
稳定键 `basic.graduation_date.native`。仅对该字段使用合成测试年月，再执行可信全选、删除和 Tab
失焦，网站自己产生“这是必填项”及 `sd-Input-error-*`；没有注入错误 DOM/ARIA，没有点击预览或提交。

现场发现该错误节点嵌在包裹 input 的 label 中，观察器把它当成标签内容排除，并漏掉这句错误文案。
原型只允许明确的、无输入控件的错误节点穿过 label 后代过滤；普通标题、提示、相邻字段仍不算错误。
重新构建并重载同一个已安装插件后，正式观察器正确返回 `validationMessage="这是必填项"`。

本地验证面板通过插件现有 Bridge 仅下发 `browser.readback_form` 和 `browser.fill_form_fields`，
执行完整生产 `executeApplicationFillInstructions` 与 `page-control-runtime.js`，并始终关闭提交权限。
唯一 Driver 为 `generic.native.text.v1`，一次填写后回读 `2027-06`，字段错误节点和错误样式消失。
约 18 秒后的独立插件回读仍为 `2027-06`、`validationMessage=null`，其余字段值哈希保持一致。
单次 Bridge 填写含前后观察/截图共 6,654ms，不作为全站性能承诺。

`realPageGatePassed=true`；1,254 条回归、类型检查、文档检查和插件构建通过。
此记录只验收该控件及新增错误识别，不代表已提交岗位或全部站点控件都完成真实页回归。

## 2026-09-03 tap4fun 毕业年月原生文本分派（首轮部分验证，后续门禁见上条）

隔离工作树分支 `fix/native-graduation-text-20260903`，基础 `ef397a4` 加未提交本地原型。
URL 家族为 `https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/<job>/apply`。
完整脱敏证据见 [原始对比报告](evidence/tap4fun-native-graduation-20260903.json)。

真实字段“毕业时间（年月）”为可编辑 `INPUT[type=text]`，`readonly=false`、`disabled=false`，
无 combobox/ARIA popup 签名；`sd-Input-input-*`、`sd-Input-container-* string_info` 包装。
稳定键 `education.graduation_date.native`，相邻“毕业院校”为独立学校字段。现场首先发现事实层
未接受拼接身份中的空格分隔 `education` 标识，已有 `resume.education.0.endDate` 返回空匹配；
补齐整词边界后，生产工厂得到合成测试年月 `2027-06`，不产生日历元数据。

临时扩展原样提取生产 `stableApplicationObservation`、`instructionFromObservedField`、
`executeApplicationFillInstructions` 及其依赖，导入真实 registry/dispatcher，注入正式构建的
`page-control-runtime.js` 执行原生 Driver；非目标 Driver 仅设为一旦触达就失败的范围断言。
未启动产品后台监听器、任务轮询或配对。填值及两次延迟稳定观察均为 `2027-06`，唯一登记项
`generic.native.text.v1`、`background_tab`、`native_value_exact`；邻接字段哈希一致。
出生日期只读对照为 `moka.tap4fun.birth-date.trusted-pointer.v2`，本轮未执行它。

现场慢点为重复全表观察，不是日历重试。单次观察样式/可见性缓存仅限同步调用内部，后续快照
重新读取。优化前分派 18,354ms，优化后 1,937ms；观察从 3.8–7.7 秒降为 0.23–0.56 秒。
优化后验收源码集合 SHA-256 `465411cddf0ec7fe7383cfba935cbe0173ae1fc6369ac3c3828529ae9fe3d281`，
原生 Runtime SHA-256 `3be04a1a7e537fcd5bf95ff02751357f39151670eb9a37c836c668b864d515f1`。
此为单页实测，不是所有站点的时延保证。

边界必须保留：新页与仅限目标字段的 focus/blur、focusout、合成值填入后清空准备均未触发站点红字。
没有制造错误 DOM/ARIA，也未点击预览/提交来制造错误。因此虽然填值后的 `validationMessage=null`，
`validationObservedBefore=false`，不能声称已验证“原有必填错误清除”或 React 提交校验接受。
原始 `success=true` 仅指控件路由、填值、回读和隔离断言；外层验收状态为 partial，
`realPageGatePassed=false`。待自然保留的真实拒绝页面完成同控件复测后，才能解除原型门禁。

生产阶段仅记录 input/change（合成事件），没有点击、滚轮、滚动或其他 Driver 执行。
所有测试页已关闭、临时扩展已卸载、现有 Recruiting AI 扩展未替换；未配对、领取任务、上传、
预览或提交真实申请。最终 131 文件 / 1,250 用例通过，类型检查、文档检查、插件构建与差异检查通过。
本条不代表全部重构或整表投递验收通过，未提交 MR、未发布或部署。
## 2026-09-03 灿瑞来源选中后字段身份变化（独立原型真实控件验收通过，未发布）

- 分支：`fix/canrui-fill-convergence-20260903`，最初基于 `319038c`，现已 rebase 到远端 `main=4c95e16`。保留上游集中控件分流、共享原生观察器及 Driver 失败立即停止的规则，不重复引入旧执行实现。
- 实际失败：当日 10:17 的灿瑞任务停在填写阶段；来源执行后报“重新观察后回读不一致”，下一轮已没有缺项，却继续调用模型；最终错误被后续非法 JSON 覆盖。尚未点击最终提交。
- 真实页面初始只读检查：同一灿瑞 URL 家族，来源标题为“请选择信息来源渠道”；可编辑 `INPUT[type=text]`、`placeholder=请选择`，位于 `sd-Select-container-*` 和 `sd-Dropdown-container-*` 内，权威展示节点为 `sd-Input-display-value-*`。随后经用户授权在独立临时页验收该来源控件；未上传简历或点击预览/提交。
- 精确复现：现有来源 Driver 夹具原本已包含选中后清空 placeholder 的 DOM；新增测试调用完整生产 `observeApplicationPage`，修正前字段编号从 `other.请选择.combobox` 变成 `other.请选择信息来源渠道.combobox`，因此 `findDynamicReadbackField` 无法绑定同一字段。不是单凭展示值长度相等就认定回读成功。
- 原型改动：共享生产观察器中的来源语义槽固定为 `recruiting_source`，原生读回复用该观察器；仍由唯一的 `moka.recruiting-source.trusted-focus.v1` 负责交互，未改变注册、定位、可信指针、选择、失焦、弹层关闭或 Driver 成功条件。
- 兼容范围：旧来源答案只按精确来源标题及原稳定路径迁移；岗位绑定的答案保留原岗位、章节、行边界，不转成跨岗位答案。不复用无标题的旧 fieldId 或通用 `请选择` 岗位键。
- 编排边界：空值/未确认仍交给站点校验，不伪装成功；其他执行或回读失败立即返回具体字段失败并保留原页，不留下历史失败计数再请求模型。重复稳定键、消失目标、错误非空值不放行；模型非法 JSON 单独归类，不刷新或重填。
- 独立控件验收包 `canrui-source-acceptance-52d1c63` 由用户手动加载，`background.js` SHA-256 为 `04bb980545b12f960fee446973223003df4b8d1a1212189c93b9fc33e9bf8092`。直接打包生产观察器、指令工厂、集中分流、来源 Driver、注册回读和已知答案结束判断；移除产品启动监听器，不配对或领取任务。原型 `52d1c63` 与待审代码 `352ea2e` 的生产差异仅为下面记录的类型声明，无运行时行为差异。
- 真实验收于 **2026-09-03 13:58:49 Asia/Shanghai** 通过。新建后台临时页，先取消在线简历同步；通过页面正常打开空来源菜单并点击字段标题，自然触发“必填项未填写”。没有伪造错误 DOM/ARIA，也没有点击预览/提交制造错误。真实选项为 `IC芯启航`、`城市双选会`、`校园宣讲会/双选会`、`浦东新区青年人才直通车`、`其它`。
- 精确生产路径选择 `浦东新区青年人才直通车`，执行一次打开、一次真实选项点击、一次可信标题失焦提交；原有红字消失。立即及额外五秒后生产观察均得到相同值，placeholder 由 `请选择` 变为空，但 stableFieldKey 均为 `other.recruiting_source.combobox`；权威回读同时确认精确值、弹层关闭、校验清除。旧精确标题绑定答案成功复用；注册回读 `matches=true`，已知来源范围 `ready=true`、`nextKnownFactAction=null`，不再要求重复填写。
- 隔离断言：其他字段的值摘要不变；AI Offer 活动标签前后相同，运行期间激活事件为零，招聘标签始终在后台；导航、刷新、重试、全表重填计数均为零。本轮没有上传简历、运行完整投递任务、调用模型或点击预览/最终提交，不能将单控件通过表述为真实投递成功。
- [结构化验收摘要](evidence/canrui-source-identity-20260903.json) 已留存。本次来源身份修正的单控件真实页面门禁已通过，临时测试页已关闭；没有发布正式插件或部署 Gateway。

Rebase 后最终检查：136 个测试文件、1,331 项通过；文档一致性、项目类型检查、插件构建及 `git diff --check` 通过。
独立扩展严格类型诊断与 `4c95e16` 比较为 92 → 92、无新增诊断（不表示历史类型问题已清零）。额外检查发现并补齐公共 `ControlAdapterFailureReasonCode` 中的 `field_fill_readback_failed` 类型；这是类型声明修正，不改变临时验收包的运行逻辑。


## 2026-09-03 Garena 出生年月零年份恢复（已加载插件验收通过）

| 项目 | 证据 |
|---|---|
| 原型提交 | `b4ea4aa`，包含前置打开状态修正 `d70cfaa` |
| 已加载验收版本 | `0.15.92.2`；执行前后产品 Bridge 均确认该版本，非正式发布版本 |
| 验收包 background.js SHA-256 | `1ec03b37085f86c4c261bf197c14b4725c95503d176b35c7e607ae4fcbd1e0bc` |
| 验收 ZIP SHA-256 | `86360d0af3098fbf4bc7fa51e6e51a8bc3be253a7d3d71a7ac0ad0d68eb0b4a9` |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/garena/148076#/job/<job>/apply` |
| 字段签名 | 出生日期（年龄）；readonly `INPUT` 位于 `label.day_info` 和 Moka Dropdown；解析后 placeholder 可为空 |
| 原始失败 | `0.15.92.1` 中面板已打开却显示字面量 `0年`；只修正打开/关闭识别仍不能恢复选月 |
| 面板 | 一个外层 Dropdown 与嵌套 panel-menu 是同一弹层；一个 `0年` 标题、两个年份导航、十二个不同月份叶子，无月份标题和日期网格 |
| Driver 决策 | 保持 `moka.date-picker.trusted-pointer.v9`、`site_deterministic / background_tab`；精确租户例外在同一 Driver 内执行，不使用键盘、DOM 值写入或其他 Driver |
| 完成时间 | 2026-09-03 04:36:04 Asia/Shanghai |
| 权威回读 | 插件自动选择后的年月与原信息包预期一致，且不同于站点简历解析的旧值；控件校验无错，重新打开后年份正确且目标月份保持选中 |
| 安全边界 | 独立验收标签、在线简历同步未勾选；真实插件运行中未人工操作招聘页；未点击预览或最终提交 |

先只上传原失败任务的同一简历，在独立真实页复现 `0年`，再由用户已加载的完整插件执行同一候选信息包。
使用产品支持的 `browser.execute_batch_auto_apply_job` 本地验收入口：`localValidation=true`、
`reuseExistingTab=true`、`stopBeforeFinalSubmit=true`，最终提交、协议点击和验证码处理授权均为 false。
未人为补造其他答案或替代插件选择日期。执行前曾因新扩展尚未绑定而停止，随后通过正常 AI Offer
连接流程绑定，未确认投递授权或创建正式队列；重新执行才取得上述控件结果。

此前真实页原型证明一次唯一、启用且命中验证通过的双右箭头会将 `0年` 转为 `1901年`，旧字段值不变。
候选代码仅在此精确转移确认后继续既有年份标题、十年导航、目标年、目标月序列。自动化直接提取并运行
生产 Driver 和其 Runtime.evaluate 表达式，覆盖完整恢复链及异常转移、值提前改变、禁用/重复箭头、
其他租户、日精度和不完整面板的零写入或一次恢复后停止边界。

真实插件执行结束后的独立 DOM 检查确认输入值匹配信息包年月；再次打开后，年份标题与目标年份一致，
目标月份处于 `sd-basic-selected-*`，出生字段没有必填错误。这不是仅凭输入框瞬时显示或手动选月得出的
通过结论。原型当时的确定性预填先于视觉循环，所以后续只有缺失信息的视觉诊断不表示日期 Driver 未执行。
整表随后返回 `waiting_for_user_action / missing_information`，缺项为来源、语言和游戏/IP 经历等其他内容；
该结果不被记作整表成功，也不在本修复中裁定这些条件字段的必填性。

原型全量 118 文件 / 948 项通过，文档、项目类型与插件构建通过。合并最新 `main=3a87083` 时仅测试文件
发生冲突，保留双方测试；日期 Driver 函数体与已验收 `b4ea4aa` 完全一致，SHA-256 为
`e4b640a74a3a1e3db839a03a307c3123e609f68ee0cba4f325283f6e44aa257b`。主干已合入的站点校验编排不在本次
控件验收范围；本 MR 不撤销其行为。正式发布须在 MR 合并后从远端主干独立构建并标明正式版本，不能把
验收版本号或旧基线号当作新发布。此次没有 Gateway、AI Offer 后端、协议或最低插件版本变更，不需要服务重部署。

合并主干及证据登记后最终回归：124 个测试文件 / 1,126 项全部通过；`pnpm typecheck`、
`pnpm build:extension`（含 `check:docs`）和 `git diff --check` 通过。登记只补充证据和断言，没有改变
已经实测的日期交互代码。工作树构建仅检查可构建性，不作为新的正式插件发布。

## 2026-09-03 灿瑞来源标题误判与站点校验驱动提交

| 项目 | 证据 |
|---|---|
| 原型 | 隔离工作树分支 `fix/canrui-field-validation-20260903`，基于远端 `main=223abfd`；未发布 |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/canrui/<campaign>#/job/<job>/apply` |
| 真实字段 | “请选择信息来源渠道”，可编辑 `INPUT[type=text]`；Moka `apply-field-*`、`sd-Input-input-*`、`sd-Select-container-*`、`sd-Dropdown-container-*` |
| 原始失败 | 来源展示节点已非空、无局部错误且唯一“预览并提交”可用；旧全字段根正则仍从标题截取“请选择”，提交前据此报控件未确认 |
| 原型回读 | 在同一真实页执行生产 `fieldValidationMessageFor` 及其原样归一化/可见性依赖；原来源展示值保持一致，`validationMessage=null`，最终按钮仍启用 |
| Driver 决策 | 继续唯一 `moka.recruiting-source.trusted-focus.v1`，`site_deterministic / background_tab`；不更改定位、指针、选择或失焦提交序列 |
| 观察修正 | 只读取可见的局部错误节点、确切旧式 Moka 必填错误节点或 `aria-invalid/aria-errormessage`；不扫描整字段标题，不包含隐藏祖先内的错误 |
| 本地浏览器 | 真实浏览器点击无网络请求的本地表单：未知必填在初始规划中延后；第一次点击产生原生拒绝、接受提交数为 0；填写测试值后第二次接受提交数为 1、原生错误为空，按钮禁用 |
| 提交边界 | 真实招聘页仅只读验证，没有修改来源、上传、预览、提交、刷新或重新填表；本地浏览器只使用合成测试值 |

此问题属于观察器把标题误读成错误，不是来源 Driver 不能选择；因此原型的真实页验证执行的是实际
修正的只读观察函数，而不重复执行未修改的选择流程。回归夹具同时断言原 Driver 路由仍唯一、展示值
仍为权威值，覆盖可见错误、隐藏错误、关联 ARIA、邻接字段隔离和标题/提示/placeholder 负例。

通用提交流程的新增验证直接提取并运行生产预提交、初始填写、修复轮和最终提交函数：确认未知答案不
提前阻断、身份/页面安全检查保留、只有本次明确拒绝字段可修复，旧错误/无响应/歧义/成功均不重提。

后续完整性补充移除重复的确定性预填路径，空回读/提交未确认由单一逐字段循环记录并交给网站验证，
不将失败结果伪装成成功。混合拒绝先填写已知答案，再一次性返回剩余缺失答案；已知答案无法写入单独
报控件错误，诊断保留待补充标签。区间或关联字段先各执行一次再整体核对，不因第一项旧错误仍在而
反复填写第一项。已正确读回的值可在下一次受限提交中由网站清除旧错误。

本地真实浏览器补充覆盖三项同文案错误：只保留旧文本的点击产生 0 个新拒绝；网站隐藏后重新显示同文案错误
节点后准确识别“姓名、关系人姓名、部门/职位”，其中仅“姓名”有合成候选事实可补，其余两项一次性
分到补充信息。该测试实际发现并修正无字段容器控件继承兄弟错误、普通“关系人姓名”被误归为本人姓名
的两个边界。修正后不再把无关“模拟网站行为”控件加入错误集合，也不再将候选人姓名分给关系人。
原生探针还验证了可信目标点击门槛：程序调用 `checkValidity` 的预点击事件不算当前拒绝；本地浏览器
空表单点击记录原生错误且接受数 0，填入合成值后接受数 1、错误为空、按钮禁用。

同文案探针依赖本次可信点击后的局部 DOM/ARIA 重新断言，而不是单纯读取仍在的红字。网站完全不产生
新事件或可观察更新时仍视为结果未知，不能据此重复提交。真实灿瑞页在补充后再次只读核对来源字段：
原选中值不变、`validationMessage=null`、预览按钮启用，未触发任何真实提交。

外置 `aria-errormessage` 的错误仍只归属明确引用它的无效字段；React 重建后的新 selector 由完整新观察
按稳定键绑定。自定义错误只重放当前事务最多 2000 条变更记录，绑定缺失/歧义不猜测；原生 invalid
事件也按当前真实控件重新绑定。单元回归覆盖上述引用和替换边界。

前一阶段验证：118 个测试文件 / 960 项通过，`pnpm check:docs`、`pnpm typecheck`、
`pnpm build:extension` 和 `git diff --check` 通过。项目既有 `typecheck` 仅覆盖 `src`；另对扩展入口执行
严格 TypeScript 检查并与原样远端基线比较，基线 143 条、当前 141 条遗留诊断，新增诊断多重集为空。
上述证据不等同于打包扩展对所有 ATS 的端到端验收；没有替换用户加载的插件，也未在真实岗位最终提交。
本地构建仅校验可打包性，不作为带远端提交标识的正式发布包交付。

### 同分支反例加固（2026-09-03）

本轮为只读观察、提交/暂停编排及执行面权限收紧，没有引入新的控件交互序列，也没有实际提交岗位。
在无网络副作用的本地浏览器夹具使用生产观察器与探针：第一次保留旧错误，0 个新拒绝；第二次仅把
三个旧错误变红，仍为 0；第三次对三个错误执行隐藏→显示，准确收集姓名、关系人姓名、部门/职位，
仅姓名进入已知事实修复，其余两项进入补充集合。三次可信 click 均在本地页面发生，没有操作真实表单。

自动回归直接运行生产函数与两份实际序列化定位器，覆盖完整回执/否定/条件/验证码/上传/隐藏子节点/
按钮嵌套文本、原生拒绝与回执冲突、旧错误颜色/属性/React 重绘、禁用按钮、直接提交控件重建、
通知“确定”与信息不一致确认的区别、保存检查点失败零点击、全局网络错误不解锁重提、混合缺失信息
与选项不可用的汇总、缺失信息原页续跑，以及已知目标消失时保守停止。

本阶段籍贯 Driver 保留原前台登记与原交互，当时未完成后台验收；只删除自动抢前台行为，后台条件不满足
时在附加调试器/指针前返回 `unsupported_execution_surface`。后续真实后台验收见下节。历史 Style3D 记录中的无 click 预览重试、
点击后才登记检查点是旧版本证据，当前分别改为不重试和点击前持久化。

本轮最终验证：120 个测试文件 / 1,059 项全部通过；文档一致性检查、项目类型检查、扩展构建和
`git diff --check` 通过。扩展严格类型诊断仍为基线 143 条 / 当前 141 条，新增诊断多重集为空。
这是本地编排回归和可构建性验证，不是全部真实 ATS 的投递验收；未提交 MR、未发版、未部署服务。

## 2026-09-03 JXW 籍贯后台执行验收

| 项目 | 证据 |
|---|---|
| 原型 | `fix/canrui-field-validation-20260903`，基线 `223abfd` 加本地候选；未发布、未最终提交 |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/jxw/166492#/job/<job>/apply` |
| 隔离验收包 | 临时扩展 `pihbmghkjhknfdpcamfpaoeikhighikn`；不配对、不轮询、不注入 AI Offer Bridge；只接受本机单控件按钮请求 |
| 最终验收包 SHA-256 | `c655b47bee35bf09f3b5978fdf4cc145515d9065f9c3fde4c8ccaada09fd7a64`（测试专用 `background.js`，非发布包） |
| Driver 源码 SHA-256 | `60b4e00b5aa6d24f47f9773f5b50b7029d11b0b94d7aaa3b1c4bae40d94d6f8f` |
| 控件 | 必填 `basic.native_place.native`；readonly `INPUT[type=text]`，placeholder `请输入籍贯`，Moka `sd-Input-readonly` / `sd-Dropdown-container` 祖先 |
| 权威值 | Moka 展示值与新页面观察；层级语义策略保留省、市、区含义，允许行政后缀显示差异 |
| 无副作用 | 三次成功执行前后活动标签均为 AI Offer；目标始终 inactive，标签激活事件/导航事件为空，其他字段回读哈希不变；无上传、预览、最终提交 |

首先在真实后台页运行原代码：注册命中但返回 `unsupported_execution_surface`，值保持为空。这证明
前一阶段的保护确实阻止了执行，而不是证明籍贯不能后台操作。随后只在候选中把准备阶段改为
`Emulation.setFocusEmulationEnabled(true)` 加 `Input.setIgnoreInputEvents(false)`，保留原 Driver 的
实时目标探测、可信滚动、逐级唯一选项、确认和权威回读；没有引入 DOM 写值、键盘或替代 Driver。

验收包直接编译生产 `stableApplicationObservation`、`instructionFromObservedField`、
`executeMokaNativePlaceInstructionWithTrustedPointerDriver` 和 `registeredControlReadbackMatches`。
测试构建仅导出这些函数并移除后台配对/轮询启动代码，不替换 Driver 函数体；因此真实页使用的定位、
坐标、事件和回读与生产候选一致。合成值不代表用户资料，未填写其他字段。

1. 三段式：`广东省 深圳市 南山区` → 页面 `广东 深圳市 南山区`；5 次可信点击（打开、省、市、区、确认）、
   3 次可信滚动，`committed`；Driver 仅在弹层关闭和局部校验清除后成功，新观察层级回读也为真。
2. 同一已填页面再次核对：`already_committed`，点击和滚动均为 0，值及其他字段不变。
3. 三段式及幂等验收通过后登记为 `requiresForeground=false / background_tab`，重载仅测试包，打开
   同一 URL 的空白测试页验证两段式：`湖南省 长沙市` → `湖南 长沙市`；4 次点击、3 次滚动，
   `committed`；额外独立权威回读明确为 `popupClosed=true / validationCleared=true`，新观察匹配为真。

所有实际执行记录均为 `retryCount=0 / reloadCount=0 / fullFormRestartCount=0 / fallbackDriverCount=0`。
本次变更只补齐后台执行面，不改变地区事实要求，不代表所有 Moka 租户或完整投递队列均验收通过。
自动回归新增后台入口、焦点/执行/附加失败清理、已填不同值拒绝、弹层不开只点击一次及无关控件拒路由：
121 个测试文件 / 1,069 项通过；文档一致性、项目类型、扩展构建、diff 检查通过，扩展严格类型检查
基线 143 条 / 候选 141 条，新增诊断为空。测试申请页已关闭；未改动现有 Garena 验收扩展或线上服务。
本机测试服务已停止、控制台已关闭。清理临时扩展时 Chrome 被另一个文件选择操作占用，未继续争抢
窗口；临时扩展暂保留安装态（无配对、无轮询、无内容脚本），不能把它当成正式插件或发布验收包。

## 2026-09-03 中兴意向工作城市控件验收通过

- URL 家族：`https://app.mokahr.com/campus-recruitment/ztehr4/150449#/job/<job>/apply`。
- 真实页已观察到唯一必填“意向工作城市”，可编辑文本 INPUT，placeholder 为“选择意向工作城市”，具有 `sd-Input-input-*`、`sd-Select-container-*`、`sd-Dropdown-container-*` 签名；省份标题与城市叶子分离，权威值位于 `display-value`。
- 原失败记录是 `location_selection_unconfirmed` 且 `availableOptions/requiredFieldRequests` 均为空。旧 URL 路由未登记该 campaign，故没有进入已验证的 Moka 城市选项读取 Driver。
- 隔离原型登记 `moka.zte.location.trusted-focus.v1`，调用正式源码中的 `executeMokaLocationOptionDiscoveryDriver` 和 `executeDeepSeekLocationDriver`，仅新建后台测试页；不连接 Gateway、不读取任务、不调用预览/提交。
- 证据来源：用户手动运行获准加载的隔离验证器后提供完整日志，`test=ZTE city production-driver proof`、`verifierRevision=url-check-v2`、`stage=complete`、`success=true`。浏览器工具先前拒绝打开扩展内部页面，本次未绕过限制；结论依据用户回传日志，而非声称工具亲自执行该页面。
- 源码基线：`223abfdf2c06ec31583365caf4cd0bb3113f06c8` 加本次 `fix/preferred-work-city-priority-20260903` 工作树修改。验证器直接导入该工作树的正式 Driver、路由与策略；当次 `verify.js` 的 SHA-256 为 `d2a4edbc69850f26bd9f8fc52e87b900acc71cab5b07acce567e131fe263dd7d`。
- 只读发现通过：实时叶子为 `["深圳市"]`；空值保持为空、弹层关闭、`leafClickCount=0`。此阶段 `validationCleared=false` 是必填空值的预期状态，不应误判为选择失败。
- 无偏好、无交集两组测试均返回 `MISSING_INFORMATION` 和同一实时列表 `["深圳市"]`，没有编造或截断选项。
- 选择通过：使用合成测试事实（当前城市“深圳”、备选“广州”，不读取真实候选人档案），策略选中 `candidate.basic.currentCity=深圳`；正式 Driver 最终权威回读 `actual=深圳市`、`popupClosed=true`、`validationCleared=true`，`failureCode=null`。
- 事件序列为准备 → 注册观察器 → 可信点击打开 → 可信点击城市叶子 → 可信点击字段标题提交 → 回读已提交。账本为打开、叶子、提交各一次；`trustedPointerClickCount=3`、`nativeEventClickCount=0`、`retryCount=0`、`reloadCount=0`、`fullFormRestartCount=0`。没有输入框直接赋值或通用 Driver 兜底。
- 安全边界：`submitted=false`、`activeTabPreserved=true`；验证器不连接 Gateway、不领取任务、不点击预览/提交，测试自建后台页在结束后关闭。
- 验收范围仅为该 URL/DOM 签名的城市控件及其缺失信息分支，不代表完整岗位投递成功或所有站点均完成真实页验证。该真实页仅提供“深圳市”；“深圳、广州同时可选时优先深圳”等组合由自动化策略测试覆盖，不能归为本次真实页证明。

完整优先级、备选存储和配套发布边界见 [意向城市策略](PREFERRED_WORK_CITY_POLICY.md)。

## 2026-09-03 作业帮日历嵌套容器回归修正

| 项目 | 证据 |
|---|---|
| 验收状态 | 用户加载本地验收包后确认成功；只读 Gateway 核对同一版本的自然授权投递为 `succeeded`，站点确认“投递成功” |
| 源码提交 | `b0e07d65f8bf1a3a1e589d8ba72f437726de7e5f`，基于远端 `main=fb170b2` |
| 验收包 | 显示版本 `0.15.91.1`，名称 `Recruiting AI（日历验收 b0e07d6）`；仅生成 manifest 的名称/版本与源码发布元数据不同，非正式发布 |
| ZIP SHA-256 | `782cae5fa9051ecef179cf21317aab39204edced3b693fdb730cbc1ae580ad5b` |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/<job>/apply` |
| 控件 | 教育背景“毕业时间”；readonly INPUT；placeholder `日期（年月日）`；字段所属 Moka Dropdown |
| 真实结构 | 一层 `sd-Dropdown-dropdown-GmACl` 包含一层 `sd-panal-menu-wrapper-8Q6m4`，唯一年月标题、一个日期表格；原始选择器命中数为 2，但只有一个日历 |
| 引入回归 | MR !111 / `35fd776` 把 `.find(rendered)` 改为 `.filter(rendered)` 后强制原始节点数等于 1，把正常嵌套误判为空状态 |
| 修正 | 恢复外层可见容器观察，仅归并包含链；并列独立弹层仍拒绝。保留 v9 Driver、结构准入、精度门禁、补充信息身份、渐进滚动、指针序列和回读 |
| 自然投递批次 | `e00b887c-edeb-461f-911c-4b6bd27ed77e` |
| 岗位任务 | `3a012145-e214-4811-8d96-850bcdec97af` |
| 完成时间 | 2026-09-03 02:25:07 Asia/Shanghai；Gateway `reasonCode=null`，`siteConfirmation=投递成功` |

代理前置检查仅在独立测试页打开日历、选择并读取完整日期，确认弹层关闭和字段无局部校验错误；没有
上传、预览或提交。这一步使用浏览器操作工具，不被单独当作打包插件后台验收。随后用户自行加载上述
验收包并执行正常授权投递，Gateway 关联设备明确上报 `0.15.91.1`，原岗位取得成功终态；代理没有为验收
再次提交该岗位。此证据覆盖本次作业帮日精度场景，不宣称所有租户、所有视口均已实测。

回归测试直接提取并执行生产 `readState` 的 Runtime.evaluate 表达式，不手工预设 popupCount。
12 个 DOM 用例在旧代码中 6 失败 / 6 通过，修正后全部通过；覆盖日/月/年嵌套、原单层结构、隐藏旧层、
其他字段隔离、真正双弹层、双日历面板、无关菜单以及已打开面板的零点击只读观察。功能提交全量
114 文件 / 885 项通过；后续登记与本文仅补充证据和语义说明，不改动已验收的交互代码。

## 2026-09-02 xTool 重复经历重绑与视口外年月端点

| 项目 | 证据 |
|---|---|
| 取证状态 | 测试环境生产失败与同一登录态真实申请页完成只读复核；候选实现自动化通过，真实草稿写入/年月选择待用户确认 |
| URL 家族 | `https://xtool.jobs.feishu.cn/(index|campus|<scope>)/resume/<jobId>/apply` |
| 生产失败 | 两条项目经历已建立，但 `project[0].project_name.native` 等字段在执行时报告“字段已从页面消失”；旧逻辑按非必填跳过，提交后站点才显示项目名称与教育起止时间必填，修复轮次再次命中同一失效身份 |
| 文本控件签名 | 根 `formily-item-project_list`；每条项目卡包含 `data-form-field-name=name/role/link/desc` 和对应 i18n 名称；重复卡没有唯一 DOM id |
| 日期控件签名 | 教育、工作/实习、项目根内 `data-form-field-id=start_end_time`，其下两个 `throne-biz-date-range-picker-input` 端点 |
| 视口证据 | 真实页视口高度 709px；教育年月端点位于当前视口上方，第二条项目结束区块位于视口下方；旧 Driver 在坐标读取前没有滚动，返回 `control_not_clickable` |
| Driver 决策 | 文本使用 `xtool.formily-repeat-native.v1`；年月使用 `feishu.month-period.trusted-pointer.v3`；两者均为后台 `site_deterministic`，没有通用或刷新兜底 |
| 最终提交 | 只读复核未填写字段、未上传文件、未点击“提交简历” |

真实 DOM 表明失败不是信息包缺项目名称或日期：生产诊断中预期值已经存在，失败发生在控件绑定和点击
准备阶段。候选实现的重复字段 Driver 每次按区块根、重复项序号和语义属性重新定位，只执行一次写入，
React 同步重建后从新节点读回；年月 Driver 同样忽略旧 selector，按稳定键重新绑定目标并只滚动一次，
随后才读取实时点击点。自动化覆盖两条嵌套项目卡的重复 id、第二条字段精确命中、输入事件期间同步重建、
新节点权威回读、重复项缺失零写入，以及视口外第二条日期端点的一次滚动和命中验证。

## tap4fun Moka 紧急联系人第三方语义隔离

| 项目 | 证据 |
|---|---|
| 取证状态 | 生产失败记录与同一登录态真实申请页完成只读核对；未填写或清空字段、未上传文件、未点击“预览并提交” |
| 取证时间 | 2026-09-02，Asia/Shanghai |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/tap4fun/<campaign>#/job/<jobId>/apply` |
| 真实字段 | “姓名”“紧急联系人姓名”“紧急联系人与你的关系”“紧急联系人电话号码”同时存在，后三项均由页面标记为必填；页面存在唯一“预览并提交” |
| 紧急联系人姓名签名 | `DIV[class*=apply-field-]` 的直接标题兄弟节点为“紧急联系人姓名”，控件为可编辑 `INPUT[type=text]`，placeholder 同为“紧急联系人姓名”，原生 `required=false`，必填性来自字段根内 `class*=required-asterisk` 标记 |
| 生产异常证据 | 同一投递返回的七项补充信息包含紧急联系人关系和电话，却遗漏紧急联系人姓名；该姓名控件已被写成候选人本人姓名，证明非空判断掩盖了错误事实路由 |
| 根因 | 页面观察先对 intrinsic placeholder 执行包含“姓名”的短匹配，完整“紧急联系人姓名”被截断为“姓名”，稳定键进入 `basic.full_name`，随后候选人本人姓名被当作权威事实写入 |
| 修复边界 | 先保留字段根内完整第三方标题，再生成 `third_party.name/relationship/phone` 稳定语义；第三方字段不接受候选人本人姓名、电话或邮箱，只接受当前岗位或用户确认资料中的精确字段事实 |
| 污染恢复 | 必填第三方姓名、电话或邮箱已非空但与候选人本人身份相同，且没有精确补充事实时，仍视为缺失并与其余必填项一次性返回 AI Offer；已确认的精确字段事实可覆盖旧错误值 |
| Driver 决策 | 可编辑原生文本控件保持唯一 `generic.native.v1` 路由；只有精确补充事实存在时才执行。只读或自定义控件不进入该 Driver，也不增加 tap4fun 专用写入兜底 |

真实页只读复核确认字段标题、必填标记、原生输入签名及唯一最终按钮均与回归夹具一致。测试同时覆盖
空白紧急联系人三项一次性回传、旧版本人姓名污染回传、精确补充答案覆盖，以及不同的既有人工联系人
值保持不动。该修复属于跨站点第三方事实隔离，不依赖 tap4fun 租户名称；Moka DOM 证据只用于保留完整
可见标签和选择既有原生 Driver。

## xTool 飞书经历年月区间与关系人缺失信息

| 项目 | 证据 |
|---|---|
| 取证状态 | 同一登录态真实申请页完成控件级交互；只修改草稿年月，未点击“提交简历” |
| 取证时间 | 2026-09-02，Asia/Shanghai |
| URL 家族 | `https://<tenant>.jobs.feishu.cn/(index|campus|<tenantScope>)/resume/<jobId>/apply` |
| 年月控件签名 | `DIV.throne-biz-date-range-picker-wrapper` 下两个可见 `DIV.throne-biz-date-range-picker-input`；字段根为 `data-form-field-id=start_end_time` |
| 弹层签名 | 唯一 `DIV.throne-biz-date-range-picker-panel`；年份入口 `.ud__picker-panel-header-btn`；年份和月份叶子均为 `.ud__picker__cell-interactive-area` |
| 可信动作序列 | 打开唯一端点 → 展开年份面板 → 精确选择唯一年份 → 精确选择唯一月份；每步重新读取实时命中点 |
| 权威回读 | 两个端点分别回读精确 `YYYY-MM`；第一个端点完成后页面提示“请填写完整时间”，第二个端点完成后该提示消失且弹层关闭 |
| 原始路由缺口 | 已登记观察仅识别 `education[*]` 的旧 `atsx` 标签和数字 scope URL；`index` 路径以及工作/实习、项目经历没有进入同一年月 Driver |
| 信息包缺口 | 源简历的 `dateRange.current=true` 在候选信息包投影中被丢弃，导致工作/项目只有开始年月、没有结束年月 |
| 关系人签名 | 模块标题“与公司员工是否有亲属关系（如有）”；三个输入分别提供 `data-form-field-i18n-name=姓名/部门/职位/与本人关系` |
| 关系人原始错误 | 模块标题未列入区块标题集合且祖先搜索深度不足，三个字段被错误继承前一“语言能力”区块；“姓名”存在误用候选人本人身份事实的风险 |
| 修复边界 | `feishu.month-period.trusted-pointer.v2` 扩展既有 Driver 到教育、工作/实习和项目；关系人字段归入独立 `relation` 区块，缺值时生成三个结构化补充请求，不借用候选人本人信息 |

真实页验证证明的是同一种月份控件可以稳定操作，问题不在鼠标事件能力。正式实现保留唯一年月 Driver，
通过 URL、区块、重复项序号和起止端点建立稳定身份；旧 `atsx` 变体和当前 `throne` 变体在注册表中作为
同一 Driver 的两种已验证签名，任一签名不唯一即失败关闭。第一个端点已精确回读但另一端仍空时允许
继续完成同一范围；范围两端均有值后必须同时满足精确回读、弹层关闭和局部校验消失。

关系人字段只有页面明确呈现必填错误时才阻塞。三个字段一次性返回
`required-field-request.v1 / candidate_information_missing`；页面标为“如有”且三个字段均为空、没有必填
错误时仍保持可选，不主动询问。该验收未输入关系人信息，也未触发最终提交。

### 2026-09-02 xTool 年月弹层动画命中修复

同一 xTool 申请页再次复现生产错误
`feishu_month_period_control_interaction_failed:year_toggle:target_not_clickable`。第二个年月端点刚打开时，
年份标题已经渲染在弹层顶部，但第一次 `elementFromPoint` 暂时命中弹层外的 `ud__native-input`；动画稳定后
重新读取同一唯一年份标题，命中恢复为 `.ud__picker-panel-header-btn` 自身。原 Driver 在第一次读数后立即
失败，问题不在信息包，也不是年份或月份选项缺失。

原型分支 `fix/xtool-calendar-hit-surface-0.15.83` 沿用 Moka 日期 Driver 的动态 DOM 原则：每个可信点击前
有限次只读重定位，目标歧义立即失败；轮询期间不发送点击，不刷新、不重开、不重填，也不切换 Driver。
同一原型序列在真实控件依次完成开始端点、年份、月份、结束端点、年份、月份；最终两个端点分别精确
回读 `2025-09` 和 `2026-09`，弹层关闭且“请填写完整时间”校验消失。月份标签同时按数值解析，兼容
`9月` 与 `09月`，旧 `atsx` 的 `data-cy=09` 仍保持补零匹配。全程未填写其他字段、未上传文件、未点击
“提交简历”或任何最终提交入口，验证结束后测试页已关闭。

### 2026-09-02 xTool 动态字段身份与工作经历根节点复核

生产失败记录显示，关系人“部门/职位”和“与本人关系”的补充值在动态表单重建后使用了旧 `field-N`；
同一序号此时已指向教育经历“专业”。关系区块标题自身包含“关系”，旧语义顺序还把叶子“姓名”先判成
`relationship`，生成 `relation.relationship.native#0/#1` 两个不稳定键。执行器的旧 selector 校验读取到
过宽祖先文本，因此没有阻止跨区块写入。

在同一 xTool 登录态真实申请页只读复核确认：教育“专业”的 i18n 标签唯一；关系区块三个输入分别提供
`data-form-field-i18n-name=姓名/部门/职位/与本人关系`，其中“部门/职位”和“与本人关系”分别只能解析为
`relation.department_position.native` 与 `relation.relationship.native`，与教育 `major` 不同；工作经历真实根
节点为 `formily-item-works_list`，页面年月控件仍是已完成真实交互验收的 `throne-biz-date-range-picker` 变体。

回归夹具把两个关系动作的旧 selector 故意指向教育“专业”：正式重新绑定后两个动作只命中各自唯一关系
输入，专业收到零次 `input/change`；移除关系目标后，执行返回字段消失且专业仍收到零次写入。另一个负例
证明带稳定键的字段不会读取同序号 `job.requiredField.field:field-N`。本次真实页复核没有填写或上传任何
候选人信息，没有点击“提交简历”，复核后关闭测试标签。

## xTool 飞书最终提交实时命中与事务时序

| 项目 | 证据 |
|---|---|
| 取证状态 | 生产失败记录与同一 URL 家族的用户登录态只读 DOM 已核对；未修改字段、未点击“提交简历” |
| 取证时间 | 2026-09-02，Asia/Shanghai |
| URL 家族 | `https://<tenant>.jobs.feishu.cn/<scope>/resume/<jobId>/apply` |
| 生产终态 | 表单填写已收敛到 `final_review`，最终返回 `submission_outcome_unknown`；错误为“CDP 无法确认最终提交按钮的实时点击位置” |
| 按钮签名 | 唯一、可见、启用的 `BUTTON[type=button].atsx-btn.atsx-btn-primary.atsx-btn-lg`，精确文案“提交简历” |
| 只读命中 | 真实页按钮尺寸 120×40；可见区领先点与中心点均由 `elementFromPoint` 命中按钮自身 |
| 原始时序错误 | `submissionAttemptId` 在可信指针发送前落盘；单点实时命中失败后未发送点击，但异常收口仅凭该 ID 改写为 `submission_outcome_unknown` |
| 修复边界 | 点击前最多三次重新定位/滚动，每次在按钮可见交集内检查有限候选点；只有实时命中按钮才发送一次可信指针；指针发送后才落盘提交事务 |

坐标重新观察只发生在不可逆点击之前，不发送鼠标事件，也不刷新、重开或重填页面。任一候选点命中后
只发送一次 `mouseMoved → mousePressed → mouseReleased`；之后不再重新点击，只有站点终态对账。三次仍
无法建立实时命中时返回 `failed/preview_submit_not_opened`，诊断明确 `submitExecuted=false`，不得改写为
“提交已触发”或 `submission_outcome_unknown`。

当前登录态真实页只验证了正式算法所需的唯一性、DOM/ARIA 签名、可见交集和多点实时命中，没有执行
最终点击。完整打包插件在本地受控页补充两条浏览器端到端回归：正常路径中预览和确认按钮各收到一次
`isTrusted=true` 的完整点击并返回成功回执；透明遮挡覆盖按钮全部候选点时，三次实时命中均失败，页面
收到的按钮鼠标事件为零、站点回执为零，插件返回 `failed/preview_submit_not_opened`、
`submitExecuted=false`，且轨迹只包含三次点击前观察。下一次用户授权的自然投递用于验证完整站点回执，
不能为验收重复提交真实岗位。

## xTool 飞书非必填字段熔断与正额度提示

| 项目 | 证据 |
|---|---|
| 取证状态 | 生产失败记录、脱敏截图与同页登录态只读 DOM 已核对；未修改字段、未点击“提交简历” |
| 取证时间 | 2026-09-02，Asia/Shanghai |
| URL 家族 | `https://<tenant>.jobs.feishu.cn/<scope>/resume/<jobId>/apply` |
| 生产终态 | 填写阶段返回 `site_validation_blocked`，没有进入预览或最终提交 |
| 必填状态 | 最后一轮诊断 `requiredBlockers=[]`、`missingFields=[]`，页面存在唯一可用“提交简历” |
| 原始熔断 | 两次动态“教育经历 · 结束时间”无回读变化后，第一次处理“语言能力 · 姓名”即被跨字段累计为第三次无进展并停止 |
| 提示结构 | 唯一 `role=alert` 为 `ud__notice-info`，文本明确“还可以投递 2 次”；不是必填或额度耗尽错误 |
| Driver 决策 | 不新增或切换控件 Driver；修复通用填写调度和提交门禁。必填控件仍由注册表选定的唯一 Driver 处理 |

现场失败证明旧 `unchangedActionStreak` 在字段之间共享，而且发生在非必填失败跳过之前。两个不同日期
动作的失败次数因此被带到后续语言字段；虽然页面已经没有必填阻塞，第三个动作仍将任务终止。新的
策略使用 `stableFieldKey + expectedValue` 对必填字段独立计数：同一必填字段连续三次普通回读失败才
熔断；已登记的必填自定义 Driver 仍保留其 fail-closed 边界。非必填字段第一次执行或回读失败后立即
加入本轮排除集，不重试、不占用必填熔断计数，也不阻止提交。

同一登录态申请页的只读 DOM 验证确认：页面存在唯一“提交简历”，没有可见空必填控件；唯一 alert
为信息级正额度通知。候选分类规则在该实时节点上得到 `positiveQuota=true`、`blocks=false`；额度为 0、
真实必填文案、显式错误/invalid 表面继续阻塞。测试未输入或更改候选人数据，未触发上传、预览或提交。
完整打包插件的自然投递终态仍由用户下一次已授权任务验收。

该生产证据同时暴露了更早的风险边界：页面已经没有必填阻塞时，旧策略仍会仅因简历或信息包存在
可追溯事实而主动尝试空的非必填字段，增加控件错误和错误熔断的机会。后续全局策略改为可选字段默认
零新增：简历推导、候选人信息包和跨岗位复用资料全部不能触发写入；只有用户为当前岗位当前字段明确
确认的答案（包括当前岗位已确认的意向城市）才能进入规划。门禁覆盖确定性预填、视觉模型字段输入和
动作执行三层，页面已有值保持不变；这项策略修正不新增或切换控件 Driver。自动化负例验证普通候选人
事实和跨岗位资料均产生零动作，正例只接受当前岗位精确字段答案。本文不据此声明新的真实页写入验收。

进一步核对准备阶段后确认，两条空项目卡由旧逻辑按信息包中的项目数量主动点击“添加”创建，而不是
xTool 初始页面的必填要求。当前实现已删除两个正式投递入口中的按简历数量扩展行为；底层动态区块准备
原语也改为默认零点击，只有调用方提供“当前页面明确要求该区块”的证据才允许最小扩展。回归夹具证明
项目目标数为 2、但没有明确必填授权时，“添加”事件计数仍为零。

## xTool 飞书职位详情页阶段识别与入口跳转

| 项目 | 证据 |
|---|---|
| 取证状态 | 公开详情页 DOM、真实入口和登录跳转已验证；未登录、未填写、未提交 |
| 取证时间 | 2026-09-01，Asia/Shanghai |
| URL 家族 | `https://<tenant>.jobs.feishu.cn/(index|campus|<tenantScope>)/position/<jobId>/detail` 及等价 `position/detail/<jobId>` 路由 |
| 页面阶段 | 详情页含职位描述/工作职责/职位要求，无可见申请表控件；稳定分类为 `job_detail` |
| 入口签名 | 唯一可见启用 `BUTTON[type=button].apply-block-applyBtn`，精确文案“投递” |
| 跳转结果 | 点击入口后进入 `/index/login?redirect_path=/resume/<jobId>/apply`，出现手机号码、验证码、获取验证码和登录控件；稳定分类为 `login` |
| 安全边界 | 仅点击公开职位详情页入口；没有输入手机号或验证码，没有填写申请表，没有点击最终提交 |

线上失败记录显示，已安装版本在详情页 React 内容出现前只执行一次入口检测；未匹配后返回正常并进入
表单视觉收敛，零字段页面被误判为最终复核，最终以 `preview_submit_not_opened` 结束。该证据证明根因是
页面阶段门禁缺失，而不是最终提交按钮或候选人资料问题。修复后所有招聘页先执行通用阶段分类；同一
URL 的 React 空壳与详情 DOM 使用不同页面状态指纹，稳定读数会重置。飞书 Entry Driver 仅在稳定
`job_detail` 后等待唯一入口，点击后再次分类，并且只接受稳定 `login` 或 `application_form`。

补充抽查原力灵机租户时，表格链接 `/<tenantScope>/position/detail/<jobId>` 会规范化为
`/<tenantScope>/position/<jobId>/detail`。页面两次稳定识别为 `job_detail`，唯一可见启用“投递”入口
跳转至 `/<tenantScope>/login?redirect_path=/resume/<jobId>/apply`；登录页出现手机号码、验证码、获取
验证码和登录控件。该真实路由族已纳入飞书专用 Entry Driver，不再仅依赖通用入口兜底。

### 跨站点页面阶段抽查

1. 游卡 Moka `/job/<jobId>/apply` 真实页已渲染 48 个可见表单控件、姓名/手机/邮箱三类身份字段和
   唯一“预览并提交”，同时存在可见手机号验证码登录层；间隔读取两次均得到
   `formDetected=true`、`loginRequired=true`、`pageStage=login`。登录门禁优先，插件不得操作底层表单；
2. 原力灵机飞书详情页有两类职位详情文本证据、零表单控件和唯一“投递”；间隔读取两次均得到
   `pageStage=job_detail`。入口跳转后的租户登录 URL 与手机验证码控件一致得到 `pageStage=login`；
3. 两个页面均未输入手机号、验证码或候选人资料，未上传文件，未点击预览或最终提交。

## 0.15.70 VWA 隐私协议确认（真实 Driver 交互通过）

| 项目 | 证据 |
|---|---|
| 取证状态 | 已在用户明确授权后，用当前源码构建的同一 Driver 序列完成两条协议确认；两条原生 checkbox 均稳定回读为真，满足控件真实页门禁 |
| 取证时间 | 2026-09-01，Asia/Shanghai |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/vwa/<campaign>#/job/<job>/apply` |
| 字段语义 | “我已阅读并同意《隐私协议》”与“大众汽车集团（中国）招聘隐私政策”两条独立授权文本 |
| 控件签名 | 原生 `INPUT[type=checkbox]`；原生 input 位于无文案的 `label.sd-Checkbox-container-*`，协议文案位于同一单复选框行的兄弟节点；input 没有 `required`、`aria-required` 或 `aria-label` |
| 弹窗结构 | 标题“隐私协议”；正文由 `https://public-cdn.mokahr.com/MokaPrivacyPolicyV4.html` 跨域 iframe 承载；底部唯一按钮文案为“我已阅读并同意” |
| 原始错误 | 旧执行器只从 `input.labels`、最近 `label` 和立即父节点取文案，无法稳定绑定空标签复选框；候选 Driver 初版又把 `sd-Modal-modal-header-*` 标题栏误选为弹窗根节点，导致在标题栏中查找确认按钮并错误进入滚动分支 |
| Driver 分流 | `generic.consent-confirmation.trusted-pointer.v1`；通用协议语义 + 唯一原生/ARIA checkbox + 后台可信指针/滚轮，不包含 VWA/Moka 站点选择器 |
| 权威回读 | 协议弹窗关闭，且对应实时原生 `checked` 或标准 `aria-checked` 稳定为真 |
| 最终提交 | 未填写或更改候选人资料，未点击“预览并提交”或最终提交；验收结束时 URL 仍为原 `/apply` 路由且“预览并提交”按钮仍存在 |

现场还确认同一页面可能同时存在登录弹窗协议和申请表协议，二者文案重复。Driver 不按页面
全局文案去重猜测，而是从已观察动作向上寻找最近的单复选框语义容器，并把多个匹配控件视为歧义失败。
“确认/确定/继续/我已阅读并同意”只在已识别的协议弹窗内部有效，页面最终提交按钮保持排除。

真实交互使用当前 TypeScript 源码构建的 ESM Driver，执行与插件运行时相同的
`inspect → trusted pointer/wheel → wait → readback` 状态机。第一条《隐私协议》直接命中唯一可用按钮：`inspect=2`、确认点击一次、
滚动和 10 秒等待均为零。第二条招聘隐私政策先等待弹窗稳定 1500ms，再对跨域 iframe 发送三次 8000px
分段可信滚轮，等待 10 秒后确认：`inspect=13`、复选框点击一次、确认点击一次。最终两条原生 `checked`
同时为真，弹窗均已关闭。

自动化同步覆盖 VWA 的真实标题栏/内容/页脚 class 结构、跨域 iframe、唯一“我已阅读并同意”、可用按钮
直接确认、按钮不可用时分段可信滚动和 10 秒等待、懒加载弹窗稳定期、直接确认不生效后的滚动重试、
非 Moka 标准 ARIA 复选框复用，以及最终提交负例。

## Moka 招聘信息来源选择后的失焦提交

| 项目 | 证据 |
|---|---|
| 取证状态 | 原始失败和完整字段提交边界已在用户登录 Chrome 的真实 Moka 页面复现；候选后台 Driver 的自动化门禁通过，完整打包插件自然投递回执待发布后验证 |
| 取证时间 | 2026-09-01，Asia/Shanghai |
| URL 家族 | `https://app.mokahr.com/(campus|social)-recruitment/<tenant>/<campaign>#/job/<job>/apply` |
| 字段语义 | 必填“请选择信息来源渠道”；现场目标为页面真实选项“浦东新区青年人才直通车” |
| 控件签名 | 可编辑 `INPUT[type=text]`；Moka `sd-Select-container-*` 与 `sd-Dropdown-container-*` 祖先；平面 `Menu-content-item → option-label` 选项 |
| 原始错误 | 精确叶子选择后 `display-value` 已显示目标值、弹层已关闭，但原生 `input.value` 仍为空且字段继续显示“必填项未填写”；旧执行器只对城市控件要求校验清除，因此把该状态误报为成功 |
| Driver 分流 | `moka.recruiting-source.trusted-focus.v1`；`site_deterministic`、`background_tab`，没有键盘、DOM 强写、原生 `.click()`、刷新、重试或其他 Driver 兜底 |
| 权威回读 | 精确 `display-value`、弹层关闭、字段局部必填校验消失三者必须同时成立 |
| 最终提交 | 未填写候选人资料、未上传文件、未点击预览或最终提交 |

真实页先通过打开空控件后点击其他字段复现“必填项未填写”。随后点击唯一精确
`option-label`，页面进入“显示值正确、弹层关闭、校验仍在”的原始失败状态；对同一字段唯一、非交互的
`title-*` 执行一次可信指针点击后，错误立即清除，显示值保持不变，原生 input 仍为空。这证明标题点击
是首次选择事务的必要失焦提交阶段，不是为了隐藏文案，也不是重新选择。

候选 Driver 固定执行一次打开、一次叶子选择和至多一次标题提交；每次动作前重新按字段语义绑定当前
React 节点并校验实时命中点。若目标显示但校验不清除，返回
`recruiting_source_control_interaction_failed / commit_validation_not_cleared`，不得继续最终提交。目标不在
唯一已打开弹层的实时选项中时保持 input/change 事件为零，并返回当前选项供 AI Offer 补充确认。

补充隔离检查使用匿名临时 Chrome 时，站点首先展示手机号验证码登录弹窗并覆盖申请表；该会话没有被
用于伪造控件通过证据，也没有输入账号。临时浏览器资料已移入废纸篓。正式合并前仍以用户登录态下的
打包插件字段级复验或下一次已授权自然投递回执作为最终发布证据。

## 0.15.68 验证码等待页持久监控（候选实现）

0.15.66 的真实任务和本地受控页证据证明了“验证码表面与迟到成功回执”存在竞态，但当时的
`failed/captcha_required` 终态仍会关闭页面，无法覆盖用户完成验证码后的异步结果。0.15.68 将稳定验证码
移交给与原岗位、原标签页精确绑定的持久监控：连续三个观察点且跨越约 1.2 秒后立即返回
`waiting_for_user_action/captcha_required`，释放当前设备命令，批次后续岗位可以继续执行。

后台监控在页面更新和 30 秒 Alarm 时只读检查成功或重复申请证据；用户完成验证后回写原岗位
`succeeded/already_applied`。若用户直接关闭绑定页，`tabs.onRemoved` 回写
`failed/captcha_tab_closed`。成功回读已在进行时，关闭处理会等待该回读完成，避免关闭覆盖成功；网络回写
失败时保留待上报关闭结果供 Alarm 重试。该路径不刷新、不重开、不重填、不重复提交，也不把验证码等待
算作主动表单执行并发。

自动化已覆盖稳定验证码快速移交、后续队列立即 claim、原页成功/重复申请回写、精确绑定页关闭失败和
成功/关闭路径不进入命令执行器。尚未使用 0.15.68 打包插件重新提交真实招聘岗位，因此本节只记录候选
实现与自动化证据；自然投递中的“用户完成验证码”和“用户直接关闭页面”两条证据仍需发布后补充。

## 职位详情页入口：Moka、飞书与小鹏

| 项目 | 证据 |
|---|---|
| 验收状态 | `codex/fix-feishu-entry-trusted-pointer-20260901` 候选实现已按正式分流和点击序列在三个真实公开职位页验证；尚未打包、未执行最终投递 |
| 验收时间 | 2026-09-01，Asia/Shanghai |
| Moka URL 家族 | `https://app.mokahr.com/(campus|social)-recruitment/<tenant>/<campaign>#/job/<job>` |
| Moka 入口签名 | 两个可见、启用的 `BUTTON[type=button]`，文本均精确为“申请职位”，且类名同时含 `sd-Button-container` 与 `button-container-`；它们是同一申请入口的页首/页尾等价副本 |
| Moka 回读 | 对经实时命中校验的其中一个控件发送一次可信指针后，页面转到 `#/job/<job>/apply?applyFormId=<id>`；未填写字段、未上传、未点击预览或最终提交 |
| 飞书 URL 家族 | `https://<tenant>.jobs.feishu.cn/<campaign>/position/<job>/detail` |
| 飞书根因及回读 | 详情页唯一“投递”入口可被定位，但后台标签页的合成 DOM 点击没有推进流程；同一入口经一次可信指针后转到 `/resume/<job>/apply`，未填写或提交 |
| 小鹏 URL 家族 | `https://xiaopeng.jobs.feishu.cn/(campus|index)/position/(detail/)?<job>/detail` |
| 小鹏根因及回读 | 当次岗位使用 `index/position/detail/<job>`，旧专用 Driver 只登记了 `campus` 路径；补充精确路径后，唯一“投递”入口进入 `/index/login?redirect_path=/resume/<job>/apply`，证明该岗位后续为真实登录边界，不是入口未打开 |
| 失败关闭 | Moka 结构化候选不是正好两个、通用候选不是唯一、URL/命中点变化，或跳转后既非登录页也非申请表时，均不再尝试其他控件，返回 `application_entry_not_opened` |

这组验收只覆盖“职位详情页 → 登录页或申请表”的导航，不扩展到填写、预览、最终提交或登录绕过。Moka
的等价双按钮是站点专用例外；任何其它重复申请文案仍由通用 Driver 安全拒绝。

## 0.15.66 DeepSeek 最终提交竞态（历史证据）

| 项目 | 证据 |
|---|---|
| 取证状态 | 测试环境真实任务已复现“招聘页显示成功、AI Offer 记录 `failed/captcha_required`”；候选修复只完成自动化回归，尚未重新提交真实岗位 |
| 取证时间 | 2026-09-01，Asia/Shanghai |
| URL 家族 | `https://app.mokahr.com/social-recruitment/high-flyer/<campaign>#/job/<job>/apply` |
| 任务时间线 | 14:35 开始自动投递，14:36 AI Offer 写入验证码失败；用户同时观察到招聘网站成功结果，AI Offer 没有后续成功事件 |
| 根因 | 最终提交观察循环允许等待 Moka 成功页 60 秒，但任意一次验证码命中会立即提前退出；`failed/captcha_required` 随后关闭任务标签，迟到的成功页无法再回写 |
| 修复边界 | 只调整已授权最终提交后的结果仲裁：成功回执始终优先；验证码在有界观察期内只作为候选证据，持续到截止且满足稳定门槛才成为 `captcha_required` |
| 非目标 | 不修改提交按钮定位、点击次数、验证码处理方式、登录/身份核验策略、字段 Driver 或批次并发策略 |

候选实现对最终提交观察增加独立的验证码稳定状态：单次或短暂验证码随后消失时不宣称需要验证码；
验证码存在期间继续只读观察既有成功 URL/成功文案；任何时刻取得成功证据立即返回 `succeeded`；
只有观察截止时验证码仍连续存在且至少跨越三个观察点和 1.2 秒，才沿用现有
`failed/captcha_required` 终态。真实验证码最多占用既有 60 秒观察窗口，不会无限阻塞后续岗位。

自动化覆盖瞬时验证码后清除、持续验证码稳定成立、登录/身份核验不进入验证码延迟仲裁，以及源码级
“成功检查早于验证码分支、验证码分支继续观察、截止后才确认验证码”的顺序。由于仓库门禁禁止为测试
重复提交真实岗位，本节不把候选实现记作真实页通过；后续应由新的用户授权投递自然产生成功或持续
验证码结果，再补充打包版本、提交 SHA 和最终回执。

打包后的真实 MV3 插件已在隔离 Chrome for Testing 151 与本地受控 Moka 页面补充两条端到端回归：

1. 最终确认后先显示验证码，2.4 秒后切换为网站成功页，插件最终返回 `succeeded`，站点回执为成功；
2. 最终确认后验证码持续到本地 8 秒观察截止，插件返回 `failed/captcha_required`，提交轨迹记录
   `captcha_observed_pending_receipt` 和连续 12 次观察后的 `captcha_persisted_without_success`。

两条链路都由打包插件完成表单、预览、唯一确认和终态观察；测试只操作本地夹具与合成简历，不连接
真实招聘站点。该结果证明候选代码的浏览器执行链和终态仲裁，不替代下一次自然授权投递的真实页门禁。

合并远端 `main` 的后台最终提交可信指针实现后，又以相同的打包 MV3 链路复验两种终态。受控表单在
输入框失焦后会重建提交按钮；按下与松开之间等待 80ms 时只能收到可信 `mousedown/mouseup`，不会产生
`click`。指针序列改为悬停稳定后连续发送 `mousePressed → mouseReleased`，预览和确认按钮均只收到一次
`isTrusted=true` 的完整 `click`；短暂验证码仍返回 `succeeded`，持续验证码仍在截止后返回
`failed/captcha_required`。该修正不使用 DOM `.click()`、键盘提交或 `Page.bringToFront`。

## Moka 籍贯两级级联与出生年月

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.65 候选实现已在用户登录 Chrome 的两个真实 Moka 申请页通过控件级验收 |
| 验收时间 | 2026-09-01，Asia/Shanghai |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/<tenant>/<campaign>#/job/<job>/apply` |
| 籍贯控件 | `moka.native-place.cascader.trusted-pointer.v1`；真实执行“湖南 → 长沙 → 确认”，字段回读成功 |
| 出生日期控件 | `moka.date-picker.trusted-pointer.v8`；真实执行“年份标题 → 十年导航 → 2000 → 3月”，月份精度回读成功 |
| 原始错误 | 籍贯省份列表未滚动到 H-K 或选择省份后未等待城市子列表；出生日期停在 1990 年月份面板，未进入年份面板且把双箭头误作逐年导航 |
| 固化边界 | 籍贯县区可选时允许省市两级直接确认；出生日期不伪造日值，毕业日期继续使用既有日精度路径 |
| 最终提交 | 未点击预览、最终提交或站点确认提交动作 |

籍贯 Driver 先对页面和弹层分别执行一次可信滚动，实时校验命中点后点击唯一省份；React 重建城市列表后重新观察并点击唯一城市，随后直接点击唯一“确认”。执行不依赖省份、城市、县区标签切换，不向 readonly input 写值，也不使用通用地点 Driver 兜底。

出生日期 Driver 把月份面板和年份面板分成不同状态：先点击当前年份标题进入年份面板，根据可见年份范围使用双箭头按十年导航，选择目标年，确认返回月份面板后点击目标月份。月份精度回读接受站点附加的年龄文本，但只比较 `YYYY-MM`；既有毕业日期仍要求完整 `YYYY-MM-DD`，两条路径不会互相降级。

### 2026-09-02 JXW Moka 籍贯二次回读误判

| 项目 | 证据 |
|---|---|
| 取证状态 | 用户正常授权投递的生产轨迹、插件 Service Worker 诊断和同一申请页校验状态已核对；未为排查额外提交岗位 |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/jxw/166492#/job/<job>/apply` |
| 字段与 Driver | 必填“籍贯”；`moka.native-place.cascader.trusted-pointer.v1`；readonly Moka Dropdown 省市区级联 |
| 页面状态 | 最后一轮 `requiredBlockers=[]`、`criticalFailures=[]`；页面没有报告空必填项 |
| 失败轨迹 | 籍贯 Driver 已完成专用行政区回读，外层随后用普通文本全等再次比较；AI Offer 预期摘要长度为 11，页面展示摘要长度为 10，连续三轮后主动熔断 |
| 终态边界 | 失败发生在字段填写后的回读收敛，尚未进入最终提交前稳定复核；“预览并提交”点击数为零 |
| 根因 | AI Offer 自有省市区值与招聘页提交后的展示格式存在行政后缀或分隔符差异；专用 Driver 的语义回读结果被无关的通用字符串比较推翻 |

本次分类修复不降低普通文本和招聘页原始选项的精度。注册表为每个 Driver 声明回读策略：AI Offer
自有籍贯值使用省市区层级语义匹配，当前招聘页返回的选项仍保留行政后缀并执行展示精确匹配；日期、
年月、招聘来源、城市、原生文本和勾选状态各自使用独立策略。实际区县不同、弹层未关闭或局部校验未
清除时仍失败关闭。

### 2026-09-02 候选打包插件精确序列门禁（通过）

| 项目 | 证据 |
|---|---|
| 候选包 | 当前分支提交 `3721a90` 构建的 `extension/dist`；Chrome 显示版本 `0.15.87`、扩展 ID `ljaolnholdmkenhhpaobbbolpflhnfop` |
| 真实控件 | JXW 申请页必填“籍贯”；`basic.native_place.native`；readonly `INPUT`；`controlKind=native` |
| 精确 Driver | `moka.native-place.cascader.trusted-pointer.v1`；首次执行完成省、市、区选择并返回 `driverStage=readback`、`driverFailureCode=committed` |
| 预期与回读 | AI Offer 合成值 `广东省 深圳市 南山区`；页面权威回读 `广东 深圳市 南山区` |
| 分类策略 | `configuredStrategy=effectiveStrategy=administrative_hierarchy_semantic`；`provenance=ai_offer_taxonomy`；`matches=true` |
| 页面校验 | 重新观察后籍贯不在必填缺失集合，籍贯相关校验消息为空，级联弹层关闭 |
| 最终提交 | “预览并提交”点击数为零；未进入预览、确认或最终提交阶段 |
| 清理 | 关闭含合成值的测试标签，重新打开同一 URL 确认籍贯为空后关闭清理标签 |

候选包直接调用正式后台模块中的稳定观察、字段指令生成、籍贯专用可信指针 Driver、动态字段重绑和
注册回读策略，未使用源码外的 DOM 写值、键盘或替代比较器。首次完整选择成功后，同一候选包再次读取
已提交值返回 `already_committed`，语义回读仍为真。此前的差分负例继续证明：错误区县
`广东省 深圳市 福田区` 被拒绝；当相同值的来源改为招聘页实时选项时，策略切换为
`page_option_exact`，行政后缀不一致不会被放宽。本次真实页序列和自动化负例共同满足候选打包门禁。

## Moka `robosense` 推荐码与意向城市字段边界

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.59 实际缺陷的零写入链路已在用户登录 Chrome 的真实页通过；精确测试值完成目标与显示回读，但站点判定该测试码无效，不作为有效推荐码证据 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 验收原型 | `f2a2d7e`，已合并当时远端 `main=80767ba`；发布元数据同步前全量 85 个测试文件、529 个测试通过 |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/robosense/141961#/job/<job>/apply` |
| 字段语义 | 同一“申请信息”区块内相邻的必填“意向工作城市”和非必填“推荐码”是两个独立字段 |
| 城市控件 | 可编辑 `INPUT[type=text]`；placeholder 为“选择意向工作城市”；祖先含 `apply-field-* Select-*` 与 `sd-Select-container-*` |
| 推荐码控件 | 可编辑原生 `INPUT[type=text]`；placeholder 为“推荐码”；`autocomplete=new_password`；无 `id`、`name` 或 `aria-label`；祖先含 `apply-field-* string_info-*` |
| 局部标题结构 | 两个 `apply-field-*` 均以直接子节点 `title-*` 保存各自标题，控制子树位于独立的直接子节点 `ctrl-*` |
| 原始错误 | 推荐码控件缺少常规身份属性，页面级几何邻近标签把它误识别为意向城市，随后 `job.answers.preferredCity=深圳市` 被规划到推荐码 |
| Driver 决策 | 推荐码本身属于 `generic.native.text.v1`；推荐/城市语义冲突必须在 Driver 选择和字段执行前失败关闭 |
| 权威回读 | 推荐码使用原生 `input.value`；城市控件使用站点提交后的展示值；两者不得互相作为回读证据 |
| 最终提交 | 未上传文件、未点击“预览并提交”或任何确认提交动作；临时测试值已清除 |

0.15.59 以三个门禁覆盖原始失败：优先使用推荐码 placeholder 和 Moka 字段内直接标题建立稳定语义；
事实规划拒绝把城市事实用于推荐字段；执行前再次比较 instruction 语义与目标控件内在身份。真实页将
`job.answers.preferredCity=深圳市` 与唯一推荐码控件的内在身份进行相同冲突判定，结果为
`unresolved.custom.v1 / field_semantic_conflict`，推荐码权威回读保持空值且没有关联校验错误。自动化负例
进一步确认拒写时 `input/change` 事件均为零。

正向目标检查只用于证明没有串到相邻城市控件：临时值 `REF-CODEX-01559` 在推荐码控件中精确显示，
失焦后站点返回“推荐码不正确”，说明该值不是有效业务推荐码；随后通过全选删除清空该临时值，关联错误
消失。生产命令只包含 `job.answers.preferredCity=深圳市`，没有推荐码补充事实，因此正式行为是保持这个
可选字段为空。只有用户为当前岗位当前字段明确确认、并与字段稳定键精确绑定的补充事实才允许进入通用原生文本 Driver；不存在
有效推荐码时不得猜测、生成或尝试其他代码。

## Moka `robosense` 申请页异步阶段门

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.60 页面阶段等待原型已在用户登录 Chrome 的真实页通过；只读观察，未填写、未上传、未点击预览或提交 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 验收原型 | `fix/moka-apply-page-readiness-0.15.60`，基于已合入推荐码修复的远端 `main=ec8ada5` |
| URL 家族 | `https://app.mokahr.com/(campus|social)-recruitment/<tenant>/<campaign>#/job/<job>/apply` |
| 原始错误 | 文档完成后只观察一次；React 表单尚未出现时页面被判为 `job_detail`，现场投递入口为零，安全失败后执行标签关闭 |
| 注册路由 | `moka.application-page-readiness.v1`；只匹配 Moka 的 `/job/<job>/apply` 路由 |
| 等待策略 | 最多 30 秒、250ms 轮询；`login` 或 `application_form` 连续两次一致才结束等待；`job_detail`/`unknown` 不提前结束 |
| 阶段落盘 | `pageStage`、`pageStageSource`、`pageStageObservedAt`、`pageStageObservationCount`、`pageStageWaitedMs` 与工作流 `stage` 分离保存 |
| 最终提交 | 未输入字段、未上传文件、未点击“预览并提交”或任何确认提交动作 |

真实页重载后，首次观察发生在 443ms：文档为 `interactive`，仅 1 个可见字段，城市和推荐码都不存在，
阶段为 `unknown`。728ms 和 1015ms 时文档已为 `complete`，但表单仍未出现。1292ms 时可见字段增加到
21 个，姓名/手机/邮箱等身份信号为 3，城市与推荐码控件同时出现，阶段首次成为
`application_form`；1566ms 第二次连续回读相同阶段后，原型以 `status=resolved` 结束等待。

该证据证明 `document.readyState=complete` 不是 Moka 申请表就绪信号。0.15.60 只延长已登记 Moka
申请路由的页面阶段观察，不为 Moka 创建专用登录选择器；登录仍完全使用跨站点密码、验证码登录表单
和登录 URL 证据。真实表单或登录页在 30 秒内始终未稳定出现时，流程才进入现有的通用入口与模型
辅助分类，并继续失败关闭，不点击歧义入口。

## Moka `linctex` 字段边界与下拉选项证据

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.55 已完成用户登录 Chrome 的只读真实页检查；未填写字段、未上传文件、未点击预览或提交 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| URL 家族 | `https://app.mokahr.com/social-recruitment/linctex/46055#/job/<job>/apply` |
| 必填选择项 | “意向工作城市”，控件 placeholder 为“选择意向工作城市”；打开后真实层级为“浙江 → 杭州市” |
| 非必填第三方字段 | “外部推荐人”，独立文本字段，不是候选人姓名别名 |
| 固化规则 | 城市只能点击实时存在的选项；外部推荐人无当前岗位精确确认事实时保持空白 |

真实页检查确认该申请表同时存在候选人“姓名”和独立的“外部推荐人”，因此任何把候选人本人姓名
写入外部推荐人的行为都是字段语义错误，而不是信息包缺少来源。城市下拉打开后只观察到当前岗位
支持的真实省市选项；检查过程没有向控件输入文字，也没有选择城市或提交申请。

0.15.55 的合入门禁以负向行为为主：无匹配选项的 Moka combobox 和 ARIA autocomplete 必须返回
“组合框没有可用选项”，内部 input 保持空值且 `input/change` 事件计数均为零；未知可选第三方字段
必须在模型规划前被移除，并在执行层再次拒绝。完整打包插件任务仍需合并后从远端 main 构建复验。

## 2026-09-02 Yadea 与 Brother Moka 意向城市选项回传

| 项目 | 证据 |
|---|---|
| 取证状态 | 用户已登录 Chrome 的真实申请页只读/无写入检查；没有填写、上传、预览或提交申请 |
| URL 家族 | `https://app.mokahr.com/social-recruitment/yadea/144891#/job/<job>/apply` 与 `https://app.mokahr.com/social-recruitment/brother/150715#/job/<job>/apply` |
| 控件签名 | 必填“意向工作城市”；可编辑 `INPUT[type=text]`，placeholder 为“选择意向工作城市”，祖先含 Moka `sd-Select-container-*` 与 `sd-Dropdown-container-*` |
| Yadea 实时选项 | 打开的唯一弹层实际层级为“江苏 → 无锡市”；输入展示值为空且保留该字段的必填校验 |
| 原始误判 | 这两个精确 URL 家族未登记城市专用 Driver，已知事实“北京市”未经实时选项比对就进入通用填充，最终只能落入 `location_selection_unconfirmed` |
| 固化分流 | 两个 URL 家族分别登记 `moka.yadea.location.trusted-focus.v1` 与 `moka.brother.location.trusted-focus.v1`；后台可信指针先只读发现城市叶子，再决定是否选择 |
| 信息回传 | 已知城市不在实时叶子选项中时，返回 `requiredFieldRequests` 和 `optionUnavailable.availableOptions`；AiOffer 必须让用户从返回选项中确认后再重试，插件不得猜测近似城市或让用户在原页面手工确认 |
| 失败边界 | 选项已存在但可信选择、关闭弹层或回读失败时，返回 `location_control_interaction_failed` 或 `location_selection_unconfirmed` 技术证据；不伪装成用户信息缺失 |
| 最终提交 | 本次取证和回归均未点击预览、提交或任何会投递岗位的动作 |

本节记录的真实页证据用于精确路由和“选项不兼容”的用户确认边界。已构建的插件仍须在加载该提交后，
以同一页面只验证“打开下拉 → 回传无锡市 → 保持字段为空和校验仍存在”的无副作用序列；确认后才允许以
用户为该岗位确认的城市进入后续填写流程。

## `feishu.xiaopeng.application-entry.v2`

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.48 已通过真实页“等待 React 渲染 → 唯一投递入口 → 登录页通用分类证据”验收；未输入账号，未提交申请 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 原型分支 | `fix/generic-login-xiaopeng-entry-0.15.48` |
| URL 家族 | `https://xiaopeng.jobs.feishu.cn/campus/position/<job>/detail` |
| 入口签名 | 可见、启用的 `BUTTON[type=button]`；文本精确为“投递”；真实页尺寸 120×40；`apply-block-applyBtn` 稳定角色类仅作为证据，不作为通用登录规则 |
| Driver 分流 | 详情页由小鹏 Application Entry Driver 处理；目标登录页由跨站点 Application Page State Classifier 处理 |
| 登录证据 | `/campus/login?redirect_path=/resume/<job>/apply`；手机号、验证码、获取验证码和登录按钮同时可见 |
| 最终提交 | 未输入手机号或验证码，未点击登录，未点击申请表预览或最终提交 |

### 2026-08-31 真实页面验证

1. 打开真实小鹏校园招聘职位详情页，等待 `DOMContentLoaded` 后按正式 Driver 相同的控件集合、可见性、启用状态和精确文案规则轮询；
2. 页面异步渲染完成后只命中一个入口：`BUTTON[type=button]`、文本“投递”、启用、可见，矩形 120×40；
3. 对唯一入口执行一次真实点击，页面进入 `/campus/login?redirect_path=/resume/<job>/apply`；
4. 目标页回读到一个手机号输入框、一个验证码输入框、一个“获取验证码”按钮和一个“登录”按钮；
5. 未输入任何账号或验证码，未触发登录，也未进入或提交真实申请表。

### 固化结论

- 原失败 `application_entry_not_opened` 发生在 React 入口按钮出现前立即扫描，不是 Test Token、Gateway、登录密钥或登录分类问题；
- 详情页入口属于站点导航差异，可以使用站点专用 Driver，并必须等待异步渲染且要求候选唯一；
- 登录状态是跨站点页面状态，分类器不得包含小鹏 hostname、class 或租户规则；
- 公开职位详情页页眉中的“登录”导航链接不是登录墙；只有登录 URL、验证码登录表单、密码表单或无可用申请表时的页面级登录要求才允许返回 `failed/login_required`；
- 入口多于一个、等待超时或点击后 URL 不变时失败关闭，不猜测按钮，不把错误改写成填表或最终提交失败。

### 2026-08-31 0.15.49 生产超时证据与 0.15.50 验证边界

- 生产任务在后台小鹏详情页持续观察约 8990ms 后返回 `application_entry_not_opened`；当次证据图中职位正文和导航已渲染，但可见控件集合没有出现唯一“投递”入口；
- 该证据说明 8 秒窗口不足以覆盖当次真实页面的入口加载时序，但不能证明入口必然会在更长等待中出现；
- 0.15.50 将正式 Driver 的观察窗口延长至 30 秒、保持 100ms 轮询；入口一旦唯一出现立即点击，不固定等待满 30 秒；
- 自动化测试已覆盖入口在 20 秒才插入 DOM 时仍能被点击，并保留多入口立即失败与零入口超时失败；
- 30 秒路径尚需由打包插件在真实生产页面复验。若仍超时，错误证据将同时包含 `readyState`、`visibilityState` 和可见控件数量，用于判断“页面未完成加载”还是“后台页面不渲染入口”；在真实复验通过前，不把 0.15.50 记作新的真实页通过证据。

## `moka.deepseek.location.trusted-pointer.v2`（历史失败实现）

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.50 已通过 DOM 生命周期、单向状态机和一次性动作账本自动化回归；完整打包插件真实页队列验收待执行，未完成前不得标记生产通过 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 实现分支 | `fix/deepseek-location-driver-v2-0.15.50` |
| URL 家族 | `https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/<job>/apply` |
| 控件签名 | 可编辑文本 `INPUT`；初始 placeholder `选择意向工作城市`；Moka Select/Dropdown 祖先；地点字段语义 |
| Driver 分流 | `moka.deepseek.location.trusted-pointer.v2`，无通用、DOM、键盘、刷新或其他 Driver 兜底 |
| 测试范围 | 现有真实页证据保留为 v1 历史基线；v2 必须在合并前补充完整 ZIP 的后台真实页队列证据 |
| 最终提交 | 预览按钮保持可见但未点击；未点击提交或其他最终投递入口 |
| 隐私记录 | 只记录预期归一化城市与回读一致，不在仓库保存测试城市或完整岗位 ID |

### 2026-08-31 真实控件验证

1. 在真实 DeepSeek/Moka 申请页按正式 selector 算法定位意向工作城市输入框，selector 唯一命中一个元素；
2. 记录选择前状态：展示值为空、弹层关闭、字段没有残留 `aria-invalid` 状态；
3. 发送一次可信指针打开动作，确认只出现一个可见 Moka 菜单；
4. 菜单中同时出现同名省份标题和城市叶节点；Driver 只接受位于 `Menu-content-item` 下的 `option-label` 叶节点，明确排除省份标题；
5. 目标城市的可见精确叶节点计数为一，发送一次可信指针选择动作；
6. 站点提交选择后输入框 DOM 被重建，原 placeholder 消失；Driver 按地点字段语义重新定位唯一新节点；
7. 输入框展示值与预期归一化城市精确一致；站点不在原生 `input.value` 保存该展示值，因此权威回读使用控件已提交的展示文本；
8. 城市弹层关闭但“必填项未填写”暂时保留；点击一次唯一字段标题使控件失焦后，关联校验错误清除且 `aria-invalid` 未出现；申请页 URL 未变化；
9. 预览按钮仍然存在，全程未点击预览或最终提交，也未刷新页面、重新填表或上传文件。

### 固化结论

- 重复城市文本来自省份标题与城市叶节点的不同角色，不应通过重复输入、键盘确认或页面刷新处理；
- 专用 Driver 必须同时命中精确 URL 家族、地点语义和 DOM 签名，并只选择唯一精确叶节点；
- 页面选择后会重建控件节点并移除 placeholder，执行后必须按字段语义重新定位，不能依赖旧 selector、旧 placeholder 或缓存旧元素；
- Moka 只有在地点控件失焦后才清除必填错误；城市展示值匹配、弹层关闭后的一次字段标题点击属于首次选择的提交阶段，不是重新选择或重试；
- 唯一弹层已打开并读取到真实城市叶子时，目标不存在属于 `leaf_missing + availableOptions`，字段保持不变；必填项要求用户从当前选项重新选择，非必填项跳过；
- 弹层打不开、弹层或目标歧义、事件、提交或回读失败才返回 `location_control_interaction_failed`，不刷新页面、不重新填表、不重试同一控件，也不切换通用 Moka Driver；
- v1 的真实页原型证据不能代替 v2 打包插件的正式链路验证；只有 ZIP 构建、插件版本、提交 SHA、动作账本和生产批次证据一致时才满足发布门禁。

### 2026-08-31 0.15.50 Driver v2 自动化门禁

1. `detect` 与 `observe_open` 调用真实 DOM 观察函数，断言 `scrollIntoView` 调用次数为零；
2. `prepare_open` 单独执行一次即时滚动、两个布局帧和语义重绑，账本 `scrollCount=1`；
3. 点击前安装 MutationObserver，覆盖“从未打开”和“打开后关闭”两条不同失败路径；
4. 状态机只允许一次打开、一次城市叶子和必要时一次失焦提交，任何失败不回退到前一状态；
5. 已存在目标城市只回读或失焦提交，不重新打开或重新选择；已存在不同城市直接失败，不覆盖；
6. 诊断固定记录 `retryCount=0`、`reloadCount=0`、`fullFormRestartCount=0`；
7. 自动化回归覆盖省/市同名、重复城市叶子、React selector 失效、嵌套标题链和观察器中断；
8. 本节只证明实现和自动化门禁通过，不声明真实打包插件已经通过 DeepSeek 页面完整队列。

### 0.15.57 目标城市不可用分流证据

- 同一真实 DeepSeek/Moka 地点弹层已经证明可见叶子包含“北京市”和“杭州市”，且省份标题可与城市叶子按 DOM 角色分离；
- 0.15.57 的只读探针从当前唯一弹层采集、去重这些 `Menu-content-item → option-label` 叶子；
- 自动化负例以“深圳市”为目标，确认返回 `leaf_missing` 和 `["北京市", "杭州市"]`，字段值不变，城市叶子点击与失焦提交均为零；
- 协议回归确认必填字段生成 `required-field-request.v1`，问题明确提示“深圳市”不可用并返回上述选项；非必填字段和无选项证据的场景不误归类；
- 该证据证明错误分类与返回协议，未执行最终提交；0.15.57 打包插件仍需用户在真实批次确认 AI Offer 展示和原岗位续跑。

### 0.15.45 验证缺口与 0.15.46 修正

- 0.15.45 为了可信指针强制激活招聘标签、聚焦窗口并调用 `Page.bringToFront`，直接违反自动投递用户无感要求；
- 0.15.45 只验证了外部普通页面点击，没有用最终插件的后台目标链路覆盖 React 重建和失焦校验；
- 0.15.46 删除所有自动 Driver 的前台执行类型和调用，可信事件直接发送到后台调试目标；
- 0.15.46 的状态机固定一次打开、一次叶节点选择、必要时一次失焦提交，等待通过轮询页面状态完成，不重复点击；
- Gateway 同时把 `retryBeforeSubmit` 归一化为 `0`，插件失败原样成为岗位终态。

### 2026-08-31 0.15.46 后台状态真实页验收

1. 先打开 DeepSeek 申请页，再选中另一普通标签，确认验收从非选中的招聘标签开始；
2. 不激活招聘标签，在后台目标按正式字段签名唯一定位意向工作城市控件；
3. 只执行一次打开动作，页面只出现一个可见地点弹层；
4. 弹层同时包含行政区标题和城市叶节点；正式 `Menu-content-item → option-label` 选择器精确命中一个“北京市”叶节点；
5. 只执行一次城市叶节点点击，未再次打开、重试、刷新或重填页面；
6. React 重建输入节点后，原 placeholder 消失；按地点字段语义重新定位，权威展示值回读为目标城市；
7. 地点弹层关闭后“必填项未填写”仍暂存；只点击一次唯一字段标题提交失焦，随后该校验消失；
8. 申请页 URL 保持不变；未上传简历，未点击“预览并提交”或任何最终提交入口；
9. 前台用户页保持存在；验收后关闭测试标签页，丢弃未提交的本地表单状态。

该结果满足专用地点 Driver 的真实页控件级合入门禁；0.15.46 测试包继续交由用户执行完整队列验收。

### 2026-08-31 0.15.47 平滑滚动坐标修复验收

1. 生产失败证据稳定为 `driverStage=open`、`popup_closed`、城市叶子命中数 `0`；同页普通可信点击可以打开控件；
2. 页面根滚动行为为 `smooth`。旧 Driver 调用默认 `scrollIntoView()` 后立即读取坐标，真实复现得到旧点 `y=-634`；滚动稳定后控件实际中心为 `y=213`，旧点不再命中输入框；
3. 修正序列改为即时滚动、等待两个布局帧、按地点语义重新绑定、以 `elementFromPoint` 校验实时命中点；未激活招聘标签、未调用 `Page.bringToFront`；
4. 修正后的真实页目标点命中唯一地点 `INPUT`，一次可信打开后只出现一个地点弹层；同名行政区标题和唯一城市叶节点分别计数为一；
5. 只点击一次 `Menu-content-item → option-label` 城市叶节点；React 随后重建输入，原 placeholder 消失，权威展示值与预期归一化城市一致；
6. 本次页面选择后校验已直接清除，因此 Driver 没有执行不必要的失焦提交；弹层关闭，URL 未变化；
7. 预览/提交按钮仍存在且未点击，没有上传文件、刷新页面、重填表单或触发最终投递；验收后关闭测试标签并丢弃未提交状态。

该结果覆盖原始平滑滚动坐标失效，并证明修正后的检测、实时命中点、一次打开、唯一叶子选择和权威回读序列在真实页通过。

### 2026-08-31 0.15.49 嵌套失焦标题修复验收

1. 生产批次证据显示目标城市展示值与预期均已归一化为同一城市，弹层已关闭，失败精确发生在 `driverStage=commit`；没有刷新、整表重填、再次打开地点控件或切换 Driver；
2. 旧失焦定位器在字段内查找精确标题文本并要求原始节点数为一；真实页面把一个视觉标题渲染为外层 `DIV.title-*` 和两个嵌套 `SPAN`，因此得到三个同名节点并错误返回空目标；
3. 新算法只归并具有祖先包含关系的同名标题链，真实页原始匹配数为三、独立语义根数量为一；两个并列的独立标题不会被归并，仍然失败关闭；
4. 唯一语义根为非交互的外层标题 `DIV`；实时中心点经 `elementFromPoint` 回读仍命中该标题自身，满足一次后台可信失焦点击的目标条件；
5. 既有 0.15.46 真实页证据已证明点击该字段标题后残留必填错误清除；本次修正只恢复对同一标题的确定性定位，不改变一次失焦、后续回读或失败终态边界；
6. 验收未填写候选人资料、未上传文件、未点击预览或最终提交，也未刷新页面或重新执行投递任务。

该结果证明 0.15.47 的失败是城市已选中后的失焦目标误判；0.15.49 将一个视觉标题的嵌套 DOM 链归并为唯一语义目标，同时保留对真正独立歧义的失败关闭。

## `moka.deepseek.location.native-event.v3`（历史失败实现）

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.52 完整打包插件真实队列失败，已停止作为当前 Driver |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 实现分支 | `fix/deepseek-location-native-events-0.15.52` |
| URL 家族 | `https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/<job>/apply` |
| Driver 分流 | 历史 `moka.deepseek.location.native-event.v3`，无通用、值写入、键盘、刷新或重试兜底 |
| 事件机制 | 后台 MAIN world 原子重新绑定后调用控件自身 `focus/click`、唯一城市叶子 `click` 和必要提交 `blur/click` |
| 最终提交 | 未点击预览或最终提交；真实控件探测结束后关闭临时标签并丢弃未提交状态 |

### 0.15.50 生产失败证据

1. 最新失败批次为 `42705a39-4b81-4a18-893f-eac26c97ed09`，实际构建提交为 `ae0e8779bc8ffe00177df3fa3f96ce241ac31eb8`，不是旧插件误装；
2. `driverFailureCode=open_click_not_observed`，动作账本为准备一次、滚动一次、打开一次、城市叶子零次、提交零次；
3. 点击后 30 次只读观察全部为 `popup_closed`，预点击观察器从未记录弹层打开；
4. `activeTabBefore` 与 `activeTabAfter` 相同，`retryCount=0`、`reloadCount=0`、`fullFormRestartCount=0`；
5. 因此 0.15.50 已正确删除刷新和整表重填，但后台手工 CDP 鼠标序列本身没有触发 Moka 控件打开事件。

### 真实控件事件差异复现

1. 在同一 DeepSeek 页面唯一定位地点 `INPUT`，输入框尺寸、Select/Dropdown 祖先和实时命中点均有效；
2. 浏览器标准点击输入框后只出现一个 `sd-Dropdown-dropdown-*`，唯一城市叶子为 `Menu-content-item → option-label` 下的“北京市”；
3. 选择唯一叶子后展示值为“北京市”，原生 `input.value` 仍为空，placeholder 被 React/Vue 重建移除，弹层关闭且字段校验清除；
4. 在另一受控标签保持选中时再次点击该地点输入框，地点弹层打开且选中的标签 ID 不变；
5. 这证明控件、城市选择器和后台标签条件都可工作，差异集中在 v2 自行拼装的 CDP 事件序列。

### 当时的 Moka 组件事件链假设

1. 真实页当前加载 `recruitmentWeb-20260827-1545-11024-release.js`；内置 Select 的 `headerRender` 把 `onInputClick` 传给 Input 的 `onClick`；
2. Input 把该回调挂在包裹输入框的 `label` 上，`onInputClick` 只根据当前 `isOpen` 执行一次 `show + focus` 或 `hide`，没有 `isTrusted` 分支；
3. 城市 option 的回调挂在 Menu item 上，内部调用 Select 的 `onOptionClickBinder` 设置值并关闭单选弹层；
4. v3 据此假设在 MAIN world 对唯一 input 和唯一 leaf 各调用一次 `HTMLElement.click()` 可以进入组件处理链；后续 0.15.52 生产证据推翻了该假设，说明静态 bundle/测试夹具不能替代完整后台插件链路；
5. 页面协议测试相应把监听器放在 Select label 和 Menu item，而不是直接放在 input/leaf，以验证正式动作确实依赖同一冒泡关系。

### 0.15.52 自动化门禁与待验收边界

- 页面协议测试使用真实 DOM 事件监听器证明输入框与唯一叶子各只收到一次原生 `click`，且不写 `input.value`；
- 状态机诊断升级为 `deepseek-location-driver-diagnostic.v3`，记录 `eventMechanism=element_click`、`nativeEventClickCount` 和恒为零的 `trustedPointerClickCount`；
- 静态策略测试禁止 DeepSeek 路由引用 `chrome.debugger`、`dispatchTrustedPointerClick`、前台激活和 reload；
- 瞬时弹层、从未打开、唯一性、预选城市、不同城市和观察器中断继续失败关闭；
- 0.15.52 完整打包插件已在真实队列运行并失败，v3 不得再作为当前实现或通过证据引用。

### 2026-08-31 0.15.52 生产失败证据

1. 批次 `02b2b991-96e1-426e-bd18-751dcd25ea71` 实际设备版本为 `0.15.52`，构建为 `0eecaec592c9f40200f259c2680aac90e8399855`；
2. 路由精确命中 `moka.deepseek.location.native-event.v3`，失败阶段为 `open`、代码为 `open_event_not_observed`；
3. 一次滚动、一次 `HTMLElement.click()` 后，预装的 MutationObserver 与 30 次只读轮询均未看到地点弹层；城市叶子与提交动作均为零；
4. `activeTabBefore` 与 `activeTabAfter` 相同，`retryCount=0`、`reloadCount=0`、`fullFormRestartCount=0`；
5. 因此版本、配对、Driver 分流、无感标签和无刷新策略均已生效，失败根因是页面 `.click()` 没有形成真实 Moka 控件所需的完整可信指针链。

## `moka.deepseek.location.trusted-focus.v4`

| 项目 | 证据 |
|---|---|
| 验收状态 | 0.15.53 已完成 0.15.52 生产失败取证、同页真实控件复现、Driver/注册表/无副作用自动化；完整打包插件真实队列待用户验收 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 实现分支 | `fix/deepseek-location-trusted-focus-0.15.53` |
| URL 家族 | `https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/<job>/apply` |
| Driver 分流 | `moka.deepseek.location.trusted-focus.v4`，无通用、DOM 值写入、键盘、刷新或重试兜底 |
| 事件机制 | 后台调试目标焦点模拟 + 点击前实时命中验证 + 一次可信指针事件链；禁止 `Page.bringToFront` |
| 最终提交 | 未填写候选人资料、未上传文件、未点击预览或最终提交；测试页结束后自动丢弃 |

### 真实控件复现

1. 在隔离浏览器打开同一公开 DeepSeek 申请页，真实 DOM 唯一地点输入为 `INPUT[placeholder="选择意向工作城市"]`，祖先为 `LABEL.sd-Select-container-*` 与 `DIV.sd-Dropdown-container-*`；
2. 对输入框执行一次真实指针点击后，出现唯一可见 `sd-Dropdown-dropdown-*`，文本包含“杭州市”和“北京市”；
3. `option-label` 精确得到两个城市叶子，其中“北京市”只出现一次，父节点为 `sd-Menu-content-item-*`；
4. 点击唯一“北京市”叶子后，React 重建输入节点，placeholder 由原值变为空，`sd-Input-display-value-*` 权威展示为“北京市”；
5. 弹层关闭，字段内不再出现必填校验文本；未执行额外失焦提交；
6. 该结果证明完整 `mouseMoved → mousePressed → mouseReleased` 指针链可以操作控件，而 0.15.52 的 `HTMLElement.click()` 不能替代这条链。

### 0.15.53 自动化门禁与待验收边界

- `prepareTrustedPointerSurface` 固定先发送 `Emulation.setFocusEmulationEnabled(true)`，再允许目标输入；不调用 `Page.bringToFront`；
- Driver 点击前通过实时语义重绑和 `elementFromPoint` 验证唯一输入/叶子命中点；打开和叶子各最多一次；
- `finally` 撤销焦点模拟并断开 debugger；活动标签 ID 前后写入诊断；
- 诊断升级为 `deepseek-location-driver-diagnostic.v4`，`eventMechanism=cdp_trusted_pointer_focus_emulation`；
- 页面关闭、叶子歧义、观察器丢失、预选不同城市和提交校验不清除均失败关闭；
- `nativeEventClickCount=0`，`retryCount=0`、`reloadCount=0`、`fullFormRestartCount=0`；
- 本节不宣称 0.15.53 完整打包插件已在真实队列通过；正式发布仍要求远端 main 构建、ZIP 哈希、插件心跳版本、构建提交和生产批次证据一致。

## `moka.date-picker.trusted-pointer.v8`

| 项目 | 证据 |
|---|---|
| 验收状态 | 后台站点确定性 Driver 已通过真实单控件完整验收；打包插件 Bridge 复验待发布后执行 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 原型分支 | `fix/moka-deterministic-date-no-tab-switch-0.15.35` |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/<tenant>/<campaign>#/job/<job>/apply` |
| 控件签名 | readonly `INPUT`；placeholder `日期（年月日）`；Moka Dropdown 祖先；日期字段语义 |
| Driver 分流 | `site_deterministic`、`requiresForeground=false`，无其他执行 Driver |
| 测试范围 | 同一真实申请页的单个日期控件，不运行完整投递任务 |
| 最终提交 | 未点击预览、提交或其他最终投递入口 |
| 隐私记录 | 只记录预期值与回读一致，不在仓库保存候选人的实际日期 |

### 历史失败结论

- 0.15.31 只证明外部浏览器控制可以按坐标点击，没有证明插件执行链路；正式任务仍返回 `date_control_interaction_failed`，验收撤销；
- 0.15.32 已收到正确结构化日期，但点击位置和弹层几何状态不稳定；
- 0.15.33 前台视觉原型曾完成一次控件测试，但 0.15.34 正式任务在 `date_input` 阶段被视觉模型错误要求“先看到日历弹层”，没有返回输入框坐标，实际一次点击都未执行；
- 0.15.34 同时在视觉动作前激活招聘页、动作后恢复原活动页；岗位重试会重复激活/恢复，造成用户标签页来回切换；
- 失败不是日期 JSON 或解析错误：正式诊断中结构化日期完整，失败发生在打开弹层之前。

### 0.15.35 后台确定性 Driver 真实控件验证

1. 在真实 Moka 申请页定位 `毕业时间` readonly 日期输入框；
2. 保持 AI Offer 为用户活动标签；招聘页不激活、不获得前台焦点；
3. 将输入框滚动到稳定命中区，以与正式插件一致的可信指针坐标点击打开弹层；
4. DOM 回读到初始年月，随后点击年份双左箭头并确认年份准确减少一；
5. 按月单左箭头逐步导航，每次点击后重新读取年月，直到目标年月；
6. 在当前月日期单元中排除 `fade` 类的上月/下月日期，只允许目标日唯一命中；
7. 点击目标日后，输入框完整日期与预期结构化日期一致；
8. 当前字段的“必填项未填写”错误消失，日历弹层关闭；
9. 执行前后 Chrome 活动标签记录均为 AI Offer，招聘页未抢占标签；
10. 全程未点击预览或最终提交，仓库未记录候选人的实际日期。

### 固化结论

- 注册表命中后直接选择 `site_deterministic`，不是通用执行或视觉失败后的降级；
- 稳定 DOM 只用于当前控件重新定位、可信指针坐标、年月状态、目标日唯一性和最终值/校验回读；每一步都重新读取，不缓存旧节点；
- 自动任务页默认后台打开；该 Driver 不调用 `tabs.update(active=true)` 或 `windows.update(focused=true)`；
- 识别、打开、导航、目标日唯一性或回读失败即停止，不切换键盘、DOM 强写、视觉或其他 Driver；
- 未命中登记签名时返回 `unsupported_required_control`，并明确字段名和控件类型。

本记录证明单控件 Driver 原型的完整真实页面序列通过。正式发布仍需完成全量测试、远端 main 插件构建，并由 AI Offer Bridge 对打包插件进行一次同页复验。

### 2026-08-31 0.15.53 作业帮候选人信息包链路验收

1. 使用虚构测试信息包在作业帮 Moka 真实申请页复现：初始观察能识别毕业时间，但页面批量填写返回日期字段已消失，字段仍为空并显示必填错误；
2. 确认旧候选人信息包路径将日期与普通字段一并交给页面合成事件，没有调用登记的可信指针 Driver；学历等 React 控件完成后教育经历节点已重建，初始 selector 不再对应当前日期输入；
3. 将 Moka 日期从普通批次中分离，普通字段完成后重新观察，并按稳定字段身份绑定当前毕业时间输入；不为其他站点或控件增加兜底；
4. 首次 Draft 运行进入可信指针 Driver 后，后台 `Runtime.evaluate` 等待两个 `requestAnimationFrame`，真实复现任务持续挂起且日历未打开；后台标签不保证动画帧执行；
5. 改为即时滚动后同步读取强制布局，Driver 在后台目标打开日历，正确解析中文年月，逐月到达目标年月并排除淡化日期，只点击唯一目标日；
6. 页面完整回读 `2026-06-30`，毕业时间的“必填项未填写”消失，回执为 `success=true`，适配器为 `moka.date-picker.trusted-pointer.v8`；
7. 测试信息包中的其他学校名和同步更新字段故意保留差异，因此整表状态仍为 failed；日期字段本身的执行和权威回读通过，不把无关差异混入本次修复；
8. 全程未点击“预览并提交”或任何最终提交入口。

该结果覆盖原始 CDP 选日失败、React 重建后的旧 selector 和后台动画帧挂起，并证明候选人信息包正式分流、可信交互与日期回读在同一真实控件通过。

## 2026-08-31 0.15.62 作业帮跨岗位学校字段事实隔离

| 项目 | 证据 |
|---|---|
| 验收状态 | 生产失败证据、规划器回归与真实学校控件回读通过；完整打包插件批次待发布后复验 |
| 验收时间 | 2026-08-31，Asia/Shanghai |
| 原型分支 | `fix/moka-profile-stable-key-label-0.15.62` |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/<job>/apply` |
| 生产命令 | `ce73b3e6-f8ec-4a26-9b69-32337c29dc86` |
| 最终提交 | 未点击“预览并提交”或最终提交；真实控件回读后关闭测试页 |

### 生产失败复现

1. 作业帮 `HRBP[合肥]-27秋招` 批次在 `filling` 阶段失败，从未进入 `validating` 或 `submit_ready`；
2. 最后错误为 `教育背景 · 学校名称` 连续两次回读不一致，规划预期“海外院校”，页面实际值为“广东海洋大学”；
3. 命令中的历史应用资料含用户确认事实 `院校所在地区=海外院校`，其稳定键与当前学校字段同为 `education.school.combobox`；
4. 旧逻辑只按跨岗位稳定键复用，优先级高于结构化简历的学校事实，因此把地区答案误作学校候选；
5. 自动最终提交授权有效，失败原因不是表单未填完或缺少提交许可，而是填写阶段的事实语义冲突。

### 修复后的真实页序列

1. 在用户已登录的 Chrome 打开同一作业帮申请 URL，页面稳定识别为申请表；
2. DOM 可见字段为 `教育背景 → 学校名称`，输入 placeholder 为 `请输入就读学校`；
3. 只在该字段输入“广东海洋大学”，实时候选中该学校唯一出现；
4. 精确选择后，Moka 重建控件并唯一回读“广东海洋大学”，候选弹层关闭，学校字段没有校验错误；
5. 页面上的“预览并提交”按钮始终存在但点击次数为零，随后关闭测试标签。

### 自动化门禁

- 跨岗位资料不再生成 `profile.requiredField.stable:<stableKey>` 直接键；
- 只生成 `profile.requiredField.stableLabel:<stableKey>:<normalizedLabel>` 组合键；
- “院校所在地区”与“教育背景 · 学校名称”即使稳定键相同也不能路由；
- 同键且标签语义相同的资料仍可复用，当前岗位答案仍按直接稳定键优先；
- 当前学校已回读结构化简历值时，确定性规划动作数为零，不触发覆盖或重试；
- 本次变更只收紧事实路由，不新增 Driver、不切换执行链，也不增加模糊或失败兜底。

## 2026-09-02 Phlexing Moka 意向工作城市

| 项目 | 证据 |
|---|---|
| 验收状态 | 当前原型按正式 Driver 同款的可信指针与回读序列完成真实单控件验证；不运行完整投递 |
| 验收时间 | 2026-09-02，Asia/Shanghai |
| 原型分支 | `codex/fix-moka-city-option-unavailable-20260902` |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/phlexing/100123#/job/<job>/apply` |
| 控件签名 | 唯一可编辑 `INPUT`；Moka `sd-Select-container-*` 与 `sd-Dropdown-container-*` 祖先；初始 placeholder 为“选择意向工作城市” |
| 目标来源 | Gateway 已确认的单岗位城市事实；本记录不保存候选人或岗位具体值 |
| Driver 分流 | `moka.phlexing.location.trusted-focus.v1`；`site_deterministic`、`background_tab`，无通用、键盘、DOM 强写、刷新、重试或其他 Driver 回退 |
| 最终提交 | 未上传文件、未点击预览或最终提交 |

真实页开始时控件展示值为空，且仅有一处城市 Select/Dropdown 签名。按正式路径对实时命中点执行一次
`Emulation.setFocusEmulationEnabled(true)` 后的可信 `mouseMoved → mousePressed → mouseReleased` 打开动作，
页面出现唯一城市叶子；对唯一精确叶子执行同一可信指针序列后，React 重建输入节点，原生 `input.value`
仍为空而权威 `display-value` 回读为目标城市。最终弹层关闭，字段内未出现城市必填/无效校验。随后按同字段
唯一非交互标题的位置执行一次失焦提交复核，展示值保持不变且校验仍清除。

这说明 Phlexing 控件不能把原生 `input.value` 当成选择结果；正式完成条件只能是展示值精确匹配、弹层关闭和
局部校验清除。测试期间未填写候选人字段、未上传附件、未点击预览或最终提交，也未记录候选人个人信息。

## 2026-09-02 tap4fun 日历型出生日期

| 项目 | 证据 |
|---|---|
| 验收状态 | 生产失败取证、同页真实单控件完整选择与本地自动化通过；打包插件任务待合并发布后复验 |
| 验收时间 | 2026-09-02，Asia/Shanghai |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/<job>/apply` |
| 生产命令 | `1a1b0d22-e624-4357-b61b-21da78ee6f4d`（批次 `cc84a81c-541a-487d-beff-8d5a46229017`） |
| 原始失败 | `date_control_interaction_failed`；`出生日期` 命中通用 Moka v8 后报“日期控件没有唯一可点击的年份导航按钮” |
| 独立 Driver | `moka.tap4fun.birth-date.trusted-pointer.v1`；不回退到 Moka v8、键盘或 DOM 值写入 |
| 最终提交 | 未上传简历、未点击“预览并提交”或最终提交；单控件回读后关闭测试页 |

### 真实控件与根因

1. `出生日期` 是 readonly `INPUT`，位于 `sd-Dropdown-container-*`；弹层为
   `sd-Dropdown-dropdown-*`，初始状态是包含年份标题、月份标题和 42 个日期单元的日历面板；
2. 生产执行时页面位于 `scrollY=886.5`，弹层范围为 `top=-12`、`bottom=324`；四个导航按钮和年份/
   月份标题的中心命中固定的 90px 租户导航栏，而不是弹层自身；
3. 所以旧 v8 的失败不是日期事实、页面识别或按钮类名缺失，而是弹层向上展开后头部被固定导航覆盖；
4. 将输入框在打开前定位到视口 `top≈480` 后，弹层范围变为 `top=135`、`bottom=471`，年份标题、
   月份标题及导航按钮均通过 `elementFromPoint` 实时命中验证；
5. 该租户点击年份标题进入 `2020 - 2029` 年份面板；选择目标年后返回同月份的日历面板，而不是旧
   Moka 出生年月控件的月份面板，因此还必须显式点击月份标题进入十二个月份面板。

### 同页完整选择证据

1. 使用非用户的合成测试日期执行“年份标题 → 两次十年向前 → `2000` → 月份标题 → `三月` →
   当前月非淡化且唯一的 `18`”；
2. 每次动作前都重新读取当前面板与唯一实时命中点；淡化的相邻月份同号日期被排除；
3. 页面权威输入值回读为 `2000-03-18`，弹层关闭，局部“这是必填项”校验消失；
4. 测试页随后直接关闭，未进入预览或提交阶段，仓库不保存候选人的实际出生日期。

固化实现只匹配 tap4fun 租户 291 的申请 URL、出生日期语义、readonly INPUT、Moka Dropdown 与日期
签名。完整日精度回读、弹层关闭和必填校验清除必须同时成立；已有不同日期时停止而不覆盖。动作账本
固定 `nativeEventClickCount=0`、`keyboardEventCount=0`、`retryCount=0`、`fallbackDriverCount=0`。

### 2026-09-02 跨视口目标级校正候选

后续作业帮同类 Moka 日历在 653px 高视口复现“弹层已经打开，但年份、月份和导航全部位于视口顶部
之外”的状态，证明仅针对某个租户预设输入框位置不能覆盖不同机器尺寸。`moka.tap4fun.birth-date.trusted-pointer.v2`
因此不再依赖固定的弹层安全位置，而是在打开和每次面板变化后复用共享目标级校正：只把当前阶段的
年份/月标题、十年导航、目标年、目标月或目标日纳入几何约束；整个弹层外壳是否出界不作为条件。测试
覆盖 500、653、709 和 900px 视口、顶部 fixed 遮挡、底部裁剪、滚动祖先、视口无法容纳与安全区命中
失败；后两类均失败关闭。该候选未在本节原岗位重复写入出生日期，也未点击预览或最终提交。

## 2026-09-02 作业帮 `HRBP[合肥]-27秋招` 年月日历路由与遮挡

| 项目 | 证据 |
|---|---|
| 取证状态 | 最新生产命令、同一登录态真实申请页几何与候选自动化已核对；未选择或改写日期 |
| URL 家族 | `https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/<job>/apply` |
| 生产批次 | `811d4e34-781b-444c-8ffa-f55d83466cef` |
| 生产命令 | `79ccdf65-cd91-4e5b-bd07-49a9ae476798` |
| 失败字段 | `教育背景 · 教育经历 · 结束时间`，稳定键 `education.end_date.native` |
| 控件签名 | readonly `INPUT`；placeholder `结束（YYYY/MM）`；`day_info` LABEL；Moka Dropdown 祖先 |
| 原始执行 | 预期 `date` 且值长度 7，连续三次“可信键盘输入后即时回读不一致”，实际值为空，`controlAdapter=null` |
| 候选分流 | `moka.zuoyebang.education-end-month.trusted-pointer.v1` 锁定已知字段并复用通用 v9 执行器；月精度、后台可信指针、目标级渐进校正；无键盘或 DOM 值回退 |
| 最终提交 | 未填写日期、未点击预览或最终提交 |

### 最新记录为何看起来只是缺少补充信息

最新岗位最终状态为 `waiting_for_user_action / missing_information`，补充请求是“目前职位”和“是否有教师
资格证”，但同一命令的字段执行明细保留了结束时间三次失败。也就是说，缺失信息收口遮住了日期控件
错误，并不表示该年月字段已经填写成功。相同岗位较早的命令也在同一字段失败并以
`site_validation_blocked` 结束，两个记录共同排除偶发网络错误。

根因分为两层：第一，旧指令工厂只为飞书年月区间把 `YYYY-MM` 转成结构化日期；作业帮控件虽然在
placeholder 明确声明 `YYYY/MM`，仍没有得到 `dateValue`，于是没有进入 Moka 日期 Driver，而被当作普通
输入发送键盘事件。第二，真实页打开结束时间后，输入框矩形为 `top=307,bottom=345`，向上弹层为
`top=-36,bottom=298`；年份、月份和导航目标位于 `top=-11..8`，完全在 653px 视口之外，顶部同时存在
`bottom=60` 的 fixed 导航。旧算法只检查 `elementFromPoint` 当前能命中的按钮，目标完全出界时得到 `null`
并无法计算校正。

### 候选策略与真实几何验证

1. 月精度只由控件自身证据判定：`type=month`、年月布局，或不包含“日/`DD`”的 `YYYY/MM`、`YYYY-MM`、
   中文年月 placeholder；“结束时间”等标签本身不构成降精度依据；
2. 作业帮窄路由要求租户 144908、`education.end_date.native`、readonly Dropdown、`day_info` 和
   `结束（YYYY/MM）` 同时成立并可直接确认字段归属；通用 Moka v9 不依赖企业自定义字段名，预签名后
   还必须安全打开并验证唯一完整的日、月或年份面板才确认路由；
3. `YYYY-MM` 转为 `{year, month, day: 1}` 进入统一日期指令，其中 `day=1` 只承载结构，Driver 选择并回读
   年月，不会向页面填写日期 1 日；
4. 打开和每次面板切换后收集当前阶段所有动作目标的矩形，即使它们完全在视口外也保留几何；按目标
   横坐标计算 fixed/sticky 顶部遮挡和剩余有符号位移；正式策略把步长上限取为视口高度 10%、并夹在
   24–64px，最后一步只取剩余距离；重新观察后仅在方向一致且剩余遮挡严格缩小时继续；
5. 在真实页只执行一次由上述公式得到的 83px 向下校正，不选择任何年月：弹层顶部由 -36 移到 47，
   输入框顶部由 307 移到 390，六个年份/月/导航目标均位于 `top=72..73,bottom=89..91`，且每个目标
   `elementFromPoint` 都命中自身；随后关闭弹层；
6. 候选自动化覆盖月/日精度分类、视口上下边界、固定导航、嵌套滚动、无法容纳和命中歧义。上述 83px
   只是当次真实页的总几何结果，不是运行时常量；653px 视口下会拆成 64px 和 19px 两步。渐进过程
   最多 12 步，页面不动、方向相反/反复或遮挡不再缩小时立即停止，不盲滚、不盲点、不切换 Driver。

这次真实页验证证明了原始路由缺口和当次 83px 总几何校正结果；由于没有改写用户草稿，它不宣称 v9 已在该
字段完成年月选择与最终回读。完整打包插件仍需在用户授权的自然投递中验证 `YYYY-MM` 回读、弹层关闭
和局部校验清除，且不得为验收重复提交岗位。

## 2026-09-02 Linctex Moka 缺失意向城市补充闭环

| 项目 | 证据 |
|---|---|
| 验收状态 | 原始 AI Offer 补充弹窗失败、无写入选项探测和用户确认后的单控件完整选择均已在同一真实页面验收 |
| 验收时间 | 2026-09-02，Asia/Shanghai |
| 原型分支 | `fix/moka-missing-city-supplement-0.15.84` |
| 原型提交 | `2528270` |
| URL 家族 | `https://app.mokahr.com/social-recruitment/linctex/46055#/job/<job>/apply` |
| 控件签名 | 唯一可编辑文本 `INPUT`；placeholder“选择意向工作城市”；Moka `sd-Select-container-*` 与 `sd-Dropdown-container-*` 祖先 |
| Driver 分流 | `moka.linctex.location.trusted-focus.v1`；`site_deterministic`、`background_tab`，无通用、键盘、DOM 强写、刷新、重试或其他 Driver 回退 |
| 最终提交 | 未点击“预览并提交”或最终提交入口 |

### 原始失败与无写入探测

AI Offer 投递记录显示候选人信息包缺少招聘页必填信息，下一步为“补充信息后重新投递”。补充弹窗中的
“意向工作城市”却显示“该字段的填写方式暂不支持”，提交按钮禁用。页面侧字段观察是 `combobox`，但
旧通用探测使用合成事件，无法展开该 Moka 控件，因而把空 `options` 交给前端；前端无法为没有选项的
自定义下拉框提供用户选择。

真实申请页初始权威展示值为空，并显示“必填项未填写”。对唯一输入命中面执行一次可信点击后，出现
唯一 Moka 弹层；省份标题和城市叶子分别处于 `Menu-header` 与 `Menu-content-item → option-label`，只有
后者进入补充选项。探测阶段不点击城市叶子，随后点击同字段唯一非交互标题，弹层关闭；展示值仍为空，
“必填项未填写”仍存在。该结果证明选项可以安全返回给用户，同时探测本身没有代替用户作求职选择。

### 用户确认后的正式选择与回读

在用户明确允许单控件验收后，按同一唯一输入和城市叶子序列选择页面实时提供的目标选项。第一次回读
中权威 `display-value` 已与预期城市精确一致且弹层关闭，但旧“必填项未填写”仍在；这与既有 Moka 城市
Driver 的失焦提交证据一致。随后只对同字段唯一非交互标题执行一次可信点击，最终再次回读：展示值仍与
预期一致，弹层保持关闭，字段内“必填项未填写”消失。全程未输入其他候选人资料、未上传文件、未点击
“预览并提交”或任何最终提交入口。

## 2026-09-02 Style3D Moka 预览按钮无状态推进

| 项目 | 证据 |
|---|---|
| 取证状态 | 两次用户正常授权投递的生产记录、插件持久轨迹和页面截图已核对；未为调试额外提交真实岗位 |
| URL 家族 | `https://app.mokahr.com/social-recruitment/linctex/46055#/job/<job>/apply` |
| 岗位范围 | Style3D“3D培训总监（设计方向）” |
| 设备版本 | Recruiting AI 0.15.84 |
| 表单状态 | 第二次任务已完成填写与最终复核，页面存在唯一可见启用“预览并提交” |
| 两次共同轨迹 | 状态浮层已移除、Debugger 已附加、焦点模拟已启用、唯一按钮实时命中点成立、已发送预览可信指针；之后 URL 不变，未发现最终确认控件或成功回执 |
| 生产终态 | 旧版在 12 秒后错误进入 `waiting_for_site_receipt`，约 120 秒后均以 `site_success_not_observed` 失败 |
| 根因边界 | 0.15.84 只把 CDP 指令返回当作“已触发提交”，既未回读目标是否收到可信 click，也未区分可逆预览门和不可逆最终确认 |

本次候选修复把“预览并提交”拆为独立预览门：在目标元素上记录可信鼠标事件；按下期间控件被重建、
没有形成可信 click 时，只允许重新定位并重试预览一次；可信 click 已送达后不再重试。只有唯一最终确认
指针已发送、初始控件属于直接提交、或页面已出现明确提交结果时才落盘提交检查点。预览 click 已送达但
页面没有出现预览/确认状态时，任务明确返回 `preview_submit_not_opened` 和 `submitExecuted=false`，不再
进入被动回执监控。

打包插件在本地受控 Moka 页面完成两条浏览器端到端回归：第一条在首次可信 `mousedown` 时同步重建
预览按钮，第一次没有 click；插件重新绑定后第二次收到唯一可信 click，随后预览和最终确认各成功一次并
取得成功回执。第二条让页面收到唯一可信 click 后故意保持原状态；插件未重试、未点击最终确认、未创建
站点回执，并返回 `failed/preview_submit_not_opened`，轨迹不含 `site_receipt_monitor_started`。这两条仅
证明浏览器执行链与失败关闭边界；真实招聘站点的完整成功回执必须由用户下一次正常授权投递自然验收。

## 2026-09-03 中兴同页城市文本与城市下拉完整分发验收

URL：`https://app.mokahr.com/campus-recruitment/ztehr4/150449#/job/0cd95c1e-8620-4aea-90b4-8c96f7bd062d/apply`。
隔离原型基于 `4eb5eee`，分支 `fix/native-city-routing-missing-evidence-20260903`；
原型 `background.ts + page-adapter.ts` SHA-256 为
`7d1212bf39f29d949acf5976c8faa74b7b7d78fca4b073c795c6ef7fb8f7296d`。
脱敏结果见 [真实页控件验收记录](evidence/zte-native-city-20260903.json)。

原生产任务在“求职意向 · 期望城市”进入第 7 轮填写时停止。注册表已识别为 `generic.native.v1`，
但城市专用封装按 URL 与城市语义拒绝原生控件，并被上层改写为 `location_selection_unconfirmed`。
终态又把整页未填必填项列为用户待补充，而结构化请求为零。不能据此认定所有空字段都缺少候选事实。

第一次隔离原型正确进入原生 Driver，但真实页仍报告字段消失。继续核对发现观察器接受“选择…”及
已提交展示的 Select 签名，填写器重定位只接受“请选择…”：相邻下拉被错误计为第二个原生城市，导致
`.native` 稳定键产生重复序号。修复保持稳定键与语义保护，不使用选择器兜底或删除稳定键。

用户明确授权后，独立临时扩展在新建后台页调用直接从原型提取的
`instructionFromObservedField → executeDeepSeekLocationInstructionWithTrustedFocusDriver`；
原生分支继续调用原型 `executeApplicationFillInstructions → fillApplicationPage`，下拉分支调用原有
后台可信指针城市 Driver。没有后台任务监听器、设备配对或 Gateway 领取行为。

| 控件 | 现场签名与唯一 Driver | 真实回读 |
|---|---|---|
| 求职意向 · 期望城市 | 可编辑 `INPUT[type=text]`，placeholder“期望城市”，`sd-Input-input-*` 与 `string_info` 包装，无 Select/Dropdown 祖先；`generic.native.text.v1` | 原生 focus → setter → input/change/blur 后，约 700ms 与累计 1600ms 两次观察均为“深圳”，局部校验为空 |
| 申请信息 · 意向工作城市 | 可编辑 input，但有 `sd-Select-container-*`、`sd-Dropdown-container-*`、placeholder“选择意向工作城市”；`moka.zte.location.trusted-focus.v1` | 唯一实时城市叶子可信点击及必要标题提交后，Driver 成功；两次观察均为“深圳市”，局部校验为空 |

验证结果 `success=true`；未点击预览或最终提交，测试页关闭。此证据仅验收两种控件的正式交互和回读，
不宣称整个岗位已成功投递。回归同时覆盖未知自定义城市拒绝、无其他 Driver 回退、已知字段继续填写、
未知必填答案不进入模型，以及真实控件故障不会被改为补充信息或由后续展示文本覆盖。

## 2026-09-03 MR132 证件类型＋号码组合观察修复（原型，待重新加载验收）

真实样本：`https://app.mokahr.com/campus-recruitment/sungrow/94416#/job/83ea6cc4-9ba6-4e61-8a26-719d783c4022/apply`。
旧包 `0.15.93.132 / 4b92448` 在真实页观察到两个同名“证件号码”、均 `required=false`；
类型 display-value 已为“身份证”，号码空。共享必填错误位于类型 Select 的 `sd-Input-message` 内，
号码位于同组 `number-*` 包装。原观察器未识别此组合，两成员均继承该错误。

本次 Draft 原型在共享观察器按有界证件组标题＋一个选择控件＋一个可编辑号码输入识别成员，
分配独立标签/稳定键/必填性。原生 SELECT、ARIA combobox 与 Moka Select 使用相同成员识别，
实际操作仍走唯一注册 Driver；没有为其他公司扩大 Moka 专用 Driver 注册范围。
Moka 的已取证共享错误拓扑单独标识：单纯缺失错误归于空成员，非空/不明拒绝保留组合更正，
显式成员 ARIA 错误优先，不隐藏网站错误或清空错误节点。类型 Driver 复用同一观察器判断成员错误，
不因空号码重复打开、滚动或提交类型；号码继续由通用原生文本 Driver 填写。

回归覆盖观察、唯一分发、共享/成员局部错误、未知组合与无关控件、信息补充键隔离、React 重建回读，
以及已选类型零交互。测试数据均为无效的明显合成标记，不使用真实证件信息。
**当前仅完成真实问题取证和原型自动化验证，不代表新包已在真实页通过。**
需用户手动加载新版验收包后，执行正式插件的原生号码填写和类型独立回读；
确认网站接受、错误归属正确且最终提交未点击，才能补充真实验收结论并解除 Draft。
本修改不恢复提交前完整性/模型审计，不修改 Gateway 或正式发布版本。

## 2026-09-03 微观博易双语提交按钮只读识别/定位

隔离原型基于远端 `5b0661743634265998227014c14370c182c87b3a`，分支
`draft/bilingual-submit-phrases-20260903`。源文件指纹、执行结果及只读桥兼容处理详见
[脱敏记录](evidence/bilingual-submit-phrases-20260903.json)。

真实 URL 家族为 `https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/<job>/apply`。
控件为原生 `BUTTON[type=button]`，嵌套两个 span，按钮文字为
“预览并提交 / Preview and submit”；`sd-Button-*` 外包 `sd-Tooltip-*`，没有自定义字段 Driver。
旧纯中文整串匹配返回 0 个目标，生产记录在点击前已报 `final_submit_target_unresolved`。

本次直接从原型抽取实际观察器动作段、共用短语库和 CDP 目标解析表达式，在同一真实页只读执行。
浏览器只读桥没有 WeakMap/HTMLInputElement 构造器，验收器以本次快照的键值数组缓存及 INPUT 标签检查
替代这两项接口；业务匹配、唯一性、完整文字绑定和目标解析未改写。正常 Chrome 构造器及闭包隔离
另由自动化测试覆盖。仅使用 UI 滚动到按钮，没有点击、输入、上传、刷新或操作其他任务页面。

两次回读均为：唯一 `final_submit`、原始双语文字完整保留、`disabled=false`；最终解析得到同一真实
BUTTON，中心 `elementFromPoint` 命中按钮或其子节点。测试页随后关闭。
这只证明该次修复的识别和目标解析通过，不宣称预览/二次确认页面、网站校验或完整岗位投递已经实测成功。
可信点击、重复提交保护与网站校验交接代码保持原有事务；没有为验收额外提交真实申请。

提 MR 前已 rebase 到 `main=ba5590e`，保留主干新增的提交页生命周期保护、Moka 字段提交和提交前
可见网站错误处理，本 MR 不撤销这些基线行为。通过 AST 提取并对比 SHA-256，确认已验收原型的
`executeFinalSubmitWithDebugger`、`observeApplicationPage`、`resolveApplicationUserAction` 函数体
完全不变。合并后 146 个文件 / 1,835 项测试通过，标准项目类型检查、文档检查及插件构建通过。
扩大到后台完整依赖树的类型检查仍有 43 条基线错误，与新主干逐条对比无新增。

## 2026-09-04 微观博易项目年月单次定向复填

真实 URL 家族为 `https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/<job>/apply`，岗位为
“量化策略实习生 Quant Researcher - 北京（2027量化夏令营）”。脱敏结构化记录见
[真实页控件验收](evidence/microtrading-project-date-single-repair-20260904.json)。

现场是双语“项目经验 / Projects”区块中的四个 Moka 年/月 Select。网站上传简历解析出的项目结束日期
早于开始日期，首次提交会把同一范围四个子控件作为必填错误集合返回。候选信息包中的权威事实是
`2025-10` 至 `2026-09`。本次验收只把这四个稳定键作为冻结的定向复填范围，调用生产观察、规划、
注册表分发、Moka 年月 Driver 和注册回读；没有执行完整岗位任务或最终提交。

第一阶段发现 React 重建后瞬时 `fieldId` 变化会让已完成稳定键重复进入计划；修复后每个稳定键成功处理
一次即从本轮修复集合移除。第二阶段发现末月选项“9”部分露在弹层底部，旧点击中心落在裁剪边界而被
网站忽略；修复后只有选项完整位于弹层和视口内才点击，否则先执行有界可信滚动。

最终现场回读为 `2025 / 10 → 2026 / 9`，四项共享日期比较错误全部清除，修复失败为空。全程保持
AI Offer 标签页在前台；目标页没有激活事件、导航、刷新、重新上传、模型调用或预览/提交点击。
这证明 Moka 双语项目年月控件可在后台按冻结字段集合完成一次定向复填和权威回读，不证明第二次提交
或整个岗位投递成功。第二次提交仍被网站拒绝时归集全部当次报错字段的行为由生产编排自动化回归覆盖。

## 2026-09-04 Moka 站点托管禁用字段跳过

真实 URL 家族为 `https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/<job>/apply`。现场上传
合成测试简历后，Moka 自行解析并锁定“最高学历”和“毕业时间”控件；毕业年份、月份分别显示
`2021`、`6`，对应两个 INPUT 均为 `disabled=true`。同页教育经历的就读时间仍是可操作的 readonly
自定义选择控件，不能与 disabled 混为一类。验收信息包故意保留毕业日期 `2022-06`，复现旧版本因
页面值与信息包不一致而向锁定年份下发动作、最终返回 `control_disabled` 的问题。

修正后加载扩展 `0.15.100 / b34600c`，同一真实页、同一差异信息包返回
`ready_for_final_confirmation`，失败详情为空。页面权威回读仍为 `2021 / 6`，插件没有强行启用、
修改或要求 Driver 接管这两个控件；其他可编辑字段继续按原流程填写。最终停在唯一
“预览并提交 / Preview and submit”按钮前，安全验收配置为 `allowFinalSubmit=false`，没有点击真实
预览或最终提交，也没有刷新页面。

自动化回归同时覆盖初次确定性规划、模型规划、必填阻塞检查、提交后冻结字段定向复填和回读：
disabled 字段均被排除；仅 readonly 的已登记控件仍保留。若招聘网站提交后明确拒绝 disabled 字段，
返回 `site_managed_disabled_field_rejected`，不误导用户补充一个无法编辑的字段，也不执行第二次相同提交。

## 2026-09-06 xTool 飞书 Formily 字段方言与平面下拉结构取证

真实申请页为 `https://xtool.jobs.feishu.cn/index/resume/7648900330809985318/apply`。本次只读核对确认：
字段最小根为 `.ud-formily-item`，标签位于 `.ud-formily-item-label-content`，字段语义同时暴露在
`data-form-field-id/name/i18n-name`；提交后的局部错误使用 `.ud-formily-item-error-help`，其中实际文案
包括“姓名为必填”“学历为必填”等字段名式必填错误。旧观察器会优先把 INPUT 自身携带的
`data-form-field-id` 当成字段根，因此看不到外层标签与错误节点。

“学历”控件现场为 readonly `INPUT[type=search][role=combobox]`，位于 `.ud__select__selector` 和
`.ud__select` 内。弹层为唯一 `.ud__select__dropdown`、`.ud__select__list` 与平面
`.ud__select__list__item` 叶子，现场选项为博士、MBA、硕士、本科、大专、高中、专职、初中、小学。

首次加载 MR !152 的 `a748000` 候选构建后，在同一控件执行一次可信打开和唯一精确“本科”叶子点击：
页面视觉值已变为“本科”，弹层也关闭，但生产回读仍为空。现场 DOM 证明飞书把已提交值放在
`.ud__select__selector__selectItem`，不是原 fixture 使用的
`.ud__select__selector__selection__item`；因此当场判定候选版失败，没有把视觉成功误记为 Driver 成功。

修正提交 `f770102d21674aca47bde112b9337957b9469d16` 将这个真实展示节点同时纳入字段方言和 Select
Driver 回读。Chrome 的 unpacked 测试扩展更新到该构建并 Reload，申请页刷新后从空学历重新执行相同
生产定位与交互序列：字段根、readonly combobox、打开目标和弹层均唯一；“本科”在九个真实叶子中精确
命中一次并只点击一次。最终回读 `actual=本科`、`popupCount=0`、无字段错误且无
`aria-invalid=true`。页面“提交简历”按钮仍存在且全程未点击，也未输入其他候选人资料或上传文件。

自动化回归为 151 个文件 / 1,926 项测试通过，标准类型检查和插件构建通过。该证据通过飞书 Formily
平面 Select Driver 的真实控件发布门禁，并验证共享字段观察能读到同一已选值；不宣称完整表单或岗位
最终投递成功。日期、级联、树形、多选等非平面控件仍必须分别识别并进入各自 Driver，不从本次结果外推。

## 2026-09-07 主线科技 Moka 原生简历上传校验（取证，未完成插件验收）

原失败截图明确显示申请表错误提示和上传分区红标，原任务命令包含 PDF 简历资产。独立公开空表
此前一次预览校验后，`#resumeKey[name=resumeKey][type=file]` 的独立 `.file_upload` 容器具有
`error-ssB9wMzEaC`，却没有文字或 aria-invalid；相邻 `attachment_upload-*` 没有这个错误。
[脱敏结构记录](evidence/moka-native-resume-validation-20260907.json)保留实际字段签名。

只读识别限定已取证 URL 家族、原生简历输入、单控件字段根、直属归属链和 CSS Module 错误状态。
原生上传 Driver、成功回读、字段稳定键及点击事务不变；没有新增提交前全表自检或模型审核。
新的字段错误仍必须在本次可信提交之后被原校验流程确认，旧红框不能单独授权重提。
活动提交明确拒绝文件时返回已有站点校验状态及上传原因，保留所有当次错误和原页，不将文件变成
文本补充问题、不自动重传或再次提交。此次没有扩展迟到回执协议。

新结构谓词在真实页只读命中简历且排除相邻附件；本机 16 项观察回归通过，原版相同测试复现 4 项遗漏。
完整打包插件及原任务上传为何未接受仍待核实，不能据此声称主线科技投递已修复或已成功。

## 2026-09-07 全量修复正式 Driver 验收（rc.3 / rc.4）

原失败和受影响成功控件通过既有 localhost 网页 Bridge 进入安装包的正式观察、唯一注册 Driver、交互和延迟回读；未访问旧扩展验收页面，未最终提交。rc.4 运行诊断中的 buildCommit 为 `c630b253da9745a2bb85664efe83a03f03a4d5ce`。

学校检索在 rc.3 华测通过而 JoyCastle 提前退出，收窄异步等待后 rc.4 两者都完成一次查询、一次精确叶子选择、展示值提交与错误清除。FunPlus 完成一次多选城市展开/选择/标题关闭，Nothing 和 DeepSeek 已有选择路径通过，微观博易已有值保持零操作。NVIDIA 与中兴姓名正确绑定，中兴拼音/导师保持原值；其旧 120 秒联调等待超时已由完整长窗口正式回执补证，不记为新插件失败。卓识与 Garena 出生年月正式选择后，placeholder 清空仍维持同一稳定身份；tap4fun 原生年月路线通过。

主线原 PDF 经正式原生上传 Driver 保存为精确文件名，上传容器无错；xTool 经 Formily Driver 一次写入后等待实际完成卡片，文件名精确一致且无错误。旧联调把整个 xTool 富文本文件卡与文件名直接比较，不能推翻 Driver 和卡片的有效结果；未重传修补测试结果。此记录不推断主线历史上传原因。

详细范围和账本见 [rc.3 记录](evidence/rc3-production-control-acceptance-20260907.json)、[rc.4 记录](evidence/rc4-production-control-acceptance-20260907.json)。Garena 自定义年月空值及 Workday 方式选择/登录识别的追加修复仍需 rc.5 验收，不能由本节其他通过项外推。

## 2026-09-07 rc.5 收尾结果及 rc.6 边界

实际运行 buildCommit=09d6f9313b966cc119e53be2178111fe1876c1fe。Garena 四年月空值经两次正式观察保持空、四个稳定身份独立、无局部错误；没有已确认的未来实习日期，未做填写，部分已填隔离仅有自动化覆盖。微观博易、Nothing、FunPlus 正式 Driver 保持已有选择且相邻字段不变。

BlackRock 新建后台详情页首次点击未跳转。真实根样式 scroll-behavior=smooth，旧定位在滚动后立即取矩形，共享指针 80ms 悬停期间仍可能移动；同一已滚动页再运行正式入口成功经过唯一 Apply Manually，并返回 failed/login_required，与实际三个登录提供方按钮一致。两次都没有人工点击入口、预览或最终提交，不把第二次成功覆盖第一次失败。

[rc.5 脱敏账本](evidence/rc5-production-control-acceptance-20260907.json)保留两个结果。rc.6 仅在该登记入口中采用即时滚动后再定位；行为回归已证明旧坐标会失效，仍须用户加载后从新开后台详情页验证。已通过的字段 Driver 不再修改。

## 2026-09-07 rc.6 全新后台详情页入口通过

用户加载 rc.6 后，正式 Driver 的 buildCommit 确认 a23a168cac475a2c84c446dbd9db981fcf6f2883，微观博易已有城市及相邻字段保持。04:42:07Z 启动一次关闭最终提交的本机正式入口验收：新建后台 tab 1750965437，未复用此前 1750965414/1750965426 登录页。原 BlackRock 详情 → 已登记 TalentBrew 顶端入口 → 同岗位 Workday 方式页 → 唯一 Apply Manually → Sign In，04:42:23Z 返回既有 failed/login_required，说明“页面要求选择登录方式后继续”。CUA 独立只读核对同一新页的三个提供方/邮箱按钮及申请第一步，与回执一致。

本轮没有人工点击招聘入口、登录提供方、预览或最终提交，也没有上传或主动解析简历；没有重放原批次。该结果通过新开页面首次入口门禁，不能解读为已经投递成功。详细 [rc.6 账本](evidence/rc6-production-entry-acceptance-20260907.json)。rc.5 到 rc.6 的字段运行文件逐字节相同，因此前轮控件保护证据仍有效；全套 2230 项及 1958 项原断言也通过。只追加验收文档，无新运行代码或重打包。

## 2026-09-08 银河通用 Moka 电话区号结构与基线事件取证（候选包待验收）

真实申请页为 `https://app.mokahr.com/campus-recruitment/yinhetongyong/165930#/job/cb550f85-d1d7-4189-be4f-2dbf046541e6/apply`。
独立只读诊断页中的“手机号码”字段由同一个 `apply-field-*` 包裹两个物理控件：左侧 `code-*` 内是
Moka Select/Dropdown 及可编辑空查询 INPUT，右侧 `number-*` 内是 placeholder 为“请输入手机号”的文本
INPUT。左侧提交展示为 `+86`，其 INPUT value 为空；打开弹层时展示子节点临时带 ghost 类，但查询值仍空。
唯一控件自有菜单中只有一个真实 `Menu-content-item-*` 叶子 `+86`。

基线页执行一次真实 UI 打开和唯一 `+86` 叶子点击后，菜单 DOM 自动消失，提交展示仍为 `+86` 且 ghost
类消失，区号 INPUT value 仍为空；右侧手机号 value 仍为空、placeholder 不变，字段 wrapper 没有错误。
没有输入、上传简历、点击预览或最终提交。完整结构和动作记录见
[银河通用电话区号取证](evidence/moka-phone-calling-code-live-20260908.json)。

这次交互发生在本轮候选插件生成前，只证明真实控件的结构和网站提交事件序列。用户原截图中的 `1` 所在
标签页已关闭，无法重现或确认该值的产生来源；当前真实页也只有 `+86` 一个选项。因此，本记录不证明新
Driver 已清除 `1`，也不证明多选项分支或完整岗位投递成功。候选插件加载后仍需在该控件执行正式生产
Driver 验收，并对受影响的既有 Moka 平面下拉成功路径做控件级回归；不得提交申请。


## 飞书 ATSX / Formily 已安装候选验收（2026-09-08）

已安装 rc.3 构建 `379959b2b5c4200a494d20a50f263efe97a8b380`，rc.2 构建 `cea1e53b9d60238df26cc8f62d0a5f182aed3143`。原始命令、Driver、输入、回读、局部校验和版本分别保存在 `docs/evidence/feishu-rc2-control-acceptance-20260908.json` 与 `feishu-rc3-control-acceptance-20260908.json`。

- 去哪儿 ATSX 学校搜索上海大学、学历本科、学历类型统招全日制通过正式 Driver；图拉斯 Formily 学校、学历、视口外学历类型、多选完整标签、实习年月两端通过；理想上海城市叶子通过，全部有闭合控件与局部无错回读。
- xTool 深层亲属字段各唯一定位、教育时间恢复 DOM 顺序；只验证定位，没有填未提供的亲属事实。年份 2024 和学历本科实际执行通过。
- 去哪儿 ATSX 与 xTool Formily 主简历上传，xTool/图拉斯作品上传完成卡均通过；主简历与作品分别使用精确用途资产、独立根和无错完成卡。图拉斯个人声明复用既有通用协议 Driver，授权后回读为 true；此前拦截来自测试命令禁用声明处理，不代表控件不支持。
- 受影响的 Moka tap4fun 原生毕业院校及专用学历 Select 成功路径通过。没有把可选的另一个学校搜索字段算为已测，也不把所有 Moka 控件统称通过。

主简历、作品及声明的完整回执见 `feishu-rc3-resume-upload-acceptance-20260908.json`、`feishu-rc3-portfolio-upload-acceptance-20260908.json`、`feishu-rc3-torras-portfolio-consent-acceptance-20260908.json`。所有测试停在最终提交前；完整申请、未知多级树及服务多选端到端部署不在本轮实际通过范围。注册表本轮仅同步 evidence 说明，实际分派和执行代码保持已测版本。

### 2026-09-08 Moka 三类控件缺口（修复候选，非完整投递验收）

0.15.111 原始检测覆盖 39 入口/1412 字段；JoyCastle、华测专业点击无菜单，卓识学校中文主标题与英文副标题拼接导致精确查询不匹配，tap4fun 旧学校及 tap4fun/紫龙只读区号未登记。详情见 [修复影响记录](MOKA_CONTROL_GAPS_FIX_20260908.md) 与 [路由对照](evidence/moka-control-gaps-route-census-20260908.json)。

本次 CUA 人工机制取证：JoyCastle 专业输入“信息管理与信息系统”返回同名真实叶子及“添加专业全称”，选叶后提交展示已更新；tap4fun 旧学校输入“广东海洋大学”返回该校与湛江科技学院，点击后菜单关闭、input 保留完整中文；旧只读区号菜单具有 `Menu-content-item > span` 真实 +86/+886/+852 等叶子。卓识学校叶子主标题为中文、副标题为英文，点击后 `Input-display-value` 为“广东海洋大学 / Guangdong Ocean University”，查询清空、菜单关闭。

取证没有点击最终提交，没有新增投递。CUA 人工交互只证明控件机制，候选自身 chrome.debugger Driver 的跨站验收仍须安装候选后完成。

## 2026-09-08 控件输入候选 rc.4 日期、搜索及相邻控件回归

已安装 `873e91abae609cdc0ca46998d8c467925ec3b162`，通过正式桥接执行当前注册 Driver，未最终提交。小鹏为共享 throne 日期样本：开始端点空值从关闭状态打开，年份页 2020—2039 经唯一前翻按钮、2019、09月恢复教育开始日期；独立区间 2019-09—2022-06、面板关闭、局部无错。该前翻按钮中心为自身 SVG，实际 yearPage=1，证明本轮命中修正已进入真实执行。工作日期已开月份/年份面板两种起点均复用并恢复 2022-04；图拉斯普通日期两端恢复已确认实习区间；错误端点弹层返回明确归属失败、零点击且值保留。

同一候选通过图拉斯学校搜索、学历固定选择和团队多选；Moka 学校/专业搜索和固定学历；去哪儿普通专业文本。专业答案相同但实际 Driver 不同，三次搜索均有精确结果选择与独立提交展示回读。可选专业通用桥接指令被跳过，独立仍为空。共 12 次填写成功和 2 项预期保护结果，见 [脱敏账本](evidence/control-input-rc4-live-20260908.json)。

配套空远程列表输入契约经过当前真实字段元数据、本机请求生成器、Gateway Schema、Web 分类器通过，详见 [契约记录](evidence/control-input-rc4-search-contract-20260908.json)。不等于线上服务部署或补充续接通过。单选新选项、当前 ATSX 日期和真实后翻年份未覆盖；新包未重打，旧公司逻辑未清理。

## 2026-09-09 新国都 114.1 实际队列验收

URL 家族 https://app.mokahr.com/campus-recruitment/xgd/7850#/job/.../apply；候选基线 main cd15042，插件 0.15.114.1-draft-xgd-manual-captcha-20260909，background SHA-256 152e05f645ffff7d34fe90efcc34093e5310b40ebc91fd1dbf0c16204aebe837，ZIP SHA-256 853ce9b3a1f24f825ab966ee64b1fbb8c32117b4809fd22e79cdc1e887fa4c52。

教育背景两行采用 apply-block[data-nav-id] / apply-fields.multi 及所属 apply-field，学历与学位原已登记 Select Driver 保持不变；条件期望岗位重观察后按精确标签绑定。知情同意为 sd-Modal-modal，标题“个人信息提供知情同意书”，唯一可用确认按钮，经已授权通用可信指针协议 Driver 后回读四项协议 checked、弹窗关闭。

用户明确授权的完整队列命令 e44e9579-1d7e-48b0-bdb7-07989fc55a62：2026-09-09T01:54:52.425Z 领取，01:57:33.412Z 回传 waiting_for_user_action/captcha_required。执行了预览并提交与站点确认，不伪称“未点击最终提交”的控件测试。本站校验已允许进入手机验证，原任务页显示“向右拖动滑块填充拼图”，AiOffer 同步显示等待本人安全验证。siteConfirmation=null，不计实际投递成功。

本候选按用户要求用独立构建入口返回 not_attempted/owner_requested_manual_captcha_handoff，未识别或拖动验证码。正式插件仍保留 main CAPTCHA 策略，因此这次不证明正式包验证码处理通过。完整队列仅该岗位，原其他站点覆盖缺口不变。脱敏摘要见上述命令、构建哈希和 0.15.115 发布评估；本机原始回执保留在本任务验收产物中。

## 2026-09-09 全量修复 rc.3 控件验收

安装构建 d2e7a4547c185d1a26bce7b81184326d41d9a59c，extensionId phhinemgjimflliapancflmmgnnbljco，包含主线43d2f28。通过正式桥接调用现有Driver，所有单项禁用最终提交。

华测 campus-recruitment/cti/142093 的 readonly INPUT / day_info / Moka Dropdown 出生年月字段：原值1995-05 (31岁)，rc.2首次打开同构零年面板失败；rc.3在新开的相同原控件由 moka.date-picker.trusted-pointer.v9 完成选择，04:55:40.137Z至04:55:49.132Z回读1991-01 (35岁)，独立browser.readback_form确认validationMessage=null。随后使用相同Driver恢复原1995-05 (31岁)，再次成功；这是控件级证据，未提交申请，不能宣称年月控件保存了日。

中邮 youcash/resume/.../apply：国籍识别为新 feishu.formily-selector-search.trusted-pointer.v1，但已选显示盖住pointer-events:none的INPUT，focus=0/query=0停于query_input_not_ready，值中国保留。手动证据为唯一所属selector点击→INPUT获得焦点→搜索中国→完整候选中国/中国澳门/中国台湾/中国香港→精确中国→标题失焦→中国和无字段错误；该手动证据只用于修正定位入口，不能算候选Driver通过。期望工作地点多选带tag时，preferred_city_list所属根位于第11层，旧多选注册10层排除失效，返回两个注册歧义并保持广州不变。两项已新增复现测试后局部修正，等待下一候选正式Driver验收；xTool同构成功回归当前需用户登录，原页保留。
