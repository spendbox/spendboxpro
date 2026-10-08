"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AvatarFace } from "@/components/avatar";
import { Coins, MapPin, MessageCircle, RotateCcw, Sparkles, Target, X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { areaName, fakeAreaName } from "@/lib/npc/area";
import type { Rand } from "@/lib/npc/rng";
import {
  afterAction,
  begin,
  newTalk,
  readIntent,
  respond,
  typingTime,
  type Choice,
  type GiftAnswer,
  type HintAnswer,
  type Intent,
  type LineTag,
  type QuestAnswer,
  type TalkAction,
  type TalkReply,
  type TalkState,
} from "@/lib/npc/talk";
import { moodAt, type Npc } from "@/lib/npcs";
import { questEvent, refreshQuest } from "./activities/quest-store";
import { askNpcGift, askNpcHint, askNpcQuest } from "./npc-actions";

// Chatting with one of the city's people (an NPC: made up by the game, not a player). Opens
// when someone taps their face or name in the chat, or taps them in the 3D view. It's a real
// back-and-forth: pick one of the suggested replies or type something short, and they answer in
// character (see src/lib/npc/talk.ts). Some of them whisper real clues, some tell tall tales,
// some give coins, some hand out side quests. Each conversation is kept for this visit (this
// browser tab); "New chat" starts another one.

/** NPCs' colour everywhere: teal. */
export const NPC_PILL = "bg-[#0b7285] text-white";
/** The softer pill (older code). */
export const REGULAR_PILL = "bg-[#0b7285]/12 text-[#0b7285]";
/** A dashed teal ring round an NPC's face, so they never look like a player. */
export const NPC_RING = "outline-2 outline-dashed outline-offset-2 outline-[#0b7285]";

/** The little "NPC" chip shown next to their name and on every message. */
export function NpcBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full px-1.5 py-px align-middle text-[10px] font-bold uppercase leading-4 tracking-wide", NPC_PILL, className)}
      title="NPC: one of the city's own people, not a player"
    >
      NPC
    </span>
  );
}

/** An NPC's face with the dashed NPC ring. */
export function NpcFace({ npc, size, className }: { npc: Npc; size: number; className?: string }) {
  return <AvatarFace avatar={npc.avatar} size={size} className={cn("shrink-0 rounded-full", NPC_RING, className)} />;
}

type Bubble = { id: number; who: "npc" | "me" | "note"; text: string; at: number; tag?: LineTag };
type Saved = { v: 1; state: TalkState; log: Bubble[]; choices: Choice[]; seq: number };

const MAX_LOG = 90;
const memory = new Map<string, Saved>();

function loadTalk(key: string): Saved | null {
  const kept = memory.get(key);
  if (kept) return kept;
  try {
    const raw = window.sessionStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    if (saved && saved.v === 1 && Array.isArray(saved.log) && saved.state) return saved;
  } catch {
    // Private windows and full storage: keep it in memory only.
  }
  return null;
}

function saveTalk(key: string, saved: Saved) {
  memory.set(key, saved);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // Fine: it's still kept in memory for this visit.
  }
}

