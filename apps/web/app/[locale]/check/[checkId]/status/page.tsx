import { prisma } from "@tymra/db";
import { CheckStatus } from "@/components/public/PriceCheckFlow";
import { getCustomerSessionForPage } from "@/lib/server/customer-auth";

export default async function StatusPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  const [session, check] = await Promise.all([
    getCustomerSessionForPage(),
    prisma.priceCheck.findUnique({ where: { id: params.checkId }, select: { customerUserId: true } }),
  ]);
  return <CheckStatus locale={params.locale} checkId={params.checkId} memberAccount={Boolean(session && check?.customerUserId === session.customerUserId)} />;
}
