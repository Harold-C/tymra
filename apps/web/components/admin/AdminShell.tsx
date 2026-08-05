"use client";

import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Database,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquare,
  RadioTower,
  Search,
  ShieldCheck,
  Settings,
  Tags,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";

import { AdminLanguageSwitch } from "./AdminLanguageSwitch";
import { AdminSignOut } from "./AdminSignOut";

type NavigationItem = {
  label: { en: string; zh: string };
  href: string;
  icon: typeof LayoutDashboard;
  badge?: number;
};

type NavigationGroup = {
  label: { en: string; zh: string };
  items: NavigationItem[];
};

export function AdminShell({
  email,
  locale,
  environment,
  schedulerEnabled,
  pendingCount,
  children,
}: {
  email: string;
  locale: AdminLocale;
  environment: string;
  schedulerEnabled: boolean;
  pendingCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const text = copy(locale);
  const groups: NavigationGroup[] = [
    {
      label: text.operations,
      items: [
        { label: text.inbox, href: "/admin/exceptions", icon: AlertTriangle, badge: pendingCount },
        { label: text.priceChecks, href: "/admin/checks", icon: ClipboardCheck },
      ],
    },
    {
      label: text.collection,
      items: [
        { label: text.readiness, href: "/admin/production-readiness", icon: ShieldCheck },
        { label: text.sources, href: "/admin/data-sources", icon: Database },
        { label: text.runs, href: "/admin/collection-runs", icon: Activity },
        { label: text.schedules, href: "/admin/collection-control", icon: CalendarClock },
      ],
    },
    {
      label: text.marketData,
      items: [
        { label: text.intelligence, href: "/admin/market-intelligence", icon: RadioTower },
        { label: text.coverage, href: "/admin/market-coverage", icon: Gauge },
        { label: text.explorer, href: "/admin/data-explorer", icon: Search },
      ],
    },
    {
      label: text.accommodation,
      items: [
        { label: text.accommodations, href: "/admin/accommodations", icon: Building2 },
        { label: text.listings, href: "/admin/listings", icon: Tags },
        { label: text.competitors, href: "/admin/competitors", icon: ListChecks },
      ],
    },
    {
      label: text.system,
      items: [
        { label: text.feedback, href: "/admin/feedback", icon: MessageSquare },
        { label: text.audit, href: "/admin/audit", icon: History },
        { label: text.settings, href: "/admin/settings", icon: Settings },
      ],
    },
  ];

  useEffect(() => setMenuOpen(false), [pathname]);

  const navigation = (
    <>
      <Link className={`admin-overview-link ${pathname === "/admin" ? "is-active" : ""}`} href="/admin" aria-current={pathname === "/admin" ? "page" : undefined}>
        <LayoutDashboard size={17} aria-hidden="true" />
        <span>{localized(text.overview, locale)}</span>
      </Link>
      {groups.map((group) => (
        <section className="admin-nav-group" key={group.label.en}>
          <h2>{localized(group.label, locale)}</h2>
          {group.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link className={active ? "is-active" : ""} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden="true" />
                <span>{localized(item.label, locale)}</span>
                {item.badge ? <strong className="admin-nav-badge" aria-label={text.pendingLabel.replace("{count}", String(item.badge))}>{item.badge}</strong> : null}
              </Link>
            );
          })}
        </section>
      ))}
    </>
  );

  return (
    <div className="admin-app">
      <button className={`admin-sidebar-scrim ${menuOpen ? "is-visible" : ""}`} type="button" aria-label={text.closeMenu} onClick={() => setMenuOpen(false)} />
      <aside className={`admin-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="admin-sidebar-heading">
          <Link className="admin-brand" href="/admin">Tymra <span>{text.console}</span></Link>
          <button className="icon-button admin-sidebar-close" type="button" aria-label={text.closeMenu} onClick={() => setMenuOpen(false)}><X size={18} /></button>
        </div>
        <nav aria-label={text.navigation}>{navigation}</nav>
        <div className="admin-account"><div><span>{text.signedIn}</span><strong>{email}</strong></div><AdminSignOut locale={locale} /></div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button className="icon-button admin-mobile-menu-button" type="button" aria-label={text.openMenu} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
          <form className="admin-global-search" action="/admin/search" role="search">
            <Search size={16} aria-hidden="true" />
            <input name="q" aria-label={text.search} placeholder={text.searchPlaceholder} />
          </form>
          <div className="admin-topbar-actions">
            <Link className="admin-pending-link" href="/admin/exceptions"><AlertTriangle size={15} /><span>{text.pending}</span><strong>{pendingCount}</strong></Link>
            <span className={`admin-runtime-chip ${schedulerEnabled ? "is-on" : "is-off"}`}><i />{schedulerEnabled ? text.schedulerOn : text.schedulerOff}</span>
            <span className="admin-environment-chip">{environment}</span>
            <AdminLanguageSwitch locale={locale} />
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function localized(value: { en: string; zh: string }, locale: AdminLocale) {
  return value[locale];
}

function copy(locale: AdminLocale) {
  const bilingual = {
    overview: { en: "Overview", zh: "总览" },
    operations: { en: "Operations", zh: "运营" },
    inbox: { en: "Inbox & incidents", zh: "待办与异常" },
    priceChecks: { en: "Price checks", zh: "价格检查" },
    collection: { en: "Collection", zh: "采集" },
    readiness: { en: "Production readiness", zh: "生产就绪" },
    sources: { en: "Data sources", zh: "数据来源" },
    runs: { en: "Collection runs", zh: "采集运行" },
    schedules: { en: "Schedules & queue", zh: "计划与队列" },
    marketData: { en: "Market data", zh: "市场数据" },
    intelligence: { en: "Events & signals", zh: "事件与信号" },
    coverage: { en: "Market coverage", zh: "市场覆盖" },
    explorer: { en: "Data explorer", zh: "数据浏览器" },
    accommodation: { en: "Accommodation", zh: "住宿资产" },
    accommodations: { en: "Properties & units", zh: "房源与房型" },
    listings: { en: "Platform listings", zh: "平台房源" },
    competitors: { en: "Competitor relationships", zh: "竞品关系" },
    system: { en: "System", zh: "系统" },
    feedback: { en: "User feedback", zh: "用户反馈" },
    audit: { en: "Audit log", zh: "审计记录" },
    settings: { en: "Runtime settings", zh: "运行设置" },
  };
  return {
    ...bilingual,
    console: locale === "zh" ? "运营控制台" : "Operations console",
    navigation: locale === "zh" ? "运营后台导航" : "Operations navigation",
    signedIn: locale === "zh" ? "已登录" : "Signed in",
    search: locale === "zh" ? "全局搜索" : "Global search",
    searchPlaceholder: locale === "zh" ? "搜索检查、运行、来源或房源" : "Search checks, runs, sources or properties",
    pending: locale === "zh" ? "待办" : "Pending",
    pendingLabel: locale === "zh" ? "{count} 项待处理" : "{count} pending items",
    schedulerOn: locale === "zh" ? "定时器开启" : "Scheduler on",
    schedulerOff: locale === "zh" ? "定时器关闭" : "Scheduler off",
    openMenu: locale === "zh" ? "打开导航" : "Open navigation",
    closeMenu: locale === "zh" ? "关闭导航" : "Close navigation",
  };
}
