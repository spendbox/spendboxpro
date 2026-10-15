import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";

/**
 * GET /api/turn: relay servers for voice calls (docs/VOICE_CALLS.md), for signed-in players only.
 * With Cloudflare's TURN (CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN), each player gets
 * their own login that runs out after a day, so nobody can copy one out of the page and use our
 * relay for something else. Without them, an empty list: calls use the NEXT_PUBLIC_TURN_* relay
 * if one is set, else go phone to phone only.
 */
export async function GET() {
  const none = NextResponse.json({ iceServers: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return none;
  if (!(await currentUserId().catch(() => null))) return NextResponse.json({ iceServers: [] }, { status: 401 });
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 86_400 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("TURN credentials failed", res.status);
      return none;
    }
    const j = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
    return NextResponse.json({ iceServers: list }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("TURN credentials failed", e);
    return none;
  }
}
