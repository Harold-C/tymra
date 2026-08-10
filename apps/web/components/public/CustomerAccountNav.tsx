"use client";

import { Bell, Building2, CalendarDays, CreditCard, Download, FileClock, LayoutDashboard, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { MembershipPlan } from "@tymra/db";

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

export function CustomerAccountNav({ locale, plan }: { locale: "en" | "zh"; plan: MembershipPlan }) {
  const pathname = usePathname();
  const root = `/${locale}/account`;
  const visibleEntries = planOrder[plan] >= planOrder.PRO
    ? [...entries.slice(0, 5), { path: "/exports", icon: Download, en: "Exports", zh: "数据导出" } as const, ...entries.slice(5)]
    : entries;
  return (
    <nav className="customer-account-nav" aria-label={locale === "zh" ? "会员后台导航" : "Member account navigation"}>
      <div className="rough-shell">
        {visibleEntries.map((entry) => {
          const href = `${root}${entry.path}`;
          const active = entry.path === "" ? pathname === root : pathname.startsWith(href);
          const Icon = entry.icon;
          return <Link key={entry.path} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{entry[locale]}</span></Link>;
        })}
      </div>
    </nav>
  );
}
