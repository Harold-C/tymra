# Tymra 核心数据采集与价格分析系统设计

## 新西兰全国住宿市场情报、实时采集与价格决策核心方案

文档状态：Active — Tymra Core Strategy Baseline v1.0｜Owner / 最终批准人：Harold｜最后更新：2026 年 7 月 17 日

# 执行摘要

Tymra 的核心价值不是临时生成一份看起来合理的价格报告，而是先建立并持续运行覆盖新西兰全国的住宿市场数据采集机制，长期积累房源、Sellable Unit、OTA Listing、公开报价、可售变化、市场事件和异常信号。在用户提交房源名称、地址或链接后，系统必须最终解析并确认一个有效 OTA Listing，才能进行价格比对和正式分析。  
产品采用“三层访问体验”：匿名用户可以看到有限、真实且明确标注为 Preliminary 的市场预览；用户选择查看具体结果时必须提供邮箱，系统完成正式刷新后将只读安全结果链接发送到该邮箱；用户需要更多结果、历史、重新分析、竞品管理、全国深度数据或持续监控时，必须注册正式账户。  
数据层采用“全国长期底座 \+ 全国事件与异常触发 \+ 用户房源局部实时深挖”的组合。全国市场必须从第一阶段即可查看；公开产品上线前，数据采集、重试、来源健康、追加历史和全国覆盖状态必须已经持续运行。全国房源目录应尽量接近全量，全国价格矩阵采用分层代表性面板而不追求所有组合全量采集。  
技术层采用“数据新鲜度感知的缓存命中 \+ 全国持续采集 \+ 按需实时刷新 \+ 不可变历史存储”。正式报告必须固化一个时间一致、证据可追踪的 MarketSnapshot，并同时保留日期级 DateSnapshot、竞品集合版本、来源运行状态和分析版本；不同查询条件、不同 Sellable Unit 或相差过大的采集时间不得直接混合。
在没有经营者实际订单、入住率、剩余库存和成交 ADR 的阶段，Tymra 的输出统一定义为 Market Reference Range、Review Range、目标价格位置、低价风险和需求压力判断，不宣称已经计算出收益最优价格。只有在用户自愿接入 PMS、Channel Manager 或提供经营结果后，才能进一步评估房源级收益效果。

# 1\. 文档目的与边界

* 记录 Tymra 的长期战略、全国数据壁垒、目标架构和已经确认的不可违反原则，避免产品、数据和工程团队采用不同口径。  
* 定义新西兰全国 Property、Sellable Unit、OTA Listing、代表性价格面板、Event Graph、天气、交通和异常信号的长期数据体系。  
* 定义从任意用户输入到有效 OTA Listing、匿名真实预览、邮箱只读结果、注册升级、缓存命中、按需刷新和正式分析的统一流程。  
* 定义 Market Reference／Review Range、Blocking Quality Gates、报告级与日期级置信度、证据、防滥用、来源运行和失败降级原则。
* 为 Data Source Adapter、Worker、数据模型、全国调度、Pricing Intelligence Engine、Market Explorer 和用户结果提供统一战略依据。

本文件是 Tymra 的长期战略与目标架构文件，负责产品使命、全国数据壁垒、目标能力和不可违反原则。当前 Release 的具体产品范围与对外承诺由《需求说明》控制；领域对象、状态、阈值和默认值由《业务规则》控制；路由和用户流程由《页面结构》控制；视觉实现由《视觉交互》控制。技术工具、数据库迁移、接口和部署方式进入技术方案或 ADR；算法权重、内部阈值和特征组合进入受限决策文档。发生冲突时按决策领域服从对应权威文件。

# 2\. 已确认的产品决策

## 2.1 用户输入

* 用户可以输入 Property name、新西兰地址或已支持的 OTA Listing URL。  
* 无论用户最初输入什么，正式分析前必须最终解析、匹配并确认至少一个有效 OTA Listing URL，并绑定到具体 Property 和 Sellable Unit。  
* Property name 和自然地址只作为发现入口，可以用于搜索候选房源、纠正地址和建立身份关系，不能单独作为价格分析的数据锚点。  
* 存在多个 Property、Sellable Unit 或 Listing 候选时必须要求用户确认；无法自动确认时进入 NEEDS\_CONFIRMATION，并允许用户补充 OTA 链接。  
* 最终无法绑定有效 OTA Listing 时不得生成正式价格分析；系统必须对不支持、失效、重定向异常、非房源 URL 和无可用 Listing 的情况给出明确反馈。

## 2.2 默认查询与 Sellable Unit 确认

* 匿名首次体验不要求用户选择日期、入住人数或房型，以减少首次使用摩擦。  
* 统一默认 Stay Query 为 2 名成人、0 名儿童、1 个住宿单位、1 晚、NZD 和房源当地时区；页面中的明确查询条件可以作为候选条件保存，但必须标准化后使用。  
* Release 1 的用户正式检查覆盖未来 30 天，并最多输出 5 个重点日期；用户不需要逐日选择日期。  
* 全国内部市场面板使用 D+7、D+14、D+30、D+60、D+90，并补充最近工作日、周末、公众假期、学校假期和批准活动日期；该远期篮子与用户 30 天报告范围分开管理。  
* 独立短租或只有一个明确 Sellable Unit 时可以自动确认；酒店、Motel 和其他多房型 Property 必须在正式分析前确认具体 Sellable Unit，不得使用页面默认房型代替确认。  
* 目标 Unit 与竞品必须使用相同入住条件；若普遍存在最短住宿限制，使用可比较的共同晚数并保存原因。

## 2.3 三层访问体验

1. 用户输入 Property name、新西兰地址或已支持的 OTA Listing URL。  
2. 系统识别 Property、Sellable Unit、市场和候选 Listing，并最终确认一个有效 OTA Listing。  
3. 系统通过新鲜缓存、全国市场面板和少量实时目标查询生成匿名预览；进度交互必须映射真实处理状态，不能用动画掩盖数据缺失。  
4. 匿名用户最多看到已识别的 Property 与 Sellable Unit、允许展示且费用口径可确认的目标公开价格、取整后的宽幅市场参考区间、低于／接近／高于市场的位置、最多两个初步重点日期或市场信号、数据时间、置信度和 Preliminary 标识。  
5. 用户选择查看具体结果时，必须填写邮箱并接受结果交付所需的服务通知说明；营销同意保持独立且默认未选。  
6. 系统创建 Analysis Request，保存邮箱、语言、Listing、Property、Sellable Unit、Query Plan、同意记录和访问审计，并启动正式数据刷新。  
7. 分析完成后，系统将安全结果链接发送到该邮箱；链接验证邮箱并授权查看当前报告，但不自动把用户升级为拥有全部功能的正式注册账户。  
8. 邮箱验证用户可查看一个 Sellable Unit、未来 30 天、最多 5 个重点日期的有限只读正式报告，包括聚合市场参考区间、风险、原因、置信度、建议动作、限制和基础反馈。  
9. 任何更多结果或操作，包括完整日期详情、历史、重新分析、竞品管理、全国深度数据、多房源、导出、持续监控和 PMS 连接，都必须注册正式账户；会员账户采用邮箱和密码登录，Magic Link 仅用于 Price Check 验证。

## 2.4 邮件策略

