# Tymra by Synix 页面结构

## 状态：Active — Release 1 Information Architecture Baseline v1.2｜基线集合：Tymra Release 1 Codex Build Baseline v1.2｜基线日期：2026-07-16

文档定位：本文件是 Tymra Release 1 的页面、路由和用户流程契约，定义公开网站、真实价格检查、异步状态、结果、安全链接、Exception Inbox、市场运维页面、页面数据需求和 API 绑定。Codex 必须按本文创建路由和页面，不得加入未批准的 Dashboard、Billing、自动调价或复杂账户流程。PG-\* 标识必须进入 docs/traceability.md，并映射到路由、组件和端到端测试。

## 基线控制

本文件属于 Tymra Release 1 Codex Build Baseline v1.2。页面必须服从《需求说明》的范围和《业务规则》的状态与判断，视觉样式由《视觉交互》定义。本文件只定义路由、页面区域、内容顺序、用户流程、页面数据需求和 API 绑定，不重复定义颜色、字号、圆角、栅格或动效；首页视觉统一引用 \[UI-HOME\]。本文列出的公开和后台路由均属于 Release 1 当前实现；未列出的业务页面默认不创建。路由示例中的 {locale} 只能为 en 或 zh。

# \[PG-IA\] 一、信息架构原则

• Search-first 首页是公开产品的核心入口，用户无需先注册即可创建一次真实 Price Check。  
• 用户流程分为识别确认、任务处理和安全结果三段，异步任务不得伪装为同步秒级结果。  
• 后台以 Exception Inbox 为默认首页，只突出需要单人运营者决定的异常。  
• 页面必须保留已输入信息，刷新、返回和语言切换不得无故丢失当前任务。  
• 移动端按任务重新组织，不是桌面端简单缩小。

# \[PG-ROUTES\] 二、路由与语言契约

## 2.1 Locale

公开页面使用 /en 和 /zh 两个语言前缀。根路径 / 根据已保存语言偏好重定向；无偏好时重定向 /en。语言偏好使用 cookie 保存。中文代码固定为 zh，界面语言为简体中文。

## 2.2 Public Routes

• /{locale}：首页。  
• /{locale}/check：创建 Price Check 和识别房源。  
• /{locale}/check/{checkId}/property：Property 候选确认。  
• /{locale}/check/{checkId}/unit：Sellable Unit 确认。  
• /{locale}/check/{checkId}/query：Stay Query 确认。  
• /{locale}/check/{checkId}/status：任务状态、异常等待和下一动作。  
• /{locale}/result/{token}：安全结果页。  
• /{locale}/waitlist：非新西兰或未开放市场登记。  
• /{locale}/methodology：公开方法说明，不公开权重和阈值。  
• /{locale}/faq：FAQ 独立页；首页同时保留 FAQ 摘要。  
• /{locale}/contact：联系页。  
• /{locale}/privacy、/terms、/cookies、/disclaimer、/data-deletion：法律与数据删除页面。

## 2.3 Admin Routes

• /admin/sign-in：管理员登录。  
• /admin/exceptions：Exception Inbox，后台默认首页。  
• /admin/exceptions/{exceptionId}：单一异常决策工作区。  
• /admin/price-checks：全部 Price Check 查询。  
• /admin/price-checks/{checkId}：任务详情、数据、结果版本和审计。  
• /admin/market/properties：Property 查询与合并。  
• /admin/market/units：Sellable Unit 查询与修正。  
• /admin/market/competitors：Competitor Relationship 查询。  
• /admin/market/coverage：市场支持范围和覆盖指标。  
• /admin/collections：Collection Run、计划任务、重试和失败。  
• /admin/data-sources：来源配置、健康和开关。
• /admin/signals：Important Dates 与 Market Signals。  
• /admin/feedback：用户反馈和举报。  
• /admin/audit：审计事件。

## 2.4 当前不创建

