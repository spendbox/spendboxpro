"use client";

import { useActionState, useState } from "react";
import { hqClearBuildingName, hqClearHomeName, hqRecheckPack, hqSignIn, hqSignOut, hqStopAd, hqTakeDown } from "./actions";

type HqKind = "pack" | "takedown" | "clearbuilding" | "clearhome" | "stopad";
const RUN: Record<HqKind, (id: string) => Promise<string>> = {
  pack: hqRecheckPack,
  takedown: hqTakeDown,
  clearbuilding: hqClearBuildingName,
  clearhome: hqClearHomeName,
  stopad: hqStopAd,
};
const ASK: Partial<Record<HqKind, string>> = {
  takedown: "Take this business off the map?",
  clearbuilding: "Clear this building's name?",
  clearhome: "Clear this home's name?",
  stopad: "Stop this ad?",
};

const input = "h-11 w-full rounded-xl border border-line bg-panel px-4 text-base outline-none focus:border-gold";

export function HqSignIn() {
  const [state, action, busy] = useActionState(hqSignIn, { error: null });
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <input name="email" type="email" autoComplete="username" required placeholder="Email" className={input} />
      <input name="password" type="password" autoComplete="current-password" required placeholder="Password" className={input} />
      {state.error && <p className="text-sm text-hit">{state.error}</p>}
      <button disabled={busy} className="h-11 rounded-xl bg-ink font-semibold text-white disabled:opacity-50">
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

export function HqSignOut() {
  return (
    <button onClick={() => void hqSignOut()} className="rounded-full bg-ink/5 px-4 py-2 text-sm font-semibold">
      Sign out
    </button>
  );
}

export function HqButton({ kind, id, label, danger }: { kind: HqKind; id: string; label: string; danger?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (note) return <span className="text-xs text-muted">{note}</span>;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        const ask = ASK[kind];
        if (ask && !window.confirm(ask)) return;
        setBusy(true);
        setNote(await RUN[kind](id));
      }}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${danger ? "bg-hit/10 text-hit" : "bg-gold text-ink"}`}
    >
      {busy ? "…" : label}
    </button>
  );
}