* 正常成功路径只发送一封 RESULT\_READY 事务邮件，其中包含当前报告的安全结果链接。  
* 只有用户必须确认 Property 或 Sellable Unit、结果为 Partial／Insufficient、链接重新签发，或任务出现不可恢复失败时，才发送额外必要事务邮件。  
* 结果链接承担邮箱验证和打开当前报告两个作用；注册账户是用户请求更多结果或操作时发生的独立升级，不发送重复的注册成功、验证成功、登录成功和报告完成邮件。  
* 相同 analysis\_id、recipient 和 template\_version 必须使用幂等键，防止重试、队列重复消费或多服务监听导致重复邮件。  
* 系统异常和 Worker 失败优先进入内部告警；只有用户需要采取动作或任务进入明确终止状态时才发送通知。  
* 营销、教育和生命周期邮件必须与结果交付事务邮件分离，并取得明确、可撤回的订阅同意。

# 3\. 核心业务能力定义

Tymra Worker 的目标是在首期不依赖单一官方 OTA API、且不要求经营者先连接经营系统的情况下，结合主流 OTA 适配器、公共数据和用户提供的信息开展全国市场研究。它必须确认 OTA Listing、Property 和 Sellable Unit，建立合理竞品组，查询标准化入住条件下的公开报价，识别全国及局部需求驱动因素，判断数据质量，然后给出可解释的市场参考和行动建议。
Worker 不是简单网页抓取器，也不是让大模型自由浏览后直接输出价格。它必须由确定性的任务协议、来源适配器、证据记录、标准化数据模型、质量门和分析引擎组成。AI 可以辅助发现页面结构变化、事件分类和文本归纳，但价格、税费、日期、房型和可售状态必须经过结构化校验。  
Tymra 的长期壁垒来自持续累积的历史市场观测、事件影响结果、来源质量评分、房源身份图谱和预测回测，而不是一次查询时使用了哪个浏览器自动化工具。

# 4\. 数据战略总原则

* 全国房源与 Listing 目录、全国代表性价格面板、全国事件和异常信号采集机制必须在公开产品上线前开始运行；全国市场从第一阶段即可查看，但全国价格矩阵不追求所有房源和日期组合全量采集。  
* 任何价格都必须绑定 OTA Listing、Sellable Unit、完整 Stay Query、Collection Profile、采集时间、来源和证据。
* 公开 OTA 报价是挂牌报价，不是实际成交 ADR。  
* 公开页面显示不可售不等于已经入住，也可能是关房、最少入住限制、渠道库存未开放或技术错误。  
* 历史观测采用只追加方式保存，不覆盖旧记录。  
* 匿名预览可以使用新鲜缓存、全国面板和有限实时查询，但仍不得展示无法验证的数值；邮箱正式结果必须通过更严格的新鲜度、覆盖率、可比性、来源可用性和时间一致性质量门。
* 任何来源失败时都不得用随机数据或伪造结果补齐。  
* 采集能力与数据使用权是两件事。技术上能够访问不等于允许用于商业生产。  
* 全国市场必须显示 Supported、Partial Coverage、Pilot、Insufficient Data 或 Source Unavailable；来源、证据、竞品集合、模型版本、覆盖状态和置信度必须能够在报告与内部审计中追溯。

# 5\. 新西兰全国住宿市场数据底座

## 5.1 Property、Sellable Unit 与 Listing 身份图谱

* Property、Sellable Unit 和 Listing 必须分开建模：Property 表示物理住宿地点或经营实体，Sellable Unit 表示可独立出售和定价的单位，Listing 表示该 Unit 在具体 OTA 或来源中的页面。  
* 建立稳定的 property\_id、sellable\_unit\_id 和 listing\_id，并将不同 OTA、官方网站和其他来源中的同一 Property 或 Sellable Unit 归并；跨平台同一 Unit 不得在竞品分布中重复计数。  
* 保存标准地址、经纬度、Region、RTO、Territorial Authority、邮编、微市场、邻里、主要交通节点和权威地理映射；地址标准化优先使用 LINZ 等权威数据。  
* Sellable Unit 保存标准与官方房型名、住宿类型、品牌、星级、容量、卧室、床型、浴室、独立或共享空间、设施、无障碍属性、状态和版本。  
* Listing 保存平台、外部 ID、OTA URL、平台房型名、首次发现时间、最后确认时间、在线状态、与 Unit 的匹配置信度及身份合并历史。

## 5.2 公开报价与可售状态

* 在来源允许、技术可行和成本合理的范围内，尽量完整采集基础价格、强制税费、服务费、清洁费、含税总价、原始币种、汇率和统一的每晚 NZD 有效总价。  
* 记录入住与退房日期、晚数、成人、儿童年龄、单位数、Sellable Unit、平台房型、床型、容量和完整 Stay Query。  
* 记录早餐、停车、取消政策、预付条件、会员价、移动端价、登录状态、公共价上下文、最低入住和其他 rate fence。  
* 记录 AVAILABLE、SOLD\_OUT、CLOSED\_TO\_ARRIVAL、MINIMUM\_STAY\_RESTRICTION、LISTING\_UNAVAILABLE、DATA\_UNAVAILABLE、PLATFORM\_ERROR、被阻止和条件不满足等不同状态，不合并为单一布尔值。  
* 保存采集 IP 或区域、界面语言、展示货币、设备类型、登录／会员状态和其他 Collection Profile 字段，以避免把不同公开价格上下文混合。  
* 保存采集时间、来源更新时间、页面 URL、查询参数、字段级证据、内容哈希、采集器与解析器版本和质量标记；原始 HTML、网络响应和截图默认仅保存 72 小时，解析故障或审计需要时最多延长至 7 天。

## 5.3 市场供给变化

* 持续识别新增 Property、Sellable Unit 与 Listing、下线、重新上线、品牌变化、房型变化和跨平台身份合并。  
* 按全国、Region、Territorial Authority、微市场、住宿类型、价格档位和评分档位统计已知、活跃、已观测和公开可售 Unit。  
* AvailabilityCompression 必须基于固定或版本化竞品 cohort，分别记录 Eligible Cohort、Available、Restricted、Unavailable、Data Missing 和 Source Failure，不能把采集失败解释为市场售罄。  
* 跟踪新酒店、扩建和重大改造的长期供给信号。Stats NZ 的酒店类建筑许可可作为区域供给管线参考，但不能等同于确定新增客房数。

## 5.4 全国代表性价格面板

全国每日采集不遍历每个房源未来 365 天的所有组合。初始全国代表性面板设置为 1,000–1,500 个唯一 Sellable Unit，约 80% 为长期稳定的 Anchor Panel，20% 为 Rotating Discovery Panel，并按地区、住宿类型、质量档位和价格档位分层。

* 覆盖所有新西兰 Region、主要 Territorial Authority、主要城市、旅游目的地和较小区域市场，避免数据只集中在 Auckland、Wellington、Christchurch 和 Queenstown。  
* 每个市场按经济型、中端、高端、酒店、Motel、Serviced Apartment、短租和其他主要类别设置最低样本，并记录样本权重、替换和覆盖偏差。  
* 固定日期篮子包含 D+7、D+14、D+30、D+60、D+90，以及最近工作日、周末、公众假期、学校假期和批准活动窗口。  
* 全国 Market Explorer 必须显示各市场的价格区间、公开可售变化、事件与异常信号、覆盖率、新鲜度和 Supported／Partial Coverage／Pilot／Insufficient Data／Source Unavailable 状态；采集频率按波动、成本和数据价值动态调整。

