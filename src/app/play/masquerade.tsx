"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ArrowLeft, Flag, SendHorizontal } from "lucide-react";
import { X } from "@/components/icons";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import type { Avatar } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";
import {
  MASQ_AGE_MAX,
  MASQ_AGE_MIN,
  MASQ_MINUTES,
  MASQ_MORE_MINUTES,
  MASQ_SAY_MAX,
  MASQ_SPICE,
  masqBlocked,
  type MasqMode,
  type MasqQuestion,
  type MasqSpice,
  type MasqWant,
} from "@/lib/masquerade";
import { setGender } from "./people-actions";
import type { MasqIdle, MasqView } from "@/app/api/masquerade/route";
import { whileHere } from "./activity";
import { OnTopPage } from "./on-top";

// Masquerade (docs/MASQUERADE.md): 5 minutes of chat with someone new, both masked; names and faces
// show only if both unmask. The server matches people and keeps the rules (src/app/api/masquerade);
// the two phones talk on the masquerade's own live channel as "a" and "b", never by name.

const NIGHT = "#17112b";
const PANEL = "#2b2050";
const GOLD = "#ffc53d";

/** A masquerade mask (yours gold, theirs pink). */
export function Mask({ colour = GOLD, eyes = NIGHT, className }: { colour?: string; eyes?: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden>
      <path d="M8 14C28 3 50 8 60 18C70 8 92 3 112 14C114 36 101 51 82 49C70 48 64 39 60 34C56 39 50 48 38 49C19 51 6 36 8 14Z" fill={colour} />
      <ellipse cx="37" cy="28" rx="12" ry="7" fill={eyes} />
      <ellipse cx="83" cy="28" rx="12" ry="7" fill={eyes} />
    </svg>
  );
}

const api = (body: Record<string, unknown>) =>
  fetch("/api/masquerade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json() as Promise<{ ok: boolean; error?: string; view?: MasqView | null; waiting?: boolean; text?: string; n?: number; question?: MasqQuestion }>)
    .catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
const idleNow = () =>
  fetch("/api/masquerade", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<MasqIdle>) : null))
    .catch(() => null);
const viewNow = (id: number) =>
  fetch(`/api/masquerade?id=${id}`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ view: MasqView | null }>) : { view: null }))
    .then((d) => d.view)
    .catch(() => undefined);

