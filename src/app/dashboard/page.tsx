import { redirect } from "next/navigation";
import { getOwnedBusinesses, requireUser } from "@/lib/auth";

export default async function DashboardIndex() {
  await requireUser("/dashboard");
  const owned = await getOwnedBusinesses();
  redirect(owned.length ? `/dashboard/${owned[0].id}` : "/start");
}
