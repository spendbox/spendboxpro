import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

/** What playing has paid you, by where it came from (ledger kinds). */
const FROM: Record<string, string[]> = {
  gift: ["daily_gift"],
  online: ["online_pay"],
  wins: ["challenge_win", "challenge_bonus", "duel_reward"],
  missions: ["tutorial", "first_step", "quest_reward", "activity_reward", "streak_reward", "event_reward", "event_bonus"],
  property: ["property_income"],
};

export type Earnings = Record<keyof typeof FROM, { total: number; today: number }>;

/**
 * GET /api/earnings: your rewards for showing up (daily gifts, being online, challenge wins, missions) and
 * from your property, in all and today (Lagos day), in mint. For Things › Assets.
 */
export async function GET() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json(null);
  const kinds = Object.values(FROM).flat();
  const groupOf = (kind: string) => (Object.keys(FROM) as (keyof typeof FROM)[]).find((k) => FROM[k].includes(kind));
  // Added up by the database (game-db/083 earnings_summary), so nothing is left out however long you play.
  const { data: sums, error: sumError } = await createAdminClient().rpc("earnings_summary", { p_user: userId, p_kinds: kinds });
  if (!sumError && sums) {
    const out = Object.fromEntries(Object.keys(FROM).map((k) => [k, { total: 0, today: 0 }])) as Earnings;
    for (const [kind, v] of Object.entries(sums as Record<string, { total: number; today: number }>)) {
      const g = groupOf(kind);
      if (!g) continue;
      out[g].total += Number(v.total) || 0;
      out[g].today += Number(v.today) || 0;
    }
    return NextResponse.json(out);
  }
  const { data, error } = await createAdminClient()
    .from("ledger")
    .select("kind, amount, created_at")
    .eq("user_id", userId)
    .in("kind", kinds)
    .gt("amount", 0)
    .order("created_at", { ascending: false })
    .limit(20_000);
  if (error) return NextResponse.json(null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const out = Object.fromEntries(Object.keys(FROM).map((k) => [k, { total: 0, today: 0 }])) as Earnings;
  for (const r of (data ?? []) as { kind: string; amount: number; created_at: string }[]) {
    const group = (Object.keys(FROM) as (keyof typeof FROM)[]).find((k) => FROM[k].includes(r.kind));
    if (!group) continue;
    const a = Number(r.amount) || 0;
    out[group].total += a;
    if (new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }) === today) out[group].today += a;
  }
  return NextResponse.json(out);
}
