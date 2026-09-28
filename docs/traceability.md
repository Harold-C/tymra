# Tymra Current Development Traceability

Last updated: 2026-09-28 (production release and bounded source acceptance)

## 2026-09-28 Eventfinda 列表优先与缓慢补齐本地候选

本地 Argus 有头会话读取全国第一页 19 张卡片及 Cricket Camp 一张详情的 3 个日期，
均返回 HTTP 200，无可见登录要求。Tymra 当前本地镜像的一次排队发现写入 20 个
`SourceCrawlTarget`，Argus 结果经证据字节及哈希核验后 ACK/PURGED；首次证据卷
权限错误已在本地卷根目录修复。该轮仅发现，没有详情业务写入。

源码候选将列表观察累积到目标，忽略部分分页缺席的旧日期；新增日期或可见字段
改变时将详情标记为待更新，直到详情成功。详情按列表变化、未曾抓取、到期复查
排序；未到期且列表无变化的已抓详情不访问。全国分页每日从首页加轮换后续页，
候选生产默认每日预算 24 次、发现 5 页、详情 15 个、请求间隔 12–18 秒，
两个计划按日运行。生产来源和计划尚未恢复，以上只是本地代码和配置候选。

Worker 类型检查和 275 项单元测试通过。独立 `tymra_worker_test` 数据库
补齐 33 项正式迁移并执行开发 seed 后，定向集成测试通过：同一列表未变化时
保留原详情复查时间；列表标题变化后保持待抓状态；详情成功后清除该标记。
这仍不等于生产采集验收。

随后一次仅一条详情的本地排队验证访问 Star Trek Laser Tour；Argus 截图显示正常
页面，但 289 场次的抽取 JSON 613,463 字节超过 512 KiB 上限。该轮零详情业务
写入，`CollectionRun` 保留 `PARTIAL`。失败时 Worker 未先登记 Argus 失败证据，
导致 Job 落入 `DEAD_LETTER`；现已从原 Argus 结果恢复两份失败证据，经字节/哈希
核验后 ACK/PURGED，未再次访问来源。Job 的错误类别纠正为
`ARTIFACT_TOO_LARGE`，目标详情延后 30 天；已完成的 CollectionRun 依数据库
不可变规则保留原 `PARTIAL_FAILURE` 错误码，需结合 ArgusExecution 和 Job 核对。
Worker 源码候选现会在失败时先登记证据，并把此类目标延后 30 天，列表出现
新变化时才提前复查。Argus 提取器对完全相同的场次票档改用顶层共享字段；同一
保留 HTML 离线重算 327,642 字节，场次仍为 289 个。上述失败为修复前记录。

随后本地 Argus 切换到 `argus:eventfinda-detail-local-20260928`（镜像
`sha256:d677b1cd6fce2770c44789cf2a7dafa48f0095b1ff3492e521f1909f473f2d24`），
Tymra Worker 切换到 `tymra:eventfinda-detail-local-20260928`（镜像
`sha256:ffbe456c2beb8a1f2e2e965a423964477dbe217f000c7446eaf63d87bc105647`）。
仅将上述 Star Trek 目标在本地置为到期、列表变化优先，然后提交一次尝试、
一条详情的 Job `cmukrlcpp0000k44z0v56c8li`；没有重新扫描列表或批量抓取。
Argus Job `job_922e9eaa48f0a45b017d76e24b3e0fe2` 为 COMPLETED；
CollectionRun `cmukrld3b0001k40o4vru8ygg` 和 Tymra Job 均 SUCCEEDED。
详情含 289 个场次，当前时间窗口内 58 个来源场次写入同一来源 series，
58 个 canonical occurrence links 已读回；目标状态 FETCHED、列表变化标记清除。
HTML 与截图已保存为 `tymra-evidence:`，文件 SHA-256 与数据库一致，Argus
ACK 后结果 GET 为 410/PURGED。独立测试库新增的超限失败证据回归测试通过；
Argus 完整测试 750 通过、105 项需隔离环境的测试跳过，Worker 275 项单元测试通过。
本地另用独立 Profile 打开该详情供 noVNC 观察，返回 HTTP 200；观察浏览器
保持可操作，不执行第二次采集入库。生产来源和计划继续暂停。

## 2026-09-28 本地开发的活动来源日额度

Eventfinda 和 Ticketmaster 在 `NODE_ENV=development` 下不再执行跨轮次每日累计
请求额度检查；生产及其他环境继续执行原有日额度。单次采集页数/详情数、来源锁、
请求间隔、Argus 访问挑战停止和冷却逻辑保持有效。本地预算耗尽而误开熔断的
旧行为已由此消除；下方 20 次用尽及临时增加一次额度的记录是变更前的历史试采。
本地 Worker/API 已重建并切到镜像
`sha256:729329ed057030274c341e4bc3d3baf42a0571ac28cdbf78fcc2193ceb00470f`；
原镜像保留为 `tymra:event-argus-local-before-budget-20260928`
（`sha256:8bc4b1935efc915fe482c1114a0808c758ec3299cc50c884d56028108450bcc1`）。
运行环境仍为 development、`https://api.argus.test`，Scheduler/高频 Scheduler 均关闭。
Worker/API 运行，API health/readiness 均 200，Argus health/readiness 均 200。
Worker 单元测试 274 项、类型检查和隔离数据库的双来源 Argus 模拟集成测试通过；
未为验证新日额度再请求真实来源网站。

## 2026-09-28 Eventfinda / Ticketmaster 本地单页复试

仅在本地开发环境操作，生产配置、来源和计划未改。先将两项来源元数据备份到
`/Users/haroldchen/Development/tymra/runtime/local-parity-20260928/source-cooldown-before-20260928.json`
（权限 0600）。
Eventfinda 本地没有待解除的冷却；Ticketmaster 的一次挑战冷却经明确请求手动清除。

Eventfinda 用 Argus 有头持久 Profile 试采全国列表第一页，Argus Job
`job_298bd5fa96bc23f565c57301bec263bb` 遇访问挑战，终态 `FAILED`；
Tymra CollectionRun `cmukjxtaw0001rx3e845mf0u3` 为 `RATE_LIMITED`，
零个成功页面、零条业务写入。没有进入详情或再次请求。失败结果已 ACK/PURGED。

Ticketmaster 首次入队尝试在访问源站前被本地每日 20 次 HTML 预算拦下；
其错误曾被误归为来源挑战并打开六小时熔断，后续入队重试已停止。
在本次单次开发试采中，临时将预算上限增加 1 次并清除该误触发的本地熔断，
只请求奥克兰列表第一页。Argus Job `job_90a03aad94cc363c4feb4406eb857f61`
终态 `COMPLETED`、ACK/PURGED；Tymra CollectionRun
`cmukjyjv80001rx4fh794rf4f` 为 `SUCCEEDED`，发现 19 张卡片，
本次 31 天窗口接受 2 条完整列表活动，省去 2 次详情请求。该轮为 dry-run，
没有业务写入，不能代替正式持久化或生产验收。

本地源码已将两项来源的“自身每日预算耗尽”改为非重试的
`DAILY_BUDGET_EXHAUSTED`，不再将其计为网站挑战或开启来源熔断。
本地集成回归验证两项来源在预算耗尽时零请求、来源元数据不变。

## 2026-09-28 Eventfinda / Ticketmaster Argus 有头采集本地候选

本地候选把两项来源的列表和详情都交给现有 Argus 固定 Connector，使用有头
浏览器与各自持久 Profile；Tymra 继续执行原有来源限速、预算、冷却、前沿去重、
业务持久化及证据复制后 ACK。直接 HTML 读取只保留为注入式测试 fixture。
Eventfinda 的 HTTP 202 中间响应按访问限制停止，空列表拒绝解析；非排队 Job
的业务写入被拒绝，避免在持久化前 ACK。生产来源与定期计划未改动。

本地 Worker/API 候选镜像 `tymra:event-argus-local-20260928`
（`sha256:8bc4b1935efc915fe482c1114a0808c758ec3299cc50c884d56028108450bcc1`）
仍连接 `https://api.argus.test`，`NODE_ENV=development`、live provider、
fixture 关闭、Scheduler 关闭。共享本地 Argus 容器沿用原镜像，新增的 HTTP 202
分类尚未在该运行容器验证。真实 Eventfinda 单页 dry-run 的
Argus Job `job_44fb8208630a61fa9cbf930fd4da1a24` 遇访问挑战，终态 `FAILED`
且分类 `ACCESS_CHALLENGE`；Tymra 停止该轮，没有业务写入。该失败交付的两份
证据逐字节与 SHA-256 核对后，已由受保护客户端执行一次清理 ACK，结果复读
410；新候选的自动失败清理路径随后通过隔离集成测试。没有重复请求源站。
Ticketmaster 的既有本地熔断截止时间为 `2026-09-28T03:48:33.996Z`，本轮
不提前进行真实试采。隔离数据库的 Argus 模拟服务验证两项列表均走正确
Connector、成功 dry-run 的证据/ACK/410，以及 Eventfinda 挑战后的 ACK。
本地页面可达与模拟集成不等于两项生产两轮门槛通过。

## 2026-09-28 本地生产镜像对照试采（前一快照）

本地 Worker/API 已切到从生产主机只读导入的 Tymra 镜像，代码 revision
`4eed026f6219054199119889a46d7122caece91b`，与生产镜像的 20 个文件层一致；
本地 Docker 导入后的镜像 ID 为
`sha256:5b3dbb1dc69e2fde4d39eced5693c9dba673ccafb1bd27a47c95117f196383e6`。
本地数据库先备份再应用第 33 项正式迁移；备份及无密钥的 Compose 覆盖文件位于
`/Users/haroldchen/Development/tymra/runtime/local-parity-20260928/`，数据库备份
SHA-256 为 `ffbb9f9d5e55e0fe8e95c9cc9b3d8d28f34cb68dabbd9382b03e9f95025e8ba0`。
本地仍使用 `https://api.argus.test`，`NODE_ENV=development` 以保留
`--local-acceptance` 保护，live provider、fixture 关闭、Scheduler 关闭；Web 和
共享 Argus 本地容器未切换。API readiness 200，数据库、Redis、Argus 均健康。

生产镜像的本地有界 dry-run：`eventfinda` 发现阶段扫描一页、解析 20 张卡片；
随后完整阶段再扫描一页、读取一条详情，解析 3 个活动日期，2 次请求、无失败。
两个 CollectionRun 均为 `SUCCEEDED`；没有新增该来源业务活动，也没有关联这
两轮的活动 occurrence。`ticketmaster` 的正式采集入口因本地既有熔断冷却期
（至 2026-09-28T03:48:33.996Z）返回 `RATE_LIMITED`；本轮请求数为 0，
未访问详情或 Argus。它的轻量 source health 同时返回 HTTP 200，说明网页可达
与允许采集是两个不同状态。本次不绕过冷却，也不恢复生产计划。本地与生产的
网络出口、Argus origin、数据库内容和运行开关仍有意隔离；这些本地结果不构成
`eventfinda` 或 `ticketmaster` 的生产两轮验收。

## 2026-09-28 生产发布与五个暂停来源复验（当前状态）

Tymra `main` 提交 `4eed026f6219054199119889a46d7122caece91b` 已推送，CI
`36354345154` 通过。Worker/API/Scheduler 运行同一镜像
`tymra:public-office-20260928-v2`，镜像 ID
`sha256:37d413d0908d8256b28d4ef4f814e51057017c79ae4e0fda6273dad40e8607cb`，
revision 标签与提交一致；Web、PostgreSQL、Redis 未重建，33 个现有迁移未变化。
Argus Mac mini browser 运行 `argus-release-20260928-1`，代码提交
`5647271d785d0878bd417025ff4a2bdedd5c6b65`，本机镜像 ID
`sha256:de21e5db3674a9c3fd42a18b0265acb8719e44c1686a095cbe89c412756acfed`；
只重建 browser，PostgreSQL 和 tunnel 未重建。两端容器均健康、重启次数为零。
生产 Tymra Worker 用现有受保护凭证读取 Argus health、readiness、OpenAPI 均得
200，查询不存在的 Job 得 404；凭证未进入代码或发布记录。

正式 Tymra 单次尝试 Job 的两轮门槛与来源状态：

| 来源 | 复验结果 | 业务与证据 | 最终状态 |
| --- | --- | --- | --- |
| `auckland_airport_monthly` | 两次成功 | 2 条生产信号；6 份持久证据校验；2 个 Argus 结果 ACK 后 410/PURGED | 周一 17:00 NZT 每周计划已启用 |
| `christchurch_council_events` | 两次成功 | 2 条生产活动；4 份持久证据校验；2 个 Argus 结果 ACK 后 410/PURGED | 周一 17:00 NZT 每周计划已启用 |
| `mot_airline_performance` | 两次成功 | 2 条生产信号；6 份持久证据校验；2 个 Argus 结果 ACK 后 410/PURGED | 周一 17:00 NZT 每周计划已启用 |
| `eventfinda` | 首轮失败：源站 HTTP 202，`RATE_LIMITED` | 未通过新的两轮门槛 | 暂停，无定期计划 |
| `ticketmaster` | 首轮失败：源站 HTTP 403，`RATE_LIMITED` | 未通过新的两轮门槛 | 暂停，无定期计划 |

成功来源的启用命令重新读取本地证据文件并比对 SHA-256，要求每轮业务结果、
已复制证据和 Argus 结果 410；第二轮没有新增重复业务行。Argus 数据库中本轮
6 个 `tymra-prod` 交付状态均为 `PURGED`。最终 Tymra 活动 Job 为零，Argus
无非终态 Job。现有 72 条计划加新启用 3 条，共 75 条；全部下次运行时间非空，
按 `Pacific/Auckland` 换算，没有一条落在工作日 09:00–17:00。Scheduler 保持启用，
高频 Scheduler、新 Check、内部按需仍关闭；客户、支付、SMTP、会员未随本次发布启用。

