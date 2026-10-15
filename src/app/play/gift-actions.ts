"use server";

import { naira } from "@/lib/brand";
import { pushTo } from "@/lib/push";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Giving coins to other players, and spraying coins on dancers in clubs. The database
// (give_coins / spray_coins in game-db/019_activities.sql, new givers in 065, no cap in 107) checks every rule: whole coins,
// enough coins, new accounts' daily limit, no gifts to yourself or the bot, frozen accounts blocked.

type Fail = { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function friendly(message: string | undefined, fallback: string) {
  const m = message ?? "";
  const left = Number(/:(\d+(\.\d+)?)/.exec(m)?.[1] ?? 0);
  // There's no limit on giving (part 107), except for new accounts: under 3 days old or below
  // level 5, they can give ₥500 a day (part 65), so nobody farms the starting money.
  if (m.startsWith("new_giver_cap")) {
    return left > 0
      ? `You can give ${naira(Math.floor(left))} more today. New players can give up to ${naira(500)} a day until their account is 3 days old and level 5.`
      : `New players can give up to ${naira(500)} a day until their account is 3 days old and level 5. Come back tomorrow!`;
  }
  const map: Record<string, string> = {
    bad_amount: "Pick a whole amount.",
    gift_self: "You can't give money to yourself!",
    unknown_target: "That player isn't around any more.",
    target_bot: "The bot doesn't need money. Pick a real player.",
    target_frozen: "That player's account is paused right now.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
    no_name: "Pick a player name first.",
    new_player: "Play one game first, then you can give money away.",
    not_enough: "You don't have that much money.",
    no_dancers: "Nobody to spray right now. Wait for some dancers!",
    blocked: "That player isn't taking gifts from you.",
  };
  const code = Object.keys(map).find((k) => m.startsWith(k));
  if (!code) console.error("Mint transfer failed", m);
  return code ? map[code] : fallback;
}

/** Give money to another player: any whole amount you have, with an optional short note. */
export async function giveCoins(
  toId: string,
  amount: number,
  note?: string,
): Promise<{ ok: true; amount: number; to: string; balance: number; leftToday: number | null } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to give money." };
  if (typeof toId !== "string" || !UUID_RE.test(toId)) return { ok: false, error: "Pick a player." };
  if (!Number.isSafeInteger(amount) || amount < 1) return { ok: false, error: "Pick a whole amount." };
  const text = typeof note === "string" ? note.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const { data, error } = await createAdminClient().rpc("give_coins", { p_from: userId, p_to: toId, p_amount: amount, p_note: text || null });
  if (error || !data) return { ok: false, error: friendly(error?.message, "Couldn't send the money. Try again.") };
  const d = data as { amount: number; to: string; balance: number; left_today: number | null };
  await pushTo(toId);
  return { ok: true, amount: Number(d.amount), to: String(d.to), balance: Number(d.balance), leftToday: d.left_today == null ? null : Number(d.left_today) };
}

/** Spray coins on the dance floor: 10–500 coins split between up to 10 dancers. */
export async function sprayCoins(
  targets: string[],
  amount: number,
): Promise<{ ok: true; amount: number; shares: { id: string; name: string; coins: number }[]; balance: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to spray." };
  const ids = Array.isArray(targets) ? [...new Set(targets.filter((t) => typeof t === "string" && UUID_RE.test(t)))].slice(0, 30) : [];
  if (!ids.length) return { ok: false, error: "Nobody to spray right now. Wait for some dancers!" };
  if (!Number.isInteger(amount) || amount < 10 || amount > 500) return { ok: false, error: `Spray between ${naira(10)} and ${naira(500)}.` };
  const { data, error } = await createAdminClient().rpc("spray_coins", { p_from: userId, p_targets: ids, p_amount: amount });
  if (error || !data) return { ok: false, error: friendly(error?.message, "Couldn't spray. Try again.") };
  const d = data as { amount: number; shares: { id: string; name: string; coins: number }[]; balance: number };
  return {
    ok: true,
    amount: Number(d.amount),
    shares: (d.shares ?? []).map((s) => ({ id: String(s.id), name: String(s.name), coins: Number(s.coins) })),
    balance: Number(d.balance),
  };
}

/** The signed-in player's coins (for the give and spray screens). */
export async function myCoinBalance(): Promise<{ ok: true; coins: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data } = await createAdminClient().from("profiles").select("coins").eq("id", userId).maybeSingle();
  return { ok: true, coins: Number(data?.coins ?? 0) };
}
