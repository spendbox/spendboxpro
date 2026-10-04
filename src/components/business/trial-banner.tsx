import { CalendarClock, CreditCard } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { DismissTrial } from "@/components/business/dismiss-trial";
import { billingState, PLANS } from "@/lib/billing";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";
import type { Business } from "@/lib/types";

/**
 * The plan note at the top of the dashboard: free-trial days left (closable
 * until the next login), a renewal reminder near the end of a paid plan, and a
 * "payment due" note that can't be closed.
 */
export async function TrialBanner({ business }: { business: Business }) {
  const s = billingState(business);
  const href = `/dashboard/${business.id}/settings/billing`;
  if (s.status === "suspended") return null;

  if (s.status === "due") {
    return (
      <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-950 ring-1 ring-red-200 sm:flex-row sm:items-center lg:mb-8">
        <CreditCard className="size-5 shrink-0 text-red-700" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{business.paid_until ? "Your plan has ended." : "Your free trial has ended."}</span> Pay by{" "}
          {formatDate(s.suspendOn, { withYear: true })} to keep {business.name} running. After that it&apos;s paused until you pay.
        </p>
        <Link href={href} className="shrink-0 rounded-xl bg-red-700 px-4 py-2.5 text-center font-semibold text-white hover:bg-red-800">
          Pay now
        </Link>
      </div>
    );
  }

  if ((await cookies()).get(TRIAL_HIDDEN_COOKIE)) return null;
  if (s.status === "active" && s.daysLeft > 5) return null;
  const { priceStarter } = await getSettings();

  return (
    <DismissTrial>
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent-700 sm:mt-0" aria-hidden />
      <p className="min-w-0 flex-1 text-ink-2">
        {s.status === "trial" ? (
          <>
            <span className="font-semibold text-ink">Free trial · {plural(Math.max(s.daysLeft, 1), "day")} left</span>{" "}
            <span className="whitespace-nowrap">(until {formatDate(s.accessUntil, { withYear: true })}).</span> Then plans start at{" "}
            {formatMoney(priceStarter)} a month.{" "}
          </>
        ) : (
          <>
            <span className="font-semibold text-ink">Your {PLANS[s.plan].name} plan ends on {formatDate(s.accessUntil, { withYear: true })}.</span>{" "}
            Renew to keep everything running.{" "}
          </>
        )}
        <Link href={href} className="font-semibold text-brand-700 underline underline-offset-2">
          {s.status === "trial" ? "See plans" : "Renew"}
        </Link>
      </p>
    </DismissTrial>
  );
}
