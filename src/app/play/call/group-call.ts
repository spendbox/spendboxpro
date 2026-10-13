"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { randomId } from "../activities/hub";

// A small group voice call for the people in one room (up to 6). Every phone talks straight to
// every other phone (WebRTC, audio only), so nothing we host carries or keeps anyone's voice.
// Our only part is the "introductions": a Supabase Realtime channel ("voice:<room>") where
// phones say who is in the call (presence) and swap the connection details WebRTC needs
// (broadcast). Nothing is recorded anywhere. See docs/VOICE_CALLS.md.
//
// Who calls whom: for each pair of people, the one with the lower user id makes the offer and
// the other answers, so two phones never call each other at the same moment ("glare").

export type CallMe = { id: string; name: string; avatar?: unknown };

/** Someone in the call (you're first once you've joined). */
export type CallPerson = {
  id: string;
  name: string;
  avatar: unknown;
  speaking: boolean;
  muted: boolean;
  /** True once their audio link to you is up (always true for you). */
  connected: boolean;
  me: boolean;
};

/** What a phone shares on the channel while it's in the call. */
type Member = { id: string; name: string; avatar: unknown; muted: boolean; sid: string; at: number };

/** A connection message, sent to one person (or to everyone, for "bye"). */
type Signal = {
  kind: "offer" | "answer" | "ice" | "bye";
  from: string;
  fromSid: string;
  to: string;
  toSid?: string;
  sdp?: string;
  cand?: RTCIceCandidateInit;
};

type Peer = {
  id: string;
  sid: string;
  offerer: boolean;
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[];
  remoteSet: boolean;
  connected: boolean;
  born: number;
  tries: number;
  timer: ReturnType<typeof setTimeout> | null;
  audio: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  closed: boolean;
};

type Session = {
  channel: RealtimeChannel;
  subscribed: boolean;
  roster: Map<string, Member>;
  inCall: boolean;
  sid: string;
  at: number;
  muted: boolean;
  stream: MediaStream | null;
  ctx: AudioContext | null;
  localSource: MediaStreamAudioSourceNode | null;
  localAnalyser: AnalyserNode | null;
  peers: Map<string, Peer>;
  /** When each person was last heard above the speaking level. */
  loudAt: Map<string, number>;
  speaking: string;
  connected: string;
  tick: ReturnType<typeof setInterval> | null;
  chores: ReturnType<typeof setInterval> | null;
};

type Api = {
  join: () => Promise<void>;
  leave: (reason?: string) => void;
  setMuted: (b: boolean) => void;
};

const DEFAULT_MAX = 6;
/** How loud (0 to 1, from the waveform) counts as talking, and how long the ring stays on after. */
const SPEAK_LEVEL = 0.035;
const SPEAK_HOLD_MS = 450;
/** If a link isn't up this long after the offer, the offering phone tries again (a few times). */
const CONNECT_TIMEOUT_MS = 15000;
const MAX_TRIES = 4;

/** Free public STUN servers, plus a TURN relay if one is set in the environment (see the docs). */
function iceServers(): RTCIceServer[] {
  const list: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    const urls = turn
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length) {
      const server: RTCIceServer = { urls };
      if (process.env.NEXT_PUBLIC_TURN_USERNAME) server.username = process.env.NEXT_PUBLIC_TURN_USERNAME;
      if (process.env.NEXT_PUBLIC_TURN_CREDENTIAL) server.credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
      list.push(server);
    }
  }
  return list;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A connection message from another phone, checked. */
function readSignal(v: unknown): Signal | null {
  if (!isObj(v)) return null;
  const { kind, from, fromSid, to, toSid, sdp, cand } = v;
  if (kind !== "offer" && kind !== "answer" && kind !== "ice" && kind !== "bye") return null;
  if (typeof from !== "string" || typeof fromSid !== "string" || typeof to !== "string") return null;
  const out: Signal = { kind, from, fromSid, to };
  if (typeof toSid === "string") out.toSid = toSid;
  if (typeof sdp === "string" && sdp.length < 20000) out.sdp = sdp;
  if (isObj(cand) && typeof cand.candidate === "string") {
    out.cand = {
      candidate: cand.candidate,
      sdpMid: typeof cand.sdpMid === "string" ? cand.sdpMid : null,
      sdpMLineIndex: typeof cand.sdpMLineIndex === "number" ? cand.sdpMLineIndex : null,
    };
  }
  return out;
}

