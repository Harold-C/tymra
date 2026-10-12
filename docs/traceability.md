# Tymra 实现与验收追踪

更新：2026-10-12。实际生产 Tymra 为 `ec71a710`／`membership-launch-20261012`。
首发会员、容量价格及前序注册处理已按授权发布；客户网站继续仅允许既有批准 IP，
`SMTP_URL` 留空、`EMAIL_PROVIDER=log`，付费及新查询开关保持关闭。发布和实际登录证据见下节。
此前 Christchurch Sports 场馆解析修复、固定候选发布、原周计划恢复及原失败窗口两轮关联回补验收均已完成，
原故障单已正式 RESOLVED，来源为 enabled／PRODUCTION／HEALTHY；
下一次为 NZ 2026-10-19 00:55:54。
本次上午回补前后均为 80/84 计划开启，其他来源和计划保持本轮进入时的状态。
本次未发布 Argus；最近已核验版本为 `b5778788`／`argus-release-20261011-3`。
此前 Booking 详情、弹窗、就绪响应及 API／Worker DNS 修复和两轮公开报价验收保持，
原日计划恢复和当时 nextRun 的历史记录见下节；本轮只验收 Sports 原故障窗口。
原 Sports 失败 Job／Run、其他失败与证据／计数保留；Sports 首个恢复后自然周周期及长期稳定性待验。
本文件维护当前实现、最近已记录的环境和验收缺口；下一步见[实施计划](implementation-plan.md)，
目标合同见[产品入口](product/README.md)，变迁见[决策记录](decisions.md#文档与运行阶段变迁)。
历史提交、镜像、计划数量及 nextRun 均须在下一次操作前重新核对。

## 2026-10-12 管理员授予权益本地实现

用户指定普通账户的目标为 Portfolio、100 个房源、长期有效。新增独立授权记录、
带原因的预览/保存/调整/撤销入口，以及 Web/Worker 共用的有效权益解析；财务订阅和用量保留。
普通购买上限 50 与管理员容量上限分开。邮箱验证、采集、发信及高级能力开放门槛继续保持。

独立 55442/56392 测试库的 15 项新增数据库/API/Worker 检查通过，包括管理员/Origin、
范围与版本、幂等/并发、真实 100 对象边界、缩容归属、撤销、到期、历史和 Portfolio 调度。
五项 NZ 自然月/截止日/永久授权领域测试通过。实际 EN/ZH 桌面与手机授权/撤销四流程通过，
320/390/1440px 无横向溢出，axe serious/critical 为零；测试专用收据与截图保存在本机运行目录。
此处只记录本地验证。固定候选完整 CI、实际生产恢复/发布以及指定账户授予另行核验后更新。

## 2026-10-12 首发会员与价格生产发布及验证

用户明确授权复查后发布，同时继续只允许其 IP 访问、发信服务留空。
从独立会员工作树整合最新 Sports 修复与恢复记录，保留主工作区原有 19 个修改/新增文件，
没有修改其源码挂载或日常开发数据库。核查中修正了过期测试日期、旧 Pro 容量预期及
过期住宿日期的页面说明，并新增拒绝过期查询时不创建 Price Check、不扣额、不入队的回归。
最终固定提交为 `ec71a71004a0d859bd4985dc523d10306c0ae550`，标签 `tymra-release-20261012-3`。

| 范围 | 实际结果 |
| --- | --- |
| 最终候选门槛 | [完整 CI](https://github.com/Harold-C/tymra/actions/runs/38185307123) 的 verify/browser 均通过；812 单元、183 数据库/API/Worker 集成、6 项空库 OTA 合同、35 基础浏览器、8 会员矩阵及 18 首发会员浏览器场景通过；类型、lint、550 文件边界及 Web/Worker 构建通过。5 单元、6 集成及 1 基础浏览器条件跳过不计通过；同 SHA 的 [main CI](https://github.com/Harold-C/tymra/actions/runs/38186110542) 也通过 |
| 固定镜像 | [私有镜像导出](https://github.com/Harold-C/tymra/actions/runs/38186103412) 绑定同一提交；源码包 SHA-256 为 `afb3463bf2677c075cc95428b00fb96dc0f6db21e595e428b04932bdcd9c9170`。包、全部镜像层与配置哈希核对后，四应用实际镜像均为 `sha256:f47a0e1b98585f56117bd77fc2bfb4e7b7353ef41bddd5e3304161ddc97a3107` |
| 最新配对恢复 | 在四应用暂停且无运行/到期待执行/活动外部任务时备份数据库、证据及实际回退配置；在隔离内部网络实际恢复 88 张原业务表与 1,034 个证据文件，文件内容、所有者和权限匹配；最终镜像应用两项增量迁移，43 项完成、零新增表，原业务行保持；新旧镜像各读取 88 个 Prisma 模型通过 |
| 正式切换 | 仅重建 Tymra Web/API/Worker/Scheduler，41 → 43 迁移完成；原有业务列的行摘要保持，索引/约束/trigger 与恢复迁移参考匹配。原网络、DNS、挂载、Traefik 标签和秘密逐项保持，仅追加/更新发布版本、源码提交与首发容量上限 50；其他生产容器身份、镜像、环境和状态保持 |
| 运行与证据 | Web/API healthy，四应用重启计数零；数据库、Redis、Argus 就绪，Worker/Scheduler 心跳指向实际发布提交；1,036 个保留证据引用的文件和内容哈希通过。既有四条失败任务对应的 `FAILED_JOBS_PRESENT` 告警保留，没有用发布隐藏历史失败 |
| IP 与邮件 | Cloudflare 规则 `cd44303c81424ec8a100054305fb8edd` 重新读回为活动/Block，既有三个允许地址与源站白名单一致，含本次当前 IPv4 `202.92.218.197/32`。允许网络登录页 200；另一网络首页/登录、源站直连及伪造允许 IP 的转发头均 403；后台登录 200，noindex 保持。不存在的 HTTP ACME 令牌 404，HTTPS 客户路由的同路径仍 403；未触发证书续期。所有四应用的 SMTP 留空、日志邮件及关闭付费设置保持 |
| 实际普通账户 | 指定既有 Free 账户密码登录 201，会话及会员信息 200；新计费版本 `launch-2026`、容量 1、首发上限 50、邮箱验证门槛及付费关闭读回正确。EN/ZH 登录/注册/价格、账户/账单/设置共 12 个页面 200；退出 200，随后会话 401；本次验收会话已撤销 |
| 页面与业务读回 | 实际浏览器显示 NZ$0/19/99/249 四档及关闭购买状态；100 个对象的 Portfolio 参考月费 NZ$449，并注明容量审核。客户仍 1、报价 56、计划 80/84；没有新增监测对象、Price Check、配额用量、验证令牌或邮件交付，采集与来源业务表全行摘要保持。登录验收仅新增会话和审计，迁移及版本心跳变化独立核对 |

现行四应用 Compose：`/srv/apps/tymra/releases/membership-launch-20261012/compose.json`。
最新备份：`/srv/apps/tymra/backups/membership-launch-20261012-cutover`；包含数据库/证据校验清单、
实际旧环境与回退 Compose，并校验保留的旧镜像归档。旧镜像为
`sha256:72686ab3d1981fc7f986bfd95dcd5d6a70382131af97092a983142f0aa0d0a06`，
其读取迁移后数据的兼容性已实际验证，回退应用不要求还原业务数据库。
恢复审计 `cmv4ii5cm0001mv16oc7jpcpo` 已持久化为 `production_backup_restore_verified`。
受保护验收回执与实际价格截图在本机
`runtime/release-candidates/membership-launch-20261012`；本次临时恢复容器/网络/卷及可丢弃测试容器已移除，正式备份和镜像归档保留。

本次完成私有生产安装、普通账户登录和价格页面验收。真实 Stripe Sandbox 新阶梯生命周期、
live Prices/Portal/Webhook/税配置、SMTP 到达、真实会员自然调度和容量/成本仍未验收；
付费、新查询、导出等现行开关保持，超过 50 的价格仅作参考，客户 API/Webhook 延后。
不得把本次代码发布、旧 Sandbox 或模拟付款视为付费/邮件开放或完整客户产品验收。

## 2026-10-12 首发会员与容量价格本地实现

本次按批准的[会员合同](product/membership-plans.md)完成首发实现，位于独立工作树
`/Users/haroldchen/Development/tymra/worktrees/membership-launch`，基线为
`4955649d12af880c6790582894b9a8a165f0f17c`。候选包含从主工作区保留的前序注册修改；
83 个变更源码/测试/配置文件的内容 SHA-256 为
`5c28fda4981eff1a8d9943696652162b6c31acd4654aed678b1f32feec61b81d`：
按相对路径排序，以 `路径 + NUL + 文件内容 + NUL` 汇总，排除 `docs/` 和根 README。
本地实现阶段主工作区原有 19 个修改/新增文件保持，当时未合并、提交、推送或部署，
未修改生产数据、公网访问白名单、真实 Stripe 配置或发信配置。下述通过项只证明该阶段本地候选；
后续固定提交及生产验收见上节。

- 四档月付价格及 EN/ZH 价格表、容量计算器：Free 1；Host 1/$19、5/$29；
  Pro 20/$99；Portfolio 50/$249。边际扩容至 200，超过 200 单独报价。
  购买容量与功能档位分别计算；开通容量门槛默认 50，未完成容量验收不扩大付费开放范围。
- 新计费按独立 Sellable Unit；地址基准可以原位转换，跨平台同单位不重复占额。
  旧付费合约保持旧价和旧 Property 身份，明确报价并付款后才迁移。
- 付款前签名报价、付款确认后开通；降级/缩容在下期边界保留用户选定对象；
  任意容量可取消，到期回 Free 并停止全部监测；首次付款失败无宽限，续费失败宽限不重复延长。
- 账期查询/导出配额、正向差额按比例增补、失败退额、同配置精确新鲜缓存免额；
  售罄必须展示对应日期、来源和检查时间。CSV/XLSX 导出为加密不可变快照，重复下载不扣额，
  保留期/离开方案导出独立控制，跨账户拒绝。
- 每对象有界增量调度、入住人数/晚数保留、停用取消本账户待执行任务；
  Pro 策略/可比对象偏好、Portfolio 分组及批量预览/原子确认；策略不改写已发布价格证据。
  Host 核心提醒、Pro/Portfolio 阈值及邮件偏好、提醒去重和查看依据已实现。
  团队、年付、客户 API/Webhook、OTA 写价和扩展异常趋势提醒仍在首发范围外。

验证：`pnpm test` 803 通过，5 个原有 live direct-HTTP 条件场景跳过；隔离 PostgreSQL
会员/API/后台/Worker 集成 85 通过；末次缓存及旧合约转换修正的 15 项定向回归通过。
最终 18 项桌面/手机联合流程通过；隔离配置使用两个文档专用 IP 模拟不同设备客户，
避免累积登录撞上单 IP 限额，实际应用限额未放宽。
末次缓存/旧合约身份修正未改变这些浏览器场景，复用其 UI 证据并重跑相关服务端测试。
EN/ZH、320/390/1440px 横向溢出、相关页面 axe serious/critical 为零，人工核对价格、
报价和组合页面截图。类型、lint、Web/Worker 正式构建通过。两个 additive migration
仅应用于专用测试库；旧合约回填及 201 容量拒绝已通过真实 SQL 回滚探针。
曾在重复使用测试库时触发固定时间审计哈希重复；重建本次可丢弃测试库后完整 85 项通过，
未放宽生产审计约束。浏览器付费变更/组合操作使用 UI fixture，服务端行为另由集成测试证明。

未验收：当前候选真实 Stripe Sandbox 生命周期、生产 Prices/Portal/Webhook/税配置、
SMTP 到达、真实会员自然调度、50 及以上对象的负载/成本和生产业务验收。
该阶段证据不授予付费开放或扩容；后续私有代码发布见上节，剩余商业门槛见[客户验收计划](implementation-plan.md#4-验收同版本客户产品并开放入口)。

## 2026-10-12 指定普通客户账户创建

按用户明确要求，为指定邮箱创建普通 `ACTIVE`／`FREE` 客户账户
`cmv49v20d0000s2f4vjiirq0z`。使用当前生产镜像内的加密、密码哈希、Free Membership
及 Benefit Group 逻辑，在单一事务内完成客户、权益组、账户／邮箱风控身份和审计记录；
没有创建管理员或修改既有账户。邮箱保持未验证，营销许可关闭，没有发送邮件或启动采集。
生成的随机密码只保存于本机现有受保护凭证目录，目录 `0700`、文件 `0600`，不进入 Git 或对话。

实际 HTTPS 验证：密码登录 201、已认证会话 200、Free 会员信息 200、账户页面 200；
退出 200，退出后会话 401。邮箱未验证导致 `EMAIL_VERIFICATION_REQUIRED`，
没有 Price Check、Property slot、配额用量或邮件验证令牌。验证会话已退出。
创建前快照、变更记录、恢复说明及验收保存在
`/srv/apps/tymra/backups/customer-create-cozynest-20261012`；审计事件
`cmv49v23p0008s2f4jvbhn3i1`。当前 IP 白名单及生产版本保持，未部署本地注册流程改动。
此项证明指定账户的创建和密码登录，真实邮箱验证及完整客户产品验收仍待完成。

## 2026-10-12 追加当前公网 IP

按用户要求，在原 Cloudflare 规则及源站白名单中追加本次核对的精确公网 IPv4 `/32`，
原 IPv4／IPv6 均保留；`tymra.nz` 范围、证书验证路径例外及 `ops.tymra.nz` 保持。
操作前确认线上已使用 `christchurch-sports-20261012`，以该实际配置追加，
没有恢复旧版本。当时 Web 配置为
`/srv/apps/tymra/releases/christchurch-sports-20261012/customer-ip-add-20261012-compose.json`；
原配置、精确地址、容器快照、Cloudflare 前后规则及验证记录保存在
`/srv/apps/tymra/backups/customer-ip-add-20261012`，可用原 Compose 回退 Web。

仅重建 Web，镜像保持
`sha256:72686ab3d1981fc7f986bfd95dcd5d6a70382131af97092a983142f0aa0d0a06`，
环境变量逐项相同，挂载及网络保持，其余八个容器的身份、镜像及环境保持。
当前网络登录页 200，内置浏览器实际显示登录表单；另一网络首页及登录页均 403，
源站直连与伪造允许 IP 转发头均 403；后台登录页 200，Web healthy。
证书验证路径的不存在令牌为 404。本次没有验证旧网络的实际连通性，也没有新增 IPv6。

## 2026-10-11 客户网站仅允许当前 IP 访问

用户要求 `tymra.nz` 只允许其当前 IP 打开。Cloudflare 自定义规则
`Tymra private preview - Harold current IP only`（`cd44303c81424ec8a100054305fb8edd`）已启用，
仅放行操作时核对的精确公网 IPv4／IPv6，其他来源 Block；保留 HTTP 证书验证路径。
源站 `tymra-public` 同时加入 `tymra-customer-ip-only` 中间件，按来自已信任 Cloudflare
代理的最后一层转发 IP 检查白名单，未信任的直连请求和伪造转发头均拒绝。

当时 Web 配置为 `/srv/apps/tymra/releases/booking-details-readiness-20261011/customer-ip-only-compose.json`；
回退配置、精确允许地址、容器快照及验收读回保存在 `/srv/apps/tymra/backups/customer-ip-only-20261011`。
仅重建 Web，应用镜像与环境变量保持；其他容器、共享代理、后台入口和采集服务未变。
实际验证：允许地址的 IPv4／IPv6 登录页均 200，内置浏览器可打开；另一网络的首页和登录页
均 403；源站直连及伪造允许 IP 的转发头均 403；后台登录页 200，Web healthy。
证书验证路径的不存在令牌返回 404，未触发真实续期。公网 IP 改变后需要更新两处白名单；
共享同一公网 IPv4 的设备也可访问。没有创建客户、数据库写入、源码发布或发信配置变更。

## 2026-10-11 普通用户登录域名配置

用户最终收窄为只配置普通用户登录域名。Cloudflare 已新增代理 A 记录
`tymra.nz → 148.135.121.30`；原 `ops.tymra.nz` 保持。仅重建 Web，沿用原生产镜像
`sha256:14510b34130ca55cdcb5636b412857cf08d12898c427a5daf33095f5684d06e2`，
新增 `tymra-public` HTTPS 路由并将 Web 的 `ADMIN_ONLY_ACCESS` 改为 `false`。
当时配置为 `/srv/apps/tymra/releases/booking-details-readiness-20261011/customer-entry-compose.json`；
原配置和运行快照保存在 `/srv/apps/tymra/backups/customer-entry-20261011`，可用原 Compose 回退 Web。
秘密及其他环境值逐项保持，其他服务容器、镜像、环境未变；没有数据库写入、迁移或采集操作。

`https://tymra.nz/zh/sign-in` 已在内置浏览器打开；源站验证 HTTPS 200，未认证客户会话 API 401，
后台登录页也正常。隐藏发现、noindex、检查／支付关闭及 `EMAIL_PROVIDER=log` 保持；真实发信未配置。
本轮前序注册邮件失败处理等源码改动保留在本地，未 commit、push 或部署。
域名接通不代表新账户建立、真实邮箱验证或完整客户产品验收；`www` 未配置。

## 2026-10-12 Christchurch Sports 原失败窗口回补与故障单关闭

用户明确授权继续完成原失败窗口的关联回补验收，通过后关闭原故障单。
在已部署的固定版本 `1f87746a` 上，入队前将原窗口冻结为
UTC `2026-10-10T11:00:00.000Z` 至 `2027-01-08T11:00:00.000Z`
（NZ 2026-10-11 00:00 至 2027-01-09 00:00）。两轮 requested／effective 范围与
原失败 Run 完全一致，沿用原 productionCanary、limit=2、maxRequests=3、90 日窗口和
并发 1；没有使用当天重新生成的滚动窗口，也没有修改原计划或原失败 Job／Run。

两轮通过既有原生 Job 队列、生产 Worker 和来源锁执行，maxAttempts=1，间隔超过
既有五分钟人工冷却。每轮入队均在事务中关联原故障单，并保存前一恢复关联的审计。

| 轮次 | 精确 Job／CollectionRun | 原窗口真实结果 |
| --- | --- | --- |
| 1 | `cmv4a1jpk0000moc15vp6m58j`／`cmv4a1k9r0036mo07a4ei3yca` | 三个官方页面、两条成功、零失败、unchangedSkipped=2 |
| 2 | `cmv4a8bnn0000moe45ywu1nbx`／`cmv4a8c0r0038mo07u38fl82h` | 三个官方页面、两条成功、零失败、unchangedSkipped=2 |

两轮记录仍为 11 月 12 日和 12 月 15 日的两场 Canterbury Cricket 赛事。
源 occurrence 的 lastCollectionRunId 指向最新恢复 Run，源与 canonical 标题、日期、
场馆一致，业务身份和关联 ID 保持；source event／occurrence／各自 canonical link
数量均为 2，重复执行零增长。四份 PostgreSQL 原始结构化 payload 的 SHA-256 实际核对
通过，parserFailure=false、非敏感、72 小时保留。今日 Sports 请求总数由 6 增至 12，
没有超过每日 24 次上限；预算和并发配置保持。

两轮验收通过后，经现有管理 API 的 RESOLVE 门槛关闭故障单
`cmv360fpa0074o9070gcxw6tf`，HTTP 200，实际持久化状态为 RESOLVED／RESOLVE，
resolvedAt 为 UTC `2026-10-11T20:38:32.357Z`（NZ 2026-10-12 09:38:32.357）。
retryJobId 为第二轮 `cmv4a8bnn0000moe45ywu1nbx`；两轮入队关联审计均保留，
正式关闭审计 `cmv4acmgx0005s207mxg5zg9d` 写入 `RECOVERY_VERIFIED` 及精确恢复 Job／Run。
操作使用的临时管理会话已撤销并读回。

旧失败 `cmv360dpf0009rw070npabvx4`／`cmv360ehw0072o907nd3ztywr` 保持 FAILED，
全行摘要未变。其他来源、全部计划、其他故障单、价格、客户与请求数据的摘要与
本轮写入前快照一致；本轮进入时已有 80/84 计划开启，未沿用凌晨 81/84 的旧快照。
四应用镜像、容器身份、配置和客户入口 IP 配置未变，重启零，health／readiness 200，
Worker／Scheduler／DB／Redis／Argus 均正常，零在途作业。原 Sports 周计划保持开启，
nextRun 仍为 NZ 2026-10-19 00:55:54.838，首个自然周周期和长期稳定性独立待验。

收据保存在本机既有 `runtime/release-candidates/christchurch-sports-20261012/incident-window-*.json`
及生产既有 `/srv/apps/tymra/releases/christchurch-sports-20261012`；本轮未改变应用源码、镜像或迁移。

## 2026-10-12 Christchurch Sports 修复发布与恢复

用户明确授权修复、push、发布生产并启用。官方 Crusaders 页面已经切换为 2027 Draw，
八场主场使用 `One New Zealand Stadium`；旧解析仅接受场馆文本包含 Christchurch，
因此在首个页面报 `PARSING_ERROR`，尚未读取正常的 Cricket 页面。
本次接受该场馆及 `One NZ Stadium` 的确认名称，保留原场馆文本与稳定赛事 ID；
仅全部为有效客场赛程时允许结构明确的空结果，未知主场、空表、缺年和坏日期仍不能
冒充成功。HTTP／挑战失败继续保留。公共计划失败暂停时同步降为 DEGRADED，避免旧健康标签残留。

固定候选 `1f87746a8e4d8e98c4f2cd33b9702fd230ecc680`／`tymra-release-20261012-2`
的[完整 CI](https://github.com/Harold-C/tymra/actions/runs/38135100478)通过：lint、类型、
792 项单元、165 项隔离集成、6 项空库离线 OTA、生产构建、29 项桌面／手机浏览器及
8 项会员矩阵。5 项单元和 6 项集成为条件跳过，不计通过；专门 Sports 回归为 9 项通过。
最终增加了“未知主场与有效客场混合仍报错”的守卫；早期候选 `b44de907` 已被取代，未部署。
[私有固定镜像导出](https://github.com/Harold-C/tymra/actions/runs/38135724461)绑定同一提交，
源码 archive SHA-256 为 `aed623d30807f06b764c4cbf0c3f8b9c1acc9cb12321c8afae825dfdc7df4589`。
目标镜像 `sha256:72686ab3d1981fc7f986bfd95dcd5d6a70382131af97092a983142f0aa0d0a06`
的私有包、全部层及配置哈希核对通过，未包含本地未提交的客户注册改动。

切换前在应用暂停窗口创建 `/srv/apps/tymra/backups/christchurch-sports-20261012-cutover`，
将真实数据库与 1,032 份 evidence 文件恢复到独立内部网络。88 张业务表的全行摘要、
索引／约束／触发器、证据内容／权限／属主匹配，新旧镜像均完成 88 模型只读兼容检查；
迁移保持 41，没有新增表或迁移。仅本轮隔离容器、网络及副本卷已清理，正式备份保留。
四应用实际镜像与版本一致，重启零，Web／API healthy，Worker／Scheduler 版本心跳及
DB／Redis／Argus readiness 正常；1,034 个保留文件指针实际哈希通过。客户域名既有 IP
限制、入口、配置秘密、挂载及 API／Worker DNS 保持，其他生产服务配置与身份不变。

生产新版直接解析当前官方页：HTTP 200、八场 Crusaders 主场，全部在当前
NZ 2026-10-12 至 2027-01-10 的 90 日窗口之外。两轮原生恢复试采沿用原计划 payload
`{"limit":2,"sourceId":"christchurch_sports","marketScope":"new-zealand","productionCanary":true}`：

| 轮次 | 精确 Job／CollectionRun | 实际结果 |
| --- | --- | --- |
| 1 | `cmv3rlvoq0000mo397ijzjfi6`／`cmv3rlvya0002mo07v2nlu34p` | 单次尝试、三个官方页面、两条成功、零失败、unchangedSkipped=2 |
| 2 | `cmv3rmvq40000mo4xsqchecpl`／`cmv3rmw910004mo07uw2dfqox` | 单次尝试、三个官方页面、两条成功、零失败、unchangedSkipped=2 |

有效记录为 Hagley Oval 的 Canterbury Kings vs Northern Brave (M)（11 月 12 日）和
Canterbury vs Wellington（12 月 15 日）。源赛事及 canonical 链接的标题、日期和场馆一致，
两轮 source／occurrence／canonical link 数均为 2，重复入库零增长。四份 PostgreSQL
结构化原始记录的实际 payload SHA-256 匹配、无 parserFailure／敏感数据，保留期 72 小时；
这类直接公开来源没有 Argus HTML／截图交付。其他来源／计划及原失败 Job／Run 摘要一致。

两轮证据通过后，原计划 `cmuj5u3de000tp73mq48cvha6`／
`pilot-public-christchurch_sports-weekly` 原生恢复 enabled，weekly、原 payload、每日预算 24
及并发 1 保持。来源为 PRODUCTION／HEALTHY，nextRun 为 UTC 2026-10-18 11:55:54.838
（NZ 2026-10-19 00:55:54.838）；81/84 计划开启、56 条价格、零客户、零在途作业。
Agoda／Airbnb／Eventfinda 未改动。旧失败 `cmv360dpf0009rw070npabvx4`／
`cmv360ehw0072o907nd3ztywr` 保留。上述凌晨滚动窗口试采结束时，故障单
`cmv360fpa0074o9070gcxw6tf` 为 OPEN 且没有关联 retryJob。后续上午完成的原失败窗口
关联回补及正式关闭见上节；恢复后的首个自然周周期和长期稳定性仍待验，历史失败记录保留。

收据在本机既有 `runtime/release-candidates/christchurch-sports-20261012`，生产配置及恢复
证明在 `/srv/apps/tymra/releases/christchurch-sports-20261012`。后续文档提交不改变上述固定镜像源码。

## 2026-10-11 Booking 详情与间歇性 503 修复、生产发布及质量验收

用户明确授权修复、发布生产、完成质量验收后恢复 Booking 计划。
NZ 10-10 的自然父 Job `cmv0y5874000dny076x50jyn0` 在 Otago 的 Lake Resort by Marsden
详情解析失败。原快照九个单位中前六个共享类型未知，后面的 Family Room／`17967311`
具有明确 PRIVATE／最多六人；旧提取器先按 `maxRecords=1` 截断，再过滤未知单位，
因此遗漏有效单位。Argus `93709f5a` 先过滤有证据的单位再截断，未知类型仍不猜测。
Tymra 将 Booking 详情缓存键升级为 `booking-room-state-2`，新输入哈希触发重新取得详情，
旧版房型缓存不用于替代本轮修复后的详情验收。
原 HTML 的禁止网络回放复现旧版失败并验证新版读取有效单位；
原文件 SHA-256 为 `ab909623a4efa4ca0b7f472d73016ff9f0b8b9164ef5e36419675b621cd76688`。

生产日志中此前 48 小时 161 次就绪 503，最近 24 小时 14 次，其中 11 次约五秒
Argus 超时，其余与 QUIC 隧道断连相邻；当时无应用 500、重启或 OOM。Tymra 新版
并行读取并验证 Argus `/health`、`/readiness` 的完整 JSON，HTTP 成功且明确
`healthy/ready=true` 才通过；HTML、无效 JSON、错误状态或 false 继续失败，未添加假健康、
缓存或扩大超时。实际专属 Argus tunnel 改用 HTTP/2，四条连接注册、实际 HTTPS 通过，
DNS、Access 和 token 保持。依据见 [Undici](https://github.com/nodejs/undici) 和
[Cloudflare 故障说明](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/)。

Tymra 固定候选 `a0d5ae36b7cde2e9d0ca09257d7435ed8a920de1`／`tymra-release-20261011-2`
的[完整检查](https://github.com/Harold-C/tymra/actions/runs/38095293001)通过：lint、类型、
构建，provider 268、应用 515、数据库/API/Worker 164、另六来源空库交付六项、桌面/
手机 29 和会员矩阵八项通过。五个 live direct-HTTP 条件跳过位于本次 Booking 范围外，
六个空库条件另行执行，一个响应式重复场景由桌面覆盖。完整 CI 发现的队列幂等
空更新 upsert 竞争也已修复为原生去重插入并读取原记录；重复输入不覆盖原 payload、
租约或尝试次数。镜像排除 `.git`／`.env`、checkout 不保留认证凭证；
[固定导出](https://github.com/Harold-C/tymra/actions/runs/38095849690)全部内容/配置/哈希通过。
实际四个应用容器均为
`sha256:14510b34130ca55cdcb5636b412857cf08d12898c427a5daf33095f5684d06e2`，
原环境、挂载、网络和入口保持，41 项迁移、无新增迁移。最新切换备份实际恢复
88 个业务模型与 970 份原始证据文件，候选/旧版读取兼容，原文件字节、权限、属主和链接
保持。生产原不可变记录逐项核对通过，正常公共周期及维护回补变化有精确 provenance。
恢复审计 `cmv33tos40001pg5ai7cbcz4z` 已入库；备份和兼容回退材料保留。

Argus `93709f5a` 的[完整发布检查](https://github.com/Harold-C/argus/actions/runs/38093620443)
与[固定导出](https://github.com/Harold-C/argus/actions/runs/38095407939)通过。
实际镜像 `sha256:abb31c4700b6cc7b198226c4fd73f7fba3ecdce5a2dc36fed83f1fd684ea61fc`，
最新闭合配对备份恢复 1,131 Job、两账号、65,823 私有条目；完整数据/文件和权限隔离、
两个无网络 Profile 打开通过，不视为实站私有认证。浏览器切换暂停 499.218 秒，
共享服务和配置保持，实际 HTTPS、44 工作流/OpenAPI、所有权与跨客户端拒绝通过。
AES-256 新鲜备份已卸载封存，0600，SHA-256
`1d24f514b77310fae5a1cb46dbb37ca9be8d0e6370769d63ae7a543a33fc7703`。

第一次私有卷 tar 复制的 stdout 被临时容器默认无限日志驱动重复记录，填满共享 Docker
磁盘并挂起清理。Harold 明确批准本次受控重启后，原容器、数据卷、数据库和配置核验保持；
Jarvis 三服务实际在 09-28 已停止，本次保持其原停止状态。仅本次临时日志/容器随恢复清除，
没有全局 prune 或删除卷。第一次归档不完整，未用于恢复/发布，失败副本独立加密封存；
新鲜配对备份重新生成。所有二进制 tar 流改用 `--log-driver none`，已核验实际生效。

Tymra 提前恢复调度时 Argus 仍在维护，AUT、Waikato、Tākina、FX 四个自然作业返回
502/无效 JSON，自动暂停来源。原失败保留；仅按原 payload 各新增一次有界回补，全部成功，
四个原 Incident 经原生证据验证 RESOLVED，来源原配置与每周原未来相位恢复。
Palmerston North 机场、雪场随后自然成功；Council、School Sport 后续自然周期也成功。
其他 83 个来源/计划已从原保护快照比对；除下述独立自然失败暂停外，静态配置保持，
变化为这些既有周期观察时间。

UTC 01:49:16 的 Christchurch Sports 自然父 Job `cmv360dpf0009rw070npabvx4`／
Run `cmv360ehw0072o907nd3ztywr` 以 `PARSING_ERROR` 失败，一次尝试、零成功／一失败，
原 payload 和调度幂等键保持，零 ArgusExecution。官方公开 HTML 解析器返回
“Christchurch official sports fixtures returned no supported records”；原生失败策略自动
将来源置为 SUSPENDED／disabled、原周计划 disabled／nextRun=null，Incident
`cmv360fpa0074o9070gcxw6tf` 为 OPEN。旧 HEALTHY 标记来自旧观察，不代表本次成功。
此次只读审计保留失败和暂停，不借 Booking 发布恢复或修复此独立来源。

UTC 02:01:48 的 MetService 自然父 Job `cmv36ghok000arw07le8f4yhm` 已完成且无失败，
但仅保留一个原始响应、零持久化业务记录；不将 SUCCEEDED 等同天气数据质量通过。
UTC 04:01 的 Ticketmaster 自然父 Job `cmv3aqhuy000brw074eztzynh` 成功，52 条记录、
零失败。两者原 payload、调度幂等键及静态配置均从原快照核对保持，计入本次其他来源
只读基线更新，不视为 Booking 人工验收，也未借本次发布修复或重跑。
UTC 06:28:56 的 Expedia 自然父 Job `cmv3g00ug0000rw08xcsszz4w` 一次尝试成功；
Hawke's Bay 发现及未来报价两个 Run 各一成功、零失败，三个 ArgusExecution。
原 payload、调度幂等键及静态配置保持；原生日计划推进有精确 provenance，
已计入只读基线，不计作 Booking 人工验收。

UTC 00:25:17–00:40:08 的固定版本就绪观察 60/60 通过，零失败、隧道失败事件、重启和
OOM；长时稳定性仍未验证。第一轮父 Job `cmv33uwbu0000o9151ngelfk9` 在
`check-in:failed` 终止，未产生报价。保留截图的优惠弹窗明确可关闭；动作处理器不会在
可见性轮询时触发，关闭弹窗还可能关闭日期选择器。补充 `f841c35d` 在步骤边界明确关闭
精确优惠弹窗、保留点击竞态处理，并经原日期控件重新打开日历；总共最多两次关闭，
密码/验证码/非官方路由仍拒绝。隔离原失败重现、修复后正例与拒绝例、15 项导航回归通过；
本机另七项因缺少容器 `/data` 目录失败，不计通过。
`f841c35d` 的[完整镜像检查](https://github.com/Harold-C/argus/actions/runs/38100240635)
为 1,143 通过／一失败／13 条件跳过：原反复弹窗次数边界断言失败，未发布此候选。
每步重新注册处理器重置其两次预算，第三次回调抛错未经过正常步骤失败包装。
`b5778788` 只按剩余次数注册，耗尽后保留正常失败路径，不修改原断言；旧版本机
复现失败，新版原次数边界用例通过。新[完整检查](https://github.com/Harold-C/argus/actions/runs/38102157939)
已通过：源码 929／固定镜像 Chrome 1,144 通过，零失败；198／13 条条件用例在对应环境
全部执行，合成配对恢复与运行／故障恢复通过。
[固定导出](https://github.com/Harold-C/argus/actions/runs/38104063388)通过，下载 656,739,520 字节，
12 层和执行配置匹配，本地实际镜像
`sha256:2068cc30d0dddb1b7902000d4804689747e9f6231fe8656b033032cfb6bf8981`。
ML-Mini 容器磁盘可用 2,394,243,072 字节，未共享层／工作空间／保留余量要求
3,245,557,196 字节；安全门槛在加载前拦截。Harold 明确批准后，仅清理旧镜像
`d2dfc536`／`argus-release-20261009-4`，ID `e6f56bcc`，
零容器引用，独立恢复归档实际 SHA-256 与原层／配置验证收据一致；当前 `93709f5a`、
最新回退 `eaed587a`、全部数据和其他服务保留。新鲜前后核验所有其他镜像、容器状态／
环境／挂载和数据库完整行／结构相同；可用空间升至 5,616,427,008 字节，新镜像全部
12 层和执行配置在目标通过。没有 prune、删除卷、新的共享重启或扩大清理范围，旧版
独立恢复归档保留；原容量拦截记录也保留。
最终镜像已实际切换；最新配对恢复核对 1,147 Job、两账号、66,262 私有条目，全部
文件字节／权限／属主／链接一致，四项所有权拒绝、两个无网络 Profile 打开通过。
无仍可交付 wire／远端证据，本次两类恢复计数为零；不引用旧恢复数字代替。
切换暂停 586.655 秒，Tymra 执行与调度协调暂停后原容器、镜像和计划恢复，避免维护中
启动采集；数据库、共享服务、环境和挂载保持。实际 HTTPS、44 工作流／OpenAPI 和
跨客户端拒绝通过，原 HTTP/2 隧道保持同一容器／配置，无新的隧道重启。
最新 AES-256 备份已卸载封存，0600，4,846,661,120 字节，SHA-256
`d10f82bc3105f8ca680e01a025163376090bb2b8e419965308d87493d77364e5`；
仅本机本次隔离恢复容器、卷和网络已清理，生产及封存备份保留。
UTC 06:10:14–06:25:16 的新版 60 次观察实际有 28 次就绪失败，零隧道断连事件，
完整失败记录保留，不据此前成功宣称新观察通过。第一轮任务成功后，证据核验读取
Argus 时两次出现 `EAI_AGAIN`；宿主机同域名解析耗时 16 秒。现有 Google 两个 DNS
上游直接六次实测四次超时；Cloudflare 两个解析地址六次全部成功，4–153 ms。
按 [Compose 服务 DNS](https://docs.docker.com/reference/compose-file/services/#dns) 和
[Cloudflare 地址定义](https://developers.cloudflare.com/1.1.1.1/ip-addresses/)，仅为 API／
Worker 固定 `1.1.1.1`、`1.0.0.1`，原应用镜像不变；宿主机及共享 Docker 全局 DNS 保持。
合成配置完整比对仅两服务 DNS 改变；现行配置中的密码哈希按既有 Compose literal
规则核对，预检发现 JSON 转义表示差异时尚未停服务或修改配置，原诊断保留。
DNS 变更使用另一个新鲜配对备份，实际隔离恢复 88 个业务模型和 1,008 份证据文件；
完整行／结构／字节／权限／属主／链接一致，无 Worker 启动，原应用镜像、环境、命令、
网络、挂载和其他服务保持。只重建 API／Worker；服务心跳正常刷新，其他业务行保持，
当前两个服务内部名称及 Argus 外部域名解析、就绪状态通过。仅本次隔离恢复资源清理，
保护备份 `/srv/apps/tymra/backups/booking-details-readiness-20261011-dns` 保留。
新完整观察使用独立 `readiness-soak-calendar-dns.json`，UTC 06:29:52–06:44:43，
60/60 通过，零就绪失败、隧道失败事件、重启及 OOM；绑定固定应用镜像、HTTP/2
及实际 DNS Compose 指纹 `cf5e2db3ba357b91921c964dc669164349ef643e523e76e9c5ae10b37a467fa1`。
前一 28/60 失败观察完整保留；此 15 分钟结果不证明未来长期稳定。
以已验证旧镜像只读挂载新版编译源码，在断网／临时 `/data` 的隔离容器中执行两份
Booking 浏览器测试文件，27 项全部通过，零失败／跳过，包含此前目录缺失用例；
此补充验证不替代最终固定发布镜像检查。
初次失败目标已恢复原 priority/nextFetchAt，失败、计数和窗口保持。
Harold 已明确批准仅本次手工验收额外一次、NZ 10-11 今日最多七次；仅在第一轮成功后
为第二轮安装 30 分钟例外，正式启用前已主动撤销。今日原失败一次加两轮各三次，共七次；
正常每日六次／并发一、Argus 十二次保持，未清零失败或计数。

最终固定版本的两轮实站结果如下，均为 2026-10-18–19、一晚、两成人／零儿童／一房，
未登录公开上下文、NZD、AVAILABLE／COMPLETE、非 demo、含税及强制住宿费。

| 轮次／父 Job | 实际房源与房型 | 公开住宿总价 | 证据与交付 |
| --- | --- | --- | --- |
| Otago／`cmv3febw20000o90xr23czdd5` | Lake Resort by Marsden／Double Studio - Upper Level | NZD 258 | 一次尝试；发现、详情、报价三个执行；六份 HTML／截图逐份字节与 SHA-256 通过，三份原 wire、ACK 后 PURGED／410 通过 |
| Hawke's Bay／`cmv3g81m50000oc2h72k87hil` | The Crown Hotel／Premier Studio | NZD 280 | 一次尝试；发现、详情、报价三个执行；六份 HTML／截图逐份字节与 SHA-256 通过，三份原 wire、ACK 后 PURGED／410 通过 |

两份实际截图均人工查看，房源／物理房型、精确日期、人数及价格与入库记录一致。
页面价未使用 Genius／会员参考价；未单列的组成金额仍在观察上下文为 null，
不以整数存储列的零值声称未披露费用为零。细则和费用条件另保留在正式审阅中：
Lake Resort 有 NZD 100 可退还信用卡押金（退房后 14 日内、经检查），不接受现金；
Crown 接受现金，信用卡付款加收 2%，另有 NZD 200 可退还信用卡押金
（退房后七日内、经检查）。押金不纳入住宿支出总价，NZD 280 不是所有付款方式的
最终扣款额；原 paymentTerms=UNKNOWN 保持，未人为补写未知付款条件。

冻结验收窗口从第一新父 Job 的 UTC 06:12:03.888 起，绑定 Tymra `a0d5ae36`／
Argus `b5778788`，前序版本窗口和所有失败保留。UTC 06:49 正式
`ota:production:enable` 接受以上两个精确 Job；D-039、正价、持久证据及交付门槛通过。
质量审阅 PASSED、来源 enabled／PILOT、operational／health HEALTHY；两个临时目标
恢复原 priority／nextFetchAt，其他 83 来源／计划按审计基线保持，独立 Sports 暂停保留。
原每日相位恢复为 UTC 2026-10-11 12:33:33.192／NZ 2026-10-12 01:33:33.192，
最新读回 81/84 计划、今日七次、零在途作业、正常预算与并发不变、临时例外不存在。
全部旧父 Job／Run／价格逐项摘要保持；恢复后下一自然周期尚未完成，不将人工验收等同自然调度。

应用固定镜像源码仍为 `a0d5ae36`／`b5778788`；后续配置及验收文档提交不是新的镜像源码。
DNS 配置仅 `docker-compose.prod.yml` 的 API／Worker 两服务四行，合成完整配置比对、
实际解析／运行读回及上述新鲜恢复与观察通过；无需应用重建或新增迁移。

收据保存在本机工程既有 `runtime/release-candidates/booking-details-readiness-20261011`
及 Argus 对应不可变标签的 `runtime/production-releases`，原始 HTML/截图和秘密不进入 Git。

## 2026-10-09 Booking 两项追加失败：修复已发布，两轮公开报价及正式质量通过

用户确认“修复上面两项”，随后要求“暂时不要发起ssh，我在外面，等我回家”。
Argus 候选 `24153d15f9b715ab0d808b603553597864712bb8`／`argus-release-20261009-3`
基于实际生产 `824e0dd5` 修复公开导航、报价快照和提取失败证据，不发布 main 其他
未上线私有执行器修改。Tymra 应用源码未因本候选修改，生产业务变更仅为已授权有界复测。

| 原失败 | 已核实原因及修复 |
| --- | --- |
| Hawke's Bay／`cmv05abu50000t85tdv0ibh06` | 保留页面的新 “Search in your own words” 控件没有目的地候选。只对该明确控件允许有界文本提交，并在实际结果验证可见目标地区、新西兰酒店链接和精确入住条件；普通控件仍要求新西兰候选。另修正地名撇号在 Patchright 选择器中的正则拼接错误 |
| Otago／`cmv05m46t0000t89thkculpab` | 六段报价编号第三段为零，实际成人数在第四段；旧快照把两成人报价读成零成人而过滤，回放复现 `OTA_REQUESTED_UNIT_NOT_FOUND`。修复成人／儿童字段并保留单位、人数与费用筛选；INTERNAL_ERROR 也保留送入提取器的结构化快照 |

新增浏览器 9 项、原弹窗 6 项、费用／单位 25 项、类型和构建通过。原失败 HTML
的禁止网络回放正确解析 Lake Resort by Marsden／Mountain View Studio - Ground Floor，
单位 `17967309`，2026-10-16–17、2 成人／0 儿童／1 单元、匿名含税费 NZD 297。
这是历史源页回放，不是新采集报价，也没有新增公开 RateObservation。
完整发布检查的[固定运行](https://github.com/Harold-C/argus/actions/runs/37884658331)
已通过：源码 928、固定镜像 Chrome 1,140 通过，零失败，195／13 个条件用例分别在
对应另一层实际执行；合成配对恢复、运行和故障恢复通过。
[固定导出](https://github.com/Harold-C/argus/actions/runs/37888575774)通过。证据继续保存在 Argus
`runtime/production-releases/argus-release-20261009-3` 及 Tymra 原目录的 `search-occupancy-*`。

用户回家后 SSH 已恢复；读回 Tymra `c8e9e12`、Argus `824e0dd5` 和空队列。
当前 82/84 计划开启，Agoda 和 Eventfinda 的既有停用状态作为操作前基线保持。
最新闭合配对备份实际恢复 1,050 Job、2 账号和 62,334 私有条目；数据、文件字节／
模式／属主／链接、权限隔离和禁止网络 Profile 打开通过。仅替换 Argus browser，
实际镜像 `sha256:fc225dfbaa1cb6467da295b764f8d018b10623fed1cbd7235b0d308b20c5f6d0`，
暂停 256.442 秒，PG／tunnel、共享服务、配置和挂载保持；健康／就绪、接口及权限检查
通过。备份 AES-256 已卸载封存，独立恢复副本已清理，未改变防火墙。

| 新父 Job／固定地区 | 实站结果 |
| --- | --- |
| `cmv0k0hf10000lx32um65eiaa`／Hawke's Bay | 搜索成功；The Crown Hotel 未带日期的房型表解析错误，FAILED／PARSING_ERROR，无公开价 |
| `cmv0kiork0000lx630phb6v9b`／Otago | 发现及报价均 1 成功／0 失败；Lake Resort by Marsden／Mountain View Studio - Ground Floor、2026-10-16–17、2 成人／0 儿童／1 单元、NZD 297，PUBLIC／AVAILABLE／COMPLETE，单次成功 |

八份原始文件字节哈希、四份 wire 摘要及交付、ACK 后 410/PURGED 验证通过；解析
失败文件保留 parserFailure，未将取证完成当作报价成功。新窗口起点为 Hawke's Bay
父 Job，绑定 Tymra `c8e9e12`／Argus `24153d15`，所有旧窗口与失败保持。正式连续
该批次质量门槛拒绝，NOT_PASSED／DEGRADED；临时最多两个父 Job／六次执行额度已撤回，
普通 Tymra 六次／并发一、Argus 十二次保持，当日实际 20→24 未重置。两个目标原
priority／nextFetchAt 恢复，保留新实际状态与历史；Booking 原日计划恢复 NZ 10-10
01:33:25，其他来源／计划摘要不变，82/84 开启。

详情失败已定位为优先读取隐藏的报错面板，遗漏可见未带日期的房型行。补充 Argus
`d2dfc536` 优先读取房型名所在普通行并使用渲染文本；八项本地浏览器回归、六来源
费用快照、类型／构建及原失败页重放通过。
[完整发布检查](https://github.com/Harold-C/argus/actions/runs/37892712511)和
[固定导出](https://github.com/Harold-C/argus/actions/runs/37895614751)通过，源码928／
固定镜像Chrome1,141通过、零失败，196／13个条件用例全部由对应环境覆盖。
最新配对备份实际恢复1,057 Job、2账号、62,739私有条目，数据／完整文件／权限、
wire摘要及无网络Profile校验通过。UTC07:05:30仅替换Argus browser，镜像
`sha256:e6f56bcc72ea9baf52bb7721953916cf7eac7b73659ac1a03e6d6f471f194055`，
暂停463.373秒；共享服务、PG／tunnel和配置／挂载保留，接口及权限核验通过。
AES-256备份封存、独立副本已清理；Tymra应用及普通预算未改变。

| `d2dfc536` 新父Job／地区 | 实站结果 |
| --- | --- |
| `cmv0mift50000lxa46ih6c0yi`／Hawke's Bay | 搜索与The Crown Hotel／Premier Studio／`29758205`详情成功；报价INTERNAL_ERROR，未生成公开价 |
| `cmv0mupsk0000lxd4mg1s71tl`／Otago | Lake Resort by Marsden／原精确房型／2026-10-16–17／2成人0儿童1单元，含税费NZD297，PUBLIC／AVAILABLE／COMPLETE，单次成功 |

十份文件字节哈希、五份wire交付及ACK后410/PURGED通过。新窗口从Hawke's Bay父Job
绑定Tymra `c8e9e12`／Argus `d2dfc536`；所有旧窗口、失败与价格保持。该批次正式门槛拒绝，
质量NOT_PASSED／DEGRADED；例外撤回，原目标priority／nextFetchAt及原计划恢复，
82/84开启，当日实际24→29未重置。

报价失败的精确快照与原HTML禁止网络重放证明：页面有该单位含税费NZD280、同一行
明确两成人，但六段报价编号成人字段为零，D2校验拒绝该行。并非目标单位缺失。
最终修复 `eaed587a` 只在成人／儿童字段均零的成人请求中读取同一行唯一可见的严格
`Sleeps: N adults`；隐藏、歧义、儿童、请求回显和物理容量不替代报价人数。两项浏览器
回归、六来源费用快照、类型／构建及原保留页面正确NZD280重放通过。
[最终完整发布检查](https://github.com/Harold-C/argus/actions/runs/37898953124)及
[固定导出](https://github.com/Harold-C/argus/actions/runs/37902004201)通过，源码928／
固定镜像Chrome1,142通过、零失败，197／13个条件用例全部由对应环境实际覆盖。
最新闭合配对备份实际恢复1,062 Job、2账号、62,956私有条目，数据库行／索引／约束
及完整文件／权限／属主／链接一致；账号隔离、wire摘要及两个无网络Profile打开通过。
UTC08:16:07仅替换Argus browser，实际镜像
`sha256:70447a79203263496ae38ee4047855dc511ed9b21ca28e2dd3123e9ead953148`，
暂停493.734秒，共享服务、PG／tunnel、客户端和配置／挂载保持、重启零；实际HTTPS
健康／就绪、44工作流／OpenAPI及权限核验通过。配对AES-256备份已卸载封存、0600，
SHA-256 `5b30d3a6eafe4a072b32b70f1f01404dcb83a0c2ff1bbb423bdd0a207f33ae79`；
独立恢复副本已清理，兼容回退镜像／受保护配置保留。Tymra应用源码和镜像未改变。

| 最终固定父Job／地区 | 已核实完整公开报价 |
| --- | --- |
| `cmv0p31gf0000lxh5x550m6bu`／Hawke's Bay | The Crown Hotel／Premier Studio／`29758205`，NZD280 |
| `cmv0p9yt70000lxjvrgttqtyc`／Otago | Lake Resort by Marsden／Mountain View Studio - Ground Floor／`17967309`，NZD297 |

均为2026-10-16–17一晚、2成人／0儿童／1单元、匿名公开含税费，PUBLIC／AVAILABLE／
COMPLETE；各最大／实际尝试一次，发现及报价Run各1成功／0失败。有效身份缓存各
复用一次，两父Job共四次执行；八份保留文件实际字节哈希、四份wire摘要与交付及
ACK后410/PURGED通过。最新页面／快照与入库的单位、日期、人数及金额一致；Hawke's
Bay的实际零成人编号已正确读取为可见两成人，未借用其他单位或请求人数。
本代码版本只追加一个冻结窗口，起点为第一父Job／UTC08:19:54.783，绑定Tymra
`c8e9e12`／Argus `eaed587a`，前序D2窗口与全部失败／价格逐项保留。

UTC08:30正式 `ota:production:enable` 通过，接受最新两个精确父Job，质量复验
PASSED、来源操作及健康HEALTHY；D-039当前窗口四Run全成功、两个正价，零解析／
挑战／限流。例外撤回，普通Tymra六次／并发一及Argus十二次保持，当日实际29→33
未重置。提前目标原priority／nextFetchAt恢复，原Booking日计划恢复NZ10-10
01:33:25.518，82/84开启，Agoda／Eventfinda既有停用保持。
完整发布检查期间MBIE、GeoNet、公共假日、Stats NZ四个既有自然作业成功，改变了
其他来源及计划摘要；原预检和变化取证保留，只读核实后刷新本次切换基线，未覆盖
其结果及nextRun。收尾与新基线一致。额外试采跟进保持暂停，Booking下一自然周期待验。
证据仍在Argus `runtime/production-releases/argus-release-20261009-5` 与Tymra原目录
`runtime/release-candidates/booking-popup-20261009/zero-adults-*`。

## 2026-10-09 Booking 即时追加：两份完整公开报价，连续质量门槛未通过

用户明确要求“那你现在直接再完成两轮完整公开报价”。本次真实生产结果如下；
没有移动 `cmv02ebw90000t8qrjyh2or4w` 的修复验收起点，没有覆盖旧失败或补造报价。

| 父 Job／地区 | 结果 | 是否完整公开报价 |
| --- | --- | --- |
| `cmv056ptm0000t841uw9bn953`／Gisborne | Portside Hotel Gisborne／Standard Studio，NZD 248；发现及报价 Run 均 1 成功、0 失败 | 是；SUCCEEDED，单次尝试 |
| `cmv05abu50000t85tdv0ibh06`／Hawke's Bay | `destination-suggestion:failed`；输入完整地区后没有可选目的地，非弹窗或验证码 | 否；DEAD_LETTER／NAVIGATION_ERROR |
| `cmv05i9yf0000t883shbw03v4`／Canterbury | Fable Terrace Downs Resort by MGallery／Deluxe Two Bedroom Villa，NZD 566，含早餐；两个 Run 均 1 成功、0 失败 | 是；SUCCEEDED，单次尝试 |
| `cmv05m46t0000t89thkculpab`／Otago | 搜索及 Lake Resort by Marsden 身份确认成功；报价返回 INTERNAL_ERROR，无公开 RateObservation | 否；DEAD_LETTER，当时根因未知；后续已定位人数解析，见上节候选 |

两份成功报价均为 2026-10-16–17、一晚、2 成人、0 儿童、1 单元，NZD，
`PUBLIC`／`AVAILABLE`／`COMPLETE`；原始截图逐项核对房型、人数、日期与
“Includes taxes and fees”。Gisborne 248 对应可免费取消方案，未宣称是页面最低价；
Canterbury 566 对应两成人含早餐方案，未误用其他人数或条件价。未知费用分项保留 null。
四父 Job 共九次真实执行、18 份保留文件；字节哈希、结果摘要、属主读取、ACK 后
410/PURGED 全部通过。Canterbury 采用既有有效身份缓存，两个执行符合原 2–3 次合同。

前两次沿原到期顺序执行；出现 Hawke's Bay 失败后，为即时复验而提前执行现有
队列按 `priority, nextFetchAt, id` 排序的前两个目标 Canterbury、Otago。
二者在执行前共同冻结，不按采集结果另挑房源；每父 Job 最大／实际尝试一次。
试采结束只恢复这两个目标原定未来 `nextFetchAt`，保留本次实际发现、价格、
`lastFetchedAt`、失败父 Job 和证据，避免人工验收消耗原独立自然计划。

普通 Tymra 每日六次不足以覆盖追加请求，使用到期人工试采例外。Argus 的运行内
Booking 公共额度由 12 暂调至 16；出现失败后仅为预先固定的两目标扩至 20，
带 30 分钟自动恢复。实际进程计数 10→19，全日 Tymra 计数 11→20，均未重置。
访问间隔、验证码／限流冷却、并发、单 Job 上限和其他 Connector 策略保持；
完成后已撤回 Tymra 例外并恢复 Argus 12，临时诊断端口关闭，未重启或更换镜像。

实际标准 `ota:production:enable` 仍被“最新两个精确父 Job 均须单次成功”拒绝，
拒绝事务的来源／计划摘要不变；最新两个为 Canterbury 成功和 Otago 失败。
D-039 基础指标 ready、空发现率 12.5% 不替代此门槛，两个新错误没有被隐藏。
`productionOtaQualityReview` 更新为 NOT_PASSED，旧复验记录保存在 history；
healthSummary、lastSuccessAt、固定版本窗口、原凌晨失败及 Chatham 空结果均保持。

按既有“修复并恢复计划”授权恢复运行许可，质量保持 DEGRADED。为避免日计划
早于最先目标的原到期时间，下一次从 NZ 10-10 01:32:50 调整 35.048 秒至
`01:33:25.518`。NZ 12:25 收尾核对 84/84 计划、队列／租约空、健康／readiness
200；其他来源和 83 个计划、Tymra 六容器及 Argus 三容器身份／配置／挂载保持。
此前 `booking` 凌晨额外试采跟进已暂停，避免重复追加；不是质量验收通过后暂停。
该次收尾剩余为两个问题修复、最新连续两轮及自然周期；后续修复候选与暂停位置见上节。
受保护证据在 `runtime/release-candidates/booking-popup-20261009/quality-immediate-*`。

## 2026-10-09 Booking 质量复验：检查完成，标准门槛未通过

以下为 NZ 11:34–11:43 历史快照；当前用量、追加结果、计划和跟进状态以上节为准。

按“完成质量验收”继续检查同一实际生产候选，沿用首轮
`cmv02ebw90000t8qrjyh2or4w`／UTC `2026-10-08T21:44:50.361Z` 的固定窗口，
没有移动起点、删除失败、选择容易通过的房源或将参考价提升为匿名公开价。
首轮 The Langlands 的六份证据及三次交付重新验证通过。本轮随后按既有到期队列
执行三个父 Job，各最大／实际尝试一次，每轮最多三次浏览器执行：

| 父 Job／地区 | 实际结果 | 质量计入 |
| --- | --- | --- |
| `cmv03luu10000t8ue2223cej9`／Chatham Islands | 一次搜索；页面目的地为 Chatham Islands Airport，明确显示零房源；父 Job `DEAD_LETTER`／`NO_VERIFIABLE_UNIT` | 无正价；保留目的地范围变化及空结果，不据此断言整个地区无库存 |
| `cmv03taps0000t8ybbznbkpv0`／Northland | 三次执行；The Sands Hotel Hokianga／`copthorne-resort-hokianga`／Standard King Room，匿名含税费 NZD 254；两个 Run 均 successCount=1、failureCount=0 | 完整正价通过，父 Job `SUCCEEDED` |
| `cmv03y5ow0000t802paz38vpd`／Auckland | 三次执行；Cornwall Park Motor Inn／Standard Studio (Upper Floor)，原价 NZD 230、会员参考价结构值 NZD 185.90（页面显示取整 186）；`REFERENCE_ONLY`，无公开 RateObservation | 父 Job `SUCCEEDED` 但报价 Run successCount=0，不能计作完整正价 |

两份房型价格证据均为 2026-10-16–17、一晚、2 成人、0 儿童、1 房；实际截图
与持久记录核对一致。Northland 总价明确含税费，未知费用分项仍为 null；Auckland
页面明确要求登录获取会员价，参考金额与 UNKNOWN 可售状态保持。三个新父 Job
的 14 份实际 HTML／截图字节哈希、七次属主读取及结果摘要、ACK 后 410/PURGED
全部核对通过；加上首轮复核共 20 份文件、10 次交付，零解析失败、挑战和限流。

原普通当日用量为 4/6，本轮采用现有到期人工试采机制，每次仅一父 Job、最多三次
执行、期限一小时且结束立即撤回；没有修改正常每日六次、并发一、Argus 十二次、
单 Job 上限或自动计划预算。三轮新增七次，当日累计 11 次保留，当前零额度例外。
修复窗口 D-039 基础指标通过，空发现率 25%；这不替代最新两轮完整正价门槛。

UTC 22:32:05 实际执行标准 `ota:production:enable`，被
`Both discovery and exact-unit rate must succeed in each trial` 拒绝，事务前后来源
和计划行摘要不变。最近两轮为 Northland 正价及 Auckland 参考价，所以质量验收
结论为 `NOT_PASSED`；没有修改 healthSummary／lastSuccessAt 来补记通过。

验收后按仍有效的“修复并恢复计划”授权恢复原运行许可及日计划；仅恢复操作许可
HEALTHY，质量 health 保持 DEGRADED。`productionOtaQualityReview` 单独记录
本次拒绝原因、三个父 Job、原版本窗口、额度撤回及未通过状态。NZ 11:34 最终读回
84/84 计划开启，下一次仍为 NZ `2026-10-10 01:32:50.470`，队列及 Argus 租约空；
83 个其他计划、其他来源、凌晨原失败行和所有验收版本保持。Tymra 六容器与 Argus
三容器身份、镜像、配置／挂载、重启计数保持；健康及 readiness 均为 HTTP 200。
证据、标准门槛拒绝记录、前后快照及摘要守卫回退 SQL 位于
`runtime/release-candidates/booking-popup-20261009/quality-*`。
后续仍须取得最新连续两轮完整公开正价并复查自然周期；NZ 11:34 收尾时未再预约试采。

NZ 11:43，用户追加“再完成两轮完整公开报价”后，已启用当前聊天的
`booking` 跟进计划，首次定于 NZ 2026-10-10 00:05，在新预算日串行接续，
若未满足两轮则按每日额度继续，完成标准验收后自行暂停。当前已用 11 次，
Argus 十二次限制不足覆盖另外两轮最多六次执行，且共享执行器当时有在途任务；
本次没有再提交生产 Job、改变额度、重启服务或停止原日计划。接续要求保留固定
窗口和全部失败，参考价／会员价／空结果不计入；每轮仍最多三次，证据及正式门槛
实际通过后才更新质量。若人工采集用尽当日额度，恢复自动计划时保留原凌晨相位，
将 nextRun 放在下一可用预算日，避免紧随人工验收的自然任务被额度守卫拒绝。
仅在完成、新阻塞或需要用户行动时通知；计划不是已取得两份报价的证明。安排收据为
`runtime/release-candidates/booking-popup-20261009/quality-two-additional-rounds-scheduled.json`。

## 2026-10-09 Booking 优惠弹窗修复、单轮实测与原计划恢复

以下为 NZ 10:51 的修复及恢复快照；后续质量复验与现行用量以上节为准。

凌晨原计划父 Job `cmuziox0y0009sz07qcu65f1x`／Run `cmuzioxpt02jot80781qsjnnl`
在 Otago 目的地填写步骤失败，证据仍显示 West Coast，Genius “Sign in, save money”
可关闭提示覆盖输入框；不是必须登录或验证码。Argus 旧代码仅在步骤开始检查一次，
实际弹窗可在检查与点击之间出现。原生产镜像的输入框／建议点击竞态均已离线复现。

Argus `824e0dd5b86836c726bf8ee7317ba4b9579f1f20`／`argus-release-20261009-2`
在可交互等待期间关闭准确命名的可选优惠弹窗，最多两次，保留原超时；流程结束清理
处理器。密码、验证提示、验证码及非官方域名／路由不关闭、不强制穿透。
候选从实际生产 `e687b901` 创建，仅含公共导航及六项回归，不包含 main 未发布私有
执行器修改。38 项定向、类型、构建通过；[完整发布门禁](https://github.com/Harold-C/argus/actions/runs/37842838771)
源码 928、固定镜像 Chrome 1,130 通过，185／13 个条件用例逐名核对由对应环境补验，
零未覆盖条件用例；合成配对恢复与运行／故障恢复通过。

最终镜像实际恢复新鲜闭合快照的 1,021 个 Job、2 账号、60,465 个私有条目，数据库
行／索引／约束与文件哈希／权限／属主／链接一致；四项所有权拒绝、两份 wire 哈希、
两个无网络 Profile 打开通过。NZ 10-09 10:44:27 只替换 Argus browser，暂停
910.073 秒；实际镜像 `sha256:a39d46d41369a7c7dd1eea059a70fd43ccc5e5eaeaf6bcd81ecd8042b3faef0a`，
HTTPS 健康／就绪、44 个工作流和 OpenAPI、属主读取／跨客户端拒绝通过、重启零。
PG／tunnel、Synix 共享服务及环境／挂载保持；Tymra 四应用、PG／Redis均未替换。
新备份 AES-256、0600、卸载封存，实际恢复副本清理；兼容回退镜像与受保护配置保留。
完整平台证据在 Argus `runtime/production-releases/argus-release-20261009-2`。

首个修复后父 Job `cmv02ebw90000t8qrjyh2or4w` 在执行前冻结新验收版本，前序为
`cmuy0wjky0000t80xrhn9g82k`，绑定 Tymra `2024961`／Argus `824e0dd5`。
本次人工有界验收立即执行，不改变自动计划的办公时段规则。Southland 搜索、必要
详情和精确报价三次执行均成功，NZ 10:47:21 父 Job 成功结束、实际／最大尝试一次。
The Langlands／`the-langlands`／Superior Queen Room with Two Queen Beds，
2026-10-16–17、一晚、2 成人／1 房、匿名 NZD 252.00，AVAILABLE／COMPLETE；
页面明示包括税费，未知分项仍保留未知。房源及报价两个 Run 均 successCount=1、
failureCount=0；六份实际 HTML／截图哈希、三份交付摘要、ACK 后 410/PURGED
独立复核通过，截图与持久报价一致。

本次用量连同凌晨失败共 4/6，剩余两次不足以保证第二轮最多三次执行的完整试采，
没有扩大额度或增加试采。按当前“修复并恢复计划”授权，以一次已验证修复结果恢复
既有运行许可及原日计划，并明确保留 DEGRADED 质量标记；不记录标准两轮门槛通过。
来源 metadata 的 `productionOtaOperatorRestoration` 记录本次授权、修复／失败 Job、
版本、原时段、下次运行及未补齐质量验收。healthSummary、lastSuccessAt、所有旧
窗口／失败和参考价保持，不将旧的单次豁免误作当前质量证明。

NZ 10:51:24 读回 84/84 计划开启、队列空、正常每日六次／并发一、零额度豁免。
Booking 下一次为 UTC `2026-10-09T12:32:50.470Z`／NZ `2026-10-10 01:32:50`；
83 个其他计划及其他来源摘要、原失败父 Job 摘要不变。受保护前后快照、行摘要守卫的
回退 SQL、文件／交付验证及最终读回位于 `runtime/release-candidates/booking-popup-20261009`。
当时下一自然周期和连续两轮质量验收仍待完成；本次不宣称长期稳定性或私有 Booking 认证通过。

## 最近生产记录

以下表格保留 NZ 2026-10-07／08 的发布快照；10-09 的现行 Argus、Booking 计划与
用量以上节为准，表中旧 nextRun 和“当前”只适用于该快照日期。

| 对象 | NZ 2026-10-07／08 记录及范围 |
| --- | --- |
| Tymra | 源码 `2024961`／`tymra-release-20261007-2`；Web、Worker、API、Scheduler 同一镜像 `sha256:59ed536d53a935b388fca77df3157f136f16435ca038af3f49a2f909d56b4238`；NZ 10-07 23:15 切换，无新增 migration。生产基线独立发布分支，不含 main 未发布的结构重构 |
| Argus | `b6737ee`／`argus-release-20261007-3`，NZ 10-08 00:24 切换；在现行 `6fe04d8` 补充公开报价与费用归属修复，保留全部生产私有实现。实际镜像 `sha256:4dbddd300235e67e5eeb7d1c951afd73f941e20759bd69fb72244ca1bf5b157e` |
| 入口 | `ADMIN_ONLY_ACCESS=true`，公网仅 Operations 管理员页面及 Admin API；客户域名、公开 Price Check、客户 API、Stripe webhook 尚未开放。与只隐藏导航的 `DEPLOYED_HIDDEN` 不同 |
| 计划 | NZ 10-08 02:32 人工恢复后 84/84 启用（78 公开、六 OTA）；Booking 来源 enabled／PILOT、operational HEALTHY（人工恢复运行）／health DEGRADED，原日计划启用，nextRun 为 NZ 10-09 01:32:50。标准启用门槛仍未通过，本次启用豁免单独留痕。主 Scheduler 开启、高频关闭；全部原计划定义保持 |
| OTA 预算 | 正常 Tymra 每 OTA 来源每日六次、Argus 每 OTA 来源每日十二次、并发一。最新手动诊断额度豁免只覆盖 `ota-trial:`，UTC 11:43:53 开始、11:56:02 撤回；当前零额度豁免。本次只豁免 Booking 的单次启用门槛并跳过 10-08 补跑。当前 NZ 日十二次执行保持，无新增 Job；下一正常额度 NZ 2026-10-09 00:00 恢复。自然计划预算、计数及历史不重置，公开来源使用各自预算 |
| 恢复材料 | Tymra 新鲜切换备份 `/srv/apps/tymra/backups/booking-reference-continue-20261007-cutover`；新版候选收据 `runtime/release-candidates/booking-reference-continue-20261007`、实抓及原计划保护收据沿用 `runtime/release-candidates/booking-reference-20261007`。Argus AES-256 配对备份已封存、0600、卸载，完整记录见 Argus 当前状态 |
| 验证范围 | 完整 CI 和固定候选 lint／类型、246 Web/域模型＋427 Worker 单元、131 数据库/API/Worker 集成及完整构建通过；另六个有界离线管线在空库隔离通过，Booking 参考价首轮及后续两轮公开报价、持久化、幂等恢复、不暂停来源均核实，禁止外部 fetch；条件跳过不计入通过 |
| 恢复与部署验证 | 新鲜切换配对备份以最终镜像实际恢复 80 表、691 份证据；摘要、文件哈希／权限／属主及编译后的六 OTA 健康读取匹配。四应用运行、重启零，PG／Redis、环境和挂载保持，Ops HTTPS／readiness 通过；Argus 三服务与 Synix 十服务身份、镜像、环境及挂载保持 |
| Argus 验证 | 最终候选源码 924 项、固定镜像 Chrome 1,118 项通过；177／13 条条件入口由另一层执行。实际恢复 957 Job、2 账号、56,823 私有条目，数据库／文件摘要、权限／属主、四项所有权拒绝、两份 wire 哈希和两个无网络 Profile 打开通过。配置／挂载、PG／tunnel、Tymra 四应用及 Synix 十服务保持；HTTPS、六公开连接器和私有所有权读回通过 |

这些证据支持已发布的有界后台采集，不证明全国代表性、长期自然周期稳定性或客户产品已验收。
先前结构优化仅使用独立测试镜像和可丢弃测试栈，没有随本次发布进入生产。
上述 NZ 10-07/08 的生产操作使用生产基线的独立候选，当时未修改日常开发服务、镜像、挂载和数据库。
NZ 10-09 日常开发地址切换至当前源码的实际核对见本文同日热更新记录。
测试入口及隔离要求见根 [README](../README.md#verification)。

### 2026-10-08 全部计划开启：84/84，Booking 人工启用、跳过当日补跑

操作前保护快照包含全部 84 条计划、Booking/Trip.com 来源行及两个原失败 Job 摘要，
保存于 `/srv/apps/tymra/backups/booking-reference-20261007-schedule-enable`；SHA-256
`05065ca136b5e1e2328ebbf6156abcf4242845ddc0f9a955be8eda9e0117e6e3`。
没有重建计划或恢复已删除的旧周计划。

Trip.com 自然周期 `cmuxqkis60001lh07x1pqio4t` 的 Soho Hotel Auckland 报价页为
HTTP 200，但浏览器未达到要求的终态，报 SOURCE_UNAVAILABLE／INTERNAL_ERROR 并暂停。
原失败及完整交付证据保留，不将此错误直接解释为页面挑战或已确认的选择器变更。
补充精确父 Job `cmuxsd05f0000n64ib6agojbi`、`cmuxst7os0000n682bxbcc88l` 各一次
完整成功，VR Hamilton Hotel／`trip:745023:room:1257234470` 匿名总价 NZD 92.00，
Oceanside Resort & Twin Towers／`trip:4228837:room:511876519` 匿名总价 NZD 196.00；
均为 2026-10-14–15、两成人、一单位、AVAILABLE／COMPLETE，明确包含税费。
六次 Argus 执行、十二份本地证据逐份字节数／SHA 和持久交付通过。
撤回临时手动额度后执行正式启用门槛，NZ 20:43 恢复原日计划，来源 HEALTHY，
当时 nextRun 为 NZ 2026-10-08 23:13。这两轮不证明原 Soho 房源问题或首个自然周期已验收。

Booking 补测 `cmuxslnz20000n674ar7fioj1` 沿现行 frontier 选择 Gisborne，发现 Run
失败为 UNIT_IDENTITY_NOT_PUBLIC，未创建价格 observation；两次 Argus 完成，四份本地
证据的哈希及交付通过。页面实际公开 Whispering Sands Beachfront Motel 的 Deluxe
Apartment／`114729405`；报价行 `Sleeps: 2 adults` 与同一 ID/名称的 RoomDetails
`maxPersons: 4` 被旧解析判为容量冲突。原失败 Job 与证据保留，没有改成成功。

补充 Argus 候选 `6fe04d8`／`argus-release-20261007-2` 仅修改公开容量解析和回归测试，
以现行 `90b678e` 为基线，保留全部生产私有实现。较小的报价人数不覆盖已核实物理
最大容量；显式最大容量冲突、超出物理最大容量及身份不匹配仍拒绝。
17 项隔离 Chrome 回归、原失败页面无网络重放及类型／构建通过；
[完整门禁](https://github.com/Harold-C/argus/actions/runs/37589861449)和
[固定导出](https://github.com/Harold-C/argus/actions/runs/37593372005)通过：源码
923 项、固定镜像 Chrome 1,116 项，零失败，176／13 条条件入口分别由镜像／源码补验。
最终镜像实际恢复 944 Job、2 账号和 56,155 私有条目，数据库及文件摘要／权限／属主、
四项所有权拒绝、两份 wire 哈希和两个无网络复制 Profile 打开通过；不证明实站认证。
NZ 21:51 仅切换 Argus browser，实际镜像
`sha256:55602e26073d55fc5d454ea69ec2543af74a2bb71f085311e5d9c723fdcf4f8f`；
PG／tunnel、环境／挂载和私有实现保持。Tymra Worker／Scheduler 排空后短暂停止，
切换后恢复相同镜像；Synix 十容器保持。HTTPS 健康、就绪、六公开连接器及私有所有权读取通过。
加密备份 `argus-prod-20261007-booking-capacity-predeploy.sparseimage` 已封存卸载、
0600，SHA-256 `0ee98ba9ecc40768e98cafbc6f3fb69f3ab5af2ba1d943b56db972e8d241cdb1`；
实际恢复及切换收据在 Argus `runtime/production-releases/argus-release-20261007-2`。

新版本第一父 Job `cmuxvqidg0000n611aqicgm86` 在 Hawke's Bay 的目的地建议等待
阶段报 NAVIGATION_ERROR／SOURCE_UNAVAILABLE，未进入价格解析。保存页面当时无建议，
稍后截图显示正确建议，未见验证码或登录拦截；不能据此断言选择器已变或来源永久不可用。
两份本地证据逐份字节／SHA、持久交付及 ACK 后 410 通过。容量版本窗口绑定该精确
父 Job／Tymra `df5fd23`／Argus `6fe04d8`，原始及参考价窗口、该版本失败均保留；
不能移动起点隐藏失败，亦不能以本地重放替代生产两轮成功或直接启用。
本轮收据沿用 `runtime/release-candidates/booking-reference-20261007`。

后续 `cmuxvz0sj0000n62tvlm5l61i` 一次完整成功，The Devon Hotel A Heritage Hotel
Queen Studio／`39770906`，2026-10-14–15、两成人一单位，匿名 NZD 112.00
AVAILABLE／COMPLETE，明确包含税费；可选早餐不并入总价。三次执行、六份本地
证据及持久交付通过。`cmuxw55qy0000n63q512pqokp` 则保留 BK's Magnolia Motor
Lodge／`46019810` 原价 239.00、精确会员价 182.90（显示取整 183），公开总价为空、
UNKNOWN／REFERENCE_ONLY，旧 Tymra 返回 REFERENCE_PRICES_ONLY 后暂停。页面五个
房型均显示会员专属价，不能由 Genius／其他优惠反推匿名可订总价。三次执行、六份
留存文件及 ACK/410 已核实；这两个失败 Job 的新增保护摘要也已保存，旧记录保持。

用户明确选择“保留参考价，继续采集其他房源”。生产基线独立候选 `2024961`／
`tymra-release-20261007-2` 将有效 Booking 参考价抓取记录为完成取证、公开价成功数零，
保留原价／会员价和单位覆盖缺口，不生成公开价格观测或提高覆盖率，也不暂停整个
来源；恢复执行不重复抓取或计费，后续父 Job 可继续。其他提供方以及身份、日期、
新鲜度、解析、挑战和限流保护保持。[完整 CI](https://github.com/Harold-C/tymra/actions/runs/37602102576)
通过（673 单元、131 集成、lint／类型及完整构建），固定镜像相同 673 单元通过。
另六来源空库管线通过，Booking 首轮参考价后两轮公开报价、引用持久保存、零假报价／
覆盖及来源不暂停均核实。最新配对备份实际恢复 80 表和 691 份证据通过，NZ 23:15
四应用已切换并完成健康、外部登录页与管理访问边界读回；PG／Redis、配置／挂载保持，
Argus 三服务、Synix 十服务保持。普通 HTTP 探针及常规浏览器 User-Agent 登录页均
200；默认 Python 探针收到 403，没有由该单一客户端结果判定应用故障。
新版首个实抓 `cmuxynovk0000t80zh9ynv8b7` 于 UTC 10:24:36 沿现行 frontier
进入 Wellington。新版本窗口绑定此首个父 Job／Tymra `2024961`／Argus `6fe04d8`，
前序窗口和全部失败保持。正式门槛仍要求最新两轮精确公开正价，不能由参考价或离线数据替代。
新候选收据位于 `runtime/release-candidates/booking-reference-continue-20261007`。

该父 Job 于 UTC 10:26:43 失败为 PUBLIC_RATE_AVAILABILITY_UNKNOWN，未写入公开
价格；Museum Apartment Hotel 的 Studio Apartment Accessible／`38735825` 页面
明确给出两成人、一单位、公开 NZD 278、Includes taxes and fees，原价 347 为参考。
隐藏说明有精确 277.60、可选早餐为 45；旧 Argus 返回所选可见 278，却把费用核对
绑定隐藏总价，误判 UNKNOWN。三次执行、六份实际文件的字节／SHA、持久交付和
摘要 200／ACK 后 410 已验证；原失败摘要 `d9977029ac7028397f7be119db0cc66a`
单独保护。该情形有公开价格，不能以参考价跳过规则隐藏公开价格解析错误。

Argus 独立候选 `b6737ee`／`argus-release-20261007-3` 仅修正公开主报价定位与
费用证据归属；25 项六来源费用回归、18 项隔离 Chrome、类型／构建及原 snapshot／
HTML 无网络重放通过，得到 27800／AVAILABLE／含税费，参考价和未知分项保持。
隐藏费用、另一报价、仅税和额外收费继续拒绝。[完整门禁](https://github.com/Harold-C/argus/actions/runs/37609458919)和
[固定导出](https://github.com/Harold-C/argus/actions/runs/37612517831)通过：源码 924、
固定镜像 Chrome 1,118，零失败；177／13 条条件入口由另一层执行。
全部 12 层 RootFS 和完整执行配置匹配，最终镜像的原页面无网络重放通过。

最终镜像实际恢复新鲜配对快照的 957 Job、2 账号和 56,823 私有条目；数据库／
文件摘要、权限／属主、四项所有权拒绝、两份 wire 哈希与两个无网络 Profile
打开通过；不表示私有实站认证已验收。加密备份
`argus-prod-20261007-booking-visible-quote-predeploy.sparseimage` 已封存、0600、卸载，
SHA-256 `1d837c7f4d307684c46086f30bd4e23c1d0cda5bb142a29b0168c3da42e3fd21`。
NZ 10-08 00:24 空闲切换，仅替换 Argus browser；镜像 `4dbddd3`，注册表摘要
`147dacf`，完整身份在最近记录和 Argus 收据。PG／tunnel、环境／挂载保持，
Tymra 四应用与 Synix 十服务的身份、镜像、环境、挂载及重启数一致。HTTPS
健康／就绪、六公开连接器、两个私有属主读取及两个跨客户端拒绝通过。
收据在 Argus `runtime/production-releases/argus-release-20261007-3`，回滚为 `55602e2`。

新版本窗口绑定首个真实父 Job `cmuy0wjky0000t80xrhn9g82k`、UTC 11:27:28.546、
Tymra `2024961`／Argus `b6737ee`，前序为 `cmuxynovk0000t80zh9ynv8b7`；全部旧窗口、
原始及修复版本失败保留。第一轮已一次完整成功：Tasman 的 Mapua Wharfside
Apartments、2026-10-15–16、两成人、一单位、匿名 NZD 250.00 AVAILABLE／COMPLETE。
三次执行、六份实际文件逐份字节／SHA、持久交付及三项摘要 200／ACK 后 410 通过。
第二轮 `cmuy114pq0000t82n9lpkukzl` 的 The Sails Nelson 报价执行返回
INTERNAL_ERROR／SOURCE_UNAVAILABLE；父 Job DEAD、一次尝试、零价格写入。
正常留存页面／截图未见挑战，隔离离线执行未复现，具体内部原因未确认。
三次执行、六份文件、持久交付和 ACK/410 已核实；失败摘要
`c61193c737f33eec1685c54d7a5e8128` 保护，不改写失败或移动窗口。

第三轮 `cmuy1hqtj0000t83m185f68xq` 完整成功，Chateau Marlborough／`37308710`、
2026-10-15–16、两成人一单位、匿名含税费 NZD 194.00 AVAILABLE／COMPLETE；
原价 228.00 单独保存为参考。第四轮 `cmuy1njdq0000t84ko64rc50i` 的 Hokitika
Firestation Apartments／`491975102`／ratePlan `424216849` 同一查询仅有原价
396.00 和会员价 356.40，UNKNOWN／REFERENCE_ONLY。父 Job 和报价 Run 成功
完成取证，报价 Run 的 successCount／failureCount 均零，rateOutcome 为
REFERENCE_ONLY、referencePriceCount 为二。两项参考价持久保存，零公开价格
observation；单位缺口 REFERENCE_PRICES_ONLY、publicTotalVerified=false、
lastSuccessfulAt 为空。来源保持 enabled／PILOT，不因参考价暂停。两轮共六次
执行、十二份实际文件逐份字节／SHA、持久交付及摘要 200／ACK 后 410 通过。

最新版四轮共十二次 Argus 执行，正常日额度已用完。UTC 11:56:02 撤回最新
手动诊断豁免，正式启用命令于 UTC 11:57 返回
`Both discovery and exact-unit rate must succeed in each trial`；来源和计划摘要
完全不变。最新两轮为完整公开 194.00 与仅参考价零公开成功，未达到既有正价
门槛，不能将完成取证当作两轮完整公开报价。正常额度在 NZ 2026-10-09 00:00
恢复后原计划仍需标准正价门槛才能按常规 CLI 启用；当时没有安排额外采集。
最终计划、预算、所有旧失败及参考价缺口核验收据在现有
`runtime/release-candidates/booking-reference-20261007`，包括
`schedule-enable-final-readback.json` 和 `booking-final-activation-gate.json`。

用户随后明确要求“打开booking，豁免今天的计划”。按今日不再补跑处理，NZ
10-08 02:32 仅更新 Booking 来源的运行许可及原日计划：operationalStatus
设为 HEALTHY 以允许调度，healthStatus、healthSummary、lastSuccessAt 和原
验收窗口保持，未把豁免记录成标准验收成功。来源 metadata 保存
`productionOtaOperatorEnablement`、单次启用豁免、用户授权、跳过的 NZ 日期、
下次运行时间和两端版本。原每日时段沿用 lastEnqueuedAt 推进到下一 NZ 日，
nextRun 为 UTC 2026-10-08 12:32:50.470／NZ 2026-10-09 01:32:50.470。
没有增加当日抓取、额度、并发或新 Job，今天十二次执行保持。

新鲜 scoped-before SHA-256
`5aa3da471b3ae77983cb6ec3ea9eb1630c7904f8685bef6e88b7e8607fbf48dc`，
收据 `booking-operator-enablement-20261008.json`、前后快照和带行摘要保护的
rollback SQL 保存在上述受保护分类。事务前后 83 个其他计划和所有其他来源、
Booking 全部 Job／Run／执行／价格的摘要保持；镜像、容器、重启数保持。
调度检查确认 CATALOG_DISCOVERY 不经过公共 EVENT/PUBLIC_DATA 的旧失败暂停
分支；原失败不需要改写。已启用日计划与首个恢复后自然周期验收分别记录。

### 2026-10-07 Booking 参考价修复已发布，单次生产抓取成功

自然调度父 Job `cmuwnsr550002qn07j23s9zfa` 在 NZ 01:34 失败并暂停 Booking。
三次 Argus 执行均完成且持久交付已验证，六份证据实际可读、逐份哈希匹配。
目标 Kelly Rd Cambridge Lodge / `222137802`，2026-10-14–15、两成人、一单位、
NZD、已退出登录。可见页面正常，报价为原价 275、精确会员价 247.50（主显示取整 248）；
原价不是独立验证的匿名可订含费总价。其他四个房型也同时有原价和会员价。
旧解析将正常 `Select occupancy` 控件判为人数限制；隐藏错误模版不证明页面出错。
保存 HTML SHA-256：`f4e6bd91f2f036e109d8265fa6a8dbbf576ab9b4a8b06c278ca278ecf4198b6b`。

本地初始 Argus 在 `worktrees/booking-reference-20261007`（基于 `fc7b1d6`）修复可见
可用性文字与限制匹配，新增有界 `referencePrices`，保留精确原价/会员价及房型、
日期、币种、人数/单位和 rate-plan 来源。原始失败页面重放通过，得到
UNKNOWN/REFERENCE_ONLY、公开总价为空、两项参考价 27500/24750；Tymra 接收合同
保留新字段，公开价格映射拒绝参考金额。完整匿名报价若存在仍照常使用。
Tymra 在验收门槛前保存 `RawArtifact.payload.otaReferenceRates`，给出准确的
`REFERENCE_PRICES_ONLY` 失败原因；暂停同步 operational/health DEGRADED。
既有公开价标识、费用完整性、来源身份、日期、挑战及原计划恢复门槛保持。

定向解析/合同、隔离 Chrome、Worker、接收端 HTTP、类型和模块边界验证通过；
细节合同及接收方优先部署顺序见 [Argus 集成](collection/argus.md)。无需 migration。
发布范围固定为 Tymra `df5fd23`／Argus `90b678e`，代码已 commit／push／标记，
两端[完整 Tymra CI](https://github.com/Harold-C/tymra/actions/runs/37568104092)、
[Argus 门禁](https://github.com/Harold-C/argus/actions/runs/37567952069)和
[固定导出](https://github.com/Harold-C/argus/actions/runs/37576261912)通过。
按接收方优先顺序完成新鲜配对恢复、空闲切换及生产读回，回滚配置／旧镜像保留。

NZ 18:49–18:50 父 Job `cmuxotc9k0000n62fayir6ijj` 一次尝试完整成功，
两个业务 Run 各一条成功、零失败；沿用现行 frontier 选择 Bay of Plenty 房源
One88 on Commerce／`booking:188-on-commerce`，物理单位 `143668702`
（One-Bedroom Deluxe Suite with Spa Bath，容量二），2026-10-14–15、两成人、一单位。
真实匿名 NZD 209.00 为 AVAILABLE／COMPLETE，页面明确 `Includes taxes and fees`；
无人数／最短住宿限制，费用分项未披露保持 null，不推定每项为零。
公开价格 observation `cmuxovmur006fn607j9ot3mbf` 已入库。列表／详情／报价三次
Argus 执行均完成，wire SHA、六份本地 HTML／截图的字节数和 SHA、持久交付及 ACK
均通过，三项 summary 为 200／ACK 后 result 为 410。该新房源具有匿名完整总价，
参考价为空；原 Kelly Rd 参考价情形仍由
保存页面重放验证，没有追加对原失败房源的真实访问。

原失败 Job 行摘要完全保持；其他 83 条计划启用状态保持。本轮未启用 Booking
自动日计划，也没有移动原验收窗口、增加尝试次数、扩张预算或修改 Synix。
只有一次新版本完整成功，最新两轮成功及 D-039 启用门槛尚未满足，自然周期亦
未验收；不能将本轮单次抓取称为自动计划已恢复。

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
  Bookabach 2026-10-07 21:57。首个自然周期现已核实：Airbnb
  `cmuxv3fr80000lh07mmubr9zv` NZD 155.24、Bookabach `cmuxvjxyo0000lh07nlh312u1`
  NZD 135.00，均原 schedule 幂等键／payload、一次尝试、两业务 Run／三执行完整成功，
  2026-10-14–15、两成人一单位、AVAILABLE／COMPLETE。十二份实际本地证据的
  字节数／SHA、持久交付及六项 ACK 后 summary 200／result 410 通过；仅证明该周期。

### 公开来源与其余 OTA

- 七个暂停公开来源完成请求预算、队列/执行期限、Power BI 查询及 School Sport 筛选修复后，
  各通过两轮精确原计划试采并恢复。旧 Eventfinda/Ticketmaster 周计划已删除，现行每日进度计划保留。
- School Sport NZ 在截取有界结果前按全国合同保留记录，再作地区业务筛选；两轮各一请求、
  17 条全国记录、两条 Canterbury 业务记录。venue/city 未知，影响状态仍为 `PENDING_EVIDENCE`。
  记录的下一次 NZ 时间为 2026-10-13 17:52；恢复后自然周期未验收。
- Booking、Agoda、Expedia、Trip.com 曾分别完成有界生产门槛并启用；Booking 在
  2026-10-07 的新自然周期后暂停，见上文。具体历史收据留在 2026-10-06 整理前 Git 版本。
  Agoda 原有失败窗口及追加版本窗口保留，不覆盖历史指标。
- 来源计划启用不代表每个来源都具有完整地域、日期、规模或影响证据；
  来源合同见 [collection](README.md#数据采集)。

## 全国数据核心差距

条款来自 [data-core.md](product/data-core.md)。数据库/代码验证与真实全国运行分别判断；
P0 为统一产品验收依赖或数据正确性门槛，P1 为运营深度，P2 为规模优化。

| 条款 | 已实现或已记录证据 | 剩余缺口 | 优先级 |
| --- | --- | --- | --- |
| DATA-CORE-001 | 17 Region × 六 OTA durable frontier，发现后持久化 Property/Unit/Listing 及版本 | 全国非 demo 身份目录深度、分布与覆盖测量 | P0 |
| DATA-CORE-002 | 全国聚合来源、15 主要市场映射、78 条公开计划的有界生产运行 | 不等于全部 17 Region 的连续深度、历史或稳定性 | P1 |
| DATA-CORE-003 | 840 Anchor + 360 Rotating 分层选择、日期篮子及有界采集 | 实际库存填充、代表性与轮换校准 | P0 |
| DATA-CORE-004 | 客户按归属及权益提交地址／OTA URL，30-night/365-day/occupancy 守卫；Admin 仅恢复原请求或关联采集事件，旧任意输入入口已停用 | 客户生产入口与真实来源当前候选验收 | P1 |
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
| DATA-CORE-022 | 同构建客户代码；历史隔离 EN/ZH 桌面/手机隐藏导航与直接路由检查；10-11 接通客户登录域名 | 完整客户归属、付费、Stripe、邮件、challenge、浏览器、容量及业务验收仍待完成 | P0 |

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
| DATA-CORE-001..022 / D-049 / D-050 | Capability registry, 17-Region frontier/coverage, representative panel, versioned identity/history, generic lineage, address-mode snapshot, hidden client discovery and bounded Admin on-demand workflow are implemented | 2026-10-09 fixed-candidate verify, six fresh offline OTA pipelines and isolated cloud browser/member matrix passed; non-demo nationwide operating acceptance remains | implemented_not_live_accepted |
| PRD-RESULT | Result versions, insights, authenticated ownership and feedback | 2026-10-09 isolated API/integration and cloud browser/member matrix passed; no bearer-result route remains. Complete real-provider and customer production acceptance remains separate | implemented_not_live_accepted |
| PRD-OPS / requirements §3.7 / D-053 | Complete six-module service assurance Admin, bounded recovery/cancellation, data correction/backfill, entitlement/privacy support and audit; customer-owned business decisions | 2026-10-09 fixed-candidate local/cloud gates, actual production-copy restoration/migration/previous-image reads, production Admin HTTPS pages and runtime/evidence integrity passed; real customer/provider support writes remain separately scoped | production_admin_verified |
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
| `MEM-AUTH-001`, `R15-AUTH-001` | Independent registration and email/password sign-in with zero pricing side effects | Current fixed-candidate browser/SQL registration passes; 2026-10-12 existing ordinary Free production account signs in with zero new checks/jobs/units/usage. Real new-account email verification remains deferred | `private_signin_verified_registration_delivery_pending` |
| `MEM-AUTH-002`, `R15-AUTH-002` | Bcrypt password storage, neutral invalid credentials, throttling, duplicate protection and return-target validation | Credential/API integration, password-hash inspection, middleware return-target tests, old-password rejection and real password-change browser acceptance | `development_verified` |
| `MEM-AUTH-003`, `R15-AUTH-003` | Customer current-session and all-session sign-out, isolated from membership and Admin | Current fixed-candidate browser/SQL paths pass; production acceptance session signs out with subsequent 401 and its revoked row verified. Existing sessions retained; production all-session revocation not exercised | `partially_production_verified` |
| `MEM-AUTH-004`, `R15-AUTH-004` | Protected-route redirect through password sign-in with allowlisted same-origin `returnTo` | Middleware exact-route/query, open-redirect and EN/ZH locale-continuity tests/browser evidence | `development_verified` |
| `MEM-RISK-001` | Email verification before collection plus Benefit Group identity across account/device/property/payment subjects | Isolated PostgreSQL verifies unverified denial, same-device/same-Property shared Free usage, and shared-IP/different-device separation | `development_verified` |
| `MEM-RISK-002` | Unique Free/promotion claims, serializable retries, concurrent collection/noVNC limits and independent export/API quotas | Three-way concurrent Free claim, idempotent NZ-month export and payment-promotion uniqueness integration | `development_verified` |
| `MEM-RISK-003` | HMAC-only Stripe fingerprint, refund/dispute/Radar cases and member appeal | Synthetic signed-event persistence, payment reuse/refund, customer appeal and Admin review tests pass; production Radar delivery remains external | `implemented_not_verified` |
| `MEM-RISK-004` | Reason-code dashboard, audited allow/deny/release and independent risk retention | Admin API plus privacy-safe aggregate metrics and controlled retention lifecycle pass; production operating exercise remains external | `implemented_not_verified` |
| `MEM-NAV-001` | Session-aware customer navigation plus `DEPLOYED_HIDDEN` public-header/footer/CTA suppression | 固定候选 EN/ZH 桌面/手机回归通过；2026-10-12 私有生产直接登录/账户页及实际隐藏导航、Cloudflare/源站双层 IP 限制通过。完整付费客户链路仍待验 | `private_entry_verified_complete_member_pending` |
| `MEM-PUBLIC-001` | Bilingual membership/pricing and OTA-link/address entry routes deploy but are omitted from public discovery while hidden | 2026-10-12 EN/ZH 生产价格/注册/登录页 200，实际新价格、100 个对象参考报价与关闭购买状态通过；真实两种查询及付费链路仍待验 | `private_pricing_verified_paid_closed` |
| `MEM-ACC-001` | Operational account overview with plan, lifecycle, usage, units, horizons, cadence and next action | Current isolated four-plan/lifecycle matrix passes; production Free membership, capacity 1, launch limit 50, account/billing/settings pages and verification gate read back. Real paid states remain pending | `private_free_verified_paid_pending` |
| `MEM-UNIT-001` | Independent monitored-object identity, legacy Property compatibility, activation, binding and next-period retained selection | 2026-10-12 isolated API tests verify independent units, address conversion, owned cancellation and retained-object boundaries | `development_verified_production_not_accepted` |
| `MEM-CHECK-001` | Owner-only filterable history and result detail with mode-aware target or neighbourhood observations and observed-price/recommendation separation | Cross-account, pagination/filter, retention, one-valid-price acceptance and `LISTING_PRICING`/`LOCATION_BENCHMARK` separation pass in integration; the dated desktop/mobile browser flow filters the owner history and reopens the authenticated formal detail | `development_verified` |
| `MEM-CAL-001` | Plan-aware exact daily calendar and separately labelled monitoring extension in `Pacific/Auckland` | NZ-time/domain boundaries, owner-only API, no-fabrication data states and responsive browser QA | `development_verified` |
| `MEM-ALERT-001` | Core alerts, configurable thresholds/preferences, deduplication and owner evidence | 2026-10-12 worker generation/deduplication, preferences and EN/ZH desktop/mobile pass; real delivery remains unverified | `development_verified_delivery_pending` |
| `MEM-PORT-001` | Pro strategy/portfolio and CSV/XLSX; Portfolio grouping and bulk confirmation; customer API/webhooks deferred | 2026-10-12 owner isolation, version conflicts, atomic edits, export quota/download readback and browser controls pass | `development_verified_production_not_accepted` |
| `MEM-BILL-001` | Stripe Checkout/Portal and persisted upgrade/downgrade/cancel/resume/grace reconciliation | New tier-pricing Fake-Stripe/SQL lifecycle and browser fixtures pass; 2026-10-12 code deployed with paid switches closed. Historical Sandbox/37 webhook evidence and later hosted Checkout timeout do not accept the new real-provider lifecycle | `deployed_code_real_payment_not_accepted` |
| `MEM-RET-001` | Plan history, raw evidence, auth, billing, cancellation and deletion retention | Controlled isolated PostgreSQL matrix covers Free 30, Host 183, Pro 365, Portfolio 730 and cancelled 30-day expiry boundaries | `development_verified` |
| `MEM-OPS-001` | Factual billing reconciliation, proven duplicate usage correction, session/risk/account support and owner-delivered export/deletion | 2026-10-09 support-page acceptance and 2026-10-12 designated Free account are recorded separately; real Stripe/customer support writes remain separate | `deployed_real_provider_acceptance_pending` |
| `MEM-OPS-002` | Audited nonbillable Admin plan/capacity/duration grant, adjustment, revocation and shared effective rights | 2026-10-12 isolated grant/expiry/ownership/concurrency/idempotency/100-object/Worker checks and EN/ZH desktop/mobile grant/revoke flows pass; designated production grant remains pending | `development_verified_production_pending` |
| `MEM-OBS-001` | Privacy-safe membership, billing, scheduler, queue, lifecycle and plan-economics telemetry | 2026-10-09 production Admin pages, version-bound worker/scheduler heartbeats and dependency readiness passed; existing failed-job alerts remain visible. Alert delivery/injection and real-member operating acceptance remain | `production_runtime_verified_alert_delivery_pending` |
| `MEM-A11Y-001` | Complete member module in EN/ZH at desktop, 390px and 320px | Automated member-route axe serious/critical, overflow, keyboard and reduced-motion matrix; dated 2026-08-12 candidate result | `development_verified` |
| `MEM-E2E-001` | New Free, returning customer, paid lifecycle and every blocked/gated state | 2026-10-12 fixed-candidate 61 browser scenarios and existing private-production Free sign-in/account/sign-out pass; new-account email, real paid lifecycle and complete live member operations remain separate gates | `private_free_verified_complete_member_pending` |

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
- Tymra evidence volume 物理清理已实现并通过隔离实际文件删除／失败／活动诊断保护检查；生产保留周期与真实 volume 的执行仍待部署验收。软删除与 Argus ACK/purge 仍不代替物理清理。
- Tymra 操作员 CAPTCHA/noVNC UI 和同会话／来源 origin／TTL 守卫已存在并通过合成合同检查；真实 Argus 会话接管、续跑、证据交付及运营验收仍待完成。
- 手工导入缺少真实运营导出文件两轮验收；fixture 结果不替代该证据。
- 来源原始分类与标准事件分类仍共用 `category`；分类拆分、事件规模与地域精度有明确缺口。
- 客户生产入口、Stripe live、真实通知投递、托管 challenge、完整当前候选浏览器/无障碍、
  容量与告警演练未验收。旧 Sandbox 或 Free 会员真实流程只能证明当时的候选和运行。

## 2026-10-09 整体后台最终改造本地验收

完整目标为需求 §3.7、D-053 和页面规范 §13–17；六模块与服务端操作边界作为同一个交付实现。正常结果自动交付，客户业务选择留在所属客户流程。
本轮仅本地源码、独立测试库和合成数据，没有 commit、push、生产部署、生产 migration、生产计划变更或真实邮件／Stripe／Argus 调用。

候选为 `main` 工作区，基线 HEAD `e0fb73d794e0044189f78c6abaab2339d2fa6573`；该提交本身不包含未提交改造。
源码、测试、迁移、脚本、依赖锁定和运行配置共 604 个文件按路径及内容 SHA-256 汇总，指纹
`bd66f87d107cadda7d873436322ab3674dfecb903d4c892794a74b746cec7cc9`。
文档、环境秘密、依赖安装及生成产物不纳入指纹。Node 24.18.0、pnpm 11.7.0；依赖锁定 SHA-256
`3480841d013a575c8debab942cdb270066c63b8b7b57cc2d92b8aefbfb171398`。

独立 `tymra-test-admin` PostgreSQL 17／Redis 7.4 使用 55439／56389；所有 41 个迁移仅应用到可丢弃测试库。
完整集成使用 `tymra_test_admin_complete`，六 OTA 离线交付使用只迁移不 seed 的 `tymra_test_admin_final_offline_test`，
实际页面及恢复演练使用 `tymra_test_admin_qa`。合成 Web／API 使用 43319／43419，Scheduler 关闭、邮件为 log；日常开发库和生产均未作为测试目标。

| 验证 | 结果与范围 |
| --- | --- |
| 模块边界／lint／类型 | 526 个实际源码模块边界、Web lint、全部 workspace 与根脚本类型检查通过；无临时生成代码混入 |
| 单元 | 根 268、Worker 502，共 770 通过；5 个真实来源条件测试跳过，未计入通过。后续 UI／取消操作改动由最终类型、构建、集成和浏览器覆盖 |
| 数据库／API／Worker | 158 通过；覆盖越界旧动作拒绝、归属／并发、恢复与关闭证据、原范围／Argus 每 Run 交付、原子结果发布／通知、取消运行中拒绝、支付事实、重复扣额、文件清理、数据导出／删除 |
| 六 OTA 离线交付 | 主集成的六个条件跳过在专用未 seed 库补验后 6 通过；六渠道两轮追加／重放／证据哈希／ACK，共计 164 项集成通过；真实外部访问被测试拦截 |
| 构建 | Web production-shaped build 和全部 Worker entrypoints 通过；使用合成配置，未建立发布镜像或部署 |
| 实际页面 | 51 次页面检查：31 次英文桌面、20 次中文 390／320px；另渠道映射详情 1440／390／320px 无溢出及 axe serious／critical 检查通过；主要六模块及窄屏相关 axe 检查通过，零页面脚本错误 |
| 实际动作 | Admin 登录、失败任务唯一恢复、确认后取消待执行工作、交回原客户确认、历史文件预览／入库／错误隔离、单计划豁免、导出准备、所属客户登录／房型确认／实际下载，均核对持久化结果 |
| 客户继续处理 | 独立已验证合成 Free 账户在 390px 实际确认查询后保存新条件、状态 QUEUED、一个待执行采集 Job、一次原始权益预留；没有启动真实外部采集。复用旧测试账户时并发上限仍正确拒绝 |
| 键盘／减少动画 | 移动导航键盘打开、焦点限制、Escape、焦点恢复，以及 reduced-motion 渲染通过；为浏览器模拟，不作为物理手机验收 |
| 实际备份恢复 | 最终合成数据库恢复到 `tymra_test_admin_restore_complete`，89 表／944 行数量与内容摘要匹配，约束与历史触发器匹配；RateObservation 和 PublicFactVersion 两个真实更新均因 append-only 被拒绝 |

恢复 dump SHA-256 为 `e25c3c49566d81c54bd78d794ddc4db6b93915717cd3f24775d63b4a1b80b3c2`，
验证时间 UTC `2026-10-08T12:23:51.306Z`（NZ 10-09）；持久审计明确 `ISOLATED_SYNTHETIC_CANDIDATE`、`productionVerification=false`。
数据库备份及个人数据文件只留在受控本地临时位置，没有放入文档或版本库；脱敏验收快照见
[本地最终改造证据](evidence/service-assurance-admin-local-2026-10-09.json)。

仍需单独发布授权和固定发布候选；本轮不证明生产迁移、生产配对恢复、真实 SMTP 送达、Stripe live、Argus 实站／人工接管、客户生产入口、告警路由、物理设备或长期运行已验收。
这些外部及部署门禁不能以合成数据、队列提交、页面可达或本地恢复代替。

## 2026-10-09 日常开发地址源码挂载与热更新

用户明确 `https://ops.tymra.test/admin` 为日常本地开发调试地址，源码修改应直接在该地址生效。
原 Web 只有镜像内源码，Worker/API 也分别运行旧镜像；原应用 Compose 标签仍引用已不存在的历史工程目录。
现已接入 `/Users/haroldchen/Development/tymra/repo` 的 `main` 工作区，保留全部既有未提交业务改动。

- Web、Worker、API 同一开发镜像 `sha256:fe3292201e596ecf2f9093af3295402d87111e279cae8bf25dbd2d2110ebf16a`，
  实际运行源码通过 bind mount 来自当前工程 `/app`。镜像标识提供工具链身份，不作为持续修改中的工作区源码指纹。
- Web 使用 Next dev/Fast Refresh；Worker/API 使用 tsx watch，并显式监听共享包；Docker Desktop 下启用文件轮询。
  Linux 依赖、pnpm store 和 Next 缓存使用专用命名卷，避免覆盖本机依赖或把依赖缓存放进构建上下文。
  实际版本显示 `local-development`／`working-tree`。
- `pnpm compose:up` 通过现有项目内启动脚本准备依赖、生成 Prisma、应用待执行 migration 并启动服务；
  既有账户及开发数据保留。seed 改为显式 `bootstrap` profile；常规源码修改自动生效，依赖变更需运行启动入口，数据库结构变更需审阅 migration 并生成 Prisma。
- PostgreSQL／Redis／Mailpit 仍是原容器和数据卷；日常库仍为 `tymra_dev`／5433，Redis 为 6379。
  仅对该日常库应用已验证的八个待执行 migration，33 → 41；没有 reset、seed 或测试数据灌入。
  本地 Scheduler／高频开关均保留关闭，未启动 Scheduler，未发起外部采集、真实邮件、Stripe 或生产操作。
- 迁移前保存受保护的 custom-format 数据库备份，277,319,710 字节，SHA-256
  `84a39e20203090d32fdb1a75da1db65b1c9a6fa3d587d909744730863d163155`，archive list 674 项可读。
  位置为 `/var/folders/b3/6_8z7qf54qv8mknyn27w2pq00000gq/T/tymra-local-dev-backup-il8ub0zu/tymra_dev.dump`；本次没有执行实际恢复。
  迁移及完整启动后，管理员 1、客户 189、报价 95,357、计划 90／启用 0 保持；账户身份／密码摘要与计划内容摘要匹配迁移前快照。
- Compose（默认与 smoke 叠加）配置、启动脚本语法、最终差异检查通过；完整日常启动入口实跑通过。
  原域名下管理员登录、八个主要后台页面、英文／中文切换、1440px 桌面及 390px 手机导航实际通过。
  临时受认证路由的 Web 文案和共享包文案修改后，已打开页面无需手动刷新即更新；共享包修改后 Worker/API 子进程均自动更换。
  最终浏览器检查无框架覆盖层、页面错误或控制台警告，手机无横向溢出。临时路由／模块及截图均未纳入源码交付，已移除临时源码。

本条验证范围为日常开发环境接入、热更新与当前后台页面。上述整体后台固定候选的完整本地验收保持历史范围；
持续修改的工作区及开发镜像不替代另行收敛的生产发布候选和发布验收。

## 2026-10-09 服务保障后台回归与会员风控修复

本轮检查本地后台改造、服务恢复与既有采集合同。基线仍为 `main`／
`e0fb73d794e0044189f78c6abaab2339d2fa6573`，保留全部原有未提交修改。
按前述源码／测试／运行配置口径汇总 607 文件，内容指纹为
`e3f2aeed75a3787dae40a83f2d727fc24393a9c6a69e0f53e4abc9f21a04f931`，锁文件未变。

已修复：

- 会员风控汇总原先只取近 30 天最多 1,000 条，案件数、申诉数、放行率和原因频次会截断；
  改为数据库全量聚合，兼容历史非数组／非字符串原因码。趋势仍为近 30 天，待处理数明确为全部日期。
- 待办页统计全部 OPEN，但风控入口强制近 30 天，客户详情又只看最新 20 条；
  列表默认全部日期、可显式切换近 30 天，客户案件有完整分页与真实待处理数量。
  列表链接携带所选案件；即使案件不在当前详情页，也显示该客户的案件及可用审核动作。
  原开发库 19 条超过 30 天的 OPEN 案件已实际显示，没有修改这些案件状态。
- 风控审核缺少 ID、案件不存在或重复审核原先返回通用 500；现在分别返回 422、404、409，
  重复审核不写第二条审计。客户用量无关联请求时也不再生成 `/admin/checks/null` 链接。

验证：

- 模块边界 528 文件、lint 和全工作区类型检查通过。既有单元 268＋502＝770 项通过，5 项外部条件测试跳过。
- 完整既有集成 158 项通过；默认跳过的六 OTA 另在新建、只迁移不 seed 的
  `tymra_test_regression_e5b3af0e_offline_test` 全部通过。首次误用已有离线库被“不覆盖来源历史”守卫拒绝，
  没有修改该库既有来源；新空库的成功结果取代该失败尝试。
- 修复后相关集成 36 项通过，其中新增 5 项，覆盖超过 1,000 条统计、超过 30 天的待办、
  客户 25 条以上分页／所选案件、客户归属及审核错误／重复审计。其余未改动测试结果按源码范围复用。
- 真实 `https://ops.tymra.test` 管理员登录和 13 个主要后台页面通过；
  修正的五个 Web 文件与容器挂载源码哈希逐一一致，页面有新日期筛选，Web／Worker readiness 均 HTTP 200。
- 独立合成 QA 库实际执行所选历史案件审核并核对保存、重复审核 409、错误 Origin 403、分页及日期过滤；
  EN/ZH、1440／390／320 CSS px、两类受影响页面的 axe serious/critical、手机菜单 Escape／焦点恢复通过。
  浏览器页面错误、控制台错误和警告均为零；合成案件／账户已从 QA 库清除。

数据库集成与操作只在 55439／56389 的独立测试服务，日常 `tymra_dev` 只作页面检查；
没有日常业务写入、Scheduler 启用、外部采集、真实消息／Stripe 操作、commit、push 或生产发布。
本轮未重做生产形态构建或备份恢复，也不代替真实外部／生产验收。
脱敏回归补充记录在[既有本地证据](evidence/service-assurance-admin-local-2026-10-09.json)的 `regression`。

## 2026-10-09 服务保障后台生产发布与验证

用户已授权推送全部本地代码并发布生产。发布比较以实际生产 `2024961` 为基线；
已把生产 Booking 参考价保留／继续采集修复合入重构后的 Worker，避免发布回退该行为。
严格保持参考价与匿名可订总价分离、失败记录、来源预算及固定质量验收窗口。

本地完整 `pnpm verify` 通过：lint／类型、777 项单元（5 项外部条件跳过）、
163 项数据库/API/Worker 集成、生产形态 Web／Worker 构建。
默认跳过的六 OTA 合同另在新空隔离数据库全部通过，包含 Booking 参考价后继续正价采集、
重复调用不收费、不生成伪公开价格、不可变历史及证据交付／ACK。
全部本地改动以 `c8e9e126b9b19fb468e37ee59d54f978a729ec5d` 推送至 `origin/main`；
浏览器验收随后以 `bfb835507a333193a14adf99b75f5483942f68d8` 修正旧页面标题并恢复手机场景。
两提交仅测试与文档不同，492 个运行文件完全一致，指纹为
`e55670f40d2df43ecf2648236a871950aee6aede8d837e19f2d1cf1711520cc2`。
[最终云端 CI](https://github.com/Harold-C/tymra/actions/runs/37860545792) 的 verify／browser
均成功；完整浏览器 29 通过、1 个条件场景跳过，会员矩阵 8 通过。
首个候选云端 browser 因旧标题断言失败的记录保留；跳过不计入通过。

NZ 2026-10-09 13:13 的生产读回如下：

| 项目 | 实际结果 |
| --- | --- |
| 运行候选 | `c8e9e12`／`service-assurance-20261009`；Web、API、Worker、Scheduler 同一实际镜像 `sha256:4fce5920a1f48a070da88a814ebceba9b04152fdf42e4a82f916de0f76d6ba43`，四应用运行／重启零，Web 与 API healthy |
| 迁移与数据 | 六个增量迁移实际完成，35 → 41；新增八张业务表。80 张原业务表的逐表行数与全行摘要保持，允许的恢复／浏览器访问审计和管理员会话另行计入；39 条价格、零客户、84/84 计划及原 nextRun／预算／质量窗口保持 |
| 配对恢复 | 切换前最新数据库与 evidence 备份实际恢复到独立内部网络，80 张原业务表、索引／约束／触发器和 822 份证据的内容／权限／属主匹配；在恢复副本应用最终迁移后，旧镜像 80 模型及候选 88 模型均完成只读 count／findFirst，业务数据一致 |
| 运行完整性 | 824 个未删除证据指针逐一验证实际文件与哈希，822 份 volume 文件保持；DB／Redis／Argus health/readiness 正常，Worker／Scheduler 生产心跳绑定本次版本与提交；主 Scheduler 保持开启、高频关闭 |
| 配置与其他服务 | 使用实际旧容器环境生成发布及回滚配置，并以未启动的临时容器验证；仅增加两个版本字段，原秘密、入口、命令、挂载和网络保持。PG／Redis、Spicy Maggie 网站及 Traefik 的容器身份、镜像、环境与挂载保持；挂载按实际条目核对，不依赖返回顺序 |
| HTTPS 与页面 | `https://ops.tymra.nz` 的 13 个主要 Admin 路由返回 200；设置显示实际版本和持久恢复验证，保留截图证据经实际 GET／哈希／sandbox 验证；EN/ZH、1440／390／320px、无横向溢出、axe serious/critical 零、手机 Escape 焦点及会员风控默认全部日期通过，浏览器错误／警告零 |
| 访问与认证范围 | 生产仍为 Admin-only；客户／公开检查／Stripe 路由拒绝、无会话 Admin API 403。页面验证使用现有管理员关联的临时审计会话，完成后已撤销；现有管理员记录保持，本轮未重新输入真实密码验证登录 |
| 保留问题 | 既有 `FAILED_JOBS_PRESENT` 四条失败任务仍告警；Booking enabled／PILOT、运行许可 HEALTHY、质量 DEGRADED、每日六次／并发一保持。发布不算新的公开报价、连续质量门槛或自然周期通过 |

最终镜像仅重建 Tymra 四应用；Argus `824e0dd5` 的实际运行候选保持，复用其同候选
已完成的生产目录／owner 验收，并以 Tymra 现有凭证读取已交付 Job 200／result 410。
Tymra 凭证的 connector 目录读取为 403，没有扩大权限；本次未新增来源抓取、额度豁免、
真实邮件、Stripe 或客户入口开放。

受保护恢复材料在 `/srv/apps/tymra/backups/service-assurance-20261009-cutover`，旧镜像、
精确回滚配置和发布 helper 在 `/srv/apps/tymra/releases/service-assurance-20261009` 保留；
回滚须核对后续回填／豁免／扣额纠正／修复活动，保留已迁移的业务数据与证据。
恢复结果已持久为 `production_backup_restore_verified` 并在设置页显示。
本机收据、构建／云端门禁及生产页面截图在 `runtime/release-candidates/service-assurance-20261009`；
两套本次演练的临时容器／网络／副本 volume 按标签核对后移除，正式备份和原生产数据保留。
