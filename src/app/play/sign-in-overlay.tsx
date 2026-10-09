"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { Logo } from "@/components/logo";
import type { WelcomeNeeds } from "@/lib/welcome";
import { LoginForm } from "../login/login-form";
import { AdultsOnly, WelcomeForm } from "../welcome/welcome-form";

// Signing in and signing up, in a pop-up over the town (the town stops moving and blurs behind
// it). Only the X closes it: a tap outside does nothing, so nobody loses what they typed.
// Steps: your email; then your PIN (returning players) or a code we email you (new players,
// and forgot PIN); then, for new players, a name, a PIN and your date of birth (18+).

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
  /** Signed in, but still to pick a name and PIN or give their date of birth (or under 18). */
  welcome: WelcomeNeeds | null;
  meName: string | null;
  onClose: () => void;
  /** Leaving halfway through signing up: sign out again. */
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "signed-in" | "new-pin">("email");
  const [pending, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  // Signed in with their PIN and nothing left to fill in: straight into the town.
  useEffect(() => {
    if (stage === "signed-in" && signedIn && !welcome) onClose();
  }, [stage, signedIn, welcome, onClose]);

  const waiting = stage !== "email" && !signedIn;
  const blocked = Boolean(welcome?.blocked);
  const details = !waiting && !blocked && (welcome !== null || (stage === "new-pin" && signedIn));
  const askPin = stage === "new-pin" || Boolean(welcome?.askPin);
  const askBirth = Boolean(welcome?.askBirth);
  // Halfway through signing up (no name and PIN yet, or no date of birth): the X signs out again.
  const mustFinish = welcome !== null;

  const title = blocked
    ? "Adults only"
    : details
      ? welcome?.askPin
        ? "Welcome to the city"
        : askPin
          ? "Set a new PIN"
          : "One quick thing"
      : "Enter Newtown";
  const intro = blocked
    ? "Newtown is for adults 18+."
    : details
      ? welcome?.askPin
        ? "Pick the name other players will see, a 6-digit PIN for next time, and tell us your date of birth."
        : askPin
          ? "Choose a new 6-digit PIN. You can change your name here too."
          : "Newtown is for adults 18+. Please add your date of birth to keep playing. We'll only ask once."
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
              key={askPin ? "pin" : "birth"}
              initialName={welcome?.name || meName || ""}
              askPin={askPin}
              askBirth={askBirth}
              onDone={() => {
                refresh();
                onClose();
              }}
            />
          ) : (
            <LoginForm
              onDone={(next) => {
                setStage(next === "play" ? "signed-in" : "new-pin");
                refresh();
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
