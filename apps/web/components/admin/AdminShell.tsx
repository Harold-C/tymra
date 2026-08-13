"use client";

import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Database,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquare,
  RadioTower,
  MonitorUp,
  Search,
  ShieldCheck,
  Settings,
  Users,
  WalletCards,
  Tags,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [favorites, setFavorites] = useState<string[]>([]);
  const [savedViews, setSavedViews] = useState<Array<{ name: string; url: string }>>([]);
  const [recentPages, setRecentPages] = useState<string[]>([]);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const wasMenuOpen = useRef(false);
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
        { label: text.manualBrowser, href: "/admin/argus-manual-actions", icon: MonitorUp },
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
      label: text.membership,
      items: [
        { label: text.customers, href: "/admin/customers", icon: Users },
        { label: text.memberships, href: "/admin/memberships", icon: ShieldCheck },
        { label: text.membershipRisk, href: "/admin/membership-risk", icon: AlertTriangle },
        { label: text.billingEvents, href: "/admin/billing-events", icon: WalletCards },
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
  const allItems = [{ label: text.overview, href: "/admin", icon: LayoutDashboard }, ...groups.flatMap((group) => group.items)];
  const activeItem = allItems.find((item) => item.href === "/admin" ? pathname === "/admin" : isActivePath(pathname, item.href));
  const pageLabel = pathname === "/admin/search" ? text.search : activeItem ? localized(activeItem.label, locale) : text.console;
  const pageTitle = `${pageLabel} · Tymra`;

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    setCollapsedGroups(readStringSet("tymra.admin.collapsed-groups.v1"));
    setFavorites([...readStringSet("tymra.admin.favorites.v1")]);
    setRecentPages([...readStringSet("tymra.admin.recent-pages.v1")]);
    const refreshSavedViews = () => setSavedViews(readSavedViews());
    refreshSavedViews();
    window.addEventListener("tymra:saved-views", refreshSavedViews);
    return () => window.removeEventListener("tymra:saved-views", refreshSavedViews);
  }, []);
  useEffect(() => {
    document.title = pageTitle;
    if (pathname === "/admin") return;
    setRecentPages((current) => {
      const next = [pathname, ...current.filter((item) => item !== pathname)].slice(0, 4);
      window.localStorage.setItem("tymra.admin.recent-pages.v1", JSON.stringify(next));
      return next;
    });
  }, [pageTitle, pathname]);
  useEffect(() => {
    if (!menuOpen) {
      document.body.style.removeProperty("overflow");
      if (wasMenuOpen.current) menuButtonRef.current?.focus();
      wasMenuOpen.current = false;
      return;
    }
    wasMenuOpen.current = true;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.removeProperty("overflow"); };
  }, [menuOpen]);

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      window.localStorage.setItem("tymra.admin.collapsed-groups.v1", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleFavorite() {
    setFavorites((current) => {
      const next = current.includes(pathname) ? current.filter((item) => item !== pathname) : [...current, pathname].slice(-8);
      window.localStorage.setItem("tymra.admin.favorites.v1", JSON.stringify(next));
      return next;
    });
  }

  const navigation = (
    <>
      <Link className={`admin-overview-link ${pathname === "/admin" ? "is-active" : ""}`} href="/admin" aria-current={pathname === "/admin" ? "page" : undefined}>
        <LayoutDashboard size={17} aria-hidden="true" />
        <span>{localized(text.overview, locale)}</span>
      </Link>
      {favorites.length ? <section className="admin-nav-group admin-favorites-group"><h2>{locale === "zh" ? "收藏" : "Favorites"}</h2>{favorites.map((href) => {
        const item = allItems.find((candidate) => candidate.href === "/admin" ? href === "/admin" : isActivePath(href, candidate.href));
        if (!item) return null;
        const Icon = item.icon;
        return <Link className={pathname === href ? "is-active" : ""} href={href} key={href}><Icon size={17} aria-hidden="true" /><span>{localized(item.label, locale)}</span></Link>;
      })}</section> : null}
      {savedViews.length ? <section className="admin-nav-group admin-saved-views"><h2>{locale === "zh" ? "已保存视图" : "Saved views"}</h2>{savedViews.map((view) => <Link href={view.url} key={view.url}><BookmarkIcon /><span>{view.name}</span></Link>)}</section> : null}
      {recentPages.length ? <section className="admin-nav-group admin-recent-pages"><h2>{locale === "zh" ? "最近访问" : "Recent"}</h2>{recentPages.map((href) => { const item = allItems.find((candidate) => candidate.href === "/admin" ? href === "/admin" : isActivePath(href, candidate.href)); if (!item) return null; const Icon = item.icon; return <Link href={href} key={href}><Icon size={17} aria-hidden="true" /><span>{localized(item.label, locale)}</span></Link>; })}</section> : null}
      {groups.map((group) => (
        <section className="admin-nav-group" key={group.label.en}>
          <h2><button type="button" aria-expanded={!collapsedGroups.has(group.label.en)} onClick={() => toggleGroup(group.label.en)}><span>{localized(group.label, locale)}</span><ChevronDown size={13} aria-hidden="true" /></button></h2>
          {!collapsedGroups.has(group.label.en) ? group.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link className={active ? "is-active" : ""} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden="true" />
                <span>{localized(item.label, locale)}</span>
                {item.badge ? <strong className="admin-nav-badge" aria-label={text.pendingLabel.replace("{count}", String(item.badge))}>{item.badge}</strong> : null}
              </Link>
            );
          }) : null}
        </section>
      ))}
    </>
  );

  return (
    <div className="admin-app">
      <button className={`admin-sidebar-scrim ${menuOpen ? "is-visible" : ""}`} type="button" aria-label={text.closeMenu} tabIndex={menuOpen ? 0 : -1} aria-hidden={!menuOpen || undefined} onClick={() => setMenuOpen(false)} />
      <aside className={`admin-sidebar ${menuOpen ? "is-open" : ""}`} ref={sidebarRef} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen || undefined} aria-label={menuOpen ? text.navigation : undefined}>
        <div className="admin-sidebar-heading">
          <Link className="admin-brand" href="/admin">Tymra <span>{text.console}</span></Link>
          <button className="icon-button admin-sidebar-close" ref={closeButtonRef} type="button" aria-label={text.closeMenu} onClick={() => setMenuOpen(false)}><X size={18} /></button>
        </div>
        <nav aria-label={text.navigation}>{navigation}</nav>
        <div className="admin-account"><div><span>{text.signedIn}</span><strong>{email}</strong></div><AdminSignOut locale={locale} /></div>
      </aside>
      <div className="admin-workspace" aria-hidden={menuOpen || undefined}>
        <header className="admin-topbar">
          <button className="icon-button admin-mobile-menu-button" ref={menuButtonRef} type="button" aria-label={text.openMenu} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
          <form className="admin-global-search" action="/admin/search" role="search">
            <Search size={16} aria-hidden="true" />
            <input name="q" aria-label={text.search} placeholder={text.searchPlaceholder} />
          </form>
          <div className="admin-topbar-actions">
            <button className={`admin-favorite-toggle ${favorites.includes(pathname) ? "is-active" : ""}`} type="button" aria-pressed={favorites.includes(pathname)} aria-label={favorites.includes(pathname) ? (locale === "zh" ? "取消收藏当前页面" : "Remove current page from favorites") : (locale === "zh" ? "收藏当前页面" : "Favorite current page")} title={favorites.includes(pathname) ? (locale === "zh" ? "取消收藏" : "Remove favorite") : (locale === "zh" ? "收藏页面" : "Favorite page")} onClick={toggleFavorite}><Star size={15} /></button>
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

