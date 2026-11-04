# 面试序章 · AI 模拟面试 Web

根据两份 V1.0 PDF 实现的求职者客户端，后端复用 `http://localhost:8000` FastAPI。架构与 API 对应关系见 [开发方案](docs/frontend-plan.md)。

## 本地运行

需要 Node.js 22.12+（Docker 使用 Node 24）和 npm。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

打开 **http://127.0.0.1:5173**。Vite 将 `/api` 反向代理到 `http://127.0.0.1:8000`，避免本地跨域。后端需持续运行且异步任务处理器可用。`.env.local` 中可修改 `API_PROXY_TARGET`。

- **开发登录**：输入自定义测试账号标识，同一标识可恢复同一后端账号；勾选协议后进入真实接口模式。此入口只在 Vite 开发模式启用。
- **演示模式**：无需后端，独立体验岗位定制文字题、追问、暂停/恢复、报告和历史复盘。数据保存在当前浏览器 localStorage；不上传简历、不录制媒体、不虚构评分。
- 若页面显示「本地演示 · 未连接后端」，点击提示条的「连接真实后端」，输入测试账号标识后使用「进入我的练习空间」登录；成功后会显示「真实后端已连接」。演示入口不发送后端业务请求。
- 真实服务失败会显示错误，不自动替换为演示结果。真实 token 仅保存在当前 tab 的 sessionStorage，退出或 401 清理会话。

浏览器 Network 中真实请求显示为 `http://127.0.0.1:5173/api/v1/...`，由 Vite 转发到 `http://127.0.0.1:8000/api/v1/...`，因此不应只按端口 `8000` 筛选请求；筛选 `/api/v1/` 即可。

## 功能

页面涵盖邮箱登录/注册、工作台、创建面试、面试室、评估报告、历史记录、我的权益、邀请好友和个人中心。支持 JD、级别、可选 PDF/DOCX 简历、面试难度/时长/题数/语言/类型/追问；文字问答、录音录像和回放、签名直传、任务轮询；服务端状态恢复、幂等写请求、报告证据和能力雷达、历史筛选/分页/趋势、权益购买、授权撤回、数据导出与删除。

语音和视频面试均为连续对话：面试官自动语音提问，候选人开口即可打断，停顿约 0.8 秒后自动接续。回答上传期间继续说话，会合并补充内容后再提交分析。整个过程无需逐题点击录制或提交。

低延迟版本使用即时任务处理、SSE 进度推送和 24 kHz PCM 流式播报，追问收到首批语音即播放，不等待整句合成或下一轮轮询。Qwen 实时 ASR 在回答过程中返回字幕，上传音频与转写凭证通过 PCM 哈希匹配后可复用识别结果。实时服务不支持或断线时保留收音，退回回答后转写；已接受的回答任务继续执行，不因浏览器断线取消。零延迟受端点判断、上传、模型和网络限制，不作保证。

字幕默认开启，可在面试室关闭显示；视频分屏叠加字幕，整场音视频同时保存 WebVTT 字幕文件，报告页可同步查看和下载。识别中的字幕可能修正，时间以句段为单位。后端升级补丁为 `docs/backend-live-conversation.patch`；配置和协议见后端 `docs/live-conversation.md`。生产网关须支持 WebSocket、SSE 并关闭缓冲，本仓库 Nginx/Vite 已配置。

语音模式从开始到结束保留一整段双方录音；视频模式同时保留一整段双方录音和一整段 720p 分屏录像（左侧为随提问语音动态开口的数字人面试官，右侧为本人摄像头）。提问、回答、分析等待和暂停对话期间均持续录制，结束后可在报告页回放和下载。录制分块备份到当前浏览器，整场文件最长 2 小时、每个最大 512 MB；网络保存失败可以重试。内部用于 ASR 的单轮回答仍受后端 3 分钟限制，不影响整场录音录像的连续性。

录制需要 HTTPS 或 localhost；视频模式使用麦克风与摄像头，同一张画布用于展示和录制完整分屏，无需选择共享屏幕。刷新或关闭页面会中断录制，再次授权后产生新的记录。后端需支持 `CAMERA` 授权及 `SESSION_AUDIO` / `SESSION_VIDEO` 整场资产（兼容补丁见 `docs/backend-session-recordings.patch`），并配好对象存储、ASR/TTS 和 ffprobe；模拟 AI 会在报告中标识。TTS 音频缺失时保留收音与录制并提示重试。

## 购买权益与模拟支付

从侧栏「我的权益」、个人中心「购买练习权益」或创建页额度提示进入 `/billing`。选择套餐，确认订单金额与练习次数后点击「确认购买 · 模拟支付」，即可模拟成功回调。页面明确提示不产生真实扣款，微信与支付宝入口显示「暂不可用」。权益按文字、语音、视频分别计数。默认提供单次文字训练、3 次文字 + 2 次语音 + 1 次视频的多模式体验套餐、5 + 3 + 2 的 10 次组合与 10 + 6 + 4 的 20 次组合；真实模式以服务端套餐和订单快照为准，不承诺当前接口未提供的到期规则。

