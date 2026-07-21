import { prisma } from "@tymra/db";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { ExceptionActions } from "@/components/admin/ExceptionActions";
import { adminDateLocale, adminLabel, adminText, formatAdminValue } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function ExceptionDetailPage({ params }: { params: { exceptionId: string } }) {
  const locale = getAdminLocale();
  const item = await prisma.exceptionCase.findUnique({
    where: { id: params.exceptionId },
    include: {
      priceCheck: {
        include: {
          property: true,
          unit: true,
          stayQuery: true,
          resultVersions: { include: { insights: true }, orderBy: { version: "desc" } },
          collectionRuns: { include: { dataSource: true }, orderBy: { createdAt: "desc" } },
          actions: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!item) notFound();
  const audits = await prisma.auditEvent.findMany({ where: { OR: [{ entityType: "ExceptionCase", entityId: item.id }, { entityType: "PriceCheck", entityId: item.priceCheckId }] }, orderBy: { createdAt: "desc" }, take: 50 });
  const actions = Array.isArray(item.allowedActions) ? item.allowedActions.map(String) : [];
  return <section className="admin-page exception-workspace"><AdminPageHeader title={`${item.priority} · ${formatAdminValue(locale, item.type)}`} description={`${adminText(locale, "exception")} ${item.id}`} actions={<div className="header-pills"><StatusPill value={item.status} locale={locale} /><StatusPill value={item.priceCheck.status} locale={locale} /></div>} /><div className="workspace-grid"><div className="workspace-main"><section><h2>{adminText(locale, "systemRecommendation")}</h2><p className="recommendation">{formatAdminValue(locale, item.recommendation)}</p><h3>{adminText(locale, "evidenceDifferences")}</h3><pre className="evidence-block">{JSON.stringify(item.evidence, null, 2)}</pre></section><section><h2>{adminText(locale, "resultPreview")}</h2>{item.priceCheck.resultVersions[0] ? <><dl className="detail-list"><div><dt>{adminLabel(locale, "Version")}</dt><dd>{item.priceCheck.resultVersions[0].version}</dd></div><div><dt>{adminLabel(locale, "Confidence")}</dt><dd>{formatAdminValue(locale, item.priceCheck.resultVersions[0].confidence)}</dd></div><div><dt>{adminLabel(locale, "Outcome")}</dt><dd>{formatAdminValue(locale, item.priceCheck.resultVersions[0].outcome)}</dd></div><div><dt>{adminLabel(locale, "Insights")}</dt><dd>{item.priceCheck.resultVersions[0].insights.length}</dd></div></dl></> : <p>{adminText(locale, "noResultVersion")}</p>}</section><section><h2>{adminText(locale, "resolutionActions")}</h2><ExceptionActions locale={locale} exceptionId={item.id} actions={actions} /></section></div><aside className="workspace-side"><section><h2>{adminText(locale, "navChecks")}</h2><dl className="detail-list"><div><dt>ID</dt><dd><a href={`/admin/checks/${item.priceCheck.id}`}>{item.priceCheck.id}</a></dd></div><div><dt>{adminLabel(locale, "Property")}</dt><dd>{item.priceCheck.property?.canonicalName ?? adminText(locale, "unconfirmed")}</dd></div><div><dt>{adminLabel(locale, "Unit")}</dt><dd>{item.priceCheck.unit?.officialName ?? adminText(locale, "unconfirmed")}</dd></div><div><dt>{adminLabel(locale, "Market")}</dt><dd>{item.priceCheck.marketKey}</dd></div><div><dt>{adminLabel(locale, "Demo")}</dt><dd>{item.isDemo ? adminText(locale, "demoData") : adminText(locale, "no")}</dd></div></dl></section><section><h2>{adminText(locale, "auditTimeline")}</h2><ol className="audit-timeline">{audits.map((event) => <li key={event.id}><strong>{formatAdminValue(locale, event.eventType)}</strong><span>{event.createdAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" })}</span></li>)}</ol></section></aside></div></section>;
}
