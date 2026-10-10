"use client";

import { useEffect, useRef, useState } from "react";
import {
  BatteryFull,
  Camera,
  ChevronLeft,
  Download,
  Images,
  LoaderCircle,
  MapPin,
  Share2,
  Signal,
  SwitchCamera,
  Trash2,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useEscape } from "../menu/escape";
import { asFile, downloadPhoto, loadGallery, removePhoto, sharePhoto, useGallery, type GalleryPhoto } from "./gallery";
import type { ShotKind } from "./lens";

// Your phone: a home screen with the Camera and your Photos. The gallery belongs to your
// account, so the same pictures are here in every town and round. Open a picture to share it
// (WhatsApp, Instagram…), download it, or delete it.

type Screen = "home" | "photos";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");

export function PhoneSheet({
  guest,
  initialScreen = "home",
  onClose,
  onCamera,
  onSignIn,
}: {
  guest: boolean;
  initialScreen?: Screen;
  onClose: () => void;
  onCamera: (kind: ShotKind) => void;
  onSignIn: () => void;
}) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const now = useClock();
  const downOnBackdrop = useRef(false);
  useEscape(() => (open ? setOpen(null) : screen !== "home" ? setScreen("home") : onClose()));

  useEffect(() => {
    if (!guest) void loadGallery();
  }, [guest]);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-3 backdrop-blur-[3px]"
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div
        className="relative h-[min(46rem,calc(100dvh-1.5rem))] w-[min(22rem,calc(100vw-1.5rem),calc((100dvh-1.5rem)*0.5))] rounded-[3rem] bg-[#0d0f12] p-[10px] shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_0_0_2px_#3a3f47] starting:scale-95 starting:opacity-0 transition-[opacity,scale] duration-200"
        role="dialog"
        aria-label="Your phone"
      >
        {/* Side buttons */}
        <span className="absolute -left-[3px] top-28 h-10 w-[3px] rounded-l bg-[#3a3f47]" />
        <span className="absolute -left-[3px] top-44 h-16 w-[3px] rounded-l bg-[#3a3f47]" />
        <span className="absolute -right-[3px] top-36 h-20 w-[3px] rounded-r bg-[#3a3f47]" />

        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.4rem] bg-black text-white">
          {/* Status bar and the camera notch */}
          <div className={cn("relative z-20 flex h-11 shrink-0 items-center justify-between px-7 text-[13px] font-semibold", screen === "photos" && !open && "bg-white text-black")}>
            <span className="tabular-nums">{hhmm(now)}</span>
            <span className="absolute left-1/2 top-2 h-[26px] w-24 -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1">
              <Signal className="size-3.5" strokeWidth={2.5} />
              <Wifi className="size-3.5" strokeWidth={2.5} />
              <BatteryFull className="size-5" strokeWidth={2} />
            </span>
          </div>

          {screen === "home" && <Home now={now} onCamera={onCamera} onPhotos={() => setScreen("photos")} />}
          {screen === "photos" && <Photos guest={guest} onHome={() => setScreen("home")} onOpen={setOpen} onCamera={() => onCamera("photo")} onSignIn={onSignIn} />}
          {open && <Viewer key={open.id} photo={open} onBack={() => setOpen(null)} onDeleted={() => setOpen(null)} />}

          {/* Home bar: back to the home screen (or close from there) */}
          <button
            onClick={() => (open ? setOpen(null) : screen !== "home" ? setScreen("home") : onClose())}
            className="absolute bottom-0 left-1/2 z-30 flex h-6 w-40 -translate-x-1/2 items-center justify-center"
            aria-label={screen === "home" && !open ? "Put the phone away" : "Home"}
          >
            <span className={cn("h-[5px] w-32 rounded-full", screen === "photos" && !open ? "bg-black/80" : "bg-white/85")} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AppIcon({ label, onClick, className, children }: { label: string; onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95">
      <span className={cn("grid size-[3.75rem] place-items-center rounded-[1.1rem] shadow-[0_4px_12px_rgba(0,0,0,0.25)]", className)}>{children}</span>
      <span className="text-[11px] font-medium text-white drop-shadow">{label}</span>
    </button>
  );
}

