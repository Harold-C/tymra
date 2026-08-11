# Tymra 当前实施计划

Last updated: 2026-08-12

## 状态源与代码边界

产品合同由 [`product/`](./product/README.md) 控制，当前实现和验证状态只在
[`traceability.md`](./traceability.md) 维护，稳定取舍写入 [`decisions.md`](./decisions.md)，
带日期的历史运行保存在 `evidence/`。本页只维护当前差距和交付顺序。

代码按功能边界组织：Web、Worker 和共享 packages 的总体结构见
[`architecture/codebase.md`](./architecture/codebase.md)；会员 UI、Admin 会员操作、服务端会员
策略和会员调度分别拥有独立目录。公共匿名流程不得承载会员认证逻辑。

## 当前实现快照

- 会员体系已实现独立邮箱/密码注册登录、Free 自动开户、邮箱验证、定价单位、额度、报告、
  日历、风险归组、Admin 会员操作、Stripe 合同和开发环境 gated UI。付费与高级功能仍受
  Launch Gate 约束，不得描述为生产可用。
- 地址和 OTA URL 都归一到真实 Property；一个 Property 只占一个会员房源额度。30 天占位、
  Benefit Group、设备/Property/付款主体和数据库唯一约束共同限制换地址及多账号套利。
- 所有住宿业务日期使用 `Pacific/Auckland`；时间戳、证据和安全过期继续使用绝对 UTC。
- OTA 执行范围固定为六个 active 渠道：Booking.com、Airbnb、Expedia、Bookabach、Agoda、
  Trip.com。Wotif、Hotels.com、Vrbo 只保留禁用的合同兼容；Google Hotels 不在执行范围。
- Argus 负责浏览器采集和证据生命周期；Tymra 负责身份、额度、竞品选择、市场信号、价格
  建议和会员交付。开发 fixture 与真实公开页面结果必须明确隔离。
- 开发环境提供 `demo1` 至 `demo4` 四个固定会员账号，对应 Free、Host、Pro、Portfolio；密码仅由开发配置派生或覆盖，不进入仓库明文。
- Pricing Unit 稳定 API 已补齐集合 GET/POST 与单项 GET/PATCH；POST 只接受当前会员已确认并计费过的 Price Check，不接受任意内部房源 ID。
- 2026-08-12 当前 P0/P1/P2 工作树通过 lint、全仓 TypeScript、210 个 Web/domain/provider/db
  单元测试（5 个外部 fixture 跳过）、124 个 Worker 测试、104 个隔离 PostgreSQL 集成测试
  以及 112 页生产构建。精确证据与未验证边界见追踪表。

## 当前优先级

| 优先级 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| P0 | 付费方案开发验收 | Stripe test mode 覆盖 Checkout、Portal、升级/降级、取消/恢复、宽限、乱序/重复 webhook，并验证数据库状态 | 本地 fake-Stripe 生命周期与 webhook 回归通过；真实 Stripe test account/browser 和生产凭证仍是外部门槛 |
| P0 | 生产挑战与反滥用门槛 | 托管 challenge 必须使用 HTTPS、secret 和 fail-closed 验证；不保存原始 IP/设备/卡信息 | 服务端合同、认证请求和失败路径已验证；生产 provider、容量和误判演练未执行 |
| P0 | 高级能力服务端 Launch Gate | CSV export、Portfolio read API 在服务端同时校验会员可服务状态、权益、额度及独立上线开关 | 已完成；默认关闭，且 export 依赖 Pro gate、API 依赖 Portfolio gate |
| P1 | 会员完整可访问性 | EN/ZH、桌面、390/320px 通过 axe serious/critical=0、全键盘、焦点、reduced motion 和错误状态 | 自动化会员路由矩阵已纳入 Playwright；当前运行结果见追踪表 |
| P1 | Retention 生命周期 | 隔离数据库覆盖 Free/Host/Pro/Portfolio 及取消账户的独立保留期和 30 天房源占位 | 四档时间推进矩阵已通过 |
| P1 | 生产可观测性 | 无 PII 的会员、Billing、队列、CAPTCHA、成本和方案经济性指标 | Worker health 聚合已实现并验证；生产 dashboard/alert 与注入演练仍是部署工作 |
| P1 | Live 会员 E2E | live provider 完成会员登录、地址或 OTA URL、真实 Argus 价格及非 demo 报告 | 已提供显式 fail-closed 的 `test:e2e:member-live` 门禁；真实账号/输入/环境运行仍未执行 |
| P2 | 大文件分解 | 分离 CSS surface、会员运营逻辑、公共事件 adapter family 和 seed source registry | 第一阶段拆分完成；后续大文件拆分保持独立评审，不与当前业务修复混合 |
| P2 | 生产采集启用 | 来源 canary、容量、监控、回滚、安全和长期稳定性通过后再启用 Scheduler | 安全保持关闭；不能用本地代码验证替代生产 canary 授权 |

## 交付顺序

1. 在真实 Stripe test account 执行付费浏览器验收，并保存 webhook/数据库一致性证据。
2. 配置生产托管 challenge provider，完成容量、失败注入和误判申诉演练。
3. 使用 `pnpm test:e2e:member-live` 分别执行 OTA URL 与地址两条真实会员链路。
4. 建立生产 dashboard/alert 后进行单来源 Scheduler canary；任何失败都不扩大采集范围。

## 已知边界

- 一条有效公开 OTA 目标价格必须交付给用户；证据不足只限制市场结论和推荐置信度，不得抹掉
  已观察价格。不能访问、条件漂移或仅有受限价格时仍必须 fail closed。
- 精确逐日价格检查范围与方案权益按会员合同执行；未采集日期显示“无公开 OTA 观测”，不得补值。
- CAPTCHA 只能由 Argus 暂停同一 Page/BrowserContext 并提供短期 noVNC 人工接管，不自动绕过。
- 历史 `evidence/` 证明当时的开发验收，不保证外部页面长期稳定、生产容量或 SLA。
- 手工导入仍缺少真实运营导出文件的两轮持久化验收。
