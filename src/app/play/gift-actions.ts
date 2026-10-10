"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Giving coins to other players, and spraying coins on dancers in clubs. The database
// (give_coins / spray_coins in game-db/019_activities.sql) checks every rule: whole coins,
// enough coins, daily limits, no gifts to yourself or the bot, frozen accounts blocked.

type Fail = { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function friendly(message: string | undefined, fallback: string) {
  const m = message ?? "";
  const left = Number(/:(\d+(\.\d+)?)/.exec(m)?.[1] ?? 0);
  if (m.startsWith("daily_cap")) {
    return left > 0 ? `You can give ${Math.floor(left).toLocaleString("en")} more mint today.` : "You've given all you can for today. Come back tomorrow!";
  }
  if (m.startsWith("pair_cap")) {
    return left > 0
      ? `You can give this player ${Math.floor(left).toLocaleString("en")} more mint today.`
      : "You've given this player all you can for today.";
  }
  const map: Record<string, string> = {
    bad_amount: "Pick a whole number of mint.",
    gift_self: "You can't give mint to yourself!",
    unknown_target: "That player isn't around any more.",
    target_bot: "The bot doesn't need mint. Pick a real player.",
    target_frozen: "That player's account is paused right now.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
    no_name: "Pick a player name first.",
    new_player: "Play one game first, then you can give mint away.",
    not_enough: "You don't have that much mint.",
    no_dancers: "Nobody to spray right now. Wait for some dancers!",
    blocked: "That player isn't taking gifts from you.",
  };
  const code = Object.keys(map).find((k) => m.startsWith(k));
  if (!code) console.error("Mint transfer failed", m);
  return code ? map[code] : fallback;
}

/** Give coins to another player (1–10,000 at a time), with an optional short note. */
export async function giveCoins(
  toId: string,
  amount: number,
  note?: string,
): Promise<{ ok: true; amount: number; to: string; balance: number; leftToday: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to give mint." };
  if (typeof toId !== "string" || !UUID_RE.test(toId)) return { ok: false, error: "Pick a player." };
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000) return { ok: false, error: "Pick between ₥1 and ₥10,000." };
  const text = typeof note === "string" ? note.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const { data, error } = await createAdminClient().rpc("give_coins", { p_from: userId, p_to: toId, p_amount: amount, p_note: text || null });
  if (error || !data) return { ok: false, error: friendly(error?.message, "Couldn't send the mint. Try again.") };
  const d = data as { amount: number; to: string; balance: number; left_today: number };
  return { ok: true, amount: Number(d.amount), to: String(d.to), balance: Number(d.balance), leftToday: Number(d.left_today) };
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
  if (!Number.isInteger(amount) || amount < 10 || amount > 500) return { ok: false, error: "Spray between ₥10 and ₥500." };
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
