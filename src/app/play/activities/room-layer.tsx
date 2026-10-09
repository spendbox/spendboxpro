"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Coins, Dices, Martini, Mic, Music, PartyPopper, Square, Star, Target, Trophy, UtensilsCrossed, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import { SprayRain } from "./dance";
import { DuelInvite, DuelSheet, startDuel, useCurrentDuel } from "./duels";
import { useActivityRoom, type ActivityMsg, type ActivityPlayer, type DuelGame, type ToastIcon } from "./hub";
import { playLoop, stopLoop, VIBE_BY_ID, type Vibe } from "./synth";
import { ActivityStyles, Face, nowMs } from "./ui";

// Everything that happens in a place for everyone there, even with no game open: money
// raining down when someone sprays, "Now playing" from the jukebox, duel invitations (and the
// duel itself), and little news lines ("Kemi is having jollof rice"). Mount it while the player
// is inside a place.

const TOAST_ICON: Record<ToastIcon, React.ComponentType<{ className?: string }>> = {
  trophy: Trophy,
  food: UtensilsCrossed,
  drink: Martini,
  music: Music,
  target: Target,
  party: PartyPopper,
  coins: Coins,
  mic: Mic,
  dice: Dices,
  camera: Camera,
  star: Star,
};

type Toast = { id: number; text: string; icon: ToastIcon; who?: ActivityPlayer };
type Invite = { cid: string; game: DuelGame; from: ActivityPlayer; until: number };