function readStringSet(key: string) {
  try { const value = JSON.parse(window.localStorage.getItem(key) ?? "[]"); return new Set<string>(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []); }
  catch { return new Set<string>(); }
}

function readSavedViews() {
  try { const value = JSON.parse(window.localStorage.getItem("tymra.admin.saved-views.v1") ?? "[]"); return Array.isArray(value) ? value.filter((entry): entry is { name: string; url: string } => typeof entry?.name === "string" && typeof entry?.url === "string") : []; }
  catch { return []; }
}

function BookmarkIcon() { return <Star size={17} aria-hidden="true" />; }

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
    manualBrowser: { en: "Manual browser actions", zh: "人工浏览器接管" },
    schedules: { en: "Schedules & queue", zh: "计划与队列" },
    marketData: { en: "Market data", zh: "市场数据" },
    intelligence: { en: "Events & signals", zh: "事件与信号" },
    coverage: { en: "Market coverage", zh: "市场覆盖" },
    explorer: { en: "Data explorer", zh: "数据浏览器" },
    accommodation: { en: "Accommodation", zh: "住宿资产" },
    accommodations: { en: "Properties & units", zh: "房源与房型" },
    listings: { en: "Platform listings", zh: "平台房源" },
    competitors: { en: "Competitor relationships", zh: "竞品关系" },
    membership: { en: "Membership", zh: "会员运营" },
    customers: { en: "Customers", zh: "会员客户" },
    memberships: { en: "Memberships", zh: "会员状态" },
    membershipRisk: { en: "Membership risk", zh: "会员风控" },
    billingEvents: { en: "Billing events", zh: "计费事件" },
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
