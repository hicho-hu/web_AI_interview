# OSS 文件访问同源代理

Web 默认将 OSS SDK 的上传请求发送至当前页面 Origin 下的 `/ai-interview/user/{user_id}/incoming/{asset_id}.{ext}`。Web 的 Nginx 或 Vite 将请求转发到固定 OSS Bucket，保留对象路径、查询参数、签名、STS Token、Content-Type 和 ETag。浏览器不再直连 OSS，上传不依赖 Bucket CORS；无需新增 Python 后端接口或修改后端配置。

STS 凭证仍由后端按当前用户、资产和到期时间签发。代理不签发凭证，也不增加 OSS 权限；Bucket 保持私有。长期 RAM 密钥仍只放后端。完成上传后，Web 继续调用原 `/media/{asset_id}/complete`，由后端校验文件并移至不可覆盖的 accepted 路径。

## 当前生产部署

当前默认目标为 `https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com`，与后端 `OSS_BUCKET_NAME=ai-interview-storage`、`OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com` 一致。

1. 更新 Web 项目，执行 `npm run build`，部署新的 `dist/`。
2. 将本项目 `nginx.conf` 中的 incoming 上传、generated/accepted 只读 `location` 和 `/ai-interview/` 兜底规则加入**实际提供 Web 页面的 server 块**；`oss_read` 日志格式放在 `http` 上下文。同步页面 CSP，使简历 Blob 预览可以加载。已有 HTTPS/证书配置保留；`/api` 仍指向原后端。
3. 执行 `nginx -t`，通过后执行 `nginx -s reload`。Docker 部署重建 Web 镜像并重建容器即可，Dockerfile 已包含完整配置。
4. 浏览器刷新后上传合成 PDF 测试文件；网络面板应显示 `PUT /ai-interview/user/.../incoming/....pdf` 发往 Web 自身 Origin，随后 `/media/{asset_id}/complete` 成功。8 MB 以上文件会依次发起带 `uploads`、`uploadId`、`partNumber` 的分片请求。

只更新 `dist/`、只更新 Python 后端或只修改后端 `CORS_ORIGINS` 不会安装 Web 上传代理。若外层 Nginx 直接提供静态文件，必须修改外层 Nginx；若外层将整个站点转发至本项目 Web 容器或 Vite，则需让上述路径也转发到该 Web 服务。上传代理占用 Web 服务器带宽。

上传代理仅转发 incoming 命名空间；读取只允许 generated 下的 WAV/MP3，以及 accepted 下的 PDF、DOCX、PNG、JPG/JPEG、WAV、MP3、M4A、MP4、AAC、WEBM、VTT，与当前后端文件类型一致。HTML、SVG、嵌套任意路径和写入 accepted 均不转发。目标固定为配置的 Bucket，不能由浏览器传入任意 URL。`proxy_pass` 后不要添加路径或尾部 `/`，不要重写路径和查询参数；它们参与 OSS 签名。上传须保留 OSS Authorization 和 `x-oss-*` 头；读取使用原签名查询并清除站点 Authorization。两者都以 Bucket 域名作为 Host/SNI，清除 Origin 和 Cookie，保留 TLS 证书校验。

## Web 配置

```dotenv
# 默认值；开发和生产相同。不包含密钥。
VITE_OSS_UPLOAD_MODE=proxy
# AI 提问、结束语和真题提问音频，独立于上传模式。
VITE_OSS_AUDIO_MODE=proxy
VITE_OSS_AUDIO_HOST=ai-interview-storage.oss-cn-hangzhou.aliyuncs.com
# accepted 图片、录音、录像、字幕及默认简历访问。
VITE_OSS_MEDIA_MODE=proxy
VITE_OSS_MEDIA_HOST=ai-interview-storage.oss-cn-hangzhou.aliyuncs.com
# 可单独覆盖简历模式和主机名；省略时继承 MEDIA 配置。
VITE_OSS_RESUME_MODE=proxy
VITE_OSS_RESUME_HOST=ai-interview-storage.oss-cn-hangzhou.aliyuncs.com
# 仅供 npm run dev / npm run preview 使用。
OSS_UPLOAD_TARGET=https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com
```

