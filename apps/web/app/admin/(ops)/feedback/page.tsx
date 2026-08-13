import { AdminResourcePage } from "@/components/admin/AdminResourcePage";
export default function Page({ searchParams }: { searchParams: Record<string, string | undefined> }) { return <AdminResourcePage resource="feedback" searchParams={searchParams} />; }
