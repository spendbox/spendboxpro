import { CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/format";
import { getTrial } from "@/lib/trial";

/** Tells businesses they're on a free trial and that paid plans come later. */
export function TrialBanner({ createdAt }: { createdAt: string }) {
  const { endsAt, daysLeft, ended } = getTrial(createdAt);

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-accent-50 px-4 py-3 text-sm ring-1 ring-accent-100 sm:items-center lg:mb-8">
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent-700 sm:mt-0" aria-hidden />
      <p className="text-ink-2">
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
    </div>
  );
}
