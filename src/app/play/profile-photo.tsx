"use client";

import { useRef, useState } from "react";
import { ImagePlus, Palette } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { Sheet } from "./sheet";

// Your profile photo (src/app/api/profile-photo): a photo of you instead of the drawn face, on your
// card, in chat and on the map. The phone shrinks it to a small square first (quick to send on any
// network, and light for everyone who sees it).

const SIDE = 320;

/** The middle square of a picture, SIDE pixels across, as a JPEG. */
async function squareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("not a picture"));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIDE;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, SIDE, SIDE);
    c.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIDE, SIDE);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("no picture"))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfilePhoto({ avatar, onClose, onSaved }: { avatar: Avatar; onClose: () => void; onSaved: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Avatar>(avatar);
  const pick = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", await squareJpeg(file), "photo.jpg");
      const r = (await fetch("/api/profile-photo", { method: "POST", body: form }).then((x) => x.json())) as { ok: boolean; error?: string; photo?: string };
      if (!r.ok || !r.photo) throw new Error(r.error ?? "Couldn't save your photo. Try again.");
      setShown({ ...avatar, photo: r.photo });
      onSaved("Looking good! Your photo is your face now.");
    } catch (e) {
      setError(e instanceof Error && e.message !== "not a picture" ? e.message : "That file isn't a picture we can use. Try another.");
    }
    setBusy(false);
  };
  const drawn = async () => {
    setBusy(true);
    setError(null);
    const r = (await fetch("/api/profile-photo", { method: "DELETE" })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "The connection blinked. Try again." }))) as { ok: boolean; error?: string };
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    setShown({ ...avatar, photo: undefined });
    onSaved("Back to your drawn look.");
  };

  return (
    <Sheet onClose={onClose} title="Profile photo">
      <div className="flex flex-col items-center">
        <AvatarFace avatar={shown} size={120} className="rounded-full shadow" />
        <p className="mt-3 text-center text-sm text-muted">Use a photo of yourself instead of your drawn face. Everyone sees it on your card, in chat and on the map.</p>
        <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0] ?? undefined)} />
        <button disabled={busy} onClick={() => pick.current?.click()} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-50">
          <ImagePlus className="size-4" /> {busy ? "Saving…" : shown.photo ? "Choose another photo" : "Choose a photo"}
        </button>
        {shown.photo && (
          <button disabled={busy} onClick={() => void drawn()} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink/5 text-sm font-semibold disabled:opacity-50">
            <Palette className="size-4" /> Use my drawn look instead
          </button>
        )}
        {error && <p className="mt-2 text-center text-xs font-semibold text-hit">{error}</p>}
        <p className="mt-3 text-center text-[11px] text-muted">The middle of the photo is used, as a square. Keep it you and keep it clean: rude photos are removed.</p>
      </div>
    </Sheet>
  );
}
