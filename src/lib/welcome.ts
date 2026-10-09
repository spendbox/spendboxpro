import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What a signed-in player still has to do before they can play, shown in the sign-in pop-up
 * over the town: pick a name and PIN (new players), give their date of birth (asked once,
 * 18+), or nothing at all (null). blocked: they told us they're under 18.
 */
export type WelcomeNeeds = { name: string; askPin: boolean; askBirth: boolean; blocked: boolean };

/**
 * One small lookup by id. If it hiccups, nobody is held up: only a missing PIN (which the
 * game already knows about) still asks.
 */
export async function welcomeNeeds(userId: string, pinSet: boolean): Promise<WelcomeNeeds | null> {
  const fallback = pinSet ? null : { name: "", askPin: true, askBirth: false, blocked: false };
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("profiles")
      .select("username, pin_set, birth_date, age_blocked_at")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return fallback;
    const needs = {
      name: data.username ?? "",
      askPin: !data.pin_set,
      askBirth: !data.birth_date,
      blocked: Boolean(data.age_blocked_at),
    };
    return needs.askPin || needs.askBirth || needs.blocked ? needs : null;
  } catch {
    return fallback;
  }
}
