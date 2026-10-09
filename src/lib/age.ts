import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Newtown is for adults (18+). Players give their date of birth once, in the sign-in pop-up
// over the town (see lib/welcome.ts) or on /welcome.
// The date is private: it is only read on the server (lib/welcome.ts only checks it is there)
// and never sent to other players.

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