/** A friendly line for why the microphone wouldn't start. */
function micError(e: unknown): string {
  const name = isObj(e) && typeof e.name === "string" ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return "Your microphone is blocked. Allow the microphone for this site in your browser settings, then tap Join again.";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "We couldn't find a microphone on this device.";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError")
    return "Your microphone is busy (another app may be using it). Close that app and try again.";
  return "We couldn't start your microphone. Please try again.";
}

/** How loud a stream is right now (0 to 1), from its waveform. */
function levelOf(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

function newAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * A voice call for one room. Pass null for the room (or for me) to stay out. Nothing happens
 * until join() is called, which must come from a tap (phones only allow sound and the
 * microphone after one). Leaves by itself when the room changes or the screen closes.
 */
export function useGroupCall(room: string | null, me: CallMe | null, opts: { max?: number } = {}) {
  const max = Math.max(2, opts.max ?? DEFAULT_MAX);
  const [members, setMembers] = useState<Member[]>([]);
  const [joined, setJoined] = useState<boolean>(false);
  const [joining, setJoining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState<boolean>(false);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const [connected, setConnected] = useState<string[]>([]);

  const apiRef = useRef<Api | null>(null);
  const meRef = useRef<CallMe | null>(me);
  const maxRef = useRef<number>(max);
  useEffect(() => {
    meRef.current = me;
    maxRef.current = max;
  });

  const meId = me?.id ?? null;
  useEffect(() => {
    if (!room || !meId) return;
    const myId = meId;
    let alive = true;
    const supabase = createClient();
    const channel = supabase.channel(`voice:${room}`, { config: { broadcast: { self: false }, presence: { key: myId } } });
    const s: Session = {
      channel,
      subscribed: false,
      roster: new Map(),
      inCall: false,
      sid: "",
      at: 0,
      muted: false,
      stream: null,
      ctx: null,
      localSource: null,
      localAnalyser: null,
      peers: new Map(),
      loudAt: new Map(),
      speaking: "",
      connected: "",
      tick: null,
      chores: null,
    };

    const send = (m: Signal) => {
      if (s.subscribed) void channel.send({ type: "broadcast", event: "sig", payload: m });
    };

    const track = () => {
      const who = meRef.current;
      if (!s.subscribed || !s.inCall || !who) return;
      void channel.track({ name: who.name.slice(0, 40), avatar: who.avatar ?? null, muted: s.muted, sid: s.sid, at: s.at });
    };

    const publishConnected = () => {
      const ids = [...s.peers.values()].filter((p) => p.connected).map((p) => p.id).sort();
      const key = ids.join(",");
      if (key === s.connected) return;
      s.connected = key;
      if (alive) setConnected(ids);
    };

    // ---- Links to each other person ----

    const dropPeer = (id: string) => {
      const p = s.peers.get(id);
      if (!p) return;
      s.peers.delete(id);
      p.closed = true;
      if (p.timer) clearTimeout(p.timer);
      p.pc.onicecandidate = null;
      p.pc.ontrack = null;
      p.pc.onconnectionstatechange = null;
      p.pc.oniceconnectionstatechange = null;
      try {
        p.pc.close();
      } catch {}
      if (p.audio) {
        p.audio.pause();
        p.audio.srcObject = null;
        p.audio.remove();
      }
      try {
        p.source?.disconnect();
      } catch {}
      s.loudAt.delete(id);
      publishConnected();
    };

    const playAll = () => {
      if (s.ctx && s.ctx.state === "suspended") void s.ctx.resume().catch(() => {});
      for (const p of s.peers.values()) if (p.audio && p.audio.paused) void p.audio.play().catch(() => {});
    };

    const attachRemote = (p: Peer, stream: MediaStream) => {
      if (p.closed) return;
      if (!p.audio) {
        // Phones (iOS Safari especially) want the element in the page, inline, and started
        // after a tap. The tap was "Join", and an open microphone also lets sound play.
        const el = document.createElement("audio");
        el.autoplay = true;
        el.setAttribute("playsinline", "");
        el.setAttribute("webkit-playsinline", "");
        el.style.display = "none";
        document.body.appendChild(el);
        p.audio = el;
      }
      if (p.audio.srcObject !== stream) p.audio.srcObject = stream;
      void p.audio.play().catch(() => {});
      if (s.ctx && !p.analyser) {
        try {
          p.source = s.ctx.createMediaStreamSource(stream);
          p.analyser = s.ctx.createAnalyser();
          p.analyser.fftSize = 512;
          p.source.connect(p.analyser);
        } catch {
          p.source = null;
          p.analyser = null;
        }
      }
    };

    let startPeer: (id: string, sid: string, offerer: boolean) => Peer | null = () => null;

    const retry = (p: Peer) => {
      if (p.closed || !s.inCall) return;
      const member = s.roster.get(p.id);
      const tries = p.tries + 1;
      dropPeer(p.id);
      // Only the offering side starts again; the other side waits for the new offer.
      if (p.offerer && member && tries <= MAX_TRIES) {
        const again = startPeer(member.id, member.sid, true);
        if (again) again.tries = tries;
      }
    };

    const onLinkChange = (p: Peer) => {
      if (p.closed) return;
      const st = p.pc.connectionState;
      const ice = p.pc.iceConnectionState;
      const up = st === "connected" || ice === "connected" || ice === "completed";
      if (up !== p.connected) {
        p.connected = up;
        publishConnected();
      }
      if (up) {
        if (p.timer) clearTimeout(p.timer);
        p.timer = null;
        p.tries = 0;
        if (p.audio && p.audio.paused) void p.audio.play().catch(() => {});
        return;
      }
      if (st === "failed" || ice === "failed") {
        retry(p);
      } else if ((st === "disconnected" || ice === "disconnected") && !p.timer) {
        // Often just a blip (switching wifi to mobile data); give it a moment to come back.
        p.timer = setTimeout(() => {
          p.timer = null;
          if (!p.connected) retry(p);
        }, 6000);
      }
    };

    startPeer = (id, sid, offerer) => {
      const stream = s.stream;
      if (!stream) return null;
      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({ iceServers: iceServers() });
      } catch {
        if (alive) setError("This browser can't do voice calls. Try the latest Chrome or Safari.");
        return null;
      }
      const p: Peer = {
        id,
        sid,
        offerer,
        pc,
        pending: [],
        remoteSet: false,
        connected: false,
        born: Date.now(),
        tries: 0,
        timer: null,
        audio: null,
        source: null,
        analyser: null,
        closed: false,
      };
      s.peers.set(id, p);
      for (const t of stream.getAudioTracks()) pc.addTrack(t, stream);
      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate && !p.closed) send({ kind: "ice", from: myId, fromSid: s.sid, to: id, toSid: p.sid, cand: e.candidate.toJSON() });
      };
      pc.ontrack = (e: RTCTrackEvent) => attachRemote(p, e.streams[0] ?? new MediaStream([e.track]));
      pc.onconnectionstatechange = () => onLinkChange(p);
      pc.oniceconnectionstatechange = () => onLinkChange(p);
      if (offerer) {
        p.timer = setTimeout(() => {
          p.timer = null;
          if (!p.connected) retry(p);
        }, CONNECT_TIMEOUT_MS);
        void (async () => {
          try {
            const offer = await pc.createOffer();
            if (p.closed) return;
            await pc.setLocalDescription(offer);
            if (p.closed) return;
            send({ kind: "offer", from: myId, fromSid: s.sid, to: id, toSid: p.sid, sdp: offer.sdp ?? "" });
          } catch {
            retry(p);
          }
        })();
      }
      return p;
    };

    const flushIce = async (p: Peer) => {
      for (const c of p.pending.splice(0)) {
        try {
          await p.pc.addIceCandidate(c);
        } catch {}
      }
    };

    const onSignal = async (raw: unknown) => {
      const m = readSignal(raw);
      if (!m || !s.inCall || m.from === myId) return;
      if (m.kind === "bye") {
        const p = s.peers.get(m.from);
        if (p && p.sid === m.fromSid) dropPeer(m.from);
        return;
      }
      if (m.to !== myId || (m.toSid && m.toSid !== s.sid)) return;
      if (m.kind === "offer") {
        // Only the lower id offers; ignore anything else so two phones never cross wires.
        if (!(m.from < myId) || !m.sdp) return;
        dropPeer(m.from);
        const p = startPeer(m.from, m.fromSid, false);
        if (!p) return;
        try {
          await p.pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
          p.remoteSet = true;
          await flushIce(p);
          const answer = await p.pc.createAnswer();
          if (p.closed) return;
          await p.pc.setLocalDescription(answer);
          if (p.closed) return;
          send({ kind: "answer", from: myId, fromSid: s.sid, to: m.from, toSid: m.fromSid, sdp: answer.sdp ?? "" });
        } catch {
          dropPeer(m.from);
        }
        return;
      }
      const p = s.peers.get(m.from);
      if (!p || p.sid !== m.fromSid || p.closed) return;
      if (m.kind === "answer") {
        if (!p.offerer || !m.sdp || p.pc.signalingState !== "have-local-offer") return;
        try {
          await p.pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
          p.remoteSet = true;
          await flushIce(p);
        } catch {
          retry(p);
        }
        return;
      }
      if (m.kind === "ice" && m.cand) {
        if (!p.remoteSet) p.pending.push(m.cand);
        else await p.pc.addIceCandidate(m.cand).catch(() => {});
      }
    };

    // ---- Who's in the call ----

    /** Everyone in the call (you included), in the order they joined. */
    const order = (): { id: string; at: number }[] => {
      const all = [...s.roster.values()].map((r) => ({ id: r.id, at: r.at }));
      if (s.inCall) all.push({ id: myId, at: s.at });
      return all.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    };

    const syncPeers = () => {
      if (!s.inCall) return;
      // If two people joined at the same moment and the call went over the limit, the last one leaves.
      const pos = order().findIndex((o) => o.id === myId);
      if (pos >= maxRef.current) {
        apiRef.current?.leave(`Sorry, the call just filled up (${maxRef.current} max).`);
        return;
      }
      for (const p of [...s.peers.values()]) {
        const r = s.roster.get(p.id);
        // A brand new link may come before their presence shows up here, so give it a moment.
        if (r ? r.sid !== p.sid : Date.now() - p.born > 10000) dropPeer(p.id);
      }
      for (const r of s.roster.values()) {
        if (!s.peers.has(r.id) && myId < r.id) startPeer(r.id, r.sid, true);
      }
    };

    const onPresence = () => {
      const state = channel.presenceState() as Record<string, { name?: unknown; avatar?: unknown; muted?: unknown; sid?: unknown; at?: unknown }[]>;
      const roster = new Map<string, Member>();
      for (const [id, metas] of Object.entries(state)) {
        if (id === myId || id.length > 64) continue;
        for (const m of metas) {
          if (typeof m.sid !== "string" || !m.sid) continue;
          roster.set(id, {
            id,
            name: typeof m.name === "string" ? m.name.slice(0, 40) || "Player" : "Player",
            avatar: m.avatar ?? null,
            muted: m.muted === true,
            sid: m.sid.slice(0, 40),
            at: typeof m.at === "number" && Number.isFinite(m.at) ? m.at : 0,
          });
        }
      }
      s.roster = roster;
      if (alive) setMembers([...roster.values()].sort((a, b) => a.at - b.at));
      syncPeers();
    };

    // ---- Speaking rings ----

    const buf = new Uint8Array(512);
    const listen = () => {
      const now = Date.now();
      if (s.localAnalyser && !s.muted && levelOf(s.localAnalyser, buf) > SPEAK_LEVEL) s.loudAt.set(myId, now);
      for (const p of s.peers.values()) {
        if (p.analyser && levelOf(p.analyser, buf) > SPEAK_LEVEL) s.loudAt.set(p.id, now);
      }
      const ids: string[] = [];
      for (const [id, t] of s.loudAt) {
        if (now - t > SPEAK_HOLD_MS) continue;
        if (id === myId ? s.muted : s.roster.get(id)?.muted) continue;
        ids.push(id);
      }
      ids.sort();
      const key = ids.join(",");
      if (key !== s.speaking) {
        s.speaking = key;
        if (alive) setSpeaking(ids);
      }
    };

    // ---- The page going to the background and back ----

    const onVisible = () => {
      if (document.visibilityState !== "visible" || !s.inCall) return;
      // Phones may pause sound while the tab was away; start it again and say we're still here.
      playAll();
      track();
      syncPeers();
    };
    const onTap = () => {
      if (s.inCall) playAll();
    };
    const onPageHide = () => {
      if (s.inCall) apiRef.current?.leave();
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", onTap, true);
    window.addEventListener("pagehide", onPageHide);

    // ---- Join and leave ----

    const leave = (reason?: string) => {
      if (s.inCall) send({ kind: "bye", from: myId, fromSid: s.sid, to: "*" });
      s.inCall = false;
      if (s.subscribed) void channel.untrack().catch(() => {});
      for (const id of [...s.peers.keys()]) dropPeer(id);
      if (s.tick) clearInterval(s.tick);
      if (s.chores) clearInterval(s.chores);
      s.tick = null;
      s.chores = null;
      for (const t of s.stream?.getTracks() ?? []) t.stop();
      s.stream = null;
      try {
        s.localSource?.disconnect();
      } catch {}
      s.localSource = null;
      s.localAnalyser = null;
      if (s.ctx) void s.ctx.close().catch(() => {});
      s.ctx = null;
      s.loudAt.clear();
      s.speaking = "";
      s.connected = "";
      if (alive) {
        setJoined(false);
        setJoining(false);
        setSpeaking([]);
        setConnected([]);
        if (reason) setError(reason);
      }
    };

    let joinBusy = false;
    const join = async () => {
      if (s.inCall || joinBusy) return;
      joinBusy = true;
      setError(null);
      setJoining(true);
      // Start sound now, inside the tap, before anything waits (iOS insists).
      const ctx = newAudioContext();
      if (ctx) void ctx.resume().catch(() => {});
      const fail = (msg: string) => {
        if (ctx) void ctx.close().catch(() => {});
        joinBusy = false;
        if (alive) {
          setJoining(false);
          setError(msg);
        }
      };
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        fail("Voice calls need a browser with a microphone on a secure (https) page.");
        return;
      }
      if (s.roster.size >= maxRef.current) {
        fail(`This call is full (${maxRef.current} people max). Try again when someone leaves.`);
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          video: false,
        });
      } catch (e) {
        fail(micError(e));
        return;
      }
      // The channel may still be connecting if Join was tapped straight away.
      for (let i = 0; i < 50 && alive && !s.subscribed; i++) await new Promise((r) => setTimeout(r, 100));
      if (!alive) {
        for (const t of stream.getTracks()) t.stop();
        if (ctx) void ctx.close().catch(() => {});
        return;
      }
      if (!s.subscribed) {
        for (const t of stream.getTracks()) t.stop();
        fail("We couldn't reach the call. Check your connection and try again.");
        return;
      }
      if (s.roster.size >= maxRef.current) {
        for (const t of stream.getTracks()) t.stop();
        fail(`This call is full (${maxRef.current} people max). Try again when someone leaves.`);
        return;
      }
      s.stream = stream;
      s.ctx = ctx;
      if (ctx) {
        try {
          s.localSource = ctx.createMediaStreamSource(stream);
          s.localAnalyser = ctx.createAnalyser();
          s.localAnalyser.fftSize = 512;
          s.localSource.connect(s.localAnalyser);
        } catch {
          s.localSource = null;
          s.localAnalyser = null;
        }
      }
      s.muted = false;
      s.sid = randomId(12);
      s.at = Date.now();
      s.inCall = true;
      joinBusy = false;
      setMutedState(false);
      setJoined(true);
      setJoining(false);
      track();
      s.tick = setInterval(listen, 120);
      s.chores = setInterval(syncPeers, 4000);
      syncPeers();
      // If the microphone gets cut off (unplugged, or taken by a phone call), say so and leave.
      for (const t of stream.getAudioTracks()) {
        t.onended = () => {
          if (s.stream === stream) leave("Your microphone stopped, so you left the call.");
        };
      }
    };

    const setMuted = (b: boolean) => {
      s.muted = b;
      for (const t of s.stream?.getAudioTracks() ?? []) t.enabled = !b;
      setMutedState(b);
      track();
    };

    apiRef.current = { join, leave, setMuted };

    channel
      .on("broadcast", { event: "sig" }, ({ payload }) => {
        void onSignal(payload);
      })
      .on("presence", { event: "sync" }, () => onPresence())
      .subscribe((status) => {
        if (!alive) return;
        if (status === "SUBSCRIBED") {
          s.subscribed = true;
          track();
          onPresence();
        } else {
          s.subscribed = false;
        }
      });

    return () => {
      leave();
      alive = false;
      apiRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onTap, true);
      window.removeEventListener("pagehide", onPageHide);
      void supabase.removeChannel(channel);
      setMembers([]);
      setJoined(false);
      setJoining(false);
      setSpeaking([]);
      setConnected([]);
      setMutedState(false);
    };
  }, [room, meId]);

  const join = useCallback(() => apiRef.current?.join() ?? Promise.resolve(), []);
  const leave = useCallback(() => apiRef.current?.leave(), []);
  const setMuted = useCallback((b: boolean) => apiRef.current?.setMuted(b), []);

  const speakingSet = new Set<string>(speaking);
  const connectedSet = new Set<string>(connected);
  const people: CallPerson[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    avatar: m.avatar,
    speaking: speakingSet.has(m.id),
    muted: m.muted,
    connected: connectedSet.has(m.id),
    me: false,
  }));
  if (joined && me) {
    people.unshift({ id: me.id, name: me.name, avatar: me.avatar ?? null, speaking: speakingSet.has(me.id), muted, connected: true, me: true });
  }

  return {
    /** You're in the call. */
    joined,
    /** Asking for the microphone and connecting. */
    joining,
    /** A friendly line about what went wrong (mic blocked, call full...), or null. */
    error,
    /** Everyone in the call: you first once you've joined. Before you join, who's already in. */
    people,
    /** Join the call. Call it from a tap. */
    join,
    leave,
    muted,
    setMuted,
    /** The call already has the most people it can take (only matters before you join). */
    full: !joined && members.length >= max,
    max,
  };
}
