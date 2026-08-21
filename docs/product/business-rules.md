# Tymra by Synix 业务规则

## 状态：Active — National Data Core Business Rules Baseline v1.4｜基线集合：Tymra National Data Core Baseline v1.3｜最后更新：2026-08-21

文档定位：本文件是 Tymra 当前开发版本的可执行业务契约，定义领域对象、状态机、自动发布、异常触发、数据采集、市场数据库、竞品、质量、风险、结果访问、接口、通知、审计和验收规则。Codex 必须按本文件实现，不得自行创造业务状态、默认值或生产降级行为。页面路由见《页面结构》，视觉组件见《视觉交互》，产品范围及技术默认值见《需求说明》。

## 基线控制

当前生效范围为 Tymra National Data Core Baseline v1.3 及同版本客户会员产品。《需求说明》高于《业务规则》，全国数据核心细则服从《data-core.md》，客户权益服从《membership-plans.md》，《业务规则》高于《页面结构》和《视觉交互》。本文件只定义可执行的领域对象、状态、阈值、默认值与接口契约，不定义页面构图、视觉尺寸或动效；下游文档必须引用 BR-\* 标识，不得复制或改写业务状态。章节标识 BR-\* 必须进入 docs/traceability.md。任何未明确的算法权重、相似度阈值和风险分数必须做成服务端配置，不得写死在前端，也不得在公开接口返回。

### 当前分析模式

系统支持两个并列的正式分析模式：

- `LISTING_PRICING` 必须验证受支持目标 OTA Listing，返回目标房源的所有有效公开价格。
- `LOCATION_BENCHMARK` 必须确认真实新西兰地址，但不要求目标 OTA Listing；系统返回符合查询条件的附近公开住宿价格，并始终标记为周边行情基准。
- 任一模式只要获得至少一个可验证、可归属且条件匹配的公开价格，价格结果即成功；证据不足只能限制推荐，不得隐藏或降级该价格。
- 地址基准不得把附近价格称为该地址的自有价格，也不得生成无目标价格证据的房源级调价结论。
- 同一物理 Property 的地址与 OTA 链接共用一个会员房源额度；更换地址写法、渠道或 URL 不产生新额度。

### 当前部署与展示规则

- 当前生产范围是新西兰全国数据核心、采集后台和完整客户会员产品；Christchurch 只是验收样本，不是地域边界。
- 客户登录、公开 Price Check、会员导航、方案价格、Stripe、账单和客户结果随同一生产版本部署，初期状态为 `DEPLOYED_HIDDEN`。
- 展示配置只隐藏首页、公共导航和营销 CTA；直接路由继续执行完整认证、资源归属、权益与支付检查。
- 全国数据对象、覆盖层、时间、质量、历史和 lineage 以《data-core.md》的 `DATA-CORE-*` 条款为当前权威来源。

# \[BR-GEN\] 一、系统原则

## 1.1 Automation First

• 支持范围内、数据完整且通过质量门槛的 Price Check 必须自动完成、自动发布和自动通知。  
• 人工审核不是正常步骤；正常任务不得进入 Exception Inbox。

## 1.2 Exception Driven

• 只有明确异常才进入人工队列，且一个 Exception Case 只对应一个主要决策。  
• 数据不足、未支持或来源暂时不可用优先自动返回明确状态，不默认转为人工调查。

## 1.3 Market Database First

• 每次有效采集必须写入 Tymra 市场数据库；历史 Observation 和已发布 Result Version 不得被新值覆盖。  
• 已确认的房源、房型、Listing 和竞品关系必须可在后续任务中复用。

## 1.4 Truth Before Coverage

• 不得生成虚假价格、虚假竞品、虚假市场信号、虚假收入损失或伪造进度。  
• 无可靠结论时返回 Partial、Insufficient、Unsupported 或 Source unavailable；“Retry later”仅作为 Source unavailable 的用户文案。

# \[BR-OBJ\] 二、规范化业务对象

## 2.1 Property

物理住宿地点或经营实体。最少包含：Property ID、标准名称、地址、经纬度、国家、城市、微市场、住宿类型、支持状态、创建时间、更新时间和合并状态。

## 2.2 Sellable Unit

可独立出售和定价的房型或住宿单位，是正式分析单位。最少包含：Unit ID、Property ID、标准房型名、官方房型名、容量、卧室数、床型、关键设施、单位类型、状态和版本。

## 2.3 Listing

Sellable Unit 在渠道上的具体页面。最少包含：Listing ID、Unit ID、Data Source ID、平台名、外部 ID、URL、平台房型名、首次发现时间、最后确认时间和在线状态。

## 2.4 Stay Query

一次可比较住宿查询。最少包含：入住日、退房日、晚数、成人数、儿童数、单位数、货币、取消条件类别和固定的新西兰时区 `Pacific/Auckland`。

