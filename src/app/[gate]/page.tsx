import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isAdmin, isAdminGate } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteStats } from "../play/profile-actions";
import { HqButton, HqSignIn, HqSignOut } from "./hq-forms";

// The owner's dashboard, at the secret address ADMIN_PATH (src/lib/admin.ts). Every other address
// that isn't a page is "not found", as before.

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "");

async function load() {
  const db = createAdminClient();
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const head = { count: "exact" as const, head: true };
  const [stats, active, lives, homes, new1, new7, packs, leases, ads, mapOpen, peopleOpen, signups] = await Promise.all([
    siteStats(),
    db.from("lives").select("user_id", head).gte("seen_at", ago(5 * 60_000)),
    db.from("lives").select("user_id", head),
    db.from("lives").select("user_id", head).not("home_unit", "is", null),
    db.from("profiles").select("id", head).eq("is_bot", false).gte("created_at", ago(86_400_000)),
    db.from("profiles").select("id", head).eq("is_bot", false).gte("created_at", ago(7 * 86_400_000)),
    db.from("starter_payments").select("reference, user_id, pack, mint, amount_kobo, status, created_at, paid_at").order("created_at", { ascending: false }).limit(40),
    db.from("business_leases").select("id, name, category, region, building_id, price_kobo, status, starts_at, ends_at, created_at").order("created_at", { ascending: false }).limit(40),
    db.from("ads").select("amount_kobo, status"),
    db.from("map_reports").select("id", head).eq("status", "open"),
    db.from("person_reports").select("id", head).eq("status", "open"),
    db.from("profiles").select("id, username, created_at").eq("is_bot", false).order("created_at", { ascending: false }).limit(15),
  ]);
  const ids = [...new Set((packs.data ?? []).map((p) => String(p.user_id)))];
  const { data: names } = ids.length ? await db.from("profiles").select("id, username").in("id", ids) : { data: [] };
  const nameOf = new Map<string, string>((names ?? []).map((n): [string, string] => [String(n.id), String(n.username ?? "(no name yet)")]));
  const packRows = packs.data ?? [];
  const leaseRows = leases.data ?? [];
  const paidPacks = packRows.filter((p) => p.status === "paid");
  const paidLeases = leaseRows.filter((l) => l.status !== "pending_payment");
  const paidAds = (ads.data ?? []).filter((a) => a.status !== "pending_payment");
  return {
    stats,
    activeNow: active.count ?? 0,
    lives: lives.count ?? 0,
    homes: homes.count ?? 0,
    new1: new1.count ?? 0,
    new7: new7.count ?? 0,
    revenue: {
      packs: paidPacks.reduce((n, p) => n + Number(p.amount_kobo), 0),
      leases: paidLeases.reduce((n, l) => n + Number(l.price_kobo), 0),
      ads: paidAds.reduce((n, a) => n + Number(a.amount_kobo ?? 0), 0),
    },
    packs: packRows.map((p) => ({ ...p, who: nameOf.get(String(p.user_id)) ?? "?" })),
    leases: leaseRows,
    mapOpen: mapOpen.count ?? 0,
    peopleOpen: peopleOpen.count ?? 0,
    signups: signups.data ?? [],
  };
}