公开 Sign in、用户 Dashboard、90-day Calendar、Monitoring、Billing、Team、PMS Connection 和自动调价页面不属于 Release 1。不得创建禁用菜单、空白路由或“即将推出”的假入口，除非本文明确列出。

# \[PG-LAYOUT\] 三、全局公开布局

## 3.1 Header

桌面从左到右：Logo、How It Works、What You’ll Get、Methodology、FAQ、Contact、中文／English、Run Free Price Check。首页的主 CTA 平滑定位并聚焦首页核心输入；其他公开页面进入 /{locale}/check。Logo 返回当前语言首页。移动端保留 Logo、语言切换和 Hamburger，主 CTA 固定在菜单底部。

## 3.2 Footer

品牌说明；Product：Free Price Check、How It Works、What You’ll Get；Resources：Methodology、FAQ、Contact；Legal：Privacy、Terms、Cookies、Disclaimer、Data Deletion；语言切换；© Synix。只显示真实存在的链接。

## 3.3 公共系统条

当 Market=DISABLED、主要来源故障或自动发布被全局暂停时，Header 下显示可关闭但持续可见的状态条，说明当前影响和可采取动作，不显示技术错误详情。

# \[PG-HOME\] 四、首页 /{locale}

## 4.1 Hero

首页内容顺序固定：Badge；主标题；核心价值；Search Card；范围说明；可信边界。本文只规定内容层级和交互去向，具体构图、尺寸、颜色与动效以《视觉交互》的 \[UI-HOME\] 为准。  
英文主标题：How much revenue are you leaving?  
英文核心价值：Find the dates you may be selling too cheaply.  
中文主标题：你的哪些高价值日期可能卖便宜了？  
中文核心价值：快速发现低价风险、竞品差距和市场上涨信号。  
Search Placeholder：Search a New Zealand property, address, or listing URL／输入新西兰房源名称、地址或房源链接。  
主 CTA：Run Free Price Check／免费检查房价。  
辅助说明：New Zealand properties only · No credit card required／目前仅支持新西兰房源 · 无需信用卡。

## 4.2 Capability Preview

首页展示四类真实产品能力的结构预览：Low-price Risks、Competitor Median、Market Signals、Suggested Actions。未输入房源前使用中性示例结构或说明，不使用虚构真实价格、风险或竞品数量。所有示例必须标记 Example。

## 4.3 How It Works

三步：Search your property；Tymra checks comparable market data；Review the dates that may need attention。说明结果可能异步完成，用户会获得 Check ID 和邮件通知。

## 4.4 What You’ll Get

说明一个 Sellable Unit、未来 30 天、最多 5 个重点日期、聚合竞品区间、风险、置信度、市场信号、建议和限制。不展示 Release 2 的持续监控为当前能力。

## 4.5 Methodology Summary

高层解释 Property、Sellable Unit、Comparable Properties、Effective Nightly Total、Data Freshness 和 Confidence。链接到 /methodology。

## 4.6 Market Coverage

只声明当前正式支持 Christchurch 及已批准周边。显示 Supported、Pilot available、Coming soon 的含义，不显示未经证实的全国覆盖数字。

## 4.7 FAQ Summary

至少包括：是否真实结果、支持哪些房源、多久完成、是否自动调价、数据来源和隐私、为什么只支持新西兰、数据不足怎么办。

## 4.8 Final CTA

重复核心价值并链接 /{locale}/check。不得引导注册或选择套餐。

# \[PG-CHECK\] 五、创建 Price Check /{locale}/check

## 5.1 页面目的

完成原始输入、邮箱和服务同意，调用 POST /api/v1/property-search；根据结果进入 Property 确认、Unit 确认、Waitlist、Unsupported 或创建任务。

## 5.2 页面区域

标题和范围说明；Property Search Input；Email；服务邮件同意说明；独立未预选 Marketing Checkbox；主 CTA；隐私短说明；返回首页。

## 5.3 表单字段

