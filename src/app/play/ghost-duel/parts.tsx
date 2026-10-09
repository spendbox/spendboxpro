"use client";

import { Hand, HandMetal, Scissors } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RpsMove } from "@/lib/ghost-duels";

// Little pieces shared by the ghost duel screens.

export const MOVE_INFO: Record<RpsMove, { label: string; Icon: typeof Hand }> = {
  rock: { label: "Rock", Icon: HandMetal },
  paper: { label: "Paper", Icon: Hand },
  scissors: { label: "Scissors", Icon: Scissors },
};

/** What a ghost's light looks like: blue (free), orange (in a duel), gold (golden), grey (out). */
export const GLOW: Record<"free" | "playing" | "golden" | "out", { ring: string; chip: string; label: string }> = {
  free: { ring: "#1c7ed6", chip: "bg-[#e7f5ff] text-[#1864ab]", label: "Free to challenge" },
  playing: { ring: "#e8590c", chip: "bg-[#fff4e6] text-[#d9480f]", label: "In a duel" },
  golden: { ring: "#e8a800", chip: "bg-[#fff9db] text-[#a37500]", label: "Golden" },
  out: { ring: "#868e96", chip: "bg-panel-2 text-muted", label: "Out" },
};

/** n of max as dots (wins in gold, losses in red). */
export function Dots({ n, max, tone }: { n: number; max: number; tone: "win" | "loss" }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${n} of ${max}`}>
      {Array.from({ length: Math.max(max, n) }, (_, k) => (
        <span
          key={k}
          className={cn(
            "size-2.5 rounded-full",
            k < n ? (tone === "win" ? "bg-[#f59f00]" : "bg-hit") : "bg-ink/15",
          )}
        />
      ))}
    </span>
  );
}

/** A server time (ISO) on this device's clock, given the server's "now" when it was read. Call it
 * where the duel arrives (an effect or a handler), never during render. */
export function localTime(iso: string | null, serverNow: string, receivedAt: number) {
  if (!iso) return null;
  const skew = Date.parse(serverNow) - receivedAt;
  return Date.parse(iso) - (Number.isFinite(skew) ? skew : 0);
}
