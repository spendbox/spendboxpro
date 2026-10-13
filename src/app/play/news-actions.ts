"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { challengeGame } from "@/lib/world/challenges";
import type { PlayerEvent } from "@/lib/world/news";

// Players in the news (docs/NEWS.md): the dearest homes bought lately, businesses that just put their
// name on a building, people who arrived born rich, and challenges won on the map. Read from the tables the game already keeps;
// the screen turns each into a headline (playerStory in src/lib/world/news.ts).

/** A purchase this dear (mint) or more makes the news. */
const NEWSWORTHY = 15_000;

export async function playerNews(region: string): Promise<PlayerEvent[]> {
  if (!regionMap(region)) return [];
  const db = createAdminClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  try {
    const [buys, leases, packs, games] = await Promise.all([
      db
        .from("property_units")
        .select("unit_id, building_id, label, price, bought_at, owner_id")
        .like("building_id", `${region}:%`)
        .gte("bought_at", since)
        .gte("price", NEWSWORTHY)
        .order("bought_at", { ascending: false })
        .limit(40),
      db.from("business_leases").select("id, building_id, name, price_kobo, starts_at").eq("region", region).eq("status", "live").gte("starts_at", since).order("starts_at", { ascending: false }).limit(20),
      db.from("starter_payments").select("reference, user_id, mint, paid_at").eq("region", region).eq("status", "paid").eq("pack", "odogwu").gte("paid_at", since).order("paid_at", { ascending: false }).limit(20),
      // Challenges won (game-db/070; nothing until it's run).
      db.from("challenges").select("id, game, x, z, winner_id, prize, finished_at, challenge_players(user_id)").eq("region", region).eq("status", "done").not("winner_id", "is", null).gte("finished_at", since).order("finished_at", { ascending: false }).limit(20),
    ]);
    const played = ((games.error ? [] : games.data) ?? []) as { id: number; game: string; x: number; z: number; winner_id: string; prize: number | null; finished_at: string; challenge_players: { user_id: string }[] | null }[];
    const ids = [
      ...new Set([
        ...(buys.data ?? []).map((b) => String(b.owner_id)),
        ...(packs.data ?? []).map((p) => String(p.user_id)),
        ...played.flatMap((g) => [String(g.winner_id), ...(g.challenge_players ?? []).map((p) => String(p.user_id))]),
      ]),
    ];
    const { data: people } = ids.length ? await db.from("profiles").select("id, username").in("id", ids) : { data: [] };
    const nameOf = new Map<string, string>((people ?? []).map((p): [string, string] => [String(p.id), String(p.username ?? "") || "A newcomer"]));
    const out: PlayerEvent[] = [];
    for (const b of buys.data ?? [])
      out.push({ id: `buy-${b.unit_id}-${b.bought_at}`, at: Date.parse(String(b.bought_at)), kind: "buy", who: nameOf.get(String(b.owner_id)) ?? "A newcomer", what: String(b.label).toLowerCase(), price: Number(b.price), building: String(b.building_id) });
    for (const l of leases.data ?? [])
      out.push({ id: `biz-${l.id}`, at: Date.parse(String(l.starts_at)), kind: "business", who: String(l.name), what: "a building", price: 0, building: String(l.building_id) });
    for (const p of packs.data ?? [])
      out.push({ id: `rich-${p.reference}`, at: Date.parse(String(p.paid_at)), kind: "rich", who: nameOf.get(String(p.user_id)) ?? "A newcomer", what: "", price: Number(p.mint) });
    for (const g of played)
      out.push({
        id: `game-${g.id}`,
        at: Date.parse(String(g.finished_at)),
        kind: "challenge",
        who: nameOf.get(String(g.winner_id)) ?? "A newcomer",
        what: challengeGame(String(g.game))?.title ?? "a game",
        price: Number(g.prize ?? 0),
        x: Number(g.x),
        z: Number(g.z),
        beat: (g.challenge_players ?? []).filter((p) => String(p.user_id) !== String(g.winner_id)).map((p) => nameOf.get(String(p.user_id)) ?? "a newcomer").slice(0, 4),
      });
    return out.filter((e) => Number.isFinite(e.at)).sort((a, b) => b.at - a.at);
  } catch (error) {
    console.error("Player news failed", error);
    return [];
  }
}
