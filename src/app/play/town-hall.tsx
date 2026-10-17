"use client";

import { OnTop } from "./on-top";
import { useCallback, useEffect, useRef, useState } from "react";
import { CornerUpLeft, ImagePlus, Landmark, Send, Smile, SmilePlus, Trash2, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import type { TownMessage } from "@/app/api/town-hall/route";
import { prefetchCard, rememberPreviews } from "./people/card-cache";
import { Sheet } from "./sheet";
import { whileHere } from "./activity";

// Town Hall (game-db/085, 086): one chat for the whole state that everyone online can talk in.
// The floating button above the chat bubble opens it. Messages come from GET /api/town-hall every
// few seconds while it's open (the same answer for everyone, so it's cheap however many are in).
// Tap a message to reply, react or delete it. Emojis and photos too. Everything goes after a day.

/** The newest message seen when the Town Hall was last open (the button's dot). */
const SEEN_KEY = "newtown.townhall.seen";
/** Messages you deleted that were someone else's (hidden for you), and your reactions. */
const HIDDEN_KEY = "newtown.townhall.hidden";
const MINE_KEY = "newtown.townhall.reacted";

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept: fine for this visit.
  }
}
export function townSeen(): number {
  return Number(readJson(SEEN_KEY, 0)) || 0;
}

export async function townMessages(region: string): Promise<TownMessage[] | null> {
  const r = await fetch(`/api/town-hall?region=${encodeURIComponent(region)}`).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as { messages?: TownMessage[]; off?: boolean } | null;
  return d?.off ? null : (d?.messages ?? []);
}

const ago = (ms: number) => (ms < 60_000 ? "now" : ms < 3_600_000 ? `${Math.floor(ms / 60_000)}m` : `${Math.floor(ms / 3_600_000)}h`);

/** The quick reactions, and the emojis to type with. */
const REACT = ["👍", "😂", "❤️", "🔥", "😮", "🙏"];
const EMOJIS = ["😀", "😂", "🤣", "😊", "😍", "😎", "🤩", "🥳", "😅", "😭", "😡", "🤔", "🙄", "😴", "🤝", "👏", "🙌", "💪", "👍", "👎", "🙏", "❤️", "💔", "🔥", "✨", "🎉", "💯", "💸", "💰", "🏠", "🚗", "🍗", "🍲", "🍺", "⚽", "🎶", "📍", "🇳🇬", "👀", "😮"];

