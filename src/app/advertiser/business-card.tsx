"use client";

import { useState } from "react";
import type { MyBusiness } from "@/lib/business";
import { BUSINESS_KINDS, STOREY_AFTER_DAYS, upgradePrice, UPGRADES } from "@/lib/world/business";
import { changeBillboard, checkoutUpgrade } from "../business/actions";

const fmt = (n: number) => Math.round(n).toLocaleString("en-NG");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) : "");

const NUMBERS: [string, string][] = [
  ["tap", "Building taps"],
  ["view", "Card views"],
  ["billboard", "Billboard views"],
  ["call", "Calls"],
  ["whatsapp", "WhatsApp"],
  ["website", "Website visits"],
  ["directions", "Directions"],
];

/** A leased building: how it's doing (all time and this week) and its upgrades. */
export function BusinessCard({ b }: { b: MyBusiness }) {
  const [kind, setKind] = useState(BUSINESS_KINDS[0].kind as string);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = b.status === "live";
  const lease = b.priceKobo / 100;
  const [now] = useState(() => Date.now());
  const monthIn = !!b.startsAt && now - Date.parse(b.startsAt) > STOREY_AFTER_DAYS * 86_400_000;

  async function buy(upgrade: string) {
    setBusy(upgrade);
    setError(null);
    const res = await checkoutUpgrade(b.id, upgrade, upgrade === "rebuild" ? kind : null);
    if (res.ok) return window.location.assign(res.url);
    setError(res.error);
    setBusy(null);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-panel-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.logo ? <img src={b.logo} alt="" className="size-full object-contain" /> : <span className="font-display text-xl font-bold">{b.name[0]}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{b.name}</p>
          <p className="text-sm text-muted">
            {b.category} · {live ? `Live until ${day(b.endsAt)}` : b.status === "ended" ? "Lease ended" : "Taken down"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NUMBERS.map(([k, label]) => (
          <div key={k} className="rounded-xl bg-panel-2 px-3 py-2">
            <p className="text-xs text-muted">{label}</p>
            <p className="font-display text-xl font-bold tabular-nums">{fmt(b.hits[k] ?? 0)}</p>
            <p className="text-[11px] text-muted">{fmt(b.week[k] ?? 0)} this week</p>
          </div>
        ))}
      </div>

      {b.clickCap !== null && (
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">Taps used</span>
            <span className="tabular-nums text-muted">
              {fmt(b.clicks)} of {fmt(b.clickCap)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (b.clicks / Math.max(1, b.clickCap)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">Your lease runs until {day(b.endsAt)}, or until these taps are used up, whichever comes first.</p>
        </div>
      )}

      {live && <BillboardDesign b={b} />}

      {live && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Upgrades</p>
          {UPGRADES.map((u) => {
            const done = u.id === "bright" && b.glow >= 2;
            const wait = u.id === "storey" && !monthIn;
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-panel-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{u.label}</p>
                  <p className="text-xs text-muted">{u.what}</p>
                  {u.id === "rebuild" && (
                    <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-2 rounded-lg border border-line bg-panel px-2 py-1 text-sm">
                      {BUSINESS_KINDS.map((k) => (
                        <option key={k.kind} value={k.kind}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  disabled={!!busy || done || wait}
                  onClick={() => void buy(u.id)}
                  className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                >
                  {done ? "Done" : wait ? `From day ${STOREY_AFTER_DAYS}` : busy === u.id ? "Opening…" : `₦${fmt(upgradePrice(u.id, lease))}`}
                </button>
              </div>
            );
          })}
          {error && <p className="text-sm text-hit">{error}</p>}
        </div>
      )}
    </section>
  );
}

/** Your design on the city's billboards: shown here, and swapped for a new picture any time, free. */
function BillboardDesign({ b }: { b: MyBusiness }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNote(null);
        const res = await changeBillboard(b.id, new FormData(e.currentTarget));
        setBusy(false);
        setNote(res.ok ? { ok: true, text: "New design saved. It's on the billboards in a few minutes." } : { ok: false, text: res.error });
      }}
    >
      <p className="text-sm font-semibold">Your billboard</p>
      {b.billboardImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.billboardImage} alt="Your billboard design" className="aspect-[2/1] w-full rounded-xl bg-panel-2 object-cover" />
      )}
      <p className="text-xs text-muted">A wide picture works best (2:1, under 2 MB, JPG, PNG or WebP). Change it as often as you like, free.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="min-w-0 flex-1 text-sm" />
        <button disabled={busy} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "Saving…" : "Use this design"}
        </button>
      </div>
      {note && <p className={`text-sm ${note.ok ? "text-me" : "text-hit"}`}>{note.text}</p>}
    </form>
  );
}
