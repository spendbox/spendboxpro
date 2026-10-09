"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PinInput } from "@/components/pin-input";
import { saveBirthDateOnly, saveNameAndPin, signOutNow } from "../login/actions";
import { BirthDateInput, birthComplete, emptyBirth } from "./birth-date-input";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";

/**
 * Name + PIN (first sign-in, forgot PIN, change PIN) and/or date of birth (asked once).
 * askPin false = a player from before the 18+ rule who only needs to add their date of birth.
 */
export function WelcomeForm({
  initialName,
  askPin,
  askBirth,
  onDone,
}: {
  initialName: string;
  askPin: boolean;
  askBirth: boolean;
  /** The sign-in pop-up over the town: called instead of going to the game page. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [birth, setBirth] = useState(emptyBirth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (askPin && pin !== pin2) return setError("The two PINs don't match.");
    if (askBirth && !birthComplete(birth)) return setError("Please choose your date of birth.");
    setBusy(true);
    setError(null);
    const birthInput = askBirth && birthComplete(birth) ? birth : null;
    const res = askPin ? await saveNameAndPin(name, pin, birthInput) : await saveBirthDateOnly(birthInput ?? birth);
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      // Under 18: reload the page, which now shows the "adults only" note instead of the form.
      if (res.underage) router.refresh();
      return;
    }
    if (onDone) return onDone();
    router.push("/play");
    router.refresh();
  }

  const pinReady = !askPin || (pin.length === 6 && pin === pin2 && name.length >= 3);
  const birthReady = !askBirth || birthComplete(birth);

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {askPin && (
        <>
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
        </>
      )}
      {askBirth && <BirthDateInput value={birth} onChange={setBirth} />}
      <button className={button} disabled={busy || !pinReady || !birthReady}>
        {busy ? "Saving…" : askPin ? "Enter the city" : "Continue"}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}

/** Shown instead of the form to anyone who told us they are under 18. */
export function AdultsOnly() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border border-line bg-panel p-4 text-sm">
        Sorry, Newtown is only for adults 18 and over, so this account can&apos;t play. Thanks for being honest with us.
      </p>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOutNow();
          router.push("/");
          router.refresh();
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
