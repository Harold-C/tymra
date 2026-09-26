# Tymra 当前实施计划

Last updated: 2026-09-26（Argus 交付加固进入 main；现网仍为先前镜像）

## 2026-09-26 Argus 交付候选的发布门槛

旧 `argus-compatibility` 快照中的结果哈希／身份检查、证据文件同步和重试校验已适配当前
`main`，并在独立测试库通过完整 `pnpm verify`。本次不改变五渠道生产镜像与计划。
下一次部署该候选前，须核对当前 Argus 真正的结果哈希契约、目标证据卷的目录同步行为，
以及重建 Worker 后的文件和 ACK 恢复；不能用本地测试替代生产验收。过期证据文件与
`ArgusExecution.result` 的物理清理仍未实现，须另立有界保留与恢复方案。

## 2026-09-25 完整生产门槛的并行准备

当时的独立候选已通过完整 `pnpm verify`、中英文桌面/移动隐藏入口
及直接路由的本地浏览器验收、隔离数据库备份恢复。原先追踪表中的六个 Web 类型
错误在当前候选未复现。日历和首批计划结果超过预算时改为显式失败，避免将截断
数据误报为完整；此修复只在隔离候选，尚未部署。生产只读复核确认五条计划仍启用、
13 个 Job 均成功、健康/就绪/告警端点为 200，且生产身份目录和 MarketCoverage
尚无业务记录。精确证据见
[`evidence/full-production-gates-preparation-2026-09-25.md`](./evidence/full-production-gates-preparation-2026-09-25.md)。

下一步按依赖分开：先保持已部署五渠道版本不变，核验下一个不同 UTC 日的真实周期；
再对 ChristchurchNZ 撤稿、GeoNet 三小时新鲜度、节假日全年窗口、Stats NZ 发布节奏
设计并验收各自的新候选。全国门槛还需分散 Region 的非 demo 身份与公共信号采集、
代表性 OTA 面板及双模式按需验收。客户端同版本门槛需要真实 provider、会员、
Stripe、SMTP、管理式挑战、完整浏览器/无障碍、容量和生产恢复证据；现行
Admin-only 入口及业务开关保持关闭，不能把本地隐藏入口验收当作已上线。

后续验收按以下可核对的证据推进，不能用配置存在或开发 seed 代替业务结果：

五渠道第二自然周期已保存[只读基线和可重复核对流程](./evidence/first-five-cycle-review-preparation-2026-09-25.md)。
脚本不会启动作业；截至基线时其结果为 `WAITING`，需要 9 月 26 日的两条每日计划及
10 月 2 日的三条每周计划自然完成后分别复核，不能提前称为通过。

| 门槛 | 需要记录的生产证据 | 当前边界 |
| --- | --- | --- |
| 五渠道第二周期 | 不同 UTC 日的五条精确计划、实际 Job ID/终态/尝试次数、各来源请求量与预算、来源业务 ID 前后集合、重复计数、Freshness、队列/告警及失败后停采 | 首日通过；下一自然周期未发生 |
| 全国覆盖 `DATA-CORE-001/002/006/008` | 从实际启用 Registry 汇总来源；逐一核对 17 Region 的非 demo 身份数、公共信号、最近成功/健康时间、24/72 小时覆盖率、成功/失败率和明确缺口；在 Christchurch 以外取分散真实样本 | 生产身份与 MarketCoverage 目前为空，不可声称全国通过 |
| 面板与按需 `DATA-CORE-003/004/021` | 基于真实去重身份核对分层面板及价格/可售样本；分别对已批准地址与支持的 OTA Listing URL 做有界执行，验证归属、时间、证据、lineage、失败不伪造结果 | 不启用内部按需或 OTA 采集来填补空表；先准备并审核生产样本与来源预算 |
| 同版本客户端 `DATA-CORE-022/PRD-AT-010` | 同一镜像的 EN/ZH 桌面/手机、直接路由、账户归属与权益、真实 provider、Stripe/邮件/挑战、容量、备份恢复和支持流程；隐藏入口时仍应保护直接访问 | 目前只通过隔离候选的隐藏发现与未认证边界；生产仍为后台独占 |

ChristchurchNZ 撤稿、GeoNet 新鲜度、节假日年度范围和 Stats NZ 发布感知分别形成来源候选与
回归；任一门槛失败即保持该来源原有受限状态，不以提高频率、抬高预算或重复访问源站
替代原因定位。RBNZ 保持未验收，单独修复解析后再纳入任何定期计划。

## 2026-09-25 五项受限采集的下一道门槛