## 2.5 Rate Observation

特定 Listing、Stay Query 和采集时间下观察到的价格、费用、限制及可售状态。必须包含来源、采集批次、原币种、基础价、强制费用、税费、总价、Effective Nightly Total、取消条件、最短入住、可售状态、采集时间和质量标记。

## 2.6 Competitor Relationship

目标 Unit 与候选 Unit 的版本化关系。角色只能为 CORE、REFERENCE 或 EXCLUDED，并保存生效时间、失效时间、原因代码、系统建议来源、人工修正和用户反馈。

## 2.7 Market Signal

具有区域、时间窗口、住宿类型范围和来源的市场证据。类别包括 PUBLIC\_HOLIDAY、ANNIVERSARY\_DAY、SCHOOL\_HOLIDAY、MAJOR\_EVENT、WEEKEND\_PATTERN、PRICE\_RISING、AVAILABILITY\_TIGHTENING、RESTRICTION\_INCREASING、WEATHER\_OR\_ACCESS\_DISRUPTION。

## 2.8 Price Check

从用户输入到结果或终止状态的一次任务。必须包含 Check ID、原始输入、语言、Property、Unit、Stay Query、市场、当前状态、创建时间、更新时间、数据快照版本、规则版本和结果版本。

## 2.9 Insight

一个入住日期的风险、证据、置信度、建议动作和限制。

## 2.10 Result Version

一次可发布结果的不可变版本。新分析或人工修正必须创建新版本；旧版本保留并可撤回。

## 2.11 Data Source

数据来源及其 Source Registry 运行状态。必须记录稳定 Source Key、来源主体、负责数据域、能力集合、获取方式、生命周期、启用状态、健康状态、计划频率、并发／预算边界、保存期限、负责人、最后检查时间和最后成功时间。来源存在于 Registry 不表示该来源已启用或健康。

## 2.12 Collection Run

一次 On-demand 或 Market Coverage 采集批次，包含 Job ID、来源、范围、开始时间、结束时间、状态、重试次数、成功数、失败数和错误摘要。

## 2.13 Exception Case

需要人工决定的单一异常，包含 Exception Type、严重度、关联对象、系统建议、证据、允许动作、创建时间、解决时间和审计记录。

## 2.14 Feedback 与 Audit Event

Feedback 保存用户对竞品、洞察和结果的反馈；Audit Event 保存所有状态变化、配置变化、人工修改、发布、撤回、删除和安全访问事件。

# \[BR-MKT\] 三、地域、语言与市场支持

## 3.1 地域

真实价格检查只支持新西兰房源。用户所在地不影响资格；资格由 Property 所在国家决定。默认货币 NZD，金额显示 NZ$；所有业务日期、入住日边界、额度窗口和展示统一使用 `Pacific/Auckland`，不跟随用户、服务器或 OTA 页面时区变化。

## 3.2 当前正式地域

新西兰全国为当前采集范围。系统不得用 Christchurch 或主要城市数据代替全国覆盖；Christchurch 仅作为首个真实验收市场。全部 Region 均可进入身份、市场信号、代表性面板和按需采集流程，质量按实际覆盖分级。

## 3.3 Market Status

市场状态只能为 SUPPORTED、PARTIAL\_COVERAGE、PILOT\_AVAILABLE、INSUFFICIENT\_MARKET\_DATA、SOURCE\_UNAVAILABLE 或 DISABLED。
• SUPPORTED：允许自动创建真实 Price Check。  
• PARTIAL\_COVERAGE：允许采集或查询，但必须显示覆盖缺口和质量限制。
• PILOT\_AVAILABLE：允许提交，但默认进入受控路径。  
• INSUFFICIENT\_MARKET\_DATA：市场已识别但不能生成可靠结果。  
• SOURCE\_UNAVAILABLE：区域有效，但当前所需来源不可用。
• DISABLED：因合规、故障或运营原因停止接受新任务。

## 3.4 双语

英文为默认语言，完整支持简体中文。语言切换只改变表达，不改变数据、状态、风险、置信度或建议。系统邮件和结果使用创建 Price Check 时保存的语言。

# \[BR-IN\] 四、输入、识别与确认

## 4.1 支持输入

Property name、New Zealand address、已启用 Data Source 的 Listing URL。允许中英文混合输入；专有名词保留官方形式。

已启用的身份来源完成地址解析后，系统必须保存来源返回的真实 city、Region、Territorial
Authority、RTO、经纬度和国家字段，不得写死 Christchurch。地址信号覆盖分为 `FULL`、
`REGIONAL` 和 `NATIONAL_ONLY`：非主要市场地址至少获得全国基线；区域可确认时使用独立
`nz-region-*` 键；区域不可确认时不得猜测最近城市。覆盖等级和缺失的本地来源必须显示在结果中。