更换 Bucket 时同步修改 `OSS_UPLOAD_TARGET`、各 `VITE_OSS_*_HOST` 和生产 `nginx.conf` 中两处 `proxy_pass`、`proxy_set_header Host`。主机名不含协议或路径；`OSS_UPLOAD_TARGET` 不会在构建时自动改写 Nginx。当前 Nginx 上传和读取使用同一 Bucket，如需拆分存储，应同时调整固定代理规则。

需要恢复浏览器直连时，设置 `VITE_OSS_UPLOAD_MODE=direct` 并重新构建。此模式仍要求 OSS 配置精确的 Web Origin、PUT/POST/GET/HEAD/DELETE、AllowedHeader `*` 及 ExposeHeader `ETag,x-oss-request-id`，参考 [跨域规则模板](oss-cors.xml)。

头像、简历、岗位图片、回答和整场录音录像共享上传链路。所有支持的 accepted 文件共用只读代理，统一地址处理位于 `src/features/media/urls.ts`；客户端和 Vite 复用 `config/ossPaths.ts` 的路径范围，避免后续按页面补漏。

## 头像、云端回放、字幕与下载

导航、个人资料、头像设置和邀请列表中的自定义头像均经过统一地址转换，不需要放宽 `img-src 'self' data: blob:`。系统头像和公司品牌静态资源继续同源加载。

整场云端录音、录像和 VTT 字幕都走 accepted 只读路径。字幕经同源 `fetch` 读取后转成 Blob，供字幕展示与下载。回放源加载失败时显示中文提示，并提供“刷新回放链接”；刷新会重新获取授权地址并重载播放器。云端录音下载扩展名按媒体 Content-Type 生成。

录音、录像下载使用同源地址，使浏览器能执行 `download` 属性并保留文件名。跨域 URL 的 `download` 属性通常不生效；仅将它加在 OSS 直连链接上不能保证下载行为。代理保留原始文件字节和 Range/206，不把大录像整体读入前端内存。

设置 `VITE_OSS_MEDIA_MODE=direct` 可恢复 accepted 文件直连；仍须配置实际 HTTPS Origin 的 GET/HEAD CORS。图片直连还需在生产 CSP 的 img-src 中允许具体 Bucket 主机，跨域下载也应由存储响应的 Content-Disposition 决定文件名。默认同源模式不需要上述额外配置。

Web `/api/` 的读取超时为 300 秒，以覆盖真题回答等客户端最长 180 秒的 AI 请求；SSE 继续关闭缓冲，WebSocket 继续转发 Upgrade/Connection。后端 ASR/TTS 服务间使用的 OSS 签名链接不做前端地址转换。

参考：[CSP img-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/img-src)、[浏览器 download 属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download)。

## AI 面试官语音播放

连续语音面试通过 `fetch` 读取 WAV/MP3，再由 Web Audio 解码、播放并混入整场录制。接口 `/media/{id}` 返回 200 仅表示成功获取媒体信息和签名地址；浏览器还需要读取该地址的响应，直连 OSS 时需匹配实际页面 Origin 的 CORS 响应头。

2026-11-19 对生产 HTTPS Origin 的 GET 预检返回 403、`EC=0003-00000602`。用户提供的有效音频签名链接实际返回 200、`audio/wav` 和 RIFF/WAVE 文件头，但没有 `Access-Control-Allow-Origin`，因此浏览器 `fetch` 无法读取响应。原有 HTTP Origin 的跨域配置不覆盖 `https://121.41.206.87`。

