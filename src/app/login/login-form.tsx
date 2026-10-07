"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendCode, verifyCode } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const res = await sendCode(email);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSent(true);
    setNotice(sent ? "New code sent." : null);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await verifyCode(email, code);
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.push("/play");
    router.refresh();
  }

  const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
  const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";

  return sent ? (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        We sent a 6-digit code to <b className="text-ink">{email}</b>. Check your inbox (and spam).
      </p>
      <input
        className={`${input} text-center text-2xl tracking-[0.4em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        autoFocus
        required
      />
      <button className={button} disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <div className="flex justify-between text-sm text-muted">
        <button type="button" className="underline" onClick={() => { setSent(false); setCode(""); setError(null); }}>
          Change email
        </button>
        <button type="button" className="underline" disabled={busy} onClick={() => send()}>
          Send a new code
        </button>
      </div>
      {notice && !error && <p className="text-sm text-me">{notice}</p>}
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  ) : (
    <form onSubmit={send} className="flex flex-col gap-3">
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