真实模式复用现有 FastAPI `/billing/products`、`/billing/orders`、`/billing/orders/{id}/dev-pay` 与 `/billing/entitlements`。订单固化购买时的类型次数组合，购买后按类型分别到账。创建面试优先预占对应类型次数，不足时可使用保留的历史通用次数；取消未开始的面试和准备失败会返还原类型次数，开始后视为已消费。后台可配置各类型次数并按指定类型补发。订单与权益真实持久化；服务端支付成功和额度发放在同一事务中执行，重复回调不重复加额度。购买后刷新权益页、侧栏及创建页的可用次数。失败后可在购买记录继续同一笔订单；创建请求的幂等键保存在当前 tab，刷新后重试不会新建同一笔订单。订单信息变化时先再次确认，余额刷新失败时保留购买成功结果并提供单独同步。

演示模式使用当前浏览器的订单和额度，不向后端发送请求。服务端 `development_mock_payment` 开启时才允许模拟支付；现有后端在 production 环境拒绝 `dev-pay`，真实微信和支付宝尚未接入。

```sh
npm run test:e2e -- tests/e2e/billing.spec.ts
npm run test:e2e:billing:live
# 或使用临时数据库验证，不更改现有服务与账号：
/path/to/backend/.venv/bin/python scripts/verify_backend.py /path/to/backend --billing-only
```

真实接口测试仅创建和清理独立测试账号，会验证订单、权益到账、刷新恢复、重复回调及跨账号访问拒绝。

## 验证

```sh
npm test
npm run build
npm run test:e2e
npm run test:e2e:live
npm run test:e2e:production
```

E2E 使用本机 Google Chrome（Playwright `channel: chrome`），无须另行下载 Chromium。`test:e2e:live` 会创建唯一标识的开发账号及其面试记录，不修改已有用户数据。自动化结果和截图保存在被 Git 忽略的 `test-results/`。更多验证结果见 [验收记录](docs/verification.md)。

`test:e2e:production` 检查已构建的 `dist/`，先运行 `npm run build`。真实接口测试成功后会删除其专用测试账号与数据；若中途失败，测试账号可能保留以便定位。

如果创建页面持续显示「正在解析岗位」，且后端岗位状态始终为 `PREPARING`，请检查后端 Celery Worker 和 Beat。现有后端 README 说明默认 `worker` 模式需要两者；其 Docker Compose 可一并启动。本地也支持由后端选择 `TASK_MODE=eager` 开发模式。前端不会自行更改后端任务配置。

## 构建和部署

```sh
npm run build
docker build -t interview-studio-web .
docker run --rm -p 8080:80 interview-studio-web
```

产物为 `dist/`。Nginx 支持 SPA 路由回退、静态资源缓存和 `/api` 代理。默认 `host.docker.internal:8000` 适用于 Docker Desktop 本机后端；Linux/Compose 部署需把 `nginx.conf` 中地址改为后端服务名。生产需 HTTPS。构建时所有 `VITE_` 参数均为公开信息，严禁填模型密钥或存储密钥。

## 当前边界

登录注册现使用邮箱验证码注册、邮箱和密码登录；生产构建隐藏开发登录，SMTP 需在后端配置。权益支持模拟支付购买，真实微信与支付宝尚未接入。打印调用浏览器打印，不是服务端 PDF 导出。真机 Chrome/Safari/Edge 的实际麦克风、摄像头和生产云存储仍需部署后验收。报告中的「无法判断」不会作为 0 分参与雷达图。

分类权益后端增量迁移为 `b72e4f6d9102`，执行 `alembic upgrade head`；对应 SQL 为后端 `docs/sql/update_typed_interview_credits_mysql.sql`。API 中 `remaining_interviews` 是三类可用次数加历史通用次数的总和，创建页按所选类型单独核对；完整契约见后端 `docs/typed-entitlements.md`。

## 邮箱账号与推广

`/register` 支持邮箱验证码注册及邀请/推广链接参数，`/login` 使用邮箱和密码登录并提供找回密码。个人中心支持头像、昵称、邮箱绑定/换绑和改密；安全信息修改会让其他登录状态失效。联系手机号仅为未认证资料。

`/invitations` 展示专属邀请码、链接和奖励进度；后台“推广中心”配置每 N 人奖励及双方分类权益，另可创建分佣推广链接、配置比例并查看佣金台账。订单按快照计提，退款冲销；当前不执行真实转账。

开发环境默认本地邮件预览，页面会显示验证码及“未发送真实邮件”。正式发邮件需后端设置 `MAIL_MODE=smtp` 和 `SMTP_*`，生产不会返回验证码。配置见后端 `docs/accounts-growth.md`，迁移版本 `c83f5a7e0203`。

## 阿里云 OSS 上传

后端设为 `STORAGE_BACKEND=oss` 时，头像、简历、回答、整场音视频和字幕会使用 OSS。Web 按服务端返回的 `asset_id` 申请 STS 临时凭证，上传路径由后端固定；8 MB 以上文件采用分片上传并自动刷新凭证。长期 RAM 密钥只放后端 `.env`。

角色需绑定 [OSS 权限策略](docs/oss-role-policy.json)，Bucket 保持私有并配置 [浏览器跨域规则](docs/oss-cors.xml)。完整配置、后端内容校验、短期签名回放及旧本地文件兼容见后端 `docs/oss-storage.md`。切换前运行后端 `scripts/check_oss.py --write-probe`；管理后台“系统管理 → 文件存储”可查看状态并检查连接。

隔离三端联调（真实 HTTP/Chrome，临时库、预览邮件和模拟支付）：

```sh
/path/to/backend/.venv/bin/python scripts/verify_growth.py /path/to/backend --admin-dir /path/to/admin --ffprobe /path/to/ffprobe
```
