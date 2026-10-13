import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { MISSION_NAIRA, MISSIONS, type Mission, type MissionState } from "@/lib/world/tutorial";

/**
 * POST /api/tutorial: which of the walkthrough's missions you've done (name your home, say hi, win
 * a challenge), paying each newly done one once (game-db/080 checks each really happened, after
 * your walkthrough started). Answers MissionState, or { off: true } before part 80 is run.
 */
export async function POST() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json(null);
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region").eq("user_id", userId).maybeSingle();
  if (!life) return NextResponse.json(null);
  const perMint = REGIONS[String(life.region ?? "lagos")]?.prices.perMint ?? 1_500;
  const rewards = Object.fromEntries(MISSIONS.map((m) => [m, Math.round((MISSION_NAIRA[m] / perMint) * 100) / 100]));
  const { data, error } = await db.rpc("tutorial_check", { p_user: userId, p_rewards: rewards });
  if (error || !data) return NextResponse.json({ off: true });
  const d = data as Record<string, unknown>;
  return NextResponse.json({
    name: d.name === true,
    hi: d.hi === true,
    win: d.win === true,
    paid: ((d.paid as string[]) ?? []).filter((m): m is Mission => (MISSIONS as string[]).includes(m)),
  } satisfies MissionState);
}
