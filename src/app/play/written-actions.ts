"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDraft, type Draft } from "@/lib/world/written";

// Player-written moments (docs/LIFE_WHEEL.md, phase 7; src/lib/world/written.ts, game-db/117):
// sending one in, voting on other people's, and seeing how yours are doing. The owner approves them
// on the dashboard.

const n = (v: unknown) => Number(v) || 0;

/** At most this many waiting for votes from one person at a time. */
const MAX_WAITING = 3;

/** A draft as the phone shows it. */
export type DraftRow = { id: number; draft: Draft; status: "voting" | "approved" | "rejected" | "retired"; up: number; down: number; note: string | null; createdAt: string };

function clean(d: Draft): Draft {
  const t = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return {
    title: t(d?.title, 60),
    emoji: t(d?.emoji, 8),
    spot: d?.spot,
    ask: d?.ask,
    text: t(d?.text, 400),
    choices: (Array.isArray(d?.choices) ? d.choices : []).slice(0, 6).map((c) => ({
      label: t(c?.label, 80),
      outcomes: (Array.isArray(c?.outcomes) ? c.outcomes : []).slice(0, 4).map((o) => ({ text: t(o?.text, 300), money: n(o?.money), rep: n(o?.rep), chance: n(o?.chance) || 1 })),
    })),
  };
}

/** Send in a moment you wrote: checked, then up for votes. */
export async function submitDraft(draft: Draft): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, errors: ["Sign in first."] };
  const d = clean(draft);
  const errors = checkDraft(d);
  if (errors.length) return { ok: false, errors };
  const db = createAdminClient();
  const { count, error: countError } = await db.from("moment_drafts").select("id", { count: "exact", head: true }).eq("author", userId).eq("status", "voting");
  if (countError) return { ok: false, errors: ["Writing moments is switched on soon."] };
  if ((count ?? 0) >= MAX_WAITING) return { ok: false, errors: [`You have ${MAX_WAITING} moments waiting already. Wait for one to be decided first.`] };
  const { error } = await db.from("moment_drafts").insert({ author: userId, draft: d });
  if (error) return { ok: false, errors: ["Something went wrong. Try again."] };
  return { ok: true };
}

/** Your moments and how they're doing. */
export async function myDrafts(): Promise<DraftRow[] | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await createAdminClient().from("moment_drafts").select("id, draft, status, up, down, note, created_at").eq("author", userId).order("created_at", { ascending: false }).limit(20);
  if (error) return null;
  return (data ?? []).map((r) => ({ id: n(r.id), draft: r.draft as Draft, status: r.status as DraftRow["status"], up: n(r.up), down: n(r.down), note: r.note ? String(r.note) : null, createdAt: String(r.created_at) }));
}

/** Other people's moments waiting for votes that you haven't voted on, newest first. */
export async function draftsToVote(): Promise<DraftRow[] | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const [{ data, error }, { data: mine }] = await Promise.all([
    db.from("moment_drafts").select("id, draft, status, up, down, note, created_at").eq("status", "voting").neq("author", userId).order("created_at", { ascending: false }).limit(40),
    db.from("moment_draft_votes").select("draft_id").eq("user_id", userId).limit(2000),
  ]);
  if (error) return null;
  const voted = new Set((mine ?? []).map((v) => n(v.draft_id)));
  return (data ?? [])
    .filter((r) => !voted.has(n(r.id)))
    .slice(0, 10)
    .map((r) => ({ id: n(r.id), draft: r.draft as Draft, status: "voting" as const, up: n(r.up), down: n(r.down), note: null, createdAt: String(r.created_at) }));
}

/** Vote on someone's moment: good (1) or not (−1). */
export async function voteDraft(id: number, vote: 1 | -1): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  const { error } = await createAdminClient().rpc("moment_draft_vote", { p_user: userId, p_draft: Math.round(n(id)), p_vote: vote === 1 ? 1 : -1 });
  return { ok: !error };
}
