"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Heart, Megaphone, Music, PartyPopper, Volume2, VolumeX, Wine } from "lucide-react";
import { cn } from "@/lib/cn";
import { ICEBREAKERS, MEET_PROMPTS, TOASTS, eventFormat, pick } from "@/lib/world/events";
import { cash } from "@/lib/world/value";
import { CallBar } from "../call/call-bar";
import { giveCoins } from "../gift-actions";
import { playLoop, stopLoop, VIBES, VIBE_BY_ID, type Vibe } from "../activities/synth";
import { playSfx } from "../sound";
import { randomKey, useEventRoom, useRoomList, type RoomMsg, type RoomPerson } from "./channel";
import type { EventView } from "./event-actions";
import { Face, FloatingReactions, ReactBar, RoomChat, RoomPanel, RoomTop, type RoomMe } from "./room-kit";

// A party (docs/EVENTS.md): everyone who's in shows on the dance floor, bobbing to the host's music.
// What it's for is people, not avatars: the hot seat (a question everyone answers), meeting someone
// new (two people paired with a starter), shout-outs, toasts everyone clinks, spraying the host,
// and a talk corner (a voice call for up to 6).

/** Spray amounts (mint). */
const SPRAYS = [1, 5, 20];
/** A new hot seat question at most this often (ms). */
const HOT_GAP = 45_000;

type Panel = null | "shout" | "toast" | "spray" | "music";

