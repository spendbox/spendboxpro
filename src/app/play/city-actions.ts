"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";

/** How many players live in each city on the real map, busiest first (for the city card). */
export async function cityPlayers(): Promise<{ id: string; name: string; players: number }[]> {
  const db = createAdminClient();
  const rows = await Promise.all(
    Object.values(REGIONS).map(async (r) => {
      const { count } = await db.from("lives").select("user_id", { count: "exact", head: true }).eq("region", r.id);
      return { id: r.id, name: r.name, players: count ?? 0 };
    }),
  );
  return rows.sort((a, b) => b.players - a.players);
}