地址身份缓存必须与正式 Property 分离：仅保存 HMAC 查询指纹、来源规范地址、有序候选、解析器
版本、命中次数和有效期，不保存原始查询。Web 和 Worker 共用 PostgreSQL 缓存，并使用 Redis 锁
避免并发回源。UNIQUE、MULTIPLE、NONE 默认分别缓存 7 天、24 小时和 1 小时；来源失败不得覆盖
有效结果。搜索和展示候选不得创建 Property 或 SellableUnit，只有用户明确确认或 Worker 已取得
唯一可信身份并实际开始分析时才能晋升为业务实体。

地址晋升为 Property 后，`LISTING_PRICING` 必须要求并验证受支持的公开 OTA 房源链接。
`LOCATION_BENCHMARK` 则以已确认地址作为空间锚点，通过只读 Argus Job 搜索附近公开 Listing，
无需把其中任何一个绑定成目标房源。Tymra 必须比较国家、城市/Region、地址文本、坐标和距离；
冲突或位置精度不足不得自动绑定。Listing 模式只有验证通过的目标 Listing 和来源明确返回的
Sellable Unit 才能进入目标费率采集；地址模式只返回可验证的附近公开价格。来源挑战或无匹配
价格时返回明确受限状态；价格组成不完整但来源明确公开了有效金额时保留原始价格口径，不得
使用 fixture、推算费用或把附近价格伪装成目标房源价格。

目标价成功后可以执行一次用户触发的有界竞品发现，最多保留 8 个竞品 Listing。Booking.com、
Airbnb、Expedia、Bookabach、Agoda 和 Trip.com 使用同一费率语义；其他 OTA 不属于当前合同、
发现、健康或验收范围。
同一真实 Property/Sellable Unit 的跨品牌报价可以保留为证据，但分析时只能计为一个竞品；
会员价、App 专享价或费用不完整的结果必须显式标记，不能混入公开匿名完整总价。

## 4.2 前端和服务端校验

• 去除首尾空格；长度 3–500 个字符。  
• URL 必须通过允许域名和格式配置校验。  
• 邮箱使用标准格式校验并规范化为小写。  
• 所有服务端写请求必须使用 Zod 等同等严格 Schema 校验；前端校验不能代替服务端校验。

## 4.3 Property Match

匹配结果只能为 UNIQUE、MULTIPLE、NONE 或 CONFLICT。  
• UNIQUE 且达到自动确认门槛时直接绑定。  
• MULTIPLE 时要求用户选择。  
• NONE 时提供补充地址、官方名称或支持 URL。  
• CONFLICT 时创建 PROPERTY\_MATCH Exception。

## 4.4 Sellable Unit Match

单一 Listing 或独立短租可自动确认 Unit；多房型酒店和 Motel 必须确认具体 Unit。无法确认时不得生成整家 Property 的统一价格判断。

## 4.5 默认 Stay Query

2 名成人、0 名儿童、1 个单位、默认 1 晚、`Pacific/Auckland`、NZD。匿名／一次性正式流程默认未来 30 天；登录会员的精确逐日价格范围为 Free 14、Host 30、Pro 90、Portfolio 180 天，长期监测范围分别为 30、90、180、365 天。若目标 Unit 或可比市场存在普遍最短住宿限制，使用可比较的共同住宿长度并记录原因。

# \[BR-ST\] 五、Price Check 状态机

## 5.1 Canonical Status

状态只能为 DRAFT、VALIDATING、NEEDS\_CONFIRMATION、QUEUED、COLLECTING、NORMALIZING、ANALYSING、AUTO\_VALIDATING、EXCEPTION、READY、PUBLISHED、PARTIAL、INSUFFICIENT\_DATA、UNSUPPORTED、SOURCE\_UNAVAILABLE、FAILED、CANCELLED、EXPIRED、WITHDRAWN 或 ARCHIVED。

## 5.2 主路径

DRAFT → VALIDATING → QUEUED → COLLECTING → NORMALIZING → ANALYSING → AUTO\_VALIDATING → READY → PUBLISHED。

## 5.3 确认路径

VALIDATING → NEEDS\_CONFIRMATION；用户确认后进入 QUEUED。未确认任务不得采集真实市场数据，除非采集仅用于候选识别且来源允许。

## 5.4 异常路径

任一自动处理状态可进入 EXCEPTION。Exception 解决后只能回到 VALIDATING、QUEUED、COLLECTING、NORMALIZING、ANALYSING、AUTO\_VALIDATING、READY、PARTIAL、INSUFFICIENT\_DATA、SOURCE\_UNAVAILABLE 或 FAILED。

## 5.5 终止与结果状态

