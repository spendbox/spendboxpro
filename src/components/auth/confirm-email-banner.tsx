import { MailCheck } from "lucide-react";
import { getMyProfile } from "@/lib/customer";
import { ResendVerification } from "./resend-verification";

/** Reminds people to tap the link we emailed them, until they do. */
export async function ConfirmEmailBanner({ userId }: { userId: string }) {
  const profile = await getMyProfile(userId);
  if (!profile?.email || profile.email_verified_at) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-sky-50 py-2.5 pr-2.5 pl-3.5 text-sm text-sky-950 ring-1 ring-sky-200">
      <MailCheck className="size-5 shrink-0 text-sky-700" aria-hidden />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold">Confirm your email.</span>{" "}
        <span className="hidden sm:inline">
          We sent a link to <span className="font-semibold break-all">{profile.email}</span>, so we can send you alerts and help if you forget your password.
        </span>
        <span className="sm:hidden">Tap the link we sent you.</span>
      </p>
      <ResendVerification />
    </div>
  );
}
