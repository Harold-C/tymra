import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default function OnDemandPage() {
  const zh = getAdminLocale() === "zh";
  return <section className="admin-page"><AdminPageHeader title={zh ? "服务诊断与恢复" : "Service diagnostics and recovery"} description={zh ? "从关联事件恢复原始请求，或从已批准的数据来源执行有界验证。客户的分析条件由其自己的后台管理。" : "Recover the original request from its incident, or validate an approved data supply workflow. Customers manage analysis conditions in their own account."} /><div className="header-pills"><Link className="button button-primary" href="/admin/exceptions">{zh ? "查看事件" : "Open incidents"}</Link><Link className="button button-secondary" href="/admin/collection-control">{zh ? "验证数据供应" : "Validate data supply"}</Link></div></section>;
}
