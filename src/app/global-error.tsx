"use client";

import { useEffect } from "react";

// Last line of defence: if even the page frame fails, it tells the server (so it's in the logs)
// and loads the page afresh by itself once (not over and over), with a button to try again.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    try {
      navigator.sendBeacon?.(
        "/api/client-error",
        new Blob([JSON.stringify({ where: "Global", name: error?.name, message: String(error?.message ?? "").slice(0, 500), digest: error?.digest, url: location.pathname, online: navigator.onLine })], { type: "application/json" }),
      );
      const last = Number(sessionStorage.getItem("nt-global-reload") ?? 0);
      if (Date.now() - last > 120_000) {
        sessionStorage.setItem("nt-global-reload", String(Date.now()));
        const t = setTimeout(() => window.location.reload(), navigator.onLine ? 2500 : 0);
        if (!navigator.onLine) window.addEventListener("online", () => window.location.reload(), { once: true });
        return () => clearTimeout(t);
      }
    } catch {
      // Nothing more to do: the button still works.
    }
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#eef2f6" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 20 }}>Reconnecting to the city…</p>
          <p style={{ color: "#64707d" }}>The connection blinked. We&apos;re getting you back in.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, border: 0, background: "#ffc53d", fontWeight: 600 }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
