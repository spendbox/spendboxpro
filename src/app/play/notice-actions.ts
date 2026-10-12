"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Reading and clearing your notices (game-db/062): read ones stop counting on the phone, cleared
// (swiped away) ones are gone from your lists. On every device, since it's kept here.

const ids = (list: unknown) => (Array.isArray(list) ? list.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200) : []);

/** Mark notices read (these ids, or every unread one when left out). */
export async function readNotices(list?: number[]): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  let q = createAdminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  const only = ids(list);
  if (list) {
    if (!only.length) return { ok: true };
    q = q.in("id", only);
  }
  const { error } = await q;
  return { ok: !error };
}

/** Swipe notices away (these ids, or all of them). */
export async function dismissNotices(list?: number[]): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  const now = new Date().toISOString();
  let q = createAdminClient().from("notifications").update({ dismissed_at: now, read_at: now }).eq("user_id", userId).is("dismissed_at", null);
  const only = ids(list);
  if (list) {
    if (!only.length) return { ok: true };
    q = q.in("id", only);
  }
  const { error } = await q;
  return { ok: !error };
}
