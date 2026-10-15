"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PinInput } from "@/components/pin-input";
import { RobotCheck } from "@/components/robot-check";
import { loginWithPin, sendCode, startSignIn, verifyCode } from "./actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";

type Step = "email" | "pin" | "code";

/**
 * Email first. Returning players type their PIN; new players pass the robot check and go on to
 * pick a name and PIN; forgot PIN gets a code by email.
 * onDone (the sign-in pop-up over the town): called instead of going to another page, with
 * "play" once signed in, or "welcome" when a name and PIN come next.
 */
export function LoginForm({ onDone }: { onDone?: (next: "play" | "welcome") => void } = {}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The robot check's token for sign-up, and a count to ask for a fresh one (each works once). */
  const [robot, setRobot] = useState<string | null>(null);
  const [robotRound, setRobotRound] = useState(0);

  async function run<T extends { ok: boolean }>(fn: () => Promise<T>, then: (res: T) => void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError((res as unknown as { error: string }).error);
    else then(res);
  }

  const back = (
    <button type="button" className="text-sm text-muted underline" onClick={() => { setStep("email"); setPin(""); setCode(""); setError(null); }}>
      Use a different email
    </button>
  );

  if (step === "pin") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => loginWithPin(email, pin), () => {
            setBusy(true);
            if (onDone) return onDone("play");
            router.push("/play");
          });
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-muted">
          Welcome back, <b className="text-ink">{email}</b>. Enter your 6-digit PIN.
        </p>
        <PinInput label="Your PIN" value={pin} onChange={setPin} autoFocus />
        <button className={button} disabled={busy || pin.length !== 6}>
          {busy ? "Opening the city…" : "Enter"}
        </button>
        <div className="flex justify-between">
          {back}
          <button
            type="button"
            className="text-sm text-muted underline"
            disabled={busy}
            onClick={() => run(() => sendCode(email), () => { setStep("code"); setNotice("We emailed you a code to reset your PIN."); })}
          >
            Forgot PIN?
          </button>
        </div>
        {error && <p className="text-sm text-hit">{error}</p>}
      </form>
    );
  }

  if (step === "code") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => verifyCode(email, code), () => {
            setBusy(true);
            if (onDone) return onDone("welcome");
            router.push("/welcome?pin=1");
          });
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-muted">
          We sent a 4-digit code to <b className="text-ink">{email}</b>. If you can&apos;t see it, check your spam folder.
        </p>
        <input
          className={`${input} text-center text-2xl tracking-[0.6em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="0000"
          maxLength={4}
          pattern="[0-9]*"
          aria-label="4-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          autoFocus
          required
        />
        <button className={button} disabled={busy || code.length !== 4}>
          {busy ? "Checking…" : "Continue"}
        </button>
        <div className="flex justify-between">
          {back}
          <button type="button" className="text-sm text-muted underline" disabled={busy} onClick={() => run(() => sendCode(email), () => setNotice("New code sent."))}>
            Send a new code
          </button>
        </div>
        {notice && !error && <p className="text-sm text-me">{notice}</p>}
        {error && <p className="text-sm text-hit">{error}</p>}
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          async () => {
            const res = await startSignIn(email, robot);
            // A token works once: get a fresh one for the next try.
            if (!res.ok || res.next !== "pin") setRobotRound((r) => r + 1);
            return res;
          },
          (res) => {
            if (!res.ok) return;
            if (res.next === "pin") return setStep("pin");
            setBusy(true);
            if (onDone) return onDone("welcome");
            router.push("/welcome");
          },
        );
      }}
      className="flex flex-col gap-3"
    >
      <input
        className={input}
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
        required
      />
      <RobotCheck onToken={setRobot} round={robotRound} />
      <button className={button} disabled={busy}>
        {busy ? "One moment…" : "Continue"}
      </button>
      <p className="text-xs text-muted">First time? Use an email you can open (itFirst time? Just pick a name and a 6-digit PIN next: that&apos;s your password.apos;s how you get back in if you forget your PIN), then pick a name and a 6-digit PIN. New players start with ₦2,000,000 and a free home. You must be 18 or older to play.</p>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
