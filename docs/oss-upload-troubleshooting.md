# 生产环境 OSS 浏览器上传

Web 默认通过同源上传代理转发到 OSS，部署步骤见 [OSS 上传代理](oss-upload-proxy.md)。代理模式应先确认 Web 服务已安装对应的 Nginx 配置；对象读写权限仍需要正常授权。

使用 `VITE_OSS_UPLOAD_MODE=direct` 时，浏览器会从网页直接向 OSS 发出 PUT 请求，以下跨域检查针对这一模式。后端 API 的 CORS 配置与 OSS Bucket 的 CORS 配置分别生效；后端签发 STS 成功或管理员的存储连接检查成功，都不代表浏览器跨域上传已经可用。

## 当前生产地址的检查结果

2026-11-15，最初以 `http://121.41.206.87:3000` 为 Origin，对当前配置的 `ai-interview-storage.oss-cn-hangzhou.aliyuncs.com` 发出 PUT 预检请求，OSS 返回 HTTP 403、`AccessForbidden` 和 `EC=0003-00000602`，说明该请求未匹配允许的 Bucket 跨域规则。前端的“OSS 上传未完成”是通用上传失败提示，其他情况仍需结合 Network 确认原因。

最初检查中，本地 RAM 账号和配置的 STS 角色执行 `GetBucketCORS` 均返回 `AccessDenied`，工具未直接修改云端 Bucket 规则。上传角色的 `oss:PutObject` 权限与管理跨域规则的 `oss:GetBucketCORS` / `oss:PutBucketCORS` 权限不同。

后续复测中，生产 Origin 的 GET、HEAD、PUT、POST 预检已全部返回 200。使用相同 Origin 的浏览器探测页和当前后端配置的 STS 角色，生成的临时 PDF 已实际上传到 OSS，返回 200，且 `ETag` 与 `x-oss-request-id` 都可读取。此次浏览器验证使用本地生成的探测页面，未验证线上完整简历业务流程。

随后发现对象读取和删除返回 403 / `AccessDenied`。核对并补齐后端实际扮演角色的 [OSS 对象权限](oss-role-policy.json) 后，再次实测已通过：浏览器临时 PDF 上传、ETag 读取、后端对象大小及内容逐字节校验、转存至 accepted 路径、读回及删除。Bucket 仍为私有。上次权限不足时遗留的测试 PDF 经内容匹配后已删除，本次测试文件也已清理。

排查类似问题时，应核对角色和 Bucket Policy 是否允许应用对象路径的 `oss:GetObject`、`oss:PutObject`、`oss:DeleteObject`。对象权限影响上传后的校验、转存与删除，和跨域规则分别生效。

## 在 OSS 控制台添加规则

使用有 Bucket 管理权限的账号打开 OSS 控制台，进入实际用于生产上传的 Bucket → 数据安全／内容安全 → 跨域设置（CORS），保留现有规则，并添加下面这条规则：

| 配置项 | 值 |
| --- | --- |
| 来源 Origin | `http://121.41.206.87:3000` |
| 允许 Methods | `GET`、`HEAD`、`PUT`、`POST`、`DELETE` |
| 允许 Headers | `*` |
| 暴露 Headers | `ETag`、`x-oss-request-id` |
| 缓存时间 | `600` 秒 |
| Vary: Origin | 启用 |

Origin 必须与浏览器地址栏的协议、主机和端口一致，不包含 `/login`、`/interviews/new` 等路径。如果已经换成 HTTPS 或域名，使用当前页面的实际 Origin，并为需要访问的管理后台地址单独添加规则。Bucket 保持私有访问。

保存规则后刷新网页重试。`docs/oss-cors.xml` 已包含上述生产 Origin 及本地开发 Origin，作为配置示例；修改此文件不会自动更新云端。通过 API 或 CLI 导入完整 CORS 配置会替换现有规则，应先读取并合并已有配置。

## 验证

下面的预检不上传文件，也不需要 AccessKey：

```sh
curl -i -X OPTIONS \
  'https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com/ai-interview/cors-diagnostic.pdf' \
  -H 'Origin: http://121.41.206.87:3000' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: authorization,content-type,x-oss-security-token,x-oss-date,x-oss-user-agent'
```

成功时返回 HTTP 200 和匹配的 `Access-Control-Allow-Origin`、允许的请求方法及请求头。浏览器中的实际 PUT 成功后，还应返回可读取的 `ETag`，最后由后端确认简历文件。如果预检仍返回 403，检查实际 Bucket、Origin、请求方法和请求头；若预检通过而 PUT 返回 403，再检查 STS 有效期、角色权限和对象路径授权。排查时仅提供错误码和 OSS Request ID，不公开 STS 凭证或签名。

参考：[阿里云 OSS 跨域配置](https://www.alibabacloud.com/help/en/oss/user-guide/configure-cross-origin-resource-sharing/)。
