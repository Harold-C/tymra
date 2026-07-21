import { prisma } from "@tymra/db";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { ReissueResultLinkButton } from "@/components/admin/ReissueResultLinkButton";
import { adminDateLocale, adminLabel, adminText, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function CheckDetailPage({ params }: { params: { checkId: string } }) {
  const locale = getAdminLocale();
  const check = await prisma.priceCheck.findUnique({
    where: { id: params.checkId },
    include: {
      property: true,
      unit: true,
      stayQuery: true,
      jobs: { orderBy: { createdAt: "asc" } },
      collectionRuns: { include: { dataSource: true }, orderBy: { createdAt: "asc" } },
      resultVersions: {
        include: { insights: true, accessTokens: { select: { issuedAt: true, expiresAt: true, revokedAt: true } } },
        orderBy: { version: "desc" },
      },
      exceptions: { orderBy: { createdAt: "desc" } },
      actions: { orderBy: { createdAt: "desc" } },
      emails: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!check) notFound();
  const audit = await prisma.auditEvent.findMany({
    where: { entityType: "PriceCheck", entityId: check.id },
    orderBy: { createdAt: "asc" },
  });
  const canReissue = check.resultVersions.some((result) => result.status === "PUBLISHED");

  return (
    <section className="admin-page">
      <AdminPageHeader
        title={adminText(locale, "checkDetail")}
        description={check.id}
        actions={<div className="header-pills"><StatusPill value={check.status} locale={locale} /><ReissueResultLinkButton locale={locale} checkId={check.id} enabled={canReissue} /></div>}
      />
      <div className="detail-sections">
        <section>
          <h2>{adminText(locale, "request")}</h2>
          <dl className="detail-list">
            <div><dt>{adminLabel(locale, "Input")}</dt><dd>{check.rawInput}</dd></div>
            <div><dt>{adminLabel(locale, "Locale")}</dt><dd>{check.locale}</dd></div>
            <div><dt>{adminLabel(locale, "Market")}</dt><dd>{check.marketKey}</dd></div>
            <div><dt>{adminLabel(locale, "Property")}</dt><dd>{check.property?.canonicalName ?? adminText(locale, "unconfirmed")}</dd></div>
            <div><dt>{adminLabel(locale, "Unit")}</dt><dd>{check.unit?.officialName ?? adminText(locale, "unconfirmed")}</dd></div>
            <div><dt>{adminLabel(locale, "Demo")}</dt><dd>{check.isDemo ? adminText(locale, "demoData") : adminText(locale, "no")}</dd></div>
          </dl>
        </section>
        <section><h2>{adminText(locale, "jobs")}</h2><CompactTable locale={locale} headings={["Type", "Status", "Attempts", "Run at"]} rows={check.jobs.map((job) => [job.type, <StatusPill key={`${job.id}:status`} value={job.status} locale={locale} />, job.attemptCount, date(job.runAt, locale)])} /></section>
        <section><h2>{adminText(locale, "navRuns")}</h2><CompactTable locale={locale} headings={["Source", "Status", "Success", "Failure"]} rows={check.collectionRuns.map((run) => [run.dataSource.name, <StatusPill key={`${run.id}:status`} value={run.status} locale={locale} />, run.successCount, run.failureCount])} /></section>
        <section><h2>{adminText(locale, "resultVersions")}</h2><CompactTable locale={locale} headings={["Version", "Status", "Outcome", "Confidence", "Insights", "Links"]} rows={check.resultVersions.map((result) => [result.version, <StatusPill key={`${result.id}:status`} value={result.status} locale={locale} />, result.outcome, result.confidence, result.insights.length, result.accessTokens.length])} /></section>
        <section><h2>{adminText(locale, "navExceptions")}</h2><CompactTable locale={locale} headings={["Type", "Priority", "Status", "Open"]} rows={check.exceptions.map((item) => [item.type, item.priority, <StatusPill key={`${item.id}:status`} value={item.status} locale={locale} />, <a key={`${item.id}:link`} href={`/admin/exceptions/${item.id}`}>{adminText(locale, "workspace")}</a>])} /></section>
        <section><h2>{adminText(locale, "emailDelivery")}</h2><CompactTable locale={locale} headings={["Type", "Status", "Provider", "Attempts"]} rows={check.emails.map((email) => [email.type, <StatusPill key={`${email.id}:status`} value={email.status} locale={locale} />, email.provider, email.attemptCount])} /></section>
        <section><h2>{adminText(locale, "auditTimeline")}</h2><CompactTable locale={locale} headings={["Event", "Created"]} rows={audit.map((event) => [event.eventType, date(event.createdAt, locale)])} /></section>
      </div>
    </section>
  );
}

function CompactTable({ locale, headings, rows }: { locale: AdminLocale; headings: string[]; rows: React.ReactNode[][] }) {
  return rows.length ? (
    <div className="admin-table-wrap"><table className="admin-table compact-table"><thead><tr>{headings.map((heading) => <th key={heading}>{adminLabel(locale, heading)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
  ) : <p className="empty-inline">{adminText(locale, "noRecordsInline")}</p>;
}

function date(value: Date, locale: AdminLocale) {
  return value.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" });
}
