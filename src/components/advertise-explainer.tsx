"use client";

import Link from "next/link";
import { Building2, ChartColumn, CreditCard, Hourglass, ImageUp, MapPin, Megaphone, Rocket, type LucideIcon } from "@/components/icons";

// A short "advertise here" explainer for empty billboards: advertising is leasing a building.
// It renders only its content: put it inside your own sheet or modal.
// (The numbers are the defaults in game_settings; /advertise always shows the live ones.)

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MapPin, title: "Choose", text: "Billboards, or a building" },
  { icon: CreditCard, title: "Pay", text: "Billboards from ₦5,000 a week" },
  { icon: Rocket, title: "Live", text: "Your building and billboards" },
];

const POINTS: { icon: LucideIcon; text: React.ReactNode }[] = [
  { icon: ImageUp, text: "Billboard ads on their own: your picture on the city's billboards, from ₦5,000 a week, for 1 to 8 weeks." },
  { icon: Building2, text: "Or a building of your own, by the month: your name and logo on it, lit up for every player, a card saying what you do and how to reach you, and your design on the billboards too." },
  { icon: ImageUp, text: "Swap your billboard design any time, free." },
  { icon: Hourglass, text: "A building runs for the months you pay for (add more any time), or until it has been tapped as many times as your lease covers (one tap for every ₦20)." },
  { icon: ChartColumn, text: "No game account needed. See taps, calls, WhatsApp messages and directions from your business page." },
];

export function AdvertiseExplainer({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gold via-[#ffd76e] to-[#ffb020] p-4 text-ink">
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">Advertise on Newtown</p>
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight">Billboards across Lagos, or a building of your own</h2>
        <p className="mt-1 text-sm opacity-80">Billboard ads by the week, or a building by the month with the billboards included.</p>
        <Megaphone aria-hidden className="pointer-events-none absolute -bottom-3 -right-2 size-20 -rotate-12 opacity-20" strokeWidth={1.75} />
      </div>

      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col items-center rounded-xl bg-panel-2 p-2.5 text-center">
            <span className="grid size-9 place-items-center rounded-full bg-gold/25 text-gold-dark">
              <s.icon className="size-5" />
            </span>
            <div className="mt-1 text-sm font-bold">
              {i + 1}. {s.title}
            </div>
            <div className="text-[11px] leading-tight text-muted">{s.text}</div>
          </li>
        ))}
      </ol>

      <ul className="flex flex-col gap-2 text-sm">
        {POINTS.map((p, i) => (
          <li key={i} className="flex gap-2">
            <p.icon className="mt-0.5 size-4 shrink-0 text-gold-dark" />
            <span>{p.text}</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
          Not now
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            window.dispatchEvent(new CustomEvent("nt-advertise", { detail: { building: null } }));
          }}
          className="flex-1 rounded-xl bg-gold py-2.5 text-center font-semibold text-ink"
        >
          Choose a building
        </button>
      </div>
      <p className="-mt-1 text-center text-[11px] text-muted">
        Already leasing?{" "}
        <Link href="/advertiser" className="underline">
          Your business page
        </Link>
      </p>
    </div>
  );
}