• PARTIAL：仅部分日期可靠，必须标记可靠范围。  
• INSUFFICIENT\_DATA：无法形成可靠结论。  
• UNSUPPORTED：国家、市场、住宿类型或输入不支持。  
• SOURCE\_UNAVAILABLE：市场本身可支持，但当前没有已启用且运行健康的数据来源；页面提供稍后重试或通知入口。
• FAILED：不可恢复系统错误；业务数据不足不得使用 FAILED。  
• CANCELLED：用户或运营者在发布前取消。  
• EXPIRED：请求或一次性验证凭据已过期，结果版本本身仍保留。
• WITHDRAWN：已发布结果被撤回，所有关联访问令牌立即失效，历史版本和原因保留。  
• ARCHIVED：任务从活动视图移除但历史保留。

## 5.6 幂等

创建、确认、采集、发布、邮件和反馈操作必须具备幂等键。重复请求不得产生重复 Price Check、重复 Observation、重复 Result Version 或重复邮件。

# \[BR-SRC\] 六、数据采集与任务执行

## 6.1 采集模式

• ON\_DEMAND：用户提交后刷新目标 Unit、候选竞品和本次查询日期。  
• MARKET\_COVERAGE：按计划采集正式市场的已知 Property、Unit、核心竞品、周末、假期和重点日期。

## 6.2 Data Source Adapter

来源采用 capability-based 合同，只声明并实现自身真实支持的能力。能力集合包括但不限于 discoverListings、resolveListing、collectRates、collectAvailability、collectEvents、collectKeyDates、collectTransportSignals、collectWeatherSignals、importDataset 和 healthCheck；公共事件、大学日期或交通来源不需要伪造 OTA 的房源与房价方法。任务只有在所需 capability 已注册、来源已启用且运行健康时才能执行；缺少能力必须 fail closed。系统必须提供生产可用的 Manual Import Provider 和仅限开发测试的 Demo Provider。生产环境不得启用 Demo Provider；未配置所需来源时进入 SOURCE\_UNAVAILABLE。

## 6.3 重试

可重试错误默认执行 3 次，建议间隔 1 分钟、5 分钟和 30 分钟；具体间隔可配置。认证失败、输入无效和明确 4xx 不自动重试。

## 6.4 采集失败分类

RATE\_LIMIT、AUTH\_FAILURE、SOURCE\_UNAVAILABLE、PARSING\_ERROR、DATA\_CONFLICT、TIMEOUT、UNKNOWN。失败必须关联 Data Source、Collection Run 和 Check ID。

## 6.5 新鲜度

• 24 小时内：可称 recently checked。  
• 24–72 小时：必须展示采集时间，只能用于 Low confidence 或背景信息。  
• 超过 72 小时：不得用于精确价格判断，必须重新采集。  
• 无采集时间：不得用于结果。

# \[BR-PRICE\] 七、价格标准化与可售状态

## 7.1 Effective Nightly Total

Effective Nightly Total \= 相同入住条件下全部强制住宿费用与税费总和 ÷ 住宿晚数。

## 7.2 必须纳入

基础房价、清洁费、强制服务费、税费、平台强制费用、单位数、人数、晚数、最短入住、取消条件和货币。

## 7.3 不默认纳入

停车、早餐、宠物费、保险及可选服务，除非查询条件要求或该费用实际为强制。

## 7.4 费用完整度

COMPLETE、PARTIAL 或 UNKNOWN。UNKNOWN 不得产生精确价差；PARTIAL 必须降低置信度并展示限制。

## 7.5 Availability Status

AVAILABLE、SOLD\_OUT、CLOSED\_TO\_ARRIVAL、MINIMUM\_STAY\_RESTRICTION、LISTING\_UNAVAILABLE、DATA\_UNAVAILABLE、PLATFORM\_ERROR。没有价格不得自动解释为 SOLD\_OUT。

# \[BR-COMP\] 八、竞品关系

## 8.1 角色

CORE 参与主要基准；REFERENCE 仅提供市场背景；EXCLUDED 不参与当前和后续计算，除非创建新关系版本。

## 8.2 选择因素

微市场、住宿类型、容量、卧室和床型、房型、设施、位置、质量等级、取消政策、目标客群、最短入住和当前可售状态。

## 8.3 数量门槛

• 目标 8–20 个有效唯一 CORE 竞品。  
• 5 个为最低可靠基准。  
• 3–4 个只能输出 Low confidence 方向性结果。  
• 少于 3 个不得生成竞品区间、精确市场位置或调价建议，但任何已验证的目标价或地址周边观察价仍必须返回。

## 8.4 去重

同一 Unit 的跨平台 Listing 只能计为一个竞品。去重应结合地址、经纬度、名称、容量、卧室、床型、设施、图片或描述特征。具体权重为受限配置。

