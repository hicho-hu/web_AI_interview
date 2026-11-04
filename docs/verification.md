# 前端验收记录

验证日期：2026-11-01。所有验证均在本地完成，未发布到外部服务。

| 项目                       | 结果                           | 验证内容                                                                                                                                 |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript + Vite 生产构建 | 通过                           | 严格类型检查、路由与图表分包、dist 输出                                                                                                  |
| Vitest                     | 12 项通过                      | 输入与幂等、文字流程、语音边界；购买快照、重复支付不重复发放、刷新复用订单键、清理购买缓存及金额单位                                     |
| Chrome 演示 E2E            | 3 项通过                       | 登录协议、受保护路由、创建/开始/暂停/恢复/刷新/回答/报告/历史；390px 移动端导航和横向溢出检查                                            |
| Chrome 创建面试回归        | 3 项通过                       | 授权提示、旧额度缓存为零、真实额度不足与恢复后重试，覆盖文字/语音/视频配置                                                               |
| Chrome 模拟购买 E2E        | 7 项通过                       | 购买到账、购买记录、刷新恢复、移动端；支付失败续付、创建/回调响应丢失、价格变更再确认、禁用模拟支付、购买后独立同步余额                  |
| FastAPI 真实购买 E2E       | 1 项通过（本机 :8000）         | 未拦截接口；真实订单、模拟支付、额度持久化、重复回调不重复发放、跨账号拒绝；仅创建并清理专用测试账号                                     |
| 后端支付幂等单元测试       | 通过                           | 复用后端 test_order_payment_refund_idempotency，重复支付/退款只记账一次                                                                  |
| Chrome 连续语音 E2E        | 3 项通过                       | 自动提问、开口打断、上传期间补充、暂停/继续、自动/手动结束、整场回放；本地备份与网络保存同时失败时仍可下载并重试                         |
| Chrome 连续视频 E2E        | 2 项通过                       | 共享屏幕与摄像头合成、双方混音、自动/手动结束；换题与暂停不停止录制，整场音频/视频各一个文件，签名 403 重签、可拖动回放                  |
| 生产产物 Chrome 验收       | 通过                           | 运行 dist 产物，确认开发登录隐藏、演示可用、路由分包及刷新正常                                                                           |
| FastAPI 文字及隐私 E2E     | 通过（隔离实例）               | 临时 SQLite + eager Worker + Mock Provider；真实 HTTP 登录/授权/岗位解析/计划/回答/报告/刷新、昵称修改、导出、单场删除和账号数据删除     |
| 用户原有 :8000 服务        | 请求链路通过，完整业务仍需复验 | 最新浏览器实测：通过 Vite 代理的登录、授权、用户信息、历史、退出均 200，未拦截或模拟响应；前次完整业务测试中岗位在 90 秒内持续 PREPARING |

媒体 E2E 的录制是 Chrome 的真实浏览器 API；签名、上传确认与提交由拦截的测试响应提供，用于检查前端行为，不等同于真实 ASR、对象存储或真机验收。隔离后端明确使用模拟 AI，不声称验证实际模型质量。原后端异步任务正常处理后可运行 `npm run test:e2e:live` 再验收实际部署。现有后端 README 明确指出默认 worker 模式还需启动 Celery Worker 和 Beat；当前 PREPARING 情况应先检查该处理链路。

连续面试补充验收：5 项 Chrome 用例通过，直接解码整场录音并检查面试官 440 Hz 与候选人 880 Hz 的合成信号，确认双方声音进入同一个文件。通过 MediaRecorder 启停计数确认换题及暂停期间未停止；视频模式整场音频/视频各启动、停止一次。本次已重启本机 8000 端口开发 API，健康检查为 ready；OpenAPI 已加载 SCREEN_CAPTURE、SESSION_AUDIO/SESSION_VIDEO、2 小时时长及 512 MB 大小限制。此接口检查不替代真实 ASR/TTS、云存储或完整业务验收。

补充验证：演示模式不会发出 `/api/v1/` 业务请求，提示条可切换到真实登录。真实接口连通性可以单独复现，不等待岗位解析任务：

```sh
npm run test:e2e:live -- --grep '真实后端请求'
```

权益购买复现命令：

```sh
npm run test:e2e -- tests/e2e/billing.spec.ts tests/e2e/create.spec.ts tests/e2e/demo.spec.ts
npm run test:e2e:billing:live
```

权益页复用现有后端 billing 商品、订单、模拟支付与权益服务，没有更改后端源码或数据库结构。真实接口验收会检查购买流水仅有一次 GRANTED 记录；微信和支付宝入口禁用，未接入真实扣款。截图为 `test-results/billing-desktop.png`、`billing-mobile.png`、`billing-checkout.png` 与 `billing-live.png`。

该测试仅连接当前配置的后端，不使用响应拦截；请求路径和 HTTP 状态保存在 `test-results/backend-requests.json`，不包含 token 或用户资料。

独立隔离实例可以复现，不更改后端源码或已有数据：

```sh
/path/to/backend/.venv/bin/python scripts/verify_backend.py /path/to/backend
```

脚本从现有后端的 Alembic 迁移创建临时数据库，在 8011 启动实例；以独立的 5174 前端端口设置 Vite 代理并执行真实接口 E2E；结束后停止实例并清理临时数据库。需要 5174 和 8011 端口空闲，不复用用户正在运行的 5173 服务。

截图（自动化生成，未提交到 Git）：

- `test-results/dashboard-desktop.png`
- `test-results/dashboard-mobile.png`
- `test-results/room-desktop.png`
- `test-results/report-desktop.png`
- `test-results/live-report.png`

仍需真机/部署环境验收：Safari/Edge 实际音视频设备、真实 LLM/ASR/TTS、对象存储 CORS/上传/过期回放、弱网中的真实大文件传输和 Docker/Nginx 容器运行。当前环境未执行 Docker 构建，不将其标记为已验证。

构建过程仅出现第三方 Zod 源码注释的 Rollup PURE 标注提示，构建成功，无项目类型错误。
