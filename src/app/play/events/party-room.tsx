"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Heart, Megaphone, Music, PartyPopper, Shuffle, SkipForward, Square, Volume2, VolumeX, Wine, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { HOT_MAX, HYPE_FULL, HYPE_POINTS, ICEBREAKERS, MEET_PROMPTS, MOVES, QUEUE_MAX, TOASTS, cleanQuestion, cleanStage, eventFormat, pick, youtubeId, type StageState } from "@/lib/world/events";
import { cash } from "@/lib/world/value";
import { CallBar } from "../call/call-bar";
import { giveCoins } from "../gift-actions";
import { backgroundAudio, playLoop, soundWaiting, stopLoop, VIBES, VIBE_BY_ID, wakeSound, type Vibe } from "../activities/synth";
import { Confetti } from "../activities/ui";
import { playSfx } from "../sound";
import { randomKey, useEventRoom, useRoomChat, useRoomList, type RoomMsg, type RoomPerson } from "./channel";
import { setStage, type EventView } from "./event-actions";
import { Face, FloatingChat, FloatingReactions, ReactBar, RoomChat, RoomPanel, RoomTop, WhoPanel, type RoomMe } from "./room-kit";
import { YouTubeScreen } from "./stage-room";

// A party (docs/EVENTS.md): everyone who's in shows on the dance floor, bobbing to the host's music.
// What it's for is people, not avatars: the hot seat (a question everyone answers), meeting someone
// new (two people paired with a starter), shout-outs, toasts everyone clinks, spraying the host,
// dance moves everyone sees, the hype meter (everything people do fills it; full, the party goes
// off), the host's DJ booth (songs from YouTube, in sync), a talk corner (a voice call for up to 6)
// and the chat, whose messages float up the room.

/** Spray amounts (mint). */
const SPRAYS = [1, 5, 20];
/** A new hot seat question at most this often (ms). */
const HOT_GAP = 45_000;
/** Up to this many people the floor shows everyone big, with names; past it, a crowd. */
const SMALL_PARTY = 16;
/** In a crowd: the people in the spotlight (the host, you, whoever just did something), and how many small faces after them. */
const SPOTLIGHT = 10;
const CROWD_FACES = 40;

type Panel = null | "hot" | "shout" | "toast" | "spray" | "music" | "dance" | "who";
type Hot = { id: string; q: number; text: string | null; by: string; at: number; answers: { from: string; name: string; text: string; love: string[] }[] };

