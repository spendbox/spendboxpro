import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";

type Db = ReturnType<typeof createAdminClient>;

/** The city's newest Town Hall message and its events' fingerprint, kept 20 s per server (the same for everyone). */
const cityNews = new Map<string, { at: number; town: number; events: string }>();
async function cityLatest(db: Db, region: string) {
  const hit = cityNews.get(region);
  if (hit && Date.now() - hit.at < 20_000) return hit;
  const [town, events] = await Promise.all([
    db.from("chat_messages").select("id").eq("room", `town:${region}`).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("hosted_events").select("id, starts_at").eq("region", region).eq("status", "on").gt("ends_at", new Date().toISOString()).order("id", { ascending: false }).limit(200),
  ]);
  // The ids and start times: a new one, one called off and one moved to another time all change it.
  const rows = (events.data ?? []) as { id: number; starts_at: string | null }[];
  const ids = rows.map((e) => Number(e.id));
  const when = rows.reduce((t, e) => (t + Math.floor((Date.parse(String(e.starts_at)) || 0) / 60_000) * (Number(e.id) % 97 + 1)) % 1_000_003, 0);
  const out = { at: Date.now(), town: Number(town.data?.id ?? 0), events: `${ids.length}:${ids[0] ?? 0}:${ids.reduce((t, k) => (t + k) % 1_000_003, 0)}:${when}` };
  cityNews.set(region, out);
  return out;
}

/** What's new for you (src/app/play/pulse.ts): your newest notice, and your city's. */
async function latestFor(db: Db, userId: string, region: string | null) {
  const [notice, city] = await Promise.all([
    db.from("notifications").select("id").eq("user_id", userId).order("id", { ascending: false }).limit(1).maybeSingle(),
    region ? cityLatest(db, region).catch(() => null) : Promise.resolve(null),
  ]);
  return { notice: Number(notice.data?.id ?? 0), town: city?.town ?? 0, events: city?.events ?? "" };
}

/**
 * POST /api/active: a minute of you actually playing (the game sends it at most once a minute,
 * only while it's open in front of you and you've touched it lately). It counts towards tomorrow's
 * daily gift (game-db/073) and pays you for being online (game-db/083; up to 4 hours a day).
 * Answers { ok, minutes, paid, rate, left } (paid and rate in mint), and latest: what's new (with
 * ?region=, your city's too), so the game only fetches notices, events and the Town Hall when
 * something changed.
 */
export async function POST(request: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false });
  const db = createAdminClient();
  const asked = request.nextUrl.searchParams.get("region");
  const region = asked && REGIONS[asked] ? asked : null;
  const [{ data, error }, latest] = await Promise.all([db.rpc("online_ping", { p_user: userId }), latestFor(db, userId, region).catch(() => null)]);
  if (!error && data) {
    const d = data as { minutes?: number; paid?: number; rate?: number; left?: number };
    return NextResponse.json({ ok: true, minutes: Number(d.minutes ?? 0), paid: Number(d.paid ?? 0), rate: Number(d.rate ?? 0), left: Number(d.left ?? 0), latest });
  }
  // Before part 83 is run: counted, not paid.
  const { data: m, error: e2 } = await db.rpc("active_ping", { p_user: userId });
  return NextResponse.json({ ok: !e2, minutes: Number(m ?? 0) || 0, paid: 0, rate: 0, left: 0, latest });
}
