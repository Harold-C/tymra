import { prisma } from "@tymra/db";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAccountMetadata } from "@/lib/account-metadata";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";

export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "pricingUnitDetail"); }

export default async function Page({ params }: { params: { locale: "en" | "zh"; pricingUnitId: string } }) {
  const session = await getCustomerSessionForPage();
  if (!session) notFound();
  const unit = await prisma.customerPricingUnit.findFirst({
    where: { id: params.pricingUnitId, customerUserId: session.customerUserId },
    include: { sellableUnit: { include: { property: true, listings: { include: { dataSource: true } } } } },
  });
  if (!unit) notFound();
  const recent = await prisma.rateObservation.findMany({ where: { sellableUnitId: unit.sellableUnitId }, orderBy: { collectedAt: "desc" }, take: 10, include: { dataSource: true } });
  const zh = params.locale === "zh";
  const money = new Intl.NumberFormat(zh ? "zh-CN" : "en-NZ", { style: "currency", currency: "NZD" });
  return <section className="member-page"><div className="rough-shell">
    <span className="rough-eyebrow">{zh ? "定价单位" : "PRICING UNIT"}</span>
    <h1>{unit.sellableUnit.property.canonicalName}</h1>
    <p className="member-page-intro">{unit.sellableUnit.officialName} · {unit.sellableUnit.property.city}</p>
    <div className="member-metric-grid"><article><span>{zh ? "监测状态" : "Monitoring"}</span><strong>{unit.active ? "ACTIVE" : "INACTIVE"}</strong></article><article><span>{zh ? "公开平台映射" : "Public platform mappings"}</span><strong>{unit.sellableUnit.listings.length}</strong></article><article><span>{zh ? "近期观测" : "Recent observations"}</span><strong>{recent.length}</strong></article></div>
    <div className="settings-grid"><section><h2>{zh ? "公开平台" : "Public platforms"}</h2>{unit.sellableUnit.listings.map((listing) => <p key={listing.id}><strong>{listing.dataSource.name}</strong><br />{listing.sourceListingId}</p>)}</section><section><h2>{zh ? "近期公开价格" : "Recent public prices"}</h2>{recent.map((item) => <p key={item.id}><strong>{money.format(item.nzdTotalMinor / 100)}</strong><br />{item.dataSource.name} · {item.collectedAt.toLocaleString(zh ? "zh-NZ" : "en-NZ", { timeZone: "Pacific/Auckland" })}</p>)}</section></div>
    <div className="flow-actions"><Link className="button button-primary" href={`/${params.locale}/account/calendar?pricingUnitId=${unit.id}`}>{zh ? "查看价格日历" : "Open price calendar"}</Link></div>
  </div></section>;
}