## 8.5 复用与更新

已确认关系优先复用。新数据、人工修正或用户反馈必须创建新关系版本，不直接覆盖历史。

# \[BR-CONF\] 九、数据质量与置信度

## 9.1 Blocking Quality Flags

价格事实阻断项为 TARGET\_RATE\_MISSING、UNIT\_UNCONFIRMED、SOURCE\_UNAVAILABLE、SEVERE\_CONFLICT、FRESHNESS\_EXPIRED 或查询身份／日期／币种／入住条件／价格口径无法确认。FEES\_UNKNOWN、COMPARABILITY\_FAILURE 和 COMPETITOR\_COUNT\_BELOW\_3 可以阻断精确比较或推荐，但不得隐藏一个已验证且可归属的公开价格。

## 9.2 High Confidence

至少 8 个有效唯一 CORE 竞品；目标和主要竞品数据在 24 小时内；主要强制费用完整；Unit 与 Stay Query 可比较；无 Blocking Flag 和重大冲突。

## 9.3 Medium Confidence

5–7 个有效竞品，或存在少量不影响主要方向的数据缺失；数据通常在 24 小时内。可自动发布，但必须使用保守措辞并展示限制。

## 9.4 Low Confidence

3–4 个竞品、部分费用不完整或数据年龄 24–72 小时。只允许方向性提示，不允许 High priority。

## 9.5 Insufficient

`priceResultStatus` 与 `recommendationStatus` 独立判断。少于 3 个竞品、费用不可比较或市场信号不足时，推荐为 `NOT_AVAILABLE` 或 `LIMITED_EVIDENCE`；目标价格缺失、Unit 未确认、所需来源不可用或严重身份／查询冲突时，价格结果才可为 `INSUFFICIENT_DATA` 或其他阻断状态。

# \[BR-RISK\] 十、市场信号、风险与建议

## 10.1 信号不是风险

单个 Holiday、Event 或 Weekend 只能作为证据，不能独立触发调价建议。

## 10.2 Reason Code

BELOW\_COMPARABLE\_RANGE、COMPARABLE\_PRICES\_RISING、AVAILABILITY\_TIGHTENING、MAJOR\_LOCAL\_EVENT、WEEKEND\_DEMAND\_SIGNAL、PRICE\_UNCHANGED\_WHILE\_MARKET\_MOVED。RESTRICTION\_INCREASING 可以作为 Market Signal，但不作为独立对外 Reason Code。

## 10.3 Risk Level

NO\_CLEAR\_RISK、WATCH、REVIEW、HIGH\_PRIORITY。对外不得显示内部精确评分和阈值。

## 10.4 High Priority

至少需要两个相互支持的证据类别、Medium 或 High confidence，并通过自动二次验证。二次验证仍冲突时进入 HIGH\_PRIORITY\_REVIEW Exception；验证通过且无其他异常时可自动发布。

## 10.5 Recommended Action

REVIEW\_RATE\_UPWARD、MONITOR\_DATE、NO\_CLEAR\_LOW\_PRICE\_RISK、INSUFFICIENT\_DATA\_TO\_ADVISE。当前版本不自动修改价格、不保证成交或收入增长、不提供无证据支持的具体涨价比例。

# \[BR-DEC\] 十一、自动发布决策

## 11.1 AUTO\_PUBLISH

价格事实和推荐分别发布。一个可验证、可归属且查询条件匹配的公开价格可以形成 `priceResultStatus=COMPLETED`，并保留来源、时间与价格口径。自动发布竞品区间或调价建议还必须同时满足：Market=SUPPORTED；Property 和 Unit 已确认；来源已启用且运行健康；Freshness 策略通过；CORE 竞品至少 5 个；费用 COMPLETE 或不影响结论的 PARTIAL；无推荐 Blocking Flag；无未解决 Exception；风险通过质量门槛；结果 Schema 完整。

## 11.2 AUTO\_PUBLISH\_WITH\_LIMITATIONS

Medium confidence 且无 Blocking Flag时允许自动发布，但必须展示限制、数据时间和保守建议，不得生成 High priority。

## 11.3 EXCEPTION

Property 或 Unit 冲突、异常价格、费用缺失但可能影响结果、竞品关系冲突、严重来源差异、High priority 二次验证失败、用户举报、发布前结果 Schema 冲突或来源故障可能通过人工快速解决。

## 11.4 AUTO\_RETURN

目标价缺失且重试失败、Unit 无法确认且用户未响应、价格身份或查询条件不可确认、或所需来源持续不可用时，价格路径自动返回 NEEDS\_CONFIRMATION、UNSUPPORTED、SOURCE\_UNAVAILABLE、PARTIAL 或 INSUFFICIENT\_DATA。仅竞品少于 3 个时仍返回已观察价格，并将 `recommendationStatus` 设为 NOT\_AVAILABLE；“Retry later”只作为 SOURCE\_UNAVAILABLE 的用户文案，不是独立状态。

