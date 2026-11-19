# OSS 上传同源代理

Web 默认将 OSS SDK 的上传请求发送至当前页面 Origin 下的 `/ai-interview/user/{user_id}/incoming/{asset_id}.{ext}`。Web 的 Nginx 或 Vite 将请求转发到固定 OSS Bucket，保留对象路径、查询参数、签名、STS Token、Content-Type 和 ETag。浏览器不再直连 OSS，上传不依赖 Bucket CORS；无需新增 Python 后端接口或修改后端配置。

STS 凭证仍由后端按当前用户、资产和到期时间签发。代理不签发凭证，也不增加 OSS 权限；Bucket 保持私有。长期 RAM 密钥仍只放后端。完成上传后，Web 继续调用原 `/media/{asset_id}/complete`，由后端校验文件并移至不可覆盖的 accepted 路径。

## 当前生产部署

当前默认目标为 `https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com`，与后端 `OSS_BUCKET_NAME=ai-interview-storage`、`OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com` 一致。

1. 更新 Web 项目，执行 `npm run build`，部署新的 `dist/`。
2. 将本项目 `nginx.conf` 中的 OSS `location` 和 `/ai-interview/` 兜底规则加入**实际提供 Web 页面的 server 块**。已有 HTTPS/证书配置保留；`/api` 仍指向原后端。
3. 执行 `nginx -t`，通过后执行 `nginx -s reload`。Docker 部署重建 Web 镜像并重建容器即可，Dockerfile 已包含完整配置。
4. 浏览器刷新后上传合成 PDF 测试文件；网络面板应显示 `PUT /ai-interview/user/.../incoming/....pdf` 发往 Web 自身 Origin，随后 `/media/{asset_id}/complete` 成功。8 MB 以上文件会依次发起带 `uploads`、`uploadId`、`partNumber` 的分片请求。

只更新 `dist/`、只更新 Python 后端或只修改后端 `CORS_ORIGINS` 不会安装 Web 上传代理。若外层 Nginx 直接提供静态文件，必须修改外层 Nginx；若外层将整个站点转发至本项目 Web 容器或 Vite，则需让上述路径也转发到该 Web 服务。上传代理占用 Web 服务器带宽。

代理仅转发 incoming 文件命名空间到固定 Bucket，禁止把目标主机改为浏览器传入的任意 URL。`proxy_pass` 后不要添加路径或尾部 `/`，不要重写对象路径和查询参数；它们参与 OSS 签名。须保留 OSS Authorization 和 `x-oss-*` 头，并用 Bucket 域名作为 Host/SNI。Nginx 清除 Origin 和站点 Cookie，以避免把浏览器跨域检查或站点 Cookie 传给 OSS；TLS 证书仍会校验。

## Web 配置

```dotenv
# 默认值；开发和生产相同。不包含密钥。
VITE_OSS_UPLOAD_MODE=proxy
# 仅供 npm run dev / npm run preview 使用。
OSS_UPLOAD_TARGET=https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com
```

更换 Bucket 时同步修改 `OSS_UPLOAD_TARGET` 和生产 `nginx.conf` 中的 `proxy_pass`、`proxy_set_header Host`，使它们与后端保持一致。`OSS_UPLOAD_TARGET` 不会在构建时自动改写 Nginx。

需要恢复浏览器直连时，设置 `VITE_OSS_UPLOAD_MODE=direct` 并重新构建。此模式仍要求 OSS 配置精确的 Web Origin、PUT/POST/GET/HEAD/DELETE、AllowedHeader `*` 及 ExposeHeader `ETag,x-oss-request-id`，参考 [跨域规则模板](oss-cors.xml)。

头像、简历、岗位图片、回答和整场录音录像共享这一上传链路。文件下载暂沿用后端签发的 OSS 下载 URL；本次代理覆盖上传，不改变回放地址。

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