Tymra 发布前备份位于 `/srv/apps/tymra/backups/public-office-20260928-predeploy/`：
受保护配置、Compose、PostgreSQL dump 和证据归档的四项 SHA-256 通过；数据库
隔离恢复读回 78 个来源、72 个计划和 192 个 Job。Argus 加密备份、隔离恢复与
旧镜像回滚材料见 Argus `docs/current-state.md`。下一自然周期仍须观察新三项
来源的稳定性、预算和增量去重；HTTP 202/403 来源不得自动重试或开启。

## 2026-09-28 生产定期采集时间保护候选（发布前快照）

生产 Scheduler 过去仅按固定毫秒间隔续期，新的来源计划也从启用时立即到期，
没有持久的工作日办公时段保护。本地候选按 `Pacific/Auckland` 把工作日
09:00–17:00 到期的自动计划顺延到当天 17:00；生产启用计划时也使用同一规则。
周末和工作日非办公时段照常运行。它只约束自动计划，不改变人工有界验收。
本候选需随 Worker/API/Scheduler 同镜像发布，生产日程读回与首次周期观察仍未完成。

## 2026-09-28 Eventfinda / Ticketmaster 本地修复与 MOT 复核（发布前快照）

Eventfinda 首轮曾收到 HTTP 202，旧直接 HTTP 路径把所有 2xx 都视为成功，
空列表也会形成零业务记录的成功采集。本地修复仅接受 HTTP 200，拒绝空列表；
202 会停止该轮并进入现有保护性冷却。一次受限本地读取的当前首页为 HTTP 200，
解析出 20 张卡片、249 页；一张详情页为 HTTP 200，解析出 3 个日期。

Ticketmaster 首轮的 HTTP 403 旧路径标成解析失败。本地修复将 403 归入
现有访问限制熔断，不重试或继续城市批次；429 同样处理。一次受限本地读取的
Auckland 城市页为 HTTP 200，解析出 19 条活动，其中 17 条落在未来 31 天。
本轮没有访问 Ticketmaster 账号或详情页，也没有验证业务持久化。

MOT 沿用已发布的 v9 工作簿路径：历史上已有一次完整生产成功，第二次独立成功仍
缺失。本轮本地 Argus 工作簿浏览器回归两项通过，没有发现支持再次改写下载路径的
新证据。三项均未重新开启生产来源或计划；Tymra 候选尚未部署，
`argus.test` 配置未变。后续各自仍须正式生产 Job 的业务写入、证据与 ACK/PURGED
及原定两次独立成功门槛，才可恢复定期采集。

## 2026-09-28 Christchurch Council 本地修复候选（发布前快照）

`christchurch_council_events` 的直接 HTTP 路径在生产拿到 Incapsula 中间页。
本地候选改由 Argus 的 `christchurch-council-events/collect_events` 固定有头
Profile 读取官方 What's On，最多三页；Tymra 仍使用原有日期、活动身份和
去重规则，且直接 HTTP adapter 现会拒绝采集。新旧来源配置元数据在正式
发布时需单项核对并更新，不能运行通用 seed。

本地真实 Argus Connector 一次成功取得三页、44 张卡片和两份证据；Tymra 对
同一快照的离线解析返回两条有界活动，外部 ID 保持 `ccc-whats-on:*` 格式。
Argus 提交 `5647271` 已推送，常规 CI 通过；Tymra 全量单元、隔离集成、类型检查及构建通过。生产镜像、数据库、Schedule、
Scheduler 和 `argus.test` 均未改变；该渠道继续暂停。正式 Tymra Job 的
业务写入、证据哈希、ACK/PURGED 与两次独立成功门槛尚未通过。

## 2026-09-27 v9 MOT workbook repair (previous snapshot)

Argus production now runs pushed commit `e71d10a2d934d3a257f53bd7d541c808199cb1c0`
(`argus-release-20260927-9`), registry digest
`sha256:c797fd15b60e2af56ceabf5bd1acdb7de33de7447990875525a566f6e63b8619`,
loaded Mac mini browser image
`sha256:55b78266418bc2fde833880451a944b6d04ac0d09acc9006a593711ac962f4ed`.
The exact-link browser request path is limited to MOT; the download-manager path for
other workbooks has not changed. Tymra Worker/API/Scheduler remain on
`tymra:public-final-repair-20260927-v2`; there was no Tymra image rebuild,
migration, seed, or environment change. Its pretrial protected configuration,
Compose, PostgreSQL dump and evidence archive are at
`/srv/apps/tymra/backups/public-mot-route-20260927-pretrial/`; four checksums,
dump listing and archive listing passed. An isolated Tymra restore was not done.
The Argus encrypted, isolated-restore-verified backup and v7 rollback image are
recorded in Argus `docs/current-state.md`.

One formally enqueued MOT trial used Tymra Job `cmujo3nf20000qrvznc9vgfq8`,
CollectionRun `cmujo3o8o014hqr07njdn4e6h`, and Argus Job
`job_553e1d474ad00222967bbcd383be823a`. Both Jobs succeeded on one attempt;
the run saved two production signals, with two unique external IDs and no duplicate
business row. Three evidence files were retained in `/argus-evidence`: HTML 329,312
bytes, screenshot 493,949 bytes and XLSX download 29,194 bytes. Each file's size and
SHA-256 matched the Argus pointer and Tymra artifact metadata. After Tymra ACK,
Argus delivery is `PURGED` / `ACKNOWLEDGED`; authenticated production Worker reads
returned result 410 and three evidence 404. The `tymra-prod` Argus queue and Tymra
pending/running queue were empty at final readback.

MOT was explicitly returned to `SUSPENDED`, `enabled=false`, and has no schedule.
The existing 72 enabled schedules are unchanged. This is the first successful
production pass; a second independent pass and the same persistence/evidence/ACK
checks remain required before enabling its weekly schedule. Auckland Airport and
the other deferred sources were not tested or enabled by this repair. Details are
in [`evidence/public-suspended-repair-production-2026-09-27.md`](./evidence/public-suspended-repair-production-2026-09-27.md).

## 2026-09-27 v7 official-workbook diagnostic (previous snapshot)

Argus production already runs pushed commit `0d03bd10f874a4f8a38976a7af8687187cc03340`
(`argus-release-20260927-7`), loaded Mac mini image
`sha256:eb475cf65b0bc70756321c8806fe89a57405a3b288acd14d754174b17c49e23e`.
It includes the v6 fixed-code workbook diagnostic; replacing it with v6 would be a downgrade.
Browser health is `healthy`, restart count zero and active Argus Jobs zero at readback.
Tymra Worker/API/Scheduler still run `tymra:public-final-repair-20260927-v2`; no Tymra
image, migration or production environment setting changed in this follow-up.

One formally enqueued MOT trial used Tymra Job `cmujkgqvc0000qrpzyk01tnm7`,
CollectionRun `cmujkgrkm0023qr07uk3lcvw9` and Argus Job
`job_0a77c80501f89fe4df6ced910af83cab`. The only attempt ended
`DEAD_LETTER` / `SOURCE_UNAVAILABLE`; Argus reported `WORKBOOK_DOWNLOAD_FAILED`.
Its fixed safe observations were `response_body_unreadable` and
`browser_download_failed`: Chromium emitted a download event, but that download failed
and the matching response body was unreadable. The underlying browser failure reason
is not yet known. No new business signals were written; the prior two remain.
Tymra copied two page evidence files (HTML 329,474 bytes, screenshot 132,714 bytes)
to its persistent evidence volume and their SHA-256 and sizes matched stored metadata.
The result was ACKed; Argus now reports `PURGED` / `ACKNOWLEDGED`, result GET returns
410, and both remote evidence GETs return 404. MOT automatically returned to
`SUSPENDED`, `enabled=false`, with no schedule. Tymra has zero pending/running Jobs
and retains 72 enabled schedules. The other four deferred sources remain closed.
The protected pretrial Tymra config, Compose, database dump and evidence archive are
at `/srv/apps/tymra/backups/public-workbook-diagnostic-20260927-pretrial/` with
checksums and archive listings verified; no isolated restore was attempted.
Argus v7's quiescent encrypted backup and previous browser image are recorded in
Argus `docs/current-state.md`. Do not retry the source or enable MOT until a specific
download repair is validated, followed by two independent successful production passes.

## 2026-09-27 official-workbook follow-up (previous snapshot)

Argus browser now runs pushed commit `bbc9aa85368eab2658f4a47a62f6a88f3db170cf`
(`argus-release-20260927-5`), loaded image
`sha256:ea07b77fc60bd17aa31e3dff99734c852d05490f04dc812088449ee88f17bb29`.
The browser is healthy with zero restarts. Tymra Worker/API/Scheduler remain on the v2
image recorded below; no Tymra migration, seed, image switch or new schedule occurred.
From the production Worker, Argus health/readiness/OpenAPI returned 200, a nonexistent
Job returned authenticated 404, and account/runtime routes returned 403.

One bounded production trial each for `auckland_airport_monthly` and
`mot_airline_performance` failed at Argus `WORKBOOK_DOWNLOAD_FAILED` after the official
HTML and workbook link were captured. Both used one Tymra attempt and are still disabled
with no schedule; neither wrote a business result. Two page evidence files per Job were
copied and passed SHA-256 readback, both failed results were ACKed and then returned 410,
and Argus delivery is `PURGED`/`ACKNOWLEDGED`. The failure detail distinguishes the
download stage but not whether the response body, browser download or filesystem read
failed. No further source retry or browser restart followed these failures. Current
Tymra queue is empty, 72 schedules remain enabled and the five deferred sources have
`enabled=false`; this operational pause does not mean every `DataSource.status` enum
equals `SUSPENDED`. At the latest Argus check, one unrelated `synix-prod` Job was
running; it was left untouched. Exact Jobs and recovery evidence are recorded in the
linked production evidence report.

The safe-stage diagnostic follow-up is pushed as Argus commit
`28a1b863ba4e1bb32507663e2c2eaff251a6c81f`; its fixed-image CI and private export
passed, and its image was verified and imported on the Mac mini. Repeated `synix-prod`
Jobs prevented the required idle cutover. The protected release configuration was
restored to v5 and the browser was not restarted, so the diagnostic code is **not live**.
No new Tymra canary ran after the two failures above.

## 2026-09-27 collection snapshot before the workbook follow-up

Tymra Worker/API/Scheduler run pushed commit `a373bb19259652e195abc3e3376218f0bcbc755e`
as `tymra:public-final-repair-20260927-v2`, image
`sha256:d959251eda82062048f76dd6b581cd28d8bdcd7c61dd33e074c6346883b7a3a8`.
Argus production browser previously ran pushed commit `d1211ea4d96d1f537ad7c81349f8acbb0e020de0`
as `argus-release-20260927-4`. Health/readiness/OpenAPI, authenticated Job 404,
account/runtime 403, Tymra API readiness and retained evidence hashes passed. No Tymra
migration or seed ran. That snapshot found 72 enabled public-source schedules, five
disabled sources, zero pending/running Tymra Jobs and zero active Argus tasks.
The next-run and one-year interval projection found no weekday 09:00–17:00 NZ execution;
the Scheduler remains interval-based, so this is not a permanent timezone policy.

Of the original 25 suspended sources, 20 passed bounded production trials and have
weekly schedules. The latest are `christchurch_sports` (two deduplicated hosted events)
and `metservice` (verified unchanged or unmapped CAP feed without invented market rows).
Five remain disabled: `auckland_airport_monthly`, `mot_airline_performance`,
`christchurch_council_events`, `eventfinda`, `ticketmaster`. Auckland Airport and MOT
still show intermittent official-workbook download failures, despite the new Argus
browser download handling; both auto-paused. Council returned an access interstitial.
Exact release images, tests, bounded Job outcomes, ACK/PURGED evidence, known limits,
office-hour timing and protected recovery materials are in
[`evidence/public-suspended-repair-production-2026-09-27.md`](./evidence/public-suspended-repair-production-2026-09-27.md).
The following section is a historical pre-release candidate record, not current runtime.

## 2026-09-27 suspended-source repair candidate — historical pre-release record

The production rollout below is unchanged. A local candidate now repairs the moved Ministry of
Education school-holiday route and multi-year parser; the Christchurch Airport December rollover
and latest-month pilot range; the Manawatū events route; the Auckland Live response-size limit;
and the short first-round windows or request ceilings for Ara, Christchurch Council events,
Christchurch sports, Taranaki events, Venues Ōtautahi and MetService. Canterbury A&P Show now
uses the organiser's explicit 2026 public-opening days from its terms alongside the homepage's
published attendance estimate, with two requests and separate date provenance. LINZ reference
results and a verified quiet or unchanged MetService feed have source-specific zero-business gates
instead of invented demand rows.
The Christchurch Council pilot now passes its three-page ceiling through to the paginated adapter
instead of overriding it to one request; a bounded local check returned two in-window events on
the first page. Taranaki's 90-day, one-request check also returned two in-window events. The Worker
now fails a production canary before persistence if an adapter reports more requests than its
source-specific ceiling. Targeted pilot tests and Worker typecheck passed; production is unchanged.
The Canterbury annual-events candidate needs three requests when the Show homepage requires its
terms page for dates: Show homepage, Show terms, and Christchurch Marathon. Its local pilot now
counts visited references and refuses schedule activation unless both official event pages were
visited within that three-request ceiling in each of two new passes. A targeted unit test and a
transactional integration test on a freshly migrated disposable database passed; the database
was removed. A one-request local read of the official Marathon page parsed successfully and
returned no event inside the current 90-day window; that is different from a source failure.
This gate has not been exercised in production.

Guarded retest paths now support already-suspended direct and Argus pilot sources. The previously
failed Waikato/AUT recovery attempts cannot count as two independent one-attempt passes. The
existing `council_calendars` row can move from its untouched direct-pilot metadata to the browser
pilot only when it has no CollectionRun; its listing plus at most two details use a three-request
cap. All candidates require new production passes and the existing evidence, ACK, hash, duplicate
and schedule gates before enablement. The local provider adapter suite passed 73 tests with five
skips, the Worker suite passed 253 tests, the pilot activation suite passed four tests against a
freshly migrated and seeded disposable PostgreSQL database, provider and Worker type checks passed, and a
two-request live read-only Show probe returned one 2026 event with official date and attendance
provenance. No candidate has been built or deployed.