export function PartyRoom({
  view,
  me,
  onMin,
  onLeave,
  onPerson,
  onMessage,
  onEnd,
  onCancel,
}: {
  view: EventView;
  me: RoomMe;
  /** Back to the map (still in). */
  onMin: () => void;
  /** Out of the room (the ticket stays paid). */
  onLeave: () => void;
  onPerson: (id: string) => void;
  onMessage: (text: string, good: boolean) => void;
  /** The host ends it. */
  onEnd: () => void;
  /** The host calls it off (every ticket back). */
  onCancel: () => void;
}) {
  const host = view.me.host;
  const hostId = view.host.id;
  const [vibe, setVibe] = useState<Vibe | null>(host ? "afrobeats" : null);
  const { here, send, on, setLooking } = useEventRoom(view.id, { ...me, host }, vibe);
  const chat = useRoomChat(on, hostId);
  const f = eventFormat(view.format);
  const [panel, setPanel] = useState<Panel>(null);

  // The DJ booth: the host's songs (YouTube), kept with the event so people coming in hear the same.
  const [dj, setDj] = useState<StageState>(() => cleanStage(view.stage));
  const djRef = useRef(dj);
  useEffect(() => {
    djRef.current = dj;
  });
  const saved = useRef(0);
  const changeDj = useCallback(
    (next: StageState, keep = true) => {
      setDj(next);
      send({ t: "stage", s: next });
      if (keep || Date.now() - saved.current > 30_000) {
        saved.current = Date.now();
        void setStage(view.id, next).then((r) => {
          if (!r.ok) onMessage(r.error, false);
        });
      }
    },
    [send, view.id, onMessage],
  );
  const count = here.length;
  useEffect(() => {
    if (host && count > 0) send({ t: "stage", s: djRef.current });
  }, [host, count, send]);
  const songOn = dj.mode === "video" && !!dj.video;

  // The beat: the host's choice, on every phone with the sound on (quiet while a song plays).
  const hostVibe = (here.find((p) => p.host)?.vibe ?? vibe) as Vibe | null;
  const [sound, setSound] = useState(true);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!sound || songOn || !hostVibe || !VIBE_BY_ID[hostVibe]) return;
    const stop = playLoop(hostVibe, { seconds: 3600, volume: 0.7, onBeat: (b) => setBeat(b) });
    return () => stop();
  }, [sound, songOn, hostVibe]);
  useEffect(() => () => stopLoop(), []);
  // The phone hasn't let the beat start yet (it wants a tap): say so, with a button.
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!sound || songOn || !hostVibe) return;
    const id = window.setInterval(() => setWaiting(soundWaiting()), 800);
    return () => {
      window.clearInterval(id);
      setWaiting(false);
    };
  }, [sound, songOn, hostVibe]);
  // Leave the browser (another app, the screen off) and the beat plays on until you leave the
  // party, with the party's name and Play, Pause and Leave on the lock screen (docs/EVENTS.md).
  // YouTube songs can't: YouTube stops them when the browser isn't in front.
  const leaveRef = useRef(onLeave);
  useEffect(() => {
    leaveRef.current = onLeave;
  });
  useEffect(() => {
    backgroundAudio(true);
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (ms) {
      try {
        ms.metadata = new MediaMetadata({ title: view.title, artist: "Party in Newtown", album: eventFormat(view.format)?.title ?? "Party", artwork: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] });
        ms.setActionHandler("play", () => setSound(true));
        ms.setActionHandler("pause", () => setSound(false));
        ms.setActionHandler("stop", () => leaveRef.current?.());
      } catch {
        // Some browsers have only part of it: the sound still plays.
      }
    }
    return () => {
      backgroundAudio(false);
      if (ms) {
        try {
          ms.metadata = null;
          for (const a of ["play", "pause", "stop"] as const) ms.setActionHandler(a, null);
        } catch {
          // Nothing to undo.
        }
      }
    };
  }, [view.title, view.format]);
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaSession) navigator.mediaSession.playbackState = sound ? "playing" : "paused";
  }, [sound]);

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

  const [toast, setToast] = useState<{ id: string; name: string; text: string; clinks: string[] } | null>(null);
  const [hot, setHot] = useState<Hot | null>(null);
  const [looking, setLookingNow] = useState(false);
  const [pair, setPair] = useState<{ other: string; prompt: number } | null>(null);
  const [rain, setRain] = useState<{ k: string; name: string; amount: number } | null>(null);
  // Who did something lately (for the spotlight in a big crowd), and dance moves showing now.
  const [active, setActive] = useState<Record<string, number>>({});
  const [moves, setMoves] = useState<Record<string, { m: string; k: string }>>({});
  // The hype meter.
  const [hype, setHype] = useState(0);
  const [lit, setLit] = useState(0);

  useEffect(
    () =>
      on((m) => {
        const who = "from" in m ? m.from : null;
        if (who) setActive((a) => ({ ...a, [who]: Date.now() }));
        const pts = HYPE_POINTS[m.t] ?? 0;
        if (pts) setHype((h) => Math.min(HYPE_FULL, h + pts));
        if (m.t === "toast") {
          setToast({ id: m.id, name: m.name, text: m.text, clinks: [] });
          playSfx("chime");
        } else if (m.t === "clink") setToast((t) => (t && t.id === m.id && !t.clinks.includes(m.from) ? { ...t, clinks: [...t.clinks, m.from] } : t));
        else if (m.t === "hot") setHot({ id: m.id, q: m.q, text: m.text, by: m.by, at: Date.now(), answers: [] });
        else if (m.t === "ans")
          setHot((h) => (h && h.id === m.id ? { ...h, answers: [...h.answers.filter((a) => a.from !== m.from), { from: m.from, name: m.name, text: m.text, love: [] }].slice(-30) } : h));
        else if (m.t === "love")
          setHot((h) => (h && h.id === m.id ? { ...h, answers: h.answers.map((a) => (a.from === m.to && !a.love.includes(m.from) ? { ...a, love: [...a.love, m.from] } : a)) } : h));
        else if (m.t === "pair" && (m.a === me.id || m.b === me.id)) {
          setPair({ other: m.a === me.id ? m.b : m.a, prompt: m.prompt });
          setLookingNow(false);
          playSfx("found");
        } else if (m.t === "spray") {
          const k = randomKey();
          setRain({ k, name: m.name, amount: m.amount });
          playSfx("pop");
          setTimeout(() => setRain((r) => (r?.k === k ? null : r)), 3000);
        } else if (m.t === "move") {
          const k = randomKey();
          setMoves((x) => ({ ...x, [m.from]: { m: m.m, k } }));
          setTimeout(() => setMoves((x) => (x[m.from]?.k === k ? Object.fromEntries(Object.entries(x).filter(([id]) => id !== m.from)) : x)), 2600);
        } else if (m.t === "stage" && !host) setDj(cleanStage(m.s));
      }),
    [on, me.id, host],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((c) => (c?.id === toast.id ? null : c)), 25_000);
    return () => clearTimeout(t);
  }, [toast]);
  // The hype drains slowly; full, the party goes off (confetti, everyone jumps) and it starts again.
  useEffect(() => {
    const t = setInterval(() => setHype((h) => Math.max(0, h - 1)), 1500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (hype < HYPE_FULL) return;
    setHype(0);
    setLit(Date.now());
    playSfx("levelup");
  }, [hype]);
  useEffect(() => {
    if (!lit) return;
    const t = setTimeout(() => setLit(0), 3500);
    return () => clearTimeout(t);
  }, [lit]);

  // Pairing: everyone looking, in id order, is paired two by two; the first of each two sends it.
  useEffect(() => {
    setLooking(looking);
  }, [looking, setLooking]);
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

  // The floor: everyone big for a small party; for a crowd, the spotlight then small faces then "+N".
  const crowd = people.length > SMALL_PARTY;
  const now = Date.now();
  const spot = crowd
    ? people
        .filter((p) => p.host || p.id === me.id || now - (active[p.id] ?? 0) < 90_000)
        .sort((a, b) => Number(b.host) - Number(a.host) || Number(b.id === me.id) - Number(a.id === me.id) || (active[b.id] ?? 0) - (active[a.id] ?? 0))
        .slice(0, SPOTLIGHT)
    : people;
  const spotIds = new Set(spot.map((p) => p.id));
  const rest = crowd ? people.filter((p) => !spotIds.has(p.id)) : [];

  const askHot = (q: number, text: string | null) => {
    if (hot && Date.now() - hot.at < HOT_GAP && hot.answers.length < Math.max(2, Math.ceil(people.length / 3))) {
      return onMessage("Give people a moment to answer this one first!", false);
    }
    send({ t: "hot", id: randomKey(), q, text, by: me.name });
    setPanel(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white" style={{ background: "radial-gradient(120% 80% at 50% 0%, #c2255c 0%, #5f3dc4 45%, #12101c 100%)" }}>
      {/* Lights sweeping over the floor, pulsing on the beat. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-100" style={{ opacity: lit ? 0.7 : (hostVibe || songOn) && sound ? (beat % 2 ? 0.45 : 0.25) : 0.15, background: "conic-gradient(from 0deg at 50% 30%, #ff2bd655, transparent 20%, #22d3ee55 35%, transparent 50%, #ffd43b55 65%, transparent 80%)" }} />
      <RoomTop
        title={view.title}
        icon={f?.icon ?? "🎉"}
        endsAt={Date.parse(view.endsAt)}
        here={Math.max(people.length, view.came)}
        onMin={onMin}
        onLeave={onLeave}
        onHere={() => setPanel("who")}
        extra={
          <button onClick={() => setSound((s) => !s)} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15" aria-label={sound ? "Music off" : "Music on"}>
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
        }
      />
      {/* The hype meter. */}
      <div className="relative mx-3 mt-2 flex items-center gap-2 text-[11px] font-bold">
        <span>🔥 Hype</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-gradient-to-r from-gold via-[#ff8fab] to-[#ff2bd6] transition-[width] duration-300" style={{ width: `${(hype / HYPE_FULL) * 100}%` }} />
        </div>
        <span className="truncate text-white/70">
          {view.place || "Here"}
          {songOn ? " · ♫ DJ" : hostVibe ? ` · ♫ ${VIBE_BY_ID[hostVibe]?.name ?? hostVibe}` : ""}
        </span>
      </div>

      {/* The dance floor. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-3">
        {lit > 0 && (
          <>
            <Confetti count={40} />
            <p className="toast-in mx-auto mb-2 w-fit rounded-full bg-gold px-4 py-1.5 font-display text-lg font-extrabold text-ink shadow-2xl">🔥 The party is LIT! 🔥</p>
          </>
        )}
        {waiting && !songOn && (
          <button
            onClick={() => {
              wakeSound();
              setWaiting(false);
            }}
            className="toast-in mx-auto mb-3 flex items-center gap-2 rounded-full bg-gold px-4 py-2 font-bold text-ink shadow-xl"
          >
            <Volume2 className="size-4" /> Tap for the music
          </button>
        )}
        {songOn && (
          <div className="mx-auto mb-3 flex max-w-sm items-center gap-3 rounded-3xl bg-black/35 p-2 ring-1 ring-white/20">
            <div className="h-[72px] w-32 shrink-0 overflow-hidden rounded-2xl bg-black">
              <YouTubeScreen
                stage={dj}
                host={host}
                onHostChange={(s) => changeDj(s, false)}
                onEnded={host ? () => (dj.queue.length ? changeDj({ ...dj, video: dj.queue[0], queue: dj.queue.slice(1), playing: true, pos: 0, at: Date.now() }) : changeDj({ ...dj, mode: "none", video: null, playing: false })) : undefined}
                onError={
                  host
                    ? (blocked) => {
                        onMessage(
                          blocked
                            ? "That song's owner doesn't let it play outside YouTube. Try another link: lyric videos and audio uploads usually work."
                            : "That song won't play. Check the link, or try another.",
                          false,
                        );
                        const d = djRef.current;
                        changeDj(d.queue.length ? { ...d, video: d.queue[0], queue: d.queue.slice(1), playing: true, pos: 0, at: Date.now() } : { ...d, mode: "none", video: null, playing: false });
                      }
                    : undefined
                }
                small
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gold">♫ DJ {view.host.name}</p>
              <p className="text-xs text-white/75">{dj.playing ? "Playing now" : "Paused"} · {dj.queue.length} up next</p>
              {host && (
                <div className="mt-1 flex gap-1">
                  {!dj.playing && (
                    <button onClick={() => changeDj({ ...dj, playing: true, at: Date.now() })} className="flex h-7 items-center gap-1 rounded-full bg-gold px-2 text-[11px] font-bold text-ink">
                      ▶ Play
                    </button>
                  )}
                  <button
                    disabled={!dj.queue.length}
                    onClick={() => changeDj({ ...dj, video: dj.queue[0], queue: dj.queue.slice(1), playing: true, pos: 0, at: Date.now() })}
                    className="flex h-7 items-center gap-1 rounded-full bg-white/20 px-2 text-[11px] font-bold disabled:opacity-40"
                  >
                    <SkipForward className="size-3.5" /> Next
                  </button>
                  <button onClick={() => changeDj({ ...dj, mode: "none", video: null, playing: false, queue: [] })} className="flex h-7 items-center gap-1 rounded-full bg-white/20 px-2 text-[11px] font-bold">
                    <Square className="size-3" /> Stop
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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
              <p className="text-[11px] text-white/75">{toast.clinks.length} clinked</p>
            </div>
            <button
              disabled={toast.clinks.includes(me.id)}
              onClick={() => {
                send({ t: "clink", id: toast.id, from: me.id });
                playSfx("chime");
              }}
              className="shrink-0 rounded-full bg-gold px-3 py-2 text-xs font-bold text-ink disabled:opacity-50"
            >
              {toast.clinks.includes(me.id) ? "Clinked" : "Clink!"}
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#d6336c]">💞 You&apos;ve been paired</p>
            <div className="mt-2 flex items-center gap-3">
              {other ? <Face p={other} size={48} onPerson={onPerson} ring="ring-[#d6336c]" label={false} /> : <span className="text-3xl">🙂</span>}
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

        <div className={cn("flex flex-wrap justify-center gap-x-3 gap-y-4 pb-3 pt-2", lit > 0 && "event-lit")}>
          {spot.map((p, i) => (
            <PartyFace key={p.id} p={p} onPerson={onPerson} dancing={(!!hostVibe || songOn) && sound} delay={(i % 5) * 0.12} me={p.id === me.id} move={moves[p.id]?.m ?? null} big={!crowd || p.host} />
          ))}
        </div>
        {crowd && (
          <div className={cn("mx-auto flex max-w-md flex-wrap justify-center gap-1 pb-4", lit > 0 && "event-lit")}>
            {rest.slice(0, CROWD_FACES).map((p, i) => (
              <Face key={p.id} p={p} size={28} onPerson={onPerson} label={false} ring="ring-white/40 ring-1" bob={(hostVibe || songOn) && sound ? (i % 7) * 0.1 : undefined} move={moves[p.id]?.m ?? null} />
            ))}
            {rest.length > CROWD_FACES && (
              <button onClick={() => setPanel("who")} className="grid size-7 place-items-center rounded-full bg-white/25 text-[10px] font-extrabold ring-1 ring-white/40">
                +{rest.length - CROWD_FACES > 999 ? "999+" : rest.length - CROWD_FACES}
              </button>
            )}
          </div>
        )}
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
      <FloatingChat on={on} me={me} people={people} />

      {/* Things to do together. */}
      <div className="relative z-10 space-y-2 bg-gradient-to-t from-black/75 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
          <Act icon={<Flame className="size-4" />} label="Hot seat" onClick={() => setPanel("hot")} />
          <Act icon={<span className="text-sm">💃</span>} label="Dance" onClick={() => setPanel("dance")} />
          <Act icon={<Heart className="size-4" />} label={looking ? "Looking…" : "Meet someone"} on={looking} onClick={() => (pair ? undefined : setLookingNow((l) => !l))} />
          <Act icon={<Megaphone className="size-4" />} label="Shout-out" onClick={() => setPanel("shout")} />
          <Act icon={<Wine className="size-4" />} label="Toast" onClick={() => setPanel("toast")} />
          {!host && <Act icon={<span className="text-sm">💸</span>} label={`Spray ${view.host.name}`} onClick={() => setPanel("spray")} />}
          {host && <Act icon={<Music className="size-4" />} label="DJ & music" onClick={() => setPanel("music")} />}
          {host && <Act icon={<PartyPopper className="size-4" />} label="End party" onClick={onEnd} />}
          {host && <Act icon={<X className="size-4" />} label="Call it off" onClick={onCancel} />}
        </div>
        <ReactBar me={me} send={send} />
        <RoomChat eventId={view.id} me={me} hostId={hostId} lines={chat} send={send} onPerson={onPerson} onMessage={onMessage} compact />
        <CallBar room={`event-${view.id}`} me={{ id: me.id, name: me.name, avatar: me.avatar }} title="Talk corner" max={6} />
      </div>

      {panel === "who" && <WhoPanel people={people} me={me} hostId={hostId} onPerson={onPerson} onClose={() => setPanel(null)} />}
      {panel === "hot" && <HotPanel onAsk={askHot} onClose={() => setPanel(null)} />}
      {panel === "dance" && (
        <RoomPanel title="Dance" onClose={() => setPanel(null)}>
          <p className="text-sm text-muted">Everyone at the party sees you do it.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {MOVES.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  send({ t: "move", from: me.id, m: m.id });
                  setPanel(null);
                }}
                className="flex h-16 flex-col items-center justify-center rounded-2xl bg-ink/5 text-sm font-bold"
              >
                <span className="text-2xl">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </RoomPanel>
      )}
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
                  const r = await giveCoins(hostId, a, `Sprayed at ${view.title}`.slice(0, 80)).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
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
        <MusicPanel
          vibe={vibe}
          onVibe={setVibe}
          dj={dj}
          onSong={(id) => {
            const d = djRef.current;
            if (d.mode === "video" && d.video) {
              if (d.queue.length >= QUEUE_MAX) return onMessage(`${QUEUE_MAX} songs in the queue at most.`, false);
              changeDj({ ...d, queue: [...d.queue, id] });
              onMessage("Added to the queue.", true);
            } else changeDj({ ...d, mode: "video", video: id, playing: true, pos: 0, at: Date.now() });
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function PartyFace({ p, onPerson, dancing, delay, me, move, big }: { p: RoomPerson; onPerson: (id: string) => void; dancing: boolean; delay: number; me: boolean; move: string | null; big: boolean }) {
  return (
    <div className="relative">
      <Face p={{ ...p, name: me ? "You" : p.name }} size={p.host ? 58 : big ? 46 : 40} onPerson={me ? undefined : onPerson} ring={p.host ? "ring-gold ring-4" : p.looking ? "ring-[#ff8fab]" : undefined} bob={dancing ? delay : undefined} move={move} />
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

/** Ask the room: your own question (checked before it goes), or a random one you can swap. */
function HotPanel({ onAsk, onClose }: { onAsk: (q: number, text: string | null) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [rand, setRand] = useState(() => Math.floor(Math.random() * ICEBREAKERS.length));
  const [confirm, setConfirm] = useState<string | null>(null);
  const mine = cleanQuestion(text);
  if (confirm !== null)
    return (
      <RoomPanel title="Ask the room this?" onClose={onClose}>
        <p className="rounded-2xl bg-[#e8590c]/10 p-3 font-display text-lg font-extrabold leading-tight">🔥 {confirm}</p>
        <p className="mt-2 text-xs text-muted">Everyone at the party sees it and can answer.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => setConfirm(null)} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
            Change it
          </button>
          <button onClick={() => onAsk(0, confirm)} className="h-11 rounded-full bg-[#e8590c] text-sm font-bold text-white">
            Ask it
          </button>
        </div>
      </RoomPanel>
    );
  return (
    <RoomPanel title="Hot seat" onClose={onClose}>
      <p className="text-sm text-muted">Ask everyone a question. Their answers show with their names, and people heart the best.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, HOT_MAX))} rows={2} placeholder="Type your own question…" className="mt-3 w-full resize-none rounded-2xl bg-ink/5 p-3 text-sm outline-none" />
      <button disabled={!mine} onClick={() => mine && setConfirm(mine)} className="mt-2 h-11 w-full rounded-full bg-ink text-sm font-bold text-white disabled:opacity-40">
        Next: check it
      </button>
      <p className="my-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">or a random one</p>
      <div className="rounded-2xl bg-ink/5 p-3 text-sm font-semibold">{pick(ICEBREAKERS, rand)}</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => setRand((r) => (r + 1 + Math.floor(Math.random() * (ICEBREAKERS.length - 1))) % ICEBREAKERS.length)} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-ink/5 text-sm font-semibold">
          <Shuffle className="size-4" /> Another
        </button>
        <button onClick={() => onAsk(rand, null)} className="h-11 rounded-full bg-[#e8590c] text-sm font-bold text-white">
          Ask this one
        </button>
      </div>
    </RoomPanel>
  );
}

/** The hot seat: the question, a box for your answer, and everyone's answers with hearts. */
function HotSeat({ hot, me, send, onPerson }: { hot: Hot; me: RoomMe; send: (m: RoomMsg) => void; onPerson: (id: string) => void }) {
  const [text, setText] = useState("");
  const mine = hot.answers.some((a) => a.from === me.id);
  const box = useRef<HTMLDivElement>(null);
  const n = hot.answers.length;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [n]);
  return (
    <div className="toast-in mx-auto mb-3 max-w-sm rounded-3xl bg-white p-3.5 text-ink shadow-2xl">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#e8590c]">🔥 Hot seat · asked by {hot.by}</p>
      <p className="mt-1 font-display text-lg font-extrabold leading-tight">{hot.text ?? pick(ICEBREAKERS, hot.q)}</p>
      <div ref={box} className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
        {hot.answers.map((a) => {
          const loved = a.love.includes(me.id);
          return (
            <div key={a.from} className="event-pop-in flex items-start gap-2 rounded-2xl bg-ink/5 px-2.5 py-1.5">
              <button type="button" onClick={() => a.from !== me.id && onPerson(a.from)} className="shrink-0 text-xs font-bold text-[#5f3dc4]">
                {a.from === me.id ? "You" : a.name}
              </button>
              <p className="min-w-0 flex-1 break-words text-sm">{a.text}</p>
              <button
                type="button"
                disabled={a.from === me.id || loved}
                onClick={() => send({ t: "love", id: hot.id, to: a.from, from: me.id })}
                className={cn("flex shrink-0 items-center gap-0.5 text-xs font-bold", loved ? "text-hit" : "text-muted")}
                aria-label="Love this answer"
              >
                <Heart className={cn("size-3.5", loved && "fill-current")} /> {a.love.length > 0 ? a.love.length : ""}
              </button>
            </div>
          );
        })}
      </div>
      {!mine && (
        <div className="mt-2 flex h-10 items-center gap-1 rounded-full bg-ink/5 pl-3.5 pr-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const t = text.replace(/\s+/g, " ").trim().slice(0, 140);
              if (!t) return;
              send({ t: "ans", id: hot.id, from: me.id, name: me.name, text: t });
              setText("");
            }}
            placeholder="Your answer…"
            enterKeyHint="send"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => {
              const t = text.replace(/\s+/g, " ").trim().slice(0, 140);
              if (!t) return;
              send({ t: "ans", id: hot.id, from: me.id, name: me.name, text: t });
              setText("");
            }}
            className="h-8 rounded-full bg-ink px-3 text-xs font-bold text-white disabled:opacity-40"
          >
            Answer
          </button>
        </div>
      )}
    </div>
  );
}

