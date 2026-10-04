import { CircleCheck, CircleX } from "lucide-react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ButtonLink } from "@/components/ui/button";
import { consumeToken } from "@/lib/email-links";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/auth/verify">) {
  const { token } = await searchParams;
  const used = typeof token === "string" ? await consumeToken(token, "verify_email") : null;
  let ok = false;
  if (used?.email) {
    // Only confirms the address the link was sent to, if it's still the one on the account.
    const { data } = await createAdminClient()
      .from("profiles")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", used.userId)
      .eq("email", used.email)
      .select("id");
    ok = Boolean(data?.length);
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-start gap-4">
        {ok ? <CircleCheck className="size-12 text-brand-600" aria-hidden /> : <CircleX className="size-12 text-red-600" aria-hidden />}
        <h1 className="font-display text-3xl font-bold tracking-tight">{ok ? "Email confirmed" : "This link doesn't work"}</h1>
        <p className="text-muted">
          {ok
            ? "Thanks! We'll use it for your requests and perks, and to help you get back in if you forget your password."
            : "It may have expired or already been used. Log in and tap “Send it again” on the confirm-your-email note."}
        </p>
        <ButtonLink href="/go" size="lg">
          Continue to Spendbox
        </ButtonLink>
      </div>
    </AuthLayout>
  );
}
