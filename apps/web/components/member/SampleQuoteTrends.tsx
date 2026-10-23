import Link from "next/link";
import { ArrowLeft, ChartNoAxesCombined } from "lucide-react";
import type { SampleQuoteBasis, SampleQuoteTrendSummary, SampleTrendFilter, SampleTrendSeries, SampleMealGroup, SampleFeeGroup, SampleRefundGroup } from "@tymra/domain";

type Locale = "en" | "zh";
const copy = {
  en: { title: "Christchurch sample quote trends", intro: "Follow selected accommodation quotes with separate membership, stay-length and date views.",
    back: "Account home", reference: "Sample quote reference · not a city price index", limits: "These are advertised sample quotes, not transaction prices or occupancy. Browser login, location and personalisation are not fully attested. Changes are source-quote references, not certified market-price changes.",
    from: "Observed from", to: "Observed to", basis: "Price basis", public: "Public / partner displayed totals", member: "Displayed member references", all: "All (separate series)",
    nights: "Stay length", one: "One night", two: "Two nights", three: "Three nights", stay: "Arrival date", allDates: "All arrival dates", category: "Accommodation type",
    comparison: "Comparison view", fixed: "Fixed arrival · matched changes", rolling: "Flexible dates · quote levels", weekday: "Weekday arrivals", weekend: "Weekend arrivals",
    rollingNote: "Different arrival dates are grouped by weekday/weekend and lead-time band. Stay lengths, membership, meals and fee disclosures remain separate. These are sample quote levels; sample mix and exact lead times can change, so no matched percentage change is calculated.",
    lead: "Days before arrival", anyLead: "Any lead time", apply: "Apply filters", dateHint: "Up to 90 New Zealand observation dates. Arrival and departure dates stay fixed within each series.",
    members: "Selected samples", observed: "Observed in this view", priced: "With a displayed price", included: "In reference series", coverage: "Analysis gaps do not stop the existing collection plan.",
    publicNote: "A verified displayed price for the same unit, dates and guests can be a reference. Inclusive fees and undisclosed fees form separate series; undisclosed meals stay separate from room-only and breakfast offers. Missing payment or cancellation detail is labelled, not invented. Public and partner offers never match each other. These references do not establish a final bookable total or equivalent purchase terms.",
    memberNote: "Member references compare the same membership offer’s displayed amount only. Membership eligibility, availability, fees and purchase terms remain unverified; these are not all-in bookable totals. Public offer terms are never borrowed.",
    clockNote: "Fixed-arrival tracking includes the effect of getting closer to arrival. Lead-time filters do not make all days in a band equivalent. Different arrival months remain separate; seasonality and event effects are not removed.",
    period: "NZ collection cycle", median: "Sample median stay total", count: "Samples", advance: "Actual days before arrival", change: "Matched change from prior cycle", paired: "paired samples",
    baseline: "Baseline · waiting for the next cycle", noPair: "No matching offers in the adjacent cycle", pointHint: "One vote per sample. Compare the same room and price basis in adjacent cycles. Payment dates and cancellation deadlines are notes, not matching keys. Refundability, meals, fees and membership remain separate. The change is not the difference between two medians.",
    matching: "Matched / priced samples", unmatched: "unmatched", previous: "Compared with", notes: "Source terms and notes", mealNote: "Meals", cancelNote: "Cancellation", payNote: "Payment", unknown: "Not disclosed", continuity: "Same room · same price basis · adjacent cycles",
    empty: "No eligible reference series in this view", emptyBody: "Displayed prices and gaps remain below. No prices are replaced with zero. Try another price basis or observation range.",
    unavailable: "Completed windows without a price", failed: "Failed / unverified windows", gaps: "Why some quotes are outside the series", none: "No analysis gaps in this view.",
    available: "Latest displayed quotes in this view", quoteHint: "Up to 50 rows, including prices outside the reference series. Amounts cover the actual stay, not an interchangeable nightly rate.",
    includedTag: "In reference series", excludedTag: "Display only", noQuotes: "No displayed quotes in this view.", source: "Source", observedOn: "Observed", updated: "Read at", method: "Method and limitations", end: "Departure",
    incomplete: "The read reached its safety limit. Coverage is partial; changes are withheld. Narrow the observation dates.", missing: "The selected collection plan is not available yet.", error: "Sample quotes are temporarily unavailable. Please reload shortly.", invalid: "Choose valid dates within 90 NZ dates and supported filters.",
    weekdays: "Workdays and weekends are distinct arrival dates; this view does not estimate a general weekend premium.", retry: "Reset filters" },
  zh: { title: "基督城样本报价走势", intro: "持续观察已选住宿样本，区分会员价格、住宿晚数，以及固定或灵活入住日期。",
    back: "会员首页", reference: "样本报价参考 · 非全市价格指数", limits: "这里是样本展示报价，不是成交价或入住率。浏览器登录状态、地区与个性化环境尚未完整证明；涨跌仅作来源报价参考，不代表已认证的市场价格变化。",
    from: "观察开始日期", to: "观察结束日期", basis: "价格口径", public: "公开／合作方显示总价", member: "会员显示参考价", all: "全部（分别展示）",
    nights: "住宿晚数", one: "一晚", two: "两晚", three: "三晚", stay: "入住日期", allDates: "全部入住日期", category: "住宿类型",
    comparison: "比较方式", fixed: "固定入住日 · 配对涨跌", rolling: "灵活日期 · 参考报价", weekday: "工作日入住", weekend: "周末入住",
    rollingNote: "不同入住日期按工作日／周末及提前期区间分组，晚数、会员、餐食和费用披露仍分开。这里展示样本报价水平；样本构成和实际提前天数可能变化，因此不计算同条件涨跌百分比。",
    lead: "提前预订天数", anyLead: "不限提前期", apply: "查看走势", dateHint: "最多查看90个新西兰观察日期；每条序列保留精确入住及退房日期。",
    members: "固定样本", observed: "本次范围已观察", priced: "有显示价格", included: "纳入参考序列", coverage: "分析字段不足不会暂停原有采集计划。",
    publicNote: "同一单元、日期和人数的已核实展示价格可作参考。明确含必付费用与费用未核实分别成组；餐食未披露与不含餐、含早餐分别成组。付款或取消细节不足时明确标注，不补造条款。公开价与合作方报价不交叉匹配；这些参考不代表最终可订总价或购买条件完全一致。",
    memberNote: "会员参考仅比较同一会员套餐的显示金额；会员资格、可订库存、完整费用及购买条款仍未核实，不等于含完整费用的可订总价，也不借用公开套餐条款。",
    clockNote: "固定入住日的报价变化包含临近入住的影响。提前期筛选不代表区间内天数等价；不同入住月份分别展示，未剥离季节和活动影响。",
    period: "新西兰采集周期", median: "样本住宿总价中位数", count: "样本数", advance: "实际提前天数", change: "与上周期配对变化", paired: "个配对样本",
    baseline: "本期基线 · 等待下一周期", noPair: "与相邻周期暂无匹配套餐", pointHint: "每个样本只占一份权重，比较相邻周期的同房型、同价格口径。付款日期和取消截止时间仅保留说明，退款类型、餐食、费用及会员条件仍分开。涨跌不是两期中位价相减。",
    matching: "配对／当前有价样本", unmatched: "个未配对", previous: "对比周期", notes: "来源条款与说明", mealNote: "餐食", cancelNote: "取消", payNote: "付款", unknown: "未披露", continuity: "同房型 · 同价格口径 · 相邻周期",
    empty: "此范围尚无可纳入的参考序列", emptyBody: "已有展示价格和缺口仍保留在下方，无房不会填成零元。可切换价格口径或观察日期。",
    unavailable: "已完成但没有价格的窗口", failed: "失败／交付未核实窗口", gaps: "部分报价为何未纳入走势", none: "本次范围暂无分析缺口。",
    available: "本次范围最新显示报价", quoteHint: "最多列出50条，包括暂未纳入参考序列的价格。金额为实际住宿总价，不能与其他晚数组互换。",
    includedTag: "纳入参考序列", excludedTag: "仅展示", noQuotes: "本次范围暂无显示报价。", source: "来源", observedOn: "观察于", updated: "读取时间", method: "口径与限制", end: "退房",
    incomplete: "已达到安全读取上限，覆盖不完整，暂不计算涨跌。请缩小观察日期范围。", missing: "固定样本采集计划尚不可读取。", error: "暂时无法读取样本报价，请稍后刷新。", invalid: "请选择90个新西兰日期以内的有效观察范围及筛选条件。",
    weekdays: "工作日与周末按不同入住日期保留；此页不推断普遍的周末溢价。", retry: "重置筛选" },
};
function trendCopy(locale: Locale, granularity?: "DAY" | "WEEK") {
  const daily = granularity === "DAY";
  return { ...copy[locale], ...(locale === "zh" ? {
    frequency: "观察频率", daily: "日环比", weekly: "周度汇总", progress: "每日窗口覆盖", completed: "已完成", positive: "有效价格", missingCount: "未完成",
    coverageNote: "覆盖按房型与入住窗口计数；价格数遵循当前价格筛选。当天仍可能采集中；历史未完成窗口不补发，无价不填零。",
    period: daily ? "新西兰观察日期" : "新西兰周度周期",
    change: daily ? "与前一日配对变化" : "与上周期配对变化",
    baseline: daily ? "首日基线 · 等待前后日配对" : copy.zh.baseline,
    noPair: daily ? "前一日暂无相同口径报价" : copy.zh.noPair,
    continuity: daily ? "同房型 · 同价格口径 · 相邻新西兰日期" : copy.zh.continuity,
    pointHint: daily ? "每天每个窗口取最后一次完成的观察；仅与前一新西兰日期的相同房型、入住退房日及套餐口径配对。缺日、无价或失败不沿用旧价；每个样本只占一份权重。" : "每周每个窗口取最后一次完成的观察，按样本配对上周期相同房型、入住退房日及套餐口径。当前周为截至目前的汇总；这不是每日涨跌的平均值。",
    actualDates: "实际观察日期",
  } : {
    frequency: "Observation frequency", daily: "Day-on-day", weekly: "Weekly summary", progress: "Daily window coverage", completed: "Completed", positive: "Eligible prices", missingCount: "Not completed",
    coverageNote: "Coverage counts unit/stay windows; eligible prices follow the selected price filters. Today's collection may still be in progress. Historic gaps are not resubmitted and unavailable prices are never zero.",
    period: daily ? "NZ observation date" : "NZ weekly cycle",
    change: daily ? "Matched change from previous day" : copy.en.change,
    baseline: daily ? "First-day baseline · waiting for adjacent days" : copy.en.baseline,
    noPair: daily ? "No matching offer on the previous NZ date" : copy.en.noPair,
    continuity: daily ? "Same room · same price basis · adjacent NZ dates" : copy.en.continuity,
    pointHint: daily ? "Use the last completed observation per window per NZ date. Match only the preceding NZ date's same room, arrival/departure and offer basis. Missing, unavailable and failed dates never carry prices forward. Each sample has one vote." : "Use the last completed observation per window per week and match the preceding cycle's same room, arrival/departure and offer basis. The current week is a summary to date, not an average of daily percentage changes.",
    actualDates: "Actual observation dates",
  }) };
}
const categories: Record<string, [string, string]> = { HOTEL: ["Hotel", "酒店"], MOTEL: ["Motel", "汽车旅馆"], HOLIDAY_HOME: ["Holiday home", "民宿／度假屋"],
  SERVICED_APARTMENT: ["Serviced apartment", "服务公寓"], BACKPACKER: ["Backpacker", "背包客住宿"], GUESTHOUSE: ["Guesthouse", "家庭旅馆"],
  HOLIDAY_PARK: ["Holiday park", "假日公园"], LODGE: ["Lodge", "旅舍"] };
