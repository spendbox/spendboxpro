"use client";

import { Box, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { prepareCutoutUpload, saveProductCutout } from "@/app/dashboard/[bizId]/product-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { makeCutout } from "./cutout";
import { CHECKER } from "./cutout-preview";
import { uploadToSignedUrl } from "./media";

/** A product photo's 3D cutout for the shop: see it, make it, or take it away. */
export function CutoutCard({ bizId, productId, mediaUrl, cutoutUrl }: { bizId: string; productId: string; mediaUrl: string; cutoutUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(cutoutUrl);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setNote(null);
    try {
      const cut = await makeCutout(mediaUrl);
      if (!cut) throw new Error("The background is too busy to remove. A photo on a plain background works best.");
      const t = await prepareCutoutUpload(bizId, productId);
      if (!t.ok) throw new Error(t.error);
      await uploadToSignedUrl(t.ticket.signedUrl, new File([cut.blob], "cutout.png", { type: "image/png" }));
      const r = await saveProductCutout(bizId, productId, t.ticket.path);
      if (!r.ok) throw new Error(r.error);
      setUrl(URL.createObjectURL(cut.blob));
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    const r = await saveProductCutout(bizId, productId, null);
    setBusy(false);
    if (r.ok) {
      setUrl(null);
      router.refresh();
    } else setNote(r.error);
  };

  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={cn("flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-line", CHECKER)}>
        {busy ? (
          <LoaderCircle className="size-5 animate-spin text-muted" aria-hidden />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- the cutout
          <img src={url} alt="The 3D cutout" className="size-full object-contain" />
        ) : (
          <Box className="size-5 text-muted" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">3D cutout</p>
        <p className="text-sm text-muted">{note ?? (url ? "It stands in your 3D shop as a 3D figure, without the background." : "Remove the background so it stands in your 3D shop as a 3D figure.")}</p>
      </div>
      {url ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void remove()}>
          Remove
        </Button>
      ) : (
        <Button size="sm" disabled={busy} onClick={() => void make()}>
          Make it
        </Button>
      )}
    </Card>
  );
}
