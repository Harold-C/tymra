import { PublicShell } from "@/components/public/PublicShell";

export default function AccountLayout({ children, params }: { children: React.ReactNode; params: { locale: "en" | "zh" } }) {
  return <PublicShell locale={params.locale}>{children}</PublicShell>;
}
