import { NextResponse } from "next/server";
import { myThings } from "@/app/play/item-actions";

// Your things and reputation as a plain GET (see ../around/route.ts for why not a server action).
export async function GET() {
  return NextResponse.json(await myThings(), { headers: { "Cache-Control": "no-store" } });
}