/** The Masquerade row at the top of your chats: how many are masked right now. */
export function MasqueradeCard({ onOpen }: { onOpen: () => void }) {
  const [idle, setIdle] = useState<MasqIdle | null>(null);
  useEffect(() => {
    let alive = true;
    const look = () => void idleNow().then((i) => alive && i && setIdle(i));
    look();
    const stop = whileHere(look, 2 * 60_000);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  if (idle?.off) return null;
  return (
    <button onClick={onOpen} className="mx-5 mb-3 flex w-[calc(100%-2.5rem)] items-center gap-3.5 rounded-3xl p-4 text-left text-white" style={{ background: NIGHT }}>
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl" style={{ background: PANEL }}>
        <Mask className="w-11" eyes={PANEL} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-lg">Masquerade</b>
        <span className="block text-sm text-[#cfc6ee]">{idle?.live ? "You're in one. Tap to go back" : "5 minutes with someone new. Faces hidden."}</span>
      </span>
      {!!idle && idle.masked > 0 && (
        <span className="shrink-0 rounded-xl px-2.5 py-1 text-xs font-extrabold" style={{ background: GOLD, color: NIGHT }}>
          {idle.masked} in
        </span>
      )}
    </button>
  );
}

type Line = { key: string; side: "a" | "b"; text: string };

/** What you'd like from a masquerade (remembered on this phone). */
type Prefs = { mode: MasqMode; want: MasqWant; ageMin: number; ageMax: number; spice: MasqSpice };
const PREFS_KEY = "nt-masq";
const DEFAULT_PREFS: Prefs = { mode: "friends", want: "anyone", ageMin: MASQ_AGE_MIN, ageMax: 40, spice: 1 };
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    return { ...DEFAULT_PREFS, ...(p ?? {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}
const spiceOf = (n: number) => MASQ_SPICE[Math.max(0, Math.min(3, n))];

export function Masquerade({
  me,
  region,
  where,
  onClose,
  onChat,
  onAddFriend,
  onDating,
}: {
  /** You (your face once you've both unmasked). */
  me: { name: string; avatar: Avatar };
  region: string;
  /** Where you are (the nearest people are matched first). */
  where: () => { x: number; z: number } | null;
  onClose: () => void;
  /** Unmasked: carry on in the ordinary chat. */
  onChat: (p: { id: string; name: string }) => void;
  onAddFriend: (p: { id: string; name: string }) => void;
  /** Open Dating (to switch on Open to dating). */
  onDating: () => void;
}) {
  const [idle, setIdle] = useState<MasqIdle | null>(null);
  const [prefs, setPrefsNow] = useState<Prefs>(loadPrefs);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsNow((was) => {
      const next = { ...was, ...p };
      if (next.ageMax < next.ageMin) next.ageMax = next.ageMin;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const mode = prefs.mode;
  const [waiting, setWaiting] = useState(false);
  const [view, setView] = useState<MasqView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What's going on: and if you're in one already (back after closing it), straight back in.
  useEffect(() => {
    let alive = true;
    void idleNow().then(async (i) => {
      if (!alive || !i) return;
      setIdle(i);
      if (i.live) {
        const v = await viewNow(i.live);
        if (alive && v) setView(v);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Waiting: ask every 3 seconds (it keeps your place and tries to match you each time).
  const whereRef = useRef(where);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    whereRef.current = where;
    prefsRef.current = prefs;
  });
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const ask = async () => {
      const at = whereRef.current() ?? { x: 0, z: 0 };
      const p = prefsRef.current;
      const r = await api({ action: "join", mode: p.mode, want: p.want, ageMin: p.ageMin, ageMax: p.ageMax, spice: p.spice, region, x: at.x, z: at.z });
      if (!alive) return;
      if (!r.ok) {
        setWaiting(false);
        return setError(r.error ?? "That didn't work. Try again.");
      }
      if (r.view) {
        setWaiting(false);
        setView(r.view);
        if (navigator.vibrate) navigator.vibrate(60);
      }
    };
    void ask();
    const t = setInterval(() => void ask(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [waiting, region]);

  const start = async () => {
    setError(null);
    if (mode === "dating" && idle && !idle.datingOpen) {
      // Maybe just switched on (in Dating, over this page): look again first.
      const i = await idleNow();
      if (i) setIdle(i);
      if (!i?.datingOpen) return setError("Switch on Open to dating first, or come for friends.");
    }
    setView(null);
    setWaiting(true);
  };
  const stopWaiting = () => {
    setWaiting(false);
    void api({ action: "cancel" });
  };
  const close = () => {
    if (waiting) stopWaiting();
    onClose();
  };

  return (
    <OnTopPage role="dialog" aria-modal="true" aria-label="Masquerade" className="fixed inset-0 flex flex-col text-white" style={{ background: NIGHT }}>
      <div className="mx-auto flex h-full w-full max-w-xl flex-col">
        {view ? (
          <Session
            key={view.id}
            me={me}
            first={view}
            onClose={close}
            onAgain={() => {
              setView(null);
              void start();
            }}
            onChat={onChat}
            onAddFriend={onAddFriend}
          />
        ) : waiting ? (
          <Finding onCancel={stopWaiting} />
        ) : (
          <Start
            idle={idle}
            prefs={prefs}
            setPrefs={setPrefs}
            error={error}
            onStart={() => void start()}
            onClose={close}
            onDating={onDating}
            onGender={async (g) => {
              const r = await setGender(g);
              if (r.ok) setIdle((i) => (i ? { ...i, gender: g } : i));
              else setError(r.error);
            }}
          />
        )}
      </div>
    </OnTopPage>
  );
}

function Start({
  idle,
  prefs,
  setPrefs,
  error,
  onStart,
  onClose,
  onDating,
  onGender,
}: {
  idle: MasqIdle | null;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  error: string | null;
  onStart: () => void;
  onClose: () => void;
  onDating: () => void;
  onGender: (g: "male" | "female") => void;
}) {
  const left = idle ? Math.max(0, idle.perDay - idle.today) : null;
  const ages = Array.from({ length: MASQ_AGE_MAX - MASQ_AGE_MIN + 1 }, (_, i) => MASQ_AGE_MIN + i);
  const seg = <T extends string | number>(value: T, options: [T, string][], pick: (v: T) => void, cols = options.length) => (
    <div className="grid gap-1 rounded-2xl p-1" style={{ background: PANEL, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map(([id, label]) => (
        <button key={String(id)} onClick={() => pick(id)} aria-pressed={value === id} className={cn("min-h-12 rounded-xl px-2 py-2 text-[15px] font-extrabold", value === id ? "bg-white text-[#17112b]" : "text-[#d6cff0]")}>
          {label}
        </button>
      ))}
    </div>
  );
  const label = (t: string) => <p className="pb-2 pt-6 text-[13px] font-extrabold text-[#b9b0dc]">{t}</p>;
  return (
    <>
      <header className="flex items-center px-3 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="grid size-11 place-items-center rounded-full" aria-label="Back">
          <ArrowLeft className="size-6" />
        </button>
        <span className="flex-1" />
        {!!idle && idle.masked > 0 && (
          <span className="rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold" style={{ background: GOLD, color: NIGHT }}>
            {idle.masked} masked now
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <div className="flex flex-col items-center pt-2 text-center">
          <span className="grid size-28 place-items-center rounded-full" style={{ background: PANEL, boxShadow: "0 0 0 8px rgba(255,197,61,0.08), 0 0 0 18px rgba(112,72,232,0.12)" }}>
            <Mask className="w-20" eyes={PANEL} />
          </span>
          <h1 className="mt-6 text-[30px] font-extrabold tracking-tight">Masquerade</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-[#d6cff0]">{MASQ_MINUTES} minutes with someone new, both masked. Unmask only if you both say yes.</p>
        </div>

        {label("I'm here for")}
        {seg<MasqMode>(prefs.mode, [["friends", "Making friends"], ["dating", "Dating too"]], (mode) => setPrefs({ mode }))}
        {prefs.mode === "dating" && idle && !idle.datingOpen && (
          <button onClick={onDating} className="mt-3 w-full rounded-2xl px-4 py-3 text-left text-sm text-[#e9e4fa]" style={{ background: PANEL }}>
            Dating too matches you only with people open to dating. <b style={{ color: GOLD }}>Switch on Open to dating →</b>
          </button>
        )}

        {label("I'd like to meet")}
        {seg<MasqWant>(prefs.want, [["women", "Women"], ["men", "Men"], ["anyone", "Anyone"]], (want) => setPrefs({ want }))}

        {label("Aged")}
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              ["ageMin", "From"],
              ["ageMax", "To"],
            ] as const
          ).map(([key, word]) => (
            <label key={key} className="flex h-14 items-center gap-2 rounded-2xl px-4" style={{ background: PANEL }}>
              <span className="text-sm font-bold text-[#b9b0dc]">{word}</span>
              <select
                value={prefs[key]}
                onChange={(e) => setPrefs({ [key]: Number(e.target.value) })}
                aria-label={`Age ${word.toLowerCase()}`}
                className="min-w-0 flex-1 bg-transparent text-right text-lg font-extrabold text-white outline-none"
              >
                {ages.filter((a) => (key === "ageMax" ? a >= prefs.ageMin : true)).map((a) => (
                  <option key={a} value={a} className="text-ink">
                    {a === MASQ_AGE_MAX && key === "ageMax" ? `${a}+` : a}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {label("How spicy should the questions be?")}
        {seg<MasqSpice>(
          prefs.spice,
          MASQ_SPICE.map((s) => [s.level, `${s.chillies ? s.chillies + " " : ""}${s.label}`]),
          (spice) => setPrefs({ spice }),
          2,
        )}
        <p className="pt-2 text-[13px] leading-snug text-[#b9b0dc]">They see how spicy you picked, and you see theirs. The questions follow the average of your two picks.</p>

        {idle && !idle.gender && (
          <>
            {label("I am")}
            {seg<"male" | "female" | "">("", [["female", "A woman"], ["male", "A man"]], (g) => g && onGender(g))}
            <p className="pt-2 text-[13px] leading-snug text-[#b9b0dc]">Until you say, you only meet people looking for anyone.</p>
          </>
        )}
        {error && <p className="mt-4 rounded-2xl bg-[#e03131]/20 px-4 py-3 text-sm text-[#ffc9c9]">{error}</p>}
      </div>
      <div className="flex flex-col gap-2.5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <button onClick={onStart} disabled={left === 0} className="h-[58px] rounded-[20px] text-[17px] font-extrabold disabled:opacity-50" style={{ background: GOLD, color: NIGHT }}>
          {left === 0 ? "That's all for today" : "Put on your mask"}
        </button>
        <p className="text-center text-[13px] text-[#b9b0dc]">Be kind. Leave or report any time.{left !== null && left > 0 && left < 4 ? ` ${left} left today.` : ""}</p>
      </div>
    </>
  );
}

function Finding({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-7 text-center">
        <div className="relative grid size-52 place-items-center">
          <span className="absolute inset-6 animate-ping rounded-full border-[3px] border-[#7048e8] [animation-duration:1.8s]" />
          <span className="grid size-36 place-items-center rounded-full" style={{ background: PANEL }}>
            <Mask className="w-24" eyes={PANEL} />
          </span>
        </div>
        <div>
          <p className="text-[26px] font-extrabold">Finding someone masked…</p>
          <p className="mt-2 text-base text-[#d6cff0]">People online now, nearest first. Usually under a minute.</p>
        </div>
      </div>
      <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button onClick={onCancel} className="h-[52px] w-full rounded-[18px] text-base font-extrabold" style={{ background: PANEL }}>
          Cancel
        </button>
      </div>
    </>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Session({
  me,
  first,
  onClose,
  onAgain,
  onChat,
  onAddFriend,
}: {
  me: { name: string; avatar: Avatar };
  first: MasqView;
  onClose: () => void;
  onAgain: () => void;
  onChat: (p: { id: string; name: string }) => void;
  onAddFriend: (p: { id: string; name: string }) => void;
}) {
  const [view, setView] = useState<MasqView>(first);
  const [lines, setLines] = useState<Line[]>(() => first.said.map((m, i) => ({ key: `s${i}`, side: m.side, text: m.text })));
  const [question, setQuestion] = useState<MasqQuestion>(first.question);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [friended, setFriended] = useState(false);
  // The server's clock on this phone (so both count down together).
  const [offset] = useState(() => Date.parse(first.serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const id = view.id;
  const refresh = useCallback(async () => {
    const v = await viewNow(id);
    if (!v) return;
    setView(v);
    setQuestion(v.question);
    setLines(v.said.map((m, i) => ({ key: `s${i}`, side: m.side, text: m.text })));
  }, [id]);

  // The live channel: messages, a new question, and "look again" when something changed.
  const channel = useRef<RealtimeChannel | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(first.channel, { config: { broadcast: { self: false }, presence: { key: first.side } } });
    ch.on("broadcast", { event: "m" }, ({ payload }) => {
      const p = (payload ?? {}) as { t?: string; text?: string; side?: string; question?: MasqQuestion };
      if (p.t === "say" && typeof p.text === "string") setLines((l) => [...l, { key: `r${Date.now()}${Math.random()}`, side: p.side === "a" ? "a" : "b", text: p.text!.slice(0, MASQ_SAY_MAX) }]);
      else if (p.t === "q" && p.question) setQuestion(p.question);
      else if (p.t === "poke") void refresh();
    }).subscribe();
    channel.current = ch;
    return () => {
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [first.channel, first.side, refresh]);
  const tell = (payload: Record<string, unknown>) => void channel.current?.send({ type: "broadcast", event: "m", payload });

  // Now and then, and the moment the time is up (or the time to decide is), look again.
  const ends = Date.parse(view.endsAt);
  useEffect(() => {
    const stop = whileHere(() => void refresh(), 12_000);
    const left = ends - (Date.now() + offset);
    const atEnd = setTimeout(() => void refresh(), Math.max(0, left) + 400);
    const atDecided = setTimeout(() => void refresh(), Math.max(0, left + view.decideSeconds * 1000) + 600);
    return () => {
      stop();
      clearTimeout(atEnd);
      clearTimeout(atDecided);
    };
  }, [refresh, ends, offset, view.decideSeconds]);

  // Stage by the clock too (the server agrees on its next look).
  const msLeft = ends - (now + offset);
  const stage = view.stage === "live" && msLeft <= 0 ? "deciding" : view.stage === "deciding" && msLeft < -view.decideSeconds * 1000 ? "ended" : view.stage;
  // A new stage starts with nothing to warn about.
  const [noteStage, setNoteStage] = useState(stage);
  if (stage !== noteStage) {
    setNoteStage(stage);
    setNote(null);
  }

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const local = view.stage === "unmasked" ? null : masqBlocked(t);
    if (local) return setNote(local);
    setBusy(true);
    const r = await api({ action: "say", id, text: t });
    setBusy(false);
    if (!r.ok) return setNote(r.error ?? "That didn't send.");
    setNote(null);
    setText("");
    setLines((l) => [...l, { key: `m${Date.now()}`, side: view.side, text: r.text ?? t }]);
    tell({ t: "say", side: view.side, text: r.text ?? t });
  };
  const nextQuestion = async () => {
    const r = await api({ action: "next", id });
    if (r.ok && r.question) {
      setQuestion(r.question);
      tell({ t: "q", question: r.question });
    }
  };
  const choose = async (choice: "unmask" | "more" | "pass" | "left") => {
    setBusy(true);
    const r = await api({ action: "choose", id, choice });
    setBusy(false);
    if (!r.ok) return setNote(r.error ?? "That didn't work.");
    if (r.view) setView(r.view);
    tell({ t: "poke" });
  };
  const report = async () => {
    setMenu(false);
    setBusy(true);
    await api({ action: "report", id, note: "Reported from a masquerade" });
    setBusy(false);
    tell({ t: "poke" });
    void refresh();
  };

  if (stage === "unmasked" && view.other) {
    const o = view.other;
    return (
      <Middle
        tag="YOU BOTH UNMASKED"
        faces={
          <>
            <AvatarFace avatar={me.avatar} size={112} className="rounded-full ring-4 ring-[#17112b]" />
            <AvatarFace avatar={cleanAvatar(o.avatar, o.name)} size={112} className="-ml-4 rounded-full ring-4 ring-[#17112b]" />
          </>
        }
        title={`Meet ${o.name}`}
        line={view.theirArea ? `From ${view.theirArea}` : "Say hello for real"}
      >
        <button onClick={() => onChat({ id: o.id, name: o.name })} className="h-[58px] rounded-[20px] text-[17px] font-extrabold" style={{ background: GOLD, color: NIGHT }}>
          Keep chatting
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            disabled={friended}
            onClick={() => {
              setFriended(true);
              onAddFriend({ id: o.id, name: o.name });
            }}
            className="h-[52px] rounded-[18px] text-[15px] font-extrabold disabled:opacity-60"
            style={{ background: PANEL }}
          >
            {friended ? "Friend asked ✓" : "Add friend"}
          </button>
          <button onClick={onAgain} className="h-[52px] rounded-[18px] text-[15px] font-extrabold" style={{ background: PANEL }}>
            Go again
          </button>
        </div>
      </Middle>
    );
  }

  if (stage === "ended") {
    const why =
      view.why === "reported"
        ? view.byMe
          ? "Thanks for telling us. You won't be matched with them again."
          : "This masquerade has ended."
        : view.why === "left"
          ? view.byMe
            ? "You left the masquerade."
            : "They left the masquerade."
          : view.why === "pass"
            ? "Not a match this time. No hard feelings: nobody sees who said no."
            : "Time ran out before you both decided.";
    return (
      <Middle tag="THE MASKS STAY ON" faces={<Mask className="w-28" />} title="Masquerade over" line={why}>
        <button onClick={onAgain} className="h-[58px] rounded-[20px] text-[17px] font-extrabold" style={{ background: GOLD, color: NIGHT }}>
          Go again
        </button>
        <button onClick={onClose} className="h-[52px] rounded-[18px] text-[15px] font-extrabold" style={{ background: PANEL }}>
          Done
        </button>
      </Middle>
    );
  }

  if (stage === "deciding") {
    const decideLeft = msLeft + view.decideSeconds * 1000;
    return (
      <Middle
        tag="TIME'S UP"
        faces={
          <>
            <span className="grid size-28 place-items-center rounded-full ring-4 ring-[#17112b]" style={{ background: PANEL }}>
              <Mask className="w-20" eyes={PANEL} />
            </span>
            <span className="-ml-4 grid size-28 place-items-center rounded-full ring-4 ring-[#17112b]" style={{ background: "#3a2c6b" }}>
              <Mask className="w-20" colour="#e64980" eyes="#3a2c6b" />
            </span>
          </>
        }
        title="Unmask?"
        line="If you both say yes, you see each other and keep chatting. If not, it just ends. Nobody sees who said no."
        extra={
          view.mine ? (
            <p className="mt-5 text-[15px] font-bold" style={{ color: GOLD }}>
              {view.mine === "unmask" ? "You said yes." : `You asked for ${MASQ_MORE_MINUTES} more minutes.`} Waiting for them… {clock(decideLeft)}
            </p>
          ) : (
            <p className="mt-5 text-sm text-[#b9b0dc]">
              {view.theyChose ? "They've decided. " : ""}
              {clock(decideLeft)} to decide
            </p>
          )
        }
      >
        {!view.mine && (
          <>
            <button disabled={busy} onClick={() => void choose("unmask")} className="h-[58px] rounded-[20px] text-[17px] font-extrabold disabled:opacity-50" style={{ background: GOLD, color: NIGHT }}>
              Unmask
            </button>
            <div className={cn("grid gap-2.5", view.extended ? "grid-cols-1" : "grid-cols-2")}>
              {!view.extended && (
                <button disabled={busy} onClick={() => void choose("more")} className="h-[52px] rounded-[18px] text-[15px] font-extrabold" style={{ background: PANEL }}>
                  {MASQ_MORE_MINUTES} more minutes
                </button>
              )}
              <button disabled={busy} onClick={() => void choose("pass")} className="h-[52px] rounded-[18px] text-[15px] font-extrabold" style={{ background: PANEL }}>
                Pass
              </button>
            </div>
          </>
        )}
        {note && <p className="text-center text-sm text-[#ffc9c9]">{note}</p>}
      </Middle>
    );
  }

  // The masked chat.
  const low = msLeft <= 30_000;
  return (
    <>
      <header className="flex items-center gap-3 px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <span className="grid size-[46px] shrink-0 place-items-center rounded-full" style={{ background: "#3a2c6b" }}>
          <Mask className="w-[34px]" colour="#e64980" eyes="#3a2c6b" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-extrabold">Masked guest</p>
          <p className="truncate text-[13px] text-[#b9b0dc]">
            {[view.theirArea, view.mode === "dating" ? "open to dating" : "here for friends"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={cn("rounded-[14px] px-3 py-2 text-base font-extrabold tabular-nums", low ? "bg-[#e03131] text-white" : "")} style={low ? undefined : { background: PANEL, color: GOLD }}>
          {clock(msLeft)}
        </span>
      </header>
      <div className="mx-4 h-1 overflow-hidden rounded-full" style={{ background: PANEL }}>
        <div className="h-1 transition-[width] duration-1000" style={{ width: `${Math.max(0, Math.min(100, (msLeft / ((view.extended ? MASQ_MORE_MINUTES : MASQ_MINUTES) * 60_000)) * 100))}%`, background: low ? "#e03131" : GOLD }} />
      </div>
      <div className="mx-4 mt-3.5 rounded-[20px] px-4 py-3.5" style={{ background: question.heat === 2 ? "#4a1022" : question.heat === 1 ? "#3b1430" : PANEL }}>
        <p className="text-xs font-extrabold tracking-[0.06em]" style={{ color: question.heat ? "#ff8fab" : GOLD }}>
          {question.heat === 2 ? "🌶️🌶️🌶️ EXTRA SPICY" : question.heat === 1 ? "🌶️ SPICY QUESTION" : "TONIGHT'S QUESTION"}
        </p>
        <p className="mt-1 text-[17px] font-bold leading-snug">{question.text}</p>
      </div>
      {/* How spicy each of you picked (the questions follow the average). */}
      <div className="mx-4 mt-2 flex items-center justify-between gap-2 text-[13px] text-[#b9b0dc]">
        <span>
          They picked <b className="text-white">{spiceOf(view.theirSpice).chillies} {spiceOf(view.theirSpice).label}</b>
        </span>
        <span>
          You: {spiceOf(view.mySpice).chillies || "Mild"}
        </span>
      </div>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain p-4">
        {lines.length === 0 && <p className="m-auto text-center text-sm text-[#b9b0dc]">Say hi, or answer the question first.</p>}
        {lines.map((l) => (
          <p
            key={l.key}
            className={cn("max-w-[78%] break-words px-4 py-3 text-base leading-snug", l.side === view.side ? "self-end rounded-[20px_20px_6px_20px] bg-[#7048e8]" : "self-start rounded-[20px_20px_20px_6px]")}
            style={l.side === view.side ? undefined : { background: PANEL }}
          >
            {l.text}
          </p>
        ))}
        {lines.length > 0 && <p className="mt-1 self-center text-center text-[13px] text-[#b9b0dc]">Names, numbers and pictures stay off until you both unmask</p>}
      </div>
      <div className="flex gap-2 px-4 pb-2">
        <button onClick={() => void nextQuestion()} className="h-10 rounded-full border border-[#3a2c6b] px-3.5 text-sm font-bold text-[#e9e4fa]">
          Another question
        </button>
        {["😂", "🔥", "👀"].map((e) => (
          <button
            key={e}
            onClick={() => {
              setLines((l) => [...l, { key: `e${Date.now()}`, side: view.side, text: e }]);
              tell({ t: "say", side: view.side, text: e });
              void api({ action: "say", id, text: e });
            }}
            className="h-10 rounded-full border border-[#3a2c6b] px-3.5 text-sm"
            aria-label={`Send ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      {note && <p className="px-5 pb-1 text-sm text-[#ffc9c9]">{note}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2.5 border-t px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2"
        style={{ borderColor: PANEL }}
      >
        <button type="button" onClick={() => setMenu(true)} className="grid size-12 shrink-0 place-items-center rounded-full text-[#ffa8a8]" style={{ background: PANEL }} aria-label="Leave or report">
          <Flag className="size-5" />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MASQ_SAY_MAX))}
          placeholder="Say something"
          aria-label="Message"
          className="h-12 min-w-0 flex-1 rounded-full px-[18px] text-base text-white outline-none placeholder:text-[#b9b0dc]"
          style={{ background: PANEL }}
        />
        <button disabled={busy || !text.trim()} className="grid size-12 shrink-0 place-items-center rounded-full disabled:opacity-50" style={{ background: GOLD, color: NIGHT }} aria-label="Send">
          <SendHorizontal className="size-5" />
        </button>
      </form>
      {menu && (
        <div className="fixed inset-0 z-[1] flex items-end bg-black/50" onClick={() => setMenu(false)}>
          <div className="mx-auto w-full max-w-xl space-y-2.5 rounded-t-[28px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]" style={{ background: NIGHT }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-1">
              <p className="text-lg font-extrabold">Leave this masquerade?</p>
              <button onClick={() => setMenu(false)} className="grid size-10 place-items-center rounded-full" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <button
              onClick={() => {
                setMenu(false);
                void choose("left");
              }}
              className="h-[52px] w-full rounded-[18px] text-[15px] font-extrabold"
              style={{ background: PANEL }}
            >
              Leave
            </button>
            <button onClick={() => void report()} className="h-[52px] w-full rounded-[18px] bg-[#e03131] text-[15px] font-extrabold">
              Report and leave
            </button>
            <p className="text-center text-xs text-[#b9b0dc]">A report sends us what they said. You won&apos;t be matched with them again.</p>
          </div>
        </div>
      )}
    </>
  );
}

/** A big moment in the middle (time's up, unmasked, over), with its buttons at the bottom. */
function Middle({ tag, faces, title, line, extra, children }: { tag: string; faces: React.ReactNode; title: string; line: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-7 text-center">
        <p className="text-[13px] font-extrabold tracking-[0.08em]" style={{ color: GOLD }}>
          {tag}
        </p>
        <div className="mt-6 flex items-center">{faces}</div>
        <h1 className="mt-6 text-[30px] font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-base leading-relaxed text-[#d6cff0]">{line}</p>
        {extra}
      </div>
      <div className="flex flex-col gap-2.5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
    </>
  );
}
