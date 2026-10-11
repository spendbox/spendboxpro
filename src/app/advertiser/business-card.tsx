"use client";

import { useState } from "react";
import type { MyBusiness } from "@/lib/business";
import { BUSINESS_KINDS, STOREY_AFTER_DAYS, upgradePrice, UPGRADES } from "@/lib/world/business";
import { checkoutUpgrade } from "../business/actions";

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

      {live && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Upgrades</p>
          <p className="text-xs text-muted">Any upgrade also puts your business on the city&apos;s billboards for the rest of your lease.</p>
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
