"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Landmark, Send } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import type { TownMessage } from "@/app/api/town-hall/route";
import { prefetchCard, rememberPreviews } from "./people/card-cache";
import { Sheet } from "./sheet";

// Town Hall (game-db/085): one chat for the whole state that everyone online can talk in. The
// floating button above the chat bubble opens it. Messages come from GET /api/town-hall every few
// seconds while it's open (the same answer for everyone, so it's cheap however many are in).

/** The newest message seen when the Town Hall was last open (the button's dot). */
const SEEN_KEY = "newtown.townhall.seen";
export function townSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
function markSeen(id: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // Not kept: the dot may come back next visit.
  }
}

export async function townMessages(region: string): Promise<TownMessage[] | null> {
  const r = await fetch(`/api/town-hall?region=${encodeURIComponent(region)}`).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as { messages?: TownMessage[]; off?: boolean } | null;
  return d?.off ? null : (d?.messages ?? []);
}

const ago = (ms: number) => (ms < 60_000 ? "now" : ms < 3_600_000 ? `${Math.floor(ms / 60_000)}m` : ms < 86_400_000 ? `${Math.floor(ms / 3_600_000)}h` : `${Math.floor(ms / 86_400_000)}d`);

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
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Mine that the server hasn't listed yet (shown at once).
  const [mine, setMine] = useState<TownMessage[]>([]);
  /** The clock for "2m ago", moved on with every look. */
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const got = await townMessages(region);
    if (got === null) return setList((l) => (l === null ? "off" : l));
    rememberPreviews(got.map((m) => ({ id: m.from, name: m.name, avatar: m.avatar })));
    setNow(Date.now());
    setList(got);
    setMine((m) => m.filter((x) => !got.some((g) => g.id === x.id)));
    if (got.length) markSeen(got[got.length - 1].id);
  }, [region]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 3_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const shown = Array.isArray(list) ? [...list, ...mine.filter((x) => !list.some((g) => g.id === x.id))] : mine;
  // Keep the newest in view (unless you've scrolled up to read).
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/town-hall", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ region, text: t }) })
      .then((x) => x.json() as Promise<{ ok: boolean; error?: string; message?: TownMessage }>)
      .catch(() => ({ ok: false, error: "The connection blinked. Try again." }) as { ok: false; error: string; message?: undefined });
    setBusy(false);
    if (!r.ok || !r.message) return setError(r.error ?? "Couldn't send. Try again.");
    setText("");
    stick.current = true;
    setMine((m) => [...m, { ...r.message!, avatar: me.avatar }]);
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
      <p className="-mt-1 text-xs text-muted">Everyone online in {state} sees what you say here. Be kind; tap a name to see who it is.</p>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="mt-3 h-[min(50dvh,26rem)] space-y-2.5 overflow-y-auto rounded-2xl bg-ink/[0.03] p-3"
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
            return (
              <div key={m.id} className={`flex items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
                <button onPointerDown={() => prefetchCard(m.from)} onClick={() => onPerson(m.from)} className="shrink-0" aria-label={`${m.name}'s card`}>
                  <AvatarFace avatar={cleanAvatar(m.avatar, m.name)} size={28} className="rounded-full" />
                </button>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${own ? "bg-[#e8590c] text-white" : "bg-panel shadow-sm ring-1 ring-ink/5"}`}>
                  {!own && (
                    <button onPointerDown={() => prefetchCard(m.from)} onClick={() => onPerson(m.from)} className="block text-[11px] font-bold text-[#e8590c]">
                      {m.name}
                    </button>
                  )}
                  <span className="whitespace-pre-wrap break-words">{m.text}</span>
                  <span className={`ml-1.5 text-[10px] ${own ? "text-white/70" : "text-muted"}`}>{ago(Math.max(0, now - Date.parse(m.at)))}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={`Talk to ${state}…`}
          className="h-11 min-w-0 flex-1 rounded-full bg-ink/5 px-4 text-base outline-none ring-[#e8590c] focus:ring-2"
          aria-label="Your message to the Town Hall"
          enterKeyHint="send"
        />
        <button disabled={busy || !text.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-[#e8590c] text-white disabled:opacity-40" aria-label="Send">
          <Send className="size-5" />
        </button>
      </form>
      {error && <p className="mt-1.5 text-xs font-semibold text-hit">{error}</p>}
    </Sheet>
  );
}
