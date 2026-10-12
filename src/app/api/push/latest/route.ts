import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// What a push notification shows (public/sw.js asks when a push arrives): your latest notice, or
// your latest private message if that's newer.
const TITLE: Record<string, string> = {
  doorstep: "At your door",
  market: "Sold!",
  thanks: "Thank you",
  gift: "A gift",
  mark: "Your mark",
  street: "On the street",
  dating: "Dating",
  course: "Congratulations!",
};

export async function GET() {
  const userId = await currentUserId();
  const fallback = { title: "Newtown", body: "Something happened in the city.", url: "/play" };
  if (!userId) return NextResponse.json(fallback);
  const db = createAdminClient();
  const [{ data: n }, { data: dm }] = await Promise.all([
    db.from("notifications").select("kind, body, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("chat_messages").select("sender_name, body, created_at").eq("recipient_id", userId).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const dmNewer = dm && (!n || Date.parse(String(dm.created_at)) >= Date.parse(String(n.created_at)));
  const body = dmNewer
    ? { title: `Message from ${dm.sender_name ?? "someone"}`, body: String(dm.body ?? "Sent you a voice note."), url: "/play" }
    : n
      ? { title: TITLE[String(n.kind)] ?? "Newtown", body: String(n.body), url: "/play" }
      : fallback;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
