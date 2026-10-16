"use client";

import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { AUTHOR_REWARD, WRITE_SPOTS, checkDraft, emptyDraft, type Draft, type DraftOutcome, type WriteAsk } from "@/lib/world/written";
import { Sheet } from "../sheet";
import { draftsToVote, myDrafts, submitDraft, voteDraft, type DraftRow } from "../written-actions";

// Write a moment (docs/LIFE_WHEEL.md, phase 7): anyone can write one. What happens, two to four
// answers and what each can lead to; it's checked as you type, other players vote on it, and the
// owner approves it. Then it comes to everyone, with your name on it, and you're paid.

type Tab = "write" | "vote" | "mine";

const ASKS: { id: WriteAsk; label: string }[] = [
  { id: "none", label: "No money" },
  { id: "small", label: "A little (₦500 to ₦3,000)" },
  { id: "medium", label: "Some (₦2,000 to ₦15,000)" },
  { id: "big", label: "A lot (₦10,000 to ₦50,000)" },
];
const MONEY = [
  { v: -2, label: "Pays twice the amount" },
  { v: -1, label: "Pays the amount" },
  { v: -0.5, label: "Pays half" },
  { v: 0, label: "No money" },
  { v: 0.5, label: "Gets half" },
  { v: 1, label: "Gets the amount" },
  { v: 2, label: "Gets twice the amount" },
];
const CHANCE = [
  { v: 3, label: "Usually" },
  { v: 2, label: "Sometimes" },
  { v: 1, label: "Now and then" },
];
const field = "w-full rounded-xl bg-ink/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-gold";

