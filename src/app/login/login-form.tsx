"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { loginWithPin, sendCode, verifyCode } from "./actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";

export function LoginForm() {
  const [tab, setTab] = useState<"pin" | "email">("email");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 rounded-xl bg-panel-2 p-1 text-sm font-semibold">
        {(["email", "pin"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-lg py-2", tab === t ? "bg-panel shadow-sm" : "text-muted")}
          >
            {t === "pin" ? "Name & PIN" : "Email code"}
          </button>
        ))}
      </div>
      {tab === "pin" ? <PinForm onForgot={() => setTab("email")} /> : <EmailForm />}
    </div>
  );
}

function PinForm({ onForgot }: { onForgot: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await loginWithPin(name, pin);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    router.push("/play");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input className={input} placeholder="Your name" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        className={`${input} tracking-[0.3em]`}
        placeholder="6-digit PIN"
        inputMode="numeric"
        type="password"
        autoComplete="current-password"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        required
      />
      <button className={button} disabled={busy || pin.length !== 6 || name.length < 3}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <button type="button" onClick={onForgot} className="text-sm text-muted underline">
        Forgot your PIN? Sign in with an email code
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}

function EmailForm() {
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
    setNotice(sent ? "New code sent." : null);
    setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await verifyCode(email, code);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    router.push(res.needsSetup ? "/welcome" : "/play");
    router.refresh();
  }

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
        {busy ? "Checking…" : "Continue"}
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
        required
      />
      <button className={button} disabled={busy}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
      <p className="text-xs text-muted">New here? Use your email. You&apos;ll pick a name and PIN next, and get 500 coins.</p>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
