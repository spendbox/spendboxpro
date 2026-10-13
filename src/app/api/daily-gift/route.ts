import { NextResponse } from "next/server";
import { myThings } from "@/app/play/item-actions";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { dailyGift } from "@/lib/world/daily-gift";

const n = (v: unknown) => Number(v ?? 0) || 0;

/**
 * POST /api/daily-gift: take today's gift (docs/MONEY.md). Worked out here from yesterday's active
 * time, your streak, how long you've played and your reputation; paid once a day, capped, by the
 * database (game-db/073). Answers { naira, streak } or { already: true } or { error }.
 */
export async function POST() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: "Sign in first." });
  const db = createAdminClient();
  const [{ data: life }, status, things] = await Promise.all([
    db.from("lives").select("region").eq("user_id", userId).maybeSingle(),
    db.rpc("daily_gift_status", { p_user: userId }),
    myThings().catch(() => null),
  ]);
  if (status.error || !status.data) return NextResponse.json({ error: "The daily gift is switched on soon." });
  if (!life) return NextResponse.json({ error: "Start your life first." });
  const s = status.data as Record<string, unknown>;
  if (s.claimed) return NextResponse.json({ already: true });
  const perMint = REGIONS[String(life.region ?? "lagos")]?.prices.perMint ?? 1_500;
  const g = dailyGift({ activeYesterday: n(s.active_yesterday), streak: n(s.streak), daysPlaying: n(s.days_playing), reputation: things?.reputation.score ?? 0 });
  const mint = Math.round((g.total / perMint) * 100) / 100;
  const note = `Your daily gift: ₦${g.total.toLocaleString("en-GB")}${n(s.streak) > 1 ? ` (${n(s.streak)} days in a row)` : ""}. Come back tomorrow for another.`;
  const { data, error } = await db.rpc("daily_gift_claim", { p_user: userId, p_amount: mint, p_note: note });
  if (error) return NextResponse.json({ error: "That didn't work just now. Try again." });
  const r = data as { already?: boolean; amount?: number; streak?: number };
  if (r.already) return NextResponse.json({ already: true });
  return NextResponse.json({ naira: Math.round(n(r.amount) * perMint), streak: n(r.streak) });
}
