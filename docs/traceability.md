# Tymra 实现与验收追踪

更新：2026-10-09。整体后台最终改造、日常开发热更新及后台回归修复仍只在本地，见本文同日记录。
生产仍为 Argus `824e0dd5`、Tymra `2024961`。用户要求立即追加后，已取得
Gisborne NZD 248、Canterbury NZD 566 两份完整匿名含税费报价；中间的
Hawke's Bay 目的地选择失败，随后 Otago 报价内部错误，所以不是连续两轮成功，
标准质量验收仍为 NOT_PASSED／DEGRADED。NZ 10-09 12:25 读回 84/84 计划
开启，Booking 下一次为 NZ 10-10 01:33:25。两层临时额度全部撤回，当日 20 次
执行保留；原失败、参考价及固定窗口保持。原定凌晨的额外试采跟进已暂停；
当前两份公开报价已交付，余下质量修复及自然周期仍未完成。
本文件维护当前实现、最近已记录的环境和验收缺口；下一步见[实施计划](implementation-plan.md)，
目标合同见[产品入口](product/README.md)，变迁见[决策记录](decisions.md#文档与运行阶段变迁)。
历史提交、镜像、计划数量及 nextRun 均须在下一次操作前重新核对。

## 2026-10-09 Booking 即时追加：两份完整公开报价，连续质量门槛未通过

用户明确要求“那你现在直接再完成两轮完整公开报价”。本次真实生产结果如下；
没有移动 `cmv02ebw90000t8qrjyh2or4w` 的修复验收起点，没有覆盖旧失败或补造报价。

| 父 Job／地区 | 结果 | 是否完整公开报价 |
| --- | --- | --- |
| `cmv056ptm0000t841uw9bn953`／Gisborne | Portside Hotel Gisborne／Standard Studio，NZD 248；发现及报价 Run 均 1 成功、0 失败 | 是；SUCCEEDED，单次尝试 |
| `cmv05abu50000t85tdv0ibh06`／Hawke's Bay | `destination-suggestion:failed`；输入完整地区后没有可选目的地，非弹窗或验证码 | 否；DEAD_LETTER／NAVIGATION_ERROR |
| `cmv05i9yf0000t883shbw03v4`／Canterbury | Fable Terrace Downs Resort by MGallery／Deluxe Two Bedroom Villa，NZD 566，含早餐；两个 Run 均 1 成功、0 失败 | 是；SUCCEEDED，单次尝试 |
| `cmv05m46t0000t89thkculpab`／Otago | 搜索及 Lake Resort by Marsden 身份确认成功；报价返回 INTERNAL_ERROR，无公开 RateObservation | 否；DEAD_LETTER，内部错误根因尚未查明 |

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
当前剩余：查明并修复 Hawke's Bay 目的地选择及 Otago 内部错误，完成最新连续两轮
成功与自然周期。受保护证据在 `runtime/release-candidates/booking-popup-20261009/quality-immediate-*`。

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
| PRD-OPS / requirements §3.7 / D-053 | Complete six-module service assurance Admin, bounded recovery/cancellation, data correction/backfill, entitlement/privacy support and audit; customer-owned business decisions | 2026-10-09 fixed-content local lint/types/unit/integration/build/browser and actual restoration evidence below; no production deployment | development_verified_not_deployed |
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
| `MEM-OPS-001` | Factual billing reconciliation, proven duplicate usage correction, session/risk/account support and owner-delivered export/deletion | 2026-10-09 isolation verifies retired arbitrary plan/email actions denied, linked Price/invoice facts, immutable usage correction, active-delivery deletion refusal and actual owner download; real Stripe/provider acceptance remains separate | `development_verified_not_deployed` |
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

## 2026-10-09 服务保障后台生产发布候选

用户已授权推送全部本地代码并发布生产。发布比较以实际生产 `2024961` 为基线；
已把生产 Booking 参考价保留／继续采集修复合入重构后的 Worker，避免发布回退该行为。
严格保持参考价与匿名可订总价分离、失败记录、来源预算及固定质量验收窗口。

本地完整 `pnpm verify` 通过：lint／类型、777 项单元（5 项外部条件跳过）、
163 项数据库/API/Worker 集成、生产形态 Web／Worker 构建。
默认跳过的六 OTA 合同另在新空隔离数据库全部通过，包含 Booking 参考价后继续正价采集、
重复调用不收费、不生成伪公开价格、不可变历史及证据交付／ACK。
发布候选还须绑定提交、云端浏览器门禁、生产备份实际恢复与六个增量迁移检查；
本条是准备记录，不证明生产已经切换。部署读回完成后在本节补充实际结果。