export function PartyRoom({
  view,
  me,
  onMin,
  onPerson,
  onMessage,
  onEnd,
}: {
  view: EventView;
  me: RoomMe;
  /** Back to the map (still in). */
  onMin: () => void;
  onPerson: (id: string) => void;
  onMessage: (text: string, good: boolean) => void;
  /** The host ends it. */
  onEnd: () => void;
}) {
  const host = view.me.host;
  const [vibe, setVibe] = useState<Vibe | null>(host ? "afrobeats" : null);
  const room = useEventRoom(view.id, { ...me, host }, vibe);
  const { here, send, on, setLooking } = room;
  const chat = useRoomList(on, "chat");
  const f = eventFormat(view.format);
  const [panel, setPanel] = useState<Panel>(null);

  // The music: the host's choice, played on every phone that has the sound on.
  const hostVibe = (here.find((p) => p.host)?.vibe ?? vibe) as Vibe | null;
  const [sound, setSound] = useState(true);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!sound || !hostVibe || !VIBE_BY_ID[hostVibe]) return;
    const stop = playLoop(hostVibe, { seconds: 3600, volume: 0.7, onBeat: (b) => setBeat(b) });
    return () => stop();
  }, [sound, hostVibe]);
  useEffect(() => () => stopLoop(), []);

  // Shout-outs: the newest shows big for a few seconds.
  const shouts = useRoomList(on, "shout", 6);
  const [shoutNow, setShoutNow] = useState<Extract<RoomMsg, { t: "shout" }> | null>(null);
  useEffect(() => {
    const s = shouts[shouts.length - 1];
    if (!s) return;
    setShoutNow(s);
    playSfx("chime");
    const t = setTimeout(() => setShoutNow((c) => (c === s ? null : c)), 7000);
    return () => clearTimeout(t);
  }, [shouts]);

  // Toasts: raise one, everyone clinks.
  const [toast, setToast] = useState<{ id: string; name: string; text: string; clinks: Set<string> } | null>(null);
  // The hot seat: a question, everyone's answers, and hearts.
  const [hot, setHot] = useState<{ id: string; q: number; by: string; at: number; answers: { from: string; name: string; text: string; love: Set<string> }[] } | null>(null);
  // Meeting someone new.
  const [looking, setLookingNow] = useState(false);
  const [pair, setPair] = useState<{ other: string; prompt: number } | null>(null);
  // Money raining when someone sprays.
  const [rain, setRain] = useState<{ k: string; name: string; amount: number } | null>(null);

  useEffect(
    () =>
      on((m) => {
        if (m.t === "toast") {
          setToast({ id: m.id, name: m.name, text: m.text, clinks: new Set() });
          playSfx("chime");
        } else if (m.t === "clink") setToast((t) => (t && t.id === m.id ? { ...t, clinks: new Set(t.clinks).add(m.from) } : t));
        else if (m.t === "hot") setHot({ id: m.id, q: m.q, by: m.by, at: Date.now(), answers: [] });
        else if (m.t === "ans")
          setHot((h) => (h && h.id === m.id ? { ...h, answers: [...h.answers.filter((a) => a.from !== m.from), { from: m.from, name: m.name, text: m.text, love: new Set<string>() }].slice(-30) } : h));
        else if (m.t === "love")
          setHot((h) => (h && h.id === m.id ? { ...h, answers: h.answers.map((a) => (a.from === m.to ? { ...a, love: new Set(a.love).add(m.from) } : a)) } : h));
        else if (m.t === "pair" && (m.a === me.id || m.b === me.id)) {
          setPair({ other: m.a === me.id ? m.b : m.a, prompt: m.prompt });
          setLookingNow(false);
          playSfx("found");
        } else if (m.t === "spray") {
          const k = randomKey();
          setRain({ k, name: m.name, amount: m.amount });
          playSfx("pop");
          setTimeout(() => setRain((r) => (r?.k === k ? null : r)), 3000);
        }
      }),
    [on, me.id],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((c) => (c?.id === toast.id ? null : c)), 25_000);
    return () => clearTimeout(t);
  }, [toast]);

  // Pairing: everyone looking, in id order, is paired two by two; the first of each two sends it.
  useEffect(() => setLooking(looking), [looking, setLooking]);
  const lookers = useMemo(() => here.filter((p) => p.looking).map((p) => p.id).sort(), [here]);
  useEffect(() => {
    if (!looking) return;
    const i = lookers.indexOf(me.id);
    if (i < 0 || i % 2 === 1 || i + 1 >= lookers.length) return;
    send({ t: "pair", a: me.id, b: lookers[i + 1], prompt: Math.floor(Math.random() * MEET_PROMPTS.length) });
  }, [looking, lookers, me.id, send]);

  const people = useMemo(() => {
    const list = [...here];
    // You're always on the floor (even before the room has caught up).
    if (!list.some((p) => p.id === me.id)) list.push({ id: me.id, name: me.name, avatar: me.avatar, host, looking, vibe: null });
    return list.sort((a, b) => Number(b.host) - Number(a.host));
  }, [here, me, host, looking]);
  const other = pair ? (people.find((p) => p.id === pair.other) ?? null) : null;

  const drawQuestion = () => {
    if (hot && Date.now() - hot.at < HOT_GAP) return onMessage("Answer this one first! A new question in a moment.", false);
    send({ t: "hot", id: randomKey(), q: Math.floor(Math.random() * ICEBREAKERS.length), by: me.name });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white" style={{ background: "radial-gradient(120% 80% at 50% 0%, #c2255c 0%, #5f3dc4 45%, #12101c 100%)" }}>
      {/* Lights sweeping over the floor, pulsing on the beat. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40 transition-opacity duration-100" style={{ opacity: hostVibe && sound ? (beat % 2 ? 0.45 : 0.25) : 0.15, background: "conic-gradient(from 0deg at 50% 30%, #ff2bd655, transparent 20%, #22d3ee55 35%, transparent 50%, #ffd43b55 65%, transparent 80%)" }} />
      <RoomTop
        title={view.title}
        icon={f?.icon ?? "🎉"}
        endsAt={Date.parse(view.endsAt)}
        here={people.length}
        onMin={onMin}
        extra={
          <button onClick={() => setSound((s) => !s)} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15" aria-label={sound ? "Music off" : "Music on"}>
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
        }
      />
      <p className="mt-1 truncate px-3 text-[11px] text-white/70">
        {view.place || "Here"} · hosted by {view.host.name}
        {hostVibe ? ` · ♫ ${VIBE_BY_ID[hostVibe]?.name ?? hostVibe}` : ""}
      </p>

      {/* The dance floor. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-3">
        {shoutNow && (
          <div className="toast-in mx-auto mb-3 max-w-sm rounded-3xl bg-gold px-4 py-3 text-center text-ink shadow-2xl">
            <p className="text-[11px] font-bold uppercase tracking-wide">📣 Shout-out from {shoutNow.name}</p>
            <p className="font-display text-lg font-extrabold leading-tight">
              {shoutNow.toName ? `${shoutNow.toName}: ` : ""}
              {shoutNow.text}
            </p>
          </div>
        )}
        {toast && (
          <div className="toast-in mx-auto mb-3 flex max-w-sm items-center gap-3 rounded-3xl bg-white/15 p-3 ring-1 ring-white/25 backdrop-blur">
            <span className="text-3xl">🥂</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-white/75">{toast.name} raised a toast</p>
              <p className="font-bold leading-tight">{toast.text}</p>
              <p className="text-[11px] text-white/75">{toast.clinks.size} clinked</p>
            </div>
            <button
              disabled={toast.clinks.has(me.id)}
              onClick={() => {
                send({ t: "clink", id: toast.id, from: me.id });
                playSfx("chime");
              }}
              className="shrink-0 rounded-full bg-gold px-3 py-2 text-xs font-bold text-ink disabled:opacity-50"
            >
              {toast.clinks.has(me.id) ? "Clinked" : "Clink!"}
            </button>
          </div>
        )}
        {hot && <HotSeat hot={hot} me={me} send={send} onPerson={onPerson} />}
        {looking && !pair && (
          <div className="mx-auto mb-3 flex max-w-sm items-center gap-3 rounded-3xl bg-white/15 p-3 ring-1 ring-white/25">
            <span className="text-2xl">💞</span>
            <p className="min-w-0 flex-1 text-sm">
              <b>Looking for someone to meet…</b>
              <br />
              <span className="text-xs text-white/75">{lookers.length > 1 ? "Found someone!" : "As soon as someone else here taps Meet someone, you two are paired."}</span>
            </p>
            <button onClick={() => setLookingNow(false)} className="shrink-0 rounded-full bg-white/20 px-3 py-2 text-xs font-bold">
              Stop
            </button>
          </div>
        )}
        {pair && (
          <div className="toast-in mx-auto mb-3 max-w-sm rounded-3xl bg-white p-3.5 text-ink shadow-2xl">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#d6336c]">💞 You've been paired</p>
            <div className="mt-2 flex items-center gap-3">
              {other ? <Face p={other} size={48} onPerson={onPerson} ring="ring-[#d6336c]" /> : <span className="text-3xl">🙂</span>}
              <div className="min-w-0 flex-1">
                <p className="font-bold">{other?.name ?? "Someone"} is your match</p>
                <p className="text-sm text-muted">{pick(MEET_PROMPTS, pair.prompt)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setPair(null)} className="h-10 rounded-full bg-ink/5 text-sm font-semibold">
                Done
              </button>
              <button onClick={() => onPerson(pair.other)} className="h-10 rounded-full bg-[#d6336c] text-sm font-bold text-white">
                Chat or add friend
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-4 pb-4 pt-2">
          {people.map((p, i) => (
            <PartyFace key={p.id} p={p} onPerson={onPerson} dancing={!!hostVibe && sound} delay={(i % 5) * 0.12} me={p.id === me.id} />
          ))}
        </div>
        {people.length < 3 && <p className="mx-auto max-w-xs pb-4 text-center text-xs text-white/70">It&apos;s early. Share the event so your friends come, and people nearby were told it&apos;s on.</p>}
        {rain && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <span key={`${rain.k}-${i}`} className="event-rain absolute top-0 text-2xl" style={{ left: `${(i * 37) % 95}%`, animationDelay: `${(i % 6) * 0.12}s` }}>
                💸
              </span>
            ))}
            <p className="toast-in absolute inset-x-0 top-6 text-center font-display text-lg font-extrabold [text-shadow:0_2px_6px_rgba(0,0,0,.6)]">
              {rain.name} sprayed {cash(rain.amount)} on {view.host.name}!
            </p>
          </div>
        )}
      </div>
      <FloatingReactions on={on} />

      {/* Things to do together. */}
      <div className="relative z-10 space-y-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
          <Act icon={<Flame className="size-4" />} label="Hot seat" onClick={drawQuestion} />
          <Act icon={<Heart className="size-4" />} label={looking ? "Looking…" : "Meet someone"} on={looking} onClick={() => (pair ? null : setLookingNow((l) => !l))} />
          <Act icon={<Megaphone className="size-4" />} label="Shout-out" onClick={() => setPanel("shout")} />
          <Act icon={<Wine className="size-4" />} label="Toast" onClick={() => setPanel("toast")} />
          {!host && <Act icon={<span className="text-sm">💸</span>} label={`Spray ${view.host.name}`} onClick={() => setPanel("spray")} />}
          {host && <Act icon={<Music className="size-4" />} label="Music" onClick={() => setPanel("music")} />}
          {host && <Act icon={<PartyPopper className="size-4" />} label="End party" onClick={onEnd} />}
        </div>
        <ReactBar me={me} send={send} />
        <RoomChat me={me} lines={chat} send={send} onPerson={onPerson} compact />
        <CallBar room={`event-${view.id}`} me={{ id: me.id, name: me.name, avatar: me.avatar }} title="Talk corner" max={6} />
      </div>

      {panel === "shout" && <ShoutPanel me={me} people={people} send={send} onClose={() => setPanel(null)} />}
      {panel === "toast" && (
        <RoomPanel title="Raise a toast" onClose={() => setPanel(null)}>
          <div className="grid grid-cols-2 gap-2">
            {TOASTS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  send({ t: "toast", id: randomKey(), from: me.id, name: me.name, text: t });
                  setPanel(null);
                }}
                className="rounded-2xl bg-ink/5 px-3 py-3 text-left text-sm font-semibold"
              >
                {t}
              </button>
            ))}
          </div>
        </RoomPanel>
      )}
      {panel === "spray" && (
        <RoomPanel title={`Spray ${view.host.name}`} onClose={() => setPanel(null)}>
          <p className="text-sm text-muted">Shower the host with money, owambe style. Everyone sees it rain.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SPRAYS.map((a) => (
              <button
                key={a}
                onClick={async () => {
                  setPanel(null);
                  const r = await giveCoins(view.host.id, a, `Sprayed at ${view.title}`.slice(0, 80)).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
                  if (!r.ok) return onMessage(r.error, false);
                  send({ t: "spray", from: me.id, name: me.name, amount: a });
                }}
                className="h-12 rounded-2xl bg-gold text-sm font-extrabold text-ink"
              >
                {cash(a)}
              </button>
            ))}
          </div>
        </RoomPanel>
      )}
      {panel === "music" && (
        <RoomPanel title="The music" onClose={() => setPanel(null)}>
          <p className="text-sm text-muted">Everyone at the party hears what you pick (if their sound is on).</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {VIBES.map((v) => (
              <button key={v.id} onClick={() => setVibe(v.id)} className={cn("rounded-2xl p-3 text-left text-white", vibe === v.id && "ring-4 ring-gold")} style={{ background: v.color }}>
                <b className="block text-sm">{v.name}</b>
                <span className="text-[11px] text-white/85">{v.blurb}</span>
              </button>
            ))}
            <button onClick={() => setVibe(null)} className={cn("rounded-2xl bg-ink/5 p-3 text-left text-sm font-semibold", vibe === null && "ring-4 ring-gold")}>
              Music off
            </button>
          </div>
        </RoomPanel>
      )}
    </div>
  );
}