input 必填，3–500 字符；email 必填；locale 隐藏保存；serviceConsent 必须为 true；marketingConsent 可选且默认 false。

## 5.4 提交状态

Idle、Typing、Validating、Searching、Candidates Found、No Match、Unsupported、Source Unavailable、Rate Limited 和 System Error。提交时不得清空输入；重复点击使用同一幂等键。

## 5.5 下一路由

• UNIQUE Property 且 Unit 明确：创建 Price Check，进入 /status。  
• MULTIPLE Property：创建草稿任务，进入 /property。  
• Property 唯一但多 Unit：进入 /unit。  
• Market 未开放或非新西兰：进入 /waitlist 或明确状态页。  
• Source 暂不可用：保留表单并提供 Retry later。

# \[PG-PROPERTY\] 六、Property 确认 /check/{checkId}/property

## 6.1 页面内容

显示用户原始输入、候选卡片、官方名称、地址、住宿类型、来源、合法可用时的缩略图和匹配说明。每次只能选择一个；提供 None of these。

## 6.2 操作

Confirm Property 调用 confirm-property；None of these 打开补充输入；Edit Search 返回 /check 并保留原输入。确认后根据 Unit 情况进入 /unit 或 /query。

## 6.3 状态

Loading、Candidates、No Candidates、Source Error、Expired Draft 和 Already Confirmed。Already Confirmed 自动跳到下一合法步骤。

# \[PG-UNIT\] 七、Sellable Unit 确认 /check/{checkId}/unit

## 7.1 页面内容

显示 Property 摘要和 Unit 卡片：官方房型名、平台房型名、容量、卧室、床型、关键设施、来源和在线状态。多房型 Property 不得跳过。

## 7.2 操作

Select Unit；None of these；Back to Property。选择后进入 /query。

## 7.3 独立短租

若 Property 只有一个可确认 Unit，页面可以自动跳过，但状态日志必须记录 AUTO\_CONFIRMED。

# \[PG-QUERY\] 八、Stay Query 确认 /check/{checkId}/query

## 8.1 默认值

2 Adults、0 Children、1 Unit、未来 30 天、默认 1 Night、Property 当地时区、NZD。

## 8.2 可编辑字段

成人、儿童、单位数和住宿晚数。检查日期窗口固定为未来 30 天；超出范围不在 Release 1 提供。

## 8.3 提示

说明改变人数或晚数会影响可比性；若系统采用共同最短住宿长度，显示原因。

## 8.4 提交

调用 confirm-query 并进入 /status。按钮文案：Start Price Check／开始价格检查。

# \[PG-STATUS\] 九、任务状态 /check/{checkId}/status

## 9.1 访问

使用 checkId 和 accessKey；accessKey 存在 HttpOnly 或安全会话中，不写分析事件、不显示在页面。

## 9.2 页面顶部

Check ID、Property、Unit、Stay Query、创建时间和邮件地址脱敏显示。

## 9.3 进度

按真实状态显示：Validating、Queued、Collecting data、Normalizing data、Analysing、Quality checking（AUTO\_VALIDATING）和 Ready。不得显示伪造百分比、倒计时或不存在的步骤；状态标签必须由《业务规则》的 canonical status 映射生成。

## 9.4 状态动作

• NEEDS\_CONFIRMATION：显示具体确认 CTA。  
• EXCEPTION：对用户显示“Additional checks in progress”，不暴露内部异常细节。  
• READY/PUBLISHED：自动跳转或显示 View Results。  
• PARTIAL/INSUFFICIENT：显示原因摘要和可用结果。  
• FAILED：显示 Retry 或 Contact，包含 Reference ID。  
• UNSUPPORTED：显示替代输入或 Waitlist。  
• SOURCE\_UNAVAILABLE：说明当前没有已启用且运行健康的数据来源，显示最近尝试时间、自动重试或通知选项；Retry later 仅是用户文案。
• CANCELLED：说明任务已取消，可重新创建检查。  
• EXPIRED：不显示结果摘要，允许重新签发或重新检查。  
• WITHDRAWN：说明结果已撤回并提供 Contact；不得继续展示旧结果。

