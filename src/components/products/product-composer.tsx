"use client";

import { Camera, Check, ImagePlus, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createProduct, prepareProductUpload } from "@/app/dashboard/[bizId]/product-actions";
import { Button, buttonClass } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { formatMoney } from "@/lib/format";
import { CutoutChoice, useCutout } from "./cutout-preview";
import { prepareMedia, shareText, shareToStatus, uploadToSignedUrl, type PreparedMedia } from "./media";
import { ProductFields, type ProductFieldValues } from "./product-fields";

const EMPTY: ProductFieldValues = { kind: "product", title: "", description: "", price: "" };

/** Add a product or service: photo or video, a few words, then share it to a WhatsApp status. */
export function ProductComposer({ bizId, businessName, joinUrl }: { bizId: string; businessName: string; joinUrl: string }) {
  const [media, setMedia] = useState<PreparedMedia | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cutout = useCutout(media?.type === "image" ? media.file : null);
  const [useCut, setUseCut] = useState(true);
  const cutFile = useCut && cutout?.status === "ready" ? cutout.file : null;

  useEffect(() => () => {
    if (media) URL.revokeObjectURL(media.previewUrl);
  }, [media]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      setMedia(await prepareMedia(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    if (!media) return setError("Add a photo or a short video first.");
    if (values.title.trim().length < 2) return setError("Please give it a name.");
    setError(null);
    setProgress(0);
    try {
      const ticket = await prepareProductUpload(bizId, media.type, media.file.type, Boolean(cutFile));
      if (!ticket.ok) throw new Error(ticket.error);
      const posterShare = ticket.poster && media.poster ? 0.1 : 0;
      await uploadToSignedUrl(ticket.media.signedUrl, media.file, (f) => setProgress(f * (1 - posterShare) * 0.95));
      if (ticket.poster && media.poster) await uploadToSignedUrl(ticket.poster.signedUrl, media.poster, (f) => setProgress(0.85 + f * 0.1));
      // The cutout is a nice extra: if it doesn't upload, the product still goes up.
      const cutoutOk = ticket.cutout && cutFile ? await uploadToSignedUrl(ticket.cutout.signedUrl, cutFile).then(() => true, () => false) : false;
      const result = await createProduct(bizId, {
        ...values,
        mediaType: media.type,
        mediaPath: ticket.media.path,
        posterPath: ticket.poster && media.poster ? ticket.poster.path : null,
        cutoutPath: cutoutOk && ticket.cutout ? ticket.cutout.path : null,
      });
      if (!result.ok) throw new Error(result.error);
      setProgress(1);
      setSaved({ id: result.id });
    } catch (e) {
      setError((e as Error).message || "Something went wrong. Please try again.");
      setProgress(null);
    }
  }

  const price = values.price ? formatMoney(Number(values.price)) : null;
  const text = shareText(values.title.trim(), price, businessName, joinUrl);

  async function share() {
    const how = await shareToStatus({ file: media?.file, text });
    setShareNote(how === "whatsapp" ? "WhatsApp opened with the words and your link. To post it on your status, add the photo or video from your gallery." : null);
  }

  if (saved && media) {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift">
          <Check className="size-7" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold">It&apos;s live</h2>
          <p className="mt-1 text-muted">Your customers and your partners&apos; customers can see it now.</p>
        </div>
        <MediaPreview media={media} className="w-48" />
        <Button size="lg" block onClick={() => void share()} className="max-w-sm bg-[#107A42] hover:bg-[#0c6536]">
          <WhatsAppIcon className="size-5" /> Share to WhatsApp status
        </Button>
        {shareNote && <p className="max-w-sm text-sm text-muted">{shareNote}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={buttonClass({ variant: "secondary" })}
            onClick={() => {
              setSaved(null);
              setMedia(null);
              setValues(EMPTY);
              setProgress(null);
              setShareNote(null);
            }}
          >
            <Plus className="size-4" aria-hidden /> Add another
          </button>
          <Link href={`/dashboard/${bizId}`} className={buttonClass({ variant: "ghost" })}>
            Done
          </Link>
        </div>
      </div>
    );
  }

  const busy = progress !== null;
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        ref={fileInput}
        id="product-media"
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        className="hidden"
        aria-label="Photo or video"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {media ? (
        <div className="flex items-end gap-4">
          <MediaPreview media={media} className="w-40 sm:w-48" />
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            <RefreshCw className="size-4" aria-hidden /> Change
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={reading}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line-strong bg-white/60 text-center transition hover:border-brand-600 hover:bg-brand-50 sm:aspect-[16/7]"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
            {reading ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <ImagePlus className="size-6" aria-hidden />}
          </span>
          <span className="font-display text-lg font-bold">{reading ? "Getting it ready…" : "Add a photo or video"}</span>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Camera className="size-4" aria-hidden /> Videos up to 60 seconds
          </span>
        </button>
      )}

      <CutoutChoice state={cutout} on={useCut} onChange={setUseCut} />

      <ProductFields values={values} onChange={setValues} />

      <Link href={`/dashboard/${bizId}/products/bulk`} className="-mt-2 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">
        Got lots to add? Add many at once
      </Link>

      {error && <FormMessage>{error}</FormMessage>}

      {busy ? (
        <div className="flex flex-col gap-2" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
          <p className="text-sm text-muted">Uploading… {Math.round((progress ?? 0) * 100)}%</p>
        </div>
      ) : (
        <Button type="submit" size="lg" block disabled={reading}>
          Post it
        </Button>
      )}
    </form>
  );
}

function MediaPreview({ media, className }: { media: PreparedMedia; className?: string }) {
  return (
    <span className={`relative block aspect-[4/5] overflow-hidden rounded-3xl bg-ink shadow-card ${className ?? ""}`}>
      {media.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview
        <img src={media.previewUrl} alt="Your photo" className="size-full object-cover" />
      ) : (
        <video src={media.previewUrl} muted playsInline loop autoPlay className="size-full object-cover" aria-label="Your video" />
      )}
    </span>
  );
}