# \[BR-EXC\] 十二、Exception Inbox

## 12.1 Exception Type

PROPERTY\_MATCH、UNIT\_MATCH、COMPETITOR\_RELATIONSHIP、FEE\_COMPLETENESS、RATE\_OUTLIER、SOURCE\_CONFLICT、SOURCE\_FAILURE、HIGH\_PRIORITY\_REVIEW、RESULT\_SCHEMA、USER\_REPORT。

## 12.2 优先级

P0 为数据泄露、错误公开结果或系统性来源污染；P1 为阻塞已接受用户任务；P2 为一般异常；P3 为低价值数据维护。

## 12.3 允许动作

ACCEPT\_SUGGESTION、SELECT\_PROPERTY、SELECT\_UNIT、EXCLUDE\_COMPETITOR、CHANGE\_COMPETITOR\_ROLE、EDIT\_NORMALIZED\_VALUE、RECOLLECT、REANALYSE、LOWER\_CONFIDENCE、MARK\_PARTIAL、MARK\_INSUFFICIENT、APPROVE\_AND\_PUBLISH、WITHDRAW\_RESULT。

## 12.4 单人效率

后台只显示异常；系统提供建议、差异、证据和结果预览。所有动作自动保存并写 Audit Event。稳定运行目标：人工介入率不高于 20%，单个异常处理中位时间不高于 5 分钟。

# \[BR-DATA\] 十三、市场数据库与历史

## 13.1 Append Only

Rate Observation、Collection Run、Result Version、Audit Event 和 Feedback 采用追加模式。修正使用新版本或补偿记录，不删除历史事实。

## 13.2 Identity Merge

重复 Property、Unit 或 Listing 可以合并，但必须保存 from ID、to ID、原因、时间和执行者；已发布结果继续引用原始版本。

真实地址、Property、Sellable Unit 和 OTA Listing 之间的映射必须版本化，保存匹配依据、置信度、首次发现、最后确认、冲突、拆分和合并历史。低置信度候选不得为了提高覆盖率而强制绑定；同一物理住宿的地址与多个 OTA 页面不得被重复计算为不同 Property。

## 13.3 原始数据

原始供应商响应按来源 TTL 短期保存，敏感字段在持久化前清除。规范化字段、聚合结果和来源链路按各自保留策略处理。

原始数据、标准化事实和分析衍生结果必须分层。短期原始 HTML、截图或网络响应按来源策略及 ACK 生命周期清理；Cookie、Session、Token 和个性化标识不得进入长期市场数据库。标准化事实、来源标识、内容哈希、质量状态和转换链路按数据类别的批准策略保留。Argus 正确 ACK 后可以立即 purge；客户历史权益不得延长原始浏览器证据保留。

## 13.4 时间、质量与来源链路

每条可用于分析的事实必须在适用时区分 `sourcePublishedAt`／`sourceEffectiveAt`、`collectedAt`、`businessDate`／`validFrom`／`validTo`、`ingestedAt` 和 `supersededAt`。机器时间戳以 UTC 保存，业务日期统一按 `Pacific/Auckland` 解释。无采集时间的数据不得用于正式结果；无明确业务适用日期的数据不得绑定到日期级结论。

Confidence 和 Freshness 必须独立保存和判断。Freshness 按数据域、预测跨度和使用目的执行版本化策略；OTA 价格、事件、道路警报和月度宏观数据不得共用一个固定阈值。Confidence 分为 identity、observation、snapshot 和 derived-result 层。数据存在不代表身份匹配可信，身份可信也不代表数据足够新。

每个 Price Check、MarketSnapshot、DateSnapshot、Insight 和 Result Version 必须能够反向追溯到所用标准化记录、Collection Run／Argus Job、Data Source、查询条件、采集时间、规则／模型／解析器版本、人工修改以及允许保留的证据或哈希。转换链使用可重放的 Transformation Run 和输入／输出 lineage edge 表达，不得只保存指向最新记录的外键。

Listing 的新增、下线、重新上线、名称、品牌、房型、政策、价格、可售和身份映射变化采用追加或版本化记录，不得只用最新值覆盖历史。

MarketSnapshot 必须保存分析模式。`LISTING_PRICING` 要求真实 `targetListingId`；`LOCATION_BENCHMARK` 要求稳定 Property／空间锚点并允许 `targetListingId=null`。Schema 不得为地址模式生成虚假目标 Listing。

## 13.5 市场覆盖指标

每个正式市场至少跟踪已知 Property 数、已知 Unit 数、过去 24/72 小时覆盖率、采集成功率、来源失败率、竞品覆盖率和最近健康时间。

