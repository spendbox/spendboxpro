"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendAdvertiserCode, verifyAdvertiserCode } from "./actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";

/** Email → 4-digit code → signed in. */
export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, then: () => void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      if (res.ok) then();
      else setError(res.error);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    }
    setBusy(false);
  }

  if (step === "code") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => verifyAdvertiserCode(email, code), () => router.refresh());
        }}
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
          {busy ? "Checking…" : "Sign in"}
        </button>
        <div className="flex justify-between">
          <button
            type="button"
            className="text-sm text-muted underline"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
          <button
            type="button"
            className="text-sm text-muted underline"
            disabled={busy}
            onClick={() => run(() => sendAdvertiserCode(email), () => setNotice("New code sent."))}
          >
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
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => sendAdvertiserCode(email), () => setStep("code"));
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          className={input}
          type="email"
          autoComplete="email"
          placeholder="you@yourbrand.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
        />
      </label>
      <button className={button} disabled={busy}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
      <p className="text-xs text-muted">Tip: the &ldquo;Manage your ad&rdquo; button in any of our emails signs you in straight away.</p>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
