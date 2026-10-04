"use client";

import { Check, Clock, Mail, MapPin, Phone } from "lucide-react";
import { useState, useTransition } from "react";
import { reachOut } from "@/app/dashboard/[bizId]/actions";
import { PersonAvatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/format";
import type { BusinessRequestRow } from "@/lib/types";

type Method = "whatsapp" | "call" | "email";
const DONE_TEXT: Record<Method, string> = { whatsapp: "You reached out on WhatsApp", call: "You called", email: "You emailed" };

/** A customer's request as a business sees it, with one-tap ways to reach out. */
export function BusinessRequestCard({
  bizId,
  businessName,
  request: r,
  budget,
  timeLeft,
  ago,
}: {
  bizId: string;
  businessName: string;
  request: BusinessRequestRow;
  budget: string;
  timeLeft: string;
  ago: string;
}) {
  const [done, setDone] = useState<Method | null>(r.reached_out);
  const [, start] = useTransition();
  const log = (method: Method) => {
    setDone(method);
    start(async () => {
      await reachOut(bizId, r.id, method);
    });
  };
  const short = r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body;
  const greeting = `Hi ${r.customer_name}, this is ${businessName} on Spendbox. I saw your request: "${short}". I can help with this.`;
  const others = r.reach_outs - (r.reached_out ? 1 : 0);

  const action = "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition";

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <PersonAvatar name={r.customer_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{r.customer_name}</p>
          <p className="truncate text-xs text-muted">{r.is_member ? "Your customer" : r.via_partner ? `${r.via_partner}'s customer` : "From your network"} · {ago}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-2 ring-1 ring-line tabular">
          <Clock className="size-3.5" aria-hidden /> {timeLeft}
        </span>
      </div>

      <p className="text-[17px] leading-snug whitespace-pre-line text-ink">{r.body}</p>

      {r.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {r.images.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="Photo from the customer" loading="lazy" decoding="async" className="size-24 rounded-2xl object-cover ring-1 ring-line" />
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-brand-700 px-3 py-1 font-semibold text-white tabular">{budget}</span>
        {r.category && <span className="rounded-full bg-canvas px-3 py-1 text-ink-2 ring-1 ring-line">{r.category}</span>}
        {r.area && (
          <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-ink-2 ring-1 ring-line">
            <MapPin className="size-3.5" aria-hidden /> {r.area}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex gap-2">
          {r.contact_whatsapp && r.phone && (
            <a href={whatsappLink(r.phone, greeting)} target="_blank" rel="noreferrer" onClick={() => log("whatsapp")} className={cn(action, "bg-[#25D366] text-white hover:brightness-95")}>
              <WhatsAppIcon className="size-4" /> WhatsApp
            </a>
          )}
          {r.contact_call && r.phone && (
            <a href={`tel:+${r.phone}`} onClick={() => log("call")} className={cn(action, "bg-white text-ink ring-1 ring-line-strong hover:bg-canvas")}>
              <Phone className="size-4" aria-hidden /> Call
            </a>
          )}
          {r.contact_email && r.email && (
            <a
              href={`mailto:${r.email}?subject=${encodeURIComponent(`Your Spendbox request: ${short}`)}&body=${encodeURIComponent(greeting)}`}
              onClick={() => log("email")}
              className={cn(action, "bg-white text-ink ring-1 ring-line-strong hover:bg-canvas")}
            >
              <Mail className="size-4" aria-hidden /> Email
            </a>
          )}
        </div>
        <p className="text-xs text-muted">
          {done ? (
            <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
              <Check className="size-3.5" aria-hidden /> {DONE_TEXT[done]}
              {others > 0 ? ` · ${others} other${others === 1 ? "" : "s"} too` : ""}
            </span>
          ) : others > 0 ? (
            `${others} other business${others === 1 ? " has" : "es have"} reached out`
          ) : (
            "Be the first to reach out"
          )}
        </p>
      </div>
    </Card>
  );
}
