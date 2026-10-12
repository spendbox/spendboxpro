import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// What a push notification shows (public/sw.js asks when a push arrives): your latest notice.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ title: "Newtown", body: "Something happened in the city.", url: "/play" });
  const { data } = await createAdminClient().from("notifications").select("kind, body").eq("user_id", userId).order("id", { ascending: false }).limit(1).maybeSingle();
  const title = data?.kind === "doorstep" ? "At your door" : data?.kind === "market" ? "Sold!" : data?.kind === "thanks" ? "Thank you" : data?.kind === "gift" ? "A gift" : "Newtown";
  return NextResponse.json({ title, body: data?.body ?? "Something happened in the city.", url: "/play" }, { headers: { "Cache-Control": "no-store" } });
}
