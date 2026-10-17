"use client";

import { OnTop } from "./on-top";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Camera, ImageIcon, User, X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { photoUrl } from "./chat-actions";
import { loadGallery, useGallery } from "./phone/gallery";

// Pictures in messages (docs/PEOPLE.md): send a selfie straight from the game's camera, one of
// the pictures in your phone's gallery, or a photo from your own phone. In the chat they show
// as a picture in the bubble; tap it to see it full screen.

/** A picture someone sent: loads its short-lived link, tap to see it big. */
export function ChatPhoto({ id, mine }: { id: number; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [big, setBig] = useState(false);
  useEffect(() => {
    let alive = true;
    void photoUrl(id)
      .then((r) => {
        if (!alive) return;
        if (r.ok) setUrl(r.url);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id]);
  if (failed) return <span className={cn("block text-xs", mine ? "text-white/70" : "text-muted")}>The picture couldn&apos;t load.</span>;
  return (
    <>
      <button onClick={() => url && setBig(true)} className="mb-1 block overflow-hidden rounded-xl bg-black/10" aria-label="See the picture full screen">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="A picture" className="max-h-64 w-56 max-w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-40 w-56 max-w-full place-items-center">
            <LoaderCircle className="size-5 animate-spin opacity-60" />
          </span>
        )}
      </button>
      {big && url && (
        <OnTop className="fixed inset-0 grid place-items-center bg-black/90 p-3" onClick={() => setBig(false)} role="dialog" aria-label="The picture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="A picture" className="max-h-full max-w-full rounded-xl object-contain" />
          <button onClick={() => setBig(false)} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-10 place-items-center rounded-full bg-white/15 text-white" aria-label="Close">
            <X className="size-5" />
          </button>
        </OnTop>
      )}
    </>
  );
}

/** A picture from this phone, made a small JPEG (at most 1,600 px across), or null if it isn't a picture. */
async function asJpeg(f: File): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    for (const q of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", q));
      if (blob && blob.size <= 1_450_000) return blob;
    }
    return null;
  } catch {
    return null;
  }
}

export type PhotoPick = { image: Blob } | { galleryId: number };

/** The picture button's menu: a selfie now, a picture from your gallery, or one from this phone. */
export function PhotoPicker({ onPick, onSelfie, onClose }: { onPick: (p: PhotoPick) => void; onSelfie?: () => void; onClose: () => void }) {
  const { photos, loading } = useGallery();
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void loadGallery();
  }, []);
  const saved = photos.filter((p) => p.saved && p.id > 0).slice(0, 24);
  return (
    <div className="mb-2 rounded-2xl border border-line bg-panel p-2.5 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-sm">Send a picture</b>
        <button onClick={onClose} className="grid size-7 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {onSelfie && (
          <button onClick={onSelfie} className="flex items-center justify-center gap-1.5 rounded-xl bg-[#7048e8] px-3 py-2.5 text-sm font-semibold text-white">
            <User className="size-4" /> Take a selfie
          </button>
        )}
        <button onClick={() => file.current?.click()} className={cn("flex items-center justify-center gap-1.5 rounded-xl bg-panel-2 px-3 py-2.5 text-sm font-semibold", !onSelfie && "col-span-2")}>
          <Camera className="size-4" /> From your phone
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setError(null);
          const jpeg = await asJpeg(f);
          if (!jpeg) return setError("That picture couldn't be used. Try another one.");
          onPick({ image: jpeg });
        }}
      />
      <p className="mb-1 mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-muted">
        <ImageIcon className="size-3.5" /> Your gallery
      </p>
      {saved.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted">{loading ? "Opening your gallery…" : "No pictures yet. Take a selfie!"}</p>
      ) : (
        <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto overscroll-contain">
          {saved.map((p) => (
            <button key={p.id} onClick={() => onPick({ galleryId: p.id })} className="aspect-square overflow-hidden rounded-lg bg-panel-2" aria-label="Send this picture">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-hit">{error}</p>}
    </div>
  );
}

/** Tell an open chat that a message was sent from elsewhere (the camera sent a selfie). */
export function announceChatSent(message: unknown) {
  window.dispatchEvent(new CustomEvent("nt-chat-sent", { detail: message }));
}
