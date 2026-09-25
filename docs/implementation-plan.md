# Tymra 当前实施计划

Last updated: 2026-09-25（四项受限定期采集运行；ChristchurchNZ 暂停）

## 2026-09-25 五项受限采集的下一道门槛

GeoNet 双官方数据源及 MBIE 最新月份全部 15 个主要市场已通过真实生产 Worker
验收。四条精确 Schedule 和 Scheduler 正在运行；ChristchurchNZ 官方列表有 47 页，旧三页
上限静默遗漏未来窗口，故该计划已暂停。失败作业会在下一轮前自动停用其计划；
高频 Scheduler、客户入口、新 Check、内部按需、Stripe、SMTP 和会员继续关闭。
精确版本、生产结果、备份、回退及限制见
[`evidence/five-source-safety-2026-09-25.md`](./evidence/five-source-safety-2026-09-25.md)。

先为 ChristchurchNZ 确定合适的请求预算、串行限速和完整窗口验收；超页数或记录预算时
明确失败的保护及 `event_sessions` 证据保留修复已发布。通过真实生产验收后才能恢复第五条计划。
随后在不同 UTC
日期核对第二个自然周期：各来源请求量、实际覆盖、无重复写入、
新鲜度、失败停采、队列和告警。ChristchurchNZ 的三页／30 条上限及多场次完整性、
节假日 31 天窗口、Stats NZ 发布节奏和 GeoNet 三小时新鲜度仍须分别解决。
不要把五项金丝雀描述成完整全国公开信号方案，也不要在这些缺口解决前开放客户使用
或基于不完整覆盖给出价格建议。RBNZ 仍未通过解析验收。

## 2026-09-25 五渠道首轮后的 review 门槛（历史）

`public_holidays_nz`、`mbie`、`rto_calendars`、`geonet` 和 `stats_nz` 各完成一次真实、
有限额的生产定期 Job。五条 Schedule 均已关闭，Scheduler 容器及运行开关也已关闭；
当时在 Harold review 本轮结果和边界前不恢复任何周期运行。生产 Scheduler 只接受这五条
精确配置，不会运行通用 seed 中的其他计划。详细身份、业务结果、哈希修复和回滚见
[`evidence/first-five-public-scheduled-collection-2026-09-25.md`](./evidence/first-five-public-scheduled-collection-2026-09-25.md)。

Review 时先核对 GeoNet 只访问地震端点而未覆盖火山端点、MBIE 的 20 条结果上限、Stats NZ
的月度发布节奏、ChristchurchNZ 的每日频率及 72 小时原始记录保留期。之后再按不同
UTC 日期检查第二周期的新鲜度、重复记录、来源失败、队列和告警，分别决定哪些渠道持续运行
及其频率/上限。教育部校历生产 Node 健康检查返回 307，未启用；RBNZ 已知解析失败未复测。
Lincoln 的受限验收保护与 OTA/客户业务均不在这次定期采集范围。

## 2026-09-25 生产 Argus 接入复核

当前 Worker/API 已读取受保护的正式配置，并与 Mac mini 交接文件一致；Argus 正式 revision、
health、readiness、OpenAPI 和 `tymra-prod` 最小权限边界已核对。使用现有生产镜像完成一项
Lincoln University 2026 公开只读 Job：Tymra 保存 105 条日期所形成的两条既有信号、复制并
核对两份证据后由正式流程 ACK，Argus 的结果与证据随后进入 PURGED。无需修改代码、环境、
migration 或重建容器。详见
[`evidence/tymra-argus-production-recheck-2026-09-25.md`](./evidence/tymra-argus-production-recheck-2026-09-25.md)。

下一步仍按来源逐个评估持续采集、数据新鲜度、告警和回滚；本次一次性验收不授权
Scheduler、客户入口、OTA Profile、RBNZ 或其他 Connector。RBNZ 已知解析失败未在本次重测。

## 2026-09-25 首批公开来源验收完成

`public_holidays_nz`、`rto_calendars` 和 `mbie` 各完成两次最多两条业务结果的生产
Worker 手动采集，6 次运行均成功，复跑没有重复记录或来源关联增长。三条来源已启用供明确的
人工调用，但未建立 Schedule；Scheduler、客户入口及其他业务开关继续关闭。官方公开 HTTP
适配器不经过 Argus Job/ACK，不能把本次结果当作 Argus Connector 的新增验收。
发布身份、备份、数据库结果及限制见
[`evidence/public-canary-production-2026-09-25.md`](./evidence/public-canary-production-2026-09-25.md)。

下一步先观察这三条来源的健康、数据新鲜度和异常，再分别评估持续采集的频率、预算、
告警与回滚门槛；启用 Scheduler 仍需独立决定和验收。RBNZ 当前解析错误及其余渠道
不在本批完成范围。

## 2026-09-24 受限生产采集验收完成

