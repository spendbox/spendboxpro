import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Hide & Seek is for adults (18+). Players give their date of birth once, on /welcome.
// The date is private: it is only read here on the server and never sent to other players.

/**
 * True when this signed-in player still has to give their date of birth (or told us they
 * are under 18), so the pages send them to /welcome. One tiny lookup by id.
 * If the lookup fails (a network blip, or part 12 of the database isn't run yet) this says
 * false, so nobody gets locked out by a hiccup; /welcome asks next time.
 */
export async function needsBirthDate(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("birth_date")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    return !data.birth_date;
  } catch {
    return false;
  }
}

/** Turns day/month/year from the form into "YYYY-MM-DD", or null if it isn't a real date. */
export function toIsoDate(day: number, month: number, year: number): string | null {
  if (![day, month, year].every(Number.isInteger)) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** Saves the date of birth; the database checks the age (18+) and refuses under-18s for good. */
export async function saveBirthDate(
  userId: string,
  isoDate: string,
): Promise<"ok" | "already_set" | "blocked" | "invalid" | "under_18" | "error"> {
  const { data, error } = await createAdminClient().rpc("set_birth_date", { p_user: userId, p_birth: isoDate });
  if (error) {
    console.error("Saving date of birth failed", error.message);
    return "error";
  }
  return data as "ok" | "already_set" | "blocked" | "invalid" | "under_18";
}
