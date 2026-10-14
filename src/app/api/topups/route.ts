import { NextResponse } from "next/server";
import { myTopUps } from "@/app/play/topup-actions";

/**
 * GET /api/topups: your payments, with any stuck one checked with Paystack again (and given if it
 * went through). A plain request rather than a server action, so a slow check never holds up the
 * rest of the game (server actions from one page run one at a time).
 */
export async function GET() {
  const r = await myTopUps().catch(() => null);
  return NextResponse.json(r);
}
