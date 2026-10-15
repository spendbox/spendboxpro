import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

/**
 * One notice to many players in one database call (game-db/102 notify_many). Before part 102 is
 * run, one call each, as before (at most 500).
 */
export async function notifyMany(db: Db, users: string[], kind: string, body: string) {
  const ids = [...new Set(users.filter(Boolean))];
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 5000) {
    const { error } = await db.rpc("notify_many", { p_users: ids.slice(i, i + 5000), p_kind: kind, p_body: body });
    if (error) {
      await Promise.all(ids.slice(0, 500).map((u) => db.rpc("notify", { p_user: u, p_round: null, p_kind: kind, p_body: body })));
      return;
    }
  }
}
