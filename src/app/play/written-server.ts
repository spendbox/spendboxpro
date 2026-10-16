// Player-written moments, on the server only (docs/LIFE_WHEEL.md, phase 7; game-db/117): the approved
// ones, as moments like any other, kept for a few minutes so picking a moment stays quick. Used by
// ./moment-actions.ts; not an action itself.

import type { createAdminClient } from "@/lib/supabase/admin";
import { registerMoments, type MomentDef } from "@/lib/world/moments";
import { checkDraft, draftToMoment, type Draft } from "@/lib/world/written";

type Db = ReturnType<typeof createAdminClient>;

let cache: { at: number; moments: MomentDef[] } | null = null;
const KEEP_MS = 5 * 60_000;

/** The approved player-written moments (none before game-db/117 is run). */
export async function writtenMoments(db: Db): Promise<MomentDef[]> {
  if (cache && Date.now() - cache.at < KEEP_MS) return cache.moments;
  const { data, error } = await db.from("moment_drafts").select("id, author, draft").eq("status", "approved").order("decided_at", { ascending: false }).limit(2000);
  if (error) {
    cache = { at: Date.now(), moments: [] };
    return [];
  }
  const authors = [...new Set((data ?? []).map((d) => String(d.author)))];
  const { data: names } = authors.length ? await db.from("profiles").select("id, username").in("id", authors) : { data: [] };
  const nameOf = new Map((names ?? []).map((p) => [String(p.id), String(p.username ?? "A player")]));
  const moments = (data ?? [])
    .filter((d) => checkDraft(d.draft as Draft).length === 0)
    .map((d) => draftToMoment(Number(d.id), d.draft as Draft, nameOf.get(String(d.author)) ?? "A player"));
  registerMoments(moments);
  cache = { at: Date.now(), moments };
  return moments;
}

/** Forget the kept list (after the owner approves or retires one). */
export function forgetWritten() {
  cache = null;
}
