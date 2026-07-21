import { Activity, AlertTriangle, Building2, CalendarClock, CalendarDays, ClipboardCheck, Database, FileClock, Gauge, History, Home, ListChecks, MessageSquare, Radio, ScanSearch, Settings, Tags } from "lucide-react";
import Link from "next/link";

import { adminText, type AdminLocale } from "@/lib/admin-i18n";

import { AdminLanguageSwitch } from "./AdminLanguageSwitch";
import { AdminSignOut } from "./AdminSignOut";

const navigation = [
  ["navExceptions", "/admin/exceptions", AlertTriangle],
  ["navChecks", "/admin/checks", ClipboardCheck],
  ["navProperties", "/admin/properties", Building2],
  ["navUnits", "/admin/units", Home],
  ["navListings", "/admin/listings", Tags],
  ["navCompetitors", "/admin/competitors", ListChecks],
  ["navCoverage", "/admin/market-coverage", Gauge],
  ["navCollectionControl", "/admin/collection-control", CalendarClock],
  ["navRuns", "/admin/collection-runs", Activity],
  ["navSources", "/admin/data-sources", Database],
  ["navDataExplorer", "/admin/data-explorer", ScanSearch],
  ["navEvents", "/admin/events", CalendarDays],
  ["navSignals", "/admin/signals", Radio],
  ["navFeedback", "/admin/feedback", MessageSquare],
  ["navAudit", "/admin/audit", History],
  ["navSettings", "/admin/settings", Settings],
] as const;

export function AdminShell({ email, locale, children }: { email: string; locale: AdminLocale; children: React.ReactNode }) {
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin/exceptions">Tymra <span>{adminText(locale, "operations")}</span></Link>
        <nav aria-label={adminText(locale, "navigation")}>{navigation.map(([key, href, Icon]) => <Link href={href} key={href}><Icon size={17} /><span>{adminText(locale, key)}</span></Link>)}</nav>
        <div className="admin-account"><div><span>{adminText(locale, "signedIn")}</span><strong>{email}</strong></div><AdminSignOut locale={locale} /></div>
      </aside>
      <div className="admin-workspace"><header className="admin-topbar"><div><FileClock size={17} /><span>{adminText(locale, "localOperations")}</span></div><div className="admin-topbar-actions"><AdminLanguageSwitch locale={locale} /><span className="demo-ops-label">{adminText(locale, "demoData")}</span></div></header><main>{children}</main></div>
    </div>
  );
}
