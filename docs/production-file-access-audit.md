# 生产文件访问检查（2026-11-22）

检查范围为 Web、管台以及后端签名、文件类型、存储和播放授权链路，重点寻找与生产 `Failed to fetch`、OSS 502、文件无法展示/下载相同的遗漏。包含上一轮尚未推送的简历预览修复；本次未修改后端业务代码或数据库。

## 发现并修复

| 入口 | 原有问题或配置缺口 | 本次处理 |
| --- | --- | --- |
| PDF/DOCX 简历预览 | accepted 原文件仍直连 OSS；生产 HTTPS Origin 的 GET 预检返回 403/0003-00000602 | 同源只读读取，保留签名和字节；补齐 Blob iframe CSP；失败后重新取详情和签名 |
| 导航、个人资料、头像设置、邀请好友头像 | avatar_url 直接交给 img，OSS 主机不在生产 img-src 中 | 所有头像入口调用统一 URL 处理，PNG/JPEG 走同源代理，保留严格图片 CSP |
| 云端整场字幕 | 新浏览器没有本地字幕备份时，VTT fetch 仍依赖 OSS CORS | accepted VTT 同源读取；验证真实代理、字幕展示和下载 |
| 云端录音/录像下载 | OSS 跨域链接的 download 属性不能保证下载文件名；云端音频名默认 webm 可能与原文件不符 | 同源原文件下载，不把整场视频读入前端内存；按实际 Content-Type 生成扩展名 |
| 回放失效或网络失败 | 原播放器没有媒体错误提示和明确的签名刷新入口 | 增加加载失败提示、刷新链接和播放器重载；字幕网络错误也提供中文反馈 |
| 管台本地存储回放 | localhost 签名 URL 在生产会指向访问者电脑；还可能触发 HTTPS 混合内容 | 将 loopback 的 local-objects 地址按当前 API Origin 修正，保留签名查询 |
| 管台 OSS 回放与生产 preview | 播放未经过固定代理，preview 未配置 API 代理 | 增加仅音视频格式的 GET/HEAD 代理；dev/preview 共用 API/文件代理；失败后重新申请审计授权并重载 |
| 长耗时 AI 请求 | Web Nginx 原 90 秒超时早于真题回答客户端 180 秒超时 | Web API 代理读取超时改为 300 秒；没有改变业务任务、计费或幂等逻辑 |
| 页面启动 CSP 事件 | Zod 动态求值能力探测在严格 script-src 下产生一次可回退的 CSP 事件 | 使用 Zod jitless 运行时解析，不放宽 unsafe-eval；生产预览从启动起检查 CSP |

Web 路径与格式统一在 `config/ossPaths.ts`，URL 处理在 `src/features/media/urls.ts`。原 `upload.ts` 的 signedUrl 导出保留兼容。管台对应 `src/mediaUrl.ts`、`config/ossProxy.ts` 与 `deploy/nginx.conf`。

## 核对的其他入口

| 链路 | 检查结论 |
| --- | --- |
| 头像、简历、回答、真题语音、整场录音录像、字幕上传 | 共用 uploadFile/OSS STS；incoming 路径和签名头保持原样，分片参数不重写 |
| 模拟面试首问、重播、结束语、真题题目语音 | generated WAV/MP3 已使用同源读取；重播/重新生成继续由原接口获取地址 |
| 连续面试 SSE 与实时转写 WebSocket | endpoint 使用同源 /api；HTTPS 下转 wss；Nginx 保留无缓冲、Upgrade 和 Connection |
| 本地录音/录像预览、个人数据导出、管台 CSV | 本地 Blob 链接，不依赖 OSS CORS |
| 登录介绍视频、系统头像、公司品牌图片 | 本地静态资源，同源访问 |
| 后端 ASR/TTS 读取文件 | 服务间仍使用原 OSS 签名 URL或存储读取，不应用浏览器代理转换 |
| 管理端播放权限 | 仍先申请 playback-grant；原因、角色/分派范围、有效期与审计保持由后端核验 |

只读代理不会签发权限：OSS 继续验证签名与有效期，Bucket 保持私有。仅开放当前后端允许的 accepted 文件格式，拒绝写入、HTML/SVG、任意主机及嵌套路径。站点 Cookie/Authorization 不转发至 OSS，原查询、Content-Type、Range/206 和错误状态保留，访问日志不记录签名查询。Web 和管台日志格式分别为 oss_read 与 admin_oss_read，避免合并 Nginx 配置时重名。

## 验证

- Web：73 项单元测试，覆盖 URL 主机/路径/格式范围、编码签名、独立直连配置、只读限制、字节和 Range 转发。
- Web 生产构建及 5 项 Chrome 回归：独立演示路由；PDF/DOCX 预览、重试与原文件下载；所有头像入口；无本地备份的云端音视频、字幕、失效刷新、实际 HTTP 下载文件名与逐字节校验。
- 管台：生产构建及 3 项回归，覆盖 OSS/本地播放地址、审计授权请求、相同 URL 重新授权后的播放器重载、只读代理与 Range。
- 后端：7 项已有 OSS/STS、播放授权、角色范围、有效期和禁用身份回归，使用临时 SQLite/对象目录，未访问生产数据库。

复现命令：

```sh
# Web；代理单元测试及浏览器测试需要本地端口权限。
npm test
npm run build
npm run test:e2e:production

# 管台；独立合成测试不启动业务后端。
npm run build
npm run test:e2e -- --config tests/media.config.ts
```

生产浏览器测试使用本地合成 OSS 上游，只服务 tests/fixtures/oss-server.mjs 中允许的合成文件。音视频读取和下载实际经过 Vite 的同源代理，包含 Range 请求，不向真实 OSS 上传任何用户文件。

## 需要上线验证的部分

本机 Docker daemon 未运行，因此未执行 Nginx 容器 nginx -t、Docker 镜像启动或生产账号端到端测试。两端必须同时部署新的 dist 和完整 Nginx 配置，重建镜像/容器；仅重启旧容器或替换 dist 不会安装新代理规则。上线时分别检查配置并验证文件读取、下载和管理端审计播放。

Web 的 GET / 健康检查、简历/媒体元数据接口 200，都不代表后续二进制文件访问成功。上线验收需查看实际 incoming、generated、accepted 请求。

检查以当前固定 OSS Bucket 的部署为准。S3、CDN 或额外 Bucket 的 URL 保持原值，切换存储时需要同步配置对应域名、代理与 CSP/CORS。Safari/Edge 实机权限、弱网大文件以及真实 ASR/TTS 供应商调用未在本轮替代为已验证。

参考：[OSS 跨域规则](https://www.alibabacloud.com/help/en/oss/user-guide/configure-cross-origin-resource-sharing)、[CSP img-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/img-src)、[download 属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download)、[Nginx WebSocket 代理](https://nginx.org/en/docs/http/websocket.html)。
