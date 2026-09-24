import { getEnvironment } from "@tymra/config";
import { addNzCalendarDays, nzDateKey } from "@tymra/domain";

import { InternalOnDemandForm } from "@/components/admin/InternalOnDemandForm";

export const dynamic = "force-dynamic";

export default function InternalOnDemandPage() {
  const environment = getEnvironment();
  const checkIn = addNzCalendarDays(nzDateKey(new Date()), 30);
  const checkOut = addNzCalendarDays(checkIn, 1);
  return <main className="admin-page">
    <header className="admin-page-header"><div><p className="eyebrow">National Data Core</p><h1>On-demand collection</h1><p>Launch an auditable, bounded address benchmark or OTA listing price collection without creating a customer account.</p></div></header>
    <InternalOnDemandForm defaults={{ checkIn, checkOut }} enabled={environment.INTERNAL_ON_DEMAND_ENABLED} />
  </main>;
}
