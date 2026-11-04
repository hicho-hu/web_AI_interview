# AI 模拟面试 Web 前端开发方案

依据《AI模拟面试_Web前端设计方案_V1.0》和《AI模拟面试平台_项目需求说明书_V1.0》，并核对本机 FastAPI OpenAPI 及后端响应实现。产品是面向求职者的练习客户端。

## 架构与职责

React 19 + TypeScript + Vite SPA；React Router 管理受保护路由；TanStack Query 缓存、失效与按状态轮询服务端数据；Zustand 只管理会话和客户端 UI；Axios 解包统一 Envelope、鉴权与 request_id 错误；Zod 校验输入及关键响应。Ant Design 提供对话框和交互反馈，Tailwind 4 配合统一 CSS 设计令牌，ECharts 按需加载趋势和雷达图。

`pages → features / components → services/api → Axios → /api/v1 → FastAPI`。Mock 与真实服务共用接口；演示数据单独存储并明确标识，不在真实请求失败时自动切换为演示数据。

目录：`src/app` 路由与 QueryClient；`pages` 页面；`components/{layout,common,charts}` 通用组件；`features/{auth,interviews,media}` 业务；`services` 契约和适配器；`stores` 本地状态；`types` DTO；`utils` 日期与状态；`styles` 视觉系统；`tests` 单元及 E2E。

## 路由与组件

| 路由                   | 页面     | 主要组件                                         |
| ---------------------- | -------- | ------------------------------------------------ |
| /login                 | 登录     | 协议、独立演示、本地开发登录                     |
| /dashboard             | 工作台   | 开始练习、真实统计、最近记录、练习引导           |
| /interviews/new        | 创建面试 | JD/级别、可选简历、模式/题数/时长/难度/语言/追问 |
| /interviews/:id/room   | 面试室   | 问题、文字回答/录制、任务状态、倒计时、暂停/结束 |
| /interviews/:id/report | 报告     | 维度雷达、证据、逐题复盘、训练建议               |
| /history               | 历史     | 日期/岗位/模式/状态筛选、分页、成长趋势          |
| /profile               | 个人中心 | 昵称、额度、授权撤回、简历、导出与删除           |

## 状态和接口

不以页面状态推断后端流程。创建：岗位 PREPARING → READY → 面试 PREPARING → READY → 显式开始 → IN_PROGRESS。面试支持 PAUSED，提交轮次等待 SUBMITTED / TRANSCRIBING / ANALYZING 结束。FINISHING → COMPLETED / REPORT_FAILED。失败展示错误并提供任务重试，刷新后读取详情和 turns 恢复。读请求可以有限重试；写请求不自动重试，提交回答/创建/结束/重新生成使用稳定 Idempotency-Key，同一操作网络失败后沿用原键。

| 操作           | API                                                                      |
| -------------- | ------------------------------------------------------------------------ |
| 开发登录、用户 | POST /auth/dev-login、GET/PATCH /users/me                                |
| 授权           | GET/POST /users/me/consents、DELETE /users/me/consents/{kind}            |
| 岗位           | POST/GET /job-profiles、GET /job-profiles/{id}                           |
| 简历           | POST /resumes/upload-url、GET /resumes/{id}                              |
| 面试           | POST/GET /interviews、GET /interviews/{id}                               |
| 控制           | POST /interviews/{id}/{start,pause,resume,cancel,finish,retry}           |
| 回答           | GET /interviews/{id}/turns、POST /interviews/{id}/turns/{turn_id}/submit |
| 报告           | GET /interviews/{id}/report、POST /interviews/{id}/report/regenerate     |
| 媒体           | POST /media/upload-url、PUT 签名 URL、POST /media/{id}/complete          |
| 任务           | GET /tasks/{id}、POST /tasks/{id}/retry                                  |
| 隐私           | GET/DELETE /users/me/data、DELETE /interviews/{id}                       |

注意：`resume_asset_id` 实际传后端 ResumeAsset 的 `resume_id`，不是二进制媒体 `asset_id`。业务响应统一 `code/message/data/request_id`；OpenAPI 的 data 为宽类型，前端 DTO 依据真实 view 实现核对。

## 录音录像

语音和视频共用 `ConversationRoom` 连续对话流程。仅在安全上下文和用户点击后请求授权，记录后端 MICROPHONE/CAMERA/SCREEN_CAPTURE 授权。视频模式调用屏幕共享，将共享画面与摄像头合成为 720p 视频；Web Audio 将麦克风和后端 question_audio 混为同一音轨，同时写入整场音频与视频。面试官自动播放提问；候选人开口会取消尚未完成的音频请求或停止播放，停顿约 1.6 秒自动提交回答；上传期间继续说话时，等下一次停顿并合并补充后再提交分析。

整场 MediaRecorder 从面试开始持续到结束，换题、分析和暂停对话均不停止录制。timeslice 分块只用于 IndexedDB 备份，按顺序合并后形成一整段录音及一整段录像，修复 WebM 时长以便回放和拖动。结束后以 SESSION_AUDIO/SESSION_VIDEO 上传，不绑定单题，最长 2 小时、单文件最大 512 MB。ASR 使用麦克风 PCM 生成可独立解码的 16 kHz WAV 并关联轮次，当前后端单轮累计最长 3 分钟。签名过期自动重签，上传失败保留本地文件并提供重试；本地备份与网络保存均失败时提供内存文件下载并提示离页风险。关闭/刷新会中断，续录单独保存。报告页提供整场回放与下载；录制卸载时停止轨道、回收 Object URL。媒体下载 URL 仅内存使用，不持久化；视频不分析外貌、人格或敏感属性。TTS 缺失时保留收音、明确提示并允许重试播放。

## 分阶段执行与验收

1. 工程基础和可演示文字闭环：Mock 登录、创建、答题、动态追问、报告、刷新恢复；单元测试输入与关键状态、E2E 验证完整路径。
2. 真实 FastAPI：登录及协议、岗位解析、准备轮询、幂等提交、服务端恢复、报告；真实 HTTP/浏览器闭环验证。
3. 连续对话与整场录制：自动提问、开口打断、补充回答、暂停/继续、自动/手动结束、整场回放、签名重签与保存失败恢复；浏览器自动化使用虚拟设备，真实 Safari/Edge 和实际设备需后续真机验收。
4. 历史和个人中心：筛选、趋势、逐题证据、授权撤回、删除；响应式检查、生产构建、Docker/Nginx。

## 接口边界

网页微信扫码登录缺少后端接口。现有 wechat-login 是小程序 jscode2session，不能冒充 Web 登录；生产构建隐藏开发登录，保留独立演示模式。我的权益页支持套餐购买和模拟支付，复用后端 billing 的商品、订单、dev-pay 和 entitlements 接口；由后端原子更新订单并发放权益，前端不自行增加真实账号额度。创建键跨刷新复用，响应丢失先核对订单状态；待支付订单可续付。生产后端禁用 dev-pay，微信与支付宝展示暂不可用。Mock AI 报告清晰提示模拟结果，不表示实际能力评估。PDF 导出为后续增强，当前提供浏览器打印。禁止把模型密钥、个人资料或录音录像提交到 Git。

参考：[Vite 文档](https://vite.dev/guide/)、[TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/queries)、[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)。
