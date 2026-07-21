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
    methodology: string;
    faq: string;
    contact: string;
    language: string;
    languageHref: string;
    languageAria: string;
    menuOpen: string;
    menuClose: string;
  };
  hero: { badge: string; titlePrefix: string; titleAccent: string; subtitle: string };
  search: {
    label: string;
    placeholder: string;
    mobilePlaceholder: string;
    cta: string;
    working: string;
    clear: string;
    validations: Record<"empty" | "short" | "long" | "unsupportedUrl", string>;
    facts: Array<{ icon: typeof Info; text: string }>;
  };
  insights: Array<{
    title: string;
    body: string;
    example: string;
    icon: typeof ShieldCheck;
    tone: InsightTone;
  }>;
  process: Array<{ label: string; body: string; icon: typeof ShieldCheck }>;
  methodology: { eyebrow: string; title: string; body: string; points: string[]; link: string };
  coverage: { eyebrow: string; title: string; body: string; statuses: string[] };
  faq: Array<{ question: string; answer: string }>;
  finalCta: { title: string; body: string; note: string; primary: string };
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
      methodology: "Methodology",
      faq: "FAQ",
      contact: "Contact",
      language: "English",
      languageHref: "/zh",
      languageAria: "Switch to Chinese",
      menuOpen: "Open navigation",
      menuClose: "Close navigation",
    },
    hero: {
      badge: "ACCOMMODATION PRICING INTELLIGENCE",
      titlePrefix: "How much revenue are you",
      titleAccent: "leaving?",
      subtitle: "Find the dates you may be selling too cheaply.",
    },
    search: {
      label: "Paste a supported New Zealand OTA listing URL",
      placeholder: "Paste a Booking.com or Airbnb listing URL",
      mobilePlaceholder: "Paste an OTA listing link",
      cta: "Check This Listing",
      working: "Checking listing",
      clear: "Clear search",
      validations: {
        empty: "Paste a Booking.com or Airbnb listing URL to start.",
        short: "Paste the complete OTA listing URL.",
        long: "Keep the listing URL under 500 characters.",
        unsupportedUrl: "Use a valid Booking.com New Zealand hotel URL or Airbnb room URL.",
      },
      facts: [
        { icon: MapPin, text: "Supported OTA links only" },
        { icon: CreditCard, text: "No credit card required" },
        { icon: Clock3, text: "No dates or room setup" },
        { icon: ShieldCheck, text: "No automatic price changes" },
      ],
    },
    insights: [
      { title: "Low-price Risks", body: "Identify dates that may deserve a closer pricing review.", example: "Example structure", icon: ShieldCheck, tone: "blue" },
      { title: "Comparable Range", body: "Understand your position against relevant comparable accommodation.", example: "Example structure", icon: BarChart3, tone: "violet" },
      { title: "Market Signals", body: "Review supporting changes in prices, availability and important dates.", example: "Example structure", icon: Signal, tone: "cyan" },
      { title: "Suggested Actions", body: "See a cautious next step with confidence and clear limitations.", example: "Example structure", icon: ListChecks, tone: "violet" },
    ],
    process: [
      { label: "Paste the OTA link", body: "Use the public Booking.com or Airbnb link for the listing you want to check.", icon: Search },
      { label: "See a rough signal", body: "Tymra uses the link context or OTA default display without asking for dates, guests or room type.", icon: BarChart3 },
      { label: "Unlock the formal report", body: "Verify one email to create your secure customer access and start the formal check.", icon: CheckCircle2 },
    ],
    methodology: {
      eyebrow: "Transparent by design",
      title: "Comparable evidence, explained clearly",
      body: "Tymra starts from the listing's observed default display context, then uses approved evidence for the formal report.",
      points: ["Effective nightly totals include known mandatory fees", "Confidence reflects freshness, completeness and comparability", "Operators retain every final pricing decision"],
      link: "Read the methodology",
    },
    coverage: {
      eyebrow: "Initial market coverage",
      title: "Starting with Christchurch",
      body: "Christchurch and approved surrounding areas are the first supported market. Other New Zealand areas are shown honestly according to available coverage.",
      statuses: ["Supported", "Pilot available", "Coming soon", "Insufficient market data"],
    },
    faq: [
      { question: "Does Tymra provide real pricing results?", answer: "Yes, when the property and market are supported and approved source data meets the required quality thresholds. Tymra returns a clear limited state rather than inventing a result when evidence is insufficient." },
      { question: "Which properties does Tymra support?", answer: "Start with a supported Booking.com New Zealand hotel link or Airbnb room link. Tymra uses the listing identity and its observed display context rather than trying to infer pricing from a street address." },
      { question: "How long does a Price Check take?", answer: "The rough signal normally appears in-page first. After you verify one email, the formal check runs asynchronously and opens in your secure customer account." },
      { question: "Does Tymra automatically change my prices?", answer: "No. Tymra provides decision support only. You remain responsible for every final pricing decision." },
      { question: "Where does the information come from?", answer: "Only approved sources with the required rights can support publication. Results show data timing, confidence and relevant limitations." },
      { question: "Why are only New Zealand properties supported?", answer: "Release 1 is intentionally focused on New Zealand so property matching, comparable evidence and market coverage can be validated properly." },
      { question: "What happens when there is not enough data?", answer: "Tymra returns Partial, Insufficient data, Unsupported or Source unavailable with a clear next step. It does not create prices, competitors or advice without reliable evidence." },
    ],
    finalCta: {
      title: "Find the dates you may be selling too cheaply.",
      body: "Start with one supported New Zealand OTA listing link.",
      note: "See a rough result before email. No date, guest or room setup required.",
      primary: "Check a Listing",
    },
    footer: {
      copyright: "© 2026 Synix. All rights reserved.", product: "Product", resources: "Resources", legal: "Legal", language: "English",
      links: {
        product: [{ label: "Free Price Check", href: "/en/check" }, { label: "How It Works", href: "/en#how-it-works" }, { label: "What You’ll Get", href: "/en#what-you-get" }],
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
      howItWorks: "工作原理", whatYouGet: "可获得内容", methodology: "方法说明", faq: "常见问题", contact: "联系我们", language: "中文", languageHref: "/en", languageAria: "切换到英文", menuOpen: "打开导航", menuClose: "关闭导航",
    },
    hero: {
      badge: "住宿定价智能",
      titlePrefix: "你的哪些高价值日期可能",
      titleAccent: "卖便宜了？",
      subtitle: "快速发现低价风险、竞品差距和市场上涨信号。",
    },
    search: {
      label: "粘贴受支持的新西兰 OTA 房源链接",
      placeholder: "粘贴 Booking.com 或 Airbnb 房源链接",
      mobilePlaceholder: "粘贴 OTA 房源链接",
      cta: "检查这个房源",
      working: "正在检查房源",
      clear: "清除搜索",
      validations: {
        empty: "请粘贴 Booking.com 或 Airbnb 房源链接。",
        short: "请粘贴完整的 OTA 房源链接。",
        long: "请将房源链接控制在 500 个字符以内。",
        unsupportedUrl: "请使用有效的 Booking.com 新西兰酒店链接或 Airbnb 房源链接。",
      },
      facts: [
        { icon: MapPin, text: "仅支持指定 OTA 链接" },
        { icon: CreditCard, text: "无需信用卡" },
        { icon: Clock3, text: "无需设置日期或房型" },
        { icon: ShieldCheck, text: "不会自动修改价格" },
      ],
    },
    insights: [
      { title: "低价风险", body: "识别可能值得优先检查价格的日期。", example: "示例结构", icon: ShieldCheck, tone: "blue" },
      { title: "竞品价格区间", body: "了解房价在相关可比住宿中的位置。", example: "示例结构", icon: BarChart3, tone: "violet" },
      { title: "市场信号", body: "查看价格、可售状态和重要日期的辅助变化。", example: "示例结构", icon: Signal, tone: "cyan" },
      { title: "建议动作", body: "结合置信度和明确限制查看谨慎的下一步。", example: "示例结构", icon: ListChecks, tone: "violet" },
    ],
    process: [
      { label: "粘贴 OTA 链接", body: "使用需要检查的 Booking.com 或 Airbnb 公开房源链接。", icon: Search },
      { label: "先看粗略信号", body: "Tymra 自动使用链接参数或 OTA 默认展示，无需选择日期、人数或房型。", icon: BarChart3 },
      { label: "解锁正式报告", body: "验证一次邮箱即可建立安全客户访问并开始正式检查。", icon: CheckCircle2 },
    ],
    methodology: {
      eyebrow: "方法透明",
      title: "清楚解释可比证据",
      body: "Tymra 先使用房源链接的默认展示配置，再通过获批证据生成正式报告。",
      points: ["Effective Nightly Total 包含已知强制费用", "置信度反映数据新鲜度、完整性和可比性", "最终定价决定始终由经营者作出"],
      link: "查看方法说明",
    },
    coverage: {
      eyebrow: "首个市场覆盖范围",
      title: "从 Christchurch 开始",
      body: "Christchurch 及已批准周边是首个正式支持市场。其他新西兰地区会根据真实覆盖能力显示明确状态。",
      statuses: ["已支持", "可申请试点", "即将开放", "市场数据不足"],
    },
    faq: [
      { question: "Tymra 会提供真实价格结果吗？", answer: "会。房源和市场受支持，并且获批数据满足质量门槛时，Tymra 会生成真实结果；证据不足时会明确返回受限状态，而不是编造结果。" },
      { question: "Tymra 支持哪些房源？", answer: "请从受支持的 Booking.com 新西兰酒店链接或 Airbnb 房源链接开始。Tymra 使用 OTA 房源身份及其展示配置，不会仅凭自然地址猜测当前价格。" },
      { question: "完成一次 Price Check 需要多久？", answer: "粗略信号会先在页面内出现。验证一次邮箱后，正式检查异步运行，并在你的安全客户账户中打开。" },
      { question: "Tymra 会自动修改我的价格吗？", answer: "不会。Tymra 只提供决策支持，最终定价决定始终由你负责。" },
      { question: "这些信息来自哪里？", answer: "只有具备必要权利的获批来源可以支持结果发布。结果会显示数据时间、置信度和相关限制。" },
      { question: "为什么目前只支持新西兰房源？", answer: "Release 1 有意聚焦新西兰，以便充分验证房源匹配、可比证据和市场覆盖质量。" },
      { question: "数据不足时会发生什么？", answer: "Tymra 会返回 Partial、数据不足、不支持或数据源不可用，并说明下一步，不会在缺少可靠证据时生成房价、竞品或建议。" },
    ],
    finalCta: {
      title: "快速发现你的房源哪些日期可能卖便宜了。",
      body: "从一个受支持的新西兰 OTA 房源链接开始。",
      note: "提交邮箱前先看粗略结果，无需设置日期、人数或房型。",
      primary: "检查一个房源",
    },
    footer: {
      copyright: "© 2026 Synix. 保留所有权利。", product: "产品", resources: "资源", legal: "法律", language: "中文",
      links: {
        product: [{ label: "免费检查房价", href: "/zh/check" }, { label: "工作原理", href: "/zh#how-it-works" }, { label: "可获得内容", href: "/zh#what-you-get" }],
        resources: [{ label: "方法说明", href: "/zh/methodology" }, { label: "常见问题", href: "/zh/faq" }, { label: "联系我们", href: "/zh/contact" }],
        legal: [{ label: "隐私政策", href: "/zh/privacy" }, { label: "使用条款", href: "/zh/terms" }, { label: "Cookie 说明", href: "/zh/cookies" }, { label: "免责声明", href: "/zh/disclaimer" }, { label: "数据删除", href: "/zh/delete-data" }],
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
