# Tymra by Synix 视觉交互

## 状态：Active — Release 1 Visual & Interaction Baseline v1.2｜基线集合：Tymra Release 1 Codex Build Baseline v1.2｜基线日期：2026-07-16

文档定位：本文件是 Tymra Release 1 的视觉系统、组件和交互实现契约，定义设计令牌、排版、响应式、公开流程、真实结果、Exception Inbox、后台工作台、状态反馈、动效、双语和无障碍。Codex 必须按本文建立共享 UI package 和页面样式，不得使用随机模板、未定义颜色、虚构数据或未经批准的交互模式。UI-\* 标识必须进入 docs/traceability.md，并映射到组件、页面和视觉回归测试。

## 基线控制

本文件属于 Tymra Release 1 Codex Build Baseline v1.2。视觉必须服从《需求说明》的产品边界、《业务规则》的状态语义和《页面结构》的路由层级。本文件只定义视觉令牌、排版、布局、组件状态、操作反馈、动效和无障碍；业务状态名、路由和 CTA 文案仅为上游引用，不在本文件创建新语义。通用颜色、尺寸和组件规则是默认值；页面专用章节的明确数值仅在该页面内优先。只有为满足可访问性、中文排版或响应式安全所必需时才允许局部调整，并保持令牌化。Phase 0 Preview 视觉不再作为当前主流程。

# \[UI-GEN\] 一、设计目标

• 极简、可信、现代，具有住宿市场情报感，不像通用 AI、金融交易或赌场产品。  
• Search Card 是公开网站最强操作入口；真实结果页以日期优先级和解释性为中心。  
• 后台以快速异常决策为中心，不以 KPI Dashboard 为中心。  
• 数据、风险、置信度和错误必须可解释，不能只靠颜色。  
• 使用克制的蓝、青、紫科技渐变，大量留白和清晰层级；不使用大面积黑色、霓虹、复杂 3D 或虚假地图。

# \[UI-BRAND\] 二、品牌与资产

## 2.1 品牌名

正式品牌为 Tymra by Synix。首次出现、Footer、法律页、系统邮件和正式结果保留全名；空间有限的导航可显示 Tymra。

## 2.2 Logo

优先使用仓库中正式 SVG 资产 public/brand/tymra-logo.svg。BrandLogo 组件必须支持 full、compact 和 monochrome 三种模式，提供可访问名称。不得重新设计 Logo、拉伸、旋转或改变品牌颜色。若正式资产尚未提供，生产前必须替换；开发阶段仅允许使用纯文字 Tymra by Synix 回退，不自动生成新图标。

## 2.3 Logo 尺寸

桌面 Header 完整 Logo 高 32px；移动端 28px；后台 compact 28px；最小安全区为标志高度 25%。

# \[UI-TOKEN\] 三、设计令牌

## 3.1 核心颜色

• \--background: \#F8FAFC  
• \--surface: \#FFFFFF  
• \--surface-muted: \#F1F5F9  
• \--surface-elevated: \#FFFFFF  
• \--text-primary: \#0F172A  
• \--text-secondary: \#475569  
• \--text-muted: \#64748B  
• \--border: \#E2E8F0  
• \--border-strong: \#CBD5E1  
• \--navy: \#0B1F3A  
• \--primary: \#2563EB  
• \--primary-hover: \#1D4ED8  
• \--primary-active: \#1E40AF  
• \--primary-soft: \#EFF6FF  
• \--signal-cyan: \#06B6D4  
• \--intelligence-violet: \#7C3AED  
• \--success: \#15803D  
• \--success-soft: \#F0FDF4  
• \--warning: \#D97706  
• \--warning-soft: \#FFFBEB  
• \--review: \#EA580C  
• \--review-soft: \#FFF7ED  
• \--danger: \#DC2626  
• \--danger-soft: \#FEF2F2  
• \--disabled: \#94A3B8

## 3.2 风险令牌

