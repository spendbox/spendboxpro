import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What a signed-in player still has to do before they can play, shown in the sign-in pop-up
 * over the town, one question at a time (src/app/welcome/welcome-form.tsx):
 * - setup: a new player still signing up (name, man or woman, date of birth, password);
 * - askPassword: a player from before passwords, to make one (game-db/100);
 * - askBirth: no date of birth yet (asked once, 18+);
 * - blocked: they told us they're under 18.
 * Nothing to do: null.
 */
export type WelcomeNeeds = { name: string; email: string; setup: boolean; askPassword: boolean; askBirth: boolean; blocked: boolean };

/**
 * One small lookup by id. If it hiccups, nobody is held up: only an unfinished account (which the
 * game already knows about) still asks.
 */
export async function welcomeNeeds(userId: string, pinSet: boolean): Promise<WelcomeNeeds | null> {
  const fallback = pinSet ? null : { name: "", email: "", setup: true, askPassword: false, askBirth: true, blocked: false };
  try {
    const db = createAdminClient();
    let res = await db.from("profiles").select("username, email, pin_set, password_set, birth_date, age_blocked_at").eq("id", userId).maybeSingle();
    // game-db/100 not run yet: nobody is asked to make a password.
    if (res.error) res = await db.from("profiles").select("username, email, pin_set, birth_date, age_blocked_at").eq("id", userId).maybeSingle();
    const data = res.data as { username: string | null; email: string | null; pin_set: boolean; password_set?: boolean; birth_date: string | null; age_blocked_at: string | null } | null;
    if (res.error || !data) return fallback;
    const needs = {
      name: data.username ?? "",
      email: data.email ?? "",
      setup: !data.pin_set,
      askPassword: !!data.pin_set && data.password_set === false,
      askBirth: !data.birth_date,
      blocked: Boolean(data.age_blocked_at),
    };
    return needs.setup || needs.askPassword || needs.askBirth || needs.blocked ? needs : null;
  } catch {
    return fallback;
  }
}
