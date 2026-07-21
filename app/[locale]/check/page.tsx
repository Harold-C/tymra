import { AnonymousCheckStart } from "@/components/public/RoughResultFlow";

export default function CheckPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { input?: string } }) {
  return <AnonymousCheckStart locale={params.locale} initialInput={searchParams.input ?? ""} />;
}
