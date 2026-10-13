"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { ENCOUNTER_WIN_DAY, ENCOUNTERS_A_DAY, encounterById, rollChoice } from "@/lib/world/encounters";

// Encounters out on the street (docs/ENCOUNTERS.md; the database part is game-db/070_encounters.sql):
// the phone says which choice you made, the server rolls what happens and moves the money.

export type EncounterResult = { ok: true; text: string; naira: number; mint: number } | { ok: false; error: string };

export async function resolveEncounter(id: string, choice: number, region: string): Promise<EncounterResult> {
  const e = encounterById(String(id));
  const c = e?.choices[Math.round(Number(choice))];
  if (!e || !c) return { ok: false, error: "That moment has passed." };
  const out = rollChoice(c);
  const userId = await currentUserId();
  // Just looking round (not signed in): the story, no money.
  if (!userId) return { ok: true, text: out.text, naira: 0, mint: 0 };
  const perMint = REGIONS[region]?.prices.perMint ?? 1_500;
  const mint = Math.round((out.naira / perMint) * 100) / 100;
  const { data, error } = await createAdminClient().rpc("life_encounter", {
    p_user: userId,
    p_encounter: e.id,
    p_choice: Math.round(Number(choice)),
    p_mint: mint,
    p_note: e.title,
    p_win_cap: Math.round((ENCOUNTER_WIN_DAY / perMint) * 100) / 100,
    p_day_cap: ENCOUNTERS_A_DAY,
  });
  if (error) {
    const code = error.message.split(":")[0];
    // Before part 70 is run, or no life yet: the story, no money.
    if (/life_encounter|encounter_log/.test(error.message) || code === "no_life") return { ok: true, text: out.text, naira: 0, mint: 0 };
    if (code === "too_soon" || code === "too_many") return { ok: true, text: out.text, naira: 0, mint: 0 };
    console.error("Encounter failed", error.message);
    return { ok: false, error: "Couldn't settle that. Try again." };
  }
  const moved = Number(data ?? 0) || 0;
  return { ok: true, text: out.text, naira: Math.round(moved * perMint), mint: moved };
}
