import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/game";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Enter the world" };

export default async function LoginPage() {
  if (await currentUserId()) redirect("/play");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <Link href="/" className="text-sm font-medium text-muted">
          ← Back to watching the city
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Enter the world</h1>
        <p className="mt-1 text-muted">Just your email to start.</p>
      </div>
      <LoginForm />
    </main>
  );
}
