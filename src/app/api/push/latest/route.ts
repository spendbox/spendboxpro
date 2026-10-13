import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// What a push notification shows (public/sw.js asks when a push arrives): your latest notice, or
// your latest private message if that's newer. Also how many things are waiting for you (the
// number on the app's icon), and a tag: one notification per conversation, replaced as more come.
const TITLE: Record<string, string> = {
  doorstep: "At your door",
  market: "Sold!",
  thanks: "Thank you",
  gift: "A gift",
  mark: "Your mark",
  street: "On the street",
  dating: "Dating",
  course: "Congratulations!",
  challenge: "Challenge",
  visit: "At your door",
  money: "Money",
};

export async function GET() {
  const userId = await currentUserId();
  const fallback = { title: "Newtown", body: "Something happened in the city.", url: "/play" };
  if (!userId) return NextResponse.json(fallback);
  const db = createAdminClient();
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: n }, { data: dm }, notes, chats] = await Promise.all([
    db.from("notifications").select("kind, body, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("chat_messages").select("sender_id, sender_name, body, audio_path, image_path, created_at").eq("recipient_id", userId).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null).is("dismissed_at", null),
    // Unread private messages (game-db/071; before it's run this fails and only notices count).
    db.from("chat_messages").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null).gte("created_at", week),
  ]);
  const unread = (notes.error ? 0 : (notes.count ?? 0)) + (chats.error ? 0 : (chats.count ?? 0));
  const dmNewer = dm && (!n || Date.parse(String(dm.created_at)) >= Date.parse(String(n.created_at)));
  const body = dmNewer
    ? {
        title: String(dm.sender_name ?? "Someone"),
        body: dm.audio_path ? "🎤 Sent you a voice note" : dm.image_path && (!dm.body || dm.body === "Sent a photo") ? "📷 Sent you a photo" : dm.body ? String(dm.body) : "💬 New chat",
        // Tapping it opens that conversation.
        url: `/play?dm=${encodeURIComponent(String(dm.sender_id ?? ""))}&name=${encodeURIComponent(String(dm.sender_name ?? ""))}`,
        tag: `dm:${String(dm.sender_id ?? "")}`,
        unread,
      }
    : n
      ? { title: TITLE[String(n.kind)] ?? "Newtown", body: String(n.body), url: "/play?alerts=1", tag: "notice", unread }
      : { ...fallback, unread };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