# 6\. 事件与需求影响数据

## 6.1 事件目录不是最终目标

Event Graph 是全国核心基础设施。系统不仅记录活动目录，还要以场地、微市场、影响半径、住宿类型和时间窗口为粒度，将事件转化为可回测的 EventImpact。

* 事件名称、类别、主办方、精确场地、地址、经纬度、Region、Territorial Authority、微市场、影响半径和住宿类型相关性。  
* 开始、结束、持续时间、取消、延期和场地变更状态。  
* 场馆容量、预计或实际到场人数、票价、售票进度、售罄状态和活动规模。  
* 本地、跨地区和国际观众的可能构成，以及住宿需求转化概率。  
* 房源与场地的直线距离、公共交通时间、驾车时间和道路可达性。  
* 记录与其他活动、周末、长周末、学校假期、大学活动、邮轮靠港或交通异常的重叠关系。  
* 保存历史同类活动的价格变化、AvailabilityCompression、影响范围、EventImpact Outcome、来源版本、去重 ID、最后更新时间和信息置信度。

## 6.2 事件来源组合

* Eventfinda、Ticketmaster 和其他已配置结构化来源用于建立全国活动与场地基础数据。
* 全国地方政府、场馆、会展中心、大学、体育组织、Council、RTO、旅游机构、机场、港口和邮轮日历用于补充区域与细粒度覆盖。  
* 多个来源必须按名称、时间、场地、主办方和外部 ID 去重，保存来源版本、冲突记录和事件合并历史。  
* 普通全国事件目录每日更新；距活动 30 天内每 6–12 小时、距活动 7 天内或接近售罄时每 1–3 小时更新；延期、取消或场地变化立即触发受影响市场刷新。

## 6.3 确定性日历

* 全国公众假期、实际日期与补休日。  
* 地区纪念日和长周末。  
* 学校学期和假期。  
* 大学开学、考试、毕业和大型校园活动。  
* 传统季节性、滑雪季、葡萄酒季、节庆季和夏季旅游窗口。

# 7\. 其他值得长期采集的数据

## 7.1 旅客流入与旅游需求

* Stats NZ 国际访客到达和离境数据，用于全国及来源市场趋势。  
* MBIE Monthly Regional Tourism Estimates，用于地区旅游消费趋势。  
* MBIE Tourism Volumes and Flows 与 International Visitor Survey，用于了解访客路线、停留和住宿使用。  
* 主要机场月度旅客量、国内与国际比例、航线增长和取消趋势。  
* 邮轮靠港日期、停靠时长、船舶和港口，用于提前建立具体日期信号。

机场和官方旅游统计通常是滞后趋势数据；邮轮计划、活动和未来公开报价更适合作为具体入住日期的领先信号。两类数据不能混为同一时间粒度。

## 7.2 天气、交通与突发异常

* 全国持续采集 MetService 天气预测、强天气预警和短期变化，并绑定精确经纬度、Forecast Area、受影响 Region、Territorial Authority 和微市场。  
* 全国采集 NZTA 道路事故、施工、延误和关闭，并绑定具体 Route Segment、影响方向、开始与结束时间、严重程度和绕行成本。  
* 采集航班、渡轮、港口和区域交通取消或大面积延误，并绑定 Airport、Port、Ferry Terminal、受影响航线、持续时间和潜在旅客滞留规模。  
* 采集 GeoNet 地震、火山状态和其他自然事件，保存影响区域、严重程度、可达性、疏散或旅客滞留可能性以及信号有效期。  
* 采集目的地特有信号，例如滑雪场开放、步道关闭、重大基础设施施工或景区临时关闭，并绑定具体目的地、影响半径、开始与结束时间和相关住宿类型。

天气、交通和突发异常提升为主要支持性市场信号。每条信号至少保存 accessibility\_effect、demand\_displacement\_effect、stranded\_traveller\_effect、方向、持续时间、影响区域和置信度；证据不足时输出 Mixed 或 Unknown。全国基础更新每 30–60 分钟，严重天气、道路关闭或大范围交通异常每 15–30 分钟；该类信号可以支持 High Priority，但不能在没有价格、可售或其他独立证据时单独触发调价建议。

## 7.3 房源声誉与支付意愿

* 评分、评论总数、近期评论增长速度和各平台评分差异。  
* 清洁、位置、服务、噪音、停车、早餐、景观等主题趋势。  
* 近期翻新、设施新增、品牌变更和图片内容变化。

声誉数据用于决定竞品是否真正可比以及目标房源能够承受的价格位置。它不能简单转化成“评分高 0.1 就涨价多少”的固定公式。

## 7.4 长周期宏观与供给数据

* 酒店和其他住宿建筑许可，作为未来供给压力参考。  
* NZD 汇率，特别是主要国际客源市场货币。  
* 地区旅游消费、国际访客消费和住宿使用趋势。  
* 搜索兴趣等实验性领先指标，只能作为低权重辅助信号。

宏观数据适合月度或季度模型，不应直接覆盖具体日期的实时市场报价。

## 7.5 自有预测与结果回测

* 保存每次分析的输入数据快照、竞品集合版本、模型与规则版本、Market Reference／Review Range、日期级风险和置信度。  
* 在目标入住日临近或结束后重新观测公开市场价格和可售状态。  
* 衡量日期级风险方向、Market Reference／Review Range 覆盖率、事件与异常影响估计、AvailabilityCompression 和置信度校准是否正确。  
* 报告打开率、注册升级和站内行为只能衡量产品使用，不能证明市场结论正确，也不能证明用户已经获得收益提升。  
* 用户自愿接入经营数据后，才可评估实际成交 ADR、入住率、RevPAR 和建议带来的收益变化。

# 8\. 建议采集层级与频率

## 8.1 三层采集结构

1. 全国底座：持续运行的 Property／Sellable Unit／Listing 目录、Anchor 与 Rotating 价格面板、固定未来日期篮子、全国 Market Explorer、官方市场基准和来源健康监控。  
2. 全国触发层：公众假期、学校假期、活动、航班、邮轮、天气、道路、自然灾害和异常信号按影响区域触发更高频率价格与可售采集。  
3. 用户房源层：用户提交并确认 OTA Listing 后，对目标 Sellable Unit、版本化局部竞品组、相关日期和全国信号进行高密度实时刷新。

## 8.2 初始频率建议

* 房源目录、设施和身份关系：每周更新，变更活跃来源可提高频率。  
* 全国 Anchor Panel：每日；Rotating Discovery Panel 按覆盖缺口和身份变化计划轮换。  
* 未来 7 天、重大活动和高波动市场的价格与可售状态：每 3–6 小时；用户正式请求或信号突变时立即按需刷新。  
* 普通未来价格：每 6 至 12 小时。  
* 全国事件目录：每日；距事件 30 天内每 6–12 小时；距事件 7 天内、接近售罄、延期、取消或场地变化时每 1–3 小时或立即触发刷新。  
* 全国天气、道路和突发异常：基础更新每 30–60 分钟；严重预警、道路关闭或大范围交通中断每 15–30 分钟。  
* MBIE、Stats NZ、机场和宏观数据：按官方月度或季度发布时间更新。

