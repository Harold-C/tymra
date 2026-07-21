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
          <p>{zh ? "链接可能已经使用、过期或被撤销。请从粗略结果页面重新申请。" : "The link may have been used, expired or revoked. Request a new one from the rough result page."}</p>
          <Link className="button button-primary" href={`/${params.locale}`}>{zh ? "返回首页" : "Return home"}</Link>
        </div>
      </section>
    </PublicShell>
  );
}