const gapCopy: Record<string, [string, string]> = {
  NO_COMPLETED_WINDOW: ["No completed observation in these filters", "筛选范围内暂无已完成观察"], NO_PRICE_FOR_WINDOW: ["No price for an observed window", "已观察窗口没有价格"],
  DELIVERY_OR_CAPTURE_FAILED: ["Capture or delivery not verified", "采集或交付未核实"], QUOTE_EVIDENCE_MISSING: ["Quote evidence incomplete", "报价证据不完整"],
  QUERY_OR_UNIT_CONFLICT: ["Stay query or unit mismatch", "日期／入住条件或单元不一致"], SOURCE_EXECUTION_CONTEXT_MISSING: ["Source execution context missing", "来源执行信息不足"],
  SOURCE_CONFLICT: ["Source facts conflict", "来源事实冲突"], MEMBER_PLAN_MISSING: ["Exact member offer not linked", "未关联精确会员套餐"],
  EXACT_RATE_PLAN_MISSING: ["Exact offer missing or ambiguous", "套餐编号缺失或不唯一"], TOTAL_FEES_UNVERIFIED: ["Inclusive mandatory fees not verified", "未核实是否含完整必付费用"],
  PRICE_FENCE_UNSUPPORTED: ["Offer conditions not supported", "报价条件未支持"], MEAL_TERMS_MISSING: ["Meal terms unknown", "餐食条件未知"],
  PAYMENT_TERMS_MISSING: ["Payment terms unknown", "付款条件未知"], CANCELLATION_TERMS_MISSING: ["Cancellation terms incomplete", "取消条款不完整"],
};
const mealCopy: Record<SampleMealGroup, [string, string]> = { ROOM_ONLY: ["Room only", "不含餐"], BREAKFAST_INCLUDED: ["Breakfast included", "含早餐"], BREAKFAST_EXTRA: ["Breakfast costs extra", "早餐另付"], NOT_APPLICABLE: ["Meals not applicable", "餐食不适用"], UNDISCLOSED: ["Meals undisclosed", "餐食未披露"] };
const feeCopy: Record<SampleFeeGroup, [string, string]> = { INCLUSIVE: ["Mandatory fees included", "已注明含必付费用"], UNDISCLOSED: ["Fees unverified · displayed amount only", "费用未核实 · 仅显示金额"], MEMBER_UNVERIFIED: ["Member fees unverified", "会员费用未核实"] };
const refundCopy: Record<SampleRefundGroup, [string, string]> = { REFUNDABLE: ["Refundable", "可退款"], NON_REFUNDABLE: ["Non-refundable", "不可退款"], UNDISCLOSED: ["Refundability undisclosed", "退款类型未披露"] };
function groupLabel(meal: SampleMealGroup, fees: SampleFeeGroup, locale: Locale) { const i = locale === "zh" ? 1 : 0; return `${mealCopy[meal][i]} · ${feeCopy[fees][i]}`; }
function categoryLabel(value: string, locale: Locale) { return categories[value]?.[locale === "zh" ? 1 : 0] ?? value; }
function basisLabel(basis: SampleQuoteBasis, locale: Locale) { return basis === "MEMBER_REFERENCE" ? copy[locale].member : copy[locale].public; }
function date(day: string, locale: Locale) { return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { year: "numeric", month: "short", day: "numeric", timeZone: "Pacific/Auckland" }).format(new Date(`${day.slice(0, 10)}T00:00:00Z`)); }
function money(minor: number, locale: Locale) { return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100); }
function safeSource(href: string) { try { const u = new URL(href); if (u.protocol !== "https:" || u.username || u.password || !["www.booking.com", "www.airbnb.com", "www.airbnb.co.nz", "www.expedia.co.nz", "www.bookabach.co.nz", "www.trip.com", "nz.trip.com"].includes(u.hostname)) return null; u.search = ""; u.hash = ""; return u.href; } catch { return null; } }

