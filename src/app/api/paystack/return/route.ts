import { NextResponse, type NextRequest } from "next/server";
import { confirmPack, packRegion } from "@/app/play/pack-actions";
import { confirmTopUp } from "@/app/play/topup-actions";

/**
 * GET /api/paystack/return?ref=pk-… or tu-…: where Paystack sends a player after paying for a starter pack or a top-up.
 * The mint is given here first (checked with Paystack, once), whether or not this browser is still
 * signed in, then the player goes back to the game, which shows that the pack is in.
 */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref") ?? request.nextUrl.searchParams.get("reference") ?? "";
  const back = request.nextUrl.clone();
  back.pathname = "/play";
  back.search = "";
  if (/^pk-[a-f0-9]{20}$/.test(ref)) {
    try {
      await confirmPack(ref);
    } catch (error) {
      console.error("Pack return confirmation failed", ref, error);
    }
    const region = await packRegion(ref).catch(() => null);
    back.searchParams.set("world", region ?? "lagos");
    back.searchParams.set("pack", ref);
  }
  // A top-up (src/app/play/topup-actions.ts): the same, then "Your top-up is in" in the game.
  if (/^tu-[a-f0-9]{20}$/.test(ref)) {
    const r = await confirmTopUp(ref).catch((error) => {
      console.error("Top-up return confirmation failed", ref, error);
      return null;
    });
    back.searchParams.set("world", r?.region ?? "lagos");
    back.searchParams.set("topup", ref);
  }
  return NextResponse.redirect(back, 303);
}
