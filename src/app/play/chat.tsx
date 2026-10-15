"use client";

import { rememberPerson } from "./people/recent-rail";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Camera, CircleHelp, ImagePlus, LoaderCircle, MapPin, Mic, Navigation, Newspaper, Pause, Search, SendHorizontal, UserCheck, UserPlus } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { Bot, Building2, ChevronDown, ChevronUp, Coins, Fish, HotAirBalloon, Lock, LogOut, MessageCircle, Play, Users, X } from "@/components/icons";
import type { Avatar } from "@/lib/avatar";
import { cleanAvatar, defaultAvatar } from "@/lib/avatar";
import { mintify } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { npcById, npcChatter, npcsFor, type Npc, type NpcMessage } from "@/lib/npcs";
import { createClient } from "@/lib/supabase/client";
import { BotCard } from "./bot-card";
import { loadDms, loadRoom, sendLocation, sendMessage, sendPhoto, sendVoice, voiceUrl, type ChatMessage, type ChatTarget } from "./chat-actions";
import { locationIn, withoutTag, type ChatLocation } from "@/lib/chat-location";
import { cash } from "@/lib/world/value";
import { ChatPhoto, PhotoPicker, type PhotoPick } from "./chat-photo";
import { NpcBadge, NpcCard, NpcFace } from "./npc-card";
import { closePhoneNotices } from "./phone/phone-notices";
import { useTutorialGlow } from "./tutorial";
import { RideIcon } from "./ride-icon";
import { formatCountdown, levelLabel, levelOf, useCountdown, type RoomInfo, type RoomMember } from "./rooms";

// In-game chat, in places: everyone on the same floor of a building (or the same hot-air
// balloon) chats together ("Here"), along with the place's NPCs (made-up people who live there,
// always marked "NPC"; tap one to chat with them). Plus private messages between two players
// and a People list to find anyone in the round. Text and voice notes. Everything resets when a
// new map starts.
//
// It only ever opens when someone taps the Chat button. On phones it's a sheet over the bottom
// half of the screen (drag or tap the handle to make it bigger); on computers a side panel.

const BOT_ID = "00000000-0000-0000-0000-00000000b07a";
/** What you've read in each private conversation, on this phone. */
const SEEN_KEY = "nt-chat-seen";
/** The NPCs' chat shown when you walk in starts this long before you arrived. */
const NPC_BACKLOG_MS = 10 * 60 * 1000;

export type ChatPlayer = {
  id: string;
  name: string;
  role: "hider" | "seeker";
  caught: boolean;
  avatar: Avatar;
  /** Holding 10,000+ coins: shown with a "Big fish" badge. */
  bigFish?: boolean;
};

/** "Big fish": a player holding lots of coins. */
function BigFishBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#1c7ed6]/12 px-1.5 py-px text-[10px] font-semibold text-[#1864ab]" title={`Holding ${cash(10_000)}+`}>
      <Fish className="size-3" aria-hidden />
      Big fish
    </span>
  );
}

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

/** An NPC from their id ("npc:<roomId>:<n>"), e.g. when someone taps one in the 3D view. */
function findNpc(id: string, roundId: number, here: string | null, hint: string | undefined): Npc | null {
  // The first NPCs in a place are the same whatever its size; jobs follow the place's theme.
  return npcById(id, roundId, here && id.startsWith(`npc:${here}:`) ? hint : undefined);
}