export function SampleQuoteTrends({ locale, filter, data, error }: { locale: Locale; filter: SampleTrendFilter; data: SampleQuoteTrendSummary | null; error?: "invalid" | "error" }) {
  const c = trendCopy(locale, filter.granularity);
  return <section className="rough-shell sample-quote-trends" lang={locale === "zh" ? "zh-CN" : "en-NZ"}>
    <Link href={`/${locale}/account`} className="text-link"><ArrowLeft size={16} aria-hidden="true" />{c.back}</Link>
    <header className="sample-trend-heading"><div><p>{c.reference}</p><h1>{c.title}</h1><p>{c.intro}</p></div><ChartNoAxesCombined size={32} aria-hidden="true" /></header>
    <aside className="sample-trend-notice"><strong>{c.reference}</strong><p>{c.limits}</p></aside>
    <form className="sample-trend-filters" method="get" aria-label={locale === "zh" ? "报价走势筛选" : "Quote trend filters"}>
      <label>{c.basis}<select name="basis" defaultValue={filter.basis}><option value="PUBLIC_TOTAL">{c.public}</option><option value="MEMBER_REFERENCE">{c.member}</option><option value="ALL">{c.all}</option></select></label>
      <label>{c.comparison}<select name="comparison" defaultValue={filter.comparison ?? "FIXED"}><option value="FIXED">{c.fixed}</option><option value="ROLLING">{c.rolling}</option></select></label>
      <label>{c.frequency}<select name="granularity" defaultValue={filter.granularity ?? "WEEK"}><option value="DAY">{c.daily}</option><option value="WEEK">{c.weekly}</option></select></label>
      <label>{c.nights}<select name="nights" defaultValue={filter.nights}><option value="ALL">{c.all}</option><option value="1">{c.one}</option><option value="2">{c.two}</option><option value="3">{c.three}</option></select></label>
      <label>{c.stay}<select name="stay" defaultValue={filter.stay}><option value="ALL">{c.allDates}</option>{data?.stayDates.map(day => <option key={day} value={day}>{date(day, locale)}</option>)}</select></label>
      <label>{c.category}<select name="category" defaultValue={filter.category}><option value="ALL">{c.all}</option>{data?.categories.map(value => <option key={value} value={value}>{categoryLabel(value, locale)}</option>)}</select></label>
      <label>{c.lead}<select name="lead" defaultValue={filter.lead}><option value="ALL">{c.anyLead}</option>{["0-30", "31-60", "61-90", "91+"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{c.from}<input name="from" type="date" defaultValue={filter.from} required /></label>
      <label>{c.to}<input name="to" type="date" defaultValue={filter.to} min={filter.from} required /></label>
      <button className="button button-primary" type="submit">{c.apply}</button>
      <p className="sample-trend-filter-hint">{filter.comparison === "ROLLING" ? c.rollingNote : c.dateHint}</p>
    </form>
    {error ? <p role="alert">{c[error]} <Link className="text-link" href={`/${locale}/account/market/sample-quotes`}>{c.retry}</Link></p> : !data ? <p role="status">{c.missing}</p> : <>
      <p className="sample-trend-caption">{c.members} {data.configuredMembers} · {c.updated} {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }).format(new Date(data.asOf))} (NZ)</p>
      {!data.complete ? <p role="alert" className="sample-trend-notice">{c.incomplete}</p> : null}
      <dl className="sample-trend-metrics">{[[c.observed, data.observedMembers], [c.priced, data.pricedMembers], [c.included, data.includedMembers]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>{c.coverage}</p>
      {data.dailyCoverage?.length ? <section className="sample-trend-section"><h2>{c.progress}</h2><p>{c.coverageNote}</p><div className="sample-trend-points">{data.dailyCoverage.slice(-7).reverse().map(day => <dl className="sample-trend-point" key={day.date}>
        <div><dt>{c.observedOn}</dt><dd>{date(day.date, locale)}</dd></div><div><dt>{c.completed}</dt><dd>{day.completed} / {day.expected}</dd></div>
        <div><dt>{c.positive}</dt><dd>{day.priced}</dd></div><div><dt>{c.missingCount}</dt><dd>{day.missing}</dd></div><div><dt>{c.failed}</dt><dd>{day.failed}</dd></div>
      </dl>)}</div></section> : null}
      <details className="sample-trend-method"><summary>{c.method}</summary><p>{c.publicNote}</p><p>{c.memberNote}</p><p>{filter.comparison === "ROLLING" ? c.rollingNote : c.clockNote}</p><p>{c.weekdays}</p><p>{c.pointHint}</p></details>
      {!data.series.length ? <div className="sample-trend-empty"><ChartNoAxesCombined size={28} aria-hidden="true" /><h2>{c.empty}</h2><p>{c.emptyBody}</p></div> : data.series.map(series => <Series key={series.key} series={series} locale={locale} granularity={filter.granularity} />)}
      <div className="sample-trend-caption">{c.unavailable}: {data.noPriceWindows} · {c.failed}: {data.failedWindows}</div>
      <details className="sample-trend-method"><summary>{c.gaps} ({data.gaps.length})</summary>{!data.gaps.length ? <p>{c.none}</p> : <ul className="sample-trend-gaps">{data.gaps.map(gap => <li key={gap.memberId}><strong>{gap.name}</strong><span>{gap.reasons.map(reason => gapCopy[reason]?.[locale === "zh" ? 1 : 0] ?? reason).join(" · ")}</span></li>)}</ul>}</details>
      <section className="sample-trend-section"><h2>{c.available}</h2><p>{c.quoteHint}</p>{!data.recentQuotes.length ? <p>{c.noQuotes}</p> : <ul className="sample-trend-quotes">{data.recentQuotes.slice(0, 50).map((q, i) => <li key={`${q.name}-${q.basis}-${q.checkIn}-${i}`}><div><strong>{q.name}</strong><span>{basisLabel(q.basis, locale)} · {q.nights === 1 ? c.one : q.nights === 2 ? c.two : c.three}</span><span>{groupLabel(q.mealGroup, q.feeGroup, locale)} · {refundCopy[q.refundGroup][locale === "zh" ? 1 : 0]}</span><span>{c.stay} {date(q.checkIn, locale)} → {date(q.checkOut, locale)}</span><small>{c.observedOn} {date(q.observedOn, locale)} · {q.leadDays} {locale === "zh" ? "天提前期" : "days before arrival"}</small><details className="sample-trend-method"><summary>{c.notes}</summary>{q.disclosures.length ? <p>{q.disclosures.map(d => gapCopy[d]?.[locale === "zh" ? 1 : 0] ?? d).join(" · ")}</p> : null}<p>{c.mealNote}: {q.notes.meal || c.unknown}</p><p>{c.cancelNote}: {q.notes.cancellation || c.unknown}</p><p>{c.payNote}: {q.notes.payment || c.unknown}</p></details></div><div><strong>{money(q.amountMinor, locale)}</strong><span>{q.included ? c.includedTag : c.excludedTag}</span>{safeSource(q.sourceUrl) ? <a href={safeSource(q.sourceUrl)!} target="_blank" rel="noreferrer">{q.source} ↗</a> : <span>{q.source}</span>}</div></li>)}</ul>}</section>
    </>}
  </section>;
}

function Series({ series, locale, granularity }: { series: SampleTrendSeries; locale: Locale; granularity?: "DAY" | "WEEK" }) {
  const c = trendCopy(locale, granularity), values = series.points.filter(p => p.changePct !== null), span = Math.max(1, ...values.map(p => Math.abs(p.changePct!)));
  return <article className="sample-trend-section" data-price-basis={series.basis} data-nights={series.nights} data-meals={series.mealGroup} data-fees={series.feeGroup}>
    <h2>{categoryLabel(series.category, locale)} · {series.nights === 1 ? c.one : series.nights === 2 ? c.two : c.three}</h2><p><strong>{basisLabel(series.basis, locale)}</strong> · {series.arrivalKind ? `${series.arrivalKind === "WEEKEND" ? c.weekend : c.weekday} · ${c.lead}: ${series.leadBand}` : `${c.stay} ${date(series.checkIn, locale)} → ${c.end} ${date(series.checkOut, locale)}`}</p>
    {series.arrivalDates ? <p className="sample-trend-caption">{c.stay}: {series.arrivalDates.map(d => date(d, locale)).join(" · ")}</p> : null}
    <p><strong>{groupLabel(series.mealGroup, series.feeGroup, locale)}</strong></p>
    <p className="sample-trend-caption">{refundCopy[series.refundGroup][locale === "zh" ? 1 : 0]} · {series.arrivalKind ? c.rollingNote : c.continuity}</p>
    {values.length ? <div className="sample-trend-change-chart" role="img" aria-label={c.change}>{values.map(p => <div key={p.cycle}><span>{date(p.cycle, locale)}</span><div className="sample-trend-change-track"><i style={{ width: `${Math.abs(p.changePct!) / span * 50}%`, left: `${p.changePct! < 0 ? 50 - Math.abs(p.changePct!) / span * 50 : 50}%` }} /><b /></div><strong>{p.changePct! > 0 ? "+" : ""}{p.changePct!.toFixed(1)}%</strong></div>)}</div> : null}
    <div className="sample-trend-points">{series.points.map(p => <dl className="sample-trend-point" key={p.cycle}>
      <div><dt>{c.period}</dt><dd><time dateTime={p.cycle}>{date(p.cycle, locale)}</time></dd></div>
      {granularity !== "DAY" ? <div><dt>{c.actualDates}</dt><dd>{date(p.observedFrom, locale)} → {date(p.observedTo, locale)}</dd></div> : null}
      {!series.arrivalKind ? <div className="sample-trend-primary"><dt>{c.change}</dt><dd>{p.changePct === null ? <span>{p.baseline ? c.baseline : c.noPair}</span> : <strong>{p.changePct > 0 ? "+" : ""}{p.changePct.toFixed(1)}%</strong>}{!p.baseline ? <small>{c.previous} {date(p.previousCycle, locale)}</small> : null}</dd></div> : null}
      <div><dt>{series.arrivalKind ? c.count : c.matching}</dt><dd>{series.arrivalKind ? p.sampleCount : `${p.pairedSamples} / ${p.sampleCount}`}<small>{!series.arrivalKind ? `${p.unpairedSamples} ${c.unmatched}` : null}</small></dd></div>
      <div><dt>{c.median}</dt><dd>{money(p.medianTotalMinor, locale)}</dd></div>
      <div><dt>{c.advance}</dt><dd>{p.leadDaysMin === p.leadDaysMax ? p.leadDaysMin : `${p.leadDaysMin}–${p.leadDaysMax}`}</dd></div>
    </dl>)}</div><details className="sample-trend-method"><summary>{c.method}</summary><p>{series.arrivalKind ? c.rollingNote : c.pointHint}</p><p>{c.clockNote}</p>{series.basis === "MEMBER_REFERENCE" ? <p className="sample-trend-member-note">{c.memberNote}</p> : <p>{c.publicNote}</p>}</details>
  </article>;
}
