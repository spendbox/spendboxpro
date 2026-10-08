"use client";

import { useEffect, useState } from "react";
import { Check, Gift, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { giveCoins, myCoinBalance } from "../gift-actions";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";
import { questEvent } from "./quest-store";
import { ActivityStyles, BigButton, Confetti, Face, GameHeader } from "./ui";

// Give coins to another player: 1–10,000 at a time, with an optional note. The server checks
// the limits (20,000 a day in total, 10,000 a day to the same person) and tells the receiver.

const PRESETS = [10, 50, 100, 500, 1000];

export function GiveCoinsSheet({ to, onClose }: { to: { id: string; name: string; avatar: unknown }; onClose: () => void }) {
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ amount: number; leftToday: number } | null>(null);

  useEffect(() => {
    let live = true;
    void myCoinBalance().then((r) => live && r.ok && setBalance(r.coins));
    return () => {
      live = false;
    };
  }, []);

  const n = Math.floor(Number(amount));
  const valid = Number.isInteger(n) && n >= 1 && n <= 10_000 && (balance === null || n <= balance);

  async function give() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await giveCoins(to.id, n, note.trim() || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      playSfx("denied");
      return;
    }
    setBalance(res.balance);
    setSent({ amount: res.amount, leftToday: res.leftToday });
    questEvent({ type: "gift", amount: res.amount });
    playSfx("found");
  }

  return (
    <Sheet onClose={onClose}>
      <ActivityStyles />
      <div className="relative space-y-4">
        <GameHeader icon={Gift} title="Give coins" sub={balance === null ? "" : `You have ${short(balance)} coins`} onClose={onClose} color="#12a37a" />
        <div className="flex items-center gap-3 rounded-2xl bg-panel-2 p-3">
          <Face p={to} size={44} />
          <div className="min-w-0">
            <p className="text-xs text-muted">To</p>
            <p className="truncate font-semibold">{to.name}</p>
          </div>
        </div>
        {sent ? (
          <div className="act-pop space-y-3 text-center">
            <Confetti />
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-me text-white">
              <Check className="size-8" />
            </span>
            <p className="font-display text-xl font-bold">
              Sent {short(sent.amount)} coins to {to.name}!
            </p>
            <p className="text-sm text-muted">They&apos;ll get a notification. You can give {short(sent.leftToday)} more today.</p>
            <BigButton onClick={onClose}>Done</BigButton>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(String(p))}
                  className={cn("rounded-xl py-2 text-sm font-bold", n === p ? "bg-gold text-ink" : "bg-panel-2 text-muted")}
                >
                  {short(p)}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-sm font-semibold">How many coins?</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                className="mt-1 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-lg font-bold outline-none focus:border-ink"
                aria-label="Coins to give"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Add a note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 80))}
                placeholder="For the jollof!"
                className="mt-1 w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none focus:border-ink"
              />
            </label>
            {balance !== null && n > balance && <p className="text-sm text-hit">You only have {short(balance)} coins.</p>}
            {error && <p className="act-pop rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">{error}</p>}
            <BigButton tone="green" onClick={() => void give()} disabled={!valid || busy}>
              <Send className="size-4" /> {busy ? "Sending…" : `Give ${valid ? short(n) : ""} coins`}
            </BigButton>
            <p className="text-center text-xs text-muted">Up to 10,000 at a time and 20,000 a day. Coins you give can&apos;t be taken back.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
