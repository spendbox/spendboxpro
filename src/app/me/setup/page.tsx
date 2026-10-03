import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = { title: "Set up your Spendbox" };

export default async function SetupPage({ searchParams }: PageProps<"/me/setup">) {
  const { next } = await searchParams;
  const user = await requireUser("/me/setup");
  const supabase = await createClient();
  const [{ count }, { data: profile }] = await Promise.all([
    supabase.from("payers").select("id", { count: "exact", head: true }).eq("customer_id", user.id).is("learned_at_business", null),
    supabase.from("profiles").select("email").eq("id", user.id).maybeSingle(),
  ]);
  return (
    <AuthLayout>
      <SetupFlow next={safeNext(typeof next === "string" ? next : null) ?? "/me"} hasBank={(count ?? 0) > 0} hasEmail={Boolean(profile?.email)} />
    </AuthLayout>
  );
}