以上频率是启动策略，不是永久常量。系统应根据来源限制、查询成本、历史波动、用户价值和数据陈旧损失动态调节。

# 9\. 技术原则与可复用项目评估（非绑定）

目前没有发现一个成熟开源项目能够直接完成“OTA 房源识别、全国市场实时采集、事件影响、收益分析和用户报告”的完整链路。最可行的是组合成熟的爬虫基础设施、现有内部 Worker 经验和 Tymra 自己的数据模型。

## 9.1 推荐组合

* 开发环境必须实现统一 Data Source Adapter 层。当前 active OTA 固定为 Booking.com、Airbnb、Expedia、Bookabach、Agoda 和 Trip.com；Wotif、Hotels.com、Vrbo 仅保留禁用的合同兼容，Google Hotels 不进入执行范围。浏览器执行由独立 Argus 服务负责，具体边界由技术 ADR 管理。
* 每个 OTA 适配器至少实现 identifyProperty、resolveListing、listUnits、fetchRates、fetchAvailability、fetchPolicies 和 healthCheck，并统一使用幂等、证据、并发限制、来源熔断和配置化任务协议。
* 开发环境同时必须支持 LINZ、MBIE、Stats NZ、公众假期、学校假期、Eventfinda、Ticketmaster、场馆与 Council 日历、MetService、NZTA、GeoNet、机场、港口、邮轮、汇率和其他已配置公共来源的适配器。Stagehand 仅可辅助页面探索和结构变化检测，不直接决定正式数值。
* Ulixee Hero：保留为现有 Synix 浏览器执行参考；考虑其版本成熟度，不建议作为 Tymra 新系统的唯一基础。  
* Apify Booking、Google Hotels 和事件 Actor：用于早期 POC、字段对照和结果基准，不作为长期核心数据渠道。  
* Browserless：只有在明确需要远程浏览器集群并接受其许可证和商业成本时再评估。

## 9.2 不建议直接复用

* 单文件 Selenium/Tkinter 酒店抓取脚本通常缺少任务队列、证据、重试、数据模型和生产维护能力。  
* 模拟酒店动态定价或强化学习项目使用合成环境，不能替代新西兰真实市场数据。  
* 依赖大模型自由阅读页面并直接输出价格会产生不可重复、难审计和数值错误风险。  
* 市场上存在某个 scraper 或 Actor 不代表 Tymra 自动获得来源数据的商业使用权。

# 10\. 查询标准化

所有实时搜索、任务合并和缓存命中必须以标准 QuerySignature 为基础。缺少 source\_id、Listing／market scope、Sellable Unit、日期、人数、住宿单位数、房型约束、价格口径或 Collection Profile 的数据不能被视为同一查询。

* source\_id  
* listing\_id \+ sellable\_unit\_id，或市场搜索使用 geo\_cell / market\_scope  
* check\_in、nights  
* adults、children\_ages、units  
* sellable\_unit\_id、unit\_constraints 和原始／标准化房型属性  
* meal\_plan、cancellation\_policy、rate\_plan  
* currency、tax\_and\_fee\_policy  
* collection\_profile\_id、public\_rate\_context 和查询语义版本；查询时间、collector\_version 与 parser\_version 只保存为 Observation provenance，不进入等价签名

建议缓存键形式：source\_id | listing\_id | sellable\_unit\_id | check\_in | nights | occupancy | unit\_constraints | rate\_plan | currency | collection\_profile\_id。市场搜索使用 source\_id | geo\_cell / market\_scope | check\_in | nights | occupancy | filters | collection\_profile\_id。

# 11\. 实时搜索、存储命中与刷新

## 11.1 核心模式

正确实现不是每次全部实时搜索，也不是直接读取历史缓存，而是“全国持续采集 \+ 新鲜度感知的缓存命中 \+ 按需实时刷新 \+ 历史追加存储”。全国底座先运行，用户请求只补齐真正缺失、过期或需要更窄时间窗口的数据。

1. 收到 AnonymousPreviewRequest 或 FormalAnalysisRequest，生成请求指纹、幂等键和访问层级；相同 Listing、Unit 和 Query Plan 优先合并任务。  
2. 解析并确认 OTA Listing、Property、Sellable Unit、地理市场、标准 Query Plan 和 Collection Profile；无法确认 Listing 或 Unit 时不得进入正式价格分析。  
3. 从存储中查找完全匹配的 RateObservation、EventObservation 和需求信号。  
4. Freshness Evaluator 将结果分类为新鲜、部分、过期、缺失或冲突。  
5. 匿名预览优先使用新鲜精确命中和全国面板，仅在目标价、费用口径和市场区间可验证时展示有限数值；部分或过期数据必须明确标识并触发受限刷新。  
6. 邮箱正式分析并行刷新目标 Listing 与 Unit、版本化 CORE 竞品、全国事件、天气、交通、需求和异常信号；只有已启用且运行健康的来源数据可以进入正式结果。
7. 每次实时采集结果以新记录追加，不覆盖原观测。  
8. 通过 Blocking Quality Gates 后固化报告级 MarketSnapshot 和每个入住日期的 DateSnapshot，并交给 Pricing Intelligence Engine。  
9. PriceAnalysis 保存市场参考区间、重点日期、风险、置信度和证据；发布时创建不可变 Result Version，并向用户邮箱发送当前报告的安全结果链接。重新分析或人工修正必须创建新版本，不覆盖历史结果。

## 11.2 命中类型

* 精确且新鲜：查询条件完全一致且在有效期内，可直接用于分析。  
* 部分命中：只有部分日期、来源或竞品可用；粗略结果可使用，正式任务需要补齐。  
* 过期命中：只能作为暂时背景或匿名估算，并强制触发刷新。  
* 完全未命中：启动实时采集。  
* 负向命中：不可售、页面不存在、来源阻止或条件不满足。负向结果也要保存原因，但使用更短 TTL。  
* 冲突命中：不同来源价格或房型映射不一致；保留全部证据、降低置信度并刷新关键来源。

## 11.3 时间一致性

正式报告不能把刚采集的目标价格与明显更旧的竞品价格视为同一市场。默认核心目标价和主要竞品必须在 24 小时内；D+0 至 D+7 或重大活动日期的目标与 CORE 竞品最大采集偏差为 2 小时，D+8 至 D+30 为 6 小时。超出窗口的数据必须重新采集、降低置信度或拒绝形成精确判断；阈值作为服务端配置并保留策略版本。

# 12\. 数据存储与核心模型

## 12.1 参考存储分层（最终以技术 ADR 为准）

* PostgreSQL：房源身份、标准化观测、事件、快照、分析、模型版本和用户报告。  
* Redis：热点缓存、请求合并、分布式锁、限流、短期负向缓存和任务状态。  
* 对象存储：短期保存原始响应、HTML、截图和网络证据；默认 72 小时，解析故障或审计需要时最多 7 天，随后自动删除。长期保留标准化 Observation、字段级证据、哈希和来源追踪。
* 任务队列与 Worker：执行来源隔离、并发预算、重试、超时和人工接管。

## 12.2 RateObservation

