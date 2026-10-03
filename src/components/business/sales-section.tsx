import { ArrowDownRight, ArrowUpRight, Landmark } from "lucide-react";
import Link from "next/link";
import { MonthPicker } from "@/components/business/month-picker";
import { SalesChart } from "@/components/business/sales-chart";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatMoney, formatTime, formatWhen, memberNo, monthName, plural } from "@/lib/format";
import { currentMonth, shiftMonth, type SalesSort, type SalesView } from "@/lib/sales";

const SORTS: { key: SalesSort; label: string }[] = [
  { key: "new", label: "Newest" },
  { key: "old", label: "Oldest" },
  { key: "big", label: "Largest" },
];

function titleCase(name: string) {
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function longDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Home screen: balance, money in per month and per day, and every payment — straight from the bank. */
export function SalesSection({ bizId, currency, view }: { bizId: string; currency: string; view: SalesView }) {
  const base = `/dashboard/${bizId}`;
  const href = (p: { month?: string; day?: string | null; sort?: SalesSort }) => {
    const q = new URLSearchParams();
    const month = p.month ?? view.month;
    if (month !== currentMonth()) q.set("month", month);
    if (p.day) q.set("day", String(Number(p.day.slice(-2))));
    const sort = p.sort ?? view.sort;
    if (sort !== "new") q.set("sort", sort);
    const s = q.toString();
    return `${base}${s ? `?${s}` : ""}#sales`;
  };

  if (!view.connected) {
    return (
      <section id="sales" className="scroll-mt-24">
        <Card className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <Landmark className="size-6" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">See your sales here</h2>
            <p className="text-sm text-muted">
              Connect your bank (read-only) to see your balance, sales per day and every payment, month by month.
            </p>
          </div>
          <Link href={`${base}/settings/bank`} className={buttonClass({ variant: "primary" })}>
            Connect your bank
          </Link>
        </Card>
      </section>
    );
  }

  const now = currentMonth();
  const oldest = view.months[view.months.length - 1]?.month ?? view.month;
  const prevMonth = shiftMonth(view.month, -1);
  const nextMonth = shiftMonth(view.month, 1);
  const change = view.previousTotal ? (view.total - view.previousTotal) / view.previousTotal : null;
  const knownBalances = view.balances.filter((b) => b.balance !== null);
  const totalBalance = knownBalances.reduce((s, b) => s + (b.balance ?? 0), 0);
  const newestBalanceAt = knownBalances.map((b) => b.balance_at).filter(Boolean).sort().pop() ?? null;
  const nothingYet = view.months.every((m) => m.total === 0);
  const best = view.days.reduce((a, b) => (b.total > a.total ? b : a), view.days[0]);

  return (
    <section id="sales" aria-labelledby="sales-title" className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="sales-title" className="font-display text-lg font-bold text-ink">
            Sales
          </h2>
          <p className="text-sm text-muted">Money that came into your connected bank.</p>
        </div>
        <MonthPicker
          month={view.month}
          months={view.months}
          currency={currency}
          hrefFor={Object.fromEntries(view.months.map((m) => [m.month, href({ month: m.month, day: null })]))}
          prevHref={view.month > oldest ? href({ month: prevMonth, day: null }) : null}
          nextHref={view.month < now ? href({ month: nextMonth, day: null }) : null}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-1 p-5 sm:p-6">
          <p className="text-sm font-semibold text-muted">Money in · {monthName(view.month)}</p>
          <p className="text-[clamp(2rem,9vw,3rem)] leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
            {formatMoney(view.total, currency)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {change !== null && (
              <span className={cn("flex items-center gap-1 font-semibold", change >= 0 ? "text-brand-700" : "text-red-700")}>
                {change >= 0 ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}
                {change >= 0 ? "Up" : "Down"} {Math.abs(Math.round(change * 100))}% vs {monthName(prevMonth).split(" ")[0]}
              </span>
            )}
            <span>{plural(view.payments, "payment")}</span>
            {view.payments > 0 && <span>Average {formatMoney(view.total / view.payments, currency)}</span>}
            {best && best.total > 0 && (
              <span>
                Best day {Number(best.day.slice(-2))} {monthName(view.month).split(" ")[0].slice(0, 3)}
              </span>
            )}
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-3 p-5 sm:p-6">
          <p className="text-sm font-semibold text-muted">Balance</p>
          {knownBalances.length ? (
            <div>
              <p className="text-[clamp(1.5rem,7vw,1.875rem)] leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
                {formatMoney(totalBalance, currency)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {view.balances.length > 1 ? `${view.balances.length} accounts` : view.balances[0].label}
                {newestBalanceAt ? ` · updated ${formatWhen(newestBalanceAt)}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Your bank hasn&apos;t shared a balance yet. It shows here after the next check.</p>
          )}
          {view.balances.length > 1 && knownBalances.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
              {view.balances.map((b) => (
                <li key={b.id} className="flex justify-between gap-3">
                  <span className="truncate text-muted">{b.label}</span>
                  <span className="font-semibold tabular">{b.balance === null ? "—" : formatMoney(b.balance, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {nothingYet ? (
        <Card className="p-5 text-sm text-muted sm:p-6">
          {view.lastFetchCount === 0 ? (
            <>
              Mono hasn&apos;t shared any payments for this account yet
              {view.dataStatus && view.dataStatus !== "AVAILABLE" ? " (it's still preparing your history)" : ""}. It can take a few
              minutes after connecting. Tap <strong>Check for new payments</strong> in{" "}
              <Link href={`${base}/settings/bank`} className="font-semibold text-brand-700 underline">
                Settings
              </Link>{" "}
              to try again.
            </>
          ) : (
            "Fetching your payments from the bank. Refresh in a minute."
          )}
        </Card>
      ) : (
        <>
          <Card className="p-4 pt-8 sm:p-6 sm:pt-10">
            <SalesChart
              days={view.days}
              currency={currency}
              selected={view.day}
              hrefFor={{ days: view.days.map((d) => href({ day: d.day })), clear: href({ day: null }) }}
            />
          </Card>

          <Card className="px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-ink">{view.day ? longDay(view.day) : `All of ${monthName(view.month)}`}</h3>
                <p className="text-sm text-muted">
                  {plural(view.transactionCount, "payment")}
                  {view.day && (
                    <>
                      {" · "}
                      <Link href={href({ day: null })} scroll={false} className="font-semibold text-brand-700 hover:underline">
                        See the whole month
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <nav aria-label="Sort payments" className="flex gap-1.5">
                {SORTS.map((s) => (
                  <Link
                    key={s.key}
                    href={href({ day: view.day, sort: s.key })}
                    scroll={false}
                    aria-current={view.sort === s.key ? "true" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-full px-3.5 text-sm font-semibold ring-1 transition",
                      view.sort === s.key ? "bg-ink text-white ring-ink" : "bg-white text-ink-2 ring-line hover:bg-canvas",
                    )}
                  >
                    {s.label}
                  </Link>
                ))}
              </nav>
            </div>

            {view.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No money came in {view.day ? "that day" : "this month"}.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {view.transactions.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-ink">{t.sender_name ? titleCase(t.sender_name) : "Sender not shown"}</span>
                        {t.member_no !== null && <Badge tone="green">{memberNo(t.member_no)}</Badge>}
                        {t.status === "unmatched" && (
                          <Link href={`${base}/payments`}>
                            <Badge tone="amber">Who paid?</Badge>
                          </Link>
                        )}
                      </p>
                      <p className="truncate text-sm text-muted">
                        {view.day ? formatTime(t.paid_at) : formatWhen(t.paid_at)}
                        {t.narration ? ` · ${t.narration}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-ink tabular">{formatMoney(t.amount, t.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
            {view.transactionCount > view.transactions.length && (
              <p className="border-t border-line pt-3 text-center text-sm text-muted">
                Showing {view.transactions.length} of {view.transactionCount}. Tap a day in the chart to see the rest.
              </p>
            )}
          </Card>
        </>
      )}
    </section>
  );
}
