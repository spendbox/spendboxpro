"use client";

import { Box, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { makeCutout } from "./cutout";

export type CutoutState = { status: "working" } | { status: "ready"; file: File; url: string } | { status: "failed" } | null;

/** Cuts a photo out of its background in the background, for the 3D shop. */
export function useCutout(file: File | null): CutoutState {
  const [state, setState] = useState<{ for: File; value: CutoutState } | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return;
    let alive = true;
    let url: string | null = null;
    makeCutout(file)
      .then((c) => {
        if (!alive) return;
        if (!c) return setState({ for: file, value: { status: "failed" } });
        const cut = new File([c.blob], "cutout.png", { type: "image/png" });
        url = URL.createObjectURL(cut);
        setState({ for: file, value: { status: "ready", file: cut, url } });
      })
      .catch(() => alive && setState({ for: file, value: { status: "failed" } }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  if (!file || !file.type.startsWith("image/")) return null;
  return state?.for === file ? state.value : { status: "working" };
}

/** A see-through checkerboard, so the cutout's edges show. */
export const CHECKER = "bg-[repeating-conic-gradient(#e7e3dc_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]";

/** The cutout next to a switch to use it in the 3D shop. */
export function CutoutChoice({ state, on, onChange, compact = false }: { state: CutoutState; on: boolean; onChange: (on: boolean) => void; compact?: boolean }) {
  if (!state) return null;
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-canvas p-3", compact && "p-2")}>
      <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-line", CHECKER, compact ? "size-12" : "size-16")}>
        {state.status === "working" && <LoaderCircle className="size-5 animate-spin text-muted" aria-hidden />}
        {state.status === "ready" && (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview
          <img src={state.url} alt="The 3D cutout" className="size-full object-contain" />
        )}
        {state.status === "failed" && <Box className="size-5 text-muted" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">3D cutout</span>
        <span className="block text-xs text-muted">
          {state.status === "working"
            ? "Removing the background…"
            : state.status === "ready"
              ? "Stands in your 3D shop as a 3D figure, without the background."
              : "The background is too busy to remove. It shows as a photo in your 3D shop; a plain background works best."}
        </span>
      </span>
      {state.status === "ready" && <Switch checked={on} label="Use the 3D cutout" onChange={onChange} />}
    </div>
  );
}
