"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PinInput } from "@/components/pin-input";
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
      <PinInput label="Choose a 6-digit PIN" value={pin} onChange={setPin} autoComplete="new-password" />
      <PinInput label="Type it again" value={pin2} onChange={setPin2} autoComplete="new-password" />
      {pin2.length === 6 && pin !== pin2 && <p className="text-sm text-hit">The two PINs don&apos;t match yet.</p>}
      <button className="w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50" disabled={busy || pin.length !== 6 || pin !== pin2 || name.length < 3}>
        {busy ? "Saving…" : "Enter the city"}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
