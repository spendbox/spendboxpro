import { after, NextResponse, type NextRequest } from "next/server";
import { arenaView, settleDue, waitingCount } from "@/lib/realm/server";
import { canSettle, lastBattle, nextBattleAt } from "@/lib/realm/schedule";

// GET /api/realm: the Spirit Realm (docs/REALM.md) as anyone sees it, signed in or not.
//   (no at): the clock (now, the battle being fought or just over, the next one) and how many
//            armies are waiting for the next one.
//   ?at=<ms>&arena=<n>: one arena of a battle that has begun: its armies and seed, so the phone
//            plays the battle by itself, and once paid out, the places and prizes.
// A battle's armies never change once it has begun, so the CDN hands out one answer to everyone
// watching: thousands of viewers cost the database next to nothing.
let lastSweep = 0;

export async function GET(req: NextRequest) {
  const now = Date.now();
  const q = req.nextUrl.searchParams;
  const atRaw = q.get("at");
  // Pay out anything that's over (after the answer is sent, so nobody waits for it), at most once a minute on each server.
  if (now - lastSweep > 60_000 && canSettle(lastBattle(now).at, now)) {
    lastSweep = now;
    after(() => settleDue(now).catch((e) => console.error("Spirit Realm settle failed", e)));
  }
  try {
    if (!atRaw) {
      const last = lastBattle(now);
      const next = nextBattleAt(now);
      return NextResponse.json(
        { now, last: last.at, phase: last.phase, next, waiting: await waitingCount(next) },
        { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
      );
    }
    const at = Number(atRaw);
    if (!Number.isFinite(at) || at % 3_600_000 !== 0) return NextResponse.json({ error: "bad_time" }, { status: 400 });
    if (at > now) return NextResponse.json({ now, at, started: false }, { headers: { "Cache-Control": "no-store" } });
    const arena = Math.max(0, Math.floor(Number(q.get("arena")) || 0));
    const view = await arenaView(at, arena);
    const settled = Boolean(view?.results);
    // Paid out: it never changes again. Not yet: ask again soon (the prize is on its way).
    // In the first seconds of a battle, not kept at all (an army paid for on the stroke of the hour is still landing).
    const cache = settled ? "public, s-maxage=3600, stale-while-revalidate=86400" : now < at + 10_000 ? "no-store" : canSettle(at, now) ? "public, s-maxage=5" : "public, s-maxage=30";
    return NextResponse.json({ now, ...(view ?? { at, arena, arenas: 0, armies: [], results: null, seed: 0 }) }, { headers: { "Cache-Control": cache } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The database part isn't run yet (game-db/118).
    if (/realm_/.test(message)) return NextResponse.json({ off: true, now }, { headers: { "Cache-Control": "no-store" } });
    console.error("Spirit Realm failed", message);
    return NextResponse.json({ error: "failed", now }, { status: 500 });
  }
}