/** A shout-out: to someone here (or everyone), in your words. */
function ShoutPanel({ me, people, send, onClose }: { me: RoomMe; people: RoomPerson[]; send: (m: RoomMsg) => void; onClose: () => void }) {
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const others = people.filter((p) => p.id !== me.id && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const target = people.find((p) => p.id === to) ?? null;
  return (
    <RoomPanel title="Shout-out" onClose={onClose}>
      <p className="text-sm text-muted">Big up someone in front of everyone. It shows across the whole party.</p>
      {people.length > 12 && <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 30))} placeholder="Find someone" className="mt-2 h-9 w-full rounded-full bg-ink/5 px-3.5 text-sm outline-none" />}
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

/** The host's music: a beat made on the phones, or songs from YouTube everyone hears in sync (a queue). */
function MusicPanel({ vibe, onVibe, dj, onSong, onClose }: { vibe: Vibe | null; onVibe: (v: Vibe | null) => void; dj: StageState; onSong: (id: string) => void; onClose: () => void }) {
  const [link, setLink] = useState("");
  const id = youtubeId(link);
  return (
    <RoomPanel title="DJ & music" onClose={onClose}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Play a song (YouTube)</p>
      <p className="mt-1 text-sm text-muted">Paste a song&apos;s YouTube link. Everyone hears it at the same moment; add more and they play one after another.</p>
      <p className="mt-1 text-xs text-muted">On a phone: in YouTube, open the song, tap Share, then Copy link. Come back and paste it here.</p>
      <div className="mt-2 flex gap-2">
        <input value={link} onChange={(e) => setLink(e.target.value.slice(0, 300))} placeholder="https://youtube.com/watch?v=…" inputMode="url" className="h-11 min-w-0 flex-1 rounded-2xl bg-ink/5 px-3.5 text-sm outline-none" />
        <button
          disabled={!id}
          onClick={() => {
            if (!id) return;
            onSong(id);
            setLink("");
          }}
          className="h-11 shrink-0 rounded-full bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          {dj.mode === "video" && dj.video ? "Queue it" : "Play"}
        </button>
      </div>
      {link && !id && <p className="mt-1 text-xs font-semibold text-hit">That isn&apos;t a YouTube link.</p>}
      {dj.queue.length > 0 && <p className="mt-1 text-xs text-muted">{dj.queue.length} up next.</p>}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Or a beat</p>
      <p className="mt-1 text-sm text-muted">Made on everyone&apos;s phone. It goes quiet while a song plays.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {VIBES.map((v) => (
          <button key={v.id} onClick={() => onVibe(v.id)} className={cn("rounded-2xl p-3 text-left text-white", vibe === v.id && "ring-4 ring-gold")} style={{ background: v.color }}>
            <b className="block text-sm">{v.name}</b>
            <span className="text-[11px] text-white/85">{v.blurb}</span>
          </button>
        ))}
        <button onClick={() => onVibe(null)} className={cn("rounded-2xl bg-ink/5 p-3 text-left text-sm font-semibold", vibe === null && "ring-4 ring-gold")}>
          No beat
        </button>
      </div>
    </RoomPanel>
  );
}
