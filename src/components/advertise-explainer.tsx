"use client";

import Link from "next/link";

// A short "advertise here" explainer for the game's Advertise button and empty billboards.
// It renders only its content: put it inside your own sheet or modal.
// (The numbers are the defaults in game_settings; /advertise always shows the live ones.)

const STEPS = [
  { icon: "💳", title: "Pay", text: "From ₦5,000 a week" },
  { icon: "🖼️", title: "Upload", text: "Picture, headline, link" },
  { icon: "🚀", title: "Live", text: "On billboards in minutes" },
];

export function AdvertiseExplainer({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gold via-[#ffd76e] to-[#ffb020] p-4 text-ink">
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">Advertise on Hide &amp; Seek</p>
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight">Your brand on every billboard in the city</h2>
        <p className="mt-1 text-sm opacity-80">Players get coins for tapping your ad, so they actually look.</p>
        <div aria-hidden className="pointer-events-none absolute -bottom-3 -right-2 text-6xl opacity-25">
          🪧
        </div>
      </div>

      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-xl bg-panel-2 p-2.5 text-center">
            <div className="text-xl">{s.icon}</div>
            <div className="mt-0.5 text-sm font-bold">
              {i + 1}. {s.title}
            </div>
            <div className="text-[11px] leading-tight text-muted">{s.text}</div>
          </li>
        ))}
      </ol>

      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex gap-2">
          <span aria-hidden>🪙</span>
          <span>
            Your budget becomes a pool of coins (₦5 = 1 coin). Each player who taps your ad gets <b>5 coins</b> from it, so you pay
            only for real people looking.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden>👀</span>
          <span>People watching without an account can tap your ad too: free for you.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden>⏳</span>
          <span>Run it for 1 to 8 weeks. Unused coins at the end of your run expire.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden>📊</span>
          <span>No game account needed. Track taps and clicks, change your ad, pause or top up any time.</span>
        </li>
      </ul>

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
          Not now
        </button>
        <Link href="/advertise" className="flex-1 rounded-xl bg-gold py-2.5 text-center font-semibold text-ink">
          Create my ad
        </Link>
      </div>
      <p className="-mt-1 text-center text-[11px] text-muted">
        Already advertising?{" "}
        <Link href="/advertiser" className="underline">
          Manage your ad
        </Link>
      </p>
    </div>
  );
}