* property\_id、sellable\_unit\_id、listing\_id、source\_id、source\_listing\_id、stay\_query\_id、collection\_profile\_id、collection\_run\_id  
* requested\_at、collected\_at、source\_updated\_at、observed\_at；新鲜度由 Freshness Policy 动态判断，valid\_until 仅作为派生缓存字段  
* check\_in、check\_out、nights、adults、children\_ages、units、local\_timezone  
* room\_type\_raw、room\_type\_normalized、unit\_constraints、occupancy\_capacity、bed\_type、unit\_attributes\_version  
* base\_price、taxes、mandatory\_fees、optional\_fees、total\_price、currency、exchange\_rate、nzd\_total、effective\_nightly\_total  
* meal\_plan、cancellation\_policy、payment\_terms、rate\_fence  
* availability\_status、restriction\_reason  
* source\_url、evidence\_ref、collector\_version、parser\_version、quality\_flags、operational\_status

## 12.3 MarketSnapshot

* analysis\_request\_id、target\_property\_id、target\_sellable\_unit\_id、target\_listing\_id、query\_plan\_id、query\_plan\_version、competitor\_set\_version、as\_of、market\_scope  
* 使用的 DateSnapshot、RateObservation、EventObservation、DemandSignal、Weather Signal、Access Signal 和 DisruptionObservation ID，以及 Collection Profile 与 SourceRegistry 版本  
* 最新与最旧观测时间、时间偏差和新鲜度摘要  
* 竞品数量、覆盖率、来源覆盖和缺失率  
* 冲突、异常、排除原因和质量门结果  
* snapshot\_version、generation\_policy\_version、freshness\_policy\_version、quality\_gate\_version、content\_hash 和 snapshot\_status

## 12.4 PriceAnalysis

* market\_median、weighted\_range、percentile、comparable\_count、market\_rate\_index  
* availability\_compression、demand\_pressure、event\_impact、accessibility\_effect、demand\_displacement\_effect、stranded\_traveller\_effect、disruption\_direction  
* market\_reference\_range、review\_range、target\_price\_position、key\_dates、reason\_codes、recommended\_action  
* confidence\_score、confidence\_components、data\_gaps  
* model\_version、rule\_version、created\_at、snapshot\_id；发布后创建不可变 result\_version\_id，保存语言、发布状态、访问范围、SUPERSEDED／WITHDRAWN 状态和审计记录

# 13\. 价格分析方法

## 13.1 竞品选择

* 地理距离和实际通行时间。  
* 住宿类型、品牌或独立房源定位。  
* 房型、容纳人数、床型、独立或共享空间。  
* 评分、评论量、星级、设施和服务水平。  
* 取消政策、早餐、停车和其他价格包含项。  
* 目标客群和价格档位。

竞品组必须版本化并根据市场密度动态确定。不能因为距离近就把经济型 Motel、五星酒店和整套度假屋放入同一无差别平均值。同一 Sellable Unit 的跨平台 Listing 只能贡献一个代表价格；其他渠道报价只用于来源一致性检查，不能增加竞品票数。

## 13.2 价格标准化

1. 将价格统一换算为包含强制税费的每晚 NZD 总价。  
2. 识别并单独保留清洁费、服务费、早餐、停车和其他附加价值。  
3. 将可免费取消、不可退款、会员价和促销价分开比较。  
4. 保留原始房型与标准化房型映射，不能丢失来源语义。  
5. 对异常低价、异常高价、缺失税费和解析冲突进行质量标记，而不是静默修正。

## 13.3 核心计算

* 加权竞品中位数和四分位区间，避免少量异常价格控制平均值。  
* 目标房源在竞品分布中的价格百分位。  
* 基于固定或版本化 Eligible Cohort 的 AvailabilityCompression，并将真实不可售、限制、数据缺失和来源失败分别计算。  
* 事件或假期影响必须使用相似星期结构、季节、booking horizon、住宿类型和无事件对照日期建立反事实基线；单纯同时发生不能视为因果影响。  
* 未来日期价格曲线、变化速度和来源一致性。  
* 结合房源质量和声誉的支付意愿修正。  
* 结合事件、天气、道路、航班、渡轮、自然灾害和目的地异常的 DemandPressure、accessibility\_effect、demand\_displacement\_effect、stranded\_traveller\_effect 与 disruption\_direction。

最终输出应是 Market Reference Range、Review Range、目标价格位置、关键日期和建议动作，而不是没有不确定性说明的单一精确售价。

## 13.4 建议核心指标

* MarketRateIndex：特定市场、日期和住宿类别的标准化报价水平。  
* AvailabilityCompression：在统一查询条件下公开可售供给的收缩程度。  
* DemandPressure：活动、假期、流入和历史市场变化形成的需求压力。  
* EventImpactScore：事件规模、受众来源、距离、重叠和历史结果的综合影响。  
* DisruptionImpact：天气、道路、交通和突发事件对可达性、需求转移与旅客滞留的多维影响；方向可以为 Positive、Negative、Mixed 或 Unknown。

# 14\. 置信度与数据不足处理

正式报告必须先通过 Blocking Quality Gates，再同时给出 Report-level Confidence 和 Date-level Confidence。阻断项至少包括：TARGET\_RATE\_MISSING、UNIT\_UNCONFIRMED、FEES\_UNKNOWN、COMPARABILITY\_FAILURE、SOURCE\_UNAVAILABLE、SEVERE\_CONFLICT、FRESHNESS\_EXPIRED、SNAPSHOT\_INCOHERENT 和 COMPETITOR\_COUNT\_BELOW\_3。置信度至少由以下部分组成：

* Freshness：数据是否足够新。  
* Coverage：目标日期、竞品和来源覆盖是否充足。  
* Comparability：竞品与目标房源是否真正可比。  
* Source agreement：不同来源是否相互支持。  
* Snapshot coherence：观测是否处于合理的同一时间窗口。  
* Parsing quality：房型、税费和政策字段是否通过校验。  
* Historical stability 与 Calibration：历史数据是否足以建立稳定基线，以及 High／Medium／Low 标签是否与后续错误率、区间覆盖率和用户反馈相匹配。

竞品目标为 8–20 个有效唯一 CORE Unit；至少 8 个且核心数据在 24 小时内可形成 High Confidence，5–7 个可形成 Medium，3–4 个只能输出 Low Confidence 方向性结果，少于 3 个必须返回 Insufficient Data。一个可用价格来源可形成正式结果，第二来源用于交叉验证和提升置信度。采集失败、覆盖不足或阻断项命中时必须降低置信度或拒绝生成精确判断，任何情况下不得回退到随机 Demo 数据。

# 15\. 匿名预览、邮箱结果与注册账户

## 15.1 匿名真实预览

* 优先使用新鲜精确缓存、全国 Anchor Panel 和少量实时目标查询；只有目标价、费用口径、市场区间和数据时间可验证时才展示数值。  
* 最多展示已识别的 Property 与 Sellable Unit、允许展示的目标公开价格、取整后的宽幅市场参考区间、低于／接近／高于市场的位置，以及最多两个初步重点日期或市场信号。  
* 始终标注 Preliminary／初步结果，展示数据采集时间、置信度和已知限制；数据不足时可以只展示已确认身份与市场状态，不强行输出数值。  
* 匿名预览不得展示具体竞品名称与单个竞品价格、完整 30 天结果、完整重点日期、详细证据、历史、导出、重新分析或竞品修改功能。

