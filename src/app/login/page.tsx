import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/game";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Enter the world" };

export default async function LoginPage() {
  if (await currentUserId()) redirect("/play");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Enter the world</h1>
        <p className="mt-1 text-muted">Just your email to start.</p>
      </div>
      <LoginForm />
    </main>
  );
}