export default async function Gate({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  if (!isAdminGate(gate)) notFound();
  await connection();
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-4 py-8">
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <HqSignIn />
      </main>
    );
  }
  const d = await load();
  const today = d.stats.days[d.stats.days.length - 1];
  const tiles: [string, string, string?][] = [
    ["Active now", fmt(d.activeNow), "seen in the last 5 minutes"],
    ["Registered", fmt(d.stats.registered), `${fmt(d.new1)} today · ${fmt(d.new7)} this week`],
    ["Visits", fmt(d.stats.visits), today ? `${fmt(today.visits)} today (${fmt(today.guests)} guests)` : undefined],
    ["Lives started", fmt(d.lives), `${fmt(d.homes)} with a home`],
    ["Starter packs", naira(d.revenue.packs), `${d.packs.filter((p) => p.status === "paid").length} paid of the last 40`],
    ["Business leases", naira(d.revenue.leases), `${d.leases.filter((l) => l.status === "live").length} live`],
    ["Billboard ads", naira(d.revenue.ads), "all time"],
    ["Open reports", fmt(d.mapOpen + d.peopleOpen), `${d.mapOpen} map · ${d.peopleOpen} people`],
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <HqSignOut />
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl bg-panel p-3 ring-1 ring-line">
            <p className="text-xs text-muted">{label}</p>
            <p className="font-display text-2xl font-extrabold tabular-nums">{value}</p>
            {note && <p className="text-[11px] text-muted">{note}</p>}
          </div>
        ))}
      </section>

      {d.stats.days.length > 0 && (
        <section className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">Last 30 days</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 font-medium">Day</th>
                  <th className="py-1 text-right font-medium">Visits</th>
                  <th className="py-1 text-right font-medium">Guests</th>
                  <th className="py-1 text-right font-medium">Players</th>
                  <th className="py-1 text-right font-medium">Sign-ups</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...d.stats.days].reverse().map((x) => (
                  <tr key={x.day} className="border-t border-line">
                    <td className="py-1">{x.day}</td>
                    <td className="py-1 text-right">{fmt(x.visits)}</td>
                    <td className="py-1 text-right">{fmt(x.guests)}</td>
                    <td className="py-1 text-right">{fmt(x.members)}</td>
                    <td className="py-1 text-right">{fmt(x.signups)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-panel p-4 ring-1 ring-line">
        <p className="text-sm font-semibold">Starter pack payments</p>
        <p className="text-xs text-muted">A pack still &ldquo;pending&rdquo; after someone paid: Check with Paystack gives them the mint if the money arrived.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <tbody>
              {d.packs.map((p) => (
                <tr key={p.reference} className="border-t border-line align-middle">
                  <td className="py-1.5">{p.who}</td>
                  <td className="py-1.5">{p.pack}</td>
                  <td className="py-1.5 tabular-nums">{naira(Number(p.amount_kobo))}</td>
                  <td className="py-1.5 text-xs text-muted">{when(String(p.created_at))}</td>
                  <td className="py-1.5 text-right">
                    {p.status === "paid" ? <span className="text-xs font-semibold text-me">Paid</span> : <HqButton kind="pack" id={String(p.reference)} label="Check with Paystack" />}
                  </td>
                </tr>
              ))}
              {d.packs.length === 0 && (
                <tr>
                  <td className="py-2 text-muted">No pack payments yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-panel p-4 ring-1 ring-line">
        <p className="text-sm font-semibold">Businesses on the map</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <tbody>
              {d.leases.map((l) => (
                <tr key={String(l.id)} className="border-t border-line align-middle">
                  <td className="py-1.5 font-medium">{String(l.name)}</td>
                  <td className="py-1.5 text-xs text-muted">{String(l.category)}</td>
                  <td className="py-1.5 tabular-nums">{naira(Number(l.price_kobo))}</td>
                  <td className="py-1.5 text-xs">{l.status === "live" ? `Live until ${when(String(l.ends_at))}` : String(l.status).replace("_", " ")}</td>
                  <td className="py-1.5 text-right">
                    <a className="mr-2 text-xs underline" href={`/play?at=${String(l.building_id).split(":")[1] ?? ""}`}>
                      See
                    </a>
                    {l.status === "live" && <HqButton kind="takedown" id={String(l.id)} label="Take down" danger />}
                  </td>
                </tr>
              ))}
              {d.leases.length === 0 && (
                <tr>
                  <td className="py-2 text-muted">No businesses yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">Newest players</p>
          <ul className="mt-2 space-y-1 text-sm">
            {d.signups.map((s) => (
              <li key={String(s.id)} className="flex justify-between gap-2">
                <span className="truncate">{String(s.username ?? "(no name yet)")}</span>
                <span className="shrink-0 text-xs text-muted">{when(String(s.created_at))}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">Elsewhere</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li>
              <a className="underline" href="/map-reports">
                Map and people reports
              </a>{" "}
              <span className="text-xs text-muted">(sign in to the game with ADMIN_EMAIL)</span>
            </li>
            <li>
              <a className="underline" href="/advertise">
                The advertising page
              </a>
            </li>
            <li>
              <a className="underline" href="https://dashboard.paystack.com" target="_blank" rel="noreferrer">
                Paystack
              </a>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
