import { after, NextResponse, type NextRequest } from "next/server";
import { arenaView, playerCount, settleDue } from "@/lib/realm/server";
import { battleAt, canSettle, HOUR_MS } from "@/lib/realm/schedule";

// GET /api/realm: the Spirit Realm (docs/REALM.md) as anyone sees it, signed in or not.
//   (no at): the clock (the battle on now) and how many players are in it.
//   ?at=<ms>&arena=<n>: one arena of a battle: its players, the troops they've sent (each with the
//            step it comes through) and the seed, so the phone plays the battle on the map by
//            itself; once paid out, the places, points and prizes.
// The phones ask again every few seconds while a battle is on (troops come through 20 seconds
// after they're sent, so every phone hears of them in time), and the CDN hands one answer to
// everyone watching an arena: thousands of viewers cost the database next to nothing.
let lastSweep = 0;

const EMPTY = { arena: 0, arenas: 0, armies: [], waves: [], results: null, seed: 0 };

export async function GET(req: NextRequest) {
  const now = Date.now();
  const q = req.nextUrl.searchParams;
  const atRaw = q.get("at");
  // Pay out the last battle once it's over (after the answer is sent, so nobody waits for it), at most once a minute on each server.
  if (now - lastSweep > 60_000 && canSettle(battleAt(now) - HOUR_MS, now)) {
    lastSweep = now;
    after(() => settleDue(now).catch((e) => console.error("Spirit Realm settle failed", e)));
  }
  try {
    if (!atRaw) {
      const at = battleAt(now);
      return NextResponse.json({ now, at, players: await playerCount(at) }, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } });
    }
    const at = Number(atRaw);
    if (!Number.isFinite(at) || at % HOUR_MS !== 0) return NextResponse.json({ error: "bad_time" }, { status: 400 });
    if (at > now) return NextResponse.json({ now, at, ...EMPTY }, { headers: { "Cache-Control": "no-store" } });
    const arena = Math.max(0, Math.floor(Number(q.get("arena")) || 0));
    const view = await arenaView(at, arena);
    // Paid out: it never changes again. Otherwise troops keep coming (or the prize is on its way): a few seconds.
    const cache = view?.results ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=4";
    return NextResponse.json({ now, ...(view ?? { at, ...EMPTY }) }, { headers: { "Cache-Control": cache } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The database part isn't run yet (game-db/118).
    if (/realm_/.test(message)) return NextResponse.json({ off: true, now }, { headers: { "Cache-Control": "no-store" } });
    console.error("Spirit Realm failed", message);
    return NextResponse.json({ error: "failed", now }, { status: 500 });
  }
}