## 9.5 异步行为

页面使用轮询或 Server-Sent Events 获取状态；失去连接不改变任务。用户可关闭页面，结果通过邮件通知。提供 Copy Check ID。

# \[PG-RESULT\] 十、安全结果 /{locale}/result/{token}

## 10.1 访问状态

Valid、Expired、Withdrawn、Superseded、Invalid。Invalid、Expired 和 Withdrawn 不显示 Property 名称或结果摘要。

## 10.2 Result Header

Tymra Logo；Property；Sellable Unit；Stay Query；Generated at；Data last checked；Analysis version；Confidence；语言切换。语言切换使用同一 token，只改变文案。

## 10.3 Summary

显示 Overall Confidence、检查日期范围、有效竞品数量和结果类型。不得使用巨大收入损失数字或内部评分。

## 10.4 Priority Dates

最多 5 个日期，按 HIGH\_PRIORITY、REVIEW、WATCH、NO\_CLEAR\_RISK 排序。每项显示日期、目标 Effective Nightly Total、竞品中位价或区间、Risk Badge、Reason Codes、Market Signals、Recommended Action、Confidence 和限制。

## 10.5 Detail Interaction

点击日期展开或进入同页 Drawer；不创建可索引独立日期 URL。展开区按“发生了什么／为什么重要／建议做什么”组织。

## 10.6 Feedback

结果底部提供 Competitors relevant、Some not relevant、Insight useful、Reviewed price、Changed price、No action needed、Report an issue。提交后显示可撤销成功提示，不要求账户。

## 10.7 Version

Superseded 结果显示新版本可用提示并链接最新 token；Withdrawn 显示结果已撤回及联系入口。

# \[PG-BIZSTATE\] 十一、Waitlist 与业务状态页面

## 11.1 /waitlist

用于非新西兰、Coming Soon 或用户主动登记。字段：email、country、market、原输入可选、language、marketingConsent。服务更新和营销同意分开。

## 11.2 Unsupported

不单独创建固定路由；在 /check 或 /status 中根据原因渲染。说明不支持的国家、市场、住宿类型、URL 或数据源，并提供 Edit Search、Waitlist 或 Contact。

## 11.3 Insufficient Data

在 /status 和 /result 中作为正式结果状态。说明哪些日期可用、哪些缺失、为什么不能给建议。不得显示空白图表。

## 11.4 Source Unavailable / Retry Later

来源暂不可用时显示最近尝试时间、自动重试说明、邮件通知和手动 Retry；不要求用户重复提交。

# \[PG-PUBLIC\] 十二、Methodology、FAQ、Contact 与法律页

## 12.1 Methodology

章节：What Tymra checks、Sellable Unit、Comparable properties、Effective Nightly Total、Market signals、Confidence、Limitations、Data freshness。不得公开内部权重、阈值和来源组合细节。

## 12.2 FAQ

使用可分享锚点；每项问题有稳定 id。首页 FAQ 链接到对应锚点。

## 12.3 Contact

字段：name、email、topic、message、checkId 可选、language。提交成功返回 Reference ID。

## 12.4 法律页

统一 Header/Footer，显示标题、Last updated、适用版本和目录。Privacy、Terms、Cookies、Disclaimer、Data Deletion 均必须中英文完整。

# \[PG-ADMIN\] 十三、Admin Shell

## 13.1 认证

/admin/\* 除 /sign-in 外全部受保护。登录成功默认进入 /admin/exceptions。无权限显示 403，不暴露数据。

## 13.2 桌面布局

左侧固定导航；顶部全局搜索、来源健康、自动发布开关状态和用户菜单；主区；右侧可选详情 Drawer。

## 13.3 移动后台

