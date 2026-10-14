import type { Metadata } from "next";
import Link from "next/link";
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
/** Mint as naira (₦1,500 a mint in Lagos), shortened: "₦1.2bn", "₦45m", "₦12,000". */
const PER_MINT = 1500;
const mintNaira = (mint: number) => {
  const v = mint * PER_MINT;
  const a = Math.abs(v);
  if (a >= 1e9) return `₦${(v / 1e9).toFixed(a >= 1e10 ? 0 : 2).replace(/\.?0+$/, "")}bn`;
  if (a >= 1e6) return `₦${(v / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, "")}m`;
  return `₦${Math.round(v).toLocaleString("en-NG")}`;
};
/** Lagos midnight today, as an ISO time. */
const lagosMidnight = () => {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  return new Date(`${day}T00:00:00+01:00`).toISOString();
};
/** The names a unit has until its owner gives it one (src/app/play/search-actions.ts). */
const PLAIN_UNIT = /^(room|home|flat|house|apartment|office|office floor|office suite|shop|lobby shop|ground floor shops|the whole [a-z]+)( [0-9]+[a-z]?)?( .*)?$/i;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "");

async function load() {
  const db = createAdminClient();
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const head = { count: "exact" as const, head: true };
  const since = lagosMidnight();
  const [stats, active, lives, homes, new1, new7, packs, leases, ads, mapOpen, peopleOpen, signups, bank, topups, landmarks, money, named, namedUnits, adList, town, photos] = await Promise.all([
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
    // The newer parts (each empty until its SQL is run): the World Bank (083/084), top-ups (076),
    // landmarks (082), the money made today (084), names players gave places, paid ads by region (084).
    db.rpc("world_bank_view"),
    db.from("topups").select("amount_kobo, status, created_at").eq("status", "paid").order("created_at", { ascending: false }).limit(1000),
    db.from("landmark_owners").select("landmark_id, name, price, bought_at, owner_id").order("bought_at", { ascending: false }).limit(40),
    db.rpc("money_since", { p_since: since }),
    db.from("property_buildings").select("building_id, name, created_at").not("name", "is", null).order("created_at", { ascending: false }).limit(30),
    db.from("property_units").select("unit_id, building_id, label, owner_id, use").eq("use", "home").order("bought_at", { ascending: false }).limit(300),
    db.from("ads").select("id, brand, headline, status, region, amount_kobo, ends_at").neq("status", "pending_payment").order("created_at", { ascending: false }).limit(20),
    // Town Hall (085) and profile photos: public, so they can be removed from here.
    db.from("chat_messages").select("id, sender_name, room, body, created_at").like("room", "town:%").order("id", { ascending: false }).limit(30),
    db.from("profiles").select("id, username, avatar").not("avatar->>photo", "is", null).limit(30),
  ]);
  const ownerIds = [...(landmarks.data ?? []).map((l) => l.owner_id), ...(namedUnits.data ?? []).map((u) => u.owner_id)].filter(Boolean).map(String);
  const ids = [...new Set([...(packs.data ?? []).map((p) => String(p.user_id)), ...ownerIds])];
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
    bank: bank.error ? null : (bank.data as { balance?: number; today?: number } | null),
    topups: { kobo: (topups.data ?? []).reduce((n, t) => n + Number(t.amount_kobo ?? 0), 0), today: (topups.data ?? []).filter((t) => String(t.created_at) >= since).length, count: (topups.data ?? []).length },
    landmarks: (landmarks.data ?? []).map((l) => ({ ...l, who: l.owner_id ? (nameOf.get(String(l.owner_id)) ?? "?") : "(account gone)" })),
    money: money.error ? null : (money.data as { created?: number; burned?: number; online?: number } | null),
    named: [
      ...(named.data ?? []).map((b) => ({ kind: "building" as const, id: String(b.building_id), name: String(b.name), who: "" })),
      ...(namedUnits.data ?? [])
        .filter((u) => !PLAIN_UNIT.test(String(u.label)))
        .slice(0, 30)
        .map((u) => ({ kind: "home" as const, id: String(u.unit_id), name: String(u.label), who: nameOf.get(String(u.owner_id)) ?? "?" })),
    ],
    ads: adList.data ?? [],
    town: town.data ?? [],
    photos: ((photos.data ?? []) as { id: string; username: string | null; avatar: { photo?: string } | null }[]).filter((p) => p.avatar?.photo),
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
    ["World Bank", d.bank ? mintNaira(Number(d.bank.balance ?? 0)) : "Run 083", d.bank ? `+${mintNaira(Number(d.bank.today ?? 0))} today from games` : "and 084 (opens with ₦1bn)"],
    ["Top-ups", naira(d.topups.kobo), `${d.topups.count} paid · ${d.topups.today} today`],
    ["Money made today", d.money ? mintNaira(Number(d.money.created ?? 0)) : "Run 084", d.money ? `${mintNaira(Number(d.money.online ?? 0))} online pay · ${mintNaira(Number(d.money.burned ?? 0))} burned` : undefined],
    ["Landmarks owned", fmt(d.landmarks.length), d.landmarks[0] ? `latest: ${d.landmarks[0].name ?? d.landmarks[0].landmark_id}` : "none yet"],
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

      <section className="rounded-2xl bg-panel p-4 ring-1 ring-line">
        <p className="text-sm font-semibold">Names players gave places</p>
        <p className="text-xs text-muted">Anyone can find these in the map search. A rude or misleading one: Clear puts back the plain name.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <tbody>
              {d.named.map((n) => (
                <tr key={`${n.kind}:${n.id}`} className="border-t border-line align-middle">
                  <td className="py-1.5 font-medium">{n.name}</td>
                  <td className="py-1.5 text-xs text-muted">{n.kind === "home" ? `Home · ${n.who}` : "Building"}</td>
                  <td className="py-1.5 text-xs text-muted">{n.id.split("/")[0]}</td>
                  <td className="py-1.5 text-right">
                    <HqButton kind={n.kind === "home" ? "clearhome" : "clearbuilding"} id={n.id} label="Clear" danger />
                  </td>
                </tr>
              ))}
              {d.named.length === 0 && (
                <tr>
                  <td className="py-2 text-muted">No named places yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">Town Hall, latest</p>
          <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto text-sm">
            {d.town.map((m) => (
              <li key={String(m.id)} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <b>{String(m.sender_name)}</b> <span className="text-xs text-muted">{when(String(m.created_at))}</span>
                  <span className="block break-words">{String(m.body ?? "")}</span>
                </span>
                <HqButton kind="deletemsg" id={String(m.id)} label="Delete" danger />
              </li>
            ))}
            {d.town.length === 0 && <li className="text-muted">Nothing said yet (or run 085).</li>}
          </ul>
        </div>
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">Profile photos</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {d.photos.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.avatar!.photo} alt="" className="size-16 rounded-full object-cover" loading="lazy" />
                <span className="w-full truncate text-xs">{p.username ?? "?"}</span>
                <HqButton kind="clearphoto" id={p.id} label="Remove" danger />
              </div>
            ))}
          </div>
          {d.photos.length === 0 && <p className="mt-2 text-sm text-muted">No profile photos yet.</p>}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">Landmark owners</p>
          <ul className="mt-2 space-y-1 text-sm">
            {d.landmarks.map((l) => (
              <li key={String(l.landmark_id)} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {String(l.name ?? l.landmark_id)} <span className="text-xs text-muted">· {l.who}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{mintNaira(Number(l.price))}</span>
              </li>
            ))}
            {d.landmarks.length === 0 && <li className="text-muted">Nobody owns a landmark yet.</li>}
          </ul>
        </div>
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">Paid billboard ads</p>
          <ul className="mt-2 space-y-1 text-sm">
            {d.ads.map((a) => (
              <li key={String(a.id)} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {String(a.brand)} <span className="text-xs text-muted">· {a.region ? String(a.region) : "everywhere"} · {String(a.status)}</span>
                </span>
                {a.status === "live" ? <HqButton kind="stopad" id={String(a.id)} label="Stop" danger /> : <span className="shrink-0 text-xs text-muted">{naira(Number(a.amount_kobo ?? 0))}</span>}
              </li>
            ))}
            {d.ads.length === 0 && <li className="text-muted">No paid ads.</li>}
          </ul>
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
              <Link className="underline" href="/map-reports">
                Map and people reports
              </Link>{" "}
              <span className="text-xs text-muted">(sign in to the game with ADMIN_EMAIL)</span>
            </li>
            <li>
              <Link className="underline" href="/advertise">
                The advertising page
              </Link>
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
