import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { loadNotices } from "@/lib/notices";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/notices: your latest notices on the real map, read or not (cleared ones left out). The
 * game asks every few seconds, when it comes back into view, and at once when a push arrives, so
 * new ones pop up and the counters match what you've read on any of your devices.
 */
export async function GET() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ notices: [] });
  const notices = await loadNotices(createAdminClient(), userId);
  return NextResponse.json({ notices }, { headers: { "Cache-Control": "no-store" } });
}
