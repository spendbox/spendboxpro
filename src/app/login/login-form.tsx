"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { RobotCheck } from "@/components/robot-check";
import { createAccount, loginWithPassword, sendCode, startSignIn, verifyCode } from "./actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";

type Step = "email" | "password" | "again" | "code";

/**
 * Email first, one question a screen. Players with an account type their password (or, from
 * before passwords, their old PIN); new players type their email again and pass the robot check,
 * then answer the rest (src/app/welcome/welcome-form.tsx); forgot password gets a code by email.
 * onDone (the sign-in pop-up over the town): called instead of going to another page, with
 * "play" once signed in, "new" for a new player, or "reset" to make a new password.
 */
export function LoginForm({ onDone }: { onDone?: (next: "play" | "new" | "reset") => void } = {}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [again, setAgain] = useState("");
  const [password, setPassword] = useState("");
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
  const finish = (next: "play" | "new" | "reset") => {
    setBusy(true);
    if (onDone) return onDone(next);
    router.push(next === "play" ? "/play" : "/welcome");
  };

  const back = (
    <button type="button" className="text-sm text-muted underline" onClick={() => { setStep("email"); setPassword(""); setAgain(""); setCode(""); setError(null); }}>
      Use a different email
    </button>
  );
  const problem = error && <p className="text-sm text-hit">{error}</p>;

  if (step === "password") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); run(() => loginWithPassword(email, password), () => finish("play")); }} className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Welcome back, <b className="text-ink">{email}</b>.
        </p>
        {/* For password managers: the account this password belongs to. */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <PasswordInput label="Your password" value={password} onChange={setPassword} autoFocus />
        <p className="-mt-1 text-xs text-muted">Played before passwords? Type your old 6-digit PIN.</p>
        <button className={button} disabled={busy || !password}>
          {busy ? "Opening the city…" : "Enter"}
        </button>
        <div className="flex justify-between">
          {back}
          <button
            type="button"
            className="text-sm text-muted underline"
            disabled={busy}
            onClick={() => run(() => sendCode(email), () => { setStep("code"); setNotice("We emailed you a code to make a new password."); })}
          >
            Forgot password?
          </button>
        </div>
        {problem}
      </form>
    );
  }

  if (step === "again") {
    const typo = again.length >= email.length && again.trim().toLowerCase() !== email.trim().toLowerCase();
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            async () => {
              const res = await createAccount(email, again, robot);
              // A token works once: get a fresh one for the next try.
              if (!res.ok) setRobotRound((r) => r + 1);
              return res;
            },
            () => finish("new"),
          );
        }}
        className="flex flex-col gap-3"
      >
        <p className="font-display text-lg font-bold">New here? Welcome! 👋</p>
        <label className="text-sm font-medium">
          Type your email again
          <input
            className={`${input} mt-1`}
            type="email"
            autoComplete="off"
            placeholder={email.replace(/^(.).*@/, "$1…@")}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              setNotice("Type it rather than paste it: that's how we catch a typo.");
            }}
            autoFocus
            required
          />
        </label>
        <p className="-mt-1 text-xs text-muted">It&apos;s how you get back in if you ever forget your password, so make sure it&apos;s right.</p>
        {typo && <p className="text-sm text-hit">That doesn&apos;t match what you typed before.</p>}
        <RobotCheck onToken={setRobot} round={robotRound} />
        <button className={button} disabled={busy || !again || typo}>
          {busy ? "Making your account…" : "That's me"}
        </button>
        {back}
        {notice && !error && <p className="text-sm text-muted">{notice}</p>}
        {problem}
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); run(() => verifyCode(email, code), () => finish("reset")); }} className="flex flex-col gap-3">
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
        {problem}
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => startSignIn(email), (res) => res.ok && setStep(res.next === "password" ? "password" : "again"));
      }}
      className="flex flex-col gap-3"
    >
      <label className="text-sm font-medium">
        Your email
        <input
          className={`${input} mt-1`}
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
        />
      </label>
      <button className={button} disabled={busy}>
        {busy ? "One moment…" : "Continue"}
      </button>
      <p className="text-xs text-muted">New players start with ₦2,000,000 and a free home. You must be 18 or older to play.</p>
      {problem}
    </form>
  );
}
