import type { CheckListItem, Locale, MembershipSummary } from "../components/member/contracts";

export type NextAccountAction = "verify" | "review" | "billing" | "processing" | "quota" | "unit" | "reactivate" | "add";

export function nextAccountAction(summary: MembershipSummary, checks: CheckListItem[], emailVerified: boolean): { kind: NextAccountAction; id?: string } {
  if (!emailVerified || summary.collectionBlockReason === "EMAIL_VERIFICATION_REQUIRED") return { kind: "verify" };
  if (summary.collectionBlockReason === "MEMBERSHIP_REVIEW_REQUIRED") return { kind: "review" };
  if (!summary.serviceable) return { kind: "billing" };
  const processing = checks.find((check) => ["NEEDS_CONFIRMATION", "QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING", "EXCEPTION"].includes(check.status));
  if (processing) return { kind: "processing", id: processing.id };
  if (summary.usage.remainingSpotChecks <= 0) return { kind: "quota" };
  const pending = summary.pricingUnits.find((unit) => unit.active && unit.verificationStatus === "PENDING_OTA_VERIFICATION");
  if (pending) return { kind: "unit", id: pending.id };
  const active = summary.pricingUnits.find((unit) => unit.active);
  if (active) return { kind: "unit", id: active.id };
  const retained = summary.pricingUnits.find((unit) => unit.occupiesSlot);
  if (retained) return { kind: "reactivate", id: retained.id };
  return { kind: "add" };
}

export function accountDate(value: string | null | undefined, locale: Locale, time = false): string {
  if (!value) return locale === "zh" ? "暂无记录" : "Not recorded";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", ...(time ? { timeStyle: "short" as const } : {}) }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

export function membershipStatus(status: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    ACTIVE: ["Active", "有效"], PAST_DUE: ["Payment overdue", "付款逾期"], CANCELLED: ["Cancelled", "已取消"], PAUSED: ["Paused", "已暂停"], INCOMPLETE: ["Payment incomplete", "付款未完成"],
  };
  return labels[status]?.[locale === "zh" ? 1 : 0] ?? (locale === "zh" ? "状态待确认" : "Status needs review");
}

export function renewalCancellationMessage(summary: MembershipSummary, locale: Locale): string | null {
  if (!summary.currentPeriodEnd) return null;
  const copy = overviewCopy[locale];
  return `${copy.cancelBody} ${copy.serviceEnd}: ${accountDate(summary.currentPeriodEnd, locale, true)}.`;
}

