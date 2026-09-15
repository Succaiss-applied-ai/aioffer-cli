# 模型与 MinerU 配置教程

这份教程面向第一次使用的中国用户。只需准备两类密钥：MinerU Key，以及一个支持图像输入的模型 API Key。不是每一家厂商都要开通，也不是聊天网页会员就一定有 API 额度。

当前适配器已实现请求/响应协议并有模拟测试。通义千问 `qwen3-vl-plus` 和 MinerU 已使用真实 Key、合成资料通过视觉识别、PDF 解析与本地导入验收；其他厂商尚未逐家真实联调。某个厂商可选不等于其所有模型都支持本工具，详情见[真实调用验收摘要](evidence/local-live-acceptance-20260915.json)。

## 第一步：申请 MinerU Key

1. 进入 [MinerU API 管理与接口文档](https://mineru.net/apiManage/docs)，登录你的账号，在 API 管理中创建自己的 Token。
2. 复制 Token，启动 `pnpm start`，在本地页面的“MinerU API Key”中粘贴并保存。不要发给维护者。
3. 上传一份你同意发送给 MinerU 的简历，勾选解析同意，点击“解析简历”。
4. 程序申请临时上传链接，上传文件，轮询解析状态，下载结果中的 Markdown，再交给你选定的模型提取资料。完成前不要重复点击。

本项目每份文件限制 20 MB、解析等待最多 5 分钟；这是本地产品限制，不代表 MinerU 套餐上限。TXT / Markdown 直接读取文本，不调用 MinerU，但仍要同意向模型发送资料。

若报 401/403，检查 Token 是否正确及账户权限；若额度不足、文件解析失败或等待超时，去自己的 MinerU 控制台查看任务。不要把包含真实文件地址和签名的日志公开。

## 第二步：选择一个视觉模型

在本地页面选择厂商，填写模型 ID 和自己的 Key。API 地址一般会自动填入，也可按厂商控制台修改地域地址。

| 本地选项 | 默认 API 基础地址 | 实现协议 |
| --- | --- | --- |
| 通义千问 / 百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容 Chat Completions |
| 豆包 / 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | OpenAI 兼容 Chat Completions |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | OpenAI 兼容 Chat Completions |
| OpenAI | `https://api.openai.com/v1` | Chat Completions |
| Anthropic Claude | `https://api.anthropic.com/v1` | Messages |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | generateContent |
| 自定义 OpenAI-compatible | 自行填写 | Chat Completions |

地址填写到表格所示层级，不要额外添加 `/chat/completions`、`/messages` 等接口后缀。不要在 URL 中放密钥、账号密码或查询参数。远端地址必须为 HTTPS；本地推理服务可用回环 HTTP 地址。

### 通义千问 / 百炼

1. 在 [百炼 API Key 教程](https://help.aliyun.com/zh/model-studio/get-api-key) 对应的控制台创建 Key。
2. 按 [Qwen-VL 兼容接口文档](https://help.aliyun.com/zh/model-studio/qwen-vl-compatible-with-openai) 选择支持图像、非流式输出的视觉模型；例如文档中的 `qwen3-vl-plus`，但最终以你的账号和地域可用型号为准。
3. 页面选择“通义千问 / 百炼”。使用业务空间专属域名时，把 API 基础地址改成控制台给出的完整地址；Key 和地域必须匹配。官方同时说明旧 `dashscope` 域名仍可使用。
4. 保存后测试视觉模型，再上传简历。当前不支持只提供流式输出的接口。

### 豆包 / 火山方舟

1. 在 [火山方舟控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/apikey) 创建 API Key，开通具有图像理解能力的模型。
2. 选择“豆包 / 火山方舟”，填写你账号可用的模型 ID 或推理接入点 ID。不要把纯文本 Coding 套餐地址当成普通图像接口。
3. 地址与调用格式按 [方舟接口文档](https://www.volcengine.com/docs/82379/1362931) 核对，保存后运行带图片测试。此适配器走 Chat Completions，不是 Responses。

### 智谱 GLM

1. 在 [智谱开放平台](https://open.bigmodel.cn/) 创建 API Key，选择明确支持图片输入的 GLM 视觉型号。
2. 页面选择“智谱 GLM”，填写模型 ID 并保留普通 API 地址；不同套餐和专项接口的地址、额度不能默认通用。
3. 保存并测试。当前未完成真实 Key 验收，具体账号可用型号请在平台确认，不要仅凭 `GLM` 品牌名判断视觉能力。

### OpenAI、Claude 与 Gemini

- OpenAI：在开发者平台创建自己的项目 API Key，选支持图片输入且可用 Chat Completions 的型号。本项目使用内联图片，不公开截图下载地址。参见 [OpenAI 图像输入文档](https://developers.openai.com/api/docs/guides/images-vision)。
- Claude：在 Anthropic 控制台创建 API Key，选支持图像的型号，使用 `Messages` 协议和 `x-api-key` 请求头。参见 [Claude Messages 文档](https://platform.claude.com/docs/en/api/http/messages)。
- Gemini：在 Google AI Studio 创建 Gemini API Key，填模型 ID，不要加 `models/` 前缀；通过 `generateContent` 的内联图像输入调用。参见 [Gemini 图像理解文档](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding)。

海外厂商的服务地区、账号资格和网络可达性由厂商决定，本项目不提供账号、转发网关或网络服务。

### 其他国内厂商 / 本地模型

如果服务提供标准 OpenAI 兼容的 `/chat/completions`，接受 `image_url` 的 Base64 图片，并能返回可靠 JSON，可选择“自定义 OpenAI-compatible”，填写服务商给出的基础地址、Key 和视觉模型 ID。

这是协议兼容入口，不是所有服务商均已认证。纯文本模型、只支持工具调用而不返回文本的接口、仅流式接口、私有图片结构或需要特殊签名的服务，需要单独适配。自建本地模型也要通过图片测试，不能因“接口通了”就认定控件识别可用。

## 第三步：测试、核对与费用

“测试视觉模型”只发送本地合成测试图，不发送简历；成功只能证明该次图片调用通过，不能证明所有网站可正确识别。随后上传你同意外发的简历，逐项核对提取事实，再执行投递。

模型会看见完成任务所需的资料和页面截图，费用由你与厂商结算。调用失败不会自动改用另一家厂商。不要使用不可信转发服务处理个人资料。

密钥保存在本机明文配置文件，目录和文件限制为本人访问；当前不是钥匙串加密方案。更换 API 地址或厂商时需重新填 Key，以避免把旧厂商密钥误发给新地址。需要撤销时先去厂商控制台禁用该 Key，再更新本地配置。
