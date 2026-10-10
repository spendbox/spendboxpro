"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, LoaderCircle, SwitchCamera, X, Zap } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { useEscape } from "../menu/escape";
import { playSfx } from "../sound";
import { addShot, useGallery } from "./gallery";
import { shotAspect, takeShot, type ShotKind } from "./lens";

// The phone camera: a viewfinder over the town. You can still move around and turn the view
// while it's open, then tap the big button. Photo takes the town; Selfie turns the camera
// round and puts you in the picture. Every picture goes straight into your gallery.

function useViewport() {
  const [v, setV] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

export function CameraMode({
  avatar,
  place,
  city,
  guest,
  initialKind = "photo",
  onClose,
  onOpenGallery,
  onSignIn,
}: {
  avatar: Avatar;
  /** Where you are (a building, a ride), or null out in the town. */
  place: string | null;
  city: string;
  guest: boolean;
  initialKind?: ShotKind;
  onClose: () => void;
  onOpenGallery: () => void;
  onSignIn: () => void;
}) {
  const [kind, setKind] = useState<ShotKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0);
  const [note, setNote] = useState<{ text: string; tone: "good" | "bad" | "info"; signIn?: boolean } | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  const view = useViewport();
  const { photos } = useGallery();
  const last = photos[0];
  useEscape(onClose);

  useEffect(() => () => window.clearTimeout(noteTimer.current), []);
  function say(text: string, tone: "good" | "bad" | "info", signIn = false) {
    window.clearTimeout(noteTimer.current);
    setNote({ text, tone, signIn });
    noteTimer.current = window.setTimeout(() => setNote(null), signIn ? 6000 : 2600);
  }

  async function snap() {
    if (busy) return;
    setBusy(true);
    playSfx("shutter");
    setFlash((f) => f + 1);
    const shot = await takeShot(kind, avatar, view).catch(() => null);
    setBusy(false);
    if (!shot) return say("The camera couldn't see the town just now. Try again.", "bad");
    if (guest) {
      void addShot(shot, { place, city }, true);
      return say("Got it! Sign in to keep your pictures in your gallery.", "info", true);
    }
    say(kind === "selfie" ? "Selfie saved to your gallery" : "Saved to your gallery", "good");
    const error = await addShot(shot, { place, city }, false);
    if (error) say(error, "bad");
  }

  // The viewfinder: the biggest box of the picture's shape that fits the screen, in the middle
  // (exactly the part of the screen the picture keeps).
  const aspect = shotAspect(view.w || 3, view.h || 4);
  const fw = view.w && view.h ? Math.min(view.w, view.h * aspect) : 0;
  const fh = fw / aspect;
  const tall = aspect < 1;
  const face = Math.min(fw * (tall ? 0.95 : 0.62), fh * 0.86);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none" role="dialog" aria-label="Camera">
      {/* Everything outside the picture is dimmed. */}
      {fw > 0 && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: fw, height: fh, boxShadow: "0 0 0 100vmax rgba(0,0,0,0.55)" }}
        >
          {/* Thirds grid and corner marks */}
          <div className="absolute inset-0 opacity-40">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/70" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/70" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/70" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/70" />
          </div>
          {(["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "bottom-2 left-2 border-b-2 border-l-2", "bottom-2 right-2 border-b-2 border-r-2"] as const).map((c) => (
            <span key={c} className={cn("absolute size-6 rounded-[3px] border-white", c)} />
          ))}
          {kind === "selfie" && (
            <>
              {/* Portrait mode: the town goes soft behind you. */}
              <div className="absolute inset-0 backdrop-blur-[3px]" />
              <div
                className="absolute bottom-0"
                style={{ width: face, height: face, left: fw / 2 - face / 2 + fw * (tall ? 0.03 : 0.08), filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))" }}
              >
                <AvatarFace avatar={avatar} size={face} cutout className="h-full w-full" />
              </div>
              <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-[#f5c542] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-black">
                Portrait
              </span>
            </>
          )}
          {/* The white flash when the picture is taken */}
          {flash > 0 && <div key={flash} className="absolute inset-0 bg-white" style={{ animation: "phone-flash 0.45s ease-out forwards" }} />}
        </div>
      )}

      {/* Top: close, and where the picture is */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="pointer-events-auto grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur" aria-label="Close the camera">
          <X className="size-5" />
        </button>
        <span className="flex min-w-0 items-center gap-1.5 truncate rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          <Zap className="size-3.5 shrink-0 text-[#f5c542]" />
          <span className="truncate">{place ? `${place} · ${city}` : city}</span>
        </span>
        <span className="size-10" />
      </div>

      {/* Bottom: gallery, the shutter, flip to selfie; Photo / Selfie under it */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        {note && (
          <div
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-lg",
              note.tone === "good" && "bg-white text-black",
              note.tone === "bad" && "bg-hit text-white",
              note.tone === "info" && "bg-black/75 text-white",
            )}
            role="status"
          >
            {note.text}
            {note.signIn && (
              <button onClick={onSignIn} className="rounded-full bg-gold px-2 py-0.5 text-black">
                Sign in
              </button>
            )}
          </div>
        )}
        <div className="flex w-full max-w-xs items-center justify-between">
          <button
            onClick={onOpenGallery}
            className="pointer-events-auto relative grid size-12 place-items-center overflow-hidden rounded-xl border-2 border-white/90 bg-black/50 text-white"
            aria-label="Open your gallery"
          >
            {last ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={last.id} src={last.url} alt="" className="h-full w-full object-cover" style={{ animation: "phone-thumb 0.35s ease-out" }} />
            ) : (
              <ImageIcon className="size-5" />
            )}
            {last?.saving && (
              <span className="absolute inset-0 grid place-items-center bg-black/40">
                <LoaderCircle className="size-4 animate-spin" />
              </span>
            )}
          </button>
          <button
            onClick={() => void snap()}
            disabled={busy}
            className="pointer-events-auto grid size-[4.5rem] place-items-center rounded-full border-4 border-white bg-transparent transition active:scale-95"
            aria-label={kind === "selfie" ? "Take a selfie" : "Take a picture"}
          >
            <span className={cn("block size-14 rounded-full bg-white transition", busy && "scale-90 opacity-70")} />
          </button>
          <button
            onClick={() => setKind((k) => (k === "photo" ? "selfie" : "photo"))}
            className="pointer-events-auto grid size-12 place-items-center rounded-full bg-white/20 text-white backdrop-blur"
            aria-label={kind === "photo" ? "Turn the camera round for a selfie" : "Turn the camera back to the town"}
          >
            <SwitchCamera className="size-6" />
          </button>
        </div>
        <div className="pointer-events-auto flex gap-1 rounded-full bg-black/40 p-1 text-xs font-bold uppercase tracking-wider">
          {(["photo", "selfie"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn("rounded-full px-3.5 py-1", kind === k ? "bg-white/90 text-black" : "text-white/80")}
              aria-pressed={kind === k}
            >
              {k === "photo" ? "Photo" : "Selfie"}
            </button>
          ))}
        </div>
        <p className="text-center text-[11px] text-white/70">Move and turn the view, then tap the big button.</p>
      </div>
    </div>
  );
}
