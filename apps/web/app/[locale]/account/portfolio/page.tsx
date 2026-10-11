import { PortfolioView } from "@/components/member/portal/PortfolioView";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "portfolio"); }
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <PortfolioView locale={params.locale} />; }
