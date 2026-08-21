# Tymra 新西兰全国住宿数据核心契约

状态：Active — National Data Core Baseline v1.0
Owner / 最终批准人：Harold
最后更新：2026-08-21

本文件是 Tymra 当前全国数据核心的执行契约。它定义当前要建设和持续运行的数据资产、覆盖层、来源能力、时间语义、质量、历史、证据与 lineage。客户会员产品与后台进入同一生产部署；权益由 `membership-plans.md` 定义，初期只隐藏首页、公共导航和营销 CTA 入口。

## 1. 当前部署与展示

- 同一生产版本部署采集后台、Worker、调度、来源健康、异常处理、全国覆盖、公开 Price Check、客户注册／登录、四档会员、方案价格、Stripe、客户结果和监测。
- 初期状态为 `DEPLOYED_HIDDEN`：首页、公共导航和营销 CTA 不展示客户入口，但路由、API、Worker、数据库和 webhook 随版本部署并接受生产验收。
- 隐藏入口不是安全措施。直接访问继续执行身份认证、资源归属、方案权益、防滥用和支付状态检查。
- 恢复公开入口只改变展示配置，仍需回归证据和回滚方案；不重新构建另一套客户端部署。

## 2. 全国覆盖的五层定义

### DATA-CORE-001 全国身份目录

持续建立全新西兰 Property、Sellable Unit、Listing、标准地址和地理层级的稳定身份目录。目录覆盖目标是全国，不以 Christchurch 或少数主要城市代替全国。

### DATA-CORE-002 全国公共市场信号

持续采集与住宿需求、供给、交通可达性和异常相关的全国公共信号，包括节假日、学校假期、大学关键日期、活动、港口／邮轮、机场、道路、天气、自然事件和适用的宏观数据。信号必须绑定明确区域、时间、来源、Freshness 和 Confidence。

### DATA-CORE-003 代表性 OTA 面板

按 Region、Territorial Authority、住宿类型、质量档位和价格档位维护分层 OTA 样本，持续观察公开价格、可售、限制和 Listing 变化。代表性面板不承诺抓取所有房源未来 365 天的所有 OTA 组合。

### DATA-CORE-004 全国按需采集

内部运营者可以对任意可可靠解析的新西兰地址或受支持 OTA Listing URL 发起有界采集。地址模式返回附近公开住宿行情，Listing 模式返回目标 Listing 的公开价格；两者不得混淆身份或价格归属。

### DATA-CORE-005 会员激活房源监测

激活 Property 按会员方案执行逐日精确价格与长期监测。该层随同一生产版本部署；初期客户入口为 `DEPLOYED_HIDDEN`。

## 3. 区域覆盖与质量

### DATA-CORE-006 区域接受原则

所有新西兰 Region 都属于当前采集范围。区域不得因为不在 Christchurch 而被拒绝；无法解析身份或来源完全不可用时按具体失败原因停止。

### DATA-CORE-007 覆盖等级

每个区域和数据域分别返回 `SUPPORTED`、`PARTIAL_COVERAGE`、`PILOT`、`INSUFFICIENT_DATA` 或 `SOURCE_UNAVAILABLE`。覆盖等级必须由实际样本、成功率、Freshness 和质量决定，不由营销目标决定。

### DATA-CORE-008 覆盖事实

至少保存已知 Property／Unit／Listing 数、地理覆盖、样本构成、最近 24／72 小时覆盖率、采集成功率、来源失败率、最近成功时间、最近健康时间和覆盖缺口。全国总数必须能够下钻到 Region 和适用的 Territorial Authority。

## 4. Source Registry 与能力契约

### DATA-CORE-009 Source Registry

每个来源保存稳定 Source Key、提供者／站点身份、数据域、获取方式、生命周期、启用状态、健康状态、计划频率、并发／预算边界、负责人、保留策略、最后检查时间和最后成功时间。

### DATA-CORE-010 Capability-based adapter

来源只实现自身实际支持的能力，不要求所有来源伪造统一 OTA 方法。能力注册表至少允许：`discoverListings`、`resolveListing`、`collectRates`、`collectAvailability`、`collectEvents`、`collectKeyDates`、`collectTransportSignals`、`collectWeatherSignals`、`importDataset` 和 `healthCheck`。任务编排必须先检查 capability、启用状态和健康状态；缺少能力时 fail closed，不用空实现伪装成功。

当前 OTA 执行集合只包含 Booking.com、Airbnb、Expedia、Bookabach、Agoda 和 Trip.com。其他 OTA 不属于当前合同、发现、健康或验收范围，不保留兼容要求。

当前 Source Registry 和验收报告必须直接从实际启用配置生成，不使用历史来源数量作为当前基线。

## 5. 数据分层与证据保留

### DATA-CORE-011 三层数据

- Raw evidence：HTML、截图、响应片段或导入原件，用于解析、复核和故障诊断。
- Normalised fact：身份、价格、可售、事件、日期和市场信号的结构化观察。
- Derived result：快照、覆盖指标、异常、趋势、Confidence、推荐和其他分析结果。

