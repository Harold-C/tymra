"use client";

import { useId, useState } from "react";
import { cheaperMembershipOptions, entitlementsForMembership, membershipCapacity, membershipMonthlyPrice } from "@tymra/domain/membership";
import type { Locale, MembershipPlan } from "./contracts";

export function CapacityPlans({ locale, initialCapacity = 1, availability, capacityLaunchLimit = 50, busy = false, onChoose }: {
  locale: Locale; initialCapacity?: number; availability?: Record<MembershipPlan, boolean>; capacityLaunchLimit?: number; busy?: boolean;
  onChoose?: (plan: Exclude<MembershipPlan, "FREE">, capacity: number) => void;
}) {
  const [quantity, setQuantity] = useState(String(initialCapacity));
  const id = useId();
  const requested = Number(quantity);
  const valid = Number.isSafeInteger(requested) && requested >= 1 && requested <= 200;
  const zh = locale === "zh";
  const money = (minor: number) => new Intl.NumberFormat(zh ? "zh-NZ" : "en-NZ", { style: "currency", currency: "NZD" }).format(minor / 100);
  return <section className="capacity-plans" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{zh ? "按你的规模选择方案" : "Choose a plan for your portfolio"}</h2>
    <label htmlFor={`${id}-quantity`}>{zh ? "需要监测的独立房源／房型数量" : "Independent properties or room types to monitor"}</label>
    <input id={`${id}-quantity`} type="number" inputMode="numeric" min="1" max="200" step="1" value={quantity} aria-describedby={`${id}-help`} onChange={event => setQuantity(event.target.value)} disabled={busy} />
    <p id={`${id}-help`}>{zh ? "同一房型跨平台只占1个额度；同一地址的独立出租单元分别计数。超过200个请联系支持获取报价。" : "One unit across OTA channels uses one slot. Independently rented units at one address count separately. Contact support for more than 200."}</p>
    {!valid ? <p role="status">{zh ? "请输入1至200的整数；超过200个需单独报价及容量审核。" : "Enter a whole number from 1 to 200. Larger portfolios require a quote and capacity review."}</p> : <div className="membership-plan-grid capacity-plan-grid">
      {(["HOST", "PRO", "PORTFOLIO"] as const).map(plan => {
        const capacity = membershipCapacity(plan, requested);
        const entitlement = entitlementsForMembership({ plan, purchasedCapacity: capacity });
        const cheaper = cheaperMembershipOptions(plan, requested)[0];
        const available = Boolean(availability?.[plan]) && capacity <= capacityLaunchLimit;
        return <article key={plan}>
          <h3>{plan === "HOST" ? "Host" : plan === "PRO" ? "Pro" : "Portfolio"}</h3>
          <strong>{money(membershipMonthlyPrice(plan, requested))}{zh ? "/月" : "/month"}</strong>
          <p>{zh ? `包含 ${capacity} 个监测额度；每账期 ${entitlement.rollingSpotCheckLimit} 次主动检查。` : `${capacity} monitored slots; ${entitlement.rollingSpotCheckLimit} manual checks per billing period.`}</p>
          <p>{plan === "HOST" ? zh ? "每周分析；30天价格窗口；邮箱支持。" : "Weekly analysis; 30-day price window; email support." : plan === "PRO" ? zh ? "每周3次；90天价格窗口；自定义规则、组合比较及导出。" : "3 analyses/week; 90-day price window; custom rules, comparison and exports." : zh ? "每日分析；180天价格窗口；分组、批量管理及导出。" : "Daily analysis; 180-day price window; groups, bulk controls and exports."}</p>
          {cheaper ? <p className="membership-notice">{zh ? `${cheaper.plan} 同等容量费用更低：${money(cheaper.monthlyPriceMinor)}/月。可自行选择。` : `${cheaper.plan} costs less for this capacity: ${money(cheaper.monthlyPriceMinor)}/month. The choice is yours.`}</p> : null}
          {onChoose ? <button type="button" className="button button-primary" disabled={!available || busy} onClick={() => onChoose(plan, capacity)}>{available ? zh ? "查看费用并选择" : "Review and choose" : zh ? "暂未开放" : "Coming soon"}</button> : null}
          {capacity > capacityLaunchLimit ? <p>{zh ? "价格供参考，开通前需完成容量审核。" : "Indicative price. A capacity review is required before purchase."}</p> : null}
        </article>;
      })}
    </div>}
    <p>{zh ? "价格含GST，仅按月订阅。Host：1个$19，5个$29，之后每个$4；Pro：20个$99，之后每个$4.90；Portfolio：50个$249，第51–100个每个$4，第101–200个每个$3。按购买容量计费，停用房源不自动减少账单。" : "NZD, GST included. Monthly subscriptions only. Host: $19 for 1, $29 for 5, then $4/slot. Pro: $99 for 20, then $4.90/slot. Portfolio: $249 for 50, $4 each for slots 51–100 and $3 each for slots 101–200. Purchased capacity is billed even when slots are inactive."}</p>
  </section>;
}