Web 默认将配置 Bucket 的 `/ai-interview/user/{user_id}/generated/{asset_id}.wav` 或 `.mp3` 签名地址转换为当前页面 Origin 下的相同路径和原始查询参数。Nginx/Vite 再转发至固定 Bucket：

- 仅允许 GET/HEAD，拒绝写入及其他文件类型；不提供任意 URL 代理。
- 原样保留路径、签名查询、Range 和响应内容，OSS 继续校验签名及有效期；代理不签名、不缓存、不增加对象权限。
- 移除 Origin、站点 Cookie 和 Authorization，下载以签名查询授权。Nginx 的音频访问日志不记录含临时凭证的查询参数。
- 模拟面试首问、重播、结束语，以及真题提问语音共用地址转换；流式 PCM 追问保持原流程。

部署时必须同时更新 `dist/` 与 Nginx 配置；Docker 部署重新构建并重建 Web 容器。验收时 Network 应显示音频 GET 发往 Web 自身 Origin，成功后提问会播放并出现在整场录制中。

如采用浏览器直连，设置 `VITE_OSS_AUDIO_MODE=direct` 后重新构建，并在 OSS 上合并允许实际 HTTPS Origin 的 GET/HEAD 跨域规则。修改仓库的 XML 示例不会自动修改 Bucket。

## 简历原文件预览与下载

简历列表及 `/resumes/{id}` 返回 200 仅表示元数据读取成功。预览会再次获取该简历详情以刷新签名，再用 `fetch` 读取原文件。2026-11-22 检查发现 accepted 路径未被原音频代理覆盖，仍由浏览器直连 OSS；生产 HTTPS Origin 的 GET 预检返回 403、`EC=0003-00000602`，与预览的 `Failed to fetch` 相符。

默认模式将配置 Bucket 的 `/ai-interview/user/{user_id}/accepted/{asset_id}.pdf` 或 `.docx` 转换为站点同源地址，保留原始签名查询，由固定 OSS 上游校验授权。该路径仅允许 GET/HEAD；原文件、Content-Type、Range/206 和上游错误状态保持不变，代理不缓存、不记录签名查询，不转发站点 Cookie 或 Authorization。

PDF 在获取并检查文件头后通过本地 Blob iframe 预览；生产 CSP 显式允许 `frame-src 'self' blob:`。DOCX 在原有沙箱 iframe 中渲染，仍禁用脚本、外部资源和 altChunk HTML。网络失败显示中文提示，点击重试会重新获取详情与签名。

部署须同时更新 Web 构建产物与完整 Nginx 配置（包括 `oss_read` 日志格式、accepted 只读路径和 CSP）。Docker 部署重新构建并重建 Web 容器；只重启旧容器不会安装新配置。部署前执行 `nginx -t`。验收使用合成 PDF/DOCX，在个人中心打开简历预览，Network 中原文件 GET 应发往站点同源地址，并验证预览、重试与下载。

若需要直连模式，设置 `VITE_OSS_RESUME_MODE=direct` 并重新构建，同时在 OSS 上合并允许实际 HTTPS Origin 的 GET/HEAD CORS 规则。上传、AI 音频和简历直连模式分别配置。

参考：[CSP frame-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-src)。

## 生产上传返回 502

若浏览器请求已发往 Web 自身的 `/ai-interview/user/.../incoming/...`，但响应为 Nginx 的 HTML 502 页面，先定位生产 Nginx 的上游连接错误。HTTP 状态和响应头不能直接区分上游端口、DNS、网络或 TLS 证书问题；需要查看该服务器上对应时间的错误日志。

在实际提供 HTTPS 页面的生产服务器执行：

```sh
sudo nginx -t
sudo tail -n 80 /var/log/nginx/error.log
curl -I --connect-timeout 5 --max-time 10 \
  'https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com/ai-interview/user/connectivity-check/incoming/00000000-0000-4000-8000-000000000000.pdf'
```