Argus 证据经 Cloudflare 的原始字节和哈希已恢复一致；Tymra 仅新增
`UNIVERSITY_CALENDAR` migration。复用原 Lincoln 2026 Argus Job 的有界重试已写入两条
不重复的生产市场信号、复制并校验两份证据，ACK 后结果为 410、远端证据为 404。
Worker/API 保持健康运行，Scheduler、客户入口、新 Check、内部按需、Stripe、SMTP 和会员
继续关闭。当前只验收这一条公开只读 Connector；RBNZ 和其他 Connector 未验收。
下一阶段应逐个解决各 Connector 的独立问题，再准备单来源持续金丝雀、告警和
Scheduler 启用门槛，不把本次一次性验收当作持续运行验收。完整证据见
[`evidence/tymra-argus-production-acceptance-2026-09-24.md`](./evidence/tymra-argus-production-acceptance-2026-09-24.md)。

## 2026-09-24 先前 Argus 生产接入阻断（历史）

一次有界 Lincoln 2026 生产队列验收已到达 Argus 并完成抓取，但 Tymra 因
`UNIVERSITY_CALENDAR` 持久化类型缺失而失败，随后 HTML 证据字节与 Argus 哈希不符，
未 ACK。已回退新镜像及 Argus 配置、停止 Worker/API 并暂停该来源；后台继续正常运行。
本地已准备由 Prisma 枚举驱动的类型映射及 migration，测试通过，**尚未部署或迁移生产库**。
只读对比已定位 Cloudflare 邮件地址混淆修改了 Argus 公网 HTML 证据。下一步对证据路由
实施并验证不改写响应的修复，保持哈希验证；再发布 Tymra 类型修复，并形成只处理既有
Argus 结果且不再次访问 Lincoln 源站的恢复方案。未完成这些门槛前不重新启动 collection，
不启用 Scheduler。具体证据见
[`evidence/tymra-argus-production-attempt-2026-09-24.md`](./evidence/tymra-argus-production-attempt-2026-09-24.md)。

## 2026-09-24 首次生产访问边界

当前用户要求首次生产阶段仅开放管理员后台，公开站和客户 API 不对外提供，且暂不供搜索收录。
本地候选已在生产 Compose 保留 `ops.tymra.nz` 路由、默认启用应用层后台独占限制，并验证
禁索引响应；旧 bearer 结果入口残留已清理，本地 Web 类型检查和镜像构建通过。确切验证与
镜像身份见 `traceability.md`。SPM 上的后台部署、生产 DNS、公开 TLS 与桌面浏览器
管理员流程已验证。公开客户端开放是后续
独立步骤，仍须按正式产品规范完成客户、支付和直接路由验收。

用户已指定 Spicy Maggie 主机和新注册的 `tymra.nz`。已只读核实目标是
`spm-prod-01` / `148.135.121.30`，现有服务 healthy，使用 `spm_ingress` 和
`letsencrypt` 证书解析器。Cloudflare DNS 页面当前为零记录。主机为 x86_64，需使用
对应 amd64 镜像；生产管理员和禁用外部服务的决定已落实如下。
普通 seed 会创建演示数据，未用于生产。用户已确认 `ict@spicym.nz` 和暂不接入外部服务。
SPM 已完成原生 amd64 构建、32 项迁移及独立管理员初始化，后台、数据库和缓存 healthy；
源站登录、退出、会话失效及公开路径拒绝验证通过。采集/API、Scheduler 进程未启动。
用户确认后已保存唯一 `ops` 代理记录，启用 Cloudflare 完全（严格）模式；源站与公网证书
验证均通过。Playwright 完成登录、概览、列表导航和退出；用户 Safari 正常打开登录页。
确切镜像、源码包、界面证据和回退材料在 `traceability.md`。
后续重点是正式接入生产 Argus、完善不含演示数据的业务配置并独立验收，再决定启用采集；
本次不启动外部服务，不开放客户入口。

## 2026-09-13 接续前置条件

项目已迁入新 Development 目录，产品候选和既有未提交工作保留。开始以下产品交付步骤前，
先读 `traceability.md` 中本次本机核对：当前服务运行已构建镜像，Argus 健康路由返回 404，
Worker API readiness 为 503。需在相应 Argus/本机运维任务中恢复依赖路由，再按实际源码、
数据库和配置重新验收目标候选。本次不启用 Scheduler，不执行新 migration、seed、真实采集、
Stripe 或发布；不能用项目建立代替这些门禁。

Web 类型检查另有六项既有错误：旧 token-result、feedback 和 reissue 路由仍引用已删除的
`resolveResultLink`、`ResultView` 与 `LINK_REISSUED`。原目录复现完全相同错误。下一次 Tymra
产品任务先按 v1.3 正式规范处理这些残留入口，再运行相应验收；本次目录迁移不修改业务实现。

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
- 2026-08-12 当时的工作树通过 lint、全仓 TypeScript、212 个 Web/domain/provider/db 单元测试
  （5 个外部 fixture 跳过）、127 个 Worker 测试及 104 个隔离 PostgreSQL 集成测试。
  112 页生产构建、生产 Compose 配置解析、开发镜像重建及 Web/Worker/Argus 运行健康检查通过；
  这是历史候选的验证结果；2026-09-13 基线已发现 Web 六项类型错误及 readiness 503，
  当前候选不能沿用旧通过结论。精确证据与未验证边界见追踪表。

