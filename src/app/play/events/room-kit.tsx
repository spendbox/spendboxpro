"use client";

import { OnTop } from "../on-top";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { ChevronDown, CornerUpLeft, ImagePlus, LoaderCircle, LogOut, Send, Smile, SmilePlus, Trash2, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { REACTIONS, untilText } from "@/lib/world/events";
import { randomKey, type ChatLine, type Quote, type RoomMsg, type RoomPerson } from "./channel";

// The pieces both rooms share: the bar along the top, the chat (replies, reactions, deleting,
// emojis and photos), messages floating up the room, reactions floating up, and a guard so a
// problem in a room never takes the whole game down.

export type RoomMe = { id: string; name: string; avatar: unknown };

/**
 * Along the top: the event, how long is left, who's here, a button back to the map (you stay in)
 * and one to leave.
 */
export function RoomTop({ title, icon, endsAt, here, onMin, onLeave, onHere, extra }: { title: string; icon: string; endsAt: number; here: number; onMin: () => void; onLeave: () => void; onHere?: () => void; extra?: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15 text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-extrabold leading-tight">{title}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-white/75">
          <span className="inline-flex items-center gap-1 rounded-full bg-hit px-1.5 font-bold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
          {endsAt > now ? `${untilText(endsAt - now)} left` : "Ending"}
          <button onClick={onHere} className="inline-flex items-center gap-0.5 rounded-full px-1 font-semibold underline-offset-2 hover:underline" aria-label="Who's here">
            <Users className="size-3" /> {here.toLocaleString("en-GB")}
          </button>
        </p>
      </div>
      {extra}
      <button onClick={onMin} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15" aria-label="Back to the map (you stay in)" title="Back to the map">
        <ChevronDown className="size-5" />
      </button>
      <button onClick={onLeave} className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 text-xs font-bold" aria-label="Leave the event" title="Leave (your ticket stays paid: come back any time while it's on)">
        <LogOut className="size-4" /> Leave
      </button>
    </div>
  );
}

/** Reactions floating up from the bottom for everyone. */
export function FloatingReactions({ on }: { on: (fn: (m: RoomMsg) => void) => () => void }) {
  const [bits, setBits] = useState<{ k: number; e: string; x: number }[]>([]);
  const k = useRef(0);
  useEffect(
    () =>
      on((m) => {
        if (m.t !== "react" || !REACTIONS.includes(m.e)) return;
        const key = ++k.current;
        setBits((b) => [...b.slice(-24), { k: key, e: m.e, x: 8 + Math.random() * 84 }]);
        setTimeout(() => setBits((b) => b.filter((x) => x.k !== key)), 2600);
      }),
    [on],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <span key={b.k} className="event-float absolute bottom-24 text-3xl" style={{ left: `${b.x}%` }}>
          {b.e}
        </span>
      ))}
    </div>
  );
}

/**
 * New messages pop out of the chat and float up the room (wobbling a little, with the sender's
 * face) before they fade, so everyone sees what's said. A few at a time.
 */
