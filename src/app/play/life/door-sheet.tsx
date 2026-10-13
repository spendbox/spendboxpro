"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, BookOpen, DoorClosed, PartyPopper } from "lucide-react";
import { Sheet } from "../sheet";
import { answerKnock, knock, knockStatus, myDoor, myGuestBook, myParty, signGuestBook, startParty, stopParty, type GuestLine, type Knock } from "./visit-actions";

/**
 * At someone else's door (docs/HOME_PLANNER.md, "Visiting"): knock or ring, and wait for them to
 * let you in. Nobody answering? Leave a note at the door. Let in, you go straight inside.
 */
export function DoorSheet({ building, owner, signedIn, onIn, onClose }: { building: string; owner: string; signedIn: boolean; onIn: () => void; onClose: () => void }) {
  const [state, setState] = useState<"idle" | "waiting" | "not_now" | "gone">("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noted, setNoted] = useState(false);
  const ids = useRef<number[]>([]);
  const inRef = useRef(onIn);
  useEffect(() => {
    inRef.current = onIn;
  });

  // Waiting at the door: ask every few seconds how it went.
  useEffect(() => {
    if (state !== "waiting") return;
    const t = setInterval(async () => {
      const s = await knockStatus(ids.current).catch(() => "waiting" as const);
      if (s === "in") {
        clearInterval(t);
        inRef.current();
      } else if (s !== "waiting") setState(s);
    }, 3000);
    return () => clearInterval(t);
  }, [state]);

  const ring = async (how: "knock" | "ring") => {
    setError(null);
    const r = await knock(building);
    if (!r.ok) return setError(r.error);
    ids.current = r.ids;
    setState("waiting");
    try {
      navigator.vibrate?.(how === "knock" ? [60, 80, 60, 80, 60] : [200]);
    } catch {}
  };

  const leave = async () => {
    setError(null);
    const r = await signGuestBook(building, note, true);
    if (!r.ok) return setError(r.error);
    setNoted(true);
    setNote("");
  };

  return (
    <Sheet onClose={onClose} title={`${owner}'s home`}>
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <div className={`grid size-20 place-items-center rounded-3xl bg-[#8a5a3b] text-white shadow-inner ${state === "waiting" ? "animate-pulse" : ""}`}>
          <DoorClosed className="size-10" />
        </div>
        <p className="text-sm text-muted">
          {state === "idle" && `The door's shut. Knock or ring, and ${owner} can let you in.`}
          {state === "waiting" && `You knocked. Waiting for ${owner} to come to the door…`}
          {state === "not_now" && `${owner} can't come to the door right now. Leave them a note?`}
          {state === "gone" && `Nobody came to the door. Leave a note, or try again later.`}
        </p>
      </div>
      {!signedIn ? (
        <p className="rounded-2xl bg-ink/5 p-3 text-center text-sm">Sign in to knock at people&apos;s doors.</p>
      ) : (
        <>
          {state !== "waiting" && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => void ring("knock")} className="flex h-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white">
                <DoorClosed className="size-4" /> Knock
              </button>
              <button onClick={() => void ring("ring")} className="flex h-11 items-center justify-center gap-2 rounded-full bg-gold text-sm font-semibold text-ink">
                <BellRing className="size-4" /> Ring the bell
              </button>
            </div>
          )}
          <div className="mt-4 border-t border-ink/5 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <BookOpen className="size-4 text-muted" /> Leave a note at the door
            </p>
            {noted ? (
              <p className="rounded-2xl bg-me/10 p-3 text-sm">Note left. {owner} will see it.</p>
            ) : (
              <div className="flex gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Came by to say hi!" className="h-10 min-w-0 flex-1 rounded-full bg-ink/5 px-4 text-sm outline-none" />
                <button onClick={() => void leave()} disabled={!note.trim()} className="h-10 shrink-0 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40">
                  Leave it
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </Sheet>
  );
}

/** Someone at your door: a little card pops up and you let them in, or not now. */
export function DoorBell({ signedIn }: { signedIn: boolean }) {
  const [knocks, setKnocks] = useState<Knock[]>([]);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const look = async () => {
      if (document.hidden) return;
      const k = await myDoor().catch(() => []);
      if (live) setKnocks(k);
    };
    void look();
    const t = setInterval(look, 8000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [signedIn]);
  const k = knocks[0];
  if (!k) return null;
  const answer = async (letIn: boolean) => {
    setKnocks((all) => all.filter((x) => x.id !== k.id));
    await answerKnock(k.id, letIn).catch(() => {});
  };
  return (
    <div className="pointer-events-auto fixed inset-x-0 top-20 z-[60] flex justify-center px-3">
      <div className="glass flex w-full max-w-sm items-center gap-3 rounded-3xl p-3 shadow-lg">
        <div className="grid size-10 shrink-0 animate-bounce place-items-center rounded-2xl bg-gold text-ink">
          <BellRing className="size-5" />
        </div>
        <p className="min-w-0 flex-1 text-sm">
          <b>{k.name}</b> is at your door.
        </p>
        <button onClick={() => void answer(false)} className="h-9 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold">
          Not now
        </button>
        <button onClick={() => void answer(true)} className="h-9 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white">
          Let in
        </button>
      </div>
    </div>
  );
}

/** On your home card: throw a party (open house for two hours), and your guest book. */
export function HomeParty() {
  const [until, setUntil] = useState<string | null | undefined>(undefined);
  const [book, setBook] = useState<GuestLine[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showBook, setShowBook] = useState(false);
  useEffect(() => {
    void myParty().then(setUntil).catch(() => setUntil(null));
    void myGuestBook().then(setBook).catch(() => setBook([]));
  }, []);
  const on = !!until && Date.parse(until) > Date.now();
  const start = async () => {
    setError(null);
    const r = await startParty(title);
    if (!r.ok) return setError(r.error);
    setUntil(r.until);
  };
  const stop = async () => {
    await stopParty().catch(() => {});
    setUntil(null);
  };
  return (
    <div className="mt-3 border-t border-ink/5 pt-3">
      {on ? (
        <div className="flex items-center gap-2">
          <PartyPopper className="size-5 shrink-0 text-[#f08c00]" />
          <p className="min-w-0 flex-1 text-sm">
            Party on till {new Date(until!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Anyone can walk in.
          </p>
          <button onClick={() => void stop()} className="h-9 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold">
            End party
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="Party name (optional)" className="h-10 min-w-0 flex-1 rounded-full bg-ink/5 px-4 text-sm outline-none" />
          <button onClick={() => void start()} disabled={until === undefined} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#f08c00] px-4 text-sm font-semibold text-white disabled:opacity-40">
            <PartyPopper className="size-4" /> Throw a party
          </button>
        </div>
      )}
      {!on && <p className="mt-1 text-xs text-muted">Your door's open to everyone for 2 hours, and your friends are invited.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button onClick={() => setShowBook((s) => !s)} className="mt-3 flex items-center gap-1.5 text-sm font-semibold">
        <BookOpen className="size-4 text-muted" /> Guest book{book ? ` (${book.length})` : ""}
      </button>
      {showBook && (
        <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
          {!book?.length && <p className="text-sm text-muted">Nobody&apos;s signed it yet. Visitors can leave a line here.</p>}
          {book?.map((g) => (
            <p key={g.id} className="rounded-2xl bg-ink/5 px-3 py-2 text-sm">
              <b>{g.name}</b>
              {g.atDoor ? " (note at the door)" : ""}: {g.body}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inside someone's home: sign their guest book. */
export function SignGuestBook({ building, onClose }: { building: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sign = async () => {
    const r = await signGuestBook(building, text, false);
    if (!r.ok) return setError(r.error);
    setDone(true);
  };
  return (
    <Sheet onClose={onClose} title="The guest book">
      {done ? (
        <p className="rounded-2xl bg-me/10 p-3 text-sm">Signed. Thanks for visiting!</p>
      ) : (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} rows={3} placeholder="Lovely home! Thanks for having me." className="w-full rounded-2xl bg-ink/5 p-3 text-sm outline-none" />
          <button onClick={() => void sign()} disabled={!text.trim()} className="mt-2 h-11 w-full rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-40">
            Sign the guest book
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Sheet>
  );
}