function Home({ now, onCamera, onPhotos }: { now: Date; onCamera: (kind: ShotKind) => void; onPhotos: () => void }) {
  const { photos } = useGallery();
  return (
    <div className="absolute inset-0 flex flex-col bg-[radial-gradient(120%_80%_at_20%_0%,#ff9a62_0%,#e8507a_35%,#5a3fd6_70%,#1b1f4b_100%)] px-6 pb-8 pt-16">
      <div className="text-center drop-shadow-md">
        <p className="text-sm font-semibold text-white/85">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
        <p className="font-display text-7xl font-bold leading-none tracking-tight">{hhmm(now)}</p>
      </div>

      <div className="mt-10 grid grid-cols-4 justify-items-center gap-y-5">
        <AppIcon label="Camera" onClick={() => onCamera("photo")} className="bg-gradient-to-b from-[#e9ecef] to-[#adb5bd] text-[#212529]">
          <Camera className="size-8" strokeWidth={1.75} />
        </AppIcon>
        <AppIcon label="Selfie" onClick={() => onCamera("selfie")} className="bg-gradient-to-b from-[#ffd43b] to-[#f59f00] text-[#212529]">
          <SwitchCamera className="size-8" strokeWidth={1.75} />
        </AppIcon>
        <AppIcon label="Photos" onClick={onPhotos} className="overflow-hidden bg-white p-0">
          {photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[0].url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Images className="size-8 text-[#e64980]" strokeWidth={1.75} />
          )}
        </AppIcon>
      </div>

      <p className="mt-auto text-center text-[11px] text-white/70">More apps are coming to your phone soon.</p>
      <div className="mt-3 flex justify-center gap-5 rounded-[1.6rem] bg-white/20 px-4 py-3 backdrop-blur-md">
        <AppIcon label="" onClick={() => onCamera("photo")} className="bg-gradient-to-b from-[#e9ecef] to-[#adb5bd] text-[#212529]">
          <Camera className="size-8" strokeWidth={1.75} />
        </AppIcon>
        <AppIcon label="" onClick={onPhotos} className="bg-white text-[#e64980]">
          <Images className="size-8" strokeWidth={1.75} />
        </AppIcon>
      </div>
    </div>
  );
}