A further bounded local read-only check of the candidate adapters returned one in-window
Auckland Live event from a 4,463,675-byte page under its source-specific 6 MB cap, one Ministry
school-holiday signal, two Manawatū events, one Ara academic signal, and two Christchurch Airport
monthly signals. The cruise adapter, after its weekday/date validation change, fetched its official
schedule in two requests and returned 17 in-window calls: 14 Lyttelton and three Akaroa. These
checks did not create production Jobs or records and do not count toward either required production
pass.

`ski_seasons_nz` remains paused: the current The Remarkables and Mt Hutt pages return HTTP 403 to
the Tymra direct client, so visiting only Whakapapa would understate the three-resort source.
The local candidate now points The Remarkables to its current official
[mountain information page](https://www.theremarkables.co.nz/mountain-info), whose 2026 season
dates are explicit; its former `/plan` target was stale. The official
[Mt Hutt mountain page](https://www.mthutt.co.nz/mountain-info) currently states 27 June–11 October
2026, while the earlier [NZSki media kit](https://www.nzski.com/media/6823/2026-winter-media-kit-mt-hutt.pdf)
labels 12 June a *targeted* opening. The media kit is not a safe substitute for the current
page. This URL correction passed the targeted provider test and typecheck locally, but the 403
and complete three-resort production acceptance remain unresolved. The local candidate now uses
Argus browser-only jobs against three fixed official pages, one per resort, with a versioned
season-date result contract. The Tymra worker requires three distinct hashed business artifacts,
three persisted season signals, copied local evidence and ACK/PURGED for all three jobs in each
of two independent production passes before it may create a weekly schedule. Targeted synthetic
extractor, pilot-gate and client-contract tests, all 235 root unit tests, all 257 Worker unit
tests, and 119 integration tests on a freshly migrated and seeded disposable PostgreSQL 17
database pass. Lint, workspace typechecks and Web/Worker local builds pass. The Web build still
prints existing optional LinkeDOM canvas and missing build-time environment warnings while
exiting successfully. No new production image or source pass exists yet.
`christchurch_cruise` remains paused because the ChristchurchNZ Power BI page still exposes the
2025/26 report. The local candidate now discovers the current published Google CSV from the
[New Zealand Cruise Association schedule page](https://newzealandcruiseassociation.com/schedules/)
instead. That official page warns that arrival and departure times are indicative. A bounded
two-request local read of the 2026/27 season parsed 66 unique calls: 58 labelled `Christchurch`
and eight `Akaroa`; the first 90-day production-pilot window contains 14 and three respectively.
The source-specific mapping treats `Christchurch` as Lyttelton, consistent with the
[ChristchurchNZ two-port description](https://www.christchurchnz.com/visit/plan-your-visit/cruise)
and the separate [Lyttelton Port public schedule](https://portcontrol.lpc.co.nz/), which displayed
58 calls. Two full-season rows have no published time and are retained with date-only precision,
not invented 08:00 arrivals. The candidate uses a 90-day, two-request, 100-record cap and fails
on malformed rows or overflow. A guarded retest updates only the suspended legacy Power BI source
with no accepted business history; activation requires persisted calls from both ports and hashed
local artifacts for both ports in each of two bounded passes. Targeted parser/provider and Worker tests,
both typechecks, and two transactional guard tests in a migrated disposable PostgreSQL database
passed. The new source has not yet been deployed or accepted through Tymra production. The earlier
Lyttelton Port `GetDataX` route remains unimplemented; no browser session stamp was copied into
code. `school_sport_canterbury`
remains paused because the sampled public Teamup calendar's 13 items contain no published locations,
so Canterbury hosting cannot be inferred. The earlier local cross-service acceptance explicitly
retained 13 raw records while promoting zero unresolved events. The local release gate now recognises
only two independent, one-attempt Argus passes whose strict School Sport Canterbury schema contains
in-window raw occurrences with no published location and no business rows; copied evidence hashes
and ACK/PURGED checks remain mandatory. It has not been retested or enabled in production.
The first-round RBNZ and MOT `PARSING_ERROR` cases now have exact local reproductions from the
production-retained evidence. The RBNZ HTML (1,105,569 bytes; SHA-256 verified against its
`RawArtifact`) uses `Sept` in the dated table headers; the old Argus parser accepted only
three-letter month names. Its local candidate extracts all seven rates for 2026-09-25 from the
same page. The MOT download (29,194 bytes; SHA-256 verified) is a valid July 2026 workbook,
not an HTML/challenge response. The old parser rejected five real port names missing from its
fixed IATA map: Chatham Islands (Tuuta), Paraparaumu, Picton, Whanganui and Whitianga. After
checking the [published airport-code list](https://smartpay.gsa.gov/files/master-contract/SP3_Attachment_18_International_Airport_Codes.pdf)
and [Whanganui code in an NZ airport movement report](https://www.whakatane.govt.nz/sites/www.whakatane.govt.nz/files/2024-12/appendix_2-20230411_whk_schedule_movements_final_report_apr_2023_updated_11apr.pdf),
adding only those mappings makes the local candidate extract 164 route aggregates from the
same workbook. Synthetic regression fixtures, 29 targeted Argus tests and typecheck passed.
No RBNZ or MOT candidate has been released or revalidated through Tymra production. The current
[MOT page](https://www.transport.govt.nz/area-of-interest/air-transport/airline-on-time-performance)
labels older data XLS, but its March and July 2026 download links actually end in `.xlsx`;
the `.xlsx` selector was not the failure. The
[Tākina listing](https://www.takina.co.nz/visit/whats-on) links to detail pages without listing
dates. A bounded local Argus candidate now captures at most two same-origin details as evidence,
parses their explicit cross-month date ranges and excludes the Wellington-wide Bee trail from the
fixed Tākina venue. A local live three-page read-only probe returned one hosted LEGO exhibition
with 2026-06-27–2026-10-26 dates; targeted tests and typecheck passed. This has not been released
to Argus production or retested through Tymra production.
Palmerston North Airport's embedded public feed responded locally with HTTP 200 and 14,697 bytes;
the current Argus parser produced 24 flights with complete quality in a bounded 72-hour local
window. A single read-only fetch from the running Argus production container also returned HTTP
200 and 14,697 bytes. The stored production Argus Job reports only `INTERNAL_ERROR`, with no
retained parser artifact or current matching container log, so the exact runtime cause remains
unknown; neither feed availability nor the current parser reproduces the failure. A fresh local
Patchright page-plus-embedded-feed probe also returned HTTP 200 for both requests, 14,113 feed
bytes and 23 complete-quality flights in a 48-hour window. This narrows the failure to the
production execution path or a transient condition but does not prove which; no repeat
production source visit was made for this diagnosis.
A single full local Argus Connector execution in an isolated container, with disposable Profile
and evidence tmpfs, then succeeded for Palmerston North: 21 flights, `complete` quality, no
Connector error. The same bounded isolation succeeded for Auckland Airport monthly with 24
records and no Connector error. The temporary container data was discarded on exit and the
running development and production services were unchanged. The relevant Argus capture and
extractor files have no committed diff between production revision
`7df378fda31453dc6da724fb9fd7892cdfe99abf` and current `HEAD`; the local image is an
earlier development build, so these successes narrow but do not establish the production failure
cause. Each source still needs a new one-attempt production pass through Tymra after release;
do not retry either source repeatedly or mark it healthy from this local result alone.
Read-only production inspection through the host's dedicated SSH key confirmed that Tymra still
runs `tymra:public-final-two-20260927-v4` for Worker/API/Scheduler. The saved Palmerston North and
second Auckland Airport `ArgusExecution` rows are `FAILED`; Tymra's parent Jobs and CollectionRuns
record only `SOURCE_UNAVAILABLE`, without a retained detailed Argus error. Authenticated Argus
GETs for both Job summaries return `FAILED`, while both result GETs return 410. Tymra's protected
saved result retains an item-level `INTERNAL_ERROR` and a generic message, without a detailed
cause; the remote result is unavailable. No source request or production mutation was made during
this inspection. A fresh one-attempt Tymra production trial is needed
after the unified release, with failure telemetry retained before result cleanup.
Tymra's local orchestrator candidate now records the matching Argus item error category when a
failed Job has no top-level error, which is the shape retained for both airport failures. It accepts
only a bounded uppercase category code and does not copy the item's free-text message into the
indexed execution error field. The focused orchestrator suite passed 22 tests and Worker typecheck
passed; this telemetry correction has not been deployed.
Auckland Airport
monthly needs two fresh one-attempt Argus passes after its first successful and second failed passes.
Eventfinda and Ticketmaster are outside this repair candidate.

## 2026-09-27 public-source production rollout — current state

Production Worker/API/Scheduler run pushed commit `5011694516ac49ba8384d05cf143190635ff8ad7`,
release `/srv/apps/tymra/releases/public-final-two-20260927-v4/`, image
`tymra:public-final-two-20260927-v4` at
`sha256:f15af42b4365fcdd4c7d596a41f98aa61b73de5f22d251eba4f57b5cdabd30f3`.
The Admin-only Web remains on its previous image. All 33 migrations are complete; this rollout
needed no migration or seed. Worker health/readiness are HTTP 200. The alerts endpoint is HTTP
200 with `FAILED_JOBS_PRESENT` from the intentionally retained failed trials; the Job queue has
no pending or running work.

All 78 registered, non-demo, production PUBLIC sources were considered through a bounded first
round. 52 source schedules are enabled: the five existing schedules and 47 weekly pilot schedules.
Another enabled source is the restricted Lincoln acceptance source, which has no schedule. The
other 25 sources are suspended with no enabled schedule after failing their source-specific gate.
This is limited pilot collection, not proof of full-year, complete-page or nationwide coverage.
The Argus-backed accepted sources have persisted business rows and copied evidence. The two
completed Waikato/AUT Argus results left by premature source suspension were recovered using
their original Tymra Jobs and persisted Argus executions, without new Argus submission or source
visit. Each wrote two business events; their four evidence bytes/hashes matched Argus metadata.
Tymra ACKed both; the results return 410 and all four remote evidence URLs return 404. Waikato
and AUT remain suspended, since this recovery is not a two-pass pilot acceptance. Across all
61 Argus executions, 59 results had already returned 410 before recovery and the remaining two
now return 410. Tymra retains 128 local evidence artifact references and no live remote evidence
references.

Scheduler is enabled only for the 52 bounded schedules. The high-frequency scheduler, new
Checks, internal on-demand, customer/public registration, Stripe, SMTP and membership launch
remain disabled; `ops.tymra.nz` stays Admin-only. The precise source outcomes, retained failures,
backup checksums and recovery path are in
[`evidence/public-source-production-rollout-2026-09-27.md`](./evidence/public-source-production-rollout-2026-09-27.md).
The 2026-09-26 sections below are dated history, not the current runtime state.

## 2026-09-26 production SSH recovery and second-cycle safety stop

SSH to `spm-prod-01` as `spmadmin` is working again. The production Worker, API and Scheduler
still run `tymra:christchurchnz-incremental-20260925-v1` at image digest
`sha256:b5b125888ae27314ba98e4d60e71cf049107b8b65a09d32e652a5ee4b09663ca`;
all three and PostgreSQL/Redis are healthy. The queue has no pending or failed work, and all
15 Jobs are `SUCCEEDED`. Production Argus health/readiness returned 200. No image or credential
was changed in this review.

The 2026-09-26 UTC scheduled GeoNet and ChristchurchNZ Jobs both succeeded within their request
budgets. ChristchurchNZ Job `cmuhzfrx80002mu07b3xvsyqz` made 15 requests and retained 175
parsed artifacts; GeoNet Job `cmuhwo1ij0001mu07rzk6800c` made two requests and retained 16.
The latest scheduled-run artifact byte hashes verified 215/215 across all five sources. The
second-cycle review remains incomplete because the other three sources next run on 2026-10-02.
The read-only snapshot evaluator's handling of PostgreSQL UTC timestamps without offsets was
corrected; its result is `WAITING`, not the earlier false same-day failure.

ChristchurchNZ's official `event_sessions[].id` changed for the same event and start time on
the next day. The existing Worker treated these as new source occurrences: 272 groups now share
one source event and canonical occurrence key, versus 12 in the prior baseline. Canonical links
remain present and consistent, but source history grew incorrectly. After a verified full
PostgreSQL dump at
`/srv/apps/tymra/backups/christchurchnz-identity-20260926-57LGE4/` (SHA-256
`96a291f30595eab31013757081502a05ad794abb7560db3232ddb2557214856e`), only
`first-christchurchnz-daily` was disabled with an audit reason. Its next run is unset; the other
four exact schedules remain enabled. Scheduler stays running for those four. No source-site
request or new Job was made to investigate or pause this source.

The local candidate derives ChristchurchNZ occurrence IDs from event identity and exact start
time, excludes the volatile session object from normalized metadata, and adopts a matching
legacy row on the first upgraded pass. It prevents another new source row; it does not erase the
existing 272 historical duplicates. Provider tests, a real PostgreSQL integration regression,
the second-cycle evaluator tests, and full `pnpm verify` passed against a separate disposable
database (112 integration tests). This candidate has not been deployed. Before restoring the
paused schedule, verify a bounded production pass leaves source occurrence and canonical counts
stable, then decide whether to repair historical duplicates in a separately guarded operation.

## 2026-09-26 Argus delivery hardening candidate on main

The retained `argus-compatibility` source snapshot was compared with the current `main` tree. Its
useful, previously missing guards were adapted to the current Argus client and orchestration path:
verify the received Job result SHA-256 and identity before JSONB persistence; reject a mismatched
or cancelled capture instead of mapping the first item; verify and sync actual local evidence bytes
before database reference changes and ACK, including on retry. Current production source scheduling,
manual handoff origin restrictions and newer schema are unchanged.

In an isolated disposable PostgreSQL 17/Redis test environment, all 33 migrations and test seed
completed. `pnpm verify` passed lint, workspace type checks, 232 root unit tests with five skips,
246 Worker unit tests, 111 PostgreSQL integration tests and Web/Worker builds. The targeted Worker
suites covered tampered/wrong-identity results, strict OTA data markers, filesystem sync and rename
faults, missing/corrupt retry evidence, and database disconnect/recovery without Argus resubmission.
The Web build emitted its existing optional `canvas` warning and missing production-config messages
while exiting successfully; this is not a configured production image build.

No new Argus Job, source-site request, migration or production deployment was performed. A future
release must verify the exact candidate against the current Argus wire result and target evidence
volume, including directory-sync behavior and restart recovery. `retentionCleanup` still soft-deletes
expired `RawArtifact` records without removing copied files or trimming persisted
`ArgusExecution.result`; physical raw-data expiry remains a separate open gate.

## 2026-09-25 isolated full-gate preparation; no production release

The five-source second-cycle gate now has a separate immutable
[read-only baseline and review procedure](./evidence/first-five-cycle-review-preparation-2026-09-25.md).
Its baseline query ran inside a read-only PostgreSQL transaction: exactly five enabled schedules,
zero active/failed Jobs, 12 intentional ChristchurchNZ canonical merge groups with zero unlinked
or divergent links, and 74/74 retained scheduled-run artifact hashes matched. The evaluator's
five local scenarios pass and report `WAITING` against the baseline itself. The next daily and
weekly Jobs have not yet occurred; this is preparation, not second-cycle acceptance.

The isolated candidate based on `7e6b08fb74e39a12f9432a3b346da493e4775e17` passed
`pnpm verify`: lint and all package type checks, 232 Web/domain/provider unit tests plus five
skips, 153 Worker unit tests, 110 isolated PostgreSQL integration tests and both builds.
The previously recorded six Web type errors no longer reproduce. An isolated candidate Web
server passed the new hidden-discovery browser check in English and Chinese on desktop and
mobile: public customer links were absent, direct client routes returned 200, an invalid
session redirected to sign-in and the unauthenticated membership API returned 401. A local
database backup restored with matching migration/source/schedule/coverage counts. These
checks do not establish the full production client, Stripe or nationwide operating gates.

The candidate also makes official calendar and first-batch result ceilings fail closed rather
than silently truncate. It has not been deployed or live-source accepted. At the read-only
production baseline, five schedules remained enabled, all 13 Jobs were `SUCCEEDED`, the
Worker API health/readiness/alerts endpoints returned 200, and the Worker/API/Scheduler
retained the same exact image with zero restarts. Production still had no Property,
SellableUnit, Listing or MarketCoverage rows. Details and limitations are in
[`evidence/full-production-gates-preparation-2026-09-25.md`](./evidence/full-production-gates-preparation-2026-09-25.md).

## 2026-09-25 ChristchurchNZ complete-window and incremental production acceptance

Production Worker/API/Scheduler now run image
`sha256:b5b125888ae27314ba98e4d60e71cf049107b8b65a09d32e652a5ee4b09663ca`
from pushed code commit `496bc1155d3b10efd1b4cdcad48f831da0884647`.
ChristchurchNZ's first production pass covered the full 31-day window in 38 serial list requests:
435 source events, 736 unique sessions. A second pass used its persisted page cursor, requested
15 pages and touched 406 unchanged sessions; database totals remained 435/736, with no duplicate
business IDs. All 610 newly retained parsed-artifact hashes verify; no parser failure or contact
fields remain. Both Jobs succeeded once through the real Worker. The exact fifth daily schedule
is now enabled, with its next run due 2026-09-26 UTC. The other four schedules remain enabled;
health/readiness are HTTP 200, queue and Scheduler healthy, 13 Jobs succeeded, no queued/failed
Jobs or alerts. Production configuration, Admin-only Web and other launch boundaries are unchanged.
The source-specific full/rotating scan, version, Jobs, backups and rollback are recorded in
[`evidence/christchurchnz-incremental-2026-09-25.md`](./evidence/christchurchnz-incremental-2026-09-25.md).

This is the first day's bounded observation, not the two-distinct-UTC-day stability gate or the
complete nationwide signal plan. The next daily run must verify page rotation and freshness;
deeper changed/withdrawn events can remain stale until revisited, and removal reconciliation is
not established. GeoNet three-hour freshness, full-year holidays, Stats NZ cadence and RBNZ
remain separate limitations. The customer surface stays closed.

## 2026-09-25 five-channel safety correction and recurring observation (historical)

At that time Production Worker/API/Scheduler ran `tymra:five-source-safety-20260925-v2` from commit
`47f5d48b30f4461e4664a9957cc2891f3b023163`. Four bounded schedules were enabled;
ChristchurchNZ was paused after its official listing showed 47 pages against a three-page cap.
GeoNet's required earthquake and volcano requests both ran; MBIE's latest-month ADP collection
now covers all 15 configured major markets without the former 20-result truncation. The two
new production Jobs each succeeded on one attempt; all 37 retained parsed-payload hashes verify,
there are no duplicate source external IDs, and the queue, readiness and Scheduler are healthy.
A failed scheduled Job now disables its schedule before the next cycle. Only the Scheduler
environment flag changed; the Admin-only Web and all customer/business launch boundaries remain
closed. Precise Jobs, source counts, image, backups, recovery and incomplete coverage are in
[`evidence/five-source-safety-2026-09-25.md`](./evidence/five-source-safety-2026-09-25.md).

This is safe bounded observation for four channels, not acceptance of the complete nationwide
product source plan. The v2 correction preserves future public ChristchurchNZ `event_sessions`
while redacting credentials and contact fields. Its previous run's 28 contact-bearing raw
artifacts were scrubbed after a verified backup, with 30/30 hashes valid; missing old sessions
were not fabricated. The fifth schedule remained disabled until its pagination budget and
complete-window acceptance were resolved by the later release above.
The two-UTC-day stability gate, GeoNet three-hour freshness and full-year holiday horizon
remained open.

## 2026-09-25 five-channel production first round

At that time Production Worker/API ran `tymra:first-five-public-20260925-v4` from code commit
`c82690ad04699a36ae0b72ed233fcb3dca12b31f`. The five exact channels are
`public_holidays_nz`, `mbie`, `rto_calendars` (ChristchurchNZ), `geonet`, and `stats_nz`.
Each completed one bounded Scheduler-enqueued production Job with no collection failure or
duplicate business ID. The schedules and Scheduler were then paused for review. Across the five
Jobs, 74 retained parsed-payload hashes verified. A GeoNet
JSONB floating-point hash mismatch was repaired only for its 15 affected artifacts after a
verified snapshot, without re-fetching the source; the future write path now hashes the
persisted JSON. No migration or general seed ran. Exact Job IDs, business counts, release
identity, backup/rollback, limits, and the partial GeoNet coverage are in
[`evidence/first-five-public-scheduled-collection-2026-09-25.md`](./evidence/first-five-public-scheduled-collection-2026-09-25.md).

## 2026-09-25 initial two-schedule phase (historical)

The first two weekly schedules were initially enabled on image `tymra:first-public-schedules-20260925`
from commit `622a979dbdd96f5a981d094e80c57b4a1476a341`. Each completed its first bounded
production Job. The former plan to wait for their second cycle before enabling ChristchurchNZ
was superseded by Harold's explicit five-channel first-round instruction above. Historical
release identity, Job/run IDs, business writes, backups and rollback are in
[`evidence/first-public-scheduled-collection-2026-09-25.md`](./evidence/first-public-scheduled-collection-2026-09-25.md).

## 2026-09-25 Argus production recheck

Production Worker/API still run the verified public-canary v2 image; no rebuild, migration, seed,
configuration edit, or service recreation was needed. The protected production Argus origin and
token match the Mac mini handoff without exposing the token. The live Argus image identifies
revision `7df378fda31453dc6da724fb9fd7892cdfe99abf`. Production Node clients passed
health, readiness, OpenAPI, authorized missing-Job 404, and forbidden account/runtime 403 checks.
A single bounded Lincoln University 2026 Job completed through Tymra's real Worker, persisted
105 extracted dates into the two existing non-demo source signals without duplication, copied
and hash-verified both evidence files, and ACKed after persistence. Argus subsequently reported
delivery `PURGED`, result HTTP 410, and both evidence reads HTTP 404. Worker/API remain healthy;
Scheduler and the customer/business launch switches remain off. Exact identities, hashes,
backups, rollback and untested scope are in
[`evidence/tymra-argus-production-recheck-2026-09-25.md`](./evidence/tymra-argus-production-recheck-2026-09-25.md).

## 2026-09-25 first public-source production canary

The production Worker/API now use image `tymra:public-canary-20260925-v2` from code commit
`6d948dda4e76cb87416661e2ce4b4863341be52b`. Two manually triggered bounded passes
each for `public_holidays_nz`, `rto_calendars`, and `mbie` succeeded through Tymra's real
Worker persistence. Repeated passes added no duplicate business rows or source links. Twelve
raw-artifact payload hashes matched, with no parser failure. No migration or generic seed ran.
The Admin-only Web image is unchanged; Worker/API remain healthy, while Scheduler and all
customer/business feature switches remain off. These direct public HTTP adapters did not create
Argus Jobs or exercise ACK/PURGED; the prior Lincoln Argus acceptance remains separate.
Release identity, six run IDs, backups, rollback and boundaries are in
[`evidence/public-canary-production-2026-09-25.md`](./evidence/public-canary-production-2026-09-25.md).

## 2026-09-24 restricted production Argus acceptance

The production `collection` Worker/API profile is healthy on the exact v3 image; the Admin-only
Web image remains in place. A single retry of the existing Lincoln University 2026 parent Job
reused its completed Argus execution, wrote two distinct `UNIVERSITY_CALENDAR` signals, copied
and verified the two evidence files, ACKed Argus, and observed result HTTP 410 and evidence HTTP
404. The new enum migration is the only additional production migration (33 successful total).
Scheduler and all customer, intake, billing and mail functions remain disabled. The detailed
image identities, backups, Job IDs, file hashes and validation boundaries are in
[`evidence/tymra-argus-production-acceptance-2026-09-24.md`](./evidence/tymra-argus-production-acceptance-2026-09-24.md).
This acceptance supersedes the stopped state below; it does not accept RBNZ or other connectors.

## 2026-09-24 earlier production Argus attempt — rolled back (historical)

A single bounded Lincoln University 2026 production Job reached and completed Argus, but Tymra
failed before business persistence and ACK. `UNIVERSITY_CALENDAR` was missing from the persisted
signal enum/mapping, and the HTML evidence delivered through the production API did not match
Argus's size/SHA-256 metadata. Worker/API and the candidate Web image were rolled back, the
Argus environment values restored, and the acceptance source suspended. The local-only signal
type fix and migration have not been deployed. Read-only origin/public comparison identified
Cloudflare Email Address Obfuscation changing the HTML response after Argus served the original
bytes; the production evidence route still needs a verified no-transform fix.
Exact image, backup, Job, database and remote-result evidence is in
[`evidence/tymra-argus-production-attempt-2026-09-24.md`](./evidence/tymra-argus-production-attempt-2026-09-24.md).
The production service is still Admin-only; collection and Scheduler are off.

## 2026-09-24 Admin-only production access candidate

The current request is to expose only the operations backend during the first production stage.
The existing `DEPLOYED_HIDDEN` switch alone does not meet that requirement: it hides links while
direct customer routes and APIs remain reachable. The production Compose candidate now has only
the `ops.tymra.nz` Web router, defaults `ADMIN_ONLY_ACCESS=true`, and uses an Admin sign-in
healthcheck. Production middleware denies non-Admin pages/APIs on every host, including the public
hostname, and adds `X-Robots-Tag: noindex, nofollow, noarchive`. The Operations router adds the
same header. Existing Admin authentication and API authorization remain in place. Public and www
routers were removed from this candidate; the customer site cannot be opened merely by knowing a
direct route. This stage is distinct from client `DEPLOYED_HIDDEN` and does not claim customer launch.

Four residual bearer-result/reissue routes referring to removed `ResultView`, `resolveResultLink`
and `LINK_REISSUED` were deleted in line with the approved owner-authenticated result contract.
Web TypeScript now passes. Middleware boundary tests passed 9/9, including public page/API denials,
Operations access, a mismatched forwarded Host and the production fail-closed default. Production Compose rendered with safe placeholder
values and contained only the Operations router. A sanitized 492-file source context with no `.env`,
runtime data, historical evidence or Git metadata built the local `production` image successfully:
`tymra:admin-only-20260924`, image ID
`sha256:514a7d16c31f932b0d276e19221b8ed7bacffc3c711bdbf6b1b7c5a288bc4309`
(linux/arm64). Build log SHA-256:
`adbf0724c48ed5140bdbee5f47c7dd8322986174f5ae97cae33e4d6da898fc02` at
`/Users/haroldchen/Development/tymra/runtime/release-candidates/tymra-admin-only-20260924-build.log`.
The temporary source context was removed.

In a disposable local container with placeholder configuration and no business database, the
Operations sign-in returned 200 with `noindex`; the Operations host's customer page/API and the
public/www hosts' home, Price Check, customer API and Admin sign-in returned 404 with `noindex`.
The test container was stopped. This verifies routing and unauthenticated sign-in rendering only;
authenticated Admin operations, production data, DNS/TLS/ingress and search platform indexing were
not verified. On 2026-09-24 `tymra.nz`, `www.tymra.nz` and `ops.tymra.nz` did not resolve from this
host. The existing local Tymra services remain on the prior built image; no migration, scheduler,
real collection, production write or deployment occurred. Full product, source, retention, capacity,
recovery and rollback gates below remain open. This image is a local access candidate, not a
release approval.

The user subsequently selected the Spicy Maggie host and registered `tymra.nz`. Read-only SSH
confirmed `spmadmin@148.135.121.30` is `spm-prod-01`, linux/x86_64, with about 83 GiB disk and
4.8 GiB memory available. The existing website and Traefik containers were healthy. The shared
proxy uses the existing `spm_ingress` network and an HTTP-challenge `letsencrypt` certificate
resolver; the candidate Operations router now selects that resolver. No existing Tymra containers,
Docker volumes or application directory were observed in the inspected deployment locations.
The authenticated Cloudflare DNS page showed zero records for `tymra.nz`; no records were changed.
Fresh lint and all workspace type checks passed; root unit tests passed 225 with 5 skipped and
Worker unit tests passed 141. The earlier arm64 image was not used on this host. The user confirmed
administrator `ict@spicym.nz` and backend-only operation with external services disabled.

The amd64 local build passed. Its large image transfer was stopped before import completed because
of upload speed; the verified 492-file source package was then built natively on SPM. Source archive
SHA-256: `fb9c1de9a6f2847f995805b7a078f14c43a724c7769ff27bc8282f8cad84aecc`.
The server image is `sha256:ed9e56e89aab5ed82211660d893aae424d2a5e9e41d5e3f9dae2056bed7b9417`.
Protected deployment files are in `/srv/apps/tymra/releases/admin-only-20260924/`; the environment
file is `/srv/apps/tymra/shared/production.env` (root-only). Only Postgres, Redis and Web are running;
the 32 migrations completed successfully. Worker/API require the `collection` profile, Scheduler
requires the `scheduler` profile, and neither is enabled. SMTP is unset, email transport is `log`,
and the disabled Argus endpoint is loopback port 9 with a non-working random token. Billing,
customer funnel, new checks, internal on-demand and schedulers are disabled. No production Argus
integration or live external-service acceptance is claimed.

The general seed was not run. Exactly one administrator was created; customer, check and collection
run counts were zero. Origin HTTP verification passed for sign-in, authenticated overview/checks/
data sources/market coverage/exceptions, logout and session revocation. Unauthenticated Admin
access redirected to sign-in; customer/public routes returned 404 with noindex. Web/Postgres/Redis
are healthy and the pre-existing SPM website and Traefik remained healthy. Pre-DNS browser attempts
did not establish UI acceptance; the subsequent public checks below supersede that boundary.

After execution-time confirmation, Cloudflare saved the sole proxied A record `ops.tymra.nz` to
`148.135.121.30`. No apex/www records were added. The Operations certificate was issued after a
Tymra-Web-only restart retriggered issuance following the initial NXDOMAIN attempt; the shared
Traefik service was not restarted. Both origin and public TLS verification returned 200. Cloudflare
was changed from Full to Full (strict), read back in its dashboard, and public HTTPS remained 200.
Public sign-in returned 200, unauthenticated Admin page redirected 307, unauthenticated Admin API
returned 403 (`Administrator access is required`), and customer page/API returned 404; all checked
responses carried `X-Robots-Tag: noindex, nofollow, noarchive`.

Playwright desktop (1440 x 1000) verified sign-in, overview, list navigation, logout and return to
sign-in over public HTTPS with certificate verification enabled. The browser title was
`Overview · Tymra`, meaningful empty-state content rendered, no framework error overlay or page
exceptions appeared, and the screenshot was inspected. Five console messages in the final run
were RSC prefetch cancellations, each matched to `net::ERR_ABORTED` during navigation; there were
no other console errors. Browser plugin was absent, so existing project Playwright was used.
Because local command-line DNS returned an inconsistent address/negative cache, this automated
check pinned the Cloudflare address verified through encrypted DNS; importantly the user's Safari
subsequently opened the normal HTTPS login URL successfully without a DNS override. No system DNS
or security settings were changed. Screenshot:
`/Users/haroldchen/Development/tymra/runtime/release-candidates/tymra-admin-only-20260924-admin.png`.
Argus is visibly unavailable by design in this phase. No collection, mail delivery, billing,
customer flow, mobile viewport, search-engine indexing or full disaster recovery is claimed.
The generated administrator credential is in the local protected runtime secrets directory; its
value is not recorded here. Final source/config diff checks passed; no commit or push was made.

Recovery files are root-only under `/srv/apps/tymra/backups/admin-only-20260924/`:
`before-migration.dump` SHA-256 `642c6b5645418f190cc3ebcba2a4cc71292efa4cdaf5a67e620eff09157af1a6`,
and initialized database dump SHA-256
`d4602cca5795f791cf9716987a42ea9ada7da6b0a2fa34c5739363a4f76807a4`.
The pre-migration archive table of contents was readable. An environment recovery copy is retained
there; no secrets are included in this record. Roll back initial exposure by stopping only Web with
the installed Compose/environment files, preserving all volumes and the shared proxy. Do not use
`down -v` or restore the empty database over later business data. Full disaster restore is untested.

Status is `verified` only after the named automated checks and relevant runtime evidence pass.
The current baseline uses `proposed`, `not_implemented`, `partially_implemented_not_verified`,
`implemented_not_verified`, `verified_for_prior_development_candidate`, `historical_verified`, and
`verified`. A development candidate is not a production release. Prior dated evidence is
informational only and does not create compatibility requirements.

The tables below contain both current status and explicitly dated historical evidence. A historical
`verified` result remains valid for that snapshot but does not mean the current revision was
rerun through the same gate. The current-worktree section is authoritative for fresh verification.

## Current Workspace And Runtime Baseline (2026-09-13)

The editable main checkout is now `/Users/haroldchen/Development/tymra/repo`; the iCloud business
entry is `Workspaces/tymra`. HEAD remains `4def572f18dbeb1cd332430fcc3bd900443a5446`, with the
original 53 dirty paths preserved, including intentional deletions and new migrations. The old
checkout remains intact. This migration does not release or complete that development candidate.
Company ownership and current local-document authority are defined in [product/README.md](./product/README.md).

| Check | Observed result | Consequence |
| --- | --- | --- |
| Local unit tests | 222 root tests passed, 5 skipped; 141 worker tests passed | Unit coverage only; no fresh database integration, live provider, UI or release acceptance |
| Type checks | Config, DB, domain, providers, queue and worker passed; Web failed with six errors | Old token-result, feedback and reissue routes still reference removed `resolveResultLink`, `ResultView` and `LINK_REISSUED`; the original checkout produces the same six errors |
| Existing runtime | Six Tymra containers retain their original identities and built images; no source bind mounts | Editing the new checkout does not replace the running candidate. No rebuild, migration, seed or scheduler activation occurred |
| Local HTTP | English/Chinese site, admin sign-in and Mailpit returned 200 with TLS verification | These checks establish endpoint availability, not authenticated business or rendered-UI acceptance |
| Existing API fault | Worker API readiness returns 503; database and Redis pass, Argus health/readiness return 404. Public worker routes also return 404 | Present before migration. Resolve Argus dependency/routing in the appropriate product/platform task before claiming readiness |
| Frozen backups | Source and dormant host helpers, PostgreSQL/Redis/evidence volumes, Mailpit container filesystem and exact application image preserved in six encrypted archives | PostgreSQL 17 and Redis restored successfully into isolated disposable copies; 80 public tables readable and complete PostgreSQL logical dump passed. Original volumes retained |
| Host helper templates | Two repo scripts resolve their own new location; three launchd templates point to the new repo | No Tymra LaunchAgent was installed or loaded at inspection. The former 60-second auto-recovery claim is not current; templates remain inactive |

The package-manager check initially reconciled copied dependencies automatically and was interrupted.
Those dependency trees were retained outside the active repo, then restored from the unchanged original
and hash-verified. The results above use the copied compiler and Vitest directly, without another install.
No application source, package versions, test expectations or runtime environment values were changed.

Remaining candidate work starts with removing or reconciling the stale result-link routes under the
approved v1.3 specification, then the required checks. Existing Argus availability and the dated product
acceptance gaps below remain separate. The older collection and development results are preserved as
2026-08-21 or earlier evidence and do not supersede this fresh baseline.

Detailed migration and restore evidence is in
`/Users/haroldchen/Development/life/work-environment/chatgpt-rebuild/tymra-final-verification.json`
and `tymra-data-restore-verification.json`; after retirement of superseded local backup folders,
restore order is described in the [recovery guide](</Users/haroldchen/Development/life/work-environment/chatgpt-rebuild/备份恢复说明.md>). On 2026-09-13 the saved project configuration was checked: `Tymra` uses
the business entry as primary root and `/Users/haroldchen/Development/tymra/repo` as an additional
root. This verifies saved configuration; rendered desktop UI and remote iCloud sync are separate checks.

## Collection Status At The Prior Development Baseline

The rows in this section describe the prior development baseline, not fresh runtime checks.
Detailed historical run IDs and counts are preserved in the
[2026-07-30 full public-source acceptance](./evidence/public-source-acceptance-2026-07-30.md).

| Channel | Prior observed state | Remaining boundary |
| --- | --- | --- |
| Eventfinda | Bounded two-pass real collection, persistence and idempotency verified | Nationwide multi-day unattended stability requires a deployed long-running environment |
| Ticketmaster | Implementation and automated two-pass persistence verified; live detail attempts stop and cool down on challenge | Repeat live detail acceptance when the public page permits passive access |
| Configured non-OTA public channels | All 17 configured sources completed one unified bounded two-pass real local acceptance on 2026-07-30 | Fresh live rerun, production activation and ongoing operations remain separate |
| Major-market event/public signals | 14 markets have a direct official calendar and Dunedin has a verified Argus calendar path; DOC alerts and TVF/MRTE cover all 15, IVS provides rolling context, and MoT plus Auckland Airport monthly passengers passed two persistence runs | Multi-day stability and schedule activation remain separate; Auckland's malformed final source month is excluded |
| Argus execution boundary | Async submit/poll/resume/ACK, restart recovery, cancellation and post-ACK purge have dated local evidence; current image/unit/build checks pass | Current-worktree database integration and production acceptance remain separate |
| School Sport NZ / Canterbury | Fresh two-pass cross-service collection through `api.argus.test`; 20/6 NZ raw/promoted and 13/0 Canterbury raw/promoted; local evidence retained before ACK | Production activation and schedule activation remain separate |
| Ticketek | Fresh two-pass listing/detail collection succeeded through `api.argus.test`; 15 raw records and 11 events per pass, with zero second-pass growth | Production activation remains separate; source remains disabled |
| Manual import | Parser and database regression verified | `not_verified`: genuine operator export and two-pass real-file evidence are missing |
| Six active public OTA channels | Booking.com, Airbnb, Expedia, Bookabach, Agoda and Trip.com have strict Argus contracts, stable provider-family identity, bounded comparable discovery/rate workflows, evidence lifecycle and cross-brand deduplication. The retained 2026-08-17 soak cycle 1 passed; cycle 2 was cancelled under the documented 2026-08-21 manual release waiver | The automated two-day soak remains `NOT_PASSED`; all other OTA brands are outside the current contract; production capacity and long-term page stability remain unverified |

The reusable standard is [`collection/acceptance.md`](./collection/acceptance.md). Local acceptance
never changes source configuration and cannot enable schedules.

## National Data Core v1.3 Implementation Gap Audit (2026-08-21)

This table began as the approved `DATA-CORE-001..022` gap audit and now records the implementation
state of the same scope. `P0` blocks the first unified production candidate or would cause irreversible
loss/misattribution; `P1` completes nationwide operating depth; `P2` improves scale and operator
efficiency. Tymra has never launched, so obsolete development-only schema and routes were deleted
directly without a compatibility layer or historical backfill. `implemented_database_verified` means
the code, clean migration/seed and isolated PostgreSQL contracts passed; it does not claim a nationwide
non-demo run or production acceptance.

| Requirement | Current repository evidence | Concrete gap | Priority | Status |
| --- | --- | --- | --- | --- |
| `DATA-CORE-001` nationwide identity directory | 17 Region × six OTA durable crawl frontier; bounded discovery persists explicit Property/Unit/Listing identities and versions | Nationwide non-demo population depth has not yet been run or measured | P0 | `implemented_database_verified` |
| `DATA-CORE-002` nationwide public signals | National aggregators, 15 major-market mappings, regional official adapters and canonical event/signal persistence exist; five bounded production public schedules are enabled | The five-source first-day result is not nationwide continuity or the two-UTC-day gate; Chatham Islands, Gisborne, Marlborough and West Coast depth is not represented by the 15-market operating set | P1 | `five_source_canary_running_nationwide_not_accepted` |
| `DATA-CORE-003` representative OTA panel | Region-stratified 840 Anchor + 360 Rotating selector, approved date basket, bounded Argus rate collection and coverage update | Real nationwide inventory must fill and calibrate the target panel | P0 | `implemented_database_verified` |
| `DATA-CORE-004` nationwide bounded on-demand collection | Admin `/admin/on-demand` accepts one unique NZ address or supported OTA URL and starts the existing auditable Price Check/Argus path with 30-night/365-day/occupancy bounds | Live address and all-six-OTA operator acceptance remains | P1 | `implemented_database_verified` |
| `DATA-CORE-005` member-property monitoring | Host/Pro/Portfolio scheduler, plan cadence, quota and NZ business-date query plans exist | Unified-production and real-provider scheduled monitoring have no fresh all-plan acceptance; scheduler reuses the latest check and does not yet prove full target-mode/context preservation | P1 | `implemented_not_verified` |
| `DATA-CORE-006` all-region acceptance | Seed and coverage refresh explicitly maintain all 17 Regions and do not substitute Christchurch for nationwide scope | Non-demo dispersed-region run evidence remains | P0 | `implemented_database_verified` |
| `DATA-CORE-007` coverage levels | Exact `SUPPORTED/PARTIAL_COVERAGE/PILOT/INSUFFICIENT_DATA/SOURCE_UNAVAILABLE` taxonomy is migrated and used | Runtime states still depend on real observations | P0 | `implemented_database_verified` |
| `DATA-CORE-008` coverage facts | Region rows store Property/Unit/Listing/panel counts, composition, geography, 24/72 coverage, freshness, explicit gaps, last success and priority | TA-level depth and thresholds need operational calibration | P1 | `implemented_database_verified` |
| `DATA-CORE-009` Source Registry | Versioned capability rows are seeded for every source; OTA sources and capabilities are visible in Admin | Production configuration review remains | P0 | `implemented_database_verified` |
| `DATA-CORE-010` capability-based adapters | Catalog, panel, Listing resolution, rate collection and public signal jobs check registered capability before network execution and return `SOURCE_CAPABILITY_MISSING` | None at code-contract level | P0 | `verified` |
| `DATA-CORE-011` raw/normalised/derived layers | `RawArtifact`, normalised identity/observation/event/signal models and derived snapshots/results exist with separate retention fields | Dedicated layer-boundary regression and category-specific retention acceptance must be rerun after the schema work | P1 regression | `implemented_not_verified` |
| `DATA-CORE-012` Argus/Tymra evidence boundary | Result/schema/hash verification, ACK/purge, local durable facts and multiple dated real acceptance reports exist | Production-duration evidence lifecycle remains an external operating gate, but no contract redesign is required | Regression only | `verified_for_prior_development_candidate` |
| `DATA-CORE-013` time fields | Observation and identity versions expose source/effective/observed/collected/ingested/business/validity/superseded semantics; NZ business dates remain `Pacific/Auckland` | Nullable source timestamps honestly remain null when a provider does not publish them | P0 | `implemented_database_verified` |
| `DATA-CORE-014` Freshness | Typed versioned `FreshnessAssessment` stores domain, purpose, reference, age, limit, state and limitations | Cross-domain policy thresholds need real operating data | P1 | `implemented_database_verified` |
| `DATA-CORE-015` Confidence | Typed layered `ConfidenceAssessment` supports identity, field, snapshot and derived result scopes | Real thresholds need calibration | P1 | `implemented_database_verified` |
| `DATA-CORE-016` versioned identity graph | `IdentityEntityVersion` preserves Property/Unit history; `ListingVersion` and `IdentityRelationVersion` preserve Listing and Listing→Unit evidence/validity | Split/conflict operating exercises remain | P0 | `implemented_database_verified` |
| `DATA-CORE-017` Listing change history | All current catalog, OTA resolution, address promotion and manual-import mutation paths append content-addressed identity/Listing versions | Real multi-pass source-change acceptance remains | P0 | `implemented_database_verified` |
| `DATA-CORE-018` Data Lineage | `TransformationRun` and `LineageEdge` connect raw artifacts, normalized rates, snapshots, analyses, results and insights; Admin explorer queries the graph | Production-scale query tuning remains | P0 | `implemented_database_verified` |
| `DATA-CORE-019` snapshot target modes | `MarketSnapshot.analysisType` is required; address mode uses nullable Listing/Unit and a spatial anchor without fabricated target Listing | Fresh live two-mode acceptance remains | P0 | `implemented_database_verified` |
| `DATA-CORE-020` price/recommendation separation | Separate result statuses, one-valid-price delivery behavior and dedicated integration tests exist | Preserve through the schema migration and rerun both target modes; no new product behavior is required | Regression only | `verified_for_prior_development_candidate` |
| `DATA-CORE-021` unified nationwide backend gate | Required code/schema paths pass fresh isolated migration/seed, 110 integration tests and build; five bounded public schedules run in production | Production has no Property/Unit/Listing/MarketCoverage rows; non-demo nationwide execution, representative OTA panel, capacity and full readiness remain release gates | P0 dependency gate | `implemented_not_live_accepted` |
| `DATA-CORE-022` client same-version deployment and hidden discovery | Fresh Web types pass; isolated desktop/mobile, English/Chinese hidden-home and direct-route browser check passes with unauthenticated/invalid-session rejection | Production remains Admin-only; paid entitlement, real provider, Stripe, mail, managed challenge, full browser/accessibility, capacity and customer ingress are unaccepted | P0 | `local_hidden_gate_verified_production_not_accepted` |

### Approved implementation order from the audit

1. **P0 schema and domain correctness:** capability registry, exact coverage taxonomy, all-Region
   coverage identities, versioned identity/Listing history, complete time fields,
   `TransformationRun`/lineage edges, mode-aware snapshots and removal of durable bearer results.
2. **P0 execution paths:** capability-gated orchestration, real catalog discovery, stratified panel
   construction and collection, address snapshot generation, authenticated result delivery and
   `DEPLOYED_HIDDEN` configuration.
3. **P0 acceptance:** clean migration/seed, all 17 Regions, six-OTA registry, both target modes,
   history/lineage immutability, one-price behavior, hidden/direct-route security and rollback.
4. **P1 operating depth:** coverage fact completeness, typed Freshness/Confidence, remaining regional
   signal depth, internal bounded on-demand UI and real scheduled-member monitoring.
5. **P2 optimisation:** adaptive panel rotation/weights, cost-aware cadence, lineage exploration,
   coverage-gap prioritisation and long-running production tuning.

## Historical Development Candidate Verification And Documentation Delta (2026-08-21)

The following candidate and requirement matrices retain dated evidence. The 2026-09-13
six-Web-error and residual-route observation is historical: this isolated candidate passes
fresh Web type checks, and a targeted source search found no residual bearer-result route.
Only the named gates below were rerun; older browser/provider evidence is not current acceptance.

The isolated candidate includes the National Data Core v1.3 P0 schema/execution paths,
P1 operating surfaces and P2 optimisation controls described above, together with the complete
development membership surface, anti-abuse controls, New Zealand business-date policy and the prior
OTA soak waiver. Clean isolated PostgreSQL migration/seed and 110 integration tests pass;
the full browser/release matrix and non-demo nationwide operating acceptance are still pending. Git state is not used
as verification evidence.

| Gate | Fresh evidence from current worktree | Status |
| --- | --- | --- |
| Web lint | `apps/web/scripts/lint.mjs` completed with zero errors or warnings | verified |
| TypeScript | Web, Worker, config, db, domain, providers and queue passed `tsc --noEmit` | verified |
| Web/domain/provider/database unit suite | 232 tests passed; 5 external provider fixtures intentionally skipped | verified_for_isolated_candidate |
| Worker unit suite | 153 tests passed, including first-batch fail-closed limits, release safety, Argus boundary and member scheduling | verified_for_isolated_candidate |
| Database/API/Worker integration | 110 tests passed against a freshly migrated and seeded isolated PostgreSQL database; Stripe lifecycle, membership identity, quotas, concurrency, plan retention and Worker metrics were included | verified_for_isolated_candidate |
| Membership/risk focused regression | Membership integration file passed all 19 scenarios, including Pricing Unit collection/detail GET and confirmed-check POST; configuration/security suites passed the managed-provider and feature-gate contracts | verified |
| Production build and runtime | Both candidate builds pass with synthetic config and the optional `linkedom/canvas` warning; production Worker/API/Scheduler and Admin-only Web image identities are separately read back, with API health/readiness 200 | candidate_build_verified_production_release_pending |
| Member browser QA | Local `DEPLOYED_HIDDEN` discovery, direct client pages, invalid-session rejection and unauthenticated API checks passed in both languages on desktop/mobile; prior Free/Host/Pro/Portfolio fixture contracts remain historical | local_hidden_gate_verified_paid_flows_pending |
| Playwright/accessibility matrix | Latest development-candidate evidence: five-browser canary 36 passed with 4 intentional skips; Chromium desktop 19 passed with 2 skips; mobile 17 passed with 4 skips; Compose smoke passed through canonical `https://tymra.test` | verified_for_prior_development_candidate |
| Payment/challenge/monitoring | Stripe Sandbox configuration readiness passed. A fresh hosted-Checkout browser revalidation reached Stripe Sandbox with an active test-card submission but did not return to Tymra before the external timeout, so it is not recorded as a fresh lifecycle pass. Managed challenge readiness remains blocked by absent provider URL/site key/secret. Privacy-safe `/worker/alerts` and the single-source 2×2 canary gate are implemented; Stripe live、production challenge/provider、dashboard、notification routing、capacity and SLA remain external | test_mode_readiness_verified_external_lifecycle_not_verified |

The active OTA scope is exactly the six channels listed above. Development Scheduler remains off.
Dated real-page and fixture evidence proves only the named run; it does not establish ongoing source
availability or production readiness.

## Product Requirements

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| PRD-PRODUCT, PRD-OVERVIEW, PRD-USERS | Public copy, locale messages, legal/methodology content | Public page and copy tests | verified |
| PRD-GOALS, PRD-PRINCIPLES, PRD-AUTOMATION | Domain decisions, worker pipeline, publication policy | Decision and worker integration tests | verified |
| PRD-SCOPE unified production deployment | Existing Admin/client routes, APIs, Worker and database; isolated `DEPLOYED_HIDDEN` discovery and direct-route check now pass | Nationwide non-demo execution and client same-version production release remain unaccepted | implemented_not_live_accepted |
| PRD-DATA 6.1–6.7 | Prisma market models, append-only services, provider metadata and collection modes | Database integration tests | verified |
| DATA-CORE-001..022 / D-049 / D-050 | Capability registry, 17-Region frontier/coverage, representative panel, versioned identity/history, generic lineage, address-mode snapshot, hidden client discovery and bounded Admin on-demand workflow are implemented | Clean migration/seed/drift and isolated integration pass; push-time browser matrix plus non-demo nationwide operating acceptance remain | implemented_not_live_accepted |
| PRD-RESULT | Result versions, insights, authenticated ownership and feedback | Current isolated Web types pass and no bearer-result route was found by targeted source search; local invalid-session/API rejection passed, but full result-ownership browser and production acceptance remain | implemented_not_live_accepted |
| PRD-OPS | Exception Inbox and operational views | Admin API and Playwright tests | verified |
| PRD-MARKET | Market records, NZ eligibility and locale behaviour | Domain and bilingual flow tests | verified |
| PRD-COMMERCIAL, PRD-ROLES | Single-admin and customer/member surfaces exist; isolated hidden navigation and direct routes pass | Paid plans, real provider, Stripe, production authentication and customer ingress remain unaccepted | local_hidden_gate_verified_production_not_accepted |
| PRD-METRICS | Event contracts and operational aggregates | Event payload and metrics tests | verified |
| PRD-NFR, PRD-COMPLIANCE | Config guards, audit, redaction, Docker and docs | Security, production-start and Compose checks | verified |
| PRD-AT-001..010 | End-to-end development-candidate acceptance | Local hidden-entry subset of PRD-AT-010 passed; nationwide and commercial production flows remain pending | partially_verified_not_live_accepted |
| PRD-CODEX | Workspace, commands, docs, CI and verification | `pnpm verify`, Compose and CI | verified |

Grouped identifiers retain the exact requirement-family names from the baseline documents. The
automated evidence below is supplemented by the final runtime evidence in `implementation-plan.md`.

## Business Rules

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| BR-GEN | Server-side domain policy and append-only persistence | Domain policy tests | verified |
| BR-OBJ | `packages/db/prisma/schema.prisma` and domain schemas | Schema/integration tests | verified |
| BR-MKT, BR-IN | Market eligibility, input and confirmation services | Domain/API tests | verified |
| BR-ST | Canonical `PriceCheckStatus` and transition validator | Exhaustive transition tests | verified |
| BR-SRC | Provider interface, collection runs and retry policy | Provider/worker tests | verified |
| BR-PRICE | Effective nightly total and availability normalization | Price normalization tests | verified |
| BR-COMP | Versioned competitor relationships and deduplication | Competitor tests | verified |
| BR-CONF, BR-RISK, BR-DEC | Confidence, risk and publication decisions | Decision table tests | verified |
| BR-EXC | Exception model, actions, priority and workspace | Admin API/E2E tests | verified |
| BR-DATA | Append-only records and identity merge history | Database integration tests | verified |
| BR-RES | Immutable results, authenticated ownership and notifications | 当前隔离候选 Web 类型通过，定向源码搜索未发现旧 bearer 结果路由；未认证会话/API 被拒绝。完整结果归属、邮件和生产客户流程仍需新验收 | implemented_not_live_accepted |
| BR-API | `/api/v1` response and error contracts | Rough/customer APIs exist; current two-mode input, authenticated result route inventory and obsolete endpoint removal need fresh audit | implemented_not_verified |
| BR-FB | Feedback and learning boundaries | Feedback integration tests | verified |
| BR-LIMIT | Idempotency, free-check reuse and rate limits | Abuse/idempotency tests | verified |
| BR-PRIV, BR-SEC | Consent, retention, hashing, redaction and audit | Security tests | verified |
| BR-EVT | Shared analytics event names and safe payloads | Event contract tests | verified |
| BR-AT-001..010 | Seeded acceptance scenarios | Domain, integration and E2E suites | verified |
| BR-IMPL | Shared enums/config and production demo guard | Package boundary and startup tests | verified |

## Pages And Routes

| Requirement | Route/module | Automated evidence | Status |
| --- | --- | --- | --- |
| PG-IA, PG-ROUTES | Root redirect, `/en`, `/zh`, all listed public/admin routes | Route inventory test | verified |
| PG-LAYOUT, PG-HOME | Public shell and locale home | Earlier EN/ZH desktop/mobile E2E predates nationwide coverage copy and hidden discovery | implemented_not_verified |
| PG-CHECK | `/{locale}/check`, `/{locale}/address-check` and `/{locale}/rough/{checkId}` | Routes exist; current two-mode, pre-email rough-value and no-formal-provider-before-verification contract needs fresh E2E | implemented_not_verified |
| PG-PROPERTY, PG-UNIT, PG-QUERY | Confirmation routes and APIs | Candidate/unit/query E2E | verified |
| PG-STATUS, PG-BIZSTATE | Persisted task status and terminal states | Existing status matrix predates authenticated formal-status and separate rough access contract | implemented_not_verified |
| PG-RESULT | Authenticated owner-only account result route and feedback | 当前隔离候选 Web 类型通过且未发现旧 bearer 结果路由；未认证账户和 API 被拒绝。完整客户结果浏览器和生产归属验收仍未执行 | implemented_not_live_accepted |
| PG-PUBLIC | Methodology, FAQ, contact and legal routes | Public route/copy tests | verified |
| PG-ADMIN | Protected admin shell and sign-in | Auth and 403 tests | verified |
| PG-EXC, PG-EXC-DETAIL | Inbox and single-screen workspace | Admin E2E tests | verified |
| PG-OPS-CHECK | Price Check list/detail | Admin integration tests | verified |
| PG-MARKET | Properties, units, competitors, coverage, collections, sources, signals | Admin route/API tests | verified |
| PG-API, PG-SHARED | Uniform response and page state handling | HTTP error matrix tests | verified |
| PG-RESP, PG-SEO | Responsive layouts, metadata and noindex | Viewport and metadata tests | verified |
| PG-EVT | Safe analytics binding | Event tests | verified |
| PG-AT-001..008 | Complete page acceptance | Existing Playwright suite predates the current nationwide, two-mode and hidden-entry page contract | implemented_not_verified |

## Visual And Interaction Requirements

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| UI-GEN, UI-BRAND, UI-TOKEN, UI-TYPE | `apps/web/app/globals.css`, Web components and typography | Component tests plus post-move desktop/mobile browser QA | verified |
| UI-LAYOUT | Public, result and admin layout primitives | 390, 1440 and 1920 browser QA plus responsive Playwright | verified |
| UI-COMP, UI-IMPL | Shared buttons, fields, cards, states, tables and dialogs | Component interaction tests | verified |
| UI-HOME, UI-CHECK, UI-RESULT | Product-specific feature compositions | Existing EN/ZH desktop/mobile evidence predates nationwide copy, two target modes and hidden public discovery | implemented_not_verified |
| UI-STATE, UI-FORM | Canonical status mapping and async feedback | State matrix tests | verified |
| UI-OPS | Admin shell, inbox, workspace and operations | Admin visual/E2E tests | verified |
| UI-MOTION | Motion tokens and reduced-motion behaviour | Reduced-motion tests | verified |
| UI-A11Y | Semantic forms, keyboard, focus and non-colour cues | axe plus keyboard tests | verified |
| UI-I18N | `next-intl` messages and locale formatting | Translation parity tests | verified |
| UI-SEO | Metadata, hreflang, noindex and redaction | Metadata/security tests | verified |
| UI-QA, UI-AT-001..008 | Full visual acceptance matrix | Existing screenshot/accessibility projects require rerun after current page-contract implementation | implemented_not_verified |

## Customer Funnel Requirements

Authoritative source: [Customer funnel requirements](product/customer-funnel.md).

| Requirement | Planned implementation boundary | Required evidence | Status |
| --- | --- | --- | --- |
| R15-FLOW-001 | Anonymous supported OTA URL or New Zealand address input, persisted `AnonymousCheck`, rough-result route and UI | Existing URL E2E obtains value without email; address-mode rough flow needs fresh EN/ZH desktop/mobile evidence | implemented_not_verified |
| R15-FLOW-002 | Rough-result presentation contract and limitation copy | Browser assertions distinguish rough/demo/formal evidence | verified |
| R15-INPUT-001 | OTA URL selects `LISTING_PRICING`; resolvable New Zealand address selects `LOCATION_BENCHMARK`; invalid target states fail closed | Existing URL resolver tests pass; unified two-mode browser and API contract requires implementation audit | implemented_not_verified |
| R15-INPUT-002 | URL context/default context or address standard Stay Query with no anonymous date, guest or room controls | Existing URL resolver/control-absence evidence passes; address geographic-expansion path needs fresh evidence | implemented_not_verified |
| R15-INPUT-003 | Target-mode, observed-context and address-scope persistence/disclosure plus honest no-quote terminal handling | Existing URL persistence and `NO_DEFAULT_QUOTE` tests pass; address disclosure needs fresh integration/browser regression | implemented_not_verified |
| R15-INPUT-004 | Address mode has no fabricated target Listing or price attribution; URL/address variants of one Property share one slot | Membership mode/identity tests cover parts; anonymous cross-mode identity and rough-result evidence require a dedicated audit | implemented_not_verified |
| R15-COST-001 | Rough analysis service and aggregate/cache provider boundary | Integration proves no `PriceCheck` before verification | verified |
| R15-ID-001 | Pending verification separate from active `CustomerUser` | Integration proves email request creates no customer | verified |
| R15-ID-002 | Idempotent magic-link consume transaction and `CustomerSession` | Concurrent consume produces exactly one success, customer session and formal job | verified |
| R15-ID-003 | Separate customer/Admin models, cookies and guards | Customer isolation and Admin authorization tests | verified |
| R15-SEC-001 | Hashed, single-use 15-minute magic link and clean redirect | Hash/clean-URL E2E plus replay, expiry and concurrent-consume integration tests | verified |
| R15-SEC-002 | Neutral verification response and invalid-link disclosure boundary | Eligible, idempotent and cooldown responses share one payload; integration verifies the idempotent and cooldown timing floor | verified |
| R15-SEC-003 | Rotating, expiring and revocable customer session isolated from Admin | Rotation plus expired/revoked session 401 and Admin isolation tests | verified |
| R15-OWN-001 | `PriceCheck.customerUserId` plus report ownership guard | Owner 200, cross-account 404 and unauthenticated 401 integration tests | verified |
| R15-EMAIL-001 | `VERIFY_AND_SIGN_IN` plus conditional terminal notification policy | Mailpit E2E proves one happy-path email | verified |
| R15-EMAIL-002 | Authenticated in-page delivery acknowledgement and grace-period decision | E2E forces grace job and proves no second message | verified |
| R15-CONSENT-001 | Account disclosure plus separate default-off marketing consent | EN/ZH form plus service-consent requirement and default-off/explicit-opt-in persistence tests | verified |
| R15-ABUSE-001 | Idempotency across rough compute, link send, account activation and formal enqueue | Rough/send idempotency plus concurrent activation proving one formal enqueue | verified |
| R15-ABUSE-002 | Configurable risk service with allow/challenge/cooldown outcomes | Decision matrix plus signed, expiring development challenge handshake; deterministic mode is forbidden in production | verified |
| R15-QUOTA-001 | `UsageLedger` checked before formal enqueue | 1-per-24h boundary is enforced before enqueue in integration | verified |
| R15-MOTION-001 | Real-state progress components and reduced-motion path | Desktop/mobile reduced-motion E2E proves no active motion, static canvas and interactive FAQ | verified |
| R15-RET-001 | Scheduled cleanup expires unused links, keeps terminal token metadata for 30 days, removes expired anonymous records without formal ownership, removes expired/revoked sessions after 30 days, and removes rate-limit/abuse hashes after 90 days | Time-controlled Worker integration matrix | verified |
| R15-AN-001 | Daily aggregate counters with strict event/dimension allowlists; no row-level user/check/session identity or raw URL/query/report content | All 11 event names covered by contract/redaction tests; funnel integration verifies aggregate deltas and stored-value redaction | verified |
## Customer Funnel Decision Trace

| Decision | Requirement coverage | Current evidence | Status |
| --- | --- | --- | --- |
| D-015 Two-stage customer funnel | R15-FLOW-001, R15-FLOW-002, R15-COST-001 | Existing URL API, Mailpit and desktop/mobile E2E pass; two-mode flow requires fresh acceptance | implemented_not_verified |
| D-016 Customer/Admin separation | R15-ID-001, R15-ID-003, R15-SEC-003 | Separate models/cookies and authorization tests | verified |
| D-017 Verify before account activation | R15-ID-001, R15-ID-002, R15-SEC-001 | Pending state plus replay/expiry/concurrent activation integration and valid-link E2E | verified |
| D-018 Verify before provider cost | R15-COST-001, R15-QUOTA-001 | Zero pre-verification `PriceCheck` plus pre-enqueue quota boundary | verified |
| D-019 Authenticated formal reports | R15-OWN-001 | 当前隔离候选通过 Web 类型及未认证边界检查；先前跨账户与结果测试属于历史候选，当前完整归属浏览器和生产验收未执行 | implemented_not_live_accepted |
| D-020 Minimal conditional email | R15-EMAIL-001, R15-EMAIL-002, R15-CONSENT-001 | Single-message Mailpit and acknowledgement E2E | verified |
| D-021 Layered abuse and quota | R15-ABUSE-001, R15-ABUSE-002, R15-QUOTA-001 | Cache, challenge handshake, email cooldown, device 429 and formal quota tests | verified |
| D-022 No exclusive property claim | R15-OWN-001 | Independent anonymous records and customer ownership guard | verified |
| D-023 Retention defaults | R15-RET-001, R15-AN-001 | Recommended 7/30/90-day defaults implemented and tested; final production privacy approval remains external | implemented_not_verified |
| D-024 Real-state motion | R15-MOTION-001 | Server-backed stages plus desktop/mobile reduced-motion E2E | verified |
| D-025 OTA link or address with explicit target mode | R15-INPUT-001..004, R15-AN-001 | Existing URL and member address evidence covers parts; anonymous two-mode resolver and browser acceptance remain open | implemented_not_verified |

## Membership System

Authoritative commercial and functional contract: [Membership plans](product/membership-plans.md). Authentication requirements remain in [customer funnel requirements](product/customer-funnel.md); customer routes and page composition remain in [page structure](product/page-structure.md); responsive, state and visual acceptance remain in [visual interaction](product/visual-interaction.md).

The statuses below describe the current implementation, not the target specification. Price Check unlock Magic Links are separate from the member email/password login and do not verify membership authentication. A membership backend, plan card or authenticated check page does not by itself verify the complete customer membership module.

| Requirement | Planned implementation boundary | Required evidence | Current status |
| --- | --- | --- | --- |
| `MEM-AUTH-001`, `R15-AUTH-001` | Independent registration and email/password sign-in with zero pricing side effects | Real browser registration/login plus isolated PostgreSQL proof of Free membership creation with zero `AnonymousCheck`, `PriceCheck`, Job, unit and usage creation | `verified` |
| `MEM-AUTH-002`, `R15-AUTH-002` | Bcrypt password storage, neutral invalid credentials, throttling, duplicate protection and return-target validation | Credential/API integration, password-hash inspection, middleware return-target tests, old-password rejection and real password-change browser acceptance | `verified` |
| `MEM-AUTH-003`, `R15-AUTH-003` | Customer current-session and all-session sign-out, isolated from membership and Admin | Session API integration plus real browser current-session and settings all-session paths | `verified` |
| `MEM-AUTH-004`, `R15-AUTH-004` | Protected-route redirect through password sign-in with allowlisted same-origin `returnTo` | Middleware exact-route/query, open-redirect and EN/ZH locale-continuity tests/browser evidence | `verified` |
| `MEM-RISK-001` | Email verification before collection plus Benefit Group identity across account/device/property/payment subjects | Isolated PostgreSQL verifies unverified denial, same-device/same-Property shared Free usage, and shared-IP/different-device separation | `verified` |
| `MEM-RISK-002` | Unique Free/promotion claims, serializable retries, concurrent collection/noVNC limits and independent export/API quotas | Three-way concurrent Free claim, idempotent NZ-month export and payment-promotion uniqueness integration | `verified` |
| `MEM-RISK-003` | HMAC-only Stripe fingerprint, refund/dispute/Radar cases and member appeal | Synthetic signed-event persistence, payment reuse/refund, customer appeal and Admin review tests pass; production Radar delivery remains external | `implemented_not_verified` |
| `MEM-RISK-004` | Reason-code dashboard, audited allow/deny/release and independent risk retention | Admin API plus privacy-safe aggregate metrics and controlled retention lifecycle pass; production operating exercise remains external | `implemented_not_verified` |
| `MEM-NAV-001` | Session-aware customer navigation plus `DEPLOYED_HIDDEN` public-header/footer/CTA suppression | 当前隔离候选 EN/ZH 桌面/手机主页及移动导航隐藏客户链接；直接路由和未认证边界通过。已登录状态与生产入口仍需验收 | `local_hidden_gate_verified_production_not_accepted` |
| `MEM-PUBLIC-001` | Bilingual membership/pricing and OTA-link/address entry routes deploy but are omitted from public discovery while hidden | 当前隔离候选 EN/ZH 桌面/手机隐藏发现入口、直接页面 HTTP 200；完整可访问性与客户业务流程仍需验收 | `local_hidden_gate_verified_production_not_accepted` |
| `MEM-ACC-001` | Operational account overview with plan, lifecycle, usage, units, horizons, cadence and next action | State matrix for Free/Host/Pro/Portfolio and all subscription lifecycle states | `implemented_not_verified` |
| `MEM-UNIT-001` | Pricing-unit list/detail GET, confirmed-owned-Price-Check POST, activation, deactivation, reactivation and downgrade selection | API integration verifies list/detail/add, stable Property identity, unit limits and transactional cancellation; the current desktop/mobile browser flow creates the confirmed unit, opens it from the slot list and verifies its detail | `verified` |
| `MEM-CHECK-001` | Owner-only filterable history and result detail with mode-aware target or neighbourhood observations and observed-price/recommendation separation | Cross-account, pagination/filter, retention, one-valid-price acceptance and `LISTING_PRICING`/`LOCATION_BENCHMARK` separation pass in integration; the current desktop/mobile browser flow filters the owner history and reopens the authenticated formal detail | `verified` |
| `MEM-CAL-001` | Plan-aware exact daily calendar and separately labelled monitoring extension in `Pacific/Auckland` | NZ-time/domain boundaries, owner-only API, no-fabrication data states and responsive browser QA | `verified` |
| `MEM-ALERT-001` | Host core alerts and Pro/Portfolio settings/controls behind entitlement | Entitlement-aware unavailable state is browser-verified; production delivery path must deploy and pass notification acceptance even while discovery is hidden | `implemented_not_verified` |
| `MEM-PORT-001` | Pro/Portfolio view, bulk controls, exports and Portfolio API/webhooks | Export/API enforce membership, entitlement, independent quota and idempotency; production credential/webhook delivery still needs acceptance | `implemented_not_verified` |
| `MEM-BILL-001` | Stripe Checkout/Portal and persisted upgrade/downgrade/cancel/resume/grace reconciliation | Fake-Stripe and isolated PostgreSQL lifecycle pass; dated Sandbox evidence covered the full lifecycle and 37 webhooks. Fresh hosted Checkout timed out before return, so production deployment acceptance remains open | `implemented_not_verified` |
| `MEM-RET-001` | Plan history, raw evidence, auth, billing, cancellation and deletion retention | Controlled isolated PostgreSQL matrix covers Free 30, Host 183, Pro 365, Portfolio 730 and cancelled 30-day expiry boundaries | `verified` |
| `MEM-OPS-001` | Admin customer/membership/billing-event operations, safe reconciliation, session revoke, suspension and deletion support | Isolated PostgreSQL verifies unauthorised denial, audited plan/status corrections, session revoke, export completion evidence and minimised deletion; Stripe-backed manual drift fails closed | `verified` |
| `MEM-OBS-001` | Privacy-safe membership, billing, scheduler, queue, lifecycle and plan-economics telemetry | Worker health 与 `/worker/alerts` 返回机器错误码、等级、聚合值和阈值且不含 PII；生产 dashboard、通知路由与注入验收仍是部署门槛 | `implemented_not_verified` |
| `MEM-A11Y-001` | Complete member module in EN/ZH at desktop, 390px and 320px | Automated member-route axe serious/critical, overflow, keyboard and reduced-motion matrix; current result recorded below | `verified` |
| `MEM-E2E-001` | New Free, returning customer, paid lifecycle and every blocked/gated state | Fixture Free/browser and server gates pass; dedicated live Argus acceptance command now fails unless a non-demo public OTA price is delivered, but external live execution remains outstanding | `implemented_not_verified` |

The customer module is implemented and development-verified. Production payment credentials,
provider telemetry and live Argus membership evidence remain deployment gaps, not optional client
gates. `DEPLOYED_HIDDEN` controls only homepage, public navigation and marketing CTA discovery.
CSV export and the Portfolio read API continue to enforce entitlement, verified email,
serviceability, idempotency and quota.

### Membership development verification (2026-08-12)

- Prisma Client generation and TypeScript checks passed for every workspace package.
- Web/domain/config/provider/database unit suites passed 218 tests; five external provider fixtures remained intentionally skipped. Worker unit suites passed 135 tests.
- A disposable PostgreSQL 18.3 database applied all 29 migrations from zero, including the Prisma-schema alignment and Argus manual-handoff migrations, was seeded through the split source registry and passed 105 database/API/Worker integration tests. The disposable database was removed afterwards.
- Development seed creates verified `demo1`/Free, `demo2`/Host, `demo3`/Pro and `demo4`/Portfolio accounts with one shared derived or explicitly overridden development password; the legacy member login is deleted.
- Web lint passed. The Web production build generated 114 pages and the Worker production build completed; only the existing optional LinkeDOM `canvas` warning appeared.
- Browser acceptance covers all four development plan contracts plus the full EN/ZH member-route
  accessibility, compact-width, keyboard and reduced-motion matrix. Desktop passed 19 executable
  scenarios and mobile passed 17; the live Argus gate was not run because its dedicated member
  credentials/input were absent.
- The schema includes `20260811120000_location_benchmark_property_slots` and `20260811160000_membership_abuse_controls`. No Stripe production configuration, paid-plan launch, advanced-feature launch or production SLA is asserted by this evidence.

## Required Commands

These command descriptions remain useful, but the results below belong to earlier development
runs (including 2026-08-12). They are not current-worktree acceptance. The 2026-09-13 baseline
records six Web type errors, readiness 503 and no loaded Tymra LaunchAgent; no command here was
rerun during the document correction.

| Command | Intended coverage | Status |
| --- | --- | --- |
| `pnpm dev` | Next.js local development | earlier candidate image ran and HTTPS route returned 200 |
| `pnpm worker` | Persistent Worker | earlier candidate image ran with health/readiness 200; superseded by the 2026-09-13 readiness 503 observation |
| `pnpm db:generate` | Prisma client generation | earlier candidate verified on host and in Docker |
| `pnpm db:migrate` | Development migration | retention/analytics and event-impact migrations applied to the earlier development database |
| `pnpm db:seed` | Deterministic demo seed | earlier candidate verified in the isolated migrated PostgreSQL database |
| `pnpm lint` | Workspace lint | earlier candidate verified; no warnings or errors |
| `pnpm typecheck` | Workspace type checking | earlier candidate passed; superseded by the six Web type errors in the 2026-09-13 baseline |
| `pnpm test` | Unit/domain and Worker suites | earlier candidate: 218 passed plus 5 external fixtures skipped; 135 Worker tests passed |
| `pnpm test:integration` | Database/API/Worker integration | earlier candidate: 105 tests in an isolated seeded database |
| `pnpm test:e2e` | Playwright and accessibility | Canonical `https://tymra.test` desktop run passed 19 executable scenarios with 2 explicit external skips; the final mobile run passed 17 executable scenarios with 4 explicit external/not-applicable skips. E2E now isolates its Admin identity, verifies critical API contracts before starting and prevents the local recovery agent from racing controlled Compose recreation |
| `pnpm test:e2e:member-live` | Real member-to-Argus price delivery | gate implemented and list-validated; not run because no live-member credentials/input were supplied |
| `pnpm build` | Production Web and Worker build | 112-page Web build and Worker entrypoints verified; known optional LinkeDOM canvas warning only |
| `pnpm verify` | Lint, typecheck, unit, integration, build | constituent gates verified on 2026-08-12; integration used a migrated, seeded and then deleted isolated database |

## Final Acceptance Evidence

These results preserve earlier evidence and its original counts. They are not final acceptance of
the migrated workspace or a production release; current blockers are recorded at the top of this file.

| Gate | Evidence | Status |
| --- | --- | --- |
| Product baseline/control files | Repository product documents are the sole current authority; no external-document or legacy compatibility dependency remains | verified |
| Routes and bilingual UI | Next build inventory plus EN/ZH desktop/mobile Playwright | verified |
| Database and seed | Clean Compose volume migrated; seed repeated without duplicate growth | verified |
| Web, Worker and Admin | HTTP 200, running Worker, protected Admin sign-in and workspace E2E | verified |
| Providers and exceptions | Demo/Manual provider tests, real import preview/import, exception workspace E2E | verified |
| Verification and email | Earlier one-time verification, ownership and Mailpit evidence; the claimed complete bearer-route removal is superseded by the 2026-09-13 source baseline | historical_evidence_current_cleanup_incomplete |
| Quality commands | lint, typecheck, 26 unit, 24 integration, build and `pnpm verify` | verified |
| Browser QA | Dated 16/16 Playwright, axe, 390/1440/1920 viewport matrix | verified for that revision |
| Compose and README | Clean `up --build`, migration, repeat seed, endpoints and teardown exercised | verified |
| Persistent local URL | Earlier Web/Worker/health-check LaunchAgents were reported restored with HTTP 200; the 2026-09-13 inspection found no loaded Tymra LaunchAgent | historical_verified_not_current |

## 2026-07-16 Homepage And Public Flow Refresh

| Gate | Current evidence | Status |
| --- | --- | --- |
| Dated homepage copy and navigation | EN/ZH desktop/mobile E2E for the then-current visible navigation; superseded by the unverified `DEPLOYED_HIDDEN` requirement | historical_verified |
| Homepage to rough-result handoff | Supported OTA URL creates a persisted `/{locale}/rough/{checkId}` result before email | verified |
| Locale continuity | Locale switch preserves check/result route and query parameters | verified |
| Mobile accessibility | Axe serious/critical violations: 0; horizontal insight region is keyboard focusable | verified |
| Responsive browser QA | Chrome at 390x844, 1440x900 and 1920x1080; no horizontal overflow | verified |
| Automated checks | `pnpm verify`: 26 unit and 24 integration tests; 16 desktop/mobile E2E; production build | verified |

## Customer Funnel Documentation Gate

| Gate | Required evidence | Status |
| --- | --- | --- |
| Product recommendation captured | Flow, rough/formal contract, identity, email, abuse and retention documented | verified |
| Product approval | Explicit approval of the current funnel and D-025 defaults | verified |
| Implementation plan | Dependencies, risks and gates recorded | verified |
| Implementation | Core funnel, cleanup, safe aggregate analytics, security/quota boundaries and rollback flag are implemented; interactive challenge provider remains external | implemented_not_verified |
| Automated acceptance | All locally implementable named matrices pass; neutral-response timing acceptance and external product/production gates remain | implemented_not_verified |
| Runtime acceptance | Chrome, Mailpit, abuse cooldown and persistent-service evidence | verified |

## Worker Baseline v1 Evidence (2026-07-18)

| Gate | Evidence | Status |
| --- | --- | --- |
| Durable runtime | PostgreSQL jobs, Redis locks, API, Worker and Scheduler entrypoints | verified by isolated full Compose smoke |
| Domain persistence | Property, SellableUnit, Listing, SourceRegistry, QueryPlan/Profile, Observation, snapshots, analysis and result schema | verified by clean migration and seed |
| OTA research adapters | Seven shared contract adapters, deterministic record/replay and stable errors | verified |
| Public signal lineage | RawArtifact -> SourceMarketSignal -> MarketSignal -> MarketSignalSourceLink | locally verified across holidays, ski seasons, DOC/Interislander alerts, GeoNet, MBIE ADP/TVF/MRTE/IVS, Stats NZ, MetService, NZTA, RBNZ FX, airport and port/cruise adapters |
| Public source adapters | Every configured public source ID uses a concrete official/public transport or a required Argus read-only Job; Christchurch sports, UC and Lincoln dates, racing, cruise and airport monthly sources are registered separately | implementations, live-source probes and bounded two-pass local acceptance verified; Lincoln contract, local evidence copy, ACK purge and idempotency verified on 2026-08-04; schedules remain disabled |
| New Zealand major-market coverage gate | 15-market executable matrix distinguishes official, demand, disruption, seasonal and local-flow layers and names every required source | 14 direct markets plus Dunedin's verified Argus path; DOC closures and ADP/TVF/MRTE route to all 15 markets, IVS/Stats provide national context, and MoT plus Auckland Airport passed repeat persistence |
| Nationwide resolved-address signal routing | LINZ free-text address search resolves standard geography before `FULL`, `REGIONAL` or `NATIONAL_ONLY`; 17 regions have explicit keys, non-major addresses run the 19-source national baseline, and coverage limitations are frozen into snapshots/results | 17-Region provider corpus; ambiguity/low-confidence/cross-region/expiry/concurrency regression; isolated PostgreSQL cache and confirmation-promotion tests; live Wellington query returned `source`, then `database` after Web restart with zero Property rows |
| Canonical event persistence | Source-normalised series/occurrences, exact canonical matching, venue linkage, idempotent repeat writes and preserved source state | verified by Worker unit tests and local database integration regression |
| Event impact evidence v2 | Versioned evidence validation, provenance/time precision, cross-source aggregation, trusted venue enrichment and conservative promotion | unit/integration verified; attendance or independent official-scale plus demand evidence can qualify; capacity-only and same-domain corroboration stay pending; one canonical signal retains all lineage |
| Local source acceptance standard | Development-only guard, hard-disabled development scheduler, bounded real collection, immutable run evidence, two-pass idempotency, retention, Redis lock, lease recovery, unchanged source configuration and full quality gate | verified and required for every implemented collection channel |
| Manual import local acceptance | Bounded operator-file parser, source/canonical accommodation persistence, immutable observation identity and evidence retention | implementation and fixture/database regression verified; genuine operator file and two-pass real-file evidence remain not_verified |
| Eventfinda browser collection | Nationwide discovery, detail frontier, persistence, retention and unattended stability | bounded acceptance and development-bootstrap implementation verified; nationwide run evidence is recorded in the source-specific document; unattended production evidence remains |
| Ticketmaster browser collection | Five-city discovery, durable detail frontier, bounded hydration, exact-target canonical persistence and cooldown | implementation and automated two-pass database acceptance verified; latest bounded live detail acceptance remained challenged and stopped without bypass |
| Source controls | Every environment requires enabled, operationally healthy sources; development additionally hard-disables automatic scheduling | verified by Worker unit and integration tests |
| Degraded source behavior | Optional source failure is audited while valid formal evidence can still complete | verified by Worker integration tests |
| Preview/formal pipeline | Two-date preview, 30-date formal result, multi-unit confirmation, cache reuse | verified by Worker integration tests |
| Email policy | Formal happy path creates and sends exactly one `RESULT_READY` delivery | verified by Worker integration and Mailpit smoke |
| Abuse controls | Idempotency, device/unit preview and formal email/unit limits recorded in usage/decision tables | verified |
| Retention | Redacted short-lived RawArtifact creation and expired payload deletion | verified |
| Failure controls | Redis lock contention/reacquisition, lease recovery only after expiry, retry schedule, dead-letter and blocking quality-gate tests | verified |
| Production fixture guard | Production config rejects both demo and fixture provider modes | verified |
| External live OTA collection | Tymra accepts strict public `resolve_listing`, `discover_listings` and `collect_rates` contracts for the six active brands and routes each source only to its public connector; address-first checks synchronously resolve and collect the first usable comparable, preserve provider brand/family and never fall back to fixtures | 2026-08-12 Pro-member live E2E passed for direct Bookabach URL (`NZD 591`, two nights) and LINZ address benchmark (`NZD 250`, two nights), both non-demo `PUBLISHED`, `priceResultStatus=COMPLETED`, one observed source and recommendation `NOT_AVAILABLE`; direct URL and address used distinct slots because they were distinct physical properties. Partner APIs remain deferred |
| Nationwide live panel | Schema, schedules and coverage operations exist; real 1,000-1,500 units require live catalog sources | external prerequisite |
| Quality baseline | Lint and workspace typecheck pass; current aggregate evidence is 218 Web/domain/provider/database unit tests, 135 Worker tests, 105 isolated PostgreSQL integration tests, a 114-page Next.js build and four Worker entrypoint builds; Next.js reports only LinkeDOM's unused optional-canvas warning | verified |
