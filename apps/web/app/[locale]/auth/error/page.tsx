import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { PublicShell } from "@/components/public/PublicShell";

export default function AuthErrorPage({ params }: { params: { locale: "en" | "zh" } }) {
  const zh = params.locale === "zh";
  return (
    <PublicShell locale={params.locale}>
      <section className="result-state">
        <div>
          <AlertTriangle aria-hidden="true" />
          <h1>{zh ? "此验证链接无效" : "This verification link is invalid"}</h1>
          <p>{zh ? "Price Check 验证链接可能已经使用、过期或被撤销。请重新开始检查。" : "The Price Check verification link may have been used, expired or revoked. Start the check again."}</p>
          <Link className="button button-primary" href={`/${params.locale}/check`}>{zh ? "重新开始 Price Check" : "Start a new Price Check"}</Link>
        </div>
      </section>
    </PublicShell>
  );
}
