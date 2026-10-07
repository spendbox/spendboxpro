"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveNameAndPin } from "../login/actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";

export function WelcomeForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin !== pin2) return setError("The two PINs don't match.");
    setBusy(true);
    setError(null);
    const res = await saveNameAndPin(name, pin);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    router.push("/play");
    router.refresh();
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-sm font-medium">
        Name
        <input
          className={`${input} mt-1`}
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16))}
          placeholder="e.g. NightOwl"
          autoComplete="username"
          required
        />
        <span className="mt-1 block text-xs font-normal text-muted">3 to 16 letters, numbers or _</span>
      </label>
      <label className="text-sm font-medium">
        6-digit PIN
        <input className={`${input} mt-1 tracking-[0.3em]`} type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(digits(e.target.value))} required />
      </label>
      <label className="text-sm font-medium">
        PIN again
        <input className={`${input} mt-1 tracking-[0.3em]`} type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(digits(e.target.value))} required />
      </label>
      <button className="w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50" disabled={busy || pin.length !== 6 || name.length < 3}>
        {busy ? "Saving…" : "Enter the city"}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
