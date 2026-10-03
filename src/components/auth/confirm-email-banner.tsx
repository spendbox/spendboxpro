import { MailCheck } from "lucide-react";
import { getMyProfile } from "@/lib/customer";
import { ResendVerification } from "./resend-verification";

/** Reminds people to tap the link we emailed them, until they do. */
export async function ConfirmEmailBanner({ userId }: { userId: string }) {
  const profile = await getMyProfile(userId);
  if (!profile?.email || profile.email_verified_at) return null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-950 ring-1 ring-sky-200 sm:flex-row sm:items-center">
      <MailCheck className="size-5 shrink-0 text-sky-700" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Confirm your email.</span> We sent a link to <span className="font-semibold break-all">{profile.email}</span>. Tap it so
        we can send you perk alerts and help you if you forget your password.
      </p>
      <ResendVerification />
    </div>
  );
}
