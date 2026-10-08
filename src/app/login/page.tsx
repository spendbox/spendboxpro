import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@/components/icons";
import { currentUserId } from "@/lib/game";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Enter the world" };

export default async function LoginPage() {
  if (await currentUserId()) redirect("/play");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
          <ArrowLeft className="size-4" />
          Back to watching the city
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Enter the world</h1>
        <p className="mt-1 text-muted">Just your email to start.</p>
        <p className="mt-3 flex items-center gap-2 text-sm font-medium">
          <span className="rounded-lg border border-hit px-1.5 py-0.5 text-xs font-bold text-hit">18+</span>
          You must be 18 or older to play.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
