import { getEnvironment } from "@tymra/config";
import { resolveResultLink } from "@tymra/db";

import { ResultView, type ResolvedResult } from "@/components/public/ResultView";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: { locale: "en" | "zh"; token: string } }) {
  const token = decodeURIComponent(params.token);
  const resolved = await resolveResultLink(token, getEnvironment().RESULT_TOKEN_SECRET);
  const serialized = JSON.parse(JSON.stringify(resolved)) as ResolvedResult;
  return <ResultView locale={params.locale} token={token} resolved={serialized} />;
}
