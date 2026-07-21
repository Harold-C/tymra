import { prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { adminText } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function ExceptionsPage({ searchParams }: { searchParams: { status?: string; priority?: string; type?: string; sort?: string } }) {
  const locale = getAdminLocale();
  const where = {
    ...(searchParams.status ? { status: searchParams.status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED" } : { status: { in: ["OPEN", "IN_PROGRESS"] as Array<"OPEN" | "IN_PROGRESS"> } }),
    ...(searchParams.priority ? { priority: searchParams.priority as "P0" | "P1" | "P2" | "P3" } : {}),
    ...(searchParams.type ? { type: searchParams.type as never } : {}),
  };
  const items = await prisma.exceptionCase.findMany({ where, orderBy: searchParams.sort === "oldest" ? { createdAt: "asc" } : [{ priority: "asc" }, { createdAt: "asc" }], take: 100, include: { priceCheck: { include: { property: { select: { canonicalName: true } }, unit: { select: { officialName: true } } } } } });
  return <section className="admin-page"><AdminPageHeader title={adminText(locale, "exceptionInbox")} description={adminText(locale, "exceptionInboxDescription")} actions={<Link className="button button-secondary" href="/admin/exceptions?status=RESOLVED">{adminText(locale, "viewResolved")}</Link>} /><form className="admin-filters" method="get"><label>{adminText(locale, "status")}<select name="status" defaultValue={searchParams.status ?? ""}><option value="">{adminText(locale, "openAndProgress")}</option><option value="OPEN">{adminText(locale, "open")}</option><option value="IN_PROGRESS">{adminText(locale, "inProgress")}</option><option value="RESOLVED">{adminText(locale, "resolved")}</option><option value="DISMISSED">{adminText(locale, "dismissed")}</option></select></label><label>{adminText(locale, "priority")}<select name="priority" defaultValue={searchParams.priority ?? ""}><option value="">{adminText(locale, "all")}</option>{["P0", "P1", "P2", "P3"].map((value) => <option key={value}>{value}</option>)}</select></label><label>{adminText(locale, "sort")}<select name="sort" defaultValue={searchParams.sort ?? "priority"}><option value="priority">{adminText(locale, "priority")}</option><option value="oldest">{adminText(locale, "oldestFirst")}</option></select></label><button className="button button-secondary" type="submit">{adminText(locale, "applyFilters")}</button></form>{items.length ? <div className="exception-list">{items.map((item) => <Link href={`/admin/exceptions/${item.id}`} key={item.id} className="exception-row"><div><StatusPill value={item.priority} locale={locale} /><StatusPill value={item.type} locale={locale} /></div><div><strong>{item.priceCheck.property?.canonicalName ?? adminText(locale, "unconfirmedProperty")}</strong><span>{item.priceCheck.unit?.officialName ?? adminText(locale, "unitNotConfirmed")} · {item.priceCheck.id}</span></div><div><StatusPill value={item.status} locale={locale} /><span>{adminText(locale, item.blockingUser ? "userBlocking" : "internalReview")}</span></div></Link>)}</div> : <div className="admin-empty"><h2>{adminText(locale, "inboxClear")}</h2><p>{adminText(locale, "inboxClearBody")}</p></div>}</section>;
}