export function RoomActivityLayer({
  roundId,
  roomId,
  me,
  className,
}: {
  roundId: number | null;
  roomId: string | null;
  me: ActivityPlayer | null;
  /** Where the notices sit (default: top centre, under the game's top bar). */
  className?: string;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rain, setRain] = useState<{ id: number; from: ActivityPlayer; amount: number; mine: number } | null>(null);
  const [playing, setPlaying] = useState<{ vibe: Vibe; by: ActivityPlayer; until: number } | null>(null);
  const [listening, setListening] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const duel = useCurrentDuel();
  const nextId = useRef(1);
  const duelRef = useRef(duel);
  useEffect(() => {
    duelRef.current = duel;
  });

  const room = useActivityRoom(roundId, roomId, me, { onMessage });
  const sendRef = useRef(room.send);
  useEffect(() => {
    sendRef.current = room.send;
  });

  function toast(text: string, icon: ToastIcon, who?: ActivityPlayer) {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text: text.slice(0, 140), icon, who }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  function onMessage(m: ActivityMsg) {
    switch (m.t) {
      case "spray": {
        if (!m.from?.id || !Array.isArray(m.shares)) return;
        const amount = Math.max(0, Math.min(500, Number(m.amount) || 0));
        const mine = me ? Number(m.shares.find((s) => s?.id === me.id)?.coins ?? 0) : 0;
        setRain({ id: nextId.current++, from: m.from, amount, mine });
        if (mine > 0) playSfx("found");
        break;
      }
      case "jukebox": {
        if (!(m.vibe in VIBE_BY_ID) || !m.by?.id) return;
        setPlaying({ vibe: m.vibe as Vibe, by: m.by, until: nowMs() + 30_000 });
        setListening(m.by.id === me?.id);
        break;
      }
      case "challenge": {
        if (!me || m.to !== me.id || !m.from?.id || (m.game !== "rps" && m.game !== "dice")) return;
        if (duelRef.current) {
          sendRef.current({ t: "answer", cid: m.cid, from: me.id, ok: false });
          return;
        }
        setInvites((list) => [...list.filter((i) => i.from.id !== m.from.id), { cid: m.cid, game: m.game, from: m.from, until: nowMs() + 30_000 }]);
        playSfx("start");
        break;
      }
      case "toast":
        if (m.from && m.from === me?.id) return;
        if (typeof m.text === "string") toast(m.text, m.icon && m.icon in TOAST_ICON ? m.icon : "star");
        break;
      case "mic":
        if (m.p?.id && m.p.id !== me?.id) toast(`${m.p.name} grabbed the mic: "${String(m.song).slice(0, 40)}". Open karaoke to hype them!`, "mic", m.p);
        break;
      default:
        break;
    }
  }

  // Money stops falling after a few seconds; invitations expire; the song ends.
  useEffect(() => {
    if (!rain) return;
    const id = window.setTimeout(() => setRain(null), 4500);
    return () => window.clearTimeout(id);
  }, [rain]);
  useEffect(() => {
    if (!invites.length) return;
    const id = window.setInterval(() => setInvites((list) => list.filter((i) => i.until > nowMs())), 1000);
    return () => window.clearInterval(id);
  }, [invites.length]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      setPlaying(null);
      setListening(false);
    }, Math.max(0, playing.until - nowMs()));
    return () => window.clearTimeout(id);
  }, [playing]);
  // Leaving the place stops the music.
  useEffect(() => () => stopLoop(), [roomId]);

  function accept(inv: Invite) {
    if (!me || !roomId) return;
    setInvites((list) => list.filter((i) => i.cid !== inv.cid));
    startDuel({ cid: inv.cid, game: inv.game, me, them: inv.from, roundId, roomId, role: "challenged" });
  }
  function decline(inv: Invite) {
    setInvites((list) => list.filter((i) => i.cid !== inv.cid));
    if (me) sendRef.current({ t: "answer", cid: inv.cid, from: me.id, ok: false });
  }
  function listen() {
    if (!playing) return;
    if (listening) {
      stopLoop();
      setListening(false);
    } else {
      playLoop(playing.vibe, { seconds: Math.max(3, (playing.until - nowMs()) / 1000) });
      setListening(true);
    }
  }

  if (!roomId) return null;
  return (
    <>
      <ActivityStyles />
      {rain && <SprayRain key={rain.id} count={rain.amount >= 200 ? 48 : 30} />}
      <div className={cn("pointer-events-none fixed inset-x-0 top-16 z-[45] flex flex-col items-center gap-2 px-3", className)}>
        {rain && (
          <div key={rain.id} className="act-pop flex items-center gap-2 rounded-2xl bg-[#2b8a3e] px-3 py-2 text-sm font-semibold text-white shadow-lg">
            <Face p={rain.from} size={28} />
            <span>
              {rain.from.id === me?.id ? "You" : rain.from.name} sprayed {rain.amount} mint!
              {rain.mine > 0 && <b className="ml-1 text-gold">+{rain.mine} for you!</b>}
            </span>
          </div>
        )}
        {invites.map((inv) => (
          <DuelInvite key={inv.cid} from={inv.from} game={inv.game} onAccept={() => accept(inv)} onDecline={() => decline(inv)} />
        ))}
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.icon] ?? Star;
          return (
            <div key={t.id} className="act-rise flex max-w-sm items-center gap-2 rounded-2xl bg-panel/95 px-3 py-2 text-sm shadow-lg">
              {t.who ? <Face p={t.who} size={24} /> : <Icon className="size-4 shrink-0 text-[#7048e8]" />}
              <span>{t.text}</span>
            </div>
          );
        })}
        {playing && (
          <button onClick={listen} className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink/85 py-1.5 pl-2 pr-3 text-xs font-semibold text-white shadow-lg">
            <span className="grid size-6 place-items-center rounded-full" style={{ background: VIBE_BY_ID[playing.vibe].color }}>
              <Music className="size-3.5" style={{ animation: "act-bounce .5s ease-in-out infinite" }} />
            </span>
            Now playing: {VIBE_BY_ID[playing.vibe].name} · {playing.by.id === me?.id ? "your pick" : playing.by.name}
            {listening ? <Square className="size-3.5" fill="currentColor" /> : <Volume2 className="size-3.5" />}
          </button>
        )}
      </div>
      {duel && duel.roomId === roomId && <DuelSheet key={duel.cid} duel={duel} />}
    </>
  );
}
