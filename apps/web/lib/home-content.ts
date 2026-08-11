import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Info,
  ListChecks,
  MapPin,
  Search,
  ShieldCheck,
  Signal,
} from "lucide-react";

export type Locale = "en" | "zh";
export type InsightTone = "blue" | "violet" | "cyan";

type HomeLink = { label: string; href: string };

export type HomeCopy = {
  meta: { title: string; description: string };
  nav: {
    howItWorks: string;
    whatYouGet: string;
    pricing: string;
    methodology: string;
    faq: string;
    contact: string;
    language: string;
    languageHref: string;
    languageAria: string;
    menuOpen: string;
    menuClose: string;
    primaryNavigation: string;
    mobileNavigation: string;
    signIn: string;
    account: string;
    signOut: string;
  };
  hero: { badge: string; titlePrefix: string; titleAccent: string; subtitle: string };
  sections: {
    insights: { eyebrow: string; title: string; body: string; swipeHint: string };
    process: { eyebrow: string; title: string; body: string };
    faq: { eyebrow: string; title: string; body: string };
  };
  search: {
    label: string;
    placeholder: string;
    mobilePlaceholder: string;
    cta: string;
    working: string;
    clear: string;
    validations: Record<"empty" | "short" | "long" | "unsupportedUrl", string>;
    facts: Array<{ icon: typeof Info; text: string }>;
    addressCta: string;
  };
  insights: Array<{
    title: string;
    body: string;
    detail: string;
    icon: typeof ShieldCheck;
    tone: InsightTone;
  }>;
  process: Array<{ label: string; body: string; icon: typeof ShieldCheck }>;
  methodology: { eyebrow: string; title: string; body: string; points: string[]; link: string };
  coverage: { eyebrow: string; title: string; body: string; statuses: string[] };
  faq: Array<{ question: string; answer: string }>;
  finalCta: { title: string; body: string; note: string; primary: string; secondary: string };
  footer: {
    copyright: string;
    product: string;
    resources: string;
    legal: string;
    language: string;
    links: { product: HomeLink[]; resources: HomeLink[]; legal: HomeLink[] };
  };
};

