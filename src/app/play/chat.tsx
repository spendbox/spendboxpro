"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowDown, ArrowLeft, LoaderCircle, Mic, Pause } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { Bot, Building2, ChevronDown, ChevronUp, HotAirBalloon, Lock, LogOut, MessageCircle, Play, Users, X } from "@/components/icons";
import type { Avatar } from "@/lib/avatar";
import { cleanAvatar, defaultAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { npcChatter, npcsFor, type Npc, type NpcMessage } from "@/lib/npcs";
import { createClient } from "@/lib/supabase/client";
import { BotCard } from "./bot-card";
import { loadDms, loadRoom, sendMessage, sendVoice, voiceUrl, type ChatMessage, type ChatTarget } from "./chat-actions";
import { NpcCard, REGULAR_PILL } from "./npc-card";
import { formatCountdown, levelLabel, levelOf, useCountdown, type RoomInfo, type RoomMember } from "./rooms";

// In-game chat, in places: everyone on the same floor of a building (or the same hot-air
// balloon) chats together ("Here"), along with the place's regulars (made-up people who live
// there). Plus private messages between two players and a People list to find anyone in the
// round. Text and voice notes. Everything resets when a new map starts.
//
// It only ever opens when someone taps the Chat button. On phones it's a sheet over the bottom
// half of the screen (drag or tap the handle to make it bigger); on computers a side panel.

const BOT_ID = "00000000-0000-0000-0000-00000000b07a";
const BOT_BOUNTY = 200;
/** The regulars' chat shown when you walk in starts this long before you arrived. */
const NPC_BACKLOG_MS = 10 * 60 * 1000;

export type ChatPlayer = { id: string; name: string; role: "hider" | "seeker"; caught: boolean; avatar: Avatar };

// Hiders are "Ghosts" and seekers "Hunters" everywhere players can read it.
const ROLE_STYLE: Record<ChatMessage["sender_role"] | "bot", { label: string; pill: string }> = {
  hider: { label: "Ghost", pill: "bg-me/15 text-me" },
  seeker: { label: "Hunter", pill: "bg-gold/25 text-gold-dark" },
  watcher: { label: "Watching", pill: "bg-panel-2 text-muted" },
  bot: { label: "Bot", pill: "bg-[#7048e8]/15 text-[#5f3dc4]" },
};

const time = (at: string | number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const botNameOf = (m: ChatMessage) => m.sender_name.replace(/\s*\(bot\)$/i, "") || "The bot";
const firstName = (name: string) => name.split(" ")[0] || name;

/** A regular from their id ("npc:<roomId>:<n>"), e.g. when someone taps one in the 3D view. */
function findNpc(id: string, roundId: number): Npc | null {
  const m = /^npc:(.+):(\d+)$/.exec(id);
  if (!m) return null;
  // The first regulars in a place are the same whatever its size, so ask for the most.
  return npcsFor(m[1], roundId, 1000).find((n) => n.id === id) ?? null;
}

/** "Floor 4 · Lekki Tower" for a building level; the place's own name otherwise. */
function placeTitle(room: RoomInfo) {
  const label = room.kind === "building" ? levelLabel(room.level ?? levelOf(room.id)) : "";
  if (!label) return room.name;
  const base = room.name
    .split(" · ")
    .filter((part) => part !== label)
    .join(" · ");
  return base ? `${label} · ${base}` : label;
}

/**
 * On phones, where the visible screen is (the on-screen keyboard shrinks it), how tall the
 * whole screen is, and whether the keyboard is up. Null on bigger screens.
 */
function useKeyboardSafeArea(active: boolean) {
  const [box, setBox] = useState<{ top: number; height: number; full: number; keyboard: boolean } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !active) return;
    // The tallest the screen has been (some phones shrink the whole page for the keyboard).
    let tallest = 0;
    let width = 0;
    const update = () => {
      // Only matters on small screens.
      if (window.innerWidth >= 640) return setBox(null);
      if (window.innerWidth !== width) {
        width = window.innerWidth; // turned sideways: start again
        tallest = 0;
      }
      tallest = Math.max(tallest, window.innerHeight, vv.height);
      setBox({ top: vv.offsetTop, height: vv.height, full: tallest, keyboard: vv.height < tallest * 0.8 });
    };
    // Phones open the keyboard in steps (and iOS reports it late), so check again shortly
    // after a text box gets focus.
    const timers: number[] = [];
    const onFocus = () => {
      update();
      for (const ms of [100, 300, 600]) timers.push(window.setTimeout(update, ms));
    };
    // Stop the page behind from scrolling while the chat is open.
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("focusin", onFocus);
    window.addEventListener("focusout", onFocus);
    return () => {
      timers.forEach(clearTimeout);
      html.style.overflow = before;
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("focusin", onFocus);
      window.removeEventListener("focusout", onFocus);
    };
  }, [active]);
  return box;
}

