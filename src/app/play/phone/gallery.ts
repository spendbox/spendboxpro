"use client";

import { useSyncExternalStore } from "react";
import { deletePhoto, listPhotos, savePhoto, type PhonePhoto } from "../phone-actions";
import type { Shot } from "./lens";

// The phone's gallery, shared by the camera (new pictures go straight in) and the Photos app.
// Signed in: pictures are saved to your account and come back wherever you play. Watching as a
// guest: they stay on this screen until you leave (download them to keep them).

export type GalleryPhoto = PhonePhoto & { saved: boolean; saving?: boolean; error?: string };

type State = { photos: GalleryPhoto[]; loaded: boolean; loading: boolean; error: string | null };

let state: State = { photos: [], loaded: false, loading: false, error: null };
const listeners = new Set<() => void>();
let localId = -1;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useGallery() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Fetch the gallery from your account (once, unless asked again). */
export async function loadGallery(force = false) {
  if (state.loading || (state.loaded && !force)) return;
  set({ loading: true, error: null });
  const res = await listPhotos().catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
  if (!res.ok) return set({ loading: false, error: res.error });
  // Pictures still saving (or only on this screen) stay at the top.
  const pending = state.photos.filter((p) => !p.saved);
  set({ loading: false, loaded: true, photos: [...pending, ...res.photos.map((p) => ({ ...p, saved: true }))] });
}

/**
 * Put a new picture in the gallery straight away, and save it to your account in the background
 * (guests keep it on this screen only). Resolves with an error message, or null when saved.
 */
export async function addShot(shot: Shot, where: { place: string | null; city: string | null }, guest: boolean): Promise<string | null> {
  const id = localId--;
  const photo: GalleryPhoto = {
    id,
    kind: shot.kind,
    place: where.place,
    city: where.city,
    width: shot.width,
    height: shot.height,
    createdAt: new Date().toISOString(),
    url: shot.url,
    saved: false,
    saving: !guest,
  };
  set({ photos: [photo, ...state.photos] });
  if (guest) return null;
  const form = new FormData();
  form.set("image", new File([shot.blob], "photo.jpg", { type: "image/jpeg" }));
  form.set("kind", shot.kind);
  if (where.place) form.set("place", where.place);
  if (where.city) form.set("city", where.city);
  form.set("width", String(shot.width));
  form.set("height", String(shot.height));
  const res = await savePhoto(form).catch(() => ({ ok: false as const, error: "The connection blinked. The picture wasn't saved." }));
  if (!res.ok) {
    set({ photos: state.photos.map((p) => (p.id === id ? { ...p, saving: false, error: res.error } : p)) });
    return res.error;
  }
  // Keep showing the picture already on screen (no flicker), but remember it's saved.
  set({ photos: state.photos.map((p) => (p.id === id ? { ...res.photo, url: p.url, saved: true } : p)) });
  return null;
}

/** Delete a picture (from your account too, if it was saved). */
export async function removePhoto(photo: GalleryPhoto): Promise<string | null> {
  if (photo.saved) {
    const res = await deletePhoto(photo.id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    if (!res.ok) return res.error;
  }
  if (photo.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
  set({ photos: state.photos.filter((p) => p.id !== photo.id) });
  return null;
}

/** A file name like "newtown-lagos-bay-2026-10-10-1432.jpg". */
export function fileName(p: GalleryPhoto) {
  const d = new Date(p.createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const town = (p.city ?? "newtown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `newtown-${town}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

const files = new Map<string, Promise<File>>();

/**
 * The picture as a file. The viewer asks for it as soon as a picture opens, so that tapping
 * Share can open the share menu straight away (phones only allow that right after a tap).
 */
export function asFile(p: GalleryPhoto): Promise<File> {
  let f = files.get(p.url);
  if (!f) {
    f = fetch(p.url)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.blob();
      })
      .then((blob) => new File([blob], fileName(p), { type: "image/jpeg" }));
    f.catch(() => files.delete(p.url));
    files.set(p.url, f);
  }
  return f;
}

/** Save the picture to this device. */
export async function downloadPhoto(p: GalleryPhoto): Promise<boolean> {
  try {
    const file = await asFile(p);
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share with the phone's own share menu (WhatsApp, Instagram…), using the file the viewer got
 * ready. Falls back to downloading where sharing pictures isn't possible.
 */
export async function sharePhoto(p: GalleryPhoto, ready: File | null): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const file = ready ?? (await asFile(p));
    const data = { files: [file], title: "My Newtown picture", text: p.place ? `${p.place}${p.city ? `, ${p.city}` : ""} · Newtown` : "Newtown" };
    if (typeof navigator.canShare === "function" && navigator.canShare(data)) {
      await navigator.share(data);
      return "shared";
    }
  } catch (e) {
    // Closing the share menu isn't a failure.
    if (e instanceof DOMException && e.name === "AbortError") return "shared";
  }
  return (await downloadPhoto(p)) ? "downloaded" : "failed";
}