/** A place's theme, if the room carries one ("lounge", "office"…), so NPC jobs match the 3D view. */
function roomHint(room: RoomInfo | null): string | undefined {
  if (!room || !("theme" in room)) return undefined;
  const theme = (room as { theme?: unknown }).theme;
  return typeof theme === "string" && theme ? theme : undefined;
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
/** One line in the chat: a real message, or something an NPC said (only on this device). */
type Item = { key: string; at: number; m: ChatMessage; npc?: undefined } | { key: string; at: number; npc: NpcMessage; m?: undefined };

const append = (list: ChatMessage[], m: ChatMessage, max: number) => (list.some((x) => x.id === m.id) ? list : [...list, m].slice(-max));
const toItem = (m: ChatMessage): Item => ({ key: `m${m.id}`, at: Date.parse(m.created_at), m });

export function Chat({
  meId,
  meRole,
  roundId,
  keep,
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
  dmRequest = null,
  enteredAt = null,
  externalNpc = null,
  onGiveCoins,
  greet,
  friendStatusOf,
  onAddFriend,
  hideButton = false,
  onUnread,
  onSignIn,
  finder,
  onPerson,
  onSelfie,
  newtown,
  news,
  onlineNow,
  onCamera,
  onGoTo,
  onLocation,
  myLocation,
}: {
  meId: string;
  meRole: "hider" | "seeker" | null;
  roundId: number;
  /** The real map: chat isn't per round (roundId 0, the last week's messages). */
  keep?: boolean;
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
  /** Open a private chat with this person (e.g. tapping a caught ghost on the map). */
  dmRequest?: { id: string; name: string; at: number } | null;
  /** When you went into this place (useRooms().enteredAt). Without it, the chat notes the time itself. */
  enteredAt?: number | null;
  /** Open a chat with an NPC (e.g. someone tapped one in the 3D view). id is "npc:<roomId>:<n>"; change `at` to ask again. */
  externalNpc?: { id: string; at: number } | null;
  /** "Give coins" to a real player (shown in a private chat and on players in the people lists). */
  onGiveCoins?: (p: { id: string; name: string; avatar: unknown }) => void;
  /** Hug and handshake buttons for a real player (shown in a private chat). */
  greet?: (p: { id: string; name: string }) => React.ReactNode;
  /** Whether someone is already your friend (or asked, or was asked). */
  friendStatusOf?: (id: string) => "friend" | "incoming" | "outgoing" | null;
  /** "Add friend" on players in the people lists. */
  onAddFriend?: (p: { id: string; name: string }) => void;
  /** The bottom bar is folded away: no Chat button (the chat still opens when asked to). */
  hideButton?: boolean;
  /** How many unread messages there are (for a badge somewhere else while the button is hidden). */
  onUnread?: (n: number) => void;
  /** Watchers: open the sign-in pop-up. */
  onSignIn?: () => void;
  /** The real map: People finds anyone (by name, the nearest first) instead of this round's players. */
  finder?: React.ReactNode;
  /** Tapping a player's name or face: their profile card. */
  onPerson?: (id: string) => void;
  /** Go to a location someone sent (the usual fare; the game does the trip). */
  onGoTo?: (loc: ChatLocation, from: string) => void;
  /** A location just arrived from someone (shown over the game unless you're reading their chat). */
  onLocation?: (p: { id: string; name: string; loc: ChatLocation }) => void;
  /** Where you are when you're out walking (the street); otherwise the server knows the building you're at. */
  myLocation?: () => { region: string; x: number; z: number } | null;
  /** "Take a selfie" in the picture menu: the game's camera, sending the picture here. */
  onSelfie?: (target: ChatTarget, to: string) => void;
  /**
   * The real map: Newtown's own chat (pinned on top): your notices as messages. `request`
   * changing opens it; onSeen when it's open (they're read).
   */
  newtown?: { lines: NewtownLine[]; unread: number; onSeen: () => void; onSettings: () => void; request: number };
  /** Newtown News (pinned under Newtown): the latest headline, and opening the news. */
  news?: { latest: string | null; onOpen: () => void };
  /** Who's online now, faces along the top of your chats (tap one to message them). */
  onlineNow?: { id: string; name: string; avatar: Avatar }[];
  /** Take a picture or a selfie (the game's camera). */
  onCamera?: () => void;
}) {
  // The walkthrough points at New chat while its "say hi" mission is on.
  const tutorialGlow = useTutorialGlow();
  const roomId = room?.id ?? null;
  const roomCap = room?.capacity ?? 30;
  const [roomMsgs, setRoomMsgs] = useState<List | null>(null);
  const [dms, setDms] = useState<List | null>(null);
  const [thread, setThreadNow] = useState<Thread | null>(null);
  // Newtown's own chat is open (the real map).
  const [newtownOpen, setNewtownOpen] = useState(false);
  const setThread = (t: Thread | null) => {
    setThreadNow(t);
    if (t) setNewtownOpen(false);
  };
  // The real map has no group chat in places (voice is enough there): your chats come first.
  const [tab, setTab] = useState<"here" | "private" | "people">(keep ? "private" : "here");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && keep && !thread) setTab("private");
    if (!open) setNewtownOpen(false);
    else if (open && !room && finder && tab === "here") setTab("people");
  }
  // What you've read in each conversation (the newest message id), kept on this phone too, so
  // read messages never count again after the game reloads.
  const [seen, setSeenNow] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!keep) return;
    const t = setTimeout(() => {
      try {
        const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
        if (v && typeof v === "object") setSeenNow((s) => ({ ...v, ...s }));
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [keep]);
  const setSeen = useCallback(
    (f: (s: Record<string, number>) => Record<string, number>) =>
      setSeenNow((s) => {
        const next = f(s);
        if (keep)
          try {
            const dmOnly = Object.fromEntries(Object.entries(next).filter(([k]) => k.startsWith("dm:")));
            localStorage.setItem(SEEN_KEY, JSON.stringify(dmOnly));
          } catch {}
        return next;
      }),
    [keep],
  );
  const [error, setError] = useState<string | null>(null);
  const [findText, setFindText] = useState("");
  const [botCard, setBotCard] = useState<string | null>(null);
  const [npcCard, setNpcCard] = useState<{ npc: Npc; auto: boolean } | null>(null);
  const openNpc = useCallback((npc: Npc, auto = false) => setNpcCard({ npc, auto }), []);
  const [expanded, setExpanded] = useState(false);
  const box = useKeyboardSafeArea(open);
  const rideLeft = useCountdown(room && room.kind !== "building" ? rideEndsAt : null);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const bigFishIds = useMemo(() => new Set(players.filter((p) => p.bigFish).map((p) => p.id)), [players]);
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
    loadDms(keep)
      .then((res) => {
        if (!cancelled && res.ok) setDms({ key: "dm", round: res.roundId, list: res.messages });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roundId, guest, keep]);

  // Load the place you're in (each time you enter a new one).
  useEffect(() => {
    if (guest || !roomId) return;
    let cancelled = false;
    loadRoom(roomId, keep)
      .then((res) => {
        if (!cancelled && res.ok) setRoomMsgs({ key: res.room, round: res.roundId, list: res.messages });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roomId, roundId, guest, keep]);

  // A private message was read (game-db/071): "Opened".
  const readMessage = useCallback((m: ChatMessage) => {
    if (!m.recipient_id) return;
    setDms((d) => (d ? { ...d, list: d.list.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)) } : d));
  }, []);
  // What the live listener needs to know without starting again (who you are, what's open).
  const meIdRef = useRef(meId);
  const openRef = useRef(open);
  const threadRef = useRef<string | null>(null);
  const onLocationRef = useRef(onLocation);
  useEffect(() => {
    meIdRef.current = meId;
    openRef.current = open;
    onLocationRef.current = onLocation;
  });
  // Live: one listener for the whole round; keep what belongs to your place or your private chats.
  const addMessage = useCallback((m: ChatMessage) => {
    if (m.recipient_id) {
      setDms((d) => (d && (keep || d.round === m.round_id) ? { ...d, list: append(d.list, m, 400) } : d));
      // Someone sent you where they are: say so over the game (unless you're reading their chat now).
      const loc = m.recipient_id === meIdRef.current && m.sender_id !== meIdRef.current ? locationIn(m.body) : null;
      if (loc && !(openRef.current && threadRef.current === m.sender_id)) onLocationRef.current?.({ id: m.sender_id, name: m.sender_name, loc });
    } else {
      setRoomMsgs((r) => (r && (keep ? m.room === r.key : r.round === m.round_id && (m.room === r.key || m.room === "*")) ? { ...r, list: append(r.list, m, 200) } : r));
    }
  }, [keep]);
  // A selfie sent from the camera: show it at once.
  useEffect(() => {
    const on = (e: Event) => addMessage((e as CustomEvent<ChatMessage>).detail);
    window.addEventListener("nt-chat-sent", on);
    return () => window.removeEventListener("nt-chat-sent", on);
  }, [addMessage]);
  // New messages, live. On the real map only the ones that concern you (sent to you, sent by you,
  // and yours being opened): listening to every message in the game made the database check each
  // one against every player (docs/COSTS.md). The place you're in has its own channel, below.
  useEffect(() => {
    if (guest) return;
    const supabase = createClient();
    const add = (payload: { new: unknown }) => addMessage(payload.new as ChatMessage);
    const channel = keep
      ? supabase
          .channel(`chat:me:${meId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `recipient_id=eq.${meId}` }, add)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `sender_id=eq.${meId}` }, add)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `sender_id=eq.${meId}` }, (payload) => readMessage(payload.new as ChatMessage))
      : supabase
          .channel(`chat:${roundId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `round_id=eq.${roundId}` }, add);
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, guest, addMessage, readMessage, keep, meId]);
  // The real map: what's said in the place you're in (a new channel when you move).
  // (The room as the server named it when its messages were loaded.)
  const roomKey = roomMsgs?.key ?? null;
  useEffect(() => {
    if (guest || !keep || !roomKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:room:${roomKey}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room=eq.${roomKey}` }, (payload) => {
        const m = payload.new as ChatMessage;
        // Your own come in on your channel already.
        if (m.sender_id !== meIdRef.current && !m.recipient_id) addMessage(m);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [guest, keep, roomKey, addMessage]);

  // ---- the place's NPCs: who they are, and what they've been saying
  const hint = roomHint(room);
  const npcs = useMemo(() => (roomId && !guest ? npcsFor(roomId, roundId, roomCap, hint) : []), [roomId, roundId, roomCap, guest, hint]);
  // When you walked in (from useRooms, or noted here when the place changes).
  const [noted, setNoted] = useState<{ room: string; at: number } | null>(null);
  useEffect(() => {
    if (enteredAt) return;
    const id = setTimeout(() => setNoted((n) => (!roomId ? null : n?.room === roomId ? n : { room: roomId, at: Date.now() })), 0);
    return () => clearTimeout(id);
  }, [roomId, enteredAt]);
  const since = enteredAt ?? (noted && noted.room === roomId ? noted.at : null);
  // The NPCs' clock: moves on every 15 seconds while the chat is open.
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
    return npcChatter(roomId, roundId, (since ?? to) - NPC_BACKLOG_MS, to, roomCap, hint).slice(-80);
  }, [roomId, roundId, roomCap, since, clock, guest, hint]);

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
  useEffect(() => {
    threadRef.current = threadId;
  }, [threadId]);
  // The first time you start a chat (New chat, or a private chat opened): how chat works, step by
  // step. Once; the ? at the top shows it again.
  const [guide, setGuide] = useState<number | null>(null);
  const starting = open && keep && !guest && (tab === "people" || !!threadId);
  useEffect(() => {
    if (!starting) return;
    let seen = true;
    try {
      seen = localStorage.getItem(GUIDE_KEY) === "1";
    } catch {}
    if (seen) return;
    const t = setTimeout(() => setGuide((g) => g ?? 0), 250);
    return () => clearTimeout(t);
  }, [starting]);
  const doneGuide = () => {
    setGuide(null);
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {}
  };
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
    const id = requestAnimationFrame(() => setSeen((s) => (s[visibleKey] === newest ? s : { ...s, [visibleKey]: newest })));
    return () => cancelAnimationFrame(id);
  }, [visibleKey, newest, setSeen]);
  // Reading a conversation: they see "Opened", it stops counting on your other phones, and its
  // notification goes from this phone.
  const readFrom = thread && open ? thread.id : null;
  const unreadFromThem = readFrom ? dmMsgs.filter((m) => m.sender_id === readFrom && m.recipient_id === meId && !m.read_at).length : 0;
  useEffect(() => {
    if (!readFrom || !keep) return;
    closePhoneNotices(`dm:${readFrom}`);
    if (!unreadFromThem) return;
    const at = new Date().toISOString();
    const id = requestAnimationFrame(() =>
      setDms((d) => (d ? { ...d, list: d.list.map((m) => (m.sender_id === readFrom && m.recipient_id === meId && !m.read_at ? { ...m, read_at: at } : m)) } : d)),
    );
    void fetch("/api/chat-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: readFrom }) }).catch(() => {});
    return () => cancelAnimationFrame(id);
  }, [readFrom, unreadFromThem, keep, meId]);
  const unreadHere = keep ? 0 : hereMsgs.filter((m) => m.id > (seen[`room:${roomId}`] ?? 0) && m.sender_id !== meId).length;
  const isUnread = useCallback((m: ChatMessage) => m.recipient_id === meId && !m.read_at && m.id > (seen[`dm:${m.sender_id}`] ?? 0), [meId, seen]);
  const unreadDm = dmMsgs.filter(isUnread).length;
  const unread = unreadHere + unreadDm;
  useEffect(() => {
    onUnread?.(unread);
  }, [unread, onUnread]);

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

  async function sendPicture(p: PhotoPick) {
    setError(null);
    const form = new FormData();
    if ("image" in p) form.set("image", new File([p.image], "photo.jpg", { type: "image/jpeg" }));
    else form.set("galleryId", String(p.galleryId));
    if (thread) form.set("to", thread.id);
    else if (roomId) form.set("room", roomId);
    else return;
    try {
      const res = await sendPhoto(form);
      if (res.ok) addMessage(res.message);
      else setError(res.error);
    } catch {
      setError("The connection blinked. Try again.");
    }
  }
  /** Send this person where you are (a private chat only). */
  async function sendWhereIAm() {
    if (!thread) return;
    setError(null);
    try {
      const res = await sendLocation(thread.id, myLocation?.() ?? null);
      if (res.ok) addMessage(res.message);
      else setError(res.error);
    } catch {
      setError("The connection blinked. Try again.");
    }
  }
  const selfieHere = onSelfie && (thread || roomId) ? () => onSelfie(thread ? { to: thread.id } : { room: roomId! }, thread ? thread.name : room ? placeTitle(room) : "everyone here") : undefined;

  /** A player's name or face in a conversation: their profile (or a private chat when there's no profile to show). */
  function openPerson(id: string, name: string) {
    if (onPerson && id !== BOT_ID && id !== meId && !id.startsWith("npc:")) return onPerson(id);
    openThread(id, name);
  }

  function openThread(id: string, name: string) {
    if (id === BOT_ID) return showBot(botNameProp ?? name.replace(/\s*\(bot\)$/i, ""));
    if (id === meId) return;
    setThread({ id, name });
    setTab("private");
    rememberPerson({ id, name, avatar: avatarOf(id, name) }, "Messaged");
  }

  // Asked to open Newtown's chat (a notice tapped, the bell...).
  const lastNewtown = useRef(newtown?.request ?? 0);
  const newtownAsk = newtown?.request ?? 0;
  useEffect(() => {
    if (!newtownAsk || newtownAsk === lastNewtown.current) return;
    lastNewtown.current = newtownAsk;
    const id = setTimeout(() => {
      setThreadNow(null);
      setTab("private");
      setNewtownOpen(true);
    }, 0);
    return () => clearTimeout(id);
  }, [newtownAsk]);
  // Newtown's chat open: what's in it is read.
  const newtownSeen = newtown?.onSeen;
  const newtownUnread = newtown?.unread ?? 0;
  useEffect(() => {
    if (!open || !newtownOpen || !newtownSeen || !newtownUnread) return;
    const id = setTimeout(newtownSeen, 600);
    return () => clearTimeout(id);
  }, [open, newtownOpen, newtownSeen, newtownUnread]);

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

  // Someone tapped an NPC in the 3D view: open the chat with them (the chat stays as it is).
  const lastNpc = useRef(0);
  useEffect(() => {
    if (!externalNpc || externalNpc.at === lastNpc.current) return;
    const npc = findNpc(externalNpc.id, roundId, roomId, hint);
    const id = setTimeout(() => {
      lastNpc.current = externalNpc.at;
      if (npc) setNpcCard({ npc, auto: false });
    }, 0);
    return () => clearTimeout(id);
  }, [externalNpc, roundId, roomId, hint]);

  const closeNpc = useCallback(() => setNpcCard(null), []);
  const cards = (
    <>
      {botCard !== null && <BotCard botName={botCard || "The bot"} onClose={() => setBotCard(null)} />}
      {npcCard && <NpcCard key={npcCard.npc.id} npc={npcCard.npc} autoStart={npcCard.auto} onClose={closeNpc} />}
    </>
  );
  const giveButton = (p: { id: string; name: string; avatar: unknown }, small = false) =>
    onGiveCoins && p.id !== meId && p.id !== BOT_ID ? (
      <button
        onClick={() => onGiveCoins(p)}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full bg-gold/25 font-semibold text-gold-dark hover:bg-gold/40",
          small ? "absolute -right-1 -top-1 size-5 justify-center p-0 shadow" : "px-2.5 py-1 text-xs",
        )}
        aria-label={`Give money to ${p.name}`}
        title={`Give money to ${p.name}`}
      >
        <Coins className={small ? "size-3" : "size-3.5"} aria-hidden />
        {!small && "Give"}
      </button>
    ) : null;

  /** Add as a friend (or a little tick if you already are). */
  const friendButton = (p: { id: string; name: string }) => {
    if (!onAddFriend || p.id === meId || p.id === BOT_ID) return null;
    const st = friendStatusOf?.(p.id) ?? null;
    if (st === "friend")
      return (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#d3f9d8] text-[#2b8a3e]" title={`${p.name} is your friend`} aria-label="Friends">
          <UserCheck className="size-3.5" aria-hidden />
        </span>
      );
    if (st === "outgoing") return <span className="shrink-0 rounded-full bg-panel-2 px-2 py-1 text-[11px] font-semibold text-muted">Requested</span>;
    return (
      <button
        onClick={() => onAddFriend(p)}
        className="flex shrink-0 items-center gap-1 rounded-full bg-[#ffe3f1] px-2.5 py-1 text-xs font-semibold text-[#c2255c] hover:bg-[#ffd0e6]"
        aria-label={`Add ${p.name} as a friend`}
      >
        <UserPlus className="size-3.5" aria-hidden />
        {st === "incoming" ? "Yes" : "Add"}
      </button>
    );
  };

  function close() {
    onOpenChange(false);
    setExpanded(false);
  }

  // The handle on top of the phone sheet: tap to make it bigger or smaller, or drag it
  // (up: bigger, down: smaller, down again: close).
  const drag = useRef<{ y: number } | null>(null);
  const dragged = useRef(false);

  if (!open && hideButton) return cards;
  if (!open) {
    const short = room ? (room.kind === "building" ? levelLabel(room.level ?? levelOf(room.id)) || room.name : room.name) : null;
    return (
      <>
        <button
          onClick={() => onOpenChange(true)}
          className="glass pointer-events-auto relative flex min-w-0 max-w-[48vw] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:max-w-xs sm:px-4 sm:py-2 sm:text-sm"
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
        {room.kind === "balloon" ? <HotAirBalloon className="size-5" /> : room.kind === "ride" ? <RideIcon kind={room.ride} className="size-5" /> : <Building2 className="size-5" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">
          <b>{placeTitle(room)}</b>
          {room.kind !== "building" && rideLeft !== null && <span className="text-muted"> · ride ends in {formatCountdown(rideLeft)}</span>}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted">
          <Users className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {roomCount.toLocaleString()}/{room.capacity.toLocaleString()}
            {room.kind === "building" ? " inside" : " riding"}
            {npcs.length > 0 && ` · ${npcs.length} NPC${npcs.length === 1 ? "" : "s"}`}
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

  // Faces of everyone here: real players first (tap to message privately), then the NPCs.
  const MAX_FACES = 40;
  const peopleRow = room && (others.length > 0 || npcs.length > 0) && (
    <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-3 pb-2 pt-2.5 [scrollbar-width:none]" aria-label="People here">
      {/* First: talk to everyone here at once (this place's chat; not on the real map). */}
      {!keep && (
      <button
        onClick={() => {
          setThread(null);
          setTab("here");
        }}
        className="flex w-14 shrink-0 flex-col items-center gap-0.5"
        title="Message everyone here"
      >
        <span className="grid size-9 place-items-center rounded-full bg-gold text-ink ring-2 ring-gold/40">
          <Users className="size-4" aria-hidden />
        </span>
        <span className="w-full truncate text-center text-[10px] font-semibold">Everyone</span>
      </button>
      )}
      {others.slice(0, MAX_FACES).map((p) => {
        const role = byId.get(p.id)?.role;
        return (
          <div key={p.id} className="relative w-14 shrink-0">
            <button onClick={() => openThread(p.id, p.name)} className="flex w-full flex-col items-center gap-0.5" title={`Message ${p.name} privately`}>
              <AvatarFace
                avatar={avatarOf(p.id, p.name)}
                size={36}
                className={cn("rounded-full ring-2", role === "hider" ? "ring-me" : role === "seeker" ? "ring-gold" : "ring-line")}
              />
              <span className="w-full truncate text-center text-[10px] font-semibold">{firstName(p.name)}</span>
            </button>
            {giveButton({ id: p.id, name: p.name, avatar: p.avatar }, true)}
          </div>
        );
      })}
      {others.length > MAX_FACES && (
        <button onClick={() => setTab("people")} className="flex w-14 shrink-0 flex-col items-center gap-0.5">
          <span className="grid size-9 place-items-center rounded-full bg-panel-2 text-xs font-semibold">+{(others.length - MAX_FACES).toLocaleString()}</span>
          <span className="text-[10px] text-muted">more</span>
        </button>
      )}
      {/* Last: the city's own characters (not players). */}
      {npcs.length > 0 && <span className="w-px shrink-0 self-stretch bg-line" aria-hidden />}
      {npcs.map((n) => (
        <button key={n.id} onClick={() => openNpc(n)} className="flex w-14 shrink-0 flex-col items-center gap-0.5" title={`${n.name}, ${n.role} (NPC) · tap to chat`}>
          <span className="relative">
            <NpcFace npc={n} size={36} />
            <NpcBadge className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1 text-[8px] leading-3" />
          </span>
          <span className="mt-1 w-full truncate text-center text-[10px] text-muted">{n.first}</span>
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
        {newtownOpen && !thread && keep ? (
          <>
            <button onClick={() => setNewtownOpen(false)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Back to your chats">
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            <NewtownFace size={32} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">Newtown</h2>
              <p className="truncate text-[11px] text-muted">Gifts, knocks at your door, results and news for you</p>
            </div>
          </>
        ) : thread ? (
          <>
            <button onClick={() => setThread(null)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Back">
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            <button onClick={() => openPerson(thread.id, thread.name)} className="shrink-0 rounded-full" aria-label={`See ${thread.name}'s profile`}>
              {faceOf(thread.id, thread.name, 32)}
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="flex min-w-0 items-center gap-1.5 font-semibold">
                <button onClick={() => openPerson(thread.id, thread.name)} className="truncate hover:underline" title="See their profile">
                  {thread.name}
                </button>
                {byId.get(thread.id)?.bigFish && <BigFishBadge />}
              </h2>
              {keep ? (
                <p className="flex items-center gap-1 truncate text-[11px] text-muted">
                  <Lock className="size-3 shrink-0" aria-hidden />
                  Only you two can see this
                </p>
              ) : (
                <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-[#5f3dc4]">
                  <Lock className="size-3 shrink-0" aria-hidden />
                  Private
                  <span className="truncate font-normal text-muted">
                    {" · "}
                    {byId.get(thread.id) ? ROLE_STYLE[byId.get(thread.id)!.role].label : "Player"}
                    {byId.get(thread.id)?.caught ? " (caught)" : ""}
                  </span>
                </p>
              )}
            </div>
            {thread.id !== meId && thread.id !== BOT_ID && greet?.({ id: thread.id, name: thread.name })}
            {giveButton({ id: thread.id, name: thread.name, avatar: byId.get(thread.id)?.avatar ?? avatarOf(thread.id, thread.name) })}
          </>
        ) : guest ? (
          <h2 className="flex-1 px-1 font-semibold">Chat</h2>
        ) : keep ? (
          <>
            {tab === "people" ? (
              <button onClick={() => setTab("private")} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Back to your chats">
                <ArrowLeft className="size-5" aria-hidden />
              </button>
            ) : (
              <span className="grid size-9 place-items-center rounded-full bg-[#7048e8]/12 text-[#7048e8]">
                <MessageCircle className="size-5" aria-hidden />
              </span>
            )}
            <h2 className="min-w-0 flex-1 truncate px-1 font-display text-lg font-bold">{tab === "people" ? "New chat" : "Chat"}</h2>
            <button onClick={() => setGuide(0)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="How chat works">
              <CircleHelp className="size-5" aria-hidden />
            </button>
            {tab !== "people" && (
              <button onClick={() => setTab("people")} className="relative flex h-9 shrink-0 items-center gap-1 rounded-full bg-[#7048e8] px-3 text-xs font-bold text-white shadow-sm" aria-label="Start a new chat">
                <Search className="size-3.5" aria-hidden /> New chat
                {tutorialGlow === "chat" && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-full ring-4 ring-gold/70" />}
              </button>
            )}
          </>
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
            Once you&apos;re signed in, you can step into buildings, or hop on a balloon, train, bus, car, boat or Ferris wheel, to chat with the people there, and message
            players privately.
          </p>
          {onSignIn ? (
            <button
              onClick={() => {
                close();
                onSignIn();
              }}
              className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-ink shadow"
            >
              Sign in
            </button>
          ) : (
            <Link href="/?signin=1" className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-ink shadow">
              Sign in
            </Link>
          )}
        </div>
      ) : (
        <>
          {!thread && tab === "here" && !keep && placeLine}
          {!thread && tab === "here" && !keep && !box?.keyboard && peopleRow}

          {!thread && tab === "people" && finder ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {room && !box?.keyboard && peopleRow}
              {finder}
            </div>
          ) : !thread && tab === "people" ? (
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
                        <li key={`here-${p.id}`} className="flex items-center gap-1">
                          <button onClick={() => openThread(p.id, p.name)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-panel-2">
                            <AvatarFace avatar={avatarOf(p.id, p.name)} size={36} className="shrink-0 rounded-full" />
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-semibold">{p.name}</span>
                                {player?.bigFish && <BigFishBadge />}
                              </span>
                              <span className="text-xs text-muted">Tap to message privately</span>
                            </span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ROLE_STYLE[player?.role ?? "watcher"].pill)}>
                              {ROLE_STYLE[player?.role ?? "watcher"].label}
                            </span>
                          </button>
                          {friendButton(p)}
                          {giveButton({ id: p.id, name: p.name, avatar: p.avatar })}
                        </li>
                      );
                    })}
                    {hereNpcs.length > 0 && (
                      <li className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                        NPCs here ({hereNpcs.length}) <span className="font-normal normal-case tracking-normal">· the city&apos;s own people, not players</span>
                      </li>
                    )}
                    {hereNpcs.map((n) => (
                      <li key={n.id} className="flex items-center gap-1">
                        <button onClick={() => openNpc(n)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-panel-2">
                          <NpcFace npc={n} size={36} />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-semibold">{n.name}</span>
                              <NpcBadge />
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {n.role} · {n.personaLabel}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => openNpc(n, true)}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-[#0b7285] px-3 py-1.5 text-xs font-semibold text-white"
                          aria-label={`Chat with ${n.name} (NPC)`}
                        >
                          <MessageCircle className="size-3.5" aria-hidden />
                          Chat
                        </button>
                      </li>
                    ))}
                    <li className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Everyone in this game</li>
                  </>
                )}
                {people.length === 0 && <li className="p-6 text-center text-sm text-muted">Nobody else here yet.</li>}
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-1">
                    <button onClick={() => openThread(p.id, p.name)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-panel-2">
                      <AvatarFace avatar={p.avatar} size={40} className={cn("shrink-0 rounded-full", p.caught && "opacity-50 grayscale")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold">{p.name}</span>
                          {p.bigFish && <BigFishBadge />}
                        </span>
                        <span className="text-xs text-muted">{p.caught ? "Caught this round" : "Tap to message privately"}</span>
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ROLE_STYLE[p.role].pill)}>{ROLE_STYLE[p.role].label}</span>
                    </button>
                    {friendButton(p)}
                    {giveButton({ id: p.id, name: p.name, avatar: p.avatar })}
                  </li>
                ))}
              </ul>
            </div>
          ) : !thread && tab === "private" && keep && newtownOpen && newtown ? (
            <NewtownThread lines={newtown.lines} onSettings={newtown.onSettings} />
          ) : !thread && tab === "private" && keep ? (
            <ChatList
              conversations={conversations}
              meId={meId}
              faceOf={faceOf}
              unreadOf={(id) => dmMsgs.filter((m) => m.sender_id === id && isUnread(m)).length}
              onOpen={(c) => openThread(c.id, c.name)}
              onFind={() => setTab("people")}
              top={
                <>
                  {onlineNow && onlineNow.length > 0 && (
                    <div className="shrink-0 px-3 pb-2 pt-2.5">
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">Online now</p>
                      <div className="flex gap-3 overflow-x-auto [scrollbar-width:none]">
                        {onlineNow.slice(0, 20).map((p) => (
                          <button key={p.id} onClick={() => openThread(p.id, p.name)} className="flex w-14 shrink-0 flex-col items-center gap-1" title={`Message ${p.name}`}>
                            <span className="relative">
                              <AvatarFace avatar={p.avatar} size={46} className="rounded-full" />
                              <span className="absolute bottom-0 right-0 size-3 rounded-full bg-[#2f9e44] ring-2 ring-panel" aria-hidden />
                            </span>
                            <span className="w-full truncate text-center text-[11px] font-semibold">{firstName(p.name)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {newtown && (
                    <button onClick={() => setNewtownOpen(true)} className={cn("flex w-full shrink-0 items-center gap-3 border-t border-line/60 px-3 py-2.5 text-left", newtown.unread > 0 ? "bg-[#fff9db]" : "active:bg-panel-2 sm:hover:bg-panel-2")}>
                      <NewtownFace size={46} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[15px]", newtown.unread ? "font-bold" : "font-semibold")}>Newtown</span>
                        <span className={cn("mt-0.5 block truncate text-xs", newtown.unread ? "font-bold text-[#e8590c]" : "text-muted")}>
                          {newtown.lines[0]?.text ?? "Gifts, knocks at your door and results come here"}
                        </span>
                      </span>
                      {newtown.unread > 0 && (
                        <span className="grid min-w-6 place-items-center rounded-full bg-[#e8590c] px-1.5 py-0.5 text-[11px] font-bold text-white">{newtown.unread > 9 ? "9+" : newtown.unread}</span>
                      )}
                    </button>
                  )}
                  {news && (
                    <button onClick={news.onOpen} className="flex w-full shrink-0 items-center gap-3 border-y border-line/60 px-3 py-2.5 text-left active:bg-panel-2 sm:hover:bg-panel-2">
                      <span className="grid size-[46px] shrink-0 place-items-center rounded-2xl bg-[#e03131] text-white">
                        <Newspaper className="size-6" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">Newtown News</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{news.latest ?? "What's happening in the city"}</span>
                      </span>
                    </button>
                  )}
                </>
              }
              bottom={
                onCamera && (
                  <div className="mt-auto flex shrink-0 justify-center p-3">
                    <button onClick={onCamera} className="flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white">
                      <Camera className="size-4" aria-hidden /> Take a picture or a selfie
                    </button>
                  </div>
                )
              }
            />
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
                        {(c.last.body && (locationIn(c.last.body) ? "📍 Location" : withoutTag(c.last.body))) ?? (
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
              <p className="text-sm text-muted">Tap any building to go in, or pick a ride from Explore (balloon, train, bus, car, boat, Ferris wheel), to meet the people there.</p>
            </div>
          ) : (
            <Messages
              key={thread ? `dm:${thread.id}` : `room:${roomId}`}
              items={shown}
              meId={meId}
              onName={openPerson}
              onNpc={openNpc}
              isPrivate={Boolean(thread)}
              faceOf={faceOf}
              bigFish={bigFishIds}
              snap={keep && Boolean(thread)}
              theirName={thread?.name}
              onGo={onGoTo}
            />
          )}

          {(thread || (tab === "here" && room && !keep)) && (
            <Composer
              snap={keep}
              onSend={send}
              onAudio={sendAudio}
              onPicture={sendPicture}
              onSelfie={selfieHere}
              onLocation={thread && keep ? sendWhereIAm : undefined}
              placeholder={keep ? "Send a chat" : thread ? `Private message to ${thread.name}` : `Message ${room ? placeTitle(room) : "everyone here"}`}
            />
          )}
          {error && <p className="shrink-0 px-4 pb-2 text-xs text-hit">{error}</p>}
        </>
      )}
      {guide !== null && <ChatGuide step={guide} onStep={setGuide} onDone={doneGuide} />}
      {cards}
    </section>,
    document.body,
  );
}


// ---- Chat on the real map: Newtown's own look. Your chats with the last thing said and a dot
// while there's something new; conversations in rounded bubbles (yours in Newtown purple), with
// Sent / Seen under your last one.

const BRAND = "#7048e8";

/** Short "how long ago": now, 5m, 3h, 2d. */
function agoShort(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

/** Sent (one tick) or seen (two ticks, in purple). */
function Ticks({ seen }: { seen: boolean }) {
  return (
    <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden>
      <path d="M1 5.5 3.8 8.3 9.5 1.7" fill="none" stroke={seen ? BRAND : "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {seen && <path d="M6.5 7.6 7.2 8.3 12.9 1.7" fill="none" stroke={BRAND} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** What the last message was, in a few words ("You: on my way", "Photo", "Voice note"). */
function preview(last: ChatMessage, meId: string) {
  const what = last.audio_path ? "🎤 Voice note" : last.image_path && (!last.body || last.body === "Sent a photo") ? "📷 Photo" : locationIn(last.body) ? "📍 Location" : last.body;
  return last.sender_id === meId ? `You: ${what}` : what;
}

function ChatList({
  conversations,
  meId,
  faceOf,
  unreadOf,
  onOpen,
  onFind,
  top,
  bottom,
}: {
  conversations: { id: string; name: string; last: ChatMessage }[];
  meId: string;
  faceOf: (id: string, name: string, size: number) => React.ReactNode;
  unreadOf: (id: string) => number;
  onOpen: (c: { id: string; name: string }) => void;
  onFind: () => void;
  /** Above the chats: who's online, and Newtown's own chats (pinned). */
  top?: React.ReactNode;
  /** Under them: the camera. */
  bottom?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {top}
      {conversations.length ? (
        <ChatRows conversations={conversations} meId={meId} faceOf={faceOf} unreadOf={unreadOf} onOpen={onOpen} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="font-semibold">No chats yet</p>
          <p className="text-sm text-muted">Find someone online and say hi. Only the two of you see your chats.</p>
          <button onClick={onFind} className="mt-1 rounded-full bg-[#7048e8] px-5 py-2.5 text-sm font-bold text-white shadow">
            Start a chat
          </button>
        </div>
      )}
      {bottom}
    </div>
  );
}

function ChatRows({
  conversations,
  meId,
  faceOf,
  unreadOf,
  onOpen,
}: {
  conversations: { id: string; name: string; last: ChatMessage }[];
  meId: string;
  faceOf: (id: string, name: string, size: number) => React.ReactNode;
  unreadOf: (id: string) => number;
  onOpen: (c: { id: string; name: string }) => void;
}) {
  return (
    <ul className="divide-y divide-line/60">
      {conversations.map((c) => {
        const unread = unreadOf(c.id);
        const mineLast = c.last.sender_id === meId;
        return (
          <li key={c.id}>
            <button onClick={() => onOpen(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-panel-2 sm:hover:bg-panel-2">
              <span className="relative shrink-0">{faceOf(c.id, c.name, 46)}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[15px]", unread ? "font-bold" : "font-semibold")}>{c.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs">
                  {mineLast && <span className="text-muted"><Ticks seen={!!c.last.read_at} /></span>}
                  <span className={cn("min-w-0 truncate", unread ? "font-semibold text-ink" : "text-muted")}>{preview(c.last, meId)}</span>
                  <span className="shrink-0 text-muted">· {agoShort(c.last.created_at)}</span>
                </span>
              </span>
              {unread > 0 ? (
                <span className="grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: BRAND }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Newtown's own face in your chats: a dark tile with a gold N. */
function NewtownFace({ size }: { size: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-2xl bg-ink font-display font-black text-gold" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>
      N
    </span>
  );
}

/** One of Newtown's own messages to you (a notice: a gift, a knock, a challenge result...). */
export type NewtownLine = { key: string; text: string; at: string; unread: boolean; icon?: React.ReactNode; onTap?: () => void };

/** The Newtown chat: everything the game tells you, as messages, newest at the bottom. */
function NewtownThread({ lines, onSettings }: { lines: NewtownLine[]; onSettings: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);
  const list = [...lines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      <button onClick={onSettings} className="mx-auto mb-3 block rounded-full bg-panel-2 px-3 py-1 text-[11px] font-semibold text-muted">
        Phone notifications and clearing
      </button>
      {!list.length && <p className="p-6 text-center text-sm text-muted">Nothing yet. Gifts, knocks at your door and challenge results will show up here.</p>}
      <div className="space-y-2">
        {list.map((l) => {
          const body = (
            <span className="flex items-start gap-2">
              {l.icon}
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm">{l.text}</span>
                <span className="mt-0.5 block text-[10px] text-muted">{agoShort(l.at)}</span>
              </span>
            </span>
          );
          const cls = cn("block w-full max-w-[88%] rounded-2xl rounded-bl-md px-3 py-2 text-left", l.unread ? "bg-[#fff3bf]" : "bg-panel-2");
          return l.onTap ? (
            <button key={l.key} onClick={l.onTap} className={cls}>
              {body}
            </button>
          ) : (
            <div key={l.key} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
      <div ref={end} />
    </div>
  );
}

function Messages({
  items,
  meId,
  onName,
  onNpc,
  isPrivate,
  faceOf,
  bigFish,
  snap = false,
  theirName,
  onGo,
}: {
  items: Item[];
  meId: string;
  onName: (id: string, name: string) => void;
  onNpc: (npc: Npc) => void;
  isPrivate: boolean;
  faceOf: (id: string, name: string, size: number) => React.ReactNode;
  /** Players holding lots of coins (shown with a "Big fish" badge). */
  bigFish: Set<string>;
  /** The real map's private chats: Newtown's own look (purple bubbles, Sent / Seen). */
  snap?: boolean;
  /** Who you're chatting with (for the names over their lines). */
  theirName?: string;
  /** Go to a location someone sent. */
  onGo?: (loc: ChatLocation, from: string) => void;
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
        <div ref={inner} className={snap ? "" : "space-y-2"}>
          {items.length === 0 && (
            <p className="flex items-center justify-center gap-1.5 p-6 text-center text-sm text-muted">
              {isPrivate ? (
                <>
                  <Lock className="size-3.5 shrink-0" aria-hidden /> {snap ? `Say hi to ${theirName ?? "them"}! Only the two of you see this chat.` : "Say hello. Only the two of you can see this."}
                </>
              ) : (
                "Nobody has said anything here yet. Say hi!"
              )}
            </p>
          )}
          {items.map((it, i) => {
            const sameAsPrev = senderOf(items[i - 1]) === senderOf(it) && senderOf(it) !== "*";

            // An NPC: always marked "NPC" (their face has a dashed teal ring). Only on this device.
            if (it.npc) {
              const { npc, body, replyTo } = it.npc;
              return (
                <div key={it.key} className="flex items-end gap-2">
                  <button onClick={() => onNpc(npc)} className={cn("shrink-0 rounded-full p-0.5", sameAsPrev && "invisible")} aria-label={`Chat with ${npc.name} (NPC)`}>
                    <NpcFace npc={npc} size={26} />
                  </button>
                  <div className="flex max-w-[80%] flex-col items-start">
                    {!sameAsPrev && (
                      <button onClick={() => onNpc(npc)} className="mb-0.5 flex items-center gap-1.5 px-1 text-xs" title={`${npc.role} · ${npc.personaLabel} · tap to chat`}>
                        <span className="font-semibold">{npc.name}</span>
                        <NpcBadge />
                        <span className="text-[10px] text-muted">{npc.role}</span>
                      </button>
                    )}
                    <div className="rounded-2xl rounded-bl-md border-l-4 border-[#0b7285]/50 bg-panel-2 px-3 py-2 text-sm">
                      <NpcBadge className="mr-1.5 px-1 text-[9px] leading-3" />
                      {replyTo && <span className="mr-1 text-xs font-semibold text-[#0b7285]">@{replyTo}</span>}
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
                    <p className="break-words">{mintify(m.body)}</p>
                  </div>
                  <span className="ml-auto shrink-0 self-end text-[10px] text-muted">{time(m.created_at)}</span>
                </div>
              );
            }
            if (snap) {
              const lastMine = mine && !items.slice(i + 1).some((x) => x.m?.sender_id === meId);
              const day = new Date(m.created_at).toDateString();
              const newDay = i === 0 || new Date(items[i - 1].at).toDateString() !== day;
              const onlyPhoto = m.image_path && m.body === "Sent a photo";
              return (
                <div key={it.key}>
                  {newDay && (
                    <p className="py-2 text-center">
                      <span className="rounded-full bg-panel-2 px-2.5 py-0.5 text-[10px] font-semibold text-muted">
                        {day === new Date().toDateString() ? "Today" : new Date(m.created_at).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}
                      </span>
                    </p>
                  )}
                  <div className={cn("flex items-end gap-1.5", mine ? "justify-end" : "justify-start", !sameAsPrev || newDay ? "mt-2" : "mt-0.5")}>
                    {!mine && (
                      <button onClick={() => onName(m.sender_id, m.sender_name)} className={cn("shrink-0 rounded-full", sameAsPrev && !newDay && "invisible")} aria-label={`${theirName || m.sender_name}'s profile`}>
                        {faceOf(m.sender_id, m.sender_name, 26)}
                      </button>
                    )}
                    <div
                      className={cn(
                        "max-w-[78%] text-[15px] leading-snug",
                        onlyPhoto ? "overflow-hidden rounded-2xl" : "rounded-[20px] px-3.5 py-2",
                        !onlyPhoto && (mine ? "rounded-br-md text-white" : "rounded-bl-md bg-panel-2 text-ink"),
                      )}
                      style={mine && !onlyPhoto ? { background: BRAND } : undefined}
                      title={time(m.created_at)}
                    >
                      {m.image_path && <ChatPhoto id={m.id} mine={mine} />}
                      {m.audio_path ? (
                        <VoiceNote id={m.id} seconds={m.audio_seconds ?? 0} mine={mine} />
                      ) : onlyPhoto ? null : locationIn(m.body) ? (
                        <LocationCard loc={locationIn(m.body)!} mine={mine} from={m.sender_name} onGo={onGo} />
                      ) : (
                        <span className="break-words">{m.body}</span>
                      )}
                    </div>
                  </div>
                  {lastMine && (
                    <p className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10px] font-semibold text-muted">
                      <Ticks seen={!!m.read_at} />
                      {m.read_at ? `Seen ${agoShort(m.read_at)}` : `Sent ${time(m.created_at)}`}
                    </p>
                  )}
                </div>
              );
            }
            const role = ROLE_STYLE[bot ? "bot" : m.sender_role];
            return (
              <div key={it.key} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                {!mine && (
                  <button onClick={() => onName(m.sender_id, m.sender_name)} className={cn("shrink-0 rounded-full", sameAsPrev && "invisible")} aria-label={`${m.sender_name}'s profile`}>
                    {faceOf(m.sender_id, m.sender_name, 28)}
                  </button>
                )}
                <div className={cn("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
                  {!mine && !sameAsPrev && (
                    <button
                      onClick={() => onName(m.sender_id, m.sender_name)}
                      className="mb-0.5 flex items-center gap-1.5 px-1 text-xs"
                      title={bot ? "About the bot" : "See their profile"}
                    >
                      <span className="font-semibold">{bot ? botNameOf(m) : m.sender_name}</span>
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", role.pill)}>{role.label}</span>
                      {!bot && bigFish.has(m.sender_id) && <BigFishBadge />}
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
                    {m.image_path && <ChatPhoto id={m.id} mine={mine} />}
                    {m.audio_path ? (
                      <VoiceNote id={m.id} seconds={m.audio_seconds ?? 0} mine={mine} />
                    ) : m.image_path && m.body === "Sent a photo" ? null : locationIn(m.body) ? (
                      <LocationCard loc={locationIn(m.body)!} mine={mine} from={m.sender_name} onGo={onGo} />
                    ) : (
                      <span className="break-words">{bot ? mintify(m.body) : m.body}</span>
                    )}
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

const GUIDE_KEY = "nt-chat-guide";

const GUIDE: { emoji: string; title: string; text: string }[] = [
  { emoji: "💬", title: "Chat with anyone", text: "Tap New chat to find anyone by name, or tap someone's face on the map and choose Message. Only the two of you see a private chat." },
  { emoji: "📷", title: "Pictures, selfies and voice notes", text: "Use the buttons beside the message box: the picture to send a photo or a selfie, the microphone to hold and talk." },
  { emoji: "📍", title: "Send your location", text: "In a private chat, tap the red pin to send where you are. They get a notice with a Go there button. Going there costs the usual fare, like any trip." },
  { emoji: "🛡️", title: "Stay safe", text: "Never share passwords, bank details or your real address. Tap someone's name to see their profile, and Report them if they bother you." },
];

/** How chat works, one card at a time (the first time you start a chat). */
function ChatGuide({ step, onStep, onDone }: { step: number; onStep: (n: number) => void; onDone: () => void }) {
  const g = GUIDE[Math.min(step, GUIDE.length - 1)];
  const last = step >= GUIDE.length - 1;
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/35 p-3 sm:items-center" role="dialog" aria-label="How chat works">
      <div className="w-full max-w-sm rounded-3xl bg-panel p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#7048e8]/12 text-2xl" aria-hidden>
            {g.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              How chat works · {step + 1} of {GUIDE.length}
            </p>
            <h3 className="font-display text-lg font-bold leading-tight">{g.title}</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">{g.text}</p>
        <div className="mt-4 flex gap-1">
          {GUIDE.map((x, i) => (
            <span key={x.title} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-[#7048e8]" : "bg-ink/10")} />
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          {step > 0 ? (
            <button onClick={() => onStep(step - 1)} className="h-11 rounded-full bg-ink/5 px-4 text-sm font-semibold">
              Back
            </button>
          ) : (
            <button onClick={onDone} className="h-11 rounded-full bg-ink/5 px-4 text-sm font-semibold">
              Skip
            </button>
          )}
          <button onClick={() => (last ? onDone() : onStep(step + 1))} className="h-11 flex-1 rounded-full text-sm font-bold text-white" style={{ background: BRAND }}>
            {last ? "Start chatting" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A location in a message: where, and Go there (the usual fare) for the person it was sent to. */
function LocationCard({ loc, mine, from, onGo }: { loc: ChatLocation; mine: boolean; from: string; onGo?: (loc: ChatLocation, from: string) => void }) {
  return (
    <span className="block min-w-44">
      <span className="flex items-start gap-2">
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", mine ? "bg-white/20" : "bg-[#ffe3e3] text-[#e03131]")}>
          <MapPin className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <b className="block text-[13px] leading-tight">{mine ? "You sent your location" : `${from}'s location`}</b>
          <span className={cn("block break-words text-xs", mine ? "text-white/80" : "text-muted")}>{loc.label}</span>
        </span>
      </span>
      {!mine && onGo && (
        <button
          onClick={() => onGo(loc, from)}
          className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-ink text-xs font-bold text-white"
        >
          <Navigation className="size-3.5" aria-hidden /> Go there
        </button>
      )}
      {!mine && <span className="mt-1 block text-[10px] text-muted">Going there costs the usual fare.</span>}
    </span>
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
  onPicture,
  onSelfie,
  onLocation,
  placeholder,
  snap = false,
}: {
  snap?: boolean;
  /** Send where you are (private chats). */
  onLocation?: () => Promise<void>;
  onSend: (text: string) => Promise<boolean>;
  onAudio: (blob: Blob, seconds: number) => Promise<void>;
  onPicture: (p: PhotoPick) => Promise<void>;
  onSelfie?: () => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
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
      {picking && (
        <PhotoPicker
          onClose={() => setPicking(false)}
          onSelfie={
            onSelfie &&
            (() => {
              setPicking(false);
              onSelfie();
            })
          }
          onPick={async (p) => {
            setPicking(false);
            setBusy(true);
            await onPicture(p);
            setBusy(false);
          }}
        />
      )}
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
        snap ? (
          <form onSubmit={submit} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (onSelfie ? onSelfie() : setPicking((v) => !v))}
              disabled={busy}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-panel-2 text-ink"
              aria-label="Take a selfie and send it"
            >
              {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
            </button>
            <div className="flex min-w-0 flex-1 items-center rounded-full bg-panel-2 pl-4 pr-1">
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                placeholder={placeholder}
                className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
              />
              {!text.trim() && (
                <>
                  <button type="button" onClick={startRecording} disabled={busy} className="grid size-8 shrink-0 place-items-center rounded-full text-muted" aria-label="Record a voice note">
                    <Mic className="size-[18px]" aria-hidden />
                  </button>
                  <button type="button" onClick={() => setPicking((v) => !v)} disabled={busy} className="grid size-8 shrink-0 place-items-center rounded-full text-muted" aria-label="Send a photo">
                    <ImagePlus className="size-[18px]" aria-hidden />
                  </button>
                  {onLocation && (
                    <button
                      type="button"
                      onClick={async () => {
                        setBusy(true);
                        await onLocation();
                        setBusy(false);
                      }}
                      disabled={busy}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-[#e03131]"
                      aria-label="Send my location"
                      title="Send my location"
                    >
                      <MapPin className="size-[18px]" aria-hidden />
                    </button>
                  )}
                </>
              )}
            </div>
            {text.trim() && (
              <button disabled={busy} className="grid size-10 shrink-0 place-items-center rounded-full text-white shadow disabled:opacity-50" style={{ background: BRAND }} aria-label="Send">
                <SendHorizontal className="size-5" aria-hidden />
              </button>
            )}
          </form>
        ) : (
        <form onSubmit={submit} className="flex items-center gap-2">
          <button type="button" onClick={() => setPicking((v) => !v)} disabled={busy} className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2" aria-label="Send a picture or a selfie">
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          </button>
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
        )
      )}
      {micError && <p className="mt-1 text-xs text-hit">{micError}</p>}
    </div>
  );
}
