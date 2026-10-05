"use client";

import { Check, CircleAlert, ImagePlus, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createProduct, prepareProductUpload } from "@/app/dashboard/[bizId]/product-actions";
import { Button, buttonClass } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { ProductKind } from "@/lib/types";
import { prepareMedia, uploadToSignedUrl, type PreparedMedia } from "./media";

const MAX_AT_ONCE = 30;

interface Draft {
  key: string;
  media: PreparedMedia;
  kind: ProductKind;
  title: string;
  description: string;
  price: string;
  selected: boolean;
  status: "draft" | "posting" | "done" | "error";
  error?: string;
}

/** A name from the file's name, unless it's a camera's (IMG_2034, VID-2025…). */
function nameFromFile(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").trim();
  if (/^(img|vid|dsc|pxl|image|video|photo|screenshot|whatsapp|mov|dcim)[\s_-]*/i.test(base) || /^[\d\s_-]+$/.test(base)) return "";
  const words = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 80);
}

const withCommas = (digits: string) => (digits ? Number(digits).toLocaleString("en-US") : "");
const digitsOf = (v: string) => v.replace(/\D/g, "").slice(0, 10);

/**
 * Add many products at once: pick lots of photos and videos, give each a name
 * (and a price and words, or set them for several together), then post them
 * all and share them to WhatsApp together.
 */
