import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { FIRST_STEP_NAIRA, type FirstSteps } from "@/lib/world/first-steps";

/**
 * POST /api/first-steps: which of the first five minutes' steps you've done (docs/FIRST_STEPS.md),
 * paying the small reward for any newly done (game-db/072 checks each really happened). Before
 * part 72 is run it still says what's done, without paying.
 */
export async function POST() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json(null);
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region, home_unit").eq("user_id", userId).maybeSingle();
  const perMint = REGIONS[String(life?.region ?? "lagos")]?.prices.perMint ?? 1_500;
  const reward = Math.round((FIRST_STEP_NAIRA / perMint) * 100) / 100;
  const { data, error } = await db.rpc("first_steps_check", { p_user: userId, p_reward: reward });
  if (!error && data) {
    const d = data as { hi: boolean; challenge: boolean; home: boolean; paid: string[]; reward: number };
    return NextResponse.json({ hi: !!d.hi, challenge: !!d.challenge, home: !!d.home, paid: d.paid ?? [], rewardNaira: Number(d.reward) > 0 ? FIRST_STEP_NAIRA : 0 } satisfies FirstSteps);
  }
  // Part 72 not run yet: what's done, nothing paid.
  const [hi, ch] = await Promise.all([
    db.from("chat_messages").select("id", { count: "exact", head: true }).eq("sender_id", userId).not("recipient_id", "is", null),
    db.from("challenge_players").select("challenge_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return NextResponse.json({ hi: (hi.count ?? 0) > 0, challenge: !ch.error && (ch.count ?? 0) > 0, home: !!life?.home_unit, paid: [], rewardNaira: 0 } satisfies FirstSteps);
}