## 15.2 邮箱验证后的有限只读正式报告

* 用户提供邮箱后创建正式 Analysis Request，强制刷新目标 Listing、Sellable Unit 和版本化 CORE 竞品，并记录邮箱、语言、同意、邮件投递、链接访问和结果查看事件。  
* 检查全国公众假期、学校假期、Event Graph、旅客流入、天气、道路、航班、渡轮、港口、自然灾害和目的地异常，并按目标市场和日期筛选相关信号。  
* 通过质量门后固化报告级 MarketSnapshot、日期级 DateSnapshot、竞品集合版本、来源运行状态和分析版本。
* 安全链接只读展示一个 Sellable Unit、未来 30 天、最多 5 个重点日期、聚合 Market Reference Range、目标价格位置、风险、主要驱动因素、置信度、建议动作、限制和基础反馈。  
* 完整日期详情、更多重点日期、历史、重新分析、竞品管理、全国深度数据、多房源、导出、持续监控、提醒和 PMS／Channel Manager 连接均要求注册正式账户；邮箱结果链接本身不自动授予这些能力。

# 16\. 防滥用、成本与可靠性

* 按标准 QuerySignature 生成请求指纹；同一 Sellable Unit 每 24 小时最多生成一次新的匿名预览，其余请求复用仍满足新鲜度和质量门的结果。  
* 使用幂等键和分布式锁，防止 API 重试、队列重复消费和并发用户触发重复抓取。  
* 匿名阶段只执行有限深度采集，不启动完整竞品刷新，不允许批量导出，也不得通过参数变化枚举市场数据；用户提供邮箱后才启动完整正式分析。  
* 同一设备或 IP 每 24 小时最多匿名检查 3 个不同 Sellable Unit，每 30 天最多 10 个；同一邮箱同时最多一个未完成免费正式任务。所有阈值作为服务端配置，不向前端公开。  
* 识别批量枚举 URL、快速轮换 Property／Unit、参数探测、自动化提交和异常并发；命中风险规则时触发 CAPTCHA、延迟、降级为缓存结果、临时阻断或要求注册。  
* 同一 Sellable Unit 30 天内默认只获得一次完整免费正式检查；重复请求优先复用仍满足新鲜度的 Result Version，否则进入刷新、注册、Pilot 或付费路径。  
* 每个来源独立设置并发、失败熔断、每日预算和恢复策略。  
* 缓存和全国底座优先服务重复请求，实时采集只补齐真正缺失或过期的部分。  
* 邮件发送使用 analysis\_id \+ recipient \+ template\_version 幂等键。  
* 安全结果链接默认有效 14 天，可撤回和重新签发；数据库只保存 token hash，结果页必须 noindex，并采用 no-referrer 策略。token、明文凭证和来源账户秘密不得进入日志、分析事件、错误追踪或第三方请求。

# 17\. 来源运行安全

* 每个来源建立 SourceRegistry，记录启用状态、生命周期、运行健康、访问方式、保留策略、并发预算、负责人和最近检查时间。
* 来源可以分别进入 RESEARCH、POC、PILOT 或 PRODUCTION。只有已启用、技术稳定且运行健康的来源，才能参与自动发布。
* 来源不可达、健康检查失败或运行状态为 BLOCKED/DOWN 时返回 SOURCE\_UNAVAILABLE，不执行采集或发布。
* 优先使用稳定、可追踪的官方开放数据、API 和合作数据。
* 在技术可行和成本合理的范围内采集影响身份、价格、可售、竞品、需求和解释的字段。原始页面、截图和网络响应默认保存 72 小时，故障或审计需要时最多 7 天，并在到期后自动删除；Cookie、Session、Token 和个性化标识立即清除。标准化事实、字段级证据、内容哈希和衍生指标可以长期保留，并持续追踪来源。

# 18\. 开发、演示与生产数据

* Development 环境必须能够运行主流 OTA 与全国公共来源适配器的研究、fixture 或 sandbox 模式；Development Demo Data 只用于验证流程行为，不是真实市场数据，也不代表生产来源启用。Development 环境不得自动调度作业。
* Demo 数据可以是固定 fixture 或明确标记的合成数据，但不应每次随机到无法复现。  
* 所有 Demo 页面和邮件必须持续显示“非真实市场数据”的明确标识。  
* 生产模式禁止在真实采集失败时静默回退到 Demo 数据。  
* 测试应覆盖命中、部分命中、过期、未命中、来源阻止、房型冲突、税费缺失和低置信度等状态。

# 19\. 实施顺序与数据能力成熟度

## 阶段 0：契约、来源配置与适配器

* 确认主流 OTA 与公共来源适配器契约、默认 Query Plan、SourceRegistry、运行健康门和对外报告声明。
* 定义 Property、Sellable Unit、Listing、Stay Query、Query Plan、QuerySignature、Collection Profile、RateObservation、Competitor Set Version、DateSnapshot、MarketSnapshot、PriceAnalysis 和 Result Version。  
* 建立来源配置和证据保留策略。

## 阶段 1：全国数据基础设施与受控 POC

* 建立并运行 Booking、Airbnb、Expedia、Bookabach、Agoda、Trip.com 及全国公共数据来源的开发适配器、任务队列、重试、来源健康和追加历史存储。
* 建立全国 Property／Sellable Unit／Listing 身份图谱、1,000–1,500 个唯一 Unit 的代表性面板、固定日期篮子和全国市场覆盖状态。  
* 使用多来源研究方案对照身份、含税总价、房型、取消政策、可售状态、Collection Profile、采集时间和证据，验证适配器的一致性与来源差异。  
* 公开产品上线前，全国采集机制建议至少连续运行 30 天，并验证调度、重试、熔断、来源健康、追加历史、覆盖率、成本和异常告警稳定。  
* POC 和开发适配器只用于技术、字段与数据质量验证，不自动等同于生产启用；正式结果只使用已启用且运行健康的生产来源。

## 阶段 2：全国 Market Explorer 与历史底座

* 向公开和注册用户提供全国 Market Explorer，展示各 Region、Territorial Authority、微市场和住宿类别的价格区间、公开可售变化、事件、异常、覆盖率和数据时间。  
* 明确每个市场的 Supported、Partial Coverage、Pilot、Insufficient Data 或 Source Unavailable 状态；全国可查看不等于所有市场都能生成同等质量的 Property-level 正式结果。  
* 在 Market Explorer 中融合 MBIE、Stats NZ、LINZ、日历、机场、港口和其他全国来源，但明确区分滞后趋势、领先日期信号和实时公开市场报价。  
* 持续跟踪已知 Property／Unit 数、24／72 小时覆盖率、采集成功率、来源失败率、竞品覆盖率、数据成本、最近健康时间和历史追加完整性。

## 阶段 3：全国 Event Graph 与异常系统

