import { redirect } from "next/navigation";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";
import { readSampleQuoteTrends } from "@/lib/server/sample-quote-trends";
import { parseSampleTrendFilter } from "@/lib/sample-trend-filter";
import { SampleQuoteTrends } from "@/components/member/SampleQuoteTrends";
import type { SampleQuoteTrendSummary } from "@tymra/domain";

export const dynamic = "force-dynamic";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) {
  return { title: params.locale === "zh" ? "基督城样本报价走势 | Tymra" : "Christchurch sample quote trends | Tymra", robots: { index: false, follow: false } };
}
export default async function SampleQuotesPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getCustomerSessionForPage();
  if (!session) redirect(`/${params.locale}/sign-in?returnTo=${encodeURIComponent(`/${params.locale}/account/market/sample-quotes`)}`);
  const parsed = parseSampleTrendFilter(searchParams);
  const filter = parsed.success ? parsed.data : parseSampleTrendFilter({}).data!;
  let data: SampleQuoteTrendSummary | null = null, error: "invalid" | "error" | undefined = parsed.success ? undefined : "invalid";
  if (!error) { try { data = await readSampleQuoteTrends(filter); } catch { error = "error"; } }
  return <SampleQuoteTrends locale={params.locale} filter={filter} data={data} error={error} />;
}
