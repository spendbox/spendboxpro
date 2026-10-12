import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { mintify } from "@/lib/brand";

// Your notices on the real map (a gift, someone at your door, a sale, a thank-you): the latest ones
// with whether you've read them, leaving out the ones you swiped away (game-db/062). Read by the
// game when it loads and by /api/notices, which the game asks every few seconds.

export type Notice = { id: number; kind: string; body: string; tile: number | null; at: string; read?: boolean };

/** Notices like these belong to no round (or, for hugs and gifts, the latest round of the old game). */
const MINE = "round_id.is.null,kind.in.(hug,handshake,gift,spray,thanks)";

export async function loadNotices(db: ReturnType<typeof createAdminClient>, userId: string, days = 7): Promise<Notice[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const map = (rows: Record<string, unknown>[] | null, withRead: boolean) =>
    (rows ?? []).map((n) => ({
      id: Number(n.id),
      kind: String(n.kind),
      body: mintify(String(n.body)),
      tile: (n.tile ?? null) as number | null,
      at: String(n.created_at),
      ...(withRead ? { read: n.read_at != null } : {}),
    }));
  const full = await db
    .from("notifications")
    .select("id, kind, body, tile, created_at, read_at")
    .eq("user_id", userId)
    .or(MINE)
    .is("dismissed_at", null)
    .gte("created_at", since)
    .order("id", { ascending: false })
    .limit(50);
  if (!full.error) return map(full.data as Record<string, unknown>[], true);
  // Before part 62 is run: no read or cleared marks yet.
  const { data } = await db.from("notifications").select("id, kind, body, tile, created_at").eq("user_id", userId).or(MINE).gte("created_at", since).order("id", { ascending: false }).limit(50);
  return map(data as Record<string, unknown>[], false);
}