export const overviewCopy = {
  en: {
    title: "Account overview", body: "Your allowance, properties and next step, in one place.", units: "Your pricing units", noUnits: "No pricing units yet", noUnitsBody: "Start a Price Check with a supported listing link or New Zealand address to confirm your first property.", detail: "View details", calendar: "Calendar", pendingUnit: "OTA unit verification pending", active: "Active", inactive: "Inactive", lastObserved: "Last observation", lastCompleted: "Last completed report", never: "No report in the available history", schedule: "Scheduled analysis", scheduleOff: "Automatic scheduling is currently off", onDemand: "On demand · no automatic schedule", nextEligible: "Next eligible scheduled review", retained: "Slot retained until", timeZone: "All dates and times use New Zealand time (Pacific/Auckland). Coverage is an entitlement; prices depend on available evidence.", remaining: "remaining", initial: "Includes the unused first report", rolling: "Rolling 30-day allowance", used: "used", availableAt: "Next allowance available", available: "Allowance available now", daily: "Daily price-check range", monitoring: "Monitoring-only extension", monitoringBody: "Market signals and selected dates; no daily price coverage implied.", next: "Your next step", recent: "Recent Price Checks", allChecks: "View all checks", noChecks: "No recent Price Checks", noChecksBody: "No checks are available in your current history window. New checks will appear here.", planActions: "Plan and billing", managePlan: "View plan and billing", alerts: "Price alerts", alertsBody: "Alert history is not yet available in this view. See the current feature status.", alertStatus: "View alert status", renewal: "Next renewal", serviceEnd: "Service ends", graceEnd: "Payment grace ends", currentPeriod: "Current billing period", keep: "Keep unchanged", confirmDeactivate: "Confirm deactivation", confirmCancel: "Confirm cancellation", deactivateTitle: "Deactivate this property?", deactivateBody: "Future scheduled collection will stop. Safely cancellable pending work will be cancelled. This property slot stays occupied for 30 days; you can reactivate the same property. Existing reports remain available under the retention policy.", cancelTitle: "Cancel renewal?", cancelBody: "Renewal will stop at the end of your paid period. Your account and existing reports are retained under the retention policy.", endUnknown: "The service-end date has not been confirmed. Review billing before cancelling.",
    actions: {
      verify: ["Verify your email before collecting prices.", "Open email verification", "#account-email-verification"],
      review: ["Collection is restricted while your membership is reviewed.", "Review account status", "/account/settings"],
      billing: ["Your membership currently prevents new collection. Review billing and the service status.", "Review billing", "/account/billing"],
      processing: ["An existing Price Check needs your attention or is in progress. Continue it before starting another.", "Continue existing check", "/account/checks/"],
      quota: ["Your rolling allowance is used. Existing reports remain available; see the next availability time above.", "View existing checks", "/account/checks"],
      unit: ["Review this property's identity, linked OTA listings and recent evidence before your next check.", "Review this property", "/account/pricing-units/"],
      reactivate: ["Your inactive property still holds a slot. Review it to reactivate the same property or check the replacement date.", "Review retained property", "/account/pricing-units/"],
      add: ["Start with a supported OTA listing or an address to confirm your first property.", "Add your first property", "/check"],
    },
  },
  zh: {
    title: "账户总览", body: "查看可用额度、房源状态，以及当前最重要的下一步。", units: "你的定价单位", noUnits: "尚未添加定价单位", noUnitsBody: "使用受支持的房源链接或新西兰地址开始价格检查，确认你的第一个房源。", detail: "查看详情", calendar: "价格日历", pendingUnit: "待完成 OTA 单位核验", active: "已启用", inactive: "已停用", lastObserved: "最近价格观察", lastCompleted: "最近完成的报告", never: "当前保留期内暂无报告", schedule: "自动分析", scheduleOff: "当前自动调度关闭", onDemand: "按需检查，不自动调度", nextEligible: "下次具备调度资格", retained: "额度保留至", timeZone: "日期与时间均按新西兰时区（Pacific/Auckland）。所示范围是方案权益，实际价格取决于可用证据。", remaining: "次可用", initial: "包含尚未使用的首份报告", rolling: "滚动 30 天检查额度", used: "次已使用", availableAt: "下次额度可用时间", available: "当前检查额度可用", daily: "逐日价格检查范围", monitoring: "仅监测扩展范围", monitoringBody: "市场信号及部分日期监测，不代表逐日价格覆盖。", next: "你的下一步", recent: "近期价格检查", allChecks: "查看全部检查", noChecks: "暂无近期价格检查", noChecksBody: "当前历史保留期内暂无可查看的检查，新检查会显示在这里。", planActions: "方案与账单", managePlan: "查看方案与账单", alerts: "价格提醒", alertsBody: "此处暂未提供提醒历史，请查看功能当前状态。", alertStatus: "查看提醒状态", renewal: "下次续费", serviceEnd: "服务截止", graceEnd: "付款宽限截止", currentPeriod: "当前账期", keep: "保持不变", confirmDeactivate: "确认停用", confirmCancel: "确认取消续费", deactivateTitle: "停用这个房源？", deactivateBody: "停用会停止后续自动采集，并取消能够安全取消的待执行任务。该房源仍保留额度 30 天；期间可重新启用同一房源。已有报告按保留规则继续提供。", cancelTitle: "取消自动续费？", cancelBody: "自动续费将在当前付费周期结束后停止。账户和已有报告按保留规则继续提供。", endUnknown: "服务截止日期尚未确认，请先查看账单再取消续费。",
    actions: {
      verify: ["采集公开价格前，请先验证账户邮箱。", "查看邮箱验证", "#account-email-verification"],
      review: ["会员正在审核，当前采集受到限制。", "查看账户状态", "/account/settings"],
      billing: ["当前会员状态不允许新采集，请检查付款和服务状态。", "检查方案与账单", "/account/billing"],
      processing: ["已有价格检查等待你的处理或正在进行，请先继续已有检查。", "继续已有检查", "/account/checks/"],
      quota: ["滚动检查额度已用完，已有报告仍可查看；额度恢复时间见上方。", "查看已有检查", "/account/checks"],
      unit: ["开始下一次检查前，先查看这个房源的身份、OTA 关联与近期证据。", "查看当前房源", "/account/pricing-units/"],
      reactivate: ["已停用房源仍占用额度，可查看详情后重新启用同一房源，或查看可替换日期。", "查看保留中的房源", "/account/pricing-units/"],
      add: ["使用受支持的 OTA 房源链接或新西兰地址，确认你的第一个房源。", "添加第一个房源", "/check"],
    },
  },
} as const;