## 当前优先级

| 优先级 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| P0 | National Data Core v1.3 差距审计 | 对 `DATA-CORE-001..022` 逐项映射代码、Schema、任务、后台页面和测试，列出缺失项并更新追踪表 | 2026-08-21 已完成；逐项证据、状态和优先级见 `traceability.md` |
| P0 | 数据正确性 Schema | 增加显式 Source capability、精确 coverage taxonomy、全部 17 Region 身份、版本化 Property/Unit/Listing 映射与 Listing 变化、完整时间字段、TransformationRun/lineage edge；MarketSnapshot 支持两种模式并允许地址模式没有目标 Listing；删除 ResultAccessToken | 已实现；32 个迁移从零应用、seed、Schema drift 和追加历史/lineage 集成测试通过 |
| P0 | 全国目录与 OTA 面板执行器 | Catalog Job 实际执行分层发现、去重和持久化；Panel Builder 建立 1,000–1,500 个分层唯一 Unit，Anchor/Rotating Job 对批准日期篮子发起有界六 OTA 采集并更新覆盖事实 | 已实现 17×6 durable frontier、分层 840 Anchor/360 Rotating 选择及每任务最多三成员采集；真实全国填充仍属于运行验收 |
| P0 | Capability-gated 编排 | 每个 Source 注册版本化 capability；Job 在网络访问前校验 capability、启用、环境、健康、预算和并发，缺失能力返回机器错误码 | 已实现并由缺失 capability 的零网络集成测试验证；既有来源预算和并发门保持生效 |
| P0 | 地址快照与历史 lineage | `LOCATION_BENCHMARK` 以稳定 Property／空间锚点创建快照，不伪造 Listing；全部正常化、快照、分析和结果写入可查询 lineage，Listing 更新追加变化版本 | 已实现 Property/Unit/Listing 追加版本、关系版本、原始→事实→快照→结果/Insight lineage 和地址空间锚点；数据库契约验证通过 |
| P0 | 统一部署与隐藏入口 | 同一构建部署后台、Price Check、登录、四档会员、Pricing、Stripe、结果和监测；`DEPLOYED_HIDDEN` 只隐藏首页、公共导航、Footer 和营销 CTA，直接路由继续执行认证、归属、权益与支付检查；删除 bearer 结果 API、邮件 URL 和 Admin reissue | 尚未完成当前源码验收：2026-09-13 仍有旧 token-result、feedback 和 reissue 路由引用已删除符号，产生六项 Web 类型错误。先完成残留入口清理及认证回归，再执行发布级浏览器矩阵；不沿用历史“全部删除”结论 |
| P0 | 全国生产候选验收 | 干净数据库迁移/seed、17 Region coverage、六 OTA registry、两种 target mode、历史/lineage 不可变、单价格返回、证据 ACK/purge、隐藏入口/直接路由安全、回滚与生产构建全部通过 | 本地数据库/代码候选已通过；非 demo 全国真实采集、证据 ACK/purge、发布级浏览器矩阵与生产运行仍未执行 |
| P1 | 全国运营深度 | 补齐 listing/样本/地域/Freshness/gap 等 coverage facts、类型化 Freshness/Confidence、其余 Region 公共信号深度、内部地址/Listing 有界采集 UI 和真实会员计划监测 | Schema、17 Region coverage facts、类型化质量对象和 Admin 有界按需入口已实现并集成验证；连续全国信号深度与全部会员方案真实调度仍需运行验收 |
| P2 | 规模与效率优化 | 自适应面板轮换/权重、按波动和成本调频、lineage Explorer、覆盖缺口优先级和长期运行调优 | 已实现波动/成本评分、自适应 12–168 小时 cadence、轮换、lineage Explorer 和 gap priority；阈值仍需真实长期数据校准 |
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

1. 先完成 P0 数据正确性迁移：Source capability、coverage taxonomy、17 Region 身份、版本化
   identity/Listing history、完整时间语义、lineage、双目标模式快照，并删除旧 bearer 结果模型。
2. 再实现 P0 全国执行器：目录发现与持久化、分层 OTA 面板构建和采集、capability-gated
   编排、地址快照、认证结果交付及 `DEPLOYED_HIDDEN`。
3. 在干净数据库和同一发布候选上完成全国 P0 验收；失败时回滚整个候选，不能用历史证据、
   Christchurch-only 数据或演示 fixture 代替。
4. P0 稳定后补齐 P1 全国运营深度、托管 challenge、生产监控通知和单来源 2×2 bounded
   canary；确认无告警后分阶段启用覆盖全国的 Scheduler。
5. 配置 Stripe live Prices、Portal、Webhook、税务与告警并执行生产发布清单；Sandbox 验收
   不得替代生产授权。后台与隐藏的客户能力作为同一生产候选冻结、回归和回滚。
6. 累积足够真实全国运行数据后再实施 P2 自适应采集、成本优化和 lineage/coverage 运营工具。

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
