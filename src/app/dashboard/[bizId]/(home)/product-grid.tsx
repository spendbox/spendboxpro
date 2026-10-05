"use client";

import { Bookmark, Check, CheckSquare, Eye, EyeOff, Images, MessageCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProducts, setProductsActive } from "@/app/dashboard/[bizId]/product-actions";
import { shareManyToWhatsApp } from "@/components/products/media";
import { ProductThumb } from "@/components/products/product-thumb";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { compactNumber, formatMoney } from "@/lib/format";
import type { BusinessProduct } from "@/lib/types";

/** The business's products, with a Select mode to edit, hide, share or delete several at once. */
export function ProductGrid({ bizId, products, businessName, joinUrl }: { bizId: string; products: BusinessProduct[]; businessName: string; joinUrl: string }) {
  const base = `/dashboard/${bizId}`;
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = products.filter((p) => picked.includes(p.id));
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const stop = () => {
    setSelecting(false);
    setPicked([]);
    setNote(null);
  };
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await work();
      setNote(r.ok ? done : (r.error ?? "Something went wrong."));
      if (r.ok) {
        setPicked([]);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {selecting ? (
          <>
            <span className="mr-auto text-sm font-semibold">{picked.length ? `${picked.length} selected` : "Tap products to select them"}</span>
            <button type="button" onClick={() => setPicked(picked.length === products.length ? [] : products.map((p) => p.id))} className={buttonClass({ variant: "ghost", size: "sm" })}>
              {picked.length === products.length ? "Select none" : "Select all"}
            </button>
            <button type="button" onClick={stop} className={buttonClass({ variant: "secondary", size: "sm" })}>
              <X className="size-4" aria-hidden /> Cancel
            </button>
          </>
        ) : (
          <>
            <Link href={`${base}/products/bulk`} className={buttonClass({ variant: "secondary", size: "sm" })}>
              <Images className="size-4" aria-hidden /> Add many at once
            </Link>
            {products.length > 1 && (
              <button type="button" onClick={() => setSelecting(true)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                <CheckSquare className="size-4" aria-hidden /> Select
              </button>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {!selecting && (
          <Link
            href={`${base}/products/new`}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line-strong bg-white/60 p-4 text-center transition hover:border-brand-600 hover:bg-brand-50"
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
              <Plus className="size-6" aria-hidden />
            </span>
            <span className="font-display font-bold">Add a product or service</span>
            <span className="text-xs text-muted">Photo or short video</span>
          </Link>
        )}
        {products.map((p) => {
          const on = picked.includes(p.id);
          const body = (
            <>
              <span className="relative block">
                <ProductThumb mediaType={p.media_type} mediaUrl={p.media_url} posterUrl={p.poster_url} className={cn("aspect-square", !p.is_active && "opacity-50")} />
                {selecting && (
                  <span className={cn("absolute top-2 left-2 flex size-7 items-center justify-center rounded-full ring-2", on ? "bg-brand-600 text-white ring-white" : "bg-white/80 ring-white")}>
                    {on && <Check className="size-4" aria-hidden />}
                  </span>
                )}
              </span>
              <span className="flex flex-1 flex-col gap-1 p-3 text-left">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.title}</span>
                  {!p.is_active && <Badge>Hidden</Badge>}
                </span>
                <span className="text-xs text-muted">{p.price !== null ? formatMoney(p.price, p.currency) : p.kind === "service" ? "Service" : "Ask for price"}</span>
                <span className="mt-auto flex items-center gap-3 pt-1 text-xs font-semibold text-ink-2 tabular">
                  <span className="flex items-center gap-1" title="Views">
                    <Eye className="size-3.5" aria-hidden /> {compactNumber(p.views)}
                  </span>
                  <span className="flex items-center gap-1" title="Saves">
                    <Bookmark className="size-3.5" aria-hidden /> {compactNumber(p.likes)}
                  </span>
                  <span className="flex items-center gap-1" title="People who got in touch">
                    <MessageCircle className="size-3.5" aria-hidden /> {compactNumber(p.contacts)}
                  </span>
                </span>
              </span>
            </>
          );
          const card = cn("group flex flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 transition", on ? "ring-2 ring-brand-600" : "ring-line hover:ring-brand-300");
          return selecting ? (
            <button key={p.id} type="button" aria-pressed={on} aria-label={`Select ${p.title}`} onClick={() => toggle(p.id)} className={card}>
              {body}
            </button>
          ) : (
            <Link key={p.id} href={`${base}/products/${p.id}`} className={card}>
              {body}
            </Link>
          );
        })}
      </div>

      {selecting && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 flex flex-col gap-2 rounded-3xl bg-ink p-3 text-white shadow-lift lg:bottom-4">
          {note && (
            <p role="status" className="px-1 text-sm">
              {note}
            </p>
          )}
          <div role="toolbar" aria-label="With the selected" className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!picked.length}
              onClick={() => router.push(`${base}/products/edit?ids=${picked.join(",")}`)}
              className="flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <Pencil className="size-4" aria-hidden /> Edit
            </button>
            <button
              type="button"
              disabled={!picked.length || pending}
              onClick={() => void shareManyToWhatsApp(chosen.map((p) => ({ mediaUrl: p.media_url, title: p.title, price: p.price !== null ? formatMoney(p.price, p.currency) : null })), businessName, joinUrl)}
              className="flex h-10 items-center gap-1.5 rounded-full bg-[#107A42] px-4 text-sm font-semibold disabled:opacity-50"
            >
              <WhatsAppIcon className="size-4" /> Share
            </button>
            <button type="button" disabled={!picked.length || pending} onClick={() => run(() => setProductsActive(bizId, picked, false), "Hidden from customers.")} className="flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold disabled:opacity-50">
              <EyeOff className="size-4" aria-hidden /> Hide
            </button>
            <button type="button" disabled={!picked.length || pending} onClick={() => run(() => setProductsActive(bizId, picked, true), "Showing to customers.")} className="flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold disabled:opacity-50">
              <Eye className="size-4" aria-hidden /> Show
            </button>
            <button type="button" disabled={!picked.length || pending} onClick={() => setConfirm(true)} className="flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold text-red-200 disabled:opacity-50">
              <Trash2 className="size-4" aria-hidden /> Delete
            </button>
          </div>
        </div>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Delete ${picked.length === 1 ? "this" : `these ${picked.length}`}?`} description="They disappear for your customers, and their views and saves are deleted too.">
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            block
            loading={pending}
            onClick={() => {
              setConfirm(false);
              run(() => deleteProducts(bizId, picked), "Deleted.");
            }}
          >
            Delete {picked.length === 1 ? "it" : `all ${picked.length}`}
          </Button>
          <Button variant="ghost" block onClick={() => setConfirm(false)}>
            Keep them
          </Button>
        </div>
      </Modal>
    </div>
  );
}
