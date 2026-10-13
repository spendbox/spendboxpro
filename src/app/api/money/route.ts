import { NextResponse } from "next/server";
import { myThings } from "@/app/play/item-actions";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { dailyGift } from "@/lib/world/daily-gift";
import { sourceOf, type MoneyView } from "@/lib/world/money-view";

const n = (v: unknown) => Number(v ?? 0) || 0;

/** Midnight in Lagos today, as a timestamp. */
function lagosMidnight() {
  const day = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+01:00`).toISOString();
}

/**
 * GET /api/money: "Your money": today's daily gift (taken, or what it would be) and where today's
 * money came from (docs/MONEY.md). Before game-db/073 is run the gift is null.
 */
export async function GET() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json(null);
  const db = createAdminClient();
  const [{ data: life }, status, { data: rows }, things] = await Promise.all([
    db.from("lives").select("region").eq("user_id", userId).maybeSingle(),
    db.rpc("daily_gift_status", { p_user: userId }),
    db.from("ledger").select("kind, amount").eq("user_id", userId).gte("created_at", lagosMidnight()).limit(2000),
    myThings().catch(() => null),
  ]);
  const perMint = REGIONS[String(life?.region ?? "lagos")]?.prices.perMint ?? 1_500;
  const toNaira = (mint: number) => Math.round(mint * perMint);
  let gift: MoneyView["gift"] = null;
  if (!status.error && status.data) {
    const s = status.data as Record<string, unknown>;
    const claimed = !!s.claimed;
    gift = {
      claimed,
      amountNaira: claimed ? toNaira(n(s.today_amount)) : null,
      streak: claimed ? n(s.today_streak) : n(s.streak),
      parts: claimed ? null : dailyGift({ activeYesterday: n(s.active_yesterday), streak: n(s.streak), daysPlaying: n(s.days_playing), reputation: things?.reputation.score ?? 0 }),
      activeToday: n(s.active_today),
    };
  }
  const by = new Map<string, number>();
  let out = 0;
  for (const r of (rows ?? []) as { kind: string; amount: number }[]) {
    const a = n(r.amount);
    if (a > 0) by.set(sourceOf(String(r.kind)), (by.get(sourceOf(String(r.kind))) ?? 0) + a);
    else out -= a;
  }
  const view: MoneyView = {
    gift,
    inToday: [...by.entries()].map(([label, mint]) => ({ label, naira: toNaira(mint) })).sort((a, b) => b.naira - a.naira),
    outToday: toNaira(out),
  };
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
