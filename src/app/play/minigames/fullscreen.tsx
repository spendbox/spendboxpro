"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/cn";

// A game that fills the whole screen (the shooting range, paintball, chess and draughts): over
// everything else, edge to edge, with a button to quit and one for the browser's own full screen
// (no address bar). Drawn on <body>, so a sheet's own layout can't box it in.

export function FullScreen({ children, onQuit, quitLabel = "Leave the game", className }: { children: React.ReactNode; onQuit: () => void; quitLabel?: string; className?: string }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [native, setNative] = useState(false);
  useEffect(() => {
    setHost(document.body);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onChange = () => setNative(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.body.style.overflow = was;
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  if (!host) return null;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return createPortal(
    <div
      className={cn("fixed inset-0 z-[300] flex flex-col overflow-hidden bg-black text-white", className)}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      {children}
      <div className="pointer-events-none absolute right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 flex gap-1.5">
        <button onPointerDown={(e) => e.stopPropagation()} onClick={toggle} className="pointer-events-auto grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm" aria-label={native ? "Exit full screen" : "Full screen"}>
          {native ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onQuit} className="pointer-events-auto grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm" aria-label={quitLabel} title={quitLabel}>
          <X className="size-5" />
        </button>
      </div>
    </div>,
    host,
  );
}
