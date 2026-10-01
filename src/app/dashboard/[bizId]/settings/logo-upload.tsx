"use client";

import { ImagePlus, LoaderCircle, Trash } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { removeLogo, uploadLogo } from "../actions";

/** Squares and shrinks the chosen image to 512×512 before upload. */
async function squareLogo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = 512;
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not read that image.");
  return blob;
}

export function LogoUpload({
  bizId,
  name,
  color,
  logoUrl,
}: {
  bizId: string;
  name: string;
  color: string;
  logoUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: boolean; text: string } | null>(null);

  function choose(file: File) {
    setMessage(null);
    startTransition(async () => {
      try {
        const blob = await squareLogo(file);
        const data = new FormData();
        data.append("logo", blob, "logo.png");
        const result = await uploadLogo(bizId, data);
        setMessage(result.error ? { text: result.error } : { ok: true, text: result.message ?? "Logo updated." });
      } catch {
        setMessage({ text: "We can't open that image. Please use a PNG or JPG." });
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <BusinessAvatar name={name} color={color} logoUrl={logoUrl} size="lg" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {logoUrl ? "Change logo" : "Upload logo"}
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              disabled={pending}
              className="text-red-700"
              onClick={() => startTransition(async () => void (await removeLogo(bizId)))}
            >
              <Trash className="size-4" aria-hidden /> Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted">Square images work best. Shown on your join page and in your customers&apos; Spendbox.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Choose a logo image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) choose(file);
        }}
      />
      {message && <FormMessage tone={message.ok ? "success" : "error"}>{message.text}</FormMessage>}
    </div>
  );
}
