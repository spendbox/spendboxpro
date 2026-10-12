"use client";

import { useEffect } from "react";

// On the game screen only the map zooms (it handles its own pinch). A pinch on a pop-up, a menu
// or a button must not zoom the whole page and leave the buttons half off the screen. So while the
// game is open: the page can't be zoomed (viewport), pinches on anything but the map are ignored
// (touch-action, and Safari's own gesture events), and double-tap zoom is off. Put back on leave.

export function useNoPageZoom() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.content ?? null;
    if (meta && !/maximum-scale/.test(meta.content)) meta.content = `${meta.content}, maximum-scale=1, user-scalable=no`;
    const html = document.documentElement;
    const touch = html.style.touchAction;
    // Scrolling still works everywhere; pinch-zoom only where an element allows it (the map's canvas).
    html.style.touchAction = "pan-x pan-y";
    // Safari: its pinch is a "gesture" event on the page.
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    // Two fingers on anything but the map: not a page zoom.
    const pinch = (e: TouchEvent) => {
      if (e.touches.length > 1 && !(e.target instanceof HTMLCanvasElement)) e.preventDefault();
    };
    document.addEventListener("touchmove", pinch, { passive: false });
    // Computers: Ctrl + scroll over the buttons zooms the page; only the map should zoom.
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey && !(e.target instanceof HTMLCanvasElement)) e.preventDefault();
    };
    window.addEventListener("wheel", wheel, { passive: false });
    return () => {
      if (meta && before !== null) meta.content = before;
      html.style.touchAction = touch;
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", pinch);
      window.removeEventListener("wheel", wheel);
    };
  }, []);
}