export function FloatingChat({ on, me, people }: { on: (fn: (m: RoomMsg) => void) => () => void; me: RoomMe; people: Pick<RoomPerson, "id" | "name" | "avatar">[] }) {
  const [bubbles, setBubbles] = useState<{ k: string; from: string; name: string; text: string; image: boolean; x: number; tilt: number }[]>([]);
  const peopleRef = useRef(people);
  useEffect(() => {
    peopleRef.current = people;
  });
  useEffect(
    () =>
      on((m) => {
        if (m.t !== "chat") return;
        const k = m.id;
        const b = { k, from: m.from, name: m.from === me.id ? "You" : m.name, text: m.text, image: !!m.image, x: 6 + Math.random() * 40, tilt: Math.random() * 8 - 4 };
        setBubbles((list) => [...list.filter((x) => x.k !== k).slice(-5), b]);
        setTimeout(() => setBubbles((list) => list.filter((x) => x.k !== k)), 4200);
      }),
    [on, me.id],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bubbles.map((b) => {
        const p = peopleRef.current.find((x) => x.id === b.from);
        return (
          <div key={b.k} className="event-chat-rise absolute bottom-40 flex max-w-[70%] items-end gap-1.5" style={{ left: `${b.x}%`, ["--tilt" as string]: `${b.tilt}deg` }}>
            <AvatarFace avatar={cleanAvatar(p?.avatar, b.name)} size={30} className="shrink-0 rounded-full ring-2 ring-white" />
            <span className="rounded-2xl rounded-bl-md bg-white px-3 py-1.5 text-[13px] font-semibold text-ink shadow-xl">
              <b className="block text-[10px] text-[#d6336c]">{b.name}</b>
              {b.image ? "📷 Photo" : b.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A row of reaction buttons. */
export function ReactBar({ me, send }: { me: RoomMe; send: (m: RoomMsg) => void }) {
  const last = useRef(0);
  return (
    <div className="flex gap-1">
      {REACTIONS.map((e) => (
        <button
          key={e}
          onClick={() => {
            // A few a second at most.
            if (Date.now() - last.current < 250) return;
            last.current = Date.now();
            send({ t: "react", from: me.id, e });
          }}
          className="grid size-9 place-items-center rounded-full bg-white/15 text-lg transition active:scale-90"
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

const EMOJIS = ["😀", "😂", "🤣", "😊", "😍", "😎", "🤩", "🥳", "😅", "😭", "🔥", "💯", "🎉", "🎊", "💃", "🕺", "🎶", "🎵", "🪩", "🥂", "🍾", "🍗", "🍲", "🍺", "👑", "💸", "💰", "❤️", "😘", "🙌", "👏", "🙏", "💪", "👀", "😮", "🤝", "✨", "🇳🇬", "🎂", "🎁"];

/** A photo, shrunk on the phone (longest side 1080, JPEG) so it's quick to send on any network. */
export async function shrinkPhoto(file: File, side = 1080, maxBytes = 580_000): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("not a picture"));
      i.src = url;
    });
    let k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    for (let tries = 0; tries < 4; tries++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * k);
      canvas.height = Math.round(img.naturalHeight * k);
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("no picture"))), "image/jpeg", 0.8));
      if (blob.size <= maxBytes) return blob;
      k *= 0.75;
    }
    throw new Error("too big");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The room's chat: the last lines (tap one to reply, react or delete it), and a box to say
 * something with emojis or a photo.
 */
export function RoomChat({
  eventId,
  me,
  hostId,
  lines,
  send,
  onPerson,
  onMessage,
  compact,
}: {
  eventId: number;
  me: RoomMe;
  hostId: string;
  lines: ChatLine[];
  send: (m: RoomMsg) => void;
  onPerson?: (id: string) => void;
  onMessage?: (text: string, good: boolean) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [reply, setReply] = useState<Quote | null>(null);
  const [emojis, setEmojis] = useState(false);
  const [sending, setSending] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = useRef(0);
  const count = lines.length;
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [count]);

  const say = (body: string, image: string | null) => {
    send({ t: "chat", id: randomKey(), from: me.id, name: me.name, text: body, image, reply, at: Date.now() });
    setReply(null);
  };
  const go = () => {
    const t = text.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!t || Date.now() - last.current < 800) return;
    last.current = Date.now();
    say(t, null);
    setText("");
    setEmojis(false);
  };
  const photo = async (file: File | undefined) => {
    if (!file) return;
    setSending(true);
    try {
      const body = new FormData();
      body.set("id", String(eventId));
      body.set("photo", await shrinkPhoto(file), "photo.jpg");
      const r = (await fetch("/api/events/photo", { method: "POST", body }).then((res) => res.json())) as { ok: boolean; url?: string; error?: string };
      if (!r.ok || !r.url) onMessage?.(r.error ?? "Couldn't send that photo.", false);
      else say(text.replace(/\s+/g, " ").trim().slice(0, 300), r.url);
      if (r.ok) setText("");
    } catch {
      onMessage?.("That photo couldn't be used. Try a JPG or PNG.", false);
    }
    setSending(false);
  };

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div ref={box} className={cn("min-h-0 space-y-1 overflow-y-auto pr-1 [scrollbar-width:none]", compact ? "max-h-28" : "max-h-44")}>
        {lines.length === 0 && <p className="text-xs text-white/60">Say hi to the room.</p>}
        {lines.map((l) => {
          const mine = l.from === me.id;
          const open = picked === l.id;
          const reacts = Object.entries(l.reactions);
          return (
            <div key={l.id} className="event-pop-in">
              <button
                onClick={() => !l.deleted && setPicked(open ? null : l.id)}
                className={cn("block w-full rounded-xl px-1.5 py-0.5 text-left text-[13px] leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,.6)]", open && "bg-white/15")}
              >
                {l.reply && !l.deleted && (
                  <span className="mb-0.5 block truncate border-l-2 border-gold/70 pl-1.5 text-[11px] text-white/65">
                    {l.reply.name}: {l.reply.text || "📷 Photo"}
                  </span>
                )}
                <span
                  role="link"
                  onClick={(e) => {
                    if (mine || !onPerson) return;
                    e.stopPropagation();
                    onPerson(l.from);
                  }}
                  className="font-bold text-gold"
                >
                  {mine ? "You" : l.name}
                </span>{" "}
                {l.deleted ? <i className="text-white/50">Message deleted</i> : l.text}
                {l.image && !l.deleted && (
                  <span
                    role="img"
                    aria-label="Photo"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBig(l.image);
                    }}
                    className="mt-1 block h-28 w-36 rounded-xl bg-cover bg-center ring-1 ring-white/30"
                    style={{ backgroundImage: `url("${l.image}")` }}
                  />
                )}
                {reacts.length > 0 && (
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {reacts.map(([e, who]) => (
                      <span key={e} className={cn("rounded-full px-1.5 text-[11px]", who.includes(me.id) ? "bg-gold/40" : "bg-white/15")}>
                        {e} {who.length}
                      </span>
                    ))}
                  </span>
                )}
              </button>
              {open && (
                <div className="toast-in mt-1 flex flex-wrap items-center gap-1 pl-1">
                  {REACTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        send({ t: "mreact", id: l.id, e, from: me.id });
                        setPicked(null);
                      }}
                      className="grid size-8 place-items-center rounded-full bg-white/20 text-base"
                      aria-label={`React ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setReply({ id: l.id, name: mine ? "You" : l.name, text: l.text.slice(0, 120) });
                      setPicked(null);
                      input.current?.focus();
                    }}
                    className="flex h-8 items-center gap-1 rounded-full bg-white/20 px-2.5 text-xs font-bold"
                  >
                    <CornerUpLeft className="size-3.5" /> Reply
                  </button>
                  {(mine || me.id === hostId) && (
                    <button
                      onClick={() => {
                        send({ t: "del", id: l.id, from: me.id });
                        setPicked(null);
                      }}
                      className="flex h-8 items-center gap-1 rounded-full bg-hit/80 px-2.5 text-xs font-bold"
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {reply && (
        <div className="flex items-center gap-2 rounded-xl bg-white/15 px-2.5 py-1 text-xs">
          <CornerUpLeft className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Replying to <b>{reply.name}</b>: {reply.text || "📷 Photo"}
          </span>
          <button onClick={() => setReply(null)} aria-label="Cancel the reply">
            <X className="size-4" />
          </button>
        </div>
      )}
      {emojis && (
        <div className="grid grid-cols-10 gap-0.5 rounded-2xl bg-white/15 p-1.5">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setText((t) => (t + e).slice(0, 300))} className="grid aspect-square place-items-center rounded-lg text-lg active:bg-white/20">
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex h-10 items-center gap-1 rounded-full bg-white/15 pl-1 pr-1"
      >
        <button type="button" onClick={() => setEmojis((v) => !v)} className={cn("grid size-8 shrink-0 place-items-center rounded-full", emojis && "bg-white/20")} aria-label="Emojis">
          {emojis ? <SmilePlus className="size-5" /> : <Smile className="size-5" />}
        </button>
        <label className={cn("grid size-8 shrink-0 cursor-pointer place-items-center rounded-full", sending && "pointer-events-none opacity-60")} aria-label="Send a photo">
          {sending ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const el = e.currentTarget;
              void photo(el.files?.[0]).finally(() => {
                el.value = "";
              });
            }}
          />
        </label>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder="Say something…" className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/55" enterKeyHint="send" />
        <button type="submit" disabled={!text.trim()} className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-ink disabled:opacity-40" aria-label="Send">
          <Send className="size-4" />
        </button>
      </form>
      {big && (
        <OnTop as="button" onClick={() => setBig(null)} className="fixed inset-0 grid place-items-center bg-black/85 p-4" aria-label="Close the photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        </OnTop>
      )}
    </div>
  );
}

/** A face in the room (tap to see who it is). */
export function Face({ p, size = 40, onPerson, ring, bob, move, label = true }: { p: Pick<RoomPerson, "id" | "name" | "avatar">; size?: number; onPerson?: (id: string) => void; ring?: string; bob?: number; move?: string | null; label?: boolean }) {
  return (
    <button onClick={() => onPerson?.(p.id)} className="flex flex-col items-center gap-0.5" title={p.name} style={!move && bob !== undefined ? { animation: `event-bob 0.9s ease-in-out ${bob}s infinite` } : undefined}>
      <span className={cn("block rounded-full", move && `event-move-${move}`)}>
        <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={size} className={cn("rounded-full ring-2", ring ?? "ring-white/70")} />
      </span>
      {label && <span className="max-w-[4.5rem] truncate text-[10px] font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,.7)]">{p.name}</span>}
    </button>
  );
}

/** A small pop-up panel inside a room (over its bottom part). */
export function RoomPanel({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="toast-in absolute inset-x-2 bottom-2 z-20 max-h-[75%] overflow-y-auto rounded-3xl bg-panel p-4 text-ink shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-display text-lg font-extrabold">{title}</p>
        <button onClick={onClose} className="h-8 rounded-full bg-ink/5 px-3 text-xs font-bold">
          Close
        </button>
      </div>
      {children}
    </div>
  );
}

/** Everyone in the room, searchable (for a big crowd): tap someone for their card. */
export function WhoPanel({ people, me, hostId, onPerson, onClose }: { people: RoomPerson[]; me: RoomMe; hostId: string; onPerson: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase();
  const shown = people.filter((p) => !words || p.name.toLowerCase().includes(words)).slice(0, 200);
  return (
    <RoomPanel title={`Who's here · ${people.length.toLocaleString("en-GB")}`} onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} placeholder="Find someone" className="mb-2 h-10 w-full rounded-full bg-ink/5 px-4 text-sm outline-none" />
      <div className="grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-5">
        {shown.map((p) => (
          <button key={p.id} onClick={() => p.id !== me.id && onPerson(p.id)} className="flex flex-col items-center gap-0.5">
            <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={44} className={cn("rounded-full ring-2", p.id === hostId ? "ring-gold" : "ring-ink/10")} />
            <span className="max-w-full truncate text-[11px] font-semibold">{p.id === me.id ? "You" : p.name}</span>
            {p.id === hostId && <span className="text-[10px] text-muted">👑 Host</span>}
          </button>
        ))}
      </div>
      {people.length > shown.length && <p className="mt-2 text-center text-xs text-muted">Type a name to find someone among everyone here.</p>}
    </RoomPanel>
  );
}

/** If anything in a room goes wrong, only the room closes (with a way back in), never the game. */
export class RoomGuard extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Event room error", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#12101c] p-6 text-center text-white">
        <div>
          <p className="text-4xl">🎈</p>
          <p className="mt-2 font-display text-lg font-extrabold">The room hiccupped</p>
          <p className="text-sm text-white/70">You&apos;re still in. Open it again to carry on.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => this.setState({ failed: false })} className="h-11 rounded-full bg-white px-5 text-sm font-bold text-ink">
              Open it again
            </button>
            <button onClick={this.props.onClose} className="h-11 rounded-full bg-white/15 px-5 text-sm font-bold">
              Back to the map
            </button>
          </div>
        </div>
      </div>
    );
  }
}
