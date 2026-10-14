"use client";

import { Globe, House, MapPin, MessageCircle, Phone } from "@/components/icons";
import type { BusinessHit, MapBusiness } from "@/lib/world/business";
import { Sheet } from "../sheet";

const digits = (p: string) => p.replace(/[^\d+]/g, "");
/** A Nigerian number for WhatsApp links: 080... becomes 23480... */
const waNumber = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.startsWith("0") ? `234${d.slice(1)}` : d;
};

/** A real business on the map: what they do, where they really are, and how to reach them. */
export function BusinessSheet({ b, onHit, onClose, onHomes }: { b: MapBusiness; onHit: (kind: BusinessHit) => void; onClose: () => void; onHomes?: () => void }) {
  const btn = "flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold";
  return (
    <Sheet onClose={onClose} title={<span className="truncate">{b.name}</span>}>
      <div className="flex items-start gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gold/15 ring-2 ring-gold/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.logo ? <img src={b.logo} alt="" className="size-full object-contain" /> : <span className="font-display text-2xl font-extrabold text-gold-dark">{b.name[0]}</span>}
        </div>
        <div className="min-w-0">
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-dark">{b.category}</span>
          <p className="mt-1.5 text-sm">{b.about}</p>
        </div>
      </div>
      <p className="mt-4 flex items-start gap-1.5 rounded-2xl bg-ink/[0.04] p-3 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
        <span>
          <span className="block text-[11px] text-muted">Their real address</span>
          {b.address}
        </span>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {b.phone && (
          <a href={`tel:${digits(b.phone)}`} onClick={() => onHit("call")} className={`${btn} bg-ink text-white`}>
            <Phone className="size-4" /> Call
          </a>
        )}
        {b.whatsapp && (
          <a href={`https://wa.me/${waNumber(b.whatsapp)}`} target="_blank" rel="noreferrer" onClick={() => onHit("whatsapp")} className={`${btn} bg-[#25d366] text-white`}>
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        )}
        {b.website && (
          <a href={b.website} target="_blank" rel="noreferrer noopener" onClick={() => onHit("website")} className={`${btn} bg-ink/5`}>
            <Globe className="size-4" /> Website
          </a>
        )}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => onHit("directions")}
          className={`${btn} bg-ink/5`}
        >
          <MapPin className="size-4" /> Directions
        </a>
      </div>
      {onHomes && (
        <button onClick={onHomes} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-[#ebfbee] px-3 py-2.5 text-left text-sm">
          <House className="size-5 shrink-0 text-[#2b8a3e]" />
          <span className="min-w-0 flex-1">
            <b className="block">Homes in this building</b>
            <span className="block text-xs text-muted">People still live here. See the homes, buy one or move in.</span>
          </span>
        </button>
      )}
      <p className="mt-4 text-center text-[11px] text-muted">A real business with a building in Newtown. Anything you arrange with them happens outside the game.</p>
    </Sheet>
  );
}
