"use client";

import { CircleAlert, CircleCheck, Clock3, FileText, ImageUp, LoaderCircle, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatMoney, formatWhen } from "@/lib/format";
import type { ReceiptResult, SavedReceipt, UnmatchedReceipt } from "@/lib/receipts/save";

const MAX_SIDE = 2200;

/** Shrinks photos before upload so they send quickly on mobile data. */
async function prepareFile(file: File): Promise<Blob> {
  if (file.type === "application/pdf") {
    if (file.size > 4_300_000) throw new Error("That PDF is too big. Please upload a screenshot instead.");
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("We can't open that image. Please upload a JPG or PNG screenshot.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("We couldn't prepare that image. Please try another.");
  return blob;
}

type Phase =
  | { name: "idle" }
  | { name: "reading"; preview: string | null; fileName: string }
  | { name: "done"; result: ReceiptResult; preview: string | null };

export function ReceiptUploader({ hasBusinesses }: { hasBusinesses: boolean }) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const router = useRouter();

  async function upload(file: File) {
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setPhase({ name: "reading", preview, fileName: file.name });
    let result: ReceiptResult;
    try {
      const blob = await prepareFile(file);
      const body = new FormData();
      body.append("file", blob, blob === file ? file.name : "receipt.jpg");
      const res = await fetch("/api/receipts", { method: "POST", body });
      result = (await res.json().catch(() => null)) ?? { kind: "error", message: "Something went wrong. Please try again." };
    } catch (e) {
      result = { kind: "error", message: e instanceof Error ? e.message : "Something went wrong. Please try again." };
    }
    setPhase({ name: "done", result, preview });
    if (result.kind === "saved") router.refresh();
  }

  function reset() {
    if (phase.name !== "idle" && phase.preview) URL.revokeObjectURL(phase.preview);
    setPhase({ name: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!hasBusinesses) {
    return (
      <div className="rounded-3xl border border-dashed border-line-strong bg-white/60 p-8 text-center">
        <p className="font-semibold">Join a business first</p>
        <p className="mt-1 text-sm text-muted">Receipts are counted for businesses in your Spendbox. Ask a business for their link.</p>
      </div>
    );
  }

  if (phase.name === "reading") {
    return (
      <div className="flex flex-col items-center gap-5 rounded-4xl bg-white p-6 text-center shadow-card ring-1 ring-line sm:p-8" aria-live="polite">
        <div className="relative h-56 w-40 overflow-hidden rounded-2xl bg-canvas ring-1 ring-line">
          {phase.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img src={phase.preview} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted">
              <FileText className="size-10" aria-hidden />
            </div>
          )}
          <div className="absolute inset-x-0 top-0 h-1 animate-scan bg-brand-600 shadow-[0_0_16px_4px_rgba(11,110,79,0.45)]" />
        </div>
        <div>
          <p className="flex items-center justify-center gap-2 font-display text-lg font-bold">
            <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden /> Reading your receipt…
          </p>
          <p className="mt-1 text-sm text-muted">Finding the business, amount and date. This takes a few seconds.</p>
        </div>
      </div>
    );
  }

  if (phase.name === "done") {
    const { result } = phase;
    return (
      <div className="animate-fade-up">
        {result.kind === "saved" && <SavedCard result={result} onAgain={reset} />}
        {result.kind === "unmatched" && (
          <UnmatchedCard
            result={result}
            onAgain={reset}
            onSaved={(saved) => {
              setPhase({ name: "done", result: saved, preview: phase.preview });
              if (saved.kind === "saved") router.refresh();
            }}
          />
        )}
        {result.kind === "error" && (
          <div className="flex flex-col items-center gap-4 rounded-4xl bg-white p-6 text-center shadow-card ring-1 ring-line sm:p-8">
            <div className="flex size-14 items-center justify-center rounded-full bg-red-50 text-red-700">
              <CircleAlert className="size-7" aria-hidden />
            </div>
            <div role="alert">
              <p className="font-display text-lg font-bold">Not counted</p>
              <p className="mt-1 max-w-sm text-muted">{result.message}</p>
            </div>
            <Button onClick={reset}>Try another receipt</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void upload(file);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-4 rounded-4xl border-2 border-dashed bg-white px-6 py-10 text-center transition sm:py-14",
        dragging ? "border-brand-600 bg-brand-50" : "border-line-strong hover:border-brand-300 hover:bg-brand-50/40",
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-3xl bg-brand-600 text-white shadow-lift">
        <ImageUp className="size-8" aria-hidden />
      </div>
      <div>
        <p className="font-display text-xl font-bold">Upload a receipt</p>
        <p className="mx-auto mt-1 max-w-sm text-muted">
          A screenshot of your transfer, a photo of a POS slip or a PDF. We&apos;ll work out which business it was for.
        </p>
      </div>
      <span className={buttonClass({ size: "lg" }, "pointer-events-none")}>Choose receipt</span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words text-ink">{children}</dd>
    </div>
  );
}

function SavedCard({ result, onAgain }: { result: SavedReceipt; onAgain: () => void }) {
  const verified = result.status === "verified";
  return (
    <div className="flex flex-col gap-5 rounded-4xl bg-white p-5 shadow-card ring-1 ring-line sm:p-7">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-full",
            verified ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-800",
          )}
        >
          {verified ? <CircleCheck className="size-7" aria-hidden /> : <Clock3 className="size-7" aria-hidden />}
        </div>
        <div role="status">
          <p className="font-display text-xl font-bold">
            {verified ? `Counted at ${result.business.name}` : `Sent to ${result.business.name}`}
          </p>
          <p className="text-sm text-muted">{verified ? "Matched to their bank account." : result.reason}</p>
        </div>
      </div>

      <dl className="divide-y divide-line rounded-2xl bg-canvas px-4">
        <Row label="Paid to">
          {result.business.name}
          {result.bankLabel && <span className="block text-sm font-normal text-muted">{result.bankLabel}</span>}
        </Row>
        <Row label="Amount">{formatMoney(result.amount, result.currency)}</Row>
        <Row label="Date">{formatWhen(result.paidAt)}</Row>
        {result.description && <Row label="For">{result.description}</Row>}
        {result.reference && <Row label="Reference">{result.reference}</Row>}
      </dl>

      {result.newRewards.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-accent-50 p-4 text-accent-700">
          <PartyPopper className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">Perk unlocked!</p>
            <p className="text-sm text-ink-2">{result.newRewards.map((r) => r.title).join(", ")} — show your pass next time.</p>
          </div>
        </div>
      )}
      {verified && result.progress && <p className="text-sm text-muted">Progress: {result.progress}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onAgain} className="sm:flex-1">
          Add another receipt
        </Button>
        <Link href={`/me/b/${result.business.slug}`} className={buttonClass({ variant: "secondary" }, "sm:flex-1")}>
          View {result.business.name}
        </Link>
      </div>
    </div>
  );
}

function UnmatchedCard({
  result,
  onAgain,
  onSaved,
}: {
  result: UnmatchedReceipt;
  onAgain: () => void;
  onSaved: (result: ReceiptResult) => void;
}) {
  const [choice, setChoice] = useState<string | null>(result.options.length === 1 ? result.options[0].membershipId : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/receipts/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: result.token, membershipId: choice }),
    });
    const data = (await res.json().catch(() => null)) as ReceiptResult | null;
    setBusy(false);
    if (data?.kind === "saved") onSaved(data);
    else setError(data?.kind === "error" ? data.message : "Something went wrong. Please try again.");
  }

  return (
    <div className="flex flex-col gap-5 rounded-4xl bg-white p-5 shadow-card ring-1 ring-line sm:p-7">
      <div>
        <p className="font-display text-xl font-bold">Which business was this for?</p>
        <p className="mt-1 text-sm text-muted">
          We read the receipt but couldn&apos;t match the account to one of your businesses. Pick one and they&apos;ll
          confirm it.
        </p>
      </div>
      <dl className="divide-y divide-line rounded-2xl bg-canvas px-4">
        <Row label="Amount">{formatMoney(result.summary.amount, result.summary.currency)}</Row>
        {result.summary.paidAt && <Row label="Date">{formatWhen(result.summary.paidAt)}</Row>}
        {result.summary.recipient && <Row label="Paid to">{result.summary.recipient}</Row>}
      </dl>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Business</legend>
        {result.options.map((o) => (
          <label
            key={o.membershipId}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl p-3.5 ring-1 transition",
              choice === o.membershipId ? "bg-brand-50 ring-brand-600" : "ring-line hover:bg-canvas",
            )}
          >
            <input
              type="radio"
              name="business"
              value={o.membershipId}
              checked={choice === o.membershipId}
              onChange={() => setChoice(o.membershipId)}
              className="size-5 accent-brand-600"
            />
            <span className="font-semibold">{o.name}</span>
          </label>
        ))}
      </fieldset>
      <FormMessage>{error}</FormMessage>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => void send()} disabled={!choice || busy} className="sm:flex-1">
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Send for confirmation
        </Button>
        <Button variant="secondary" onClick={onAgain} className="sm:flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
