import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const { data } = await createAdminClient().from("profiles").select("username, pin_set").eq("id", userId).maybeSingle();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{data?.pin_set ? "Change your PIN" : "Welcome to the city"}</h1>
        <p className="mt-1 text-muted">
          Pick the name other players will see, and a 6-digit PIN to sign in with next time.
        </p>
      </div>
      <WelcomeForm initialName={data?.username ?? ""} />
    </main>
  );
}
