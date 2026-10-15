"use client";

import { useEffect, useRef } from "react";

// The robot check on sign-up (Cloudflare Turnstile; src/lib/turnstile.ts checks the token). Shows
// nothing for most people and a tick box when Cloudflare isn't sure. Without
// NEXT_PUBLIC_TURNSTILE_SITE_KEY it isn't drawn at all (and the server doesn't ask for it).

export const ROBOT_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;
function load() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("robot check didn't load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The check itself: onToken gets a fresh token (or null when it runs out). Change `round` to get
 * a new one (a token works once).
 */
export function RobotCheck({ onToken, round = 0 }: { onToken: (token: string | null) => void; round?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const said = useRef(onToken);
  useEffect(() => {
    said.current = onToken;
  });
  useEffect(() => {
    if (!ROBOT_SITE_KEY || !box.current) return;
    let id: string | null = null;
    let gone = false;
    load()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: ROBOT_SITE_KEY,
          appearance: "interaction-only",
          "refresh-expired": "auto",
          callback: (t: string) => said.current(t),
          "expired-callback": () => said.current(null),
          "error-callback": () => said.current(null),
        });
      })
      .catch(() => said.current(null));
    return () => {
      gone = true;
      said.current(null);
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [round]);
  if (!ROBOT_SITE_KEY) return null;
  return <div ref={box} className="empty:hidden" />;
}