/** A photo, shrunk on the phone (longest side 1080, JPEG) so it's quick to send on any network. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("not a picture"));
      i.src = url;
    });
    const k = Math.min(1, 1080 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("no picture"))), "image/jpeg", 0.78));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TownHall({
  region,
  state,
  me,
  onPerson,
  onClose,
}: {
  region: string;
  /** The state's name ("Lagos State"). */
  state: string;
  me: { id: string; name: string; avatar: unknown };
  onPerson: (id: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<TownMessage[] | null | "off">(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  /** Mine that the server hasn't listed yet (shown at once). */
  const [mine, setMine] = useState<TownMessage[]>([]);
  /** The clock for "2m ago", moved on with every look. */
  const [now, setNow] = useState(() => Date.now());
  /** The message tapped (its actions open), the one being answered, emojis open, a photo full size. */
  const [picked, setPicked] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<TownMessage | null>(null);
  const [emojis, setEmojis] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const [hidden, setHidden] = useState<number[]>(() => readJson<number[]>(HIDDEN_KEY, []));
  const [reacted, setReacted] = useState<Record<string, string>>(() => readJson<Record<string, string>>(MINE_KEY, {}));
  /** Reactions just tapped, before the server's next answer counts them. */
  const [pending, setPending] = useState<Record<number, { from: string | null; to: string | null }>>({});

  const load = useCallback(async () => {
    const got = await townMessages(region);
    if (got === null) return setList((l) => (l === null ? "off" : l));
    rememberPreviews(got.map((m) => ({ id: m.from, name: m.name, avatar: m.avatar })));
    setNow(Date.now());
    setList(got);
    setPending({});
    setMine((m) => m.filter((x) => !got.some((g) => g.id === x.id)));
    if (got.length) writeJson(SEEN_KEY, got[got.length - 1].id);
  }, [region]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const stop = whileHere(() => void load(), 6_000);
    return () => {
      clearTimeout(first);
      stop();
    };
  }, [load]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3_500);
    return () => clearTimeout(t);
  }, [note]);

  const all = Array.isArray(list) ? [...list, ...mine.filter((x) => !list.some((g) => g.id === x.id))] : mine;
  const shown = all.filter((m) => !hidden.includes(m.id));
  // Keep the newest in view (unless you've scrolled up to read).
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const post = async (photo?: Blob) => {
    const t = text.trim();
    if ((!t && !photo) || busy) return;
    setBusy(true);
    setError(null);
    let req: RequestInit;
    if (photo) {
      const form = new FormData();
      form.set("region", region);
      form.set("text", t);
      if (replyTo) form.set("reply", String(replyTo.id));
      form.set("photo", photo, "photo.jpg");
      req = { method: "POST", body: form };
    } else {
      req = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ region, text: t, reply: replyTo?.id ?? null }) };
    }
    const r = await fetch("/api/town-hall", req)
      .then((x) => x.json() as Promise<{ ok: boolean; error?: string; message?: TownMessage }>)
      .catch(() => ({ ok: false, error: "The connection blinked. Try again." }) as { ok: false; error: string; message?: undefined });
    setBusy(false);
    if (!r.ok || !r.message) return setError(r.error ?? "Couldn't send. Try again.");
    setText("");
    setEmojis(false);
    stick.current = true;
    const reply = replyTo ? { id: replyTo.id, name: replyTo.name, text: replyTo.text.slice(0, 90) } : null;
    setReplyTo(null);
    setMine((m) => [...m, { ...r.message!, avatar: me.avatar, reply }]);
  };

  const react = (m: TownMessage, emoji: string) => {
    setPicked(null);
    const key = String(m.id);
    const was = reacted[key] ?? null;
    const to = was === emoji ? null : emoji;
    const next = { ...reacted };
    if (to) next[key] = to;
    else delete next[key];
    setReacted(next);
    writeJson(MINE_KEY, next);
    setPending((p) => ({ ...p, [m.id]: { from: was, to } }));
    void fetch("/api/town-hall/react", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id, emoji: to }) })
      .then((x) => x.json() as Promise<{ ok: boolean; error?: string }>)
      .then((x) => !x.ok && setError(x.error ?? "Couldn't react."))
      .catch(() => {});
  };

  const remove = async (m: TownMessage) => {
    setPicked(null);
    const own = m.from === me.id;
    if (!window.confirm(own ? "Delete your message for everyone?" : "Delete this message? It's hidden for you, and gone for everyone once 3 people delete it.")) return;
    const next = [...hidden, m.id].slice(-300);
    setHidden(next);
    writeJson(HIDDEN_KEY, next);
    const r = (await fetch("/api/town-hall/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id }) })
      .then((x) => x.json())
      .catch(() => null)) as { ok: boolean; result?: string; error?: string } | null;
    if (r?.ok) setNote(r.result === "hidden" ? "Deleted for you." : r.result === "removed" ? "Deleted for everyone (3 people deleted it)." : "Deleted for everyone.");
    else if (r?.error) setError(r.error);
  };

  /** A message's reactions, with yours just tapped counted straight away. */
  const counts = (m: TownMessage) => {
    const c: Record<string, number> = { ...m.reactions };
    const p = pending[m.id];
    if (p) {
      if (p.from && c[p.from]) c[p.from] = Math.max(0, c[p.from] - 1);
      if (p.to) c[p.to] = (c[p.to] ?? 0) + 1;
    }
    return Object.entries(c).filter(([, n]) => n > 0);
  };

  return (
    <Sheet
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Landmark className="size-5 text-[#e8590c]" /> Town Hall
        </span>
      }
    >
      <p className="-mt-1 text-xs text-muted">Everyone online in {state} sees this. Tap a message to reply, react or delete it. Messages go after 24 hours.</p>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="mt-3 h-[min(50dvh,26rem)] space-y-3 overflow-y-auto rounded-2xl bg-ink/[0.03] p-3"
      >
        {list === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-10 animate-pulse rounded-2xl bg-ink/5" />
            ))}
          </div>
        ) : list === "off" ? (
          <p className="py-10 text-center text-sm text-muted">The Town Hall opens soon.</p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Quiet in here. Say hello to {state}!</p>
        ) : (
          shown.map((m) => {
            const own = m.from === me.id;
            const photoOnly = !!m.image && m.text === "📷";
            const chips = counts(m);
            const open = picked === m.id;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
                <button onPointerDown={() => prefetchCard(m.from)} onClick={() => onPerson(m.from)} className="shrink-0" aria-label={`${m.name}'s card`}>
                  <AvatarFace avatar={cleanAvatar(m.avatar, m.name)} size={28} className="rounded-full" />
                </button>
                <div className={`flex max-w-[80%] flex-col ${own ? "items-end" : "items-start"}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setPicked(open ? null : m.id)}
                    onKeyDown={(e) => e.key === "Enter" && setPicked(open ? null : m.id)}
                    className={`cursor-pointer rounded-2xl px-3 py-1.5 text-sm ${own ? "bg-[#e8590c] text-white" : "bg-panel shadow-sm ring-1 ring-ink/5"} ${open ? "ring-2 ring-gold" : ""}`}
                  >
                    {!own && (
                      <button
                        onPointerDown={() => prefetchCard(m.from)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPerson(m.from);
                        }}
                        className="block text-[11px] font-bold text-[#e8590c]"
                      >
                        {m.name}
                      </button>
                    )}
                    {m.reply && (
                      <span className={`mb-1 block border-l-2 pl-2 text-[11px] ${own ? "border-white/60 text-white/80" : "border-[#e8590c]/60 text-muted"}`}>
                        {m.reply.name && <b>{m.reply.name}: </b>}
                        <span className="line-clamp-2">{m.reply.text || "…"}</span>
                      </span>
                    )}
                    {m.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.image}
                        alt="A photo in the Town Hall"
                        loading="lazy"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBig(m.image);
                        }}
                        className="my-1 max-h-56 w-auto max-w-full rounded-xl object-cover"
                      />
                    )}
                    {!photoOnly && <span className="whitespace-pre-wrap break-words">{m.text}</span>}
                    <span className={`ml-1.5 text-[10px] ${own ? "text-white/70" : "text-muted"}`}>{ago(Math.max(0, now - Date.parse(m.at)))}</span>
                  </div>
                  {chips.length > 0 && (
                    <div className="-mt-1 flex flex-wrap gap-1">
                      {chips.map(([emoji, n]) => (
                        <button
                          key={emoji}
                          onClick={() => react(m, emoji)}
                          className={`rounded-full px-1.5 py-0.5 text-xs shadow-sm ring-1 ${reacted[String(m.id)] === emoji ? "bg-gold/30 ring-gold" : "bg-panel ring-ink/10"}`}
                        >
                          {emoji} <span className="tabular-nums text-[10px] font-semibold">{n}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {open && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 rounded-2xl bg-panel p-1 shadow-lg ring-1 ring-ink/10">
                      {REACT.map((e) => (
                        <button key={e} onClick={() => react(m, e)} className={`grid size-8 place-items-center rounded-full text-lg ${reacted[String(m.id)] === e ? "bg-gold/30" : "hover:bg-ink/5"}`} aria-label={`React ${e}`}>
                          {e}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setReplyTo(m);
                          setPicked(null);
                          input.current?.focus();
                        }}
                        className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-ink/5"
                      >
                        <CornerUpLeft className="size-3.5" /> Reply
                      </button>
                      <button onClick={() => void remove(m)} className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-hit hover:bg-hit/10">
                        <Trash2 className="size-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {note && <p className="mt-2 text-center text-xs font-semibold text-me">{note}</p>}
      {replyTo && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#e8590c]/10 px-3 py-1.5 text-xs">
          <CornerUpLeft className="size-3.5 shrink-0 text-[#e8590c]" />
          <span className="min-w-0 flex-1 truncate">
            Replying to <b>{replyTo.name}</b>: {replyTo.text === "📷" && replyTo.image ? "a photo" : replyTo.text}
          </span>
          <button onClick={() => setReplyTo(null)} aria-label="Don't reply">
            <X className="size-4 text-muted" />
          </button>
        </div>
      )}
      {emojis && (
        <div className="mt-2 grid grid-cols-10 gap-0.5 rounded-2xl bg-ink/[0.03] p-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setText((t) => (t + e).slice(0, 300));
                input.current?.focus();
              }}
              className="grid h-8 place-items-center rounded-lg text-lg hover:bg-ink/5"
              aria-label={e}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void post();
        }}
        className="mt-2 flex items-center gap-1.5"
      >
        <button type="button" onClick={() => setEmojis((v) => !v)} className={`grid size-10 shrink-0 place-items-center rounded-full ${emojis ? "bg-ink text-white" : "bg-ink/5"}`} aria-label="Emojis">
          {emojis ? <SmilePlus className="size-5" /> : <Smile className="size-5" />}
        </button>
        <button type="button" disabled={busy} onClick={() => pick.current?.click()} className="grid size-10 shrink-0 place-items-center rounded-full bg-ink/5 disabled:opacity-40" aria-label="Send a photo">
          <ImagePlus className="size-5" />
        </button>
        <input
          type="file"
          accept="image/*"
          ref={pick}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void shrink(f)
              .then((b) => post(b))
              .catch(() => setError("That file isn't a picture we can send."));
          }}
        />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={replyTo ? `Reply to ${replyTo.name}…` : `Talk to ${state}…`}
          className="h-10 min-w-0 flex-1 rounded-full bg-ink/5 px-4 text-base outline-none ring-[#e8590c] focus:ring-2"
          aria-label="Your message to the Town Hall"
          enterKeyHint="send"
        />
        <button disabled={busy || !text.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8590c] text-white disabled:opacity-40" aria-label="Send">
          <Send className="size-5" />
        </button>
      </form>
      {error && <p className="mt-1.5 text-xs font-semibold text-hit">{error}</p>}
      {big && (
        <OnTop as="button" onClick={() => setBig(null)} className="fixed inset-0 grid place-items-center bg-black/85 p-4" aria-label="Close the photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="A photo in the Town Hall" className="max-h-full max-w-full rounded-xl" />
        </OnTop>
      )}
    </Sheet>
  );
}
