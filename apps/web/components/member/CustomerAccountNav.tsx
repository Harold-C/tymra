"use client";

import { Bell, Building2, CalendarDays, ChevronDown, CreditCard, Download, FileClock, LayoutDashboard, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { MembershipPlan } from "@tymra/db";
import { CustomerSignOut } from "./CustomerSessionActions";
import { LocaleSwitchLink } from "../public/LocaleSwitchLink";

const entries = [
  { path: "", icon: LayoutDashboard, en: "Overview", zh: "总览" },
  { path: "/pricing-units", icon: Building2, en: "Pricing units", zh: "定价单位" },
  { path: "/checks", icon: FileClock, en: "Price Checks", zh: "价格检查" },
  { path: "/calendar", icon: CalendarDays, en: "Price calendar", zh: "价格日历" },
  { path: "/alerts", icon: Bell, en: "Alerts", zh: "提醒" },
  { path: "/billing", icon: CreditCard, en: "Plan & billing", zh: "方案与账单" },
  { path: "/settings", icon: Settings2, en: "Settings", zh: "设置" },
] as const;

const planOrder: Record<MembershipPlan, number> = { FREE: 0, HOST: 1, PRO: 2, PORTFOLIO: 3 };

type FeatureAvailability = { alerts: boolean; portfolio: boolean; exports: boolean; integrations: boolean };

export function CustomerAccountNav({ locale, plan, features }: { locale: "en" | "zh"; plan: MembershipPlan; features: FeatureAvailability }) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const [scrollEdges, setScrollEdges] = useState(0);
  const mobileRef = useRef<HTMLDetailsElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const root = `/${locale}/account`;
  const advancedEntries = [
    ...(features.alerts && planOrder[plan] >= planOrder.HOST ? [{ path: "/alerts", icon: Bell, en: "Alerts", zh: "提醒" } as const] : []),
    ...(features.portfolio && planOrder[plan] >= planOrder.PRO ? [{ path: "/portfolio", icon: Building2, en: "Portfolio", zh: "组合管理" } as const] : []),
    ...(features.exports && planOrder[plan] >= planOrder.PRO ? [{ path: "/exports", icon: Download, en: "Exports", zh: "数据导出" } as const] : []),
    ...(features.integrations && planOrder[plan] >= planOrder.PORTFOLIO ? [{ path: "/integrations", icon: Settings2, en: "Integrations", zh: "系统集成" } as const] : []),
  ];
  const visibleEntries = [...entries.slice(0, 4), ...advancedEntries, ...entries.slice(5)];
  const currentEntry = [...visibleEntries].reverse().find((entry) => entry.path === "" ? pathname === root : pathname.startsWith(`${root}${entry.path}`));
  useEffect(() => {
    if (!mobileOpen) return;
    function close(event: KeyboardEvent) { if (event.key === "Escape" && mobileRef.current) { mobileRef.current.open = false; mobileRef.current.querySelector("summary")?.focus(); } }
    function outside(event: PointerEvent) { if (mobileRef.current && !mobileRef.current.contains(event.target as Node)) mobileRef.current.open = false; }
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("pointerdown", outside); };
  }, [mobileOpen]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const activeLink = activeLinkRef.current;
    if (!scroller) return;

    if (activeLink) {
      const centeredLeft = activeLink.offsetLeft - (scroller.clientWidth - activeLink.offsetWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, centeredLeft), behavior: "auto" });
    }

    function updateScrollEdges() {
      if (!scroller) return;
      const maximumLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const nextEdges = (scroller.scrollLeft > 1 ? 1 : 0) | (scroller.scrollLeft < maximumLeft - 1 ? 2 : 0);
      setScrollEdges((current) => current === nextEdges ? current : nextEdges);
    }

    const updateFrame = window.requestAnimationFrame(updateScrollEdges);
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(scroller);
    if (scroller.firstElementChild) resizeObserver.observe(scroller.firstElementChild);
    scroller.addEventListener("scroll", updateScrollEdges, { passive: true });
    return () => {
      window.cancelAnimationFrame(updateFrame);
      resizeObserver.disconnect();
      scroller.removeEventListener("scroll", updateScrollEdges);
    };
  }, [pathname, visibleEntries.length]);

  return (
    <nav
      className="customer-account-nav"
      lang={locale === "zh" ? "zh-CN" : "en-NZ"}
      aria-label={locale === "zh" ? "会员后台导航" : "Member account navigation"}
      data-can-scroll-back={Boolean(scrollEdges & 1)}
      data-can-scroll-forward={Boolean(scrollEdges & 2)}
    >
      <details className="customer-account-mobile" ref={mobileRef} onToggle={(event) => setMobileOpen(event.currentTarget.open)}>
        <summary aria-label={locale === "zh" ? "账户导航" : "Account navigation"} aria-expanded={mobileOpen}><span>{currentEntry?.[locale] ?? (locale === "zh" ? "我的账户" : "My account")}</span><span>{locale === "zh" ? "账户菜单" : "Account menu"}<ChevronDown aria-hidden="true" /></span></summary>
        <div className="customer-account-mobile-links">{visibleEntries.map((entry) => <Link key={entry.path} href={`${root}${entry.path}`} aria-current={entry === currentEntry ? "page" : undefined} onClick={() => { if (mobileRef.current) mobileRef.current.open = false; }}><entry.icon aria-hidden="true" />{entry[locale]}</Link>)}<LocaleSwitchLink locale={locale} label={locale === "zh" ? "English" : "中文"} onClick={() => { if (mobileRef.current) mobileRef.current.open = false; }} /><CustomerSignOut locale={locale} label={locale === "zh" ? "退出账户" : "Sign out"} /></div>
      </details>
      <div ref={scrollRef} className="customer-account-nav-scroll">
        <div className="rough-shell">
          {visibleEntries.map((entry) => {
            const href = `${root}${entry.path}`;
            const active = entry.path === "" ? pathname === root : pathname.startsWith(href);
            const Icon = entry.icon;
            return (
              <Link
                ref={active ? activeLinkRef : undefined}
                key={entry.path}
                href={href}
                className={active ? "is-active" : ""}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{entry[locale]}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <span className="customer-account-nav-edge customer-account-nav-edge-start" aria-hidden="true" />
      <span className="customer-account-nav-edge customer-account-nav-edge-end" aria-hidden="true" />
    </nav>
  );
}
