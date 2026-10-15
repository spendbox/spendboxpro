"use client";

import { cash, cashSymbol, fromShown, tidy, toShown } from "@/lib/world/value";
import { announceGiftSent } from "../people/gift-pop";
import { rememberPerson } from "../people/recent-rail";
import { useEffect, useState } from "react";
import { Check, Gift, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { giveCoins, myCoinBalance } from "../gift-actions";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";
import { questEvent } from "./quest-store";
import { ActivityStyles, BigButton, Confetti, Face, GameHeader } from "./ui";

// Give money to another player: any amount you have, with an optional note. No limit, except for
// brand-new accounts (game-db/107). The server checks and tells the receiver.

// Quick amounts (mint): ₦15k, ₦75k, ₦150k, ₦750k, ₦1.5m and ₦15m in naira.
const PRESETS = [10, 50, 100, 500, 1000, 10_000];

/** A quick amount's short label: "₦15k", "₦1.5m". */
function chip(mint: number) {
  const v = tidy(toShown(mint));
  return v >= 1000 && v < 1e6 ? `${cashSymbol()}${+(v / 1000).toFixed(1)}k` : cash(mint);
}

/**
 * local: on the real map, amounts are typed in the player's own currency (naira in Lagos) and sent
 * as whole mint; elsewhere they're typed in mint.
 */
export function GiveCoinsSheet({ to, onClose, local }: { to: { id: string; name: string; avatar: unknown }; onClose: () => void; local?: boolean }) {
  const [amount, setAmount] = useState(() => (local ? String(Math.round(toShown(50))) : "50"));
  const [note, setNote] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ amount: number; leftToday: number | null } | null>(null);

  useEffect(() => {
    let live = true;
    void myCoinBalance().then((r) => live && r.ok && setBalance(r.coins));
    return () => {
      live = false;
    };
  }, []);

  // What's sent: whole mint (typed in your currency on the real map).
  const typed = Number(amount);
  const n = local ? Math.round(fromShown(typed)) : Math.floor(typed);
  const valid = Number.isInteger(n) && Number.isSafeInteger(n) && n >= 1 && (balance === null || n <= balance);

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
    announceGiftSent(res.to, `${cash(res.amount)}`);
    rememberPerson({ id: to.id, name: res.to }, "Gave money");
    questEvent({ type: "gift", amount: res.amount });
    playSfx("found");
  }

  return (
    <Sheet onClose={onClose}>
      <ActivityStyles />
      <div className="relative space-y-5">
        <GameHeader icon={Gift} title="Give money" sub={balance === null ? "" : `You have ${cash(balance)}`} onClose={onClose} color="#12a37a" />
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
              Sent {cash(sent.amount)} to {to.name}!
            </p>
            <p className="text-sm text-muted">
              They&apos;ll get a notification.{sent.leftToday != null && ` As a new player, you can give ${short(sent.leftToday)} more today.`}
            </p>
            <BigButton onClick={onClose}>Done</BigButton>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(String(local ? Math.round(toShown(p)) : p))}
                  className={cn(
                    "h-11 rounded-xl text-sm font-bold whitespace-nowrap transition-colors",
                    n === p ? "bg-gold text-ink shadow-sm" : "bg-panel-2 text-muted hover:text-ink",
                  )}
                >
                  {chip(p)}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">Or type an amount</span>
                {valid && <span className="truncate text-sm text-muted">{cash(n, { full: true })}</span>}
              </span>
              <span className="mt-1.5 flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 focus-within:border-ink">
                <span className="text-lg font-bold text-muted">{local ? cashSymbol() : "₥"}</span>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 15))}
                  className="min-w-0 flex-1 bg-transparent py-3 text-lg font-bold outline-none"
                  aria-label="How much to give"
                />
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Add a note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 80))}
                placeholder="For the jollof!"
                className="mt-1.5 w-full rounded-2xl border border-line bg-panel px-4 py-3 outline-none focus:border-ink"
              />
            </label>
            {balance !== null && n > balance && <p className="text-sm text-hit">You only have {cash(balance)}.</p>}
            {error && <p className="act-pop rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">{error}</p>}
            <BigButton tone="green" onClick={() => void give()} disabled={!valid || busy}>
              <Send className="size-4" /> {busy ? "Sending…" : `Give ${valid ? cash(n) : ""}`}
            </BigButton>
            <p className="text-center text-xs text-muted">
              Money you give can&apos;t be taken back.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