* 聚合 Eventfinda、Ticketmaster、全国场馆、Council、大学、体育组织、RTO、机场、港口和邮轮日历，形成全国 Event Graph。  
* 完成事件去重、容量、观众构成、房源通行时间、影响半径、住宿类型相关性、重叠信号、状态变化和历史 EventImpact Outcome 模型。  
* 接入全国天气、道路 Route Segment、机场、港口、渡轮、GeoNet 和目的地特有异常，形成可达性、需求转移和旅客滞留三类细粒度信号。  
* 建立按事件、天气、道路和交通异常影响区域触发的价格与可售加密采集规则；单个信号不能独立形成 High Priority，必须与价格、可售或其他独立证据结合。

## 阶段 4：匿名预览、邮箱结果与注册升级

* 实现强制 OTA Listing 解析、匿名真实预览、反滥用、邮箱收集、正式刷新、MarketSnapshot／DateSnapshot 和有限只读安全结果。  
* 实现邮箱验证与 RESULT\_READY 安全结果链接；链接只授权当前 Price Check 验证流程。用户请求完整明细、历史、重新分析、竞品管理、全国深度数据或持续监控时，使用邮箱和密码创建正式账户。
* 实现 Blocking Quality Gates、Report／Date Confidence、Partial、Insufficient Data、Source Unavailable、不可变 Result Version 和撤回机制。  
* 实现匿名预览、免费正式检查、邮箱并发、设备／IP、同 Unit 重复请求、CAPTCHA、请求合并、来源预算和注册升级的统一配额与成本控制。

## 阶段 5：回测、持续监控与经营数据

* 持续回测 Market Reference／Review Range、日期级风险、事件影响、AvailabilityCompression、异常方向和置信度校准。  
* 根据实际波动调整采集频率和模型权重。  
* 在用户明确授权后接入 PMS 或 Channel Manager 数据。  
* 在用户明确授权经营数据且独立风险审批完成后，才能从市场价格情报升级到房源级收益效果评估；自动调价仍属于独立产品阶段。

# 20\. 验收指标与质量门

* Property name、地址和 URL 输入最终解析到有效 OTA Listing 的成功率，以及 Property／Sellable Unit／Listing 身份匹配准确率。  
* 全国 Anchor／Rotating 面板、Region、Territorial Authority、住宿类别、目标日期和关键字段覆盖率，以及各市场覆盖状态的真实性。  
* 全国采集机制连续运行天数、24／72 小时覆盖率、价格新鲜度、DateSnapshot／MarketSnapshot 时间偏差、来源成功率、熔断恢复时间和历史追加完整性。  
* 含税总价、强制费用、Sellable Unit、平台房型、取消政策、rate fence 和 Collection Profile 的解析与标准化准确率。  
* CORE 竞品的用户认可率、抽样审核相关性、跨平台重复率、关系版本稳定性和低密度市场扩展比例。  
* 匿名真实预览到邮箱提交的转化率、预览复用率、CAPTCHA 触发率、防滥用误伤率和异常批量请求阻断率。  
* RESULT\_READY 投递成功率、安全链接打开率、链接过期／重签发率、邮箱结果到正式注册的升级率、重复邮件率和无效 token 访问率。  
* Market Reference／Review Range 覆盖率、日期级方向准确率、EventImpact 与异常方向校准误差、AvailabilityCompression 误判率和 High／Medium／Low Confidence 校准误差。  
* 每次匿名预览、邮箱正式报告、注册用户扩展分析和每个全国市场每日运行的采集成本，以及缓存复用率、单个有效重点日期成本和来源成本占比。  
* 生产来源启用状态、字段级证据、72 小时／7 天原始素材删除、标准化数据来源追踪和来源停用审计通过率。

# 21\. 当前明确不做的事情

* Property name 和自然地址可以作为发现入口，但没有确认到有效 OTA Listing 和具体 Sellable Unit 时，不生成正式价格分析或精确收益结论。  
* 不要求首次用户选择复杂的日期、人数和房型。  
* 不把所有新西兰房源未来所有日期每天全量抓取。  
* 不把 OTA 不可售直接称为实际入住率。  
* 不把公开挂牌价格称为实际成交 ADR。  
* 不让大模型在缺少结构化证据时自由生成价格。  
* 不在生产采集失败时使用随机 Demo 数据。  
* 不因为市场上存在 scraper 就降低运行安全、证据和质量要求。
* 不为一次分析发送注册、验证、登录和报告四封重复事务邮件；正常成功路径只发送 RESULT\_READY，注册账户仅在用户请求更多能力时独立发生。

# 22\. 已确认默认值与剩余待验证事项

* 已确认：开发环境 active OTA 为 Booking.com、Airbnb、Expedia、Bookabach、Agoda、Trip.com，并支持全国推荐公共来源；测试和生产来源根据启用状态、技术稳定性和运行健康逐项启用。Wotif、Hotels.com、Vrbo 不进入发现和健康门槛，Google Hotels 不执行。开发环境硬性禁止自动调度。
* 已确认：用户正式检查默认 2 名成人、0 名儿童、1 个住宿单位、1 晚、NZD、房源当地时区和未来 30 天；全国内部面板使用 D+7、D+14、D+30、D+60、D+90，并补充工作日、周末、假期和批准活动日期。  
* 已确认：初始全国代表性面板为 1,000–1,500 个唯一 Sellable Unit，约 80% Anchor、20% Rotating；正式竞品目标 8–20 个，5 个为自动发布最低可靠基准，3–4 个只允许 Low Confidence，少于 3 个返回 Insufficient Data。  
* 已确认：核心目标价和主要竞品默认不得超过 24 小时；D+0 至 D+7 或重大活动日期的目标与 CORE 竞品最大采集偏差为 2 小时，D+8 至 D+30 为 6 小时；具体新鲜度策略保持服务端可配置并版本化。  
* 已确认：正式报告先通过 Blocking Quality Gates，并同时输出 Report-level 与 Date-level Confidence；一个可用价格来源可形成正式结果，第二来源用于交叉验证和提高置信度。匿名只展示有限真实预览，邮箱链接只展示有限只读正式报告，更多结果或操作必须注册账户。
* 已确认：SourceRegistry 记录来源启用状态、生命周期与运行状态；原始素材默认 72 小时、必要时最多 7 天后删除。
* 已确认：同一 Sellable Unit 每 24 小时最多一次新匿名预览，同一设备或 IP 每 24 小时最多 3 个不同 Unit、每 30 天最多 10 个；同一 Unit 30 天内默认一次完整免费正式检查，同一邮箱同时最多一个未完成免费任务。剩余待验证：完成至少 100 次真实检查后确定正式单位成本上限和未来订阅价格。  
* 已确认：低密度地区按“同一微市场与住宿类型 → 扩大至约 20 分钟通行范围 → 约 40 分钟或相邻市场 → 降级为 Market Reference → Insufficient Data”顺序扩展；每次扩展必须降低 Comparability 并向用户说明。  
* 剩余待验证：在至少完成 100 份真实报告、确认用户持续监控需求并取得明确授权后，启动 PMS／Channel Manager 经营数据受控试点；房源级收益效果评估随后进行，自动调价继续作为独立产品阶段审批。

#

# 23\. 参考资料与候选来源

