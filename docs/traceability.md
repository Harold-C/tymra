# Tymra 实现与验收追踪

更新：2026-10-07。最新生产证据仍为 2026-10-06 恢复记录；本次结构优化仅进行本地独立测试，
没有重新连接生产或执行真实采集。
本文件维护当前实现、最近已记录的环境和验收缺口；下一步见[实施计划](implementation-plan.md)，
目标合同见[产品入口](product/README.md)，变迁见[决策记录](decisions.md#文档与运行阶段变迁)。
历史提交、镜像、计划数量及 nextRun 均须在下一次操作前重新核对。

## 最近生产记录

| 对象 | 最近记录及范围 |
| --- | --- |
| Tymra | 源码 `735c7f8`；Web、Worker、API、Scheduler 同一镜像 `sha256:c33e2d7c3974745991865254c10ff1dcba5df65e07ffab34f2c79fdbfdb5328d`；2026-10-06 NZ 19:49 切换，19:50 读回，无新增 migration |
| Argus | 公开执行修复 `cac5a3b` / `argus-release-20261006-5`，NZ 21:05 切换；保留当时生产私有实现、账号、Profile、数据库及挂载，未随公开修复发布其他私有源码 |
| 入口 | `ADMIN_ONLY_ACCESS=true`，公网仅 Operations 管理员页面及 Admin API；客户域名、公开 Price Check、客户 API、Stripe webhook 尚未开放。与只隐藏导航的 `DEPLOYED_HIDDEN` 不同 |
| 计划 | 最近读回 84 条现行计划全部开启：78 公开、六 OTA；六 OTA 为 HEALTHY，主 Scheduler 开启、高频 Scheduler 关闭，无活动 OTA Job |
| OTA 预算 | 正常 Tymra 每 OTA 来源每日六次、Argus 每 OTA 来源每日十二次、并发一；Airbnb/Bookabach 临时手动豁免已撤回，当日计数未清零。公开来源使用各自预算 |
| 恢复材料 | Tymra 生产备份 `/srv/apps/tymra/backups/ota-recovery-20261006-predeploy`；本地过程收据 `runtime/release-candidates/ota-recovery-20261006`；路径表示当次记录，不证明现在仍可读取 |
| 验证范围 | 同一固定 Linux amd64 Tymra 镜像 lint、类型、647 单元、131 数据库/API/Worker 集成、117 页构建通过；5/6 条既有条件跳过明确保留，不计入通过 |
| 恢复与部署验证 | 当次配对备份实际恢复 80 表、581 份证据、83 条已验证交付；部署后 HTTPS、readiness、权限、业务摘要、证据、配置和挂载读回通过 |
| Argus 验证 | Tag 5 源码 918 项、固定镜像 Chrome 1,109 项通过；条件数据库/浏览器入口由另一层补验。最新配对恢复、所有权拒绝、wire 哈希及离线 Profile 验证通过 |

这些证据支持已发布的有界后台采集，不证明全国代表性、长期自然周期稳定性或客户产品已验收。
本次仅创建独立测试镜像和可丢弃测试栈；日常开发镜像、服务、挂载和数据库未修改。
测试入口及隔离要求见根 [README](../README.md#verification)。

### Airbnb 与 Bookabach 恢复证据

- Bookabach 保留实际观察到的 `vb/ha` 后缀；裸编号和不同后缀是独立身份，未知后缀拒绝。
  原失败 `cmuw8bcbr002eo307v68m15h1` 为截断后缀导致错房源，保留失败记录。
- Bookabach 两个父 Job `cmuwcg6q90000mq6nbwbn5fwm`、`cmuwcsc3g0000mq8uyhnrf95h`
  均一次尝试，`bookabach:4742386vb`、2026-10-13–14、两成人一单位，取得
  NZD 152.00 AVAILABLE/COMPLETE。两轮五次执行、十份本地证据，哈希、持久交付及 ACK 后 410 通过。
  固定验收窗口绑定 Tymra `735c7f8` / Argus `6a83aa6`。
- Airbnb 先修复整数预览卡片向上取整，再修复 Total 行把划线原价 209.42 误读为现价的情况；
  原失败 `cmuw6dx2p00zoql0700f774ly` 及补充父 Job `cmuwca8800000mq4aczcwz31z` 保留。
  离线原始页面重放不算新的真实访问。
- Airbnb 最终两个父 Job `cmuweak7x0000mqc7833njzrn`、`cmuwefmcr0000mqeeiugepwqj`
  均一次尝试，`airbnb:1567693964948000544`、同一未来日期及人数，取得
  NZD 177.61 AVAILABLE/COMPLETE；两轮四次执行、八份本地证据、交付及 ACK 后 410 通过。
  窗口绑定 Tymra `735c7f8` / Argus `cac5a3b`。
- 两条原每日计划已恢复；记录的下一次 NZ 时间分别为 Airbnb 2026-10-07 21:44、
  Bookabach 2026-10-07 21:57。恢复后首个自然周期尚未观察，不能由两轮试采推定通过。

### 公开来源与其余 OTA

- 七个暂停公开来源完成请求预算、队列/执行期限、Power BI 查询及 School Sport 筛选修复后，
  各通过两轮精确原计划试采并恢复。旧 Eventfinda/Ticketmaster 周计划已删除，现行每日进度计划保留。
- School Sport NZ 在截取有界结果前按全国合同保留记录，再作地区业务筛选；两轮各一请求、
  17 条全国记录、两条 Canterbury 业务记录。venue/city 未知，影响状态仍为 `PENDING_EVIDENCE`。
  记录的下一次 NZ 时间为 2026-10-13 17:52；恢复后自然周期未验收。
- Booking、Agoda、Expedia、Trip.com 已分别完成有界生产门槛并启用；具体历史收据留在
  2026-10-06 整理前 Git 版本。Agoda 原有失败窗口及追加版本窗口保留，不覆盖历史指标。
- 78 条公开计划和六条 OTA 启用不代表每个来源都具有完整地域、日期、规模或影响证据；
  来源合同见 [collection](README.md#数据采集)。

## 全国数据核心差距

条款来自 [data-core.md](product/data-core.md)。数据库/代码验证与真实全国运行分别判断；
P0 为统一产品验收依赖或数据正确性门槛，P1 为运营深度，P2 为规模优化。

| 条款 | 已实现或已记录证据 | 剩余缺口 | 优先级 |
| --- | --- | --- | --- |
| DATA-CORE-001 | 17 Region × 六 OTA durable frontier，发现后持久化 Property/Unit/Listing 及版本 | 全国非 demo 身份目录深度、分布与覆盖测量 | P0 |
| DATA-CORE-002 | 全国聚合来源、15 主要市场映射、78 条公开计划的有界生产运行 | 不等于全部 17 Region 的连续深度、历史或稳定性 | P1 |
| DATA-CORE-003 | 840 Anchor + 360 Rotating 分层选择、日期篮子及有界采集 | 实际库存填充、代表性与轮换校准 | P0 |
| DATA-CORE-004 | Admin 有界 NZ 地址/OTA URL 按需入口，30-night/365-day/occupancy 守卫 | 当前候选真实地址与六 OTA 操作员验收 | P1 |
| DATA-CORE-005 | Host/Pro/Portfolio 调度、权益、额度与 NZ 日期计划 | 全方案真实调度；最新 check 复用时的目标模式/查询上下文保持 | P1 |
| DATA-CORE-006 | 17 Region seed 与 coverage refresh | 分散地区非 demo 验收 | P0 |
| DATA-CORE-007 | 五级覆盖分类已迁移并使用 | 每级必须由真实事实支持，不能由 seed 或计划启用推定 | P0 |
| DATA-CORE-008 | 身份/面板数量、构成、地域、24/72h、freshness/gap 等覆盖事实 | TA 深度与阈值运营校准 | P1 |
| DATA-CORE-009 | 版本化 capability registry、Admin 展示、按来源生产启用门槛 | 全量能力与覆盖事实的一致性复核，来源启用不证明全国完整性 | P0 |
| DATA-CORE-010 | 网络前 capability gate，缺失返回 SOURCE_CAPABILITY_MISSING；已有零网络回归 | 随相关编排变更维持回归 | P0 |
| DATA-CORE-011 | 原始、标准化、衍生数据分层及独立 retention 字段 | 分类保留期验收；Tymra 本地证据文件物理清理未完成 | P1 |
| DATA-CORE-012 | 生产有界链路已验证结果/字节哈希、业务入库、本地证据、ACK/410 | 长时生命周期与本地物理清理；不能把 Argus purge 当作 Tymra 清理 | P1 |
| DATA-CORE-013 | source/effective/observed/collected/ingested/business/validity/superseded 时间语义 | 来源未发布的时间保持 null，持续核对来源精度 | P0 |
| DATA-CORE-014 | 类型化、版本化 FreshnessAssessment | 跨域阈值用真实运行数据校准 | P1 |
| DATA-CORE-015 | identity/field/snapshot/derived 分层 ConfidenceAssessment | 真实阈值校准，不将分数当正确率 | P1 |
| DATA-CORE-015A | PublicFactVersion、改期历史、Admin current/history/all、当前与下一学年；六 OTA 已完成有界生产验收 | 各恢复来源自然周期、其他未来日期渠道与长期新鲜度 | P0 |
| DATA-CORE-016 | Property/Unit/Listing 内容及关系版本 | 身份拆分、冲突与纠正运营演练 | P0 |
| DATA-CORE-017 | 目录、解析、地址提升及手工导入追加 Listing/identity 版本 | 真实来源内容变化的多轮验收 | P0 |
| DATA-CORE-018 | TransformationRun/LineageEdge，raw→rate→snapshot→analysis→result/insight，Admin explorer | 生产规模查询及运营核验 | P0 |
| DATA-CORE-019 | 双模式 snapshot，地址模式允许无 Listing/Unit，以空间锚点承载 | 当前候选真实双模式端到端验收 | P0 |
| DATA-CORE-020 | 单一有效价格成功交付，价格与推荐状态分离；已有集成证据 | 双模式现行客户端回归，不能用六 OTA 后台试采替代 | P0 |
| DATA-CORE-021 | 全国后台代码、隔离库与有界生产采集已部署验证 | 全国深度、代表性面板、容量、稳定性及完整运行验收 | P0 |
| DATA-CORE-022 | 同构建客户代码；历史隔离 EN/ZH 桌面/手机隐藏导航与直接路由检查 | 生产仍 Admin-only；归属、付费、Stripe、邮件、challenge、完整浏览器、容量及客户入口门槛 | P0 |

## 功能追踪的证据口径

以下映射保留需求标识及已有实现证据。`development_verified` 指历史开发候选的对应检查，
不表示本次整理重跑，也不证明当前生产客户链路。其他状态保留明确的待验收边界。
2026-09-25 候选 `7e6b08fb74e39a12f9432a3b346da493e4775e17` 的隔离隐藏入口检查覆盖
EN/ZH、1440/390px、直接公开路由及未认证拒绝；付费归属和生产客户入口未通过该项检查。
2026-08-12 会员数据库与桌面/手机矩阵属于较早候选；真实 Stripe Sandbox 证据见
[生命周期记录](evidence/stripe-sandbox-membership-lifecycle-2026-08-12.md)，不能替代 Stripe live 验收。

### Product Requirements

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| PRD-PRODUCT, PRD-OVERVIEW, PRD-USERS | Public copy, locale messages, legal/methodology content | Public page and copy tests | development_verified |
| PRD-GOALS, PRD-PRINCIPLES, PRD-AUTOMATION | Domain decisions, worker pipeline, publication policy | Decision and worker integration tests | development_verified |
| PRD-SCOPE unified production deployment | Existing Admin/client routes, APIs, Worker and database; dated isolated `DEPLOYED_HIDDEN` discovery/direct-route check passed | Nationwide depth and complete client production acceptance remain open; Admin-only backend has been deployed | implemented_not_live_accepted |
| PRD-DATA 6.1–6.7 | Prisma market models, append-only services, provider metadata and collection modes | Database integration tests | development_verified |
| DATA-CORE-001..022 / D-049 / D-050 | Capability registry, 17-Region frontier/coverage, representative panel, versioned identity/history, generic lineage, address-mode snapshot, hidden client discovery and bounded Admin on-demand workflow are implemented | Clean migration/seed/drift and isolated integration pass; push-time browser matrix plus non-demo nationwide operating acceptance remain | implemented_not_live_accepted |
| PRD-RESULT | Result versions, insights, authenticated ownership and feedback | Prior isolated Web types and invalid-session/API rejection passed; no bearer-result route was found in that source audit. Fresh complete ownership/browser and production acceptance remain | implemented_not_live_accepted |
| PRD-OPS | Exception Inbox and operational views | Admin API and Playwright tests | development_verified |
| PRD-MARKET | Market records, NZ eligibility and locale behaviour | Domain and bilingual flow tests | development_verified |
| PRD-COMMERCIAL, PRD-ROLES | Single-admin and customer/member surfaces exist; isolated hidden navigation and direct routes pass | Paid plans, real provider, Stripe, production authentication and customer ingress remain unaccepted | local_hidden_gate_verified_production_not_accepted |
| PRD-METRICS | Event contracts and operational aggregates | Event payload and metrics tests | development_verified |
| PRD-ROADMAP | Approved current national core/client scope; future products remain separately scoped | Current gaps and sequence are in the implementation plan; roadmap text is not delivery evidence | implemented_not_live_accepted |
| PRD-NFR, PRD-COMPLIANCE | Config guards, audit, redaction, Docker and docs | Security, production-start and Compose checks | development_verified |
| PRD-AT-001..010 | End-to-end development-candidate acceptance | Local hidden-entry subset of PRD-AT-010 passed; nationwide and commercial production flows remain pending | partially_verified_not_live_accepted |
| PRD-CODEX | Workspace, commands, docs, CI and verification | Guarded verify, empty-database OTA delivery and isolated Playwright main-flow/member-matrix jobs are configured; local evidence is recorded below and each pushed candidate's cloud result must be checked in GitHub Actions | development_verified |

### Business Rules

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| BR-GEN | Server-side domain policy and append-only persistence | Domain policy tests | development_verified |
| BR-OBJ | `packages/db/prisma/schema.prisma` and domain schemas | Schema/integration tests | development_verified |
| BR-MKT, BR-IN | Market eligibility, input and confirmation services | Domain/API tests | development_verified |
| BR-ST | Canonical `PriceCheckStatus` and transition validator | Exhaustive transition tests | development_verified |
| BR-SRC | Provider interface, collection runs and retry policy | Provider/worker tests | development_verified |
| BR-PRICE | Effective nightly total and availability normalization | Price normalization tests | development_verified |
| BR-COMP | Versioned competitor relationships and deduplication | Competitor tests | development_verified |
| BR-CONF, BR-RISK, BR-DEC | Confidence, risk and publication decisions | Decision table tests | development_verified |
| BR-EXC | Exception model, actions, priority and workspace | Admin API/E2E tests | development_verified |
| BR-DATA | Append-only records and identity merge history | Database integration tests | development_verified |
| BR-RES | Immutable results, authenticated ownership and notifications | 历史隔离候选 Web 类型通过，定向源码搜索未发现旧 bearer 结果路由；未认证会话/API 被拒绝。完整结果归属、邮件和生产客户流程仍需新验收 | implemented_not_live_accepted |
| BR-API | `/api/v1` response and error contracts | Rough/customer APIs exist; current two-mode input, authenticated result route inventory and obsolete endpoint removal need fresh audit | implemented_not_verified |
| BR-FB | Feedback and learning boundaries | Feedback integration tests | development_verified |
| BR-LIMIT | Idempotency, free-check reuse and rate limits | Abuse/idempotency tests | development_verified |
| BR-PRIV, BR-SEC | Consent, retention, hashing, redaction and audit | Security tests | development_verified |
| BR-EVT | Shared analytics event names and safe payloads | Event contract tests | development_verified |
| BR-AT-001..010 | Seeded acceptance scenarios | Domain, integration and E2E suites | development_verified |
| BR-IMPL | Shared enums/config and production demo guard | Package boundary and startup tests | development_verified |

### Pages And Routes

| Requirement | Route/module | Automated evidence | Status |
| --- | --- | --- | --- |
| PG-IA, PG-ROUTES | Root redirect, `/en`, `/zh`, all listed public/admin routes | Route inventory test | development_verified |
| PG-LAYOUT, PG-HOME | Public shell and locale home | Earlier EN/ZH desktop/mobile E2E predates nationwide coverage copy and hidden discovery | implemented_not_verified |
| PG-CHECK | `/{locale}/check`, `/{locale}/address-check` and `/{locale}/rough/{checkId}` | Routes exist; current two-mode, pre-email rough-value and no-formal-provider-before-verification contract needs fresh E2E | implemented_not_verified |
| PG-PROPERTY, PG-UNIT, PG-QUERY | Confirmation routes and APIs | Candidate/unit/query E2E | development_verified |
| PG-STATUS, PG-BIZSTATE | Persisted task status and terminal states | Existing status matrix predates authenticated formal-status and separate rough access contract | implemented_not_verified |
| PG-RESULT | Authenticated owner-only account result route and feedback | 历史隔离候选 Web 类型通过且未发现旧 bearer 结果路由；未认证账户和 API 被拒绝。完整客户结果浏览器和生产归属验收仍未执行 | implemented_not_live_accepted |
| PG-PUBLIC | Methodology, FAQ, contact and legal routes | Public route/copy tests | development_verified |
| PG-ADMIN | Protected admin shell and sign-in | Auth and 403 tests | development_verified |
| PG-EXC, PG-EXC-DETAIL | Inbox and single-screen workspace | Admin E2E tests | development_verified |
| PG-OPS-CHECK | Price Check list/detail | Admin integration tests | development_verified |
| PG-MARKET | Properties, units, competitors, coverage, collections, sources, signals | Admin route/API tests | development_verified |
| PG-MEMBER-AUTH, PG-MEMBER-OVERVIEW, PG-MEMBER-UNITS | Customer authentication, account and Property slots | Corresponding MEM-AUTH, MEM-ACC and MEM-UNIT evidence below; final client candidate matrix remains | implemented_not_live_accepted |
| PG-MEMBER-CHECKS, PG-MEMBER-CALENDAR, PG-MEMBER-ALERTS | Owner results, daily/monitoring views and notifications | Corresponding MEM-CHECK, MEM-CAL and MEM-ALERT evidence; real notification delivery remains | implemented_not_live_accepted |
| PG-MEMBER-PORTFOLIO, PG-MEMBER-BILLING, PG-MEMBER-SETTINGS, PG-MEMBER-OPS, PG-MEMBER-STATES | Advanced features, billing, lifecycle, Admin and full state matrix | Corresponding MEM-PORT/BILL/RET/OPS/E2E evidence; paid/current-browser and production gates remain | implemented_not_live_accepted |
| PG-API, PG-SHARED | Uniform response and page state handling | HTTP error matrix tests | development_verified |
| PG-RESP, PG-SEO | Responsive layouts, metadata and noindex | Viewport and metadata tests | development_verified |
| PG-EVT | Safe analytics binding | Event tests | development_verified |
| PG-AT-001..008 | Complete page acceptance | Existing Playwright suite predates the current nationwide, two-mode and hidden-entry page contract | implemented_not_verified |

### Visual And Interaction Requirements

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| UI-GEN, UI-BRAND, UI-TOKEN, UI-TYPE | `apps/web/app/globals.css`, Web components and typography | Component tests plus post-move desktop/mobile browser QA | development_verified |
| UI-LAYOUT | Public, result and admin layout primitives | 390, 1440 and 1920 browser QA plus responsive Playwright | development_verified |
| UI-COMP, UI-IMPL | Shared buttons, fields, cards, states, tables and dialogs | Component interaction tests | development_verified |
| UI-HOME, UI-CHECK, UI-RESULT | Product-specific feature compositions | Existing EN/ZH desktop/mobile evidence predates nationwide copy, two target modes and hidden public discovery | implemented_not_verified |
| UI-STATE, UI-FORM | Canonical status mapping and async feedback | State matrix tests | development_verified |
| UI-OPS | Admin shell, inbox, workspace and operations | Admin visual/E2E tests | development_verified |
| UI-MEMBER-1, UI-MEMBER-2, UI-MEMBER-3 | Customer shell, password sign-in and overview | MEM-AUTH/NAV/ACC evidence below; final candidate language/state matrix remains | implemented_not_live_accepted |
| UI-MEMBER-4, UI-MEMBER-5 | Property slots, checks, observed prices and calendar | MEM-UNIT/CHECK/CAL dated browser evidence; current complete client acceptance remains | implemented_not_live_accepted |
| UI-MEMBER-6, UI-MEMBER-7 | Billing, alerts, portfolio, export and integrations | MEM-BILL/ALERT/PORT gates below; production delivery and paid lifecycle remain | implemented_not_live_accepted |
| UI-MEMBER-8, UI-MEMBER-9 | Responsive states and membership Admin | MEM-A11Y/OPS dated evidence; current full browser/operating matrix remains | implemented_not_live_accepted |
| UI-MOTION | Motion tokens and reduced-motion behaviour | Reduced-motion tests | development_verified |
| UI-A11Y | Semantic forms, keyboard, focus and non-colour cues | axe plus keyboard tests | development_verified |
| UI-I18N | `next-intl` messages and locale formatting | Translation parity tests | development_verified |
| UI-SEO | Metadata, hreflang, noindex and redaction | Metadata/security tests | development_verified |
| UI-QA, UI-AT-001..008 | Full visual acceptance matrix | Existing screenshot/accessibility projects require rerun after current page-contract implementation | implemented_not_verified |

### Customer Funnel Requirements

Authoritative source: [Customer funnel requirements](product/customer-funnel.md).

| Requirement | Planned implementation boundary | Required evidence | Status |
| --- | --- | --- | --- |
| R15-FLOW-001 | Anonymous supported OTA URL or New Zealand address input, persisted `AnonymousCheck`, rough-result route and UI | Existing URL E2E obtains value without email; address-mode rough flow needs fresh EN/ZH desktop/mobile evidence | implemented_not_verified |
| R15-FLOW-002 | Rough-result presentation contract and limitation copy | Browser assertions distinguish rough/demo/formal evidence | development_verified |
| R15-INPUT-001 | OTA URL selects `LISTING_PRICING`; resolvable New Zealand address selects `LOCATION_BENCHMARK`; invalid target states fail closed | Existing URL resolver tests pass; unified two-mode browser and API contract requires implementation audit | implemented_not_verified |
| R15-INPUT-002 | URL context/default context or address standard Stay Query with no anonymous date, guest or room controls | Existing URL resolver/control-absence evidence passes; address geographic-expansion path needs fresh evidence | implemented_not_verified |
| R15-INPUT-003 | Target-mode, observed-context and address-scope persistence/disclosure plus honest no-quote terminal handling | Existing URL persistence and `NO_DEFAULT_QUOTE` tests pass; address disclosure needs fresh integration/browser regression | implemented_not_verified |
| R15-INPUT-004 | Address mode has no fabricated target Listing or price attribution; URL/address variants of one Property share one slot | Membership mode/identity tests cover parts; anonymous cross-mode identity and rough-result evidence require a dedicated audit | implemented_not_verified |
| R15-COST-001 | Rough analysis service and aggregate/cache provider boundary | Integration proves no `PriceCheck` before verification | development_verified |
| R15-ID-001 | Pending verification separate from active `CustomerUser` | Integration proves email request creates no customer | development_verified |
| R15-ID-002 | Idempotent magic-link consume transaction and `CustomerSession` | Concurrent consume produces exactly one success, customer session and formal job | development_verified |
| R15-ID-003 | Separate customer/Admin models, cookies and guards | Customer isolation and Admin authorization tests | development_verified |
| R15-SEC-001 | Hashed, single-use 15-minute magic link and clean redirect | Hash/clean-URL E2E plus replay, expiry and concurrent-consume integration tests | development_verified |
| R15-SEC-002 | Neutral verification response and invalid-link disclosure boundary | Eligible, idempotent and cooldown responses share one payload; integration verifies the idempotent and cooldown timing floor | development_verified |
| R15-SEC-003 | Rotating, expiring and revocable customer session isolated from Admin | Rotation plus expired/revoked session 401 and Admin isolation tests | development_verified |
| R15-OWN-001 | `PriceCheck.customerUserId` plus report ownership guard | Owner 200, cross-account 404 and unauthenticated 401 integration tests | development_verified |
| R15-EMAIL-001 | `VERIFY_AND_SIGN_IN` plus conditional terminal notification policy | Mailpit E2E proves one happy-path email | development_verified |
| R15-EMAIL-002 | Authenticated in-page delivery acknowledgement and grace-period decision | E2E forces grace job and proves no second message | development_verified |
| R15-CONSENT-001 | Account disclosure plus separate default-off marketing consent | EN/ZH form plus service-consent requirement and default-off/explicit-opt-in persistence tests | development_verified |
| R15-ABUSE-001 | Idempotency across rough compute, link send, account activation and formal enqueue | Rough/send idempotency plus concurrent activation proving one formal enqueue | development_verified |
| R15-ABUSE-002 | Configurable risk service with allow/challenge/cooldown outcomes | Decision matrix plus signed, expiring development challenge handshake; deterministic mode is forbidden in production | development_verified |
| R15-QUOTA-001 | `UsageLedger`, membership and Benefit Group checks before formal enqueue | Historical 24-hour limiter tests are not the current commercial allowance; use MEM-RISK evidence and recheck the current anonymous-unlock/member paths against the plan contract | implemented_not_verified |
| R15-MOTION-001 | Real-state progress components and reduced-motion path | Desktop/mobile reduced-motion E2E proves no active motion, static canvas and interactive FAQ | development_verified |
| R15-RET-001 | Scheduled cleanup expires unused links, keeps terminal token metadata for 30 days, removes expired anonymous records without formal ownership, removes expired/revoked sessions after 30 days, and removes rate-limit/abuse hashes after 90 days | Time-controlled Worker integration matrix | development_verified |
| R15-AN-001 | Daily aggregate counters with strict event/dimension allowlists; no row-level user/check/session identity or raw URL/query/report content | All 11 event names covered by contract/redaction tests; funnel integration verifies aggregate deltas and stored-value redaction | development_verified |
### Membership System

Authoritative commercial and functional contract: [Membership plans](product/membership-plans.md). Authentication requirements remain in [customer funnel requirements](product/customer-funnel.md); customer routes and page composition remain in [page structure](product/page-structure.md); responsive, state and visual acceptance remain in [visual interaction](product/visual-interaction.md).

The statuses below separate existing implementation from production acceptance. Price Check unlock Magic Links are separate from the member email/password login and do not verify membership authentication. A membership backend, plan card or authenticated check page does not by itself verify the complete customer membership module.

| Requirement | Planned implementation boundary | Required evidence | Current status |
| --- | --- | --- | --- |
| `MEM-AUTH-001`, `R15-AUTH-001` | Independent registration and email/password sign-in with zero pricing side effects | Real browser registration/login plus isolated PostgreSQL proof of Free membership creation with zero `AnonymousCheck`, `PriceCheck`, Job, unit and usage creation | `development_verified` |
| `MEM-AUTH-002`, `R15-AUTH-002` | Bcrypt password storage, neutral invalid credentials, throttling, duplicate protection and return-target validation | Credential/API integration, password-hash inspection, middleware return-target tests, old-password rejection and real password-change browser acceptance | `development_verified` |
| `MEM-AUTH-003`, `R15-AUTH-003` | Customer current-session and all-session sign-out, isolated from membership and Admin | Session API integration plus real browser current-session and settings all-session paths | `development_verified` |
| `MEM-AUTH-004`, `R15-AUTH-004` | Protected-route redirect through password sign-in with allowlisted same-origin `returnTo` | Middleware exact-route/query, open-redirect and EN/ZH locale-continuity tests/browser evidence | `development_verified` |
| `MEM-RISK-001` | Email verification before collection plus Benefit Group identity across account/device/property/payment subjects | Isolated PostgreSQL verifies unverified denial, same-device/same-Property shared Free usage, and shared-IP/different-device separation | `development_verified` |
| `MEM-RISK-002` | Unique Free/promotion claims, serializable retries, concurrent collection/noVNC limits and independent export/API quotas | Three-way concurrent Free claim, idempotent NZ-month export and payment-promotion uniqueness integration | `development_verified` |
| `MEM-RISK-003` | HMAC-only Stripe fingerprint, refund/dispute/Radar cases and member appeal | Synthetic signed-event persistence, payment reuse/refund, customer appeal and Admin review tests pass; production Radar delivery remains external | `implemented_not_verified` |
| `MEM-RISK-004` | Reason-code dashboard, audited allow/deny/release and independent risk retention | Admin API plus privacy-safe aggregate metrics and controlled retention lifecycle pass; production operating exercise remains external | `implemented_not_verified` |
| `MEM-NAV-001` | Session-aware customer navigation plus `DEPLOYED_HIDDEN` public-header/footer/CTA suppression | 历史隔离候选 EN/ZH 桌面/手机主页及移动导航隐藏客户链接；直接路由和未认证边界通过。已登录状态与生产入口仍需验收 | `local_hidden_gate_verified_production_not_accepted` |
| `MEM-PUBLIC-001` | Bilingual membership/pricing and OTA-link/address entry routes deploy but are omitted from public discovery while hidden | 历史隔离候选 EN/ZH 桌面/手机隐藏发现入口、直接页面 HTTP 200；完整可访问性与客户业务流程仍需验收 | `local_hidden_gate_verified_production_not_accepted` |
| `MEM-ACC-001` | Operational account overview with plan, lifecycle, usage, units, horizons, cadence and next action | State matrix for Free/Host/Pro/Portfolio and all subscription lifecycle states | `implemented_not_verified` |
| `MEM-UNIT-001` | Pricing-unit list/detail GET, confirmed-owned-Price-Check POST, activation, deactivation, reactivation and downgrade selection | API integration verifies list/detail/add, stable Property identity, unit limits and transactional cancellation; the dated desktop/mobile browser flow creates the confirmed unit, opens it from the slot list and verifies its detail | `development_verified` |
| `MEM-CHECK-001` | Owner-only filterable history and result detail with mode-aware target or neighbourhood observations and observed-price/recommendation separation | Cross-account, pagination/filter, retention, one-valid-price acceptance and `LISTING_PRICING`/`LOCATION_BENCHMARK` separation pass in integration; the dated desktop/mobile browser flow filters the owner history and reopens the authenticated formal detail | `development_verified` |
| `MEM-CAL-001` | Plan-aware exact daily calendar and separately labelled monitoring extension in `Pacific/Auckland` | NZ-time/domain boundaries, owner-only API, no-fabrication data states and responsive browser QA | `development_verified` |
| `MEM-ALERT-001` | Host core alerts and Pro/Portfolio settings/controls behind entitlement | Entitlement-aware unavailable state has dated browser evidence; production delivery must pass notification acceptance even while discovery is hidden | `implemented_not_verified` |
| `MEM-PORT-001` | Pro/Portfolio view, bulk controls, exports and Portfolio API/webhooks | Export/API enforce membership, entitlement, independent quota and idempotency; production credential/webhook delivery still needs acceptance | `implemented_not_verified` |
| `MEM-BILL-001` | Stripe Checkout/Portal and persisted upgrade/downgrade/cancel/resume/grace reconciliation | Fake-Stripe and isolated PostgreSQL lifecycle pass; dated Sandbox evidence covered the full lifecycle and 37 webhooks. A later hosted Checkout attempt timed out before return, so production deployment acceptance remains open | `implemented_not_verified` |
| `MEM-RET-001` | Plan history, raw evidence, auth, billing, cancellation and deletion retention | Controlled isolated PostgreSQL matrix covers Free 30, Host 183, Pro 365, Portfolio 730 and cancelled 30-day expiry boundaries | `development_verified` |
| `MEM-OPS-001` | Admin customer/membership/billing-event operations, safe reconciliation, session revoke, suspension and deletion support | Isolated PostgreSQL verifies unauthorised denial, audited plan/status corrections, session revoke, export completion evidence and minimised deletion; Stripe-backed manual drift fails closed | `development_verified` |
| `MEM-OBS-001` | Privacy-safe membership, billing, scheduler, queue, lifecycle and plan-economics telemetry | Worker health 与 `/worker/alerts` 返回机器错误码、等级、聚合值和阈值且不含 PII；生产 dashboard、通知路由与注入验收仍是部署门槛 | `implemented_not_verified` |
| `MEM-A11Y-001` | Complete member module in EN/ZH at desktop, 390px and 320px | Automated member-route axe serious/critical, overflow, keyboard and reduced-motion matrix; dated 2026-08-12 candidate result | `development_verified` |
| `MEM-E2E-001` | New Free, returning customer, paid lifecycle and every blocked/gated state | Dated Free fixture and real-provider runs exist; the final client candidate still needs complete live member acceptance, independently of six-OTA backend trials | `implemented_not_verified` |

## 2026-10-07 本地结构优化验证

本轮从 `main` / `4146a415137c50cec66398c61f651e7a0b6b48b5` 开始，
候选包含此前文档整理与文件清理。以下验证绑定重构后的内容指纹；起始提交本身不含重构，
后续提交以 Git 记录核对。这些结果不更新生产验收。
源码/测试/工作区与运行配置的 517 个文件按路径及内容 SHA-256 汇总，内容指纹为
`6efc11c59c3e19c222949832f4a59a67e336e779e4fd368f975dd05b8d6acc2c`；
文档、依赖安装和生成产物不纳入该指纹。
本地 Node 24.18.0、pnpm 11.7.0；独立 `tymra-e2e` 栈使用 PostgreSQL 17、Redis 7.4、
Mailpit 与 fixture Web/API/Worker。普通集成测试使用 `tymra_test`，六 OTA 补验使用仅迁移、
未 seed 的 `tymra_test_contract_offline_test`，新增入口/CI 同命令流程再以
`tymra_test_ci_offline_test` 核对；均为专用测试服务，非日常 `tymra_dev`。

| 验证 | 本次结果与适用范围 |
| --- | --- |
| 模块边界、lint、类型 | 工作区与根脚本检查通过；8 组合法/违规依赖验证覆盖动态引用、间接 server 引用、type-only 与领域边界 |
| 单元 | 根 258 + Worker 483，共 741 通过；5 个真实来源条件测试跳过，不计入通过。含 12 个测试隔离守卫及 82 个精确调度策略用例 |
| 数据库/API/Worker | 普通集成 131 通过；因数据库条件跳过的六 OTA 离线用例，在专用空库补验后 6 通过，共 137。验证两轮追加、重复执行、不可变记录、证据哈希及 ACK |
| 构建 | Web production-shaped build 与 Worker entrypoints 通过；构建使用合成配置并关闭外部服务，未使用发布凭证或部署 |
| 浏览器 | 主流程桌面/手机 28 通过、2 明确跳过；四档方案矩阵 8 通过。覆盖 EN/ZH、320–1280px、权限、最新报告、邮件验证、键盘、reduced motion 和 axe serious/critical 检查 |
| 实际渲染 | 七张桌面/手机首页、页脚、会员 Billing 与后台来源页截图人工核对；无页面脚本错误或 Billing 横向溢出 |
| 提取一致性 | 90 个 Worker 方法、34 个 Job helper/handler 与 47 个 provider adapter/parser 的原业务语法及字符串保持一致；34 个 provider 显式入口实际存在 |

主流程两处跳过分别是手机项目复用桌面已遍历的全部响应式宽度，以及仅桌面使用的后台工作区。
CI 的 verify/browser 及空库 OTA delivery 配置已落地。推送后的实际运行结论在
[GitHub Actions](https://github.com/Harold-C/tymra/actions/workflows/ci.yml?query=branch%3Amain)
按候选提交核对，本表只登记本地验证。真实 provider、Stripe、邮件投递、托管 challenge 和
生产自然调度仍不在本次 fixture 验证范围。

## 仍需显式跟踪的工程缺口

- 每个推送候选仍须核对云端 verify、离线 OTA 和独立 Playwright 的实际结果；配置存在或本地通过不能代替云端执行。
- `RawArtifact` 过期/软删除及 Argus ACK/purge 不等于 Tymra evidence volume 的文件物理清理。
- Tymra 操作员 CAPTCHA/noVNC UI、真实同会话接管、超时和链接失效验收仍待完成。
- 手工导入缺少真实运营导出文件两轮验收；fixture 结果不替代该证据。
- 来源原始分类与标准事件分类仍共用 `category`；分类拆分、事件规模与地域精度有明确缺口。
- 客户生产入口、Stripe live、真实通知投递、托管 challenge、完整当前候选浏览器/无障碍、
  容量与告警演练未验收。旧 Sandbox 或 Free 会员真实流程只能证明当时的候选和运行。
