"use client";

import { useEffect, useEffectEvent } from "react";

// Escape closes whatever is on top: a badge's pop-up first, then the sheet under it, then the
// menu. Each open layer adds itself to this stack; one key listener serves them all.
const layers: (() => void)[] = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || layers.length === 0) return;
  e.preventDefault();
  layers[layers.length - 1]();
}

/** Calls `onEscape` when Escape is pressed while this is the top-most open layer. */
export function useEscape(onEscape: () => void, active = true) {
  const fire = useEffectEvent(onEscape);
  useEffect(() => {
    if (!active) return;
    const layer = () => fire();
    layers.push(layer);
    if (layers.length === 1) window.addEventListener("keydown", onKey);
    return () => {
      const i = layers.lastIndexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (layers.length === 0) window.removeEventListener("keydown", onKey);
    };
  }, [active]);
}