function Photos({
  guest,
  onHome,
  onOpen,
  onCamera,
  onSignIn,
}: {
  guest: boolean;
  onHome: () => void;
  onOpen: (p: GalleryPhoto) => void;
  onCamera: () => void;
  onSignIn: () => void;
}) {
  const { photos, loading, loaded, error } = useGallery();
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white text-black">
      <div className="flex items-center justify-between px-3 pb-2">
        <button onClick={onHome} className="flex items-center text-sm font-medium text-[#1c7ed6]">
          <ChevronLeft className="size-5" />
          Home
        </button>
        <button onClick={onCamera} className="grid size-9 place-items-center rounded-full text-[#1c7ed6]" aria-label="Open the camera">
          <Camera className="size-5" />
        </button>
      </div>
      <div className="px-4 pb-2">
        <h2 className="font-display text-3xl font-bold">Photos</h2>
        <p className="text-xs text-black/50">
          {photos.length === 1 ? "1 picture" : `${photos.length} pictures`}
          {!guest && " · saved to your account"}
        </p>
      </div>
      {guest && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-[#fff4d6] px-3 py-2 text-xs">
          <span className="flex-1">These pictures are only on this screen. Sign in and your gallery goes with you everywhere.</span>
          <button onClick={onSignIn} className="shrink-0 rounded-full bg-black px-2.5 py-1 font-semibold text-white">
            Sign in
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {error && (
          <p className="mx-3 rounded-xl bg-hit/10 px-3 py-2 text-center text-xs text-hit">
            {error}{" "}
            <button onClick={() => void loadGallery(true)} className="font-semibold underline">
              Try again
            </button>
          </p>
        )}
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-[2px]">
            {photos.map((p) => (
              <button key={p.id} onClick={() => onOpen(p)} className="relative aspect-square overflow-hidden bg-black/5" aria-label={`Open picture${p.place ? ` at ${p.place}` : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                {p.saving && (
                  <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
                    <LoaderCircle className="size-5 animate-spin" />
                  </span>
                )}
                {p.error && (
                  <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-hit text-white" title={p.error}>
                    <TriangleAlert className="size-3" />
                  </span>
                )}
                {p.kind === "selfie" && <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[9px] font-bold uppercase text-white">Selfie</span>}
              </button>
            ))}
          </div>
        ) : loading || (!loaded && !guest && !error) ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-black/50">
            <LoaderCircle className="size-4 animate-spin" />
            Opening your gallery…
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-black/5">
              <Images className="size-8 text-black/40" />
            </span>
            <p className="text-sm text-black/60">No pictures yet. Take one of anywhere in town, or a selfie!</p>
            <button onClick={onCamera} className="flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">
              <Camera className="size-4" />
              Open the camera
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Viewer({ photo, onBack, onDeleted }: { photo: GalleryPhoto; onBack: () => void; onDeleted: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState<"share" | "download" | "delete" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Get the file ready now, so Share opens the share menu the moment it's tapped.
  useEffect(() => {
    let live = true;
    asFile(photo)
      .then((f) => live && setFile(f))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [photo]);

  const when = new Date(photo.createdAt);

  async function share() {
    setWorking("share");
    const r = await sharePhoto(photo, file);
    setWorking(null);
    setNote(r === "downloaded" ? "Sharing isn't available here, so it was downloaded instead." : r === "failed" ? "Couldn't share it. Try again." : null);
  }
  async function download() {
    setWorking("download");
    const ok = await downloadPhoto(photo);
    setWorking(null);
    setNote(ok ? "Downloaded." : "Couldn't download it. Try again.");
  }
  async function remove() {
    setWorking("delete");
    const error = await removePhoto(photo);
    setWorking(null);
    if (error) setNote(error);
    else onDeleted();
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black pt-11">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onBack} className="flex items-center text-sm font-medium text-[#4dabf7]">
          <ChevronLeft className="size-5" />
          Photos
        </button>
        <div className="min-w-0 flex-1 text-center text-xs leading-tight">
          <p className="font-semibold">{when.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}</p>
          <p className="text-white/60">{when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
        </div>
        <span className="w-16" />
      </div>
      <div className="relative grid min-h-0 flex-1 place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.place ? `Picture at ${photo.place}` : "Your picture"} className="max-h-full max-w-full object-contain" />
      </div>
      {(photo.place || photo.city) && (
        <p className="flex items-center justify-center gap-1 px-4 pt-2 text-center text-xs text-white/75">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{[photo.place, photo.city].filter(Boolean).join(", ")}</span>
        </p>
      )}
      {photo.error && <p className="px-4 pt-1 text-center text-[11px] text-[#ff8787]">Not saved: {photo.error} Download it to keep it.</p>}
      {note && <p className="px-4 pt-1 text-center text-[11px] text-white/80">{note}</p>}
      {asking ? (
        <div className="flex items-center justify-center gap-2 px-4 pb-9 pt-3">
          <span className="text-sm">Delete this picture?</span>
          <button onClick={() => setAsking(false)} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">
            Keep
          </button>
          <button onClick={() => void remove()} disabled={working !== null} className="flex items-center gap-1 rounded-full bg-hit px-3 py-1.5 text-sm font-semibold">
            {working === "delete" && <LoaderCircle className="size-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-around px-6 pb-9 pt-3">
          <button onClick={() => void share()} disabled={working !== null} className="flex flex-col items-center gap-1 text-[11px] text-[#4dabf7]" aria-label="Share">
            {working === "share" ? <LoaderCircle className="size-6 animate-spin" /> : <Share2 className="size-6" />}
            Share
          </button>
          <button onClick={() => void download()} disabled={working !== null} className="flex flex-col items-center gap-1 text-[11px] text-[#4dabf7]" aria-label="Download">
            {working === "download" ? <LoaderCircle className="size-6 animate-spin" /> : <Download className="size-6" />}
            Download
          </button>
          <button onClick={() => setAsking(true)} disabled={working !== null || photo.saving} className="flex flex-col items-center gap-1 text-[11px] text-[#4dabf7] disabled:opacity-40" aria-label="Delete">
            <Trash2 className="size-6" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