GeoNet 双官方数据源及 MBIE 最新月份全部 15 个主要市场已通过真实生产 Worker
验收。ChristchurchNZ 首轮读取 38 页、435 个来源事件及 736 个场次；第二轮增量只读
15 页、触达 406 个未变化场次，数据库总数不增长。五条精确 Schedule 和 Scheduler
现正运行；失败作业会在下一轮前自动停用其计划。高频 Scheduler、客户入口、新 Check、
内部按需、Stripe、SMTP 和会员继续关闭。精确版本、Job、哈希、备份及回退见
[`evidence/christchurchnz-incremental-2026-09-25.md`](./evidence/christchurchnz-incremental-2026-09-25.md)；
前一轮安全修复见
[`evidence/five-source-safety-2026-09-25.md`](./evidence/five-source-safety-2026-09-25.md)。

下一步在不同 UTC 日期核对第二个自然周期：各来源请求量、实际覆盖、无重复写入、
新鲜度、失败停采、队列和告警。特别核对 ChristchurchNZ 的轮换页游标是否从 15
继续、实际请求不超过 15、业务 ID 总数仅在新增活动时增长；定期全窗口复核仍不得
超过 40 次公开请求。更深页面的撤稿或变化在轮换到该页前可能暂时陈旧，来源消失
后的自动撤销尚未验收，应保持客户入口关闭。节假日 31 天窗口、Stats NZ 发布节奏
和 GeoNet 三小时新鲜度仍须分别解决。
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
  这是历史候选的验证结果；2026-09-13 基线发现的 Web 六项类型错误及 readiness 503
  已被后续独立候选和生产复核取代。精确证据与未验证边界见追踪表。

## 当前优先级

| 优先级 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| P0 | National Data Core v1.3 差距审计 | 对 `DATA-CORE-001..022` 逐项映射代码、Schema、任务、后台页面和测试，列出缺失项并更新追踪表 | 2026-08-21 已完成；逐项证据、状态和优先级见 `traceability.md` |
| P0 | 数据正确性 Schema | 增加显式 Source capability、精确 coverage taxonomy、全部 17 Region 身份、版本化 Property/Unit/Listing 映射与 Listing 变化、完整时间字段、TransformationRun/lineage edge；MarketSnapshot 支持两种模式并允许地址模式没有目标 Listing；删除 ResultAccessToken | 已实现；当前隔离候选 33 个迁移从零应用、开发 seed 和追加历史/lineage 集成测试通过；此结果不代表生产全国数据已填充 |
| P0 | 全国目录与 OTA 面板执行器 | Catalog Job 实际执行分层发现、去重和持久化；Panel Builder 建立 1,000–1,500 个分层唯一 Unit，Anchor/Rotating Job 对批准日期篮子发起有界六 OTA 采集并更新覆盖事实 | 已实现 17×6 durable frontier、分层 840 Anchor/360 Rotating 选择及每任务最多三成员采集；真实全国填充仍属于运行验收 |
| P0 | Capability-gated 编排 | 每个 Source 注册版本化 capability；Job 在网络访问前校验 capability、启用、环境、健康、预算和并发，缺失能力返回机器错误码 | 已实现并由缺失 capability 的零网络集成测试验证；既有来源预算和并发门保持生效 |
| P0 | 地址快照与历史 lineage | `LOCATION_BENCHMARK` 以稳定 Property／空间锚点创建快照，不伪造 Listing；全部正常化、快照、分析和结果写入可查询 lineage，Listing 更新追加变化版本 | 已实现 Property/Unit/Listing 追加版本、关系版本、原始→事实→快照→结果/Insight lineage 和地址空间锚点；数据库契约验证通过 |
| P0 | 统一部署与隐藏入口 | 同一构建部署后台、Price Check、登录、四档会员、Pricing、Stripe、结果和监测；`DEPLOYED_HIDDEN` 只隐藏首页、公共导航、Footer 和营销 CTA，直接路由继续执行认证、归属、权益与支付检查；删除 bearer 结果 API、邮件 URL 和 Admin reissue | 当前隔离候选 Web 类型、隐藏导航及未认证直接路由验收通过；付费归属、真实 provider、Stripe、邮件、管理式挑战、完整浏览器矩阵和生产同版本部署仍未验收 |
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
| P2 | 生产采集启用 | 来源 canary、容量、监控、回滚、安全和长期稳定性通过后再启用 Scheduler | 生产已对五条精确计划开启受限定期观察，首日均成功；第二个不同 UTC 日周期、来源特有缺口、容量及全国持续运行门槛尚未通过；其他计划保持关闭 |

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