function PartyFace({ p, onPerson, dancing, delay, me }: { p: RoomPerson; onPerson: (id: string) => void; dancing: boolean; delay: number; me: boolean }) {
  return (
    <div className="relative">
      <Face p={{ ...p, name: me ? "You" : p.name }} size={p.host ? 58 : 46} onPerson={me ? undefined : onPerson} ring={p.host ? "ring-gold ring-4" : p.looking ? "ring-[#ff8fab]" : undefined} bob={dancing ? delay : undefined} />
      {p.host && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-lg">👑</span>}
    </div>
  );
}

function Act({ icon, label, onClick, on }: { icon: React.ReactNode; label: string; onClick: () => void; on?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition active:scale-95", on ? "bg-[#ff8fab] text-ink" : "bg-white text-ink")}>
      {icon}
      <span className="max-w-[9rem] truncate">{label}</span>
    </button>
  );
}

/** The hot seat: the question, a box for your answer, and everyone's answers with hearts. */
function HotSeat({
  hot,
  me,
  send,
  onPerson,
}: {
  hot: { id: string; q: number; by: string; answers: { from: string; name: string; text: string; love: Set<string> }[] };
  me: RoomMe;
  send: (m: RoomMsg) => void;
  onPerson: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const mine = hot.answers.find((a) => a.from === me.id);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.scrollTo({ top: box.current.scrollHeight }), [hot.answers.length]);
  return (
    <div className="toast-in mx-auto mb-3 max-w-sm rounded-3xl bg-white p-3.5 text-ink shadow-2xl">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#e8590c]">🔥 Hot seat · asked by {hot.by}</p>
      <p className="mt-1 font-display text-lg font-extrabold leading-tight">{pick(ICEBREAKERS, hot.q)}</p>
      <div ref={box} className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
        {hot.answers.map((a) => (
          <div key={a.from} className="flex items-start gap-2 rounded-2xl bg-ink/5 px-2.5 py-1.5">
            <button onClick={() => a.from !== me.id && onPerson(a.from)} className="shrink-0 text-xs font-bold text-[#5f3dc4]">
              {a.from === me.id ? "You" : a.name}
            </button>
            <p className="min-w-0 flex-1 text-sm">{a.text}</p>
            <button
              disabled={a.from === me.id || a.love.has(me.id)}
              onClick={() => send({ t: "love", id: hot.id, to: a.from, from: me.id })}
              className={cn("flex shrink-0 items-center gap-0.5 text-xs font-bold", a.love.has(me.id) ? "text-hit" : "text-muted")}
              aria-label="Love this answer"
            >
              <Heart className={cn("size-3.5", a.love.has(me.id) && "fill-current")} /> {a.love.size || ""}
            </button>
          </div>
        ))}
      </div>
      {!mine && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.replace(/\s+/g, " ").trim().slice(0, 140);
            if (!t) return;
            send({ t: "ans", id: hot.id, from: me.id, name: me.name, text: t });
            setText("");
          }}
          className="mt-2 flex h-10 items-center gap-1 rounded-full bg-ink/5 pl-3.5 pr-1"
        >
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, 140))} placeholder="Your answer…" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
          <button type="submit" disabled={!text.trim()} className="h-8 rounded-full bg-ink px-3 text-xs font-bold text-white disabled:opacity-40">
            Answer
          </button>
        </form>
      )}
    </div>
  );
}

