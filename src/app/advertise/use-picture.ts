"use client";

import { useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024;
/** Bigger than this, a picture is shrunk in the browser first (a logo and a billboard must fit one upload). */
const SHRINK_OVER = 900 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A big photo made smaller (at most 1,600 px across, JPEG), or the photo itself if that fails. */
async function shrink(f: File): Promise<File> {
  if (f.size <= SHRINK_OVER) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

/** Picks a picture, checks it, shrinks a big one, and gives a local preview address. */
export function usePicture() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function pick(f: File | null | undefined) {
    setError(null);
    if (url) URL.revokeObjectURL(url);
    setFile(null);
    setUrl(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Please choose a JPG, PNG or WebP picture.");
    const small = await shrink(f);
    if (small.size > MAX_BYTES) return setError("That picture is over 2 MB. Please use a smaller one.");
    setFile(small);
    setUrl(URL.createObjectURL(small));
  }
  return { file, url, error, pick };
}

export const fileInputClass =
  "text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:font-semibold";
