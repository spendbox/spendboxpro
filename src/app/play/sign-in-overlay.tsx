"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { Logo } from "@/components/logo";
import type { WelcomeNeeds } from "@/lib/welcome";
import { LoginForm } from "../login/login-form";
import { AdultsOnly, WelcomeForm, type WelcomeMode } from "../welcome/welcome-form";

// Signing in and signing up, in a pop-up over the town (the town stops moving and blurs behind
// it). Only the X closes it: a tap outside does nothing, so nobody loses what they typed.
// Steps: your email; then your password (returning players), or your email again and the robot
// check (new players), or a code we email you (forgot password); then, one question a screen,
// what's still missing (src/app/welcome/welcome-form.tsx).

export function SignInOverlay({
  why,
  signedIn,
  welcome,
  meName,
  onClose,
  onSignOut,
}: {
  /** Why we're asking (they tried something that needs an account), or null. */
  why: string | null;
  /** The game now knows who they are. */
  signedIn: boolean;
  /** Signed in, but still to finish signing up, make a password or give their date of birth (or under 18). */
  welcome: WelcomeNeeds | null;
  meName: string | null;
  onClose: () => void;
  /** Leaving halfway through signing up: sign out again. */
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "signed-in" | "new" | "reset">("email");
  const [pending, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  // Signed in with their PIN and nothing left to fill in: straight into the town.
  useEffect(() => {
    if (stage === "signed-in" && signedIn && !welcome) onClose();
  }, [stage, signedIn, welcome, onClose]);

  const waiting = stage !== "email" && !signedIn;
  // Signing in sets the login cookie, and that same answer from the server already brings the
  // signed-in town (no second load). If it hasn't arrived after a few seconds (a slow network),
  // ask again; if it still hasn't, load the page afresh, so nobody is left waiting on a spinner.
  useEffect(() => {
    if (!waiting) return;
    const again = setTimeout(refresh, 4_000);
    const reload = setTimeout(() => window.location.reload(), 20_000);
    return () => {
      clearTimeout(again);
      clearTimeout(reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);
  const blocked = Boolean(welcome?.blocked);
  const details = !waiting && !blocked && (welcome !== null || ((stage === "new" || stage === "reset") && signedIn));
  const mode: WelcomeMode =
    stage === "reset" ? "reset" : welcome?.setup || stage === "new" ? "setup" : welcome?.askPassword ? "upgrade" : "birth";
  // Halfway through signing up: the X signs out again.
  const mustFinish = welcome !== null;

  const title = blocked
    ? "Adults only"
    : details
      ? { setup: "Welcome to the city", upgrade: "Make a password", reset: "New password", birth: "One quick thing" }[mode]
      : "Enter Newtown";
  const intro = blocked
    ? "Newtown is for adults 18+."
    : details
      ? { setup: "A few quick questions, one at a time.", upgrade: "One last thing before you play.", reset: "Choose a new password.", birth: "Newtown is for adults 18+. Please add your date of birth to keep playing." }[mode]
      : "Just your email to start.";

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/25 p-4 backdrop-blur-[6px]" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-panel p-5 shadow-2xl"
      >
        <button
          onClick={() => (mustFinish ? onSignOut() : onClose())}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2"
          aria-label={mustFinish ? "Stop signing up and sign out" : "Close"}
          title={mustFinish ? "Stop signing up (signs you out)" : "Close"}
        >
          <X className="size-5" />
        </button>
        <Logo size={32} className="mb-4" />
        <h2 id="sign-in-title" className="pr-10 font-display text-2xl font-bold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{intro}</p>
        {why && !details && !blocked && <p className="mt-3 rounded-xl bg-gold/20 px-3 py-2 text-sm font-medium text-gold-dark">{why}</p>}
        {!details && !blocked && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium">
            <span className="rounded-lg border border-hit px-1.5 py-0.5 text-xs font-bold text-hit">18+</span>
            You must be 18 or older to play.
          </p>
        )}
        <div className="mt-5">
          {waiting || (pending && stage !== "email" && !details && !blocked) ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm font-semibold text-muted" role="status">
              <LoaderCircle className="size-5 animate-spin" />
              Opening the town…
            </p>
          ) : blocked ? (
            <AdultsOnly />
          ) : details ? (
            <WelcomeForm
              key={mode}
              mode={mode}
              email={welcome?.email ?? ""}
              initialName={welcome?.name || meName || ""}
              askBirth={welcome ? welcome.askBirth : stage === "new"}
              onDone={() => {
                refresh();
                onClose();
              }}
            />
          ) : (
            <LoginForm onDone={(next) => setStage(next === "play" ? "signed-in" : next)} />
          )}
        </div>
      </section>
    </div>
  );
}