• No clear risk：背景 \#F1F5F9，文字 \#334155，边框 \#CBD5E1。  
• Watch：背景 \#FFFBEB，文字 \#92400E，边框 \#FDE68A。  
• Review：背景 \#FFF7ED，文字 \#9A3412，边框 \#FED7AA。  
• High priority：背景 \#FEF2F2，文字 \#991B1B，边框 \#FECACA。

## 3.3 置信度令牌

• High：背景 \#F0FDF4，文字 \#166534。  
• Medium：背景 \#EFF6FF，文字 \#1E40AF。  
• Low：背景 \#FFFBEB，文字 \#92400E。  
• Insufficient：背景 \#F1F5F9，文字 \#475569。

## 3.4 渐变

主渐变：linear-gradient(135deg,\#2563EB 0%,\#06B6D4 48%,\#7C3AED 100%)。饱和渐变只用于 Logo 资产、轻量 Glow、Hero 局部关键词、抽象数据波纹和有限 CTA 装饰。首页允许使用 \#FFFFFF→\#F8FBFF→\#FFFFFF 的极浅全画布背景渐变与低透明径向光晕；正文、表格和内容卡不得使用大面积饱和渐变。

## 3.5 阴影

• shadow-sm: 0 1px 2px rgba(15,23,42,.05)  
• shadow-card: 0 8px 30px rgba(15,23,42,.08)  
• shadow-popover: 0 16px 40px rgba(15,23,42,.14)  
• focus-ring: 0 0 0 4px rgba(37,99,235,.18)

## 3.6 圆角

8px 用于小标签；12px 用于输入、按钮和表格控件；16px 用于普通卡片；20px 用于大型流程卡片；24px 用于 Search Card 和结果重点容器；999px 用于 Pill。

## 3.7 间距

使用 4px 基础体系：4、8、12、16、20、24、32、40、48、64、80、96、128px。页面 Section 默认桌面上下 96px、移动 64px；卡片内部默认 24px，移动 20px。

# \[UI-TYPE\] 四、排版

## 4.1 字体

英文和数字使用 Inter；简体中文使用 Noto Sans SC、PingFang SC 或系统无衬线回退。使用 next/font 或本地安全加载，不向用户分发字体文件。

## 4.2 类型层级

• Display：64/68，700；移动 42/48，700。  
• H1：44/52，700；移动 32/40。  
• H2：32/40，650；移动 26/34。  
• H3：24/32，650；移动 22/30。  
• Card title：18/26，600。  
• Body large：18/30，400。  
• Body：16/26，400。  
• Body small：14/22，400。  
• Label：14/20，600。  
• Meta：12/18，500。

## 4.3 数字

价格、日期和数据列使用 tabular-nums。金额默认显示整数；只有原始业务需要时显示两位小数。价格区间使用 NZ$210–225，不使用无意义精度。

## 4.4 中文

不得为容纳中文而缩小字号；优先增加高度和换行。中文标题字重可比英文低一档。英文术语首次出现可带中文解释，Property、Sellable Unit、Price Check、Confidence 等关键术语保持统一词汇。

# \[UI-LAYOUT\] 五、画布与响应式

## 5.1 Breakpoints

Mobile ≤767px；Tablet 768–1023px；Desktop ≥1024px；Large desktop QA 1440px。额外 QA：320px、390px、430px、768px、1024px、1280px、1440px。

## 5.2 宽度与边距

公开页面 max-width 1280px；正文阅读宽 720px；桌面水平 gutter 32px，≤1279px 为 24px，移动 16px。后台内容区最小安全宽度 1024px，但 768px 以下仍支持紧急操作。

## 5.3 Grid

公开首页桌面采用全幅居中构图，Data Signal Landscape 作为背景层，不使用固定 7/5 分栏；Search Card 最大宽约 1200px，Capability 区最大宽约 1240px。流程页使用 max-width 880px 单主列。结果页桌面主内容 8 栏、上下文 4 栏。后台异常工作区建议 280px / minmax(480px,1fr) / 360px。

## 5.4 安全区

Sticky、Drawer 和底部操作条必须适配 env(safe-area-inset-\*），不得遮挡键盘、系统手势区或错误信息。任何页面不得产生横向滚动。

# \[UI-COMP\] 六、共享组件实现规则

## 6.1 技术映射

使用 Tailwind CSS 设计令牌和 shadcn/ui primitives。基础组件由 packages/ui 输出；页面不得复制同类组件样式。使用 class-variance-authority 管理 variants，lucide-react 提供图标，Motion 仅用于必要过渡。

## 6.2 Button

Variants：primary、secondary、tertiary、destructive、ghost。Sizes：sm 36px、md 44px、lg 52px、search 56px。必须实现 default、hover、active、focus-visible、disabled、loading。Primary 为纯蓝色实心，主渐变不能作为所有按钮默认背景。

## 6.3 FormField

结构固定：Label、Control、Description、Error。Label 始终可见；Placeholder 只作示例。输入高度默认 48px，Search 56px。Error 不改变页面整体宽度，使用 aria-describedby 和 aria-invalid。

## 6.4 SearchCard

白色 Surface、24px radius、1px Border、shadow-card；桌面输入和 CTA 同行，移动单列。包含输入、清除、域名/地址提示、主 CTA、范围说明和服务同意入口。加载状态保持尺寸稳定。

## 6.5 CandidateCard

用于 Property 和 Unit。包含单选控件、名称、地址/容量、类型、来源、匹配说明和状态。Selected 使用 primary border 和 soft background；不得整卡高饱和填充。整卡可点击且键盘可操作。

## 6.6 Stepper

步骤为 Property、Unit、Query、Processing、Result。只显示真实已完成和当前步骤；不得用虚假百分比。移动端显示当前步骤与“Step x of y”。

## 6.7 StatusPanel

Variants：processing、confirmation、partial、insufficient、unsupported、source-unavailable、failed、cancelled、expired、withdrawn、ready。包含图标、标题、说明、时间、Reference ID 和动作。组件 variant 必须由《业务规则》的 canonical status 映射；可预期业务状态不使用 Danger 视觉。

## 6.8 Badge

包括 RiskBadge、ConfidenceBadge、StatusBadge、DataSourceStatusBadge、SourceHealthBadge、MarketStatusBadge。高度 24–28px，图标 14px，文字 12–13px。所有语义同时用文字和图标；Provider 生命周期和运行健康状态不得共用同一枚举。

## 6.9 InsightCard

显示日期、RiskBadge、目标价、竞品区间、Reason Codes、信号、建议、Confidence 和限制。默认紧凑摘要，展开后显示三段解释。High priority 不使用整卡红底，只使用左侧 4px 标识、Badge 和浅色背景。

## 6.10 PriceComparison

目标价格与竞品中位价/区间左右或上下并列；标签明确，不能只用颜色。可使用简洁刻度条，但不使用夸张仪表盘、Gauge 或收入损失数字。

## 6.11 SignalChip

显示 Signal 类型、日期范围和区域；浅色中性或信息型样式。活动不能使用红色 Risk 样式。

## 6.12 FeedbackControl

使用可多选按钮或单选卡片；提交后显示 inline success 与 Undo。Report issue 打开 Dialog，保留 Check ID 和 Insight 上下文，不要求账户。

## 6.13 DataTable

后台使用可排序表头、固定筛选区、行选择、分页和 Empty State。默认行高 48px；紧凑模式 40px。P0/P1 使用左侧语义标识而非整行红色。移动端转换为卡片列表。

## 6.14 Drawer 与 Dialog

Drawer 用于详情和移动端上下文；Dialog 用于确认不可逆操作。焦点锁定、Escape、返回焦点和屏幕阅读器标题必须完整。

## 6.15 Toast

只用于非阻塞确认；错误和需用户修正的问题必须在页面内显示。Toast 最多同时 3 个，自动消失前保持足够阅读时间。

## 6.16 Skeleton

结构与真实内容一致，禁止用无意义旋转 Logo 或大面积 shimmer。prefers-reduced-motion 下不播放 shimmer。

# \[UI-HOME\] 七、公开首页视觉

## 7.1 适用范围与复用边界

本章是当前已确认桌面首页的唯一视觉与交互基线，只定义画布、排版、层级、组件状态、动效和操作反馈，不定义业务范围、路由、数据、状态语义或文案承诺。本章的桌面首页专用数值优先于通用令牌；其他页面可以复用颜色、玻璃表面、焦点和反馈原则，但不自动继承超大 Hero、全幅数据景观或首页内容结构。

## 7.2 整体视觉语言

• 主画布使用白色至极浅蓝再回到白色的低对比纵向渐变，并叠加低透明度蓝、青、紫径向光晕；整体保持明亮、开放、克制，不使用暗色首屏、霓虹、复杂 3D 或持续干扰装饰。  
• 首页主文字使用 \#071A3D／\#0B1F3A，次级文字使用 \#26385E／\#41506B，输入提示使用 \#60708A；主蓝使用 \#0969FF／\#2563EB，信号青使用 \#06B6D4／\#18C8E8，智能紫使用 \#7C3AED／\#8B35FF。  
• 层次由半透明白色表面、\#DDE7F5 冷色边框、backdrop-blur 和柔和蓝紫阴影建立。渐变只用于标题中的一个短语、主操作、玻璃边缘和背景光晕；正文与信息卡保持中性。

## 7.3 Header

• 以 1440×900 为桌面视觉基准。Header 高 88px，外层最大宽约 1440px，左右安全边距 30px；顶部保持透明、开放，不做常驻粘性栏。  
• 完整 Logo 左对齐，展示宽约 152px、高约 53px；导航、语言控制和主操作在右侧形成清晰但克制的水平序列。  
• 导航默认深海军蓝，Hover 转主蓝；所有可交互项保留清晰 Focus Ring。主操作高 48px、圆角约 13px，使用蓝—紫渐变；在首页激活后平滑定位并聚焦核心输入区域。

## 7.4 Hero 与 Data Signal Landscape

• Hero 使用全幅居中构图，内容宽度约 1020px；顺序为小型胶囊标签、两行主标题、说明文字和 Search Card。主标题最大宽约 920px，在 1440px 画布上约 69/72、800，仅最后一个短语使用蓝—青渐变。  
• Data Signal Landscape 位于 Hero 与 Search Card 背后，顶部约 150px、高约 610px；使用抽象线条、节点、波纹和低饱和雾化光，不承载真实地图、覆盖或数据含义。  
• 背景装饰不接收指针或键盘事件，并对辅助技术隐藏。默认保持低对比；输入或加载状态下可略微增强饱和度与活动感，但不能表达业务进度。  
• 1440×900 首屏完整呈现 Header、Hero 和 Search Card，并露出下一组能力卡顶部，形成自然的继续浏览提示。

## 7.5 Search Card

• Search Card 居中，桌面最大宽约 1200px，Hero 下间距约 58px；外圆角 30px，使用 1px 蓝—青—紫渐变边缘，内层约 29px 圆角、半透明白色玻璃表面和大范围柔和阴影。  
• 桌面主行由 64×64px 图标区、可伸缩输入、1px 分隔线和主按钮组成。主按钮高 64px、最小宽约 258px、圆角 14px；下方四等分辅助信息行使用蓝色图标和竖向分隔线。  
• Idle 保持中性边框；Focus/Typing 增强边框与蓝色光晕；有输入时显示清除控件。Loading 禁用输入并保持卡片和按钮尺寸稳定，按钮使用 Spinner 与动作文本，不产生布局跳动。  
• 完成和错误反馈在同一卡片内联展开，不使用模态框。字段错误与输入关联；清除、编辑或重试后，焦点返回可继续操作的位置。

## 7.6 Capability 与步骤状态

• Capability 区桌面四列，整体最大宽约 1240px；单卡最小高约 232px、圆角 18px，使用约 72% 白色玻璃表面、\#DDE7F5 边框和轻柔阴影。  
• 默认卡片保持安静；激活时使用 \#A9CDFD 边框、蓝青光晕和图标外环。交互开始后可以短间隔依次激活，但该序列只表达界面响应，不代表真实完成度。  
• 三步视觉采用横向卡片与连接箭头。Pending 为中性；Active 增强蓝色边框和光晕；Completed 将步骤编号改为蓝色实心与勾选。状态同时依靠文字或图标，不只依赖颜色。  
• 可交互卡片支持键盘并显示 Focus Ring；纯展示卡不伪装成按钮。

## 7.7 FAQ、Final CTA 与 Footer

• FAQ 使用单项展开 Accordion。容器圆角约 15px、冷色边框和半透明白色；整行可触发，Chevron 展开时旋转 180°，Hover 与 Focus 状态清晰。  
• Final CTA 使用横向玻璃卡，圆角约 16px，配 86px 图标圆形底座；主按钮高 56px、圆角 12px、蓝—紫渐变，次操作降级为文字或中性按钮。Hover 位移不超过 2px。  
• Footer 使用深海军蓝渐变背景和五列桌面结构；Logo、分组标题、链接与语言控制保持高对比浅色，链接 Hover/Focus 清楚可辨。

## 7.8 动效、反馈与无障碍

• 首次进入采用 320–480ms ease-out 的淡入与 4–14px 轻微位移，并使用短延迟建立层级；首页微交互控制在 180–300ms。禁止弹跳、长时间旋转、大幅缩放和庆祝式动画。  
• Capability 卡可以短间隔顺序激活；画布只提供低强度连续流动。动效只能表达当前活动或界面响应，不能伪造完成度、倒计时或进度百分比。  
• prefers-reduced-motion 下取消位移、缩放、自动滚动和持续画布动画，保留即时状态变化、必要 Spinner 与文字更新。  
• 所有交互目标至少 44×44px，支持键盘操作和可见焦点；装饰图标对辅助技术隐藏，只有图标的按钮必须提供可访问名称。

# \[UI-CHECK\] 八、真实检查流程视觉

## 8.1 创建页

单主列 760–880px；顶部保留简洁 Stepper。Search、Email 和 Consent 分组，主 CTA 全宽或右对齐。服务同意为说明文本，营销同意独立未选 Checkbox。

## 8.2 Property 与 Unit 候选

桌面候选两列，移动单列。最多首屏显示 6 个；更多使用分页或“Show more”。候选来源作为 Meta，不将平台 Logo 作为主要视觉。

## 8.3 Query

使用四个清晰字段组和摘要卡。未来 30 天为只读范围；更改人数或晚数时显示信息提示，不用警告色。

## 8.4 Processing

显示真实 Stepper、当前状态、最后更新时间、Check ID、脱敏邮箱和可关闭页面说明。状态图标可轻微旋转或脉冲，但不显示百分比、倒计时或“AI thinking”。

## 8.5 Confirmation Required

明确指出需要确认的单一事项；保留前序摘要。主 CTA 指向相应确认页，次要动作 Contact。

## 8.6 Source Unavailable / Retry Later

SOURCE\_UNAVAILABLE 使用 Information/Warning 视觉，用户标题可以使用 Retry later；显示最近尝试时间、系统是否自动重试、邮件通知和 Retry。不得将其作为 FAILED，也不得使用 Fatal Error 插图。

# \[UI-RESULT\] 九、结果页视觉

## 9.1 Result Header

浅色背景、清晰 Property 与 Unit；Meta 行显示 Stay Query、Generated at、Data last checked 和 Analysis version。Confidence 在标题区右侧或下方，不使用巨大圆环分数。

## 9.2 Summary

三个或四个摘要项：Overall Confidence、Date range、Comparable count、Result type。仅展示真实数据。Partial 使用明显但克制的范围说明。

## 9.3 Priority List

最多 5 张 InsightCard。桌面按列表纵向排列，不使用五列小卡。每张卡的日期是视觉锚点，风险为辅助。价格使用 tabular-nums，Reason Codes 用短句翻译，不暴露内部枚举。

## 9.4 Insight Detail

展开后依次显示：What changed／发生了什么；Why it matters／为什么重要；Suggested action／建议做什么；Evidence；Limitations。信号卡处于证据区，不凌驾于价格和可售变化。

## 9.5 Insufficient 与 Partial

Insufficient 显示无法建议的原因、已检查内容和下一步，不显示空图表。Partial 将可靠日期与不可用日期分开，可靠范围使用正常结果组件。

## 9.6 Version Banner

Superseded 使用 Information Banner，提供 View latest result；Withdrawn 使用 Warning Banner 和 Contact；Expired/Invalid 页面不显示 Property 摘要。

## 9.7 Feedback

页面底部独立浅色区，不干扰结果阅读。按钮尺寸至少 44px，手机单列或两列。

# \[UI-STATE\] 十、状态语义

## 10.1 Processing

Queued、Collecting、Normalizing、Analysing、Auto-validating 使用 Information 色和真实文字。动画仅显示活动，不表达虚假完成度。

## 10.2 Business Status

Needs confirmation、Partial、Insufficient、Unsupported、Coming soon、SOURCE\_UNAVAILABLE（用户文案 Retry later）、Cancelled、Expired 和 Withdrawn 使用 Information 或 Warning。只有 Failed 和明确安全问题使用 Danger；Withdrawn 必须阻止继续查看旧结果。

## 10.3 Success

Ready 和 Published 使用 Success，但不使用庆祝动画或夸张绿色整屏。

## 10.4 Empty

空状态包含明确标题、解释和一个主要动作。Exception Inbox 空状态应积极但克制：No exceptions need attention。

# \[UI-OPS\] 十一、后台视觉系统

## 11.1 Admin Shell

桌面侧栏宽 248px，顶部栏高 64px；Canvas 使用 \#F8FAFC，内容卡白色。侧栏分组：Work、Market、Operations、Governance。当前项使用 primary-soft 背景和蓝色左标。

## 11.2 Top Bar

全局搜索、Source Health 汇总、Auto-publish 状态、系统状态和用户菜单。自动发布开关为高影响控制，切换必须 Dialog 确认并说明影响。

## 11.3 Exception Inbox

页面标题、开放数量、筛选和列表。不要用大面积 KPI。Priority、Type、System Recommendation 和 Age 是主列。默认 OPEN/IN\_PROGRESS，P0/P1 用小型语义标识。

## 11.4 Exception Workspace

桌面三栏：左 280px 异常摘要和影响；中间最小 480px 冲突数据和证据；右 360px 结果预览、动作和审计。Verified 内容折叠，Conflict 使用边框和浅背景高亮。Tablet 中右栏改 Drawer；Mobile 单列按 Summary→Evidence→Decision 排列。

## 11.5 DiffField

显示 Current、Suggested、Source、Updated at 和 Impact。差异字符可高亮，但不能只用红绿。可接受建议、编辑或恢复。

## 11.6 Action Bar

右栏底部 Sticky；Primary 只用于当前推荐的安全动作。Approve and publish 与 Withdraw 属高影响动作，必须显示最终状态和确认。完成后 Toast \+ 自动下一任务。

## 11.7 Keyboard

J/K 下一/上一任务；A 接受建议；R Recollect；E Edit；P Publish，仅在按钮可用时生效。快捷键必须可发现、可关闭且不覆盖浏览器保留键。

## 11.8 Price Check Detail

Tabs 使用水平可滚动但无页面横向溢出。Observation 表格固定日期、来源和质量列；Result Versions 显示版本状态与发布时间；Audit 使用时间线。

## 11.9 Market Coverage

用指标卡和表格显示覆盖率、成功率、来源健康和更新时间；不使用夸张地图。区域边界可用简单标签或小地图，但无地理资产时优先表格。

## 11.10 Data Source Health

DataSourceStatusBadge 显示 PILOT、SUSPENDED、DISABLED、DEPRECATED、UNKNOWN；SourceHealthBadge 显示 HEALTHY、DEGRADED、DOWN。每项同时显示 Last success、Error rate 和 Retention。来源未启用或运行状态为 BLOCKED/DOWN 时使用 Warning/Danger 并禁止自动发布。

# \[UI-FORM\] 十二、表单与操作反馈

• 主操作每页只保留一个 Primary；并列危险操作不得同级。  
• Loading 按钮保留原宽并显示 Spinner 与动词。  
• 所有异步写操作防重复点击；成功后禁用或更新状态。  
• 409 Conflict 显示“数据已更新”并提供 Reload；429 显示可重试时间；503 显示来源或服务暂不可用。  
• 删除、撤回、合并身份、暂停自动发布和启用来源必须使用确认 Dialog。

# \[UI-MOTION\] 十三、动效

## 13.1 时长

Micro 120–180ms；组件状态 180–250ms；Drawer/Dialog 220–300ms；Hero 初次进入 300–500ms。使用 ease-out 或标准 spring，避免弹跳。

## 13.2 允许

淡入、轻微位移 4–12px、Collapse、颜色和边框过渡、状态 Spinner、节点低速流动。

## 13.3 禁止

长时间旋转、倒计时、伪造进度、复杂粒子、3D 翻转、大幅缩放、庆祝撒花和持续干扰背景。

## 13.4 Reduced Motion

prefers-reduced-motion 下取消位移、缩放、波纹、自动滚动和持续节点流动；保留即时状态、必要 Spinner 或文本更新。

# \[UI-A11Y\] 十四、无障碍

• 普通文字对比度至少 4.5:1，大文字 3:1；Focus Indicator 至少 3:1。  
• 所有交互可键盘完成，Focus Ring 不可移除；跳转主内容链接必须存在。  
• 触控目标至少 44×44px；图标按钮有 aria-label 和 Tooltip。  
• 状态更新通过 aria-live polite；阻塞错误使用 assertive，但避免重复播报。  
• 表单错误与字段关联；错误摘要链接到首个错误。  
• 表格提供 Caption、Scope 和键盘可达排序；移动卡片保留同等信息。  
• Drawer、Dialog 和 Dropdown 正确管理焦点；关闭后返回触发元素。  
• Risk、Confidence、Source Health 和 Diff 不只依赖颜色。

# \[UI-I18N\] 十五、国际化与内容

## 15.1 文案来源

所有 UI 文案来自 next-intl message files，不在组件中硬编码。枚举通过统一翻译映射渲染；API 只返回机器代码和必要数据。

## 15.2 日期与数字

使用 en-NZ 和 zh-NZ locale；日期使用 Property 时区；金额使用 NZD。英文可用 14 Jul 2026，中文可用 2026年7月14日。

## 15.3 长文案

按钮禁止截断核心动作；卡片标题最多两行；Meta 可以省略但提供 Tooltip；地址在隐私允许的页面可两行截断，结果和后台可展开查看。

## 15.4 语气

优先 may、could、review、monitor、insufficient data；避免 guaranteed、perfect、instant、live、AI knows 和 maximise revenue。中文使用“可能”“建议检查”“数据不足”，不写成确定事实。

# \[UI-SEO\] 十六、SEO 与安全显示

• Public 可索引页面具有中英文 metadata、canonical、hreflang 和 Open Graph。  
• Check、Status、Result、Waitlist Success 和 Admin 页面 noindex。  
• Token、accessKey、邮箱、完整地址和完整 Listing URL 不进入页面标题、analytics、客户端日志或错误截图。  
• 错误页只显示 Reference ID，不暴露堆栈、SQL、供应商响应或内部权重。

# \[UI-IMPL\] 十七、实现规范

## 17.1 组件目录

packages/ui 至少包含 BrandLogo、Button、FormField、SearchCard、CandidateCard、Stepper、StatusPanel、RiskBadge、ConfidenceBadge、StatusBadge、DataSourceStatusBadge、SourceHealthBadge、MarketStatusBadge、InsightCard、PriceComparison、SignalChip、FeedbackControl、DataTable、DiffField、EmptyState、ErrorState、SystemBanner、Drawer、Dialog 和 Toast。

## 17.2 页面组合

apps/web 页面只组合共享组件和业务容器；不得在每页创建新的按钮、Badge 或卡片视觉。业务容器可以位于 apps/web/features/{feature}。

## 17.3 CSS

颜色和间距使用 CSS variables 与 Tailwind theme，不在 JSX 内写十六进制颜色。支持 dark mode 不是 Release 1 范围，不创建未验收的暗色主题。

## 17.4 图标

只使用 lucide-react 或正式品牌资产。相同语义使用相同图标；不混用多个图标库。

## 17.5 数据展示

生产页面不得使用 lorem ipsum、随机 KPI、虚构房源或假价格。开发 Story/fixture 必须明确标记 Demo，并不得打包到生产数据路径。

# \[UI-QA\] 十八、视觉 QA 矩阵

## 18.1 必测公开画面

英文和中文：Home、Check Idle、Validation Error、Property Candidates、Unit Selection、Query、Processing（含 Normalizing）、Needs Confirmation、Ready、Normal Result、Partial Result、Insufficient、Unsupported、Source Unavailable / Retry Later、Cancelled、Expired Result、Withdrawn Result、Waitlist、Methodology、FAQ、Contact 和法律页。

## 18.2 必测后台画面

Sign in、Exception Inbox 有数据/空状态、每个 Exception Type 的工作区、Price Check Detail、Market Coverage、Collection Runs、Data Source 状态 PILOT/SUSPENDED/DISABLED/DEPRECATED/UNKNOWN、Health 状态 HEALTHY/DEGRADED/DOWN、Signals、Feedback、Audit、403 和 System Error。

## 18.3 尺寸

至少验证 1440×900、1280×800、1024×768、768×1024、430×932、390×844 和 320×568。所有页面不得横向滚动；中文不得溢出或遮挡。

## 18.4 交互状态

Button、Input、Checkbox、Select、CandidateCard、Tabs、Table、Drawer、Dialog、Toast 和反馈控件必须验证 hover、focus-visible、pressed、disabled、loading、error 和 success。

## 18.5 自动化验收

Playwright 截图覆盖 Home、Check flow、Status、Result、Exception Inbox 和 Exception Workspace 的英文/中文桌面及移动关键状态。axe 或同等工具不得有 critical 或 serious 违规。

# \[UI-AT\] 十九、最终视觉验收

UI-AT-001 Search Card 是公开首页最强入口。  
UI-AT-002 真实任务状态准确，不出现 Preview Complete 或伪造秒级结果。  
UI-AT-003 结果页先呈现上下文、置信度和重点日期，不使用巨大风险分数或损失收入。  
UI-AT-004 Exception Inbox 只呈现异常，单个异常可在一屏完成决策。  
UI-AT-005 中英文、桌面、Tablet 和移动端保持同一设计系统。  
UI-AT-006 风险、置信度、差异和错误不只依赖颜色。  
UI-AT-007 所有动效支持 Reduced Motion。  
UI-AT-008 生产界面不含 Demo 数据、虚假指标、未上线功能入口或未批准承诺。  