export function BulkComposer({ bizId, businessName, joinUrl }: { bizId: string; businessName: string; joinUrl: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [bulk, setBulk] = useState({ price: "", description: "", kind: "" as "" | ProductKind });
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const update = (key: string, patch: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const selected = drafts.filter((d) => d.selected && d.status !== "done");
  const waiting = drafts.filter((d) => d.status !== "done");

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = [...files].slice(0, Math.max(0, MAX_AT_ONCE - drafts.length));
    if (files.length > list.length) setError(`You can add up to ${MAX_AT_ONCE} at a time. Post these, then add more.`);
    setReading({ done: 0, total: list.length });
    const problems: string[] = [];
    for (const [i, file] of list.entries()) {
      try {
        const media = await prepareMedia(file);
        urls.current.push(media.previewUrl);
        const key = crypto.randomUUID();
        setDrafts((d) => [
          ...d,
          { key, media, kind: "product", title: nameFromFile(file.name), description: "", price: "", selected: true, status: "draft" },
        ]);
      } catch (e) {
        problems.push(`${file.name}: ${(e as Error).message}`);
      }
      setReading({ done: i + 1, total: list.length });
    }
    setReading(null);
    if (problems.length) setError(problems.join(" "));
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Sets the "same for all" values on every selected draft. */
  function applyToSelected() {
    setDrafts((list) =>
      list.map((d) =>
        d.selected && d.status !== "done"
          ? { ...d, ...(bulk.price ? { price: bulk.price } : {}), ...(bulk.description.trim() ? { description: bulk.description } : {}), ...(bulk.kind ? { kind: bulk.kind } : {}) }
          : d,
      ),
    );
  }

  async function postAll() {
    const todo = drafts.filter((d) => d.status !== "done");
    const unnamed = todo.filter((d) => d.title.trim().length < 2);
    if (unnamed.length) {
      setDrafts((list) => list.map((d) => (unnamed.some((u) => u.key === d.key) ? { ...d, status: "error", error: "Give it a name." } : d)));
      return setError(unnamed.length === 1 ? "One of them needs a name." : `${unnamed.length} of them need a name.`);
    }
    setError(null);
    setPosting(true);
    let failed = 0;
    for (const d of todo) {
      update(d.key, { status: "posting", error: undefined });
      try {
        const ticket = await prepareProductUpload(bizId, d.media.type, d.media.file.type);
        if (!ticket.ok) throw new Error(ticket.error);
        await uploadToSignedUrl(ticket.media.signedUrl, d.media.file);
        if (ticket.poster && d.media.poster) await uploadToSignedUrl(ticket.poster.signedUrl, d.media.poster);
        const r = await createProduct(bizId, {
          kind: d.kind,
          title: d.title,
          description: d.description,
          price: d.price,
          mediaType: d.media.type,
          mediaPath: ticket.media.path,
          posterPath: ticket.poster && d.media.poster ? ticket.poster.path : null,
        });
        if (!r.ok) throw new Error(r.error);
        update(d.key, { status: "done" });
      } catch (e) {
        failed++;
        update(d.key, { status: "error", error: (e as Error).message || "Didn't post. Try again." });
      }
    }
    setPosting(false);
    if (failed) setError(failed === 1 ? "One didn't post. Check it and press Post again." : `${failed} didn't post. Check them and press Post again.`);
    else setFinished(true);
  }

  const posted = drafts.filter((d) => d.status === "done");
  const shareWords = [
    `New at ${businessName}:`,
    ...posted.map((d) => `• ${d.title.trim()}${d.price ? ` · ${formatMoney(Number(d.price))}` : ""}`),
    `See them all on Spendbox: ${joinUrl}`,
  ].join("\n");

  /** All the photos and videos to the share sheet at once (WhatsApp status or a chat), or WhatsApp with the words. */
  async function shareAll() {
    const files = posted.map((d) => d.media.file);
    if (typeof navigator.canShare === "function" && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, text: shareWords });
        return setShareNote(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareWords)}`, "_blank", "noopener");
    setShareNote("WhatsApp opened with the names, prices and your link. To post the photos and videos on your status, add them from your gallery.");
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift">
          <Check className="size-7" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold">{posted.length === 1 ? "It's live" : `All ${posted.length} are live`}</h2>
          <p className="mt-1 text-muted">Your customers and your partners&apos; customers can see them now, and they&apos;re in your 3D shop.</p>
        </div>
        <ul className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Posted">
          {posted.map((d) => (
            <li key={d.key} className="w-20 shrink-0">
              <Thumb media={d.media} className="w-20" />
            </li>
          ))}
        </ul>
        <Button size="lg" block onClick={() => void shareAll()} className="max-w-sm bg-[#107A42] hover:bg-[#0c6536]">
          <WhatsAppIcon className="size-5" /> Share all to WhatsApp
        </Button>
        {shareNote && <p className="max-w-sm text-sm text-muted">{shareNote}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={buttonClass({ variant: "secondary" })}
            onClick={() => {
              setDrafts([]);
              setFinished(false);
              setShareNote(null);
            }}
          >
            <Plus className="size-4" aria-hidden /> Add more
          </button>
          <Link href={`/dashboard/${bizId}`} className={buttonClass({ variant: "ghost" })}>
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={fileInput}
        id="bulk-media"
        type="file"
        multiple
        accept="image/*,video/mp4,video/quicktime,video/webm"
        className="hidden"
        aria-label="Photos and videos"
        onChange={(e) => void pick(e.target.files)}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={Boolean(reading) || posting || drafts.length >= MAX_AT_ONCE}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line-strong bg-white/60 p-6 text-center transition hover:border-brand-600 hover:bg-brand-50",
          drafts.length ? "sm:flex-row sm:p-4" : "aspect-[4/3] sm:aspect-[16/7]",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
          {reading ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <ImagePlus className="size-6" aria-hidden />}
        </span>
        <span className="flex flex-col">
          <span className="font-display text-lg font-bold">
            {reading ? `Getting ${reading.done + 1 > reading.total ? reading.total : reading.done + 1} of ${reading.total} ready…` : drafts.length ? "Add more photos and videos" : "Choose photos and videos"}
          </span>
          <span className="text-sm text-muted">Pick as many as you like (up to {MAX_AT_ONCE}). Videos up to 60 seconds.</span>
        </span>
      </button>

      {waiting.length > 0 && (
        <section aria-label="Same for selected" className="flex flex-col gap-3 rounded-3xl bg-white p-4 ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={selected.length === waiting.length}
                onChange={(e) => setDrafts((list) => list.map((d) => ({ ...d, selected: e.target.checked })))}
              />
              {selected.length === waiting.length ? `All ${waiting.length} selected` : `${selected.length} of ${waiting.length} selected`}
            </label>
            <span className="text-xs text-muted">Set these for the selected ones, then fine-tune each below.</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_auto_auto]">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted">₦</span>
              <input
                aria-label="Price for selected"
                inputMode="numeric"
                placeholder="Price"
                value={withCommas(bulk.price)}
                onChange={(e) => setBulk((b) => ({ ...b, price: digitsOf(e.target.value) }))}
                className="h-11 w-full rounded-xl border border-line-strong pr-3 pl-7 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
              />
            </div>
            <input
              aria-label="Description for selected"
              placeholder="Description (sizes, colours, what's included…)"
              maxLength={500}
              value={bulk.description}
              onChange={(e) => setBulk((b) => ({ ...b, description: e.target.value }))}
              className="h-11 rounded-xl border border-line-strong px-3 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
            />
            <select
              aria-label="Product or service for selected"
              value={bulk.kind}
              onChange={(e) => setBulk((b) => ({ ...b, kind: e.target.value as "" | ProductKind }))}
              className="h-11 rounded-xl border border-line-strong bg-white px-3 text-[15px]"
            >
              <option value="">Product or service</option>
              <option value="product">Products</option>
              <option value="service">Services</option>
            </select>
            <Button type="button" variant="dark" onClick={applyToSelected} disabled={!selected.length || (!bulk.price && !bulk.description.trim() && !bulk.kind)}>
              Apply to {selected.length}
            </Button>
          </div>
        </section>
      )}

      <ul className="flex flex-col gap-3" aria-label="To post">
        {drafts.map((d, i) => (
          <DraftCard
            key={d.key}
            draft={d}
            index={i}
            disabled={posting}
            onChange={(patch) => update(d.key, { ...patch, ...(d.status === "error" ? { status: "draft", error: undefined } : {}) })}
            onRemove={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
          />
        ))}
      </ul>

      {error && <FormMessage>{error}</FormMessage>}

      {waiting.length > 0 && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 lg:bottom-4">
          <Button size="lg" block onClick={() => void postAll()} disabled={posting || Boolean(reading)} className="shadow-lift">
            {posting && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {posting ? `Posting ${posted.length + 1} of ${posted.length + waiting.length}…` : `Post ${waiting.length === 1 ? "it" : `all ${waiting.length}`}`}
          </Button>
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft: d,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  draft: Draft;
  index: number;
  disabled: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const id = `draft-${index}`;
  const locked = disabled || d.status === "done" || d.status === "posting";
  return (
    <li
      aria-label={d.title.trim() || `Item ${index + 1}`}
      className={cn("flex gap-3 rounded-3xl bg-white p-3 ring-1 transition sm:gap-4 sm:p-4", d.status === "error" ? "ring-red-300" : d.selected ? "ring-brand-300" : "ring-line")}
    >
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="relative">
          <Thumb media={d.media} className="w-20 sm:w-28" />
          {d.status === "posting" && (
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
              <LoaderCircle className="size-6 animate-spin text-white" aria-hidden />
            </span>
          )}
          {d.status === "done" && (
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-brand-600/60">
              <Check className="size-7 text-white" aria-hidden />
            </span>
          )}
        </div>
        {d.status !== "done" && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <input type="checkbox" className="size-4 accent-brand-600" checked={d.selected} disabled={locked} onChange={(e) => onChange({ selected: e.target.checked })} />
            Select
          </label>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <input
            id={`${id}-title`}
            aria-label={`Name of item ${index + 1}`}
            placeholder="Name, e.g. Red velvet cake"
            maxLength={80}
            value={d.title}
            disabled={locked}
            onChange={(e) => onChange({ title: e.target.value })}
            className={cn(
              "h-11 min-w-0 flex-1 rounded-xl border px-3 text-[15px] font-semibold outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10",
              d.status === "error" && d.title.trim().length < 2 ? "border-red-400" : "border-line-strong",
            )}
          />
          {d.status !== "done" && (
            <button type="button" onClick={onRemove} disabled={locked} aria-label={`Remove item ${index + 1}`} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-black/5 hover:text-red-700">
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative w-36">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted">₦</span>
            <input
              aria-label={`Price of item ${index + 1}`}
              inputMode="numeric"
              placeholder="Price"
              value={withCommas(d.price)}
              disabled={locked}
              onChange={(e) => onChange({ price: digitsOf(e.target.value) })}
              className="h-10 w-full rounded-xl border border-line-strong pr-3 pl-7 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
            />
          </div>
          <div role="radiogroup" aria-label={`Is item ${index + 1} a product or a service?`} className="flex rounded-full bg-canvas p-1 ring-1 ring-line">
            {(["product", "service"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={d.kind === k}
                disabled={locked}
                onClick={() => onChange({ kind: k })}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold", d.kind === k ? "bg-white text-ink shadow-card" : "text-muted")}
              >
                {k === "product" ? "Product" : "Service"}
              </button>
            ))}
          </div>
        </div>
        <textarea
          aria-label={`Description of item ${index + 1}`}
          placeholder="Description (optional)"
          rows={2}
          maxLength={500}
          value={d.description}
          disabled={locked}
          onChange={(e) => onChange({ description: e.target.value })}
          className="rounded-xl border border-line-strong px-3 py-2 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
        />
        {d.error && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
            <CircleAlert className="size-4" aria-hidden /> {d.error}
          </p>
        )}
      </div>
    </li>
  );
}

function Thumb({ media, className }: { media: PreparedMedia; className?: string }) {
  return (
    <span className={cn("relative block aspect-[4/5] overflow-hidden rounded-2xl bg-ink", className)}>
      {media.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview
        <img src={media.previewUrl} alt="" className="size-full object-cover" />
      ) : (
        <video src={media.previewUrl} muted playsInline loop autoPlay className="size-full object-cover" />
      )}
      {media.type === "video" && <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white">VIDEO</span>}
    </span>
  );
}
