"use client";

import { useState, useSyncExternalStore } from "react";

// Pop-ups stack in the order they open: whatever opened last is on top (a player's card over
// the messages, a photo over the card it came from). Each takes the next number when it opens.
// Everything here sits above the game's own buttons and toasts (which stay under 100).

let top = 100;

/** The stacking order for something that's just opened (or opens again: pass `open`). */
export function useTopLayer(open = true) {
  const [layer, setLayer] = useState({ open, z: open ? ++top : 0 });
  if (layer.open !== open) {
    const next = { open, z: open ? ++top : layer.z };
    setLayer(next);
    return next.z;
  }
  return layer.z;
}

const noSubscribe = () => () => {};
/** True once we're on the phone (never while the page is first drawn on the server). */
export function useOnClient() {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
