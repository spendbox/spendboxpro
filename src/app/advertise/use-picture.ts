"use client";

import { useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Picks a picture, checks it, and gives a local preview address. */
export function usePicture() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function pick(f: File | null | undefined) {
    setError(null);
    if (url) URL.revokeObjectURL(url);
    setFile(null);
    setUrl(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Please choose a JPG, PNG or WebP picture.");
    if (f.size > MAX_BYTES) return setError("That picture is over 2 MB. Please use a smaller one.");
    setFile(f);
    setUrl(URL.createObjectURL(f));
  }
  return { file, url, error, pick };
}

export const fileInputClass =
  "text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:font-semibold";
