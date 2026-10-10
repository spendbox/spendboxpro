"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Robbing the bank: what's in the vault and the odds, and the attempt itself. The database
// (game-db/032_bank_heist.sql) rolls the dice and moves the mint.

type Fail = { ok: false; error: string };

export type HeistPlan = { key: "quiet" | "big"; stake: number; chance: number; loot: number };
export type HeistInfo = {
  vault: number;
  coins: number;
  cooldownUntil: string | null;
  can: boolean;
  why: string | null;
  fineShare: number;
  fineMax: number;
  minVault: number;
  plans: HeistPlan[];
};
export type HeistResult = { success: boolean; plan: "quiet" | "big"; stake: number; loot: number; fine: number; coins: number; vault: number };

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined) {
  const [code, arg] = (message ?? "").split(":");
  const map: Record<string, string> = {
    no_game: "The bank only opens while a game is on.",
    unknown_player: "Please sign in again.",
    no_name: "Pick a player name first.",
    frozen: "Your account is paused right now.",
    cooldown: `The police are still watching you. Try again in ${Math.ceil(n(arg) / 60)} minutes.`,
    empty_vault: "The vault is nearly empty. It isn't worth the risk yet.",
    not_enough: `You need ₥${arg ?? 100} to pull this job.`,
    bad_plan: "Pick a plan.",
  };
  if (map[code]) return map[code];
  console.error("Bank heist failed", message);
  return "Couldn't do that. Try again.";
}

/** The vault, the two plans and whether you can try now. */
export async function bankHeistInfo(): Promise<{ ok: true; info: HeistInfo } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to rob the bank." };
  const { data, error } = await createAdminClient().rpc("bank_heist_info", { p_user: userId });
  if (error) return { ok: false, error: say(error.message) };
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    info: {
      vault: n(d.vault),
      coins: n(d.coins),
      cooldownUntil: d.cooldown_until ? String(d.cooldown_until) : null,
      can: Boolean(d.can),
      why: d.why ? String(d.why) : null,
      fineShare: n(d.fine_share),
      fineMax: n(d.fine_max),
      minVault: n(d.min_vault),
      plans: (Array.isArray(d.plans) ? d.plans : []).map((p: Record<string, unknown>) => ({
        key: p.key === "big" ? "big" : "quiet",
        stake: n(p.stake),
        chance: n(p.chance),
        loot: n(p.loot),
      })),
    },
  };
}

/** Try to rob the bank. */
export async function robBank(plan: "quiet" | "big"): Promise<{ ok: true; result: HeistResult } | Fail> {
  if (plan !== "quiet" && plan !== "big") return { ok: false, error: "Pick a plan." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to rob the bank." };
  const { data, error } = await createAdminClient().rpc("bank_heist", { p_user: userId, p_plan: plan });
  if (error) return { ok: false, error: say(error.message) };
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    result: { success: Boolean(d.success), plan: d.plan === "big" ? "big" : "quiet", stake: n(d.stake), loot: n(d.loot), fine: n(d.fine), coins: n(d.coins), vault: n(d.vault) },
  };
}