function BotFace({ size }: { size: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-[#e5dbff] text-[#5f3dc4]" style={{ width: size, height: size }}>
      <Bot style={{ width: size * 0.6, height: size * 0.6 }} aria-hidden />
    </span>
  );
}

type Thread = { id: string; name: string };
type List = { key: string; round: number; list: ChatMessage[] };
/** One line in the chat: a real message, or something a regular said (only on this device). */
type Item = { key: string; at: number; m: ChatMessage; npc?: undefined } | { key: string; at: number; npc: NpcMessage; m?: undefined };

const append = (list: ChatMessage[], m: ChatMessage, max: number) => (list.some((x) => x.id === m.id) ? list : [...list, m].slice(-max));
const toItem = (m: ChatMessage): Item => ({ key: `m${m.id}`, at: Date.parse(m.created_at), m });

export function Chat({
  meId,
  meRole,
  roundId,
  players,
  open,
  onOpenChange,
  room,
  roomMembers,
  roomCount,
  onLeaveRoom,
  guest,
  rideEndsAt = null,
  onBotInfo,
  botName: botNameProp,
  botBounty = BOT_BOUNTY,
  dmRequest = null,
  enteredAt = null,
  externalNpc = null,
}: {
  meId: string;
  meRole: "hider" | "seeker" | null;
  roundId: number;
  /** Everyone in this round (not the bot). */
  players: ChatPlayer[];
  /** The chat only opens when this turns true (the Chat button calls onOpenChange(true)). */
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The place you're in (a building level or a balloon), or null. */
  room: RoomInfo | null;
  /** Everyone in that place right now (from useRooms().members). */
  roomMembers: RoomMember[];
  /** How many are in that place (useRooms().counts[room.id]). */
  roomCount: number;
  onLeaveRoom: () => void;
  /** Watching without signing in: shows a "Sign in to chat" panel instead. */
  guest: boolean;
  /** Balloon rides: when the ride ends (ms timestamp). */
  rideEndsAt?: number | null;
  /** Tapping the bot's name or face. Without this, the chat shows its own bot card. */
  onBotInfo?: () => void;
  /** The bot's name for the built-in bot card (otherwise taken from its messages). */
  botName?: string;
  /** Coins for finding the bot, for the built-in bot card. */
  botBounty?: number;
  /** Open a private chat with this person (e.g. tapping a caught ghost on the map). */
  dmRequest?: { id: string; name: string; at: number } | null;
  /** When you went into this place (useRooms().enteredAt). Without it, the chat notes the time itself. */
  enteredAt?: number | null;
  /** Show a regular's card (e.g. someone tapped a regular in the 3D view). id is "npc:<roomId>:<n>"; change `at` to ask again. */
  externalNpc?: { id: string; at: number } | null;
}) {
  const roomId = room?.id ?? null;
  const roomCap = room?.capacity ?? 30;
  const [roomMsgs, setRoomMsgs] = useState<List | null>(null);
  const [dms, setDms] = useState<List | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [tab, setTab] = useState<"here" | "private" | "people">("here");
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [findText, setFindText] = useState("");
  const [botCard, setBotCard] = useState<string | null>(null);
  const [npcCard, setNpcCard] = useState<Npc | null>(null);
  const [expanded, setExpanded] = useState(false);
  const box = useKeyboardSafeArea(open);
  const rideLeft = useCountdown(room?.kind === "balloon" ? rideEndsAt : null);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const memberById = useMemo(() => new Map(roomMembers.map((p) => [p.id, p])), [roomMembers]);
  const avatarOf = useCallback(
    (id: string, name: string) => byId.get(id)?.avatar ?? (memberById.has(id) ? cleanAvatar(memberById.get(id)!.avatar, name) : defaultAvatar(name)),
    [byId, memberById],
  );
  const showBot = useCallback(
    (name: string) => {
      if (onBotInfo) onBotInfo();
      else setBotCard(name);
    },
    [onBotInfo],
  );
  const faceOf = useCallback(
    (id: string, name: string, size: number) =>
      id === BOT_ID ? (
        <button onClick={() => showBot(botNameProp ?? name.replace(/\s*\(bot\)$/i, ""))} aria-label="About the bot" className="shrink-0 rounded-full">
          <BotFace size={size} />
        </button>
      ) : (
        <AvatarFace avatar={avatarOf(id, name)} size={size} className="shrink-0 rounded-full" />
      ),
    [avatarOf, showBot, botNameProp],
  );

  // Load my private messages for this round.
  useEffect(() => {
    if (guest) return;
    let cancelled = false;
    loadDms()
      .then((res) => {
        if (!cancelled && res.ok) setDms({ key: "dm", round: res.roundId, list: res.messages });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roundId, guest]);

  // Load the place you're in (each time you enter a new one).
  useEffect(() => {
    if (guest || !roomId) return;
    let cancelled = false;
    loadRoom(roomId)
      .then((res) => {
        if (!cancelled && res.ok) setRoomMsgs({ key: res.room, round: res.roundId, list: res.messages });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roomId, roundId, guest]);

  // Live: one listener for the whole round; keep what belongs to your place or your private chats.
  const addMessage = useCallback((m: ChatMessage) => {
    if (m.recipient_id) {
      setDms((d) => (d && d.round === m.round_id ? { ...d, list: append(d.list, m, 400) } : d));
    } else {
      setRoomMsgs((r) => (r && r.round === m.round_id && (m.room === r.key || m.room === "*") ? { ...r, list: append(r.list, m, 200) } : r));
    }
  }, []);
  useEffect(() => {
    if (guest) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `round_id=eq.${roundId}` },
        (payload) => addMessage(payload.new as ChatMessage),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, guest, addMessage]);

  // ---- the place's regulars: who they are, and what they've been saying
  const npcs = useMemo(() => (roomId && !guest ? npcsFor(roomId, roundId, roomCap) : []), [roomId, roundId, roomCap, guest]);
  // When you walked in (from useRooms, or noted here when the place changes).
  const [noted, setNoted] = useState<{ room: string; at: number } | null>(null);
  useEffect(() => {
    if (enteredAt) return;
    const id = setTimeout(() => setNoted((n) => (!roomId ? null : n?.room === roomId ? n : { room: roomId, at: Date.now() })), 0);
    return () => clearTimeout(id);
  }, [roomId, enteredAt]);
  const since = enteredAt ?? (noted && noted.room === roomId ? noted.at : null);
  // The regulars' clock: moves on every 15 seconds while the chat is open.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!open || !roomId || guest) return;
    const tick = () => setClock(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open, roomId, guest]);
  const npcLines = useMemo(() => {
    if (!roomId || guest) return [];
    const to = Math.max(clock, since ?? 0);
    return npcChatter(roomId, roundId, (since ?? to) - NPC_BACKLOG_MS, to, roomCap).slice(-80);
  }, [roomId, roundId, roomCap, since, clock, guest]);

  const hereMsgs = useMemo(
    () => (roomId && roomMsgs && roomMsgs.key === roomId && roomMsgs.round === roundId ? roomMsgs.list : []),
    [roomMsgs, roomId, roundId],
  );
  const hereItems = useMemo(() => {
    const list: Item[] = hereMsgs.map(toItem);
    for (const n of npcLines) list.push({ key: n.id, at: n.at, npc: n });
    return list.sort((a, b) => a.at - b.at);
  }, [hereMsgs, npcLines]);
  const dmMsgs = useMemo(() => (dms && dms.round === roundId ? dms.list : []), [dms, roundId]);
  const conversations = useMemo(() => {
    const map = new Map<string, { id: string; name: string; last: ChatMessage }>();
    for (const m of dmMsgs) {
      const otherId = m.sender_id === meId ? m.recipient_id! : m.sender_id;
      const name = (m.sender_id === meId ? m.recipient_name : m.sender_name) || map.get(otherId)?.name || "Player";
      map.set(otherId, { id: otherId, name, last: m });
    }
    return [...map.values()].sort((a, b) => b.last.id - a.last.id);
  }, [dmMsgs, meId]);

  const threadId = thread?.id ?? null;
  const threadItems = useMemo(
    () => (threadId ? dmMsgs.filter((m) => m.sender_id === threadId || m.recipient_id === threadId).map(toItem) : []),
    [dmMsgs, threadId],
  );
  const shown = thread ? threadItems : hereItems;

  // Unread counts (what arrived since you last looked at each place or private chat).
  const key = thread ? `dm:${thread.id}` : `room:${roomId}`;
  const visibleKey = open && (thread || (tab === "here" && roomId)) ? key : null;
  const newest = (thread ? dmMsgs.filter((m) => m.sender_id === thread.id || m.recipient_id === thread.id) : hereMsgs).at(-1)?.id ?? 0;
  useEffect(() => {
    if (!visibleKey) return;
    const id = requestAnimationFrame(() => setSeen((s) => ({ ...s, [visibleKey]: newest })));
    return () => cancelAnimationFrame(id);
  }, [visibleKey, newest]);
  const unreadHere = hereMsgs.filter((m) => m.id > (seen[`room:${roomId}`] ?? 0) && m.sender_id !== meId).length;
  const unreadDm = dmMsgs.filter((m) => m.recipient_id === meId && m.id > (seen[`dm:${m.sender_id}`] ?? 0)).length;
  const unread = unreadHere + unreadDm;

  async function send(text: string) {
    setError(null);
    const target: ChatTarget | null = thread ? { to: thread.id } : roomId ? { room: roomId } : null;
    if (!target) return false;
    try {
      const res = await sendMessage(text, target);
      if (res.ok) addMessage(res.message);
      else setError(res.error);
      return res.ok;
    } catch {
      setError("The connection blinked. Try again.");
      return false;
    }
  }

  async function sendAudio(blob: Blob, seconds: number) {
    setError(null);
    const form = new FormData();
    form.set("audio", blob);
    form.set("seconds", String(seconds));
    if (thread) form.set("to", thread.id);
    else if (roomId) form.set("room", roomId);
    else return;
    try {
      const res = await sendVoice(form);
      if (res.ok) addMessage(res.message);
      else setError(res.error);
    } catch {
      setError("The connection blinked. Try again.");
    }
  }

  function openThread(id: string, name: string) {
    if (id === BOT_ID) return showBot(botNameProp ?? name.replace(/\s*\(bot\)$/i, ""));
    if (id === meId) return;
    setThread({ id, name });
    setTab("private");
  }

  // Someone asked to message a particular player (from the map).
  const lastDm = useRef(0);
  useEffect(() => {
    if (!dmRequest || dmRequest.at === lastDm.current || dmRequest.id === meId) return;
    const id = setTimeout(() => {
      lastDm.current = dmRequest.at;
      setThread({ id: dmRequest.id, name: dmRequest.name });
      setTab("private");
    }, 0);
    return () => clearTimeout(id);
  }, [dmRequest, meId]);

  // Someone tapped a regular in the 3D view: show their card (the chat stays as it is).
  const lastNpc = useRef(0);
  useEffect(() => {
    if (!externalNpc || externalNpc.at === lastNpc.current) return;
    const npc = findNpc(externalNpc.id, roundId);
    const id = setTimeout(() => {
      lastNpc.current = externalNpc.at;
      if (npc) setNpcCard(npc);
    }, 0);
    return () => clearTimeout(id);
  }, [externalNpc, roundId]);

  const closeNpc = useCallback(() => setNpcCard(null), []);
  const cards = (
    <>
      {botCard !== null && <BotCard botName={botCard || "The bot"} bounty={botBounty} onClose={() => setBotCard(null)} />}
      {npcCard && <NpcCard npc={npcCard} onClose={closeNpc} />}
    </>
  );

  function close() {
    onOpenChange(false);
    setExpanded(false);
  }

  // The handle on top of the phone sheet: tap to make it bigger or smaller, or drag it
  // (up: bigger, down: smaller, down again: close).
  const drag = useRef<{ y: number } | null>(null);
  const dragged = useRef(false);

  if (!open) {
    const short = room ? (room.kind === "building" ? levelLabel(room.level ?? levelOf(room.id)) || room.name : room.name) : null;
    return (
      <>
        <button
          onClick={() => onOpenChange(true)}
          className="glass pointer-events-auto relative flex min-w-0 max-w-[48vw] items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold sm:max-w-xs"
        >
          <MessageCircle className="size-4 shrink-0" aria-hidden />
          <span className="shrink-0">Chat</span>
          {!guest && short && <span className="min-w-0 truncate font-normal text-muted">· {short}</span>}
          {!guest && unreadDm > 0 ? (
            <span className="absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full bg-[#7048e8] px-1.5 py-0.5 text-[11px] text-white shadow" title="New private message">
              <Lock className="size-3" aria-hidden /> {unreadDm > 9 ? "9+" : unreadDm}
            </span>
          ) : (
            !guest &&
            unread > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-hit px-1 text-[11px] text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )
          )}
        </button>
        {cards}
      </>
    );
  }

  const q = findText.trim().toLowerCase();
  const people = players
    .filter((p) => p.id !== meId && p.name.toLowerCase().includes(q))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  const others = roomMembers.filter((p) => p.id !== meId);
  const herePeople = others.filter((p) => p.name.toLowerCase().includes(q));
  const hereNpcs = npcs.filter((n) => n.name.toLowerCase().includes(q) || n.role.toLowerCase().includes(q));

  // Where the sheet sits on a phone: its bottom on the keyboard (or the bottom of the screen).
  // Half the screen (or nearly all of it when made bigger); while typing, all the space above the keyboard.
  let sheetStyle: React.CSSProperties | undefined;
  if (box) {
    const h = Math.round(box.keyboard ? box.height : Math.min((expanded ? 0.9 : 0.5) * box.full, box.height));
    sheetStyle = { top: box.top + box.height - h, height: h };
  }

  const placeLine = room && (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel-2/60 px-3 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-panel text-ink shadow-sm">
        {room.kind === "balloon" ? <HotAirBalloon className="size-5" /> : <Building2 className="size-5" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">
          <b>{placeTitle(room)}</b>
          {room.kind === "balloon" && rideLeft !== null && <span className="text-muted"> · ride ends in {formatCountdown(rideLeft)}</span>}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted">
          <Users className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {roomCount.toLocaleString()}/{room.capacity.toLocaleString()}
            {room.kind === "building" ? " inside" : " riding"}
            {npcs.length > 0 && ` · ${npcs.length} regular${npcs.length === 1 ? "" : "s"}`}
            {meRole && (
              <>
                {" · you're a "}
                <b className={meRole === "hider" ? "text-me" : "text-gold-dark"}>{ROLE_STYLE[meRole].label}</b>
              </>
            )}
          </span>
        </p>
      </div>
      <button onClick={onLeaveRoom} className="flex shrink-0 items-center gap-1 rounded-full bg-panel px-3 py-1.5 text-xs font-semibold shadow-sm">
        <LogOut className="size-3.5" aria-hidden />
        Leave
      </button>
    </div>
  );

  // Faces of everyone here: real players first (tap to message privately), then the regulars.
  const MAX_FACES = 40;
  const peopleRow = room && (others.length > 0 || npcs.length > 0) && (
    <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none]" aria-label="People here">
      {others.slice(0, MAX_FACES).map((p) => {
        const role = byId.get(p.id)?.role;
        return (
          <button key={p.id} onClick={() => openThread(p.id, p.name)} className="flex w-14 shrink-0 flex-col items-center gap-0.5" title={`Message ${p.name} privately`}>
            <AvatarFace
              avatar={avatarOf(p.id, p.name)}
              size={36}
              className={cn("rounded-full ring-2", role === "hider" ? "ring-me" : role === "seeker" ? "ring-gold" : "ring-line")}
            />
            <span className="w-full truncate text-center text-[10px] font-semibold">{firstName(p.name)}</span>
          </button>
        );
      })}
      {others.length > MAX_FACES && (
        <button onClick={() => setTab("people")} className="flex w-14 shrink-0 flex-col items-center gap-0.5">
          <span className="grid size-9 place-items-center rounded-full bg-panel-2 text-xs font-semibold">+{(others.length - MAX_FACES).toLocaleString()}</span>
          <span className="text-[10px] text-muted">more</span>
        </button>
      )}
      {npcs.map((n) => (
        <button key={n.id} onClick={() => setNpcCard(n)} className="flex w-14 shrink-0 flex-col items-center gap-0.5" title={`${n.name}, ${n.role}`}>
          <span className="relative">
            <AvatarFace avatar={n.avatar} size={36} className="rounded-full" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#0b7285] px-1 text-[8px] font-bold uppercase leading-3 text-white">Regular</span>
          </span>
          <span className="mt-0.5 w-full truncate text-center text-[10px] text-muted">{firstName(n.name)}</span>
        </button>
      ))}
    </div>
  );

  // Drawn straight onto the page (not inside the game's layers) so nothing can stop it from
  // sitting right above the keyboard.
  return createPortal(
    <section
      aria-label="Chat"
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-3xl bg-panel shadow-[0_-8px_40px_-12px_rgb(24_32_43/0.35)]",
        "sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:rounded-3xl",
        expanded ? "h-[90dvh] sm:h-[calc(100dvh-2rem)]" : "h-[50dvh] sm:h-[min(640px,calc(100dvh-7rem))]",
      )}
      style={sheetStyle}
    >
      <button
        type="button"
        aria-label={expanded ? "Make the chat smaller" : "Make the chat bigger"}
        onPointerDown={(e) => {
          drag.current = { y: e.clientY };
          dragged.current = false;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dy = e.clientY - d.y;
          if (Math.abs(dy) < 24) return;
          dragged.current = true;
          if (dy < 0) setExpanded(true);
          else if (expanded) setExpanded(false);
          else close();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClick={() => {
          if (dragged.current) dragged.current = false;
          else setExpanded((v) => !v);
        }}
        className="flex w-full shrink-0 touch-none justify-center pb-1 pt-2 sm:hidden"
      >
        <span className="h-1.5 w-10 rounded-full bg-line" />
      </button>

      <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 pb-2 sm:pt-2.5">
        {thread ? (
          <>
            <button onClick={() => setThread(null)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Back">
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            {faceOf(thread.id, thread.name, 32)}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{thread.name}</h2>
              <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-[#5f3dc4]">
                <Lock className="size-3 shrink-0" aria-hidden />
                Private
                <span className="truncate font-normal text-muted">
                  {" · "}
                  {byId.get(thread.id) ? ROLE_STYLE[byId.get(thread.id)!.role].label : "Player"}
                  {byId.get(thread.id)?.caught ? " (caught)" : ""}
                </span>
              </p>
            </div>
          </>
        ) : guest ? (
          <h2 className="flex-1 px-1 font-semibold">Chat</h2>
        ) : (
          <div className="flex min-w-0 flex-1 gap-1 rounded-xl bg-panel-2 p-1 text-sm font-semibold" role="tablist">
            {(["here", "private", "people"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg py-1.5", tab === t ? "bg-panel shadow-sm" : "text-muted")}
              >
                {t === "private" && <Lock className="size-3.5 shrink-0" aria-hidden />}
                {t === "people" && <Users className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{t === "here" ? "Here" : t === "private" ? "Private" : "People"}</span>
                {t === "here" && unreadHere > 0 && <span className="size-1.5 shrink-0 rounded-full bg-hit" aria-label="new" />}
                {t === "private" && unreadDm > 0 && <span className="size-1.5 shrink-0 rounded-full bg-hit" aria-label="new" />}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2"
          aria-label={expanded ? "Make the chat smaller" : "Make the chat bigger"}
        >
          {expanded ? <ChevronDown className="size-5" aria-hidden /> : <ChevronUp className="size-5" aria-hidden />}
        </button>
        <button onClick={close} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close chat">
          <X className="size-5" aria-hidden />
        </button>
      </header>

      {guest ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
          <MessageCircle className="size-10 text-muted" aria-hidden />
          <p className="font-semibold">Sign in to chat</p>
          <p className="text-sm text-muted">
            Once you&apos;re signed in, you can step into buildings and hot-air balloons to chat with the people there, and message
            players privately.
          </p>
          <Link href="/login" className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-ink shadow">
            Sign in
          </Link>
        </div>
      ) : (
        <>
          {!thread && tab === "here" && placeLine}
          {!thread && tab === "here" && !box?.keyboard && peopleRow}

          {!thread && tab === "people" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-2">
                <input
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Find a player"
                  className="w-full rounded-full border border-line bg-panel px-4 py-2 text-base outline-none focus:border-gold sm:text-sm"
                />
              </div>
              <ul className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
                {room && (
                  <>
                    <li className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      In this place ({roomCount.toLocaleString()})
                    </li>
                    {herePeople.length === 0 && <li className="px-2 py-2 text-sm text-muted">{q ? "Nobody by that name here." : "Just you here so far."}</li>}
                    {herePeople.slice(0, 200).map((p) => {
                      const player = byId.get(p.id);
                      return (
                        <li key={`here-${p.id}`}>
                          <button onClick={() => openThread(p.id, p.name)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-panel-2">
                            <AvatarFace avatar={avatarOf(p.id, p.name)} size={36} className="shrink-0 rounded-full" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{p.name}</span>
                              <span className="text-xs text-muted">Tap to message privately</span>
                            </span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ROLE_STYLE[player?.role ?? "watcher"].pill)}>
                              {ROLE_STYLE[player?.role ?? "watcher"].label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {hereNpcs.length > 0 && (
                      <li className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Regulars here ({hereNpcs.length})</li>
                    )}
                    {hereNpcs.map((n) => (
                      <li key={n.id}>
                        <button onClick={() => setNpcCard(n)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-panel-2">
                          <AvatarFace avatar={n.avatar} size={36} className="shrink-0 rounded-full" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{n.name}</span>
                            <span className="block truncate text-xs text-muted">{n.role} · tap to say hi</span>
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", REGULAR_PILL)}>Regular</span>
                        </button>
                      </li>
                    ))}
                    <li className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Everyone in this game</li>
                  </>
                )}
                {people.length === 0 && <li className="p-6 text-center text-sm text-muted">Nobody else here yet.</li>}
                {people.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => openThread(p.id, p.name)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-panel-2">
                      <AvatarFace avatar={p.avatar} size={40} className={cn("shrink-0 rounded-full", p.caught && "opacity-50 grayscale")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.name}</span>
                        <span className="text-xs text-muted">{p.caught ? "Caught this round" : "Tap to message privately"}</span>
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ROLE_STYLE[p.role].pill)}>{ROLE_STYLE[p.role].label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : !thread && tab === "private" ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              <p className="flex items-center gap-1 px-2 pb-2 text-[11px] text-muted">
                <Lock className="size-3 shrink-0" aria-hidden />
                Private messages: only you and the other player can see them.
              </p>
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted">
                  <p>No private chats yet.</p>
                  <button onClick={() => setTab("people")} className="mt-3 rounded-full bg-panel-2 px-4 py-2 font-semibold text-ink">
                    Find someone to message
                  </button>
                </div>
              ) : (
                conversations.map((c) => (
                  <button key={c.id} onClick={() => setThread({ id: c.id, name: c.name })} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-panel-2">
                    {faceOf(c.id, c.name, 40)}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{c.name}</span>
                        <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-[#5f3dc4]">
                          <Lock className="size-2.5" aria-hidden />
                          Private
                        </span>
                      </span>
                      <span className="flex items-center gap-1 truncate text-sm text-muted">
                        {c.last.sender_id === meId ? "You: " : ""}
                        {c.last.body ?? (
                          <>
                            <Mic className="size-3.5 shrink-0" aria-hidden /> Voice note
                          </>
                        )}
                      </span>
                    </span>
                    <span className="text-xs text-muted">{time(c.last.created_at)}</span>
                  </button>
                ))
              )}
            </div>
          ) : !thread && !room ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-6 text-center">
              <span className="flex gap-2 text-muted" aria-hidden>
                <Building2 className="size-8" />
                <HotAirBalloon className="size-8" />
              </span>
              <p className="text-sm text-muted">Switch to Chat mode and tap a building or a hot-air balloon to go in and meet the people there.</p>
            </div>
          ) : (
            <Messages
              key={thread ? `dm:${thread.id}` : `room:${roomId}`}
              items={shown}
              meId={meId}
              onName={openThread}
              onNpc={setNpcCard}
              isPrivate={Boolean(thread)}
              faceOf={faceOf}
            />
          )}

          {(thread || (tab === "here" && room)) && (
            <Composer onSend={send} onAudio={sendAudio} placeholder={thread ? `Private message to ${thread.name}` : `Message ${room ? placeTitle(room) : "everyone here"}`} />
          )}
          {error && <p className="shrink-0 px-4 pb-2 text-xs text-hit">{error}</p>}
        </>
      )}
      {cards}
    </section>,
    document.body,
  );
}

function Messages({
  items,
  meId,
  onName,
  onNpc,
  isPrivate,
  faceOf,
}: {
  items: Item[];
  meId: string;
  onName: (id: string, name: string) => void;
  onNpc: (npc: Npc) => void;
  isPrivate: boolean;
  faceOf: (id: string, name: string, size: number) => React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  // Follow new messages while you're at the bottom; stay put once you scroll up to read.
  const stick = useRef(true);
  const prevLast = useRef("");
  const lastKey = items.at(-1)?.key ?? "";
  const [atBottom, setAtBottom] = useState(true);
  const [seenKey, setSeenKey] = useState(lastKey);

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Opening, switching place/person (this list starts fresh), and new messages.
  useLayoutEffect(() => {
    const last = items.at(-1);
    const fresh = Boolean(last) && last!.key !== prevLast.current;
    prevLast.current = last?.key ?? "";
    // Your own message always takes you down to it.
    if (stick.current || (fresh && last!.m?.sender_id === meId)) {
      stick.current = true;
      toBottom();
    }
  }, [items, meId, toBottom]);

  // The sheet growing or shrinking (or the keyboard opening) keeps you at the newest message.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stick.current = near;
    if (near !== atBottom) setAtBottom(near);
    if (near && seenKey !== lastKey) setSeenKey(lastKey);
  }

  const seenAt = items.findIndex((it) => it.key === seenKey);
  const unseen = atBottom ? 0 : seenAt < 0 ? items.length : items.length - 1 - seenAt;
  const senderOf = (it: Item | undefined) => (!it ? null : it.npc ? it.npc.npc.id : it.m.sender_id === BOT_ID && it.m.room === "*" ? "*" : it.m.sender_id);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div ref={inner} className="space-y-2">
          {items.length === 0 && (
            <p className="flex items-center justify-center gap-1.5 p-6 text-center text-sm text-muted">
              {isPrivate ? (
                <>
                  <Lock className="size-3.5 shrink-0" aria-hidden /> Say hello. Only the two of you can see this.
                </>
              ) : (
                "Nobody has said anything here yet. Say hi!"
              )}
            </p>
          )}
          {items.map((it, i) => {
            const sameAsPrev = senderOf(items[i - 1]) === senderOf(it) && senderOf(it) !== "*";

            // A regular: shown like a player, with a "Regular" pill. Only on this device.
            if (it.npc) {
              const { npc, body } = it.npc;
              return (
                <div key={it.key} className="flex items-end gap-2">
                  <button onClick={() => onNpc(npc)} className={cn("shrink-0 rounded-full", sameAsPrev && "invisible")} aria-label={`About ${npc.name}`}>
                    <AvatarFace avatar={npc.avatar} size={28} className="rounded-full" />
                  </button>
                  <div className="flex max-w-[80%] flex-col items-start">
                    {!sameAsPrev && (
                      <button onClick={() => onNpc(npc)} className="mb-0.5 flex items-center gap-1.5 px-1 text-xs" title={`${npc.role} · tap to say hi`}>
                        <span className="font-semibold">{npc.name}</span>
                        <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", REGULAR_PILL)}>Regular</span>
                      </button>
                    )}
                    <div className="rounded-2xl rounded-bl-md border-l-4 border-[#0b7285]/40 bg-panel-2 px-3 py-2 text-sm">
                      <span className="break-words">{body}</span>
                      <span className="ml-2 align-bottom text-[10px] text-muted">{time(it.at)}</span>
                    </div>
                  </div>
                </div>
              );
            }

            const m = it.m;
            const mine = m.sender_id === meId;
            const bot = m.sender_id === BOT_ID;
            // The bot's teases go to every place at once: shown as their own special line.
            if (bot && m.room === "*") {
              return (
                <div key={it.key} className="mx-auto flex max-w-[92%] items-start gap-2 rounded-2xl bg-[#f3f0ff] px-3 py-2 text-sm ring-1 ring-[#7048e8]/25">
                  {faceOf(m.sender_id, m.sender_name, 28)}
                  <div className="min-w-0">
                    <button onClick={() => onName(m.sender_id, m.sender_name)} className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold">{botNameOf(m)}</span>
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", ROLE_STYLE.bot.pill)}>{ROLE_STYLE.bot.label}</span>
                      <span className="text-[10px] text-muted">· to everyone</span>
                    </button>
                    <p className="break-words">{m.body}</p>
                  </div>
                  <span className="ml-auto shrink-0 self-end text-[10px] text-muted">{time(m.created_at)}</span>
                </div>
              );
            }
            const role = ROLE_STYLE[bot ? "bot" : m.sender_role];
            return (
              <div key={it.key} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                {!mine && <span className={cn("shrink-0", sameAsPrev && "invisible")}>{faceOf(m.sender_id, m.sender_name, 28)}</span>}
                <div className={cn("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
                  {!mine && !sameAsPrev && (
                    <button
                      onClick={() => onName(m.sender_id, m.sender_name)}
                      className="mb-0.5 flex items-center gap-1.5 px-1 text-xs"
                      title={bot ? "About the bot" : "Message privately"}
                    >
                      <span className="font-semibold">{bot ? botNameOf(m) : m.sender_name}</span>
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", role.pill)}>{role.label}</span>
                    </button>
                  )}
                  {m.recipient_id && (
                    <span className={cn("mb-0.5 flex items-center gap-1 px-1 text-[10px] font-semibold text-[#5f3dc4]", mine && "justify-end")}>
                      <Lock className="size-2.5" aria-hidden />
                      Private{mine && m.recipient_name ? ` to ${m.recipient_name}` : ""}
                    </span>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm",
                      m.recipient_id && "ring-2 ring-[#7048e8]/40",
                      mine ? "rounded-br-md bg-ink text-white" : bot ? "rounded-bl-md bg-[#f3f0ff]" : "rounded-bl-md bg-panel-2",
                      !mine && !bot && m.sender_role === "hider" && "border-l-4 border-me",
                      !mine && !bot && m.sender_role === "seeker" && "border-l-4 border-gold",
                    )}
                  >
                    {m.audio_path ? <VoiceNote id={m.id} seconds={m.audio_seconds ?? 0} mine={mine} /> : <span className="break-words">{m.body}</span>}
                    <span className={cn("ml-2 align-bottom text-[10px]", mine ? "text-white/60" : "text-muted")}>{time(m.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!atBottom && (
        <button
          onClick={() => {
            stick.current = true;
            toBottom(true);
          }}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
        >
          {unseen > 0 ? `${unseen > 99 ? "99+" : unseen} new message${unseen === 1 ? "" : "s"}` : "Latest"}
          <ArrowDown className="size-3.5" aria-hidden />
        </button>
      )}
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
        className={cn("grid size-7 place-items-center rounded-full", mine ? "bg-white/20" : "bg-panel")}
        aria-label={state === "playing" ? "Pause" : "Play voice note"}
      >
        {state === "playing" ? (
          <Pause className="size-3.5" aria-hidden />
        ) : state === "loading" ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
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
    <div className="shrink-0 border-t border-line p-2.5">
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
            className="min-w-0 flex-1 rounded-full border border-line bg-panel px-4 py-2 text-base outline-none focus:border-gold sm:text-sm"
          />
          {text.trim() ? (
            <button disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Send
            </button>
          ) : (
            <button type="button" onClick={startRecording} disabled={busy} className="grid size-9 place-items-center rounded-full bg-panel-2" aria-label="Record a voice note">
              <Mic className="size-4" aria-hidden />
            </button>
          )}
        </form>
      )}
      {micError && <p className="mt-1 text-xs text-hit">{micError}</p>}
    </div>
  );
}
