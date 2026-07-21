import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function Home() {
  const locale = cookies().get("NEXT_LOCALE")?.value === "zh" ? "zh" : "en";
  redirect(`/${locale}`);
}
