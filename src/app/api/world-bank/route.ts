import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/world-bank: what the World Bank holds (taxes on games, game-db/083) and what came in today, in mint. */
export async function GET() {
  const { data, error } = await createAdminClient().rpc("world_bank_view");
  if (error || !data) return NextResponse.json(null);
  const d = data as { balance?: number; today?: number };
  return NextResponse.json({ balance: Number(d.balance ?? 0), today: Number(d.today ?? 0) });
}
