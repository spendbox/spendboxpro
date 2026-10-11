"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// The owner's map reports page: only the emails in ADMIN_EMAIL (comma-separated) can see and mark them.

/** Is the signed-in player the owner? */
export async function isOwner() {
  try {
    const userId = await currentUserId();
    if (!userId) return false;
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    const email = data?.user?.email?.toLowerCase();
    const owners = (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    return !!email && owners.includes(email);
  } catch {
    return false;
  }
}

/** Mark a report fixed, won't fix, duplicate (or open again), with an optional note to the reporter. */
export async function markReport(id: number, status: "open" | "fixed" | "wontfix" | "duplicate", reply: string) {
  if (!(await isOwner())) return { ok: false, error: "Only the owner can do that." };
  const { error } = await createAdminClient().rpc("map_report_set", { p_id: id, p_status: status, p_reply: reply.slice(0, 300) });
  if (error) return { ok: false, error: "That didn't save." };
  revalidatePath("/map-reports");
  return { ok: true };
}
