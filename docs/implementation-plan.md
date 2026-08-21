# Tymra 当前实施计划

Last updated: 2026-08-21

## 状态源与代码边界

产品合同由 [`product/`](./product/README.md) 控制，当前实现和验证状态只在
[`traceability.md`](./traceability.md) 维护，稳定取舍写入 [`decisions.md`](./decisions.md)，
带日期的历史运行保存在 `evidence/`。本页只维护当前差距和交付顺序。

代码按功能边界组织：Web、Worker 和共享 packages 的总体结构见
[`architecture/codebase.md`](./architecture/codebase.md)；会员 UI、Admin 会员操作、服务端会员
策略和会员调度分别拥有独立目录。公共匿名流程不得承载会员认证逻辑。

## 当前实现快照

- 会员体系已实现独立邮箱/密码注册登录、Free 自动开户、邮箱验证、定价单位、额度、报告、
  日历、风险归组、Admin 会员操作、Stripe 合同和开发环境 gated UI。首次生产版本必须同时
  部署公开 Price Check、客户登录、四档会员、Pricing、Stripe、客户结果和监测；初期仅从首页、
  公共导航和营销 CTA 隐藏发现入口，隐藏状态不代替生产验收。
- 地址和 OTA URL 都归一到真实 Property；一个 Property 只占一个会员房源额度。30 天占位、
  Benefit Group、设备/Property/付款主体和数据库唯一约束共同限制换地址及多账号套利。
- 所有住宿业务日期使用 `Pacific/Auckland`；时间戳、证据和安全过期继续使用绝对 UTC。
- OTA 执行范围固定为六个 active 渠道：Booking.com、Airbnb、Expedia、Bookabach、Agoda、
  Trip.com。其他 OTA 不属于当前合同、发现、健康或验收范围，不保留旧渠道兼容要求。
- Argus 负责浏览器采集和证据生命周期；Tymra 负责身份、额度、竞品选择、市场信号、价格
  建议和会员交付。开发 fixture 与真实公开页面结果必须明确隔离。
- 开发环境提供 `demo1` 至 `demo4` 四个固定会员账号，对应 Free、Host、Pro、Portfolio；密码仅由开发配置派生或覆盖，不进入仓库明文。
- Pricing Unit 稳定 API 已补齐集合 GET/POST 与单项 GET/PATCH；POST 只接受当前会员已确认并计费过的 Price Check，不接受任意内部房源 ID。
- 2026-08-12 当前工作树通过 lint、全仓 TypeScript、212 个 Web/domain/provider/db 单元测试
  （5 个外部 fixture 跳过）、127 个 Worker 测试及 104 个隔离 PostgreSQL 集成测试。
  112 页生产构建、生产 Compose 配置解析、开发镜像重建及 Web/Worker/Argus 运行健康检查通过；
  精确证据与未验证边界见追踪表。

## 当前优先级

| 优先级 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| P0 | National Data Core v1.3 差距审计 | 对 `DATA-CORE-001..022` 逐项映射代码、Schema、任务、后台页面和测试，列出缺失项并更新追踪表 | 产品合同已更新；代码与 Schema 的完整差距审计尚未执行 |
| P0 | 统一生产部署与隐藏入口 | 同一构建部署后台、Price Check、登录、四档会员、Pricing、Stripe、结果和监测；`DEPLOYED_HIDDEN` 只隐藏首页、公共导航、Footer 和营销 CTA，直接路由继续执行认证、归属、权益与支付检查 | 现有客户能力已有开发验收；新展示合同和统一生产配置需要实现与发布级回归 |
| P0 | 付费方案开发验收 | Stripe test mode 覆盖 Checkout、Portal、升级/降级、取消/恢复、宽限、乱序/重复 webhook，并验证数据库状态 | 2026-08-12 真实 Sandbox 已完成 Checkout、Host→Pro、Pro→Host 下期降级、取消/恢复和 Portal；37 个近期 webhook 全部处理且零错误，开发 seed 不再覆盖 Stripe-backed 订阅。生产配置仍未启用 |
| P0 | 生产挑战与反滥用门槛 | 托管 challenge 必须使用 HTTPS、secret 和 fail-closed 验证；不保存原始 IP/设备/卡信息 | 生产接单配置强制 managed 模式，并提供无效 token fail-closed readiness；真实 provider、容量和误判演练未执行 |
| P0 | 高级能力服务端 Launch Gate | CSV export、Portfolio read API 在服务端同时校验会员可服务状态、权益、额度及独立上线开关 | 已完成；默认关闭，且 export 依赖 Pro gate、API 依赖 Portfolio gate |
| P1 | 会员完整可访问性 | EN/ZH、桌面、390/320px 通过 axe serious/critical=0、全键盘、焦点、reduced motion 和错误状态 | 自动化会员路由矩阵已纳入 Playwright；当前运行结果见追踪表 |
| P1 | Retention 生命周期 | 隔离数据库覆盖 Free/Host/Pro/Portfolio 及取消账户的独立保留期和 30 天房源占位 | 四档时间推进矩阵已通过 |
| P1 | 生产可观测性 | 无 PII 的会员、Billing、队列、CAPTCHA、成本和方案经济性指标 | Worker health 与 `/worker/alerts` 输出机器错误码、等级、聚合值和阈值；开发历史失败已审计式重试/归档并恢复为零告警，生产通知路由、dashboard 与注入演练仍是部署工作 |
| P1 | Live 会员 E2E | live provider 完成会员登录、地址或 OTA URL、真实 Argus 价格及非 demo 报告 | 2026-08-12 OTA URL 与 LINZ 地址两条真实链路均通过；分别发布 NZD 591 与 NZD 250 的两晚公开价，`priceResultStatus=COMPLETED`、推荐因仅一条证据为 `NOT_AVAILABLE` |
| P2 | 大文件分解 | 分离 CSS surface、会员运营逻辑、公共事件 adapter family、seed source registry 和 OTA 定价编排 | 地址型 OTA 搜索、身份解析、可比关系及价格写入已迁移到独立 orchestrator；`WorkerService` 保留稳定调用入口 |
| P2 | 生产采集启用 | 来源 canary、容量、监控、回滚、安全和长期稳定性通过后再启用 Scheduler | 生产 canary 强制单来源、两轮且每轮最多 2 条；`public_holidays_nz` 开发技术金丝雀 2/2 通过且无重复增长、parser failure 或远端证据残留；Scheduler 默认关闭，真实生产 canary 尚未获配置和执行授权 |

