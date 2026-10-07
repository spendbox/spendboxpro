import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdultsOnly, WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

type Profile = { username: string | null; pin_set: boolean; birth_date?: string | null; age_blocked_at?: string | null };

async function loadProfile(userId: string): Promise<Profile | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("username, pin_set, birth_date, age_blocked_at")
    .eq("id", userId)
    .maybeSingle();
  if (!error) return data;
  // Part 12 of the database not run yet: carry on without the date-of-birth step.
  const old = await db.from("profiles").select("username, pin_set").eq("id", userId).maybeSingle();
  return old.data ? { ...old.data, birth_date: "unknown" } : null;
}

// Who lands here:
// - new players (after the email code): name, PIN and date of birth;
// - "forgot PIN" (?pin=1 from the sign-in page) and "Change PIN": name and PIN
//   (plus date of birth if we still don't have it);
// - players from before the 18+ rule (sent here by the game pages): just the date of birth;
// - anyone who said they're under 18: a friendly "adults only" note, no form.
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const [data, params] = await Promise.all([loadProfile(userId), searchParams]);

  if (data?.age_blocked_at) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Adults only</h1>
          <p className="mt-1 text-muted">Hide &amp; Seek is for adults 18+.</p>
        </div>
        <AdultsOnly />
      </main>
    );
  }

  const pinSet = Boolean(data?.pin_set);
  const askBirth = !data?.birth_date;
  const askPin = !pinSet || !askBirth || params.pin === "1";
  const title = !pinSet ? "Welcome to the city" : askPin ? "Set a new PIN" : "One quick thing";
  const intro = !pinSet
    ? "Pick the name other players will see, a 6-digit PIN for next time, and tell us your date of birth."
    : askPin
      ? "Choose a new 6-digit PIN. You can change your name here too."
      : "Hide & Seek is now for adults 18+. Please add your date of birth to keep playing. We'll only ask once.";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-muted">{intro}</p>
      </div>
      <WelcomeForm initialName={data?.username ?? ""} askPin={askPin} askBirth={askBirth} />
    </main>
  );
}