curl 不携带凭证，私有 Bucket 返回 OSS 的 403 XML 和 `x-oss-request-id` 即可证明该服务器能连通 OSS；此检查不上传文件。若该请求正常而 Web 代理仍为 502，应按 Nginx 错误日志核对实际生效的 `location` 和上游参数。

| 日志内容 | 核对方向 |
| --- | --- |
| `connect() failed ... Connection refused` / `no live upstreams` | 查看日志中的 `upstream`；若指向本机 Web 开发端口，检查对应服务是否运行，以及 HTTPS server 中 OSS 路径是否已配置为固定 OSS 上游。 |
| `no resolver defined` / `could not be resolved` | 检查生产服务器 DNS，以及使用变量上游时的 Nginx `resolver` 配置。 |
| `upstream SSL certificate verify error: (22:certificate chain too long)` | OSS 证书链超过 Nginx 默认验证深度 `1`；在 OSS `location` 内设置 `proxy_ssl_verify_depth 5;`，保留 `proxy_ssl_verify on;` 和受信 CA 文件，再检查配置并重载。 |
| 其他 `upstream SSL certificate verify error` | 检查系统 CA 证书包、`proxy_ssl_trusted_certificate`、证书验证名称和证书链；保持证书校验开启。 |
| `SSL_do_handshake() failed` | 核对 HTTPS 上游、`proxy_ssl_server_name on` 和上游域名，使用日志中的具体 TLS 错误进一步判断。 |
| `upstream timed out` | 检查日志中的目标地址，以及生产服务器到 OSS 的网络、出站规则和超时。 |

当前 Nginx 示例使用固定 Bucket 域名；`proxy_ssl_name` 默认取 `proxy_pass` 的主机名。若线上改用命名 upstream 或 IP，需要显式将证书验证名称和 SNI 指向真实 Bucket 域名。只分享相关错误行，不复制包含 STS Token 或 Authorization 的完整调试请求。

### `certificate chain too long` 的生产修复

2026-11-19 的生产日志显示，`/resumes/upload-url` 返回 201、`/storage/sts-token` 返回 200，但同源文件 PUT 返回 502，Web 容器报告 `upstream SSL certificate verify error: (22:certificate chain too long)`。失败发生在 Nginx 到 OSS 的 TLS 握手阶段，尚未进入 OSS 对象上传。

仓库配置已显式设置验证深度。实际执行 OSS 代理的 Nginx `location` 应包含：

```nginx
proxy_ssl_server_name on;
proxy_ssl_verify on;
proxy_ssl_verify_depth 5;
proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
```

证书链允许包含更多中间 CA，仍需通过受信 CA、有效期和上游名称校验。默认深度 `1` 可能拒绝有效的公共证书链；修改验证深度无需更换网站 HTTPS 证书或重新签发 STS。

Docker 部署更新 Web 源码后，使用现有生产 Compose 配置重新构建并重建 Web 服务。`Dockerfile` 会把修复后的 `nginx.conf` 复制到 `/etc/nginx/conf.d/default.conf`；仅重启旧容器或更新 `dist/` 不会应用此修改。

如需先在运行中的 `ai-web` 容器修复，仅在其实际 OSS `location` 中添加或修改 `proxy_ssl_verify_depth 5;`，保留现有 `/api` 上游及其他部署配置。若配置文件来自宿主机挂载，应修改挂载源文件。然后执行：

```sh
docker exec ai-web nginx -t
docker exec ai-web nginx -s reload
```

仅在配置检查成功后重载。容器内临时修改会在重建时丢失，仍须同步部署仓库修复。刷新浏览器重新上传，确认文件 PUT 和随后的 `/media/{asset_id}/complete` 均成功。

参考：[Nginx 证书链验证深度](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_verify_depth)、[Nginx HTTPS 上游与 SNI](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_name)、[Nginx DNS resolver](https://nginx.org/en/docs/http/ngx_http_core_module.html#resolver)。
