# Tymra Current Development Traceability

Last updated: 2026-10-06 (Agoda production automatic schedule enabled; all six OTA plans healthy and enabled; first natural schedule cycle not yet observed)

## 2026-10-06 Agoda 自动计划已启用，六个 OTA 计划开启

用户在下节双轮生产复测通过后明确要求开启 Agoda 自动计划，继续执行独立修复版本
验收窗口方案。候选新增 `ota:production:acceptance-version`，必须显式指明前一个
固定父 Job；原 `productionOtaRepairAcceptance` 保持，后续版本只追加到
`productionOtaRepairAcceptanceVersions`。拒绝缺失／错链的旧窗口、重复代码版本、
倒退起点及未经显式版本操作的覆盖；健康、启用和预检使用同一最新窗口，原失败和
30 天历史指标继续保留。

第一候选 `8ba90d4` 的完整 CI 及数据／证据恢复通过，但隔离正式启用发现详情缓存
仍保留第六轮观察时间，原 positiveListingCount 查询误将第八／九轮成功发现判为
零，因此没有发布该候选。最终 `5af32df` 使用共用证据查询，只允许七天内的非演示
身份通过本窗口成功发现的精确父 Job 关联计入，拒绝失败、空结果、过期／不关联
身份，保留原观察时间。56 项定向检查及 Worker 类型检查通过；
[完整 CI](https://github.com/Harold-C/tymra/actions/runs/37363442645) Web／域模型
238、Worker 389、数据库集成 123 项通过，5／6 条既有条件跳过及其原验收边界
保持，117 页编译完成。固定镜像全部 20 层 RootFS 和完整执行配置匹配，实际镜像
`sha256:7f88ff04666228d857d278a7dcfb81f1a5c2f7217df1eeee639e7377b9563fee`。

新鲜 `/srv/apps/tymra/backups/agoda-version-20261006-v2-predeploy` 用最终镜像隔离
恢复，80 张业务表、525 份证据及权限／属主、55 条已有交付确认匹配。编译后的
窗口追加、相同操作的无写入重试及正式启用通过，精确接受第八／九轮父 Job；原
窗口、历史行及其他来源／计划保持，隔离资源已移除，没有外部采集。只替换 Tymra
四个应用服务，没有新 migration；配置／挂载、数据库／Redis 和无关容器保持。
`2026-10-05T19:38:58Z` 生产读回核对业务／证据摘要、HTTPS 管理页、Worker readiness、
Argus 调用方认证和权限隔离通过，应用运行正常、重启零。

`2026-10-05T19:39:42Z` 正式追加窗口，以第八轮 `cmuvlkn5f0000nznlsryt66pm` 的
`2026-10-05T18:42:46.707Z` 为起点，记录实际采集版本 Tymra `f6ff386`／Argus
`21310f8`；当前 Tymra 运行版本为 `5af32df`。原 R4 窗口及 R5 两项解析失败标记、
全部 Job／Run／Execution／证据／报价保持，第八／九轮精确完整成功及零新解析
错误通过正式 CLI 门槛。Agoda 转为 HEALTHY，自动计划已开启，下一计划为
NZ `2026-10-07 17:00`（UTC `2026-10-07T04:00Z`）。六个 OTA 来源及六条自动
计划均正常开启，原 71 条公开计划和其余五个 OTA 计划保持。正常每日六次预算、
并发一、Argus 每来源每日十二次额度保持；无手动豁免，当日 Agoda 十二次计数
没有重置。本轮没有新增抓取，自然自动周期尚未发生。

Synix Live／UAT 十个容器的身份、镜像、版本、健康和重启数核对一致；Argus 三个
容器保持，浏览器仍为 `21310f8` 且健康，未修改其私有代码、配置或 Profile。
发布／恢复／启用及最终计划收据统一在 `runtime/release-candidates/agoda-version-20261006-v2`；
第一候选及首次隔离拒绝证据保留在 `agoda-version-20261006-v1`。

## 2026-10-06 Booking 已启用，Agoda 限制文字修复及两轮生产复测通过（上轮记录）

共享服务和 Synix 调用方空闲后，Argus `c218f3f`／`argus-release-20261005-11`
及 Tymra `f6ff386` 已按顺序部署；沿用下节已通过完整门禁的固定镜像，没有重新
构建或新增生产 migration。Synix 的待人工任务先自然到期，没有取消私有任务。
Argus 最新加密配对备份用最终镜像本机隔离恢复：807 个 Job、2 个账号、48,777 项
私有条目及权限／属主匹配，四项所有权拒绝、三份 wire 哈希、两个离线 Profile
打开通过；不代表实站认证。仅切换 browser 服务，PostgreSQL／tunnel、环境／挂载
及私有实现保持，健康、重启零；HTTPS 六公开连接器的列表／详情／报价流程、私有属主读取及跨客户端
拒绝通过。加密备份 `argus-prod-20261006-ota-physical-units-predeploy.sparseimage`
已封存，所属明文传输目录已移除，生产 Profile 和卷保留。

Tymra 新鲜 `/srv/apps/tymra/backups/ota-launch-20261006-physical-units-predeploy`
以 `f6ff386` 固定镜像隔离恢复，80 张业务表、491 份证据及 38 条已有交付确认
保持。只替换四个应用服务，数据库／Redis／无关容器及配置保持，重启零；
`2026-10-05T11:57:23Z` 生产读回中业务／证据摘要、HTTPS 管理页、Worker readiness、
Argus 调用方认证及权限隔离通过。Synix 应用、私有代码／配置／Profile 未修改。

Booking `cmuv7ef5m0000nz6vcck2df25`、`cmuv7tu7t0000nz95q641tkv2` 均一次尝试
完整成功，分别三次／两次执行，保存 Fable Terrace Downs（Windwhistle，Canterbury）
2 Bedroom Villa 的公开绑定容量 4，以及 2026-10-13–14、2 成人、一单位、匿名
NZD 539 AVAILABLE／COMPLETE 非演示报价。十份本地证据逐份哈希、五次持久化
交付及所属摘要 200／ACK 后结果 410 已独立核验，旧 Job 行保持。
固定修复验收窗口从首个父 Job `2026-10-05T12:06:01.785Z` 开始，记录 Tymra
`f6ff386`／Argus `c218f3f`，旧失败、30 天原指标及其他计划不改写。正式启用 CLI
已通过，下一自动计划为 NZ `2026-10-07 01:32`。目前五来源正常启用，71 条公开
计划保持；自然自动周期尚未发生，不能将启用等同于已观察到自动抓取成功。

Agoda 第四轮 `cmuv75n200000nz46nhskb1ke` 在正常 Christchurch 列表上保留了
10 月 12–14 日，目标为 13–14 日，以 INTERNAL_ERROR／SOURCE_UNAVAILABLE
失败；未保存房源／报价。两份证据及一次交付／ACK 保留，解析失败标记为 false。
其固定窗口从该失败父 Job `2026-10-05T11:59:12.120Z` 开始，仍记录 `f6ff386`／
`c218f3f`，不移到后续成功之后。离线浏览器已复现搜索栏日期摘要与日历格共享
`data-date` 导致点错；Argus `8c2ff14` 限定日历范围，并在提交前验证日期，
失败返回固定 AGODA_STAY_CONTEXT_CHANGED，保持原入住及完整报价门槛。
完整门禁源码 915、固定镜像 1,103 项通过，各层零失败，条件入口相互覆盖，配对
恢复及运行／故障恢复通过。新鲜加密快照实际恢复 820 Job／2 账号／49,400 私有
条目；旧 813 Job 快照因 Synix 自然推进七个 Job 而未用于切换。`2026-10-05T13:23Z`
在共享及 Synix 调用方空闲时发布 Tag 1 并读回，PG／tunnel、私有基线、配置／
Profile 和 Synix Live／UAT 十个应用容器保持，HTTPS 权限隔离通过；Tymra 仍为 `f6ff386`。

第五轮 `cmuvadl510000nzcp4aba99da` 的 Christchurch 列表已按原 13–14 日成功。
LyLo Christchurch Airport 正常详情却在身份阶段以 PARSING_ERROR 失败，未入库
房源／报价；四份持久证据、两次交付、所属摘要 200／ACK 后 410 及旧 Job 行保持
均已核验，详情的两项 parserFailure=true 保留。公开弹层确认报价旁的“3 adults”
表示优惠最大容纳人数，旧实现误作报价人数。Argus 已发布版本 `8f0204a` 分别记录
容量和可见搜索人数，仍拒绝不足容量、无法核实或矛盾人数、儿童／多单位的未核实
映射及显式三人报价。28 项定向回归、类型检查及原生产 HTML 无网络重放通过，
家庭房容量 3、搜索人数 2，单人 Pod 排除。完整门禁源码 916、固定镜像 1,105 项
通过，各层零失败，条件入口相互覆盖，配对恢复及运行／故障恢复通过。Tag 2
固定导出的 12 层 RootFS 和完整执行配置匹配；新鲜生产备份以该镜像实际恢复
822 Job／2 账号／49,626 私有条目及权限／属主、四项所有权拒绝、三份 wire 哈希、
两个离线 Profile 打开。共享和 Synix 调用方空闲后切换，实际镜像
`sha256:389bf85fd44b3e594a194680f3b14ee87aebd69d3923e28297fa7a5f33a150d1`
健康、重启零；PG／tunnel、配置、挂载及私有实现保持，Synix Live／UAT 十个
容器身份、镜像、版本、健康和重启数一致，HTTPS 权限隔离通过。加密备份和
恢复收据保留，仅移除所属明文传输目录。

第六／七轮 `cmuvd2qd00000nzh8dtpwlsgm`、`cmuvd9acd0000nzj32dswzoup` 均一次
尝试完整成功，分别三次／两次执行，第二轮复用同日期的已核实详情。保存
LyLo Christchurch Airport（`agoda:1249309`）的 Family Ensuite Room，绑定容量 3、
地址 5 Peter Leeming Rd 及同房源公开坐标；原 2026-10-13–14、2 成人、一单位、
匿名 NZD 329 AVAILABLE／COMPLETE 报价两次入库。十份证据哈希、五次交付及
所属摘要 200／ACK 后 410、旧 Job 行均已核验，无新解析失败。但可售报价的
restrictionReason 继承了页面其他房型的“sold out”；现行市场统计会将非空限制
原因计为受限。Argus 已发布 `21310f8` 只修正公开可售报价的限制归属，并将
最低入住限制绑定同房型；真正不可售原因继续保留。旧实现回归重现、修复后的
17 项检查及类型检查通过。[完整门禁](https://github.com/Harold-C/argus/actions/runs/37329293921)
源码 917、固定镜像 1,106 项通过，各层零失败，172 条 Chrome／13 条 PostgreSQL
条件入口相互覆盖，配对恢复及运行／故障恢复通过。
[固定导出](https://github.com/Harold-C/argus/actions/runs/37333303412)的全部 12 层
RootFS 和完整执行配置匹配。新鲜配对备份以最终镜像实际隔离恢复 827 Job、
2 账号、49,935 项私有条目及权限／属主，四项所有权拒绝、三份 wire 哈希和两个
离线 Profile 打开通过；不证明实站认证。加密备份
`argus-prod-20261006-agoda-restriction-predeploy.sparseimage` 已封存，SHA-256
`486ff6aa6d360dbaf50cb6ffef50e9317162cc84c27887d82b9de4f1a131d878`。
在共享及 Synix 调用方空闲时完成 Tag 3 切换，实际镜像
`sha256:1d91f3609347071c4bc8f29f2eb77b015df19688221a06c87b0a9a921938c93a`
健康、重启零，PG／tunnel、配置／挂载及私有实现保持。HTTPS 六公开连接器的
列表／详情／报价流程、私有属主读取及跨客户端拒绝通过，Synix Live／UAT 十个
容器身份、镜像、版本、健康和重启数一致；所属明文传输目录已移除。
发布后 Synix 新任务进入共享浏览器，保护检查在任何生产写入前先阻止复测准备；
任务自然结束后继续，没有取消或中断私有任务。第八／九轮
`cmuvlkn5f0000nznlsryt66pm`、`cmuvlnyzd0000nzpv2120586o` 均一次尝试完整成功，
各两次执行（列表／报价），复用同日期已核实详情。LyLo Christchurch Airport
Family Ensuite Room 容量 3，原 2026-10-13–14、2 成人、一单位、匿名 NZD 329
AVAILABLE／COMPLETE 报价均入库。数据库 restrictionReason 和 minimumStay 均为
null，新解析失败为零；八份本地证据逐份哈希、四次持久交付、摘要 200／ACK 后
410、旧 Job 行保持全部通过。前两条报价的原“sold out”值、R5 两项解析失败
及原 R4 窗口独立读回保持。市场统计使用最新观察值，新输入不再带无关限制原因；
没有改写原两轮报价及其原始证据。
原 R4 窗口和旧失败保留；其中的新解析失败仍阻止正式启用。新增独立修复版本
窗口的规则调整待用户决定，零解析错误及最近两次精确完整成功门槛继续保留。
现行代码只支持一个不可移动窗口，不能以删除或覆盖原窗口／失败标记代替新规则。
Agoda 自动计划仍关闭；当前五条正常 OTA 计划保持。

本轮 Argus 限制归属修复收据在 `runtime/production-releases/argus-release-20261006-3`，
人数修复在 `argus-release-20261006-2`，
日期修复在 `argus-release-20261006-1`，先前房型修复在 `argus-release-20261005-11`；
Tymra 发布收据沿用 `runtime/release-candidates/ota-launch-20261005-v3`，前次备份的验证收据
保留为 `first-*`。生产父 Job、验收窗口和启用收据仍在既有 `ota-launch-20261005-v1`
目录；目录日期不代表本轮验证日期。原手动豁免已移除；沿用原授权，仅为 Agoda
短期恢复手动豁免完成四次有界执行，结束后已撤回，当日累计十二次、计数保持。自动计划
每日六次预算及 Argus 每来源每日十二次额度、节奏／挑战保护保持。

## 2026-10-05 公开房型身份修复候选及生产诊断（历史，最新见上节）

Argus `dca5cc0`／`argus-release-20261005-9` 已发布，完整源码 913 通过、固定镜像
1,096 通过、各层零失败，配对恢复及运行／故障恢复通过。实际镜像
`sha256:0580d13480c214f4c701cdaf82dcfdde8b922b90660f84bf5d53a88316844699`
健康、重启零，保留 `7ecde96` 私有基线。最新快照用固定镜像在 ML Mini 隔离资源
恢复，770 个 Job、2 账号、47,494 项文件及权限／属主匹配。最初本机恢复因
Docker／磁盘故障未完成，没有计为通过；恢复后仅本轮遗留的隔离资源已清理。

Agoda 第三轮 `cmuuwerbo0000rvcdab0osh7w` 的列表及报价区正常，但无日期详情
缓存选中了最大人数显示为 3 的家庭房，目标 2 人；当时该容量被误作报价人数而
排除，未保存完整价格。容量语义后来由公开说明弹层确认，最新修复见上节。
Booking `cmuuwjgzf0000rvf8emhb4oqg` 搜索及详情成功，公开 `RoomDetails` 中
房型 ID 对应真实最大人数；原解析只看可见 UI，容量未知，且 Coleridge Road
误作城市，以 UNIT_IDENTITY_NOT_PUBLIC 结束。两父 Job 一次尝试，四次执行、
八份证据、四次交付确认及 ACK 后 410 全部独立核验，原失败和证据保留。

本轮候选按 Agoda 原入住日期解析实际可售房型，在缓存指纹中加入该日期，
仅对 Agoda 有界采集选最小适配房型；Booking 更新公开绑定容量与道路城市判定。
17 项 Tymra 定向检查和类型检查、15 项 Agoda 合同检查、Booking 新浏览器绑定
检查通过。两份保留生产页面无网络重放得到 Agoda 三个 2 人房型与真实坐标，
Booking Windwhistle 和容量 4／6；这不等于真实完整报价成功。完整最终候选门禁、
发布与两个最新真实父 Job 的验收继续进行；四个已启用来源保持原计划。

Tymra 固定候选 `f6ff386` 的[完整 CI](https://github.com/Harold-C/tymra/actions/runs/37284185782)
通过：Web／域模型 238、Worker 365、数据库集成 123 项通过，条件跳过与既有入口
覆盖保持原约定，117 页编译完成。镜像已传到生产主机并逐层及完整执行配置核验，
目标镜像为 `sha256:f10fa0a97bf6c0720d49880352847ab984de02809b98ae335f7ace4e81b8ee0a`。
`/srv/apps/tymra/backups/ota-launch-20261005-physical-units-predeploy` 用该镜像隔离
恢复通过，80 张业务表、487 份证据及 36 条已有交付确认保留，无生产 migration
或服务切换。Argus 最终候选为 `c218f3f`／`argus-release-20261005-11`，
[完整发布门禁](https://github.com/Harold-C/argus/actions/runs/37285192767)通过：源码层
914 项通过，170 条 Chrome 条件入口由同一固定镜像补验；镜像层 1,098 项通过，
13 条 PostgreSQL 条件入口由源码层覆盖，各层零失败，合成配对恢复及运行／故障
恢复通过。[固定导出](https://github.com/Harold-C/argus/actions/runs/37288630756)及
全部 12 层 RootFS、完整执行配置核验通过，发布身份为
`ghcr.io/harold-c/argus@sha256:1aa97514e97a2d3d8cc8d0412eff51ac423db507f2a55fb86903958366f363eb`。
先前 ML Mini SSH 登录被拒绝，但当时未证实具体认证原因；`2026-10-05T10:01Z`
复核 Synix 发布记录后，以同一入口及密钥通过系统钥匙串认证成功。SSH agent 为空
并不证明必须人工解锁，先前该判断已更正。Tag 11 已完整传入 ML Mini，实际加载
镜像 `sha256:d008067a6d0d18aa533a7d7bc7b284ac374c63accb19b964ffc0297416af774e`
的层及执行配置一致。最新加密生产备份用该固定镜像在本机隔离恢复通过：774 个
Job、2 个账号、47,972 项私有文件摘要／权限／属主匹配，四项所有权拒绝、三份
wire 哈希及两个离线 Profile 打开通过；这不代表已验证生产站点登录。
`2026-10-05T10:20Z` 切换前 Synix 订单同步进入共享队列，保护检查在修改生产
镜像前拒绝切换。Argus 仍为 Tag 9，Tymra 仍为 `c811995`；Synix 任务没有被中断。
已恢复备份已加密封存，后续必须等共享与调用方任务空闲，再制作并恢复核对与
最新生产数据一致的配对备份。两条剩余渠道仍待发布及真实验收。

`2026-10-05T10:10:45Z` 最新 Tymra 只读复核仍为 `c811995`：四个服务运行、重启
零，四条 OTA 及 71 条公开计划开启，Agoda／Booking 关闭，无在途 OTA。两来源
当日执行分别为 7／4 次；本轮准备没有新增 Tymra 真实站点请求。Argus 项目先前只读核对仅
找到既有 SSH 身份，当时 agent 无 identity、无已认证会话可复用；备用屏幕共享
可达，登录与管理权限未验证。后续切换前必须重新核对最新生产基线及备份一致性。

## 2026-10-05 临时解除生产手动调试额度，推进六 OTA 上线

用户明确授权临时取消生产每日六次额度并调试上线六个 OTA，取代下节“等下一预算日”
的接续限制。新增有到期时间的来源级手动试采豁免：只对 `ota-trial:` 父 Job 生效，
窗口最多 24 小时，执行计数及原历史全部保留；自动计划仍使用每日六次额度。
每父 Job 最多三次执行、只尝试一次、共享并发一、来源间隔／挑战冷却和完整报价、
证据／交付／ACK／启用门槛保留，不修改 Argus 或 Synix 的私有配置／Profile。

57 项预算豁免、真实提交边界和生产 OTA 门槛定向检查及 Worker 类型检查通过。
功能候选 `b7dd6577a0cb67d7720c5d30ea861769747e1e62` 已 push，
[完整 CI](https://github.com/Harold-C/tymra/actions/runs/37258701923)通过：Web／域模型
238 通过、5 条件入口跳过；Worker 346 全部通过；数据库集成 123 通过、6 条既有
专用入口由此前独立验证覆盖；编译通过。固定镜像内容、完整执行配置及运行用户
可读性通过，实际生产镜像为
`sha256:73d5213eb41fdcad75c008021361cf21102ba33915b35711c4ceeafc5e8b62b7`。

新鲜 `/srv/apps/tymra/backups/ota-launch-20261005-predeploy` 用最终镜像隔离恢复，
80 张业务表、423 份证据及五条交付确认完整保留，无新 migration。四个 Tymra
应用完成切换，`2026-10-05T03:46:20Z` 读回中业务行及证据摘要一致、重启零、
HTTPS 管理页／noindex、Worker readiness、Argus 调用方认证及最小权限通过。
数据库、Redis、共享入口及 Spicy Maggie 网站容器未替换。回退镜像及受保护配置保留。

六来源手动豁免已写入生产，到期 `2026-10-05T15:46:41Z`，窗口 12 小时。
只对手动试采父 Job 生效，正常计划仍每日六次，计数及旧失败保留。Bookabach
当日执行达到七次且第二个完整父 Job 成功，实际证明额度豁免已作用于生产。

| 来源 | 最近两个完整成功父 Job | 报价（NZD） | 下一自动计划（NZ 时间） |
|---|---|---|---|
| Bookabach | `cmuumhw9l0000o243lf9mpuh9`、`cmuupkppz0000ph3as30e7d5f` | 108 | 2026-10-06 18:19 |
| Airbnb | `cmuupnz9x0000ph5zhslv462d`、`cmuuprbjb0000ph880f2zxk95` | 299 | 2026-10-06 17:24 |
| Trip | `cmuupzc1f0000phdpsz64624a`、`cmuuq61iz0000phggkt7jkjw3` | 107 | 2026-10-06 19:37 |
| Expedia | `cmuur4kcd0000phm32h2jyhpb`、`cmuurbpuz0000phpdanf4o027` | 174 | 2026-10-06 19:27 |

上表来源均通过正式启用 CLI。实际报价为 2026-10-12–13、2 成人、一单位、匿名，
非演示、AVAILABLE／COMPLETE；每个新 Job 一次尝试、两到三次 Argus 执行。
全部本地 HTML／截图逐份哈希、持久化交付确认、所属 Job 200 及 ACK 后结果 410
已独立核验，旧父 Job 完整状态不变，其他来源及 71 条公开计划的配置保留。
自然自动周期尚未发生，不能将已开启计划描述为已观察到下一次自动抓取成功。

Agoda Christchurch Job `cmuupu46x0000phbdhzwk76tk` 列表及必要详情成功打开，
取得真实房型、街道地址，但同酒店 `Rd` 与 `Road` 地址字符串比较导致公开坐标
被排除，以 `UNIT_IDENTITY_NOT_PUBLIC` 一次尝试结束。四份证据／两次交付及原失败
保留，来源恢复关闭，未伪造房源／报价。Argus 公开 Agoda 修复已通过 19 项隔离
Chrome／合同检查、类型检查和原页面无外部请求离线重放；固定候选
`33685d53f79ef8873d957ab23644a8823c5ba1bc`／`argus-release-20261005-5` 已 push，
完整镜像门禁已通过；两项公开修复已合并为 `f45443a`／`argus-release-20261005-6`
并完成发布。修复后 Agoda 的列表和详情身份已生产通过，完整报价仍有下述 UI 问题。

共享 Argus 私有基线 `fc8c996`／`argus-release-20261005-4` 由另一条授权工作发布。
本轮公开候选继承该实际基线，只在调用方及共享任务空闲时切换，当次运行
`f45443a`，镜像 `sha256:84268d6b3b6460b4912c3785e5fa6cf25ad8272374077ba6629d2801816900e2`
健康、重启零。完整门禁、固定导出和最新配对恢复通过：766 个 Job、2 个账号、
47,001 项私有条目及权限／属主匹配。原环境／挂载、PostgreSQL／tunnel 保留，
私有属主读取及公开客户端跨账号拒绝通过，Synix 应用未修改，无私有任务中断。

Expedia `cmuur4kcd0000phm32h2jyhpb`、`cmuurbpuz0000phpdanf4o027` 均一次尝试
完整成功，取得 `expedia:2755380` 的 2026-10-12–13、2 成人、一单位、匿名
NZ$174 AVAILABLE／COMPLETE 报价，分别三次／两次执行、六份／四份证据。
全部本地证据哈希、持久化交付及 ACK 后结果 410 独立通过，旧记录没有改写。
最初启用被 9 月 30 日的历史解析失败标记挡住；按下述获准的固定修复验收窗口
重新验收后，正式 CLI 已开启计划。30 天原始指标仍保留两项解析失败标记和
33% 的历史解析失败率，新窗口为零解析失败；未修改旧 Job、Run、执行或证据。

Booking `cmuuqzmrk0000phjrwe4u33zz` 一次尝试以 ACCESS_CHALLENGE 结束，
实际保留的是 HTTP 202 空白页（blank_page），没有可见登录表单或验证码。
两份证据及一次交付／ACK 通过，来源及计划关闭，冷却到 `2026-10-05T05:26:44Z`。
隔离回归证明 commit 后的空白过渡页会令搜索被跳过，即使首页随后正常渲染；
Argus 加入最多 20 秒、受总期限约束的首页就绪等待。真正 403／429／验证码仍停止，
人工完成验证码后仅在原公开会话恢复搜索。后续生产首页已加载，完整工作流结果见下文。

Agoda `cmuutlnw30000rv60uwe5xyt8` 复测列表和详情成功、房源入库，报价步骤 HTTP 200
但只有酒店介绍和“VIEW THIS DEAL”控件，房型报价区未挂载，以 INTERNAL_ERROR／
SOURCE_UNAVAILABLE 一次尝试结束，未保存完整报价。Booking
`cmuutra7r0000rv8e6rg6aosa` 首页 HTTP 200、搜索表单已加载，但可选“登录享优惠”
弹窗遮挡输入框，`destination-fill:failed`／NAVIGATION_ERROR；不是必须登录或
验证码。共八份证据逐份哈希、四次持久化交付及 ACK 后结果 410 全部通过，旧记录
不变，两来源及计划已自动关闭。Argus 追加明确房型跳转控件和命名可选弹窗关闭
修复，64 项相关浏览器／解析合同检查及类型检查通过；Tag 9 发布与复测已完成，
其最新结果见上节。
后续固定候选为 `dca5cc086d83ef6672286736c388b91383563f34`／
`argus-release-20261005-9`，
[完整源码回归](https://github.com/Harold-C/argus/actions/runs/37270561494)已通过：
913 通过、零失败，169 条 Chrome 条件入口已由固定镜像补验。候选继承独立私有
`7ecde96` 发布代码，确认私有发布结束后在共享空闲及最新恢复通过时切换；
相对此基线仅公开 UI、对应测试及状态文档变化。

Harold 已明确批准修复版本的独立验收起点。Tymra 候选记录来源、首个精确父 Job、
两端修复代码及授权时间，不自动移动起点；保留全部旧记录与 30 天历史指标，
当前窗口继续要求零解析错误及原挑战／限流／空结果门槛，最新两个完整成功父 Job
必须在窗口内。49 项定向检查及 Worker 类型检查通过，功能候选
`c8119952768c40e4fabf66ea6188429d7f37883c` 的
[完整 CI](https://github.com/Harold-C/tymra/actions/runs/37265836406)通过：Web／域模型
238 通过、5 条件入口跳过，Worker 363 通过，数据库集成 123 通过、6 条既有
专用离线入口由此前独立验证覆盖，编译通过。实际生产镜像
`sha256:9a97f342ba8f994eaf285d3dc4e6f5dc8b6d22b955bef4a4eb661695a64065c6`
与固定源码、20 层 RootFS 及完整执行配置匹配，运行用户可读性通过。

`/srv/apps/tymra/backups/ota-launch-20261005-window-predeploy` 用最终镜像隔离恢复
并完成四应用切换，`2026-10-05T05:26:54Z` 读回中 80 张业务表、471 份证据和
28 条已有交付确认完整保留，无新 migration。管理 HTTPS／noindex、Worker
readiness、调用方及权限拒绝检查通过，数据库、Redis、共享入口及无关容器保留。
Expedia 固定起点为 `2026-10-05T04:30:28.093Z` 的第一个完整父 Job，记录该次
实际 Tymra `b7dd657`／Argus `fc8c996` 代码及授权时间，不将新门禁代码冒称为
原采集版本。正式启用后共四条 OTA 计划，其他 71 条公开计划不变。
Tymra 本轮未修改 Synix 私有实现、配置、Profile 或应用；六来源全部生产上线仍未完成。

## 2026-10-05 Bookabach 修复已发布，一次完整生产复测成功

用户要求进行下一步。Argus 只补充可见 `product-price-summary` 报价组件，原来的
当前价唯一性、隐藏组件过滤、费用同报价区域及匿名精确住宿上下文保护保留。
Tymra 有界面板报价遇到 `availabilityStatus=UNKNOWN` 时，明确报
`PUBLIC_RATE_AVAILABILITY_UNKNOWN`，不再将它描述为不可售；明确不可售／限制、
未知税费及完整正向报价门槛继续适用。原生产失败历史保留，未改业务结果为成功。

两端新回归先重现原缺陷再通过。Argus 12 项隔离 Chrome／合同和类型检查通过；
Tymra 17 项面板持久化／价格检查及 Worker 类型检查通过。原生产 HTML 去除脚本、
阻断全部外部请求后离线重放，实际提取 NZ$108、AVAILABLE、BUNDLED 及含税费；
费用分项仍 null，促销／押金提示保留。重放不消耗生产来源预算，也不计入生产
启用成功次数。

功能候选已 push：Tymra `a032fb5e7854a746fdcd1e9068c020edf7a9639b`、Argus
`6df86010a98f1fb532bce60f6f441433c5fc6de0` / `argus-release-20261005-3`。
[Tymra 完整 CI](https://github.com/Harold-C/tymra/actions/runs/37249811967)通过：
Web／域模型 238 通过、5 条件入口跳过；Worker 334 全部通过；数据库集成 123
通过、6 条专用离线库入口仍由此前独立验证覆盖，117 页 Web／Worker 编译通过。
[Argus 完整发布](https://github.com/Harold-C/argus/actions/runs/37249837499)及
[固定导出](https://github.com/Harold-C/argus/actions/runs/37251665632)通过：源码／
PostgreSQL 层 899 通过、158 条 Chrome 条件入口由镜像补验；镜像层 1,071 通过、
13 条 PostgreSQL 入口已由源码层执行，各层零失败。合成配对恢复、运行和故障恢复通过。

Argus 实际生产固定 registry 为
`ghcr.io/harold-c/argus@sha256:2a77b9747a64dffc0997d7083ac39dca2c2b2cbe2bc258704859ec0945ffdd78`，
运行镜像为 `sha256:a0d6d061de9c0025482e6c0a713a4df15863d93cc0af8f1f714904c85253b738`。
源码、归档、12 层 RootFS、完整执行配置及未设置的默认字段均匹配。
相对切换前生产 `ef21050` 仅 Bookabach 快照、对应测试及状态文档变化，私有 `bec807f`
仍在候选中，私有实现／合同没有差异，未修改配置或移用 Profile。

Tymra 最终正确镜像已从 `/srv/apps/tymra/releases/bookabach-20261005-v3` 发布，
镜像 `sha256:09922cfdb6746b1a69b45982343f1ece7a4eb8c1c81127e6255fa4f2d017d4ca`。
本地 OCI 标识不同，20 层内容及执行 Config 已匹配；归档 SHA-256
`cee0c6e5ad9a337e30e0607bde314adef7ceca27ac380856113a8ddff00e6bfc`。
本轮初始打包的解包权限导致运行用户不可读，v1/v2 均未切换；修正为保留 Git 归档
权限后，node 用户 Prisma／编译 CLI 启动检查通过。既有 schema 已含 nullable
`deliveryVerifiedAt`，本轮没有新 migration，不清空三条已验证交付。
新鲜备份 `/srv/apps/tymra/backups/bookabach-20261005-predeploy` 用最终镜像恢复通过：
80 张业务表全部行摘要、419 份证据内容／权限／属主匹配，六来源只读健康 CLI 通过，
演练数据库、卷及临时配置已移除。恢复前后没有修改生产业务数据。

Argus 第一份新鲜加密配对备份已用最终镜像隔离恢复：722 个 Job、2 个账号、
43,762 项私有条目摘要／权限／属主匹配，4 次所有权拒绝、3 份交付哈希和两个离线
Profile 打开通过；加密备份已封存、明文传输目录已移除，离线检查不证明实站登录。
准备切换时 Synix 有新任务，守卫在关闭服务前拒绝操作；随后等调用方及共享
任务／接管／挑战自然空闲，没有取消、暂停或重启私有任务。重新制作最新配对
快照并用同一最终镜像恢复：737 个 Job、2 个账号、44,355 项私有条目完整摘要、
权限及属主一致，所有权拒绝、交付哈希及两个离线 Profile 检查通过。实际切换使用
这份最新依据，不使用原 722 Job 快照越过数据变化守卫。第二份加密备份
`argus-prod-20261005-bookabach-predeploy-2.sparseimage` 已封存卸载，SHA-256
`3d104b6f363268b7b74ad615707effe2def446306d79ebca0fd781307c0c94b0`；所属明文
传输目录及演练资源已移除，原生产配置、卷、Profile 和 Synix 应用保留。

按 Argus→Tymra 完成切换。Argus 实际运行 `6df8601`、healthy、重启 0，
PostgreSQL／tunnel 容器及环境／挂载保留；HTTPS registry、原私有账号属主读取和
公开客户端跨账号拒绝核验通过。Tymra 四个应用均为 `a032fb5` 和上述同一镜像，
运行且重启 0；`2026-10-05T02:19:40Z`（15:19 NZ）切换后读回中，80 张业务表
摘要及 419 份证据与备份一致，已有三条交付确认保留，管理 HTTPS 页面／noindex、
Worker readiness、所属 Argus Job 读取和权限拒绝核验通过。PostgreSQL、Redis、
共享入口及 Spicy Maggie 网站容器未替换。两端兼容旧镜像、受保护回退配置和
备份保留；回退只切应用镜像，不覆盖之后的业务写入。

随后按用户立即复测授权，只创建并提前执行一个有界 Bookabach Job
`cmuumhw9l0000o243lf9mpuh9`，沿用 Canterbury／`bookabach:20312372` 样本。
版本化详情缓存复用，仅执行列表与精确报价两个 Argus Job；最大尝试一次，实际
尝试一次，于 `2026-10-05T02:22:29.419Z`（15:22 NZ）以 `SUCCEEDED` 结束。
两个 Run 均成功，保存一条非演示完整 RateObservation：2026-10-12–13、2 成人、
1 个住宿单位、匿名、NZD 10800 minor（NZ$108）、AVAILABLE／COMPLETE。
四份 HTML／截图逐份本地持久化及哈希复核通过，无 parserFailure；两个执行均保存
交付确认，所属 Job 读取 200、ACK 后结果 410/PURGED 已独立核对。

原失败 Job `cmuugoskc0000o5bvbnod1uj4` 完整记录不变。当日 Bookabach 共用 5/6
次执行，余下一次不足以再运行最少两次执行的完整 Job，本日不再安排第二个完整
复测或预先占用唯一活跃 OTA 名额。Bookabach 来源仅启用于 PILOT 手动试采，
当前 operationalStatus 仍为 DEGRADED；其他五来源关闭，六 OTA 自动计划均关闭，
无活跃 OTA Job，71 条公开计划及其他来源／计划摘要保持不变。一次完整成功不等于
自动启用：后续须在新西兰下一预算日完成第二个精确完整成功 Job，并同时通过
证据／ACK 和 D-039 门槛。收据分别保存在 Argus 标签发布目录及
`runtime/release-candidates/bookabach-20261005-v3`。

## 2026-10-05 用户要求立即执行一次 Bookabach 生产抓取

用户明确要求现在直接抓取一次，因此将此前唯一待执行 Job
`cmuugoskc0000o5bvbnod1uj4` 从 17:00 NZ 提前到 `2026-10-05T00:00:00.892Z`
（13:00 NZ），没有另建任务、扩大次数或更改自动计划的办公时段规则。
先等当时 Synix 的运行任务自然结束，确认共享 Argus 无活动任务／接管／挑战，
保存该 Job 与来源／计划快照后，只修改它的执行时间；原 Worker 完成正式执行。

单次采集实际使用三个 Argus 执行：Canterbury 列表、必要详情、精确日期报价；
对应页面均 HTTP 200，抓到并保存一个非演示来源房源
`bookabach:20312372`（Great Price Luxury - Master Ensuite | Garden View，Rolleston）。
公开大概位置及容量 3 已保存，精确地址／坐标仍未知，不用于精确跨平台归并。

报价样本为 2026-10-12–13、一晚、2 位住客、1 个住宿单位、NZD、未登录。
生产保存的截图及 DOM 明确显示 `Your dates are available`、当前价 NZ$108、
`for 1 home` 和 `includes taxes & fees`。但 Argus 结构化快照中的
`totalPriceText`／`feeInclusionText` 均为空，输出 `availabilityStatus=UNKNOWN`，
未保存 RateObservation。Tymra 将 UNKNOWN 也归入 `NO_AVAILABLE_PUBLIC_RATE`，
错误描述为不可售；该描述不符合页面证据。已更正对外说明，保留原始失败记录；
这是可见价格提取及未知状态分类的问题，不能将此次记为完整报价验收通过。

Job 于 `2026-10-05T00:02:00.009Z`（13:02 NZ）以 `DEAD_LETTER` 结束，实际尝试
一次、最大尝试一次。失败处理只暂停 Bookabach；六个 OTA 来源及定期计划再次
全部关闭，没有 17:00 的额外试采或活跃 OTA Job。其他五来源、五个 OTA 计划及
所有非 OTA 来源／计划完整摘要不变，Bookabach 已关闭计划只更新了处理时间戳；
71 条公开计划保留。没有修改、重启或取消 Synix／共享 Argus 的工作。

六份 HTML／截图已复制到生产持久证据目录，逐份内容哈希复核通过，无 parserFailure
标记；三个 Argus 执行均保存交付确认，所属 Job 读取 HTTP 200、ACK 后结果读取
HTTP 410/PURGED 已独立复核。这些交付成功不代替完整报价成功。预算实际消耗
Bookabach 当日三次执行，没有重试。受保护前快照、操作／终态／交付收据与实际
报价页证据留在既有发布目录及 `runtime/release-candidates/ota-20261004-preproduction`。
当时的下一步是用本次保存页面修复价格提取与 UNKNOWN 分类；修复和候选门禁已由
本页最新章节更新；修复已发布并完成一次完整生产复测，OTA 自动计划仍未开启。

## 2026-10-05 OTA 生产启用尝试与首轮排队（执行结果以上节为准）

用户授权尝试在生产启用六个 OTA。先核对四服务仍运行固定提交 `56d148b`、
同一发布镜像、零重启，生产 live 模式和预算正确；没有活跃 OTA Job，当日六来源
各零次 Argus 执行。实际逐项调用 `ota:production:enable`，六项均被来源启用门槛
拒绝，没有打开定期计划。独立健康报告显示六来源均缺新的正向房源／完整报价；
Booking／Expedia 的历史失败仍在滚动窗口内，记录及门槛保留。

随后只将 Bookabach 恢复为 PILOT 试采状态，创建正式生产 Job
`cmuugoskc0000o5bvbnod1uj4`。数据库读回为 `PENDING`、尝试数 0、最大尝试数 1，
`runAt=2026-10-05T04:00:00Z`，即当天新西兰时间 17:00；遵循工作日办公时段顺延，
排队读回时尚未发起站点采集。这是单次试采排队，不是来源自动计划启用或采集成功。
合同限定一地区列表、一房源、最多一必要详情和一精确未来报价，每 Job 最多三个
Argus 执行、每来源新西兰日最多六次、共享并发一；其他来源不并行排队。

写后核对：仅 Bookabach 来源启用用于该试采，其余五来源不变；六个 OTA 定期
计划全部关闭，唯一活跃 OTA Job 为上述待执行任务。71 条既有公开计划以及所有
非 OTA 来源／计划完整摘要保持一致。没有切换共享 Argus 或修改 Synix；Argus
读回无活动任务、接管或挑战，总 Job 数仍为 708。启用前快照、六次拒绝和试采
收据保留在生产发布目录及已有 `runtime/release-candidates/ota-20261004-preproduction`。

待首轮实际完成后核对业务入库、完整未来报价、证据哈希、交付确认和 ACK，再在
预算内串行安排第二轮及其余来源。每来源两次精确成功和 D-039 滚动门槛全部
满足后才启用该来源计划；本次未绕过门槛，不能宣称六来源生产验收完成。

## 2026-10-05 OTA 固定代码已发布到生产

Harold 恢复 SSH 后明确授权生产发布，并要求不影响 Synix。先核实发现 Argus 已在
当日早上发布私有修复 `bec807f`，因此未部署旧 OTA 候选 `370e671`；从已含该修复的
main `ef21050e8336c81a5def929fd9ec3a7fc891cea9` 重新冻结
`argus-release-20261005-2`。私有后台实现／契约与当前生产基线无差异。
Argus 完整发布和导出通过：源码层 899 项通过、157 项 Chrome 条件入口由镜像层
补验；最终镜像 1,070 项通过、13 项 PostgreSQL 入口已在源码层执行，各层零失败。
合成配对恢复、运行及故障恢复通过；完整事实在 Argus current-state。

生产切换顺序为 Argus → Tymra。Argus 使用新鲜加密配对快照完成隔离恢复：
708 个 Job、2 个账号、42,889 项私有文件／目录／链接摘要、权限及属主匹配，
所有权拒绝、交付哈希和离线 Profile 打开检查通过。仅在 Synix 调用队列与共享
Argus 活动任务、接管、挑战均为零时备份／切换；未中断进行中的 Job。
原生产数据库、卷、Profile、客户端配置和 tunnel 保留，Synix 应用未修改。
离线 Profile 与后台账号 API 读取不证明实站登录。

Tymra 固定功能提交仍为 `56d148b179336c06dd5ad8bc40b1a1a45e33bc4c`，沿用下节
已验证的同一镜像和源码归档。生产主机实际加载镜像为
`sha256:1f2205f85ade5d473c61f9753a8724fbd17a503941a44cfa40aab44aa46dfd72`；
该 Config 标识与本地 OCI 标识不同，RootFS 和执行 Config 已逐项核对等价。
发布目录为 `/srv/apps/tymra/releases/ota-public-20261005-v1`。
新鲜生产备份 `/srv/apps/tymra/backups/ota-public-20261005-predeploy` 已在独立数据库／
卷恢复，并用最终镜像演练 nullable `deliveryVerifiedAt` migration；80 张业务表完整
行摘要、413 份证据内容／权限／属主均匹配，演练资源已移除。
正式升级仅执行 `20261003003000_argus_delivery_verification`，旧执行值保持 null，
同样核对全部业务摘要及证据；没有用开发库、seed 或旧备份覆盖生产。

`2026-10-04T22:22:35Z`（新西兰 2026-10-05 11:22）生产读回：Web／Worker／API／
Scheduler 全部为同一最终镜像、运行且重启 0，Web／API healthy；管理 HTTPS 页面
200 且保留 noindex，Worker readiness 200，Tymra 原 scoped 客户端读取所属 Job 200。
未授予的 runtime scope 和未认证访问继续拒绝，没有扩大客户端权限。
PostgreSQL、Redis、共享 ingress 和 Spicy Maggie 网站容器均未替换；生产环境、
证据挂载、限速及预算保持原值。旧固定镜像 `74b13711…` 和受保护配置／备份保留；
兼容回退只切应用镜像，新增 nullable 列可保留，不覆盖后续业务写入。

发布读回时，实际公开计划为 71 条启用，本次发布未更改任何来源或计划。六个 OTA
来源及定期计划当时仍关闭，生产健康报告尚无正向房源／完整报价证据；Booking／Expedia
旧失败也仍在滚动窗口内。代码部署不等于六来源生产采集验收。下一步按非办公
时段串行试采，每来源每日最多六次执行，每 Job 一列表、最多一必要详情和一报价；
新的两次精确成功、持久化证据／ACK 及 D-039 滚动门槛全部满足后才能逐项启用。
不清空失败历史或以本地成功代替生产门槛。收据保留在已有
`runtime/release-candidates/ota-20261004-preproduction`。

## 2026-10-04–05 OTA 发布前准备（历史快照，后续生产事实以上节为准）

用户授权完成所有生产发布前工作，并要求不影响 Synix。正式代码候选已提交并 push：
Tymra `56d148b179336c06dd5ad8bc40b1a1a45e33bc4c`，Argus
`370e6717cde9790c7585430bc65772f187812f65`。Argus 已合入生产
`5c869ae` 的登录排队、Airbnb 房源批次、状态解析及 Booking SMS 修复；相对主线
`9a8a031`，私有后台实现与契约没有差异。公共 CAPTCHA 成功恢复的共享 Job 分支
明确排除 `account_id`，其它账号／主机冷却和预算保留，70 项兼容检查通过。

[Tymra 完整 CI](https://github.com/Harold-C/tymra/actions/runs/37196529329)通过：
Web／域模型等 238 项通过、5 项条件入口跳过，Worker 332 项全部通过，数据库集成
123 项通过、6 项 OTA 专用隔离库入口跳过；117 页 Web 和 Worker 编译通过。
该六项入口已在专用 `_offline_test` 数据库另行执行，全部通过，验证每个来源的
两轮持久化、详情复用和 ACK，属于合成合同测试，不是实站证据。

Tymra 固定 linux/amd64 候选镜像为
`sha256:1d8330695ba2e20fc9e7744f06a77f5a7dd3909121a7d8a457730d636f5fbda9`，
OCI revision 与代码候选一致，源码 tar SHA-256 为
`d86bdeb199628855b5cf7bd0523394bab5479ed11e96353cc27fd335351ba3cf`。
同一镜像的 332 项 Worker 测试通过；测试工具只在一次性容器中使用 root 写临时
配置，正式 Web／migration 保持 node 用户。Web 的正确管理 Host 启动检查返回 200，
编译 CLI 在 production 配置模式下完成六来源只读健康查询，未执行来源抓取。
最终镜像导出 SHA-256 为
`319c983f327ce21803c5755228b266634baa3ad1da0f06645470c2f745ea6b75`，已回读匹配。

独立复制本地已验证数据库，模拟旧 schema 后，使用该固定镜像执行
`20261003003000_argus_delivery_verification`。新增列 nullable，旧执行值为 null；
80 张业务表的记录数及完整行摘要保持一致，完成批次和历史未修改。
此演练没有使用生产数据库，不能写成生产备份或生产 migration 已通过。

Argus [完整固定镜像门禁](https://github.com/Harold-C/argus/actions/runs/37196577737)
通过；源码 PostgreSQL／覆盖率层通过 895 项，157 项 Chrome 条件入口由固定
镜像层补验，零失败；行／分支／函数覆盖率 75.92%／81.98%／85.32%。
固定镜像浏览器层 1,061 项通过、18 项条件跳过：13 项数据库入口已在源码
PostgreSQL 层执行，另 5 项公共采集入口因发布环境未设置 capture 测试标记而跳过。
这 5 项已在同一最终镜像、断网容器和独立 `/data` tmpfs 中补验，全通过、零跳过，
进程正常退出。发布 workflow 同时补齐该标记与隔离目录，避免以后再次静默跳过；
这项门禁修正不改变候选应用代码或已构建镜像。
合成 PostgreSQL／profile／证据配对恢复及运行时故障恢复门禁也通过。

Argus [同一镜像导出](https://github.com/Harold-C/argus/actions/runs/37198277222)
通过，固定 registry 引用为
`ghcr.io/harold-c/argus@sha256:90f332b857178c1694b1d8b63d183b3f9920ef773bfde5f0fc79eeb4de0602a3`。
源码标识、压缩包校验、12 层 RootFS 及全部执行配置已回读匹配；仅装入本地，
没有在生产载入或切换。候选保留在已有 Argus
`runtime/production-releases/argus-release-20261004-3`；镜像发布或导出不代表生产部署。

现有 Argus 加密真实备份以只读方式挂载后，在本地独立数据库／卷完成恢复。
623 个历史 Job、2 个账号、41,396 项私有文件的行／内容／权限／所有者摘要匹配；
4 项跨账号访问拒绝、3 个原始交付哈希与 2 个离线 profile 打开检查通过。
只删除本次演练资源，原备份、实际 profile 和生产服务保留。此备份早于当前生产
任务，不是新的切换快照；离线打开 profile 也不是当前实站登录验证。

Tymra 生产主机现有 SSH 通路连接超时，另一条现有网络路径也未能连接，Harold
正在恢复通路。生产版本、配置、migration 状态、最新备份和隔离恢复、回退镜像
可用性均待当前核验。Argus 生产浏览器、PostgreSQL 和 tunnel 的容器 ID、镜像、
挂载与启动时间均保持原值，浏览器健康且零重启；只读运行核对仍有一个 RUNNING Job。
没有暂停、排空或关闭共享入口，新的切换配对快照须在不影响 Synix 的发布窗口完成。
这些生产门禁未完成前不称为已可发布。后续实际发布仍按 Argus→Tymra，保留既有公开来源
计划，逐 OTA 两次有界生产试采及 D-039 门槛通过后才分别启用。
该准备阶段未切换生产、未执行生产 migration、未启用 OTA Scheduler，Synix 未修改。

下列 2026-10-04／03 章节保留原时点本地结果，不覆盖本节的提交和发布准备状态。

## 2026-10-04 Expedia 同一 profile 完整本地验证

用户要求接入本地 noVNC 并自行完成 Expedia 验证。独立开发容器、数据库和
固定 `expedia-public/public` profile 沿用上一轮；共享 Argus、Synix 和生产未操作。
本次自动首页搜索 Job `cmusr69gt0000c62tt8jecxa1`／
`job_1a65d046d1fa133677678fa2fdd2e1e3` 在 visible public search navigation
阶段 TIMEOUT，已保存真实失败结果并完成 ACK／410，零新房源／报价及 HTML／截图交付。
没有将该超时称为 CAPTCHA 或人工验证失败。

随后在空闲的独立容器中，以同一默认 public profile 建立只供用户操作的有头观察
浏览器，直接访问此前实际使用的 Canterbury 参数搜索地址，住宿日期为
2026-10-08–09、2 成人／1 房。内置浏览器 noVNC 已实际连接，截图确认正常 Expedia
列表、300+ properties 和酒店卡片，当前没有人机验证提示。这是页面访问观察，
该观察本身没有生成业务验收记录或完整报价。用户随后要求沿用这个 profile 继续验证；
独立观察浏览器先正常关闭并保存原 profile，再串行运行正式 API Job，没有复制或
更换 profile。其生命周期与 Argus API Job／handoff 分开，不把 API 空闲当作 profile 可并发使用。
noVNC 临时连接仅交付用户，不写入本文件或版本库。

同一 profile 的首页控件重试 `cmusryt5m0000c6odvro3p81k` 仍在日期控件阶段 TIMEOUT，
失败结果保存并完成 ACK／410。直接参数搜索已实测可用，Argus 现改为已有的有界
`Hotel-Search` 参数入口，保留固定有头 profile、来源间隔、挑战冷却及上下文核验。
修复前的参数正式任务 `cmusso6b90000c6bqwr814pl2` 完成列表／详情、四份证据及
两次 ACK／410，但因详情没有日期且解析器遗漏酒店标题区域 microdata，终态为
`UNIT_IDENTITY_NOT_PUBLIC`，零新房源／报价；原失败记录保留。

Expedia `resolve_listing` 现在可接收可选 `identity_stay`，以本次目录日期显示真实
房型，仅返回身份、不生成报价观察。解析只读取与当前 h1 绑定的
`content-hotel-title` 地址／国家／坐标字段或当前酒店 JSON-LD；`NZL` 规范为 `NZ`，
不读取旁边酒店或地图中心，不以查询人数推断物理容量，空坐标保持 null。
Tymra 仅在缺少身份时发送详情查询，缓存版本为 `expedia-headline-1`；未变化详情继续复用。

独立本地编译候选 `argus:ota-dev-20261004-identity` 已构建并切入，仅保留本轮拥有的
profile／证据和本地端口，源码没有 watch 挂载。镜像检查 1042 项：873 通过、169
环境条件跳过、零失败；Argus 定向 62 项、Tymra 类型检查及 141 项、隔离浏览器
5 项均通过。保存的真实日期详情页无外部请求重放确认了地址／坐标和四个房型。

两次完整本地业务 Job `cmustj3qq0000c6um0np79tnj`、`cmustn8i30000c62y9mjez74y`
均 SUCCEEDED，目录与报价两个 CollectionRun 都成功：

- 当前房源 `expedia:2193285`，Braemar Lodge And Spa，283 Medway Road／Hanmer Springs／NZ，
  坐标 `(-42.573688, 172.819576)`；未公开的 region 保持 null。
- Superior Suite，公开 `Sleeps 3`；2026-10-11–12、2 成人／1 房、NZD 252
  AVAILABLE／COMPLETE，`isDemo=false`，两条真实报价分别追加保存。
- 首轮列表／详情／报价三次执行、六份证据，次轮复用详情仅列表／报价两次执行、
  四份证据；十份 SHA-256 和五次 `deliveryVerifiedAt`／ACK 后 410 均已核对，零解析失败。

两轮均没有再次出现 CAPTCHA，不据此声称新的 API 人工挑战恢复链已实站验收。
六个来源现已各有两次完整本地成功，其他五来源的日期和样本以下方 2026-10-03
记录为准。六来源及所有本地自动计划最终暂停，无活跃执行／handoff；生产及
Synix 未操作。本地成功不等于生产启用或最终发布镜像／生产独立验收。
最终独立回读核对全部十二个完整成功 Job、三十次已保存交付确认和六十份匹配
证据哈希；报价均为未来日期、真实 NZD／AVAILABLE／COMPLETE，无解析失败。

## 2026-10-03 发布前本地复核

本节是 2026-10-03 的快照；Expedia 当前结果以上方 2026-10-04 记录为准。真实验证使用独立本地数据库
`tymra_ota_identity_local_20261001`、有头固定 public profile、关闭的 Scheduler 和
高频 Scheduler；测试调用生产有界合同，环境和结果仍是本地。Argus 隔离分支已
合入主线最新预订运行时提交 `cffa127`，保留 Synix 已有后台能力；没有切换生产
服务、共享开发 Argus 或 Synix。

2026-10-03 用户继续授权本地修复与实抓，明确撤销本地每日预算及构建次数限制。
后续用 development 模式调用同一有界业务处理器，Argus 明确 opt-in technical validation；
生产预算及启用门槛不变。固定本地编译候选已构建并切换，仅保留本轮拥有的数据库、
profile 和证据挂载，源码不再由 watch 自动重启。此前“预算耗尽”仅是原时点记录。

| 来源 | 本次真实结果 | 尚缺验收 |
| --- | --- | --- |
| Booking | 两个精确 Job 成功，Opononi Hotel、物理容量 2、2026-10-10–11、2 成人／1 房、NZD 205 COMPLETE；各六份证据哈希与三次 ACK 后 410 | 最终固定镜像和生产独立再验收；本地成功不直接启用生产计划 |
| Bookabach | 两次精确完整 Job 成功；Rolleston 房源 `20312372`、容量 3、未来住宿 NZD 117／113 COMPLETE；新任务三个执行、六份证据、三次 ACK 后 410 | 最终发布镜像与生产独立门槛 |
| Airbnb | 两次精确完整 Job 成功；`1271449864798766615`、Kaikōura Ranges 大概位置、容量 2、未来住宿 NZD 228.85 COMPLETE；首轮三个执行／六份证据，次轮复用详情、两个执行／四份证据；所有 ACK 后 410 | 最终发布镜像与生产独立门槛；大概位置不作精确物理归并 |
| Agoda | 两次 Christchurch 精确完整 Job 成功；非推广 Airport Delta Motel `625373`、地址／坐标、容量 2、2026-10-10–11、2 成人／1 房、NZD 197 COMPLETE；每轮复用已更新详情、两个执行／四份证据、两次 ACK 后 410 | 最终发布镜像与生产独立门槛；旧 Whangarei 结果与失败任务保留 |
| Expedia | 新默认 API profile 任务正确识别 CAPTCHA、保留同会话并实际签发短期 handoff；内置页面工具始终返回 queued，界面工具拒绝控制 Codex 窗口，人工未完成，原会话于 2026-10-03 13:15 NZ 到期；真实终态 MANUAL_SESSION_EXPIRED 保存，ACK 后 410；零新房源／报价及 HTML／截图交付 | 仍需可见 noVNC 中的实际人工验证和完整业务链；旧 RATE_LIMITED 任务及两份原证据保留，不将签发连接当作已显示或已通过 |
| Trip.com | 修复后两次完整 Job 成功；Distinction Whangarei Hotel `2605260`、Whangarei／Northland、容量 2、NZD 225 COMPLETE；首轮三个执行／六份证据，次轮复用详情、两个执行／四份证据；所有 ACK 后 410 | 最终发布镜像与生产独立门槛；旧登录页及错误地区记录保留 |

实际正向 Job：Booking `cmuqyjtk20000c69rge4btmwp`、
`cmuqyunfr0000c6azrep1kuq4`；Bookabach `cmuqxi7iy0000c60y30yeb9v7`、
`cmurl5elb0000c6mk7xh7c8qh`；Airbnb `cmurleqsm0000c6pkcbkx35vv`、
`cmurlhirm0000c6ygh8a6hsfk`；Agoda `cmurlkowh0000c65pkck45adu`、
`cmurlmta70000c6t8r9bxgp5n`；Trip `cmurmf87c0000c6mhm1xx67oe`、
`cmurmhnbr0000c6rjofs45sme`。Airbnb 更早的单次报价诊断
`cmuqyex010000c6s1zhmzsv98` 不计作完整试采。
Expedia 未通过任务为 `cmurmkpti0000c6w576zsd2vh`／
`job_e8494d78d7e9dcdb9f98f439e34298b1`；它没有正向业务观察。已保存实际失败结果，
原本地执行期限未修改，最终来源和所有本地自动计划暂停，无活跃执行／handoff。
原失败批次、原 Argus 结果与源观察时间保留；保存页面重放不写成新的业务观察。

本次修复：

- Bookabach 当前报价区域包含原价标签时，仍读取唯一当前价及同区域含税费说明；
  原价、会员价、其他报价区域不作当前价格。
- Airbnb 只读打开当前报价的 Price details；卡片整数价 229 与弹窗精确 228.85
  仅按该整数展示的四舍五入规则绑定，保留精确总价。原生住宿小计 199.00 与税
  29.85 和总价对齐，且无未解释额外金额或另付说明，才证明当前弹窗价格含费用。
  清洁费／服务费未分别显示，保持 null／BUNDLED，不补零。
  [Airbnb 价格说明](https://www.airbnb.com/help/article/125) 明确公开展示价包括费用，
  税可能另加；所以普通卡片总价或官方政策本身仍不足本项目的完整含税费门槛。
- Agoda 支持实际公开 `/hotel/all/<city>-nz.html` 路由并规范化身份；当前房源的 NZ
  城市面包屑优先于误写街区的 JSON-LD locality，Christchurch／Canterbury 已读回。
  全住宿总价选项可能触发页面重载；新页面重新核实已选状态，不重复点击或沿用旧
  确认。房型就绪排除推荐区／隐藏加载，明确就绪超时分类为 TIMEOUT。
  当前报价原生 `after taxes + fees` 文字证明含税费，未知组件仍 null／BUNDLED；
  nightly、税费前价格、另付费用和歧义价格不提升为完整总价。真实 NZD 197 已入库。
  该解析修正只更新 Agoda 详情缓存版本，不使其他来源无变化详情失效。
- Booking 对街道形式的 addressLocality 改用公开城市 breadcrumb，并排除房间数量
  option 金额。新任务城市已读回 Opononi，205 的金额依据不再指向五房 1025。
  详情指纹加入解析版本；旧解析器缓存不再因列表没变而长期复用错误详情。
- Trip 精确登录标题、可见邮箱输入框和 Continue with email 识别在搜索和就绪之前
  返回，供统一挑战分类；不读取表单值或登录，普通 Sign in 按钮不构成登录墙。
  后续真实验证确认公开首页可搜索，入口改为首页；目的地框缩短为城市名时，读取
  同一当前城市的可见国家／地区导航路径，排除页脚、隐藏、外国和其他城市路径。
  两次完整抓取已保存含税费报价，但详情 JSON-LD 将街道放进 locality、城市放进
  region。新增绑定当前酒店名称的可见 NZ 城市／省份导航路径，真实保存页面重放
  得到 Whangarei／Northland；该修正只更新 Trip 详情缓存版本。随后两次新真实完整
  任务已正确入库，第二次确认详情复用。
- 有界生产 CAPTCHA 只在当前来源、有效短期 session 和原执行期限内等待；过期、
  来源不符、其他挑战或超长 TTL 取消自身任务，不延长期限，不影响私有后台任务。
- Expedia 滑块实际在 `geo.captcha-delivery.com/captcha/` 跨域 iframe 内，页面 HTML
  不含其滑块文字。现在仅在允许的 Expedia 主机、明确父页面人机验证文字与该 HTTPS
  验证 frame 同时成立时识别 CAPTCHA；普通 429、其他 frame 和其他来源不放宽。
  保存截图推翻了先前“普通 429”的判断，原 Job 与冷却记录保留。
- 公共 OTA 人工 CAPTCHA 恢复原先未清除挑战冷却，后续详情会继续等待旧冷却。
  现在只在同一请求的 trace／connector／workflow／provider 和 OTA schema 匹配、
  成功结果通过原等待状态的条件写入后，恢复该公共主机正常访问间隔；不清空日使用量，
  不更改其他主机或私有账号保护。未完成、解析失败、错 trace、取消／授权失败不会
  走该恢复分支。50 项状态／来源访问定向检查通过；真实人工成功恢复尚待验证。
- 生产处理器原先在 ACK 后写 `CollectionRun.scope.deliveryVerified`，被完成历史的
  数据库保护拒绝。新增 nullable `ArgusExecution.deliveryVerifiedAt`，只在本地证据
  校验、ACK 成功与读回 410 后写入；完成批次保持不可修改。启用门槛核对每个执行
  的确认时间、结果 SHA-256 和两个批次归属。新 migration
  `20261003003000_argus_delivery_verification` 仅在本地验收与独立测试库应用。
  Bookabach 已有成功结果通过实际处理器再次确认交付；Airbnb／Trip 已保留结果也
  再次完成 ACK／410 并保存确认时间，零新增源执行，完成历史与原观察保持。

本轮早期基线验证：Worker 42 文件／330 项通过；根单测 238 通过、5 项未启用的 `LIVE_SOURCE_PROBE`
公开实站探针跳过，
未把跳过算作通过；全项目类型检查、lint 通过。独立全新 `_offline_test` 数据库部署
35 个 migration，六来源各两轮通过实际生产处理器与模拟 Argus API 完成交付、重复
执行、详情缓存、哈希和 ACK；防修改触发器负向检查仍拒绝改写完成批次。合成测试
不计真实来源或生产启用证据。Argus 合入主线后的类型检查、OpenAPI YAML 通过；
完整源覆盖率 876 通过、150 浏览器环境门槛跳过，行／分支／函数覆盖率
75.70%／81.80%／85.11%。编译产物的隔离 Linux 回归 1053 项中 1036 项首次通过，
5 项因测试快照缺少 Compose／脚本文件受阻；补齐原文件后相关 6 项全部通过，
合计 1041 项通过、12 项 PostgreSQL 条件已在完整源码门禁执行通过，零剩余失败。
Expedia 内联／跨域滑块同会话恢复、Booking 后台房型及 SMS 检查通过；复用既有
镜像依赖，不代表最终不可变发布镜像验收。先前直接 tsx 的回归遇到浏览器序列化
辅助函数错误，已停止该不适用方法，保持后台断言和现行私有代码。已清理本轮拥有
的两个合成测试库；真实验收库、profile、证据及失败历史保留。
上述全量覆盖率和编译回归数字对应早期基线；后续变更以本节的定向检查、最终开发
镜像检查和真实入库复核为准，不将旧全量结果描述为重新运行的最终源码全量测试。

早期同日快照为 Booking 6、Agoda 6、Bookabach 5、Airbnb 5、Expedia 1、Trip 1 个
API 执行；Airbnb 早期 watch 重启另计一次直接访问。这是撤销本地日上限前的历史
计数，不是当前阻塞。后续真实任务及直接诊断继续留存，不清空历史或改写失败结果。
本轮最终编译开发镜像内检查 871 项通过、166 项环境条件跳过；Agoda 最新定向 42 项
全部通过，Worker 当前相关 61 项及类型检查通过。条件跳过不计实际来源成功。
Trip 首页／目的地／地区 18 项以及后续详情位置／房型等 17 项定向检查全部通过，
真实保存页面离线重放确认当前酒店城市和省份，不把重放算作新来源观察。
源码不再由 watch 重启；切换仅在本轮浏览器／任务均释放时进行，未影响 Synix。
五个渠道各两次完整本地成功，Expedia 仍未通过；六个渠道尚未全部达到实抓和
D-039 门槛。最终开发候选已安全切入本轮独立容器，生产发布镜像未构建，本地候选
可按验证需要重建。未 push、部署或开启生产 OTA 自动采集。
最终回读五个来源共 10 次完整成功任务，25 个执行均有交付确认时间，50 份本地
HTML／截图重新计算 SHA-256 匹配，均无 parser failure；未来完整报价非 demo。
Expedia 完整报价仍为零。六来源启用数、自动计划、活跃执行与 handoff 均为零。

## 先前本地记录

以下均为原日期的证据，当前结果与下一步以上节及实施计划为准。

## 2026-10-01 本地可完成工作补验（18:58 NZ）

在前一轮候选上继续完成不新增来源访问的工作，原始实抓结果与本地请求预算未改写。

- 新增 `apps/worker/test/ota-offline-pipeline.integration.test.ts`。只在独立、空白、
  名称以 `_offline_test` 结尾的开发测试库执行；本次部署现有 34 个 migration 后，
  六来源分别验证两轮目录＋报价，经本机回环模拟 Argus Job API 交付，累计 30 个
  模拟执行、6 条 Listing、12 条报价。校验真实数据库保存、重复执行不再提交、详情
  指纹缓存复用、报价历史追加、物理容量、含税费总价的未知组件保留、证据哈希与
  ACK 后 410。Airbnb 已确认精确映射不被后续大概位置覆盖。六项全部通过。
- 此测试使用明确的合成合同与证据，不运行浏览器／访问 OTA，不属于真实采集、
  两次正向生产任务或生产授权。测试队列为 `offline-fixture-validation`，payload
  标记 fixture；本地真实验收库与默认 API profile 未替换。结束回读启用来源／计划
  均为零，仅删除本轮拥有的临时数据库及合成证据文件，不删除任何真实实抓证据。
- Agoda 全住宿展示新增异步菜单等待、控件失效的有界失败处理；选中全住宿后，
  若报价区仍出现每晚文字，不把歧义价格认作全住宿总价或重新认作每晚价。菜单
  延迟、同 URL 导航失效、选中但尚未完成重定价的浏览器回归通过。
- Airbnb 明细金额比较改为 NZD 分单位，200 与 200.00 可以正确匹配；金额不同或
  弹窗同时出现其他币种则不接受费用明细。浏览器正向／负向回归通过。
- 新增真实不可售与未知费用分别保留错误分类的回归。23 项相关 Worker 测试、
  6 项相关浏览器测试均通过且无跳过，两个项目类型检查通过，未构建。

本地可进行的接收、数据库保存、重复与异常场景已补验；实际的 Bookabach 修复后
入库、Airbnb 明细、Agoda 全住宿显示、Expedia 默认 public profile 人工恢复和完整
位置，以及 Trip 公开访问／正确目的地仍须来源预算与实际页面允许。六来源真实验收
状态见下节；继续保持停采，无新实站请求、push／发布或 Synix 操作。

## 2026-10-01 六 OTA 逐项修复与本地验收边界

本节取代下方历史记录中的“当前阻塞”描述。修改仅在 Tymra 本地源码与 Argus 隔离
`tymra-public-ota-20260930` 工作树；有头固定来源 profile、本地独立数据库／Redis 与
证据目录沿用。未修改共享 Argus 主 checkout、Synix 或生产服务；未构建、push、部署。

| 来源 | 本轮修复与核实 | 仍需真实验证 |
| --- | --- | --- |
| Booking | 既有本地完整业务链路成功仍有效，容量／名称修复保留 | 最终固定候选发布及生产再验收 |
| Airbnb | 来源专属稳定 ID＋公开大概位置＋物理容量允许继续，精确地址保持未知；新增只读价格明细弹窗提取，组件与总价需同一报价且金额一致 | 真实任务读到 NZD 276 总价，但捕获区域没有完整费用依据；弹窗操作仅浏览器回归通过，待预算恢复实测 |
| Bookabach | 同上来源身份；真实任务保存房源与容量。全页“not available”误判已限定当前预订区域，费用组件也不再取全页 | 保存的真实页面无网络重放得到 AVAILABLE、NZD 134 BUNDLED、明确含税费；Tymra 接收及 COMPLETE 价格规则通过，需新真实任务确认修复后入库 |
| Expedia | 绑定当前房源的 JSON-LD 地址／坐标，排除附近房源。明确滑块 CAPTCHA 的 429 可留同 Page／Context 供人工验证，清除后恢复一次首页 Search；普通 429 仍停采 | 既有人工验证 profile 与默认 API public profile 未合并；实际 API 同 profile 人工恢复、完整位置及 Job／报价入库待验证 |
| Agoda | 房源绑定的 Open Graph 坐标补齐，公开政策文字与成人数过滤修复；全住宿总价通过可见选项选择，必须确认选中且页面未切换 | 真实保存页面重放坐标 -43.48996353149414／172.54566955566406、三房型容量，8 条合格报价政策可读但仍无全住宿总价。全住宿选择仅回归通过，非推广候选及真实业务链待验证 |
| Trip.com | 删除 Christchurch Airport 硬编码回退；城市＋NZ 建议必须匹配，目的地不一致拒绝；物理容量取房型区域可访问标签，报价人数与历史评论不作物理依据 | 保存的 Lylo 页面重放 Queen Ensuite Room 容量 2。新的 Northland／Whangarei 实测入口返回邮箱登录页，未进入搜索；需公开入口恢复后验证正确地理及完整报价 |

Airbnb 新真实本地 Job `cmuotzeny0000c6wzr8np1ati`、Bookabach
`cmuoua10m0000c6zlftddxpc5` 各完成三个 Argus 执行：列表、详情、报价；各六份证据哈希
通过，三个 ACK 后读回 410。两个目录批次成功，分别保存
`airbnb:1575788832170495266`／容量 4 与 `bookabach:9853129`／容量 2；Property
为 `SOURCE_SCOPED`、地址空、精确坐标 null，不计作跨平台去重后的已确认物理覆盖。
Airbnb 最初保存时的 ACTIVE 分类已仅在本地纠正，追加第 2 个身份版本并标记
`LOCATION_CLASSIFICATION_CORRECTED`，不是新的来源观察。目录统计及代表性面板筛选
排除 SOURCE_SCOPED Property 的物理 Unit；来源 Listing 与自身报价仍可保存。
原报价批次保留 `NO_COMPLETE_PUBLIC_TOTAL` 失败历史；Bookabach 该旧结果是误判，
新重放结果明确推翻它，未改写原 Argus 结果或伪造新业务观测。两来源 RateObservation
本轮仍未新增。正确的真实不可售试采以后单独分类为 `NO_AVAILABLE_PUBLIC_RATE`，
正向启用门槛仍要求可售且完整含税费价格。

两个更早 Airbnb 本地连接失败 Job `cmuottxy80000c62i27stb3mb`／
`cmuotxgs80000c6l56zwi6qyp` 未产生 Argus 执行，不是来源拒绝。独立源码监控容器曾因
新增文件尚未保存完整而停止；确认无活跃任务后恢复同容器，只更新本地临时 API 端口。

Trip 新本地目录验证 Job `cmuoulyry0000c6ptt1wu6zrn` 仅新增一次执行，登录页的两份
证据已保留并 ACK；未开详情或报价。旧捕获误报 INTERNAL_ERROR，候选已针对 Trip
的明确邮箱登录页补充 LOGIN_REQUIRED 识别，普通页面的 Sign in 按钮不构成登录墙。
此前本地自定义验证合同 Job `cmuoul92s0000c6g5jlcfli74` 在调用端被拒绝，零来源执行，
已终止；未削弱生产任务合同。新的目录验证未通过，不计作正向生产验收。

Agoda／Trip 的地区 frontier 明确保存城市采样范围：Canterbury→Christchurch，
Northland→Whangarei，其他已配置地区采用显式城市锚点；无可核实锚点仍保留地区查询，
不自动替换同名地点。城市样本不代表完整地区／全国覆盖。公开 city 与 city-valued
addressRegion 一致时才归入该城市对应地区；错误城市／国家不据请求上下文补值。

本轮 Tymra Worker 类型检查、42 个测试文件／321 项测试通过。Argus 类型检查及来源
身份、物理容量、目的地、费用区域、总价展示和同会话人工恢复定向回归通过；原页面
重放不发网络请求、不新增业务观察。保存的真实样本与人工验证页面不替代两次成功
Job、D-039 滚动健康及最终固定镜像门槛。

本地当天 Airbnb／Bookabach 各六次（包含之前独立直接诊断），Agoda／Expedia／Booking
各已达六次；Trip 五次，剩余一次不足完整链且入口登录限制不重试。来源与计划保持
关闭，无活跃采集。继续时须等预算恢复，逐来源一次有界复核，不反复 build。

## 2026-10-01 Agoda 标签页与目的地修复（本地候选）

同一有头固定 profile 的诊断确认旧代码把 Canterbury, New Zealand 误选成英国
Canterbury；酒店结果在新标签页打开，原页导航至 Activities，抓取在原页等待超时。
房源链接 `canterbury-gb.html` 是直接国家证据，没有登录或挑战提示；旧快照固定
New Zealand 会造成错误国家标注。隔离 Argus 候选现要求匹配地名与 New Zealand
的可见建议，跟随实际结果标签页并保留同 context／允许域名校验，不重复请求；
非广告列表按 `*-nz.html` 核实国家，外国／未知／混合结果或目的地变化停止解析。

修复后的唯一真实复试在 Search 前停止：该页面无新西兰 Canterbury 地区选项，
可见新西兰建议包括 Christchurch、Hanmer Springs，Canterbury 同名城市在英国。
等待用户决定是否先用 Christchurch 验证城市范围，不能静默当作全 Canterbury。
没有新 Argus Job、Listing 或 RateObservation；两份证据与哈希保留在既有受保护
验收根 `data/reports/agoda-local-fixed-navigation-20261001`。noVNC 暂留至 12:50 NZ。
当天实际三次（一个既有执行、两次直接诊断），后续最多三次，不能只按表中一次计数。
类型检查、离线国家／标签页回归及容器提取／证据衔接通过；macOS 缺 `/data` 的
既有证据测试在隔离容器补验通过。六本地来源／计划保持关闭，无 build／push／发布，
生产和 Synix 未操作。列表、详情、报价及业务入库正向验收仍待完成。

用户随后批准 Christchurch 城市范围验证。一次 Tymra Job
`cmuoq365x0002c65z35pbr12y` 在建议阶段失败：保存 DOM 表明 New Zealand／City／Popular
被 `hasText` 拼接，国家边界匹配漏掉正确选项。两个证据哈希及 ACK 后 HTTP 410 通过；
候选改读完整建议标签／渲染文字，并有界等待异步建议，返回固定安全目的地类别。
同 profile 的继续诊断正常显示 596 个 Christchurch 房源，但新标签页地址读取出现
Invalid URL；补齐地址暂空等待与非法目标分类，离线回归通过。复用已加载结果页，不
刷新搜索，仅增加一个有日期详情导航，读取同页房型与报价，累计实际六次后停止访问。

真实详情技术样本为 Sudima Christchurch Airport（agoda:11971），公开地址为
550 Memorial Ave；三房型 Superior Twin／Deluxe King／Deluxe Twin 的容量为 3／2／3。
坐标未取得，五条公开每晚报价均 PARTIAL，住宿总价为空，不能当作完整可比较总价。
实际列表还显示 Sudima 为 Boosted：候选补齐推广排除，无网络重放确认修正后仅保留
BreakFree on Cashel（agoda:861964）和 Bealey Quarter（agoda:23911327）；Sudima
详情仅是技术样本，不作为正式目录候选。原始快照保留，修正结果独立保存并标注。

三类 Tymra 接收合同、八份直接诊断证据哈希及本轮 30 项定向检查通过，类型检查通过。
直接诊断未创建新的 Job／ACK；Agoda 业务 Listing／RateObservation 仍为零，无活跃
执行；测试城市 target 已停用，来源与计划仍关闭。证据位于既有受保护验收根
`data/reports/agoda-christchurch-continuation-20261001`。随后清理本地临时调试连接时
观察浏览器意外关闭；不是来源挑战，截图／DOM 和 profile 保留，详情截图的内置
面板打开请求已排队，并在聊天中提供截图，不再新增来源请求恢复会话。后续预算
恢复后须用非推广候选补齐位置、
总价及真实 Job／业务入库验收；
无 build／push／部署，未操作生产或 Synix。

## 2026-10-01 Expedia 首页操作路径候选

按用户要求修改隔离 Argus worktree 的 `expedia-public` discovery：打开 NZ 首页，
选择 Stays、精确目的地建议、日历日期、房间／人数，点击 Search；网站自行提供
region ID 和搜索 URL。当前控件实现覆盖零儿童、1–8 房且每房至少一成人；不支持的
人数、币种／地区变化或控件失败停止，已知详情路径不变。类型检查、7 项隔离浏览器
检查及 42 项 Connector 回归通过，没有 build／push／部署。

内置浏览器真实操作 Canterbury、2026-10-08–09、2 成人／1 房成功到达正常结果页
（页面 heading 为 464 Properties）。2026-10-01 10:47 NZ，确认本地运行时空闲与旧
10:21 冷却结束后，一次独立直接导航诊断复用现有有头 Chrome／固定 Expedia public
profile；`https://www.expedia.co.nz/` 首页立即返回 HTTP 429／Bot or Not?，未输入参数、
未提交 Search、未打开详情。停止并暂留原页面供观察，两份 HTML／截图 SHA-256
读回一致，保存在既有受保护本地验收根下 `data/reports/expedia-homepage-local-20261001`。
此导航诊断没有创建 Argus Job／ACK 或 Tymra 业务批次，不表示真实 Argus 列表采集
通过，也没有新 Property／报价入库。`ArgusExecution` 当天 Expedia 为一次，加本次
直接诊断实际为两次；后续预算须另计。六个本地来源与计划仍关闭，生产与 Synix 未操作。

用户随后要求全新 profile 单次尝试。10:56 NZ 在启动前核实目录不存在，使用
`expedia-public/fresh-public-20261001-1054`、相同有头 Chrome 与网络打开首页，仍为
HTTP 429／Bot or Not?，未填写参数、未提交 Search、未抓详情。两份证据 SHA-256
读回通过，保存在既有本地验收根下 `data/reports/expedia-fresh-profile-local-20261001`。
noVNC 已在内置浏览器确认连接并显示该新 profile 的挑战页，自动操作停止，短期保留
供用户观察／控制。没有创建 Job／ACK、业务批次或报价；旧 profile 保留。当天 Expedia
截至该诊断实际为一条 `ArgusExecution` 加两次直接诊断，共三次，后续不得只按表中一次计预算。

用户自行通过新 profile 的人机验证后，明确要求继续搜索并在测试后对照旧参数地址。
同一 Page／BrowserContext／profile 内，通过 noVNC 的可见控件完成 Canterbury、
2026-10-08–09、2 成人／1 房搜索，显示正常 300+ 房源、NZD、未登录。随后单次打开
原代码构造的 `Hotel-Search` 地址（destination、startDate、endDate、adults=2、children=0、
rooms=1、currency=NZD），仍显示正确范围的正常列表，网站补上 regionId=6047984，
没有再次要求验证。截图 `after-human-home-search.jpg` 和 `after-human-old-parameter-url.jpg`
保存在上述受保护本地目录。当天保守额外计两次，共五次；没有继续详情或报价抓取。
这证明人工验证后当前会话两条访问路径可用，不能把之前受阻仅归因于参数地址。
原诊断助手在初次 429 后停止，后续由 noVNC 操作，未恢复自动 snapshot／extractor，
没有新 Job／ACK、业务批次、Property 或报价入库。真实自动采集门槛仍未通过；生产、
Synix 与六个本地来源／计划未操作，没有 build／push／发布。noVNC 停留在正常列表。

用户要求继续剩余流程后，只读导出当前列表 DOM 片段；现行 snapshot／extractor
离线重放得到 Cranford Oak Motel、BreakFree on Cashel Christchurch、Braemar Lodge
And Spa 三条非广告房源，日期／人数／NZD／未登录范围一致。单次参数访问前者
（expedia:2211800）的 2026-10-08–09、2 成人／1 房详情正常，显示 5 房型、未再次挑战。
前三房型显示 NZ$127／136／132，均包含税费。当天累计保守六次，达到实际来源配置
dailyBudget=6，不再访问来源。原诊断助手的观察时限随后到期，浏览器自动关闭；
旧 noVNC 已不再是可控制会话。房型截图 `detail-rooms-observed.jpg` 与列表／详情
DOM 片段、原始及修正后快照／提取结果仍保存在同一受保护本地证据目录。

网络阻断的 Chrome 重放真实详情片段发现推荐／图库标题误作房型名、相邻 DOM 文本
使 Sleeps 2 与 1 Queen／King Bed 拼成容量 21。Argus 隔离候选现改用渲染文本并排除
推荐／图库标题；同一证据复核得到 Queen Studio、King Studio with Spa Bath、King
Studio or Twin Studio，容量均为 2，含税费总价仍为 12700／13600／13200 minor units。
类型检查、15 项定向测试含房型与六源税费浏览器检查通过。Tymra 三类接收 Schema
均通过；实际本地 Expedia Listing=0、RateObservation=0、ArgusExecution=1，来源及
计划关闭。此次片段没有包含地址区域，位置字段不能视为已验证或源页缺失；完整
Job／ACK／位置核实／业务入库仍待预算恢复后的有界验收，没有 build／push／发布。

## 2026-10-01 Airbnb／Bookabach 公开大概位置修复（本地候选）

用户要求检查内置浏览器公开预览并更新抓取代码。Bookabach 内置浏览器页面显示
Christchurch、Woolston 街区，公开 Apollo 状态的房源专属 `ProductLocationAddress`
含地图坐标。Airbnb 在内置浏览器中加载后崩溃，不能将此视作来源挑战；其已留存真实
页面的公开 `VacationRental` JSON-LD 和后续隔离 Argus 实抓均提供房源专属坐标。

Argus 本地候选新增可选 `approximateLocation`，Tymra 接收合同同步保留：
`precision=APPROXIMATE` 表示公开点但精确性未核实；只有文字地区时为 `LOCALITY`，
`point=null`。城市、地区、街区按来源读取；坐标必须匹配 Airbnb 房源 ID 或 Bookabach
canonical URL，排除搜索中心、附近地点及其他房源。精确 `address/latitude/longitude`
仍为 null，不用大概位置通过精确地址匹配，也不改变 D-039 启用门槛。

两个原真实页面无网络重放通过。隔离本地 Argus 各新增一次 `resolve_listing`、一次尝试，
不运行列表或报价、不启用来源／计划：

| 来源 | Argus 本地技术验证 Job | 实际结果 |
| --- | --- | --- |
| Airbnb | `job_26c87f49b3df11c31f41fa27344ac2b5` | Kaikōura District、Canterbury Region；APPROXIMATE point；容量 4 |
| Bookabach | `job_862956c3803148263d31762ef9fbc215` | Woolston、Christchurch、Canterbury；APPROXIMATE point；容量 2 |

两份 wire payload 和四份 HTML／截图证据在既有受保护本地验收根中保留，哈希核对通过，
ACK 后读回 HTTP 410。Tymra 当前接收合同解析真实 payload 通过；这些直接技术验证
没有创建新的生产式业务批次或 Property／RateObservation，不计作 D-039 正向价格验收。
本地当天每来源新增一次，连同此前两次为各三次；直接诊断没有写入
`ArgusExecution` 日计数，后续当日预算必须另计这一次，不能只读该表。

Argus 39 项 Connector 回归、隔离 Chrome 的十种位置匹配／缺失／损坏场景、
Tymra 26 项合同／地址匹配测试通过；类型检查通过，无 build、migration、push 或生产发布。
只修改 Tymra 工程和隔离 Argus worktree，未编辑共享 Argus 主 checkout 或操作 Synix。
两个来源的公开位置采集已通过；精确身份映射和完整报价链路仍待验收，不能表述为
“页面抓取失败”，也不能表述为“两个 OTA 已全部成功”。

## 2026-10-01 六 OTA 本地真实抓取复核

用户要求逐个在本地测试六渠道。复用独立 `tymra_ota_identity_local_20261001`
数据库、Redis DB 14、合成客户端及隔离 Argus 容器，运行 Tymra `f9b7daf` 源码与
Argus `0f8fe78` 候选源码；Booking snapshot 文件的容器／工作树 SHA-256 一致。
无镜像构建、生产发布、迁移、生产请求或自动计划启用。六来源顺序执行，每 Job
最多三次、每来源新西兰日最多六次；失败停止，不绕过挑战、限流或字段要求。

| 来源 | 本轮本地 Job | 真实业务结果 |
| --- | --- | --- |
| Booking | `cmuok59cp0000c6lxqoiky40i` | SUCCEEDED；身份指纹一致，复用有效真实详情，仅一列表＋一精确报价；容量 2，2026-10-08–09、2 成人／1 房、NZD 254.00、AVAILABLE／COMPLETE |
| Airbnb | `cmuojtzqf0006c6966huyhajp` | 列表及详情完成，容量 4；精确地址及坐标未公开，UNIT_IDENTITY_NOT_PUBLIC，未抓报价 |
| Expedia | `cmuojvqje0006c6hctyh7cj40` | 列表 RATE_LIMITED，停止；两份证据保留，没有房源或报价入库 |
| Bookabach | `cmuojxdp40006c6sjev4gigob` | 列表及详情完成，容量 2；精确地址及坐标缺失，UNIT_IDENTITY_NOT_PUBLIC，未抓报价 |
| Agoda | `cmuojz2wr0006c664cigu142t` | TIMEOUT，固定安全阶段为 `visible public search navigation`；无页面证据，没有业务入库，具体控件根因未确定 |
| Trip.com | `cmuok0xs40000c6euo94a3xlk` | 请求 Northland，实际返回 Lylo Christchurch Airport，地区匹配异常；详情精确地址／坐标已取得，11 个房型容量均未知；UNIT_IDENTITY_NOT_PUBLIC，未抓报价 |

样本核对补充：Booking 请求 Northland，样本为 The Sands Hotel Hokianga
（URL identity `copthorne-resort-hokianga`）；Airbnb／Expedia／Bookabach／Agoda
请求 Canterbury，Airbnb 样本 `1575788832170495266`、Bookabach 样本 `9853129`。
Trip.com 请求 Northland 却返回 Christchurch 的 `6141231`；其详情能读取不代表
搜索地区匹配通过，后续须同时修复／验证地区匹配和物理容量依据。本轮统一未来日期为
2026-10-08–09、两成人、一房、NZD，每渠道最多一个候选房源，属于单样本链路验证，
不证明全国覆盖或同一房源跨平台匹配。

本轮六个新 Job 共十个 Argus 执行、18 份页面证据，全部证据 SHA-256 校验通过，
十个结果均 ACK 后读回 HTTP 410；Agoda 无页面证据的限制保留，不能视作取证完整。
Booking 旧完整链路的六份证据及三个 PURGED 结果另行复核通过；最新容量修复再次
以生产保留 HTML、无网络浏览器重放通过，同一房型容量由误读的 1 修正为 2。
新 Booking 列表身份指纹匹配既有有效详情，验证实际跳过未变化详情；本地真实实体仍为
一 Property、一 SellableUnit、一 Listing，RateObservation 追加为两条，未清空历史或
生成演示数据。Booking 当日六次预算用完，没有额外详情请求。

六来源和六条本地日计划均已关闭；Argus 并发 1、无活跃抓取、接管、挑战或待执行任务。
本轮未操作 Synix 源码、容器、账号或 Profile。共享服务观察中 33 个容器身份／镜像／
启动时间一致；同期 `synix-api-1` 发生同镜像容器重建，当前 running、restart=0，
操作者未在本轮核实，因此不把“全部共享容器未变化”列为验证通过项。
结论仅为 Booking 的本地完整链路通过，其余五个来源未通过完整验收；本地结果不计入
生产 D-039 门槛，不改变生产六 OTA 停采状态。生产版本与未发布容量修复见下节。

## 2026-10-01 本地可用性验证后发布及生产复核

用户要求先验证本地可用，再发布。采用独立测试库、Profile、合成客户端与独立浏览器容器，
复用既有镜像运行候选源码，现有本地 Argus、Tymra 和 Synix 服务未切换。
Booking 第一次本地试采停在正常 Explore 地区页，未进入标准列表；保留失败及证据，
修复后通过可见 `View full list of properties` 控件进入房源列表，并严格拒绝改变
同域、日期、人数或房数条件的链接。两项无网络浏览器回归通过，没有更改测试预期或删除失败历史。

修复后本地 Job `cmuo84tpw0000c6467jv5wy2t` 的一列表、一必要详情、一精确房型报价
全部完成。两个业务批次 SUCCEEDED，入库一真实 Property、一个容量 2 的 SellableUnit，
以及 2026-10-08–09、2 成人、1 房、NZD 254.00 的 AVAILABLE / COMPLETE RateObservation。
六份证据逐个 SHA-256 核验，三个 Argus 执行 ACK/PURGED 通过。
Trip.com 本地 Job `cmuo7zbq50006c6zjbx19fqhd` 的有日期列表及详情成功，准确地址、
公开精确地图坐标与房型 ID 已取得；物理容量仍未知，按 UNIT_IDENTITY_NOT_PUBLIC
终止，没有写入 Property 或价格。四份证据哈希与两个执行 ACK/PURGED 均通过。
本地数据库中的真实记录不计入生产业务验收。

独立 Tymra 数据库集成一项及 Argus PostgreSQL 十项均通过，无数据库环境跳过。
Tymra 固定候选 `tymra:ota-identity-20261001-v1`，revision `18781459cf24ecb64a291594e3e019a2454f9742`，
镜像 ID `sha256:74b13711ce7c9b9797635d676e350ce25b0d25db38fd7ff9b2a3904e1ecf27a5`；
只构建一次，镜像内 154 项相关测试通过。测试工具调用的缓存、路径及写权限问题已在
临时测试容器处理，运行镜像与生产用户权限未修改，没有重建。
新的 `/srv/apps/tymra/backups/ota-identity-20261001-predeploy/` 配置、数据库、证据及
回滚材料均校验 SHA-256；隔离数据库恢复后全部 81 张表的完整行摘要一致，恢复库已删除。
Argus `argus-release-20261001-3` / `f61b8c11f72181beabd5abe3662b8d3f399a5d70`
已先发布，镜像 ID `sha256:7aa2a1b89a3e814391ebf038e76873b67f0f2a0e4a82b88b19e940728020c371`。
固定镜像 Chrome 门禁 933 项中 921 通过、12 项数据库环境跳过、零失败；独立数据库、
正式配对恢复和生产运行恢复门禁通过。实际生产备份恢复比对 476 个 Job、两个后台账号、
34,864 项文件的摘要、权限及所有者一致；只切换空闲 browser，共享并发 1，
环境、挂载、网络、PostgreSQL、tunnel 不变，未触发 Synix 真实同步或站点认证。
随后四个 Tymra 服务均切换到上述 `1878145` 镜像，健康且 restart=0；
配置、挂载、网络及其余服务器容器均未改变，没有 migration。每个系统最终候选只构建一次。

发布后的唯一 Booking 有界生产 Job `cmuo9tbw00000pp1qfsy6imqt` 以
`NO_VERIFIABLE_UNIT` 终止，未进入报价步骤、未写入真实 Property 或 RateObservation。
目录批次为 SUCCEEDED / successCount=0，不代表有效业务数据成功；父 Job 为 DEAD_LETTER。
两个 Argus 执行 `job_29e0a9bdfb21c889a6921ae08ddab2b6`、
`job_8bb324a5ce7d24ee5c7a4f4c05732ff8` 均完成，四份证据已保留并核验 SHA-256，
两个结果均从生产 Argus 读回 HTTP 410 / PURGED。
保留页面的房型区域明确写着 `Sleeps: 2 adults`；旧兜底规则误把价格 `× 1 night`
读成容量 1。先前“房型只能住一人”的判断被上述证据取代。
新增 Argus 候选使用可见房型容量说明、排除夜数乘数，并优先读取房型名称链接；
本地类型检查、五项 Booking 无网络浏览器回归和六渠道费用范围回归通过。
生产保留 HTML 无网络重放确认同一房型 ID、容量 2、正确名称及输出合同，无额外外站访问。
该新增修复尚未构建／部署；因用户要求每系统本轮只构建一次，额外一次 Argus 构建待确认，
Tymra 无需重建。当前新西兰预算日生产 Booking 已用四次执行，余两次，不足完整三执行重试。
六 OTA 日计划继续关闭，77 条既有公开计划保留；生产真实房源及价格仍为零。

## 2026-09-30 六 OTA 生产试采（进行中）

本轮实现六来源精确有界 prepare/trial/enable/pause、独立来源日计划、单来源顺序执行、
每 Job 最多三次 Argus 提交／每来源新西兰日最多六次提交，以及失败时来源级停采。
等待 Argus 保留原批次和查询；新一轮同入住日期价格追加历史，房型／日期不匹配拒绝绑定。
费用合同新增可选 `totalIncludesMandatoryFees` 与来源文字依据；未知费用不据此变为完整。
Tymra 候选 `d19ebf4f551e7322d113f3e14aa5e65314c875a4` 已推送；生产镜像
`tymra:ota-bounded-20260930-v1` 只构建一次，镜像 ID 为
`sha256:cc36db2cceef32f5c1767db9b06222be07fa2b306fd07fc884963187052f6fae`，
revision 与上述代码一致。Web、Worker、API、Scheduler 在无在途 Job 时已切换到同一
镜像，Web/API 健康且 Worker readiness 200。六 OTA 来源及关闭的日计划已创建，
六条日计划仍关闭；既有 77 条启用公共来源计划保持原样。

发布备份位于 `/srv/apps/tymra/backups/ota-bounded-20260930-predeploy/`，数据库、
生产配置、旧 Compose、运行镜像和 277 MB 抓取证据均通过 SHA-256 校验。
生产自定义备份已在隔离库恢复，计数一致：78 来源、77 启用计划、273 Job，真实
Property／RateObservation 均为 0。隔离恢复库已清理；旧镜像和来源级停采回滚脚本保留。
本轮没有 migration，没有重建 PostgreSQL／Redis，也未修改 Synix 应用或数据。

本轮已通过全工作区类型检查、Worker 302 项单元测试、根目录 236 项单元测试
（5 项原有跳过），以及独立 `tymra_release_gate_20260928` 数据库中的生产准备／排队
事务回滚测试；补充的取消确认暂时不可用时保留挑战分类测试也已通过。准备前生产只读快照显示 OTA 来源、非演示 Property
和价格均为零；公开来源 enabled plans 当前为 77，`progress-ticketmaster-daily` 已暂停，
另两条 disabled 定义为已退役周 pilot。以下 2026-09-29 的 78 条启用描述为当时快照。

Argus 的公开 OTA 房型选择与完整总价证据合同在首个固定镜像复核时发现 legacy
bundled 表示可能以未披露的零分项误判费用完整。公开精确房型流程的补充修复已通过
61 项定向测试，跨系统 fixture 也验证未披露的 bundled 分项保持 null，已发布 Tymra
将其判为费用 UNKNOWN；Tymra 无需再构建。首个 Argus 候选发布已取消，额外一次
固定镜像构建获用户确认后已完成生产发布：`argus-release-20261001-1`，revision
`7b33ebab4aef603ed8c7813c2df1c135c2cd473e`，实际运行镜像 ID 为
`sha256:1b411f13690e2b514e9a8e4d2766e0b81c0537504fbc63c8cbf3793cd4c0c44d`。
镜像内 925 项测试中 913 通过、12 项数据库环境测试跳过、零失败；独立源码数据库测试已执行。
最新真实配对备份隔离恢复匹配 464 Job、2 账号及 28,774 项私有文件，账号隔离、
结果哈希及无网络 Profile 副本核验通过；不能据此宣称网站登录有效。仅替换 browser，
环境变量名称和值、挂载、PostgreSQL 和 tunnel 均未变；共享并发仍为 1，切换后无在途任务。
一次切换将变量顺序变化误判为差异，已自动回滚；核对名称和值一致后用同一镜像重试通过，
没有额外构建。备份及 Argus 发布证据见其 `docs/current-state.md`。
Synix 后台、账号、权限、Profile 和 Job 不在此变更范围。

Booking 首轮 `cmuo22sft0000migszmejse4w` 在浏览器提交前失败：一次尝试，Job
`DEAD_LETTER`，业务批次 `FAILED`，`SOURCE_UNAVAILABLE` / `INVALID_INPUT`；
ArgusExecution、证据及价格均为 0，Booking 已自动关闭并转为 SUSPENDED。
根因为 Tymra `refreshCatalog` 未传 Argus `discover_listings` 必填的入住／离店日期和人数；
六渠道共用调用路径，其他五渠道没有重复提交相同无效请求。调用端现已补齐 D+7 一晚、
2 成人、0 儿童、1 房、NZD，重放日期依原批次 startedAt 固定。23 项定向测试、Worker
类型检查通过；本地回环服务器验证六条实际序列化请求均通过当前 Argus 合同，原六条缺字段
请求均被拒绝，没有对外采集。Argus 也已在生产镜像只读复现合同问题，无需修改或重建。
这项 Tymra 修复在用户确认后已完成额外一次固定镜像构建和发布：
`tymra:ota-stay-20261001-v1`，revision `8d02267785c4c5c066456065e1bb8eb533e631da`，
镜像 ID `sha256:033cfc931e1b77c629940ea6628bd1ce0b88cd081d74d74b49c46de77522b16f`。
镜像内 23 项定向测试通过；Web、Worker、API、Scheduler 运行同一镜像，健康及
readiness 通过。生产配置变量名称和值、挂载、网络未变，没有 migration；
PostgreSQL、Redis、spm-web、Traefik 未替换，Synix 应用和数据未修改。
最新发布前备份 `/srv/apps/tymra/backups/ota-stay-20261001-predeploy/` 的配置、
Compose、数据库、证据和回滚材料均通过 SHA-256 校验；隔离恢复匹配
84 来源、77 启用计划、279 Job、0 真实 Property、0 真实 RateObservation。
隔离恢复库已删除；回滚保留业务历史，拒绝在自身 OTA Job 活跃时切换镜像。

### 六来源本轮真实试采结果

每来源一次尝试，最多一列表、一详情、一精确房型价格；失败即停采，没有盲目重试。
以下时间均为 2026-09-30 UTC；日计划从未启用。

| 来源 | Tymra Job | 完成时间 | 实际结果 |
|---|---|---|---|
| Booking | `cmuo2selv0000qk0x7c0kyb2h` | 12:23:42 | 列表成功；详情 `PARSING_ERROR`，页面正常但隐藏弹窗选错、`Max. people` 容量漏读、公开地图坐标漏读 |
| Airbnb | `cmuo2wase0000qk4sjw9q080n` | 12:26:33 | 列表和详情成功；未得到精确地址及坐标，`UNIT_IDENTITY_NOT_PUBLIC` |
| Expedia | `cmuo2ytld0000qk79jfz20xrv` | 12:28:00 | 列表 `RATE_LIMITED`，未继续详情；当前调用端错误分类为 `ACCESS_CHALLENGE` |
| Bookabach | `cmuo31boi0000qkc7dk4syq6u` | 12:30:33 | 列表和详情成功；地址及坐标缺失，`UNIT_IDENTITY_NOT_PUBLIC` |
| Agoda | `cmuo33vz90000qkey250r5ow4` | 12:32:31 | 列表执行约 60 秒后 `TIMEOUT`，无返回页面证据，不能判断为登录、挑战或正常页面 |
| Trip.com | `cmuo3809z0000qkhqmupzdzrt` | 12:35:43 | 列表和详情成功；完整地址已得到，公开精确地图坐标漏读，无日期详情没有报价房型表，容量未知 |

本轮 10 个实际 Argus Job 均终止，返回的 18 份证据全部本地留存并校验；
ACK 后独立读取全部返回 HTTP 410 `RESULT_PURGED`。真实 Property 和价格仍为 0，
六来源自动 SUSPENDED、enabled=false；六日计划关闭，既有 77 条公共计划保持原状，
核对时无在途 Tymra Job。队列、页面或 Connector 成功不是来源业务验收。

### 本轮失败后的未发布修复

Argus 身份及合同修复源码提交为 `033bd00`；生产仍为上述 `7b33eba`。
发布顺序必须先 Argus 合同、后 Tymra 调用端，六日计划保持关闭直到真实门槛通过。

Tymra 候选保留具体错误码，避免 `manual_required` 覆盖 `RATE_LIMITED`；
六公开 OTA 仅将实际 `PARSING_ERROR` 证据标为 parserFailure，其他来源逻辑不变。
现有历史证据保留：Booking 两份真实解析失败和 Expedia 两份被旧代码误标的证据均未删除或改写。
Trip.com 有界详情请求新增可选 `identity_stay`，沿用原批次 D+7 一晚、2 成人、
0 儿童、1 房、NZD；只用于公开房型身份，不替代后续精确价格请求，也不增加 Job 请求上限。
Argus 同步合同及 OpenAPI，等待真实房型表；其他来源和 Synix 后台合同保持原样。

Argus 候选修复 Booking 实际报价行及明确最大人数、公开地图坐标、解析失败时补充快照丢失，
并补齐 Trip.com 同酒店且明确公开精度的地图坐标及数值 JSON-LD 坐标。
Trip.com 容量排除报价区域中的入住人数；未披露仍为 null。
Booking 原失败 HTML 在无网络隔离浏览器中重放，解析出 NZ 地址、公开坐标及容量 2 的
真实房型，通过输出合同。Trip.com 原页面重放确认公开坐标已正确提取，四个房型容量仍 null；
不能据此称房型或价格验收通过。Agoda 既有日志未提供超时阶段，候选只补充允许列表内的
安全阶段诊断，不将其称为超时根因修复。

Tymra 后续候选 36 项有界控制、发现、分类及价格持久化测试通过，另 1 项真实
序列化回环测试验证 Trip.com `identity_stay` 及严格身份响应，Worker 类型检查通过。
Argus 5 项无网络 Chrome 集成及 51 项定向合同／费用／后台 OpenAPI 回归通过，
类型检查通过。全源码回归首先通过 787 项、跳过 111 项；3 项子进程停机测试因直接
源码执行的子进程未继承 TypeScript loader 失败，仅纠正执行环境后 3/3 通过，未改断言。
没有为这些验证构建镜像；固定镜像及发布恢复门槛仍须在授权后执行。

这些后续修复尚未进入运行镜像。现有构建授权已经履行，后续固定镜像构建及替换需要
另行确认，不使用源码热补丁。Airbnb／Bookabach 的已核实网址到地址映射仍待用户资料，
Expedia 限流和 Agoda 超时仍为真实外部运行阻塞。任何来源启用还必须满足两次真实正向
业务结果、证据留存与 ACK，以及 D-039 的滚动失败门槛；当前 30 天窗口保留失败，
不得删记录、跳过门槛或将离线测试当作正向生产证据。

发布等待期间 Eventfinda 首个本轮观察的自然周期 `cmuo1ozq60000rx07erpqa5jv` 成功，
CollectionRun 保存 71 条结果、0 失败，2026-09-30 11:54:49 UTC 结束；先等该周期
结束并重新配对备份，再切换 Argus，没有暂停或移动该公开计划。

## 2026-09-28–29 未来日期与历史版本生产发布记录

源码 `2d670b51777d5233bb0c2ffa42261883dcaa7a3a` 已推送，CI `36403972873`
成功。生产候选 `tymra:future-history-20260928-v1` 只构建一次，镜像 ID
`sha256:3ed60cba2c9c63e86becd032ed22632eed00e01c94487a398e0e34cb7de7b90e`
的 revision 与源码一致。发布前备份
`/srv/apps/tymra/backups/future-history-20260928-predeploy/` 的校验和与隔离数据库恢复
通过（78 来源、77 计划、224 Job）。新增 `20260928120000_public_fact_versions` 为第
34 个成功迁移；Web、Worker、API、Scheduler 已切到同一新镜像并运行，Web/API 健康，
Argus health/readiness 为 200。管理员登录页返回 200，未登录的当前／历史页面返回
登录跳转，公开域名未解析；历史筛选的实际页面交互已在本地验证，尚未在已登录的生产
管理员会话验收。

Eventfinda 渐进试采第一轮 `cmul336gh0000qb1p76pn17ur` 成功：3 列表页、1 详情、
4 请求、63 条结果，8 份本地证据，0 失败。第二轮
`cmul384gh0000qb2kajw0cuf9` 的 Job 成功但 CollectionRun `PARTIAL`：3 列表页、
0 成功详情、4 请求、56 条结果，6 份本地证据、1 失败；详情目标
`https://www.eventfinda.co.nz/2026/office-comedy-clash/auckland/ponsonby`
在 Argus Job 建立前返回 `SOURCE_UNAVAILABLE`，目标进入退避。当天停止继续请求；
新预算日的一次受限重试 `cmul52aeg0000qbagm4xhdrmy` 仍是同一目标
`SOURCE_UNAVAILABLE`，批次 `PARTIAL`（3 列表页、4 请求、60 条结果、
6 份本地证据、1 失败）。Argus 的 Eventfinda URL 合同只允许年份／活动／一级位置，
生产 138 个目标中 27 个使用城市／城区两级位置，因而在提交前被拒绝。
Argus 后续仅放行这一级路径的修复已以 `argus-release-20260929-1` 发布；
固定镜像 CI 与私有导出均成功，生产 Mac mini 只重建 browser，PostgreSQL 和
tunnel 未变。Tymra 生产镜像未再次构建。Argus 新镜像的发布证据及加密配对
备份见其 `docs/current-state.md`。

修复后两轮 Eventfinda 精确试采 `cmul6hs7s0000qbcf281l9y74`、
`cmul6nnhi0000qbdayuusyw49` 均为一次尝试的 Job 和 `SUCCEEDED` 的
CollectionRun，分别保存 66、64 条结果，0 失败；每轮 3 个列表页、
1 个详情、4 次 Argus 浏览器执行，HTML 与截图各 4 份，均本地保留且无解析失败。
第一轮原先被拒绝的 `office-comedy-clash/auckland/ponsonby` 目标已由 Argus
完成并标记 `FETCHED`，错误码清空。8 个 Argus Job 均为 `COMPLETED` 且
交付状态 `PURGED`。验收后原 `pilot-public-eventfinda-weekly` 已关闭，
`progress-eventfinda-daily` 已启用，下次运行时间为
2026-09-29 11:51:35 UTC，payload 为最多 3 列表页、1 必要详情、500 条记录。
Eventfinda 来源并发上限 1、每日请求上限 24，运行间隔设为 12 秒加最多 6 秒抖动；
启用时的新西兰预算日已有 11 份 HTML 请求证据，尚未耗尽预算。首次自然周期的
自动运行结果仍需独立核对。

Ticketmaster 两轮精确渐进试采 `cmul3gxkz0000qb3jqw1tl486` 与
`cmul3jxpg0000qb4eqwae83sc` 均成功；每轮 3 列表页、3 请求、52 条结果、
0 必要详情、0 失败，6 份证据均本地留存。原每周 pilot 已关闭，
`progress-ticketmaster-daily` 已启用，首次计划于 2026-09-29 10:22:49 UTC 运行。

Lincoln/UC 来源已将每日预算设为 3 次并纳入两校域名。第一轮滚动试采
`cmul3mwr50000qb6wmzhtlj71` 成功访问 3 页，产生 27 条信号，日期覆盖
2026-09-30 至 2027-09-12，全部为未来且没有倒置区间；4 份浏览器证据已留本地。
第二轮 `cmul4z4ed0000qb8sd92hhebt` 于 2026-09-29 新西兰预算日成功，
同样访问 3 页并保存 27 条未来信号；4 份浏览器证据本地留存、0 解析失败，
重复采集没有新增 `PublicFactVersion`。两次批次均通过内置验收后，
`rolling-christchurch-university-dates-weekly` 已启用，首次计划于
2026-10-05 11:01:51 UTC 运行。来源仍限制每日 3 次请求。该阶段 78 条
现行计划均已启用且有下次运行时间；已被替代的 Ticketmaster 旧周试运行定义
留在计划表中并处于关闭状态，队列无在途任务。

启用 Eventfinda 每日计划后，78 条现行计划均已启用且有 `nextRunAt`，
队列没有在途 Job。计划表还保留 2 条已被每日计划替代、处于关闭状态的
Eventfinda 和 Ticketmaster 旧周试运行定义；它们不属于现行采集计划。
当前 Source Registry 的 78 条来源均为 `PUBLIC_DATA`；
`ota:health --window-days 30`
只读查询返回空列表。六个文档内 OTA 渠道尚未进入生产 registry 与真实面板验收，
不能把 78 条现行公开来源计划解释成全部文档渠道已自动运行。
**较早的发布后快照（2026-09-28 10:35 UTC）：**当时 15 个 Argus Job 均为
`COMPLETED` 且交付状态为 `PURGED`；21 个 Tymra Job 均成功，但六个
CollectionRun 中有上述 Eventfinda `PARTIAL`，不能仅以队列状态判断来源成功。
当时追加历史表已有 344 条活动和 27 条日期信号版本，相同来源、事实 ID 与内容
哈希没有重复版本。这些计数不包含上文随后完成的 Eventfinda 修复后试采，不能
作为本次发布后的最终累计数。

以下带日期的运行、验证和发布段落按各自记录时间保留；除明确更新到
2026-09-29 的需求差距表外，不把其中的“当前”或“仍暂停”解释为本节之后的运行状态。

## 2026-09-28 未来日期与历史版本发布前本地验证

本地 `tymra_worker_test` 已应用新增 `PublicFactVersion` 迁移；普通信号的首次、
重复和变化采集以及活动改期的标准场次关系均通过集成测试。活动被改期时旧场次
保留，失去最后一个来源链接后标记 `SUPERSEDED`，新场次以新日期建立。
后台当前／历史视图在本地浏览器完成登录、筛选和页面错误检查。

检查视图时发现旧 AUT 数据一条 2026-12-25 开始的假期被写成
2026-01-04 结束；[AUT 官方 2026 校历](https://www.aut.ac.nz/study/semester-dates)
显示该范围属于暑期学校的跨年假期。Tymra 候选拒绝结束早于开始的大学日期，
历史视图不再把未来开始、过去结束的异常记录显示为历史；Argus 候选按年度
标题和暑期学校小节修复解析。已有错误数据仍需在新版本发布后通过受限重采
与来源版本核对修复，不能仅靠后台过滤视为数据已经更正。

本轮本地检查：类型检查、lint、236 项公共单元测试、279 项 Worker 单元测试、
隔离库 122 项集成测试通过；Tymra 与 Argus 各完成一次本地构建。
Argus 已编译测试 751 通过、105 项隔离浏览器测试跳过。Tymra 本地
Next.js 构建退出码 0，但未注入运行环境变量，静态页预生成产生环境校验
警告；发布前须以真实部署镜像、CI 及运行健康重新验收。生产数据库、镜像与
计划在本节记录时未变更，仍保持 77 条已启用计划。

## 2026-09-28 Eventfinda/Ticketmaster 每周自动试运行（历史快照）

两项来源在各自新的 pilot 验收窗口内分别完成两轮独立、一次尝试的正式生产 Job；
Eventfinda 的 `cmukx9c630025jy07or8agkox`、`cmukxabg5002djy07du30vfbp`
及 Ticketmaster 的 `cmukxbfc8002ljy071c0dfl8h`、
`cmukxc3ae002tjy07w5n2zlzl` 均 `SUCCEEDED`，零失败。正式启用检查核对了
持久业务记录、来源和计划快照、证据及 Argus ACK/PURGED；每项均通过
`argusJobsPurged=2`、`verifiedEvidence=4`，随后创建其专属的每周计划。

为立即观察真实 Scheduler 行为，只把两项新计划的首次 `nextRunAt` 分别提前到
当晚非办公时段；计划的 `weekly` 频率、每次最多 2 条的 payload 和其余计划未改。
Scheduler 分别自动入队 Eventfinda Job `cmukxf7790000pj074yjxo46t`、
Ticketmaster Job `cmukxghk10001pj0758uhib85`；两者均一次尝试 `SUCCEEDED`。
Eventfinda 本轮读取全国首页 1 页、20 张卡片，未到期详情访问为 0，
新增活动为 0；Ticketmaster 本轮读取奥克兰列表 1 页、19 张卡片，
2 条可直接用列表确认的活动均与已有记录相同，详情访问和新增活动均为 0。
两项来源的 `SourceEvent` 总数各保持 2。

两轮自动 Job 的 4 份 HTML/截图证据逐文件复算 SHA-256 均与生产数据库相符；
对应 2 个 Argus Job 均 `ACKED`/`PURGED`，无在途 Argus Job。两项计划保持启用，
下次分别为 `2026-10-05T07:29:00Z`、`2026-10-05T07:30:00Z`；现有 75 条计划
未改，生产总计 77 条已启用计划。当前每周 pilot 只读取首页且限制 2 条结果，
不能代表全国分页渐进补齐；提高频率、轮换后续页及每日请求额度仍需独立的
生产计划实现与验收。

## 2026-09-28 Eventfinda/Ticketmaster 新浏览器代码各一次生产试采

按每项一次、`maxAttempts=1` 的 Argus market pilot 执行，试采前两项来源均已暂停，
无来源计划、无在途 Tymra 或 Argus Job。受限重新启用将两个旧来源适配器元数据
转换为 `public:*:argus-v1`；Eventfinda 来源记录的每日预算由历史 2500 更新为 24，
Ticketmaster 保持 20。试采时未创建或启用定期计划。

Eventfinda Tymra Job `cmukwsovd0000jy4bcsj0dgtw`、CollectionRun
`cmukwsp9u0001jy07ozuuir7f` 均 `SUCCEEDED`，一次尝试、零失败；浏览器请求
3 次：全国列表 1 页、20 张卡片、详情 2 页，新增 2 条 `SourceEvent`。
列表与详情的 3 个 Argus Job 均 `COMPLETED`，保存 3 份 HTML 和 3 份截图。

Ticketmaster Tymra Job `cmukwx1dq0000jy6ufpl1mntw`、CollectionRun
`cmukwx1tw0019jy07yimwr2m7` 均 `SUCCEEDED`，一次尝试、零失败；浏览器只请求
奥克兰列表 1 页，发现 19 张卡片，2 条完整列表活动写入 `SourceEvent`，
避免 2 次详情访问，保存 1 份 HTML 和 1 份截图。

8 份 Tymra 证据在生产 Worker 内逐文件复算 SHA-256 与数据库一致；4 个 Argus
Job 的交付均为 `ACKED`/`PURGED`。两轮的来源配置与计划快照均显示试采期间未意外
改变。试采结束后两项来源重新设为 lifecycle=`SUSPENDED`、enabled=false；
75 条既有计划仍启用，零个两项来源计划，Tymra 与 Argus 均无在途 Job。
这只是每项一次的受限生产试采；正式恢复计划仍需新的连续两轮验收。再次从暂停
状态重新启用会重置 pilot 验收窗口，不能把本次孤立试采算作未来两轮门槛之一。

## 2026-09-28 Eventfinda/Ticketmaster 浏览器采集代码生产发布（发布时状态）

`main` 的采集修复 `c9d39528` 与兼容暂停来源、增加浏览器验收门槛的
`049335c160fce47d62a3c0d69dbb9e93d09c6479` 均已推送；对应 CI
`36384326153`、`36385773873` 均成功。隔离 `tymra_worker_test` 的完整
`pnpm verify` 通过，覆盖 lint、类型检查、236 项 common 测试、275 项 Worker
单元测试、122 项集成测试及 Web/Worker 构建。

生产 Worker/API/Scheduler 运行 `tymra:eventfinda-browser-20260928-v2`，镜像 ID
`sha256:86c21a7f98e9ce13689847edce2410b493605227b48870fcaff7bad5cd91efc0`，
OCI revision `049335c160fce47d62a3c0d69dbb9e93d09c6479`；API healthy，
三项容器 restart=0，Web/PostgreSQL/Redis 未切换。生产运行配置的 Eventfinda
每日上限为 24 次、发现最多 5 页、详情每批 15 个、请求间隔 12–18 秒。
生产 `argus:health` 为 ready，HTTP health/readiness 均为 200。

部署前备份位于受保护的
`/srv/apps/tymra/backups/eventfinda-browser-20260928-predeploy/`；内部校验和通过，
PostgreSQL 隔离恢复读回 78 个来源、75 个计划、205 个 Job。旧镜像
`tymra:public-office-20260928-v2` 保留供回滚。备份后的 Compose 恢复步骤曾因
未显式指定镜像短暂启动旧的 admin-only 镜像；发现后立即用原运行镜像恢复，
来源状态、计划和 Job 计数未变，然后以显式镜像完成本次发布。

Eventfinda 与 Ticketmaster 在生产均为 lifecycle=`SUSPENDED`、
healthStatus=`DEGRADED`、enabled=false，没有启用计划，
发布时未触发真实抓取、业务写入或两轮生产验收。当时 Eventfinda 来源行仍保存历史
`dailyBudget=2500`，但实际运行上限为 24；上述受限试采已将来源元数据同步为
24。其余 75 条已启用计划未改动。

## 2026-09-28 Eventfinda 列表优先与缓慢补齐本地候选（发布前记录）

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

## 2026-09-28 生产发布与五个暂停来源复验（历史快照）

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

## 2026-09-27 public-source production rollout — historical snapshot

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
rerun through the same gate. The release section at the top is authoritative for the latest
recorded production and current-worktree verification.

## Historical Workspace And Runtime Baseline (2026-09-13)

At that inspection, the editable main checkout was `/Users/haroldchen/Development/tymra/repo`; the iCloud business
entry was `Workspaces/tymra`. HEAD was `4def572f18dbeb1cd332430fcc3bd900443a5446`, with the
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

## National Data Core v1.3 Implementation Gap Audit (opened 2026-08-21; selected rows refreshed 2026-09-29)

This table began as the approved `DATA-CORE-001..022` gap audit. Current rows are updated against
the 2026-09-29 release where evidence is available; older development-only verification remains
identified by its status and should not be read as fresh production acceptance. The latest operating
state is at the top of this file. `P0` blocks the first unified production candidate or would cause irreversible
loss/misattribution; `P1` completes nationwide operating depth; `P2` improves scale and operator
efficiency. Tymra has never launched, so obsolete development-only schema and routes were deleted
directly without a compatibility layer or historical backfill. `implemented_database_verified` means
the code, clean migration/seed and isolated PostgreSQL contracts passed; it does not claim a nationwide
non-demo run or production acceptance.

| Requirement | Current repository evidence | Concrete gap | Priority | Status |
| --- | --- | --- | --- | --- |
| `DATA-CORE-001` nationwide identity directory | 17 Region × six OTA durable crawl frontier; bounded discovery persists explicit Property/Unit/Listing identities and versions | Nationwide non-demo population depth has not yet been run or measured | P0 | `implemented_database_verified` |
| `DATA-CORE-002` nationwide public signals | National aggregators, 15 major-market mappings, regional official adapters and canonical event/signal persistence exist; 78 bounded current public-source plans were enabled in the 2026-09-29 production snapshot | Schedule enablement does not establish complete nationwide depth, historical coverage or long-term stability; the 15-market operating set does not by itself represent every region | P1 | `bounded_public_schedules_running_nationwide_depth_not_accepted` |
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
| `DATA-CORE-015A` current/future-first collection time semantics | Event/signal facts append `PublicFactVersion` rows on content changes; moved occurrences retain superseded history; Admin supports current, history and all filters; Lincoln/UC requests the current and next academic years | First natural cycles, other future-dated channels and all six OTA production channels still need source-specific acceptance; monthly/statistical sources use their latest published periods | P0 | `public_facts_released_all_channels_not_accepted` |
| `DATA-CORE-016` versioned identity graph | `IdentityEntityVersion` preserves Property/Unit history; `ListingVersion` and `IdentityRelationVersion` preserve Listing and Listing→Unit evidence/validity | Split/conflict operating exercises remain | P0 | `implemented_database_verified` |
| `DATA-CORE-017` Listing change history | All current catalog, OTA resolution, address promotion and manual-import mutation paths append content-addressed identity/Listing versions | Real multi-pass source-change acceptance remains | P0 | `implemented_database_verified` |
| `DATA-CORE-018` Data Lineage | `TransformationRun` and `LineageEdge` connect raw artifacts, normalized rates, snapshots, analyses, results and insights; Admin explorer queries the graph | Production-scale query tuning remains | P0 | `implemented_database_verified` |
| `DATA-CORE-019` snapshot target modes | `MarketSnapshot.analysisType` is required; address mode uses nullable Listing/Unit and a spatial anchor without fabricated target Listing | Fresh live two-mode acceptance remains | P0 | `implemented_database_verified` |
| `DATA-CORE-020` price/recommendation separation | Separate result statuses, one-valid-price delivery behavior and dedicated integration tests exist | Preserve through the schema migration and rerun both target modes; no new product behavior is required | Regression only | `verified_for_prior_development_candidate` |
| `DATA-CORE-021` unified nationwide backend gate | The 2026-09-28 local gate passed isolated migration/seed, 122 integration tests and one Tymra build; 78 bounded current public-source plans were enabled in the 2026-09-29 production snapshot | Production had no Property/Unit/Listing/MarketCoverage rows in that snapshot; non-demo nationwide execution, representative OTA panel, capacity and full readiness remain release gates | P0 dependency gate | `implemented_not_live_accepted` |
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
| Quality baseline | Candidate `56d148b`: lint/workspace types and full CI pass; 238 Web/domain/provider unit checks pass (5 conditional skips), 332 Worker checks pass, 123 PostgreSQL integrations pass (6 dedicated OTA entries separately pass in their isolated database), 117 Web pages and four Worker entrypoints build; exact image Worker/startup/compiled caller and local additive migration checks pass | local/candidate verified; production preflight pending |
