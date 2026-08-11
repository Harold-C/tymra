import type { Metadata } from "next";

export type AccountMetadataPage = "overview" | "pricingUnits" | "pricingUnitDetail" | "checks" | "checkDetail" | "calendar" | "alerts" | "billing" | "settings" | "exports" | "integrations" | "portfolio";

const accountTitles: Record<"en" | "zh", Record<AccountMetadataPage, string>> = {
  en: {
    overview: "Your Price Checks",
    pricingUnits: "Pricing units",
    pricingUnitDetail: "Pricing unit details",
    checks: "Price Check history",
    checkDetail: "Price Check report",
    calendar: "Price calendar",
    alerts: "Price alerts",
    billing: "Plan and billing",
    settings: "Account settings",
    exports: "Data exports",
    integrations: "Integrations",
    portfolio: "Portfolio",
  },
  zh: {
    overview: "你的价格检查",
    pricingUnits: "定价单位",
    pricingUnitDetail: "定价单位详情",
    checks: "价格检查历史",
    checkDetail: "价格检查报告",
    calendar: "价格日历",
    alerts: "价格提醒",
    billing: "方案与账单",
    settings: "账户设置",
    exports: "数据导出",
    integrations: "系统集成",
    portfolio: "组合管理",
  },
};

export function getAccountMetadata(locale: "en" | "zh", page: AccountMetadataPage): Metadata {
  return {
    title: `${accountTitles[locale][page]} | Tymra`,
    robots: { index: false, follow: false },
  };
}
