"use client";

// Last line of defence: if even the page frame fails, offer a reload (and reload by itself
// when a new version of the app was just released).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  if (typeof window !== "undefined" && /ChunkLoadError|Loading chunk|dynamically imported module/i.test(`${error.name} ${error.message}`)) {
    window.location.reload();
  }
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#eef2f6" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 20 }}>One moment…</p>
          <p style={{ color: "#64707d" }}>Something hiccuped.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, border: 0, background: "#ffc53d", fontWeight: 600 }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