export function WriteSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("write");
  return (
    <Sheet onClose={onClose} above>
      <div className="sticky -top-5 z-10 -mr-2 -mt-2 flex h-0 justify-end">
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <h2 className="pr-10 font-display text-xl font-extrabold">Write a moment</h2>
      <div className="mt-2 grid grid-cols-3 gap-1" role="tablist">
        {(
          [
            ["write", "Write"],
            ["vote", "Vote"],
            ["mine", "Mine"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("h-9 rounded-full text-sm font-semibold", tab === id ? "bg-ink text-white" : "bg-ink/[0.05]")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "write" && <Write onSent={() => setTab("mine")} />}
      {tab === "vote" && <Vote />}
      {tab === "mine" && <Mine />}
    </Sheet>
  );
}

function Write({ onSent }: { onSent: () => void }) {
  const [d, setD] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [sendErrors, setSendErrors] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const problems = checkDraft(d);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setChoice = (i: number, f: (c: Draft["choices"][number]) => Draft["choices"][number]) => setD((x) => ({ ...x, choices: x.choices.map((c, j) => (j === i ? f(c) : c)) }));
  const setOutcome = (i: number, k: number, p: Partial<DraftOutcome>) => setChoice(i, (c) => ({ ...c, outcomes: c.outcomes.map((o, j) => (j === k ? { ...o, ...p } : o)) }));

  async function send() {
    setTouched(true);
    if (problems.length || busy) return;
    setBusy(true);
    const r = await submitDraft(d).catch(() => ({ ok: false as const, errors: ["The connection blinked. Try again."] }));
    setBusy(false);
    if (!r.ok) return setSendErrors(r.errors);
    setD(emptyDraft());
    setTouched(false);
    onSent();
  }

  return (
    <section className="mt-3 grid gap-3">
      <p className="text-sm text-ink/80">
        Write something that could happen to anyone in the city. Make it hard to choose: every answer should cost something and give something. Use {"{name}"} for a person&apos;s name and {"{ask}"} for the amount. If players like it and it&apos;s approved, it comes to everyone with your name on it, and you get ₦{AUTHOR_REWARD.toLocaleString("en-GB")}.
      </p>
      <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Emoji
          <input id="write-emoji" value={d.emoji} onChange={(e) => set({ emoji: e.target.value.slice(0, 8) })} className={cn(field, "h-11 text-center text-xl")} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Title
          <input id="write-title" value={d.title} onChange={(e) => set({ title: e.target.value.slice(0, 40) })} placeholder="e.g. The landlord's son" className={cn(field, "h-11")} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Where
          <select id="write-spot" value={d.spot} onChange={(e) => set({ spot: e.target.value as Draft["spot"] })} className={cn(field, "h-11")}>
            {WRITE_SPOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Money in it
          <select id="write-ask" value={d.ask} onChange={(e) => set({ ask: e.target.value as WriteAsk })} className={cn(field, "h-11")}>
            {ASKS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-bold text-muted">
        What happens
        <textarea id="write-text" value={d.text} onChange={(e) => set({ text: e.target.value.slice(0, 320) })} rows={3} placeholder="e.g. {name}, your landlord's son, crashes into your parked car and begs you not to tell his father." className={cn(field, "py-2")} />
      </label>

      {d.choices.map((c, i) => (
        <div key={i} className="rounded-2xl p-3 ring-1 ring-ink/10">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-muted">Answer {i + 1}</p>
            {d.choices.length > 2 && (
              <button onClick={() => setD((x) => ({ ...x, choices: x.choices.filter((_, j) => j !== i) }))} className="text-xs font-semibold text-hit">
                Remove
              </button>
            )}
          </div>
          <input id={`write-choice-${i}`} value={c.label} onChange={(e) => setChoice(i, (x) => ({ ...x, label: e.target.value.slice(0, 60) }))} placeholder="What you do" className={cn(field, "mt-1 h-10")} />
          {c.outcomes.map((o, k) => (
            <div key={k} className="mt-2 rounded-xl bg-ink/[0.03] p-2">
              <textarea id={`write-out-${i}-${k}`} value={o.text} onChange={(e) => setOutcome(i, k, { text: e.target.value.slice(0, 220) })} rows={2} placeholder="What happens then" className={cn(field, "bg-panel py-1.5")} />
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                <select aria-label="Money" value={o.money} onChange={(e) => setOutcome(i, k, { money: Number(e.target.value) })} className={cn(field, "h-9 bg-panel px-2 text-xs")}>
                  {MONEY.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select aria-label="Reputation" value={o.rep} onChange={(e) => setOutcome(i, k, { rep: Number(e.target.value) })} className={cn(field, "h-9 bg-panel px-2 text-xs")}>
                  {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
                    <option key={v} value={v}>
                      {v > 0 ? `+${v}` : v} reputation
                    </option>
                  ))}
                </select>
                <select aria-label="How likely" value={o.chance} onChange={(e) => setOutcome(i, k, { chance: Number(e.target.value) })} className={cn(field, "h-9 bg-panel px-2 text-xs")}>
                  {CHANCE.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {c.outcomes.length > 1 && (
                <button onClick={() => setChoice(i, (x) => ({ ...x, outcomes: x.outcomes.filter((_, j) => j !== k) }))} className="mt-1 text-[11px] font-semibold text-hit">
                  Remove this
                </button>
              )}
            </div>
          ))}
          {c.outcomes.length < 3 && (
            <button onClick={() => setChoice(i, (x) => ({ ...x, outcomes: [...x.outcomes, { text: "", money: 0, rep: 0, chance: 1 }] }))} className="mt-2 text-xs font-semibold text-gold-dark">
              + Something else that could happen
            </button>
          )}
        </div>
      ))}
      {d.choices.length < 4 && (
        <button onClick={() => setD((x) => ({ ...x, choices: [...x.choices, { label: "", outcomes: [{ text: "", money: 0, rep: 0, chance: 1 }] }] }))} className="h-10 rounded-full bg-ink/[0.05] text-sm font-semibold">
          + Another answer
        </button>
      )}
      {touched && problems.length > 0 && (
        <ul className="grid gap-0.5 rounded-2xl bg-hit/10 p-3 text-xs text-hit">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {sendErrors.length > 0 && <p className="text-sm text-hit">{sendErrors.join(" ")}</p>}
      <button onClick={() => void send()} disabled={busy} className="h-11 rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Sending…" : "Send it in for votes"}
      </button>
    </section>
  );
}

/** A draft, as people read it before voting. */
function DraftView({ d }: { d: Draft }) {
  const money = (v: number) => (v < 0 ? `pays ${v === -1 ? "" : `${-v}× `}` : v > 0 ? `gets ${v === 1 ? "" : `${v}× `}` : "");
  return (
    <div>
      <p className="font-display text-base font-extrabold">
        {d.emoji} {d.title}
      </p>
      <p className="mt-0.5 text-sm leading-snug text-ink/80">{d.text}</p>
      <ul className="mt-2 grid gap-1.5">
        {d.choices.map((c, i) => (
          <li key={i} className="rounded-xl bg-ink/[0.04] px-2.5 py-1.5 text-sm">
            <span className="font-semibold">{c.label}</span>
            {c.outcomes.map((o, k) => (
              <span key={k} className="mt-0.5 block text-xs text-muted">
                → {o.text}
                {(o.money !== 0 || o.rep !== 0) && (
                  <span className="ml-1 font-semibold">
                    ({[o.money ? `${money(o.money)}the amount` : "", o.rep ? `${o.rep > 0 ? "+" : ""}${o.rep} reputation` : ""].filter(Boolean).join(", ")})
                  </span>
                )}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Vote() {
  const [rows, setRows] = useState<DraftRow[] | null | undefined>(undefined);
  useEffect(() => {
    void draftsToVote()
      .catch(() => null)
      .then(setRows);
  }, []);
  if (rows === undefined) return <div className="mt-3 h-40 animate-pulse rounded-2xl bg-ink/[0.05]" />;
  if (rows === null) return <p className="mt-3 text-sm text-muted">Writing moments is switched on soon.</p>;
  if (!rows.length) return <p className="mt-3 text-sm text-muted">Nothing to vote on right now. Come back later, or write one yourself.</p>;
  return (
    <section className="mt-3 grid gap-3">
      <p className="text-xs text-muted">Would this make a good moment? Hard to choose, fair, and fun? Your vote helps the owner decide.</p>
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl p-3 ring-1 ring-ink/10">
          <DraftView d={r.draft} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                [1, "👍🏾 Good one"],
                [-1, "👎🏾 Not for me"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setRows((x) => (x ?? []).filter((y) => y.id !== r.id));
                  void voteDraft(r.id, v);
                }}
                className={cn("h-10 rounded-full text-sm font-semibold", v === 1 ? "bg-[#12b886]/15 text-[#0b7a5a]" : "bg-ink/[0.06]")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

const STATUS: Record<DraftRow["status"], string> = { voting: "Waiting for votes", approved: "In the game", rejected: "Not this time", retired: "Taken out" };

function Mine() {
  const [rows, setRows] = useState<DraftRow[] | null | undefined>(undefined);
  useEffect(() => {
    void myDrafts()
      .catch(() => null)
      .then(setRows);
  }, []);
  if (rows === undefined) return <div className="mt-3 h-40 animate-pulse rounded-2xl bg-ink/[0.05]" />;
  if (rows === null) return <p className="mt-3 text-sm text-muted">Writing moments is switched on soon.</p>;
  if (!rows.length) return <p className="mt-3 text-sm text-muted">You haven&apos;t written one yet.</p>;
  return (
    <section className="mt-3 grid gap-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl p-3 ring-1 ring-ink/10">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 font-bold", r.status === "approved" ? "bg-[#12b886]/15 text-[#0b7a5a]" : r.status === "voting" ? "bg-gold/25" : "bg-ink/[0.06]")}>{STATUS[r.status]}</span>
            <span className="text-muted">
              👍🏾 {r.up} · 👎🏾 {r.down}
            </span>
          </div>
          <DraftView d={r.draft} />
          {r.note && <p className="mt-1.5 text-xs text-muted">From the owner: {r.note}</p>}
        </div>
      ))}
    </section>
  );
}
