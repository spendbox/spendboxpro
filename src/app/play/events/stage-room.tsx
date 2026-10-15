"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowBigUp, Check, ChevronLeft, ChevronRight, Film, ImagePlus, LoaderCircle, Images, MessageCircleQuestion, Square, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SLIDES_MAX, cleanStage, eventFormat, videoPosNow, youtubeId, type StageState } from "@/lib/world/events";
import { CallBar } from "../call/call-bar";
import { randomKey, useEventRoom, useRoomChat, type RoomMsg } from "./channel";
import { setStage, type EventView } from "./event-actions";
import { Face, FloatingChat, FloatingReactions, ReactBar, RoomChat, RoomPanel, RoomTop, WhoPanel, shrinkPhoto, type RoomMe } from "./room-kit";

// A stage (docs/EVENTS.md): a talk, a class, a watch party or an open mic. Everyone sits in rows
// facing the screen. The host puts slides or a video on it and everyone sees the same thing at the
// same moment (people who come in late too). The audience reacts, asks questions and upvotes the
// best; the host marks them answered. Up to 6 people can be on the mic (the host and guests).

/** Slides come only from our own storage (so nobody can put another picture on everyone's screen). */
const SLIDE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/events/`;

type Question = { id: string; from: string; name: string; text: string; ups: Set<string>; answered: boolean };

export function StageRoom({
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
  onMin: () => void;
  onLeave: () => void;
  onPerson: (id: string) => void;
  onMessage: (text: string, good: boolean) => void;
  onEnd: () => void;
  /** The host calls it off (every ticket back). */
  onCancel: () => void;
}) {
  const host = view.me.host;
  const room = useEventRoom(view.id, { ...me, host }, null);
  const { here, send, on } = room;
  const chat = useRoomChat(on, view.host.id);
  const f = eventFormat(view.format);
  const [stage, setStageNow] = useState<StageState>(() => cleanStage(view.stage, SLIDE_BASE));
  const [panel, setPanel] = useState<null | "questions" | "video" | "who">(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  // What's on the stage: from the host (as it changes), checked like everything else.
  useEffect(
    () =>
      on((m) => {
        if (m.t === "stage" && !host) setStageNow(cleanStage(m.s, SLIDE_BASE));
        else if (m.t === "ask") setQuestions((q) => (q.some((x) => x.id === m.id) ? q : [...q, { id: m.id, from: m.from, name: m.name, text: m.text, ups: new Set<string>(), answered: false }].slice(-60)));
        else if (m.t === "up") setQuestions((q) => q.map((x) => (x.id === m.id ? { ...x, ups: new Set(x.ups).add(m.from) } : x)));
        else if (m.t === "answered") setQuestions((q) => q.map((x) => (x.id === m.id ? { ...x, answered: true } : x)));
      }),
    [on, host],
  );
  // Somebody new in the room gets the stage as it is from the host (the server copy may be a few seconds old).
  const count = here.length;
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  });
  useEffect(() => {
    if (host && count > 0) send({ t: "stage", s: stageRef.current });
  }, [host, count, send]);

  // The host changes the stage: everyone sees it at once, and it's kept (for people coming in later).
  const saved = useRef(0);
  const change = useCallback(
    (next: StageState, keep = true) => {
      setStageNow(next);
      send({ t: "stage", s: next });
      if (keep || Date.now() - saved.current > 30_000) {
        saved.current = Date.now();
        void setStage(view.id, next).then((r) => !r.ok && onMessage(r.error, false));
      }
    },
    [send, view.id, onMessage],
  );

  const [uploading, setUploading] = useState<string | null>(null);
  const addSlides = async (files: FileList | null) => {
    if (!files?.length) return;
    let slides = [...stage.slides];
    const list = [...files].slice(0, SLIDES_MAX - slides.length);
    if (!list.length) return onMessage(`${SLIDES_MAX} slides at most.`, false);
    for (let i = 0; i < list.length; i++) {
      setUploading(`Adding slide ${i + 1} of ${list.length}…`);
      try {
        const body = new FormData();
        body.set("id", String(view.id));
        body.set("photo", await shrinkPhoto(list[i], 1600), "slide.jpg");
        const r = (await fetch("/api/events/slide", { method: "POST", body }).then((res) => res.json())) as { ok: boolean; url?: string; error?: string };
        if (!r.ok || !r.url) {
          onMessage(r.error ?? "Couldn't add that slide.", false);
          break;
        }
        slides = [...slides, r.url];
      } catch {
        onMessage("That picture couldn't be used. Try a JPG or PNG.", false);
        break;
      }
    }
    setUploading(null);
    if (slides.length !== stage.slides.length) change({ ...stage, mode: "slides", slides, slide: stage.mode === "slides" ? stage.slide : stage.slides.length });
  };

  const audience = useMemo(() => {
    const list = here.filter((p) => !p.host);
    if (!host && !list.some((p) => p.id === me.id)) list.push({ id: me.id, name: me.name, avatar: me.avatar, host: false, looking: false, vibe: null });
    return list;
  }, [here, host, me]);
  const hostHere = here.find((p) => p.host) ?? (host ? { id: me.id, name: me.name, avatar: me.avatar } : null);
  const open = questions.filter((q) => !q.answered).sort((a, b) => b.ups.size - a.ups.size);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0d0b14] text-white">
      <RoomTop title={view.title} icon={f?.icon ?? "🎤"} endsAt={Date.parse(view.endsAt)} here={Math.max(here.length, view.came, 1)} onMin={onMin} onLeave={onLeave} onHere={() => setPanel("who")} />

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-2">
        {/* The screen. */}
        <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-[0_0_60px_-10px_rgba(112,72,232,.7)] ring-1 ring-white/10">
          {stage.mode === "slides" && stage.slides[stage.slide] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stage.slides[stage.slide]} alt={`Slide ${stage.slide + 1}`} className="size-full object-contain" />
          ) : stage.mode === "video" && stage.video ? (
            <YouTubeScreen stage={stage} host={host} onHostChange={(s) => change(s, false)} />
          ) : (
            <div className="grid size-full place-items-center p-6 text-center">
              <div>
                <p className="text-4xl">{f?.icon ?? "🎤"}</p>
                <p className="mt-2 font-display text-lg font-extrabold">{host ? "Your stage" : `${view.host.name} is on stage`}</p>
                <p className="text-sm text-white/65">{host ? "Add slides or a video below. Everyone sees the same, at the same moment." : "Slides or a video will show here."}</p>
              </div>
            </div>
          )}
          {stage.mode === "slides" && stage.slides.length > 0 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold tabular-nums">
              {stage.slide + 1} / {stage.slides.length}
            </span>
          )}
        </div>

        {/* The host's controls. */}
        {host && (
          <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center gap-1.5">
            {stage.mode === "slides" && (
              <>
                <Ctl disabled={stage.slide <= 0} onClick={() => change({ ...stage, slide: stage.slide - 1 })} label="Back" icon={<ChevronLeft className="size-4" />} />
                <Ctl disabled={stage.slide >= stage.slides.length - 1} onClick={() => change({ ...stage, slide: stage.slide + 1 })} label="Next" icon={<ChevronRight className="size-4" />} />
              </>
            )}
            <label className={cn("flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-ink", uploading && "pointer-events-none opacity-60")}>
              {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {uploading ?? (stage.slides.length ? "Add slides" : "Slides")}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                  const input = e.currentTarget;
                  void addSlides(input.files).finally(() => {
                    input.value = "";
                  });
                }} />
            </label>
            {stage.slides.length > 0 && stage.mode !== "slides" && <Ctl onClick={() => change({ ...stage, mode: "slides" })} label="Show slides" icon={<Images className="size-4" />} />}
            <Ctl onClick={() => setPanel("video")} label={stage.video ? "Change video" : "Video"} icon={<Film className="size-4" />} />
            {stage.video && stage.mode !== "video" && <Ctl onClick={() => change({ ...stage, mode: "video", playing: false, at: Date.now() })} label="Show video" icon={<Film className="size-4" />} />}
            {stage.mode !== "none" && <Ctl onClick={() => change({ ...stage, mode: "none", playing: false })} label="Clear screen" icon={<Square className="size-4" />} />}
            {stage.slides.length > 0 && <Ctl onClick={() => change({ ...stage, slides: [], slide: 0, mode: stage.mode === "slides" ? "none" : stage.mode })} label="Remove slides" icon={<Trash2 className="size-4" />} />}
            <Ctl onClick={onEnd} label="End" icon={<Square className="size-4 fill-current" />} />
            <Ctl onClick={onCancel} label="Call it off" icon={<X className="size-4" />} />
          </div>
        )}

        {/* On stage, and the audience in rows. */}
        <div className="mx-auto mt-4 max-w-3xl">
          {hostHere && (
            <div className="flex items-center justify-center gap-2">
              <Face p={hostHere} size={52} onPerson={hostHere.id === me.id ? undefined : onPerson} ring="ring-[#9775fa] ring-4" />
              <p className="text-xs text-white/70">🎙️ {hostHere.id === me.id ? "You're" : `${hostHere.name} is`} on stage</p>
            </div>
          )}
          <div className="mt-3 grid grid-cols-6 gap-x-1 gap-y-3 rounded-t-[2.5rem] bg-gradient-to-b from-[#7048e8]/20 to-transparent px-2 pt-4 sm:grid-cols-10">
            {audience.map((p) => (
              <Face key={p.id} p={{ ...p, name: p.id === me.id ? "You" : p.name }} size={34} onPerson={p.id === me.id ? undefined : onPerson} />
            ))}
            {Array.from({ length: Math.max(0, 12 - audience.length) }, (_, i) => (
              <span key={`seat-${i}`} className="mx-auto mt-1 h-7 w-8 rounded-t-xl bg-white/[.06]" aria-hidden />
            ))}
          </div>
        </div>
      </div>
      <FloatingReactions on={on} />
      <FloatingChat on={on} me={me} people={here} />

      <div className="relative z-10 space-y-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center justify-between gap-2">
          <ReactBar me={me} send={send} />
          <button onClick={() => setPanel("questions")} className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-ink">
            <MessageCircleQuestion className="size-4" /> Q&amp;A
            {open.length > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-hit px-1 text-[10px] text-white">{open.length}</span>}
          </button>
        </div>
        <RoomChat eventId={view.id} me={me} hostId={view.host.id} lines={chat} send={send} onPerson={onPerson} onMessage={onMessage} compact />
        <CallBar room={`event-${view.id}`} me={{ id: me.id, name: me.name, avatar: me.avatar }} title={host ? "Your mic (and up to 5 guests)" : "Stage mic (6 people)"} max={6} />
      </div>

      {panel === "who" && <WhoPanel people={here} me={me} hostId={view.host.id} onPerson={onPerson} onClose={() => setPanel(null)} />}
      {panel === "questions" && <Questions me={me} host={host} list={questions} send={send} onPerson={onPerson} onClose={() => setPanel(null)} />}
      {panel === "video" && (
        <VideoPanel
          onClose={() => setPanel(null)}
          onPick={(id) => {
            change({ ...stage, mode: "video", video: id, playing: false, pos: 0, at: Date.now() });
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}

function Ctl({ onClick, label, icon, disabled }: { onClick: () => void; label: string; icon: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex h-9 items-center gap-1 rounded-full bg-white/15 px-3 text-xs font-bold disabled:opacity-35">
      {icon} {label}
    </button>
  );
}

function VideoPanel({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [link, setLink] = useState("");
  const id = youtubeId(link);
  return (
    <RoomPanel title="Put a video on" onClose={onClose}>
      <p className="text-sm text-muted">Paste a YouTube link. It plays through YouTube&apos;s own player, in sync for everyone: you play, pause and skip, they follow.</p>
      <input value={link} onChange={(e) => setLink(e.target.value.slice(0, 300))} placeholder="https://youtube.com/watch?v=…" className="mt-3 h-11 w-full rounded-2xl bg-ink/5 px-3.5 text-sm outline-none" inputMode="url" />
      {link && !id && <p className="mt-1 text-xs font-semibold text-hit">That isn&apos;t a YouTube link.</p>}
      <p className="mt-2 text-[11px] text-muted">Only show videos you&apos;re allowed to share. Films and matches that their owners don&apos;t let YouTube embed won&apos;t play.</p>
      <button disabled={!id} onClick={() => id && onPick(id)} className="mt-3 h-11 w-full rounded-full bg-ink font-bold text-white disabled:opacity-40">
        Show it
      </button>
    </RoomPanel>
  );
}

function Questions({ me, host, list, send, onPerson, onClose }: { me: RoomMe; host: boolean; list: Question[]; send: (m: RoomMsg) => void; onPerson: (id: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const sorted = [...list].sort((a, b) => Number(a.answered) - Number(b.answered) || b.ups.size - a.ups.size);
  return (
    <RoomPanel title="Questions" onClose={onClose}>
      {!host && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.replace(/\s+/g, " ").trim().slice(0, 200);
            if (!t) return;
            send({ t: "ask", id: randomKey(), from: me.id, name: me.name, text: t });
            setText("");
          }}
          className="mb-3 flex h-11 items-center gap-1 rounded-full bg-ink/5 pl-3.5 pr-1"
        >
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} placeholder="Ask the speaker something…" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
          <button type="submit" disabled={!text.trim()} className="h-9 rounded-full bg-ink px-3 text-xs font-bold text-white disabled:opacity-40">
            Ask
          </button>
        </form>
      )}
      {sorted.length === 0 && <p className="rounded-2xl bg-ink/5 p-4 text-center text-sm text-muted">{host ? "Questions from the audience show here, the most upvoted first." : "No questions yet. Ask the first!"}</p>}
      <div className="space-y-1.5">
        {sorted.map((q) => (
          <div key={q.id} className={cn("flex items-start gap-2 rounded-2xl bg-ink/5 p-2.5", q.answered && "opacity-50")}>
            <button
              disabled={q.ups.has(me.id) || q.from === me.id || q.answered}
              onClick={() => send({ t: "up", id: q.id, from: me.id })}
              className={cn("flex w-9 shrink-0 flex-col items-center rounded-xl py-1 text-xs font-bold", q.ups.has(me.id) ? "bg-[#7048e8] text-white" : "bg-white")}
              aria-label="Upvote"
            >
              <ArrowBigUp className="size-4" />
              {q.ups.size}
            </button>
            <div className="min-w-0 flex-1">
              <button onClick={() => q.from !== me.id && onPerson(q.from)} className="text-xs font-bold text-[#5f3dc4]">
                {q.from === me.id ? "You" : q.name}
              </button>
              <p className="text-sm">{q.text}</p>
            </div>
            {host && !q.answered && (
              <button onClick={() => send({ t: "answered", id: q.id })} className="flex shrink-0 items-center gap-1 rounded-full bg-[#12a37a] px-2.5 py-1.5 text-[11px] font-bold text-white">
                <Check className="size-3.5" /> Answered
              </button>
            )}
          </div>
        ))}
      </div>
    </RoomPanel>
  );
}

// ---------------------------------------------------------------- the video, in sync

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  loadVideoById: (o: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (o: { videoId: string; startSeconds?: number }) => void;
  getVideoData?: () => { video_id?: string };
  destroy: () => void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer };
const ytWindow = () => window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

let ytReady: Promise<YTNamespace> | null = null;
/** YouTube's player script, loaded once. */
function loadYouTube(): Promise<YTNamespace> {
  if (ytReady) return ytReady;
  ytReady = new Promise((ok) => {
    const w = ytWindow();
    if (w.YT?.Player) return ok(w.YT);
    const before = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      before?.();
      if (w.YT) ok(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return ytReady;
}

/**
 * The stage's video. The host's player has the controls: playing, pausing and skipping are sent to
 * everyone. Everyone else's player follows (a jump when it drifts more than 2 seconds), and asks for
 * a tap when the phone won't start sound by itself.
 */
export function YouTubeScreen({ stage, host, onHostChange, onEnded }: { stage: StageState; host: boolean; onHostChange: (s: StageState) => void; onEnded?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const stageRef = useRef(stage);
  const changeRef = useRef(onHostChange);
  const endedRef = useRef(onEnded);
  useEffect(() => {
    stageRef.current = stage;
    changeRef.current = onHostChange;
    endedRef.current = onEnded;
  });
  const video = stage.video;

  useEffect(() => {
    if (!video || !box.current) return;
    let gone = false;
    const el = document.createElement("div");
    box.current.appendChild(el);
    void loadYouTube().then((YT) => {
      if (gone) return;
      player.current = new YT.Player(el, {
        videoId: video,
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: host ? 1 : 0, disablekb: host ? 0 : 1, start: Math.floor(videoPosNow(stageRef.current)), autoplay: host && stageRef.current.playing ? 1 : 0 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: { data: number }) => {
            if (!host) {
              if (e.data === 1) setNeedTap(false);
              return;
            }
            const p = player.current;
            if (!p) return;
            // Finished, with something to play next (a party's queue): the next song.
            if (e.data === 0 && endedRef.current) return endedRef.current();
            // Playing (1), paused (2) or finished (0): everyone follows.
            if (e.data === 1 || e.data === 2 || e.data === 0) {
              const s = stageRef.current;
              changeRef.current({ ...s, playing: e.data === 1, pos: p.getCurrentTime(), at: Date.now() });
            }
          },
        },
      });
    });
    return () => {
      gone = true;
      setReady(false);
      player.current?.destroy();
      player.current = null;
      el.remove();
    };
  }, [video, host]);

  // Guests follow the host.
  useEffect(() => {
    if (host || !ready) return;
    const follow = () => {
      const p = player.current;
      const s = stageRef.current;
      if (!p) return;
      const want = videoPosNow(s);
      if (Math.abs(p.getCurrentTime() - want) > 2) p.seekTo(want, true);
      const state = p.getPlayerState();
      if (s.playing && state !== 1 && state !== 3) {
        p.playVideo();
        // Still not playing a moment later: the phone wants a tap first.
        setTimeout(() => {
          const now = player.current?.getPlayerState();
          if (stageRef.current.playing && now !== 1 && now !== 3) setNeedTap(true);
        }, 1500);
      } else if (!s.playing && state === 1) p.pauseVideo();
    };
    follow();
    const t = setInterval(follow, 3000);
    return () => clearInterval(t);
  }, [host, ready, stage.playing, stage.pos, stage.at]);

  // The host sends where they are now and then (so everyone stays together).
  useEffect(() => {
    if (!host || !ready) return;
    const t = setInterval(() => {
      const p = player.current;
      const s = stageRef.current;
      if (p && s.playing) changeRef.current({ ...s, pos: p.getCurrentTime(), at: Date.now() });
    }, 10_000);
    return () => clearInterval(t);
  }, [host, ready]);

  return (
    <div className="relative size-full">
      <div ref={box} className="size-full [&>iframe]:size-full" />
      {!host && <div className="absolute inset-0" aria-hidden />}
      {needTap && !host && (
        <button
          onClick={() => {
            player.current?.playVideo();
            setNeedTap(false);
          }}
          className="absolute inset-0 grid place-items-center bg-black/60 font-display text-lg font-extrabold"
        >
          ▶ Tap to watch with everyone
        </button>
      )}
    </div>
  );
}