const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** On phones, the part of the screen above the keyboard. */
function useVisibleBox() {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox(window.innerWidth < 640 ? { top: vv.offsetTop, height: vv.height } : null);
    const first = window.setTimeout(update, 0);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      clearTimeout(first);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

const TAG_STYLE: Partial<Record<LineTag, { box: string; label: string; icon: React.ReactNode }>> = {
  clue: { box: "bg-gold/15 ring-1 ring-gold/60", label: "Clue", icon: <MapPin className="size-3" aria-hidden /> },
  gift: { box: "bg-me/10 ring-1 ring-me/40", label: "Gift", icon: <Coins className="size-3" aria-hidden /> },
  quest: { box: "bg-[#7048e8]/10 ring-1 ring-[#7048e8]/30", label: "Side quest", icon: <Target className="size-3" aria-hidden /> },
  joke: { box: "bg-panel-2", label: "Joke", icon: <Sparkles className="size-3" aria-hidden /> },
  riddle: { box: "bg-panel-2", label: "Riddle", icon: <Sparkles className="size-3" aria-hidden /> },
};

export function NpcCard({ npc, onClose, autoStart = false }: { npc: Npc; onClose: () => void; autoStart?: boolean }) {
  const key = `hs:npc:${npc.roundId}:${npc.id}`;
  const [saved, setSaved] = useState<Saved>(() => loadTalk(key) ?? { v: 1, state: newTalk(0), log: [], choices: [], seq: 0 });
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [openedAt] = useState(() => Date.now());
  const router = useRouter();
  const live = useRef(saved);
  const busy = useRef(false);
  const mounted = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const box = useVisibleBox();

  useEffect(() => {
    live.current = saved;
    saveTalk(key, saved);
  }, [key, saved]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the newest line in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [saved.log.length, typing]);

  const opts = useMemo(
    () => ({ fakeArea: (rand: Rand) => fakeAreaName(npc.roundId, rand), areaOf: (tile: number) => areaName(npc.roundId, tile) }),
    [npc.roundId],
  );

  const change = useCallback((fn: (s: Saved) => Saved) => {
    const next = fn(live.current);
    live.current = next;
    setSaved(next);
  }, []);

  const add = useCallback(
    (who: Bubble["who"], line: string, tag?: LineTag) =>
      change((s) => ({ ...s, seq: s.seq + 1, log: [...s.log, { id: s.seq + 1, who, text: line, at: Date.now(), tag }].slice(-MAX_LOG) })),
    [change],
  );

  /** Show what they say, one line at a time, with a little "typing…" before each. */
  const show = useCallback(
    async (reply: TalkReply) => {
      for (const line of reply.lines) {
        setTyping(true);
        await wait(typingTime(npc, line.text));
        if (!mounted.current) return false;
        add("npc", line.text, line.tag);
      }
      change((s) => ({ ...s, state: reply.state, choices: reply.choices }));
      return true;
    },
    [npc, add, change],
  );

  const ask = useCallback(
    async (action: TalkAction): Promise<HintAnswer | GiftAnswer | QuestAnswer> => {
      try {
        if (action === "hint") {
          const r = await askNpcHint(npc.id);
          return r.ok ? { hint: r.hint, why: r.why } : { error: r.error };
        }
        if (action === "gift") {
          const r = await askNpcGift(npc.id);
          return r.ok ? { coins: r.coins, why: r.why } : { error: r.error };
        }
        const r = await askNpcQuest(npc.id);
        return r.ok ? { quest: r.quest, why: r.why } : { error: r.error };
      } catch {
        return { error: "The connection blinked. Try again in a moment." };
      }
    },
    [npc.id],
  );

  const run = useCallback(
    async (intent: Intent, mine?: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        change((s) => ({ ...s, choices: [] }));
        if (mine) add("me", mine);
        const at = Date.now();
        const state = live.current.state;
        const reply = intent.kind === "start" ? begin(npc, state, at) : respond(npc, state, intent, at, opts, mine ?? "");
        // Chatting with a regular counts towards "talk to people" side quests.
        if (intent.kind === "start") questEvent({ type: "talk_npc", npc: npc.id });
        if (!(await show(reply)) || !reply.action) return;
        // Something real first (a clue, coins, a quest), then they say how it went.
        setTyping(true);
        const result = await ask(reply.action);
        if (!mounted.current) return;
        if ("error" in result) {
          if (!reply.unprompted) add("note", result.error);
          return;
        }
        const after = afterAction(npc, live.current.state, reply.action, result, Date.now(), opts, reply.unprompted);
        await show(after);
        if (after.lines.some((l) => l.tag === "gift")) router.refresh();
        if (reply.action === "quest") refreshQuest();
      } finally {
        busy.current = false;
        if (mounted.current) setTyping(false);
      }
    },
    [npc, opts, add, change, show, ask, router],
  );

  const started = saved.log.some((b) => b.who === "npc");

  // Opened with the "Chat" button: say hello straight away.
  useEffect(() => {
    if (!autoStart || started) return;
    const id = window.setTimeout(() => void run({ kind: "start" }), 0);
    return () => clearTimeout(id);
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function newChat() {
    if (busy.current) return;
    change((s) => ({ ...s, state: newTalk(s.state.convo + 1), choices: [] }));
    add("note", "New chat");
    void run({ kind: "start" });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const said = text.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!said || busy.current) return;
    setText("");
    void run(readIntent(said, live.current.state), said);
  }

  const mood = moodAt(npc, openedAt);

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-x-0 top-0 z-[60] flex h-dvh items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      style={box ? { top: box.top, height: box.height } : undefined}
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-chat-title"
        className="flex h-[min(92%,680px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-panel shadow-2xl sm:h-[min(85dvh,680px)] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          <NpcFace npc={npc} size={48} />
          <div className="min-w-0 flex-1">
            <h2 id="npc-chat-title" className="flex min-w-0 items-center gap-1.5 font-bold">
              <span className="truncate">{npc.name}</span>
              <NpcBadge />
            </h2>
            <p className="truncate text-xs text-muted">
              {npc.role} · {npc.age} · from {npc.from}
            </p>
            <p className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
              <span className="rounded-full bg-[#0b7285]/12 px-1.5 py-px text-[#0b7285]">{npc.personaLabel}</span>
              <span className="rounded-full bg-panel-2 px-1.5 py-px capitalize text-muted">{mood}</span>
              {npc.clue === "fake" && <span className="rounded-full bg-hit/10 px-1.5 py-px text-hit">Tells tall tales</span>}
              {npc.gives && <span className="rounded-full bg-me/10 px-1.5 py-px text-me">Generous</span>}
              {npc.quests && <span className="rounded-full bg-[#7048e8]/10 px-1.5 py-px text-[#5f3dc4]">Side quests</span>}
            </p>
          </div>
          {started && (
            <button
              onClick={newChat}
              disabled={typing}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2 disabled:opacity-40"
              aria-label="Start a new chat"
              title="New chat"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
          )}
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3" aria-live="polite">
          <div className="rounded-2xl bg-panel-2/70 p-3 text-sm">
            <p>{npc.blurb}</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {npc.traits.map((t) => (
                <li key={t}>{t}</li>
              ))}
              <li>
                Often says: <span className="italic">&ldquo;{npc.catchphrase}&rdquo;</span>
              </li>
            </ul>
          </div>

          {saved.log.map((b) =>
            b.who === "note" ? (
              <p key={b.id} className="flex items-center gap-2 py-1 text-center text-[11px] text-muted">
                <span className="h-px flex-1 bg-line" />
                {b.text}
                <span className="h-px flex-1 bg-line" />
              </p>
            ) : b.who === "me" ? (
              <div key={b.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-3 py-2 text-sm text-white">
                  <span className="break-words">{b.text}</span>
                  <span className="ml-2 align-bottom text-[10px] text-white/60">{time(b.at)}</span>
                </p>
              </div>
            ) : (
              <div key={b.id} className="flex items-end gap-2">
                <NpcFace npc={npc} size={26} />
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl rounded-bl-md border-l-4 border-[#0b7285]/50 px-3 py-2 text-sm",
                    (b.tag && TAG_STYLE[b.tag]?.box) || "bg-panel-2",
                  )}
                >
                  <span className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-muted">
                    <NpcBadge className="px-1 text-[9px] leading-3" />
                    {b.tag && TAG_STYLE[b.tag] && (
                      <span className="flex items-center gap-0.5">
                        {TAG_STYLE[b.tag]!.icon}
                        {TAG_STYLE[b.tag]!.label}
                      </span>
                    )}
                  </span>
                  <span className="break-words">{b.text}</span>
                  <span className="ml-2 align-bottom text-[10px] text-muted">{time(b.at)}</span>
                </div>
              </div>
            ),
          )}

          {typing && (
            <div className="flex items-end gap-2">
              <NpcFace npc={npc} size={26} />
              <p className="flex gap-1 rounded-2xl rounded-bl-md bg-panel-2 px-3 py-2.5" aria-label={`${npc.first} is typing`}>
                {[0, 150, 300].map((d) => (
                  <span key={d} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
                ))}
              </p>
            </div>
          )}
        </div>

        {started ? (
          <div className="shrink-0 space-y-2 border-t border-line p-2.5">
            {!typing && saved.choices.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Suggested replies">
                {saved.choices.map((c, i) => (
                  <button
                    key={`${saved.seq}-${i}`}
                    onClick={() => void run(c.intent, c.label)}
                    className="rounded-full border border-[#0b7285]/30 bg-[#0b7285]/5 px-3 py-1.5 text-left text-xs font-semibold text-[#0b7285] hover:bg-[#0b7285]/12"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 140))}
                maxLength={140}
                placeholder={`Say something to ${npc.first}`}
                aria-label={`Message ${npc.first}`}
                className="min-w-0 flex-1 rounded-full border border-line bg-panel px-4 py-2 text-base outline-none focus:border-gold sm:text-sm"
              />
              <button disabled={!text.trim() || typing} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                Send
              </button>
            </form>
          </div>
        ) : (
          <div className="shrink-0 border-t border-line p-3">
            <button
              onClick={() => void run({ kind: "start" })}
              disabled={typing}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              autoFocus
            >
              <MessageCircle className="size-4" aria-hidden />
              Chat
            </button>
          </div>
        )}
        <p className="shrink-0 px-4 pb-3 text-center text-[11px] text-muted">
          {npc.first} is an NPC: one of the city&apos;s own people, not a player. Some tell the truth, some tell tall tales.
        </p>
      </section>
    </div>,
    document.body,
  );
}
