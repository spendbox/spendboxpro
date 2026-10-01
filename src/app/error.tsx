"use client";

import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const setupProblem = /Missing (NEXT_PUBLIC_SUPABASE|SUPABASE_)/.test(error.message);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-3xl font-bold">
          {setupProblem ? "Spendbox isn't connected yet" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-muted">
          {setupProblem
            ? "The Supabase settings are missing. Add them in Vercel → Settings → Environment Variables, then redeploy (see the README)."
            : "Please try again. If it keeps happening, refresh the page."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