export const homeCopy: Record<Locale, HomeCopy> = {
  en: {
    meta: {
      title: "Tymra by Synix | Accommodation Pricing Intelligence",
      description: "Find the dates your New Zealand accommodation may be selling too cheaply with explainable pricing intelligence.",
    },
    nav: {
      howItWorks: "How It Works",
      whatYouGet: "What You’ll Get",
      pricing: "Plans & Pricing",
      methodology: "Methodology",
      faq: "FAQ",
      contact: "Contact",
      language: "中文",
      languageHref: "/zh",
      languageAria: "Switch to Chinese",
      menuOpen: "Open navigation",
      menuClose: "Close navigation",
      primaryNavigation: "Primary navigation",
      mobileNavigation: "Mobile navigation",
      signIn: "Member Sign In",
      account: "Account",
      signOut: "Sign out",
    },
    hero: {
      badge: "ACCOMMODATION PRICING INTELLIGENCE",
      titlePrefix: "How much revenue are you",
      titleAccent: "leaving?",
      subtitle: "Find the dates you may be selling too cheaply.",
    },
    sections: {
      insights: {
        eyebrow: "What you’ll get",
        title: "A useful first signal, not a black box",
        body: "See which dates deserve attention, what the market context suggests and where to look next.",
        swipeHint: "Swipe to explore all four signals",
      },
      process: {
        eyebrow: "Three simple steps",
        title: "From a listing or address to a formal report",
        body: "Start with a supported public listing or a real New Zealand address. Tymra keeps each path explicit and explains every next step.",
      },
      faq: {
        eyebrow: "Common questions",
        title: "Know what happens before you start",
        body: "Clear answers about supported listings, timing, evidence and what Tymra will never change automatically.",
      },
    },
    search: {
      label: "Paste a supported New Zealand OTA listing URL",
      placeholder: "Paste a supported OTA listing URL",
      mobilePlaceholder: "Paste an OTA listing link",
      cta: "Check This Listing",
      working: "Checking listing",
      clear: "Clear search",
      validations: {
        empty: "Paste a supported OTA listing URL to start.",
        short: "Paste the complete OTA listing URL.",
        long: "Keep the listing URL under 500 characters.",
        unsupportedUrl: "Use a valid public listing URL from a supported OTA.",
      },
      facts: [
        { icon: MapPin, text: "New Zealand addresses supported" },
        { icon: CreditCard, text: "No credit card required" },
        { icon: Clock3, text: "No dates or room setup" },
        { icon: ShieldCheck, text: "No automatic price changes" },
      ],
      addressCta: "No listing link? Benchmark a New Zealand address",
    },
    insights: [
      { title: "Low-price Risks", body: "Identify dates that may deserve a closer pricing review.", detail: "Flagged dates and risk level", icon: ShieldCheck, tone: "blue" },
      { title: "Comparable Range", body: "Understand your position against relevant comparable accommodation.", detail: "Market position and range", icon: BarChart3, tone: "violet" },
      { title: "Market Signals", body: "Review supporting changes in prices, availability and important dates.", detail: "Demand context and evidence", icon: Signal, tone: "cyan" },
      { title: "Suggested Actions", body: "See a cautious next step with confidence and clear limitations.", detail: "Prioritised review actions", icon: ListChecks, tone: "violet" },
    ],
    process: [
      { label: "Choose your starting point", body: "Use a supported public OTA link, or start from a real New Zealand address.", icon: Search },
      { label: "See the right market view", body: "OTA links can show a rough listing signal; addresses produce a clearly labelled neighbourhood benchmark.", icon: BarChart3 },
      { label: "Unlock the formal report", body: "Verify one email to create your secure customer access and start the formal check.", icon: CheckCircle2 },
    ],
    methodology: {
      eyebrow: "Transparent by design",
      title: "Comparable evidence, explained clearly",
      body: "Tymra starts from the listing's observed default display context, then uses reliable evidence for the formal report.",
      points: ["Effective nightly totals include known mandatory fees", "Confidence reflects freshness, completeness and comparability", "Operators retain every final pricing decision"],
      link: "Read the methodology",
    },
    coverage: {
      eyebrow: "Initial market coverage",
      title: "Starting with Christchurch",
      body: "Christchurch and configured surrounding areas are the first supported market. Other New Zealand areas are shown honestly according to available coverage.",
      statuses: ["Supported", "Pilot available", "Coming soon", "Insufficient market data"],
    },
    faq: [
      { question: "Does Tymra provide real pricing results?", answer: "Yes, when the property and market are supported and source data meets the required quality thresholds. Tymra returns a clear limited state rather than inventing a result when evidence is insufficient." },
      { question: "Which properties does Tymra support?", answer: "You can start with a public accommodation link from Booking.com, Airbnb, Expedia, Bookabach, Agoda or Trip.com, or with a real New Zealand address. An address result shows observed nearby public prices as a neighbourhood benchmark; it never presents them as the property's own rate." },
      { question: "How long does a Price Check take?", answer: "The rough signal normally appears in-page first. After you verify one email, the formal check runs asynchronously and opens in your secure customer account." },
      { question: "Does Tymra automatically change my prices?", answer: "No. Tymra provides decision support only. You remain responsible for every final pricing decision." },
      { question: "Where does the information come from?", answer: "Only enabled, operationally healthy sources can support publication. Results show data timing, confidence and relevant limitations." },
      { question: "Why are only New Zealand properties supported?", answer: "Release 1 is intentionally focused on New Zealand so property matching, comparable evidence and market coverage can be validated properly." },
      { question: "What happens when market evidence is limited?", answer: "If at least one valid target OTA price is collected, Tymra returns that observed price. Recommendation availability and confidence are assessed separately, and Tymra never invents missing evidence." },
    ],
    finalCta: {
      title: "Find the dates you may be selling too cheaply.",
      body: "Start with a supported OTA link, or use a New Zealand address for a neighbourhood benchmark.",
      note: "OTA links can show a rough result before email. Address benchmarks keep nearby prices separate from the property's own rate.",
      primary: "Start a Price Check",
      secondary: "Benchmark an Address",
    },
    footer: {
      copyright: "© 2026 Synix. All rights reserved.", product: "Product", resources: "Resources", legal: "Legal", language: "中文",
      links: {
        product: [{ label: "Free Price Check", href: "/en/check" }, { label: "Plans & Pricing", href: "/en/pricing" }, { label: "How It Works", href: "/en#how-it-works" }, { label: "What You’ll Get", href: "/en#what-you-get" }],
        resources: [{ label: "Methodology", href: "/en/methodology" }, { label: "FAQ", href: "/en/faq" }, { label: "Contact", href: "/en/contact" }],
        legal: [{ label: "Privacy Policy", href: "/en/privacy" }, { label: "Terms of Use", href: "/en/terms" }, { label: "Cookie Notice", href: "/en/cookies" }, { label: "Disclaimer", href: "/en/disclaimer" }, { label: "Data Deletion", href: "/en/delete-data" }],
      },
    },
  },
  zh: {
    meta: {
      title: "Tymra by Synix | 住宿价格情报",
      description: "帮助新西兰住宿经营者发现可能卖便宜的重点日期，并获得可解释的价格情报。",
    },
    nav: {
      howItWorks: "工作原理", whatYouGet: "可获得内容", pricing: "会员方案", methodology: "方法说明", faq: "常见问题", contact: "联系我们", language: "English", languageHref: "/en", languageAria: "切换到英文", menuOpen: "打开导航", menuClose: "关闭导航", primaryNavigation: "主导航", mobileNavigation: "移动端导航", signIn: "会员登录", account: "会员账户", signOut: "退出",
    },
    hero: {
      badge: "住宿定价智能",
      titlePrefix: "你的哪些高价值日期",
      titleAccent: "可能卖便宜了？",
      subtitle: "快速发现低价风险、竞品差距和市场上涨信号。",
    },
    sections: {
      insights: {
        eyebrow: "你将获得",
        title: "先看清值得检查的重点",
        body: "快速了解哪些日期值得关注、市场环境释放了什么信号，以及下一步应优先检查什么。",
        swipeHint: "左右滑动，查看全部四项信号",
      },
      process: {
        eyebrow: "三个简单步骤",
        title: "从房源链接或地址到正式报告",
        body: "从受支持的公开房源链接或真实的新西兰地址开始。Tymra 会明确区分两条路径，并清楚说明每一步。",
      },
      faq: {
        eyebrow: "常见问题",
        title: "开始前，先把关键问题说清楚",
        body: "了解支持范围、检查时间、证据来源，以及 Tymra 绝不会自动执行的操作。",
      },
    },
    search: {
      label: "粘贴受支持的新西兰 OTA 房源链接",
      placeholder: "粘贴受支持的 OTA 房源链接",
      mobilePlaceholder: "粘贴 OTA 房源链接",
      cta: "检查这个房源",
      working: "正在检查房源",
      clear: "清除搜索",
      validations: {
        empty: "请粘贴受支持的 OTA 房源链接。",
        short: "请粘贴完整的 OTA 房源链接。",
        long: "请将房源链接控制在 500 个字符以内。",
        unsupportedUrl: "请使用受支持 OTA 的有效公开房源链接。",
      },
      facts: [
        { icon: MapPin, text: "支持新西兰真实地址" },
        { icon: CreditCard, text: "无需信用卡" },
        { icon: Clock3, text: "无需设置日期或房型" },
        { icon: ShieldCheck, text: "不会自动修改价格" },
      ],
      addressCta: "没有房源链接？查询新西兰地址周边行情",
    },
    insights: [
      { title: "低价风险", body: "识别可能值得优先检查价格的日期。", detail: "重点日期与风险等级", icon: ShieldCheck, tone: "blue" },
      { title: "竞品价格区间", body: "了解房价在相关可比住宿中的位置。", detail: "市场位置与价格区间", icon: BarChart3, tone: "violet" },
      { title: "市场信号", body: "查看价格、可售状态和重要日期的辅助变化。", detail: "需求环境与证据依据", icon: Signal, tone: "cyan" },
      { title: "建议动作", body: "结合置信度和明确限制查看谨慎的下一步。", detail: "按优先级排列的检查建议", icon: ListChecks, tone: "violet" },
    ],
    process: [
      { label: "选择开始方式", body: "使用受支持的公开 OTA 房源链接，或从真实的新西兰地址开始。", icon: Search },
      { label: "查看对应市场视图", body: "OTA 链接可先显示粗略房源信号；地址结果会明确标记为周边行情基准。", icon: BarChart3 },
      { label: "解锁正式报告", body: "验证一次邮箱即可建立安全客户访问并开始正式检查。", icon: CheckCircle2 },
    ],
    methodology: {
      eyebrow: "方法透明",
      title: "清楚解释可比证据",
      body: "Tymra 先使用房源链接的默认展示配置，再通过可靠证据生成正式报告。",
      points: ["有效每晚总价包含已知强制费用", "置信度反映数据新鲜度、完整性和可比性", "最终定价决定始终由经营者作出"],
      link: "查看方法说明",
    },
    coverage: {
      eyebrow: "首个市场覆盖范围",
      title: "从基督城开始",
      body: "基督城及已批准周边是首个正式支持市场。其他新西兰地区会根据真实覆盖能力显示明确状态。",
      statuses: ["已支持", "可申请试点", "即将开放", "市场数据不足"],
    },
    faq: [
      { question: "Tymra 会提供真实价格结果吗？", answer: "会。房源和市场受支持，并且数据满足质量门槛时，Tymra 会生成真实结果；证据不足时会明确返回受限状态，而不是编造结果。" },
      { question: "Tymra 支持哪些房源？", answer: "你可以从 Booking.com、Airbnb、Expedia、Bookabach、Agoda 或 Trip.com 的公开住宿链接开始，也可以输入真实的新西兰地址。地址模式会把附近公开价格作为周边行情基准展示，绝不会把它们说成该地址自己的房价。" },
      { question: "完成一次价格检查需要多久？", answer: "粗略信号会先在页面内出现。验证一次邮箱后，正式检查异步运行，并在你的安全客户账户中打开。" },
      { question: "Tymra 会自动修改我的价格吗？", answer: "不会。Tymra 只提供决策支持，最终定价决定始终由你负责。" },
      { question: "这些信息来自哪里？", answer: "只有已启用且运行健康的来源可以支持结果发布。结果会显示数据时间、置信度和相关限制。" },
      { question: "为什么目前只支持新西兰房源？", answer: "首个版本有意聚焦新西兰，以便充分验证房源匹配、可比证据和市场覆盖质量。" },
      { question: "市场证据不足时会发生什么？", answer: "只要采集到至少一个有效的目标 OTA 价格，Tymra 就会返回该观察价格。推荐是否可用及其置信度会单独判断，系统不会编造缺失证据。" },
    ],
    finalCta: {
      title: "快速发现你的房源哪些日期可能卖便宜了。",
      body: "从受支持的 OTA 房源链接开始，或用新西兰地址查询周边行情基准。",
      note: "OTA 链接可在提交邮箱前先看粗略结果；地址基准会把周边价格与房源自身价格明确区分。",
      primary: "开始价格检查",
      secondary: "查询地址周边行情",
    },
    footer: {
      copyright: "© 2026 Synix. 保留所有权利。", product: "产品", resources: "资源", legal: "法律", language: "English",
      links: {
        product: [{ label: "免费检查房价", href: "/zh/check" }, { label: "会员方案", href: "/zh/pricing" }, { label: "工作原理", href: "/zh#how-it-works" }, { label: "可获得内容", href: "/zh#what-you-get" }],
        resources: [{ label: "方法说明", href: "/zh/methodology" }, { label: "常见问题", href: "/zh/faq" }, { label: "联系我们", href: "/zh/contact" }],
        legal: [{ label: "隐私政策", href: "/zh/privacy" }, { label: "使用条款", href: "/zh/terms" }, { label: "Cookie 使用说明", href: "/zh/cookies" }, { label: "免责声明", href: "/zh/disclaimer" }, { label: "数据删除", href: "/zh/delete-data" }],
      },
    },
  },
};

export const iconToneClass: Record<InsightTone, string> = {
  blue: "text-[#086BFF] bg-[#ECF4FF]",
  violet: "text-[#863DFF] bg-[#F3EDFF]",
  cyan: "text-[#059EE9] bg-[#EAF9FF]",
};

export const footerIcon = CalendarDays;
export const badgeIcon = BarChart3;
