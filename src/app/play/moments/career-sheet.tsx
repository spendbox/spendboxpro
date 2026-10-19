"use client";

import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { cash } from "@/lib/world/value";
import { EMPIRE, VENTURE_KINDS, VENTURE_KIND_BY_ID, VENTURE_STAGES, capacity, ventureWords, type VentureKindId } from "@/lib/world/ventures";
import { Sheet } from "../sheet";
import { closeVenture, myCareer, startVenture, type Career, type OpenBusiness } from "../venture-actions";

// My businesses (docs/LIFE_WHEEL.md, phase 5): start something of your own (several, if you like) and
// watch each grow from Idea to Empire, or fail. Each shows what it makes an hour; their numbers stay
// hidden otherwise, shown in words, with what each has paid you and how its last month went. Their
// moments come two or three a week, wherever you are. Before starting one, a tip: money runs out.

export function CareerSheet({ onClose }: { onClose: () => void }) {
  const [career, setCareer] = useState<Career | null | undefined>(undefined);
  /** What's showing: all of them, starting a new one, or one of them (its id). */
  const [view, setView] = useState<"list" | "start" | number>("list");
  const reload = () =>
    myCareer()
      .catch(() => null)
      .then(setCareer);
  useEffect(() => {
    void reload();
  }, []);
  const naira = (v: number) => cash(v / (career?.perMint ?? 1500));
  const open = career?.open ?? [];
  const one = typeof view === "number" ? open.find((b) => b.id === view) : undefined;
  const starting = view === "start" || (!open.length && !one);
  const room = career ? open.length < career.max : false;
  const perHour = open.reduce((t, b) => t + b.hourly.pay, 0);

  return (
    <Sheet onClose={onClose} above>
      <div className="sticky -top-5 z-10 -mr-2 -mt-2 flex h-0 justify-end">
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <h2 className="pr-10 font-display text-xl font-extrabold">{open.length > 1 ? "My businesses" : "My business"}</h2>
      {career === undefined && <div className="mt-4 h-48 animate-pulse rounded-2xl bg-ink/[0.05]" aria-label="Loading" />}
      {career === null && <p className="mt-4 text-sm text-muted">Sign in to start a business.</p>}
      {career?.missing && <p className="mt-4 text-sm text-muted">Businesses are switched on soon.</p>}
      {career && !career.missing && (
        <>
          {career.justClosed && (
            <p className="mt-3 rounded-2xl bg-hit/10 p-3 text-sm text-hit">
              One of your businesses ran out of money for too long and has closed. You keep your home and everything it paid you. You can start again.
            </p>
          )}
          {(one || (starting && open.length > 0)) && (
            <button onClick={() => setView("list")} className="mt-2 text-xs font-semibold text-muted underline underline-offset-2">
              ‹ All my businesses
            </button>
          )}
          {one ? (
            <Running biz={one} naira={naira} onClosed={() => {
                setView("list");
                void reload();
              }} />
          ) : starting ? (
            room ? (
              <Start career={career} naira={naira} onStarted={() => {
                  setView("list");
                  void reload();
                }} />
            ) : (
              <p className="mt-3 text-sm text-muted">You run {career.max} businesses, the most at once. Close one to start another.</p>
            )
          ) : (
            <section className="mt-2">
              <div className="rounded-2xl bg-[#12b886]/10 px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b7a5a]">All together</p>
                <p className="text-sm">
                  Earning you about <b className="tabular-nums">{naira(perHour)}</b> an hour
                  <span className="text-muted"> · {open.length} of {career.max} businesses</span>
                </p>
              </div>
              <div className="mt-2 grid gap-1.5">
                {open.map((b) => (
                  <BusinessRow key={b.id} biz={b} naira={naira} onOpen={() => setView(b.id)} />
                ))}
              </div>
              {room ? (
                <button onClick={() => setView("start")} className="mt-2.5 h-11 w-full rounded-full bg-ink text-sm font-semibold text-white">
                  Start another business
                </button>
              ) : (
                <p className="mt-2 text-xs text-muted">That&apos;s the most you can run at once. Close one to start another.</p>
              )}
            </section>
          )}
          {career.past.length > 0 && !one && (
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

/** What a business makes an hour, in words: "₦1,200/hr", or "−₦300/hr" when it's losing money. */
export function HourlyTag({ biz, naira }: { biz: OpenBusiness; naira: (v: number) => string }) {
  const losing = biz.hourly.profit < 0;
  return (
    <span className="shrink-0 text-right">
      <b className={cn("block text-sm tabular-nums", losing ? "text-hit" : "text-[#2b8a3e]")}>{losing ? `−${naira(-biz.hourly.profit)}` : naira(biz.hourly.pay)}</b>
      <span className="block text-[10px] text-muted">{losing ? "losing an hour" : "an hour"}</span>
    </span>
  );
}

function BusinessRow({ biz, naira, onOpen }: { biz: OpenBusiness; naira: (v: number) => string; onOpen: () => void }) {
  const v = biz.venture;
  const k = VENTURE_KIND_BY_ID.get(v.kind)!;
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5 text-left hover:bg-ink/[0.07]">
      <span className="text-2xl">{k.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{v.name}</span>
        <span className="block truncate text-xs text-muted">
          {k.name} · {VENTURE_STAGES[v.stage].name}
          {biz.crisis ? " · out of money" : ""}
        </span>
      </span>
      <HourlyTag biz={biz} naira={naira} />
    </button>
  );
}

function Start({ career, naira, onStarted }: { career: Career; naira: (v: number) => string; onStarted: () => void }) {
  const [kind, setKind] = useState<VentureKindId | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The tip before it starts: money isn't unlimited. */
  const [tip, setTip] = useState(false);
  const picked = kind ? VENTURE_KIND_BY_ID.get(kind)! : null;
  const afford = (start: number) => start / career.perMint <= career.canSpend + 0.005;

  async function start() {
    if (!kind || busy) return;
    setTip(false);
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
        {career.open.length ? "Start another one. " : "Start something of your own. "}
        It grows from Idea to Stall, Shop, Brand and Empire, if you choose well. It pays you every day it makes money. It can also fail.
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
          <button onClick={() => setTip(true)} disabled={busy || name.trim().length < 2} className="mt-2 h-11 w-full rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Starting…" : `Start it for ${naira(picked.start)}`}
          </button>
          {error && <p className="mt-1.5 text-sm text-hit">{error}</p>}
        </div>
      )}
      {tip && picked && (
        <Sheet onClose={() => setTip(false)} centred title="Tip: money isn't unlimited">
          <p className="text-3xl" aria-hidden>
            💡
          </p>
          <p className="mt-1.5 text-sm">
            Starting {name.trim() || `your ${picked.name.toLowerCase()}`} costs <b>{naira(picked.start)}</b>, taken from your money now. You&apos;d have about{" "}
            <b>{cash(Math.max(0, career.canSpend - picked.start / career.perMint))}</b> left.
          </p>
          <ul className="mt-2 grid list-disc gap-1 pl-4 text-xs leading-snug text-ink/80">
            <li>A business can lose money, and close if its cash runs out. What you put in doesn&apos;t come back.</li>
            <li>Keep enough for food, rent and bills.</li>
            <li>Each business you run is its own cost and its own risk. Grow one before you open the next.</li>
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setTip(false)} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
              Not now
            </button>
            <button onClick={() => void start()} className="h-11 rounded-full bg-ink text-sm font-semibold text-white">
              Start it
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function Running({ biz: o, naira, onClosed }: { biz: OpenBusiness; naira: (v: number) => string; onClosed: () => void }) {
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

      {/* What it makes an hour, as it is now. */}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5">
        <span className="min-w-0 text-sm">
          <b className="block">{o.hourly.profit < 0 ? "Losing money" : "Earning you"}</b>
          <span className="block text-xs text-muted">On an ordinary day, as it is now</span>
        </span>
        <HourlyTag biz={o} naira={naira} />
      </div>

      {/* Where it's going: what the next stage needs, and when things happen. */}
      <section className="mt-3 rounded-2xl p-3 ring-1 ring-ink/10">
        {o.next ? (
          <>
            <p className="text-sm font-bold">To grow into a {o.next.name}</p>
            <Bar label={k.customers.replace(/ a (day|night)$/, "")} now={o.next.customers.now} need={o.next.customers.need} show={(x) => x.toLocaleString("en-GB")} />
            <Bar label="Its cash" now={o.next.cash.now} need={o.next.cash.need} show={naira} />
            <p className="mt-1.5 text-xs text-muted">When both are full, the choice to grow comes to you as a moment, wherever you are.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold">An Empire</p>
            <p className="mt-0.5 text-xs text-muted">There&apos;s no ceiling now: it can keep growing for ever, just more slowly the bigger it gets.</p>
          </>
        )}
        <ul className="mt-2.5 grid gap-1 text-xs">
          <li className="flex justify-between gap-2">
            <span className="text-muted">Next day of business</span>
            <span className="font-semibold">{inWords(o.nextDayAt)}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-muted">Your next decision for it</span>
            <span className="font-semibold">{inWords(o.nextMomentAt)}</span>
          </li>
        </ul>
      </section>

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

      <Decisions decisions={o.decisions} />
      <HowToGrow />

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
                  await closeVenture(o.id).catch(() => null);
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

/** When something happens, from now: "in 5 hours", "tomorrow", "any time now". */
function inWords(at: string) {
  const h = (Date.parse(at) - Date.now()) / 3_600_000;
  if (h <= 0.25) return "any time now";
  if (h < 1) return `in ${Math.max(1, Math.round(h * 60))} minutes`;
  if (h < 20) return `in about ${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`;
  if (h < 36) return "tomorrow";
  return `in about ${Math.round(h / 24)} days`;
}

function Bar({ label, now, need, show }: { label: string; now: number; need: number; show: (v: number) => string }) {
  const pct = Math.max(0, Math.min(100, (now / Math.max(1, need)) * 100));
  return (
    <div className="mt-2">
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-semibold capitalize">{label}</span>
        <span className="tabular-nums text-muted">
          {show(Math.max(0, now))} of {show(need)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-[#12b886]" : "bg-gold")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Decisions({ decisions }: { decisions: OpenBusiness["decisions"] }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Your decisions</h3>
      {decisions.length === 0 ? (
        <p className="text-xs text-muted">None yet. Your first decision for it comes within a few hours, as a moment, wherever you are in the city. What you choose is what grows it, or sinks it.</p>
      ) : (
        <ul className="grid gap-1.5">
          {decisions.map((d, i) => (
            <li key={i} className="rounded-2xl bg-ink/[0.04] px-3 py-2">
              <p className="text-sm font-bold">
                {d.emoji} {d.title}
              </p>
              <p className="text-xs">You chose: {d.chose}</p>
              {d.text && <p className="text-xs text-muted">{d.text}</p>}
              {d.did.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {d.did.map((w) => (
                    <span key={w} className="rounded-full bg-panel px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-ink/10">
                      {w}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HowToGrow() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 rounded-2xl bg-gold/10 p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-sm font-bold" aria-expanded={open}>
        How to grow it
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="mt-2 grid list-disc gap-1.5 pl-4 text-xs leading-snug">
          <li>It grows from your decisions. Two or three times a week a business moment comes to you: a supplier, a worker, a rival, an offer. There&apos;s no button to press; choosing well is how it grows.</li>
          <li>Good work brings customers by word of mouth. Cutting corners saves money today and loses customers slowly.</li>
          <li>Happy staff keep the work good. When customers are being turned away, you need more hands: hiring comes as a choice too.</li>
          <li>Risky choices make trouble likelier: thefts, fines, bad luck.</li>
          <li>To reach the next stage it needs both: enough customers and enough of its own cash. Then the choice to grow comes to you.</li>
          <li>Every day it makes money, you&apos;re paid your share. It keeps working while you&apos;re away, for up to a week.</li>
          <li>If its cash runs out, a crisis comes. Get through it, or it closes. You never lose your home.</li>
        </ul>
      )}
    </section>
  );
}
