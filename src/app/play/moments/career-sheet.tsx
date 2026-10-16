"use client";

import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { cash } from "@/lib/world/value";
import { EMPIRE, VENTURE_KINDS, VENTURE_KIND_BY_ID, VENTURE_STAGES, capacity, ventureWords, type VentureKindId } from "@/lib/world/ventures";
import { Sheet } from "../sheet";
import { closeVenture, myCareer, startVenture, type Career } from "../venture-actions";

// My business (docs/LIFE_WHEEL.md, phase 5): start something of your own and watch it grow from Idea
// to Empire, or fail. Its numbers stay hidden; you see them in words, with what it has paid you and
// how its last month went. Its moments come two or three a week, wherever you are.

export function CareerSheet({ onClose }: { onClose: () => void }) {
  const [career, setCareer] = useState<Career | null | undefined>(undefined);
  const reload = () =>
    myCareer()
      .catch(() => null)
      .then(setCareer);
  useEffect(() => {
    void reload();
  }, []);
  const naira = (v: number) => cash(v / (career?.perMint ?? 1500));

  return (
    <Sheet onClose={onClose} above>
      <div className="sticky -top-5 z-10 -mr-2 -mt-2 flex h-0 justify-end">
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <h2 className="pr-10 font-display text-xl font-extrabold">My business</h2>
      {career === undefined && <div className="mt-4 h-48 animate-pulse rounded-2xl bg-ink/[0.05]" aria-label="Loading" />}
      {career === null && <p className="mt-4 text-sm text-muted">Sign in to start a business.</p>}
      {career?.missing && <p className="mt-4 text-sm text-muted">Businesses are switched on soon.</p>}
      {career && !career.missing && (
        <>
          {career.justClosed && (
            <p className="mt-3 rounded-2xl bg-hit/10 p-3 text-sm text-hit">
              Your business ran out of money for too long and has closed. You keep your home and everything it paid you. You can start again.
            </p>
          )}
          {career.open ? <Running career={career} naira={naira} onClosed={() => void reload()} /> : <Start career={career} naira={naira} onStarted={() => void reload()} />}
          {career.past.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Before</h3>
              <div className="grid gap-1.5">
                {career.past.map((p, i) => {
                  const k = VENTURE_KIND_BY_ID.get(p.kind);
                  return (
                    <div key={i} className="flex items-center gap-2.5 rounded-2xl bg-ink/[0.04] px-3 py-2 text-sm">
                      <span className="text-xl">{k?.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{p.name}</span>
                        <span className="block text-xs text-muted">
                          Reached {VENTURE_STAGES[p.best]?.name ?? "Idea"} · paid you {naira(p.paid)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}

function Start({ career, naira, onStarted }: { career: Career; naira: (v: number) => string; onStarted: () => void }) {
  const [kind, setKind] = useState<VentureKindId | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = kind ? VENTURE_KIND_BY_ID.get(kind)! : null;
  const afford = (start: number) => start / career.perMint <= career.canSpend + 0.005;

  async function start() {
    if (!kind || busy) return;
    setBusy(true);
    setError(null);
    const r = await startVenture(kind, name).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    window.dispatchEvent(new Event("nt-money-changed"));
    onStarted();
  }

  return (
    <section className="mt-2">
      <p className="text-sm text-ink/80">
        Start something of your own. It grows from Idea to Stall, Shop, Brand and Empire, if you choose well. It pays you every day it makes money. It can also fail.
      </p>
      <div className="mt-3 grid gap-1.5">
        {VENTURE_KINDS.map((k) => {
          const ok = afford(k.start);
          return (
            <button
              key={k.id}
              onClick={() => {
                setKind(k.id);
                if (!name) setName("");
              }}
              disabled={!ok}
              className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition disabled:opacity-45", kind === k.id ? "bg-gold/25 ring-2 ring-gold" : "bg-ink/[0.04] hover:bg-ink/[0.07]")}
            >
              <span className="text-2xl">{k.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{k.name}</span>
                <span className="block text-xs text-muted">{k.about}</span>
              </span>
              <span className="text-xs font-bold tabular-nums">{naira(k.start)}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="mt-3 rounded-2xl p-3 ring-1 ring-ink/10">
          <label htmlFor="venture-name" className="text-xs font-bold text-muted">
            Name your {picked.name.toLowerCase()}
          </label>
          <input
            id="venture-name"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder={`e.g. ${picked.id === "suya" ? "Mallam's Best Suya" : picked.id === "tech" ? "Gidi Apps" : "Royal " + picked.name}`}
            className="mt-1 h-11 w-full rounded-xl bg-ink/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-gold"
          />
          <button onClick={() => void start()} disabled={busy || name.trim().length < 2} className="mt-2 h-11 w-full rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Starting…" : `Start it for ${naira(picked.start)}`}
          </button>
          {error && <p className="mt-1.5 text-sm text-hit">{error}</p>}
        </div>
      )}
    </section>
  );
}

function Running({ career, naira, onClosed }: { career: Career; naira: (v: number) => string; onClosed: () => void }) {
  const o = career.open!;
  const v = o.venture;
  const k = VENTURE_KIND_BY_ID.get(v.kind)!;
  const words = ventureWords(v);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = v.days.slice(-30);
  const top = Math.max(1, ...days.map((d) => Math.abs(d)));
  const lastWeek = days.slice(-7).reduce((a, d) => a + d, 0);

  return (
    <section className="mt-2">
      <div className="flex items-center gap-3">
        <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-gold to-[#ffdf85] text-3xl">{k.emoji}</span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-extrabold">{v.name}</p>
          <p className="text-xs text-muted">
            {k.name}
            {v.share < 1 && ` · you own ${Math.round(v.share * 100)}%`}
          </p>
        </div>
      </div>

      {/* Idea → Stall → Shop → Brand → Empire */}
      <ol className="mt-3 grid grid-cols-5 gap-1" aria-label={`Stage: ${VENTURE_STAGES[v.stage].name}`}>
        {VENTURE_STAGES.map((st, i) => (
          <li key={st.name} className="text-center">
            <span className={cn("block h-1.5 rounded-full", i <= v.stage ? "bg-gold" : "bg-ink/10")} />
            <span className={cn("mt-1 block text-[10.5px]", i === v.stage ? "font-bold" : "text-muted")}>{st.name}</span>
          </li>
        ))}
      </ol>

      {o.crisis && <p className="mt-3 rounded-2xl bg-hit/10 p-3 text-sm font-semibold text-hit">The money has run out. Something has to give, and soon.</p>}
      {!o.crisis && o.ready && v.stage < EMPIRE && <p className="mt-3 rounded-2xl bg-[#12b886]/10 p-3 text-sm font-semibold text-[#0b7a5a]">Business is good: you could go bigger. The choice will come to you.</p>}
      {o.justPaid > 0 && <p className="mt-3 text-sm">Since you last looked, it paid you {naira(o.justPaid)}.</p>}

      <dl className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
        <div className="rounded-2xl bg-ink/[0.04] px-3 py-2">
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Customers</dt>
          <dd className="font-bold tabular-nums">
            {Math.round(v.customers).toLocaleString("en-GB")} <span className="text-xs font-normal text-muted">{k.customers}</span>
          </dd>
          <dd className="text-[11px] text-muted">Room for {capacity(v).toLocaleString("en-GB")}{v.customers > capacity(v) ? ": some turned away" : ""}</dd>
        </div>
        <div className="rounded-2xl bg-ink/[0.04] px-3 py-2">
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Its cash</dt>
          <dd className={cn("font-bold tabular-nums", v.cash < 0 && "text-hit")}>{v.cash < 0 ? `−${naira(-v.cash)}` : naira(v.cash)}</dd>
          <dd className="text-[11px] text-muted">Paid you {naira(v.paid)} in all</dd>
        </div>
        <div className="rounded-2xl bg-ink/[0.04] px-3 py-2">
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted">The work</dt>
          <dd className="text-[13px] font-semibold leading-snug">{words.quality}</dd>
        </div>
        <div className="rounded-2xl bg-ink/[0.04] px-3 py-2">
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Staff · {v.staff}</dt>
          <dd className="text-[13px] font-semibold leading-snug">{words.mood}</dd>
        </div>
      </dl>
      <p className="mt-1.5 text-xs text-muted">{words.risk}.</p>

      {days.length > 0 && (
        <section className="mt-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Last {days.length} day{days.length === 1 ? "" : "s"} · this week {lastWeek < 0 ? "lost" : "made"} {naira(Math.abs(lastWeek))}
          </h3>
          {/* Profit above the line, losses below it. */}
          <div className="relative mt-1.5 flex h-16 gap-[3px] border-ink/10 before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-ink/10" role="img" aria-label="Profit and loss each day">
            {days.map((d, i) => (
              <span key={i} className="relative h-full flex-1">
                <span
                  className={cn("absolute inset-x-0 rounded-sm", d >= 0 ? "bottom-1/2 bg-[#12b886]" : "top-1/2 bg-hit")}
                  style={{ height: `${Math.max(3, (Math.abs(d) / top) * 48)}%` }}
                />
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4">
        {!confirm ? (
          <button onClick={() => setConfirm(true)} className="text-xs font-semibold text-muted underline underline-offset-2">
            Close it down
          </button>
        ) : (
          <div className="rounded-2xl bg-hit/10 p-3 text-sm">
            <p className="font-semibold text-hit">Close {v.name} for good? You keep what it paid you; its cash goes with it.</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  setBusy(true);
                  await closeVenture().catch(() => null);
                  setBusy(false);
                  onClosed();
                }}
                disabled={busy}
                className="h-9 flex-1 rounded-full bg-hit text-sm font-semibold text-white disabled:opacity-50"
              >
                Close it
              </button>
              <button onClick={() => setConfirm(false)} className="h-9 flex-1 rounded-full bg-ink/10 text-sm font-semibold">
                Keep going
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
