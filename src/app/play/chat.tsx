"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { loadChat, sendMessage, sendVoice, voiceUrl, type ChatMessage } from "./chat-actions";

// In-game chat: one public "City" room per round, plus private messages between players.
// Text and voice notes. Everything resets when a new map (round) starts.

const ROLE_STYLE: Record<ChatMessage["sender_role"], { label: string; pill: string }> = {
  hider: { label: "Hider", pill: "bg-me/15 text-me" },
  seeker: { label: "Seeker", pill: "bg-gold/25 text-gold-dark" },
  watcher: { label: "Watching", pill: "bg-panel-2 text-muted" },
};

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function Chat({ meId, roundId, open, onOpenChange }: { meId: string; roundId: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedRound, setLoadedRound] = useState<number | null>(null);
  const [thread, setThread] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<"city" | "private">("city");
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const add = useCallback((m: ChatMessage) => {
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m].slice(-400)));
  }, []);

  // Load this round's messages and listen for new ones. A new round starts a fresh chat.
  useEffect(() => {
    let cancelled = false;
    loadChat().then((res) => {
      if (cancelled || !res.ok) return;
      setMessages(res.messages);
      setLoadedRound(res.roundId);
    });
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `round_id=eq.${roundId}` },
        (payload) => add(payload.new as ChatMessage),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roundId, add]);

  const current = useMemo(
    () => (loadedRound === roundId ? messages.filter((m) => m.round_id === roundId) : []),
    [messages, loadedRound, roundId],
  );
  const publicMsgs = current.filter((m) => !m.recipient_id);
  const conversations = useMemo(() => {
    const map = new Map<string, { id: string; name: string; last: ChatMessage; count: number }>();
    for (const m of current) {
      if (!m.recipient_id) continue;
      const otherId = m.sender_id === meId ? m.recipient_id : m.sender_id;
      const name = m.sender_id === meId ? m.recipient_name : m.sender_name;
      const prev = map.get(otherId);
      map.set(otherId, { id: otherId, name: name || prev?.name || "Player", last: m, count: (prev?.count ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.last.id - a.last.id);
  }, [current, meId]);

  const threadMsgs = thread
    ? current.filter((m) => m.recipient_id && (m.sender_id === thread.id || m.recipient_id === thread.id))
    : [];
  const shown = thread ? threadMsgs : publicMsgs;

  // Unread counts (what arrived since you last looked at each room).
  const lastId = (list: ChatMessage[]) => list.at(-1)?.id ?? 0;
  const key = thread ? `dm:${thread.id}` : "city";
  const visibleKey = open && (tab === "city" || thread) ? key : null;
  const newest = lastId(shown);
  useEffect(() => {
    if (!visibleKey) return;
    // Mark as read once it has been on screen.
    const id = requestAnimationFrame(() => setSeen((s) => ({ ...s, [visibleKey]: newest })));
    return () => cancelAnimationFrame(id);
  }, [visibleKey, newest]);
  const unreadCity = publicMsgs.filter((m) => m.id > (seen.city ?? 0) && m.sender_id !== meId).length;
  const unreadDm = conversations.reduce(
    (n, c) => n + current.filter((m) => m.recipient_id === meId && m.sender_id === c.id && m.id > (seen[`dm:${c.id}`] ?? 0)).length,
    0,
  );
  const unread = unreadCity + unreadDm;

  async function send(text: string) {
    setError(null);
    const res = await sendMessage(text, thread?.id ?? null);
    if (res.ok) add(res.message);
    else setError(res.error);
    return res.ok;
  }

  async function sendAudio(blob: Blob, seconds: number) {
    setError(null);
    const form = new FormData();
    form.set("audio", blob);
    form.set("seconds", String(seconds));
    if (thread) form.set("to", thread.id);
    const res = await sendVoice(form);
    if (res.ok) add(res.message);
    else setError(res.error);
  }

  function openThread(id: string, name: string) {
    if (id === meId) return;
    setThread({ id, name });
    setTab("private");
  }

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        className="glass pointer-events-auto relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
        Chat
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-hit px-1 text-[11px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <section className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex h-[75dvh] bg-panel shadow-[0_-8px_40px_-12px_rgb(24_32_43/0.35)] flex-col rounded-t-3xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[min(640px,calc(100dvh-7rem))] sm:w-96 sm:rounded-3xl">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        {thread ? (
          <>
            <button onClick={() => setThread(null)} className="-ml-1 rounded-full px-2 py-1 text-muted hover:bg-panel-2" aria-label="Back">
              ←
            </button>
            <h2 className="flex-1 truncate font-semibold">{thread.name}</h2>
            <span className="text-xs text-muted">Private</span>
          </>
        ) : (
          <div className="flex flex-1 gap-1 rounded-xl bg-panel-2 p-1 text-sm font-semibold">
            {(["city", "private"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn("flex-1 rounded-lg py-1.5", tab === t ? "bg-panel shadow-sm" : "text-muted")}
              >
                {t === "city" ? "City" : "Private"}
                {t === "city" && unreadCity > 0 && <span className="ml-1 text-hit">•</span>}
                {t === "private" && unreadDm > 0 && <span className="ml-1 text-hit">•</span>}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => onOpenChange(false)} className="rounded-full px-2 py-1 text-lg text-muted hover:bg-panel-2" aria-label="Close chat">
          ×
        </button>
      </header>

      {!thread && tab === "private" ? (
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              No private chats yet. Tap someone&apos;s name in the City chat to message them.
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setThread({ id: c.id, name: c.name })}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel-2"
              >
                <Avatar name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{c.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {c.last.sender_id === meId ? "You: " : ""}
                    {c.last.body ?? "🎤 Voice note"}
                  </span>
                </span>
                <span className="text-xs text-muted">{time(c.last.created_at)}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <Messages list={shown} meId={meId} onName={openThread} isPrivate={Boolean(thread)} />
      )}

      {(thread || tab === "city") && (
        <Composer onSend={send} onAudio={sendAudio} placeholder={thread ? `Message ${thread.name}` : "Message the city"} />
      )}
      {error && <p className="px-4 pb-2 text-xs text-hit">{error}</p>}
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
      style={{ background: `hsl(${hue} 55% 55%)` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Messages({
  list,
  meId,
  onName,
  isPrivate,
}: {
  list: ChatMessage[];
  meId: string;
  onName: (id: string, name: string) => void;
  isPrivate: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [list.length]);

  if (!list.length) {
    return (
      <p className="flex-1 p-6 text-center text-sm text-muted">
        {isPrivate ? "Say hello. Only the two of you can see this." : "No messages yet this round. Say something!"}
      </p>
    );
  }
  return (
    <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
      {list.map((m, i) => {
        const mine = m.sender_id === meId;
        const sameAsPrev = list[i - 1]?.sender_id === m.sender_id;
        const role = ROLE_STYLE[m.sender_role];
        return (
          <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
            {!mine && !sameAsPrev && (
              <button onClick={() => onName(m.sender_id, m.sender_name)} className="mb-0.5 flex items-center gap-1.5 px-1 text-xs" title="Message privately">
                <span className="font-semibold">{m.sender_name}</span>
                <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", role.pill)}>{role.label}</span>
              </button>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-panel",
                !mine && m.sender_role === "hider" && "border-l-4 border-me",
                !mine && m.sender_role === "seeker" && "border-l-4 border-gold",
              )}
            >
              {m.audio_path ? <VoiceNote id={m.id} seconds={m.audio_seconds ?? 0} mine={mine} /> : <span className="break-words">{m.body}</span>}
              <span className={cn("ml-2 align-bottom text-[10px]", mine ? "text-white/60" : "text-muted")}>{time(m.created_at)}</span>
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

function VoiceNote({ id, seconds, mine }: { id: number; seconds: number; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [progress, setProgress] = useState(0);

  async function toggle() {
    if (state === "playing") {
      audio.current?.pause();
      return setState("idle");
    }
    if (!audio.current) {
      setState("loading");
      const res = await voiceUrl(id);
      if (!res.ok) return setState("idle");
      const a = new Audio(res.url);
      a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
      a.onended = () => {
        setState("idle");
        setProgress(0);
      };
      audio.current = a;
    }
    await audio.current.play().catch(() => setState("idle"));
    setState("playing");
  }

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <button
        onClick={toggle}
        className={cn("grid size-7 place-items-center rounded-full", mine ? "bg-white/20" : "bg-panel-2")}
        aria-label={state === "playing" ? "Pause" : "Play voice note"}
      >
        {state === "playing" ? "❚❚" : state === "loading" ? "…" : "▶"}
      </button>
      <span className={cn("relative h-1 w-24 overflow-hidden rounded-full", mine ? "bg-white/25" : "bg-line")}>
        <span className={cn("absolute inset-y-0 left-0", mine ? "bg-white" : "bg-ink")} style={{ width: `${progress * 100}%` }} />
      </span>
      <span className="tabular-nums text-xs">0:{String(seconds).padStart(2, "0")}</span>
    </span>
  );
}

function Composer({
  onSend,
  onAudio,
  placeholder,
}: {
  onSend: (text: string) => Promise<boolean>;
  onAudio: (blob: Blob, seconds: number) => Promise<void>;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setSeconds(s);
      if (s >= 60) recorder.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await onSend(text)) setText("");
    setBusy(false);
  }

  async function startRecording() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const secs = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        if (cancelled.current || !chunks.length) return;
        setBusy(true);
        await onAudio(new Blob(chunks, { type: rec.mimeType.split(";")[0] }), Math.min(60, secs));
        setBusy(false);
      };
      cancelled.current = false;
      started.current = Date.now();
      setSeconds(0);
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      setMicError("Allow the microphone to send voice notes.");
    }
  }

  function stop(cancel: boolean) {
    cancelled.current = cancel;
    recorder.current?.stop();
  }

  return (
    <div className="border-t border-line p-2.5">
      {recording ? (
        <div className="flex items-center gap-2">
          <button onClick={() => stop(true)} className="rounded-full px-3 py-2 text-sm text-muted hover:bg-panel-2">
            Cancel
          </button>
          <span className="flex flex-1 items-center gap-2 text-sm">
            <span className="size-2.5 animate-pulse rounded-full bg-hit" />
            Recording 0:{String(seconds).padStart(2, "0")} / 1:00
          </span>
          <button onClick={() => stop(false)} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
            Send
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-full border border-line bg-panel px-4 py-2 text-sm outline-none focus:border-gold"
          />
          {text.trim() ? (
            <button disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Send
            </button>
          ) : (
            <button type="button" onClick={startRecording} disabled={busy} className="grid size-9 place-items-center rounded-full bg-panel-2" aria-label="Record a voice note">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          )}
        </form>
      )}
      {micError && <p className="mt-1 text-xs text-hit">{micError}</p>}
    </div>
  );
}