# \[BR-RES\] 十四、结果、链接与通知

## 14.1 Result Content

Property、Unit、Stay Query、Generated at、Data last checked、Analysis version、Confidence、最多 5 个重点日期、所有有效观察价、`priceResultStatus`、`priceEvidenceStatus`、`recommendationStatus`、竞品中位价或区间（如证据足够）、Risk、Reason Codes、Market Signals、Recommended Action、限制和反馈入口。地址模式必须明确为周边行情，不得要求或伪造 `targetListingId`。

## 14.2 Result Version

发布后不可原地修改。重新分析或人工修正创建新版本；旧版本标记 SUPERSEDED 或 WITHDRAWN。

## 14.3 Authenticated Result Access

正式结果只通过已认证客户会话和服务端资源归属检查访问。一次性验证 token 至少使用 256-bit 随机值，数据库只保存 hash，默认 15 分钟有效、单次消费并在成功后从 URL 移除。系统不提供持久 bearer 结果链接；未认证、跨账户或无效访问不得泄露房源摘要。

## 14.4 Email

系统邮件正常流程使用 VERIFY\_AND\_SIGN\_IN，并在认证页面未于宽限期内完成在页交付时有条件发送 RESULT\_READY、PARTIAL\_RESULT、INSUFFICIENT\_DATA 或 CHECK\_FAILED。营销同意与服务邮件分离。

# \[BR-API\] 十五、接口契约

## 15.1 通用响应

成功返回 {data, meta?}；错误返回 {error:{code,message,fieldErrors?,referenceId}}。HTTP 状态使用 200/201、400、401、403、404、409、422、429、500、503。

## 15.2 Public API

• POST /api/v1/rough-checks：targetMode、input、locale、idempotencyKey；创建匿名低成本粗略任务，不启动正式 provider pipeline。
• GET /api/v1/rough-checks/{checkId}：使用不可猜测 accessKey 返回目标模式、真实粗略证据、限制和解锁状态。
• POST /api/v1/rough-checks/{checkId}/unlock：email、serviceConsent、marketingConsent?；发送一次性 `VERIFY_AND_SIGN_IN`，不在验证前启动正式任务。
• POST /api/v1/property-search：input、locale、targetMode；返回候选 Property／空间锚点、支持状态和地址范围扩大信息。
• POST /api/v1/price-checks：已验证客户会话、roughCheckId、propertyId?、unitId?、stayQuery；返回 checkId、status 和 nextAction。
• GET /api/v1/price-checks/{checkId}：仅返回正式任务状态和下一动作；正式结果内容仍要求所属客户会话。
• POST /api/v1/price-checks/{checkId}/confirm-property：propertyId。  
• POST /api/v1/price-checks/{checkId}/confirm-unit：unitId。  
• POST /api/v1/price-checks/{checkId}/confirm-query：Stay Query。  
• GET /api/v1/customer/checks/{checkId}：返回所属客户的 Result Version。
• POST /api/v1/customer/checks/{checkId}/acknowledge：记录已认证页面已完成结果交付。
• POST /api/v1/customer/checks/{checkId}/feedback：feedbackType、insightId?、date?、comment?。
• POST /api/v1/customer/auth/register、/verify-email、/password 及 customer session endpoints：执行独立会员注册、邮箱验证、密码登录和会话生命周期。
• Customer membership、pricing-units、calendar、exports、API checks、settings 及 Stripe Checkout／Portal／Webhook endpoints：执行服务器端方案权益、归属、幂等和支付状态检查。
• POST /api/v1/waitlist：email、locale、country、market?、input?、marketingConsent。

## 15.3 Admin API

• GET /api/v1/admin/exceptions；GET /api/v1/admin/exceptions/{id}；POST /api/v1/admin/exceptions/{id}/resolve。  
• GET /api/v1/admin/price-checks；GET /api/v1/admin/price-checks/{id}；POST /api/v1/admin/price-checks/{id}/recollect；POST /api/v1/admin/price-checks/{id}/reanalyze；POST /api/v1/admin/price-checks/{id}/publish；POST /api/v1/admin/price-checks/{id}/withdraw。  
• GET/POST /api/v1/admin/market-coverage；GET /api/v1/admin/data-sources；POST /api/v1/admin/collection-runs；GET /api/v1/admin/audit。

## 15.4 Access

匿名粗略任务状态可以使用 checkId 加不可猜测 accessKey；正式结果使用客户会话并校验资源归属；Admin API 必须经过管理员身份验证和最小权限检查。

# \[BR-FB\] 十六、反馈与学习闭环

## 16.1 Feedback Type

COMPETITORS\_RELEVANT、COMPETITORS\_NOT\_RELEVANT、INSIGHT\_USEFUL、REVIEWED\_PRICE、CHANGED\_PRICE、NO\_ACTION\_NEEDED、REPORT\_ISSUE。