Release 1 后台主要按桌面优化，但 768px 以下仍可完成紧急查看、接受建议、重试和暂停自动发布。复杂批量操作可以要求桌面。

# \[PG-EXC\] 十四、Exception Inbox /admin/exceptions

## 14.1 列表

默认仅显示 OPEN 和 IN\_PROGRESS。字段：Priority、Type、Check ID、Property/Unit、Market、System Recommendation、Age、Blocking User、Created at。支持 Type、Priority、Market、Age 和 Source 筛选。

## 14.2 默认排序

P0 → P1 → P2 → P3；同级按创建时间升序。Blocking User 的任务优先于纯数据维护。

## 14.3 批量操作

只允许对同类型且同建议的低风险异常批量 Accept、Recollect 或 Mark insufficient。P0、User Report 和 High Priority Review 不允许批量发布。

## 14.4 空状态

明确显示 No exceptions need attention，并提供 Price Checks、Source Health 和 Collection Runs 快捷入口。

# \[PG-EXC-DETAIL\] 十五、异常工作区 /admin/exceptions/{exceptionId}

## 15.1 单屏结构

左列：异常类型、影响、原始输入和系统建议；中列：冲突字段、候选、竞品、来源和证据；右列：结果预览、允许动作和审计时间线。

## 15.2 只显示争议点

非冲突字段折叠为 Verified summary。所有系统建议必须显示原因和数据时间。

## 15.3 动作

Accept suggestion、Select Property、Select Unit、Exclude competitor、Change role、Edit normalized value、Recollect、Reanalyse、Lower confidence、Mark partial、Mark insufficient、Approve and publish、Withdraw result。

## 15.4 结束行为

保存后自动回到 Inbox 并打开下一任务；支持键盘快捷键。高影响覆盖要求原因，其余动作自动记录原因代码即可。

# \[PG-OPS-CHECK\] 十六、Price Check 管理

## 16.1 /admin/price-checks

搜索 Check ID、email hash、Property、Unit；筛选 Status、Market、Created at、Result Type 和 Confidence。默认不显示完整邮箱。

## 16.2 /admin/price-checks/{checkId}

Tabs：Overview、Collection Runs、Observations、Competitors、Analysis、Result Versions、Feedback、Audit。提供 Recollect、Reanalyse、Publish、Withdraw 和 Reissue Link。

## 16.3 数据安全

原始供应商响应中的敏感字段默认折叠，并记录访问 Audit Event。

# \[PG-MARKET\] 十七、市场与来源运维

## 17.1 Properties 与 Units

查询、查看版本、合并重复身份、修正标准名称和状态。合并前显示影响对象和结果数量。

## 17.2 Competitors

按目标 Unit 查看 CORE、REFERENCE、EXCLUDED 和历史版本；支持新关系版本，不原地覆盖。

## 17.3 Market Coverage

每个市场显示状态、区域范围、已知 Property、已知 Unit、24/72 小时覆盖率、采集成功率、竞品覆盖率、来源健康和最后更新时间。支持暂停或恢复接受新任务。

## 17.4 Collections

显示计划与手动 Collection Run、范围、状态、成功/失败、重试和错误分类。支持 Retry failed items，不允许无确认删除历史。

## 17.5 Data Sources

显示 Enabled、Lifecycle、Operational status、Health、Last success、Error rate 和 Retention。生产 Demo Source 必须明显阻断并不可启用。

## 17.6 Signals

管理 Holiday、School Holiday、Anniversary Day 和经确认活动。显示来源、区域、时间和状态；事件不能直接编辑成 Risk。

# \[PG-API\] 十八、页面与 API 绑定

• 首页和 /check 使用 POST /api/v1/property-search。  
• 创建任务使用 POST /api/v1/price-checks。  
• /property、/unit、/query 使用对应 confirm API。  
• /status 使用 GET /api/v1/price-checks/{checkId}，需要 accessKey。  
• /result 使用 GET /api/v1/results/{token}；反馈使用 POST /feedback。  
• Exception 页面使用 admin exceptions API。  
• Price Check 管理使用 admin price-check APIs。  
• Market、Collections、Data Sources 和 Audit 使用《业务规则》列出的 admin API。  
所有页面必须处理 400、401、403、404、409、422、429、500 和 503；错误结构统一使用 error.code、message、fieldErrors 和 referenceId。

