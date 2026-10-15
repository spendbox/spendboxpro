import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdultsOnly, WelcomeForm, type WelcomeMode } from "./welcome-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Welcome" };

type Profile = { username: string | null; email?: string | null; pin_set: boolean; birth_date?: string | null; age_blocked_at?: string | null };

async function loadProfile(userId: string): Promise<Profile | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("username, email, pin_set, birth_date, age_blocked_at")
    .eq("id", userId)
    .maybeSingle();
  if (!error) return data;
  // Part 12 of the database not run yet: carry on without the date-of-birth step.
  const old = await db.from("profiles").select("username, pin_set").eq("id", userId).maybeSingle();
  return old.data ? { ...old.data, birth_date: "unknown" } : null;
}

// Who lands here (one question a screen, src/app/welcome/welcome-form.tsx):
// - new players still signing up: name, man or woman, date of birth, password;
// - "forgot password" and "Change password" from the menu: a new password (plus the date of
//   birth if we still don't have it);
// - anyone who said they're under 18: a friendly "adults only" note, no form.
export default async function WelcomePage() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const data = await loadProfile(userId);

  if (data?.age_blocked_at) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <div>
          <Logo size={36} className="mb-5" />
          <h1 className="font-display text-3xl font-bold">Adults only</h1>
          <p className="mt-1 text-muted">Newtown is for adults 18+.</p>
        </div>
        <AdultsOnly />
      </main>
    );
  }

  const askBirth = !data?.birth_date;
  const mode: WelcomeMode = !data?.pin_set ? "setup" : "reset";
  const title = mode === "setup" ? "Welcome to the city" : "New password";
  const intro = mode === "setup" ? "A few quick questions, one at a time." : "Choose a new password.";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <Logo size={36} className="mb-5" />
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-muted">{intro}</p>
      </div>
      <WelcomeForm mode={mode} email={data?.email ?? ""} initialName={data?.username ?? ""} askBirth={askBirth} />
    </main>
  );
}