## 交付顺序

1. 完成 `DATA-CORE-001..022` 的代码、Schema、任务、页面与测试差距审计，并把结果更新到追踪表。
2. 实现 `DEPLOYED_HIDDEN` 展示配置和统一生产部署合同，验证公开入口不可发现、直接路由可达且安全控制完整。
3. 配置生产托管 challenge provider，运行无效 token readiness，再完成容量、失败注入和误判申诉演练。
4. 将 `/worker/alerts` 接入监控路由和通知目标；确认无告警后授权一个来源执行 2×2 bounded canary。
5. canary 连续稳定后，分阶段启用 Scheduler；生产启动时必须覆盖全国分层计划，不以 Christchurch 作为调度边界。
6. 配置 Stripe live Prices、Portal、Webhook、税务与告警并执行生产发布清单；Sandbox 验收不得替代生产授权。后台与客户能力作为同一个生产候选冻结、回归和回滚。

## 2026-08-12 发布护栏本地验收

- 开发数据库中 30 个历史失败任务已通过带审计记录的精确重试或归档处理；24 个开发邮件任务在夹具密文轮换后成功，三个可恢复采集任务中两个成功，一个因历史 Argus 证据已按合同清理而归档，`/worker/alerts` 最终为空。
- 开发 seed 会重新生成固定 demo Price Check 与关联 Email Delivery 的加密字段，但只触及 `demo-check-*` 夹具，不轮换真实会员记录。
- OTA 地址 comparable 的相同版本重试不再更新 append-only 关系；相同 identity 复用既有版本，语义变化必须创建新版本。
- `public_holidays_nz` 完成两轮、每轮最多两条的 `DEVELOPMENT_TECHNICAL_VALIDATION`：配置和 schedule 未变化、parser failure 为 0、第二轮 lineage 增长为 0、远端证据残留为 0。
- Eventfinda 同规格技术金丝雀按日预算和 cooldown fail closed，未被计为通过；真实生产金丝雀仍需独立生产环境、监控通知目标和明确发布授权。

## 已知边界

- 一条有效公开 OTA 目标价格必须交付给用户；证据不足只限制市场结论和推荐置信度，不得抹掉
  已观察价格。不能访问、条件漂移或仅有受限价格时仍必须 fail closed。
- 地址基准同步解析并采集首个可验证附近房源即可发布价格；完整竞品扩充不得阻塞这一价格，
  竞品不足只令推荐保持 `NOT_AVAILABLE` 或有限证据状态。
- 精确逐日价格检查范围与方案权益按会员合同执行；未采集日期显示“无公开 OTA 观测”，不得补值。
- CAPTCHA 只能由 Argus 暂停同一 Page/BrowserContext 并提供短期 noVNC 人工接管，不自动绕过。
- 历史 `evidence/` 证明当时的开发验收，不保证外部页面长期稳定、生产容量或 SLA。
- 手工导入仍缺少真实运营导出文件的两轮持久化验收。
