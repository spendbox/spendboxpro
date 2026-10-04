"use client";

import { Check, ChevronDown, LoaderCircle, Mail, Phone, RotateCcw, Trash, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { closeRequest, deleteRequest } from "@/app/me/request-actions";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/format";
import type { CustomerRequest, RequestContact } from "@/lib/types";

const METHOD_ICON = { whatsapp: WhatsAppIcon, call: Phone, email: Mail };
const METHOD_TEXT = { whatsapp: "on WhatsApp", call: "by phone", email: "by email" };

/** One of the customer's own requests: what they asked for, time left and who's reaching out. */
export function MyRequestCard({
  request: r,
  contacts,
  live,
  timeLeft,
  life,
  budget,
  ago,
}: {
  request: CustomerRequest;
  contacts: RequestContact[];
  live: boolean;
  timeLeft: string;
  life: number;
  budget: string;
  ago: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  const statusBadge = r.status === "found" ? <Badge tone="green">Found my plug</Badge> : !live ? <Badge>{r.status === "closed" ? "Closed" : "Ended"}</Badge> : null;

  return (
    <Card className={cn("flex flex-col gap-4 overflow-hidden p-0", !live && "opacity-90")}>
      {live && (
        <div className="h-1.5 bg-line" aria-hidden>
          <div className="h-full rounded-r-full bg-brand-600 transition-all" style={{ width: `${Math.round(life * 100)}%` }} />
        </div>
      )}
      <div className="flex flex-col gap-4 px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[17px] leading-snug font-semibold whitespace-pre-line text-ink">{r.body}</p>
          {live ? <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800 tabular">{timeLeft}</span> : statusBadge}
        </div>

        {r.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {r.images.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="size-20 rounded-2xl object-cover ring-1 ring-line" />
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-ink px-3 py-1 font-semibold text-white tabular">{budget}</span>
          {r.category && <span className="rounded-full bg-canvas px-3 py-1 text-ink-2 ring-1 ring-line">{r.category}</span>}
          {r.area && <span className="rounded-full bg-canvas px-3 py-1 text-ink-2 ring-1 ring-line">{r.area}</span>}
          <span className="text-muted">· {ago}</span>
        </div>

        {/* Who's reaching out */}
        <div className="rounded-2xl bg-canvas ring-1 ring-line">
          <button
            type="button"
            onClick={() => contacts.length && setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            {contacts.length > 0 ? (
              <span className="flex -space-x-2">
                {contacts.slice(0, 4).map((c) => (
                  <BusinessAvatar key={c.business_id} name={c.name} color={c.brand_color} logoUrl={c.logo_url} size="sm" className="ring-2 ring-canvas" />
                ))}
              </span>
            ) : (
              <span className={cn("relative flex size-2.5", live ? "" : "hidden")}>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
              </span>
            )}
            <span className="min-w-0 flex-1 text-sm">
              {contacts.length === 0 ? (
                <span className="text-muted">{live ? "Waiting for plugs to reach out…" : "No one reached out this time."}</span>
              ) : (
                <span className="font-semibold text-ink">
                  {contacts.length === 1 ? `${contacts[0].name} is reaching out` : `${contacts.length} plugs are reaching out`}
                </span>
              )}
            </span>
            {contacts.length > 0 && <ChevronDown className={cn("size-5 text-muted transition", open && "rotate-180")} aria-hidden />}
          </button>
          {open && (
            <ul className="divide-y divide-line border-t border-line">
              {contacts.map((c) => {
                const Icon = METHOD_ICON[c.method];
                return (
                  <li key={c.business_id} className="flex items-center gap-3 px-4 py-3">
                    <BusinessAvatar name={c.name} color={c.brand_color} logoUrl={c.logo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/me/b/${c.slug}`} className="block truncate font-semibold hover:underline">
                        {c.name}
                      </Link>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <Icon className="size-3.5" aria-hidden /> Contacting you {METHOD_TEXT[c.method]}
                      </p>
                    </div>
                    {c.whatsapp && (
                      <a href={whatsappLink(c.whatsapp, `Hi ${c.name}, about my Spendbox request: ${r.body.slice(0, 80)}`)} target="_blank" rel="noreferrer" className={buttonClass({ variant: "soft", size: "sm" })} aria-label={`WhatsApp ${c.name}`}>
                        <WhatsAppIcon className="size-4" /> Chat
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <FormMessage>{error}</FormMessage>
        <div className="flex flex-wrap gap-2">
          {live ? (
            <>
              <Button size="sm" disabled={pending} onClick={() => run(() => closeRequest(r.id, true))}>
                {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Found my plug
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => closeRequest(r.id, false))}>
                <X className="size-4" aria-hidden /> Close
              </Button>
            </>
          ) : (
            <Link href={`/me/new?from=${r.id}`} className={buttonClass({ size: "sm", variant: r.status === "found" ? "secondary" : "primary" })}>
              <RotateCcw className="size-4" aria-hidden /> Post again
            </Link>
          )}
          <Button size="sm" variant="ghost" className="ml-auto text-muted" disabled={pending} onClick={() => setConfirmDelete(true)} aria-label="Delete request">
            <Trash className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this request?" description="It disappears for you and for businesses straight away.">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmDelete(false);
              run(() => deleteRequest(r.id));
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
