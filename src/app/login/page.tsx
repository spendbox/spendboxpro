import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/game";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUserId()) redirect("/play");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Sign in</h1>
        <p className="mt-1 text-muted">We&apos;ll email you a code. New here? You&apos;ll get 500 coins.</p>
      </div>
      <LoginForm />
    </main>
  );
}
