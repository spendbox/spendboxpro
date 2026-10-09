"use server";

import { cleanAvatar, type Avatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Hugs, handshakes, "My gifts", thank-yous and blocking. The database
// (game-db/028_hugs_gifts.sql) checks every rule: daily limits, blocked players, paused accounts.

type Fail = { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function say(message: string | undefined, fallback: string) {
  const [code, n] = (message ?? "").split(":");
  const map: Record<string, string> = {
    self: "That's you!",
    bad_kind: "Pick a hug or a handshake.",
    unknown_player: "Please sign in again.",
    no_name: "Pick a player name first.",
    frozen: "Your account is paused right now.",
    unknown_target: "That player isn't around any more.",
    target_bot: "The bot isn't the hugging type. Pick a real player.",
    target_frozen: "That player's account is paused right now.",
    blocked: "That player isn't taking hugs from you.",
    you_blocked: "You blocked that player. Unblock them in My gifts first.",
    daily_cap: `That's ${n ?? 30} hugs and handshakes today. More tomorrow!`,
    pair_cap: `That's ${n ?? 3} for this player today. Try someone else!`,
    no_gift: "That gift isn't there any more.",
    no_player: "We couldn't find that player.",
  };
  if (map[code]) return map[code];
  console.error("Hug action failed", message);
  return fallback;
}

/** Send a hug or a handshake. */
export async function sendGreeting(
  toId: string,
  kind: "hug" | "handshake",
): Promise<{ ok: true; kind: "hug" | "handshake"; to: string; leftToday: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to send hugs." };
  if (typeof toId !== "string" || !UUID_RE.test(toId)) return { ok: false, error: "Pick a player." };
  if (kind !== "hug" && kind !== "handshake") return { ok: false, error: "Pick a hug or a handshake." };
  const { data, error } = await createAdminClient().rpc("send_greeting", { p_from: userId, p_to: toId, p_kind: kind });
  if (error || !data) return { ok: false, error: say(error?.message, "Couldn't send that. Try again.") };
  const d = data as { kind: "hug" | "handshake"; to: string; left_today: number };
  return { ok: true, kind: d.kind, to: String(d.to), leftToday: Number(d.left_today) };
}

export type GiftKind = "gift" | "spray" | "hug" | "handshake";
export type GiftItem = {
  kind: GiftKind;
  id: number;
  from: string;
  name: string;
  avatar: Avatar;
  /** Mint, for gifts and spraying. */
  amount: number | null;
  note: string | null;
  at: string;
  thanked: boolean;
  /** You blocked the sender. */
  blocked: boolean;
};
export type MyGifts = {
  items: GiftItem[];
  totals: { hugs: number; handshakes: number; mint: number };
  sentToday: number;
  leftToday: number;
  blocked: { id: string; name: string; avatar: Avatar }[];
};

/** What other players sent you lately, and who you blocked. */
export async function loadMyGifts(): Promise<{ ok: true; gifts: MyGifts } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to see your gifts." };
  const db = createAdminClient();
  const [{ data, error }, { data: blockedRows }] = await Promise.all([
    db.rpc("my_gifts", { p_user: userId }),
    db.rpc("blocked_players", { p_user: userId }),
  ]);
  if (error || !data) return { ok: false, error: "Couldn't load your gifts." };
  const d = data as Record<string, unknown>;
  const kinds: GiftKind[] = ["gift", "spray", "hug", "handshake"];
  const items = (Array.isArray(d.items) ? d.items : []).flatMap((r: Record<string, unknown>) => {
    if (!kinds.includes(r.kind as GiftKind) || typeof r.from !== "string") return [];
    const name = String(r.name ?? "Someone");
    return [
      {
        kind: r.kind as GiftKind,
        id: Number(r.id),
        from: r.from,
        name,
        avatar: cleanAvatar(r.avatar, name),
        amount: r.amount == null ? null : Number(r.amount),
        note: typeof r.note === "string" ? r.note : null,
        at: String(r.at),
        thanked: Boolean(r.thanked),
        blocked: Boolean(r.blocked),
      },
    ];
  });
  const t = (d.totals ?? {}) as Record<string, unknown>;
  const blocked = (Array.isArray(blockedRows) ? blockedRows : []).flatMap((r: Record<string, unknown>) =>
    typeof r.id === "string" ? [{ id: r.id, name: String(r.name ?? "Someone"), avatar: cleanAvatar(r.avatar, String(r.name ?? "")) }] : [],
  );
  return {
    ok: true,
    gifts: {
      items,
      totals: { hugs: Number(t.hugs ?? 0), handshakes: Number(t.handshakes ?? 0), mint: Number(t.mint ?? 0) },
      sentToday: Number(d.sent_today ?? 0),
      leftToday: Number(d.left_today ?? 0),
      blocked,
    },
  };
}

/** Say thank you for something in My gifts (the sender is told). */
export async function thankFor(kind: GiftKind, id: number): Promise<{ ok: true } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (!["gift", "spray", "hug", "handshake"].includes(kind) || !Number.isInteger(id) || id <= 0) return { ok: false, error: say("no_gift", "") };
  const { error } = await createAdminClient().rpc("thank_for", { p_user: userId, p_kind: kind, p_id: id });
  return error ? { ok: false, error: say(error.message, "Couldn't say thanks. Try again.") } : { ok: true };
}

/** Block a player (or unblock them with block = false). */
export async function setBlocked(otherId: string, block: boolean): Promise<{ ok: true } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (typeof otherId !== "string" || !UUID_RE.test(otherId)) return { ok: false, error: "Pick a player." };
  const { error } = await createAdminClient().rpc(block ? "block_player" : "unblock_player", { p_user: userId, p_other: otherId });
  return error ? { ok: false, error: say(error.message, "Couldn't do that just now. Try again.") } : { ok: true };
}