/** A shout-out: to someone here (or everyone), in your words. */
function ShoutPanel({ me, people, send, onClose }: { me: RoomMe; people: RoomPerson[]; send: (m: RoomMsg) => void; onClose: () => void }) {
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const others = people.filter((p) => p.id !== me.id);
  const target = others.find((p) => p.id === to) ?? null;
  return (
    <RoomPanel title="Shout-out" onClose={onClose}>
      <p className="text-sm text-muted">Big up someone in front of everyone. It shows across the whole party.</p>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
        <button onClick={() => setTo(null)} className={cn("shrink-0 rounded-full px-3 py-2 text-xs font-bold", to === null ? "bg-ink text-white" : "bg-ink/5")}>
          Everyone
        </button>
        {others.slice(0, 30).map((p) => (
          <button key={p.id} onClick={() => setTo(p.id)} className={cn("shrink-0 rounded-full px-3 py-2 text-xs font-bold", to === p.id ? "bg-ink text-white" : "bg-ink/5")}>
            {p.name}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 120))}
        rows={2}
        placeholder={target ? `Best dancer here, ${target.name}! 🔥` : "This party is a vibe! 🎉"}
        className="mt-2 w-full resize-none rounded-2xl bg-ink/5 p-3 text-sm outline-none"
      />
      <button
        disabled={!text.trim()}
        onClick={() => {
          send({ t: "shout", from: me.id, name: me.name, to: target?.id ?? null, toName: target?.name ?? null, text: text.replace(/\s+/g, " ").trim(), at: Date.now() });
          onClose();
        }}
        className="mt-2 h-11 w-full rounded-full bg-gold font-bold text-ink disabled:opacity-40"
      >
        Shout it out
      </button>
    </RoomPanel>
  );
}