## 16.2 影响规则

Property 或 Unit 确认提升后续匹配先验；竞品排除创建关系版本；重复来源错误降低来源健康；用户举报触发 USER\_REPORT Exception。反馈不得直接修改已发布历史结果。

## 16.3 自动学习边界

当前版本可以基于规则和历史确认复用关系，不得在无评估和版本控制的情况下自动训练或部署不可解释模型。

# \[BR-LIMIT\] 十七、免费额度与防滥用

• 同一 Sellable Unit 30 天内默认一次完整免费检查；重复请求优先复用仍满足新鲜度的结果，否则创建刷新任务。  
• 同一邮箱同时最多一个未完成免费任务。  
• 系统按邮箱、Unit、IP、设备和 accessKey 执行可配置限流。  
• 批量请求、参数探测、异常频率和自动化访问进入安全日志；具体阈值为内部配置。

# \[BR-PRIV\] 十八、隐私、保留与删除

• 服务邮件只用于请求交付；营销必须单独同意且默认未勾选。  
• 原始匿名查询与安全日志默认保留 30 天，除非法律、安全或来源协议要求不同。  
• 账户或联系信息删除请求必须删除或去标识个人数据，同时保留依法或为审计必须保存的非个人历史。  
• 数据来源保存期限优先于内部默认期限。  
• 备份按《需求说明》第十七章和仓库上线运行手册定义的周期清理；删除应覆盖生产和后续备份轮换。

# \[BR-SEC\] 十九、安全、审计与商业秘密

• 核心匹配、标准化、竞品选择、风险和发布规则只在服务端运行。  
• 前端只接收 Risk Level、Confidence、Reason Codes、Recommended Action 和必要展示数据。  
• API 不返回内部精确分数、权重、阈值、原始特征或供应商密钥。  
• 所有管理员动作、配置变化、人工覆盖、发布、撤回、删除和安全访问写入不可篡改式 Audit Event。  
• 生产与测试隔离，测试环境不得使用未脱敏生产数据。

# \[BR-EVT\] 二十、分析事件

公开事件：homepage\_viewed、language\_changed、search\_focused、input\_started、property\_search\_submitted、property\_candidate\_selected、unit\_selected、stay\_query\_confirmed、price\_check\_created、confirmation\_required、check\_status\_viewed、result\_viewed、insight\_expanded、feedback\_submitted、waitlist\_submitted。  
运营事件：exception\_created、exception\_resolved、collection\_started、collection\_failed、analysis\_completed、auto\_publish\_succeeded、auto\_publish\_blocked、result\_published、result\_withdrawn、source\_health\_changed、market\_coverage\_changed。  
事件不得默认记录完整地址、完整 URL、邮箱或安全 token；个人和敏感字段必须去除或散列。

# \[BR-AT\] 二十一、业务验收场景

BR-AT-001 唯一房源、明确 Unit、8 个新鲜竞品、费用完整：自动发布，无 Exception。  
BR-AT-002 多候选 Property：进入 NEEDS\_CONFIRMATION，用户确认后继续。  
BR-AT-003 5 个新鲜竞品、轻微费用缺失但不影响方向：Medium confidence 自动发布并显示限制。  
BR-AT-004 3 个竞品：Low confidence 方向性结果，不得 High priority。  
BR-AT-005 少于 3 个竞品但存在一个有效价格：价格结果成功返回，Recommendation=NOT\_AVAILABLE，不进入人工队列。
BR-AT-006 High priority 有两个证据且二次验证通过：可自动发布；验证冲突：进入 Exception。  
BR-AT-007 数据源连续失败：自动重试；失败后进入 SOURCE\_UNAVAILABLE 或 INSUFFICIENT\_DATA，不生成模拟结果。  
BR-AT-008 发布后人工修正：创建新 Result Version，旧版本保留并标记 superseded。  
BR-AT-009 未认证或跨账户访问正式结果：不泄露摘要；验证 token 过期后可重新发起验证。
BR-AT-010 用户举报竞品：创建 USER\_REPORT Exception，并版本化竞品关系。

# \[BR-IMPL\] 二十二、实现约束与未决依赖

• 所有枚举、Schema 和事件名必须在共享 domain package 中定义，前端、API、Worker 和测试共用。  
• Demo、fixture 和 mock 仅允许开发与测试；生产构建必须在检测到 Demo 数据源时失败或拒绝自动发布。  
• 运行全国采集任务前必须至少配置一个具有所需 capability、已启用且健康的来源；不得使用不相关来源或 Demo 数据填补能力缺口。
• 本文明确的数值门槛可以配置，但默认值必须与本文一致；算法细节和内部风险阈值保存在受限配置。  
