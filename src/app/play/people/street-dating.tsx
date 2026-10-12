"use client";

import { useEffect, useState } from "react";
import { Hand, Heart, HeartCrack, Swords, Zap } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { BRIBE, DATE_ACTS, dateAct, PICK_FINE, PRANKS } from "@/lib/world/street";
import { cash } from "@/lib/world/value";
import { mintOf } from "@/lib/world/items";
import type { Prices } from "@/lib/world/region";
import { myRivals, prankDoor, setRival, stealFrom, bribeOut, type Rival } from "../street-actions";
import { answerDate, askDate, datingMine, datingWith, endDating, setDating, withdrawDate, type DatingMine, type DatingWith } from "../dating-actions";
import { Sheet } from "../sheet";

// The street and dating on someone's card, and their own screens on your phone (docs/STREET.md,
// docs/DATING.md).

type Done = (text: string, ok: boolean) => void;

/** On someone's card: prank their door, pick their pocket (two taps: the risk first), make them your rival. */
export function StreetRow({ id, name, hasHome, prices, onDone }: { id: string; name: string; hasHome: boolean; prices: Prices | null; onDone: Done }) {
  const [open, setOpen] = useState<"prank" | null>(null);
  /** A note left with the prank (optional): they read it when they come home to it. */
  const [prankNote, setPrankNote] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rival, setRivalState] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void myRivals().then((list) => alive && setRivalState(list.some((r) => r.id === id && r.named)));
    return () => {
      alive = false;
    };
  }, [id]);
  const go = async (fn: () => Promise<{ ok: boolean; error?: string; text?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    onDone(r.ok ? (r.text ?? "Done.") : (r.error ?? "That didn't work."), r.ok);
    return r.ok;
  };
  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2">
        {hasHome && (
          <button onClick={() => setOpen(open === "prank" ? null : "prank")} className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-semibold ${open === "prank" ? "bg-ink text-white" : "bg-ink/[0.05]"}`}>
            <Zap className="size-5" /> Prank
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (!sure) return setSure(true);
            setSure(false);
            void go(() => stealFrom(id));
          }}
          className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-semibold disabled:opacity-40 ${sure ? "bg-hit text-white" : "bg-ink/[0.05]"}`}
        >
          <Hand className="size-5" /> {sure ? "Sure? Tap again" : "Steal"}
        </button>
        <button
          disabled={busy || rival === null}
          onClick={() => void go(() => setRival(id, !rival)).then((ok) => ok && setRivalState(!rival))}
          className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-semibold disabled:opacity-40 ${rival ? "bg-[#e8590c] text-white" : "bg-ink/[0.05]"}`}
        >
          <Swords className="size-5" /> {rival ? "Rivals" : "Rival"}
        </button>
      </div>
      {sure && (
        <p className="mt-1.5 rounded-xl bg-hit/10 px-3 py-2 text-[11px] text-hit">
          Pick {name}&apos;s pocket? About 1 in 3 get caught (more if they&apos;re around): a fine of {prices ? cash(mintOf(PICK_FINE, prices)) : "₦30,000"}, reputation lost, they&apos;ll know it was you, and sometimes 2 hours in jail. Get away with it and you still lose a little reputation: people talk.
        </p>
      )}
      {open === "prank" && (
        <input
          value={prankNote}
          onChange={(e) => setPrankNote(e.target.value)}
          maxLength={140}
          placeholder={`Leave ${name} a note with it (optional)`}
          className="mt-2 h-10 w-full rounded-xl bg-ink/[0.05] px-3 text-base outline-none ring-gold focus:ring-2 sm:text-sm"
        />
      )}
      {open === "prank" && (
        <ul className="mt-2 grid grid-cols-2 gap-1.5">
          {PRANKS.map((p) => (
            <li key={p.id}>
              <button
                disabled={busy}
                onClick={() =>
                  void go(() => prankDoor(id, p.id, prankNote)).then((ok) => {
                    if (!ok) return;
                    setOpen(null);
                    setPrankNote("");
                  })
                }
                className="flex w-full items-center gap-2 rounded-xl bg-ink/[0.05] px-2.5 py-2 text-left text-xs disabled:opacity-40"
              >
                <span className="text-lg">{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{p.label}</b>
                  <span className="text-muted">{prices ? cash(mintOf(p.price, prices)) : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** On someone's card: dating, only when they're open to it, and every step asked and answered. */
export function DatingRow({ id, name, onDone, onOpenDating }: { id: string; name: string; onDone: Done; onOpenDating: () => void }) {
  const [w, setW] = useState<DatingWith | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const load = () => void datingWith(id).then(setW);
  useEffect(() => {
    let alive = true;
    void datingWith(id).then((d) => alive && setW(d));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!w || !w.open) return null;
  const go = async (fn: () => Promise<{ ok: boolean; error?: string; text?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    onDone(r.ok ? (r.text ?? "Done.") : (r.error ?? "That didn't work."), r.ok);
    load();
  };
  return (
    <div className="mt-3 rounded-2xl bg-[#d6336c]/[0.07] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#d6336c]">
        <Heart className="size-3.5" /> {w.together ? `You and ${name}` : `${name} is open to dating`}
      </p>
      {w.about && <p className="mt-1 text-sm">&ldquo;{w.about}&rdquo;</p>}
      {w.theyAsked && (
        <div className="mt-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm">
            {name} {dateAct(w.theyAsked.act)?.ask}.
          </span>
          <button disabled={busy} onClick={() => void go(() => answerDate(w.theyAsked!.id, true))} className="h-8 rounded-full bg-[#d6336c] px-3 text-xs font-semibold text-white disabled:opacity-40">
            Yes
          </button>
          <button disabled={busy} onClick={() => void go(() => answerDate(w.theyAsked!.id, false))} className="h-8 rounded-full bg-ink/10 px-3 text-xs font-semibold disabled:opacity-40">
            Not now
          </button>
        </div>
      )}
      {!w.meOpen ? (
        <button onClick={onOpenDating} className="mt-2 text-xs font-semibold text-[#d6336c]">
          Switch on dating to ask them out →
        </button>
      ) : w.waiting ? (
        <p className="mt-2 text-xs text-muted">You asked ({dateAct(w.waiting)?.label.toLowerCase()}). Waiting for {name} to answer.</p>
      ) : w.together ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {DATE_ACTS.filter((a) => a.act !== "date").map((a) => (
            <button key={a.act} disabled={busy} onClick={() => void go(() => askDate(id, a.act))} className="h-9 rounded-full bg-panel text-xs font-semibold ring-1 ring-[#d6336c]/20 disabled:opacity-40">
              {a.label}
            </button>
          ))}
          <p className="col-span-2 text-[11px] text-muted">Each one is a question: nothing happens unless {name} says yes.</p>
        </div>
      ) : w.taken ? (
        <p className="mt-2 text-xs text-muted">{name} is with someone right now.</p>
      ) : w.meTaken ? (
        <p className="mt-2 text-xs text-muted">You&apos;re with someone right now.</p>
      ) : (
        <div className="mt-2 flex gap-1.5">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Where to? (optional)" className="h-9 min-w-0 flex-1 rounded-full bg-panel px-3 text-base outline-none ring-1 ring-ink/10 sm:text-xs" />
          <button disabled={busy} onClick={() => void go(() => askDate(id, "date", note))} className="h-9 shrink-0 rounded-full bg-[#d6336c] px-3 text-xs font-semibold text-white disabled:opacity-40">
            Ask on a date
          </button>
        </div>
      )}
    </div>
  );
}

/** Dating on your phone: open to dating or not, a line about you, who's asked you, your partner. */
export function DatingSheet({ onClose, onPerson, onDone }: { onClose: () => void; onPerson: (id: string) => void; onDone: Done }) {
  const [me, setMe] = useState<DatingMine | null>(null);
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const load = () =>
    void datingMine().then((d) => {
      setMe(d);
      if (d) setAbout(d.about ?? "");
    });
  useEffect(() => {
    let alive = true;
    void datingMine().then((d) => {
      if (!alive) return;
      setMe(d);
      if (d) setAbout(d.about ?? "");
    });
    return () => {
      alive = false;
    };
  }, []);
  const go = async (fn: () => Promise<{ ok: boolean; error?: string; text?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    onDone(r.ok ? (r.text ?? "Done.") : (r.error ?? "That didn't work."), r.ok);
    load();
  };
  return (
    <Sheet onClose={onClose} title="Dating">
      {!me ? (
        <div className="h-32 animate-pulse rounded-2xl bg-ink/5" />
      ) : (
        <>
          <p className="text-xs text-muted">For adults, and only with a yes. Every step (a date, a hug, a kiss, more) is asked and answered, and either of you can end it any time.</p>
          <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3">
            <span className="text-sm font-semibold">Open to dating</span>
            <input type="checkbox" checked={me.open} disabled={busy} onChange={(e) => void go(() => setDating(e.target.checked, about, me.public))} className="size-5 accent-[#d6336c]" />
          </label>
          {me.open && (
            <>
              <div className="mt-2 flex gap-1.5">
                <input value={about} onChange={(e) => setAbout(e.target.value)} maxLength={140} placeholder="A line about you (shown on your card)" className="h-10 min-w-0 flex-1 rounded-full bg-ink/5 px-4 text-base outline-none sm:text-sm" />
                <button disabled={busy || about === (me.about ?? "")} onClick={() => void go(() => setDating(true, about, me.public))} className="h-10 shrink-0 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40">
                  Save
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={me.public} disabled={busy} onChange={(e) => void go(() => setDating(true, about, e.target.checked))} className="accent-[#d6336c]" />
                The gossip column can mention my dates and break-ups
              </label>
            </>
          )}

          {me.partner && (
            <div className="mt-4 rounded-2xl bg-[#d6336c]/[0.07] p-3">
              <button onClick={() => onPerson(me.partner!.id)} className="flex w-full items-center gap-3 text-left">
                <AvatarFace avatar={cleanAvatar(me.partner.avatar, me.partner.name)} size={40} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{me.partner.name}</b>
                  <span className="text-xs text-muted">Together since {new Date(me.partner.since).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · tap for a hug, a kiss…</span>
                </span>
                <Heart className="size-5 fill-[#d6336c] text-[#d6336c]" />
              </button>
              {ending ? (
                <div className="mt-2 flex gap-1.5">
                  <button disabled={busy} onClick={() => void go(() => endDating()).then(() => setEnding(false))} className="h-9 flex-1 rounded-full bg-hit text-xs font-semibold text-white">
                    End it
                  </button>
                  <button onClick={() => setEnding(false)} className="h-9 flex-1 rounded-full bg-ink/10 text-xs font-semibold">
                    Keep going
                  </button>
                </div>
              ) : (
                <button onClick={() => setEnding(true)} className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted">
                  <HeartCrack className="size-3.5" /> End things
                </button>
              )}
            </div>
          )}

          <p className="mt-4 text-sm font-semibold">Asked you</p>
          {me.asked.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Nothing waiting.{me.open ? " Tap someone on the map who's open to dating to ask them out." : ""}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {me.asked.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-2xl bg-ink/[0.04] p-2.5">
                  <button onClick={() => onPerson(a.from)} className="shrink-0">
                    <AvatarFace avatar={cleanAvatar(a.fromAvatar, a.fromName)} size={34} />
                  </button>
                  <span className="min-w-0 flex-1 text-sm">
                    <b>{a.fromName}</b> {dateAct(a.act)?.ask}
                    {a.note && <span className="block text-xs text-muted">&ldquo;{a.note}&rdquo;</span>}
                  </span>
                  <button disabled={busy} onClick={() => void go(() => answerDate(a.id, true))} className="h-8 rounded-full bg-[#d6336c] px-3 text-xs font-semibold text-white disabled:opacity-40">
                    Yes
                  </button>
                  <button disabled={busy} onClick={() => void go(() => answerDate(a.id, false))} className="h-8 rounded-full bg-ink/10 px-2.5 text-xs font-semibold disabled:opacity-40">
                    No
                  </button>
                </li>
              ))}
            </ul>
          )}
          {me.sent.some((s) => s.status === "asked") && (
            <>
              <p className="mt-4 text-sm font-semibold">You asked</p>
              <ul className="mt-2 space-y-1.5">
                {me.sent
                  .filter((s) => s.status === "asked")
                  .map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {dateAct(s.act)?.label} · <b>{s.toName}</b>
                      </span>
                      <button disabled={busy} onClick={() => void go(() => withdrawDate(s.id))} className="text-xs font-semibold text-muted">
                        Take back
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Your rivals and the score this month (pranks and pockets, each way). */
export function RivalsSheet({ onClose, onPerson }: { onClose: () => void; onPerson: (id: string) => void }) {
  const [list, setList] = useState<Rival[] | null>(null);
  useEffect(() => {
    let alive = true;
    void myRivals().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Sheet onClose={onClose} title="Rivals">
      <p className="text-xs text-muted">Name a rival from their card. Pranks and picked pockets this month count towards the score.</p>
      {!list ? (
        <div className="mt-3 h-24 animate-pulse rounded-2xl bg-ink/5" />
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No rivals yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <button onClick={() => onPerson(r.id)} className="flex w-full items-center gap-3 rounded-2xl bg-ink/[0.04] p-2.5 text-left">
                <AvatarFace avatar={cleanAvatar(r.avatar, r.name)} size={36} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{r.name}</b>
                  <span className="text-[11px] text-muted">{r.named && r.namedMe ? "Rivals, both ways" : r.named ? "Not named you back yet" : "Named you their rival: name them back from their card"}</span>
                </span>
                <span className="font-display text-lg font-extrabold tabular-nums">
                  <span className={r.mine >= r.theirs ? "text-me" : ""}>{r.mine}</span>
                  <span className="text-muted"> – </span>
                  <span className={r.theirs > r.mine ? "text-hit" : ""}>{r.theirs}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** In jail: when you're out, and a bribe that might get you out sooner. */
export function JailBanner({ until, prices, onDone, onFree }: { until: string; prices: Prices; onDone: Done; onFree: () => void }) {
  const [busy, setBusy] = useState(false);
  const left = Math.max(0, Date.parse(until) - Date.now());
  return (
    <div className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl bg-[#343a40] px-3 py-2 text-white shadow-lg">
      <span className="text-lg" aria-hidden>
        🚔
      </span>
      <span className="min-w-0 flex-1 text-xs leading-snug">
        <b className="block">In jail</b>
        Out at {new Date(until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ({Math.ceil(left / 60_000)} min). No travel till then.
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await bribeOut();
          setBusy(false);
          onDone(r.ok ? r.text : r.error, r.ok);
          if (r.ok) onFree();
        }}
        className="h-8 shrink-0 rounded-full bg-gold px-3 text-xs font-semibold text-ink disabled:opacity-40"
      >
        Bribe · {cash(mintOf(BRIBE, prices))}
      </button>
    </div>
  );
}
