import { CalendarClock } from "lucide-react";
import { cookies } from "next/headers";
import { DismissTrial } from "@/components/business/dismiss-trial";
import { formatDate } from "@/lib/format";
import { getTrial, TRIAL_HIDDEN_COOKIE } from "@/lib/trial";

/** Tells businesses they're on a free trial and that paid plans come later. Closable until the next login. */
export async function TrialBanner({ createdAt }: { createdAt: string }) {
  if ((await cookies()).get(TRIAL_HIDDEN_COOKIE)) return null;
  const { endsAt, daysLeft, ended } = getTrial(createdAt);

  return (
    <DismissTrial>
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent-700 sm:mt-0" aria-hidden />
      <p className="min-w-0 flex-1 text-ink-2">
        {ended ? (
          <>
            <span className="font-semibold text-ink">Your free trial has ended.</span> Paid plans are coming soon, and
            everything keeps working until then. We&apos;ll be in touch before anything changes.
          </>
        ) : (
          <>
            <span className="font-semibold text-ink">
              Free trial · {daysLeft === 1 ? "1 day" : `${daysLeft} days`} left
            </span>{" "}
            <span className="whitespace-nowrap">(until {formatDate(endsAt, { withYear: true })}).</span> Spendbox will
            become a paid plan after your trial. We&apos;ll tell you the price before you&apos;re ever charged.
          </>
        )}
      </p>
    </DismissTrial>
  );
}