* [MBIE Accommodation Data Programme](https://teic.mbie.govt.nz/teiccategories/datareleases/adp/)  
* [MBIE Tourism Evidence and Insights Centre](https://teic.mbie.govt.nz/)  
* [Stats NZ Tourism](https://www.stats.govt.nz/topics/tourism/)  
* [New Zealand Ministry of Education School Terms and Holidays](https://www.education.govt.nz/school/school-terms-and-holidays)  
* [Employment New Zealand Public Holidays and Anniversary Dates](https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates)  
* [LINZ Data Service](https://www.linz.govt.nz/products-services/data/linz-data-service)  
* [NZTA Traffic and Travel APIs](https://nzta.govt.nz/about-us/our-data-and-official-information/use-our-data)  
* [MetService Data and APIs](https://data.metservice.com/)  
* [GeoNet API](https://api.geonet.org.nz/)  
* [Eventfinda Developer API](https://www.eventfinda.co.nz/api/v2/location)  
* [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)  
* [Auckland Airport Monthly Traffic Updates](https://www.aucklandairport.co.nz/content/aial-corporate/nz/en/news/publications/monthly-traffic-updates.html)  
* [Christchurch Airport Monthly Passenger Data](https://www.christchurchairport.co.nz/about-us/who-we-are/facts-and-figures/monthly-passenger-arrivals-and-departures/)  
* [Port of Auckland Cruise Schedule](https://www.poal.co.nz/operations/schedules/cruise)  
* [Stats NZ Building Consents](https://www.stats.govt.nz/topics/building/)  
* [Reserve Bank of New Zealand Exchange Rates](https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index)  
* [Crawlee](https://github.com/apify/crawlee)  
* [Stagehand](https://github.com/browserbase/stagehand)  
* [Ulixee Hero](https://github.com/ulixee/hero)  
* [Browserless](https://github.com/browserless/browserless)  
* [Apify Booking Scraper](https://apify.com/voyager/booking-scraper)  
* [Apify Google Hotels Scraper](https://apify.com/scrapesage/google-hotels-scraper)  
* [Apify Airbnb Scraper](https://apify.com/tri_angle/airbnb-scraper)  
* [Airbnb Terms of Service](https://www.airbnb.com/help/article/2908)  
* [Booking.com Terms and Conditions](https://www.booking.com/content/terms.en-gb.html)

# 24\. 对话决策追溯与开发验收补充

## 24.1 从初始设想到最终产品口径

* 最初设想是：用户输入地址，经过具有吸引力的交互得到粗略结果；需要更明确的数据时填写邮箱，通过邮件链接进入网站，并在后台形成用户身份，同时必须防止滥用。  
* 最终决策保留这条低摩擦主路径，但把“邮箱身份”和“完整注册账户”分开：结果链接完成邮箱验证并授权查看当前有限正式报告，后台可以建立 verified contact／identity 记录；只有用户请求历史、重新分析、竞品管理、多房源、导出、持续监控或其他高级能力时，才升级为正式账户。  
* Property name 和自然地址保留为发现入口，因为它们有利于降低首次使用门槛；正式分析仍必须解析并确认有效 OTA Listing、具体 Property 与 Sellable Unit。否则缺少当前公开定价、房型和可比条件，不能形成可靠价格结论。  
* 首次匿名阶段不要求用户选择日期、人数或复杂查询条件，统一使用已确认的默认 Stay Query。独立单一 Unit 可以自动确认；酒店、Motel 或多房型 Property 必须在正式分析前让用户确认 Sellable Unit，不得盲目采用页面默认房型。  
* 所谓“酷炫交互”必须反映真实 Worker 阶段，例如识别房源、确认 Unit、检查市场、匹配竞品、校验数据和生成预览；不得用虚假进度、随机数字或动画掩盖来源失败。

## 24.2 一次检查的邮件与身份验收口径

* 正常成功路径只发送一封 RESULT\_READY 服务邮件。它同时承担结果送达、邮箱验证和当前报告访问入口三个作用。  
* 只有需要用户确认 Property／Sellable Unit、结果为 Partial／Insufficient、用户主动申请重签链接，或任务不可恢复失败且用户必须采取行动时，才允许额外事务邮件。  
* 注册成功、邮箱验证成功、登录成功和分析完成不得拆成四封重复邮件。发送端必须以 analysis\_id、recipient 和 template\_version 形成幂等键，并保存 email\_event、provider\_message\_id、attempt、最终状态和触发原因以便审计。  
* 完整流程验收必须检查队列重试、并发消费者、重复 webhook 和页面重复提交，证明同一正式结果不会重复发送。

## 24.3 本地开发与体验回归要求

* 本机开发环境的目标入口是 https://tymra.test；开发服务应由可监督的常驻进程或容器运行，具备健康检查、异常重启和依赖就绪检查，不能依赖一次性的临时终端会话。  
* 已经完成的首页视觉、布局、文案和交互属于受保护的产品基线。后续实现数据或 Worker 功能时必须做范围受控的增量修改，不得整页覆盖；视觉实现继续以《视觉交互》和当前已批准页面为准。  
* 每次影响用户流程的版本都必须在 Chrome 中以全新用户身份完成端到端检查：打开首页、输入地址／名称／OTA URL、处理候选与房型、观看真实进度、查看 Preliminary 预览、提交邮箱、收到唯一结果邮件、打开安全链接、查看正式结果，并在请求更多能力时完成账户升级。  
* 体验验收同时检查桌面与移动视口、错误状态、加载状态、重复提交、链接过期、返回导航、文本溢出、控件遮挡和交互一致性；不能只以接口成功或页面返回 200 作为完成依据。

## 24.4 Demo、真实数据与生产边界

* “Development Demo Data — Not real market data”表示当前数据只用于证明流程行为，不可当作真实市场结论。它可以来自固定 fixture 或明确标注的合成数据，并不意味着每次都随机生成；为便于测试，Demo 数据应优先保持确定性和可复现。  
* 生产模式不得在采集失败时静默回退到 Demo、随机或伪造数据。来源失败、字段缺失或覆盖不足必须明确显示 Partial、Insufficient Data 或 Source Unavailable。  
* 长期数据体系包括全国 Property／Sellable Unit／Listing 身份图谱、代表性价格与可售面板、事件与假日日历、旅客流入、天气、道路和交通异常、房源声誉、宏观与供给变化，以及自有预测结果回测。  
* 具体分析采用“新鲜缓存命中、部分命中补采、过期刷新、未命中实时采集、不可变快照发布”的组合；缓存键必须包含 Listing／Unit、入住条件、日期篮子、币种、语言、来源集合和采集配置，不能把不同查询条件直接混用。  
* 公开 OTA 价格是挂牌报价而非实际成交 ADR；公开不可售也不等于实际入住。未取得 PMS／Channel Manager 或用户经营数据前，产品只输出 Market Reference／Review Range、需求压力、低价风险和可解释建议。

## 24.5 工程实施与发布证据

* 可复用的开源浏览器自动化、采集框架或市场 scraper 只作为技术参考和受控 POC 候选，不应成为单一供应商依赖。
* 每个生产来源必须记录运行状态、证据保留策略、健康指标、成本与停用开关。
* 每次发布应保留来源状态矩阵、全国覆盖状态、新鲜度与时间一致性、竞品数量、质量门结果、Result Version、邮件幂等记录、防滥用决策和失败降级证据。  
* 本节是对前述核心策略的追溯与验收补充；若与《需求说明》《业务规则》《页面结构》《视觉交互》或批准的技术 ADR 冲突，按第 1 节定义的文档权威边界处理。