# \[PG-SHARED\] 十九、通用页面状态

每个数据页面必须实现 Loading、Skeleton、Empty、Success、Validation Error、Permission Error、Not Found、Conflict、Rate Limited、Source Unavailable、System Error 和 Retry。错误不得清除用户输入。可重试错误必须提供明确 Retry；不可重试错误说明下一步。

# \[PG-RESP\] 二十、响应式结构

## 20.1 Desktop

1440×900 为桌面 QA 基准。常规公开内容最大宽度 1200–1280px；首页外层画布可以扩展到 1440px，但核心输入和内容区保持在 1200–1240px。首页采用全幅居中 Hero 与背景式数据景观，具体尺寸和动效以 \[UI-HOME\] 为准。结果页使用主内容加右侧上下文；后台使用固定导航和三栏异常工作区。

## 20.2 Tablet

768–1023px；后台右侧预览改 Drawer；公开流程保持单主列，候选卡片最多两列。

## 20.3 Mobile

390px QA，并检查 320px 和 430px。Header 使用 Drawer；Search Card 单列；按钮全宽；候选和结果单列；Priority Dates 使用纵向卡片；Footer 使用 Accordion；任何页面不得横向滚动。Sticky CTA 不能遮挡键盘和 Safe Area。

# \[PG-SEO\] 二十一、SEO、可访问性与安全展示

• 首页、Methodology、FAQ 和法律页可索引；check、status、result、waitlist success 和 admin 全部 noindex。  
• 每个语言页面设置 canonical 和 hreflang。  
• 安全 token、accessKey、邮箱、完整地址和完整 Listing URL 不写入分析事件、页面标题或公开日志。  
• 页面标题、Description、Open Graph 和结构化 FAQ 数据必须有中英文版本。  
• 所有表单 Label 可见，错误与字段语义关联，状态变化使用 aria-live。

# \[PG-EVT\] 二十二、分析事件绑定

首页：homepage\_viewed、language\_changed、search\_focused、input\_started、property\_search\_submitted。  
确认流程：property\_candidate\_selected、unit\_selected、stay\_query\_confirmed、price\_check\_created、confirmation\_required。  
状态和结果：check\_status\_viewed、result\_viewed、insight\_expanded、feedback\_submitted。  
其他：waitlist\_submitted。Contact 提交只保留服务端操作日志，不新增与《业务规则》不同的产品事件。  
后台：exception\_created、exception\_resolved、collection\_started、collection\_failed、analysis\_completed、auto\_publish\_succeeded、auto\_publish\_blocked、result\_published、result\_withdrawn、source\_health\_changed、market\_coverage\_changed。页面点击可以写操作日志，但分析事件名不得另建同义版本。  
事件属性不得包含原始个人数据。

# \[PG-AT\] 二十三、页面验收

PG-AT-001 所有列出的路由可直接访问、刷新和深链接。  
PG-AT-002 用户可在英文或中文完成输入、确认、创建任务、查看状态、收到结果和提交反馈。  
PG-AT-003 正常任务不需要访问后台即可完成。  
PG-AT-004 Exception Inbox 为空时后台不制造人工任务；有异常时可在一个工作区解决。  
PG-AT-005 非新西兰、未开放、数据不足、来源失败和链接过期均有明确页面状态。  
PG-AT-006 结果页展示真实数据时间、置信度、限制和版本，不展示内部评分。  
PG-AT-007 1440px 与 390px 通过视觉与功能验收，无横向滚动。  
PG-AT-008 未批准的 Dashboard、Billing、Monitoring、Team 和自动调价路由不存在。  