三层拥有独立保留与清理策略，不能用客户历史权益延长原始证据保留，也不能因 Argus 清理短期证据而删除已确认的标准化历史。

### DATA-CORE-012 Argus 与 Tymra 边界

Argus 在 Tymra 校验结果和证据哈希并正确 ACK 后，可以按合同立即 purge Job 结果、HTML 和截图。Tymra 只保存业务必需的标准化事实、来源和 Job 标识、字节数／内容哈希、采集上下文、质量状态、解析器版本及转换链。需要延长诊断证据时必须在 ACK 前按批准的隔离流程保留，不得默认复制 Cookie、Session、Token 或浏览器 Profile。

## 6. 时间、Freshness 与 Confidence

### DATA-CORE-013 时间字段

每条事实按适用性分别保存：

- `sourcePublishedAt` 或 `sourceEffectiveAt`：来源发布或事实生效时间；
- `collectedAt`：Tymra／Argus 实际观察时间；
- `businessDate`、`validFrom`、`validTo`：事实适用的新西兰日期或区间；
- `ingestedAt`：进入 Tymra 标准化存储的时间；
- `supersededAt`：被新版本替代的时间。

所有业务日期和额度边界使用 `Pacific/Auckland`；机器时间戳以 UTC 保存并显式转换。无 `collectedAt` 的观察不得进入正式分析；缺少业务适用时间的数据不得绑定日期级结论。

### DATA-CORE-014 Freshness

Freshness 是按数据域、预测跨度和使用目的计算的独立状态，至少包含策略版本、计算时间、年龄、允许上限和 `FRESH`／`AGING`／`STALE`／`UNKNOWN`。OTA 价格、事件状态、道路警报和月度宏观数据不得共用同一个 24／72 小时阈值。

### DATA-CORE-015 Confidence

Confidence 分为 identity、field／observation、snapshot 和 derived-result 四层，并记录规则版本和限制原因。来源数量、身份匹配、字段完整度、时间一致性、可比性和冲突分别贡献质量判断；Confidence 不得替代 Freshness，也不得仅因数据存在而自动提高。

## 7. 身份、历史与 lineage

### DATA-CORE-016 版本化身份图谱

标准地址、Property、Sellable Unit 和 Listing 的关系使用带 `validFrom`／`validTo` 的版本记录，保存匹配依据、Confidence、首次发现、最后确认、冲突、合并和拆分。地址写法或 OTA 渠道变化不得把同一物理住宿重复计数。

### DATA-CORE-017 Listing 变化历史

Listing 的首次发现、下线、重新上线、名称、品牌、房型、政策、公开价格、可售和身份映射变化采用追加事件或版本记录；当前快照可以物化，但不得覆盖唯一历史事实。

### DATA-CORE-018 Data Lineage

每个标准化事实、MarketSnapshot、DateSnapshot、Insight 和 Result Version 必须能追溯至 Source、Collection Run／Argus Job、查询条件、标准化输入、转换／解析器版本、人工修改和保留的证据引用或哈希。转换链使用可重放的 `TransformationRun` 与输入／输出 lineage edge 表达；只保存最新外键不足以满足该要求。

## 8. 快照与结果语义

### DATA-CORE-019 快照目标类型

MarketSnapshot 必须区分 `LISTING_PRICING` 和 `LOCATION_BENCHMARK`。Listing 模式要求 `targetListingId`；地址模式要求稳定 `propertyId`／空间锚点且允许 `targetListingId=null`。Schema 不得为了复用 Listing 模式而给地址模式伪造目标 Listing。

### DATA-CORE-020 价格与推荐分离

价格事实和调价推荐是两个独立输出。任一模式只要取得至少一个可验证、可归属且查询条件一致的公开价格，就记录 `priceResultStatus=COMPLETED` 并返回全部有效观察；单来源、竞品不足或市场信号不足只影响 `priceEvidenceStatus`、`recommendationStatus` 和 Confidence。只有没有任何有效价格，或身份、日期、币种、入住条件、价格口径无法确认时，价格结果才可为 `PARTIAL`、`INSUFFICIENT_DATA` 或其他阻断状态。

## 9. 当前统一生产验收边界

### DATA-CORE-021 全国数据后台门槛

当前阶段完成定义至少包括：全国调度可配置且默认安全；来源 capability、健康、熔断、重试和预算可观察；追加历史和 lineage 可查询；全部 Region 有真实 coverage 状态；Christchurch 及其他分散区域有代表性真实验收；证据生命周期可核验；失败不生成 fixture 或伪造结果；后台和 Worker 具备健康、readiness、告警和回滚证据。

### DATA-CORE-022 客户端同版本部署与入口门槛

客户端与后台必须在同一生产版本完成身份、真实 provider 路径、方案权益、Stripe、隐私与安全、浏览器门禁、容量、通知、支持和回滚验收。初期 `DEPLOYED_HIDDEN` 只隐藏首页、公共导航和 CTA；恢复入口只改变展示配置，但必须验证公开关键路径和回滚。
