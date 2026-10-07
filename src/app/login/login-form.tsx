"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    router.push("/play");
    router.refresh();
  }

  const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
  const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-night disabled:opacity-50";

  return sent ? (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Code sent to <b className="text-ink">{email}</b>. Check your inbox (and spam).
      </p>
      <input
        className={`${input} text-center text-2xl tracking-[0.4em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
        autoFocus
        required
      />
      <button className={button} disabled={busy || code.length < 6}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <button type="button" className="text-sm text-muted underline" onClick={() => { setSent(false); setCode(""); }}>
        Use a different email
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  ) : (
    <form onSubmit={sendCode} className="flex flex-col gap-3">
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
      <button className={button} disabled={busy}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
