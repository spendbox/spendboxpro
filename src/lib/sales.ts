import "server-only";
import { appTimeZone } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Sales for the business's home screen: money that came into its connected
// bank accounts (through Mono), by month and by day.

export type SalesSort = "new" | "old" | "big";

export interface SalesDay {
  /** YYYY-MM-DD in the business's time zone. */
  day: string;
  total: number;
  payments: number;
}

export interface SalesTransaction {
  id: string;
  amount: number;
  currency: string;
  paid_at: string;
  sender_name: string | null;
  narration: string | null;
  status: "unmatched" | "matched" | "ignored" | "history";
  member_no: number | null;
}

export interface BankBalance {
  id: string;
  label: string;
  balance: number | null;
  balance_at: string | null;
}

export interface SalesView {
  connected: boolean;
  balances: BankBalance[];
  /** YYYY-MM of the month shown. */
  month: string;
  /** Months that have sales (newest first), plus the current month. */
  months: { month: string; total: number }[];
  /** Every day of the month, zeros included. */
  days: SalesDay[];
  total: number;
  payments: number;
  previousTotal: number | null;
  day: string | null;
  sort: SalesSort;
  transactions: SalesTransaction[];
  /** How many payments the list would hold without the 100-row cap. */
  transactionCount: number;
  /** What Mono last sent, to explain an empty screen. */
  lastFetchCount: number | null;
  dataStatus: string | null;
}

const LIST_LIMIT = 100;

/** Today's month (YYYY-MM) in the business's time zone. */
export function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: appTimeZone(), year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysIn(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Lagos is UTC+1 all year; other zones are handled by asking Intl for the offset. */
function zoneOffsetMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: appTimeZone(), timeZoneName: "longOffset" }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** Start of a local day/month as an exact moment. */
function localStart(ymd: string) {
  const guess = new Date(`${ymd}T00:00:00Z`);
  return new Date(guess.getTime() - zoneOffsetMinutes(guess) * 60_000);
}

export function parseMonth(value: string | string[] | undefined) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export async function getSalesView(
  bizId: string,
  opts: { month?: string | null; day?: string | null; sort?: string | null },
): Promise<SalesView> {
  const supabase = await createClient();
  const tz = appTimeZone();
  const thisMonth = currentMonth();
  const month = opts.month ?? thisMonth;
  const sort: SalesSort = opts.sort === "old" || opts.sort === "big" ? opts.sort : "new";
  const day =
    opts.day && /^\d{1,2}$/.test(opts.day) && Number(opts.day) >= 1 && Number(opts.day) <= daysIn(month)
      ? `${month}-${opts.day.padStart(2, "0")}`
      : null;

  const [{ data: conns }, { data: monthRows }, { data: dayRows }] = await Promise.all([
    supabase
      .from("bank_connections")
      .select("id, institution, account_number, balance, balance_at, last_fetch_count, data_status")
      .eq("business_id", bizId)
      .order("created_at"),
    supabase.rpc("business_sales_months", { p_business_id: bizId, p_tz: tz }),
    supabase.rpc("business_sales_days", { p_business_id: bizId, p_month: `${month}-01`, p_tz: tz }),
  ]);

  const months = ((monthRows ?? []) as { month: string; total: number }[]).map((m) => ({
    month: m.month.slice(0, 7),
    total: Number(m.total),
  }));
  if (!months.some((m) => m.month === thisMonth)) months.unshift({ month: thisMonth, total: 0 });
  if (!months.some((m) => m.month === month)) months.push({ month, total: 0 });
  months.sort((a, b) => (a.month < b.month ? 1 : -1));

  const byDay = new Map(((dayRows ?? []) as { day: string; total: number; payments: number }[]).map((d) => [d.day, d]));
  const days: SalesDay[] = Array.from({ length: daysIn(month) }, (_, i) => {
    const key = `${month}-${String(i + 1).padStart(2, "0")}`;
    const row = byDay.get(key);
    return { day: key, total: row ? Number(row.total) : 0, payments: row ? Number(row.payments) : 0 };
  });
  const total = days.reduce((s, d) => s + d.total, 0);
  const payments = days.reduce((s, d) => s + d.payments, 0);
  const prev = months.find((m) => m.month === shiftMonth(month, -1));

  // The list: the chosen day, or the whole month.
  const from = localStart(day ?? `${month}-01`);
  const to = day ? localStart(nextDay(day)) : localStart(`${shiftMonth(month, 1)}-01`);
  let query = supabase
    .from("bank_transactions")
    .select("id, amount, currency, paid_at, sender_name, narration, status, purchase:purchases(membership:memberships(member_no))", {
      count: "exact",
    })
    .eq("business_id", bizId)
    .neq("status", "ignored")
    .gte("paid_at", from.toISOString())
    .lt("paid_at", to.toISOString());
  query =
    sort === "big"
      ? query.order("amount", { ascending: false }).order("paid_at", { ascending: false })
      : query.order("paid_at", { ascending: sort === "old" });
  const { data: txRows, count } = await query.limit(LIST_LIMIT);

  const transactions: SalesTransaction[] = (txRows ?? []).map((t) => {
    const purchase = t.purchase as unknown as { membership: { member_no: number } | null } | null;
    return {
      id: t.id,
      amount: Number(t.amount),
      currency: t.currency,
      paid_at: t.paid_at,
      sender_name: t.sender_name,
      narration: t.narration,
      status: t.status,
      member_no: purchase?.membership?.member_no ?? null,
    };
  });

  const connections = conns ?? [];
  return {
    connected: connections.length > 0,
    balances: connections.map((c) => ({
      id: c.id,
      label: `${c.institution ?? "Bank"}${c.account_number ? ` •••${c.account_number.slice(-4)}` : ""}`,
      balance: c.balance === null ? null : Number(c.balance),
      balance_at: c.balance_at,
    })),
    month,
    months,
    days,
    total,
    payments,
    previousTotal: prev ? prev.total : months.length && months[months.length - 1].month < month ? 0 : null,
    day,
    sort,
    transactions,
    transactionCount: count ?? transactions.length,
    lastFetchCount: connections.length ? Math.max(...connections.map((c) => c.last_fetch_count ?? 0)) : null,
    dataStatus: connections.find((c) => c.data_status)?.data_status ?? null,
  };
}

function nextDay(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
